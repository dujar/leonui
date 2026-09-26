/* overlay.test.ts — the `dismiss` verb, and the invoker state `ui:popover` owes a
 * screen reader.
 *
 * `dismiss` exists because of a platform gap rather than a page bug. A popover can
 * only be closed from a `<button>`: `popovertargetaction="hide"` and
 * `command="hide-popover"` are both button-only. So a menu built from
 * `<a href="#section">` links — the most common popover there is — cannot close
 * itself, and stays open on top of the section the reader just asked for.
 *
 * The tests below are written so that the *absence* of the fix fails them:
 *   - one link in the fixture carries `dismiss` and one deliberately does not, so
 *     a popover that closed on any click would fail the second assertion;
 *   - the miss case asserts a named warning, because "dismiss did nothing" and
 *     "dismiss was never wired" are otherwise indistinguishable.
 */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import { Browser, Page } from './harness.ts';
import { parseVerb } from '../src/fx.ts';
import { checkHtml } from '../src/check.ts';

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
const open = (): Promise<Page> => browser.newPage(base).then(p => p.goto('/tests/fixtures/overlay.html'));
const isOpen = (p: Page, id: string): Promise<boolean> =>
  p.eval<boolean>(`document.getElementById(${JSON.stringify(id)}).matches(':popover-open')`);

/* ---------- static: the argument surface ---------- */

test('dismiss: parses with no arguments, and rejects any argument it is given', () => {
  assert.deepEqual(parseVerb('dismiss'), { name: 'dismiss' });
  assert.deepEqual(parseVerb('  dismiss  '), { name: 'dismiss' });
  // `dismiss '#nav-menu'` is the shape someone writes after reading `focus '#sel'`.
  // Silently ignoring the selector would close a *different* overlay than the one
  // they named — the same class of quiet wrong answer `ui:key="row.id"` was.
  assert.throws(() => parseVerb("dismiss '#nav-menu'"), /takes no arguments/);
  assert.throws(() => parseVerb('dismiss nav-menu'), /takes no arguments/);
});

test('dismiss: `ui check` reports the argument as an error, without a browser', () => {
  const src = '<div><button ui:fx="click: dismiss \'#x\'">go</button></div>';
  const found = checkHtml('t.html', src);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0]!.severity, 'error');
  assert.match(found[0]!.message, /dismiss takes no arguments/);

  // and the legal form is clean — a checker that flags its own vocabulary is worse
  // than no checker
  assert.deepEqual(checkHtml('t.html', '<div><button ui:fx="click: dismiss">go</button></div>'), []);
});

/* ---------- runtime: closing the thing you are inside ---------- */

t('dismiss: a link inside a popover closes it, and one without dismiss does not', async () => {
  const p = await open();
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'the fixture must boot clean');

  await p.eval(`document.getElementById('nav-btn').click()`);
  await p.waitFor(`document.getElementById('nav-menu').matches(':popover-open')`);

  // The control: this is the bug `dismiss` exists for. If a popover closed itself
  // on any click inside, this assertion would fail — and it is the assertion that
  // makes the next one mean something.
  await p.eval(`document.getElementById('nav-plain').click()`);
  assert.equal(await isOpen(p, 'nav-menu'), true, 'a plain link must leave the sheet open');

  await p.eval(`document.getElementById('nav-one').click()`);
  await p.waitFor(`!document.getElementById('nav-menu').matches(':popover-open')`);
  assert.equal(await isOpen(p, 'nav-menu'), false);

  // ...and the popover is still usable afterwards: hidePopover, not a detached node
  await p.eval(`document.getElementById('nav-btn').click()`);
  await p.waitFor(`document.getElementById('nav-menu').matches(':popover-open')`);
  await p.eval(`document.getElementById('nav-two').click()`);
  await p.waitFor(`!document.getElementById('nav-menu').matches(':popover-open')`);
  await p.close();
});

t('dismiss: the same verb closes a modal <dialog> from the inside', async () => {
  const p = await open();
  await p.eval(`document.getElementById('dlg-btn').click()`);
  await p.waitFor(`document.getElementById('dlg').open === true`);

  await p.eval(`document.getElementById('dlg-close').click()`);
  await p.waitFor(`document.getElementById('dlg').open === false`);
  assert.equal(await p.eval<boolean>(`document.getElementById('dlg').open`), false);
  await p.close();
});

