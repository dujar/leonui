/* bench/study/grade.ts — the study's functional grader, written BEFORE any agent
 * run (pre-registration; see bench/study/README.md) and proven against hand-
 * written reference fixtures in bench/study/selftest/.
 *
 *   bun bench/study/grade.ts                # grade the agent runs in run/
 *   bun bench/study/grade.ts --dir selftest # grade the grader fixtures
 *
 * For every framework x task page it drives the real DOM through the task
 * scenario — set values + dispatch input events, .click() buttons,
 * form.requestSubmit() — and asserts rendered text, computed styles,
 * checkVisibility(), and aria-selected. The scenario is byte-identical for both
 * frameworks: every finder is text/attribute-based, never structure-based, so
 * neither framework's idiomatic markup is favored.
 *
 * Writes bench/study/artifacts/grade-<dir>.json and prints a table.
 * Exit 0 iff every run passes every assertion.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { Browser } from '../../tests/harness.ts';

const STUDY = fileURLToPath(new URL('.', import.meta.url));
const dirArg = process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1]! : 'run';
if (dirArg !== 'run' && dirArg !== 'selftest') {
  console.error('usage: bun bench/study/grade.ts [--dir run|selftest]');
  process.exit(2);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/favicon.ico') return new Response(null, { status: 200 });
    const root = p.startsWith('/dist/') ? resolve(STUDY, '../..') : p === '/src/ui.css' ? resolve(STUDY, '../..') : STUDY;
    const file = resolve(root, p.replace(/^\//, ''));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    try {
      return new Response(readFileSync(file), { headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  },
});

/* ---------- page-context helpers, injected into every page before grading ---------- */

const PRELUDE = `
window.__g = {
  lines: () => ((document.body && document.body.innerText) || '').split('\\n').map(s => s.trim()).filter(Boolean),
  visible: el => !!el && (typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null),
  smallest: els => els.length ? els.reduce((a, b) => (b.textContent.length < a.textContent.length ? b : a)) : null,
  byText: txt => window.__g.smallest([...document.querySelectorAll('body *')].filter(el => el.textContent.includes(txt))),
  setVal: (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
};
`;

/* ---------- per-task helpers + scenario steps (identical for both frameworks) ---------- */

interface Assert { name: string; body: string }
interface Step { name: string; do?: string; asserts: Assert[] }
interface Task { prelude: string; steps: Step[] }

/* A: static detail (embedded as a JS string literal); AX: dynamic detail expression. */
const A = (name: string, pass: string, detail: string): Assert => ({ name, body: `{ pass: ${pass}, detail: ${JSON.stringify(detail)} }` });
const AX = (name: string, pass: string, detailExpr: string): Assert => ({ name, body: `{ pass: ${pass}, detail: String(${detailExpr}) }` });
/* DO bodies are statement lists, not expressions — `return (a; b)` would be a SyntaxError. */
const DO = (body: string) => `(() => { try { ${body}; return { ok: true }; } catch (e) { return { error: String(e).slice(0, 200) }; } })()`;
const RUN_ASSERT = (body: string) =>
  `(() => { try { const r = (${body}); return { pass: !!r.pass, detail: String(r.detail ?? '') }; } catch (e) { return { pass: false, detail: String(e).slice(0, 200) }; } })()`;

