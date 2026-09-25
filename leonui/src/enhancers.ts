/* enhancers.ts — structural attributes → shipped classes, a11y, platform wiring.
 *
 * Every enhancer's bare props and their value vocabularies live in vocab.ts, not
 * here: this file applies them, it does not decide what is legal. Values are
 * validated before they are applied, so a wrong value is a named warning and a
 * fallback to the default — never a class nothing styles. */
import { warn } from './signals.ts';
import { ICONS, enhancerAttrProblems, enhancerProblems, enhancerRejects, rejectedProps } from './vocab.ts';

let anchorSeq = 0;

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

type Enhancer = (el: Element) => void;
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
  },
  'ui:modal': el => el.classList.add('ui-dialog'),
  'ui:tabs': el => {
    el.classList.add('ui-tabs');
    const tabs = [...el.querySelectorAll('[role="tab"]')] as HTMLElement[];
    const panels = [...el.querySelectorAll('[role="tabpanel"]')] as HTMLElement[];
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
 * materialised once per element instead of once per pass. */
export function attachEnhancers(el: Element, attrs: Attr[] = [...el.attributes]): void {
  for (const a of attrs) {
    // hasOwn, not `in`: plain-object lookup would treat `toString`/`constructor`
    // as enhancers and call Object.prototype members on the element
    if (!Object.hasOwn(ENHANCERS, a.name)) continue;
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
      for (const msg of enhancerProblems(a.name, get, { host, has })) warn(msg);
      for (const msg of enhancerAttrProblems(a.name, attrs.map(x => x.name))) warn(msg);
      if (skip) continue;
      for (const prop of rejectedProps(a.name, get)) el.removeAttribute(prop);
      ENHANCERS[a.name]!(el);
    } catch (e) { warn((e as Error).message); }
  }
}
