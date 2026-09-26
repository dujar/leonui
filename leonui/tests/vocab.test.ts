/* vocab.test.ts — the value vocabulary is declared once and enforced twice.
 *
 * The defect this pins: the prose said "closed set", the runtime concatenated
 * whatever string it was handed, and a wrong value produced a class nothing
 * styles (`ui-btn-primry`) or `var(--ui-gap-99)` — with no warning at all. The
 * two halves are tested separately because they fail differently:
 *
 *   pure    — the table itself: which values are legal, which props get dropped
 *   runtime — the wiring: a bad value warns and falls back to the default, a bad
 *             host warns and does not run at all
 *
 * The runtime half is the one that proves the fix; the pure half is what makes
 * it cheap to extend without a browser.
 */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import { Browser, Page } from './harness.ts';
import {
  ENHANCER_NAMES, ENHANCER_SPECS, attrRejects, enhancerAttrProblems, enhancerProblems, enhancerRejects,
  rejectedProps, requirementProblems, suggest, ICON_NAMES, VERB_NAMES, VERBS, GATES, ASPECTS, remoteDecl,
} from '../src/vocab.ts';
import { ENHANCERS } from '../src/enhancers.ts';
import { VERB_HANDLERS } from '../src/fx.ts';

/* ================= pure: the table ================= */

test('vocab: every enhancer declares at least one prop, flag, host or requirement', () => {
  // an enhancer with an empty spec is one nobody validated — a silent gap
  const bare = ENHANCER_NAMES.filter(n => {
    const s = ENHANCER_SPECS[n]!;
    return !s.props && !s.flags && !s.hosts && !s.requiresAttr;
  });
  // ui:divider / ui:field / ui:tabs are genuinely value-free (pure class adders)
  assert.deepEqual(bare.sort(), ['ui:divider', 'ui:field', 'ui:tabs']);
});

test('vocab: the icon names in the table are the icon names in the sprite', () => {
  const spec = ENHANCER_SPECS['ui:icon']!.props!.name!;
  assert.deepEqual([...spec.values!], [...ICON_NAMES]);
});

test('vocab: value sets reject with a named warning that lists the legal set', () => {
  const get = (p: string) => (p === 'variant' ? 'primry' : null);
  const msgs = enhancerProblems('ui:button', get, { host: 'button' });
  assert.equal(msgs.length, 1);
  assert.match(msgs[0]!, /ui:button variant="primry"/);
  assert.match(msgs[0]!, /allowed: primary\|ghost\|danger\|icon/);
  assert.match(msgs[0]!, /using the default/);
});

test('vocab: ranges and patterns are enforced, and a legal value is silent', () => {
  assert.equal(enhancerProblems('ui:stack', p => (p === 'gap' ? '4' : null)).length, 0);
  assert.match(enhancerProblems('ui:stack', p => (p === 'gap' ? '99' : null))[0]!, /integer 1\.\.8/);
  assert.match(enhancerProblems('ui:stack', p => (p === 'gap' ? '2.5' : null))[0]!, /integer 1\.\.8/);
  assert.equal(enhancerProblems('ui:image', p => (p === 'ratio' ? '3/2' : null)).length, 0);
  assert.equal(enhancerProblems('ui:image', p => (p === 'ratio' ? '1.5' : null)).length, 0);
  assert.match(enhancerProblems('ui:image', p => (p === 'ratio' ? 'wide' : null))[0]!, /aspect-ratio/);
});

test('vocab: a wrong host or a missing required attribute rejects the whole enhancer', () => {
  assert.equal(enhancerRejects('ui:modal', { host: 'dialog' }), null);
  assert.match(enhancerRejects('ui:modal', { host: 'div' })!, /requires <dialog>, found <div>/);
  assert.match(enhancerRejects('ui:icon', { host: 'input' })!, /requires <svg>/);
  // ui:popover needs the native popover attribute to do anything
  assert.match(enhancerRejects('ui:popover', { has: () => false })!, /needs the native "popover"/);
  assert.equal(enhancerRejects('ui:popover', { has: a => a === 'popover' }), null);
  // an enhancer with no declared host accepts anything (rule 4: only collisions
  // need a host restriction)
  assert.equal(enhancerRejects('ui:card', { host: 'section' }), null);
  assert.equal(enhancerRejects('ui:nope', { host: 'div' }), null);
});

