# Changelog

All notable changes to leonui are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows semver.

## [Unreleased]

A third pass closes the two remaining gaps in the same contract — the vocabulary was
enforced everywhere except where an attribute only means something next to another one,
and the authoring agent's copy of the table was the last hand-maintained one — and makes
animation a first-class, verifiable part of the grammar.

A fourth pass puts that work under adversarial review. Four independent judges were asked
to find what it got wrong; three came back with blockers. Two were places where the
branch's own guarantees could not hold. The third was the one that matters most: a class of
markup the runtime and `ui check` disagreed about, with each half passing its own tests
while they said different things about the same file. The two verifiers exist to be compared
with each other, so there is now a test that does exactly that on one source.

### Added

- **The companion-attribute contract.** `ui:key`/`ui:sortable` without `ui:each`,
  `ui:transition` without `ui:fx`, and `ui:model` on anything that is not
  `input`/`textarea`/`select` were all silent. `src/vocab.ts` now states them in three named
  maps — `COMPANIONS`, `CORE_HOSTS`, `CORE_PROPS` — and a new `requirementPass` runs **above
  every other attach pass**, which is where it has to run: each of those attributes is read
  in exactly one place, and that place only runs once the partner is already present, so the
  pass that would have noticed is the pass that never ran. A missing companion or a wrong
  host warns and **skips**; a bad core value warns and falls back to the default. `ui check`
  reports all of it before render. A tag containing `-` is a custom element by
  specification, so `CORE_HOSTS` never second-guesses one — the runtime refuses only what it
  can be certain about.
- **`ui:key`'s value is a property name, not a path.** `ui:key="row.id"` keys every row by
  index, silently. It is now validated by pattern (`CORE_PROPS`) and named by both halves.
- **`ui:reveal` — entrance animation, one attribute.** `from=fade|up|down|left|right|zoom`
  (default `up`), `trigger=scroll|load`, `stagger=0..8` (80 ms steps, via
  `--ui-reveal-delay`). Two guarantees are the point, and both are tested: the armed state
  is scoped to `.ui-reveal-ready` on `<html>` — a class only the runtime sets — so a page
  whose bundle 404s, whose CDN is blocked, or where JS is off renders **fully visible**; and
  the whole motion block sits inside `@media (prefers-reduced-motion: no-preference)`.
- **The skill's grammar table is generated, not hand-written.** `scripts/grammar.ts` renders
  it from `src/vocab.ts` between `BEGIN/END GENERATED` markers in `skill/SKILL.md` and its
  repo-root twin, and dumps `grammar.json` for each. `bun run grammar` writes;
  `bun run grammar:check` exits 1 if any of the four is stale. The table was the third
  consumer of the vocabulary and the only hand-maintained one, so it was free to drift — and
  did (a missing *name*; a missing *value* or a wrong *host* would have been silent). Proved
  load-bearing by mutation: adding a bogus badge variant makes `grammar:check` list all four
  files and the skill test fail.
- **A vocabulary entry with no implementation is now named** —
  `ui: <attr> is declared in the vocabulary but not implemented — no effect` — with a test
  that pins both directions (`vocab: every declared enhancer is implemented, and every
  implementation declared`). `ui:use` without a `#id` is a named checker finding too, and
  `focus`/`reset` now name a missing target (`ui: focus target not found: …`,
  `ui: reset target is not a <form>: #txt (found <input>)`) instead of doing nothing,
  matching `nav`'s existing wording.
- **`ui:computed` takes one declaration per element** (unlike `ui:state`/`ui:bind`, which
  split on `;`). The checker's honest answer used to be `trailing input "; bizPrice: …"`;
  it now names the cause.
- **`pages/landing.html`** — a whole startup landing page written in the grammar: sticky
  header with a native popover mobile menu, radial-gradient hero, token-built "screenshot"
  with animated bars, a CSS marquee logo band, a six-card feature grid, four stats that
  animate on scroll, a billing toggle driving three pricing tiers, a testimonial, a
  `<details>` FAQ and a closing form that toasts then clears. Plus four focused examples
  (`docs/examples/{hero,pricing,stats,faq}.html`), each embedded and running in the new
  `docs/landing-patterns.html`.
- **Tests**: `tests/motion.test.ts` (9) and `tests/landing.test.ts` (8). `tests/docs.test.ts`
  now scrapes `data-example=` from the docs pages and **boots every embedded example,
  asserting zero runtime warnings**, so the docs cannot silently acquire a broken example.
  `tests/vocab.test.ts`, `tests/check.test.ts`, `tests/skill.test.ts`, `tests/accuracy.test.ts`
  and `tests/remotecomponents.test.ts` gained the new-guard cases.
