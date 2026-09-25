# leonxstream — v0.1.0

The typed implementation of the leonspace ui framework, on **Bun + TypeScript**.

> HTML is the schema, the element prototypes are the runtime, the browser is the framework.

Agents author plain HTML plus four attribute families; a ~30 KB typed runtime provides signals with ancestor-chain scoping, auto-tracked fine-grained binds, a closed effect-verb catalog, and keyed lists — compiled onto verified browser platform APIs (popover + invoker commands, anchor positioning, view transitions, `light-dark()`, `field-sizing`, `moveBefore()`). No build step for authors, no vdom, no re-render.

## Commands

```bash
bun install                 # deps: typescript + @types/bun
bun run build               # bundle src/ → dist/leonxstream.js (browser, ESM)
bun run typecheck           # tsc --noEmit (strict, clean)
bun run dev                 # dev server on :4700 (pages + mock API)
bun test tests/             # 58 tests: e2e, framework comparisons, grammar guarantees (real Chromium via CDP)
bun run bench               # regenerate benchmark.md from measured runs (deliberate, not in tests)
```

The e2e suite drives the locally cached Chromium headless shell over the DevTools protocol with a dependency-free harness (`tests/harness.ts`) running under `bun:test`. Every component variant, behavior verb, and the CSS contracts (tokens, dark-mode flip, cascade-layer precedence) are asserted; artifacts land in `tests/artifacts/`.

## Structure

```
src/
  types.ts       Signal, Scope, Ast (discriminated union), Verb — the internals contract
  signals.ts     cells, ancestor-chain scoping, dependency tracking, observable warns
  parser.ts      whitelist expression language — typed AST, no eval, ever
  state.ts       ui:state declarations (incl. GET remote cells) + ui:computed
  binds.ts       ui:bind / ui:bind-<aspect> aspects + two-way ui:model
  each.ts        ui:each — keyed lists, minimal-move DOM alignment
  enhancers.ts   structural attributes → shipped classes, a11y, platform wiring
  fx.ts          closed effect-verb catalog (set/toggle/call/toast/nav/refetch/prompt/confirm/focus/reset/delay/onfail)
  scan.ts        per-element attach passes (isolated — one bad node cannot kill the page)
  boot.ts        full-tree boot + window.__ui debug hook
  index.ts       public entry; importing it boots the runtime
  ui.css         shipped stylesheet: @layer ui.tokens, ui.base
serve/
  app.ts         Bun.serve handler: static pages + mock REST API (fail/slow/reset switches)
  serve.ts       dev entry (bun run dev)
tests/
  harness.ts     CDP browser/page driver
  e2e.test.ts    37-test suite
pages/           component gallery — every variant, loadable at /pages/
dist/            built bundle (git-ignorable artifact of `bun run build`)
```

## Authoring surface (unchanged from the design)

```html
<body ui:state="filter: 'all'; tasks: GET /api/tasks">
  <li ui:each="task in tasks.data" ui:key="id"
      ui:bind-class="task.done ? 'ui-list-item done' : 'ui-list-item'"
      ui:bind-hidden="filter == 'done' && !task.done">
    <span ui:bind="text: task.title"></span>
    <button ui:fx="click: call DELETE /api/tasks/{task.id}
                              optimistic: set tasks.data = without(tasks.data, task);
                   onfail: toast 'Delete failed'">✕</button>
  </li>
```

Effect-verb invariants: request payloads (`with …`, `{path}` interpolation) evaluate at **event time, before** optimistic mutations; rollback restores via pre-captured signal refs, so it works even when the optimistic set removed the row from the DOM. All runtime warnings are collected in `window.__ui.warns`.

## Docs

`bun run dev`, then open **/docs/** — a GitBook-style tutorial site where every example is live: the code block is the real source file and the panel under it runs it. Hello world → state & binds → lists → forms → server data (optimistic/rollback) → overlays → theming → verb reference.

## Naming & growth

[`naming.md`](naming.md) is the grammar's rulebook for contributors: two namespaces with a
recognition test, five families with named satellites, a closed DOM-verbatim aspect list,
verb rules mapped to platform capabilities, the growth protocol (new vocabulary enters
only through five named doors — anything else is a custom element), and the grammar
budget. `tests/skill.test.ts` enforces that every `ui:*` name in `src/` is documented in
the skill, and the runtime itself warns on unknown verbs and attributes — typos are named
errors, never silent no-ops.

## Agent-first distribution

The framework's primary authors are coding agents, so the agent contract ships *with the package*:

- [`skill/SKILL.md`](skill/SKILL.md) — the complete authoring grammar (attribute families, 12 effect verbs, expression whitelist, enhancer variants, gotchas, mock API routes). Included in the npm `files` field, so installing `leonxstream` installs the skill.
- Install it into your agent tool by copying to its skill directory (e.g. `.zcode/skills/leonxstream/SKILL.md`, `.claude/skills/leonxstream/SKILL.md`), or point agents at [`AGENTS.md`](../AGENTS.md) at the repo root, which routes them to the skill before they can reach for React.
- `tests/skill.test.ts` asserts the workspace-discovered copy and the packaged copy never drift.

## Design lineage

- `ui/` — the plain-JS prototype (37-test green, kept as reference).
- Product/design history: `.agent-workbench/product/` (idea.md, prototype-runtime.md, judgment rounds) and `.agent-workbench/knowledge/browser-apis.md` (the verified 2026 platform matrix this runtime compiles onto).
- Known v0 gaps (tracked): subscriber disposal on row removal, reparenting re-resolution, shadow-DOM scope crossing, SSR.
