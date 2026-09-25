# Maintainer handbook

How this repo is run. Written down so it survives maintainer turnover and
survives contact with scale.

## The review bar

A PR is mergeable when all of these are true — no exceptions, including for
the maintainer's own work:

- [ ] CI is green: typecheck (strict) + full suite over real Chromium.
- [ ] The change does what the PR says — verify by running the demo, not by
      trusting the description.
- [ ] Every behavioral claim has a test that fails without the change.
- [ ] Grammar changes satisfy [naming.md](naming.md): correct door (§7), host
      contracts stated, vocabulary table updated **in the same commit** (the
      parity test enforces src↔SKILL, but only you can judge whether the
      *wording* is right).
- [ ] The diff is only about its topic: no formatting noise, no drive-by
      refactors, no unrelated file churn. Ask for a split; don't review soup.
- [ ] No slop patterns (see [CONTRIBUTING.md](CONTRIBUTING.md) reject list):
      invented abstractions, unreviewed model output, comment/commit noise,
      docs that could describe any project.
- [ ] `window.__ui.warns` stays clean on every touched page — the
      no-silent-failure contract is the product.

When a PR is AI-assisted and sloppy, the response is the same as for a sloppy
human PR: specific, unembarrassed review comments naming exactly what fails.
Do not relax the bar because a model wrote it, and do not raise it because a
model wrote it.

## Judge-in-the-loop for design decisions

Architecture-level changes (new family, new transport, changing attach
semantics) get an adversarial review before merge: write the proposal, have an
independent reviewer (human or agent with no stake in the design) attack it,
apply the findings, iterate to APPROVED. The `judgment-*.md` files in the
history are the precedent — they caught real bugs in proposals that *looked*
done. Cheapest form: a fresh agent asked to "find what kills this."

## Release process

1. `npm version patch|minor|major` (semver: grammar additions = minor;
   fixes = patch; anything breaking the published grammar = major + aliases).
2. Bump `ver:` in `leonui/pages/index.html` to match — the e2e suite enforces
   this by comparing against `package.json`.
3. `bun run build` (emits both ESM and IIFE bundles).
4. Full suite: `bun test tests/` — must be all green on the exact build.
5. `npm publish` (the pack is ~45 kB; verify with `npm pack --dry-run` if the
   files list changed).
6. Commit, tag (npm version does this), push with `--tags`.
7. Verify live: registry shows the version; `cdn.jsdelivr.net/npm/leonui@<v>/…`
   serves; load the real CDN URL in a browser and click one verb. The
   version-string bug (0.1.1 reporting 0.1.0) was caught exactly here.

## The invariants protect the contributors too

When you say no to a PR, you're usually saying yes to something the tests
already encode:

- **No eval, ever** — the whitelist parser is the security *and* analyzability
  story (src/parser.ts; tests reject `fetch(...)`, globals, undeclared signals).
- **No silent failures** — everything lands in `window.__ui.warns`
  (tests/naming.test.ts).
- **Vocabulary parity** — src ↔ skill in the same commit
  (tests/skill.test.ts).
- **Version honesty** — the published build reports its true version
  (tests/cdn.test.ts).
- **Coexistence, not replacement** — nothing here may require leaving React;
  the component/CDN paths are the integration surface.

These are the project's constitution. Changing one requires the judge loop,
not just a green CI.

## Housekeeping

- `dist/` and `bench/vendor/` are build artifacts — never committed.
- `.agent-workbench/` (design history) and `.zcode/` (local skill install) are
  gitignored; the public design record lives in `naming.md`, `audit.md`,
  `benchmark.md`, and the commit history.
- Keep `skill/SKILL.md` under the grammar budget: the whole authoring spec
  must stay loadable in an agent's context. When it grows, something else
  shrinks or moves to the docs.