const TODO: Task = {
  prelude: `
window.__t = {
  otherNames: ['alpha task', 'beta task', 'gamma task'],
  input: () => document.querySelector('input[placeholder="What needs doing?"]'),
  addBtn: () => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add'),
  status: () => window.__g.lines().find(s => /^\\d+ left$/.test(s)) || null,
  row: txt => window.__g.smallest([...document.querySelectorAll('body *')].filter(el =>
    el.textContent.includes(txt) &&
    el.querySelector('input[type="checkbox"]') &&
    [...el.querySelectorAll('button')].some(b => /remove/i.test(b.textContent)) &&
    !window.__t.otherNames.some(o => o !== txt && el.textContent.includes(o)))),
  struck: txt => {
    const row = window.__t.row(txt);
    return !!row && [row, ...row.querySelectorAll('*')].some(el => el.textContent.includes(txt) &&
      getComputedStyle(el).textDecorationLine.split(' ').includes('line-through'));
  },
  check: txt => { const r = window.__t.row(txt); return r ? r.querySelector('input[type="checkbox"]') : null; },
  removeBtn: txt => { const r = window.__t.row(txt); return r ? [...r.querySelectorAll('button')].find(b => /remove/i.test(b.textContent)) || null : null; },
  addAs: v => { window.__g.setVal(window.__t.input(), v); window.__t.addBtn().click(); return true; },
};`,
  steps: [
    { name: 'initial state', asserts: [
      AX('status reads 0 left', `window.__t.status() === '0 left'`, `window.__t.status()`),
      A('no rows yet', `!window.__t.row('alpha task') && !window.__t.row('beta task')`, 'rows present'),
    ] },
    { name: 'empty add does nothing', do: DO(`window.__t.addAs('')`), asserts: [
      AX('status still 0 left', `window.__t.status() === '0 left'`, `window.__t.status()`),
      A('still no rows', `!window.__t.row('alpha task')`, 'a row appeared'),
    ] },
    { name: 'add alpha', do: DO(`window.__t.addAs('alpha task')`), asserts: [
      A('alpha row exists', `!!window.__t.row('alpha task')`, 'row missing'),
      AX('status 1 left', `window.__t.status() === '1 left'`, `window.__t.status()`),
      A('alpha not struck', `!window.__t.struck('alpha task')`, 'title already struck'),
      AX('input cleared', `window.__t.input().value === ''`, `"value=" + window.__t.input().value`),
    ] },
    { name: 'add beta', do: DO(`window.__t.addAs('beta task')`), asserts: [
      A('beta row exists', `!!window.__t.row('beta task')`, 'row missing'),
      AX('status 2 left', `window.__t.status() === '2 left'`, `window.__t.status()`),
    ] },
    { name: 'add gamma', do: DO(`window.__t.addAs('gamma task')`), asserts: [
      A('gamma row exists', `!!window.__t.row('gamma task')`, 'row missing'),
      AX('status 3 left', `window.__t.status() === '3 left'`, `window.__t.status()`),
    ] },
    { name: 'tick alpha done', do: DO(`window.__t.check('alpha task').click()`), asserts: [
      A('alpha struck', `window.__t.struck('alpha task')`, 'no line-through'),
      AX('status 2 left', `window.__t.status() === '2 left'`, `window.__t.status()`),
      A('beta not struck', `!window.__t.struck('beta task')`, 'beta struck too'),
      A('gamma not struck', `!window.__t.struck('gamma task')`, 'gamma struck too'),
    ] },
    { name: 'untick alpha', do: DO(`window.__t.check('alpha task').click()`), asserts: [
      A('alpha unstruck', `!window.__t.struck('alpha task')`, 'still struck'),
      AX('status 3 left', `window.__t.status() === '3 left'`, `window.__t.status()`),
    ] },
    { name: 'tick alpha again', do: DO(`window.__t.check('alpha task').click()`), asserts: [
      A('alpha struck', `window.__t.struck('alpha task')`, 'no line-through'),
      AX('status 2 left', `window.__t.status() === '2 left'`, `window.__t.status()`),
    ] },
    { name: 'remove beta (not done)', do: DO(`window.__t.removeBtn('beta task').click()`), asserts: [
      A('beta row gone', `!window.__t.row('beta task')`, 'row still present'),
      A('alpha still there', `!!window.__t.row('alpha task')`, 'alpha vanished'),
      A('gamma still there', `!!window.__t.row('gamma task')`, 'gamma vanished'),
      A('alpha still struck', `window.__t.struck('alpha task')`, 'line-through lost'),
      AX('status 1 left', `window.__t.status() === '1 left'`, `window.__t.status()`),
    ] },
  ],
};

