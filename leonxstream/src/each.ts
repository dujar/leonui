/* each.ts — ui:each, keyed list rendering with minimal-move DOM alignment */
import type { Signal } from './types.ts';
import { scopes, sig, resolvePath, track } from './signals.ts';
import { warn } from './signals.ts';
import { attachSubtree } from './scan.ts';
import { makeSortable } from './sortable.ts';

export function attachEach(el: Element): void {
  const attr = el.getAttribute('ui:each')!.trim();
  const parts = attr.split(/\s+/);
  if (parts.length !== 3 || parts[1] !== 'in') throw new Error(`ui: bad each "${attr}"`);
  const itemName = parts[0]!;
  const listPath = parts[2]!;
  const keyAttr = el.getAttribute('ui:key') || 'id';
  const listRef = resolvePath(listPath, el); // capture while attached (reparenting gap: H2)
  const template = el.cloneNode(true) as Element;
  const parent = el.parentElement;
  if (!parent) throw new Error('ui: each template has no parent');
  const sortable = el.hasAttribute('ui:sortable');
  const anchor = document.createComment('ui:each');
  parent.insertBefore(anchor, el);
  el.remove();



  interface Row {
    row: Element;
    itemSig: Signal;
  }
  const rows = new Map<string | number, Row>();
  if (sortable) makeSortable({ parent, rows, anchor, listRef });
  const readList = (): unknown => {
    let v: unknown = listRef.sig.value;
    for (const s of listRef.segs) v = (v as Record<string, unknown> | null | undefined)?.[s];
    return v;
  };

  function render(list: unknown): void {
    if (!Array.isArray(list)) return;
    const keys = new Set<string | number>();
    const desired: Element[] = [];
    list.forEach((item: unknown, idx: number) => {
      const key = (item as Record<string, unknown> | null)?.[keyAttr] ?? idx;
      keys.add(key as string | number);
      let r = rows.get(key as string | number);
      if (!r) {
        const row = template.cloneNode(true) as Element;
        const itemSig = sig(item);
        scopes.set(row, { signals: new Map([[itemName, itemSig]]), meta: new Map() });
        if (sortable) {
          row.setAttribute('draggable', 'true');
          row.setAttribute('data-sort-key', String(key));
        }
        parent!.insertBefore(row, anchor);
        attachSubtree(row);
        r = { row, itemSig };
        rows.set(key as string | number, r);
      } else {
        r.itemSig.value = item;
      }
      desired.push(r.row);
    });
    for (const [k, r] of [...rows]) if (!keys.has(k)) { r.row.remove(); rows.delete(k); }
    // align DOM order with data order: backward pass, moving only out-of-place rows
    // (moveBefore preserves node state where supported; insertBefore is the fallback)
    let expected: ChildNode = anchor;
    for (let i = desired.length - 1; i >= 0; i--) {
      const row = desired[i]!;
      if (row.nextSibling !== expected) {
        const mv = (parent as Element & { moveBefore?: (n: Element, before: ChildNode) => void }).moveBefore;
        if (mv && row.isConnected) mv.call(parent, row, expected);
        else parent!.insertBefore(row, expected);
      }
      expected = row;
    }
  }

  track(() => render(readList()));
}
