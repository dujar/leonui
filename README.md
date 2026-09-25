# leonui

**HTML is the schema; the browser is the framework.**

leonui is a typed reactive UI runtime for plain HTML: author markup plus a small
attribute grammar (`ui:state`, `ui:bind`, `ui:each`, `ui:fx`, `ui:use`), and a ~27 KB
runtime provides signals, keyed lists, and a closed effect-verb catalog — no build step,
no components, no vdom, no eval. Built agent-first: the authoring grammar ships with the
npm package as an agent-facing skill.

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

## License

[MIT](leonui/LICENSE)
