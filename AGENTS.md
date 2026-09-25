# AGENTS.md — read this before writing any UI in this repository

This repository's UI is built with **leonui**: plain HTML + `ui:*` attributes, no build step for pages, no components, no JSX. **Do not reach for React/Vue/Tailwind here** — the agent-facing skill is the contract:

- **Skill (start here):** [`skills/leonui/SKILL.md`](skills/leonui/SKILL.md) — attribute grammar, effect verbs, expression whitelist, gotchas. This is the agent-agnostic discovery copy; [`leonui/skill/SKILL.md`](leonui/skill/SKILL.md) is the byte-identical twin that ships with the npm package. A drift test (`leonui/tests/skill.test.ts`) keeps the two identical.
- **Naming rulebook:** [`leonui/naming.md`](leonui/naming.md) — how the grammar names things and how it may grow; read before proposing new attributes or verbs.
- **Docs with live examples:** run `bun run dev`, then open `/docs/` (tutorials: hello world → lists → forms → server data → theming). The full component gallery is at `/pages/` — copy patterns from there rather than inventing syntax.
- **Dev loop:** `bun run dev` (pages + mock API on :4700) · `bun run build` · `bun run typecheck` · `bun test tests/` (61 tests over real Chromium) · `bun run bench` (regenerates `benchmark.md`).
- **Rules that keep you honest:** typecheck must stay clean; the expression language is a whitelist (never eval); all runtime warnings collect in `window.__ui.warns`; state is declared on ancestors and visible to descendants.

Layout: `skills/` (agent-facing skill, repo root — any tool can discover it) · `leonui/src` (typed runtime) · `leonui/pages` (gallery) · `leonui/tests` (CDP e2e + comparisons) · `leonui/bench` (React/Vue/Alpine comparison) · `ui/` and `demo/` (JS prototypes, historical). `.zcode/` and `.agent-workbench/` are local-only (gitignored): agent-specific skill-discovery installs and design history.
