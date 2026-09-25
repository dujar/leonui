/* check.test.ts — the browser-free half of the agent contract.
 *
 * `ui check` exists so an agent can verify a page before anything renders. Two
 * kinds of test keep it honest:
 *
 *   unit     — inline markup with hand-counted line:column, so a finding that
 *              points at the wrong place fails loudly. A linter that reports the
 *              right thing at the wrong offset is a linter nobody trusts.
 *   gallery  — the shipped pages and docs must come back clean. This is the
 *              false-positive guard: the checker is only useful if a correct page
 *              produces zero findings.
 *
 * No browser here on purpose — that is the whole point of the module.
 */
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkHtml, type Finding } from '../src/check.ts';

const pkg = fileURLToPath(new URL('../', import.meta.url));

/** the finding whose message matches, or undefined */
const one = (fs: Finding[], re: RegExp): Finding | undefined => fs.find(f => re.test(f.message));
const msgs = (fs: Finding[]): string[] => fs.map(f => f.message);

/* ================= the checks ================= */

test('check: a clean page produces nothing', () => {
  const src = `<!doctype html>
<html><body ui:state="q: ''; n: 0">
  <div ui:stack gap="3" align="center">
    <button ui:button variant="primary" ui:fx="click: set n = n + 1">go</button>
    <svg ui:icon name="check"></svg>
    <img ui:image ratio="3/2" src="x.png" alt="">
    <dialog id="d" ui:modal><p>hi</p></dialog>
    <button ui:button command="show-modal" commandfor="d">open</button>
    <div ui:bind="text: q"></div>
    <input ui:input ui:model="q">
    <ul ui:each="row in rows" ui:key="id"><li ui:bind="text: row.id"></li></ul>
  </div>
</body></html>`;
  assert.deepEqual(checkHtml('t.html', src), []);
});

test('check: unknown ui:* names are reported with a suggestion', () => {
  const fs = checkHtml('t.html', `<div ui:stak gap="2"></div>`);
  assert.equal(fs.length, 1);
  assert.equal(fs[0]!.severity, 'error');
  assert.match(fs[0]!.message, /unknown attribute "ui:stak" — did you mean "ui:stack"\?/);
  // a stranger gets no bogus suggestion
  const far = checkHtml('t.html', `<div ui:zzzzzzzzz="1"></div>`);
  assert.match(far[0]!.message, /unknown attribute "ui:zzzzzzzzz"$/);
});

test('check: enhancer values outside their set are reported with the legal set', () => {
  const fs = checkHtml('t.html', `<button ui:button variant="primry">x</button>`);
  assert.equal(fs.length, 1);
  assert.match(fs[0]!.message, /allowed: primary\|ghost\|danger\|icon/);
  assert.deepEqual(checkHtml('t.html', `<button ui:button variant="primary">x</button>`), []);
});

test('check: ranges, patterns and hosts are reported', () => {
  assert.match(one(checkHtml('t.html', `<div ui:stack gap="99"></div>`), /integer 1\.\.8/)!.message, /gap="99"/);
  assert.match(one(checkHtml('t.html', `<div ui:spacer size="0"></div>`), /integer 1\.\.8/)!.message, /size="0"/);
  assert.match(one(checkHtml('t.html', `<img ui:image ratio="wide">`), /aspect-ratio/)!.message, /ratio="wide"/);
  // wrong host
  assert.match(one(checkHtml('t.html', `<div ui:modal></div>`), /requires <dialog>/)!.message, /found <div>/);
  assert.match(one(checkHtml('t.html', `<input ui:icon name="check">`), /requires <svg>/)!.message, /found <input>/);
  // missing required native attribute
  assert.match(one(checkHtml('t.html', `<div ui:popover anchor="#a"></div>`), /native "popover"/)!.message, /not applied/);
  assert.deepEqual(checkHtml('t.html', `<div popover ui:popover placement="bottom-start"></div>`), []);
});

