/* enhancers.ts — structural attributes → shipped classes, a11y, platform wiring */
import { warn } from './signals.ts';

let anchorSeq = 0;
const ICONS: Record<string, string> = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  'chevron-down': 'm6 9 6 6 6-6',
  search: 'M21 21l-4.34-4.34M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  plus: 'M12 5v14M5 12h14',
  dot: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

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
    el.innerHTML = `<use href="#ui-i-${name}"></use>`;
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
        if (e.key === 'ArrowRight') { const n = (i + 1) % tabs.length; select(n); tabs[n]!.focus(); }
        if (e.key === 'ArrowLeft') { const n = (i - 1 + tabs.length) % tabs.length; select(n); tabs[n]!.focus(); }
      });
    });
    const initial = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    select(Math.max(0, initial));
  },
};

export function attachEnhancers(el: Element): void {
  for (const a of [...el.attributes]) {
    const enh = ENHANCERS[a.name];
    if (enh) {
      try { enh(el); }
      catch (e) { warn((e as Error).message); }
    }
  }
}
