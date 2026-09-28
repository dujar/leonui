/* grammar.ts — generate the vocabulary half of the skill FROM the vocabulary.
 *
 * `vocab.ts` is read by three consumers: the runtime, the browser-free `ui check`,
 * and the tables in `skill/SKILL.md`. The first two read the table directly. The
 * third was hand-written, so it was the one consumer free to drift — and it did:
 * `ui:reveal` existed in the table, was accepted by the checker, and was documented
 * nowhere, until `skill.test.ts` noticed the *name* was absent. A missing name is
 * the mildest version of this. A missing value in a set, or a host contract that
 * says `<div>` where the runtime demands `<dialog>`, drifts in silence — and those
 * are exactly the two things an agent reads the skill to learn.
 *
 * So the table is rendered from the same object the runtime validates against,
 * written between markers, and `--check` fails when the committed file is stale.
 * A second consumer cannot drift from a table it is generated from.
 *
 *   bun run grammar          # rewrite skill/SKILL.md, skills/leonui/SKILL.md, grammar.json
 *   bun run grammar:check    # exit 1 if any of them is stale (the CI gate)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASPECTS, COMPANIONS, CORE_ATTRS, CORE_HOSTS, CORE_PROPS, ENHANCER_SPECS,
  GATES, ICON_NAMES, SENTINELS, VERB_NAMES, VERBS,
} from '../src/vocab.ts';
import type { EnhancerSpec, PropSpec } from '../src/vocab.ts';

const pkg = fileURLToPath(new URL('../', import.meta.url));

/* ---------- markdown rendering ---------- */

/** `gap=1..8` / `align=start|center|…` / `ratio="3/2"` — the example and the
 * description both come out of the hint, so a cell can never advertise a value or
 * a shape the runtime would reject. */
function propCell(name: string, ps: PropSpec): string {
  if (ps.values) return `\`${name}=${ps.values.join('\\|')}\``;
  if (ps.range) return `\`${name}=${ps.range[0]}..${ps.range[1]}\``;
  const hint = ps.hint ?? '';
  const ex = /\be\.g\.\s*("[^"]+"|'[^']+')/.exec(hint);
  const words = hint.split(/,\s*e\.g\./)[0]!.trim();
  const head = `\`${name}${ex ? '=' + ex[1] : ''}\``;
  return words ? `${head} (${words})` : head;
}

/** the host column doubles as the notes column, because a host contract and a
 * caveat are read together: "`<svg>` only" is the reason `name` is legal there. */
function hostCell(spec: EnhancerSpec): string {
  const bits: string[] = [];
  bits.push(spec.hosts
    ? `**${spec.hosts.map(h => `\`<${h}>\``).join(' or ')} only**`
    : 'any element');
  if (spec.requiresAttr) bits.push(`also needs the native \`${spec.requiresAttr}\` attribute`);
  if (spec.note) bits.push(spec.note);
  return bits.join('; ');
}

function enhancerTable(): string {
  const rows = Object.entries(ENHANCER_SPECS).map(([name, spec]) => {
    const cells = [
      ...Object.entries(spec.props ?? {}).map(([p, ps]) => propCell(p, ps)),
      ...(spec.flags ?? []).map(f => `\`${f}\``),
    ];
    return `| \`${name}\` | ${cells.length ? cells.join(', ') : '—'} | ${hostCell(spec)} |`;
  });
  return ['| Enhancer | Props (value vocabularies) | Host / notes |', '|---|---|---|', ...rows].join('\n');
}

/** `inline` regions sit inside a markdown table cell, so they must not bring
 * newlines with them — a `\n` in a table row ends the row. */
type Kind = 'block' | 'inline';

function aspectsInline(): string {
  return ASPECTS.map(a => `\`${a}\``).join(' ');
}

