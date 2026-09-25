/* remotecomponents.test.ts — cross-file ui:use: templates fetched from their
 * own files (script-stripped, cached), props as attributes, per-instance
 * state; a missing file warns instead of breaking the page. */
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

t('remote components: cross-file templates render with props and isolation', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/tests/fixtures/remote-components.html', "document.readyState === 'complete' && window.__uiReady === true"));
  const hosts = `document.querySelectorAll('[ui\\\\:use]')`;
  await p.waitFor(`${hosts}[0].querySelector('b')?.textContent === 'Ada'`, 5000);
  assert.equal(await p.eval<string>(`${hosts}[1].querySelector('b').textContent`), 'Grace', 'second instance, own props');
  assert.equal(await p.eval<string>(`${hosts}[1].querySelector('.ui-badge').textContent`), 'adm');
  // behavior travels with the component: follow toggles per instance
  await p.eval(`${hosts}[0].querySelector('button').click()`);
  await p.waitFor(`${hosts}[0].querySelector('button').textContent === 'Unfollow'`);
  assert.equal(await p.eval<string>(`${hosts}[1].querySelector('button').textContent`), 'Follow', 'instance 2 untouched');
  // second file's component
  await p.waitFor(`${hosts}[2].querySelector('.stat b')?.textContent === 'Stars: 10'`);
  await p.eval(`${hosts}[2].querySelector('button').click()`);
  await p.waitFor(`${hosts}[2].querySelector('.stat b').textContent === 'Stars: 11'`);
  await p.close();
});

t('remote components: fetched files are script-stripped', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/tests/fixtures/remote-components.html', "document.readyState === 'complete' && window.__uiReady === true"));
  
  await p.eval(`await new Promise(r => setTimeout(r, 100))`.replace('await ', ''));
  assert.equal(await p.eval<boolean>(`window.__pwned === true`), false, 'script in component file did not execute');
  assert.equal(await p.eval<number>(`document.querySelectorAll('script').length`), 1, 'only the runtime script present');
  await p.close();
});

t('remote components: missing file warns by name, page stays alive', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/tests/fixtures/remote-components.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`new Promise(r => setTimeout(r, 200))`);
  assert.ok(
    (await p.eval<string[]>('window.__ui.warns')).some(w => w.includes('missing.html#nope')),
    'failed fetch warned with the source name',
  );
  assert.equal(await p.eval<boolean>(`document.querySelector('[ui\\\\:use] b') !== null`), true, 'working components unaffected');
  await p.close();
});
