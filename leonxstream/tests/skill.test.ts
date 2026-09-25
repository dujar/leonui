/* skill.test.ts — the agent-facing skill must never drift from the packaged copy:
 * .zcode/skills/leonxstream/SKILL.md (workspace discovery) ≡ skill/SKILL.md (ships with package). */
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

test('skill: workspace copy matches packaged copy', () => {
  const packaged = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../../.zcode/skills/leonxstream/SKILL.md', import.meta.url), 'utf8');
  expect(workspace).toBe(packaged);
});

test('skill: vocabulary completeness — every ui:* name in src is documented', () => {
  const skill = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
  const srcDir = new URL('../src/', import.meta.url).pathname;
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
