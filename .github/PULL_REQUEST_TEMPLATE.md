<!-- One topic per PR. CI runs typecheck + the full Chromium suite. -->

## What

<!-- One paragraph: what changes, in user-visible terms where possible. -->

## Why

<!-- The problem or the door: link the issue, or state which naming.md §7 door a grammar change enters through. -->

## Proof

<!-- How you know it works. Tests are the spec here. -->

- [ ] Tests added/updated that **fail without this change** (file + test name: )
- [ ] `window.__ui.warns` stays clean on every touched page
- [ ] `bun run typecheck` clean, `bun test tests/` green locally
- [ ] Grammar names (if any) added to `leonui/skill/SKILL.md` **in this PR**
      and satisfy [naming.md](naming.md)

## Authorship note

AI-assisted work is welcome. By opening this PR you confirm you have reviewed
every line and can defend any part of it — tests included.