const FILTER: Task = {
  prelude: `
window.__t = {
  names: ['Aluminum Tee', 'Bamboo Desk Mat', 'Copper Kettle', 'Desk Cable Tray', 'Ergo Footrest', 'Felt Organizer', 'Gel Wrist Rest', 'Hub Adapter Pro', 'Ink Roller Pen', 'Jute Storage Bin'],
  input: () => document.querySelector('input[placeholder="Search products"]'),
  type: v => { window.__g.setVal(window.__t.input(), v); return true; },
  visibleNames: () => window.__t.names.filter(n => window.__g.visible(window.__g.byText(n))),
};`,
  steps: [
    { name: 'initial: all 10 visible', asserts: [
      AX('all 10 visible', `JSON.stringify(window.__t.visibleNames()) === JSON.stringify(window.__t.names)`, `JSON.stringify(window.__t.visibleNames())`),
    ] },
    { name: 'type desk', do: DO(`window.__t.type('desk')`), asserts: [
      AX('exactly the 2 desk products visible', `JSON.stringify(window.__t.visibleNames()) === JSON.stringify(['Bamboo Desk Mat', 'Desk Cable Tray'])`, `JSON.stringify(window.__t.visibleNames())`),
    ] },
    { name: 'type DESK (case-insensitive)', do: DO(`window.__t.type('DESK')`), asserts: [
      AX('same 2 products visible', `JSON.stringify(window.__t.visibleNames()) === JSON.stringify(['Bamboo Desk Mat', 'Desk Cable Tray'])`, `JSON.stringify(window.__t.visibleNames())`),
    ] },
    { name: 'type zzz (no matches)', do: DO(`window.__t.type('zzz')`), asserts: [
      AX('nothing visible', `window.__t.visibleNames().length === 0`, `JSON.stringify(window.__t.visibleNames())`),
    ] },
    { name: 'type Ergo', do: DO(`window.__t.type('Ergo')`), asserts: [
      AX('only Ergo Footrest visible', `JSON.stringify(window.__t.visibleNames()) === JSON.stringify(['Ergo Footrest'])`, `JSON.stringify(window.__t.visibleNames())`),
    ] },
    { name: 'clear query', do: DO(`window.__t.type('')`), asserts: [
      AX('all 10 visible again', `JSON.stringify(window.__t.visibleNames()) === JSON.stringify(window.__t.names)`, `JSON.stringify(window.__t.visibleNames())`),
    ] },
  ],
};

const FORM: Task = {
  prelude: `
window.__t = {
  form: () => document.querySelector('form'),
  field: n => document.querySelector('input[name="' + n + '"]'),
  fill: (n, v) => { window.__g.setVal(window.__t.field(n), v); return true; },
  submit: () => { window.__t.form().requestSubmit(); return true; },
  has: s => ((document.body && document.body.innerText) || '').includes(s),
};`,
  steps: [
    { name: 'empty submit shows required errors', do: DO(`window.__t.submit()`), asserts: [
      A('name error shown', `window.__t.has('Name is required')`, 'missing'),
      A('email error shown', `window.__t.has('Enter a valid email')`, 'missing'),
      A('no age error', `!window.__t.has('Age must be 1-120')`, 'age error shown for empty age'),
      A('no welcome yet', `!window.__t.has('Welcome')`, 'welcome shown'),
    ] },
    { name: 'invalid email', do: DO(`window.__t.fill('name', 'Ada'); window.__t.fill('email', 'bad'); window.__t.submit()`), asserts: [
      A('email error shown', `window.__t.has('Enter a valid email')`, 'missing'),
      A('name error gone', `!window.__t.has('Name is required')`, 'name error persisted'),
      A('no welcome yet', `!window.__t.has('Welcome')`, 'welcome shown'),
    ] },
    { name: 'valid submit', do: DO(`window.__t.fill('email', 'ada@example.com'); window.__t.submit()`), asserts: [
      A('welcome shown', `window.__t.has('Welcome, Ada!')`, 'missing'),
      A('no name error', `!window.__t.has('Name is required')`, 'shown'),
      A('no email error', `!window.__t.has('Enter a valid email')`, 'shown'),
      A('no age error', `!window.__t.has('Age must be 1-120')`, 'shown'),
    ] },
    { name: 'age 300 invalid', do: DO(`window.__t.fill('age', '300'); window.__t.submit()`), asserts: [
      A('age error shown', `window.__t.has('Age must be 1-120')`, 'missing'),
    ] },
    { name: 'age abc invalid', do: DO(`window.__t.fill('age', 'abc'); window.__t.submit()`), asserts: [
      A('age error shown', `window.__t.has('Age must be 1-120')`, 'missing'),
    ] },
    { name: 'age 12.5 invalid', do: DO(`window.__t.fill('age', '12.5'); window.__t.submit()`), asserts: [
      A('age error shown', `window.__t.has('Age must be 1-120')`, 'missing'),
    ] },
  ],
};

