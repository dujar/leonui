/* fx.ts — events → closed effect-verb catalog */
import type { Verb } from './types.ts';
import { resolvePath, readPath, writeRef, setPath, scopes, warn } from './signals.ts';
import { safeEval } from './parser.ts';
import { fetchCell } from './state.ts';
import { VERB_NAMES } from './vocab.ts';

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/* ---------- the closed catalog ----------
 * The list itself lives in vocab.ts — the one table the runtime and the
 * browser-free `ui check` checker both read, so a verb cannot be implemented
 * here and undocumented there. This file owns parsing and execution. */
export { VERBS, GATES } from './vocab.ts';
/** the catalog as a lookup record — `__ui.verbs`, and anything else that needs the list */
export const VERB_CATALOG: Record<string, 1> = Object.fromEntries(
  VERB_NAMES.map(v => [v, 1 as const]),
);

export function parseVerb(src: string): Verb | null {
  const m = src.trim().match(/^(\w+)\s*([\s\S]*)$/);
  if (!m) return null;
  const name = m[1]!;
  let args = m[2]!.trim();
  if (args.startsWith(':')) args = args.slice(1).trim(); // tolerate "verb: arg" style in mid-list verbs
  const v: Verb = { name };
  try {
    if (name === 'set') {
      const mm = args.match(/^([\w.]+)\s*=\s*([\s\S]+)$/);
      if (!mm) throw new Error('ui: bad set');
      v.path = mm[1]!; v.expr = mm[2]!;
    } else if (name === 'toggle') v.path = args;
    else if (name === 'toast') v.expr = args;
    else if (name === 'onfail' || name === 'onsuccess') v.expr = args.replace(/^toast\s+/, '');
    else if (name === 'delay') v.ms = Number(args);
    else if (name === 'nav') v.sel = args.startsWith("'") ? String(safeEval(args, null)) : args;
    else if (name === 'refetch') v.target = args;
    else if (name === 'focus' || name === 'reset') v.sel = args.startsWith("'") ? String(safeEval(args, null)) : args;
    else if (name === 'dismiss') {
      // no selector: it closes the overlay the element is *inside*, which is the
      // only thing a menu item or a dialog button ever means by "close this"
      if (args) throw new Error(`dismiss takes no arguments, found "${args}"`);
    } else if (name === 'prompt') {
      const mm = args.match(/^([\s\S]+?)\s+into\s+([\w.]+)$/);
      if (!mm) throw new Error('ui: prompt needs "into <path>"');
      v.msg = mm[1]!; v.path = mm[2]!;
    } else if (name === 'confirm') v.expr = args;
    else if (name === 'call') {
      // extract optimistic first (bounded by ';'), then the with-body clause
      const om = args.match(/optimistic:\s*set\s+([\w.]+)\s*=\s*([^;]+)/);
      if (om) { v.optimistic = { path: om[1]!, expr: om[2]!.trim() }; args = args.replace(/optimistic:[^;]+/, '').trim(); }
      const bm = args.match(/\swith\s+([\s\S]+)$/);
      if (bm) { v.body = bm[1]!; args = args.replace(/\swith\s+[\s\S]+$/, '').trim(); }
      const mm = args.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/);
      if (!mm) throw new Error(`ui: bad call "${args}"`);
      v.method = mm[1] as Verb['method']; v.url = mm[2]!;
    } else {
      throw new Error(`ui: unknown verb "${name}" (see skill/SKILL.md for the catalog)`);
    }
  } catch (e) {
    throw new Error(`ui: verb "${name}": ${(e as Error).message}`);
  }
  return v;
}

