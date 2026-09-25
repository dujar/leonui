/* scan.ts — per-element attach passes (each isolated: one bad node must not kill the page) */
import { guard } from './signals.ts';
import { attachBinds, attachModel } from './binds.ts';
import { attachEnhancers } from './enhancers.ts';
import { attachFx } from './fx.ts';

/** rows (cloned per item): enhancers + binds/model/fx only */
export function attachSubtree(root: Element): void {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    guard(() => attachEnhancers(el), 'enhance', el);
    guard(() => attachBinds(el), 'bind', el);
    if (el.hasAttribute('ui:model')) guard(() => attachModel(el), 'model', el);
    if (el.hasAttribute('ui:fx')) guard(() => attachFx(el), 'fx', el);
  }
}
