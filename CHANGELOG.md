# Changelog

All notable changes to leonui are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows semver.

## [Unreleased]

An accuracy-and-performance review pass over the runtime, its tests, and its
documentation. Every fix below is pinned by `tests/accuracy.test.ts`.

A second pass closes the gap that mattered most for the framework's stated purpose —
*an agent writes UI from the skill and verifies it came out as expected*. The grammar was
documented as a closed vocabulary but enforced as an open one: a value nothing understood
produced a class nothing styles, silently.

### Added

- **The vocabulary is declared once (`src/vocab.ts`) and enforced twice.** It holds every
  `ui:*` attribute name, the bind aspects, the verb + response-gate catalog, the icon
  names, the `ui:state` sentinel (`GET`), and each enhancer's props with their value
  vocabularies — closed sets, inclusive ranges (`gap=1..8`), patterns (`ratio="3/2"`) —
  plus allowed host tags and required native attributes. The runtime and the checker read
  this one table, so a page can never disagree with `ui check`.
- **`ui check` — browser-free static verification.** `bunx leonui check [paths…] [--json]
  [--quiet]` reports the same findings the runtime would warn about, *before* anything
  renders, as `file:line:column`, and exits non-zero on error so it works as a gate. It
  reads `vocab.ts`, `parser.ts` and `fx.ts` directly and cannot drift from the
  implementation. Shipped as the `leonui` binary (`dist/cli.mjs`), a module
  (`leonui/check`) and the table as data (`leonui/vocab`).
- **Named warnings where there used to be silence**: a prop value outside its vocabulary, a
  *misspelled prop name* (`varient="primary"` previously rendered the default variant and
  said nothing), an enhancer on the wrong host, and a state sentinel with no operand
  (`n: GET`). A rejected value falls back to the enhancer's default; a wrong host means the
  enhancer does not run at all — there is no default host to fall back to.
- **Tests**: `tests/vocab.test.ts` (the table, and the runtime wiring) and
  `tests/check.test.ts` (checker units, CLI exit codes, and a zero-findings pass over the
  whole shipped gallery — the false-positive guard).

### Fixed

- **`ui:each`: duplicate keys are no longer silent.** Two items sharing a key can only
  ever be one row, so the runtime now warns
  (`ui: each duplicate key "7" (ui:key="id") — later item wins`) and applies the later
  item to the existing row instead of losing an item without a word.
- **`ui:each`: rows release their subscriptions.** A row's binds subscribe to signals
  that may live far above it; when the row left the list those subscriptions stayed
  attached, so a page-level signal accumulated dead subscribers as the list churned.
  Rows now record what they subscribed to and dispose it on removal (measured: 5 live
  subscribers → 2 for a 2-row list).
- **`ui:state`: one literal grammar.** Array/object literals are parsed by the whitelist
  expression parser instead of a JSON repair path, so values the parser accepts — e.g.
  `{ note: "it's fine" }` — no longer fail at declaration time; malformed number literals
  (`1.2.3`) are rejected rather than coerced.
- **`ui:state="n: GET"` is an error, not the string `"GET"`.** The remote-cell test was
  `/^GET\s/`, which a bare `GET` fails — so the value fell through to the literal branch
  and the cell silently became `"GET"`. The runtime now warns and parks the cell in the
  error state, and `ui check` reports it. The runtime and the checker shared the bug,
  which is exactly why the sentinel now lives in one table.
- **Remote cells: stale responses are discarded.** A slow first `GET` could overwrite the
  result of a newer request on the same cell. Each cell now tracks its latest request
  sequence and ignores responses that a newer request has superseded.
- **`attach` is idempotent.** Importing the bundle from both a page script and a component
  script (or calling `attach` twice) used to stack listeners and reset state; the runtime
  now records what it has already wired and attaches each element once.
- **`reset` matches its documentation.** The verb skipped nothing when re-syncing
  `ui:model` paths, so it wrote a string into checkbox/radio/file and `multiple` select
  models. Those controls are now skipped, as `skill/SKILL.md` always said they were.
- **`ui:tabs` keyboard support is complete** — Home/End now move selection and the key is
  consumed.
- **`ui:sortable` drop is a no-op when the order did not change**, instead of rewriting the
  array and re-rendering the list.
- **Expression parser:** double-quoted string literals and quoted object keys are accepted
  (`{ note: "it's fine" }`), so the declaration grammar no longer depends on which quote
  style a value happens to use.

### Changed

- `attach`'s hot path takes one attribute snapshot per element and skips `ui:*` names in
  the DOM-property pass; the optional-attribute verification map folded into the same skip
  list. Runtime grows ~1.4 KB minified for the correctness fixes above.
- **Runtime grows a further ~4.6 KB minified / ~1.7 KB gzipped** (23.2 → 27.8 KB minified)
  for the vocabulary table and its validation — the price of turning silent no-ops into
  named warnings. A project that would rather not pay it in the browser can keep the CLI
  and drop the runtime half, at the cost of warnings only appearing in CI. `benchmark.md`
  regenerated from measured runs.
- `ui:icon` builds its sprite reference with the DOM API instead of `innerHTML`; the
  enhancer no longer string-builds markup from an attribute value.
