/* bench/study/verify.ts — the shared verification affordance for the framework
 * agent study (see bench/study/README.md).
 *
 *   bun bench/study/verify.ts <run/<framework>/<task>.html> <leonui|react>
 *
 * Serves the study directory (plus /dist, /src/ui.css, /vendor) on an ephemeral
 * port, loads the page in the same local Chromium the test suite uses, settles,
 * and prints one JSON line: every console error, every uncaught page error,
 * leonui's runtime warnings (`window.__ui.warns`), the condition-specific
 * liveness signal, and the first 160 chars of rendered text. Exit 0 iff ok:true.
 *
 * It is the ONLY runtime feedback either condition gets besides its contract
 * doc, and the two conditions see the same affordance: same server, same
 * settle, same error collection. The one asymmetry is deliberate and is the
 * thing under study — leonui ships a static checker (`ui check`) and React's
 * browser-JSX setup has none, so the leonui condition is told to also run:
 *
 *   bun run src/cli.ts check <file> --json     (cwd: leonui/)
 *
 * `ok` per condition — leonui: no console/page errors AND the runtime booted
 * (`__uiReady`) AND zero runtime warnings; react: no console/page errors AND
 * React mounted children into `#root` (which the contract mandates).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, Page } from '../../tests/harness.ts';

const STUDY = fileURLToPath(new URL('.', import.meta.url)); // leonui/bench/study/
const LEONUI = resolve(STUDY, '../..'); // leonui/
// pages may live under run/ (agent output) or selftest/ (grader fixtures)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const [fileArg, fwArg] = process.argv.slice(2);
const framework = fwArg === 'leonui' || fwArg === 'react' ? fwArg : null;
if (!framework || !fileArg || !fileArg.endsWith('.html')) {
  console.error('usage: bun bench/study/verify.ts <run/<framework>/<task>.html> <leonui|react>');
  process.exit(2);
}
const pageFile = resolve(fileArg);
const rel = relative(STUDY, pageFile);
const allowed = rel.startsWith('run/') || rel.startsWith('selftest/');
if (!allowed || rel.includes('..')) {
  console.error('page must live under leonui/bench/study/run/ or leonui/bench/study/selftest/');
  process.exit(2);
}
if (!existsSync(pageFile)) {
  console.error(JSON.stringify({ file: pageFile, framework, ok: false, fatal: 'file does not exist' }));
  process.exit(1);
}

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    const p = decodeURIComponent(url.pathname);
    if (p === '/favicon.ico') return new Response(null, { status: 200 });
    const root = p.startsWith('/dist/') ? LEONUI : p === '/src/ui.css' ? LEONUI : STUDY;
    const file = resolve(root, p.replace(/^\//, ''));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    try {
      const body = readFileSync(file);
      return new Response(body, { headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  },
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const browser = await Browser.launch();
let exitCode = 0;
try {
  const page: Page = await browser.newPage(`http://localhost:${server.port}`);
  let facts: Record<string, unknown> = {};
  try {
    await page.goto(`/${rel}`, "document.readyState === 'complete'");
    await sleep(700); // babel transform + framework boot + first paint settle
    facts = await page.eval(`(() => {
      const w = window.__ui;
      const root = document.getElementById('root');
      return {
        uiReady: window.__uiReady === true,
        uiWarns: w && Array.isArray(w.warns) ? w.warns : null,
        rootChildren: root ? root.children.length : -1,
        bodyChildren: document.body ? document.body.children.length : 0,
        text: ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      };
    })()`);
  } catch (e) {
    facts = { fatal: String(e).slice(0, 200) };
  }
  const consoleErrors = page.consoleErrors;
  const pageErrors = page.pageErrors;
  const uiWarns = (facts.uiWarns as string[] | null) ?? null;
  const uiReady = facts.uiReady === true;
  const rootChildren = typeof facts.rootChildren === 'number' ? (facts.rootChildren as number) : -1;
  const noErrors = consoleErrors.length === 0 && pageErrors.length === 0 && !facts.fatal;
  const ok =
    noErrors &&
    (framework === 'leonui' ? uiReady && !!uiWarns && uiWarns.length === 0 : rootChildren > 0);
  console.log(
    JSON.stringify({
      file: rel.replaceAll('\\', '/'),
      framework,
      ok,
      consoleErrors,
      pageErrors,
      uiWarns,
      uiReady,
      rootChildren,
      text: facts.text ?? '',
      ...(facts.fatal ? { fatal: facts.fatal } : {}),
    }),
  );
  exitCode = ok ? 0 : 1;
  await page.close();
} finally {
  await browser.close();
  server.stop(true);
}
process.exit(exitCode);
