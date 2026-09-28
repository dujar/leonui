/* scan.ts — per-element attach passes (each isolated: one bad node must not kill the page)
 * plus the reuse layer: ui:use template components and the public attach() API
 * that custom-element authors call on their own roots. */
import { scopes, sig, warn, warnAttach } from './signals.ts';
import type { Scope } from './types.ts';
import { coerce, attachState, attachComputed } from './state.ts';
import { attachEach } from './each.ts';
import { attachBinds, attachModel } from './binds.ts';
import { attachEnhancers, enhancerStaticPass } from './enhancers.ts';
import { attachFx } from './fx.ts';
import { ALL_UI_ATTRS, CORE_ATTRS, CORE_ATTRS_WITH_REQUIREMENTS, ENHANCER_NAMES, attrRejects, coreAttrProblems, isBindAttr, requirementProblems, suggest } from './vocab.ts';

/** the known ui:* vocabulary — anything else on an element is a typo worth naming.
 * The list comes from vocab.ts, which is also what `ui check` reads, so a name is
 * never legal in one and illegal in the other. */
const KNOWN_UI_ATTRS = new Set<string>([...CORE_ATTRS, ...ENHANCER_NAMES]);

/** core `ui:*` attributes that need a particular host or a partner attribute.
 * Enhancers carry theirs in their spec, checked inside `attachEnhancers`; this is
 * the other half of the same contract, and both halves read vocab.ts. */
const REQUIREMENT_ATTRS = new Set<string>(CORE_ATTRS_WITH_REQUIREMENTS);

/** one attribute array per element: checkVocab / enhancers / binds all read from
 * this snapshot instead of each re-materialising el.attributes */
const attrsOf = (el: Element): Attr[] => [...el.attributes];

/** Warn about — and refuse — every core `ui:*` requirement the element does not
 * meet: a `ui:model` on something that is not a form control, a `ui:key` /
 * `ui:sortable` with no `ui:each`, a `ui:transition` with no `ui:fx`.
 *
 * Each of those attributes is read by one pass that only runs when the *partner*
 * is present, so the pass that would have noticed is exactly the pass that never
 * ran. Checking here, above every pass, is the only place the absence is visible.
 *
 * `report: false` still computes the refusals but says nothing — that is the row
 * path, where the markup being walked is a clone of a template whose requirements
 * were already reported once at the `ui:each` site. Reporting per row would make
 * the warning count track the data (a 100-item list warning 100 times about one
 * mistake) and, worse, would warn *not at all* for an empty list — which is
 * exactly how the runtime and `ui check` came to disagree about the same file.
 *
 * Returns the names to skip, so the caller can refuse `ui:model` rather than
 * write `.value` onto an element that has no value to write. */
function requirementPass(el: Element, attrs: Attr[], report = true): Set<string> {
  const refused = new Set<string>();
  const host = el.tagName.toLowerCase();
  const has = (a: string): boolean => el.hasAttribute(a);
  for (const a of attrs) {
    if (!REQUIREMENT_ATTRS.has(a.name)) continue;
    if (report) {
      for (const msg of requirementProblems(a.name, { host, has })) warn(msg);
      // a declared value shape (ui:key) warns and falls back to its default rather
      // than refusing — the attribute is still wanted, just not with that value
      for (const msg of coreAttrProblems(a.name, a.value)) warn(msg);
    }
    if (attrRejects(a.name, { host, has })) refused.add(a.name);
  }
  return refused;
}

/** Attributes that a row can never honour. A row runs the bind, enhancer and
 * effect passes only — the declare (`ui:state`/`ui:computed`) and compose
 * (`ui:each`/`ui:use`) passes belong to the page, not to an item — so an author
 * who writes one inside a list gets nothing at all. That is a silent no-op, which
 * is the one thing this vocabulary is not allowed to contain, so it is named.
 * Reported once per source element, at the `ui:each` site. */
const ROW_INERT_ATTRS = new Set(['ui:each', 'ui:use', 'ui:state', 'ui:computed']);

function rowInertWarnings(el: Element, attrs: Attr[]): void {
  for (const a of attrs) {
    if (!ROW_INERT_ATTRS.has(a.name)) continue;
    warn(`ui: ${a.name} inside a ui:each template is not attached (a row runs binds, ` +
      `enhancers and effects only) — no effect`);
  }
}

function checkVocab(attrs: Attr[]): void {
  for (const a of attrs) {
    if (!a.name.startsWith('ui:')) continue;
    if (KNOWN_UI_ATTRS.has(a.name)) continue;
    if (isBindAttr(a.name)) continue;
    const hint = suggest(a.name, ALL_UI_ATTRS);
    warn(hint
      ? `ui: unknown attribute "${a.name}" (typo? did you mean "${hint}"? — vocabulary in skill/SKILL.md)`
      : `ui: unknown attribute "${a.name}" (typo? the vocabulary lives in skill/SKILL.md)`);
  }
}

