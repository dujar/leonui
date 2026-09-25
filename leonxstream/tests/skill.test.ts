/* skill.test.ts — the agent-facing skill must never drift from the packaged copy:
 * .zcode/skills/leonxstream/SKILL.md (workspace discovery) ≡ skill/SKILL.md (ships with package). */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

test('skill: workspace copy matches packaged copy', () => {
  const packaged = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../../.zcode/skills/leonxstream/SKILL.md', import.meta.url), 'utf8');
  expect(workspace).toBe(packaged);
});
