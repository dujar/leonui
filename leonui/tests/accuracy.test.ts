/* accuracy.test.ts — pins the guarantees this review fixed, one test per defect.
 *
 * Each of these failed (or was untestable) before the corresponding fix, so they
 * are regression tests first and documentation second:
 *   coerce       — the declaration literal grammar used to be JSON-repair, which
 *                  corrupted apostrophes and silently produced NaN
 *   each keys    — duplicate ui:key collapsed two items into one row, silently
 *   each teardown— a removed row stayed subscribed to page-level signals forever
 *   attach       — re-attaching stacked a second listener on every wired element
 *   tabs         — Home/End missing, and arrow keys scrolled the page
 *   reset        — wrote a checkbox's "on" into the ui:model path
 *   remote cell  — a slow first response overwrote a newer one
 */
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
});
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

const t = (name: string, fn: () => Promise<void>) => test(name, fn, 30000);
const open = (): Promise<Page> => browser.newPage(base).then(p => p.goto('/tests/fixtures/accuracy.html'));
const click = (p: Page, sel: string) => p.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);

/* ================= declaration literals ================= */

t('coerce: one literal grammar — apostrophes survive, non-literals are rejected', async () => {
  const p = await open();
  // JSON round-trip so objects/arrays compare structurally
  const c = (v: string): Promise<string> =>
    p.eval<string>(`(() => { try { return JSON.stringify(window.__ui.coerce(${JSON.stringify(v)})); } catch (e) { return 'ERR: ' + e.message; } })()`);

  assert.equal(await c("'hi'"), '"hi"');
  assert.equal(await c('42'), '42');
  assert.equal(await c('true'), 'true');
  assert.equal(await c('[1, 2, 3]'), '[1,2,3]');
  assert.equal(await c("{ a: 1, b: 'x' }"), '{"a":1,"b":"x"}');
  // double-quoted strings are supported too, so JSON written by hand still parses
  assert.equal(await c('{ "a": 1 }'), '{"a":1}');
  assert.equal(await c("[{ id: 0, t: 'read the docs' }]"), '[{"id":0,"t":"read the docs"}]');
  // the defect: blanket ' -> " repair turned this into { note: "it"s" } and threw
  assert.equal(await c(`{ note: "it's" }`), `{"note":"it's"}`);
  assert.equal(await c(`['a', 'b']`), '["a","b"]');
  // a typo'd number must stay a string, never become NaN
  assert.equal(await c('1.2.3'), '"1.2.3"');
  assert.equal(await c('plain text'), '"plain text"');
  // a state value is a literal, never a signal reference
  assert.match(await c('[undeclared_signal]'), /ERR: .*undeclared signal/);
  assert.match(await c('[1, 2'), /ERR:/);
  await p.close();
});

/* ================= keyed lists ================= */

t('each: duplicate keys are named instead of silently losing an item', async () => {
  const p = await open();
  // A key identifies a row, so two items sharing one key can only ever be one row.
  // The guarantee is that the collision is *reported*, not silently absorbed.
  assert.equal(await p.eval(`document.querySelectorAll('#dupes .d').length`), 1, 'one key, one row');
  assert.equal(await p.eval(`document.querySelector('#dupes .d').textContent`), 'b', 'later item wins');
  const w = await p.eval<string[]>('window.__ui.warns');
  assert.equal(w.length, 1, `exactly one warning, got: ${JSON.stringify(w)}`);
  assert.match(w[0]!, /duplicate key "1"/);
  assert.match(w[0]!, /ui:key="id"/);
  await p.close();
});

