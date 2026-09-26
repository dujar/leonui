/* enhancers.ts — structural attributes → shipped classes, a11y, platform wiring.
 *
 * Every enhancer's bare props and their value vocabularies live in vocab.ts, not
 * here: this file applies them, it does not decide what is legal. Values are
 * validated before they are applied, so a wrong value is a named warning and a
 * fallback to the default — never a class nothing styles. */
import { canQueryPopoverOpen, warn } from './signals.ts';
import { ENHANCER_SPECS, ICONS, enhancerAttrProblems, enhancerProblems, enhancerRejects, rejectedProps } from './vocab.ts';

let anchorSeq = 0;

/** Keep every invoker of a popover's `aria-expanded` equal to the popover's real
 * state. The invokers are looked up on each sync rather than captured once, so the
 * popover and its button may be attached in either order.
 *
 * What that does NOT cover: an invoker inserted into the DOM *after* the popover
 * was attached gets no `aria-expanded` until the popover is next toggled. That is
 * a real gap, not a claim — closing it would mean observing the document for
 * invokers, which is a mutation observer per popover for a state the platform
 * re-derives on the next toggle anyway.
 *
 * A popover with no invoker is left completely alone — `ui:popover` is also used
 * for popovers opened by script, and those have no button to annotate. */
function syncPopoverExpanded(el: Element): void {
  const id = el.id;
  if (!id) return;
  const sel = `[popovertarget="${CSS.escape(id)}"], [commandfor="${CSS.escape(id)}"]`;
  const sync = (): void => {
    const open = canQueryPopoverOpen() && el.matches(':popover-open');
    for (const b of document.querySelectorAll(sel)) b.setAttribute('aria-expanded', String(open));
  };
  sync();
  el.addEventListener('toggle', sync);
}

