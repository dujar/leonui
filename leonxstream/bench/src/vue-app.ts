import { ref } from 'vue/dist/vue.esm-bundler.js';
import { createApp } from 'vue/dist/vue.esm-bundler.js';

interface Row { id: number; label: string; done: boolean }
let nextId = 1;
const rows = ref<Row[]>([]);

createApp({
  setup() { return { rows }; },
  template: `<ul id="bench-list">
    <li v-for="r in rows" :key="r.id" :class="r.done ? 'row done' : 'row'">
      <span class="label">{{ r.label }}</span>
    </li>
  </ul>`,
}).mount('#app');

(window as any).__bench = {
  async mount() {},
  async create(n: number) {
    const made = Array.from({ length: n }, (_, i) => ({ id: nextId + i, label: 'item #' + (nextId + i), done: false }));
    nextId += n;
    rows.value = [...rows.value, ...made];
  },
  async update() { rows.value = rows.value.map(r => (r.id % 10 === 0 ? { ...r, done: !r.done } : r)); },
  async remove() { rows.value = []; },
  async replace() { await window.__bench.remove(); await window.__bench.create(1000); },
  rows: () => document.querySelectorAll('#bench-list li.row').length,
  doneCount: () => document.querySelectorAll('#bench-list li.row.done').length,
};
