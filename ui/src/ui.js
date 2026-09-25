/* ui.js — the leonspace ui runtime, v0.1.0
 *
 * Architecture (round-2 design, prototype-runtime.md):
 *   signals with ancestor-chain scoping, auto-tracked binds, closed fx-verb
 *   catalog, keyed lists, whitelist-AST expression parser (no eval, ever),
 *   structural enhancers + one shipped stylesheet.
 *
 * Authoring surface: HTML + ui:* attributes (see pages/ for every variant).
 * Known v0 gaps (judged H2 list, roadmap): subscriber disposal on removal,
 * reparenting re-resolution, shadow-DOM scope crossing, SSR.
 */
(() => {
  'use strict';

  const VERSION = '0.1.0';

  /* ============ whitelisted pure operators — the ONLY callable things ============ */
  const BUILTINS = {
    without: (arr, item) => (Array.isArray(arr) ? arr : []).filter(x => x !== item),
    contains: (str, sub) => String(str ?? '').toLowerCase().includes(String(sub ?? '').toLowerCase()),
    first: arr => (Array.isArray(arr) ? arr[0] : undefined),
    sortBy: (arr, key) => (Array.isArray(arr) ? arr : []).slice().sort((a, b) => {
      const ka = a?.[key], kb = b?.[key];
      return ka === kb ? 0 : (ka > kb ? 1 : -1);
    }),
  };

  /* ============ signals + scopes (ancestor chain = prototype chain of state) ============ */
  let CUR = null; // dependency-tracking set for the bind currently evaluating
  const sig = v => {
    const subs = new Set();
    return {
      get value() { if (CUR) CUR.add(subs); return v; },
      set value(nv) { if (nv === v) return; v = nv; for (const f of [...subs]) f(); },
    };
  };
  const scopes = new WeakMap(); // element -> { signals: Map, meta: Map }

  function findScope(el, name) {
    for (let n = el; n; n = n.parentElement || (n.host ? n.host.parentElement : null)) {
      const s = scopes.get(n);
      if (s && s.signals.has(name)) return { sig: s.signals.get(name) };
    }
    return null;
  }
  const resolvePath = (path, el) => {
    const segs = String(path).split('.');
    const f = findScope(el, segs[0]);
    if (!f) throw new Error('ui: undeclared signal "' + segs[0] + '"');
    return { sig: f.sig, segs: segs.slice(1) };
  };
  const readPath = (path, el) => {
    const { sig, segs } = resolvePath(path, el);
    let v = sig.value;
    for (const s of segs) v = v?.[s];
    return v;
  };
  const copyVal = o => Array.isArray(o) ? [...o] : (o && typeof o === 'object' ? { ...o } : o);
  function writeRef(r, val) { // immutable replacement all the way down
    if (!r.segs.length) { r.sig.value = val; return; }
    const root = copyVal(r.sig.value);
    let cur = root;
    for (let k = 0; k < r.segs.length - 1; k++) {
      cur[r.segs[k]] = copyVal(cur[r.segs[k]]) ?? {};
      cur = cur[r.segs[k]];
    }
    cur[r.segs[r.segs.length - 1]] = val;
    r.sig.value = root;
  }
  const setPath = (path, val, el) => writeRef(resolvePath(path, el), val);
  const track = fn => { // run fn with dependency tracking, subscribe it to what it read
    const prev = CUR, subs = CUR = new Set();
    try { fn(); } finally { CUR = prev; for (const s of subs) s.add(fn); }
  };

  /* ============ expression parser: whitelist AST (no eval, ever) ============ */
  const astCache = new Map();
  function parse(src) {
    if (astCache.has(src)) return astCache.get(src);
    let i = 0;
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    const lit = re => { ws(); const m = re.exec(src.slice(i)); if (!m) return null; i += m[0].length; return m; };
    function primary() {
      ws();
      const c = src[i];
      if (c === "'") { const m = lit(/'([^']*)'/); if (!m) throw new Error('ui: bad string'); return { t: 'str', v: m[1] }; }
      if (c === '(') { i++; const e = ternary(); ws(); if (src[i] !== ')') throw new Error('ui: expected )'); i++; return e; }
      if (c === '[') { i++; const items = []; ws();
        if (src[i] !== ']') { items.push(element()); while (true) { ws(); if (src[i] === ',') { i++; ws(); if (src[i] === ']') break; items.push(element()); } else break; } }
        ws(); if (src[i] !== ']') throw new Error('ui: expected ]'); i++; return { t: 'arr', items }; }
      if (c === '{') { i++; const pairs = []; ws();
        if (src[i] !== '}') { pairs.push(pair()); while (true) { ws(); if (src[i] === ',') { i++; ws(); if (src[i] === '}') break; pairs.push(pair()); } else break; } }
        ws(); if (src[i] !== '}') throw new Error('ui: expected }'); i++; return { t: 'obj', pairs }; }
      if (/[0-9]/.test(c)) { const m = lit(/[0-9.]+/); return { t: 'num', v: Number(m[0]) }; }
      if (/[A-Za-z_$]/.test(c)) {
        const m = lit(/[A-Za-z_$][\w$]*/); const name = m[0];
        ws();
        if (src[i] === '(') { // whitelisted pure operators only
          i++; const args = []; ws();
          if (src[i] !== ')') { args.push(ternary()); while (true) { ws(); if (src[i] === ',') { i++; args.push(ternary()); } else break; } }
          ws(); if (src[i] !== ')') throw new Error('ui: expected )'); i++;
          return { t: 'call', name, args };
        }
        if (name === 'true') return { t: 'bool', v: true };
        if (name === 'false') return { t: 'bool', v: false };
        if (name === 'null') return { t: 'null' };
        return { t: 'id', v: name };
      }
      throw new Error('ui: unexpected "' + (c ?? 'end') + '" in expression');
    }
    function pair() { ws(); const m = lit(/[A-Za-z_$][\w$]*/); if (!m) throw new Error('ui: bad key'); ws(); if (src[i] !== ':') throw new Error('ui: expected :'); i++; return { key: m[0], e: ternary() }; }
    function element() { ws(); if (src.slice(i, i + 3) === '...') { i += 3; return { t: 'spread', e: ternary() }; } return ternary(); }
    function postfix() { let e = primary(); while (true) { ws(); if (src[i] === '.') { i++; const m = lit(/[\w$]+/); if (!m) throw new Error('ui: bad member'); e = { t: 'dot', e, name: m[0] }; } else break; } return e; }
    function unary() { ws(); if (src[i] === '!') { i++; return { t: 'not', e: unary() }; } if (src[i] === '-') { i++; return { t: 'neg', e: unary() }; } return postfix(); }
    function factor() { let e = unary(); while (true) { ws(); const c = src[i];
      if (c === '*' || c === '/' || c === '%') { i++; e = { t: c === '*' ? 'mul' : c === '/' ? 'div' : 'mod', a: e, b: unary() }; } else break; } return e; }
    function add() { let e = factor(); while (true) { ws(); const c = src[i];
      if (c === '+' || c === '-') { i++; e = { t: c === '+' ? 'add' : 'sub', a: e, b: factor() }; } else break; } return e; }
    function compare() { let e = add(); while (true) { ws(); const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=' || two === '==') { i += 2; e = { t: two, a: e, b: add() }; }
      else if (src[i] === '<' || src[i] === '>') { const c = src[i]; i++; e = { t: c, a: e, b: add() }; }
      else break; } return e; }
    function and() { let e = compare(); while (true) { ws(); if (src.slice(i, i + 2) === '&&') { i += 2; e = { t: '&&', a: e, b: compare() }; } else break; } return e; }
    function or() { let e = and(); while (true) { ws(); if (src.slice(i, i + 2) === '||') { i += 2; e = { t: '||', a: e, b: and() }; } else break; } return e; }
    function ternary() { const e = or(); ws(); if (src[i] === '?') { i++; const a = ternary(); ws(); if (src[i] !== ':') throw new Error('ui: expected :'); i++; return { t: '?:', c: e, a, b: ternary() }; } return e; }
    const ast = ternary(); ws();
    if (i < src.length) throw new Error('ui: trailing input "' + src.slice(i) + '"');
    astCache.set(src, ast);
    return ast;
  }
  function ev(n, el) {
    switch (n.t) {
      case 'str': case 'num': case 'bool': return n.v;
      case 'null': return null;
      case 'id': { const f = findScope(el, n.v); if (!f) throw new Error('ui: undeclared signal "' + n.v + '"'); return f.sig.value; }
      case 'dot': { const o = ev(n.e, el); if (n.name === 'length') return o?.length; return o?.[n.name]; }
      case 'not': return !ev(n.e, el);
      case 'neg': return -ev(n.e, el);
      case 'add': return ev(n.a, el) + ev(n.b, el);
      case 'sub': return ev(n.a, el) - ev(n.b, el);
      case 'mul': return ev(n.a, el) * ev(n.b, el);
      case 'div': return ev(n.a, el) / ev(n.b, el);
      case 'mod': return ev(n.a, el) % ev(n.b, el);
      case '==': return ev(n.a, el) === ev(n.b, el);
      case '!=': return ev(n.a, el) !== ev(n.b, el);
      case '<': return ev(n.a, el) < ev(n.b, el);
      case '>': return ev(n.a, el) > ev(n.b, el);
      case '<=': return ev(n.a, el) <= ev(n.b, el);
      case '>=': return ev(n.a, el) >= ev(n.b, el);
      case '&&': { const a = ev(n.a, el); return a ? ev(n.b, el) : a; }
      case '||': { const a = ev(n.a, el); return a ? a : ev(n.b, el); }
      case '?:': return ev(n.c, el) ? ev(n.a, el) : ev(n.b, el);
      case 'arr': { const out = []; for (const it of n.items) { if (it.t === 'spread') { const sp = ev(it.e, el); out.push(...(Array.isArray(sp) ? sp : [sp])); } else out.push(ev(it, el)); } return out; }
      case 'obj': { const o = {}; for (const p of n.pairs) o[p.key] = ev(p.e, el); return o; }
      case 'call': { const fn = BUILTINS[n.name]; if (!fn) throw new Error('ui: function not allowed: ' + n.name); return fn(...n.args.map(a => ev(a, el))); }
    }
    throw new Error('ui: bad AST node ' + n.t);
  }
  const safeEval = (src, el) => ev(parse(src), el);

  /* ============ state: ui:state="name: value; ..." (values may be GET urls) ============ */
  function coerce(v) {
    if (v === 'true') return true; if (v === 'false') return false;
    if (/^-?[\d.]+$/.test(v)) return Number(v);
    if (/^'.*'$/.test(v)) return v.slice(1, -1);
    if (/^[[{]/.test(v)) return JSON.parse(v.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"'));
    return v;
  }
  function fetchCell(s, url) {
    s.value = { status: 'loading', data: s.value?.data ?? null };
    fetch(url).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(d => { s.value = { status: 'ok', data: d }; })
      .catch(e => { s.value = { status: 'error', data: String(e.message || e) }; });
  }
  function attachState(el) {
    const sc = { signals: new Map(), meta: new Map() };
    scopes.set(el, sc);
    for (const decl of el.getAttribute('ui:state').split(';')) {
      if (!decl.trim()) continue;
      const ci = decl.indexOf(':');
      if (ci < 0) throw new Error('ui: bad state decl "' + decl + '"');
      const name = decl.slice(0, ci).trim(), val = decl.slice(ci + 1).trim();
      let s;
      if (/^GET\s/i.test(val)) {
        const url = val.slice(4).trim();
        s = sig({ status: 'loading', data: null });
        sc.meta.set(name, { type: 'remote', url });
        fetchCell(s, url);
      } else s = sig(coerce(val));
      sc.signals.set(name, s);
    }
  }
  function attachComputed(el, name, expr) {
    const sc = scopes.get(el);
    if (!sc) { scopes.set(el, sc = { signals: new Map(), meta: new Map() }); }
    const s = sig(undefined);
    const recompute = () => { // compute first, notify, then resubscribe self to deps
      const prev = CUR, subs = CUR = new Set();
      let v;
      try { v = safeEval(expr, el); } finally { CUR = prev; }
      s.value = v;
      for (const set of subs) set.add(recompute);
    };
    recompute();
    sc.signals.set(name, s);
  }

  /* ============ aspect binds ============ */
  const ASPECT = {
    text: (el, v) => el.textContent = v ?? '',
    class: (el, v) => el.className = v ?? '',
    hidden: (el, v) => el.hidden = !!v,
    disabled: (el, v) => el.disabled = !!v,
    checked: (el, v) => el.checked = !!v,
    open: (el, v) => el.open = !!v,
  };
  function applyAspect(el, aspect, v) {
    if (aspect.startsWith('attr:')) {
      const name = aspect.slice(5);
      if (v === false || v == null) el.removeAttribute(name);
      else el.setAttribute(name, v === true ? '' : String(v));
      return;
    }
    const fn = ASPECT[aspect];
    if (!fn) throw new Error('ui: unknown bind aspect "' + aspect + '"');
    fn(el, v);
  }
  function attachBind(el, aspect, expr) {
    const update = () => { try { applyAspect(el, aspect, safeEval(expr, el)); } catch (e) { warn(e.message); } };
    track(update);
  }
  function attachBinds(el) { // ui:bind="aspect: expr; aspect2: expr2" and ui:bind-<aspect>="expr"
    for (const a of [...el.attributes]) {
      const m = a.name.match(/^ui:bind(?:-([a-zA-Z:]+))?$/);
      if (!m) continue;
      if (m[1]) attachBind(el, m[1], a.value);
      else for (const part of a.value.split(';')) {
        if (!part.trim()) continue;
        const ci = part.indexOf(':');
        if (ci < 0) throw new Error('ui: bad bind "' + part + '"');
        attachBind(el, part.slice(0, ci).trim(), part.slice(ci + 1).trim());
      }
    }
  }
  function attachModel(el) { // two-way bind on form controls
    const path = el.getAttribute('ui:model');
    track(() => { const v = readPath(path, el); if (document.activeElement !== el) el.value = v ?? ''; });
    const push = () => setPath(path, el.value, el);
    el.addEventListener('input', push);
    el.addEventListener('change', push);
  }

  /* ============ ui:each — keyed list over a signal ============ */
  function attachEach(el) {
    const parts = el.getAttribute('ui:each').trim().split(/\s+/);
    if (parts.length !== 3 || parts[1] !== 'in') throw new Error('ui: bad each "' + el.getAttribute('ui:each') + '"');
    const [itemName, , listPath] = parts;
    const keyAttr = el.getAttribute('ui:key') || 'id';
    const listRef = resolvePath(listPath, el); // capture while attached (H2 lesson)
    const template = el.cloneNode(true);
    const parent = el.parentElement;
    if (!parent) throw new Error('ui: each template has no parent');
    const anchor = document.createComment('ui:each');
    parent.insertBefore(anchor, el);
    el.remove();
    const rows = new Map();
    const readList = () => { let v = listRef.sig.value; for (const s of listRef.segs) v = v?.[s]; return v; };
    function render(list) {
      if (!Array.isArray(list)) return;
      const keys = new Set();
      const desired = [];
      list.forEach((item, idx) => {
        const key = item?.[keyAttr] ?? idx;
        keys.add(key);
        let r = rows.get(key);
        if (!r) {
          const row = template.cloneNode(true);
          const itemSig = sig(item);
          scopes.set(row, { signals: new Map([[itemName, itemSig]]), meta: new Map() });
          parent.insertBefore(row, anchor);
          attachSubtree(row);
          r = { row, itemSig };
          rows.set(key, r);
        } else r.itemSig.value = item;
        desired.push(r.row);
      });
      for (const [k, r] of [...rows]) if (!keys.has(k)) { r.row.remove(); rows.delete(k); }
      // align DOM order with data order: backward pass, moving only out-of-place rows
      // (moveBefore preserves node state where supported; insertBefore is the fallback)
      let expected = anchor;
      for (let i = desired.length - 1; i >= 0; i--) {
        const row = desired[i];
        if (row.nextSibling !== expected) {
          if (parent.moveBefore && row.isConnected) parent.moveBefore(row, expected);
          else parent.insertBefore(row, expected);
        }
        expected = row;
      }
    }
    track(() => render(readList()));
  }

  /* ============ structural enhancers (classes + a11y + platform wiring) ============ */
  let anchorSeq = 0;
  const ICONS = ['check', 'x', 'chevron-down', 'search', 'plus', 'dot', 'menu'];
  function injectSprite() {
    if (document.getElementById('ui-icons')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'ui-icons'; svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'none';
    const paths = {
      check: 'M20 6 9 17l-5-5',
      x: 'M18 6 6 18M6 6l12 12',
      'chevron-down': 'm6 9 6 6 6-6',
      search: 'M21 21l-4.34-4.34M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
      plus: 'M12 5v14M5 12h14',
      dot: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
      menu: 'M4 6h16M4 12h16M4 18h16',
    };
    for (const [name, d] of Object.entries(paths)) {
      const sym = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
      sym.id = 'ui-i-' + name; sym.setAttribute('viewBox', '0 0 24 24');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      sym.appendChild(p); svg.appendChild(sym);
    }
    document.body.prepend(svg);
  }
  const ENHANCERS = {
    'ui:stack': el => {
      el.classList.add('ui-stack');
      const g = el.getAttribute('gap'); if (g) el.style.setProperty('--ui-gap', `var(--ui-gap-${g})`);
      const a = el.getAttribute('align'); if (a) el.style.alignItems = a === 'between' ? 'space-between' : a;
      if (el.hasAttribute('center')) { el.style.alignItems = 'center'; el.style.justifyContent = 'center'; }
    },
    'ui:row': el => {
      el.classList.add('ui-row');
      const g = el.getAttribute('gap'); if (g) el.style.setProperty('--ui-gap', `var(--ui-gap-${g})`);
      const a = el.getAttribute('align');
      if (a === 'between') el.style.justifyContent = 'space-between';
      else if (a) el.style.alignItems = a;
      if (el.hasAttribute('wrap')) el.style.flexWrap = 'wrap';
      if (el.hasAttribute('center')) { el.style.alignItems = 'center'; el.style.justifyContent = 'center'; }
    },
    'ui:card': el => {
      el.classList.add('ui-card');
      const v = el.getAttribute('variant'); if (v) el.classList.add('ui-card-' + v);
    },
    'ui:divider': el => el.classList.add('ui-divider'),
    'ui:spacer': el => {
      el.classList.add('ui-spacer');
      const s = el.getAttribute('size'); if (s) el.style.setProperty('--ui-h', `var(--ui-gap-${s})`);
    },
    'ui:text': el => {
      el.classList.add('ui-text');
      const v = el.getAttribute('variant'); if (v) el.classList.add('ui-t-' + v);
    },
    'ui:badge': el => {
      el.classList.add('ui-badge');
      const v = el.getAttribute('variant'); if (v) el.classList.add('ui-b-' + v);
    },
    'ui:button': el => {
      el.classList.add('ui-btn');
      const v = el.getAttribute('variant'); if (v) el.classList.add('ui-btn-' + v);
      if (el.hasAttribute('block')) el.classList.add('ui-btn-block');
    },
    'ui:icon': el => {
      injectSprite();
      el.classList.add('ui-icon');
      const name = el.getAttribute('name');
      el.innerHTML = `<use href="#ui-i-${name}"></use>`;
      el.setAttribute('aria-hidden', 'true');
    },
    'ui:image': el => {
      el.classList.add('ui-img');
      const r = el.getAttribute('ratio'); if (r) el.style.aspectRatio = r;
      const fail = () => el.classList.add('ui-img-error');
      // the error event may have fired before attach (fast 404) — check completion state
      if (el.complete && el.naturalWidth === 0) fail();
      else el.addEventListener('error', fail, { once: true });
    },
    'ui:field': el => el.classList.add('ui-field'),
    'ui:input': el => el.classList.add('ui-control'),
    'ui:textarea': el => { el.classList.add('ui-control'); el.classList.add('ui-grow'); },
    'ui:select': el => el.classList.add('ui-control'),
    'ui:checkbox': el => el.classList.add('ui-check'),
    'ui:popover': el => {
      el.classList.add('ui-pop');
      const sel = el.getAttribute('anchor');
      if (sel) {
        const a = document.querySelector(sel);
        if (a) {
          const name = '--ui-anchor-' + (++anchorSeq);
          a.style.anchorName = name;
          el.style.positionAnchor = name;
        }
      }
      const p = el.getAttribute('placement');
      if (p) el.setAttribute('data-placement', p);
    },
    'ui:modal': el => { el.classList.add('ui-dialog'); },
    'ui:tabs': el => {
      el.classList.add('ui-tabs');
      const tabs = [...el.querySelectorAll('[role="tab"]')];
      const panels = [...el.querySelectorAll('[role="tabpanel"]')];
      const select = i => {
        tabs.forEach((t, j) => {
          t.setAttribute('aria-selected', String(i === j));
          t.tabIndex = i === j ? 0 : -1;
        });
        panels.forEach((p, j) => { p.hidden = i !== j; });
      };
      tabs.forEach((t, i) => {
        t.addEventListener('click', () => select(i));
        t.addEventListener('keydown', e => {
          if (e.key === 'ArrowRight') { const n = (i + 1) % tabs.length; select(n); tabs[n].focus(); }
          if (e.key === 'ArrowLeft') { const n = (i - 1 + tabs.length) % tabs.length; select(n); tabs[n].focus(); }
        });
      });
      const initial = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
      select(Math.max(0, initial));
    },
  };
  function attachEnhancers(el) {
    for (const a of [...el.attributes]) {
      const enh = ENHANCERS[a.name];
      if (enh) { try { enh(el); } catch (e) { warn(e.message); } }
    }
  }

  /* ============ fx: event -> closed verb list ============ */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function parseVerb(src) {
    const m = src.trim().match(/^(\w+)\s*([\s\S]*)$/);
    if (!m) return null;
    const name = m[1];
    let args = m[2].trim();
    if (args.startsWith(':')) args = args.slice(1).trim(); // tolerate "verb: arg" style in mid-list verbs
    const v = { name };
    try {
      if (name === 'set') { const mm = args.match(/^([\w.]+)\s*=\s*([\s\S]+)$/); if (!mm) throw new Error('ui: bad set'); v.path = mm[1]; v.expr = mm[2]; }
      else if (name === 'toggle') v.path = args;
      else if (name === 'toast') v.expr = args;
      else if (name === 'onfail') v.expr = args.replace(/^toast\s+/, '');
      else if (name === 'delay') v.ms = Number(args);
      else if (name === 'nav') v.sel = args.startsWith("'") ? safeEvalConst(args) : args;
      else if (name === 'refetch') v.target = args;
      else if (name === 'focus' || name === 'reset') v.sel = args.startsWith("'") ? safeEvalConst(args) : args;
      else if (name === 'prompt') { const mm = args.match(/^([\s\S]+?)\s+into\s+([\w.]+)$/); if (!mm) throw new Error('ui: prompt needs "into <path>"'); v.msg = mm[1]; v.path = mm[2]; }
      else if (name === 'confirm') v.expr = args;
      else if (name === 'call') {
        // extract optimistic first (bounded by ';'), then the with-body clause
        const om = args.match(/optimistic:\s*set\s+([\w.]+)\s*=\s*([^;]+)/);
        if (om) { v.optimistic = { path: om[1], expr: om[2].trim() }; args = args.replace(/optimistic:[^;]+/, '').trim(); }
        const bm = args.match(/\swith\s+([\s\S]+)$/);
        if (bm) { v.body = bm[1]; args = args.replace(/\swith\s+[\s\S]+$/, '').trim(); }
        const mm = args.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/);
        if (!mm) throw new Error('ui: bad call "' + args + '"');
        v.method = mm[1]; v.url = mm[2];
      }
    } catch (e) { throw new Error(`ui: verb "${name}": ${e.message}`); }
    return v;
  }
  const safeEvalConst = src => ev(parse(src), null); // constant sub-expressions (selectors)

  function toastHost() {
    let host = document.getElementById('ui-toasts');
    if (!host) {
      host = Object.assign(document.createElement('div'), { id: 'ui-toasts' });
      host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
      document.body.append(host);
    }
    return host;
  }
  function toast(msg, fail) {
    const t = Object.assign(document.createElement('div'), { className: 'ui-toast' + (fail ? ' ui-toast-fail' : ''), textContent: String(msg) });
    toastHost().append(t);
    setTimeout(() => t.remove(), 2600);
  }
  function doNav(sel, el) {
    const target = document.querySelector(sel);
    if (!target) { warn('ui: nav target not found: ' + sel); return; }
    const screens = [...document.querySelectorAll('[data-screen]')];
    const go = () => {
      for (const s of screens) s.hidden = s !== target;
      target.dispatchEvent(new CustomEvent('ui:navigated', { bubbles: true }));
    };
    if (document.startViewTransition) document.startViewTransition(go); else go();
  }
  function doRefetch(name, el) {
    const f = findScope(el, name);
    if (!f) { warn('ui: refetch unknown signal "' + name + '"'); return; }
    let scopeEl = null;
    for (let p = el; p; p = p.parentElement) if (scopes.get(p)?.meta?.has(name)) { scopeEl = p; break; }
    const meta = scopeEl && scopes.get(scopeEl).meta.get(name);
    if (meta && meta.type === 'remote') fetchCell(f.sig, meta.url);
    else warn('ui: refetch target is not a remote cell: ' + name);
  }
  async function doCall(v, el) {
    const url = v.url.replace(/\{([\w.]+)\}/g, (_, p) => readPath(p, el));
    // capture the optimistic path's signal ref up front: the optimistic set may remove
    // this element's row from the DOM, and the rollback must not re-resolve through it
    const opt = v.optimistic ? { ref: resolvePath(v.optimistic.path, el), expr: v.optimistic.expr } : null;
    const readRef = r => { let x = r.sig.value; for (const s of r.segs) x = x?.[s]; return x; };
    const old = opt ? readRef(opt.ref) : undefined;
    // the request payload is computed at EVENT TIME — before the optimistic set mutates
    // any signal the body expression may read
    const body = v.body != null ? JSON.stringify(safeEval(v.body, el)) : undefined;
    if (opt) writeRef(opt.ref, safeEval(opt.expr, el));
    try {
      const res = await fetch(url, {
        method: v.method,
        headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return true;
    } catch (e) {
      if (opt) writeRef(opt.ref, old); // rollback via captured ref
      return false;
    }
  }
  function attachFx(el) {
    const spec = el.getAttribute('ui:fx');
    const ci = spec.indexOf(':');
    if (ci < 0) throw new Error('ui: bad fx "' + spec + '"');
    const evName = spec.slice(0, ci).trim();
    const verbs = spec.slice(ci + 1).split(';').map(parseVerb).filter(Boolean);
    const go = async () => {
      let failed = false;
      for (const v of verbs) {
        try {
          if (v.name === 'set') setPath(v.path, safeEval(v.expr, el), el);
          else if (v.name === 'toggle') setPath(v.path, !readPath(v.path, el), el);
          else if (v.name === 'call') { try { failed = !(await doCall(v, el)); } catch (e) { warn(e.message); failed = true; } }
          else if (v.name === 'onfail') { if (failed) toast(safeEval(v.expr, el), true); }
          else if (v.name === 'toast') toast(safeEval(v.expr, el), false);
          else if (v.name === 'nav') doNav(v.sel, el);
          else if (v.name === 'refetch') doRefetch(v.target, el);
          else if (v.name === 'focus') document.querySelector(v.sel)?.focus();
          else if (v.name === 'reset') {
            const f = document.querySelector(v.sel);
            if (f?.tagName === 'FORM') {
              f.reset();
              for (const c of f.querySelectorAll('[ui\\:model]')) setPath(c.getAttribute('ui:model'), c.value, c);
            }
          }
          else if (v.name === 'delay') await sleep(v.ms);
          else if (v.name === 'prompt') {
            const val = window.prompt(safeEval(v.msg, el));
            if (val !== null) setPath(v.path, val, el);
          }
          else if (v.name === 'confirm') { if (!window.confirm(safeEval(v.expr, el))) return; }
        } catch (e) { warn(e.message); }
      }
    };
    el.addEventListener(evName, e => {
      if (el.hasAttribute('ui:transition') && document.startViewTransition) document.startViewTransition(go);
      else go();
    });
  }

  /* ============ attach passes (each isolated: one bad node must not kill the page) ============ */
  const warns = []; // observable attach/run warnings — `ui check` and tests read these
  const warn = msg => { warns.push(String(msg)); console.warn(msg); };
  const guard = (fn, kind, el) => { try { fn(); } catch (e) { warn(`ui: attach ${kind ?? ''} on <${el?.tagName?.toLowerCase() ?? '?'}${el?.id ? '#' + el.id : ''}>: ${e.message}`); } };
  function attachSubtree(root) { // rows: enhancers + binds/model/fx only
    for (const el of [root, ...root.querySelectorAll('*')]) {
      guard(() => attachEnhancers(el), 'enhance', el);
      guard(() => attachBinds(el), 'bind', el);
      if (el.hasAttribute('ui:model')) guard(() => attachModel(el));
      if (el.hasAttribute('ui:fx')) guard(() => attachFx(el), 'fx', el);
    }
  }
  function attachAll(root) {
    const els = [root, ...root.querySelectorAll('*')];
    for (const el of els) if (el.isConnected && el.hasAttribute('ui:state')) guard(() => attachState(el), 'state', el);
    for (const el of els) if (el.isConnected && el.hasAttribute('ui:computed')) guard(() => {
      const ci = el.getAttribute('ui:computed').indexOf(':');
      const name = el.getAttribute('ui:computed').slice(0, ci).trim();
      const expr = el.getAttribute('ui:computed').slice(ci + 1).trim();
      attachComputed(el, name, expr);
    });
    for (const el of els) if (el.isConnected && el.hasAttribute('ui:each')) guard(() => attachEach(el));
    for (const el of els) if (el.isConnected && !el.hasAttribute('ui:each')) {
      guard(() => attachEnhancers(el), 'enhance', el);
      guard(() => attachBinds(el), 'bind', el);
      if (el.hasAttribute('ui:model')) guard(() => attachModel(el));
      if (el.hasAttribute('ui:fx')) guard(() => attachFx(el), 'fx', el);
    }
  }
  function boot() {
    try { attachAll(document.body); } finally { window.__uiReady = true; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* debug/test hooks (documented, read-only surface) */
  window.__ui = { version: VERSION, parse, ev, safeEval, sig, scopes, BUILTINS, findScope, readPath, warns, parseVerb, verbs: { set: 1, toggle: 1, call: 1, toast: 1, nav: 1, refetch: 1, prompt: 1, confirm: 1, focus: 1, reset: 1, delay: 1, onfail: 1 } };
})();
