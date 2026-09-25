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

  const rowEls = (): Element[] => [...parent.querySelectorAll('[data-sort-key]')];

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
    try { writeRef(listRef, ordered); }
    catch (err) { warn((err as Error).message); }
  };

  parent.addEventListener('drop', (ev: Event) => { const e = ev as DragEvent; e.preventDefault(); commit(); });
  parent.addEventListener('dragend', commit);
}