function verbsLine(): string {
  return [
    `Verbs (${VERBS.length}): ${VERBS.map(v => `\`${v}\``).join(' ')}.`,
    `Response gates (${GATES.length}, not verbs): ${GATES.map(g => `\`${g}\``).join(' ')}.`,
  ].join('\n');
}

const REGIONS: ReadonlyArray<readonly [string, string, Kind]> = [
  ['enhancers', enhancerTable(), 'block'],
  ['aspects', aspectsInline(), 'inline'],
  ['verbs', verbsLine(), 'block'],
];

const beginOf = (name: string): string => `<!-- BEGIN GENERATED: ${name} -->`;
const endOf = (name: string): string => `<!-- END GENERATED: ${name} -->`;

/** Replace the body of every generated region, leaving all hand-written prose —
 * the invariants, the gotchas, the cheat sheet — exactly as the author wrote it. */
function applyRegions(src: string): string {
  let out = src;
  for (const [name, body, kind] of REGIONS) {
    const begin = beginOf(name);
    const end = endOf(name);
    const i = out.indexOf(begin);
    const j = out.indexOf(end);
    if (i < 0 || j < 0 || j < i) throw new Error(`SKILL.md is missing the "${name}" generated markers`);
    const pad = kind === 'inline' ? '' : '\n';
    out = out.slice(0, i + begin.length) + pad + body.trimEnd() + pad + out.slice(j);
  }
  return out;
}

/* ---------- the machine-readable dump ---------- */

/** `RegExp` does not survive JSON, so a pattern travels as its source. Anything
 * reading `grammar.json` and wanting to validate can rebuild it with `new RegExp`. */
function propJson(ps: PropSpec): Record<string, unknown> {
  return {
    ...(ps.values ? { values: [...ps.values] } : {}),
    ...(ps.range ? { range: [...ps.range] } : {}),
    ...(ps.pattern ? { pattern: ps.pattern.source } : {}),
    ...(ps.hint ? { hint: ps.hint } : {}),
  };
}

function grammarJson(): string {
  const enhancers: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(ENHANCER_SPECS)) {
    enhancers[name] = {
      ...(spec.props ? { props: Object.fromEntries(Object.entries(spec.props).map(([p, ps]) => [p, propJson(ps)])) } : {}),
      ...(spec.flags ? { flags: [...spec.flags] } : {}),
      ...(spec.hosts ? { hosts: [...spec.hosts] } : {}),
      ...(spec.requiresAttr ? { requiresAttr: spec.requiresAttr } : {}),
      ...(spec.note ? { note: spec.note } : {}),
    };
  }
  return JSON.stringify({
    $comment: 'GENERATED from src/vocab.ts by scripts/grammar.ts — do not edit by hand. It is the same table the runtime validates against and `ui check` reports from.',
    coreAttrs: [...CORE_ATTRS],
    coreHosts: CORE_HOSTS,
    coreProps: Object.fromEntries(Object.entries(CORE_PROPS).map(([a, ps]) => [a, propJson(ps)])),
    companions: COMPANIONS,
    bindAspects: [...ASPECTS],
    verbs: [...VERBS],
    gates: [...GATES],
    sentinels: [...SENTINELS],
    icons: [...ICON_NAMES],
    enhancers,
  }, null, 2) + '\n';
}

/* ---------- run ---------- */

/** `skill/` is the copy that ships inside the npm package; `../skills/leonui/` is
 * the copy the repo root exposes. They are byte-identical, and generating both is
 * what keeps them so. Each entry is [path to write, which generated file goes there].
 *
 * The mirror is skipped when its directory is absent — the package is also usable
 * as a plain checkout with no repo root above it, and a generator that throws there
 * would be a generator nobody runs. */
const MIRROR = '../skills/leonui';
const TARGETS: ReadonlyArray<readonly [string, string]> = [
  ['skill/SKILL.md', 'skill/SKILL.md'],
  [`${MIRROR}/SKILL.md`, 'skill/SKILL.md'],
  ['skill/grammar.json', 'skill/grammar.json'],
  [`${MIRROR}/grammar.json`, 'skill/grammar.json'],
];

const mirrored = (): boolean => existsSync(join(pkg, MIRROR));

export function generate(): Record<string, string> {
  const skill = applyRegions(readFileSync(join(pkg, 'skill/SKILL.md'), 'utf8'));
  const json = grammarJson();
  return { 'skill/SKILL.md': skill, 'skill/grammar.json': json };
}

/** Every target whose committed content differs from what the generator produces. */
export function stale(): string[] {
  const out: string[] = [];
  const files = generate();
  const mirror = mirrored();
  for (const [rel, key] of TARGETS) {
    if (rel.startsWith(MIRROR) && !mirror) continue;
    let current: string;
    try { current = readFileSync(join(pkg, rel), 'utf8'); }
    catch { out.push(rel + ' (missing)'); continue; }
    if (current !== files[key]) out.push(rel);
  }
  return out;
}

export function write(): string[] {
  const files = generate();
  const mirror = mirrored();
  const wrote: string[] = [];
  for (const [rel, key] of TARGETS) {
    if (rel.startsWith(MIRROR) && !mirror) continue;
    writeFileSync(join(pkg, rel), files[key]!);
    wrote.push(rel);
  }
  return wrote;
}

if (import.meta.main) {
  if (process.argv.includes('--check')) {
    const bad = stale();
    if (bad.length) {
      console.error('generated vocabulary is stale:\n  ' + bad.join('\n  '));
      console.error('\nrun `bun run grammar` and commit the result.');
      process.exitCode = 1;
    } else {
      console.log(`grammar: ${TARGETS.length} generated files match src/vocab.ts`);
    }
  } else {
    console.log('grammar: wrote\n  ' + write().join('\n  '));
  }
}