- **`tests/parity.test.ts` — the two verifiers, compared on one source.** `ui check` and the
  runtime are two halves of one promise, and until this file nothing tested that they agree:
  each half was tested against its own expectations, so a finding one made and the other
  missed was invisible, and the suite could be fully green while the contract was broken.
  One markup string goes to both halves and the findings are compared one for one, including
  the case where the halves *must* differ — the three findings that are runtime-only because
  no scanner can see them — so an intentional difference cannot quietly become an accidental
  one. Suite: 105 → **164 tests across 18 files**.
- **`dismiss` — a verb for closing the overlay you are inside.** A popover can only be
  *closed* from a button: `popovertargetaction="hide"` and `command="hide-popover"` apply to
  `<button>` and to nothing else. So the most common popover there is — a mobile menu made of
  `<a href="#section">` links — has no way to close itself when a destination is picked, and
  stays open over the page the reader just asked for. `ui:fx="click: dismiss"` closes the
  nearest open popover or `<dialog>` by walking outward, and names the miss when there is
  none. It takes no argument on purpose: a selector would let you close an overlay other than
  the one you are in, which is the same quiet wrong answer as `ui:key="row.id"`.
- **`ui:popover` keeps every invoker's `aria-expanded` equal to the popover's real state.**
  The platform opens and closes the popover but never writes the state back to the button, so
  a screen reader was told "Open menu" whether the menu was open or shut. Invokers are looked
  up on each sync, not captured once, because a popover and its button can attach in either
  order. A popover with no invoker — one opened by script — is left alone entirely.
- **Contrast is now measured, not asserted.** `tests/a11y.test.ts` reads the pixel actually
  rendered behind every text node on every shipped page, in both colour schemes, and fails on
  anything below AA. Nothing in the suite had ever looked at a rendered colour, which is why
  four shipped combinations failed without anyone noticing (see Fixed). The measurement is
  what took the work: the obvious ways to screenshot a tall page are both wrong, and both were
  tried first — `captureBeyondViewport` resizes the visual viewport *for the capture*, so
  every rect measured beforehand points at the wrong pixel (a stat span moved 1851 → 1827);
  and clipping without it returns everything below the fold unpainted, which turns every
  button into white-on-white at 1.05:1. The viewport is grown to the document instead, which
  is a real viewport, so the layout is byte-identical before and after the shot.

### Fixed

- **`ui check` verified nothing when invoked the documented way.** The CLI never stripped
  its own `check` subcommand from `argv`, so the no-path form — `bunx leonui check`, the
  form the skill tells an agent to run before saying it is done — treated the word `check`
  as a directory, found nothing, printed `checked 0 files` and exited 0. It only ever
  appeared to work when a path was passed, which is why every existing CLI test (all of
  which pass a directory) missed it: the stray target resolved to a non-existent directory
  and was skipped in silence. A path that does not exist is now a usage error (`exit 2`)
  rather than a file with nothing wrong in it, so a typo in a CI gate cannot read as a pass
  either. Two tests pin both halves.
- **The reveal animated backwards on load.** A transition runs when the *new* computed style
  declares one, so declaring it on the armed state made arming animate too: every reveal
  element slid and faded *out* before sliding in. Caught by sampling the computed
  `translate` — it was mid-flight at `0px 0.99px`, the opposite direction from expected —
  not by a class-name assertion, which would have passed with nothing moving. The transition
  now lives on `[ui\:reveal].ui-reveal-in` and arming is instant, pinned by
  `assert.equal(transitionDuration, '0s', 'nothing transitions while arming')`.
- **The stat bars were armed unconditionally** (`transform: scaleX(0)` outside any guard),
  so a reduced-motion reader — and a reader whose bundle 404'd — was left with no bars at
  all. Both animated-bar rules are now wrapped in `.ui-reveal-ready` +
  `prefers-reduced-motion: no-preference`.
- **`discoverChrome()` did not know the macOS Playwright layout**, so the suite failed with
  `no chromium binary found` on macOS. It now checks `chrome-mac`/`chrome-mac-arm64` and
  `chrome-headless-shell-mac-*`, and falls back to `/Applications/Google Chrome.app/…` and
  the Linux paths; `launch()` passes `--headless=new` for a full Chrome but not for a
  headless shell. `Page.reducedMotion()`/`colorScheme()` used to replace the whole emulated
  media-features array, so setting one silently cleared the other — the harness now
  accumulates them through one private `emulate()`.
