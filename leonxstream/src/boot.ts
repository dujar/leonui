/* boot.ts — full-tree attach passes + debug hook */
import { guard, warns } from './signals.ts';
import { attachState, attachComputed } from './state.ts';
import { attachEach } from './each.ts';
import { attachSubtree } from './scan.ts';
import { attachBinds, attachModel } from './binds.ts';
import { attachEnhancers } from './enhancers.ts';
import { attachFx } from './fx.ts';
import { VERSION } from './version.ts';

function attachAll(root: Element): void {
  const els = [root, ...root.querySelectorAll('*')];
  for (const el of els)
    if (el.isConnected && el.hasAttribute('ui:state'))
      guard(() => attachState(el), 'state', el);
  for (const el of els)
    if (el.isConnected && el.hasAttribute('ui:computed'))
      guard(() => {
        const attr = el.getAttribute('ui:computed')!;
        const ci = attr.indexOf(':');
        attachComputed(el, attr.slice(0, ci).trim(), attr.slice(ci + 1).trim());
      }, 'computed', el);
  for (const el of els)
    if (el.isConnected && el.hasAttribute('ui:each'))
      guard(() => attachEach(el), 'each', el);
  for (const el of els) {
    if (!el.isConnected || el.hasAttribute('ui:each')) continue;
    guard(() => attachEnhancers(el), 'enhance', el);
    guard(() => attachBinds(el), 'bind', el);
    if (el.hasAttribute('ui:model')) guard(() => attachModel(el), 'model', el);
    if (el.hasAttribute('ui:fx')) guard(() => attachFx(el), 'fx', el);
  }
}

function boot(): void {
  try { attachAll(document.body); } finally {
    (window as unknown as { __uiReady: boolean }).__uiReady = true;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* debug/test hooks — internals exposed for `ui check`, the bench driver, and tests */
import { parse, ev, safeEval } from './parser.ts';
import { sig, scopes, findScope, readPath, setPath } from './signals.ts';
import { parseVerb } from './fx.ts';
import { BUILTINS } from './parser.ts';

Object.assign(window as unknown as Record<string, unknown>, {
  __ui: {
    version: VERSION,
    parse, ev, safeEval, parseVerb, sig, scopes, findScope, readPath, setPath,
    warns, BUILTINS,
    verbs: { set: 1, toggle: 1, call: 1, toast: 1, nav: 1, refetch: 1, prompt: 1, confirm: 1, focus: 1, reset: 1, delay: 1, onfail: 1 },
  },
});
