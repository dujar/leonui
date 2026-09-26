---
name: leonui
description: Author interactive UI as plain HTML + leonui attributes (ui:state, ui:bind, ui:each, ui:fx) — the typed no-build reactive runtime. Use when creating or editing pages in a leonui project, building agent-authored UI, or when a task calls for declarative UI without build tooling.
---

# leonui

Typed reactive UI runtime. **HTML is the schema; the browser is the framework.** You author plain HTML plus a small attribute grammar (five families plus satellites); a ~32.3 KB runtime (12.0 KB gzipped; `dist/leonui.js`, auto-boots on import) provides signals, fine-grained binds, keyed lists, a closed effect-verb catalog, and validation that turns every malformed attribute into a named warning. No build step, no components, no vdom. The stylesheet `src/ui.css` is a separate optional file (12.5 KB min / 3.6 KB gzipped) that supplies the enhancer classes below. Verify your markup without a browser with `ui check` (see **Verifying a page**).

## The attribute families

| Attribute | Meaning |
|---|---|
| `ui:state="name: value; name2: GET /url"` | Declare signals on an element. Descendants see them (nearest ancestor wins = scoping). Values: `'str'`, number, `true/false`, JSON array/object (single- or double-quoted OK), `GET /url` remote cell → `{status, data}`. |
| `ui:bind="aspect: expr; aspect2: expr2"` or `ui:bind-<aspect>="expr"` | One-way bind, auto-tracked. Aspects: <!-- BEGIN GENERATED: aspects -->`text` `class` `hidden` `disabled` `checked` `open`<!-- END GENERATED: aspects --> and `attr:<name>` (e.g. `ui:bind-attr:href`). |
| `ui:model="path"` | Two-way bind on form controls. Writes the string `.value` — for checkboxes use `ui:bind-checked` + a `toggle` verb instead (booleans, not `"on"`/`""`). |
| `ui:each="item in listPath" ui:key="id"` | Keyed list. The template element is cloned per item; inside it, `item` is a signal in scope. Empty-state notices via `ui:bind-hidden="list.length != 0"`. Keys must be unique — a repeat warns (`ui: each duplicate key "7" (ui:key="id") — later item wins`) and the later item takes over that row, so the earlier item is gone: fix the key. Rows release their subscriptions when they leave the list. |
| `ui:sortable` (on the ui:each template) | Drag-to-reorder primitive: live preview, drop rewrites the array immutably. |
| `ui:fx="event: verb; verb; …"` | Event → effect verbs (below). Events are DOM event names (`click`, `change`, `submit`…). `submit` is auto-preventDefaulted — forms never navigate. |

Plus: `ui:computed="name: expr"` (derived signal) and `ui:transition` (wrap the handler in a view transition).

## Effect verbs (closed catalog — no arbitrary JS)

<!-- BEGIN GENERATED: verbs -->
Verbs (12): `set` `toggle` `call` `toast` `nav` `refetch` `prompt` `confirm` `focus` `reset` `dismiss` `delay`.
Response gates (2, not verbs): `onfail` `onsuccess`.
<!-- END GENERATED: verbs -->

The shapes each verb accepts — the names above are the entire set, and anything else warns by name:

```
set path = expr          toggle path
call METHOD /url [with {json}] [optimistic: set path = expr]
onfail toast 'msg'       (payload runs only if the last call failed — never aborts)
onsuccess toast 'msg'    (payload runs only if the last call succeeded — never aborts)
toast expr               nav '#screen-id'        refetch cellName      # nav needs [data-screen] sections
prompt 'question' into path                      confirm 'question'   (guard: aborts remaining verbs if declined)
focus '#sel'             reset '#form-sel'       delay ms
dismiss                                          (closes the popover or <dialog> this element is inside)
```

