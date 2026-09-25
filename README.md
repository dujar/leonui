# leonui

**HTML is the schema; the browser is the framework.**

leonui is a typed reactive UI runtime for plain HTML: author markup plus a small
attribute grammar (`ui:state`, `ui:bind`, `ui:each`, `ui:fx`, `ui:use`), and a ~31 KB
runtime (11.6 KB gzipped) provides signals, keyed lists, a closed effect-verb catalog,
entrance animation, and validation that turns every malformed attribute into a named
warning — no build step, no components, no vdom, no eval. A separate optional stylesheet
supplies the structural enhancer classes. Built agent-first: the authoring grammar ships
with the npm package as an agent-facing skill, and a browser-free checker verifies a page
before anything renders.

**Start here → [`leonui/README.md`](leonui/README.md)** — install, grammar, examples,
benchmarks, contributing.

## Repository layout

| Path | What it is |
|---|---|
| [`leonui/`](leonui/) | the framework: runtime (`src/`), docs site, component gallery, tests, npm package |
| [`skills/leonui/`](skills/leonui/SKILL.md) | agent-agnostic discovery copy of the authoring skill (repo root, any tool can find it) |
| [`AGENTS.md`](AGENTS.md) | entry point for coding agents — routes to the skill before anything else |
| [`ui/`](ui/), [`demo/`](demo/) | plain-JS prototypes; historical reference |

## Links

- npm: [`leonui`](https://www.npmjs.com/package/leonui) · CDN: `https://cdn.jsdelivr.net/npm/leonui@0/`
- Grammar rulebook: [`leonui/naming.md`](leonui/naming.md)
- Benchmarks: [`leonui/benchmark.md`](leonui/benchmark.md)

## Where truth lives

Each fact is owned by exactly one document — everything else routes to it and does not
restate it:

| Topic | Source of truth |
|---|---|
| The vocabulary (names, prop values, hosts, companions, verbs) | `leonui/src/vocab.ts` — read by the runtime, by the `ui check` CLI, and rendered into the skill by `bun run grammar` |
| Authoring grammar (attributes, verbs, expressions, enhancers, motion, gotchas) | [`leonui/skill/SKILL.md`](leonui/skill/SKILL.md) — byte-identical twin at [`skills/leonui/SKILL.md`](skills/leonui/SKILL.md), kept in lockstep with `src/` by `tests/skill.test.ts` and `bun run grammar:check` |
| Naming & growth policy | [`leonui/naming.md`](leonui/naming.md) |
| Install, dev loop, structure, benchmark summary | [`leonui/README.md`](leonui/README.md); measured timings live only in the generated [`leonui/benchmark.md`](leonui/benchmark.md) |
| Tutorials & live examples | [`leonui/docs/`](leonui/docs/), served at `/docs/` by `bun run dev` — includes the landing-page patterns page |
| Component gallery | `leonui/pages/`, served at `/pages/` — includes a full landing page |
| Design history & audits | [`leonui/audit.md`](leonui/audit.md), `leonui/judgment-*.md`, `ui/` + `demo/` — dated records, frozen |

## License

[MIT](leonui/LICENSE)
