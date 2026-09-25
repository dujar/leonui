/* sortable.test.ts — the ui:sortable drag primitive: HTML5 drag events reorder
 * the DOM live, drop commits the new order to the DATA (immutable replacement),
 * and index-independent binds stay correct. */
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

t('sortable: drag row 3 to the top — DOM and data reorder together', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/docs/examples/sortable.html', "document.readyState === 'complete' && window.__uiReady === true"));
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no attach warnings');

  const titles = () => p.eval<string[]>(`[...document.querySelectorAll('#queue .ui-list-title')].map(n => n.textContent)`);
  assert.deepEqual(await titles(), ['write the spec', 'review the PR', 'ship it']);

  // rows are draggable with sort keys
  assert.equal(await p.eval<boolean>(`document.querySelectorAll('#queue [data-sort-key]').length === 3`), true);
  assert.equal(await p.eval<string>(`document.querySelector('#queue [data-sort-key]').getAttribute('draggable')`), 'true');

  // drive the real event sequence: drag row 3 ('ship it') above row 1
  const drag = `(drag) => {
    const rows = [...document.querySelectorAll('#queue [data-sort-key]')];
    const src = rows[2], dst = rows[0];
    const dTarget = (el, type, extra = {}) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientY: extra.clientY ?? 0 }));
    dTarget(src, 'dragstart');
    dTarget(dst, 'dragover', { clientY: dst.getBoundingClientRect().top + 2 });
    dTarget(src, 'drop');
    dTarget(src, 'dragend');
  }`;
  await p.eval(`(${drag})()`);

  // DOM order + data order + first() bind all moved together
  await p.waitFor(`document.querySelectorAll('#queue .ui-list-title')[0].textContent === 'ship it'`);
  assert.deepEqual(await titles(), ['ship it', 'write the spec', 'review the PR']);
  assert.deepEqual(
    await p.eval<string[]>(`window.__ui.readPath('queue', document.body).map(x => x.t)`),
    ['ship it', 'write the spec', 'review the PR'],
    'state array rewritten immutably',
  );
  assert.equal(await p.eval<string>(`document.querySelector('b').textContent`), 'ship it', 'first(queue) bind updated');
  assert.equal(await p.eval<number>(`document.querySelectorAll('.ui-dragging').length`), 0, 'dragging class cleared');

  // and it still works after a data change (keys stay stable)
  await p.eval(`window.__ui.setPath('queue', [...window.__ui.readPath('queue', document.body), { id: 4, t: 'new last' }], document.body)`);
  await p.waitFor(`document.querySelectorAll('#queue .ui-list-title').length === 4`);
  assert.deepEqual(await titles(), ['ship it', 'write the spec', 'review the PR', 'new last']);
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'no runtime warnings');
  await p.close();
});

t('sortable: drag middle row down', async () => {
  const p = await browser.newPage(base).then(x => x.goto('/docs/examples/sortable.html', "document.readyState === 'complete' && window.__uiReady === true"));
  const dragTo = `(i, j) => {
    const rows = [...document.querySelectorAll('#queue [data-sort-key]')];
    const src = rows[i], dst = rows[j];
    const fire = (el, type, clientY) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientY }));
    fire(src, 'dragstart');
    const b = dst.getBoundingClientRect();
    fire(dst, 'dragover', b.top + b.height * 0.75); // below dst midpoint -> goes after
    fire(src, 'drop');
    fire(src, 'dragend');
  }`;
  // drag row 1 ('write the spec') below row 2 -> after 'review the PR'
  await p.eval(`(${dragTo})(0, 1)`);
  await p.waitFor(`document.querySelectorAll('#queue .ui-list-title')[1].textContent === 'write the spec'`);
  assert.deepEqual(
    await p.eval<string[]>(`window.__ui.readPath('queue', document.body).map(x => x.t)`),
    ['review the PR', 'write the spec', 'ship it'],
  );
  await p.close();
});