test('vocab: rejectedProps names exactly the props to drop', () => {
  const get = (p: string) => ({ gap: '99', align: 'center', variant: 'nonsense' }[p] ?? null);
  assert.deepEqual(rejectedProps('ui:stack', get), ['gap'], 'align is legal, gap is not');
  assert.deepEqual(rejectedProps('ui:card', get), ['variant']);
  assert.deepEqual(rejectedProps('ui:divider', get), [], 'value-free enhancer drops nothing');
});

test('vocab: suggest finds a near-miss and stays quiet on a stranger', () => {
  assert.equal(suggest('ui:stak', ['ui:stack', 'ui:card']), 'ui:stack');
  assert.equal(suggest('ui:bind-txet', ['ui:state', 'ui:each']), null);
});

test('vocab: a misspelled prop is named, a stranger attribute is left alone', () => {
  // `variant="primry"` was caught; `varient="primary"` was silent, because the
  // enhancer never saw a prop it recognised
  assert.match(enhancerAttrProblems('ui:button', ['ui:button', 'varient'])[0]!, /has no prop "varient" — did you mean "variant"\?/);
  assert.match(enhancerAttrProblems('ui:stack', ['gap', 'aling'])[0]!, /did you mean "align"\?/);
  // declared props, flags and HTML attributes are never typos
  assert.deepEqual(enhancerAttrProblems('ui:button', ['variant', 'block', 'id', 'class', 'title', 'aria-label', 'data-x', 'disabled']), []);
  assert.deepEqual(enhancerAttrProblems('ui:card', ['role', 'style', 'hidden', 'command']), []);
  // a name that is not close to anything is somebody else's attribute
  assert.deepEqual(enhancerAttrProblems('ui:badge', ['tracking-id']), []);
  // an enhancer with no declared props cannot produce this finding at all
  assert.deepEqual(enhancerAttrProblems('ui:divider', ['whatever']), []);
});

test('vocab: the HTML-attribute guard is load-bearing, not decoration', () => {
  // These are the collisions that make it necessary: native attributes that sit
  // within edit distance 2 of a declared prop, so a naive closeness check would
  // report them. Verified by enumerating every HTML_GLOBALS entry against every
  // declared prop — `max`/`wrap` are the only two, and both hit `gap`.
  assert.equal(suggest('max', ['gap']), 'gap', 'the collision is real');
  assert.equal(suggest('wrap', ['gap']), 'gap');
  assert.deepEqual(enhancerAttrProblems('ui:stack', ['gap', 'max']), [], 'a native max is not a misspelled gap');
  assert.deepEqual(enhancerAttrProblems('ui:stack', ['gap', 'wrap']), [], 'a native wrap is not a misspelled gap');
  assert.deepEqual(enhancerAttrProblems('ui:row', ['gap', 'wrap']), [], 'wrap is a declared flag here');
  // ...while a genuine typo of the same prop is still caught
  assert.match(enhancerAttrProblems('ui:stack', ['gap', 'gapp'])[0]!, /did you mean "gap"\?/);
});