test('check: bind aspects and expressions', () => {
  assert.match(one(checkHtml('t.html', `<div ui:bind="txet: q"></div>`), /unknown bind aspect "txet"/)!.message, /allowed: text\|class\|hidden\|disabled\|checked\|open/);
  // `attr:` with no attribute name parses as the aspect `attr`, which is not one
  assert.match(one(checkHtml('t.html', `<div ui:bind="attr: q"></div>`), /unknown bind aspect "attr"/)!.message, /or attr:<name>/);
  assert.deepEqual(checkHtml('t.html', `<div ui:bind="attr:aria-label: q"></div>`), []);
  // both forms: variant
  assert.match(one(checkHtml('t.html', `<div ui:bind-text="q +"></div>`), /unexpected/)!.message, /ui:bind-text/);
  // the whitelist is enforced statically, even though the expression may never run
  assert.match(one(checkHtml('t.html', `<div ui:bind="text: fetch(q)"></div>`), /function not allowed: fetch/)!.message, /allowed: without\|contains\|first\|sortBy/);
  assert.deepEqual(checkHtml('t.html', `<div ui:bind="text: without(q, 'a')"></div>`), []);
});

test('check: declarations', () => {
  assert.match(one(checkHtml('t.html', `<div ui:state="bad-name: 1"></div>`), /bad signal name "bad-name"/)!.message, /bad signal name/);
  // `n GET` has no colon at all; `n: GET` has one but no URL — both are mistakes,
  // and the second used to slip through to the literal branch as the string "GET"
  assert.match(one(checkHtml('t.html', `<div ui:state="n GET"></div>`), /expected "name: value"/)!.message, /bad state decl/);
  assert.match(one(checkHtml('t.html', `<div ui:state="n: GET"></div>`), /needs a URL after it/)!.message, /literal string "GET"/);
  assert.match(one(checkHtml('t.html', `<div ui:state="n: 'unterminated"></div>`), /unterminated string/)!.message, /unterminated/);
  assert.match(one(checkHtml('t.html', `<div ui:computed="bad expr"></div>`), /expected "name: expression"/)!.message, /bad computed/);
  assert.deepEqual(checkHtml('t.html', `<div ui:state="n: 0; s: 'hi'; l: [1, 2]" ui:computed="d: n * 2"></div>`), []);
  assert.deepEqual(checkHtml('t.html', `<div ui:state="rows: GET /api/rows"></div>`), []);
});

test('check: a second ui:computed declaration is named as the cause, not the symptom', () => {
  // `ui:state` and `ui:bind` split on `;`; `ui:computed` does not. A second
  // declaration reads as part of the expression, and the parser's honest answer —
  // "trailing input" — leaves the author to work out what the trailing input is.
  const fs = checkHtml('t.html', `<div ui:computed="a: n * 2; b: n + 1"></div>`);
  assert.equal(fs.length, 1);
  assert.match(fs[0]!.message, /ui:computed takes one declaration per element/);
  assert.match(fs[0]!.message, /move "b: n \+ 1" onto its own element/);
  // a `;` inside a string literal is just a character
  assert.deepEqual(checkHtml('t.html', `<div ui:computed="label: 'a; b'"></div>`), []);
  // and the ordinary single declaration is untouched
  assert.deepEqual(checkHtml('t.html', `<div ui:computed="d: n * 2"></div>`), []);
});

test('check: repeat, model and key paths', () => {
  assert.match(one(checkHtml('t.html', `<ul ui:each="row inn rows"></ul>`), /bad each/)!.message, /expected "item in listPath"/);
  assert.match(one(checkHtml('t.html', `<input ui:model="row .">`), /bad model path/)!.message, /bad model path/);
  // `ui:key` belongs on the SAME element as `ui:each` — that is the only place
  // each.ts reads it, so on a child it was inert. This fixture used to assert the
  // child form was clean, which is exactly the silent no-op being fixed here.
  assert.match(
    one(checkHtml('t.html', `<ul ui:each="row in rows"><li ui:key="row.id"></li></ul>`), /needs "ui:each"/)!.message,
    /ui:key needs "ui:each" on the same element/,
  );
  // and its value is a property NAME on the item, not a path: item["row.id"] is
  // undefined, so every row quietly keyed by index — the guarantee, silently gone
  assert.match(
    one(checkHtml('t.html', `<ul ui:each="row in rows" ui:key="row.id"></ul>`), /expected a property name/)!.message,
    /item\[key\], so a dotted path resolves to nothing/,
  );
  // the correct form is quiet, and omitting the key is legal (it defaults to "id")
  assert.deepEqual(checkHtml('t.html', `<ul ui:each="row in rows" ui:key="id"></ul>`), []);
  assert.deepEqual(checkHtml('t.html', `<ul ui:each="row in rows"></ul>`), []);
});

