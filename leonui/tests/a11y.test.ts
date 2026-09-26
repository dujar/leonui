/* a11y.test.ts — the accessibility contracts the shipped CSS and the popover
 * enhancer owe a reader, measured against real rendered pixels rather than
 * asserted by reading the stylesheet.
 *
 * Both of these shipped broken, and both were invisible to every other test:
 *
 *   contrast — `--muted` on a tinted band was 4.25:1 and the brand badge 4.42:1.
 *     Nothing in the suite looked at a rendered colour, so the only thing that
 *     could have caught them is measuring pixels. Dark mode passed throughout,
 *     which is why "it looks fine" is not evidence.
 *
 *   invoker state — the platform opens and closes a popover but never writes the
 *     state back to the button, so a screen reader was told "Open menu" whether
 *     the menu was open or shut. (Tested in overlay.test.ts, next to the verb.)
 *
 * ## Why the backdrop is sampled, not computed
 *
 * The first version of this file walked the ancestor chain compositing
 * `background-color`. That is wrong wherever a `background-image` is involved, and
 * `pages/landing.html` has a radial gradient behind the hero: the walk reported
 * 5.12:1 for the hero lede where the rendered pixel is 4.91:1. An overestimate of
 * ~0.2 is not a rounding error — it is the difference between catching a
 * regression and shipping it, on the one part of the page a reader looks at first.
 *
 * So the text is made transparent, the page is screenshotted, and the pixel behind
 * each element's centre is read back. That measures what the reader sees, gradient
 * and image and translucency included, and it needs no model of the cascade.
 */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
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

const t = (name: string, fn: () => Promise<void>) => test(name, fn, 40000);

interface Measured {
  id: string;
  ratio: number;
  need: number;
  pass: boolean;
  color: string;
  bg: string;
}

/** Every element with its own text, plus the sRGB colour it is painted in.
 *
 * `color` goes through a canvas rather than a regex: Chrome serialises
 * `color-mix()` as `color(srgb …)`, and a regex over `rgba?\(` silently reads
 * nothing, which would make every token measure as if it were transparent. */
const COLLECT = `(() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const px = (color) => {
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.95) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (!el.id) el.id = 'a11y-' + out.length;
    const c = px(cs.color);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    out.push({
      id: el.id,
      // the *painted* colour: a translucent text colour is composited later, so
      // the alpha travels with it rather than being dropped here
      color: c,
      css: cs.color,
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      need: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
    });
  }
  return out;
})()`;

interface RawPoint { id: string; css: string; color: { r: number; g: number; b: number; a: number }; x: number; y: number; need: number }

const lin = (v: number): number => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luminance = (c: readonly number[]): number => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
const ratioOf = (a: readonly number[], b: readonly number[]): number => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Make the viewport the size of the document, so the whole page can be captured
 * in one shot with no scrolling and no `captureBeyondViewport`.
 *
 * Both of the obvious alternatives are traps, and both were tried first:
 *
 *   - `captureBeyondViewport: true` with a clip as tall as the document makes
 *     Chrome resize the visual viewport *for the capture*. `100vh` sections and
 *     the scrollbar's width both move, so every rect measured beforehand points at
 *     the wrong pixel afterwards — measured on `pages/landing.html`, a stat span
 *     moved 1851 -> 1827 and a button 306 -> 314 between measuring and shooting.
 *   - clipping *without* that flag does not reflow, but everything below the fold
 *     comes back unpainted: a whole band sampled as `rgb(250,249,246)`, the page
 *     background, which turns every button into white-on-white at 1.05:1.
 *
 * Overriding the metrics instead is a real viewport, so the content is real and
 * the layout is identical before and after the shot. `100vh` sections grow with
 * it, so the height is re-read until it settles (measured: 4735 -> 4776 -> 4776). */
