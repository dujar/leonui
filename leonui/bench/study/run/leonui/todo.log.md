# todo — leonui

## Cycle 1
- changed: initial write
- verify: {"file":"run/leonui/todo.html","framework":"leonui","ok":true,"consoleErrors":[],"pageErrors":[],"uiWarns":[],"uiReady":true,"rootChildren":-1,"text":"Todo Add 0 left"}
- check: {"files":1,"errors":0,"warnings":0,"suppressed":0,"findings":[]}

## Result
- cycles: 1
- cycles_with_issues: 0
- final_ok: true

Notes:
- Design for the keyed-list trap: `done` lives on the item object (`{id, title, done}`), rows are keyed by `id`; the checkbox writes `set item.done = !item.done` on `change` (same shape as the shipped `pages/inbox.html` optimistic toggle), so removing a different row via `without(items, item)` keeps the toggled item object and its done state intact.
- Status count is a `left` counter signal adjusted by every handler (add +1 when non-empty, tick −1 / untick +1, remove −1 only when the removed item is not done), since the expression whitelist has no filter/count. The Add handler evaluates its `draft == ''` guards BEFORE `set draft = ''` clears the input.
- Both verifiers were run a second time after cycle 1 with no page change to confirm stability (same results).