test('vocab: a companion attribute without its partner is named, not inert', () => {
  // Each of these is read in exactly one place — each.ts, fx.ts — and only when the
  // partner is already present, so the pass that would have noticed is exactly the
  // pass that never ran. `ui:sortable` on a plain <ul> looked like a working list.
  assert.match(requirementProblems('ui:sortable', { has: () => false })[0]!, /ui:sortable needs "ui:each" on the same element/);
  assert.match(requirementProblems('ui:key', { has: () => false })[0]!, /ui:key needs "ui:each"/);
  assert.match(requirementProblems('ui:transition', { has: () => false })[0]!, /ui:transition needs "ui:fx"/);
  assert.match(requirementProblems('ui:sortable', { has: () => false })[0]!, /\(no effect\)$/);
  // satisfied is silent
  assert.deepEqual(requirementProblems('ui:sortable', { has: a => a === 'ui:each' }), []);
  assert.deepEqual(requirementProblems('ui:transition', { has: () => true }), []);
  // enhancers carry their own requirements; this table is the core half
  assert.deepEqual(requirementProblems('ui:stack', { has: () => false }), []);
  // no `has` means no evidence — a caller that cannot answer must not be warned at
  assert.deepEqual(requirementProblems('ui:sortable', {}), []);
});

test('vocab: ui:model needs a form control, and a custom element is not second-guessed', () => {
  for (const host of ['input', 'textarea', 'select']) {
    assert.deepEqual(requirementProblems('ui:model', { host }), [], `${host} is a control`);
  }
  assert.match(
    requirementProblems('ui:model', { host: 'div' })[0]!,
    /ui:model requires <input> or <textarea> or <select>, found <div> — not applied/,
  );
  // A hyphenated tag is a custom element by specification. What its `.value` means
  // is its author's business, so the runtime refuses only what it can be sure of.
  assert.deepEqual(requirementProblems('ui:model', { host: 'my-slider' }), []);
});

test('vocab: attrRejects is the union of both requirement tables', () => {
  // the enhancer half, reached through the same door
  assert.match(attrRejects('ui:modal', { host: 'div' })!, /requires <dialog>, found <div>/);
  // the core half
  assert.match(attrRejects('ui:model', { host: 'div' })!, /requires <input>/);
  assert.match(attrRejects('ui:sortable', { has: () => false })!, /needs "ui:each"/);
  // and silence when nothing is wrong — including for an attribute with no
  // requirements at all, which is most of them
  assert.equal(attrRejects('ui:card', { host: 'section' }), null);
  assert.equal(attrRejects('ui:model', { host: 'input' }), null);
  assert.equal(attrRejects('ui:divider', { host: 'div', has: () => false }), null);
});

test('vocab: every declared enhancer is implemented, and every implementation declared', () => {
  // A spec with no implementation is precisely the silent no-op this table exists
  // to prevent: `ui check` accepts the name, the skill documents it, and the page
  // does nothing at all. This is the test that goes red the moment a spec is added
  // ahead of its enhancer — which is how `ui:reveal` was caught.
  const undeclared = Object.keys(ENHANCERS).filter(n => !Object.hasOwn(ENHANCER_SPECS, n));
  const unimplemented = ENHANCER_NAMES.filter(n => !Object.hasOwn(ENHANCERS, n));
  assert.deepEqual(unimplemented, [], `declared in vocab.ts but not implemented in enhancers.ts: ${unimplemented.join(', ')}`);
  assert.deepEqual(undeclared, [], `implemented in enhancers.ts but not declared in vocab.ts: ${undeclared.join(', ')}`);
});

test('vocab: the verb table is the runtime catalog', () => {
  // Composed, not counted. A hardcoded length here is a second place the catalog
  // lives, and it went stale the moment `dismiss` was added — which is a nuisance
  // in a test and a silent no-op in the runtime. The contract is the composition.
  assert.deepEqual([...VERB_NAMES], [...VERBS, ...GATES]);
  assert.ok(VERBS.length > 0 && GATES.length > 0);
  assert.deepEqual([...VERB_NAMES].slice(0, 3), ['set', 'toggle', 'call']);
  assert.deepEqual([...ASPECTS], ['text', 'class', 'hidden', 'disabled', 'checked', 'open']);
});