t('dismiss: walks past a closed <dialog> instead of stopping at it', async () => {
  // The bug this pins: the walk used to `return` at the nearest `<dialog>`
  // whatever its state. An element inside a *closed* dialog that itself sits
  // inside an open popover then closed nothing and warned nothing — a silent
  // no-op, which is the one outcome `dismiss` promises never to produce.
  const p = await open();
  await p.eval(`document.getElementById('outer-btn').click()`);
  await p.waitFor(`document.getElementById('outer').matches(':popover-open')`);
  assert.equal(await p.eval<boolean>(`document.getElementById('inner-dlg').open`), false, 'the inner dialog is shut');

  // the dialog's content is not rendered, so this is the only way to reach the
  // button — but a programmatic click is the same event the verb listens for
  await p.eval(`document.getElementById('past-dlg').click()`);
  await p.waitFor(`!document.getElementById('outer').matches(':popover-open')`);
  assert.equal(await isOpen(p, 'outer'), false, 'the open popover outside the closed dialog must still close');
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'and it must not warn about a miss it did not have');
  await p.close();
});

t('dismiss: with nothing to dismiss it names the miss instead of doing nothing', async () => {
  const p = await open();
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), []);

  await p.eval(`document.getElementById('lonely').click()`);
  const warns = await p.eval<string[]>('window.__ui.warns');
  assert.equal(warns.length, 1, JSON.stringify(warns));
  // the element is named, because "dismiss did nothing" on a page with five
  // overlays is otherwise a search through all of them
  assert.match(warns[0]!, /^ui: dismiss found no open popover or <dialog> around <button>/);
  assert.equal(await p.eval<number>(`document.querySelectorAll('.ui-toast').length`), 0, 'and it must not throw');
  await p.close();
});

/* ---------- the invoker's own state ---------- */

t('a11y: ui:popover keeps its invoker\'s aria-expanded in step with the popover', async () => {
  const p = await open();
  const attr = (id: string): Promise<string | null> =>
    p.eval<string | null>(`document.getElementById(${JSON.stringify(id)}).getAttribute('aria-expanded')`);

  // The platform opens and closes the popover, but never writes the state back to
  // the button — so without this the reader is told "Open menu" while the menu is
  // open. It is set at attach, not only on the first toggle.
  assert.equal(await attr('nav-btn'), 'false', 'the initial state must be stated, not left absent');
  assert.equal(await attr('act-btn'), 'false');

  await p.eval(`document.getElementById('nav-btn').click()`);
  await p.waitFor(`document.getElementById('nav-btn').getAttribute('aria-expanded') === 'true'`);
  assert.equal(await attr('nav-btn'), 'true');

  await p.eval(`document.getElementById('nav-one').click()`);
  await p.waitFor(`document.getElementById('nav-btn').getAttribute('aria-expanded') === 'false'`);
  assert.equal(await attr('nav-btn'), 'false', 'and back down when the verb closes it');
  await p.close();
});

t('a11y: exactly the popover invokers are annotated, and nothing else is', async () => {
  const p = await open();
  // Named, not counted. A bare count would pass if the attribute landed on the
  // wrong elements — or on the right number of the wrong ones.
  const annotated = await p.eval<string[]>(`[...document.querySelectorAll('[aria-expanded]')].map(el => el.id).sort()`);
  assert.deepEqual(annotated, ['act-btn', 'nav-btn', 'outer-btn'],
    'only the elements that name a popover carry aria-expanded');

  // #scripted is opened by script: there is no button to describe, so the enhancer
  // must not invent one — and it must not throw on the way.
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), []);
  assert.equal(await p.eval<boolean>(`document.getElementById('scripted').matches(':popover-open')`), false);

  // a <dialog> button carries no aria-expanded: the dialog announces itself, and
  // `aria-expanded` on a modal opener is a convention nobody follows
  assert.equal(await p.eval<string | null>(`document.getElementById('dlg-btn').getAttribute('aria-expanded')`), null);
  await p.close();
});
