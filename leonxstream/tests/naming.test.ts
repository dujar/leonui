/* naming.test.ts — grammar-discoverability guarantees from the naming review:
 * typos are named errors (verbs, attributes, aspects), attr: works in both
 * forms, and onsuccess/onfail gate on the last call's outcome. */
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

t('naming: unknown verbs and unknown ui:* attributes are named warnings, not no-ops', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  // unknown verb: parseVerb throws a named error
  const verbErr = await p.eval<string>(`(() => { try { window.__ui.parseVerb('stpo n = 1'); return 'accepted'; } catch (e) { return e.message; } })()`);
  assert.match(verbErr, /unknown verb "stpo"/);
  // end-to-end: a typo'd verb on a real element lands in warns
  await p.eval(`(() => {
    const b = document.createElement('button');
    b.id = 'typo-verb';
    b.setAttribute('ui:fx', 'click: stpo n = 1');
    document.body.append(b);
  })()`);
  await p.eval(`import('/dist/leonxstream.js').then(m => m.attach(document.getElementById('typo-verb')))`);
  await p.eval(`document.querySelector('#typo-verb').click()`);
  assert.ok(
    (await p.eval<string[]>('window.__ui.warns')).some(w => w.includes('unknown verb "stpo"')),
    'unknown verb warned at runtime',
  );
  // unknown attribute: the runtime names it
  await p.eval(`(() => {
    const d = document.createElement('div');
    d.id = 'typo-attr';
    d.setAttribute('ui:stat', 'x: 1'); // typo of ui:state
    document.body.append(d);
  })()`);
  await p.eval(`import('/dist/leonxstream.js').then(m => m.attach(document.getElementById('typo-attr')))`);
  assert.ok(
    (await p.eval<string[]>('window.__ui.warns')).some(w => w.includes('unknown attribute "ui:stat"')),
    'unknown attribute warned',
  );
  await p.close();
});

t('naming: attr: aspect works in the variant form', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`(() => {
    const d = document.createElement('div');
    d.setAttribute('ui:state', 'href: \\'/library\\'');
    const a = document.createElement('a');
    a.setAttribute('ui:bind-attr:href', 'href');
    d.append(a); document.body.append(d);
    return d.id = 'attr-variant', d;
  })()`);
  await p.eval(`import('/dist/leonxstream.js').then(m => m.attach(document.querySelector('#attr-variant')))`);
  assert.equal(await p.eval<string>(`document.querySelector('#attr-variant a').getAttribute('href')`), '/library');
  await p.close();
});

t('naming: attr: aspect works in the list form', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`(() => {
    const d = document.createElement('div');
    d.setAttribute('ui:state', 'label: \\'Library\\'; href: \\'/library\\'');
    const a = document.createElement('a');
    a.setAttribute('ui:bind', 'attr:aria-label: label; attr:href: href');
    a.setAttribute('id', 'attr-list-link');
    d.append(a); document.body.append(d);
  })()`);
  await p.eval(`import('/dist/leonxstream.js').then(m => m.attach(document.body.lastElementChild))`);
  assert.equal(await p.eval<string>(`document.querySelector('#attr-list-link').getAttribute('aria-label')`), 'Library');
  assert.equal(await p.eval<string>(`document.querySelector('#attr-list-link').getAttribute('href')`), '/library');
  await p.close();
});

t('naming: onsuccess gates on success, onfail on failure — same list', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/pages/data.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`(() => {
    const ok = document.createElement('button');
    ok.id = 'post-ok';
    ok.setAttribute('ui:fx', 'click: call POST /api/tasks with { title: \\'gate ok\\' }; onsuccess toast \\'created\\'; onfail toast \\'rejected\\'; toast \\'after-gate\\'');
    const bad = document.createElement('button');
    bad.id = 'post-bad';
    bad.setAttribute('ui:fx', 'click: call POST /api/tasks?fail=1 with { title: \\'gate bad\\' }; onsuccess toast \\'created\\'; onfail toast \\'rejected\\'; toast \\'after-gate\\'');
    document.body.append(ok, bad);
  })()`);
  await p.eval(`import('/dist/leonxstream.js').then(m => m.attach(document.getElementById('post-ok'))).then(() => import('/dist/leonxstream.js')).then(m => m.attach(document.getElementById('post-bad')))`);
  await p.eval(`document.querySelector('#post-ok').click()`);
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'created')`);
  assert.equal(await p.eval<boolean>(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'rejected')`), false);
  assert.equal(await p.eval<boolean>(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'after-gate')`), true, 'gate open continues the list');
  await p.eval(`document.querySelector('#ui-toasts').innerHTML = ''`); // clear toasts before the failing call
  await p.eval(`document.querySelector('#post-bad').click()`);
  await p.waitFor(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'rejected')`);
  assert.equal(await p.eval<boolean>(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'created')`), false, 'no success toast on the failing call');
  assert.equal(await p.eval<boolean>(`[...document.querySelectorAll('.ui-toast')].some(x => x.textContent === 'after-gate')`), true, 'skip-self semantics: gates never abort the list');
  await fetch(base + '/api/__reset', { method: 'POST' });
  await p.close();
});
