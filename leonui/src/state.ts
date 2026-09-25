/* state.ts — ui:state declarations and ui:computed derived signals */
import type { Signal } from './types.ts';
import { scopes, sig, capture } from './signals.ts';
import { safeEval } from './parser.ts';

/** Coerce a declared value into a signal's initial value.
 *
 * Array/object literals go through the **whitelist parser**, not JSON.parse, so
 * `ui:state` and every expression share one literal grammar: single-quoted
 * strings, unquoted keys, spread. (The old JSON-repair pass replaced every `'`
 * with `"`, which corrupted apostrophes — `{ note: "it's" }` became
 * `{ note: "it"s" }` and threw.) Non-literals are rejected by the parser, which
 * is the desired failure: a state value is a literal, never a signal reference. */
export function coerce(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  // loose on purpose ("1.", ".5" are numbers) but tight enough to reject "1.2.3",
  // which Number() would silently turn into NaN
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(v)) return Number(v);
  if (/^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^[[{]/.test(v)) return safeEval(v, null);
  return v;
}

/** per-cell request sequence — a slow first response must not overwrite a newer one */
const reqSeq = new WeakMap<Signal, number>();

export function fetchCell(s: Signal, url: string): void {
  const seq = (reqSeq.get(s) ?? 0) + 1;
  reqSeq.set(s, seq);
  const prev = s.value as { data?: unknown } | null;
  s.value = { status: 'loading', data: prev?.data ?? null };
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(d => { if (reqSeq.get(s) === seq) s.value = { status: 'ok', data: d }; })
    .catch(e => { if (reqSeq.get(s) === seq) s.value = { status: 'error', data: String((e as Error).message || e) }; });
}

export function attachState(el: Element): void {
  const sc: ScopeLike = { signals: new Map(), meta: new Map() };
  scopes.set(el, sc);
  for (const decl of el.getAttribute('ui:state')!.split(';')) {
    if (!decl.trim()) continue;
    const ci = decl.indexOf(':');
    if (ci < 0) throw new Error(`ui: bad state decl "${decl}"`);
    const name = decl.slice(0, ci).trim();
    const val = decl.slice(ci + 1).trim();
    let s: Signal;
    if (/^GET\s/i.test(val)) {
      const url = val.slice(4).trim();
      s = sig({ status: 'loading', data: null });
      sc.meta.set(name, { type: 'remote', url });
      fetchCell(s, url);
    } else {
      s = sig(coerce(val));
    }
    sc.signals.set(name, s);
  }
}

interface ScopeLike {
  signals: Map<string, Signal>;
  meta: Map<string, { type: 'remote'; url: string }>;
}

export function attachComputed(el: Element, name: string, expr: string): void {
  const sc = scopes.get(el) ?? { signals: new Map<string, Signal>(), meta: new Map() };
  scopes.set(el, sc);
  const s = sig<unknown>(undefined);
  const recompute = (): void => { // compute first, notify, then resubscribe self to deps
    const { value: v, deps } = capture(() => safeEval(expr, el));
    s.value = v;
    for (const set of deps) set.add(recompute);
  };
  recompute();
  sc.signals.set(name, s);
}
