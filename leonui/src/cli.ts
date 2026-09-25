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
  --json      machine-readable findings: { files, errors, warnings, suppressed,
              findings }. The counts are the whole scan; "suppressed" is how many
              findings --quiet kept out of the findings list, so the payload never
              reports a number its own list contradicts.
  --quiet     errors only in the output. The summary line still counts warnings:
              hiding the detail is not the same as reporting the page clean.
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
  a present-but-empty ui:key, which reads nothing and silently keys by index
  duplicate attributes (HTML silently drops the later one)

exit status
  0  nothing to report
  1  an error was found
  2  usage error — unknown option, an empty path, a path that does not exist or
     is not HTML, or nothing to check at all

nothing to check is exit 2, not 0: a gate that passes because it found no files
passes on the day the glob breaks. The same reasoning covers a named file that
is not HTML — "checked 0 files" for "check this file" is a verifier verifying
nothing, which is the one outcome this tool exists to prevent.

not checked (needs a running page): nested path segments, selector matches,
remote responses. Two findings are therefore runtime-only, and the runtime names
them instead: a ui:tabs with no [role="tab"] inside it (a descendant selector),
and ui:state / ui:computed / ui:each / ui:use inside a ui:each template (which
element is inside which template is a nesting question this scanner does not
answer). See skill/SKILL.md for the runtime half of verification.`;

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

  // An empty path is not ".". `resolve('')` IS the cwd, so `ui check ""` — a shell
  // variable that expanded to nothing, most often — silently scanned the whole
  // tree and reported on files nobody named.
  if (targets.some(t => t.trim() === '')) {
    console.error('leonui check: empty path — name a file or a directory, or pass nothing (which means ".")');
    return 2;
  }

  // A path that does not exist is a usage error, not a file with nothing wrong
  // in it. collect() used to skip it in silence, so a typo in a CI gate read as
  // a pass.
  const files: string[] = [];
  const missing: string[] = [];
  const notHtml: string[] = [];
  for (const t of targets.length ? targets : ['.']) {
    const abs = resolve(t);
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st) { missing.push(t); continue; }
    // A named file that is not HTML cannot be checked, and reporting "checked 0
    // files" with exit 0 for it is the same false pass as the missing-path branch
    // below. `ui check README.md` used to read as a clean bill of health for
    // README.md. Only *named* files: a non-HTML file merely sitting inside a
    // scanned directory is normal and stays ignored.
    if (st.isFile() && !HTML.test(abs)) { notHtml.push(t); continue; }
    collect(abs, files);
  }
  if (missing.length) {
    console.error(`leonui check: no such file or directory: ${missing.map(m => `"${m}"`).join(', ')}`);
    return 2;
  }
  if (notHtml.length) {
    console.error(`leonui check: not an HTML file: ${notHtml.map(m => `"${m}"`).join(', ')}`);
    return 2;
  }
  files.sort();
  // Nothing to check is never a pass. A gate that goes green because it found no
  // files is a gate that goes green on the day the glob breaks.
  if (!files.length) {
    const where = targets.length ? targets.map(t => `"${t}"`).join(', ') : 'the current directory';
    console.error(`leonui check: no .html files found in ${where} — nothing was checked`);
    return 2;
  }

  const findings: Finding[] = [];
  for (const f of files) findings.push(...checkHtml(f, readFileSync(f, 'utf8')));

  const quiet = flags.has('--quiet') || flags.has('-q');
  const shown = quiet ? findings.filter(f => f.severity === 'error') : findings;
  // The counts are the *verdict* — they describe the whole scan, exactly like the
  // human summary line does, which reports "1 error, 1 warning" even under
  // `--quiet` because hiding the detail is not the same as pretending it is clean.
  // `suppressed` is what makes that honest in JSON: without it the payload reported
  // `warnings: 1` beside a one-element `findings` array and contradicted itself,
  // which is the one thing a machine-readable mode may not do. With it the invariant
  // is readable off the document: findings.length + suppressed === errors + warnings.
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.length - errors;
  const rel = (p: string): string => {
    const r = relative(process.cwd(), p);
    return r && !r.startsWith('..') ? r : p;
  };

  if (flags.has('--json')) {
    const payload = { files: files.length, errors, warnings, suppressed: findings.length - shown.length, findings: shown };
    console.log(JSON.stringify(payload, null, 2));
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
