/* parity.test.ts — the two halves of the contract, compared on one source.
 *
 * leonui makes one promise to an agent: write markup from the skill, then *verify*
 * it came out as expected. There are two verifiers — `ui check` (browser-free, reads
 * the file) and the runtime (reads the DOM at attach time, in a console nobody is
 * watching). The promise only holds if they say the same thing about the same
 * markup, and until this file existed nothing tested that. Each half was tested
 * against its own expectations, so a finding one made and the other missed was
 * invisible: the suite could be fully green while the contract was broken.
 *
 * That is not hypothetical. An empty `ui:each` produced 11 checker findings and 9
 * runtime warnings on the same fixture. The reason was structural: the runtime only
 * walked a template when it had a row to clone, so a mistake *inside* a template was
 * reported by `ui check` and by nothing else — and an empty list was exactly when
 * the author most needed to hear about it.
 *
 * So the shape of this file is: one markup string, fed to both halves, compared
 * finding for finding. Every case below is one where a mistake is invisible to the
 * *other* pass — a requirement whose partner is absent, or a template the runtime
 * would only walk if there were data.
 */
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { app } from '../serve/app.ts';
import { checkHtml } from '../src/check.ts';
import { Browser, Page } from './harness.ts';

let server: ReturnType<typeof Bun.serve>;
let base = '';
let browser: Browser;

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
  browser = await Browser.launch();
}, 20000);
afterAll(async () => { await browser?.close(); server.stop(true); }, 20000);

const t = (name: string, fn: () => Promise<void>) => test(name, fn, 30000);

/** Inject `html` into an empty page, run the full attach over it, and return what
 * the runtime said. The bundle is already loaded by the host page, so `attach` is
 * the same entry point a custom-element author would call. */
async function runRuntime(html: string): Promise<string[]> {
  const p: Page = await browser.newPage(base).then(x => x.goto('/tests/fixtures/parity-host.html'));
  const warns = await p.eval<string[]>(`(() => {
    window.__ui.warns.length = 0;
    const host = document.createElement('div');
    host.innerHTML = ${JSON.stringify(html)};
    document.body.append(host);
    return import('/dist/leonui.js').then(m => { m.attach(host); return window.__ui.warns.slice(); });
  })()`);
  await p.close();
  return warns;
}

const staticMsgs = (src: string): string[] => checkHtml('parity.html', src).map(f => f.message);

/** Strip the `ui:` prefix the runtime puts on everything, so the two halves are
 * compared on the *content* of a finding rather than on punctuation. Anything
 * beyond that prefix is a real disagreement and must fail. */
const bare = (m: string): string => m.replace(/^ui:\s*/, '');

/* ================= the comparison ================= */

/** Every case here is a mistake the runtime can only see from the *template*, so
 * an implementation that walks templates per row reports none of them. */
const SRC = `<section ui:state="rows: []">
  <ul id="a" ui:each="r in rows" ui:key="id">
    <li ui:model="r.name">model on a non-control</li>
  </ul>
  <ol id="b" ui:each="r in rows">
    <li ui:transition>transition with no ui:fx</li>
  </ol>
  <ul id="c" ui:each="r in rows" ui:key="id">
    <li ui:bind="text: r.name">clean</li>
  </ul>
</section>`;

t('parity: an empty ui:each is judged the same by both halves', async () => {
  const staticFindings = staticMsgs(SRC);
  // Exactly two, and only two: the clean list in the same markup must stay clean.
  // That is the false-positive guard — a "fix" that warns about every empty list
  // would be worse than the bug it replaces. The messages are matched loosely
  // because the *table* owns their wording; what this file owns is that both
  // halves produce them.
  assert.equal(staticFindings.length, 2, `ui check: ${JSON.stringify(staticFindings)}`);
  assert.match(bare(staticFindings[0]!), /^ui:model requires <input> or <textarea> or <select>, found <li>/);
  assert.match(bare(staticFindings[1]!), /^ui:transition needs "ui:fx" on the same element/);

  const runtime = (await runRuntime(SRC)).map(bare);
  assert.deepEqual(runtime, staticFindings.map(bare),
    'the runtime and ui check must report the same findings, in the same words');
});

t('parity: a mistake in a template is reported once, not once per row', async () => {
  // The same two mistakes, but the list has data. The template is checked once, at
  // the ui:each site, and the rows skip the static passes — so the count tracks the
  // *source*, not the data. A 100-item list must not turn one mistake into 100
  // warnings, and an empty list must not turn it into zero.
  const filled = SRC.replace('rows: []', "rows: [{ id: 1 }, { id: 2 }, { id: 3 }]");
  const runtime = (await runRuntime(filled)).map(bare);
  assert.deepEqual(runtime, staticMsgs(filled).map(bare));
  assert.equal(runtime.length, 2, `one report per mistake, got ${JSON.stringify(runtime)}`);
});

t('parity: a clean page is silent in both halves', async () => {
  // The control. Both verifiers agree about a *correct* page too — otherwise the
  // agreement above would just mean both of them cry wolf.
  const good = `<section ui:state="rows: []">
  <ul ui:each="r in rows" ui:key="id">
    <li ui:bind="text: r.name">clean</li>
  </ul>
  <form ui:state="q: ''">
    <input ui:input ui:model="q">
    <button ui:button ui:fx="click: set q = ''">clear</button>
  </form>
</section>`;
  assert.deepEqual(staticMsgs(good), [], 'ui check');
  assert.deepEqual(await runRuntime(good), [], 'the runtime');
});