test('check: verbs are validated against the closed catalog', () => {
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: stpo n = 1"></div>`), /unknown verb "stpo"/)!.message, /unknown verb/);
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: nav"></div>`), /nav needs a selector/)!.message, /nav needs a selector/);
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: toast"></div>`), /toast needs a message/)!.message, /toast needs a message/);
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: refetch"></div>`), /refetch needs a cell name/)!.message, /refetch needs a cell name/);
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: delay soon"></div>`), /delay needs a number/)!.message, /delay needs a number/);
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: set n = fetch(n)"></div>`), /function not allowed/)!.message, /function not allowed/);
  // a URL token cannot contain a space, so this fails at the token, not the braces
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: call GET /a/{n + 1}"></div>`), /bad call/)!.message, /bad call "GET \/a\/\{n \+ 1\}"/);
  // a brace that parses as a token but is not a signal path
  assert.match(one(checkHtml('t.html', `<div ui:fx="click: call GET /a/{n.}"></div>`), /not a signal path/)!.message, /\{n\.\}/);
  // an fx with no event name before the colon
  assert.match(one(checkHtml('t.html', `<div ui:fx=": toast 'x'"></div>`), /needs an event name/)!.message, /needs an event name/);
  // legal verbs and gates, including the paired idiom
  assert.deepEqual(checkHtml('t.html', `<div ui:fx="click: call POST /api/t with { t: 'x' }; onsuccess toast 'ok'; onfail toast 'no'; toast 'done'"></div>`), []);
  assert.deepEqual(checkHtml('t.html', `<div ui:fx="click: confirm 'sure?'; toggle open; focus '#x'; reset '#form1'; nav '#y'; delay 200"></div>`), []);
});

test('check: duplicate attributes are flagged as a warning, not an error', () => {
  const fs = checkHtml('t.html', `<div class="a" class="b"></div>`);
  assert.equal(fs.length, 1);
  assert.equal(fs[0]!.severity, 'warning');
  assert.match(fs[0]!.message, /duplicate attribute "class"/);
});

test('check: a misspelled prop name is caught, a foreign attribute is not', () => {
  // the silent hole: the enhancer never saw a prop it recognised, so this used to
  // render the default variant and say nothing at all
  assert.match(one(checkHtml('t.html', `<button ui:button varient="primary">x</button>`), /has no prop "varient"/)!.message, /did you mean "variant"\?/);
  assert.match(one(checkHtml('t.html', `<div ui:stack aling="center"></div>`), /has no prop "aling"/)!.message, /did you mean "align"\?/);
  // declared props, flags, HTML attributes and unrelated names stay quiet
  assert.deepEqual(checkHtml('t.html', `<button ui:button variant="primary" block type="button" aria-label="a" data-x="1">x</button>`), []);
  assert.deepEqual(checkHtml('t.html', `<div ui:card role="group" title="t"></div>`), []);
  assert.deepEqual(checkHtml('t.html', `<div ui:badge tracking-id="7"></div>`), []);
  // an enhancer with no props to misspell
  assert.deepEqual(checkHtml('t.html', `<div ui:divider whatever="1"></div>`), []);
});