- Documentation corrected to match: `skill/SKILL.md` (+ its byte-identical twin) now states
  the enhancer value vocabularies and host contracts in the vocabulary table, documents the
  fallback/skip semantics, and gains a **Verifying a page** section; `naming.md` rules 2, 4
  and 6 record the sentinel, value-vocabulary and host requirements and where they are
  enforced; `README.md`, `AGENTS.md` and `benchmark.md` carry the new sizes and the checker.
  Hardcoded test counts were removed from the docs — they had already gone stale twice.

### Added

- `tests/accuracy.test.ts` + `tests/fixtures/accuracy.html` — 7 regression tests covering
  literal coercion, duplicate keys, row teardown, attach idempotence, tabs Home/End, `reset`
  semantics, and the remote-cell race. Suite: 61 → 71 tests across 11 files.
- `window.__ui` now exposes `attach`, `coerce`, `subCount`, and `verbs` (the last derived
  from `src/fx.ts`, so the catalog cannot drift from the implementation).

### Documentation

- **`benchmark.md` bundle sizes are now like-for-like.** Every framework row is framework
  JS only; leonui's stylesheet was previously summed into its row while the other three
  rows carried no CSS at all. The stylesheet is now reported separately (9.9 KB / 2.7 KB
  gzipped) alongside the runtime-only figure (23.2 KB / 8.7 KB gzipped).
- **The previous bundle table was stale, not just mislabelled:** it had been generated
  before the v0.2.0 cross-file `ui:use` feature and never regenerated, understating the
  runtime by ~4.6 KB minified. `benchmark.md` now says so, and says the `mount` column is a
  single sample that must not be read as a ranking.
- **`leonui/README.md`** no longer restates measured numbers (which `benchmark.md` owns and
  every run moves) — it summarises them; it also drops subscriber-disposal from "known
  gaps" (now solved), corrects the test count, and de-duplicates `sortable.ts`/`cdn.ts` in
  the structure listing.
- **`skill/SKILL.md`** (and its byte-identical repo-root twin): current bundle figures,
  duplicate-key semantics, `reset` scope, attach idempotence, the remote-cell guarantee,
  and quoted-literal support.
- **`naming.md`** rule 4 required every enhancer to state allowed host tags in the
  vocabulary table, which the table did not do and the runtime does not enforce. The rule
  now states the requirement precisely — a host restriction is required where a bare prop
  collides with HTML-meaningful attribute names. The verb list is aligned with `VERBS` in
  `src/fx.ts`, and a non-existent builtin (`join`) was removed from the growth examples.

## [0.2.1] — 2026-09-25

### Added
- `docs/` now ships in the npm package — the tutorials, component gallery
  examples, and component files are readable offline and loadable from CDNs
  (jsDelivr sends CORS headers, so cross-file `ui:use` works straight from
  the CDN).

## [0.2.0] — 2026-09-25

### Added
- **Cross-file components**: `ui:use="/components/card.html#card"` imports a
  component template from its own file — fetched once, cached per url#id,
  script-stripped by design. Props, per-instance state, behavior, and nesting
  work identically to same-document templates
  (`docs/examples/component-files.html`).
- Governance for the open-source lifecycle: CONTRIBUTING.md (PR standards,
  slop reject-list), MAINTAINERS.md (review bar, judge-loop, release process),
  PR/issue templates, CI workflow (typecheck + full Chromium suite per PR),
  CHANGELOG, CODE_OF_CONDUCT, SECURITY policy, README badges.

### Fixed
- `ui:use` host props no longer capture `data-*`/`aria-*` (naming.md rule 1).
- Version honesty: `package.json` is the single source of truth for the
  reported runtime version.
## [0.1.2] — 2026-09-25

### Fixed
- The runtime now reports its **true version**: `package.json` is the single
  source of truth (the bundler inlines it) — 0.1.1 shipped reporting "0.1.0".
- Release process documented: the demo page's `ver:` bump is enforced by the
  e2e suite.

## [0.1.1] — 2026-09-25

### Fixed
- `ui:use` host props: `data-*`/`aria-*` attributes stay native lanes and are
  no longer captured as component prop signals (naming.md rule 1).

### Changed
- Internal cleanup in `enhancers.ts` / `scripts/bench.ts`; documentation sync
  (prop rule, counts, structure).

## [0.1.0] — 2026-09-25

First public release.

### Added
- Typed reactive runtime: signals with ancestor-chain scoping, auto-tracked
  fine-grained binds, `ui:computed`, keyed `ui:each`, remote `GET` cells.
- Closed effect-verb catalog (`set toggle call toast nav refetch prompt
  confirm focus reset delay onfail onsuccess`) with event-time payloads and
  captured-ref optimistic rollback.
- `ui:sortable` drag-to-reorder primitive (desktop HTML5 DnD).
- Components: scoped subtrees, `ui:use` template components (same-document),
  custom-element packaging via the exported `attach()`.
- Structural enhancers over platform APIs: popover + invoker commands, anchor
  positioning, view transitions, `light-dark()` theming, `field-sizing`.
- Whitelist expression language (no eval) with named warnings in
  `window.__ui.warns`.
- Shipped design system (`src/ui.css`): tokens, cascade layers, variants.
- Tooling: Bun/TypeScript build, 61-test e2e suite over real Chromium (CDP),
  React/Vue/Alpine comparison tests, measured benchmark (`bun run bench`),
  GitBook-style docs with live examples at `/docs/`, agent skill shipped in
  the package.
