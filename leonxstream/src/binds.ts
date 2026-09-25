/* binds.ts — aspect binds (ui:bind / ui:bind-<aspect>) and two-way ui:model */
import { sig, track, readPath, setPath } from './signals.ts';
import { safeEval } from './parser.ts';
import { warn } from './signals.ts';

/* ---------- aspect appliers ---------- */
export const ASPECT: Record<string, (el: Element, v: unknown) => void> = {
  text: (el, v) => { el.textContent = v == null ? '' : String(v); },
  class: (el, v) => { el.className = v == null ? '' : String(v); },
  hidden: (el, v) => { (el as HTMLElement).hidden = !!v; },
  disabled: (el, v) => { (el as HTMLButtonElement | HTMLInputElement).disabled = !!v; },
  checked: (el, v) => { (el as HTMLInputElement).checked = !!v; },
  open: (el, v) => { (el as HTMLDetailsElement).open = !!v; },
};

export function applyAspect(el: Element, aspect: string, v: unknown): void {
  if (aspect.startsWith('attr:')) {
    const name = aspect.slice(5);
    if (v === false || v == null) el.removeAttribute(name);
    else el.setAttribute(name, v === true ? '' : String(v));
    return;
  }
  const fn = ASPECT[aspect];
  if (!fn) throw new Error(`ui: unknown bind aspect "${aspect}"`);
  fn(el, v);
}

export function attachBind(el: Element, aspect: string, expr: string): void {
  const update = (): void => {
    try { applyAspect(el, aspect, safeEval(expr, el)); }
    catch (e) { warn((e as Error).message); }
  };
  track(update);
}

/** ui:bind="aspect: expr; aspect2: expr2" and ui:bind-<aspect>="expr" */
export function attachBinds(el: Element): void {
  for (const a of [...el.attributes]) {
    const m = a.name.match(/^ui:bind(?:-([a-zA-Z:]+))?$/);
    if (!m) continue;
    if (m[1]) attachBind(el, m[1]!, a.value);
    else {
      for (const part of a.value.split(';')) {
        if (!part.trim()) continue;
        const ci = part.indexOf(':');
        if (ci < 0) throw new Error(`ui: bad bind "${part}"`);
        attachBind(el, part.slice(0, ci).trim(), part.slice(ci + 1).trim());
      }
    }
  }
}

/** two-way bind on form controls */
export function attachModel(el: Element): void {
  const path = el.getAttribute('ui:model')!;
  track(() => {
    const v = readPath(path, el);
    if (document.activeElement !== el) (el as HTMLInputElement).value = v == null ? '' : String(v);
  });
  const push = () => setPath(path, (el as HTMLInputElement).value, el);
  el.addEventListener('input', push);
  el.addEventListener('change', push);
}

/* ---------- ui:each — keyed list over a signal ---------- */
export interface RowRecord {
  row: Element;
  itemSig: ReturnType<typeof sig>;
}
export interface EachHost {
  parent: Element;
  anchor: Comment;
  rows: Map<string | number, RowRecord>;
}
