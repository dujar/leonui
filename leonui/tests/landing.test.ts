/* landing.test.ts — the startup landing page, verified as a page rather than as
 * markup.
 *
 * `ui check` proves the vocabulary is legal. It cannot prove that the pricing
 * toggle moves both prices, that the mobile menu opens, or that the reveal
 * animation did not swallow a section. Those are the things a landing page is
 * *for*, so they are tested here — and the two guarantees that matter most (a
 * reader who asked for less motion, and a reader whose bundle never arrived) are
 * tested as first-class cases, not as an afterthought.
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
}, 20000);
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

const t = (name: string, fn: () => Promise<void>) => test(name, fn, 30000);
const open = (): Promise<Page> => browser.newPage(base).then(p => p.goto('/pages/landing.html'));
const text = (p: Page, sel: string): Promise<string> => p.eval<string>(`document.querySelector(${JSON.stringify(sel)}).textContent.trim()`);

t('landing: the page boots with no warnings and every section is present', async () => {
  const p = await open();
  assert.deepEqual(await p.eval<string[]>('window.__ui.warns'), [], 'a shipped page must be warning-free');

  // every band rendered, so nothing was silently dropped by a bad attribute
  for (const sel of ['#top', '#features', '#pricing', '#faq', '#start', '.stats', '.tiers', '.faq', '.site-foot']) {
    assert.equal(await p.eval<boolean>(`document.querySelector(${JSON.stringify(sel)}) !== null`), true, sel);
  }
  assert.equal(await p.eval<number>(`document.querySelectorAll('.tier').length`), 3);
  assert.equal(await p.eval<number>(`document.querySelectorAll('.faq details').length`), 5);
  assert.equal(await p.eval<number>(`document.querySelectorAll('.feature').length`), 6);
  await p.close();
});

t('landing: the hero animates on load, and nothing below the fold is revealed yet', async () => {
  const p = await open();
  // the load-triggered reveals ran without any scrolling
  await p.waitFor(`document.querySelector('.hero .ui-badge').classList.contains('ui-reveal-in')`);
  assert.equal(await p.eval<number>(`window.scrollY`), 0);
  assert.equal(await p.eval<boolean>(`document.querySelector('.shot').classList.contains('ui-reveal-in')`), true);

  // ...and the scroll-triggered ones have not, because they are not on screen
  assert.equal(await p.eval<boolean>(`document.querySelector('#pricing .tier').classList.contains('ui-reveal-in')`), false);
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('#pricing .tier')).opacity`), '0', 'below the fold, still armed');

  // the staggered hero is genuinely staggered, not all at once
  const delays = await p.eval<number[]>(`[...document.querySelectorAll('.hero [ui\\\\:reveal]')].map(el => parseFloat(getComputedStyle(el).transitionDelay) * 1000)`);
  assert.deepEqual([...new Set(delays)].sort((a, b) => a - b), [0, 80, 160, 240, 320, 400], 'six steps of 80ms');
  await p.close();
});

t('landing: the stats bars animate when the band scrolls in', async () => {
  const p = await open();
  const bar = `document.querySelector('.stats .stat-bar i')`;
  assert.equal(await p.eval(`getComputedStyle(${bar}).transform`), 'matrix(0, 0, 0, 1, 0, 0)', 'scaled to nothing while hidden');

  await p.eval(`document.querySelector('.stats').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await p.waitFor(`getComputedStyle(${bar}).transform === 'matrix(1, 0, 0, 1, 0, 0)'`, 3000);
  // the widths differ per stat, so the bars are data and not decoration
  const widths = await p.eval<string[]>(`[...document.querySelectorAll('.stats .stat-bar i')].map(i => i.style.getPropertyValue('--w'))`);
  assert.deepEqual(widths, ['84%', '62%', '71%', '96%']);
  await p.close();
});

t('landing: the billing toggle moves every price, in both directions', async () => {
  const p = await open();
  const prices = (): Promise<string[]> => p.eval<string[]>(`[...document.querySelectorAll('.tier-price')].map(e => e.textContent.replace(/\\s+/g, ''))`);

  assert.deepEqual(await prices(), ['£0/month', '£29/month', '£79/month'], 'monthly by default');
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('.billing .ui-badge')).display`), 'none', 'the annual badge is hidden');

  // the checkbox drives the signal through ui:bind-checked + a toggle verb, which
  // is the documented pattern — ui:model would write the string "on" into it
  await p.eval(`{ const c = document.querySelector('.billing input'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }`);
  await p.waitFor(`document.querySelector('.tier-price:nth-of-type(1)') !== null && document.body.textContent.includes('£24')`);
  assert.deepEqual(await prices(), ['£0/month', '£24/month', '£64/month'], 'annual prices, computed from the one signal');
  assert.notEqual(await p.eval(`getComputedStyle(document.querySelector('.billing .ui-badge')).display`), 'none', 'the annual badge appears');

  await p.eval(`{ const c = document.querySelector('.billing input'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }`);
  await p.waitFor(`document.body.textContent.includes('£29')`);
  assert.deepEqual(await prices(), ['£0/month', '£29/month', '£79/month'], 'and back');
  await p.close();
});

t('landing: the mobile menu is a native popover opened by its invoker', async () => {
  const p = await open();
  const openState = (): Promise<boolean> => p.eval<boolean>(`document.getElementById('nav-menu').matches(':popover-open')`);

  assert.equal(await openState(), false, 'closed to start with');
  // the invoker button carries popovertarget, so this is the platform's own
  // mechanism — ui:popover styles and positions it, it does not implement it
  assert.equal(await p.eval<string>(`document.querySelector('.nav-burger').getAttribute('popovertarget')`), 'nav-menu');
  await p.eval(`document.querySelector('.nav-burger').click()`);
  await p.waitFor(`document.getElementById('nav-menu').matches(':popover-open')`);
  assert.equal(await p.eval<number>(`document.querySelectorAll('#nav-menu a').length`), 4, 'four destinations in the sheet');
  await p.close();
});

t('landing: the FAQ opens, and the final form toasts then clears itself', async () => {
  const p = await open();

  await p.eval(`document.querySelector('.faq details summary').click()`);
  await p.waitFor(`document.querySelector('.faq details').open === true`);
  assert.match(await text(p, '.faq details .ui-acc-body'), /Nothing to sign up for/);

  // submit: the runtime preventDefaults, so the page must not navigate
  await p.eval(`{ const i = document.querySelector('#start input'); i.value = 'mara@studio.com'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await p.eval(`document.querySelector('#start form').requestSubmit()`);
  await p.waitFor(`document.querySelectorAll('.ui-toast').length > 0`);
  assert.equal(await text(p, '.ui-toast'), 'Thanks — a setup link is on its way to mara@studio.com');
  assert.equal(await p.eval<string>(`document.querySelector('#start input').value`), '', 'the field was cleared by the same verb list');
  assert.equal(await p.eval<string>(`location.pathname`), '/pages/landing.html', 'submit did not navigate');
  await p.close();
});

t('landing: prefers-reduced-motion: reduce leaves every section visible', async () => {
  const p = await browser.newPage(base);
  await p.reducedMotion('reduce');
  await p.goto('/pages/landing.html');

  // the whole page, at full opacity, without a single scroll
  const hidden = await p.eval<string[]>(`[...document.querySelectorAll('[ui\\\\:reveal]')]
    .filter(el => parseFloat(getComputedStyle(el).opacity) < 1)
    .map(el => el.tagName + '.' + el.className)`);
  assert.deepEqual(hidden, [], 'nothing may be hidden under reduced motion');
  // and the animated bars are at full width rather than armed to nothing — an
  // unconditional `transform: scaleX(0)` would have cost this reader the bars
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('.stats .stat-bar i')).transform`), 'none');
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('.shot-bars i')).transform`), 'none');
  await p.close();
});

t('landing: with the runtime blocked, the whole page still renders', async () => {
  const p = await browser.newPage(base);
  await p.send('Network.enable');
  await p.send('Network.setBlockedURLs', { urls: ['*/dist/leonui.js'] });
  await p.send('Page.enable');
  await p.send('Page.navigate', { url: base + '/pages/landing.html' });
  await p.waitFor(`document.readyState === 'complete'`);

  assert.equal(await p.eval<boolean>(`window.__uiReady === true`), false, 'the runtime really is absent');
  const hidden = await p.eval<string[]>(`[...document.querySelectorAll('[ui\\\\:reveal]')]
    .filter(el => parseFloat(getComputedStyle(el).opacity) < 1)
    .map(el => el.tagName + '.' + el.className)`);
  assert.deepEqual(hidden, [], 'a landing page whose bundle 404s must still be readable');
  // the armed states are scoped to a class only the runtime sets, so they never applied
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('.stats .stat-bar i')).transform`), 'none');
  await p.close();
});
