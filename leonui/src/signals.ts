/* signals.ts — cells, ancestor-chain scoping, dependency tracking, warnings.
 *
 * The core isomorphism: JS objects find properties by walking the prototype
 * chain; the DOM finds context by walking the ancestor chain. Signal lookup
 * walks ancestors, so the DOM tree is the prototype chain of app state.
 */
import type { Signal, Scope } from './types.ts';

/* ---------- warnings (observable by `ui check` and tests) ---------- */
export const warns: string[] = [];
export const warn = (msg: string) => {
  warns.push(String(msg));
  console.warn(msg);
};

/** the one place the per-element attach failure line is formatted */
export const warnAttach = (kind: string, el: Element | undefined, e: unknown): void =>
  warn(`ui: attach ${kind} on <${el?.tagName?.toLowerCase() ?? '?'}${el?.id ? '#' + el.id : ''}>: ${(e as Error).message}`);

export const guard = (fn: () => void, kind?: string, el?: Element) => {
  try { fn(); } catch (e) { warnAttach(kind ?? '', el, e); }
};

/* ---------- dependency tracking ---------- */
let CUR: Set<Set<() => void>> | null = null;
let BAG: Array<() => void> | null = null;

export const track = (fn: () => void): void => {
  const prev = CUR;
  const subs = CUR = new Set();
  try { fn(); } finally {
    CUR = prev;
    for (const s of subs) {
      s.add(fn);
      // inside collect(), record how to unsubscribe so a removed subtree can be torn down
      if (BAG) BAG.push(() => { s.delete(fn); });
    }
  }
};

/** Run fn, capturing the signals it read; caller decides what subscribes to the deps. */
export const capture = <T>(fn: () => T): { value: T; deps: Set<Set<() => void>> } => {
  const prev = CUR;
  const deps = CUR = new Set();
  try { return { value: fn(), deps }; } finally { CUR = prev; }
};

/** Run fn and return a disposer that unsubscribes everything it tracked.
 *
 * Without this, a bind on a long-lived signal keeps the *removed* element alive
 * forever: the signal's subscriber set holds the update closure, which closes
 * over the element. Keyed-list rows are the case that matters — they routinely
 * bind page-level state (a filter, a search query), so every create/remove
 * cycle would otherwise grow those sets without bound. */
export const collect = <T>(fn: () => T): { value: T; dispose: () => void } => {
  const prev = BAG;
  const bag: Array<() => void> = [];
  BAG = bag;
  let value!: T;
  try { value = fn(); } finally { BAG = prev; }
  let done = false;
  return {
    value,
    dispose: () => {
      if (done) return;
      done = true;
      for (const d of bag) d();
      bag.length = 0;
    },
  };
};

/* ---------- cells ---------- */
/** subscriber sets, for diagnostics (`__ui.subCount`) — never for behaviour */
const SUBS = new WeakMap<object, Set<() => void>>();
export const subCount = (s: Signal): number => SUBS.get(s as object)?.size ?? 0;

export const sig = <T>(v: T): Signal<T> => {
  const subs = new Set<() => void>();
  const cell: Signal<T> = {
    get value() { if (CUR) CUR.add(subs as Set<() => void>); return v; },
    set value(nv) { if (nv === v) return; v = nv; for (const f of [...subs]) f(); },
  };
  SUBS.set(cell as object, subs);
  return cell;
};

/* ---------- scopes on the ancestor chain ---------- */
export const scopes = new WeakMap<Element, Scope>();

export function findScope(el: Element | null, name: string): { sig: Signal } | null {
  // v0 walks parentElement only; shadow-boundary crossing is a documented gap
  for (let n: Element | null = el; n; n = n.parentElement) {
    const s = scopes.get(n);
    if (s && s.signals.has(name)) return { sig: s.signals.get(name)! };
  }
  return null;
}

export const resolvePath = (path: string, el: Element | null): { sig: Signal; segs: string[] } => {
  const segs = String(path).split('.');
  const f = findScope(el, segs[0]!);
  if (!f) throw new Error(`ui: undeclared signal "${segs[0]}"`);
  return { sig: f.sig, segs: segs.slice(1) };
};

export const readPath = (path: string, el: Element | null): unknown => {
  const { sig, segs } = resolvePath(path, el);
  let v: unknown = sig.value;
  for (const s of segs) v = (v as Record<string, unknown> | null | undefined)?.[s];
  return v;
};

const copyVal = (o: unknown): unknown =>
  Array.isArray(o) ? [...o] : (o && typeof o === 'object' ? { ...(o as Record<string, unknown>) } : o);

export function writeRef(r: { sig: Signal; segs: string[] }, val: unknown): void {
  if (!r.segs.length) { r.sig.value = val; return; }
  const root = copyVal(r.sig.value) as Record<string, unknown>;
  let cur = root;
  for (let k = 0; k < r.segs.length - 1; k++) {
    cur[r.segs[k]!] = copyVal(cur[r.segs[k]!]) ?? {};
    cur = cur[r.segs[k]!] as Record<string, unknown>;
  }
  cur[r.segs[r.segs.length - 1]!] = val;
  r.sig.value = root;
}

export const setPath = (path: string, val: unknown, el: Element | null): void =>
  writeRef(resolvePath(path, el), val);
