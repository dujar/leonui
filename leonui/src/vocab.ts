/* vocab.ts — the closed vocabulary, stated once.
 *
 * Zero imports, zero DOM access. This module is the single source for BOTH the
 * runtime's warnings and the browser-free `ui check` static checker, because the
 * gap it closes was exactly a vocabulary that lived in two places and was
 * enforced in neither: the prose said "closed set", the code concatenated
 * whatever string it was handed, and a wrong value produced a class nothing
 * styles (or `var(--ui-gap-99)`) with no warning at all.
 *
 * Rule for adding anything here: declare the value set NEXT TO the thing that
 * consumes it, then have every consumer read this table. Never re-derive it.
 */

/* ---------- ui:* attribute names ---------- */
/** family heads + satellites. `ui:bind` / `ui:bind-*` and the enhancers below
 * are matched separately; everything else that starts with `ui:` is a typo. */
export const CORE_ATTRS = [
  'ui:state', 'ui:computed', 'ui:model', 'ui:each', 'ui:key',
  'ui:sortable', 'ui:use', 'ui:fx', 'ui:transition',
] as const;

export const isBindAttr = (name: string): boolean =>
  name === 'ui:bind' || /^ui:bind-[\w:-]+$/.test(name);

/* ---------- bind aspects (rule 3: named after the DOM property they write) ---------- */
export const ASPECTS = ['text', 'class', 'hidden', 'disabled', 'checked', 'open'] as const;

export const isAttrAspect = (aspect: string): boolean => /^attr:[\w-]+$/.test(aspect);

/* ---------- effect verbs + response gates (rule 6) ---------- */
export const VERBS = [
  'set', 'toggle', 'call', 'toast', 'nav', 'refetch', 'prompt', 'confirm', 'focus', 'reset',
  'dismiss', 'delay',
] as const;
/** response gates read the last call's outcome; they are not verbs (naming.md §6) */
export const GATES = ['onfail', 'onsuccess'] as const;
export const VERB_NAMES: readonly string[] = [...VERBS, ...GATES];

/* ---------- icon names ---------- */
/** name → SVG path data. The names are the vocabulary (`ui:icon name=…`); the
 * paths are the payload, kept here so a name and its symbol cannot drift. */
export const ICONS: Record<string, string> = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  'chevron-down': 'm6 9 6 6 6-6',
  search: 'M21 21l-4.34-4.34M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  plus: 'M12 5v14M5 12h14',
  dot: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
};
export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

/* ---------- ui:state value sentinels ---------- */
/** UPPERCASE protocol words that open a `ui:state` value slot (naming.md rule 2).
 * `GET` is the first; a second transport enters here, never as a new family. */
export const SENTINELS = ['GET'] as const;

/** Match a remote-cell declaration, with or without its URL.
 *
 * The bug this replaces: `/^GET\s/` required whitespace after `GET`, so a bare
 * `n: GET` fell through to the literal branch and stored the *string* "GET" — a
 * silent no-op in both the runtime and the checker, which shared the regex. */
const REMOTE_DECL = /^GET(?:\s|$)/i;

/** Decode a `ui:state` value that declares a remote cell.
 * `null` when the value is not a remote declaration; `bare: true` when `GET` was
 * written with no URL after it, which the caller reports rather than fetching. */
export function remoteDecl(val: string): { url: string; bare: boolean } | null {
  if (!REMOTE_DECL.test(val)) return null;
  const url = val.replace(/^GET\s*/i, '').trim();
  return { url, bare: url === '' };
}

/* ---------- enhancer props ---------- */
/** A prop is one of: a closed set, an inclusive integer range (the `--ui-gap-*`
 * scale), a pattern, or free-form with a hint. */