test('check: requirements that are not about props are reported too', () => {
  // A partner attribute on the same element. These were invisible to every pass
  // that could have noticed: the pass that reads `ui:sortable` only runs when
  // `ui:each` is present, which is exactly the case where it is not wrong.
  assert.match(one(checkHtml('t.html', `<ul ui:sortable><li>x</li></ul>`), /needs "ui:each"/)!.message, /ui:sortable needs "ui:each" on the same element/);
  assert.match(one(checkHtml('t.html', `<li ui:key="id"></li>`), /needs "ui:each"/)!.message, /ui:key needs "ui:each"/);
  assert.match(one(checkHtml('t.html', `<div ui:transition></div>`), /needs "ui:fx"/)!.message, /ui:transition needs "ui:fx"/);
  // and a host contract, from the same table
  assert.match(one(checkHtml('t.html', `<div ui:model="q"></div>`), /ui:model requires/)!.message, /requires <input> or <textarea> or <select>, found <div>/);
  // satisfied is silent, and so is a host the runtime declines to judge
  assert.deepEqual(checkHtml('t.html', `<ul ui:each="r in rows" ui:sortable ui:key="id"></ul>`), []);
  assert.deepEqual(checkHtml('t.html', `<input ui:model="q">`), []);
  assert.deepEqual(checkHtml('t.html', `<my-slider ui:model="q"></my-slider>`), [], 'a custom element is its own business');
});

test('check: ui:use needs a template id', () => {
  // without one the local form hands a CSS selector to querySelector (SyntaxError)
  // and the remote form is not recognised as remote at all — either way the runtime
  // message is about CSS, never about the id that is actually missing
  assert.match(one(checkHtml('t.html', `<div ui:use="card.html"></div>`), /bad use/)!.message, /expected "#template-id"/);
  assert.match(one(checkHtml('t.html', `<div ui:use="#"></div>`), /bad use/)!.message, /needs a template id after it/);
  assert.deepEqual(checkHtml('t.html', `<div ui:use="#card"></div>`), []);
  assert.deepEqual(checkHtml('t.html', `<div ui:use="/components/card.html#card"></div>`), []);
});

test('check: ui:reveal validates its props like any other enhancer', () => {
  assert.match(one(checkHtml('t.html', `<section ui:reveal from="sideways"></section>`), /ui:reveal from/)!.message, /allowed: fade\|up\|down\|left\|right\|zoom/);
  assert.match(one(checkHtml('t.html', `<section ui:reveal stagger="99"></section>`), /ui:reveal stagger/)!.message, /integer 0\.\.8/);
  assert.match(one(checkHtml('t.html', `<section ui:reveal trigger="hover"></section>`), /ui:reveal trigger/)!.message, /allowed: scroll\|load/);
  assert.deepEqual(checkHtml('t.html', `<section ui:reveal from="up" trigger="scroll" stagger="3"></section>`), []);
});

/* ================= positions ================= */

test('check: findings point at the attribute, on the right line and column', () => {
  const src = [
    `<div>`,                                   // 1
    `  <button`,                               // 2
    `    ui:button`,                           // 3
    `    variant="primry">x</button>`,         // 4
    `</div>`,                                  // 5
  ].join('\n');
  const fs = checkHtml('t.html', src);
  assert.equal(fs.length, 1);
  assert.equal(fs[0]!.line, 3);
  assert.equal(fs[0]!.column, 5, 'points at `ui:button`, the attribute that owns the bad prop');
  assert.equal(fs[0]!.file, 't.html');
});

test('check: the scanner tolerates real-world HTML', () => {
  // content inside script/style/textarea/title must not be scanned
  const src = `<!doctype html>
<!-- <div ui:nope="1"></div> -->
<style>.a { content: '<div ui:stak>'; }</style>
<script>const s = '<div ui:stak gap="99">';</script>
<textarea><div ui:stak></div></textarea>
<div ui:stack gap="2" align=center></div>
<img ui:image ratio=3/2 src=x.png>
<div ui:state="n: 0"></div>
<span data-x="1" aria-label="a" role="note"></span>`;
  assert.deepEqual(checkHtml('t.html', src), []);
});

