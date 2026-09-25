/* components.test.ts — the reuse layer: ui:use template components (props as
 * attributes, per-instance state) and the custom-element packaging path. */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import { Browser } from './harness.ts';

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
const gotoPage = (page: string) =>
  browser.newPage(base).then(p => p.goto(page, "document.readyState === 'complete' && window.__uiReady === true"));

t('components: ui:use — props from attributes, per-instance state', async () => {
  const p = await gotoPage('/docs/examples/component-use.html');
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no attach warnings');
  const tiles = `document.querySelectorAll('[ui\\\\:use]')`;
  assert.equal(await p.eval<number>(`${tiles}.length`), 3, 'three instances');
  // props rendered: label + coerced numeric start
  assert.equal(await p.eval<string>(`${tiles}[0].querySelector('.ui-badge').textContent`), 'Users');
  assert.equal(await p.eval<string>(`${tiles}[0].querySelector('b').textContent`), '120');
  assert.equal(await p.eval<string>(`${tiles}[2].querySelector('b').textContent`), '2');
  // click tile 2's +1: its count moves, tile 1 and 3 do not
  await p.eval(`${tiles}[1].querySelectorAll('button')[0].click()`);
  await p.waitFor(`${tiles}[1].querySelector('b').textContent === '38'`);
  assert.equal(await p.eval<string>(`${tiles}[0].querySelector('b').textContent`), '120', 'tile 1 state untouched');
  assert.equal(await p.eval<string>(`${tiles}[2].querySelector('b').textContent`), '2', 'tile 3 state untouched');
  // reset is per-instance too
  await p.eval(`${tiles}[1].querySelectorAll('button')[1].click()`);
  await p.waitFor(`${tiles}[1].querySelector('b').textContent === '37'`);
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no runtime warnings');
  await p.close();
});

t('components: custom element wraps the runtime — behavior included', async () => {
  const p = await gotoPage('/docs/examples/component-element.html');
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no attach warnings');
  assert.equal(await p.eval<number>(`customElements.get('x-counter') !== undefined`), true);
  const counters = `document.querySelectorAll('x-counter')`;
  assert.equal(await p.eval<number>(`${counters}.length`), 3);
  assert.equal(await p.eval<string>(`${counters}[0].querySelector('b').textContent`), ' 5', 'start prop coerced');
  assert.equal(await p.eval<string>(`${counters}[2].querySelector('b').textContent`), ' 1024');
  await p.eval(`${counters}[1].querySelector('button').click()`);
  await p.waitFor(`${counters}[1].querySelector('b').textContent === ' 1'`);
  assert.equal(await p.eval<string>(`${counters}[0].querySelector('b').textContent`), ' 5', 'sibling untouched');
  assert.equal(await p.eval<string>(`${counters}[1].querySelector('.ui-badge').textContent`), 'likes');
  await p.close();
});

t('components: ui:use props — id/class/style/data-*/aria-* are not prop signals', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`(() => {
    const tpl = document.createElement('template');
    tpl.id = 'probe-tpl';
    tpl.innerHTML = '<p ui:bind="text: pick"></p>';
    document.body.append(tpl);
    const host = document.createElement('div');
    host.id = 'probe-host';
    host.setAttribute('ui:use', '#probe-tpl');
    host.setAttribute('pick', 'chosen');           // a real prop
    host.setAttribute('data-screen', 'x');          // native lane — must NOT become a signal
    host.setAttribute('aria-label', 'probe');       // native lane
    host.setAttribute('style', 'color: inherit');   // layout, not a prop
    document.body.append(host);
  })()`);
  await p.eval(`import('/dist/leonui.js').then(m => m.attach(document.getElementById('probe-host')))`);
  assert.equal(await p.eval<string>(`document.querySelector('#probe-host p').textContent`), 'chosen', 'pick prop works');
  const sigs = await p.eval<string[]>(`[...window.__ui.scopes.get(document.getElementById('probe-host')).signals.keys()]`);
  assert.deepEqual(sigs, ['pick'], 'only the prop became a signal');
  await p.close();
});

t('components: docs page renders with both examples embedded', async () => {
  const res = await fetch(base + '/docs/components.html');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('/docs/examples/component-use.html'));
  assert.ok(html.includes('/docs/examples/component-element.html'));
  assert.ok(html.includes('ui:use'), 'page documents ui:use');
});
