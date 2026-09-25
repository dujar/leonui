// harness.mjs — dependency-free e2e harness: launches the locally cached
// Chromium headless shell, talks CDP over WebSocket (Node's global), exposes
// page helpers used by the test suite.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.UI_CHROME_BIN,
  join(process.env.HOME ?? '', '.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'),
  join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1243/chrome-linux/chrome'),
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Browser {
  static async launch() {
    const bin = CHROME_CANDIDATES.find(b => existsSync(b));
    if (!bin) throw new Error('no chromium binary found; set UI_CHROME_BIN');
    const port = 9300 + Math.floor(Math.random() * 500);
    const userDataDir = mkdtempSync(join(tmpdir(), 'ui-e2e-'));
    const proc = spawn(bin, [
      // NB: no --headless flag — chrome-headless-shell is headless by default and
      // rejects "--headless + remote debugging" outright
      '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
    ], { stdio: 'ignore' });
    // wait for the devtools endpoint
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) {
      try { await fetch(`http://127.0.0.1:${port}/json/version`); ok = true; } catch { await sleep(100); }
    }
    if (!ok) { proc.kill(); throw new Error('devtools endpoint never came up'); }
    return new Browser(proc, port);
  }

  constructor(proc, port) { this.proc = proc; this.port = port; this.pages = []; }

  async newPage(base) {
    const res = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
    const target = await res.json();
    const page = new Page(target.webSocketDebuggerUrl, base);
    await page.connect();
    this.pages.push(page);
    return page;
  }

  async close() {
    for (const p of this.pages) await Promise.race([p.close().catch(() => {}), sleep(700)]);
    this.proc.kill('SIGKILL');
    await sleep(100);
  }
}

export class Page {
  constructor(wsUrl, base) {
    this.wsUrl = wsUrl; this.base = base;
    this.consoleErrors = []; this.pageErrors = []; this.id = 0; this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = async () => {
        this.send('Runtime.enable');
        resolve();
      };
      this.ws.onerror = reject;
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); return; }
        if (m.method === 'Runtime.exceptionThrown')
          this.pageErrors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'unknown');
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
          this.consoleErrors.push(m.params.args?.map(a => a.value ?? a.description ?? '').join(' '));
      };
    });
  }

  send(method, params = {}) {
    return new Promise(resolve => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ result: { result: { value: undefined } }, __timeout: true, method });
      }, 8000);
      this.pending.set(id, m => { clearTimeout(timer); resolve(m); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.__timeout) throw new Error('CDP timeout: Runtime.evaluate');
    if (r.result?.exceptionDetails)
      throw new Error('page eval failed: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text));
    return r.result?.result?.value;
  }

  async goto(path) {
    await this.send('Page.enable');
    await this.send('Page.navigate', { url: this.base + path });
    await this.waitFor('document.readyState === \'complete\' && window.__uiReady === true');
    return this;
  }

  async waitFor(expression, timeout = 4000, every = 60) {
    const t0 = Date.now();
    for (;;) {
      let v;
      try { v = await this.eval(`!!(${expression})`); } catch { v = false; }
      if (v === true) return;
      if (Date.now() - t0 > timeout) throw new Error(`waitFor timeout: ${expression}`);
      await sleep(every);
    }
  }

  async colorScheme(scheme) {
    await this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  }

  async screenshot(name) {
    const dir = join(process.cwd(), 'ui', 'test', 'artifacts');
    mkdirSync(dir, { recursive: true });
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = join(dir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }

  async close() { try { await Promise.race([this.send('Page.close'), sleep(400)]); } catch {} try { this.ws.close(); } catch {} }
}
