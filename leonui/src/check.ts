/* check.ts — static verification of a leonui page, with no browser.
 *
 * This is the half of the agent contract that was missing: the skill could tell
 * you how to write markup, and the runtime could tell you (at attach time, in a
 * console you are not watching) that something was wrong. `ui check` reads the
 * file and reports the same findings the runtime would warn about, before
 * anything is rendered.
 *
 * Two rules keep it honest:
 *   1. It reads the SAME tables as the runtime (vocab.ts, parser.ts, fx.ts), so
 *      it can never disagree with a running page.
 *   2. It only reports what is certainly wrong. Anything requiring a runtime
 *      value or type information is out of scope — a linter that cries wolf is
 *      worse than no linter. Known non-goals: nested path segments (a typo in
 *      `task.tittle` is not statically decidable), cross-file scope, and whether
 *      a selector actually matches.
 */
import { parse, BUILTINS } from './parser.ts';
import { parseVerb } from './fx.ts';
import type { Ast, Verb } from './types.ts';
import {
  ALL_UI_ATTRS, ASPECTS, CORE_ATTRS, CORE_ATTRS_WITH_REQUIREMENTS, ENHANCER_NAMES, ENHANCER_SPECS,
  coreAttrProblems, enhancerAttrProblems, enhancerProblems, isAttrAspect, isBindAttr, remoteDecl, requirementProblems, suggest,
} from './vocab.ts';

export interface Finding {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

/* ---------- tolerant HTML tag scanner ----------
 * A full parser would be better, but the package ships with zero dependencies
 * and this only needs tag openings with their attribute offsets. It must not
 * choke on anything: a lint tool that dies on valid HTML is useless. */
interface TagAttr { name: string; value: string; offset: number }
interface Tag { tag: string; attrs: TagAttr[]; offset: number }

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

function scanTags(src: string): Tag[] {
  const out: Tag[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<!', i) || src.startsWith('<?', i)) { const e = src.indexOf('>', i); i = e < 0 ? src.length : e + 1; continue; }
    if (src[i + 1] === '/') { const e = src.indexOf('>', i); i = e < 0 ? src.length : e + 1; continue; }
    if (!/[a-zA-Z]/.test(src[i + 1] ?? '')) { i++; continue; }

    const start = i;
    i++;
    const nm = /^[a-zA-Z][^\s/>]*/.exec(src.slice(i));
    if (!nm) { i++; continue; }
    const tag = nm[0];
    i += tag.length;

    const attrs: TagAttr[] = [];
    let selfClosing = false;
    for (;;) {
      while (i < src.length && /\s/.test(src[i]!)) i++;
      if (i >= src.length) break;
      const c = src[i]!;
      if (c === '>') { i++; break; }
      if (c === '/' && src[i + 1] === '>') { selfClosing = true; i += 2; break; }

      const am = /^[^\s=/>]+/.exec(src.slice(i));
      if (!am) { i++; continue; }
      const nameOffset = i;
      const name = am[0]!;
      i += name.length;

      let value = '';
      let j = i;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      if (src[j] === '=') {
        j++;
        while (j < src.length && /\s/.test(src[j]!)) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, j + 1);
          value = src.slice(j + 1, e < 0 ? src.length : e);
          i = e < 0 ? src.length : e + 1;
        } else {
          const vm = /^[^\s>]*/.exec(src.slice(j))!;
          value = vm[0]!;
          i = j + value.length;
        }
      }
      attrs.push({ name, value, offset: nameOffset });
    }
    out.push({ tag, attrs, offset: start });

    if (RAW_TEXT.has(tag.toLowerCase()) && !selfClosing) {
      const close = src.toLowerCase().indexOf('</' + tag.toLowerCase(), i);
      i = close < 0 ? src.length : close;
    }
  }
  return out;
}

function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}

function positionOf(starts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo]! + 1 };
}

/* ---------- expression checks ---------- */

