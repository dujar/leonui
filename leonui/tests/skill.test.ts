/* skill.test.ts — the agent-facing skill must never drift:
 * skills/leonui/SKILL.md (repo-root discovery copy, agent-agnostic) ≡ skill/SKILL.md (ships with package). */
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
