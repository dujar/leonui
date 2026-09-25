// server.mjs — static file server + mock REST API for the ui framework e2e suite.
//   GET    /api/tasks            list          (?fail=1 -> 500, ?slow=1 -> +800ms)
//   POST   /api/tasks            {title} -> created
//   PATCH  /api/tasks/:id        {done} -> updated
//   DELETE /api/tasks/:id
//   GET    /api/boom             always 500    (?slow=1 -> +800ms)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let seq = 4;
const tasks = [
  { id: 1, title: 'Set up leonspace workspace', done: true },
  { id: 2, title: 'Write the interaction-tier spec', done: false },
  { id: 3, title: 'Run the verification-wedge tests', done: false },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function api(req, res, url) {
  const fail = url.searchParams.get('fail') === '1';
  const slow = url.searchParams.get('slow') === '1';
  if (slow) return sleep(800).then(() => finish());
  return finish();
  function finish() {
    if (fail) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'injected failure' })); }
    const m = req.method, p = url.pathname;
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (p === '/api/__reset') { // test hook: restore seed state
        tasks.length = 0;
        tasks.push(
          { id: 1, title: 'Set up leonspace workspace', done: true },
          { id: 2, title: 'Write the interaction-tier spec', done: false },
          { id: 3, title: 'Run the verification-wedge tests', done: false },
        );
        seq = 4;
        return res.end('{"ok":true}');
      }
      if (p === '/api/tasks' && m === 'GET') return res.end(JSON.stringify(tasks));
      if (p === '/api/tasks' && m === 'POST') {
        const { title } = JSON.parse(body || '{}');
        const t = { id: seq++, title: String(title ?? 'untitled'), done: false };
        tasks.push(t); return res.end(JSON.stringify(t));
      }
      const mm = p.match(/^\/api\/tasks\/(\d+)$/);
      if (mm && m === 'PATCH') {
        const t = tasks.find(x => x.id === Number(mm[1]));
        if (!t) { res.writeHead(404); return res.end('{"error":"not found"}'); }
        const { done } = JSON.parse(body || '{}');
        t.done = !!done; return res.end(JSON.stringify(t));
      }
      if (mm && m === 'DELETE') {
        const i = tasks.findIndex(x => x.id === Number(mm[1]));
        if (i < 0) { res.writeHead(404); return res.end('{"error":"not found"}'); }
        tasks.splice(i, 1);
        return res.end('{"ok":true}');
      }
      if (p === '/api/boom' && m === 'GET') { res.writeHead(500); return res.end('{"error":"boom"}'); }
      res.writeHead(404); res.end('{"error":"no route"}');
    });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    let path = url.pathname === '/' ? '/pages/index.html' : url.pathname;
    if (path.endsWith('/')) path += 'index.html'; // directory-style URLs
    const file = join(ROOT, path);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + path);
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, () => console.log(`ui dev server: http://127.0.0.1:${port}/`));
}
