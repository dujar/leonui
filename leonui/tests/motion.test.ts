/* motion.test.ts — `ui:reveal`, the entrance animation.
 *
 * Animation is not decoration here: the entrance reveal is the most-copied pattern
 * on a startup landing page, and it has a failure mode worse than not existing — a
 * hero that never becomes visible because a bundle 404'd. So these tests are about
 * the guarantees *around* the animation as much as the animation:
 *
 *   hidden  — only while the runtime is running, and only when motion is allowed
 *   motion  — the transition really interpolates, sampled mid-flight rather than
 *             inferred from a class name. A test that only checks for
 *             `.ui-reveal-in` passes just as happily when nothing moves.
 *   reveal  — one-shot on scroll, immediate on load, staggered on request
 *
 * The reduced-motion and no-runtime cases are the two that decide whether a real
 * reader sees the page at all, so they are tested first-class, not as footnotes.
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
const open = (): Promise<Page> => browser.newPage(base).then(p => p.goto('/tests/fixtures/motion.html'));
const opacity = (p: Page, id: string): Promise<string> => p.eval<string>(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).opacity`);
const translate = (p: Page, id: string): Promise<string> => p.eval<string>(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).translate`);
/** transition-delay in ms, parsed rather than string-matched: Chrome serialises a
 * 240ms delay as "0.24s", and a test that hardcodes one spelling is a test that
 * breaks on a browser nobody changed. The list length is whatever was declared, so
 * compare every entry rather than the list. */
const delayMs = (p: Page, id: string): Promise<number[]> =>
  p.eval<string>(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).transitionDelay`)
    .then(raw => raw.split(',').map(v => v.trim()).map(v => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000)));

/** `translate` as [x, y] in px. Chrome omits a trailing zero component, so
 * `translate: -18px 0px` computes to "-18px" — parse the axes, do not match text. */
const xy = async (p: Page, id: string): Promise<[number, number]> => {
  const raw = await translate(p, id);
  if (raw === 'none') return [0, 0];
  const parts = raw.split(/\s+/).map(v => parseFloat(v));
  return [parts[0] ?? 0, parts[1] ?? 0];
};

t('motion: a below-the-fold reveal is hidden, then interpolates in when scrolled to', async () => {
  const p = await open();

  // the hidden state is armed, because the runtime is running
  assert.equal(await p.eval<boolean>(`document.documentElement.classList.contains('ui-reveal-ready')`), true);
  assert.equal(await p.eval<number>(`window.scrollY`), 0);
  assert.equal(await opacity(p, 'm-scroll'), '0', 'below the fold, still hidden');
  assert.equal(await p.eval<boolean>(`document.getElementById('m-scroll').classList.contains('ui-reveal-in')`), false);

  // ARMING IS INSTANT, and this is the regression. With the transition declared on
  // the armed state instead of the revealed one, every reveal element animated *out*
  // on load: the offset was caught mid-flight and the page slid itself away first.
  assert.equal(await translate(p, 'm-scroll'), '0px 18px', 'armed at rest, not caught mid-flight');
  assert.equal(await p.eval(`getComputedStyle(document.getElementById('m-scroll')).transitionDuration`), '0s', 'nothing transitions while arming');

  // Scroll it in, then sample opacity *while the transition is still running*. A
  // value strictly between 0 and 1 is the whole difference between animating in
  // and popping into place, and no class-name assertion can tell those apart.
  await p.eval(`document.getElementById('m-scroll').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  const mid = await p.eval<number>(`(() => {
    const el = document.getElementById('m-scroll');
    return new Promise(r => setTimeout(() => r(parseFloat(getComputedStyle(el).opacity)), 110));
  })()`);
  assert.ok(mid > 0.02 && mid < 0.98, `expected an in-flight opacity, got ${mid}`);

  await p.waitFor(`getComputedStyle(document.getElementById('m-scroll')).opacity === '1'`);
  assert.equal(await p.eval<boolean>(`document.getElementById('m-scroll').classList.contains('ui-reveal-in')`), true);

  // and the motion is real: three properties, half a second each, in the revealed state
  const dur = await p.eval<string>(`getComputedStyle(document.getElementById('m-scroll')).transitionDuration`);
  assert.ok(dur.split(',').every(d => d.trim() === '0.5s'), `every transitioned property is 0.5s, got ${dur}`);
  const prop = await p.eval<string>(`getComputedStyle(document.getElementById('m-scroll')).transitionProperty`);
  for (const k of ['opacity', 'translate', 'scale']) assert.ok(prop.includes(k), `${k} is transitioned, got ${prop}`);

  // one-shot: scrolling back up must not replay it
  await p.eval(`window.scrollTo(0, 0)`);
  assert.equal(await opacity(p, 'm-scroll'), '1', 'revealed once, not re-armed');
  await p.close();
});

