/* state.ts — ui:state declarations and ui:computed derived signals */
import type { Signal } from './types.ts';
import { scopes, sig, capture } from './signals.ts';
import { safeEval } from './parser.ts';

export function coerce(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?[\d.]+$/.test(v)) return Number(v);
  if (/^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^[[{]/.test(v)) return JSON.parse(v.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"'));
  return v;
}

export function fetchCell(s: Signal, url: string): void {
  const prev = s.value as { data?: unknown } | null;
  s.value = { status: 'loading', data: prev?.data ?? null };
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(d => { s.value = { status: 'ok', data: d }; })
    .catch(e => { s.value = { status: 'error', data: String((e as Error).message || e) }; });
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
