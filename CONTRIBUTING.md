# Contributing to leonui

Thanks for wanting to contribute. This project has one unusual property that
shapes everything below: **its primary authors and users are AI coding agents**,
and its primary defense against low-quality automation is **tests that verify
claims by execution**. The rules exist to keep that property as the project
grows.

The short version:

> AI-assisted contributions are welcome. Slop is not.
> **You own every line you submit**, whatever tool produced it.

## Before you open a PR

1. **Read the rulebooks.** [naming.md](naming.md) governs anything user-visible
   in the grammar; [`leonui/skill/SKILL.md`](leonui/skill/SKILL.md) is the
   authoritative vocabulary table. If your change adds or renames a name in the
   grammar, the rulebook decides whether it's allowed — not taste.
2. **One topic per PR.** A fix is a fix; a feature is a feature. Mixed
   "refactor + fix + docs + formatting" PRs will be asked to split.
3. **Tests are the spec.** Every behavior change ships with a test that fails
   without your change. Tests here drive a real browser over CDP — look at
   `leonui/tests/` for the patterns (assertions on DOM, state, *and*
   `window.__ui.warns`, our no-silent-failure contract).
4. **CI is the first reviewer.** Typecheck (strict) and the full suite run on
   every PR. If it's red, fix before requesting review. (Caveat: the workflow's
   steps have no `working-directory`, so they run at the repository root while
   the package lives in `leonui/` — that check does not currently go green. Run
   the dev loop from `leonui/` yourself in the meantime; see
   [AGENTS.md](AGENTS.md).)

## What gets rejected (the slop list)

These are the patterns we decline, regardless of how they were produced:

- **Drive-by formatting or refactors** mixed into a behavioral change, or
  "modernization" PRs with no behavioral content.
- **Invented abstractions** — helper layers, config systems, or "flexibility"
  nothing uses yet. This runtime is deliberately small; growth goes through the
  [naming rulebook's](naming.md) five doors.
- **Names not in the vocabulary table.** A new `ui:*` attribute, verb, aspect,
  or builtin that isn't in `skill/SKILL.md` in the same commit fails the parity
  test — and will not be reviewed on its merits until the docs ship with it.
- **Tests that assert nothing**: mocks tested instead of behavior, assertions
  on implementation details, or a test suite that still passes when the feature
  is deleted.
- **Documentation walls** — generic prose that could describe any framework
  ("leverages a powerful reactive system…"). Docs here show real code and real
  output; each topic has one source of truth.
- **Comment noise** — narrating the obvious, or AI-conversation remnants
  ("// as requested", "// fixed the issue").
- **Commit noise** — "fix", "update", "wip" as commit subjects; twenty commits
  of fiddling in one PR. Squash before requesting review.
- **Scope creep by surprise** — a PR that renames things, swaps dependencies,
  or changes the build while claiming to fix a typo. Surprises burn trust.

## What gets merged fast

- Fixes with a failing-test-first demonstration.
- Grammar additions that arrive rulebook-compliant: naming.md rule satisfied,
  vocabulary table updated in the same commit, e2e covering the new surface,
  and the **grammar budget** respected (can the whole spec still fit in an
  agent's context?).
- Docs that reduce words while keeping one source of truth per topic.
- Bug reports with a minimal reproduction page — a single HTML file using the
  CDN build is the gold standard.

## AI-assisted contributions, specifically

- **Disclosure is optional; correctness is not.** We don't care whether a
  human typed the code. We care that every claim in the PR is true and tested.
- **You are the author.** "The model wrote it" is not an excuse for a wrong
  test, a hallucinated API, or a name outside the vocabulary table — any more
  than "the linter wrote it" would be.
- **Don't submit prompt output unreviewed.** The tell-tale slop signals above
  are mostly model defaults: over-explaining, over-abstracting, adding options
  nobody asked for, summarizing instead of specifying.
- **Agents: follow the skill.** If you're an agent contributing here, load
  `leonui/skill/SKILL.md` and `naming.md` first — they are the contract, and
  the tests enforce them the same way they enforce the runtime.

## Reporting bugs

Open an issue with the bug template. Best reproduction: one HTML file against
the CDN build plus what you expected. Paste `window.__ui.warns` — half of all
bugs name themselves there.

## Proposing grammar changes

Grammar is the product; grammar changes are the highest-scrutiny PRs. Route
them through [naming.md](naming.md) §7 (the growth protocol): state which door
your addition enters through, its token cost against the grammar budget, the
platform capability it maps to, and the tests. Proposals that add a sixth
family or a new bare attribute lane will be held to the rulebook.
