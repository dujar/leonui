# leonui

**HTML is the schema; the browser is the framework.**

leonui is a typed reactive UI runtime for plain HTML. You author regular markup plus a small
attribute grammar — five families, fewer than 30 `ui:*` names — and a ~27 KB runtime
(9 KB gzipped, stylesheet included) provides signals, fine-grained binds, keyed lists, and a
closed catalog of effect verbs, compiled onto modern browser platform APIs.

**No build step. No components. No vdom. No eval. No arbitrary JavaScript in markup.**
The expression language is a whitelist AST, every runtime warning is collected in
`window.__ui.warns`, and one malformed attribute cannot break the page. That closed,
checkable surface is deliberate: it is what makes leonui safe to hand to a coding agent —
the package ships with its own authoring skill so an agent can produce working UI from the
grammar alone.

```html
<!doctype html><html><head>
  <link rel="stylesheet" href="/src/ui.css">
</head><body ui:state="name: 'world'">
  <input ui:model="name">
  <p>Hello, <b ui:bind="text: name"></b>!</p>
  <script type="module" src="/dist/leonui.js"></script>
</body></html>
```

---

## Contents

- [Why leonui](#why-leonui)
- [Quick start](#quick-start)
- [The grammar: five families](#the-grammar-five-families)
- [Effect verbs](#effect-verbs)
- [The expression language](#the-expression-language)
- [Lists and drag-to-reorder](#lists-and-drag-to-reorder)
- [Server data, optimistic updates, rollback](#server-data-optimistic-updates-rollback)
- [Components and reuse](#components-and-reuse)
- [Structural enhancers and theming](#structural-enhancers-and-theming)
- [Overlays and platform APIs](#overlays-and-platform-apis)
- [Debugging](#debugging)
- [Agent-first distribution](#agent-first-distribution)
- [Performance](#performance)
- [Documentation](#documentation)
- [Development](#development)
- [Browser support](#browser-support)
- [Contributing and naming](#contributing-and-naming)
- [Status and known gaps](#status-and-known-gaps)
- [License](#license)

## Why leonui

Most UI frameworks optimize for application teams with a build pipeline. leonui optimizes
for a different author: a coding agent (or a human) writing HTML directly, with no build
step and no room for hallucinated syntax.

- **The grammar is the product.** Five attribute families cover declare / react / repeat /
  act / compose. The whole vocabulary is designed to fit in an agent's context window —
  [`naming.md`](naming.md) caps the grammar spec at a ~2,000-token budget and every new
  name must state its token cost.
- **Closed, not open.** Expressions are a whitelist (never `eval`), effect verbs are a
  closed catalog, unknown verbs and attributes are *named* warnings instead of silent
  no-ops. A page either behaves as written or tells you exactly which attribute lied.
- **The browser does the work.** Overlays use platform popovers and invoker commands,
  dialogs are plain `<dialog>`, transitions use view transitions, dark mode is
  `light-dark()` — the runtime compiles declarative attributes onto verified platform
  APIs instead of reimplementing them.
- **Typed inside, plain outside.** The runtime is strict TypeScript with a discriminated
  AST and a typed signals core; the authoring surface stays plain HTML.

If you want a component framework, virtual DOM, or a JS/TS layer in your markup, leonui is
not that — and on purpose. Anything beyond the grammar's expressiveness is the escape
valve: write a custom element (`attach` is exported for exactly this).

## Quick start

Zero install, two tags, from a CDN:

```html
<!doctype html><html><head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leonui@0/src/ui.css">
</head><body ui:state="name: 'world'">
  <input ui:model="name">
  <p>Hello, <b ui:bind="text: name"></b>!</p>
  <script src="https://cdn.jsdelivr.net/npm/leonui@0/dist/leonui.iife.js"></script>
</body></html>
```

The classic-script build boots the runtime on load and exposes `window.leonui` (`attach`,
`sig`, `setPath`, `warns`, …) for custom-element authors. `unpkg.com/leonui@0/…` works
identically.

Or install the package:

```bash
bun add leonui     # or: npm install leonui
```

```html
<!-- no-build: serve the files straight from node_modules (or copy them) -->
<link rel="stylesheet" href="/node_modules/leonui/src/ui.css">
<script type="module" src="/node_modules/leonui/dist/leonui.js"></script>
```

```js
// bundled app: importing the entry boots the runtime
import { attach } from 'leonui';
```

Package exports: `leonui` (runtime), `leonui/ui.css` (stylesheet), `leonui/skill`
(the agent-facing grammar, as markdown).

## The grammar: five families

| Family | Head | Satellites | Answers |
|---|---|---|---|
| **declare** | `ui:state="name: value; …"` | `ui:computed="name: expr"` | what data exists |
| **react** | `ui:bind="aspect: expr"` / `ui:bind-<aspect>="expr"` | `ui:model="path"` | how it shows |
| **repeat** | `ui:each="item in listPath"` | `ui:key`, `ui:sortable` | how it repeats |
| **act** | `ui:fx="event: verb; …"` | `ui:transition` | what it does |
| **compose** | `ui:use="#template-id"` | — | what it composes |

Notes that matter in practice:

- **State is scoped by the DOM.** A signal declared on an element is visible to its
  descendants; the nearest ancestor wins. Declare shared state on `<body>`.
- **Binds are auto-tracked and fine-grained.** Aspects are the DOM's own names —
  `text`, `class`, `hidden`, `disabled`, `checked`, `open` — plus `attr:<name>` for any
  attribute verbatim. The aspect list is closed by policy; the learning set is the DOM,
  not our vocabulary.
- **`ui:model` is a two-way bind for form controls** and writes the string `.value`.
  For checkboxes prefer `ui:bind-checked` + a `toggle` verb — booleans, not `"on"`/`""`.
- **Values** in `ui:state` are strings, numbers, booleans, JSON (single quotes OK), or
  `GET /url` — a *remote cell* that fetches on attach and exposes
  `{status: 'loading'|'ok'|'error', data}`.

## Effect verbs

`ui:fx` maps DOM events to a closed catalog of verbs — no arbitrary JS, by design:

| Verb | Does |
|---|---|
| `set path = expr` | write a signal (arrays are replaced immutably, never mutated) |
| `toggle path` | flip a boolean |
| `call METHOD /url [with {json}] [optimistic: set path = expr]` | HTTP request; `with` is the JSON body; `optimistic:` mutates local state immediately and rolls back automatically if the request fails |
| `onfail <verbs>` / `onsuccess <verbs>` | response gates — run their payload only if the last `call` failed/succeeded; they never abort the list |
| `toast expr` | transient notification |
| `nav '#screen-id'` | switch between `[data-screen]` sections |
| `refetch cellName` | re-run a remote cell's `GET` |
| `prompt 'question' into path` | ask the user, store the answer |
| `confirm 'question'` | guard — aborts the remaining verbs if declined |
| `focus '#sel'` | move focus |
| `reset '#form-sel'` | `form.reset()` + re-sync `ui:model` paths |
| `delay ms` | pause before the next verb |

Invariants the runtime enforces (the skill documents them; tests assert them):

- Request payloads (`with {…}` and `{path}` interpolations) evaluate at **event time,
  before** optimistic mutations — write
  `call PATCH /api/t/{task.id} with { done: !task.done } optimistic: set task.done = !task.done`.
- Optimistic rollback restores pre-call signal values even if the optimistic `set`
  removed the row from the DOM.
- `submit` handlers auto-preventDefault: a form with `ui:fx="submit: …"` never navigates.
- `call` sends no body unless `with` is given.
- Local (non-server) lists need unique ids — keep a `nextId` counter in state and
  increment it on create; don't derive ids from `list.length` (they collide after deletions).

## The expression language

A whitelist AST — parsed and evaluated, never `eval`'d:

- literals, dot paths, `.length`
- arithmetic `+ - * / %`, comparisons `== != < > <= >=`, logic `&& || !`, ternary `? :`
- array/object literals with spread
- exactly four pure builtins: `without(arr, item)`, `contains(str, sub)`, `first(arr)`, `sortBy(arr, key)`

Globals, method calls, and assignment are rejected at parse time. If you need an effect,
use a verb; if you need new pure logic, add a builtin in `src/parser.ts` (`BUILTINS`) —
never inline JS.

## Lists and drag-to-reorder

`ui:each` clones its template element per item with minimal-move DOM alignment; `ui:key`
(defaults to `id`) drives identity:

```html
<ul ui:state="todos: [{id: 1, title: 'ship it', done: false}]">
  <li ui:each="t in todos" ui:key="id"
      ui:bind-class="t.done ? 'done' : ''">
    <span ui:bind="text: t.title"></span>
    <button type="button" ui:fx="click: set todos = without(todos, t)">✕</button>
  </li>
</ul>
```

Add `ui:sortable` to the template element and the list becomes drag-to-reorderable —
live preview while dragging, and the drop rewrites the array immutably. Empty states:
gate a notice with `ui:bind-hidden="todos.length != 0"`.

## Server data, optimistic updates, rollback

Remote cells (`GET /url` in `ui:state`) give every list a `{status, data}` lifecycle.
Gate loading/error/ok panels with binds, `refetch` to retry, and `call … optimistic:`
for instant feedback:

```html
<body ui:state="filter: 'all'; tasks: GET /api/tasks">
  <div ui:bind-hidden="tasks.status == 'ok'">Loading…</div>

  <li ui:each="task in tasks.data" ui:key="id"
      ui:bind-class="task.done ? 'ui-list-item done' : 'ui-list-item'"
      ui:bind-hidden="filter == 'done' && !task.done">
    <span ui:bind="text: task.title"></span>
    <button ui:fx="click: call DELETE /api/tasks/{task.id}
                              optimistic: set tasks.data = without(tasks.data, task);
                   onfail: toast 'Delete failed'">✕</button>
  </li>
</body>
```

## Components and reuse

A leonui component is a subtree: markup + state + behavior together. Three mechanisms,
escalating in formality:

1. **Scoped subtree** — any element with `ui:state` is an independent instance. Copy the
   block, you have two isolated widgets.
2. **`ui:use` templates** — the default choice for repetition. Host attributes become
   *prop signals*; `ui:state` inside the template is per-instance; templates may nest:

   ```html
   <template id="stat-tile">
     <div class="ui-card" ui:state="n: 0">
       <span ui:bind="text: label"></span>
       <b ui:bind="text: n + start"></b>
       <button ui:fx="click: set n = n + 1">+1</button>
     </div>
   </template>
   <div ui:use="#stat-tile" label="Users" start="120"></div>
   <div ui:use="#stat-tile" label="Repos" start="42"></div>
   ```

3. **Custom elements** — for distribution. The runtime exports `attach`; a custom element
   injects its `ui:*` markup, scopes itself with `sig` signals from its attributes, and
   consumers write `<x-counter label="votes" start="5"></x-counter>`.

The styling half of reuse is variants + tokens (next section) — a component varies through
the shipped catalog, never bespoke CSS.

## Structural enhancers and theming

Structural attributes map to shipped classes, a11y wiring, and platform behavior — copy
patterns from `/pages/` rather than inventing markup:

| Enhancer | Notes |
|---|---|
| `ui:stack` / `ui:row` | flex layout; `gap=1..8`, `align=start\|center\|end\|between` (cross axis; `center` does both), `between`/`wrap` (main axis) |
| `ui:card` | `variant=inset\|outline` |
| `ui:text` | `variant=title\|subtitle\|muted\|strong\|code` |
| `ui:badge` | `variant=brand\|danger\|warn\|success` |
| `ui:button` | `variant=primary\|ghost\|danger\|icon`, `block` |
| `ui:divider`, `ui:spacer size=1..8` | separation & rhythm |
| `ui:icon name=…` | `check`, `x`, `plus`, `search`, `chevron-down`, `dot`, `menu` |
| `ui:image ratio="3/2"` | aspect ratio + error-fallback class |
| `ui:field`, `ui:input`, `ui:textarea`, `ui:select`, `ui:checkbox` | form control classes |
| `ui:tabs` | `role=tablist/tab/tabpanel` markup with arrow-key navigation |

Theming is CSS custom properties — override `--brand`, `--bg`, `--ink`, `--muted`,
`--line`, `--danger`, `--r` (radius), `--ui-gap-*`, `--ui-text-*` in a `theme.css`.
Never write raw colors or sizes in markup; pick the token or the variant. Dark mode is
automatic via `light-dark()`.

## Overlays and platform APIs

leonui compiles onto the platform rather than around it:

- **Popovers** — `ui:popover` styles and wires an element that carries the native
  `popover` attribute, opened by a `popovertarget` invoker button; positioning uses
  CSS anchor positioning.
- **Modals** — plain `<dialog>` with `command="show-modal" commandfor="id"` buttons.
  Zero JS.
- **Transitions** — `ui:transition` wraps a handler in a view transition.
- **Tabs** — semantic `role=` markup; keyboard support comes from the shipped wiring.

## Debugging

- Every runtime warning lands in **`window.__ui.warns`** — unknown verbs and unknown
  `ui:*` attributes are warned *by name*, so typos surface instead of silently doing
  nothing.
- Failures are isolated per element during attach: one malformed attribute cannot break
  the page.
- The debug hook `window.__ui` also exposes signal internals for tests and tooling.

## Agent-first distribution

The framework's primary authors are coding agents, so the agent contract ships *with the
package*:

- [`skill/SKILL.md`](skill/SKILL.md) — the complete authoring grammar: attribute families,
  verb catalog, expression whitelist, enhancer variants, gotchas, and the dev-server mock
  API. It is in the npm `files` list — installing `leonui` installs the skill.
- In this repo, the agent-agnostic discovery copy lives at
  [`skills/leonui/SKILL.md`](../skills/leonui/SKILL.md) at the repo root, where any tool
  can find it. Install it into your agent by copying it to its skills directory (e.g.
  `.claude/skills/leonui/SKILL.md`), or point agents at the root
  [`AGENTS.md`](../AGENTS.md), which routes them to the skill before they can reach for
  React.
- `tests/skill.test.ts` asserts the repo-root copy and the packaged copy never drift, and
  that every `ui:*` name in `src/` is documented in the skill — the vocabulary table is
  enforced, not aspirational.

## Performance

Measured, not hand-written: `bun run bench` regenerates
[`benchmark.md`](benchmark.md) from real runs (identical page shape and ops across
frameworks, median of 5 runs in Chromium headless). Snapshot from 2026-09-25:

| Framework | Bundle (min / gzip) | Mount | Create 1000 | Update 100 | Replace 1000 | Remove 1000 |
|---|---|---|---|---|---|---|
| **leonui** | **27.1 / 9.2 KB** | 66.4 | 28.6 | 32.0 | 29.1 | 22.7 |
| react | 210.8 / 67.6 KB | 40.8 | 30.6 | 31.8 | 30.5 | 28.8 |
| vue | 184.2 / 69.0 KB | 38.9 | 29.5 | 31.7 | 29.9 | 26.6 |
| alpine | 57.1 / 20.3 KB | 27.8 | 56.4 | 31.9 | 38.7 | 11.0 |

(medians in ms, lower is better; the benchmark's own honest reading: the update op is
saturated — all four runtimes commit within a frame — and sub-10 ms gaps are machine
noise. The discriminating number is bundle size: the entire framework, stylesheet
included, ships in less code than any compared runtime. Full methodology and caveats in
[benchmark.md](benchmark.md).)

## Documentation

Run the dev server and open the docs — every example is live: the code block is the real
source file and the panel under it runs it.

```bash
bun run dev        # http://localhost:4700
```

- **`/docs/`** — GitBook-style tutorials: hello world → state & binds → lists → forms →
  server data (optimistic/rollback) → overlays → theming → components → verb reference.
- **`/pages/`** — the full component gallery; every variant of every enhancer. Copy
  patterns from here rather than inventing syntax.
- **`/docs/examples/`** — runnable singles (hello world, counter, two-way binding, list,
  server data, sortable, overlays, theming, `ui:use`, custom elements).

## Development

```bash
bun install              # deps: typescript + @types/bun (+ react/vue/alpine for comparisons)
bun run dev              # dev server on :4700 — pages, docs, mock API (PORT env overrides)
bun run build            # bundle src/ → dist/leonui.js (ESM) + dist/leonui.iife.js, minified
bun run typecheck        # tsc --noEmit — must stay clean
bun test tests/          # 61 tests across 9 files, real Chromium over CDP
bun run bench            # regenerate benchmark.md from measured runs
```

The test suite drives a locally cached Chromium headless shell over the DevTools protocol
with a dependency-free harness (`tests/harness.ts`): e2e for every component variant and
verb, CSS contracts (tokens, dark-mode flip, cascade-layer precedence), framework
comparison parity, skill/grammar consistency, and an agent emission audit. Artifacts land
in `tests/artifacts/`.

Dev-server mock API (used by the docs examples):

```
GET    /api/tasks          -> [{id, title, done}]     (?fail=1 -> 500, ?slow=1 -> +800ms)
POST   /api/tasks          {title} -> created task
PATCH  /api/tasks/:id      {done} -> updated
DELETE /api/tasks/:id      -> {ok}
POST   /api/__reset        -> restore seed data (test hook)
GET    /api/boom           -> always 500 (error-state testing)
```

### Structure

```
src/
  types.ts       Signal, Scope, Ast (discriminated union), Verb — the internals contract
  signals.ts     cells, ancestor-chain scoping, dependency tracking, observable warns
  parser.ts      whitelist expression language — typed AST, no eval, ever
  state.ts       ui:state declarations (incl. GET remote cells) + ui:computed
  binds.ts       ui:bind / ui:bind-<aspect> aspects + two-way ui:model
  each.ts        ui:each — keyed lists, minimal-move DOM alignment
  sortable.ts    ui:sortable — drag-to-reorder, immutable array rewrite
  enhancers.ts   structural attributes → shipped classes, a11y, platform wiring
  fx.ts          closed effect-verb catalog + onfail/onsuccess response gates
  sortable.ts    the ui:sortable drag primitive (Tier-3: author declares what)
  scan.ts        attach passes (isolated) + ui:use template components + attach() API
  cdn.ts         classic-script entry → dist/leonui.iife.js (window.leonui)
  boot.ts        full-tree boot + window.__ui debug hook
  cdn.ts         IIFE build entry: boots on load, exposes window.leonui
  index.ts       public entry — importing it boots the runtime
  ui.css         shipped stylesheet: @layer ui.tokens, ui.base
serve/           Bun.serve dev server: static pages + mock REST API
tests/           CDP harness + e2e, comparisons, grammar/skill/docs/sortable/audit suites
pages/           component gallery (served at /pages/)
docs/            tutorial site (served at /docs/) with live examples
skill/           the packaged agent-facing grammar (byte-identical to repo-root skills/)
```

## Browser support

leonui targets current evergreen browsers and builds on recently stabilized platform
capabilities: popover + invoker commands, CSS anchor positioning, view transitions,
`light-dark()`, `field-sizing`, and `moveBefore()`. There is no polyfill layer or legacy
fallback — the platform matrix is part of the design.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Security policy: [SECURITY.md](SECURITY.md).
Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Contributing and naming

The grammar is governed by policy, not taste — read [`naming.md`](naming.md) before
proposing new attributes or verbs. The short version:

- Two namespaces: native meaning stays bare; framework behavior is `ui:`-prefixed.
- Five families, extended only through five named doors: a new **aspect** (must mirror a
  DOM property), a new **verb** (must map to a platform capability), a new **enhancer**
  (must state its allowed host tags), a new **pure builtin** (must be side-effect-free),
  or — for everything else — a **custom element**, the designated escape valve.
- Every addition updates the vocabulary table (`skill/SKILL.md`) in the same commit;
  `tests/skill.test.ts` keeps skill, source, and docs in lockstep.
- The grammar budget: if the whole vocabulary can't stay teachable in-context, it's too
  big. When in doubt, leave it out.

House rules: `bun run typecheck` stays clean; the expression language stays a whitelist;
new behavior ships with a test in `tests/`.

## Status and known gaps

Pre-1.0 (`v0.1.0`). The core is exercised by 60 green tests over real Chromium, but known
v0 gaps are tracked and honest: subscriber disposal on row removal, reparenting
re-resolution, shadow-DOM scope crossing, and SSR are not yet solved. Post-1.0 rename
safety requires an ALIASES table (committed in `naming.md`) — until then, names can move.

## License

[MIT](LICENSE)
