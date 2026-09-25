# Changelog

All notable changes to leonui are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows semver.

## [Unreleased]

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
