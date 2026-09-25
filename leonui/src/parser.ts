/* parser.ts — the whitelist expression language.
 *
 * Expressions parse once into a typed AST and are interpreted — no eval, ever.
 * The only callable things are the pure built-in operators below; anything else
 * (globals, method calls, assignment) is rejected with a named error. This one
 * decision serves both static analysis (`ui check`) and the XSS story.
 */
import type { ArrItem, Ast } from './types.ts';
import { findScope } from './signals.ts';

/* ---------- whitelisted pure operators ---------- */
export const BUILTINS: Record<string, (...args: unknown[]) => unknown> = {
  without: (arr, item) => (Array.isArray(arr) ? arr : []).filter(x => x !== item),
  contains: (str, sub) => String(str ?? '').toLowerCase().includes(String(sub ?? '').toLowerCase()),
  first: arr => (Array.isArray(arr) ? arr[0] : undefined),
  sortBy: (arr, key) => (Array.isArray(arr) ? arr : []).slice().sort((a, b) => {
    const ka = (a as Record<string, unknown>)?.[key as string];
    const kb = (b as Record<string, unknown>)?.[key as string];
    return ka === kb ? 0 : ((ka as number | string) > (kb as number | string) ? 1 : -1);
  }),
};

const astCache = new Map<string, Ast>();

export function parse(src: string): Ast {
  const cached = astCache.get(src);
  if (cached) return cached;
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i]!)) i++; };
  const lit = (re: RegExp): RegExpExecArray | null => {
    ws();
    const m = re.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return m;
  };

  function primary(): Ast {
    ws();
    const c = src[i];
    if (c === "'") { const m = lit(/'([^']*)'/); if (!m) throw new Error('ui: bad string'); return { t: 'str', v: m[1]! }; }
    if (c === '(') { i++; const e = ternary(); ws(); if (src[i] !== ')') throw new Error('ui: expected )'); i++; return e; }
    if (c === '[') {
      i++; const items: ArrItem[] = []; ws();
      if (src[i] !== ']') {
        items.push(element());
        for (;;) {
          ws();
          if (src[i] === ',') { i++; ws(); if (src[i] === ']') break; items.push(element()); }
          else break;
        }
      }
      ws(); if (src[i] !== ']') throw new Error('ui: expected ]'); i++;
      return { t: 'arr', items };
    }
    if (c === '{') {
      i++; const pairs: { key: string; e: Ast }[] = []; ws();
      if (src[i] !== '}') {
        pairs.push(pair());
        for (;;) {
          ws();
          if (src[i] === ',') { i++; ws(); if (src[i] === '}') break; pairs.push(pair()); }
          else break;
        }
      }
      ws(); if (src[i] !== '}') throw new Error('ui: expected }'); i++;
      return { t: 'obj', pairs };
    }
    if (c && /[0-9]/.test(c)) { const m = lit(/[0-9.]+/)!; return { t: 'num', v: Number(m[0]) }; }
    if (c && /[A-Za-z_$]/.test(c)) {
      const m = lit(/[A-Za-z_$][\w$]*/)!;
      const name = m[0]!;
      ws();
      if (src[i] === '(') { // whitelisted pure operators only
        i++; const args: Ast[] = []; ws();
        if (src[i] !== ')') {
          args.push(ternary());
          for (;;) { ws(); if (src[i] === ',') { i++; args.push(ternary()); } else break; }
        }
        ws(); if (src[i] !== ')') throw new Error('ui: expected )'); i++;
        return { t: 'call', name, args };
      }
      if (name === 'true') return { t: 'bool', v: true };
      if (name === 'false') return { t: 'bool', v: false };
      if (name === 'null') return { t: 'null' };
      return { t: 'id', v: name };
    }
    throw new Error(`ui: unexpected "${c ?? 'end'}" in expression`);
  }
  function pair(): { key: string; e: Ast } {
    ws();
    const m = lit(/[A-Za-z_$][\w$]*/);
    if (!m) throw new Error('ui: bad key');
    ws(); if (src[i] !== ':') throw new Error('ui: expected :'); i++;
    return { key: m[0]!, e: ternary() };
  }
  function element(): ArrItem {
    ws();
    if (src.slice(i, i + 3) === '...') { i += 3; return { t: 'spread', e: ternary() }; }
    return ternary();
  }
  function postfix(): Ast {
    let e = primary();
    for (;;) {
      ws();
      if (src[i] === '.') {
        i++;
        const m = lit(/[\w$]+/);
        if (!m) throw new Error('ui: bad member');
        e = { t: 'dot', e, name: m[0]! };
      } else break;
    }
    return e;
  }
  function unary(): Ast {
    ws();
    if (src[i] === '!') { i++; return { t: 'not', e: unary() }; }
    if (src[i] === '-') { i++; return { t: 'neg', e: unary() }; }
    return postfix();
  }
  function factor(): Ast {
    let e = unary();
    for (;;) {
      ws(); const c = src[i];
      if (c === '*' || c === '/' || c === '%') { i++; e = { t: c === '*' ? 'mul' : c === '/' ? 'div' : 'mod', a: e, b: unary() }; }
      else break;
    }
    return e;
  }
  function add(): Ast {
    let e = factor();
    for (;;) {
      ws(); const c = src[i];
      if (c === '+' || c === '-') { i++; e = { t: c === '+' ? 'add' : 'sub', a: e, b: factor() }; }
      else break;
    }
    return e;
  }
  function compare(): Ast {
    let e = add();
    for (;;) {
      ws();
      const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=' || two === '==') { i += 2; e = { t: two, a: e, b: add() }; }
      else if (src[i] === '<' || src[i] === '>') { const c = src[i] as '<' | '>'; i++; e = { t: c, a: e, b: add() }; }
      else break;
    }
    return e;
  }
  function and(): Ast {
    let e = compare();
    for (;;) { ws(); if (src.slice(i, i + 2) === '&&') { i += 2; e = { t: '&&', a: e, b: compare() }; } else break; }
    return e;
  }
  function or(): Ast {
    let e = and();
    for (;;) { ws(); if (src.slice(i, i + 2) === '||') { i += 2; e = { t: '||', a: e, b: and() }; } else break; }
    return e;
  }
  function ternary(): Ast {
    const e = or(); ws();
    if (src[i] === '?') {
      i++;
      const a = ternary(); ws();
      if (src[i] !== ':') throw new Error('ui: expected :'); i++;
      return { t: '?:', c: e, a, b: ternary() };
    }
    return e;
  }

  const ast = ternary(); ws();
  if (i < src.length) throw new Error(`ui: trailing input "${src.slice(i)}"`);
  astCache.set(src, ast);
  return ast;
}