async function fitViewport(p: Page): Promise<{ w: number; h: number }> {
  let box = await p.eval<{ w: number; h: number }>(
    `({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`,
  );
  for (let i = 0; i < 6; i++) {
    await p.send('Emulation.setDeviceMetricsOverride', {
      width: box.w, height: box.h, deviceScaleFactor: 1, mobile: false,
    });
    await p.eval(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const next = await p.eval<{ w: number; h: number }>(
      `({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`,
    );
    if (next.h <= box.h && next.w <= box.w) break;
    box = { w: Math.max(box.w, next.w), h: next.h };
  }
  return box;
}

const HIDE = `for (const el of document.querySelectorAll('*'))
  if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) el.style.color = 'transparent'`;
const SHOW = `for (const el of document.querySelectorAll('*')) el.style.removeProperty('color')`;

/** Contrast for every text node on the page, against the pixel actually rendered
 * behind it. The glyphs are made transparent, the page is captured, and the pixel
 * at each element's centre is read back. */
async function measurePage(p: Page): Promise<Measured[]> {
  const box = await fitViewport(p);
  // a point whose centre is outside the scroll box is clipped — the logo marquee
  // runs a full track's width past the right edge and, on the left, a clone sits at
  // x = -9944 — so it is not rendered where the coordinates say it is
  const points = (await p.eval<RawPoint[]>(COLLECT))
    .filter(pt => pt.x >= 0 && pt.y >= 0 && pt.x < box.w && pt.y < box.h);
  if (!points.length) return [];

  await p.eval(HIDE);
  const shot = await p.send('Page.captureScreenshot', { format: 'png' });
  await p.eval(`window.__shot = ${JSON.stringify('data:image/png;base64,' + shot.result!.data!)}`);
  const pixels = await p.eval<(number[] | null)[]>(`(async () => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = window.__shot; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ${JSON.stringify(points.map(pt => [pt.x, pt.y]))}.map(([x, y]) => {
      if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null;
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    });
  })()`);
  await p.eval(SHOW);

  const out: Measured[] = [];
  points.forEach((pt, i) => {
    const bg = pixels[i];
    if (!bg) return;
    // a translucent text colour composites over the sampled backdrop
    const fg = [
      pt.color.r * pt.color.a + bg[0]! * (1 - pt.color.a),
      pt.color.g * pt.color.a + bg[1]! * (1 - pt.color.a),
      pt.color.b * pt.color.a + bg[2]! * (1 - pt.color.a),
    ];
    const r = ratioOf(fg, bg);
    out.push({
      id: pt.id, ratio: Math.round(r * 100) / 100, need: pt.need, pass: r >= pt.need,
      color: pt.css, bg: `rgb(${bg.join(', ')})`,
    });
  });
  const missing = points.filter((_, i) => !pixels[i]);
  assert.equal(
    out.length, points.length,
    `no pixel for ${missing.map(m => `${m.id}@${m.x},${m.y}`).join(' ')} — box ${box.w}x${box.h}`,
  );
  return out;
}

const describe = (rows: readonly Measured[]): string =>
  rows.map(r => `${r.id}: ${r.ratio}:1 (needs ${r.need}) — ${r.color} on ${r.bg}`).join('; ');

const BADGE_IDS = ['b-plain', 'b-brand', 'b-danger', 'b-warn', 'b-success'] as const;
const MUTED_IDS = ['muted-bg', 'muted-card', 'muted-inset', 'muted-tinted'] as const;

/** the badges fixture is deliberately runtime-free — it measures the shipped CSS
 * with nothing else in play — so it must not wait for the runtime to boot. */
const openBadges = async (scheme: 'light' | 'dark'): Promise<Page> => {
  const p = await browser.newPage(base);
  await p.colorScheme(scheme);
  await p.goto('/tests/fixtures/badges.html', "document.readyState === 'complete'");
  return p;
};

t('a11y: every badge variant clears AA, in both colour schemes', async () => {
  for (const scheme of ['light', 'dark'] as const) {
    const p = await openBadges(scheme);
    const rows = (await measurePage(p)).filter(r => (BADGE_IDS as readonly string[]).includes(r.id));
    assert.equal(rows.length, BADGE_IDS.length, `measured ${rows.length} of ${BADGE_IDS.length} badges`);
    const bad = rows.filter(r => !r.pass);
    assert.deepEqual(bad, [], `${scheme} — ${describe(bad)}`);
    await p.close();
  }
});

t('a11y: muted text clears AA on every surface the shipped pages use', async () => {
  // The failure was surface-specific: `--muted` was fine on `--card` and 4.25:1 on
  // the `.band-alt` tint. So the fixture carries all four surfaces, and the tinted
  // one is the assertion that matters.
  for (const scheme of ['light', 'dark'] as const) {
    const p = await openBadges(scheme);
    const rows = (await measurePage(p)).filter(r => (MUTED_IDS as readonly string[]).includes(r.id));
    assert.equal(rows.length, MUTED_IDS.length, `measured ${rows.length} of ${MUTED_IDS.length} surfaces`);
    const bad = rows.filter(r => !r.pass);
    assert.deepEqual(bad, [], `${scheme} — ${describe(bad)}`);
    await p.close();
  }
});

t('a11y: a badge is opaque, so its ratio does not depend on what is behind it', async () => {
  // The shipped badge mixed the accent into a *translucent* background, so the
  // same badge measured 4.42:1 on a card and 3.71:1 over the hero's gradient. A
  // ratio that changes with the page cannot be verified, so this pins the
  // invariant rather than the two numbers: same badge, light band and dark band.
  const p = await openBadges('light');
  const rows = (await measurePage(p)).filter(r => r.id === 'b-brand' || r.id === 'b-brand-dark');
  assert.equal(rows.length, 2);
  const [onLight, onDark] = rows;
  assert.equal(
    onLight!.ratio, onDark!.ratio,
    `the brand badge measured ${onLight!.ratio}:1 on a light band but ${onDark!.ratio}:1 on a dark one — it is translucent again`,
  );
  assert.ok(onLight!.pass, describe([onLight!]));
  await p.close();
});

/** every page the package ships that is styled by `ui.css`, plus the docs shell */
function shippedPages(): string[] {
  const out: string[] = [];
  for (const dir of ['pages', 'docs']) {
    for (const f of readdirSync(join(import.meta.dir, '..', dir)).sort()) {
      if (f.endsWith('.html')) out.push(`/${dir}/${f}`);
    }
  }
  return out;
}

t('a11y: every text node on every shipped page clears AA, in both schemes', async () => {
  // Measured under `prefers-reduced-motion: reduce`, which is not a shortcut: with
  // motion allowed every `[ui:reveal]` sits at `opacity: 0` until it enters the
  // viewport, so half a page would be sampled at a colour it never shows. The
  // armed state is off entirely under reduced motion, which makes the page a
  // stable thing to measure. Colour is unaffected by the media feature, and the
  // animated path is covered by the hero case below and by motion.test.ts.
  const pages = shippedPages();
  assert.ok(pages.length > 15, `expected the whole shipped set, found ${pages.length} pages`);

  for (const scheme of ['light', 'dark'] as const) {
    const failures: string[] = [];
    for (const path of pages) {
      const p = await browser.newPage(base);
      await p.colorScheme(scheme);
      await p.reducedMotion('reduce');
      // not every shipped page loads the runtime — the docs shell does not — so wait
      // for it only where the page actually asks for it, rather than assuming
      await p.goto(path, `document.readyState === 'complete' && (
        window.__uiReady === true || !document.querySelector('script[src*="leonui"]')
      )`);
      const rows = await measurePage(p);
      if (!rows.length) failures.push(`${path}: measured nothing — the page did not render`);
      const bad = rows.filter(r => !r.pass);
      if (bad.length) failures.push(`${path}: ${bad.length}/${rows.length} below AA — ${describe(bad.slice(0, 5))}`);
      await p.close();
    }
    assert.deepEqual(failures, [], `${scheme}:\n  ${failures.join('\n  ')}`);
  }
});

t('a11y: the hero badge clears AA over the gradient, with motion on', async () => {
  // The specific regression, in the path where it happened: the badge is revealed
  // on load, and the hero's brand-tinted radial gradient is behind it. That is the
  // combination that measured 3.71:1 — a translucent badge inheriting its contrast
  // from a gradient the author never thought of as "the background".
  for (const scheme of ['light', 'dark'] as const) {
    const p = await browser.newPage(base);
    await p.colorScheme(scheme);
    await p.goto('/pages/landing.html');
    // the reveal's opacity is a 0.5s transition, and `ui-reveal-in` lands at its
    // start — measuring there samples a half-faded element, which the collector's
    // `opacity < 0.95` guard then drops, and the test would report "measured 0"
    await p.waitFor(`parseFloat(getComputedStyle(document.querySelector('.hero .ui-b-brand')).opacity) === 1`);
    await p.eval(`document.querySelector('.hero .ui-b-brand').id = 'hero-badge'`);

    // guard the guard: if the hero ever loses its gradient this test stops covering
    // the case it was written for, and would keep passing
    assert.notEqual(
      await p.eval<string>(`getComputedStyle(document.querySelector('.hero')).backgroundImage`), 'none',
      'the hero no longer has a gradient — this test is no longer covering the case it exists for',
    );

    const rows = (await measurePage(p)).filter(r => r.id === 'hero-badge');
    assert.equal(rows.length, 1);
    assert.ok(rows[0]!.pass, describe(rows));
    await p.close();
  }
});