t('motion: trigger="load" animates without scrolling, and stagger delays it', async () => {
  const p = await open();
  await p.waitFor(`getComputedStyle(document.getElementById('m-load')).opacity === '1'`);
  assert.equal(await p.eval<number>(`window.scrollY`), 0, 'no scrolling was needed');

  // stagger is a delay on the same transition, expressed as the one custom property
  // the stylesheet reads — so the JS and the CSS cannot disagree about it
  assert.equal(await p.eval<string>(`document.getElementById('m-stagger').style.getPropertyValue('--ui-reveal-delay')`), '240ms');
  assert.ok((await delayMs(p, 'm-stagger')).every(v => v === 240), 'stagger=3 is three steps of 80ms');
  assert.equal(await p.eval<string>(`document.getElementById('m-load').style.getPropertyValue('--ui-reveal-delay')`), '', 'no stagger, no delay');
  assert.ok((await delayMs(p, 'm-load')).every(v => v === 0), 'and the transition agrees');

  // a below-the-fold element is not transitioning yet, so its delay is on the custom
  // property alone — which is exactly where the stylesheet will read it from
  assert.equal(await p.eval<string>(`document.getElementById('m-late').style.getPropertyValue('--ui-reveal-delay')`), '160ms');
  assert.equal(await opacity(p, 'm-late'), '0', 'still waiting below the fold');
  await p.close();
});

t('motion: from= picks the axis the element travels on', async () => {
  const p = await open();
  // before any scrolling: each one is hidden and offset on its own axis
  assert.deepEqual(await xy(p, 'm-up'), [0, 18], 'up starts below');
  assert.deepEqual(await xy(p, 'm-down'), [0, -18], 'down starts above');
  assert.deepEqual(await xy(p, 'm-left'), [-18, 0], 'left starts left');
  assert.deepEqual(await xy(p, 'm-right'), [18, 0], 'right starts right');
  assert.deepEqual(await xy(p, 'm-fade'), [0, 0], 'fade travels nowhere');
  assert.equal(await p.eval(`getComputedStyle(document.getElementById('m-zoom')).scale`), '0.94');
  assert.equal(await p.eval(`getComputedStyle(document.getElementById('m-fade')).scale`), 'none');

  // and every one records which direction it was asked for, so devtools agrees
  for (const [id, from] of [['m-up', 'up'], ['m-down', 'down'], ['m-left', 'left'], ['m-right', 'right'], ['m-fade', 'fade'], ['m-zoom', 'zoom'], ['m-scroll', 'up']]) {
    assert.equal(await p.eval<string>(`document.getElementById('${id}').getAttribute('data-reveal-from')`), from, id);
  }
  await p.close();
});

t('motion: a rejected prop falls back to the default instead of vanishing', async () => {
  const p = await open();
  await p.eval(`(() => {
    window.__ui.warns.length = 0;
    const el = document.createElement('section');
    el.id = 'm-bad';
    el.setAttribute('ui:reveal', '');
    el.setAttribute('from', 'sideways');
    el.setAttribute('stagger', '99');
    document.body.append(el);
    return import('/dist/leonui.js').then(m => m.attach(el));
  })()`);

  const warns = await p.eval<string[]>('window.__ui.warns');
  assert.ok(warns.some(w => /ui:reveal from="sideways".*allowed: fade\|up\|down\|left\|right\|zoom/.test(w)), `from, got: ${JSON.stringify(warns)}`);
  assert.ok(warns.some(w => /ui:reveal stagger="99".*integer 0\.\.8/.test(w)), 'stagger');
  // the bad values were dropped, so the enhancer ran with its defaults
  assert.equal(await p.eval<string>(`document.getElementById('m-bad').getAttribute('data-reveal-from')`), 'up');
  assert.equal(await p.eval<string>(`document.getElementById('m-bad').style.getPropertyValue('--ui-reveal-delay')`), '');
  await p.close();
});

t('motion: prefers-reduced-motion: reduce means nothing is ever hidden', async () => {
  const p = await browser.newPage(base);
  await p.reducedMotion('reduce');
  await p.goto('/tests/fixtures/motion.html');

  // The guarantee: the content is present at full opacity without any scrolling.
  // A reader who asked for less motion gets the page — not a fade, and above all
  // not a page whose below-the-fold half is invisible until they scroll.
  for (const id of ['m-load', 'm-scroll', 'm-up', 'm-zoom', 'm-late']) {
    assert.equal(await opacity(p, id), '1', `${id} must not be hidden under reduced motion`);
  }
  await p.close();
});

t('motion: a page whose runtime never loads is not left blank', async () => {
  const p = await browser.newPage(base);
  // block the bundle outright: this is the 404'd deploy, the blocked CDN, the typo
  // in the script src. The one thing that must not happen is a blank hero.
  await p.send('Network.enable');
  await p.send('Network.setBlockedURLs', { urls: ['*/dist/leonui.js'] });
  await p.send('Page.enable');
  await p.send('Page.navigate', { url: base + '/tests/fixtures/motion.html' });
  await p.waitFor(`document.readyState === 'complete'`);

  assert.equal(await p.eval<boolean>(`window.__uiReady === true`), false, 'the runtime really is absent');
  assert.equal(await p.eval<boolean>(`document.documentElement.classList.contains('ui-reveal-ready')`), false, 'nothing armed the hidden state');
  for (const id of ['m-load', 'm-scroll', 'm-up', 'm-late']) {
    assert.equal(await opacity(p, id), '1', `${id} must be visible with no runtime at all`);
  }
  await p.close();
});