const TABS: Task = {
  prelude: `
window.__t = {
  ov: 'The starter plan includes every core feature.',
  de: 'Billing is monthly and you can cancel anytime.',
  pr: 'The starter plan costs nine dollars per month.',
  tab: l => [...document.querySelectorAll('button,[role="tab"]')].find(b => b.textContent.trim() === l) || null,
  vis: s => window.__g.visible(window.__g.byText(s)),
  sel: l => { const t = window.__t.tab(l); return t ? t.getAttribute('aria-selected') : null; },
  click: l => { const t = window.__t.tab(l); if (!t) return false; t.click(); return true; },
};`,
  steps: [
    { name: 'overview active on load', asserts: [
      A('overview panel visible', `window.__t.vis(window.__t.ov)`, 'not visible'),
      A('details panel hidden', `!window.__t.vis(window.__t.de)`, 'visible'),
      A('pricing panel hidden', `!window.__t.vis(window.__t.pr)`, 'visible'),
      AX('overview aria-selected true', `window.__t.sel('Overview') === 'true'`, `window.__t.sel('Overview')`),
      AX('details aria-selected false', `window.__t.sel('Details') === 'false'`, `window.__t.sel('Details')`),
      AX('pricing aria-selected false', `window.__t.sel('Pricing') === 'false'`, `window.__t.sel('Pricing')`),
    ] },
    { name: 'click Details', do: DO(`window.__t.click('Details')`), asserts: [
      A('details panel visible', `window.__t.vis(window.__t.de)`, 'not visible'),
      A('overview panel hidden', `!window.__t.vis(window.__t.ov)`, 'visible'),
      A('pricing panel hidden', `!window.__t.vis(window.__t.pr)`, 'visible'),
      AX('details aria-selected true', `window.__t.sel('Details') === 'true'`, `window.__t.sel('Details')`),
      AX('overview aria-selected false', `window.__t.sel('Overview') === 'false'`, `window.__t.sel('Overview')`),
    ] },
    { name: 'click Pricing', do: DO(`window.__t.click('Pricing')`), asserts: [
      A('pricing panel visible', `window.__t.vis(window.__t.pr)`, 'not visible'),
      A('details panel hidden', `!window.__t.vis(window.__t.de)`, 'visible'),
      AX('pricing aria-selected true', `window.__t.sel('Pricing') === 'true'`, `window.__t.sel('Pricing')`),
      AX('details aria-selected false', `window.__t.sel('Details') === 'false'`, `window.__t.sel('Details')`),
    ] },
    { name: 'click Overview', do: DO(`window.__t.click('Overview')`), asserts: [
      A('overview panel visible', `window.__t.vis(window.__t.ov)`, 'not visible'),
      A('pricing panel hidden', `!window.__t.vis(window.__t.pr)`, 'visible'),
      AX('overview aria-selected true', `window.__t.sel('Overview') === 'true'`, `window.__t.sel('Overview')`),
      AX('pricing aria-selected false', `window.__t.sel('Pricing') === 'false'`, `window.__t.sel('Pricing')`),
    ] },
  ],
};

