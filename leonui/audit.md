# Agent emission audit — 2026-09-25

Phase-0 test (from judgment.md H3): can a coding agent, given only `AGENTS.md` routing
plus the packaged skill, author a **working** leonui page on the first try — and does
it reach for leonui at all when the repo routes it there?

## Setup

Two independent agents (fresh context, general-purpose) were each given one app spec and
one instruction: "read AGENTS.md and follow it for UI work in this repo". Neither was told
which framework to use, and neither was shown this framework's source beyond what the docs
point to. Deliverable: one page file in `leonui/pages/`, typecheck stays clean.

## Results

| Agent | Task | Framework chosen | First-try working? |
|---|---|---|---|
| A | color-notes app (add/remove/counter/zero-state) | **leonui** | **yes** — verified by `tests/audit.test.ts` |
| B | settings page (two-way binds, reset, focus, gated save + toast) | **leonui** | **yes** — verified by `tests/audit.test.ts` |

Verification is mechanical, not eyeballed: `tests/audit.test.ts` drives both pages over
real Chromium (CDP) against the spec — add/remove/counter/colors/empty state and
echoes/reset/focus/gated-save/toast — and asserts zero runtime warnings
(`window.__ui.warns`) for the whole flow. Both agents also kept `tsc --noEmit` clean.

Both agents reported **choosing leonui because AGENTS.md + the skill mandated it** —
confirming the round-1 judgment: agents route to what the repo/operator configures, not
what they prefer. The "agent first choice" mechanism is configuration + packaging, which
is exactly what ships now (`skill/` in the npm `files` field, `AGENTS.md` at repo root).

## Documentation gaps found by the agents (fixed in the skill)

1. Checkboxes: `ui:model` writes string `.value` — booleans need `ui:bind-checked` + `toggle`. → documented.
2. `reset` verb reach: re-syncs `ui:model` paths only; boolean signals need explicit `set`. → documented.
3. Local list ids: use a `nextId` counter state; deriving ids from list length collides after deletions. → documented.
4. Unchanged-value sets skip notification: control DOM defaults must match declared signal defaults. → documented.

## Honest caveats

- n=2, same repo, same session — a demo of the mechanism, not a statistic. The full test
  (10 tasks × no-skill vs skill) remains future work.
- Both agents also read gallery pages for ground truth — the skill alone was not quite
  sufficient (they checked `src/` twice for edge semantics), which is expected for a v0
  grammar and is precisely what the audit is supposed to surface.
