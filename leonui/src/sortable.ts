/* sortable.ts — the drag-to-reorder primitive behind ui:sortable.
 *
 * Tier-3 rule: the agent declares WHAT (ui:sortable on a ui:each template);
 * this primitive owns HOW — drag mechanics, live reorder preview, and writing
 * the new order back to the data as an immutable replacement. The keyed
 * renderer then re-aligns the DOM, so state — not the visual drag — is the
 * source of truth. Implementation: HTML5 drag-and-drop (desktop); pointer/touch
 * is roadmap. Behavior is delegated on the list parent, so it works for rows
 * created later.
 */
import type { Signal } from './types.ts';
import { writeRef, warn } from './signals.ts';

interface SortableConfig {
  parent: Element;
  rows: Map<string | number, { row: Element; itemSig: Signal }>;
  anchor: Comment;
  listRef: { sig: Signal; segs: string[] };
}

export function makeSortable({ parent, rows, anchor, listRef }: SortableConfig): void {
  let dragged: Element | null = null;

  // direct children only: a deep querySelectorAll would sweep up the rows of a
  // nested ui:sortable list and let an inner drag reorder the outer list
  const rowEls = (): Element[] => [...parent.children].filter(c => c.hasAttribute('data-sort-key'));

  const currentList = (): unknown[] => {
    let v: unknown = listRef.sig.value;
    for (const s of listRef.segs) v = (v as Record<string, unknown> | null | undefined)?.[s];
    return Array.isArray(v) ? (v as unknown[]) : [];
  };

  parent.addEventListener('dragstart', (ev: Event) => { const e = ev as DragEvent;
    const target = e.target as Element;
    const row = target.closest?.('[data-sort-key]') ?? null;
    if (!row) return;
    dragged = row;
    row.classList.add('ui-dragging');
    e.dataTransfer?.setData('text/plain', '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });

  parent.addEventListener('dragover', (ev: Event) => { const e = ev as DragEvent;
    e.preventDefault(); // required for drop to fire
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!dragged) return;
    const y = e.clientY;
    const next = rowEls().find(r => {
      if (r === dragged) return false;
      const b = r.getBoundingClientRect();
      return y < b.top + b.height / 2;
    });
    if (next) {
      if (dragged.nextSibling !== next) parent.insertBefore(dragged, next);
    } else if (dragged.nextSibling !== anchor) {
      parent.insertBefore(dragged, anchor); // past the last row
    }
  });

  const commit = (): void => {
    if (!dragged) return;
    dragged.classList.remove('ui-dragging');
    dragged = null;
    // read the previewed DOM order, map back to items, write immutably —
    // the keyed render re-aligns and every index-based bind updates
    const byKey = new Map<string, unknown>();
    for (const [k, r] of rows) byKey.set(String(k), r.itemSig.value);
    const ordered: unknown[] = [];
    for (const node of rowEls()) {
      const item = byKey.get(node.getAttribute('data-sort-key')!);
      if (item !== undefined) ordered.push(item);
    }
    // a drag that ended where it started must not write: the immutable set would
    // hand the list signal a new array and re-render every row for no change
    const before = currentList();
    if (ordered.length === before.length && ordered.every((x, i) => x === before[i])) return;
    try { writeRef(listRef, ordered); }
    catch (err) { warn((err as Error).message); }
  };

  parent.addEventListener('drop', (ev: Event) => { const e = ev as DragEvent; e.preventDefault(); commit(); });
  parent.addEventListener('dragend', commit);
}