const TASKS: Record<string, Task> = { todo: TODO, filter: FILTER, form: FORM, tabs: TABS };
const FRAMEWORKS = ['leonui', 'react'] as const;

/* ---------- runner ---------- */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
interface StepResult { name: string; pass: boolean; asserts: { name: string; pass: boolean; detail: string }[] }
interface RunResult { framework: string; task: string; file: string; pass: boolean; reason?: string; steps: StepResult[] }

const browser = await Browser.launch();
const results: RunResult[] = [];
for (const framework of FRAMEWORKS) {
  for (const [task, def] of Object.entries(TASKS)) {
    const file = `bench/study/${dirArg}/${framework}/${task}.html`;
    const abs = join(STUDY, dirArg, framework, `${task}.html`);
    const out: RunResult = { framework, task, file, pass: false, steps: [] };
    if (!existsSync(abs)) {
      out.reason = 'file missing';
      results.push(out);
      continue;
    }
    const page = await browser.newPage(`http://localhost:${server.port}`);
    const ev = async (expr: string, label: string) => {
      try {
        return await page.eval(expr);
      } catch (e) {
        const msg = String(e);
        const at = msg.includes('SyntaxError') ? ` — near: ${expr.slice(0, 160).replace(/\s+/g, ' ')}` : '';
        throw new Error(`[${label}] ${msg.slice(0, 160)}${at}`);
      }
    };
    try {
      await page.goto(`/${dirArg}/${framework}/${task}.html`, "document.readyState === 'complete'");
      await sleep(700);
      await ev(PRELUDE + def.prelude, 'prelude');
      let actionError: string | null = null;
      for (const step of def.steps) {
        const sr: StepResult = { name: step.name, pass: true, asserts: [] };
        if (step.do) {
          const r = await ev(step.do, `do: ${step.name}`);
          if (r && typeof r === 'object' && (r as { error?: string }).error) actionError = (r as { error?: string }).error!;
        }
        await sleep(150);
        for (const a of step.asserts) {
          let pass = false;
          let detail = '';
          if (actionError) detail = `action failed: ${actionError}`;
          else {
            const r = await ev(RUN_ASSERT(a.body), `assert: ${step.name} › ${a.name}`);
            pass = !!(r && typeof r === 'object' && (r as { pass?: boolean }).pass);
            detail = (r as { detail?: string })?.detail ?? '';
          }
          sr.asserts.push({ name: a.name, pass, detail });
          if (!pass) sr.pass = false;
        }
        out.steps.push(sr);
        if (!sr.pass) out.pass = false;
      }
      out.pass = out.steps.length > 0 && out.steps.every(s => s.pass);
    } catch (e) {
      out.reason = String(e).slice(0, 300);
    } finally {
      await page.close();
    }
    results.push(out);
  }
}
await browser.close();
server.stop(true);

mkdirSync(join(STUDY, 'artifacts'), { recursive: true });
const artifacts = join(STUDY, 'artifacts', `grade-${dirArg}.json`);
writeFileSync(artifacts, JSON.stringify({ dir: dirArg, results }, null, 2));

let failures = 0;
for (const r of results) {
  const tag = r.pass ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${r.framework}/${r.task}${r.reason ? ` — ${r.reason}` : ''}`);
  if (!r.pass) {
    failures++;
    for (const s of r.steps) for (const a of s.asserts) if (!a.pass) console.log(`       ✗ ${s.name} › ${a.name} (${a.detail})`);
  }
}
console.log(`\n${results.length - failures}/${results.length} runs pass — details: ${artifacts}`);
process.exit(failures === 0 ? 0 : 1);
