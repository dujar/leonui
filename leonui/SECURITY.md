# Security policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), or email
[dujar.coding@gmail.com](mailto:dujar.coding@gmail.com) with `[leonui security]`
in the subject. You will get an acknowledgment within 7 days.

## Scope

The security-relevant surface of leonui is deliberately small:

- **The expression language** (`src/parser.ts`) — a whitelist AST interpreter.
  It must never evaluate anything outside its whitelist. Tests assert that
  globals, method calls, and undeclared signals are rejected
  (`tests/e2e.test.ts`, `tests/frameworks.test.ts`).
- **Remote `ui:use` component files** (`src/scan.ts`) — fetched same-origin,
  parsed, and **script-stripped** by design (`tests/remotecomponents.test.ts`).
  If you find a path where fetched markup can execute script, that is a
  critical report.
- **`call` / remote cells** — plain `fetch` from the page; standard web origin
  rules apply. The framework adds no auth layer and promises none.

## Supported versions

The latest published version on npm is supported. Pre-1.0, backports are
best-effort.
