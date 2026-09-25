---
name: leonxstream
description: Author interactive UI as plain HTML + leonxstream attributes (ui:state, ui:bind, ui:each, ui:fx) — the typed no-build reactive runtime. Use when creating or editing pages in a leonxstream project, building agent-authored UI, or when a task calls for declarative UI without build tooling.
---

# leonxstream

Typed reactive UI runtime. **HTML is the schema; the browser is the framework.** You author plain HTML plus four attribute families; a ~30 KB runtime (`dist/leonxstream.js`, auto-boots on import) provides signals, fine-grained binds, keyed lists, and a closed effect-verb catalog. No build step, no components, no vdom.

## The four attribute families

| Attribute | Meaning |
|---|---|
| `ui:state="name: value; name2: GET /url"` | Declare signals on an element. Descendants see them (nearest ancestor wins = scoping). Values: `'str'`, number, `true/false`, JSON array/object (single-quoted OK), `GET /url` remote cell → `{status, data}`. |
| `ui:bind="aspect: expr; aspect2: expr2"` or `ui:bind-<aspect>="expr"` | One-way bind, auto-tracked. Aspects: `text class hidden disabled checked open` and `attr:<name>` (e.g. `ui:bind-attr:href`). |
| `ui:model="path"` | Two-way bind on form controls. Writes the string `.value` — for checkboxes use `ui:bind-checked` + a `toggle` verb instead (booleans, not `"on"`/`""`). |
| `ui:each="item in listPath" ui:key="id"` | Keyed list. The template element is cloned per item; inside it, `item` is a signal in scope. Add `ui:empty`-style notices via `ui:bind-hidden="list.length != 0"`. |
| `ui:fx="event: verb; verb; …"` | Event → effect verbs (below). Events are DOM event names (`click`, `change`, `submit`…). `submit` is auto-preventDefaulted — forms never navigate. |

Plus: `ui:computed="name: expr"` (derived signal) and `ui:transition` (wrap the handler in a view transition).

## Effect verbs (closed catalog — no arbitrary JS)

```
set path = expr          toggle path
call METHOD /url [with {json}] [optimistic: set path = expr]
onfail toast 'msg'       (runs only when the previous call failed; rollback is automatic with optimistic)
toast expr               nav '#screen-id'        refetch cellName      # nav needs [data-screen] sections
prompt 'question' into path                      confirm 'question'   (guard: aborts remaining verbs if declined)
focus '#sel'             reset '#form-sel'       delay ms
```

Invariants (the runtime enforces these):
- Local (non-server) lists need unique ids: keep a `nextId` counter in state (`set notes = [ { id: nextId, … }, ...notes ]; set nextId = nextId + 1`) — do not derive ids from list length (collides after deletions).
- `reset '#form'` calls `form.reset()` and re-syncs `ui:model` paths only; checkbox/`ui:bind-checked` signals are NOT restored by it — pair it with explicit `set` verbs for booleans.
- A signal set to an unchanged value does not notify. If a control's initial DOM state differs from its signal default, bind the DOM default too: put `checked`/`selected` attributes on the control that match the declared defaults.
- `with {…}` bodies and `{path}` URL interpolations evaluate at **event time, before** optimistic mutations — write `call PATCH /api/t/{task.id} with { done: !task.done } optimistic: set task.done = !task.done`.
- Optimistic rollback restores pre-call values even if the set removed the row from the DOM.
- `call` sends no body unless `with` is given. Remote-cell shape: `{status: 'loading'|'ok'|'error', data}`.

## Expression language (whitelist AST — never eval'd)

Literals, dot paths, `.length`, `+ - * / %`, `== != < > <= >=`, `&& || ! ? :`, array/object literals with spread, and exactly these pure operators: `without(arr, item)`, `contains(str, sub)`, `first(arr)`, `sortBy(arr, key)`. Anything else — globals, method calls, assignment — is **rejected**. If you need an effect, use a verb; if you need new logic, add a pure operator in `src/parser.ts` (BUILTINS), never inline JS.

`?` ternary works; `:` after `?` is fine. Mid-list verbs may be written with or without a colon (`onfail: toast 'x'` ≡ `onfail toast 'x'`).

## Structural enhancers (classes + a11y come from the shipped `ui.css`)

