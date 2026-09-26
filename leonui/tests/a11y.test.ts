/* a11y.test.ts — the two accessibility contracts the shipped CSS and the popover
 * enhancer owe a reader, measured in a real browser rather than asserted by
 * reading the stylesheet.
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
 * The contrast measurement composites the real ancestor background chain, because
 * a token's ratio depends on the surface it lands on, not on the token alone.
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

interface Measured {
  id: string;
  ratio: number;
  need: number;
  pass: boolean;
  color: string;
  bg: string;
  grad: boolean;
}

/** WCAG 2.1 contrast for each id, against the element's real composited
 * background.
 *
 * Two details that are easy to get wrong, and were both wrong in the first draft
 * of the probe this came from:
 *   - `color-mix()` does not compute to `rgb()`. Chrome serialises it as
 *     `color(srgb …)`, so a regex over `rgba?\(` reads nothing at all and every
 *     translucent token measures as if it were transparent. The colour is pushed
 *     through a canvas instead, which resolves any colour the browser can parse.
 *   - a translucent background is not a background. The ancestor chain is walked
 *     and composited, stopping at the first fully opaque layer.
 *
 * `grad: true` means a background-image is in the chain, which this deliberately
 * does not try to composite — it is reported so a caller can assert the case
 * rather than have it quietly pass. */
const measure = (ids: readonly string[]): string => `(() => {
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
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    const hi = l1 > l2 ? l1 : l2, lo = l1 > l2 ? l2 : l1;
    return (hi + 0.05) / (lo + 0.05);
  };
  const effBg = (el) => {
    const layers = [];
    let grad = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') grad = true;
      const c = px(cs.backgroundColor);
      if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let b = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) b = over(layers[i], b);
    return { bg: b, grad };
  };
  return ${JSON.stringify(ids)}.map((id) => {
    const el = document.getElementById(id);
    const cs = getComputedStyle(el);
    const { bg, grad } = effBg(el);
    const fg = over(px(cs.color), bg);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    // WCAG "large text": 24px, or 18.66px when bold. Every token here is small.
    const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    const r = ratio(fg, bg);
    return {
      id,
      ratio: Math.round(r * 100) / 100,
      need,
      pass: r >= need,
      color: cs.color,
      bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(', ') + ')',
      grad,
    };
  });
})()`;

const measureAll = (page: Page, ids: readonly string[]): Promise<Measured[]> =>
  page.eval<Measured[]>(measure(ids));

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
    const rows = await measureAll(p, BADGE_IDS);
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
    const rows = await measureAll(p, MUTED_IDS);
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
  const [onLight, onDark] = await measureAll(p, ['b-brand', 'b-brand-dark']);
  assert.equal(
    onLight!.ratio, onDark!.ratio,
    `the brand badge measured ${onLight!.ratio}:1 on a light band but ${onDark!.ratio}:1 on a dark one — it is translucent again`,
  );
  assert.ok(onLight!.pass, describe([onLight!]));
  await p.close();
});

t('a11y: every text node on the landing page clears AA, in both schemes', async () => {
  // The fixture proves the tokens; this proves the page — a token used on a
  // surface nobody checked is the whole failure mode.
  //
  // Measured under `prefers-reduced-motion: reduce`, which is not a shortcut: with
  // motion allowed every `[ui:reveal]` sits at `opacity: 0` until it enters the
  // viewport, so half the page would be measured at a colour it never shows. The
  // armed state is off entirely under reduced motion, which makes the page a
  // stable thing to measure. Colour is unaffected by the media feature, and the
  // animated path is covered by motion.test.ts and landing.test.ts.
  const collect = `(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.95) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (!el.id) el.id = 'a11y-' + out.length;
      out.push(el.id);
    }
    return out;
  })()`;

  for (const scheme of ['light', 'dark'] as const) {
    const p = await browser.newPage(base);
    await p.colorScheme(scheme);
    await p.reducedMotion('reduce');
    await p.goto('/pages/landing.html');
    const ids = await p.eval<string[]>(collect);
    assert.ok(ids.length > 90, `expected the whole page, measured ${ids.length} text nodes`);
    const rows = await measureAll(p, ids);
    const bad = rows.filter(r => !r.pass);
    assert.deepEqual(bad, [], `${scheme}: ${bad.length}/${rows.length} below AA — ${describe(bad.slice(0, 6))}`);
    await p.close();
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
    await p.waitFor(`document.querySelector('.hero .ui-b-brand').classList.contains('ui-reveal-in')`);
    await p.eval(`document.querySelector('.hero .ui-b-brand').id = 'hero-badge'`);

    // guard the guard: if the hero ever loses its gradient this test stops testing
    // the case it was written for, and would keep passing
    assert.notEqual(
      await p.eval<string>(`getComputedStyle(document.querySelector('.hero')).backgroundImage`), 'none',
      'the hero no longer has a gradient — this test is no longer covering the case it exists for',
    );

    const [row] = await measureAll(p, ['hero-badge']);
    // `grad` is false *because the badge is opaque*: the ancestor walk stops at the
    // badge's own background, so the hero's gradient never enters the ratio. Flip
    // the badge back to a translucent tint and this becomes true — which is the
    // regression itself, since a translucent badge takes its contrast from
    // whatever the gradient happens to be at that point on the page.
    assert.equal(
      row!.grad, false,
      `the hero gradient is inside the badge's background chain (${row!.ratio}:1) — the badge has gone translucent again`,
    );
    assert.ok(row!.pass, describe([row!]));
    await p.close();
  }
});
