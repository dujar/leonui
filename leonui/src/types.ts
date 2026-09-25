/* types.ts — public internals of the leonui runtime */

/* ---------- signals ---------- */
export interface Signal<T = unknown> {
  get value(): T;
  set value(v: T);
}
export interface RemoteMeta {
  type: 'remote';
  url: string;
}
export interface Scope {
  signals: Map<string, Signal>;
  meta: Map<string, RemoteMeta>;
}

/* ---------- expression AST (whitelist — no eval, ever) ---------- */
export type Ast =
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'id'; v: string }
  | { t: 'dot'; e: Ast; name: string }
  | { t: 'not'; e: Ast }
  | { t: 'neg'; e: Ast }
  | { t: 'add' | 'sub' | 'mul' | 'div' | 'mod' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '&&' | '||'; a: Ast; b: Ast }
  | { t: '?:'; c: Ast; a: Ast; b: Ast }
  | { t: 'arr'; items: ArrItem[] }
  | { t: 'obj'; pairs: { key: string; e: Ast }[] }
  | { t: 'call'; name: string; args: Ast[] };
export type ArrItem = Ast | { t: 'spread'; e: Ast };

/* ---------- effect verbs (closed catalog) ---------- */
export interface Verb {
  name: string;
  path?: string;
  expr?: string;
  ms?: number;
  sel?: string;
  target?: string;
  msg?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url?: string;
  body?: string;
  optimistic?: { path: string; expr: string };
}

/* ---------- element augmentation for the ui debug hook ---------- */
export interface ScopeEl extends Element {
  // scopes are tracked in a WeakMap; nothing is added to elements themselves
}