function toastHost(): HTMLElement {
  let host = document.getElementById('ui-toasts');
  if (!host) {
    host = Object.assign(document.createElement('div'), { id: 'ui-toasts' });
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  return host;
}

export function toast(msg: unknown, fail: boolean): void {
  const t = Object.assign(document.createElement('div'), {
    className: 'ui-toast' + (fail ? ' ui-toast-fail' : ''),
    textContent: String(msg),
  });
  toastHost().append(t);
  setTimeout(() => t.remove(), 2600);
}

function doNav(sel: string): void {
  const target = document.querySelector(sel);
  if (!target) { warn('ui: nav target not found: ' + sel); return; }
  const screens = [...document.querySelectorAll('[data-screen]')];
  const go = (): void => {
    for (const s of screens) (s as HTMLElement).hidden = s !== target;
    target.dispatchEvent(new CustomEvent('ui:navigated', { bubbles: true }));
  };
  if (document.startViewTransition) document.startViewTransition(go);
  else go();
}

/** `:popover-open` is the only way to ask "is this popover open?" — `[popover]`
 * is present whether it is open or not, and there is no property for it. It is
 * also newer than the `popover` attribute itself, so a browser that supports the
 * attribute may still throw a SyntaxError on the selector. Detected once. */
let popoverOpenSelector: boolean | null = null;
function canQueryPopoverOpen(): boolean {
  if (popoverOpenSelector === null) {
    try {
      document.createElement('div').matches(':popover-open');
      popoverOpenSelector = true;
    } catch {
      popoverOpenSelector = false;
    }
  }
  return popoverOpenSelector;
}

/** Close the overlay this element sits inside — the nearest open popover or
 * `<dialog>`, walking outward.
 *
 * The gap this fills is a platform one. A popover can only be *closed* from a
 * button: `popovertargetaction="hide"` and `command="hide-popover"` both apply to
 * `<button>`/`<input type=button>` and to nothing else. So the single most common
 * popover on the web — a mobile menu made of `<a href="#section">` links — has no
 * way to close itself when a destination is picked, and stays open over the page
 * the reader just asked for. Every author works around it with a click handler,
 * which is exactly the kind of thing the verb catalog exists to hold instead.
 *
 * A miss is named rather than silent, for the same reason `focus` names one: an
 * element that was never inside an overlay looks like a broken button. */
function doDismiss(el: Element): void {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n instanceof HTMLDialogElement) {
      if (n.open) n.close();
      return;
    }
    if (canQueryPopoverOpen() && n.matches(':popover-open')) {
      (n as HTMLElement).hidePopover();
      return;
    }
  }
  warn(`ui: dismiss found no open popover or <dialog> around <${el.tagName.toLowerCase()}> — nothing to close`);
}

function doRefetch(name: string, el: Element): void {
  let sigRef: import('./types.ts').Signal | null = null;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const s = scopes.get(n);
    if (s && s.signals.has(name)) { sigRef = s.signals.get(name)!; break; }
  }
  if (!sigRef) { warn(`ui: refetch unknown signal "${name}"`); return; }
  let scopeEl: Element | null = null;
  for (let p: Element | null = el; p; p = p.parentElement) {
    if (scopes.get(p)?.meta.has(name)) { scopeEl = p; break; }
  }
  const meta = scopeEl ? scopes.get(scopeEl)!.meta.get(name) : undefined;
  if (meta && meta.type === 'remote') fetchCell(sigRef, meta.url);
  else warn(`ui: refetch target is not a remote cell: ${name}`);
}

/** a control whose `.value` actually represents its `ui:model` path.
 * checkbox/radio carry boolean state (`checked`), file carries a fake path, and a
 * multi-select's `.value` is only its first selected option — writing any of those
 * back would corrupt the signal. SKILL.md documents that reset does not restore
 * checkbox state; this makes the runtime agree with the documentation. */
function modelValue(control: Element): string | null {
  if (control instanceof HTMLInputElement) {
    if (control.type === 'checkbox' || control.type === 'radio' || control.type === 'file') return null;
    return control.value;
  }
  if (control instanceof HTMLSelectElement) return control.multiple ? null : control.value;
  return (control as HTMLInputElement).value;
}

async function doCall(v: Verb, el: Element): Promise<boolean> {
  const url = v.url!.replace(/\{([\w.]+)\}/g, (_, p: string) => String(readPath(p, el)));
  // capture the optimistic path's signal ref up front: the optimistic set may remove
  // this element's row from the DOM, and the rollback must not re-resolve through it
  const opt = v.optimistic
    ? { ref: resolvePath(v.optimistic.path, el), expr: v.optimistic.expr }
    : null;
  const readRef = (r: { ref: { sig: import('./types.ts').Signal; segs: string[] } }): unknown => {
    let x: unknown = r.ref.sig.value;
    for (const s of r.ref.segs) x = (x as Record<string, unknown> | null | undefined)?.[s];
    return x;
  };
  const old = opt ? readRef(opt) : undefined;
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
  } catch {
    if (opt) writeRef(opt.ref, old); // rollback via captured ref
    return false;
  }
}

/** Mutable state one run of a verb list carries between verbs. Only the response
 * gates read it, and only `call` writes it. */
interface FxRun { failed: boolean }

/** A handler returns `false` to abandon the rest of the list — only `confirm`
 * does, and only when the reader declines. */
