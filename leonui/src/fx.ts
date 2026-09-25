/* fx.ts — events → closed effect-verb catalog */
import type { Verb } from './types.ts';
import { resolvePath, readPath, writeRef, setPath, scopes, warn } from './signals.ts';
import { safeEval } from './parser.ts';
import { fetchCell } from './state.ts';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ---------- the closed catalog, stated once ---------- */
/** effect verbs — rule 6 in naming.md. Order is the order they are documented in. */
export const VERBS = [
  'set', 'toggle', 'call', 'toast', 'nav', 'refetch', 'prompt', 'confirm', 'focus', 'reset', 'delay',
] as const;
/** response gates: they read the last call's outcome, they are not verbs (naming.md §6) */
export const GATES = ['onfail', 'onsuccess'] as const;
/** the catalog as a lookup record — `__ui.verbs`, and anything else that needs the list */
export const VERB_CATALOG: Record<string, 1> = Object.fromEntries(
  [...VERBS, ...GATES].map(v => [v, 1 as const]),
);

export function parseVerb(src: string): Verb | null {
  const m = src.trim().match(/^(\w+)\s*([\s\S]*)$/);
  if (!m) return null;
  const name = m[1]!;
  let args = m[2]!.trim();
  if (args.startsWith(':')) args = args.slice(1).trim(); // tolerate "verb: arg" style in mid-list verbs
  const v: Verb = { name };
  try {
    if (name === 'set') {
      const mm = args.match(/^([\w.]+)\s*=\s*([\s\S]+)$/);
      if (!mm) throw new Error('ui: bad set');
      v.path = mm[1]!; v.expr = mm[2]!;
    } else if (name === 'toggle') v.path = args;
    else if (name === 'toast') v.expr = args;
    else if (name === 'onfail' || name === 'onsuccess') v.expr = args.replace(/^toast\s+/, '');
    else if (name === 'delay') v.ms = Number(args);
    else if (name === 'nav') v.sel = args.startsWith("'") ? String(safeEval(args, null)) : args;
    else if (name === 'refetch') v.target = args;
    else if (name === 'focus' || name === 'reset') v.sel = args.startsWith("'") ? String(safeEval(args, null)) : args;
    else if (name === 'prompt') {
      const mm = args.match(/^([\s\S]+?)\s+into\s+([\w.]+)$/);
      if (!mm) throw new Error('ui: prompt needs "into <path>"');
      v.msg = mm[1]!; v.path = mm[2]!;
    } else if (name === 'confirm') v.expr = args;
    else if (name === 'call') {
      // extract optimistic first (bounded by ';'), then the with-body clause
      const om = args.match(/optimistic:\s*set\s+([\w.]+)\s*=\s*([^;]+)/);
      if (om) { v.optimistic = { path: om[1]!, expr: om[2]!.trim() }; args = args.replace(/optimistic:[^;]+/, '').trim(); }
      const bm = args.match(/\swith\s+([\s\S]+)$/);
      if (bm) { v.body = bm[1]!; args = args.replace(/\swith\s+[\s\S]+$/, '').trim(); }
      const mm = args.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/);
      if (!mm) throw new Error(`ui: bad call "${args}"`);
      v.method = mm[1] as Verb['method']; v.url = mm[2]!;
    } else {
      throw new Error(`ui: unknown verb "${name}" (see skill/SKILL.md for the catalog)`);
    }
  } catch (e) {
    throw new Error(`ui: verb "${name}": ${(e as Error).message}`);
  }
  return v;
}

function toastHost(): HTMLElement {
  let host = document.getElementById('ui-toasts');
  if (!host) {
    host = Object.assign(document.createElement('div'), { id: 'ui-toasts' });
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  return host;
}

export function toast(msg: unknown, fail: boolean): void {
  const t = Object.assign(document.createElement('div'), {
    className: 'ui-toast' + (fail ? ' ui-toast-fail' : ''),
    textContent: String(msg),
  });
  toastHost().append(t);
  setTimeout(() => t.remove(), 2600);
}

function doNav(sel: string): void {
  const target = document.querySelector(sel);
  if (!target) { warn('ui: nav target not found: ' + sel); return; }
  const screens = [...document.querySelectorAll('[data-screen]')];
  const go = (): void => {
    for (const s of screens) (s as HTMLElement).hidden = s !== target;
    target.dispatchEvent(new CustomEvent('ui:navigated', { bubbles: true }));
  };
  if (document.startViewTransition) document.startViewTransition(go);
  else go();
}

function doRefetch(name: string, el: Element): void {
  let sigRef: import('./types.ts').Signal | null = null;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const s = scopes.get(n);
    if (s && s.signals.has(name)) { sigRef = s.signals.get(name)!; break; }
  }
  if (!sigRef) { warn(`ui: refetch unknown signal "${name}"`); return; }
  let scopeEl: Element | null = null;
  for (let p: Element | null = el; p; p = p.parentElement) {
    if (scopes.get(p)?.meta.has(name)) { scopeEl = p; break; }
  }
  const meta = scopeEl ? scopes.get(scopeEl)!.meta.get(name) : undefined;
  if (meta && meta.type === 'remote') fetchCell(sigRef, meta.url);
  else warn(`ui: refetch target is not a remote cell: ${name}`);
}

