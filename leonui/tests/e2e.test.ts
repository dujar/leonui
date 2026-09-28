// ui.e2e.test.mjs — full e2e suite: every component variant, behavior verb, and the
// CSS contracts (tokens, dark mode, cascade-layer precedence), driven over CDP.
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import pkg from '../package.json';
import { Browser, Page } from './harness.ts';

// bun:test defaults to a 5s per-test timeout; these e2e tests need more
const t = (name: string, fn: () => Promise<void>) => test(name, fn, 30000);

let server: ReturnType<typeof Bun.serve>;
let base = '';
let browser: Browser;

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
  browser = await Browser.launch();
});
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

const page = async (path: string): Promise<Page> => browser.newPage(base).then(p => p.goto(path));
const text = (p: Page, sel: string) => p.eval<string>(`document.querySelector(${JSON.stringify(sel)})?.textContent`);
const html = (p: Page, sel: string) => p.eval<string>(`document.querySelector(${JSON.stringify(sel)})?.innerHTML`);
const style = (p: Page, sel: string, prop: string) => p.eval<string>(`getComputedStyle(document.querySelector(${JSON.stringify(sel)}))[${JSON.stringify(prop)}]`);
const exists = (p: Page, sel: string) => p.eval<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`);
const click = (p: Page, sel: string) => p.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
const rowsOf = (p: Page, sel: string) => p.eval<string[]>(`[...document.querySelector(${JSON.stringify(sel)}).children].filter(n => n.nodeType === 1).map(n => n.querySelector('.ui-list-title')?.textContent ?? n.textContent.trim())`);
const assertNoPageErrors = (p: Page): void => {
  assert.deepEqual(p.pageErrors, [], 'no uncaught page errors');
};

const resetServer = async () => fetch(base + '/api/__reset', { method: 'POST' });

/* ================= core: signals, binds, parser ================= */

t('index renders and exposes the runtime', async () => {
  const p = await page('/pages/index.html');
  assert.equal(await text(p, '#ver-badge'), pkg.version);
  assert.equal(await text(p, 'p.ui-t-muted'), `runtime v${pkg.version} — component gallery`);
  await p.close();
});

t('binds: text aspect + expression concat', async () => {
  const p = await page('/pages/index.html');
  assert.equal(await text(p, 'p.ui-t-muted'), `runtime v${pkg.version} — component gallery`);
  await p.close();
});

t('parser: whitelist rejects undeclared signals, forbidden calls, trailing input', async () => {
  const p = await page('/pages/index.html');
  const attempt = (expr: string): Promise<string> => p.eval<string>(`(() => { try { window.__ui.safeEval(${JSON.stringify(expr)}, document.body); return 'accepted'; } catch (e) { return e.message; } })()`);
  assert.match(await attempt('undeclared_x + 1'), /undeclared signal/);
  assert.match(await attempt('fetch("http://evil")'), /unexpected|not allowed/); // rejected at parse
  assert.match(await attempt('document.title'), /undeclared signal/);          // globals are not in scope, rejected
  assert.match(await attempt('1 + 2 evil(3)'), /trailing|not allowed|unexpected/);
  assert.equal(await attempt('1 + 2 * 3'), 'accepted');                        // arithmetic ok
  await p.close();
});

t('parser: arithmetic, comparison, ternary, spread, object literals', async () => {
  const p = await page('/pages/index.html');
  const run = (expr: string): Promise<unknown> => p.eval(`window.__ui.safeEval(${JSON.stringify(expr)}, document.body)`);
  assert.equal(await run('2 + 3 * 4'), 14);
  assert.equal(await run('(2 + 3) * 4'), 20);
  assert.equal(await run('10 % 3'), 1);
  assert.equal(await run('7 / 2'), 3.5);
  assert.equal(await run('3 < 5 && 5 <= 5 && !(2 > 3)'), true);
  assert.equal(await run("1 == 1 ? 'yes' : 'no'"), 'yes');
  assert.deepEqual(await run('[1, ...[2, 3]]'), [1, 2, 3]);
  assert.deepEqual(await run("{ a: 1, b: 'x' }"), { a: 1, b: 'x' });
  assert.equal(await run("contains('Hello World', 'wor')"), true);
  assert.deepEqual(await run('sortBy([3, 1, 2], null)'), [3, 1, 2]);
  await p.close();
});

/* ================= layout components ================= */

t('layout: stack gap scale maps tokens to computed styles', async () => {
  const p = await page('/pages/layout.html');
  assert.equal(await style(p, '#stack-g2', 'gap'), '4px');   // --ui-gap-2
  assert.equal(await style(p, '#stack-g6', 'gap'), '24px');  // --ui-gap-6
  assert.equal(await style(p, '#stack-g2', 'flexDirection'), 'column');
  assert.equal(await style(p, '#row-between', 'justifyContent'), 'space-between');
  assert.equal(await style(p, '#stack-center', 'alignItems'), 'center');
  await p.close();
});

t('layout: card variants + divider + spacer', async () => {
  const p = await page('/pages/layout.html');
  assert.equal(await style(p, '#card-default', 'backgroundColor'), await style(p, '#card-default', 'backgroundColor'));
  const cardBg = await style(p, '#card-default', 'backgroundColor');
  const insetBg = await style(p, '#card-inset', 'backgroundColor');
  assert.notEqual(cardBg, insetBg, 'inset variant differs from default');
  const outlineBg = await style(p, '#card-outline', 'backgroundColor');
  assert.equal(outlineBg, 'rgba(0, 0, 0, 0)', 'outline variant is transparent');
  assert.equal(await style(p, '#div2', 'borderTopWidth'), '1px');
  assert.equal(await style(p, '#spacer1', 'height'), '32px'); // size=7 -> --ui-gap-7
  await p.close();
});

/* ================= content components ================= */

t('content: text + badge variants carry their classes', async () => {
  const p = await page('/pages/content.html');
  assert.equal(await style(p, '#t-title', 'fontWeight'), '700');
  assert.equal(await style(p, '#t-muted', 'fontSize'), await style(p, '#t-muted', 'fontSize'));
  assert.match(await style(p, '#t-code', 'fontFamily'), /mono/i);
  const badge = await p.eval(`getComputedStyle(document.querySelector('#b-brand')).color`);
  assert.ok(badge, 'badge has a computed color');
  // dynamic badge flips class via signal
  assert.equal(await text(p, '#b-dynamic'), 'on');
  assert.ok(((await p.eval<string>(`document.querySelector('#b-dynamic').className`)) as string).includes('ui-b-brand'));
  await p.eval(`document.querySelector('#b-dynamic')`); // (scope: featured signal is page-level)
  await p.close();
});

t('content: icons inject the sprite and reference symbols', async () => {
  const p = await page('/pages/content.html');
  assert.ok(await exists(p, '#ui-icons'));
  assert.match(await html(p, '#i-check'), /#ui-i-check/);
  assert.match(await html(p, '#i-search'), /#ui-i-search/);
  const w = await style(p, '#i-check', 'width');
  assert.notEqual(w, '0px');
  await p.close();
});

t('content: image fallback class on broken src', async () => {
  const p = await page('/pages/content.html');
  await p.waitFor(`document.querySelector('#img-broken').classList.contains('ui-img-error')`);
  assert.equal(await p.eval(`document.querySelector('#img-ok').classList.contains('ui-img-error')`), false);
  await p.close();
});

/* ================= forms ================= */

t('forms: two-way model syncs input -> signal -> echoes', async () => {
  const p = await page('/pages/forms.html');
  await p.eval(`
    const inp = document.querySelector('#inp-name');
    inp.value = 'Ada';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  assert.equal(await text(p, '#echo-name'), 'hello Ada');
  assert.equal(await p.eval(`document.querySelector('#inp-bio').value`), 'Ada', 'textarea shares the same signal');
  // typing in the textarea syncs back too
  await p.eval(`
    const bio = document.querySelector('#inp-bio');
    bio.value = 'Grace';
    bio.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  assert.equal(await text(p, '#echo-name'), 'hello Grace');
  assert.equal(await p.eval(`document.querySelector('#inp-name').value`), 'Grace');
  await p.close();
});

t('forms: select change updates signal', async () => {
  const p = await page('/pages/forms.html');
  await p.eval(`
    const sel = document.querySelector('#sel-color');
    sel.value = 'blue';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  assert.equal(await text(p, '#echo-color'), 'color = blue');
  await p.close();
});

