# Framework agent study — leonui vs React, head-to-head under identical agents

**Question.** For the same small UI task, does an AI coding agent reach a working page in fewer revision cycles, and with fewer escaped defects, under leonui's contract (shipped skill + `ui check` + runtime warnings) than under React's (browser-JSX + console only)?

This is the study the benchmark's "honest reading" has been pointing at: the perf and size tables measure runtimes; this one measures the thing leonui is actually for — **what happens when an agent, not a human, writes the page.**

## Design

- **8 participants** = 4 tasks × 2 conditions. Each participant is an independent agent session (same model, same harness) that sees only its task spec, its framework's contract doc, and a verifier. Participants never see the grader, the results, the other condition's outputs, or the reference fixtures.
- **Tasks** (pre-registered in `tasks/` before any run): `todo` (add/toggle/remove + exact status line), `filter` (live case-insensitive substring filter over a fixed 10-item dataset), `form` (inline validation with exact error strings), `tabs` (3 tabs, exact panel copy, `aria-selected` discipline).
- **Conditions**:
  - **leonui** — contract = `skills/leonui/SKILL.md` (the byte-identical twin shipped in the npm package), plus the offline `docs/` and `pages/` trees. Verifier: `verify.ts` + the static `ui check` CLI.
  - **react** — contract = `react-contract.md` (authored for this study at comparable length: skeleton, hooks, gotchas, two worked examples). React 19 as browser globals + babel-standalone, no build step, single HTML file — the same deliverable shape as leonui. Verifier: `verify.ts` only.
- **Verifier parity.** Both conditions get the same `verify.ts`: ephemeral server, real headless Chromium via the repo's CDP harness, settle time, full console-error + page-error capture. `ok:false` on any console/page error. Condition-specific liveness: leonui requires `__uiReady` and an **empty `window.__ui.warns`**; react requires children mounted into `#root`. The one deliberate asymmetry — leonui additionally has a static checker, React's browser-JSX setup has none — **is the thing under study**, not a confound to remove.
- **Metrics.** *Cycles* = verifier runs (one per write). *Cycles with issues* = cycles whose verify was not ok (or whose static check reported findings). *Escaped defects* = grader assertions the final page fails despite the agent's verifier being green. *Functional pass* = all grader assertions.
- **Grader** (`grade.ts`) written and frozen **before** the runs (pre-registration) and proven against hand-written reference fixtures in `selftest/` — 8 pages, one per task × condition, all passing every assertion. Every finder is text/attribute-based (`checkVisibility()`, `innerText`, computed styles, `aria-selected`), never structure-based, so neither framework's idiomatic markup is favored.

## Protocol decisions (made while designing, before any run)

- The task set is bounded by **the weaker of the two grammars** — a task neither framework can complete is noise, not signal. The whitelist's pure operators (`without`, `contains`, `first`, `sortBy`) have no filter/count/reduce, so a live match-count line and a "no matches" empty state are **inexpressible** in leonui and were left out of the `filter` spec. Case-insensitive matching stayed in: `contains()` is case-insensitive by design.
- Vendor runtime files are regenerable, not committed: `vendor/babel.min.js` (fetch from `@babel/standalone`) and `vendor/react.bundle.js` (built from the repo's own React devDependency by `react-entry.ts`).

## Observations from building the reference fixtures (framework facts an author hits)

These shaped the fixtures and are worth knowing before reading the results:

1. **`ui:bind-class` overwrites the whole `class` attribute** — a static class plus a bound class must be written as one expression producing both names.
2. **A verb sequence on a row that removes itself must do its bookkeeping first**: after `set items = without(items, item)`, the row's scope is detached and a following `set` on an outer signal warns `undeclared signal` and does nothing.
3. **`toggle item.done` inside a `ui:each` row copy-on-writes the row's item signal and never writes back into the array** — the list and the row silently diverge; the next array replacement reverts the row. The grammar-idiomatic local-list pattern is derived state (`doneIds` + `contains()`), not per-row mutation.
4. **`attr:` binds follow native boolean-attribute semantics** — `true` writes `""`, `false` removes the attribute; an `aria-selected="false"` string needs an explicit ternary expression.

## Results

Rendered into `benchmark.md` by `bun run bench` from `results.json` (assembled from the run logs + `grade.ts` output). Raw cycle logs: `run/<framework>/<task>.log.md`. Grader details: `artifacts/grade-run.json`.

## Threats to validity (read before quoting the numbers)

- **Pilot scale.** 4 tasks, one model, one session harness. The numbers are evidence, not proof; re-running changes them (that is what committed raw logs are for).
- **Doc asymmetry is inherent.** leonui's agent reads the shipped skill; React's reads a doc written for this study. The React agent's real advantage — billions of training examples — is present in both conditions and is precisely what the leonui skill has to beat.
- **The static-checker asymmetry is the hypothesis, not a bug.** "Framework + its checker" vs "framework alone" is the comparison that matters to an agent user.
- **Graders are text/attribute-based but not mind-readers.** They assert the spec as written; an implementation that satisfies the spec differently may fail an assertion. The fixtures prove the assertions are satisfiable in both frameworks.
- **The model is the same in both conditions and knows React far better than leonui.** That is the realistic deployment condition, and the entire point of the shipped-skill contract — but it means a leonui win is a win for *skill + checker*, not for raw model prior.
