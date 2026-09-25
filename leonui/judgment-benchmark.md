# Judgment — leonui benchmark + skill audit (2026-09-25)

Targets: benchmark.md + tests/frameworks.test.ts, bench/*.html + bench/src/*, SKILL.md, src/*.ts, tests/e2e.test.ts + harness.ts.
Note on provenance: running `bun test tests/` (as instructed for verification) re-runs the benchmark generator and OVERWROTE benchmark.md + tests/artifacts/*.json. The numbers below citing "committed run" are the pre-my-run snapshot; "rerun" numbers are from my verification run. Both are quoted to show run-to-run behavior.

Verified by execution: `bun test tests/` → 42 pass, 0 fail (37 e2e + 4 correctness + 1 benchmark), real Chromium headless shell over CDP, 30.7 s.

## Q1 — Is the benchmark fair?

Mostly yes, with one invalid column.

- Correctness assertions are literally one shared loop over all 4 frameworks (frameworks.test.ts:33–62) — identical by construction. Measurement is one shared `measure()` (line 69–87) plus a shared update loop — identical. No favoritism found in driver ordering (leonui runs first, others after — mild, symmetric).
- No internal-API advantage: leonui's bench driver uses `window.__ui.readPath/setPath`, which mirror the module's exported public API (`index.ts` exports `readPath, setPath`). React/Vue/Alpine drivers use their own public state APIs. Equivalent.
- Implementations are idiomatic: React `createElement` + keyed `useState` (production bundle — contains "Minified React error", no dev warnings), Vue `esm-bundler` + keyed runtime-compiled template (the symmetric choice vs leonui's runtime-compiled attributes), Alpine `x-for` keyed. `make(n)` id semantics differ (leonui restarts ids, others monotonic) but all ops create from an empty list, so keyed-diff work is equivalent.
- The generator is mechanical, not gamed: benchmark.md is produced from `results`/`sizes` in the same test run; artifact numbers match the table exactly; my rerun honestly crowned **vue** for create/replace where the committed run crowned leonui — it does not protect leonui.
- Mount (67.4 vs react 38.7 committed; 48.9 vs vue 28.1 rerun) is favorable *against* leonui — evidence of honesty, not spin.

[should-fix] Mount column is not comparable across pages. Quoted line: `**mount** (navigate → scaffold interactive)` and `Measurement: ... identical`. leonui.html and alpine.html stamp `__benchReadyAt` after **4 rAFs** (`mount(){ await settle(); }` + outer `await settle()`); react.html/vue.html after **2 rAFs** (`mount(){}` noop). That is ~2 frames (~16–33 ms in this headless setup) of protocol, not scaffold, charged to leonui/alpine — roughly the entire react-vs-leonui mount gap in both runs. Fix: give all four pages the identical stamp protocol (delete `await settle()` inside leonui/alpine `mount()`, or document it), or drop Mount from the table.

[note] The claimed settle floor (~33 ms) is not constant: rerun vue mount = 28.1 ms, below it. Another reason mount should not be ranked.

## Q2 — Does benchmark.md oversell?

The rAF-floor and saturation honesty is real and supported (update medians 31.7–32.2 across all four, spread 0.3 ms, labeled "no ranking"). Two items oversell:

[should-fix] Winner bullets rank machine noise. Quoted: `- **create1000** → **leonui** (spread 26.0 ms)` — the spread is Alpine's 54.7; leonui vs react vs vue were 28.7/30.6/29.2 (1.9 ms apart), and my rerun of the same code flipped the crown to vue (29.2 vs 29.3). The same file's honest reading says "treat sub-10 ms gaps as machine noise" — the auto-generated bullets contradict the caveat one section above, and the committed artifact happens to flatter leonui. Fix (smallest): in the generator's `winner()` block, emit "→ winner" only when the winner beats the runner-up by > 5 ms; otherwise print "statistical tie".

[should-fix] The "Minified" column is false for the leonui row. Quoted header: `| Framework | Minified | Gzipped |`. `package.json` build is `bun build ./src/index.ts --outfile ./dist/leonui.js --target=browser` — no `--minify`; dist/leonui.js is readable with `// src/version.ts` comments, while the three vendor bundles are name-mangled minified production builds. The error direction is conservative (leonui's 38.8 KB is its *unminified* size), but the label is still wrong in a deliverable whose premise is honesty. Fix: add `--minify` to the build and rebuild before measuring, or relabel the column.

[note] `bun test tests/` silently rewrites benchmark.md and artifacts on every run — proven by my verification run changing the published winners. README line `bun test tests/  # e2e suite: 37 tests` is also off (it runs 42, including the benchmark). Fix: move the benchmark into its own script (`bun run bench`) so published numbers change only deliberately.

## Q3 — Is the skill usable and TRUE?

Every checkable claim in SKILL.md verified TRUE against src: attribute families match scan/boot attachment; aspects `text class hidden disabled checked open` + `attr:<name>` match `ASPECT`; all 12 verbs (`set toggle call onfail toast nav refetch prompt confirm focus reset delay`) match `parseVerb` and `__ui.verbs`; the with-clause, event-time body evaluation ("payloads ... evaluate at event time, before optimistic mutations" — fx.ts:110–113), rollback via pre-captured refs (fx.ts:99–104,123), remote-cell `{status,data}` shape, expression whitelist (literals/dot/.length/operators/spread + `without contains first sortBy`), `onfail:` colon tolerance, `ui:tabs` arrow keys, `ui:image` error fallback (including the pre-attach fast-404 check), popover anchor wiring (`anchorName`/`positionAnchor`), `ui:modal` zero-JS command/commandfor, all 7 icon names, coerce forms ('str', number, bool, single-quoted JSON), `warns` collection, `~30 KB` runtime (29.7 KB), tokens (`--brand --bg --ink --muted --line --danger --r --ui-gap-1..8 --ui-text-*`) — all real. Gaps an agent will hit:

[should-fix] The form-submit trap. Quoted: `Events are DOM event names (`click`, `change`, `submit`…)`. The runtime never calls `preventDefault` (grep: zero occurrences in src/ and pages/), and every gallery avoids form submit (inbox.html adds tasks via a `click` verb on a button). The natural first try — `<form ui:fx="submit: call POST /api/tasks with { title: draft }">` + a submit button — natively navigates and destroys all state before the fetch resolves. Fix (smallest): one gotcha line in "Hard rules" ("the runtime never preventDefaults; put ui:fx on a type=button's click, never on form submit"), or one line in attachFx (`if (evName === 'submit') e.preventDefault()`).

[should-fix] The mock API is undocumented. Quoted: `bun run dev  # serve pages + mock API (PORT env overrides; default 4700)`. An agent building the canonical form+list app against this dev server needs GET/POST `/api/tasks`, PATCH/DELETE `/api/tasks/:id`, `?fail=1`/`?slow=1`, and POST `/api/__reset` — none appear in the skill. Fix: a 4-line route table.

[should-fix] `nav` silently needs `data-screen`. Quoted: `nav '#screen-id'`. `doNav` hides only elements matching `[data-screen]` (fx.ts:72–74); a page that just writes `<section id="screen-1">` gets a no-op nav with only a console warning. Fix: half a sentence in the verb table.

[note] `ui:popover` requires the author-authored `popover` attribute plus a `popovertarget` invoker (overlays.html:10–11); the skill one-liner reads as if `ui:popover` does it all. The "copy patterns from /pages/" instruction covers it.
[note] Cosmetic skill nits: "four attribute families" vs a 5-row table; `ui:key` defaults to `id` (undocumented); `ui:fx` splits on `;` so string literals cannot contain `;`.

## Q4 — Is "it is really implemented" fair?

Yes, and I tried to break it. parser.ts is a real recursive-descent whitelist AST interpreter — `grep` for `eval(`/`new Function` in src/ is clean, and e2e asserts rejection of `fetch("http://evil")`, `document.title`, undeclared signals. signals.ts genuinely walks the ancestor chain (scope shadowing e2e passes). each.ts is real keyed minimal-move alignment (backward pass, `moveBefore` with `insertBefore` fallback) and the add/drop/rotate/reorder e2e passes. fx.ts optimistic rollback works even when the optimistic set removed the row (captured ref), e2e-verified against the real mock API. 42/42 pass on my machine. The claim is fair; only these are overstated:

[note] boot.ts:49 comment says the `__ui` hook is a "documented, read-only surface" while it exposes `setPath`/`sig` (the benchmark driver writes through it, and benchmark.md calls it "the public runtime API"). Fix the stale comment.
[note] README's known-gaps list (subscriber disposal, reparenting, shadow DOM, SSR) is honest disclosure — to its credit.

## Verdict

Nothing fabricated, nothing gamed, no favoritism to leonui (twice the generator recorded results against it). The failures are all small and all in the "presented fairness" layer, not the measurement or the runtime.

NEEDS-FIXES: (1) mount-column protocol asymmetry (identical settle protocol or drop Mount), (2) winner bullets must respect the noise threshold the same file states, (3) relabel/add --minify for the size table, (4) benchmark out of `bun test` into its own script, (5) skill: form-submit gotcha, (6) skill: mock API route table, (7) skill: nav data-screen requirement.

# Round 2 — re-verification of all 7 fixes (2026-09-25)

Re-checked against current files; typecheck clean; `bun test tests/` → 42 pass / 0 fail; `bun run bench` executed by me and regenerated benchmark.md (rankings below are from that independent run).

1. Mount protocol — FIXED. All four bench pages now stamp `__benchReadyAt` after the identical outer single 2-rAF settle (leonui/alpine `mount()` reduced to noop/`Alpine.start()`); methodology line updated ("identical 2-rAF stamp protocol on all four pages").
2. Winner bullets — FIXED. Generator emits a ranking only when the winner beats the runner-up by > 5 ms (`gap > 5` gate). Two independent regenerated runs produced: create1000 tie (1.6 / 0.9 ms), replace tie (0.2 / 0.8 ms), update saturated, remove → alpine (10.0 / 11.7 ms — a real gap, correctly still ranked). No leonui-favoring claims remain.
3. Minified column — FIXED. `--minify` in the build; dist/leonui.js is now 17,737 bytes; sizes.json leonui = 27,770 B / 9,379 gz = the table's 27.1 / 9.2 KB. Vendors unchanged (still minified prod). Header now true for every row.
4. Bench out of bun test — FIXED. frameworks.test.ts contains only the 4 shared correctness tests; scripts/bench.ts is the generator via `bun run bench`; verified `bun test` (including frameworks.test.ts alone) leaves benchmark.md byte-identical (mtime unchanged), while `bun run bench` regenerates it.
5. Form-submit trap — FIXED in the runtime. fx.ts:166-167 calls `e.preventDefault()` when the event is `submit`; new e2e "forms: submit verb preventDefaults — no navigation, verb runs" passes (asserts pathname unchanged, page intact, verb ran) against real markup (`<form id="form-submit" ui:fx="submit: set submitted = true">` + `type="submit"` button); skill documents it in the fx row and the gotchas.
6. Mock API route table — FIXED. Skill's route table matches serve/app.ts exactly (GET/POST/PATCH/DELETE /api/tasks, ?fail=1/?slow=1, POST /api/__reset, GET /api/boom).
7. nav data-screen — FIXED. Verb table now says nav needs [data-screen] sections.

Notes applied: boot.ts comment now accurate ("internals exposed for `ui check`, the bench driver, and tests"); skill adds `ui:key` default, `;`-in-string limitation, popover invoker requirement — all verified true; README documents `bun run bench`.

Residuals (non-blocking):
- [note] README ("41 tests: 37 e2e + 4 framework-comparison") and SKILL.md ("41 tests") are each stale by one: the actual totals are 42 = 38 e2e + 4 correctness (the new submit test made e2e 38). Fix: two number bumps.
- [note] scripts/bench.ts header comment says "bench/run.ts" and declares OpResult/FrameResult twice (harmless interface merge; typecheck clean). Fix: delete the duplicate block and correct the header.
- [note] Mount remains the noisiest column run-to-run (leonui 48.9 / 67.4 / 80.7 across my three runs; react 39.6 / 38.7 / 35.4) and leonui is always the first framework measured (cold first navigation). Protocol is now identical and the numbers shown are unflattering to leonui, so this is honesty-neutral — but rotating framework order or reporting mount as a range would remove the last variance artifact.

## Final verdict

All 7 findings fixed and verified by execution; no regressions in the 42-test suite; the benchmark now compares identical protocols and refuses to rank noise; the skill is accurate against the current runtime including the submit fix.

APPROVED (residual doc-count nits recorded above; none misrepresent performance, correctness, or capability).
