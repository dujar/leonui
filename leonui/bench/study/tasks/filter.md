# Task: filter list

Build a single HTML page: a searchable product catalog.

## Data (embed in the page as static data, exact strings)

Aluminum Tee · Bamboo Desk Mat · Copper Kettle · Desk Cable Tray · Ergo Footrest · Felt Organizer · Gel Wrist Rest · Hub Adapter Pro · Ink Roller Pen · Jute Storage Bin

(10 products; keep the strings character-for-character, including capitalization.)

## Required UI

- An `<h1>` with the exact text `Catalog`.
- A text input with the exact placeholder `Search products`.
- All 10 product names rendered as list rows somewhere in the page (any container structure you like).

## Required behavior

- Typing in the input filters the list live (on the `input` event, no button).
- Matching is a case-insensitive substring match on the product name (`desk` and `DESK` both match `Bamboo Desk Mat`).
- Products that do not match the current query must be not-visible (display:none, the `hidden` attribute, or removal from the DOM all satisfy this). Matching products stay visible.
- With an empty input, all 10 products are visible.
- There is deliberately no count line and no empty-state message in this task — live filtering is the whole task.

## Notes

- The grader sets the input's value, dispatches an `input` event, waits ~150 ms, and probes each product name's visibility with `checkVisibility()`. A row removed from the DOM counts as not-visible.