Invariants (the runtime enforces these):
- Local (non-server) lists need unique ids: keep a `nextId` counter in state (`set notes = [ { id: nextId, … }, ...notes ]; set nextId = nextId + 1`) — do not derive ids from list length (collides after deletions).
- `reset '#form'` calls `form.reset()` and re-syncs `ui:model` paths for single-value controls only — checkbox/radio/file/`multiple` selects are skipped, and `ui:bind-checked` signals are never restored. Pair it with explicit `set` verbs for booleans.
- `dismiss` closes the nearest open popover or `<dialog>` the element sits inside, and takes no argument — a selector would let you close an overlay other than the one you are in. It exists because a popover can only be closed from a `<button>`: `popovertargetaction="hide"` and `command="hide-popover"` apply to nothing else, so a mobile menu built from `<a href="#section">` links has no other way to close itself. On an element that is not inside an open overlay it warns and does nothing.
- A signal set to an unchanged value does not notify. If a control's initial DOM state differs from its signal default, bind the DOM default too: put `checked`/`selected` attributes on the control that match the declared defaults.
- `with {…}` bodies and `{path}` URL interpolations evaluate at **event time, before** optimistic mutations — write `call PATCH /api/t/{task.id} with { done: !task.done } optimistic: set task.done = !task.done`.
- Optimistic rollback restores pre-call values even if the set removed the row from the DOM.
- `call` sends no body unless `with` is given. Remote-cell shape: `{status: 'loading'|'ok'|'error', data}`. A response a newer request already superseded is discarded, so a slow first `GET` cannot overwrite fresher data.

## Expression language (whitelist AST — never eval'd)

Literals (single- or double-quoted; object keys may be quoted), dot paths, `.length`, `+ - * / %`, `== != < > <= >=`, `&& || ! ? :`, array/object literals with spread, and exactly these pure operators: `without(arr, item)`, `contains(str, sub)`, `first(arr)`, `sortBy(arr, key)`. Anything else — globals, method calls, assignment — is **rejected**. If you need an effect, use a verb; if you need new logic, add a pure operator in `src/parser.ts` (BUILTINS), never inline JS.

`?` ternary works; `:` after `?` is fine. Mid-list verbs may be written with or without a colon (`onfail: toast 'x'` ≡ `onfail toast 'x'`).

## Structural enhancers (classes + a11y come from the shipped `ui.css`)

Every enhancer validates its props at attach time, and nothing about it is silent. Four failure modes, all named:

- a **value** outside the listed set → named warning, the prop is dropped, the enhancer falls back to its default;
- a **wrong host** element → named warning, the enhancer does **not** run (there is no default host to fall back to);
- a **missing partner attribute** on the same element (`ui:key` or `ui:sortable` with no `ui:each`, `ui:transition` with no `ui:fx`) → named warning, no effect;
- a **misspelled prop name** (`varient="primary"`) → named warning with a suggestion, when the name is close to a real prop.

The host column is a contract, not a hint: `ui:icon` reads a bare `name` prop, so it is confined to `<svg>`, where `name` means nothing to HTML. A hyphenated tag is a custom element, and a host contract never applies to one — what `<my-slider>.value` means is its author's business.

**This table is generated from `src/vocab.ts`** — the same object the runtime validates against and `ui check` reports from — so it cannot disagree with either. Do not edit it by hand; run `bun run grammar`.

