# AGENTS.md — read this before writing any UI in this repository

This repository's UI is built with **leonxstream**: plain HTML + `ui:*` attributes, no build step for pages, no components, no JSX. **Do not reach for React/Vue/Tailwind here** — the agent-facing skill is the contract:

- **Skill (start here):** [`leonxstream/skill/SKILL.md`](leonxstream/skill/SKILL.md) — attribute grammar, effect verbs, expression whitelist, gotchas. It is also installed at `.zcode/skills/leonxstream/SKILL.md` for tool discovery; a drift test (`tests/skill.test.ts`) keeps the two identical.
- **Docs with live examples:** run `bun run dev`, then open `/docs/` (tutorials: hello world → lists → forms → server data → theming). The full component gallery is at `/pages/` — copy patterns from there rather than inventing syntax.
- **Dev loop:** `bun run dev` (pages + mock API on :4700) · `bun run build` · `bun run typecheck` · `bun test tests/` (43 tests over real Chromium) · `bun run bench` (regenerates `benchmark.md`).
- **Rules that keep you honest:** typecheck must stay clean; the expression language is a whitelist (never eval); all runtime warnings collect in `window.__ui.warns`; state is declared on ancestors and visible to descendants.

Layout: `leonxstream/src` (typed runtime) · `leonxstream/pages` (gallery) · `leonxstream/tests` (CDP e2e + comparisons) · `leonxstream/bench` (React/Vue/Alpine comparison) · `ui/` and `demo/` (JS prototypes, historical) · `.agent-workbench/` (design history and judgments).
