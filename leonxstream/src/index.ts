/* leonxstream — importing this module boots the runtime against document.body.
 *
 * Public API is deliberately tiny: the authoring surface is HTML attributes.
 * The debug hook (window.__ui) exposes internals for `ui check` and tests.
 */
export { VERSION } from './version.ts';
export { sig, scopes, readPath, setPath, warns } from './signals.ts';
export { parse, safeEval, BUILTINS } from './parser.ts';
export { parseVerb, toast } from './fx.ts';
import './boot.ts';
