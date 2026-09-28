/* docs.test.ts — the docs site: every page in the manifest is served, and the
 * hello-world example really runs (the docs promise live examples — keep it true). */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { app } from '../serve/app.ts';
import { Browser } from './harness.ts';

let server: ReturnType<typeof Bun.serve>;
let base = '';
let browser: Browser;

const PAGES = [
  '/docs/', '/docs/hello-world.html', '/docs/state-and-binds.html', '/docs/lists.html',
  '/docs/forms.html', '/docs/server-data.html', '/docs/overlays.html', '/docs/theming.html',
  '/docs/landing-patterns.html', '/docs/components.html', '/docs/verbs-reference.html',
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

/** Every example the docs pages actually embed, read out of the pages themselves.
 * A hand-written list is a list that stops covering the example somebody added
 * last week — which is how a docs site quietly acquires broken examples. */
function embeddedExamples(): string[] {
  const dir = new URL('../docs/', import.meta.url);
  const out = new Set<string>();
  for (const f of readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const html = readFileSync(new URL(f, dir), 'utf8');
    for (const m of html.matchAll(/data-example="([^"]+)"/g)) out.add(m[1]!);
  }
  return [...out].sort();
}

test('docs: every embedded example source is fetchable and loads the runtime', async () => {
  const examples = embeddedExamples();
  assert.ok(examples.length >= 10, `expected the docs to embed a real set of examples, found ${examples.length}`);
  for (const src of examples) {
    const res = await fetch(base + src);
    assert.equal(res.status, 200, `${src} must be 200`);
    assert.ok((await res.text()).includes('/dist/leonui.js'), `${src} loads the runtime`);
  }
});

test('docs: every embedded example boots with no runtime warnings', async () => {
  // The docs promise live examples. "It renders" is not the promise — "it renders
  // the way the prose says it does" is, and a page that boots with warnings is a
  // page whose prose and whose behaviour have parted company.
  for (const src of embeddedExamples()) {
    const p = await browser.newPage(base).then(x => x.goto(src));
    const warns = await p.eval<string[]>('window.__ui.warns');
    assert.deepEqual(warns, [], `${src} booted with warnings`);
    await p.close();
  }
}, 40000);
