// debug-probe.mjs — interactive diagnostics for the failing paths
import { createServer } from '../server.mjs';
import { Browser } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = createServer();
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log('server on', base);
const browser = await Browser.launch();
console.log('browser launched');

async function probe(name, path, fn) {
  const p = await browser.newPage(base).then(x => x.goto(path));
  try { await fn(p); } catch (e) { console.log(`[${name}] probe error:`, e.message); }
  console.log(`[${name}] pageErrors:`, JSON.stringify(p.pageErrors));
  console.log(`[${name}] consoleErrors:`, JSON.stringify(p.consoleErrors.slice(0, 8)));
  console.log(`[${name}] uiWarns:`, JSON.stringify(await p.eval(`window.__ui?.warns ?? []`).catch(e => ['eval-fail'])));
  await p.close().catch(() => {});
}

await probe('stack-gap', '/pages/layout.html', async p => {
  console.log('row-between justify:', await p.eval(`getComputedStyle(document.querySelector('#row-between')).justifyContent`));
  console.log('row-between align:', await p.eval(`getComputedStyle(document.querySelector('#row-between')).alignItems`));
  console.log('g2 gap:', await p.eval(`getComputedStyle(document.querySelector('#stack-g2')).gap`));
  console.log('g2 class:', await p.eval(`document.querySelector('#stack-g2').className`));
});

await probe('overlays-call', '/pages/overlays.html', async p => {
  await p.eval(`document.querySelector('#toast-fail2').click()`);
  await sleep(500);
  console.log('toasts:', await p.eval(`document.querySelector('#ui-toasts')?.innerHTML ?? 'no host'`));
});

await probe('data-refetch', '/pages/data.html', async p => {
  await p.waitFor(`document.querySelector('#rf-ok').hidden === false`, 6000);
  console.log('initial ok:', await p.eval(`document.querySelector('#rf-ok').textContent`));
  await p.eval(`document.querySelector('#rf-refetch').click()`);
  await sleep(300);
  console.log('after refetch click, rf-loading hidden:', await p.eval(`document.querySelector('#rf-loading').hidden`));
  console.log('feed status:', await p.eval(`window.__ui.readPath ? 'hook' : 'no'`));
  await sleep(1200);
  console.log('after wait, rf-ok hidden:', await p.eval(`document.querySelector('#rf-ok').hidden`));
});

await probe('data-callfail', '/pages/data.html', async p => {
  await p.eval(`document.querySelector('#call-fail').click()`);
  await sleep(200);
  console.log('echo during optimistic:', await p.eval(`document.querySelector('#call-fail-echo').textContent`));
  await sleep(1500);
  console.log('echo after rollback:', await p.eval(`document.querySelector('#call-fail-echo').textContent`));
  console.log('toasts:', await p.eval(`document.querySelector('#ui-toasts')?.innerHTML ?? 'no host'`));
});

await probe('inbox-add', '/pages/inbox.html', async p => {
  await p.waitFor(`document.querySelectorAll('#task-list .ui-list-item').length === 3`, 6000);
  await p.eval(`{ const inp = document.querySelector('#add-input'); inp.value = 'Probe task'; inp.dispatchEvent(new Event('input', { bubbles: true })); }`);
  console.log('add disabled:', await p.eval(`document.querySelector('#add-btn').disabled`));
  await p.eval(`document.querySelector('#add-btn').click()`);
  await sleep(300);
  console.log('rows during optimistic:', await p.eval(`document.querySelectorAll('#task-list .ui-list-item').length`));
  await sleep(1500);
  console.log('rows after:', await p.eval(`document.querySelectorAll('#task-list .ui-list-item').length`));
  console.log('server tasks:', await p.eval(`fetch('/api/tasks').then(r => r.json()).then(t => t.map(x => x.title))`));
});

await browser.close();
server.close();
process.exit(0);