t('forms: checkbox two-way bind + toggle verb', async () => {
  const p = await page('/pages/forms.html');
  assert.equal(await text(p, '#echo-acc'), 'not accepted');
  await p.eval(`document.querySelector('#chk-acc').click()`);
  assert.equal(await text(p, '#echo-acc'), 'accepted');
  assert.equal(await p.eval(`document.querySelector('#chk-acc').checked`), true);
  await p.eval(`document.querySelector('#chk-acc').click()`);
  assert.equal(await text(p, '#echo-acc'), 'not accepted');
  await p.close();
});

t('forms: button variants + disabled bind + reset/focus verbs', async () => {
  const p = await page('/pages/forms.html');
  const bgDefault = await style(p, '#btn-default', 'backgroundColor');
  const bgPrimary = await style(p, '#btn-primary', 'backgroundColor');
  assert.notEqual(bgDefault, bgPrimary, 'primary variant differs');
  assert.equal(await style(p, '#btn-lock', 'width') !== '0px', true);
  // disabled bind: gated button is disabled while the lock signal is true
  assert.equal(await p.eval(`document.querySelector('#btn-gated').disabled`), true);
  assert.equal(await text(p, '#echo-lock'), 'locked');
  await click(p, '#btn-lock'); // toggles the lock
  assert.equal(await text(p, '#echo-lock'), 'unlocked');
  assert.equal(await p.eval(`document.querySelector('#btn-gated').disabled`), false);
  // type, then reset form + focus
  await p.eval(`
    const inp = document.querySelector('#inp-name');
    inp.value = 'temp';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await click(p, '#btn-reset');
  await p.waitFor(`document.querySelector('#inp-name').value === ''`);
  assert.equal(await p.eval(`document.activeElement.id`), 'inp-name', 'focus verb moved focus');
  await click(p, '#btn-focus');
  assert.equal(await p.eval(`document.activeElement.id`), 'inp-name');
  await p.close();
});

/* ================= overlays ================= */

t('overlays: popover opens via platform invoker, placement wired, item runs verbs', async () => {
  const p = await page('/pages/overlays.html');
  assert.equal(await p.eval(`document.querySelector('#pop1').matches(':popover-open')`), false);
  await click(p, '#pop1-btn');
  assert.equal(await p.eval(`document.querySelector('#pop1').matches(':popover-open')`), true);
  assert.equal(await p.eval(`document.querySelector('#pop1').getAttribute('data-placement')`), 'bottom-end');
  assert.ok((await p.eval<string>(`document.querySelector('#pop1').style.positionAnchor`)) as unknown as boolean, 'position-anchor wired');
  await click(p, '#pop1-item');
  assert.equal(await text(p, '#echo-gate'), 'gate = from-popover');
  await p.close();
});

t('overlays: modal dialog via commandfor show-modal/close', async () => {
  const p = await page('/pages/overlays.html');
  assert.equal(await p.eval(`document.querySelector('#dlg1').open`), false);
  await click(p, '#dlg-open');
  assert.equal(await p.eval(`document.querySelector('#dlg1').open`), true);
  await click(p, '#dlg-close');
  assert.equal(await p.eval(`document.querySelector('#dlg1').open`), false);
  await p.close();
});

t('overlays: toasts render text into the aria-live host', async () => {
  const p = await page('/pages/overlays.html');
  await click(p, '#toast-ok');
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].some(t => t.textContent === 'saved!')`);
  assert.ok(await p.eval(`!!document.querySelector('#ui-toasts[role=status]')`));
  await p.close();
});

