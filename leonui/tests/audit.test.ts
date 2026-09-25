/* audit.test.ts — mechanical verification of agent-authored pages from the
 * emission audit: two independent agents built these pages from AGENTS.md +
* the skill alone. If these tests fail, the skill failed its first-try promise. */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import { Browser, Page } from './harness.ts';

let server: ReturnType<typeof Bun.serve>;
let base = '';
let browser: Browser;

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
  browser = await Browser.launch();
}, 20000);
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

const t = (name: string, fn: () => Promise<void>) => test(name, fn, 30000);
const gotoAudit = (page: string) =>
  browser.newPage(base).then(p => p.goto(page, "document.readyState === 'complete' && window.__uiReady === true"));

t('audit[notes]: agent-authored page — add, counter, colors, remove, empty state', async () => {
  const p = await gotoAudit('/pages/audit-notes.html');
  // clean attach: no runtime warnings on first try
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no attach warnings');
  assert.equal(await p.eval<number>('window.__ui.readPath("notes", document.body).length'), 0);

  // add gated on empty input
  assert.equal(await p.eval<boolean>('document.querySelector("#add-btn").disabled'), true);
  await p.eval(`{ const i = document.querySelector('#note-input'); i.value = 'first note'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await p.eval(`{ const s = document.querySelector('#note-color'); s.value = 'green'; s.dispatchEvent(new Event('change', { bubbles: true })); }`);
  assert.equal(await p.eval<boolean>('document.querySelector("#add-btn").disabled'), false);
  await p.eval('document.querySelector("#add-btn").click()');
  await p.waitFor(`window.__bench === undefined && window.__ui.readPath("notes", document.body).length === 1`);

  assert.equal(await p.eval<string>('window.__ui.readPath("draft", document.body)'), '', 'input cleared after add');
  assert.equal(await p.eval<string>('document.querySelector("#note-count").textContent'), '1 note');
  assert.equal(await p.eval<boolean>('document.querySelector("#note-count").hidden'), false);
  assert.equal(await p.eval<boolean>('document.querySelector("#list-empty").hidden'), true);
  const first = await p.eval<string>(`document.querySelector('#note-list .ui-list-item .ui-list-title').textContent`);
  assert.equal(first, 'first note');
  assert.equal(await p.eval<string>(`document.querySelector('#note-list .ui-list-item .ui-badge').textContent`), 'green');
  assert.ok(await p.eval<boolean>(`document.querySelector('#note-list .ui-list-item .ui-badge').classList.contains('ui-b-success')`));

  // second note (red) prepends
  await p.eval(`{ const i = document.querySelector('#note-input'); i.value = 'second note'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await p.eval(`{ const s = document.querySelector('#note-color'); s.value = 'red'; s.dispatchEvent(new Event('change', { bubbles: true })); }`);
  await p.eval('document.querySelector("#add-btn").click()');
  await p.waitFor(`window.__ui.readPath("notes", document.body).length === 2`);
  assert.equal(await p.eval<string>('document.querySelector("#note-count").textContent'), '2 notes');
  assert.equal(await p.eval<string>(`document.querySelector('#note-list .ui-list-item .ui-list-title').textContent`), 'second note', 'newest first');
  assert.ok(await p.eval<boolean>(`document.querySelector('#note-list .ui-list-item .ui-badge').classList.contains('ui-b-danger')`));

  // per-note remove
  await p.eval(`document.querySelector('#note-list [aria-label=remove]').click()`);
  await p.waitFor(`window.__ui.readPath("notes", document.body).length === 1`);
  assert.equal(await p.eval<string>('document.querySelector("#note-count").textContent'), '1 note');
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no runtime warnings during the whole flow');
  await p.close();
});

t('audit[settings]: agent-authored page — model echoes, reset, focus, gated save + toast', async () => {
  const p = await gotoAudit('/pages/audit-settings.html');
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no attach warnings');

  // two-way name echo
  await p.eval(`{ const i = document.querySelector('#inp-name'); i.value = 'Ada'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await p.eval<string>('document.querySelector("#echo-name").textContent'), 'hello Ada');

  // select echo
  await p.eval(`{ const s = document.querySelector('#sel-theme'); s.value = 'dark'; s.dispatchEvent(new Event('change', { bubbles: true })); }`);
  assert.equal(await p.eval<string>('document.querySelector("#echo-theme").textContent'), 'theme = dark');

  // checkbox toggles
  await p.eval('document.querySelector("#chk-tips").click()');
  await p.waitFor(`document.querySelector('#echo-tips').textContent === 'email tips: off'`);
  assert.equal(await p.eval<boolean>('document.querySelector("#chk-tips").checked'), false);

  // save gated on name
  assert.equal(await p.eval<boolean>('document.querySelector("#btn-save").disabled'), false, 'name non-empty -> save enabled');
  await p.eval('document.querySelector("#btn-save").click()');
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'Settings saved for Ada')`);

  // reset defaults: controls AND state
  await p.eval('document.querySelector("#btn-reset").click()');
  await p.waitFor(`document.querySelector('#echo-name').textContent === '(empty)'`);
  assert.equal(await p.eval<string>('document.querySelector("#echo-theme").textContent'), 'theme = system');
  assert.equal(await p.eval<string>('document.querySelector("#echo-tips").textContent'), 'email tips: on');
  assert.equal(await p.eval<boolean>('document.querySelector("#chk-tips").checked'), true, 'checkbox control restored');
  assert.equal(await p.eval<boolean>('document.querySelector("#btn-save").disabled'), true);

  // focus verb
  await p.eval('document.querySelector("#btn-focus").click()');
  assert.equal(await p.eval<string>('document.activeElement.id'), 'inp-name');
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no runtime warnings during the whole flow');
  await p.close();
});