export function ev(n: Ast, el: Element | null): unknown {
  switch (n.t) {
    case 'str': case 'num': case 'bool': return n.v;
    case 'null': return null;
    case 'id': { const f = findScope(el, n.v); if (!f) throw new Error(`ui: undeclared signal "${n.v}"`); return f.sig.value; }
    case 'dot': { const o = ev(n.e, el); if (n.name === 'length') return (o as unknown[])?.length; return (o as Record<string, unknown> | null | undefined)?.[n.name]; }
    case 'not': return !ev(n.e, el);
    case 'neg': return -(ev(n.e, el) as number);
    case 'add': return (ev(n.a, el) as never) + (ev(n.b, el) as never);
    case 'sub': return (ev(n.a, el) as number) - (ev(n.b, el) as number);
    case 'mul': return (ev(n.a, el) as number) * (ev(n.b, el) as number);
    case 'div': return (ev(n.a, el) as number) / (ev(n.b, el) as number);
    case 'mod': return (ev(n.a, el) as number) % (ev(n.b, el) as number);
    case '==': return ev(n.a, el) === ev(n.b, el);
    case '!=': return ev(n.a, el) !== ev(n.b, el);
    case '<': return (ev(n.a, el) as number) < (ev(n.b, el) as number);
    case '>': return (ev(n.a, el) as number) > (ev(n.b, el) as number);
    case '<=': return (ev(n.a, el) as number) <= (ev(n.b, el) as number);
    case '>=': return (ev(n.a, el) as number) >= (ev(n.b, el) as number);
    case '&&': { const a = ev(n.a, el); return a ? ev(n.b, el) : a; }
    case '||': { const a = ev(n.a, el); return a ? a : ev(n.b, el); }
    case '?:': return ev(n.c, el) ? ev(n.a, el) : ev(n.b, el);
    case 'arr': {
      const out: unknown[] = [];
      for (const it of n.items) {
        if (it.t === 'spread') { const sp = ev(it.e, el); out.push(...(Array.isArray(sp) ? sp : [sp])); }
        else out.push(ev(it, el));
      }
      return out;
    }
    case 'obj': { const o: Record<string, unknown> = {}; for (const p of n.pairs) o[p.key] = ev(p.e, el); return o; }
    case 'call': {
      const fn = BUILTINS[n.name];
      if (!fn) throw new Error(`ui: function not allowed: ${n.name}`);
      return fn(...n.args.map(a => ev(a, el)));
    }
  }
}

export const safeEval = (src: string, el: Element | null): unknown => ev(parse(src), el);