t('each: removing a row releases its subscriptions on page-level signals', async () => {
  const p = await open();
  const subs = (): Promise<number> => p.eval(`window.__ui.subCount(window.__ui.findScope(document.body, 'query').sig)`);
  const live = (): Promise<number> => p.eval(`document.querySelectorAll('#bound .b').length`);

  assert.equal(await subs(), 2, 'one subscription per row');
  for (let i = 0; i < 3; i++) { await click(p, '#add-row'); await click(p, '#del-row'); }
  assert.equal(await live(), 2, 'the list is still two rows long');
  // before the fix this grew by one per cycle: the removed row's element stayed
  // reachable from the page-level signal's subscriber set
  assert.equal(await subs(), await live(), 'subscribers track live rows, not history');

  // and the surviving rows are still live
  await p.eval(`window.__ui.setPath('query', 'none', document.body)`);
  await p.waitFor(`[...document.querySelectorAll('#bound .b')].every(li => li.hidden)`);
  await p.close();
});

/* ================= attach idempotence ================= */

t('attach: re-attaching a root is a no-op — no stacked listeners, no state reset', async () => {
  const p = await open();
  await p.eval(`window.__ui.attach(document.body)`);
  assert.equal(await p.eval(`window.__ui.readPath('nextId', document.body)`), 3, 're-attach did not re-declare state');

  await click(p, '#toast-once');
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].length > 0`);
  assert.equal(
    await p.eval(`[...document.querySelectorAll('.ui-toast')].filter(t => t.textContent === 'once').length`),
    1,
    'one click produces exactly one toast, not one per attach',
  );
  await p.close();
});

/* ================= a11y: tabs ================= */

t('tabs: Home/End move selection and the key is consumed', async () => {
  const p = await open();
  const press = (sel: string, key: string): Promise<boolean> =>
    p.eval<boolean>(`(() => { const e = new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }); document.querySelector(${JSON.stringify(sel)}).dispatchEvent(e); return e.defaultPrevented; })()`);

  assert.equal(await press('#tb', 'End'), true, 'End is preventDefaulted — no page scroll');
  assert.equal(await p.eval(`document.querySelector('#pc').hidden`), false);
  assert.equal(await p.eval(`document.activeElement.id`), 'tc');
  assert.equal(await press('#tc', 'Home'), true, 'Home is preventDefaulted');
  assert.equal(await p.eval(`document.querySelector('#pa').hidden`), false);
  assert.equal(await p.eval(`document.activeElement.id`), 'ta');
  await p.close();
});

/* ================= reset semantics ================= */

t('reset: re-syncs text controls and keeps a checkbox value out of the model', async () => {
  const p = await open();
  await p.eval(`{ const i = document.querySelector('#txt'); i.value = 'hello'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await p.eval(`window.__ui.readPath('txt', document.body)`), 'hello');

  await click(p, '#do-reset');
  await p.waitFor(`document.querySelector('#txt').value === ''`);
  // the defect: the re-sync loop read .value off the checkbox and wrote "on"
  assert.notEqual(await p.eval(`window.__ui.readPath('txt', document.body)`), 'on', 'checkbox value never becomes the model');
  assert.equal(await p.eval(`window.__ui.readPath('txt', document.body)`), '', 'text control re-synced');
  await p.close();
});

/* ================= remote cell races ================= */

t('remote cell: a slow first response cannot overwrite a newer one', async () => {
  const p = await open();
  await p.eval(`
    const real = window.fetch;
    let n = 0;
    window.fetch = (u, o) => {
      if (String(u).includes('/api/race')) {
        const k = ++n;
        const wait = k === 1 ? 400 : 20;   // first request is slow, second is fast
        return new Promise(r => setTimeout(() => r(new Response(
          JSON.stringify({ n: k }), { headers: { 'content-type': 'application/json' } },
        )), wait));
      }
      return real(u, o);
    };
  `);
  await click(p, '#race-go'); // refetch race; refetch race — two in-flight requests
  await p.waitFor(`document.querySelector('#race-status').textContent === 'ok'`, 3000);
  await p.eval(`new Promise(r => setTimeout(r, 600))`); // let the stale first response land
  assert.equal(await p.eval(`document.querySelector('#race-data').textContent`), '2', 'newest response wins');
  await p.close();
});