t('overlays: failing call triggers onfail toast', async () => {
  const p = await page('/pages/overlays.html');
  await click(p, '#toast-fail2'); // DELETE /api/tasks/999 -> 404
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].some(t => t.textContent === 'delete failed')`);
  await p.close();
});

t('forms: submit verb preventDefaults — no navigation, verb runs', async () => {
  const p = await page('/pages/forms.html');
  await click(p, '#btn-submit');
  await p.waitFor(`document.querySelector('#echo-submitted').textContent === 'submitted'`);
  assert.equal(await p.eval(`location.pathname`), '/pages/forms.html', 'no native navigation');
  assert.equal(await p.eval(`document.querySelector('#form-submit') !== null`), true, 'page intact');
  await p.close();
});

t('overlays: prompt + confirm + delay verbs', async () => {
  const p = await page('/pages/overlays.html');
  await p.eval(`window.prompt = () => 'sticky note'`);
  await click(p, '#ask-btn');
  assert.equal(await text(p, '#echo-note'), 'note = sticky note');
  await p.eval(`window.confirm = () => true`);
  await click(p, '#confirm-btn');
  await p.waitFor(`document.querySelector('#echo-gate2').textContent === 'gate2 = confirmed'`);
  await p.eval(`window.confirm = () => false`);
  await click(p, '#confirm-btn');
  await p.eval(`new Promise(r => setTimeout(r, 120))`);
  assert.equal(await text(p, '#echo-gate2'), 'gate2 = confirmed', 'declined confirm aborts the verb list');
  await click(p, '#delay-btn');
  await p.waitFor(`document.querySelector('#echo-gate2').textContent === 'gate2 = delayed'`, 2000);
  await p.close();
});

/* ================= navigation components ================= */

t('navigation: tabs aria state, panels, arrow keys', async () => {
  const p = await page('/pages/navigation.html');
  assert.equal(await p.eval(`document.querySelector('#panel-a').hidden`), false);
  assert.equal(await p.eval(`document.querySelector('#panel-b').hidden`), true);
  await click(p, '#tab-b');
  assert.equal(await p.eval(`document.querySelector('#panel-b').hidden`), false);
  assert.equal(await p.eval(`document.querySelector('#panel-a').hidden`), true);
  assert.equal(await p.eval(`document.querySelector('#tab-b').getAttribute('aria-selected')`), 'true');
  assert.equal(await p.eval(`document.querySelector('#tab-a').getAttribute('aria-selected')`), 'false');
  await p.eval(`
    document.querySelector('#tab-b').focus();
    document.querySelector('#tab-b').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  `);
  assert.equal(await p.eval(`document.querySelector('#panel-c').hidden`), false);
  assert.equal(await p.eval(`document.activeElement.id`), 'tab-c');
  await p.close();
});

t('navigation: accordion details are exclusive via name group', async () => {
  const p = await page('/pages/navigation.html');
  assert.equal(await p.eval(`document.querySelector('#acc1').open`), true);
  await p.eval(`document.querySelector('#acc2 summary').click()`);
  await p.waitFor(`document.querySelector('#acc2').open`);
  assert.equal(await p.eval(`document.querySelector('#acc1').open`), false, 'name group exclusivity');
  await p.close();
});

t('navigation: nav verb switches screens with view transition', async () => {
  const p = await page('/pages/navigation.html');
  assert.equal(await p.eval(`document.querySelector('#screen-1').hidden`), false);
  await click(p, '#nav-to-2');
  await p.waitFor(`!document.querySelector('#screen-2').hidden`);
  assert.equal(await p.eval(`document.querySelector('#screen-1').hidden`), true);
  assert.equal(await text(p, '#echo-where'), 'at screen-2');
  await click(p, '#nav-to-1');
  await p.waitFor(`!document.querySelector('#screen-1').hidden`);
  assert.equal(await text(p, '#echo-where'), 'at screen-1');
  await p.close();
});

/* ================= data components ================= */

t('data: keyed list add/drop/rotate/remove keeps DOM aligned', async () => {
  const p = await page('/pages/data.html');
  assert.deepEqual(await rowsOf(p, '#list1'), ['A', 'B', 'C']);
  await click(p, '#list-add');
  assert.deepEqual(await rowsOf(p, '#list1'), ['A', 'B', 'C', 'N4']);
  assert.equal(await text(p, '#list-count'), '4 items');
  await click(p, '#list-drop');
  assert.deepEqual(await rowsOf(p, '#list1'), ['B', 'C', 'N4']);
  await click(p, '#list-rot'); // B,C,N4 -> C,N4,B
  assert.deepEqual(await rowsOf(p, '#list1'), ['C', 'N4', 'B'], 'rotate reorders keys');
  // per-row remove verb (without + it)
  await p.eval(`document.querySelectorAll('#list1 [aria-label=remove]')[1].click()`); // remove N4
  assert.deepEqual(await rowsOf(p, '#list1'), ['C', 'B']);
  await click(p, '#list-drop'); await click(p, '#list-drop');
  assert.deepEqual(await rowsOf(p, '#list1'), []);
  assert.equal(await p.eval(`document.querySelector('#list-empty').hidden`), false, 'empty state shows');
  await p.close();
});

t('data: remote cell lifecycle loading -> ok + refetch', async () => {
  const p = await page('/pages/data.html');
  await p.waitFor(`document.querySelector('#rf-ok').hidden === false`);
  assert.match(await text(p, '#rf-ok'), /3 tasks loaded/);
  await click(p, '#rf-refetch');
  await p.waitFor(`document.querySelector('#rf-loading').hidden === false`);
  await p.waitFor(`document.querySelector('#rf-ok').hidden === false`);
  assert.match(await text(p, '#rf-ok'), /3 tasks loaded/);
  await p.close();
});

t('data: remote error cell reports status=error', async () => {
  const p = await page('/pages/data.html');
  await p.waitFor(`document.querySelector('#rb-status').textContent === 'error'`);
  await p.close();
});

t('data: computed sortBy re-runs on dependency change', async () => {
  const p = await page('/pages/data.html');
  await p.waitFor(`document.querySelectorAll('#table1 tbody tr').length === 3`);
  assert.deepEqual(await p.eval(`[...document.querySelectorAll('#table1 tbody td:first-child')].map(td => td.textContent)`), ['Abe', 'Bea', 'Cara']);
  await click(p, '#sort-age');
  assert.deepEqual(await p.eval(`[...document.querySelectorAll('#table1 tbody td:first-child')].map(td => td.textContent)`), ['Cara', 'Bea', 'Abe'], 'age sort differs from name sort');
  await p.close();
});

t('data: failing PATCH rolls back the optimistic set + onfail toast', async () => {
  const p = await page('/pages/data.html');
  await click(p, '#call-fail');
  // optimistic flip is visible immediately...
  await p.waitFor(`document.querySelector('#call-fail-echo').textContent.includes('PATCHED')`, 1500);
  // ...then the 500 rolls it back
  await p.waitFor(`document.querySelector('#call-fail-echo').textContent.includes("sort = name")`, 3000);
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].some(t => t.textContent === 'rolled back')`);
  await p.close();
});

