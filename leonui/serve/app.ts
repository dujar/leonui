/* serve.ts — leonui dev server: static pages + mock REST API (Bun.serve)
 *
 *   GET    /api/tasks            list          (?fail=1 -> 500, ?slow=1 -> +800ms)
 *   POST   /api/tasks            {title} -> created
 *   PATCH  /api/tasks/:id        {done} -> updated
 *   DELETE /api/tasks/:id
 *   POST   /api/__reset          restore seed state (test hook)
 *   GET    /api/boom             always 500
 */
import { join, extname } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.ts': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
};

let seq = 4;
const tasks: { id: number; title: string; done: boolean }[] = [
  { id: 1, title: 'Set up leonui workspace', done: true },
  { id: 2, title: 'Write the interaction-tier spec', done: false },
  { id: 3, title: 'Run the verification-wedge tests', done: false },
];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const seed = (): void => {
  tasks.length = 0;
  tasks.push(
    { id: 1, title: 'Set up leonui workspace', done: true },
    { id: 2, title: 'Write the interaction-tier spec', done: false },
    { id: 3, title: 'Run the verification-wedge tests', done: false },
  );
  seq = 4;
};

async function api(req: Request, url: URL): Promise<Response> {
  const fail = url.searchParams.get('fail') === '1';
  const slow = url.searchParams.get('slow') === '1';
  if (slow) await sleep(800);
  if (fail) return Response.json({ error: 'injected failure' }, { status: 500 });

  const method = req.method;
  const p = url.pathname;
  if (p === '/api/__reset') { seed(); return Response.json({ ok: true }); }
  if (p === '/api/boom') return Response.json({ error: 'boom' }, { status: 500 });
  if (p === '/api/tasks' && method === 'GET') return Response.json(tasks);
  if (p === '/api/tasks' && method === 'POST') {
    const { title } = (await req.json().catch(() => ({}))) as { title?: string };
    const t = { id: seq++, title: String(title ?? 'untitled'), done: false };
    tasks.push(t);
    return Response.json(t);
  }
  const mm = p.match(/^\/api\/tasks\/(\d+)$/);
  if (mm && method === 'PATCH') {
    const t = tasks.find(x => x.id === Number(mm[1]));
    if (!t) return Response.json({ error: 'not found' }, { status: 404 });
    const { done } = (await req.json().catch(() => ({}))) as { done?: boolean };
    t.done = !!done;
    return Response.json(t);
  }
  if (mm && method === 'DELETE') {
    const i = tasks.findIndex(x => x.id === Number(mm[1]));
    if (i < 0) return Response.json({ error: 'not found' }, { status: 404 });
    tasks.splice(i, 1);
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'no route' }, { status: 404 });
}

export const app = {
  port: Number(process.env.PORT ?? 4700),
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return api(req, url);
    let path = url.pathname === '/' ? '/pages/index.html' : url.pathname;
    if (path.endsWith('/')) path += 'index.html'; // directory-style URLs
    const f = Bun.file(join(ROOT, path));
    if (await f.exists()) return new Response(f, { headers: { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' } });
    return new Response('not found: ' + path, { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },
};