- **Landing-page layout**: anchors landed under the sticky header (fixed with
  `scroll-margin-top: 4.75rem` on `[id]`), and tier CTAs did not line up across unequal copy
  lengths (fixed with a column-flex tier and `margin-top: auto` on the CTA).
- **The reveal could never appear on an element anchored to the viewport.** The scroll
  trigger's `-12%` bottom rootMargin is a band an element has to be able to *leave*, and a
  `position: fixed` bar never moves relative to the viewport: it starts inside the band and
  stays there, so intersection never fires and it sits at opacity 0 for the life of the page
  *with the runtime running* — the one thing arming the hidden state may never do. Anything
  already on screen when it arms is now revealed on the next frame; the margin keeps its
  meaning for everything below the fold.
- **A mistake inside a `ui:each` template was invisible when the list was empty** — and this
  is the halves disagreeing, not merely a miss. The static passes ran on the `ui:each` element
  only, and the rows that would have carried a child's requirement never existed, so an empty
  list warned nothing while `ui check`, which reads the markup, reported it. The template
  subtree is now walked once at the `ui:each` site: one mistake is reported once rather than
  once per item, and reported even when there are no items.
- **`stagger` could not cascade.** The skill promised a list whose rows arrive one after
  another; every row computed the same constant, because an attribute on the element cannot
  know where its row sits. `attachSubtree` now receives the row index, so `stagger="1"` over
  three rows is 0/80/160 ms.
- **A `ui:each` row silently ignored `ui:state`/`ui:computed`/`ui:each`/`ui:use`.** A row runs
  the bind, enhancer and effect passes only — declare and compose belong to the page — so
  those four did nothing at all inside a template. A silent no-op is the one thing this
  vocabulary may not contain, so it is now named once per source element.
- **`ui check` was validating a value the runtime does not read.** The runtime does
  `item[getAttribute('ui:key')]`; it does not trim. `ui:key=" id "` therefore looks up the
  property `" id "`, finds nothing, and keys every row by index — while the checker trimmed
  first and passed the page. A page that passes the checker and then warns in a console
  nobody watches is exactly the failure the two verifiers exist to prevent.
- **A present-but-empty `ui:key` did nothing at all.** `each.ts` falls back to `id` because
  `''` is falsy, so an attribute someone wrote keyed nothing. `coreAttrProblems` conflated
  "absent" (the default, which says nothing) with "present and blank" (an author who meant
  something); only the first is silent now.
- **`ui:key` naming a property no item has was the last silent fallback.** Nothing static can
  see it — no checker knows the shape of the data — but the runtime is holding the items, so
  it is the half that says it, once per list, and only when `ui:key` was actually written:
  the `id` default is the runtime's choice, not the author's, and a list of strings has no
  properties to key by at all.
- **`ui:tabs` with no `[role="tab"]` inside it was a silent no-op** — the class landed, no tab
  was ever selected and every panel showed at once. Same shape of mistake as a wrong host,
  one level in.
- **A named target that cannot be checked was a silent pass.** `ui check README.md` printed
  `checked 0 files` and exited 0, which reads as a clean bill of health for README.md. Exit 2
  now, for a named non-HTML file and for finding nothing at all — a gate that goes green
  because it scanned no files goes green on the day the glob breaks. `ui check ""` no longer
  scans the cwd either: `resolve('')` *is* the cwd, so a shell variable that expanded to
  nothing used to scan the whole tree.
- **`ui check --json --quiet` contradicted itself.** The counts are the verdict and describe
  the whole scan — deliberately, exactly like the human summary line, which reports "1 error,
  1 warning" under `--quiet` because hiding detail is not the same as reporting a page clean.
  But the payload reported `warnings: 1` beside a one-element `findings` array with nothing to
  explain the gap. A new `suppressed` field names it, so the invariant is readable off the
  document: `findings.length + suppressed === errors + warnings`.
- **The reveal took the page's own transitions and never gave them back.** A `transition`
  shorthand resets *every* transition property on an element, so a `.cta` with
  `transition: background .2s` stopped transitioning its background the moment it revealed,
  and kept not transitioning, because the rule kept matching — a real regression on exactly
  the pages `ui:reveal` exists for. `.ui-reveal-in` is now a transient: when the motion ends
  the runtime adds `.ui-reveal-settled`, the rule stops matching and the page's transitions
  return. The duration is read from the stylesheet rather than hardcoded in JS, so the two
  cannot drift.