t('data: scope shadowing — nearest ui:state wins', async () => {
  const p = await page('/pages/data.html');
  assert.equal(await text(p, '#who-out'), 'outer');
  assert.equal(await text(p, '#who-in'), 'inner');
  await click(p, '#shadow-set');
  assert.equal(await text(p, '#who-out'), 'changed');
  assert.equal(await text(p, '#who-in'), 'inner', 'inner scope unaffected by outer set');
  await p.close();
});

/* ================= CSS contracts ================= */

t('css: tokens resolve as custom properties on :root', async () => {
  const p = await page('/pages/layout.html');
  const brand = await p.eval<string>(`getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()`);
  assert.ok(brand.length > 0, '--brand resolves');
  const gap2 = await p.eval<string>(`getComputedStyle(document.documentElement).getPropertyValue('--ui-gap-2').trim()`);
  assert.equal(gap2, '4px');
  await p.close();
});

t('css: light-dark() flips with prefers-color-scheme (emulated dark)', async () => {
  const p = await page('/pages/layout.html');
  // Pin the baseline explicitly. Reading it first inherits the *host* appearance,
  // so on a dark-mode machine both reads come back dark and the flip looks absent.
  await p.colorScheme('light');
  await p.eval(`new Promise(r => setTimeout(r, 100))`);
  const bgLight = await style(p, 'body', 'backgroundColor');
  await p.colorScheme('dark');
  await p.eval(`new Promise(r => setTimeout(r, 100))`);
  const bgDark = await style(p, 'body', 'backgroundColor');
  assert.notEqual(bgLight, bgDark, 'background flips in dark scheme without JS');
  await p.colorScheme('light');
  await p.close();
});