export interface PropSpec {
  values?: readonly string[];
  range?: readonly [number, number];
  pattern?: RegExp;
  hint?: string;
}
export interface EnhancerSpec {
  /** bare props this enhancer reads, with their value vocabularies */
  props?: Record<string, PropSpec>;
  /** presence-only flags (`wrap`, `center`, `block`) — no value to validate */
  flags?: readonly string[];
  /** host tags the enhancer requires; anything else is silently inert */
  hosts?: readonly string[];
  /** native attribute the enhancer needs to be present to do anything */
  requiresAttr?: string;
  /** prose for the vocabulary table's notes column. It lives HERE, next to the
   * spec, because the skill's table is generated from this table — prose kept
   * anywhere else would be the one part of the vocabulary free to drift. */
  note?: string;
}

const GAP = { range: [1, 8] as const };
const ALIGN = { values: ['start', 'center', 'end', 'between'] as const };

/** Every enhancer, its props, and the prose the skill's table shows for it.
 * The `note` strings are rendered into `skill/SKILL.md` by `scripts/grammar.ts`,
 * so this file is the only place a value vocabulary or a host contract lives. */
export const ENHANCER_SPECS: Record<string, EnhancerSpec> = {
  'ui:stack': { props: { gap: GAP, align: ALIGN }, flags: ['center'], note: '`align` moves the **cross** axis, `center` does both' },
  'ui:row': { props: { gap: GAP, align: ALIGN }, flags: ['center', 'wrap'], note: '`align` moves the **cross** axis, `wrap` the main axis' },
  'ui:card': { props: { variant: { values: ['inset', 'outline'] } } },
  'ui:divider': {},
  'ui:spacer': { props: { size: GAP } },
  'ui:text': { props: { variant: { values: ['title', 'subtitle', 'muted', 'strong', 'code'] } } },
  'ui:badge': { props: { variant: { values: ['brand', 'danger', 'warn', 'success'] } } },
  'ui:button': { props: { variant: { values: ['primary', 'ghost', 'danger', 'icon'] } }, flags: ['block'], note: 'including `<a>`' },
  'ui:icon': { props: { name: { values: ICON_NAMES } }, hosts: ['svg'], note: 'writes the sprite `<use>`' },
  'ui:image': {
    props: { ratio: { pattern: /^\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*$/, hint: 'a CSS aspect-ratio, e.g. "3/2" or "1.5"' } },
    hosts: ['img'],
    note: 'error fallback class',
  },
  'ui:field': {},
  'ui:input': { hosts: ['input'], note: 'control class' },
  'ui:textarea': { hosts: ['textarea'], note: 'control class' },
  'ui:select': { hosts: ['select'], note: 'control class' },
  'ui:checkbox': { hosts: ['input'], note: 'checkable control' },
  'ui:popover': {
    props: {
      anchor: { hint: 'a CSS selector, e.g. "#btn"' },
      placement: { values: ['bottom-start', 'bottom-end', 'top-start', 'top-end'] },
    },
    requiresAttr: 'popover',
    note: 'opened by a `popovertarget` invoker button; the invoker\'s `aria-expanded` is kept in sync for you',
  },
  'ui:modal': { hosts: ['dialog'], note: 'open with `command="show-modal" commandfor="id"` buttons — zero JS' },
  'ui:tabs': { note: 'needs `role=tab/tablist/tabpanel` markup — arrow keys + Home/End included' },
  'ui:reveal': {
    props: {
      from: { values: ['fade', 'up', 'down', 'left', 'right', 'zoom'] },
      trigger: { values: ['scroll', 'load'] },
      stagger: { range: [0, 8], hint: 'an integer 0..8 (each step is 80ms)' },
    },
    note: 'scroll-driven entrance animation; `trigger="load"` animates on load instead',
  },
};

export const ENHANCER_NAMES: readonly string[] = Object.keys(ENHANCER_SPECS);

/* ---------- requirements that are not about props ---------- */
/** `ui:*` attributes that only mean something alongside another attribute on the
 * **same element**. Without the partner they are inert, which used to be silent:
 * `ui:sortable` on a non-`ui:each` element looked like a working sortable list. */
export const COMPANIONS: Record<string, string> = {
  'ui:key': 'ui:each',
  'ui:sortable': 'ui:each',
  'ui:transition': 'ui:fx',
};

