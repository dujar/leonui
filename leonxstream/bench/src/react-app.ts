import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface Row { id: number; label: string; done: boolean }
let nextId = 1;
let push: (fn: (rows: Row[]) => Row[]) => void = () => {};

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  push = fn => setRows(fn);
  return h('ul', { id: 'bench-list' },
    ...rows.map(r => h('li', { key: r.id, className: r.done ? 'row done' : 'row' },
      h('span', { className: 'label' }, r.label))));
}

const make = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: nextId + i, label: 'item #' + (nextId + i), done: false })).map(r => (nextId++, r));

createRoot(document.getElementById('app')!).render(h(App));
(window as any).__bench = {
  async mount() {},
  async create(n: number) { push(prev => [...prev, ...make(n)]); },
  async update() { push(prev => prev.map(r => (r.id % 10 === 0 ? { ...r, done: !r.done } : r))); },
  async remove() { push(() => []); },
  async replace() { await window.__bench.remove(); await window.__bench.create(1000); },
  rows: () => document.querySelectorAll('#bench-list li.row').length,
  doneCount: () => document.querySelectorAll('#bench-list li.row.done').length,
};