- **Four shipped colour combinations failed WCAG AA, and nothing in the suite could see it.**
  `--muted` measured 4.25:1 on the `.band-alt` tint and 4.40:1 on an inset card; the brand and
  success badges 4.42:1; and `--warn` **3.38:1** — the worst of the four, and the one a
  reviewer did not report. Dark mode passed throughout, which is why "it looks fine" was never
  evidence. The badges were the accent mixed into *both* sides — `var(--brand)` text on
  `color-mix(in srgb, var(--brand) 18%, transparent)` — the one combination that cannot pass,
  since both sides are the same hue by construction; and because the tint was translucent the
  same badge measured 4.42:1 on a card and 3.71:1 over the hero's gradient. The tint is now
  mixed into `--card`, so it is opaque and the ratio stops depending on what is behind it, and
  the text is 78% accent + `--ink`, which moves the accent toward the foreground in whichever
  direction that means for the scheme. `tests/a11y.test.ts` pins the invariant as well as the
  numbers: a badge that measures differently on a light band and a dark one is translucent
  again.
- **`pages/index.html`'s cascade-layer probe was the last failing text node in the package.**
  The demo proves unlayered app CSS beats the layered `ui.base`, and it proved it with
  `rgb(255, 0, 0)` — 3.8:1 on the light background. It now uses
  `light-dark(#a5181a, #ff8a80)`: the override is the point of the demo, the specific red was
  not, and an AA-passing red proves the same thing in both schemes.
- **A wrong host inside a `ui:each` template was reported by `ui check` and by nothing else.**
  The template walk covered the vocabulary and the companion requirements but not the host —
  the tag an enhancer only works on — so `ui:icon` on a `<span>` inside a template produced a
  checker finding and no runtime warning, and with an empty list it produced no warning at
  all, because there was no row to attach. Hosts are the largest family in the vocabulary
  (`ui:icon` needs `<svg>`, `ui:image` `<img>`, `ui:modal` `<dialog>`, every control its own
  tag), so this was the widest hole in the contract rather than a corner of it. The template
  now runs the same three checks `attachEnhancers` does, once per markup site — which also
  stops a 50-row list from printing one mistake 50 times, as it did until now.
- **A verb declared in the vocabulary but never implemented was a silent no-op.** `fx.ts`
  dispatched through an if-chain, which cannot be introspected, so adding a name to `VERBS`
  and forgetting the handler produced markup that parsed, passed `ui check` and appeared in
  the generated skill table. Dispatch is a `VERB_HANDLERS` table pinned to `VERB_NAMES` in
  both directions by `vocab.test.ts`, and an unimplemented name warns when the event fires.
  The same test no longer hardcodes the catalog's length, which had gone stale the moment
  `dismiss` was added.

### Changed

- Runtime 27.8 → **33.5 KB minified / 10.4 → 12.5 KB gzipped**; the stylesheet 9.9 →
  **13.7 KB / 2.7 → 4.1 KB**. `benchmark.md` regenerated from one `bun run bench`, so every
  number in the repo now comes from the same measurement, and its honest-reading section
  attributes the bytes to the four passes separately — the vocabulary pass ~4.6 KB, the
  contract-and-motion pass a further ~3.2 KB, the two judge passes a further ~2.5 KB — instead
  of pinning the whole delta on the first one, which had made the sentence contradict its own
  computed parenthetical. The timing table moved with the rerun, as it always does; the mount
  column is the single noisy sample the methodology says it is.
- Documentation: `README.md` and `AGENTS.md` document the companion contract, the motion
  guarantees and the generated table; `naming.md` rule 4 gains the requirement maps, the
  custom-element carve-out and the motion obligation, and rule 7 now says an addition means
  editing `src/vocab.ts` and running `bun run grammar`. Beyond that: the skill's size figures
  were a release behind, its missing-partner list omitted `ui:key`, its `ui check` exit-status
  contract was missing three of the four usage errors, its "what it cannot check" list did not
  name the runtime-only findings, and its build line omitted the IIFE bundle. The CLI's own
  usage text now states the same exit contract and names those runtime-only findings, because
  they are findings the checker provably cannot make. `docs/examples/faq.html` and
  `docs/landing-patterns.html` taught `ui:acc` — an attribute that does not exist; the
  mechanism is the `ui-acc` **class**. `docs/index.html`'s "~27 KB",
  `verbs-reference.html`'s claim that `ui check` "will" move linting to build time (it does,
  now), and `MAINTAINERS.md`'s pack size (~45 kB; it is ~123 kB / 68 files) were all stale.
  `AGENTS.md` and `CONTRIBUTING.md` no longer claim CI runs inside `leonui/`: the workflow's
  steps have no `working-directory`, so they run at the repository root — which is why that
  check does not go green.

## [0.3.0] — 2026-09-26

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