<!-- BEGIN GENERATED: enhancers -->
| Enhancer | Props (value vocabularies) | Host / notes |
|---|---|---|
| `ui:stack` | `gap=1..8`, `align=start\|center\|end\|between`, `center` | any element; `align` moves the **cross** axis, `center` does both |
| `ui:row` | `gap=1..8`, `align=start\|center\|end\|between`, `center`, `wrap` | any element; `align` moves the **cross** axis, `wrap` the main axis |
| `ui:card` | `variant=inset\|outline` | any element |
| `ui:divider` | — | any element |
| `ui:spacer` | `size=1..8` | any element |
| `ui:text` | `variant=title\|subtitle\|muted\|strong\|code` | any element |
| `ui:badge` | `variant=brand\|danger\|warn\|success` | any element |
| `ui:button` | `variant=primary\|ghost\|danger\|icon`, `block` | any element; including `<a>` |
| `ui:icon` | `name=check\|x\|chevron-down\|search\|plus\|dot\|menu` | **`<svg>` only**; writes the sprite `<use>` |
| `ui:image` | `ratio="3/2"` (a CSS aspect-ratio) | **`<img>` only**; error fallback class |
| `ui:field` | — | any element |
| `ui:input` | — | **`<input>` only**; control class |
| `ui:textarea` | — | **`<textarea>` only**; control class |
| `ui:select` | — | **`<select>` only**; control class |
| `ui:checkbox` | — | **`<input>` only**; checkable control |
| `ui:popover` | `anchor="#btn"` (a CSS selector), `placement=bottom-start\|bottom-end\|top-start\|top-end` | any element; also needs the native `popover` attribute; opened by a `popovertarget` invoker button; the invoker's `aria-expanded` is kept in sync for you |
| `ui:modal` | — | **`<dialog>` only**; open with `command="show-modal" commandfor="id"` buttons — zero JS |
| `ui:tabs` | — | any element; needs `role=tab/tablist/tabpanel` markup — arrow keys + Home/End included |
| `ui:reveal` | `from=fade\|up\|down\|left\|right\|zoom`, `trigger=scroll\|load`, `stagger=0..8` | any element; scroll-driven entrance animation; `trigger="load"` animates on load instead |
<!-- END GENERATED: enhancers -->

Theming: override CSS custom properties (`--brand`, `--bg`, `--ink`, `--muted`, `--line`, `--danger`, `--r`, `--ui-gap-*`, `--ui-text-*`) in a `theme.css`. Never write raw colors/sizes in markup — pick the token or variant. Dark mode is automatic (`light-dark()`).

## Motion (`ui:reveal`)

Entrance animation for landing pages and section reveals, driven by the one attribute and nothing else:

```html
<section ui:reveal from="up">…</section>                       <!-- animates in on scroll -->
<div ui:reveal trigger="load" stagger="2">…</div>              <!-- on load, 160ms late -->
```

- `from=fade|up|down|left|right|zoom` (default `up`) — the axis it travels on, or `fade` for opacity only.
- `trigger=scroll|load` (default `scroll`) — `scroll` reveals once when the element enters the viewport; `load` animates immediately.
- `stagger=0..8` — a delay in 80ms steps, for a row of cards that should arrive in sequence. Inside a `ui:each` the step is multiplied by the row's **index**, so one attribute on the template cascades the whole list (`stagger="1"` over three rows is 0/80/160 ms); outside a list the element's own step is all there is.

Four guarantees are built in. The first two are ways an entrance animation destroys a page rather than decorating it; the last two are ways it breaks one quietly:

1. **Nothing is hidden unless the runtime is running.** The hidden state is scoped to a class the runtime sets on `<html>`, so a page whose bundle 404s, whose CDN is blocked, or where JS is off renders **fully visible**. Never write CSS that hides `[ui:reveal]` directly.
2. **`prefers-reduced-motion: reduce` turns the whole thing off** — no hiding, no transition. A reader who asked for less motion gets the page.
3. **Anything already on screen when it arms is revealed at once.** The scroll trigger uses a negative bottom margin — a band an element has to be able to *leave* — and something anchored to the viewport (`position: fixed`, a sticky bottom bar) never moves relative to it. Intersection alone would leave it armed and invisible for the life of the page, with the runtime running.
4. **The element gets its own transitions back.** `.ui-reveal-in` carries a `transition` shorthand, and a shorthand resets *every* transition property on the element — so a button with `transition: background .2s` would stop transitioning its background the moment it revealed, and keep not transitioning. The runtime adds `.ui-reveal-settled` when the motion ends, the rule stops matching, and the page's transitions return. The duration is read from the stylesheet, not hardcoded, so the two cannot drift.

It is a one-shot: an element revealed by scrolling is not re-armed by scrolling back. Combine with `ui:each` + `stagger` for a list that cascades in — the list supplies the row index, so the rows do not all arrive at the same instant.

## Page skeleton

```html
<!doctype html><html><head>
  <link rel="stylesheet" href="/src/ui.css">
</head><body ui:state="query: ''">
  <input ui:model="query">
  <p ui:bind="text: query == '' ? 'type…' : 'hello ' + query"></p>
  <script type="module" src="/dist/leonui.js"></script>
</body></html>
```

