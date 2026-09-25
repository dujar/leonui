#!/usr/bin/env node
/* cli.ts — `ui check`: verify a leonui page without a browser.
 *
 * The skill's verification half. Run it before rendering anything:
 *
 *   bunx leonui check                 # every *.html under the cwd
 *   bunx leonui check pages/          # a directory
 *   bunx leonui check page.html --json
 *
 * Exits 1 when it finds an error, so it works as a pre-commit or CI gate.
 * Bundled to dist/cli.mjs (target: node) — no runtime dependency on Bun. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { checkHtml, type Finding } from './check.ts';
import { VERSION } from './version.ts';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', '.git']);
const HTML = /\.html?$/i;

const USAGE = `leonui check — static verification for leonui pages

usage
  leonui check [paths...]        files or directories (default: .)

options
  --json      machine-readable findings
  --quiet     errors only
  --version   print the runtime version
  --help      this text

reports
  unknown ui:* attribute names (with a suggestion)
  unknown verbs, malformed verbs, bad verb arguments
  enhancer props outside their closed value set
  enhancers on the wrong host element
  attributes whose required partner is missing (ui:key without ui:each, ui:model on a non-control)
  expressions that do not parse, and calls to non-whitelisted functions
  malformed ui:state / ui:computed / ui:each / ui:model / ui:key declarations
  duplicate attributes (HTML silently drops the later one)

exit status
  0  nothing to report
  1  an error was found
  2  usage error — unknown option, or a path that does not exist

not checked (needs a running page): nested path segments, selector matches,
remote responses. See skill/SKILL.md for the runtime half of verification.`;

function collect(target: string, out: string[]): void {
  const st = statSync(target, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isFile()) {
    if (HTML.test(target)) out.push(target);
    return;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(full, out);
    } else if (HTML.test(entry.name)) {
      out.push(full);
    }
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  // `leonui check …` arrives with the subcommand in argv, and it is not a path.
  // Left in, the no-path form resolved "check" as a directory that does not
  // exist, scanned nothing and printed "checked 0 files" with exit 0 — a
  // verifier that verified nothing, which is the exact failure mode this CLI
  // exists to eliminate. It only ever appeared to work when a path was passed.
  if (argv[0] === 'check') argv.shift();
  const flags = new Set(argv.filter(a => a.startsWith('-')));
  const targets = argv.filter(a => !a.startsWith('-'));

  if (flags.has('--help') || flags.has('-h')) { console.log(USAGE); return 0; }
  if (flags.has('--version') || flags.has('-v')) { console.log(VERSION); return 0; }

  const unknownFlag = [...flags].find(f => !['--json', '--quiet', '-q'].includes(f));
  if (unknownFlag) {
    console.error(`leonui check: unknown option "${unknownFlag}"\n\n${USAGE}`);
    return 2;
  }

  // A path that does not exist is a usage error, not a file with nothing wrong
  // in it. collect() used to skip it in silence, so a typo in a CI gate read as
  // a pass.
  const files: string[] = [];
  const missing: string[] = [];
  for (const t of targets.length ? targets : ['.']) {
    const abs = resolve(t);
    if (statSync(abs, { throwIfNoEntry: false })) collect(abs, files);
    else missing.push(t);
  }
  if (missing.length) {
    console.error(`leonui check: no such file or directory: ${missing.map(m => `"${m}"`).join(', ')}`);
    return 2;
  }
  files.sort();

  const findings: Finding[] = [];
  for (const f of files) findings.push(...checkHtml(f, readFileSync(f, 'utf8')));

  const quiet = flags.has('--quiet') || flags.has('-q');
  const shown = quiet ? findings.filter(f => f.severity === 'error') : findings;
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.length - errors;
  const rel = (p: string): string => {
    const r = relative(process.cwd(), p);
    return r && !r.startsWith('..') ? r : p;
  };

  if (flags.has('--json')) {
    console.log(JSON.stringify({ files: files.length, errors, warnings, findings: shown }, null, 2));
  } else {
    for (const f of shown) console.log(`${rel(f.file)}:${f.line}:${f.column}: ${f.severity}: ${f.message}`);
    if (shown.length) console.log('');
    const summary = `checked ${files.length} file${files.length === 1 ? '' : 's'}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
    if (errors) console.error(summary);
    else console.log(summary);
  }
  return errors ? 1 : 0;
}

// exitCode, not process.exit(): console.log is async when stdout is a pipe, and
// process.exit() tears the process down before the buffer drains — a linter that
// silently truncates its own findings on `ui check | less` is worse than none.
process.exitCode = main();
