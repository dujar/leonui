# Judgment — naming.md (v0.1 draft) against the shipped grammar

Date: 2026-09-25. Target: `naming.md` (naming philosophy), judged against `skill/SKILL.md`,
`src/{scan,parser,fx,enhancers,binds,state,each,signals,sortable}.ts`, `pages/`, `docs/`.
Claims marked **[verified]** were reproduced by executing `parseVerb` and the bind regexes in bun.

---

## 1. Philosophy soundness — rule by rule

**Rule 1 (two namespaces, one test)** — sound idea, false as written. "We never invent a bare
attribute" is violated by the shipped grammar in two places the rule never acknowledges:
`data-screen` (an invented bare framework attribute — the `nav` verb's contract, SKILL.md:28)
and `ui:use` host props (`label="Users" start="120"` in SKILL.md's own example — invented bare
attributes that become prop signals, per `src/scan.ts` `attachUse`). Rule 4's enhancer-prop lane
is stated; these two lanes are not.

**Rule 2 (exactly five families)** — the load-bearing rule, and it is false against reality
**[blocker B1]**. Top-level `ui:` attributes that actually exist: `ui:state`, `ui:computed`,
`ui:bind`, `ui:bind-*`, `ui:model`, `ui:each`, `ui:key`, `ui:fx`, `ui:transition`, `ui:sortable`,
`ui:use`. The family table names five and is silent on `ui:model` and `ui:computed` entirely.
`ui:computed` (8 letters) is either a family — violating "≤5 letters" — or a member of declare,
violating the family-name-is-the-attribute model (it shares no prefix with `ui:state`).
`ui:key` is a satellite nobody classified. Worse, SKILL.md:10 says "**four** attribute families"
while naming.md says **five** — the two documents claiming authority contradict each other.
Unenforceable as written: no test could check "five families" against a grammar that has nine
top-level attribute names.

**Rule 3 (aspects are DOM names, verbatim)** — right principle, factually wrong on its own
examples: it calls `text` and `class` "existing DOM properties". The properties are
`textContent` and `className`; `class` is the attribute name, `text` is an abbreviation (or the
anchor/option `.text`). Second ambiguity **[should-fix S5]**: the rule never says whether the
aspect list is closed (new aspects via rule 7.1) or whether *any* DOM property is automatically
bindable. Growth stress-tests (a) and (e) below turn on exactly this unstated point.

**Rule 4 (enhancer props are bare)** — holds for every actual prop (`gap align wrap center
variant block ratio name anchor placement size`, verified against `src/enhancers.ts` — all bare,
all data-only). The no-collision clause ("if the host is an `<input>`, a bare prop that HTML
defines is off-limits") is unenforceable: enhancers run on *any* element and no host-tag
contract exists in code or docs. See S4. The `align` prop is also a guessability trap:
`ui:row align="center"` sets the **cross** axis (`alignItems`) while the word reads as main
axis, and the separate `center` flag does both axes.

**Rule 5 (flags are adjectives)** — `ui:sortable` is a correct adjective-flag, correctly scoped
to its family (`src/each.ts:19`). `ui:transition` is a noun. "Adjective" is not mechanically
checkable; loosen the wording or the rule condemns its own example. [note N3]

**Rule 6 (verbs)** — the catalog matches `src/fx.ts` exactly (12 verbs, no extras, no
missing). `nav`'s grandfather clause is honest and adequate. But `onfail` sits in the verb
catalog while violating 6(a) — it is not "one lowercase English verb or verb+particle" — and
the `on*` pattern it supposedly heads is classified under sub-keywords, not verbs. The rule
contradicts itself about which category `onfail` is in **[should-fix S3]**.

**Rule 7 (growth protocol)** — coherent; the escape valve (custom elements) is the right
design. But the promised alias mechanism ("old name becomes an alias for one minor version,
with a `warns` entry") has zero support in src — no alias table exists anywhere **[note N5]**.

**Rule 8 (grammar budget)** — SKILL.md is already at roughly the 2,000-token ceiling and is
incomplete (B3). The rule needs a stated answer for what happens when the table is full;
docs/lists.html already speaks of "Tier-3 primitives" — an unstated tiering concept that is
the natural answer. [note N6]

---

## 2. Violation inventory

| Name | Status | Notes |
|---|---|---|
| `ui:state`, `ui:bind(-*)`, `ui:each`, `ui:key`, `ui:fx`, `ui:use` | **conform** | rule 2 |
| `ui:model` | **gray — unclassified** | not in any family table; defensible under react (Alpine `x-model` precedent); must be classified, not renamed — see B1/N8 |
| `ui:computed` | **violate (rule 2 letter)** | 8 letters, no family membership; classify as declare satellite |
| `ui:transition` | **gray (rule 5)** | noun, not adjective |
| `ui:sortable` | **conform** | correct adjective-flag; but absent from SKILL.md — see B3 |
| aspects `text class hidden disabled checked open` | **gray (rule 3)** | `hidden/disabled/checked/open` exact DOM properties; `class`=attribute name (`className`), `text`=abbreviation of `textContent` |
| `attr:<name>` | **violate in practice** | broken in list form (colon collision) and hyphenated variant form; used nowhere — see S1 |
| verbs `set toggle call refetch toast prompt confirm focus reset delay` | **conform** | rule 6 |
| `nav` | **grandfathered** | rule 6 licenses it explicitly; keep |
| `onfail` | **violate (rule 6a) / gray** | not a verb; toast-only wiring — see S3 |
| `GET` sentinel in `ui:state` values | **gray — invisible to the rulebook** | a third mini-grammar (value sentinels) no rule covers — see N1, growth test (b) |
| enhancer props (`gap align wrap center variant block ratio name anchor placement size`) | **conform (rule 4)** | collision clause untestable — S4 |
| `data-screen` | **violate (rule 1 as written)** | invented bare attribute; needs the data-*/aria-* carve-out — S2 |
| `ui:use` host props (`label`, `start`) | **violate (rule 1 as written)** | invented bare attributes, unstated lane — S2 |
| `ui:tabs`/`ui:popover`/`ui:modal` hybrids vs `ui:input` class-adders | **conform** | "noun the user sees" covers both; rule 7.3's "shipped class + variants" wording doesn't fit behavior enhancers (ui:tabs has no variants) — wording fix only, N10 |

---

## 3. Ergonomics scoring (working author: agent first, human second)

**Guessability — good, with two predictable stumbles.** Families state/ bind/ each/ fx/ use
answer "what does this do" from the name; the verb catalog is almost fully predictable
(`set toggle call toast focus reset delay prompt confirm refetch`). The stumbles: `ui:model`
(guessable only via Alpine precedent — an agent trained on Svelte guesses `bind:`), and
`attr:` (unguessable *and* broken, S1). Versus references: htmx's `hx-get` beats
`call GET /url` for pure guessability on the HTTP case but doesn't generalize — one `call`
verb covering all methods is the better grammar budget. Alpine `x-on:click` vs
`ui:fx="click: …"` — ours is better (the event is the key; no prefix word to remember).
Svelte `bind:value` vs `ui:bind-checked` — parity, via the variant form.

**Typing cost — acceptable, one structural annoyance.** `ui:bind-` repeated per aspect
(inbox.html writes `ui:bind-class` three times in a row) is heavier than htmx's `hx-`; the
list form exists for density but silently can't express `attr:` (S1).

**Error discoverability — the worst of the three references, and self-inflicted
[blocker B2, verified].** Executed: `parseVerb("stpo n = 1")` returns `{name:"stpo"}` — at
dispatch no branch matches, so a typo'd verb is a **silent no-op**, no `warns` entry. A
mistyped attribute (`ui:stat`, `ui:ech`, `ui:ues`) matches no pass in `scan.ts` and is
silently ignored. Aspect typos and undeclared signals *do* warn; verb and attribute-name
typos — the two highest-frequency typo surfaces for an agent — do not. Alpine and htmx also
inherit HTML's silent-attribute behavior, but leonxstream's stated differentiator
(docs/verbs-reference.html:32: "`ui check`-style tooling can lint verbs… that is the
roadmap's verification wedge") makes the missing runtime-side lint a broken promise, not a
limitation. Smallest fix: one else-throw in `parseVerb` (the existing `guard` routes it to
warns) plus one vocabulary pass in `scan.ts attach()` warning on any `ui:*` attribute not in
a known-attributes set. ~25 lines, tests, no renames, no doc churn.

---

## 4. Growth stress-test (5 plausible additions)

| Addition | Does naming.md produce ONE answer? |
|---|---|
| (a) style aspect | **No — 3 defensible answers** (`ui:bind-style` writing cssText vs `attr:style` setAttribute vs a per-property `style-color` sub-aspect). Rule 3 has no value-semantics clause and no closed-list statement. Tighten rule 3. |
| (b) websocket cell in ui:state | **No — 3 defensible answers** (`WS /ws` sentinel, reuse `GET`, new family). Value sentinels are invisible to every rule. Tighten rule 2 (declare-family "cell kinds", rule-6 discipline for sentinel names) or add a rule-7 lane. |
| (c) debounce flag on ui:fx | **Yes** — `ui:debounce` on the fx family per rule 5, same shape as `ui:transition`. Holds. |
| (d) icon library override for ui:icon | **Yes (shape)** — bare data-only prop per rule 4; the exact word is taste, which rule 4 correctly tolerates. Holds. |
| (e) form validation messages | **No — 2 defensible answers** (aspect `validationMessage` under an open-list reading of rule 3, vs a new verb on the constraint-validation API under rule 6/7.2). Resolved automatically once S5 closes rule 3. |

Score: 2 of 5 unambiguous. (c) and (d) pass; (a), (b), (e) all trace to the same two weak
rules — 2 and 3. That is a tight, fixable set.

---

## 5. Open-source realities

**Collision with HTML evolution.** The exposed surface is bare props (`align`, `size`, `name`,
`wrap`) — a future platform attribute landing on a tag we decorate silently changes meaning.
Rule 4's per-host clause is the right idea but is untestable without a host contract **[S4]**:
each enhancer should state its allowed host tags in the vocabulary table, making the clause
checkable. `data-*` usage (`data-screen`) sits in the namespace HTML reserves for authors —
safe, but say so in rule 1 (S2). Policy for "browser takes a name we use": rule 7's alias
mechanism is the right answer; it just doesn't exist yet (N5).

**Versioning/aliasing.** Rule 7 promises alias+warn; src has no alias table. Pre-1.0 this is
fine — but naming.md should mark it a 1.0-blocking commitment, since post-1.0 renames without
it break every published page.

**Single source of truth. Fails today [blocker B3].** `ui:sortable` ships in `src/each.ts`,
`docs/lists.html`, `docs/examples/sortable.html`, and is referenced in `pages/data.html` —
and appears nowhere in `skill/SKILL.md`, the table naming.md:6 calls "the one authoritative
vocabulary table". `tests/skill.test.ts` only checks that SKILL.md's two copies match each
other — it never checks SKILL.md against src. A contributor reading naming.md + SKILL.md
cannot discover a shipped family flag. Fix: add the `ui:sortable` row (~1 line) and extend
skill.test.ts to derive the vocabulary from src (ENHANCERS keys, `getAttribute('ui:…')`
calls, verb names) and assert presence in SKILL.md.

---

## Findings

**[blocker] B1 — Rule 2 "exactly five families" is false; ui:model and ui:classified satellites
don't exist in the rulebook.** naming.md:18-26 vs src reality (9 top-level `ui:` attribute
names); naming.md says five families, SKILL.md:10 says four. Fix: amend rule 2's table to
name satellites explicitly — declare = `ui:state` + `ui:computed`; react = `ui:bind`/
`ui:bind-<aspect>` + `ui:model`; repeat = `ui:each` + `ui:key` — and fix SKILL.md's count.
No renames. Migration cost: naming.md + SKILL.md text only, 0 tests.

**[blocker] B2 — Silent typo absorption on unknown verbs and unknown `ui:*` attributes.**
[verified] `parseVerb` returns unknown names unejected; dispatch no-ops. Mistyped attributes
match no pass. Fix: else-throw in `parseVerb` + known-vocabulary pass in `scan.ts attach()`.
Migration: ~25 lines in `src/fx.ts`/`src/scan.ts`, 2-3 new tests, 0 renames.

**[blocker] B3 — SKILL.md is not the complete vocabulary table it is claimed to be.**
`ui:sortable` missing while shipping in src/docs/pages. Fix: add the row + a src↔SKILL
completeness test in `tests/skill.test.ts`. Migration: 1 doc line, 1 test, 0 renames.

**[should-fix] S1 — `attr:` aspect is broken in both forms and used nowhere.** [verified]
List form `ui:bind="attr:href: url"` resolves aspect `"attr"` (colon collision with the
aspect separator) → "unknown bind aspect" warn. Variant form regex `[a-zA-Z:]+` rejects
hyphens → `ui:bind-attr:aria-label` / `data-id` silently ignored. Zero uses in docs/pages/
tests. Fix: keep the name, fix the two code sites (longest-known-aspect-prefix match in
`attachBinds`; variant regex `[a-zA-Z:][\w:-]*`), add the first docs example and tests.
Migration: ~4 lines src, tests, 1 doc line. (Alternative `attr-` rename: not worth it —
`ui:bind-attr-href` is worse to read and the collision is fixable in code.)

**[should-fix] S2 — Rule 1 doesn't acknowledge its own bare lanes.** `data-screen` and
`ui:use` host props violate "we never invent a bare attribute" as written. Fix: rule 1
gains the lane list — native meanings; enhancer props (rule 4); `ui:use` props; native
extension points (`data-*`, `aria-*`, `role`). Text only.

**[should-fix] S3 — `onfail` is rule-6-illegal as classified and toast-only as implemented.**
[verified] `parseVerb("onfail set x = 1")` strips nothing meaningful — `onfail` is wired to
`toast` by string replacement; `onsuccess` would parse to a silent no-op; `failed` is one
flag overwritten by successive calls. Fix: rule 6 reclassified — `on<event>` are
response-gate modifiers following DOM handler tradition, not catalog verbs; generalize fx to
gate the remainder of the verb list on the last `call` outcome (`onfail:` / `onsuccess:`).
Keep the name `onfail` — it reads correctly. Migration: `src/fx.ts` ~20 lines, SKILL.md verb
row, 2 tests.

**[should-fix] S4 — Rule 4's no-collision clause is untestable without host contracts, and
`align` already traps guessers.** Enhancers decorate any element (`<input ui:icon
name="check">` is legal per code and collides); `ui:row align="center"` sets the cross axis
while the word reads main axis. Fix: naming.md requires each enhancer to state allowed host
tags in the vocabulary table; docs note the align main/cross semantics. Considered rename
`align` → `items` (honest CSS naming): rejected — cost (docs, SKILL, several pages, alias)
outweighs the gain once host contracts exist; revisit only post-1.0 with the alias
mechanism.

**[should-fix] S5 — Rule 3 doesn't say the aspect list is closed, and misstates the DOM.**
`text`/`class` are not DOM properties (`textContent`/`className` are). Fix: rule 3 states
the list is closed (growth via rule 7.1 only) and licenses exactly two shortenings
(`textContent`→`text`, `className`→`class`) as attribute-name heritage. Text only; decides
growth tests (a) and (e).

**[note] N1** — `GET` in `ui:state` value position is a value-sentinel grammar no rule covers;
when the second transport arrives (growth test b) this becomes a should-fix. One clause in
rule 2 settles it.

**[note] N2** — The `ui:` colon taxes every user-written selector (`[ui\\:model]` at
`src/fx.ts:153`) and makes XML serialization treat `ui` as a namespace prefix. Worth one
acknowledging paragraph in naming.md; pre-1.0 is the only cheap moment to reverse it, and
`ui:` wins on greppability and zero-collision, so document rather than churn.

**[note] N3** — `ui:transition` is a noun under an adjective rule. Loosen rule 5 to
"adjective or noun-read-as-modifier" rather than rename.

**[note] N4** — SKILL.md:17 teaches a ghost: "Add `ui:empty`-style notices" names an attribute
that does not exist. Fix the sentence to point only at `ui:bind-hidden`.

**[note] N5** — Rule 7's alias mechanism has no runtime support. Mark it a 1.0-blocking
commitment (an ALIASES table feeding `warns`).

**[note] N6** — SKILL.md is at the rule-8 token ceiling while incomplete (B3). Adopt the
"Tier" language docs/lists.html already uses: SKILL.md holds tiers 1-2; docs hold the rest.

**[note] N7** — `ui:use` is the right name. `ui:of` reads backwards, `ui:component` collides
with the rule-7.5 custom-element story, `ui:with` collides with `call … with`. Keep.

**[note] N8** — `ui:model` should stay. It is the odd one out syntactically, but Alpine
settled this exact naming argument with the same audience, and `ui:bind-model` would inherit
the same separator-colon bug S1 documents. Classify it (B1); don't rename it.

**[note] N9** — Verb guessability is strong and the closed catalog is the right product
decision; the missing piece is only B2's enforcement.

**[note] N10** — Rule 7.3's "new enhancer … with shipped class + variants" doesn't fit
behavior enhancers (`ui:tabs` has no variants). Reword to "with shipped class and/or
behavior wiring".

---

## Verdict

NEEDS-FIXES — B1 (rule 2 false against shipped families), B2 (silent verb/attribute typos),
B3 (vocabulary table incomplete), S1 (`attr:` broken in both forms), S2 (rule 1's missing
bare lanes), S3 (`onfail` classification + toast-only wiring), S4 (host contracts /
collision clause untestable), S5 (rule 3 closed-list + DOM-accuracy). No rename is required
anywhere; every blocker and should-fix is closable with doc amendments, ~30 lines of
src, and tests — which is the good news: the philosophy is growable once it describes the
grammar that actually shipped.

---

## Re-verification — 2026-09-25, target: the B1–B3/S1–S5 fixes across naming.md, skill/SKILL.md (+ workspace copy), src/{fx,scan,binds}.ts, tests/{skill,naming}.test.ts

Verified by execution: `bunx tsc --noEmit` clean; `bun test tests/` → **58 pass, 0 fail** (incl. the 4 new naming tests and 2 skill tests, real Chromium); workspace SKILL.md diff vs packaged copy: identical; every `ui:*` name used in pages/ + docs/ greps clean against `checkVocab`'s known set (no false-positive warns on shipped content).

**B1 — partially fixed.** naming.md rule 2 is now correct and complete: five-families table with heads **and** named satellites (declare = `ui:state` + `ui:computed`; react = `ui:bind`/`ui:bind-<aspect>` + `ui:model`; repeat = `ui:each` + `ui:key` + `ui:sortable`; act = `ui:fx` + `ui:transition`; compose = `ui:use`); the ≤5-letter rule is rescoped to heads with `fx` as the one licensed abbreviation; the value-sentinel clause (which also closes N1) and the "new families strongly discouraged" clause are in. **But the SKILL.md half of the fix was not done**: SKILL.md line 8 ("plain HTML plus four attribute families") and line 10 ("## The four attribute families") still say **four** while naming.md rule 2 says **five** — the exact cross-document contradiction B1 flagged, and its fix line said explicitly "and fix SKILL.md's count".

**B2 — fixed.** `src/fx.ts`:43 unknown verbs now throw a named error (`ui: unknown verb "${name}" (see skill/SKILL.md for the catalog)`) via the catch in `parseVerb`; `src/scan.ts` adds `checkVocab` with `KNOWN_UI_ATTRS` + the `ui:bind`/`ui:bind-*` regex + `ENHANCERS` keys (literal `'ui:*'` strings, so membership works), wired into both `attachFlat` and `attach`, and `guard` routes the throw into `window.__ui.warns`. Verified end-to-end by the passing test: `parseVerb('stpo n = 1')` throws, a typo'd `ui:fx` and a typo'd `ui:stat` both land named warnings.

**B3 — fixed.** SKILL.md now carries `ui:sortable` (family-table row), `ui:model`, `ui:textarea`/`ui:select`/`ui:checkbox`, and `onsuccess`; `tests/skill.test.ts` adds the src↔SKILL completeness test (derives quoted `ui:*` literals from `src/*.ts`, collapses `ui:bind-*` to the family, excludes the `ui:navigated` event) which would have caught the missing `ui:sortable`; workspace copy is byte-identical to the packaged copy.

**S1 — fixed.** `src/binds.ts`:39 variant regex is now `^ui:bind(?:-([a-zA-Z:][\w:-]*))?$` — hyphens and colons accepted, so `ui:bind-attr:aria-label` parses; the list-form regex `^(attr:[\w-]+|[a-z]+):\s*(…)$` matches the `attr:` alternative first, killing the colon collision; `applyAspect` sets/removes the attribute. Both forms verified by real DOM assertions in naming.test.ts (`href` and `aria-label` written from state). SKILL.md documents `attr:<name>` with the `ui:bind-attr:href` example.

**S2 — fixed.** naming.md rule 1 states the three licensed bare lanes (enhancer props; `ui:use` component props; native extension points `data-*`/`aria-*`/`role`, naming `data-screen` explicitly), plus "anything bare outside these lanes is a bug" and the SKILL-table enforcement line.

**S3 — fixed.** `parseVerb` treats `onfail`/`onsuccess` as gates (payload = argument with an optional leading `toast` stripped; colon style tolerated); `attachFx` gates on the last `call`'s outcome and `continue`s — the list always continues. naming.md rule 6 reclassifies them as response gates in the DOM `on*` tradition, not verbs, and documents the paired idiom; SKILL.md documents both with the never-aborts note. The test proves paired usage: on success exactly the `onsuccess` branch fires, on failure exactly the `onfail` branch, and the trailing `toast` runs in both cases. Two nits, non-blocking: (a) the gate branch sits **outside** the loop's `try`, so a malformed gate payload expression throws out of the async handler — unhandled rejection, remaining verbs skipped, no `warns` entry — the one case where "never aborts" doesn't hold; (b) the payload is still toast-only at runtime (a non-toast payload would be evaluated as an expression and fail) — the docs are honest about this, naming.md's "run their payload" slightly overpromises. Also: fx.ts:152-153 retains an unreachable second `else if (v.name === 'onfail')` branch from the old implementation (dead code).

**S4 — fixed as scoped.** naming.md rule 4 now requires each enhancer to state its allowed host tags in the vocabulary table (making the collision clause checkable) and documents axis semantics — `ui:row align` moves the **cross** axis, `center` does both; SKILL.md:51 carries the same align note. Note the vocabulary table does not yet actually list host tags per enhancer — the rule is in place, populating it is follow-through (consistent with the review's text-only migration scope).

**S5 — fixed.** Rule 3 is retitled "Aspects are DOM names — and the list is closed", corrects the DOM claim (existing properties `hidden disabled checked open`; exactly two licensed shortenings `textContent`→`text`, `className`→`class`), states the closed list with rule 7.1 as the only entry path and a mandatory value-semantics statement (naming the `style` case explicitly) — resolves growth tests (a) and (e) as intended.

Advisory notes also landed: N1 (value-sentinel clause, rule 2), N2 (rule 8 "Known cost: the colon"), N3 (rule 5 loosened to "adjectives or nouns-read-as-modifiers"), N4 (SKILL.md now points at `ui:bind-hidden`; no `ui:empty` anywhere), N5 (ALIASES marked a 1.0-blocking commitment, rule 7), N10 (rule 7.3 "shipped class and/or behavior wiring"). N6's tier language was not adopted (rule 9 keeps budget wording only) — advisory, acceptable.

**New issues introduced by the fixes:**
1. SKILL.md "four attribute families" vs naming.md's five — the B1 remainder (above).
2. Gate payload evaluated outside the loop's try — a malformed gate expression aborts the remaining verb list via unhandled rejection with no warns entry, contradicting the documented "never aborts" in that error case (fx.ts:143).
3. Stale count in SKILL.md's dev loop: "bun test tests/ # 42 tests" — the suite is now 58.
4. Dead unreachable `onfail` branch left in fx.ts:152-153.

## Final verdict

NEEDS-FIXES — one item: **B1 remainder** — SKILL.md still says "four attribute families" (lines 8 and 10) while naming.md rule 2 says five; make them agree (SKILL.md's own table documents six rows plus the "Plus:" satellites, so "five families" is the count to converge on). Everything else — B2, B3, S1–S5, and the advisory notes — is correctly applied and verified by execution. Items 2–4 above are non-blocking nits worth folding into the same pass.

### Final confirmation pass — 2026-09-25

1. **B1 remainder — fixed.** skill/SKILL.md:8 now reads "a small attribute grammar (five families plus satellites)" and line 10 "## The attribute families" — no "four attribute families" remains; the workspace copy (.zcode/skills/leonxstream/SKILL.md) is byte-identical. naming.md and SKILL.md now agree on five families.
2. **Gate-payload nit — fixed.** fx.ts:144-145: the gate payload is wrapped in `try { toast(safeEval(...)) } catch (e) { warn(...) }` with the "must not abort the list" comment; the `continue` follows outside the conditional, so a malformed gate expression warns and the remaining verbs still run — "never aborts" now holds in the error case too.
3. **Stale test count — fixed.** SKILL.md:111 now says "58 tests: e2e + comparisons + grammar guarantees".
4. **Dead code — fixed.** The unreachable second `else if (v.name === 'onfail')` dispatch branch is gone; `onfail`/`onsuccess` now appear only in `parseVerb`'s gate classification and the gate block.

Caller-verified this round: `bunx tsc --noEmit` clean; `bun test tests/` → 58 pass, 0 fail.

**Final verdict: APPROVED** — all blockers (B1–B3), should-fixes (S1–S5), advisory notes, and the four re-verification items are correctly applied and consistent across naming.md, skill/SKILL.md (both copies), and src.