## Hard rules / gotchas

- Forms: `submit` handlers auto-preventDefault — safe to put `ui:fx="submit: …"` on a `<form>`. Buttons inside a form default to `type=submit`; use `type="button"` for click-only buttons inside forms.
- A disabled button does not fire `click` — don't bind `disabled` and the toggling verb to the same button.
- Duplicate `ui:bind` attributes on one element are dropped by HTML — use `ui:bind-class` / `ui:bind-checked` variants for additional aspects.
- `ui:fx` splits verbs on `;` — string literals inside expressions cannot contain `;`.
- `ui:key` defaults to `id` if omitted. Its value is a **property name** (`item[ui:key]`), not a path — `ui:key="row.id"` keys every row by index, so write `ui:key="id"`. A value the runtime cannot honour (dotted, spaced, or empty) warns and falls back to `id`; so does a value no item actually has — the one key mistake only the runtime can see, because nothing static knows the shape of your data.
- `ui:popover` styles/wires an element that must still carry the native `popover` attribute and be opened via a `popovertarget` invoker button (see pages/overlays.html).
- State is visible only to descendants of the declaring element. Declare shared state on `<body>`.
- Arrays are replaced immutably (`set rows = [ {...}, ...rows ]`), never mutated in place. Use `without(rows, item)` to remove.
- One malformed attribute cannot break the page: failures are isolated per element and collected in `window.__ui.warns` — check it when debugging. Unknown verbs, unknown `ui:*` attributes, out-of-vocabulary prop values, wrong enhancer hosts, misspelled prop names, an attribute that needs a partner it does not have (`ui:key` with no `ui:each`, `ui:model` on a non-control), and a declared-but-unimplemented enhancer all warn **by name**, so a typo surfaces instead of silently doing nothing. `window.__ui.verbs` is the live catalog.
- Re-attaching a root is a no-op: if both a page script and a component script import the bundle, the tree attaches once — no stacked listeners, no reset state.
- Remote data states: gate with `ui:bind-hidden="tasks.status != 'ok'"` for loading/error/ok panels; `refetch tasks` re-runs the GET.

## Reusable components

A component is a subtree: markup + state + behavior together. Three reuse mechanisms:

1. **Scoped subtree** — any element with `ui:state` is an independent instance; copying the block duplicates the widget with isolated state.
2. **`ui:use` templates (default choice for repetition):**
   **Cross-file** (fetched once, cached, script-stripped): `ui:use="/components/card.html#card"` — the file holds `<template id="card">`. Live example: `/docs/examples/component-files.html` (components in `components/`).

   ```html
   <template id="stat-tile">
     <div class="ui-card" ui:state="n: 0">
       <span ui:bind="text: label"></span>
       <b ui:bind="text: n + start"></b>
       <button ui:fx="click: set n = n + 1">+1</button>
     </div>
   </template>
   <div ui:use="#stat-tile" label="Users" start="120"></div>
   ```
   Host attributes become **prop signals** (coerced like `ui:state`; `id`/`class`/`style` stay layout, and `data-*`/`aria-*` stay native lanes — none are props). `ui:state` inside the template is **per-instance**; behavior attaches per clone. Templates may nest `ui:use`. Live example: `/docs/examples/component-use.html`.
3. **Custom elements (for distribution):** the runtime exports `attach` — a custom element injects its `ui:*` markup, sets a scope on itself with `sig` signals from its attributes, and calls `attach(this)`. Consumers write `<x-counter label="votes" start="5">`. Live example: `/docs/examples/component-element.html` (+ `component-element.js`).

Styling half of reuse: variants (`variant="primary|ghost|…"`) and tokens — a component varies through the catalog, never bespoke CSS.

## Docs & live examples

The docs site with runnable examples for every subsystem lives at `/docs/` on the dev server (source in `docs/`, examples in `docs/examples/` — each example file is the single source of truth shown as code AND rendered live). Copy patterns from `/pages/` (full component gallery) or `/docs/` (tutorials).

