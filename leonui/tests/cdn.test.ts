/* cdn.test.ts — the distribution contract: a CLASSIC script tag (no modules)
 * boots the runtime and exposes window.leonxstream-style API as window.leonui. */
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

t('cdn: iife build boots from a classic script tag', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/tests/fixtures/cdn.html', "document.readyState === 'complete' && window.__uiReady === true"));
  // reactive page works with zero modules
  assert.equal(await p.eval<string>(`document.querySelector('#out').textContent`), 'hello from the cdn build');
  await p.eval(`document.querySelector('#flip').click()`);
  await p.waitFor(`document.querySelector('#out').textContent === 'flipped'`);
  // public API exposed for custom-element authors
  assert.equal(await p.eval<string>(`typeof window.leonui`), 'object');
  assert.equal(await p.eval<string>(`typeof window.leonui.attach`), 'function');
  assert.equal(await p.eval<string>(`window.leonui.version`), '0.1.0');
  assert.deepEqual(await p.eval<string[]>('window.leonui.warns'), []);
  await p.close();
});

t('cdn: esm module build exposes the same API via import', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  const api = await p.eval<string[]>(`import('/dist/leonui.js').then(m => Object.keys(m).sort())`);
  for (const key of ['VERSION', 'attach', 'coerce', 'safeEval', 'setPath', 'sig', 'warns']) {
    assert.ok(api.includes(key), `export ${key} present`);
  }
  await p.close();
});
