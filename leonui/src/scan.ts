/* scan.ts — per-element attach passes (each isolated: one bad node must not kill the page)
 * plus the reuse layer: ui:use template components and the public attach() API
 * that custom-element authors call on their own roots. */
import { scopes, sig, guard, warn } from './signals.ts';
import type { Scope } from './types.ts';
import { coerce, attachState, attachComputed } from './state.ts';
import { attachEach } from './each.ts';
import { attachBinds, attachModel } from './binds.ts';
import { attachEnhancers, ENHANCERS } from './enhancers.ts';
import { attachFx } from './fx.ts';

/** the known ui:* vocabulary — anything else on an element is a typo worth naming */
const KNOWN_UI_ATTRS = new Set([
  'ui:state', 'ui:computed', 'ui:model', 'ui:each', 'ui:key',
  'ui:sortable', 'ui:use', 'ui:fx', 'ui:transition',
]);

function checkVocab(el: Element): void {
  for (const a of [...el.attributes]) {
    if (!a.name.startsWith('ui:')) continue;
    if (KNOWN_UI_ATTRS.has(a.name)) continue;
    if (a.name === 'ui:bind' || /^ui:bind-[\w:-]+$/.test(a.name)) continue;
    if (a.name in ENHANCERS) continue;
    warn(`ui: unknown attribute "${a.name}" (typo? the vocabulary lives in skill/SKILL.md)`);
  }
}

/** host attributes that are NOT component props */
const SKIP_PROPS = new Set(['ui:use', 'id', 'class', 'style']);

/** hosts already instantiated — guards re-entrancy (attach over overlapping
 * roots) and keeps the use-branch from re-entering its own root */
const USE_HOSTS = new WeakSet<Element>();

/** ui:use="#tpl-id" — instantiate a <template> component: clone its content,
 * expose host attributes as prop signals, then run the FULL attach passes over
 * the instance (state inside the template is per-instance; props come from the
 * host and sit in scope above the clone). */
export function attachUse(el: Element): void {
  if (USE_HOSTS.has(el)) return;
  const sel = el.getAttribute('ui:use')!;
  const tpl = document.querySelector(sel);
  if (!tpl || tpl.tagName !== 'TEMPLATE') throw new Error(`ui:use: template not found: ${sel}`);
  USE_HOSTS.add(el);
  const scope: Scope = { signals: new Map(), meta: new Map() };
  scopes.set(el, scope);
  for (const a of [...el.attributes]) {
    if (SKIP_PROPS.has(a.name) || a.name.startsWith('on') || a.name.startsWith('data-') || a.name.startsWith('aria-')) continue;
    scope.signals.set(a.name, sig(coerce(a.value)));
  }
  el.appendChild((tpl as HTMLTemplateElement).content.cloneNode(true));
  attach(el);
}

/** rows / component internals: enhancers + binds/model/fx per element */
function attachFlat(root: Element): void {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    guard(() => checkVocab(el), 'vocab', el);
    guard(() => attachEnhancers(el), 'enhance', el);
    guard(() => attachBinds(el), 'bind', el);
    if (el.hasAttribute('ui:model')) guard(() => attachModel(el), 'model', el);
    if (el.hasAttribute('ui:fx')) guard(() => attachFx(el), 'fx', el);
  }
}

/** rows (cloned per item in ui:each): no state/each/use passes */
export function attachSubtree(root: Element): void {
  attachFlat(root);
}

/** full attach over any root — the public API custom-element authors call
 * after injecting ui:* markup (light DOM or shadow root). */
export function attach(root: Element | DocumentFragment): void {
  const els: Element[] = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for (const el of els)
    if (el.hasAttribute('ui:state')) guard(() => attachState(el), 'state', el);
  for (const el of els)
    if (el.hasAttribute('ui:computed'))
      guard(() => {
        const attr = el.getAttribute('ui:computed')!;
        const ci = attr.indexOf(':');
        attachComputed(el, attr.slice(0, ci).trim(), attr.slice(ci + 1).trim());
      }, 'computed', el);
  for (const el of els)
    if (el.hasAttribute('ui:each')) guard(() => attachEach(el), 'each', el);
  for (const el of els) {
    if (!el.isConnected) continue; // detached (e.g. removed each-template) — rows attach via attachSubtree
    if (el.hasAttribute('ui:each')) continue; // each-templates themselves: nothing to attach
    if (el.hasAttribute('ui:use') && !USE_HOSTS.has(el)) { guard(() => attachUse(el), 'use', el); continue; }
    guard(() => checkVocab(el), 'vocab', el);
    guard(() => attachEnhancers(el), 'enhance', el);
    guard(() => attachBinds(el), 'bind', el);
    if (el.hasAttribute('ui:model')) guard(() => attachModel(el), 'model', el);
    if (el.hasAttribute('ui:fx')) guard(() => attachFx(el), 'fx', el);
  }
}
