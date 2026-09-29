---
name: react-standalone
description: Author interactive UI as a single HTML file with React 19 loaded as browser globals plus babel-standalone for JSX — no build step, no npm. Use for small standalone pages (todo lists, filters, forms, tabs) that must run by opening the file through the study server.
---

# React (standalone, no build)

React 19 runs directly in the browser: two classic scripts put `React` (the library) and `ReactDOM` (`createRoot`) on `window`, and babel-standalone compiles `<script type="text/babel">` blocks — JSX included — at page load. There is no bundler, no npm, no TypeScript, no `import` statements: one HTML file is the whole deliverable. Verify your page with `verify.ts` (see **Verifying a page**); the browser console is your only checker.

## Page skeleton

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title></head>
<body>
  <div id="root"></div>
  <script src="/vendor/react.bundle.js"></script>
  <script src="/vendor/babel.min.js"></script>
  <script type="text/babel" data-presets="react">
    const { useState } = React;

    function App() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(count + 1)}>clicked {count} times</button>;
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body></html>
```

The three lines that make it run: both vendor scripts **before** the babel block, `type="text/babel"` on the JSX block (anything else is not compiled and `=>`/`<` throw SyntaxErrors), and `ReactDOM.createRoot(...).render(<App />)` at the bottom. `React` and `ReactDOM` are globals — never write `import` or `require`.

## Hooks you need

- `const [value, setValue] = useState(initial)` — state; the setter replaces the value (never mutate: `setItems(items.map(...))`, not `items.push(...)`).
- Derive during render — `const left = items.filter(i => !i.done).length` — no `useMemo` needed at this size.
- `useEffect(() => {...}, [deps])` only for things outside render (timers, fetch). This study's tasks need none.

## Patterns

- **Controlled input:** `<input value={draft} onChange={e => setDraft(e.target.value)} />`. Forgetting `onChange` makes the input read-only and React logs a warning.
- **Lists:** `{items.map(it => <li key={it.id}>...</li>)}` — every element in an array needs a stable `key` (an id, not the array index if rows reorder or delete; missing keys log a console warning).
- **Conditional visibility:** render conditionally (`{open && <Panel/>}`) or set style/className: `style={{ display: show ? '' : 'none' }}`. Anything unmounted is invisible; a hidden row must not stay visible.
- **Forms:** `<form onSubmit={e => { e.preventDefault(); validate(); }}>` — always `preventDefault` or the page reloads and your state is gone.
- **Computed attributes:** `aria-selected={active ? 'true' : 'false'}` — React writes the string you give it; `aria-selected={active}` would render `"true"`/`"false"` only for booleans on some attributes, so write the explicit strings for ARIA state.
- **Text decoration:** `style={{ textDecoration: done ? 'line-through' : 'none' }}`.

## Hard rules / gotchas

- One root, one `createRoot`. `ReactDOM.render` does not exist in React 19.
- State updates are replace-only: build new arrays/objects (`filter`, `map`, spread); direct mutation does not re-render.
- Event handlers on disabled buttons never fire — if you disable `Add` while the input is empty, that is your empty-input guard.
- Clicking a checkbox fires `change`; use `checked={x}` + `onChange`, not `defaultChecked`, or toggling breaks.
- JSX `class` is `className`; `for` is `htmlFor`; DOM props are camelCase (`noValidate`, `autoComplete`); `style` takes an object, not a string.
- Every array child needs `key`. Console will warn — a warning counts as a failed verify.
- `useEffect` runs after paint; don't read state from it that you could compute during render.
- babel-standalone compiles only `text/babel` blocks — a stray `</script>` inside a JSX string ends the block early; keep strings out of JSX or escape them.
- The grader drives the DOM: it sets `input.value` + dispatches `input` (React controlled inputs see this), clicks with `.click()`, calls `form.requestSubmit()`, and reads `innerText`, `getComputedStyle`, `checkVisibility()`, and `aria-selected` attributes. Render real DOM, not canvas.
- React's own warnings (keys, controlled inputs, invalid DOM props) arrive as `console.error` — the verifier counts every one, so treat a clean console as part of "done".

## Verifying a page (run this after every change, before you say you are done)

```bash
bun bench/study/verify.ts <your-page.html> react
```

It loads the page in a real headless Chromium, waits for it to settle, and prints one JSON line: `ok` (overall verdict), `consoleErrors`, `pageErrors`, `rootChildren` (elements React mounted into `#root`; `-1` means `#root` is missing — always include `<div id="root">`), and the first 160 chars of rendered text. `ok:false` means not done: fix, re-run, and only then change code again. Exit code is 0 iff `ok:true`. There is no static checker for browser-JSX — the console run is the whole contract, so run it every cycle.

## Worked example: validated form

```jsx
function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [welcome, setWelcome] = useState('');

  const submit = e => {
    e.preventDefault();
    const errs = {};
    if (name === '') errs.name = 'Name is required';
    if (!(email.includes('@') && email.includes('.'))) errs.email = 'Enter a valid email';
    setErrors(errs);
    if (!errs.name && !errs.email) setWelcome('Welcome, ' + name + '!');
  };

  return (
    <form onSubmit={submit} noValidate>
      <input name="name" value={name} onChange={e => setName(e.target.value)} />
      {errors.name && <p>{errors.name}</p>}
      <input name="email" value={email} onChange={e => setEmail(e.target.value)} />
      {errors.email && <p>{errors.email}</p>}
      <button>Sign up</button>
      {welcome && <p>{welcome}</p>}
    </form>
  );
}
```

## Worked example: filtering a list live

```jsx
const PRODUCTS = ['Aluminum Tee', 'Bamboo Desk Mat', 'Copper Kettle'];

function Catalog() {
  const [q, setQ] = useState('');
  const show = n => n.toLowerCase().includes(q.toLowerCase());
  return (
    <div>
      <input value={q} placeholder="Search products" onChange={e => setQ(e.target.value)} />
      <ul>
        {PRODUCTS.map(n => (
          <li key={n} style={{ display: show(n) ? '' : 'none' }}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
```
