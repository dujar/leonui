/* cdn.ts — the CDN/classic-script entry. Builds to dist/leonui.iife.js:
 * a plain <script src="…"> tag (no modules, no importmap) that boots the
 * runtime on load and exposes the public API as window.leonui. */
import * as api from './index.ts';

Object.assign(window as unknown as Record<string, unknown>, {
  leonui: {
    version: api.VERSION,
    attach: api.attach,
    coerce: api.coerce,
    sig: api.sig,
    scopes: api.scopes,
    readPath: api.readPath,
    setPath: api.setPath,
    warns: api.warns,
    parse: api.parse,
    safeEval: api.safeEval,
    parseVerb: api.parseVerb,
    toast: api.toast,
  },
});