## Naming & growth (contributors)

The rulebook for naming anything in the grammar — family table, aspect rules, verb rules,
growth protocol, grammar budget — is [`naming.md`](naming.md). New vocabulary enters only
through its five doors; `tests/skill.test.ts` enforces that this file documents every
shipped `ui:*` name.

## Verifying a page (run this before you say you are done)

`ui check` reads the markup and reports the same findings the runtime would warn about — **before** anything renders, with no browser and no dev server. Run it after writing or editing any page:

```bash
bunx leonui check                 # every *.html under the cwd
bunx leonui check pages/ docs/    # directories
bunx leonui check page.html --json
```

It exits `1` when it finds an error, and `2` on a usage error — an unknown option, an empty path, a path that does not exist or is not HTML, or nothing to check at all. A typo in a CI gate must not read as a pass, so a missing path is an error rather than a file with nothing wrong in it; and `checked 0 files` is exit `2` as well, because a gate that goes green because it found no files goes green on the day the glob breaks. That makes it usable as a pre-commit or CI gate. It reports: unknown `ui:*` names (with a `did you mean`), unknown or malformed verbs and bad verb arguments, prop values outside their closed set, enhancers on the wrong host, misspelled prop names, expressions that do not parse or call a non-whitelisted function, malformed `ui:state`/`ui:computed`/`ui:each`/`ui:model`/`ui:key`, a present-but-empty `ui:key` (which reads nothing from the item and silently keys by index), an attribute whose required partner is missing (`ui:key` without `ui:each`, `ui:transition` without `ui:fx`, `ui:model` on a non-control), `ui:use` without a `#id`, and duplicate attributes (HTML silently drops the later one). Findings are printed as `file:line:column: severity: message`. `--json` gives `{ files, errors, warnings, suppressed, findings }`: the counts are the whole scan, and `suppressed` is how many findings `--quiet` kept out of `findings`, so the payload never reports a number its own list contradicts.

**What it cannot check** — these need a running page, so confirm them in the browser:
nested path segments (`task.tittle` is not statically decidable), cross-file scope from `ui:use`, whether a selector actually matches, whether an element sits inside a `ui:each` template, and anything that depends on remote data. Three findings are therefore **runtime-only**, and the runtime is the half that makes them: a `ui:tabs` with no `[role="tab"]` inside it (a descendant selector), `ui:state`/`ui:computed`/`ui:each`/`ui:use` written inside a `ui:each` template (a row runs the bind, enhancer and effect passes only, so those four do nothing there), and a `ui:key` naming a property no item has (nothing static knows the shape of the data). For all of these, load the page and read `window.__ui.warns`, which collects the runtime half.

A clean `ui check` plus an empty `window.__ui.warns` is the bar for "it came out as expected".

## Dev loop

```bash
bun run dev            # serve pages + mock API (PORT env overrides; default 4700)
bun run build          # bundle src/ → dist/leonui.js + dist/leonui.iife.js + dist/cli.mjs (minified)
bun run typecheck      # tsc --noEmit (must stay clean)
bun run check          # ui check over the cwd — browser-free markup verification
bun run grammar        # regenerate the generated tables in both skill files from src/vocab.ts
bun run grammar:check  # fail if any generated file is stale (CI gate)
bun test tests/        # full suite: e2e + accuracy + comparisons + grammar guarantees (real Chromium via CDP; prints its own count)
bun run bench          # regenerate benchmark.md from measured runs
```

Mock API on the dev server (for apps like the inbox example):

```
GET    /api/tasks          -> [{id, title, done}]      (?fail=1 -> 500, ?slow=1 -> +800ms)
POST   /api/tasks          {title} -> created task
PATCH  /api/tasks/:id      {done} -> updated
DELETE /api/tasks/:id      -> {ok}
POST   /api/__reset        -> restore seed data (test hook)
GET    /api/boom           -> always 500 (error-state testing)
```

Gallery of every component variant: `/pages/` on the dev server — copy patterns from there rather than inventing syntax.