function* walkAst(a: Ast): Generator<Ast> {
  yield a;
  switch (a.t) {
    case 'dot': yield* walkAst(a.e); break;
    case 'not': yield* walkAst(a.e); break;
    case 'neg': yield* walkAst(a.e); break;
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case '==': case '!=': case '<': case '>': case '<=': case '>=':
    case '&&': case '||':
      yield* walkAst(a.a); yield* walkAst(a.b); break;
    case '?:':
      yield* walkAst(a.c); yield* walkAst(a.a); yield* walkAst(a.b); break;
    case 'arr':
      for (const it of a.items) yield* walkAst(it.t === 'spread' ? it.e : it);
      break;
    case 'obj':
      for (const p of a.pairs) yield* walkAst(p.e);
      break;
    case 'call':
      for (const arg of a.args) yield* walkAst(arg);
      break;
    default:
      break;
  }
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
const PATH = /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/;

/** The expression with string literals blanked out, so a `;` or `:` inside a
 * literal is never mistaken for syntax. Length is preserved, so offsets still line
 * up if this is ever used for positioning. */
const withoutStrings = (s: string): string => s.replace(/'[^']*'|"[^"]*"/g, m => ' '.repeat(m.length));

/** Report the first problem in an expression. The runtime rejects non-builtin
 * calls only when the expression actually runs — which may be never, or only on
 * a click. Catching it here is the whole point of a static pass. */
function expressionProblem(expr: string): string | null {
  let ast: Ast;
  try {
    ast = parse(expr);
  } catch (e) {
    return (e as Error).message;
  }
  for (const n of walkAst(ast)) {
    if (n.t === 'call' && !Object.hasOwn(BUILTINS, n.name)) {
      return `ui: function not allowed: ${n.name} — allowed: ${Object.keys(BUILTINS).join('|')}`;
    }
  }
  return null;
}

/* ---------- the page check ---------- */

export function checkHtml(file: string, src: string): Finding[] {
  const findings: Finding[] = [];
  const starts = lineStarts(src);
  const at = (offset: number, severity: Finding['severity'], message: string): void => {
    findings.push({ file, ...positionOf(starts, offset), severity, message });
  };

  const KNOWN = new Set<string>([...CORE_ATTRS, ...ENHANCER_NAMES]);
  const REQUIREMENT_ATTRS = new Set<string>(CORE_ATTRS_WITH_REQUIREMENTS);
  const checkExpr = (expr: string, offset: number, where: string): void => {
    const p = expressionProblem(expr);
    if (p) at(offset, 'error', `${where}: ${p}`);
  };

  for (const tag of scanTags(src)) {
    const seen = new Map<string, TagAttr>();
    for (const a of tag.attrs) {
      if (seen.has(a.name)) {
        at(a.offset, 'warning',
          `duplicate attribute "${a.name}" — HTML keeps the first and drops the rest`);
      } else seen.set(a.name, a);
    }
    const get = (n: string): string | null => seen.get(n)?.value ?? null;
    const has = (n: string): boolean => seen.has(n);
    const host = tag.tag.toLowerCase();

    /* 1. unknown ui:* names, with a suggestion */
    for (const a of tag.attrs) {
      if (!a.name.startsWith('ui:') || KNOWN.has(a.name) || isBindAttr(a.name)) continue;
      const hint = suggest(a.name, ALL_UI_ATTRS);
      at(a.offset, 'error', `unknown attribute "${a.name}"${hint ? ` — did you mean "${hint}"?` : ''}`);
    }

    /* 2. enhancer props: values, hosts, required native attributes, prop typos */
    for (const a of tag.attrs) {
      if (!Object.hasOwn(ENHANCER_SPECS, a.name)) continue;
      for (const msg of enhancerProblems(a.name, get, { host, has })) at(a.offset, 'error', msg);
      for (const msg of enhancerAttrProblems(a.name, tag.attrs.map(x => x.name))) at(a.offset, 'error', msg);
    }

    /* 2b. core requirements: a host contract (`ui:model` on a form control) or a
     * partner attribute on the same element (`ui:sortable` needs `ui:each`).
     * Enhancers' own hosts/requiresAttr are covered above; this is the other half
     * of the same table, and it is the half whose failure is invisible at runtime:
     * the pass that would notice only runs when the partner is already there. */
    for (const a of tag.attrs) {
      if (!REQUIREMENT_ATTRS.has(a.name)) continue;
      for (const msg of requirementProblems(a.name, { host, has })) at(a.offset, 'error', msg);
    }

    /* 3. binds */
    for (const a of tag.attrs) {
      if (!isBindAttr(a.name)) continue;
      const variant = /^ui:bind-([a-zA-Z:][\w:-]*)$/.exec(a.name);
      const checkAspect = (aspect: string): void => {
        if (aspect.startsWith('attr:')) {
          if (!isAttrAspect(aspect)) at(a.offset, 'error', `ui: bad attribute aspect "${aspect}" — expected attr:<name>`);
        } else if (!(ASPECTS as readonly string[]).includes(aspect)) {
          at(a.offset, 'error', `ui: unknown bind aspect "${aspect}" — allowed: ${ASPECTS.join('|')} or attr:<name>`);
        }
      };
      if (variant) {
        checkAspect(variant[1]!);
        checkExpr(a.value, a.offset, `ui:${a.name}`);
        continue;
      }
      for (const part of a.value.split(';')) {
        const t = part.trim();
        if (!t) continue;
        const m = /^(attr:[\w-]+|[a-z]+):\s*([\s\S]+)$/.exec(t);
        if (!m) {
          at(a.offset, 'error', `ui: bad bind "${t}" — expected "aspect: expression"`);
          continue;
        }
        checkAspect(m[1]!);
        checkExpr(m[2]!.trim(), a.offset, `ui:bind ${m[1]}`);
      }
    }

    /* 4. ui:computed */
    const computed = get('ui:computed');
    if (computed != null) {
      const off = seen.get('ui:computed')!.offset;
      const ci = computed.indexOf(':');
      if (ci < 0) at(off, 'error', `ui: bad computed "${computed}" — expected "name: expression"`);
      else {
        const name = computed.slice(0, ci).trim();
        if (!IDENT.test(name)) at(off, 'error', `ui: bad signal name "${name}"`);
        const expr = computed.slice(ci + 1).trim();
        // `ui:computed` takes ONE declaration, unlike `ui:state`/`ui:bind` which
        // split on `;`. A second declaration is not a syntax error the parser can
        // explain: it reads the `;` as part of the expression and reports "trailing
        // input", which names the symptom and leaves the cause to be guessed.
        const semi = withoutStrings(expr).indexOf(';');
        if (semi >= 0) {
          const rest = expr.slice(semi + 1).trim();
          at(off, 'error', `ui:computed takes one declaration per element — move "${rest}" onto its own element with ui:computed`);
        } else checkExpr(expr, off, 'ui:computed');
      }
    }

    /* 5. ui:state declarations */
    const state = get('ui:state');
    if (state != null) {
      const off = seen.get('ui:state')!.offset;
      for (const decl of state.split(';')) {
        const d = decl.trim();
        if (!d) continue;
        const ci = d.indexOf(':');
        if (ci < 0) { at(off, 'error', `ui: bad state decl "${d}" — expected "name: value"`); continue; }
        const name = d.slice(0, ci).trim();
        const val = d.slice(ci + 1).trim();
        if (!IDENT.test(name)) at(off, 'error', `ui: bad signal name "${name}"`);
        const rem = remoteDecl(val);
        if (rem) {
          if (rem.bare) at(off, 'error', `ui:state ${name}: GET needs a URL after it — the runtime would store the literal string "GET"`);
          continue;
        }
        if (val.startsWith('[') || val.startsWith('{')) { checkExpr(val, off, `ui:state ${name}`); continue; }
        if (val.startsWith("'") && !/^'[^']*'$/.test(val)) at(off, 'error', `ui: state value ${val} — unterminated string`);
        if (val.startsWith('"') && !/^"[^"]*"$/.test(val)) at(off, 'error', `ui: state value ${val} — unterminated string`);
      }
    }

    /* 6. ui:model / ui:each / ui:key paths */
    const model = get('ui:model');
    if (model != null && !PATH.test(model.trim())) {
      at(seen.get('ui:model')!.offset, 'error', `ui: bad model path "${model}" — expected a signal path like "task.title"`);
    }
    const each = get('ui:each');
    if (each != null) {
      const off = seen.get('ui:each')!.offset;
      const parts = each.trim().split(/\s+/);
      if (parts.length !== 3 || parts[1] !== 'in') {
        at(off, 'error', `ui: bad each "${each.trim()}" — expected "item in listPath"`);
      } else {
        if (!IDENT.test(parts[0]!)) at(off, 'error', `ui: bad item name "${parts[0]}"`);
        if (!PATH.test(parts[2]!)) at(off, 'error', `ui: bad each list path "${parts[2]}"`);
      }
    }
    // ui:key is a property NAME on the item — `each.ts` does `item[keyAttr]`. It
    // used to be validated as a signal path, which is precisely how `ui:key="row.id"`
    // passed this check and then keyed every row by its index, silently.
    // The value is passed RAW, not trimmed: the runtime reads `getAttribute` and
    // does `item[" id "]`, so `ui:key=" id "` really does fall back to the index.
    // Trimming here made the checker accept a value the runtime could not honour —
    // a page that passed `ui check` and then warned in a console nobody watches.
    const key = get('ui:key');
    if (key != null) {
      const off = seen.get('ui:key')!.offset;
      for (const msg of coreAttrProblems('ui:key', key)) at(off, 'error', msg);
    }

    /* 6b. ui:use — both forms need a "#template-id". Without one the local form
     * hands a CSS selector to querySelector and throws a SyntaxError, and the
     * remote form is not even recognised as remote, so "card.html" is looked up
     * as if it were an element. Either way the message is about CSS, not about
     * the missing id, which is what actually went wrong. */
    const use = get('ui:use');
    if (use != null) {
      const off = seen.get('ui:use')!.offset;
      const hash = use.indexOf('#');
      if (hash < 0) at(off, 'error', `ui: bad use "${use}" — expected "#template-id" or "path.html#template-id"`);
      else if (!use.slice(hash + 1).trim()) at(off, 'error', `ui: bad use "${use}" — the "#" needs a template id after it`);
    }

    /* 7. ui:fx — events → the closed verb catalog */
    const fx = get('ui:fx');
    if (fx != null) {
      const off = seen.get('ui:fx')!.offset;
      const ci = fx.indexOf(':');
      if (ci < 0) {
        at(off, 'error', `ui: bad fx "${fx}" — expected "event: verb; verb"`);
      } else {
        if (!fx.slice(0, ci).trim()) at(off, 'error', 'ui: fx needs an event name before the colon');
        for (const part of fx.slice(ci + 1).split(';')) {
          const t = part.trim();
          if (!t) continue;
          let v: Verb | null = null;
          try { v = parseVerb(t); } catch (e) { at(off, 'error', (e as Error).message); continue; }
          if (!v) { at(off, 'error', `ui: bad verb "${t}"`); continue; }
          checkVerb(v, t, off, at, checkExpr);
        }
      }
    }
  }

  return findings;
}

type Add = (offset: number, severity: Finding['severity'], message: string) => void;

/** Mirror fx.ts's runtime expectations per verb, so a verb that would fail at
 * event time fails here instead. */
function checkVerb(
  v: Verb, raw: string, offset: number, at: Add,
  checkExpr: (expr: string, offset: number, where: string) => void,
): void {
  const where = `ui:fx ${raw}`;
  const pathProblem = (p: string | undefined, what: string): void => {
    if (p == null || !PATH.test(p)) at(offset, 'error', `${where}: bad ${what} "${p ?? ''}"`);
  };
  switch (v.name) {
    case 'set':
      pathProblem(v.path, 'path');
      checkExpr(v.expr ?? '', offset, where);
      break;
    case 'toggle':
      pathProblem(v.path, 'path');
      break;
    case 'toast':
      if (!v.expr) at(offset, 'error', `${where}: toast needs a message`);
      else checkExpr(v.expr, offset, where);
      break;
    case 'onfail': case 'onsuccess':
      // an empty gate payload is legal — the runtime skips it
      if (v.expr) checkExpr(v.expr, offset, where);
      break;
    case 'confirm':
      if (!v.expr) at(offset, 'error', `${where}: confirm needs a message`);
      else checkExpr(v.expr, offset, where);
      break;
    case 'prompt':
      if (!v.msg) at(offset, 'error', `${where}: prompt needs a message`);
      else checkExpr(v.msg, offset, where);
      pathProblem(v.path, 'path');
      break;
    case 'call': {
      if (v.body) checkExpr(v.body, offset, where);
      if (v.optimistic) {
        pathProblem(v.optimistic.path, 'optimistic path');
        checkExpr(v.optimistic.expr, offset, where);
      }
      for (const m of (v.url ?? '').matchAll(/\{([^}]*)\}/g)) {
        if (!PATH.test(m[1]!)) {
          at(offset, 'error', `${where}: URL interpolation "{${m[1]}}" is not a signal path — only [\\w.]+ is interpolated`);
        }
      }
      break;
    }
    case 'nav': case 'focus': case 'reset':
      if (!v.sel) at(offset, 'error', `${where}: ${v.name} needs a selector`);
      break;
    case 'refetch':
      if (!v.target) at(offset, 'error', `${where}: refetch needs a cell name`);
      break;
    case 'delay':
      if (!Number.isFinite(v.ms)) at(offset, 'error', `${where}: delay needs a number of milliseconds`);
      break;
    default:
      break;
  }
}