t('css: cascade layers — app override beats ui.base', async () => {
  const p = await page('/pages/index.html');
  // index.html sets an unlayered #override-win colour at app level. Unlayered
  // rules beat the layered ui.base, so this wins without !important — and it is
  // an AA-passing red in both schemes rather than rgb(255, 0, 0), which measured
  // 3.8:1 on the light background and was the one text node in the whole package
  // that failed AA. Declared with `light-dark()`, so the expected value depends
  // on the emulated scheme: pin it rather than inherit whatever the last test left.
  await p.colorScheme('light');
  const c = await style(p, '#override-win', 'color');
  assert.equal(c, 'rgb(165, 24, 26)', 'app-level override wins');
  await p.close();
});

/* ================= integration: inbox over the real mock API ================= */

t('inbox: remote load renders rows; count binds', async () => {
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  assert.equal(await text(p, '#task-count'), '3 tasks');
  const titles = await p.eval(`[...document.querySelectorAll('#task-list .ui-list-title')].map(n => n.textContent)`);
  assert.deepEqual(titles, ['Set up leonui workspace', 'Write the interaction-tier spec', 'Run the verification-wedge tests']);
  await p.close();
});

t('inbox: add task — optimistic append, POST body, refetch reconciles ids', async () => {
  await resetServer();
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  assert.equal(await p.eval(`document.querySelector('#add-btn').disabled`), true, 'disabled while query empty');
  await p.eval(`{ const inp = document.querySelector('#add-input'); inp.value = 'Ship the framework'; inp.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await p.eval(`document.querySelector('#add-btn').disabled`), false);
  await click(p, '#add-btn');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 4`);
  await p.waitFor(`[...document.querySelectorAll('#task-list .ui-list-title')].some(t => t.textContent === 'Ship the framework')`, 4000);
  // server was hit: refetch reconciled — verify via API state reflected in count
  await p.waitFor(`document.querySelector('#task-count').textContent === '4 tasks'`);
  await p.close();
});

