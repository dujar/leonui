# leonui — naming philosophy (v0.1 draft)

The grammar is the product. Agents learn it in-context; humans grep it; contributors extend
it. This document is the rulebook for naming anything the framework authors, so growth is
governed by policy instead of taste. Everything below is checkable against the one
authoritative vocabulary table: `skill/SKILL.md`.

## 1. Two namespaces, one test

- **`ui:*`** — every attribute the framework defines or consumes.

**The test:** *"Would a hand-written HTML author already recognize this meaning?"*
Native meaning stays bare (`popovertarget`, `commandfor`, `value`, `href`). Framework
behavior is `ui:`-prefixed. When in doubt: prefix.

Bare attributes are invented only in these licensed lanes:
1. **enhancer props** (rule 4);
2. **`ui:use` component props** — a component instance is an element, and its props are
   attributes, by the same logic as rule 4;
3. **native extension points** the platform reserves for authors: `data-*`, `aria-*`,
   `role` (e.g. `data-screen` marks nav screens).

Anything bare outside these lanes is a bug. Every `ui:*` attribute must appear in the
vocabulary table (`skill/SKILL.md`) — enforced by `tests/skill.test.ts`.

## 2. The `ui:` space has five families — heads plus named satellites

| Family (verb of authorship) | Answers | Head | Satellites |
|---|---|---|---|
| **declare** | what data exists | `ui:state` | `ui:computed` (derived cell) |
| **react** | how it shows | `ui:bind` / `ui:bind-<aspect>` | `ui:model` (two-way; Alpine precedent) |
| **repeat** | how it repeats | `ui:each` | `ui:key`, `ui:sortable` (family flag) |
| **act** | what it does | `ui:fx` | `ui:transition` (family flag) |
| **compose** | what it composes | `ui:use` | — |

Family **heads** are single lowercase words, ≤5 letters, no numbers, never abbreviated
forms of something longer. `fx` is the one licensed abbreviation — event-handler
tradition, shorter than `effect`, unambiguous inside `ui:`. Satellites read as
`<head-word> + one modifier` (`ui:computed` derives state; `ui:key` keys a repeat).

**Value sentinels** (things written inside a `ui:state` value slot, like `GET /url`)
are UPPERCASE protocol words, one per named platform capability, declared in the
vocabulary table. `GET` (fetch) is the first; a second transport (e.g. `WS`) enters
through this rule, never as a new family.

New top-level families are **strongly discouraged**: growth extends existing families
(new aspects, new verbs, new enhancers, new sentinels). A new family requires a
capability that genuinely is none of declare/react/repeat/act/compose.

## 3. Aspects are DOM names — and the list is closed

A bind aspect is named after **exactly what it writes**: an existing DOM property
(`hidden`, `disabled`, `checked`, `open`) or one of exactly two licensed shortenings of
an HTML attribute name (`textContent`→`text`, `className`→`class`); `attr:<name>` writes
any attribute verbatim. Rule: *the learning set for aspects is the DOM itself, not our
vocabulary.*

The aspect list is **closed**: new aspects enter only through rule 7.1, and a proposal
must name the DOM interface it writes and its value semantics (a `style` aspect, if ever
proposed, must state whether it writes `cssText` or merges declarations — "just style it"
is not a specification). If a proposed aspect has no DOM counterpart, it is `attr:…`,
a custom element, or it does not belong in a bind.

## 4. Enhancers simulate custom elements; their props are bare

`ui:card`, `ui:stack`, `ui:button`, `ui:tabs` … are lowercased UI **nouns** named after
what the user *sees* (never the implementation: `ui:flexbox` is a bug). An enhancer's
props are **bare adjectives/nouns** (`gap`, `align`, `wrap`, `center`, `variant`,
`block`, `ratio`, `name`, `anchor`, `placement`, `size`) — exactly as if the enhancer
were a native element: `<stack gap="2">` reads like `<input value="…">`. Props must be data-only (serializable). Each enhancer **states its allowed host tags**
in the vocabulary table, which makes the collision rule checkable: a bare prop that HTML
defines is off-limits on hosts where HTML gives it meaning (a `name` prop may live on a
decorated `<div>`, never on an `<input>`). Axis-carrying props (`align`) must document
which axis they move — `ui:row align` moves the **cross** axis; `center` does both axes.

## 5. Flags: state what becomes true

Behavior flags are `ui:`-prefixed **adjectives or nouns-read-as-modifiers** on the
family they modify (`ui:sortable` on `ui:each`, `ui:transition` on `ui:fx`). Enhancer-
local presentation flags stay bare (`wrap`, `center`, `block`) because they are enhancer
props (rule 4).

## 6. Verbs: one English word, mapped to a platform capability

`set toggle call nav refetch toast prompt confirm focus reset delay`.
A verb is (a) one lowercase English verb or verb+particle, (b) implemented on top of a
**named platform capability** (fetch, popover, view transitions, focus()) or a whitelisted
pure builtin, (c) documented with its failure story. Unknown verbs are a named error,
never a no-op.

Alongside the verbs, `ui:fx` lists carry **response gates**: `onfail` / `onsuccess`
run their payload only when the last `call`'s outcome matches, and never abort the
list (`onfail toast '…'; onsuccess toast '…'; toast 'done'` is the common paired
idiom — exactly one branch fires, shared verbs after them always run). They follow
the DOM `on*` handler tradition and are not verbs. Sub-keywords elsewhere are
lowercase English words (`with`, `into`, `optimistic:`). No symbols, no abbreviations
(`nav` is grandfathered as ≤3 letters and universally read; do not add new 3-letter
abbreviations).

## 7. Growth protocol (the open-source rule)

New vocabulary enters **only** through one of:
1. new **aspect** — must mirror a DOM property (rule 3);
2. new **verb** — rule 6, with platform mapping stated;
3. new **enhancer** — rule 4, with shipped class and/or behavior wiring plus its allowed
   host tags;
4. new **pure builtin** in the expression whitelist (`without contains first sortBy join…`)
   — must be side-effect-free and generically useful;
5. **anything beyond these = a custom element**, which is the designated escape valve
   for library authors — the page grammar stays closed and checkable.

Each addition updates the vocabulary table (`skill/SKILL.md`) in the same commit.
Pre-1.0 renames: old name becomes an alias for one minor version, with a `warns` entry.
An ALIASES table in the runtime is a **1.0-blocking commitment** — post-1.0 renames
without it break every published page.

## 8. Known cost: the colon

`ui:` taxes every user-written CSS selector (`[ui\:model]`) and reads as an XML namespace.
Alternatives (`data-ui-*`, `x-`, bare) were weighed: `ui:` wins on greppability, zero
collision with HTML evolution, and one-character-per-name brevity. Acknowledged cost;
revisit only pre-1.0 with a migration benchmark.

## 9. The grammar budget

The entire vocabulary must stay teachable in-context (target: the full grammar spec
≤ ~2,000 tokens). Every proposal states its token cost. When in doubt, leave it out —
an agent that can hold the whole grammar in its head is the product's reason to exist.