type Stop = false | void;
type Handler = (v: Verb, el: Element, run: FxRun) => Stop | Promise<Stop>;

/** One handler per name in `VERB_NAMES`, and `vocab.test.ts` pins the two sets to
 * each other in both directions.
 *
 * This is a table rather than an if-chain for the same reason `ENHANCERS` is: a
 * verb added to the catalog with no implementation here would otherwise be a
 * silent no-op — it parses, `ui check` accepts it, the generated skill table
 * documents it, and firing the event does nothing at all. That is the exact
 * failure this whole vocabulary exists to prevent, and an if-chain cannot be
 * introspected to prove it has not happened. */
export const VERB_HANDLERS: Record<string, Handler> = {
  set: (v, el) => { setPath(v.path!, safeEval(v.expr!, el), el); },
  toggle: (v, el) => { setPath(v.path!, !readPath(v.path!, el), el); },
  call: async (v, el, run) => {
    // the inner catch is deliberate: a `call` that throws has still *failed*, and
    // an `onfail` gate after it must run. Letting the outer catch handle it would
    // warn identically and leave the gate reading a stale outcome.
    try { run.failed = !(await doCall(v, el)); }
    catch (e) { warn((e as Error).message); run.failed = true; }
  },
  toast: (v, el) => { toast(safeEval(v.expr!, el), false); },
  nav: v => { doNav(v.sel!); },
  refetch: (v, el) => { doRefetch(v.target!, el); },
  focus: v => {
    const t = document.querySelector(v.sel!) as HTMLElement | null;
    // `nav` has always named a missing target; focus did not, so a typo'd
    // selector looked like a control that simply refused to take focus
    if (!t) warn('ui: focus target not found: ' + v.sel);
    else t.focus();
  },
  reset: v => {
    const f = document.querySelector(v.sel!);
    // two ways reset did nothing, both silent: the selector matched nothing,
    // or it matched something that is not a form, so `.reset()` is not there
    // to call. `nav`'s wording, then, for the first; a second line for the second.
    if (!f) warn('ui: reset target not found: ' + v.sel);
    else if (f.tagName !== 'FORM') warn(`ui: reset target is not a <form>: ${v.sel} (found <${f.tagName.toLowerCase()}>)`);
    else {
      (f as HTMLFormElement).reset();
      for (const c of f.querySelectorAll('[ui\\:model]')) {
        const value = modelValue(c);
        if (value !== null) setPath(c.getAttribute('ui:model')!, value, c);
      }
    }
  },
  dismiss: (_v, el) => { doDismiss(el); },
  delay: v => sleep(v.ms!),
  prompt: (v, el) => {
    const val = window.prompt(safeEval(v.msg!, el) as string);
    if (val !== null) setPath(v.path!, val, el);
  },
  confirm: (v, el) => (window.confirm(safeEval(v.expr!, el) as string) ? undefined : false),

  /* response gates — the catalog lists them beside the verbs but they are not
   * verbs (naming.md §6): they read the last call's outcome rather than acting,
   * and the list always continues past them, so a gate never returns `false`. */
  onfail: (v, el, run) => { if (run.failed && v.expr) toast(safeEval(v.expr, el), true); },
  onsuccess: (v, el, run) => { if (!run.failed && v.expr) toast(safeEval(v.expr, el), false); },
};

export function attachFx(el: Element): void {
  const spec = el.getAttribute('ui:fx')!;
  const ci = spec.indexOf(':');
  if (ci < 0) throw new Error(`ui: bad fx "${spec}"`);
  const evName = spec.slice(0, ci).trim();
  const verbs = spec.slice(ci + 1).split(';').map(parseVerb).filter((v): v is Verb => !!v);
  const go = async (): Promise<void> => {
    const run: FxRun = { failed: false };
    for (const v of verbs) {
      // hasOwn, not `in`: a verb named `constructor` must not resolve to
      // Object.prototype's
      const handler = Object.hasOwn(VERB_HANDLERS, v.name) ? VERB_HANDLERS[v.name] : undefined;
      if (!handler) {
        warn(`ui: verb "${v.name}" is in the catalog but has no implementation — no effect`);
        continue;
      }
      try {
        if ((await handler(v, el, run)) === false) return;
      } catch (e) { warn((e as Error).message); }
    }
  };
  el.addEventListener(evName, e => {
    if (evName === 'submit') e.preventDefault(); // attribute apps never navigate on submit
    if (el.hasAttribute('ui:transition') && document.startViewTransition) document.startViewTransition(go);
    else void go();
  });
}
