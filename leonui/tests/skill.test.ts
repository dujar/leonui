/* skill.test.ts — the agent-facing skill must never drift:
 * skills/leonui/SKILL.md (repo-root discovery copy, agent-agnostic) ≡ skill/SKILL.md (ships with package). */
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASPECTS, ENHANCER_NAMES, ENHANCER_SPECS, VERBS, VERB_NAMES } from '../src/vocab.ts';
import { generate, stale } from '../scripts/grammar.ts';

test('skill: repo-root discovery copy matches packaged copy', () => {
  const packaged = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
  const discovery = readFileSync(new URL('../../skills/leonui/SKILL.md', import.meta.url), 'utf8');
  expect(discovery).toBe(packaged);
});

test('skill: vocabulary completeness — every ui:* name in src is documented', () => {
  const skill = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const names = new Set<string>();
  for (const f of readdirSync(srcDir).filter(f => f.endsWith('.ts'))) {
    const text = readFileSync(srcDir + f, 'utf8');
    for (const m of text.matchAll(/['"`](ui:[a-z][a-z:-]*)['"`]/g)) names.add(m[1]!);
  }
  names.delete('ui:navigated'); // custom event name, not an attribute
  // ui:bind-* variants and the bind attribute itself collapse to the family
  const missing = [...names].filter(n => n !== 'ui:bind' && !/^ui:bind-/.test(n) && !skill.includes(n));
  expect(missing, `shipped but undocumented in SKILL.md: ${missing.join(', ')}`).toEqual([]);
});

/* ---------- the generated regions ----------
 *
 * The name check above is the weak half: it only asks whether a *name* appears
 * somewhere. A value set can lose a member, or a host contract can say `<div>`
 * where the runtime demands `<dialog>`, and every name is still present. The
 * table is generated from vocab.ts precisely so that cannot happen, and these
 * tests are what keep the committed file generated. */

test('skill: the generated regions are not stale', () => {
  const bad = stale();
  expect(bad, `run \`bun run grammar\` and commit: ${bad.join(', ')}`).toEqual([]);
});

test('skill: the generated table states every prop, value, host and flag', () => {
  const table = generate()['skill/SKILL.md']!;
  const body = table.slice(table.indexOf('BEGIN GENERATED: enhancers'), table.indexOf('END GENERATED: enhancers'));

  for (const name of ENHANCER_NAMES) {
    const spec = ENHANCER_SPECS[name]!;
    expect(body, `${name} has no row`).toContain(`\`${name}\``);
    for (const prop of Object.keys(spec.props ?? {})) {
      // the prop is named, and a closed set is listed in full — a truncated set is
      // the drift that reads as "I wrote a legal value and it warned"
      const cell = propCellOf(body, name);
      expect(cell, `${name} ${prop} missing from the table`).toContain(prop);
      for (const v of spec.props![prop]!.values ?? []) expect(cell, `${name} ${prop}=${v} not listed`).toContain(v);
    }
    for (const flag of spec.flags ?? []) expect(propCellOf(body, name), `${name} ${flag}`).toContain(flag);
    for (const host of spec.hosts ?? []) expect(hostCellOf(body, name), `${name} host <${host}>`).toContain(`<${host}>`);
    if (spec.requiresAttr) expect(hostCellOf(body, name), `${name} requiresAttr`).toContain(spec.requiresAttr);
  }
});

test('skill: the generated verb and aspect sets are the runtime sets', () => {
  const table = generate()['skill/SKILL.md']!;
  for (const v of VERB_NAMES) expect(table).toContain(`\`${v}\``);
  for (const a of ASPECTS) expect(table).toContain(`\`${a}\``);
  expect(table).toContain(`Verbs (${VERBS.length}):`);
});

/** the middle cell of an enhancer's table row */
function propCellOf(table: string, enhancer: string): string {
  const row = table.split('\n').find(l => l.startsWith(`| \`${enhancer}\` |`));
  return row ? row.split(' | ')[1]! : '';
}
/** the last cell of an enhancer's table row */
function hostCellOf(table: string, enhancer: string): string {
  const row = table.split('\n').find(l => l.startsWith(`| \`${enhancer}\` |`));
  return row ? row.split(' | ').at(-1)!.replace(/\|\s*$/, '') : '';
}
