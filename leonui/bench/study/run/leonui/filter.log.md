# filter — leonui

## Cycle 1
- changed: initial write — single page: `<h1>Catalog</h1>`, text input with placeholder `Search products` bound via `ui:model="query"` (writes the signal on `input`), and a `ui:each` list over a static 10-product array declared in `ui:state` on `<body>`. The expression whitelist has no case operator, so each product embeds three case variants of its name (`name`, lowercase `l`, uppercase `u`); each row carries `ui:bind-hidden="query != '' && !contains(item.name, query) && !contains(item.l, query) && !contains(item.u, query)"` (the inbox.html row-filtering pattern), which makes matching a case-insensitive substring check for lowercase / UPPERCASE / Title-case queries while keeping the displayed text character-exact. No count line, no empty-state message.
- verify: {"file":"run/leonui/filter.html","framework":"leonui","ok":true,"consoleErrors":[],"pageErrors":[],"uiWarns":[],"uiReady":true,"rootChildren":-1,"text":"Catalog Aluminum Tee Bamboo Desk Mat Copper Kettle Desk Cable Tray Ergo Footrest Felt Organizer Gel Wrist Rest Hub Adapter Pro Ink Roller Pen Jute Storage Bin"}
- check: {"files":1,"errors":0,"warnings":0,"suppressed":0,"findings":[]}

## Result
- cycles: 1
- cycles_with_issues: 0
- final_ok: true