test('vocab: every catalog verb has a handler, and every handler is a catalog verb', () => {
  // The pin the enhancer tables have had all along and the verbs did not. `fx.ts`
  // used to dispatch through an if-chain, which cannot be introspected — so
  // declaring a verb in `vocab.ts` and forgetting to implement it produced markup
  // that parsed, passed `ui check`, appeared in the generated skill table, and did
  // nothing when the event fired. Both directions are checked: a handler for a
  // name that is not in the catalog means the catalog is lying about its size.
  const handled = Object.keys(VERB_HANDLERS);
  const unimplemented = VERB_NAMES.filter(n => !handled.includes(n));
  assert.deepEqual(unimplemented, [],
    `declared in vocab.ts with no implementation in VERB_HANDLERS: ${unimplemented.join(', ')}`);
  const undeclared = handled.filter(n => !VERB_NAMES.includes(n));
  assert.deepEqual(undeclared, [],
    `implemented in VERB_HANDLERS but absent from the catalog: ${undeclared.join(', ')}`);
});

test('vocab: a bare GET is a mistake, not a literal string', () => {
  // `/^GET\s/` missed the bare form, so `n: GET` stored the string "GET" — in the
  // runtime and in the checker, which shared the regex
  assert.deepEqual(remoteDecl('GET /api/rows'), { url: '/api/rows', bare: false });
  assert.deepEqual(remoteDecl('get /api/rows'), { url: '/api/rows', bare: false }, 'case-insensitive, like the runtime');
  assert.deepEqual(remoteDecl('GET'), { url: '', bare: true });
  assert.deepEqual(remoteDecl('GET   '), { url: '', bare: true });
  assert.equal(remoteDecl('GETTING there'), null, 'a word that merely starts with GET is a literal');
  assert.equal(remoteDecl('0'), null);
  assert.equal(remoteDecl("'GET'"), null, 'a quoted GET is a literal on purpose');
});

/* ================= runtime: the wiring ================= */

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

/** Build one element per case, attach each, and hand back the warnings. */
async function probe(): Promise<{ warns: string[]; p: Page }> {
  const p = await browser.newPage(base)
    .then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`(() => {
    const cases = [
      ['div',    'e-gap',    { 'ui:stack': '', gap: '99' }],
      ['div',    'e-align',  { 'ui:stack': '', align: 'middle' }],
      ['button', 'e-var',    { 'ui:button': '', variant: 'primry' }],
      ['img',    'e-ratio',  { 'ui:image': '', ratio: 'wide' }],
      ['div',    'e-modal',  { 'ui:modal': '' }],
      ['div',    'e-icon',   { 'ui:icon': '', name: 'check' }],
      ['svg',    'e-badname',{ 'ui:icon': '', name: 'nope' }],
      ['svg',    'e-ok-icon',{ 'ui:icon': '', name: 'check' }],
      ['div',    'e-badge',  { 'ui:badge': '', variant: 'success' }],
      ['div',    'e-ok-stack',{ 'ui:stack': '', gap: '3', align: 'center' }],
      ['div',    'e-typo',   { 'ui:button': '', varient: 'primary' }],
      ['div',    'e-sortable',{ 'ui:sortable': '' }],
      ['div',    'e-keyonly', { 'ui:key': 'id' }],
      ['div',    'e-transonly',{ 'ui:transition': '' }],
    ];
    for (const [tag, id, attrs] of cases) {
      const el = document.createElement(tag);
      el.id = id;
      for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
      document.body.append(el);
    }
    // the model cases need a signal to resolve against, so they live inside a scope
    const scope = document.createElement('div');
    scope.id = 'e-scope';
    scope.setAttribute('ui:state', 'mv: 1');
    document.body.append(scope);
    for (const [tag, id] of [['div', 'e-model-div'], ['input', 'e-model-ok'], ['my-slider', 'e-model-ce']]) {
      const el = document.createElement(tag);
      el.id = id;
      el.setAttribute('ui:model', 'mv');
      scope.append(el);
    }
    window.__ui.warns.length = 0;
  })()`);
  await p.eval(`import('/dist/leonui.js').then(m => {
    for (const id of ['e-gap','e-align','e-var','e-ratio','e-modal','e-icon','e-badname','e-ok-icon','e-badge','e-ok-stack','e-typo','e-sortable','e-keyonly','e-transonly']) {
      m.attach(document.getElementById(id));
    }
    m.attach(document.getElementById('e-scope'));
  })`);
  return { warns: await p.eval<string[]>('window.__ui.warns'), p };
}

