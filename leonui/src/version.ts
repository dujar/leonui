/* version.ts — package.json is the single source of truth: the bundler inlines
 * it at build time, so a release can never report a stale version. */
import pkg from '../package.json';

export const VERSION: string = pkg.version;