test('check: an unbalanced tag does not throw', () => {
  for (const src of ['<div', '<div ', '<', '<div ui:stack gap=', '<<<>>>', '<div ui:state="n:']) {
    assert.doesNotThrow(() => checkHtml('t.html', src), `input: ${src}`);
  }
});

/* ================= the CLI ================= */

function run(args: string[]): { code: number; out: string; err: string; all: string } {
  const r = Bun.spawnSync({
    cmd: [process.execPath, join(pkg, 'src/cli.ts'), ...args],
    env: { ...process.env, NO_PROXY: '127.0.0.1,localhost' },
  });
  const out = r.stdout.toString();
  const err = r.stderr.toString();
  // findings go to stdout, the summary to stderr when there are errors — so a
  // shell pipeline still sees a clean exit status *and* a visible verdict
  return { code: r.exitCode, out, err, all: out + err };
}

test('cli: exits 1 on an error and 0 on a clean tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uicheck-'));
  try {
    writeFileSync(join(dir, 'bad.html'), `<div ui:stak gap="99"></div>\n`);
    writeFileSync(join(dir, 'good.html'), `<div ui:stack gap="2"></div>\n`);
    writeFileSync(join(dir, 'notes.txt'), `not html\n`);

    const bad = run(['check', dir]);
    assert.equal(bad.code, 1, 'errors exit 1');
    assert.match(bad.out, /bad\.html:1:6: error: unknown attribute "ui:stak"/);
    assert.match(bad.all, /checked 2 files: /, 'only .html files are counted');

    // the same tree, with the typo fixed
    writeFileSync(join(dir, 'bad.html'), `<div ui:stack gap="2"></div>\n`);
    const good = run(['check', dir]);
    assert.equal(good.code, 0, 'a clean tree exits 0');
    assert.match(good.all, /0 errors, 0 warnings/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli: --json is machine-readable and --quiet hides warnings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uicheck-'));
  try {
    writeFileSync(join(dir, 'a.html'), `<div class="a" class="b"></div><div ui:stak></div>\n`);

    const json = run(['check', dir, '--json']);
    assert.equal(json.code, 1);
    const parsed = JSON.parse(json.out) as { files: number; errors: number; warnings: number; findings: Finding[] };
    assert.equal(parsed.files, 1);
    assert.equal(parsed.errors, 1);
    assert.equal(parsed.warnings, 1);
    assert.equal(parsed.findings.length, 2);
    assert.equal(parsed.findings[0]!.line, 1);

    const quiet = run(['check', dir, '--quiet']);
    assert.equal(quiet.out.includes('duplicate attribute'), false, 'warnings hidden');
    assert.match(quiet.out, /unknown attribute/);
    assert.match(quiet.all, /1 error, 1 warning/, 'the summary still reports both');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cli: --help and --version do not scan anything, an unknown flag is rejected', () => {
  const help = run(['check', '--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /static verification for leonui pages/);
  assert.match(help.out, /--json/);

  const version = run(['check', '--version']);
  assert.equal(version.code, 0);
  assert.match(version.out.trim(), /^\d+\.\d+\.\d+/);

  const bogus = run(['check', '--nope']);
  assert.equal(bogus.code, 2, 'a usage error is distinguishable from a finding');
  assert.match(bogus.err, /unknown option "--nope"/);
});

/* ================= the gallery ================= */

test('gallery: every shipped page and example is clean', () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.html?$/i.test(e.name)) files.push(full);
    }
  };
  for (const d of ['pages', 'docs', 'tests/fixtures']) walk(join(pkg, d));

  assert.ok(files.length > 20, `expected the gallery to be non-trivial, found ${files.length} files`);

  const findings: Finding[] = [];
  for (const f of files) findings.push(...checkHtml(f, readFileSync(f, 'utf8')));
  assert.deepEqual(msgs(findings), [], `the shipped gallery must be warning-free:\n${findings.map(f => `${f.file}:${f.line}:${f.column}: ${f.message}`).join('\n')}`);
});
