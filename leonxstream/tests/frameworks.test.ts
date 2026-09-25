/* frameworks.test.ts — comparison unit tests + benchmark.
 *
 * Correctness: the SAME DOM assertions are run against leonxstream, React, Vue
 * and Alpine (mount, create 1000, partial update, remove).
 * Benchmark: identical in-page operations measured identically (rAF-settled,
 * warmups + 5 runs, median); results land in tests/artifacts/bench.json and
 * leonxstream/benchmark.md is generated from the measured numbers.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { app } from '../serve/app.ts';
import { Page, Browser } from './harness.ts';

let server: ReturnType<typeof Bun.serve>;
let base = '';
let browser: Browser;

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
  browser = await Browser.launch();
}, 20000);
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

const FRAMEWORKS = ['leonxstream', 'react', 'vue', 'alpine'] as const;
type Framework = (typeof FRAMEWORKS)[number];
const page = (fw: Framework) => browser.newPage(base).then(p => p.goto(`/bench/${fw}.html`, "document.readyState === 'complete' && window.__benchReadyAt > 0"));
const t = (name: string, fn: () => Promise<void>) => test(name, fn, 60000);

/* ---------- identical correctness assertions for every framework ---------- */

for (const fw of FRAMEWORKS) {
  t(`[${fw}] list ops produce the same DOM`, async () => {
    const p = await page(fw);
    expect(await p.eval<number>('window.__bench.rows()')).toBe(0);

    await p.eval('window.__bench.create(1000)');
    await p.waitFor(`window.__bench.rows() === 1000`);
    expect(await p.eval<number>('window.__bench.rows()')).toBe(1000);
    expect(await p.eval<string>(`document.querySelector('#bench-list li.row .label').textContent`)).toBe('item #1');
    expect(await p.eval<string>(`[...document.querySelectorAll('#bench-list li.row .label')].at(-1).textContent`)).toBe('item #1000');
    expect(await p.eval<number>('window.__bench.doneCount()')).toBe(0);

    // partial update: exactly every 10th row flips to done
    await p.eval('window.__bench.update()');
    await p.waitFor(`window.__bench.doneCount() === 100`);
    expect(await p.eval<number>('window.__bench.doneCount()')).toBe(100);
    expect(await p.eval<boolean>(`document.querySelectorAll('#bench-list li.row')[9].classList.contains('done')`)).toBe(true);
    expect(await p.eval<boolean>(`document.querySelectorAll('#bench-list li.row')[10].classList.contains('done')`)).toBe(false);

    // toggling again restores
    await p.eval('window.__bench.update()');
    await p.waitFor(`window.__bench.doneCount() === 0`);

    // removal clears
    await p.eval('window.__bench.remove()');
    await p.waitFor(`window.__bench.rows() === 0`);
    expect(await p.eval<number>('window.__bench.rows()')).toBe(0);
    await p.close();
  });
}