t('vocab runtime: a value outside the set warns by name and falls back to the default', async () => {
  const { warns, p } = await probe();

  const find = (re: RegExp): string | undefined => warns.find(w => re.test(w));
  assert.ok(find(/ui:stack gap="99".*integer 1\.\.8/), `gap warning, got: ${JSON.stringify(warns)}`);
  assert.ok(find(/ui:stack align="middle".*allowed: start\|center\|end\|between/), 'align warning');
  assert.ok(find(/ui:button variant="primry".*allowed: primary\|ghost\|danger\|icon/), 'variant warning');
  assert.ok(find(/ui:image ratio="wide".*aspect-ratio/), 'ratio warning');

  // the rejected value is dropped, so the enhancer emits only classes that exist
  assert.equal(await p.eval<string[]>(`[...document.getElementById('e-var').classList].join(' ')`), 'ui-btn');
  assert.equal(await p.eval(`document.getElementById('e-gap').style.getPropertyValue('--ui-gap')`), '', 'no var(--ui-gap-99)');
  assert.equal(await p.eval(`document.getElementById('e-gap').hasAttribute('gap')`), false, 'the bad prop is gone');
  // a legal value still works, unchanged
  assert.equal(await p.eval(`document.getElementById('e-ok-stack').style.getPropertyValue('--ui-gap')`), 'var(--ui-gap-3)');
  assert.equal(await p.eval(`document.getElementById('e-badge').className`), 'ui-badge ui-b-success');
  await p.close();
});

t('vocab runtime: a wrong host is named and the enhancer does not run at all', async () => {
  const { warns, p } = await probe();

  assert.ok(warns.some(w => /ui:modal requires <dialog>, found <div>/.test(w)), `modal host warning, got: ${JSON.stringify(warns)}`);
  assert.ok(warns.some(w => /ui:icon requires <svg>, found <div>/.test(w)), 'icon host warning');
  assert.match(warns.find(w => /ui:icon requires/.test(w))!, /not applied/);

  // no half-applied class on the wrong host — the point of skipping rather than warning-only
  assert.equal(await p.eval(`document.getElementById('e-modal').className`), '', 'no ui-dialog on a div');
  assert.equal(await p.eval(`document.getElementById('e-icon').className`), '', 'no ui-icon on a div');
  await p.close();
});

t('vocab runtime: on the right host, an unknown icon name warns and leaves the element bare', async () => {
  const { warns, p } = await probe();

  assert.ok(warns.some(w => /ui:icon name="nope".*allowed: check\|x\|chevron-down/.test(w)), 'icon name warning');

  // right host, bad name: ui-icon is correct for an <svg>, but no <use> is built
  assert.equal(await p.eval(`document.getElementById('e-badname').className`), 'ui-icon');
  assert.equal(await p.eval(`document.getElementById('e-badname').children.length`), 0, 'no <use> to a symbol that does not exist');
  // right host, right name: the sprite is injected and the reference is live
  assert.equal(await p.eval(`document.getElementById('e-ok-icon').querySelector('use').getAttribute('href')`), '#ui-i-check');
  assert.ok(await p.eval(`document.getElementById('ui-icons') !== null`), 'sprite injected once');
  await p.close();
});

t('vocab runtime: a misspelled prop warns at attach time', async () => {
  const { warns, p } = await probe();

  assert.ok(
    warns.some(w => /ui:button has no prop "varient" — did you mean "variant"\?/.test(w)),
    `expected a prop-typo warning, got: ${JSON.stringify(warns)}`,
  );
  // and the element still got the enhancer, just without the variant it never saw
  assert.equal(await p.eval(`document.getElementById('e-typo').className`), 'ui-btn');
  await p.close();
});