/** a control whose `.value` actually represents its `ui:model` path.
 * checkbox/radio carry boolean state (`checked`), file carries a fake path, and a
 * multi-select's `.value` is only its first selected option — writing any of those
 * back would corrupt the signal. SKILL.md documents that reset does not restore
 * checkbox state; this makes the runtime agree with the documentation. */
function modelValue(control: Element): string | null {
  if (control instanceof HTMLInputElement) {
    if (control.type === 'checkbox' || control.type === 'radio' || control.type === 'file') return null;
    return control.value;
  }
  if (control instanceof HTMLSelectElement) return control.multiple ? null : control.value;
  return (control as HTMLInputElement).value;
}

async function doCall(v: Verb, el: Element): Promise<boolean> {
  const url = v.url!.replace(/\{([\w.]+)\}/g, (_, p: string) => String(readPath(p, el)));
  // capture the optimistic path's signal ref up front: the optimistic set may remove
  // this element's row from the DOM, and the rollback must not re-resolve through it
  const opt = v.optimistic
    ? { ref: resolvePath(v.optimistic.path, el), expr: v.optimistic.expr }
    : null;
  const readRef = (r: { ref: { sig: import('./types.ts').Signal; segs: string[] } }): unknown => {
    let x: unknown = r.ref.sig.value;
    for (const s of r.ref.segs) x = (x as Record<string, unknown> | null | undefined)?.[s];
    return x;
  };
  const old = opt ? readRef(opt) : undefined;
  // the request payload is computed at EVENT TIME — before the optimistic set mutates
  // any signal the body expression may read
  const body = v.body != null ? JSON.stringify(safeEval(v.body, el)) : undefined;
  if (opt) writeRef(opt.ref, safeEval(opt.expr, el));
  try {
    const res = await fetch(url, {
      method: v.method,
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  } catch {
    if (opt) writeRef(opt.ref, old); // rollback via captured ref
    return false;
  }
}

export function attachFx(el: Element): void {
  const spec = el.getAttribute('ui:fx')!;
  const ci = spec.indexOf(':');
  if (ci < 0) throw new Error(`ui: bad fx "${spec}"`);
  const evName = spec.slice(0, ci).trim();
  const verbs = spec.slice(ci + 1).split(';').map(parseVerb).filter((v): v is Verb => !!v);
  const go = async (): Promise<void> => {
    let failed = false;
    for (const v of verbs) {
      if (v.name === 'onfail' || v.name === 'onsuccess') {
        // response gates: the payload runs only when the last call's outcome matches;
        // the list itself always continues (onfail/onsuccess compose as pairs)
        const match = v.name === 'onfail' ? failed : !failed;
        if (match && v.expr) {
          try { toast(safeEval(v.expr, el), v.name === 'onfail'); }
          catch (e) { warn((e as Error).message); } // a bad gate payload must not abort the list
        }
        continue;
      }
      try {
        if (v.name === 'set') setPath(v.path!, safeEval(v.expr!, el), el);
        else if (v.name === 'toggle') setPath(v.path!, !readPath(v.path!, el), el);
        else if (v.name === 'call') {
          try { failed = !(await doCall(v, el)); }
          catch (e) { warn((e as Error).message); failed = true; }
        } else if (v.name === 'toast') toast(safeEval(v.expr!, el), false);
        else if (v.name === 'nav') doNav(v.sel!);
        else if (v.name === 'refetch') doRefetch(v.target!, el);
        else if (v.name === 'focus') (document.querySelector(v.sel!) as HTMLElement | null)?.focus();
        else if (v.name === 'reset') {
          const f = document.querySelector(v.sel!);
          if (f && f.tagName === 'FORM') {
            (f as HTMLFormElement).reset();
            for (const c of f.querySelectorAll('[ui\\:model]')) {
              const value = modelValue(c);
              if (value !== null) setPath(c.getAttribute('ui:model')!, value, c);
            }
          }
        } else if (v.name === 'delay') await sleep(v.ms!);
        else if (v.name === 'prompt') {
          const val = window.prompt(safeEval(v.msg!, el) as string);
          if (val !== null) setPath(v.path!, val, el);
        } else if (v.name === 'confirm') {
          if (!window.confirm(safeEval(v.expr!, el) as string)) return;
        }
      } catch (e) { warn((e as Error).message); }
    }
  };
  el.addEventListener(evName, e => {
    if (evName === 'submit') e.preventDefault(); // attribute apps never navigate on submit
    if (el.hasAttribute('ui:transition') && document.startViewTransition) document.startViewTransition(go);
    else void go();
  });
}