/** Core (non-enhancer) `ui:*` attributes with a host contract of their own.
 * Enhancer hosts live in their spec above; these are the family heads and
 * satellites that only work on a particular kind of element. */
export const CORE_HOSTS: Record<string, readonly string[]> = {
  // ui:model writes `.value` and listens for input/change — on anything else both
  // are inert, so it looked like a two-way bind that simply never fired
  'ui:model': ['input', 'textarea', 'select'],
};

/** Core `ui:*` attributes whose **value** has a shape the runtime depends on, the
 * way an enhancer prop does.
 *
 * `ui:key` is the one today. `each.ts` does `item[keyAttr]`, so the value is a
 * property NAME on the item, not a path — and `ui:key="row.id"` is the mistake
 * that shape invites: it parses, it validates as a path, it renders, and every
 * row silently falls back to its index, which is exactly the keyed-list guarantee
 * the attribute exists to provide. */
export const CORE_PROPS: Record<string, PropSpec> = {
  'ui:key': {
    pattern: /^[^\s.]+$/,
    hint: 'a property name on the item, e.g. "id" — the runtime reads item[key], so a dotted path resolves to nothing and every row falls back to its index',
  },
};

/** every **core** `ui:*` attribute that carries a requirement or a value contract.
 * Enhancers carry theirs inside their own spec above; this is the set the
 * runtime's requirement pass and `ui check` iterate. */
export const CORE_ATTRS_WITH_REQUIREMENTS: readonly string[] = [
  ...Object.keys(CORE_HOSTS),
  ...Object.keys(CORE_PROPS),
  ...Object.keys(COMPANIONS),
];

/** every legal `ui:*` attribute name — the typo check and its suggestions read this */
export const ALL_UI_ATTRS: readonly string[] = [...CORE_ATTRS, 'ui:bind', ...ENHANCER_NAMES];

/* ---------- validation ---------- */

/** The one reason an enhancer must be **skipped outright** (null when it may run).
 *
 * Two failure modes, deliberately different:
 *   - a bad *prop value* falls back to the default (the enhancer still runs, minus
 *     the value nothing understood) — see `rejectedProps`;
 *   - a wrong *host* or a missing required native attribute has no sensible
 *     fallback. There is no way to make a modal out of a `<div>`, and applying
 *     `ui-dialog` to one is not a fallback, it is a wrong render. So the enhancer
 *     does not run.
 *
 * Both are named warnings either way — never a silent no-op, which is the whole
 * reason this table exists. */
export function enhancerRejects(
  enhancer: string,
  opts: { host?: string; has?: (attr: string) => boolean } = {},
): string | null {
  const spec = ENHANCER_SPECS[enhancer];
  if (!spec) return null;
  const host = opts.host;
  if (host && spec.hosts && !spec.hosts.includes(host)) {
    return `ui: ${enhancer} requires <${spec.hosts.join('> or <')}>, found <${host}> — not applied`;
  }
  if (spec.requiresAttr && opts.has && !opts.has(spec.requiresAttr)) {
    return `ui: ${enhancer} needs the native "${spec.requiresAttr}" attribute — not applied`;
  }
  return null;
}

/** Requirements carried by a **core** `ui:*` attribute that are not about props:
 * the kind of element it must sit on, and the partner attribute it must share
 * that element with.
 *
 * The gap this closes: `ui:key`, `ui:sortable`, `ui:transition` and `ui:model` are
 * each read in exactly one place — `each.ts`, `fx.ts`, `binds.ts` — and each of
 * those reads the attribute *itself*. Nothing there can tell that the thing it
 * depends on is absent, because absence is precisely why the code did not run:
 * `ui:sortable` on a non-`ui:each` element looked like a working sortable list,
 * and `ui:model` on a `<div>` was a two-way bind that could never fire. So the
 * check has to live here, above both consumers.
 *
 * Returns one `ui: `-prefixed message per unmet requirement, so the runtime's
 * warning and the checker's finding are the same string by construction. */