t('vocab runtime: a companion attribute with no partner warns and does nothing', async () => {
  const { warns, p } = await probe();

  assert.ok(
    warns.some(w => /ui:sortable needs "ui:each" on the same element \(no effect\)/.test(w)),
    `expected a sortable warning, got: ${JSON.stringify(warns)}`,
  );
  assert.ok(warns.some(w => /ui:key needs "ui:each"/.test(w)), 'key warning');
  assert.ok(warns.some(w => /ui:transition needs "ui:fx"/.test(w)), 'transition warning');
  await p.close();
});

t('vocab runtime: ui:model on a non-control is named and refused; controls and custom elements are not', async () => {
  const { warns, p } = await probe();

  assert.ok(
    warns.some(w => /ui:model requires <input> or <textarea> or <select>, found <div>/.test(w)),
    `expected a model host warning, got: ${JSON.stringify(warns)}`,
  );
  // refused, not merely reported: writing `.value` onto a <div> makes an expando
  // and subscribing to input/change on it listens for events it cannot fire
  assert.equal(
    await p.eval(`Object.hasOwn(document.getElementById('e-model-div'), 'value')`), false,
    'no expando .value was created on the <div>',
  );
  // the real control still binds, so the guard did not cost anything
  assert.equal(await p.eval(`document.getElementById('e-model-ok').value`), '1');
  // a custom element's `.value` is its author's business — the runtime refuses only
  // what it can be certain about, so exactly one host warning was emitted
  assert.equal(warns.filter(w => /ui:model requires/.test(w)).length, 1, 'one host warning, not two');
  await p.close();
});

t('vocab runtime: a clean page produces no vocabulary warnings', async () => {
  const p = await browser.newPage(base)
    .then(x => x.goto('/pages/content.html', "document.readyState === 'complete' && window.__uiReady === true"));
  const warns = await p.eval<string[]>('window.__ui.warns');
  assert.deepEqual(warns, [], `a shipped page must be warning-free, got: ${JSON.stringify(warns)}`);
  await p.close();
});

t('vocab runtime: a bare GET warns and parks the cell instead of fetching ""', async () => {
  const p = await browser.newPage(base)
    .then(x => x.goto('/pages/index.html', "document.readyState === 'complete' && window.__uiReady === true"));
  await p.eval(`(() => {
    window.__ui.warns.length = 0;
    const d = document.createElement('div');
    d.id = 'bare-get';
    d.setAttribute('ui:state', 'rows: GET');
    document.body.append(d);
  })()`);
  await p.eval(`import('/dist/leonui.js').then(m => m.attach(document.getElementById('bare-get')))`);

  const warns = await p.eval<string[]>('window.__ui.warns');
  assert.ok(warns.some(w => /remote cell "rows" needs a URL after GET/.test(w)), `expected a named warning, got: ${JSON.stringify(warns)}`);
  // the defect: this used to be the literal string "GET", silently
  const value = await p.eval<string>(`JSON.stringify(window.__ui.readPath('rows', document.getElementById('bare-get')))`);
  assert.equal(value, '{"status":"error","data":null}');

  // and it is not refetchable — fetch('') would pull the page itself back
  await p.eval(`(() => {
    window.__ui.warns.length = 0;
    const b = document.createElement('button');
    b.id = 'bare-refetch';
    b.setAttribute('ui:fx', "click: refetch rows");
    document.getElementById('bare-get').append(b);
  })()`);
  await p.eval(`import('/dist/leonui.js').then(m => m.attach(document.getElementById('bare-refetch')))`);
  await p.eval(`document.getElementById('bare-refetch').click()`);
  const after = await p.eval<string[]>('window.__ui.warns');
  assert.ok(after.some(w => /refetch target is not a remote cell: rows/.test(w)), `expected a refetch warning, got: ${JSON.stringify(after)}`);
  await p.close();
});