export function injectSprite(): void {
  if (document.getElementById('ui-icons')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'ui-icons';
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'none';
  for (const [name, d] of Object.entries(ICONS)) {
    const sym = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    sym.id = 'ui-i-' + name;
    sym.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    sym.appendChild(p);
    svg.appendChild(sym);
  }
  document.body.prepend(svg);
}

/** `rowIndex` is the item's position when the element was cloned from a
 * `ui:each` template, or -1 outside a list. Only `ui:reveal` needs it today — a
 * step has to be measured from somewhere — and every other enhancer ignores it. */
type Enhancer = (el: Element, rowIndex: number) => void;
const align = (el: HTMLElement): void => {
  const a = el.getAttribute('align');
  if (a === 'between') el.style.justifyContent = 'space-between';
  else if (a) el.style.alignItems = a;
  if (el.hasAttribute('center')) {
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
  }
};
const gap = (el: HTMLElement): void => {
  const g = el.getAttribute('gap');
  if (g) el.style.setProperty('--ui-gap', `var(--ui-gap-${g})`);
};

export const ENHANCERS: Record<string, Enhancer> = {
  'ui:stack': el => {
    el.classList.add('ui-stack');
    gap(el as HTMLElement);
    align(el as HTMLElement);
  },
  'ui:row': el => {
    el.classList.add('ui-row');
    gap(el as HTMLElement);
    align(el as HTMLElement);
    if (el.hasAttribute('wrap')) (el as HTMLElement).style.flexWrap = 'wrap';
  },
  'ui:card': el => {
    el.classList.add('ui-card');
    const v = el.getAttribute('variant');
    if (v) el.classList.add('ui-card-' + v);
  },
  'ui:divider': el => el.classList.add('ui-divider'),
  'ui:spacer': el => {
    el.classList.add('ui-spacer');
    const s = el.getAttribute('size');
    if (s) (el as HTMLElement).style.setProperty('--ui-h', `var(--ui-gap-${s})`);
  },
  'ui:text': el => {
    el.classList.add('ui-text');
    const v = el.getAttribute('variant');
    if (v) el.classList.add('ui-t-' + v);
  },
  'ui:badge': el => {
    el.classList.add('ui-badge');
    const v = el.getAttribute('variant');
    if (v) el.classList.add('ui-b-' + v);
  },
  'ui:button': el => {
    el.classList.add('ui-btn');
    const v = el.getAttribute('variant');
    if (v) el.classList.add('ui-btn-' + v);
    if (el.hasAttribute('block')) el.classList.add('ui-btn-block');
  },
  'ui:icon': el => {
    injectSprite();
    el.classList.add('ui-icon');
    const name = el.getAttribute('name');
    // an unknown name was already warned about and dropped by attachEnhancers;
    // bail rather than point a <use> at a symbol that does not exist
    if (!name || !Object.hasOwn(ICONS, name)) return;
    // DOM API, not innerHTML: the symbol id is built from an attribute, and
    // string-building markup from attribute data is the one place this runtime
    // would hand a value to the HTML parser
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ui-i-' + name);
    el.replaceChildren(use);
    el.setAttribute('aria-hidden', 'true');
  },
  'ui:image': el => {
    el.classList.add('ui-img');
    const img = el as HTMLImageElement;
    const r = el.getAttribute('ratio');
    if (r) img.style.aspectRatio = r;
    const fail = (): void => el.classList.add('ui-img-error');
    // the error event may have fired before attach (fast 404) — check completion state
    if (img.complete && img.naturalWidth === 0) fail();
    else img.addEventListener('error', fail, { once: true });
  },
  'ui:field': el => el.classList.add('ui-field'),
  'ui:input': el => el.classList.add('ui-control'),
  'ui:textarea': el => { el.classList.add('ui-control'); el.classList.add('ui-grow'); },
  'ui:select': el => el.classList.add('ui-control'),
  'ui:checkbox': el => el.classList.add('ui-check'),
  'ui:popover': el => {
    el.classList.add('ui-pop');
    const sel = el.getAttribute('anchor');
    if (sel) {
      const a = document.querySelector(sel) as HTMLElement | null;
      if (a) {
        const name = '--ui-anchor-' + (++anchorSeq);
        (a.style as CSSStyleDeclaration & Record<string, string>).anchorName = name;
        ((el as HTMLElement).style as CSSStyleDeclaration & Record<string, string>).positionAnchor = name;
      }
    }
    const pl = el.getAttribute('placement');
    if (pl) el.setAttribute('data-placement', pl);
    // The platform opens and closes the popover, but it never writes that state
    // back to the invoker, so a screen reader hears "Open menu" whether the menu
    // is open or shut. `aria-expanded` is the invoker's job and there is no markup
    // that expresses it — the state lives in the popover — so the enhancer that
    // already knows both ends of the relationship keeps them in step.
    syncPopoverExpanded(el);
  },
  'ui:modal': el => el.classList.add('ui-dialog'),
  'ui:reveal': (el, rowIndex) => {
    // Every prop was validated and a bad one already removed by attachEnhancers,
    // so an absent attribute here IS the default — same shape as gap/align above.
    const from = el.getAttribute('from') ?? 'up';
    const trigger = el.getAttribute('trigger') ?? 'scroll';
    const step = Number(el.getAttribute('stagger') ?? '0');
    el.setAttribute('data-reveal-from', from);
    // A stagger is a *step*, and a step is only meaningful relative to a position.
    // The attribute cannot know where its row sits in a list, so the list tells it:
    // `attachSubtree` passes the item index. Outside a list the element's own step
    // is all there is — which is the hand-written-siblings case, unchanged.
    const steps = step > 0 ? (rowIndex >= 0 ? step * rowIndex : step) : 0;
    if (steps > 0) (el as HTMLElement).style.setProperty('--ui-reveal-delay', steps * 80 + 'ms');

    // The hidden state lives behind this class (see ui.css), so a page that never
    // runs the runtime never hides anything. Arming is instant by construction —
    // the transition is declared on `.ui-reveal-in`, not on the armed state — so
    // there is nothing to commit here and no flash of a reveal animating backwards.
    document.documentElement.classList.add('ui-reveal-ready');
    const show = (): void => {
      // commit the armed state for THIS element before revealing it. If both land in
      // one style recalc the transition has no "from" to run out of and it pops
      // instead of moving — which is invisible in a class-name test and obvious here.
      void (el as HTMLElement).offsetHeight;
      el.classList.add('ui-reveal-in');
      // `.ui-reveal-in` carries a `transition` shorthand, and a shorthand resets
      // every transition property on the element — including the page's own. A
      // `.cta` with `transition: background .2s` would stop transitioning its
      // background the moment it revealed, and keep not transitioning, because the
      // rule kept matching. So the class is temporary: once the motion is over the
      // element is *settled*, the rule stops matching, and the page's transitions
      // come back. Nothing moves — by then every property is at its final value.
      //
      // How long that is comes from the stylesheet, not from a constant here, so
      // the two cannot drift apart. Reading it costs one style recalc per revealed
      // element, which is the same order as the layout above and happens once.
      const cs = getComputedStyle(el);
      const secs = parseFloat(cs.transitionDuration) || 0;
      const delay = parseFloat(cs.transitionDelay) || 0;
      const settle = (): void => el.classList.add('ui-reveal-settled');
      // a timeout, not `transitionend`: an app's own shorter transition on the same
      // element would fire that event early and settle us mid-flight, which is the
      // pop this whole arrangement exists to avoid. Worst case here is a background
      // tab throttling the timer, which leaves the element visible and merely
      // keeps our transition on it a moment longer.
      if (secs > 0) setTimeout(settle, (secs + delay) * 1000 + 60);
      else settle();
    };
    if (trigger === 'load' || typeof IntersectionObserver === 'undefined') {
      requestAnimationFrame(show);
      return;
    }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show();
        io.disconnect(); // one-shot: scrolling back up must not replay it
      }
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    // The negative bottom margin is what makes this a scroll reveal rather than a
    // load reveal: an element has to be properly in view, not merely touching the
    // edge. But it is a band the element must be able to *leave*, and an element
    // anchored to the viewport — `position: fixed`, or a sticky bar pinned to the
    // bottom — never moves relative to the root. One that starts inside that band
    // can therefore never intersect it, and would stay armed and invisible for the
    // life of the page, with the runtime running: the one thing the armed state is
    // never allowed to do. So anything already inside the viewport when we arm is
    // revealed now, and the margin keeps its meaning for everything below the fold.
    requestAnimationFrame(() => {
      if (el.classList.contains('ui-reveal-in')) return;
      const r = (el as HTMLElement).getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < vh && r.bottom > 0) { show(); io.disconnect(); }
    });
  },
  'ui:tabs': el => {
    el.classList.add('ui-tabs');
    const tabs = [...el.querySelectorAll('[role="tab"]')] as HTMLElement[];
    const panels = [...el.querySelectorAll('[role="tabpanel"]')] as HTMLElement[];
    // Nothing to wire: the class lands, no tab is ever selected, no panel is ever
    // hidden, and every panel shows at once. That is a silent no-op — the same
    // shape of mistake as a wrong host, one level in — so it gets the same
    // treatment rather than rendering something that only looks plausible.
    if (!tabs.length) {
      warn(`ui: ui:tabs found no [role="tab"] inside <${el.tagName.toLowerCase()}> — nothing to wire`);
      return;
    }
    const select = (i: number): void => {
      tabs.forEach((t, j) => {
        t.setAttribute('aria-selected', String(i === j));
        t.tabIndex = i === j ? 0 : -1;
      });
      panels.forEach((p, j) => { p.hidden = i !== j; });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        // WAI-ARIA tabs: arrows move selection, Home/End jump to the ends.
        // preventDefault matters — without it the page scrolls while focus roves.
        let n = -1;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n < 0 || !tabs[n]) return;
        e.preventDefault();
        select(n);
        tabs[n]!.focus();
      });
    });
    const initial = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    select(Math.max(0, initial));
  },
};