/** host attributes that are NOT component props. `id`/`class`/`style` stay layout,
 * `data-*`/`aria-*` stay native lanes, and every `ui:*` name belongs to the grammar —
 * a `ui:fx` on a ui:use host is that host's own handler, never a prop named "ui:fx". */
const SKIP_PROPS = new Set(['id', 'class', 'style']);

/** hosts already instantiated — guards re-entrancy (attach over overlapping
 * roots) and keeps the use-branch from re-entering its own root */
const USE_HOSTS = new WeakSet<Element>();

/** elements already wired by attachElement. Wiring is one-shot: re-attaching an
 * overlapping root would otherwise stack a second click/keydown listener on every
 * ui:tabs tab, a second input listener on every ui:model control, and a second
 * subscription for every bind. */
const WIRED = new WeakSet<Element>();

/** declaration passes are one-shot per element too. Re-running attachState would
 * build a *replacement* scope and silently detach every bind already subscribed to
 * the old signals — re-attaching must be safe, so declarations are guarded.
 * Two sets, not one: an element may carry both ui:state and ui:computed. */
const STATE_DONE = new WeakSet<Element>();
const COMPUTED_DONE = new WeakSet<Element>();

/** cross-file component templates, cached per url#id so many instances fetch once */
const remoteTemplates = new Map<string, Promise<HTMLTemplateElement | null>>();

function loadRemoteTemplate(url: string, id: string): Promise<HTMLTemplateElement | null> {
  const key = url + '#' + id;
  const cached = remoteTemplates.get(key);
  if (cached) return cached;
  const p: Promise<HTMLTemplateElement | null> = fetch(url)
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(text => {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      // component files are declarative by definition — scripts are the
      // custom-element path, never the ui:use path
      doc.querySelectorAll('script').forEach(s => s.remove());
      const tpl = doc.querySelector('template[id="' + id + '"]') as HTMLTemplateElement | null;
      // The file loaded, so what failed is the `#id`, not the URL — and that
      // failure is silent by construction: the caller's `if (tpl) instantiate(tpl)`
      // just does nothing. Name the ids the file does have; that is the difference
      // between a typo the author can fix and a component that renders as nothing.
      if (!tpl) {
        const ids = [...doc.querySelectorAll('template[id]')].map(t => '#' + t.id);
        warn(`ui:use: no <template id="${id}"> in ${url}` +
          (ids.length ? ` — it has ${ids.join(', ')}` : ' (the file has no <template id=…> at all)'));
      }
      return tpl;
    })
    .catch(e => {
      warn(`ui:use: failed to load ${key}: ${(e as Error).message}`);
      return null;
    });
  remoteTemplates.set(key, p);
  return p;
}

/** ui:use="#tpl-id" or ui:use="/components/card.html#card" — instantiate a
 * <template> component: clone its content, expose host attributes as prop
 * signals, then run the FULL attach passes over the instance (state inside the
 * template is per-instance; props come from the host and sit in scope above
 * the clone). Remote files are fetched once, script-stripped, and cached. */
export function attachUse(el: Element): void {
  if (USE_HOSTS.has(el)) return;
  const sel = el.getAttribute('ui:use')!;
  const hash = sel.indexOf('#');
  const isRemote = hash > 0 && (sel.startsWith('/') || sel.startsWith('./') || sel.startsWith('../') || /\.(html?|svg)$/i.test(sel.slice(0, hash)));
  USE_HOSTS.add(el);
  const scope: Scope = { signals: new Map(), meta: new Map() };
  scopes.set(el, scope);
  for (const a of attrsOf(el)) {
    if (a.name.startsWith('ui:') || SKIP_PROPS.has(a.name) || a.name.startsWith('on') || a.name.startsWith('data-') || a.name.startsWith('aria-')) continue;
    scope.signals.set(a.name, sig(coerce(a.value)));
  }
  const instantiate = (tpl: HTMLTemplateElement): void => {
    el.appendChild(tpl.content.cloneNode(true));
    attach(el);
  };
  if (isRemote) {
    void loadRemoteTemplate(sel.slice(0, hash), sel.slice(hash + 1)).then(tpl => {
      if (tpl) instantiate(tpl);
    });
    return;
  }
  const tpl = document.querySelector(sel);
  if (!tpl || tpl.tagName !== 'TEMPLATE') throw new Error(`ui:use: template not found: ${sel}`);
  instantiate(tpl as HTMLTemplateElement);
}