`ui:stack`/`ui:row` (attrs: `gap=1..8`, `align=start|center|end|between`, `wrap`, `center`), `ui:card` (`variant=inset|outline`), `ui:text` (`variant=title|subtitle|muted|strong|code`), `ui:badge` (`variant=brand|danger|warn|success`), `ui:button` (`variant=primary|ghost|danger|icon`, `block`), `ui:divider`, `ui:spacer size=1..8`, `ui:icon name=check|x|plus|search|chevron-down|dot|menu`, `ui:image ratio="3/2"` (error fallback class), `ui:field`, `ui:input/textarea/select/checkbox` (control classes), `ui:popover anchor="#btn" placement=…` (platform popover + anchor positioning), `ui:modal` (plain `<dialog>` + `command="show-modal" commandfor="id"` buttons — zero JS), `ui:tabs` (role=tab/tablist/tabpanel markup; arrow keys included).

Theming: override CSS custom properties (`--brand`, `--bg`, `--ink`, `--muted`, `--line`, `--danger`, `--r`, `--ui-gap-*`, `--ui-text-*`) in a `theme.css`. Never write raw colors/sizes in markup — pick the token or variant. Dark mode is automatic (`light-dark()`).

## Page skeleton

```html
<!doctype html><html><head>
  <link rel="stylesheet" href="/src/ui.css">
</head><body ui:state="query: ''">
  <input ui:model="query">
  <p ui:bind="text: query == '' ? 'type…' : 'hello ' + query"></p>
  <script type="module" src="/dist/leonxstream.js"></script>
</body></html>
```

## Hard rules / gotchas

- Forms: `submit` handlers auto-preventDefault — safe to put `ui:fx="submit: …"` on a `<form>`. Buttons inside a form default to `type=submit`; use `type="button"` for click-only buttons inside forms.
- A disabled button does not fire `click` — don't bind `disabled` and the toggling verb to the same button.
- Duplicate `ui:bind` attributes on one element are dropped by HTML — use `ui:bind-class` / `ui:bind-checked` variants for additional aspects.
- `ui:fx` splits verbs on `;` — string literals inside expressions cannot contain `;`.
- `ui:key` defaults to `id` if omitted.
- `ui:popover` styles/wires an element that must still carry the native `popover` attribute and be opened via a `popovertarget` invoker button (see pages/overlays.html).
- State is visible only to descendants of the declaring element. Declare shared state on `<body>`.
- Arrays are replaced immutably (`set rows = [ {...}, ...rows ]`), never mutated in place. Use `without(rows, item)` to remove.
- One malformed attribute cannot break the page: failures are isolated per element and collected in `window.__ui.warns` — check it when debugging.
- Remote data states: gate with `ui:bind-hidden="tasks.status != 'ok'"` for loading/error/ok panels; `refetch tasks` re-runs the GET.

## Reusable components

A component is a subtree: markup + state + behavior together. Three reuse mechanisms:

1. **Scoped subtree** — any element with `ui:state` is an independent instance; copying the block duplicates the widget with isolated state.
2. **`ui:use` templates (default choice for repetition):**
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
   Host attributes become **prop signals** (coerced like `ui:state`; `id`/`class`/`style` stay layout, not props). `ui:state` inside the template is **per-instance**; behavior attaches per clone. Templates may nest `ui:use`. Live example: `/docs/examples/component-use.html`.
3. **Custom elements (for distribution):** the runtime exports `attach` — a custom element injects its `ui:*` markup, sets a scope on itself with `sig` signals from its attributes, and calls `attach(this)`. Consumers write `<x-counter label="votes" start="5">`. Live example: `/docs/examples/component-element.html` (+ `component-element.js`).

Styling half of reuse: variants (`variant="primary|ghost|…"`) and tokens — a component varies through the catalog, never bespoke CSS.

## Docs & live examples

The docs site with runnable examples for every subsystem lives at `/docs/` on the dev server (source in `docs/`, examples in `docs/examples/` — each example file is the single source of truth shown as code AND rendered live). Copy patterns from `/pages/` (full component gallery) or `/docs/` (tutorials).

## Dev loop

```bash
bun run dev            # serve pages + mock API (PORT env overrides; default 4700)
bun run build          # bundle src/ → dist/leonxstream.js (minified)
bun run typecheck      # tsc --noEmit (must stay clean)
bun test tests/        # 42 tests: e2e + framework comparisons (real Chromium via CDP)
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