/** `attrs` is passed in by the attach hot path so the element's attribute list is
 * materialised once per element instead of once per pass. `rowIndex` is forwarded
 * to every enhancer; only `ui:reveal` reads it (see the Enhancer type above). */
/** The static half of enhancer validation — host, required native attributes,
 * required companion attributes — without applying anything.
 *
 * It exists for the `ui:each` template, whose subtree never reaches
 * `attachElement` when the list is empty: the element is pulled out of the tree
 * and cloned per row, so with no rows there is nothing to attach and a wrong
 * host inside the template was silent at runtime while `ui check`, which reads
 * the same table over the same markup, reported it. Reported here once per
 * markup site, which is also what stops a list of 50 rows from printing the
 * same complaint 50 times. */
export function enhancerStaticPass(el: Element, attrs: Attr[]): void {
  const host = el.tagName.toLowerCase();
  const has = (attr: string): boolean => el.hasAttribute(attr);
  const get = (prop: string): string | null => el.getAttribute(prop);
  for (const a of attrs) {
    if (!Object.hasOwn(ENHANCER_SPECS, a.name)) continue;
    for (const msg of enhancerProblems(a.name, get, { host, has })) warn(msg);
    for (const msg of enhancerAttrProblems(a.name, attrs.map(x => x.name))) warn(msg);
  }
}

