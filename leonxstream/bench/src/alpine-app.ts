import Alpine from 'alpinejs';

interface Row { id: number; label: string; done: boolean }
let nextId = 1;

document.addEventListener('alpine:init', () => {
  (window as any).Alpine.data('bench', () => ({
    rows: [] as Row[],
    create(n: number) {
      const made = Array.from({ length: n }, () => ({ id: nextId, label: 'item #' + nextId, done: false }));
      nextId += n;
      this.rows = [...this.rows, ...made];
    },
    update() { this.rows = this.rows.map((r: Row) => (r.id % 10 === 0 ? { ...r, done: !r.done } : r)); },
    remove() { this.rows = []; },
    async replace() { await window.__bench.remove(); await window.__bench.create(1000); },
  }));
});
(window as any).Alpine = Alpine;
