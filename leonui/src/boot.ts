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
import { parse, ev, safeEval, BUILTINS } from './parser.ts';
import { sig, scopes, findScope, readPath, setPath, subCount } from './signals.ts';
import { coerce } from './state.ts';
import { parseVerb, VERB_CATALOG } from './fx.ts';

Object.assign(window as unknown as Record<string, unknown>, {
  __ui: {
    version: VERSION,
    parse, ev, safeEval, parseVerb, sig, scopes, findScope, readPath, setPath,
    attach,  // re-attaching a root must be a no-op — tests assert exactly that
    coerce,  // the declaration-literal grammar, so tests can pin it directly
    warns, BUILTINS,
    subCount, // live subscriber count for a signal — how the row-teardown test proves release
    verbs: VERB_CATALOG, // derived from fx.ts, so the catalog cannot drift
  },
});