export function requirementProblems(
  attr: string,
  opts: { host?: string; has?: (attr: string) => boolean } = {},
): string[] {
  const out: string[] = [];
  const hosts = CORE_HOSTS[attr];
  // A hyphenated tag is a custom element by specification, and the runtime has no
  // business declaring what its `.value` means — so `<my-slider ui:model="x">` is
  // left alone. Everything else must match: there is no way to make a form control
  // out of a `<div>`, and a two-way bind that can never fire is worse than a
  // refused one.
  if (hosts && opts.host && !hosts.includes(opts.host) && !opts.host.includes('-')) {
    out.push(`ui: ${attr} requires <${hosts.join('> or <')}>, found <${opts.host}> — not applied`);
  }
  const companion = COMPANIONS[attr];
  if (companion && opts.has && !opts.has(companion)) {
    out.push(`ui: ${attr} needs "${companion}" on the same element (no effect)`);
  }
  return out;
}

/** Validate the values of core `ui:*` attributes that declare a shape.
 *
 * Warnings only, and the attribute falls back to its default — the same failure
 * mode as a rejected enhancer prop, and deliberately *not* the "skip outright"
 * one: a `ui:key` with a bad value still wants a keyed list, just the default key.
 *
 * An *absent* attribute is the default and says nothing. A *present and empty* one
 * is an author who wrote the attribute and left it blank, so the runtime falls
 * back to a default they did not ask for — `ui:key=""` looks like a key, keys
 * nothing, and every row quietly falls back to its index. That is the same silent
 * loss the pattern check above exists to prevent, so it is reported too. */
export function coreAttrProblems(attr: string, value: string | null): string[] {
  const ps = CORE_PROPS[attr];
  if (!ps || value == null) return [];
  if (value === '') {
    return [`ui: ${attr}="" is empty — nothing is read from the item, so this attribute has no effect`];
  }
  if (ps.pattern && !ps.pattern.test(value)) {
    return [`ui: ${attr}="${value}" — expected ${ps.hint ?? 'a different format'} (using the default)`];
  }
  return [];
}

/** The general form of `enhancerRejects`: one reason a `ui:*` attribute must be
 * **skipped outright**, whichever table owns the requirement — an enhancer spec's
 * `hosts`/`requiresAttr`, or `CORE_HOSTS`/`COMPANIONS`. `null` when it may run.
 *
 * Split from `requirementProblems` so a caller that only needs the yes/no decision
 * (the runtime's attach loop, which has already emitted the messages) does not
 * build the strings twice. */
export function attrRejects(
  attr: string,
  opts: { host?: string; has?: (attr: string) => boolean } = {},
): string | null {
  return enhancerRejects(attr, opts) ?? requirementProblems(attr, opts)[0] ?? null;
}

/** Validate one enhancer's declared props.
 *
 * `value(prop)` returns the attribute value or null when absent; `host` and
 * `has` are optional so the static checker (which knows both) gets the host and
 * requiresAttr checks while the runtime can pass them too. Returns one message
 * per problem, each already prefixed `ui: ` — the same strings the runtime warns
 * with and the checker prints, so a page can never disagree with `ui check`. */
export function enhancerProblems(
  enhancer: string,
  value: (prop: string) => string | null,
  opts: { host?: string; has?: (attr: string) => boolean } = {},
): string[] {
  const spec = ENHANCER_SPECS[enhancer];
  if (!spec) return [];
  const out: string[] = [];
  const reject = enhancerRejects(enhancer, opts);
  if (reject) out.push(reject);
  for (const [prop, ps] of Object.entries(spec.props ?? {})) {
    const v = value(prop);
    if (v == null || v === '') continue;
    if (ps.values && !ps.values.includes(v)) {
      out.push(`ui: ${enhancer} ${prop}="${v}" — allowed: ${ps.values.join('|')} (using the default)`);
    } else if (ps.range) {
      const [lo, hi] = ps.range;
      const n = Number(v);
      if (!Number.isInteger(n) || n < lo || n > hi) {
        out.push(`ui: ${enhancer} ${prop}="${v}" — expected an integer ${lo}..${hi} (using the default)`);
      }
    } else if (ps.pattern && !ps.pattern.test(v)) {
      out.push(`ui: ${enhancer} ${prop}="${v}" — expected ${ps.hint ?? 'a different format'} (using the default)`);
    }
  }
  return out;
}