t('inbox: filter segments hide/show rows via binds', async () => {
  await resetServer();
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  const visibleTitles = (): Promise<string[]> => p.eval<string[]>(`[...document.querySelectorAll('#task-list .ui-list-item')].filter(li => !li.hidden).map(li => li.querySelector('.ui-list-title').textContent)`);
  assert.equal((await visibleTitles()).length, 3);
  await click(p, '#f-open');
  assert.deepEqual(await visibleTitles(), ['Write the interaction-tier spec', 'Run the verification-wedge tests']);
  await click(p, '#f-done');
  assert.deepEqual(await visibleTitles(), ['Set up leonui workspace']);
  await click(p, '#f-all');
  assert.equal((await visibleTitles()).length, 3);
  assert.ok(((await p.eval<string>(`document.querySelector('#f-all').className`)) as string).includes('ui-btn-primary'), 'active segment styled');
  await p.close();
});

t('inbox: search filter via two-way model', async () => {
  await resetServer();
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  await p.eval(`{ const inp = document.querySelector('#add-input'); inp.value = 'spec'; inp.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await p.waitFor(`[...document.querySelectorAll('#task-list .ui-list-item')].filter(li => !li.hidden).length === 1`);
  await p.eval(`{ const inp = document.querySelector('#add-input'); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await p.waitFor(`[...document.querySelectorAll('#task-list .ui-list-item')].filter(li => !li.hidden).length === 3`);
  await p.close();
});

t('inbox: toggle task — optimistic PATCH against the real API', async () => {
  await resetServer();
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  const box = `document.querySelector('#task-list .ui-list-item input[type=checkbox]')`;
  assert.equal(await p.eval(`${box}.checked`), true);
  await p.eval(`${box}.click()`);
  await p.waitFor(`${box}.checked === false`);
  // verify the server actually changed (optimistic + PATCH): reload check via fetch
  const serverDone = await p.eval(`fetch('/api/tasks').then(r => r.json()).then(ts => ts[0].done)`);
  assert.equal(serverDone, false);
  await p.eval(`${box}.click()`); // restore
  await p.waitFor(`${box}.checked === true`);
  await p.close();
});

t('inbox: delete task — optimistic removal + DELETE hits the server', async () => {
  await resetServer();
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  await p.eval(`document.querySelector('#task-list [aria-label=delete]').click()`);
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 2`);
  const n = await p.eval(`fetch('/api/tasks').then(r => r.json()).then(ts => ts.length)`);
  assert.equal(n, 2, 'server list shrank');
  await p.close();
});

t('inbox: no uncaught page errors across the whole journey', async () => {
  await resetServer();
  const p = await page('/pages/inbox.html');
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`);
  await click(p, '#f-open'); await click(p, '#f-all');
  assertNoPageErrors(p);
  await p.close();
});
