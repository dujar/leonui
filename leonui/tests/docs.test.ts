/* docs.test.ts — the docs site: every page in the manifest is served, and the
 * hello-world example really runs (the docs promise live examples — keep it true). */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import { Browser } from './harness.ts';

let server: ReturnType<typeof Bun.serve>;
let base = '';
let browser: Browser;

const PAGES = [
  '/docs/', '/docs/hello-world.html', '/docs/state-and-binds.html', '/docs/lists.html',
  '/docs/forms.html', '/docs/server-data.html', '/docs/overlays.html', '/docs/theming.html',
  '/docs/components.html', '/docs/verbs-reference.html',
];

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
  browser = await Browser.launch();
}, 20000);
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

test('docs: every manifest page is served with the shell and sidebar', async () => {
  for (const path of PAGES) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, `${path} must be 200`);
    const html = await res.text();
    assert.ok(html.includes('id="docs-nav"'), `${path} has the sidebar`);
    assert.ok(html.includes('/docs/docs.js'), `${path} loads the docs shell`);
  }
});

test('docs: hello-world example actually runs', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/docs/examples/hello.html', "document.readyState === 'complete' && window.__uiReady === true"));
  assert.equal(await p.eval<string>(`document.querySelector('b').textContent`), 'world');
  await p.eval(`document.querySelector('button').click()`);
  await p.waitFor(`document.querySelector('b').textContent === 'leonui'`);
  assert.equal(await p.eval<string>(`document.querySelector('p').textContent`), 'Hello, leonui!');
  await p.eval(`document.querySelectorAll('button')[1].click()`);
  await p.waitFor(`document.querySelector('b').textContent === 'world'`);
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), []);
  await p.close();
});

test('docs: every embedded example source is fetchable and boots the runtime', async () => {
  const examples = ['hello.html', 'counter.html', 'two-way.html', 'list.html', 'server-data.html', 'overlays.html', 'theming.html'];
  for (const e of examples) {
    const res = await fetch(`${base}/docs/examples/${e}`);
    assert.equal(res.status, 200, `${e} must be 200`);
    assert.ok((await res.text()).includes('/dist/leonui.js'), `${e} loads the runtime`);
  }
});