export function attachEnhancers(el: Element, attrs: Attr[] = [...el.attributes], rowIndex = -1, staticChecked = false): void {
  for (const a of attrs) {
    // hasOwn, not `in`: plain-object lookup would treat `toString`/`constructor`
    // as enhancers and call Object.prototype members on the element
    const impl = Object.hasOwn(ENHANCERS, a.name) ? ENHANCERS[a.name] : undefined;
    if (!impl) {
      // A spec with no implementation is the exact silent no-op this whole table
      // exists to prevent: `ui check` reads vocab.ts and accepts the name, the
      // skill documents it, and the page does nothing. vocab.test.ts pins the two
      // tables together; this is the runtime's half of that pin.
      if (Object.hasOwn(ENHANCER_SPECS, a.name)) warn(`ui: ${a.name} is declared in the vocabulary but not implemented — no effect`);
      continue;
    }
    try {
      // Validate BEFORE applying, from the one table in vocab.ts. Two failure
      // modes, deliberately different (see enhancerRejects):
      //   - a rejected *value* is named and dropped, so the enhancer falls back
      //     to its default instead of emitting a class nothing styles;
      //   - a wrong *host* / missing required native attribute skips the
      //     enhancer entirely — there is no default host to fall back to.
      // Either way it is a named warning, never the silent no-op that made
      // `variant="nonsense"` and `gap="99"` indistinguishable from working markup.
      const host = el.tagName.toLowerCase();
      const has = (attr: string): boolean => el.hasAttribute(attr);
      const get = (prop: string): string | null => el.getAttribute(prop);
      const skip = enhancerRejects(a.name, { host, has }) !== null;
      // The verdict is always needed — a wrong host must not apply, row or not.
      // The *wording* is not: a row is a clone of markup that was already
      // reported once at the `ui:each` site, so re-printing it per item turns
      // one mistake into N lines and drowns everything else on the page.
      if (!staticChecked) {
        for (const msg of enhancerProblems(a.name, get, { host, has })) warn(msg);
        for (const msg of enhancerAttrProblems(a.name, attrs.map(x => x.name))) warn(msg);
      }
      if (skip) continue;
      for (const prop of rejectedProps(a.name, get)) el.removeAttribute(prop);
      impl(el, rowIndex);
    } catch (e) { warn((e as Error).message); }
  }
}
