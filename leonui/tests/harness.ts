/* harness.ts — dependency-free e2e harness: launches the locally cached Chromium
 * headless shell, talks CDP over WebSocket (Bun's global), exposes page helpers.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Discover any locally installed Playwright Chromium (any build number), so
 * CI (playwright install) and developer machines both work. UI_CHROME_BIN wins.
 *
 * Playwright's cache is per-platform: the same build directory holds
 * `chrome-linux/chrome`, `chrome-mac/Chromium.app/Contents/MacOS/Chromium`, or a
 * `chrome-headless-shell-<arch>/` shell. This only knew the Linux layout, so on a
 * Mac every test died on "no chromium binary found" and the fix was to read the
 * source and hand-set UI_CHROME_BIN — which is a poor first experience for the
 * one command that proves the framework did what you asked. */
function discoverChrome(): string[] {
  const out: string[] = [];
  if (process.env.UI_CHROME_BIN) out.push(process.env.UI_CHROME_BIN);
  const mac = process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  const cache = join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  try {
    const builds = readdirSync(cache)
      .filter(d => d.startsWith('chromium_headless_shell-') || d.startsWith('chromium-'))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      const dir = join(cache, b);
      if (b.startsWith('chromium_headless_shell-')) {
        out.push(
          join(dir, `chrome-headless-shell-${mac}`, 'chrome-headless-shell'),
          join(dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        );
      } else {
        out.push(
          join(dir, `chrome-${mac}`, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          join(dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          join(dir, 'chrome-linux', 'chrome'),
        );
      }
    }
  } catch { /* no cache dir */ }
  // last resort: a browser this machine already has, so a checkout with no
  // Playwright cache is still verifiable
  for (const p of [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) out.push(p);
  return out;
}
const CHROME_CANDIDATES = discoverChrome();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CdpResult {
  result?: {
    result?: { value?: unknown };
    exceptionDetails?: { exception?: { description?: string }; text?: string };
    data?: string;
    __timeout?: boolean;
  };
  params?: { type?: string; args?: { value?: unknown; description?: string }[]; exceptionDetails?: { exception?: { description?: string }; text?: string } };
}

export class Browser {
  private constructor(public proc: ReturnType<typeof spawn>, public port: number, public pages: Page[]) {}

  static async launch(): Promise<Browser> {
    const bin = CHROME_CANDIDATES.find(b => existsSync(b));
    if (!bin) throw new Error('no chromium binary found; set UI_CHROME_BIN to a Chrome or Chromium executable');
    const port = 9800 + Math.floor(Math.random() * 500);
    const userDataDir = mkdtempSync(join(tmpdir(), 'leonui-e2e-'));
    // chrome-headless-shell IS headless and rejects "--headless + remote debugging"
    // outright; a full Chrome/Chromium build has to be told, and only the new
    // headless mode accepts a debugging port.
    const headlessShell = /headless[-_]shell/i.test(bin);
    const proc = spawn(bin, [
      ...(headlessShell ? [] : ['--headless=new']),
      '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
    ], { stdio: 'ignore' });
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) {
      try { await fetch(`http://127.0.0.1:${port}/json/version`); ok = true; } catch { await sleep(100); }
    }
    if (!ok) { proc.kill('SIGKILL'); throw new Error('devtools endpoint never came up'); }
    return new Browser(proc, port, []);
  }

  async newPage(base: string): Promise<Page> {
    const res = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
    const target = (await res.json()) as { webSocketDebuggerUrl: string };
    const page = new Page(target.webSocketDebuggerUrl, base);
    await page.connect();
    this.pages.push(page);
    return page;
  }

  async close(): Promise<void> {
    for (const p of this.pages) await Promise.race([p.close().catch(() => {}), sleep(700)]);
    this.proc.kill('SIGKILL');
    await sleep(100);
  }
}

type Pending = (m: CdpResult) => void;

export class Page {
  consoleErrors: string[] = [];
  pageErrors: string[] = [];
  private id = 0;
  private pending = new Map<number, Pending>();
  private ws!: WebSocket;

  constructor(private wsUrl: string, private base: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => {
        void this.send('Runtime.enable');
        resolve();
      };
      this.ws.onerror = () => reject(new Error('websocket error'));
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data as string) as CdpResult & { id?: number; method?: string };
        if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); return; }
        if (m.method === 'Runtime.exceptionThrown') {
          const d = m.params!.exceptionDetails!;
          this.pageErrors.push(d.exception?.description ?? d.text ?? 'unknown');
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params!.type === 'error') {
          this.consoleErrors.push((m.params!.args ?? []).map(a => a.value ?? a.description ?? '').join(' '));
        }
      };
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<CdpResult> {
    return new Promise(resolve => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ result: { __timeout: true } });
      }, 8000);
      this.pending.set(id, m => { clearTimeout(timer); resolve(m); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.result?.__timeout) throw new Error('CDP timeout: Runtime.evaluate');
    if (r.result?.exceptionDetails)
      throw new Error('page eval failed: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text));
    return r.result?.result?.value as T;
  }

  async goto(path: string, readyExpr = "document.readyState === 'complete' && window.__uiReady === true"): Promise<this> {
    await this.send('Page.enable');
    await this.send('Page.navigate', { url: this.base + path });
    await this.waitFor(readyExpr);
    return this;
  }

  async waitFor(expression: string, timeout = 4000, every = 60): Promise<void> {
    const t0 = Date.now();
    for (;;) {
      let v = false;
      try { v = await this.eval<boolean>(`!!(${expression})`); } catch { v = false; }
      if (v === true) return;
      if (Date.now() - t0 > timeout) throw new Error(`waitFor timeout: ${expression}`);
      await sleep(every);
    }
  }

  /** Every emulated media feature set so far. `Emulation.setEmulatedMedia` replaces
   * the whole `features` array on each call, so asking for reduced motion after
   * asking for a colour scheme would otherwise silently drop the colour scheme. */
  private media = new Map<string, string>();

  private async emulate(name: string, value: string): Promise<void> {
    this.media.set(name, value);
    await this.send('Emulation.setEmulatedMedia', {
      features: [...this.media].map(([n, v]) => ({ name: n, value: v })),
    });
  }

  async colorScheme(scheme: 'light' | 'dark'): Promise<void> {
    await this.emulate('prefers-color-scheme', scheme);
  }

  /** `prefers-reduced-motion` — so the reveal's reduced-motion branch is tested
   * rather than assumed. It is the branch that decides whether a reader who asked
   * for less motion gets the page at all. */
  async reducedMotion(value: 'reduce' | 'no-preference'): Promise<void> {
    await this.emulate('prefers-reduced-motion', value);
  }

  async screenshot(name: string): Promise<string> {
    const dir = join(import.meta.dir, 'artifacts');
    mkdirSync(dir, { recursive: true });
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = join(dir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.result!.data!, 'base64'));
    return file;
  }

  async close(): Promise<void> {
    try { await Promise.race([this.send('Page.close'), sleep(400)]); } catch { /* already gone */ }
    try { this.ws.close(); } catch { /* already closed */ }
  }
}
