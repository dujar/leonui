# AgentUI — Round 2: the prototype-runtime pivot

**Status:** design proposal, unjudged
**Date:** 2026-09-25
**Supersedes:** the "schema-first + sugar notation" framing from idea.md (round 1). Round-1 judgment (judgment.md) is a live input: H1 killed the "become the default" ambition; H6 flagged that the only standalone-value piece was the verification wedge. This round is a rethink of the *runtime architecture* in response.

## Thesis

JavaScript is already the reactive language for HTML. React et al. were a detour: they inserted an intermediate representation (vdom, components, re-render) between state and a DOM that was already a live, mutable, event-emitting tree. The correct place for reactivity is **the element prototypes themselves** — because delegation is what prototypes are for, and the DOM's ancestor chain is already the composition primitive.

**The core isomorphism:** JS objects find properties by walking the prototype chain. The DOM finds context by walking the ancestor chain. Make signal lookup walk the ancestor tree, and the DOM tree becomes the prototype chain of application state. Scopes compose by nesting, not by component classes. The element *is* the component.

## The fundamentals (4 primitives, mixed under one frozen root)

Mixed onto `Element.prototype` / `Document.prototype` / `ShadowRoot.prototype` as a single non-enumerable `ui` property (one namespace, frozen, minimal collision surface with future platform APIs).

```js
// 1. SIGNAL — a cell; scopes resolve by walking ancestors
document.ui.signal('count', 0)        // declare anywhere; descendants see it

// 2. BIND — wire any aspect of an element to an expression; auto-tracks deps
el.ui.bind('text', $ => `${$.count} items`)

// 3. FX — event → bounded list of effect verbs (CLOSED vocabulary, same catalog as round 1)
el.ui.fx('click', [['set', 'count', n => n + 1],
                   ['call', 'POST /cart', { optimistic: true, rollback: true }]])

// 4. EACH (composite) — keyed list binding over a signal, moveBefore() where supported
list.ui.each('items', row => { row.ui.bind('text', $ => $.item.title) })
```

Reactive core sketch (~40 lines): `sig()` is a get/set cell with a subscriber Set; `bind()` runs the expression with dependency tracking (a module-level `reading` set captures signals touched during evaluation, subscribes the update fn); `$()` walks ancestors (`parentElement`, crossing shadow boundaries via `host`) merging scope maps; `fx()` maps an event to the closed verb list; `each()` does keyed diffing. Fine-grained by construction: a binding updates one aspect of one element. No vdom, no re-render, no compiler, no build step — one `<script type="importmap">` (Baseline widely available, verified) and it runs.

Closed effect-verb catalog (carried over from round 1's tier system, unchanged): `set, toggle, call, nav, refetch, toast, prompt, confirm, focus, reset, delay` — plus primitives that own interaction complexity (Tier 3: DragList, Stepper, Form, InfiniteList, etc. as form-associated custom elements) and statecharts for complex flows (Tier 4). The interaction-tier design from the conversation stands.

## Why this beats the round-1 framing (claimed)

1. **Agent grammar rides HTML gravity, not against React's.** Round 1 fought React's training-data gravity with a 2,000-token in-context grammar. This rides HTML's gravity instead — older and larger. The delta from stock HTML is ~5 binding attributes (`ui:bind="text: count * 2"`, `ui:fx="click: set count+1; call POST /cart"`). The JSON schema demotes itself to an optional serializer of this, not the source of truth.
2. **Verbs compile to verified platform APIs** (see knowledge/browser-apis.md): `nav` → Navigation API + same-doc view transitions (both Baseline 2026/2025); `toggle`/`show` → popover + `commandfor` invokers (often pure markup, no JS at all); `call` optimistic/rollback → set-then-undo on signals (the thing htmx never had); `each` → `moveBefore()` (Chrome+Firefox; Safari fallback owned by the primitive).
3. **Verification gets stronger.** Bindings and handlers are attributes and prototype calls — greppable, statically checkable text ON the tree. `ui check` lints fx verbs against the closed catalog, flags binds referencing undeclared signals (ancestor lookup is statically approximable); `ui tree` dumps structure + bindings + handlers as text. React hides interaction inside closures; here every behavior is visible at its element — locality of behavior as a static-analysis contract.
4. **Interop unchanged from round 1's verdict.** Primitives are form-associated custom elements (DSD + ElementInternals, Baseline); React hosts embed them; React components register into the catalog. Coexist, never replace — the htmx lesson.

## Acknowledged hazards (from the design discussion)

- Prior art exists in fragments: Alpine.js = this minus the closed verb vocabulary; Vue 3 = this plus components; TC39 Signals proposal = the `sig()` cell heading for standardization (build on `Signal` when it lands). The claimed novelty is the composition: closed fx-verb catalog + ancestor-chain scoping + agent verification CLI + verified platform compile targets.
- Prototype patching is still patching (mitigated: one frozen `ui` root).
- SSR is weaker than React's: DSD covers first paint, bindings attach after load; progressive enhancement is the story, not full SSR parity.
- Fine-grained bindings at ~10k+ bindings need a scheduler (`scheduler.yield`).
- `ui:fx` expressions in strings are a code-in-attributes surface — needs a sandboxing/story (round 1's schema had the non-Turing-completeness safety pitch; this form reintroduces executable strings).

## Open questions for the judge

1. Is the ~40-line core actually sound as drawn (ancestor-chain scope resolution, shadow-boundary crossing, the WeakMap scoping, the elided `each`), or does the sketch hide a real complexity iceberg?
2. Does the HTML-gravity argument hold, or does it cut against us: agents are trained on React-shaped code, so is "agents already know HTML" another unconstrained-gravity assumption like the one H1 killed?
3. Did we just invent Alpine with a verb catalog? What is the falsifiable delta vs Alpine.js + htmx attributes + the TC39 Signals proposal?
4. Does string-expression reactivity destroy the static-analysis/verification pitch (the strongest surviving asset from round 1), and can a no-eval, closed-verb subset survive real apps?
5. What is the product now — is v1 one thing? (Runtime? Verification CLI? Agent skill?) And what is the cheapest days-scale test of the riskiest assumption?
