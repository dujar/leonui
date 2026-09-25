# leonspace ui — v0.1.0

A UI runtime where **HTML is the schema, the element prototypes are the runtime, and the browser is the framework**. Agents author plain HTML plus four attribute families; a ~600-line runtime provides signals with ancestor-chain scoping, auto-tracked binds, a closed effect-verb catalog, and keyed lists — compiled onto verified browser platform APIs. No build step, no vdom, no re-render.

## Run

```bash
node ui/server.mjs                # dev server on :4173 (pages + mock API)
node --test --test-force-exit "ui/test/*.test.mjs"   # e2e suite (37 tests, ~22s)
```

The suite drives a locally cached Chromium headless shell over CDP (dependency-free; see `test/harness.mjs`). Screenshots on demand land in `ui/test/artifacts/`.

## Authoring surface

```html
<body ui:state="filter: 'all'; tasks: GET /api/tasks">
  <input ui:model="query">
  <li ui:each="task in tasks.data" ui:key="id"
      ui:bind-hidden="filter == 'done' && !task.done"
      ui:bind-class="task.done ? 'ui-list-item done' : 'ui-list-item'">
    <span ui:bind="text: task.title"></span>
    <button ui:fx="click: call DELETE /api/tasks/{task.id}
                              optimistic: set tasks.data = without(tasks.data, task);
                   onfail: toast 'Delete failed'">✕</button>
  </li>
```

| Attribute family | Purpose |
|---|---|
| `ui:state="name: value; …"` | Declare signals (strings, numbers, bools, JSON, `GET url` remote cells) |
| `ui:computed="name: expr"` | Derived signal; recomputes on dependency change |
| `ui:bind="aspect: expr; …"` / `ui:bind-<aspect>="expr"` | Fine-grained one-way binding: `text class hidden disabled checked open attr:*` |
| `ui:model="path"` | Two-way bind on form controls |
| `ui:each="x in list" ui:key="k"` | Keyed list rendering (minimal-move alignment, `moveBefore()` where supported) |
| `ui:fx="event: verb; verb; …"` | Event → closed effect-verb catalog (below) |
| `ui:transition` | Wrap the handler in `document.startViewTransition` |
| `ui:stack / ui:row / ui:card / ui:text / ui:badge / ui:button / …` | Structural enhancers → shipped classes + a11y + platform wiring |

## Effect verbs (closed catalog)

`set` · `toggle` · `call METHOD /url [with {body}] [optimistic: set …]` · `onfail toast …` · `toast` · `nav '#screen'` · `refetch cell` · `prompt 'q' into path` · `confirm 'q'` (guard) · `focus '#sel'` · `reset '#form'` · `delay ms`

Invariants: request payloads (`with`, `{path}` interpolation) evaluate at **event time, before** optimistic mutations; rollback restores via pre-captured signal refs, so it works even if the optimistic set removed the row from the DOM.

## Expression language

Whitelist AST parsed once and interpreted — **no `eval`, ever**. Allowed: literals, paths, `.length`, `+ - * / %`, comparisons, `&& || !`, ternary, array/object literals, spread, and the built-in pure operators `without contains first sortBy`. Anything else (globals, method calls, assignments) is rejected at parse/eval with a named error. All runtime warnings are collected in `window.__ui.warns`.

## Component / variant matrix (all e2e-covered)

| Group | Component | Variants / behaviors tested |
|---|---|---|
| Layout | stack, row, card, divider, spacer | gap scale 1–8, align/between/center, wrap, card default/inset/outline |
| Content | text, badge, icon, image | title/subtitle/muted/strong/code; neutral/brand/danger/warn/success + dynamic class bind; sprite injection; broken-src fallback |
| Forms | field, input, textarea, select, checkbox, button | two-way model (input ⇄ textarea ⇄ signal), change events, checked ⇄ signal, 5 button variants + block + disabled bind, reset + focus verbs |
| Overlays | popover, menu, modal, toast | platform invokers (`popovertarget`, `commandfor show-modal/close`), anchor positioning + placements, ok/fail toasts into `role=status` host, prompt/confirm/delay verbs |
| Navigation | tabs, accordion, screens | aria-selected + panels + arrow keys, `<details name>` exclusivity, `nav` verb + view transitions |
| Data | list, remote cells, table, scopes | keyed add/drop/rotate/per-row remove, empty state, loading→ok→error + `refetch`, computed `sortBy` re-sort, nearest-scope shadowing |
| CSS | tokens, theming, layers | `--brand`/`--ui-gap-*` resolution, `light-dark()` flips under emulated dark scheme, unlayered app CSS beats `ui.base` |
| Integration | inbox app | real API CRUD with optimistic POST/PATCH/DELETE + rollback on failure, filter segments, search, count binds, zero uncaught errors |

## Known v0 gaps (tracked from the design review)

- No subscriber disposal on row removal (leak on delete; H2), no reparenting re-resolution, no shadow-DOM scope crossing, no SSR story.
- `onfail:` in mid-list verbs tolerates a colon (parser leniency); canonical form is `onfail toast '…'`.
- Server error mapping into signals (`call` response → signal) is roadmap; refetch reconciles instead.
- Native customizable-`<select>` theming (`appearance: base-select`) not yet wired.

## Files

```
ui/src/ui.js      runtime (signals, parser, binds, verbs, each, enhancers)
ui/src/ui.css     shipped stylesheet: @layer ui.tokens, ui.base
ui/pages/*.html   component gallery — every variant, loadable at /pages/
ui/server.mjs     static + mock REST API (latency/fail/reset switches)
ui/test/          CDP harness + 37-test e2e suite + debug probe
demo/tasks.html   earlier single-file design artifact (kept for history)
```