/** The per-element hot path. One attribute snapshot, one wiring pass, and a plain
 * try/catch per stage (no closure per stage) — attach runs over every element in
 * the tree, so this is the cost that shows up in mount time.
 *
 * `staticChecked` says the static passes (vocabulary + requirements) already ran
 * over this markup. That is true for a row: it is a clone of a template that was
 * checked once, at the `ui:each` site. `rowIndex` is the row's position in the
 * list, so a `ui:reveal` inside it can cascade by index rather than every row
 * arriving at the same instant. */
function attachElement(el: Element, attrs: Attr[], staticChecked = false, rowIndex = -1): void {
  if (WIRED.has(el)) return;
  WIRED.add(el);
  if (!staticChecked) { try { checkVocab(attrs); } catch (e) { warnAttach('vocab', el, e); } }
  let refused = new Set<string>();
  try { refused = requirementPass(el, attrs, !staticChecked); } catch (e) { warnAttach('requires', el, e); }
  try { attachEnhancers(el, attrs, rowIndex, staticChecked); } catch (e) { warnAttach('enhance', el, e); }
  try { attachBinds(el, attrs); } catch (e) { warnAttach('bind', el, e); }
  // ui:model on a non-control writes `.value` onto an expando and subscribes to
  // input/change events that element can never fire: refuse it, having said so.
  if (el.hasAttribute('ui:model') && !refused.has('ui:model')) { try { attachModel(el); } catch (e) { warnAttach('model', el, e); } }
  if (el.hasAttribute('ui:fx')) { try { attachFx(el); } catch (e) { warnAttach('fx', el, e); } }
}

/** rows / component internals: enhancers + binds/model/fx per element, with the
 * static passes suppressed — the template they were cloned from was checked once */
function attachFlat(root: Element, rowIndex: number): void {
  attachElement(root, attrsOf(root), true, rowIndex);
  for (const el of root.querySelectorAll('*')) attachElement(el, attrsOf(el), true, rowIndex);
}

/** rows (cloned per item in ui:each): no state/each/use passes.
 * `rowIndex` is the item's position in the list, which `ui:reveal` uses to
 * cascade — an attribute on the element cannot know where its row sits. */
export function attachSubtree(root: Element, rowIndex = -1): void {
  attachFlat(root, rowIndex);
}

/** full attach over any root — the public API custom-element authors call
 * after injecting ui:* markup (light DOM or shadow root). */
export function attach(root: Element | DocumentFragment): void {
  const els: Element[] = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for (const el of els) {
    if (!el.hasAttribute('ui:state') || STATE_DONE.has(el)) continue;
    STATE_DONE.add(el);
    try { attachState(el); } catch (e) { warnAttach('state', el, e); }
  }
  for (const el of els) {
    if (!el.hasAttribute('ui:computed') || COMPUTED_DONE.has(el)) continue;
    COMPUTED_DONE.add(el);
    const attr = el.getAttribute('ui:computed')!;
    const ci = attr.indexOf(':');
    try { attachComputed(el, attr.slice(0, ci).trim(), attr.slice(ci + 1).trim()); }
    catch (e) { warnAttach('computed', el, e); }
  }
  for (const el of els)
    if (el.hasAttribute('ui:each')) {
      // each-templates never reach attachElement — they are pulled out of the tree
      // and cloned per row — so the static passes have to run here or nowhere, and
      // over the whole template subtree rather than just the element: a `ui:key` on
      // a child is only read per row, so with an empty list it was never read at
      // all, and `ui check` (which reads the markup) reported it anyway. The rows
      // then skip these passes, so one mistake is reported once rather than once
      // per item, and reported even when there are no items.
      for (const t of [el, ...el.querySelectorAll('*')]) {
        const a = attrsOf(t);
        try { checkVocab(a); } catch (e) { warnAttach('vocab', t, e); }
        try { requirementPass(t, a); } catch (e) { warnAttach('requires', t, e); }
        // the host/companion half of the vocabulary. `ui check` reads the same
        // table over the same markup, so leaving this out made an empty list the
        // one case where the two halves disagreed: the checker reported a wrong
        // host inside the template and the runtime, having no rows to attach,
        // said nothing at all.
        try { enhancerStaticPass(t, a); } catch (e) { warnAttach('enhance', t, e); }
        if (t !== el) { try { rowInertWarnings(t, a); } catch (e) { warnAttach('vocab', t, e); } }
      }
      try { attachEach(el); } catch (e) { warnAttach('each', el, e); }
    }
  for (const el of els) {
    if (!el.isConnected) continue; // detached (e.g. removed each-template) — rows attach via attachSubtree
    if (el.hasAttribute('ui:each')) continue; // each-templates themselves: nothing to attach
    if (el.hasAttribute('ui:use') && !USE_HOSTS.has(el)) { try { attachUse(el); } catch (e) { warnAttach('use', el, e); } continue; }
    attachElement(el, attrsOf(el));
  }
}
