/* boot.ts — full-tree attach + debug hook. Boot is idempotent: importing the
 * bundle twice (e.g. a page script + a component script importing { attach })
 * attaches exactly once. */
import { warns } from './signals.ts';
import { attach } from './scan.ts';
import { VERSION } from './version.ts';

function boot(): void {
  const w = window as unknown as { __uiBooted?: boolean; __uiReady: boolean };
  if (w.__uiBooted) return;
  w.__uiBooted = true;
  try { attach(document.body); } finally { w.__uiReady = true; }
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