/** props that were named and rejected — the runtime drops these so the enhancer
 * falls back to its default instead of applying a value nothing understands. */
export function rejectedProps(enhancer: string, value: (prop: string) => string | null): string[] {
  const spec = ENHANCER_SPECS[enhancer];
  if (!spec) return [];
  return Object.entries(spec.props ?? {})
    .filter(([prop, ps]) => {
      const v = value(prop);
      if (v == null || v === '') return false;
      if (ps.values) return !ps.values.includes(v);
      if (ps.range) {
        const [lo, hi] = ps.range;
        const n = Number(v);
        return !Number.isInteger(n) || n < lo || n > hi;
      }
      if (ps.pattern) return !ps.pattern.test(v);
      return false;
    })
    .map(([prop]) => prop);
}

/** A bare attribute on an enhancer element that looks like a misspelling of one
 * of that enhancer's props.
 *
 * The hole this closes: `variant="primry"` was already caught (the declared prop
 * held a bad value), but `varient="primary"` was **silent** — the enhancer never
 * saw its prop, so it rendered the default and said nothing. Two guards keep this
 * from crying wolf: a declared prop is never a typo, and an HTML attribute is
 * never ours. On top of that the name must be *close* to a declared prop, so an
 * element carrying unrelated attributes is not nagged. An enhancer with no
 * declared props can never produce this finding at all. */
export function enhancerAttrProblems(enhancer: string, names: readonly string[]): string[] {
  const spec = ENHANCER_SPECS[enhancer];
  if (!spec) return [];
  const known = [...Object.keys(spec.props ?? {}), ...(spec.flags ?? [])];
  if (!known.length) return [];
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith('ui:')) continue;
    if (known.includes(name) || isHtmlAttr(name)) continue;
    const hint = suggest(name, known);
    if (hint) out.push(`ui: ${enhancer} has no prop "${name}" — did you mean "${hint}"? (no effect)`);
  }
  return out;
}

/* ---------- did-you-mean ---------- */

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** closest candidate within `maxDistance` (default 2), or null. Pure, so the
 * checker and the runtime produce identical suggestions. */
export function suggest(name: string, candidates: readonly string[], maxDistance = 2): string | null {
  let best: string | null = null;
  let bestD = maxDistance + 1;
  for (const c of candidates) {
    const d = editDistance(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** attributes that belong to HTML, not to an enhancer — a bare prop that HTML
 * already defines is off-limits (naming.md rule 4), so these are never reported
 * as unknown enhancer props. */
const HTML_GLOBALS = new Set([
  'id', 'class', 'style', 'title', 'hidden', 'lang', 'dir', 'role', 'slot', 'part',
  'tabindex', 'accesskey', 'contenteditable', 'draggable', 'spellcheck', 'translate',
  'is', 'itemid', 'itemprop', 'itemref', 'itemscope', 'itemtype', 'nonce', 'inert',
  'popover', 'autofocus', 'name', 'value', 'type', 'href', 'src', 'alt', 'width',
  'height', 'for', 'form', 'label', 'target', 'rel', 'disabled', 'checked', 'selected',
  'multiple', 'readonly', 'required', 'placeholder', 'min', 'max', 'step', 'pattern',
  'rows', 'cols', 'wrap', 'size', 'accept', 'capture', 'list', 'open', 'command',
  'commandfor', 'popovertarget', 'popovertargetaction', 'method', 'action', 'novalidate',
]);

export const isHtmlAttr = (name: string): boolean =>
  HTML_GLOBALS.has(name) ||
  name.startsWith('data-') || name.startsWith('aria-') || name.startsWith('on') ||
  name.startsWith('xmlns') || /^[a-z]+-[a-z]+/.test(name);
