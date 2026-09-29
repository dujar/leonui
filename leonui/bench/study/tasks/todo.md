# Task: todo list

Build a single HTML page: a small todo list.

## Required UI

- An `<h1>` with the exact text `Todo`.
- A text input with the exact placeholder `What needs doing?`.
- A button with the exact label `Add`.
- A status line whose rendered text is exactly `{n} left`, where `{n}` is the number of items not yet done. It reads `0 left` when the list is empty and updates after every change.

## Required behavior

- Clicking `Add` appends the input's current value as a new not-done item and clears the input. If the input is empty, clicking `Add` does nothing: no empty row, status line unchanged.
- Each item renders as one row containing: a checkbox, the item's title text, and a button with the exact label `Remove`.
- Ticking a row's checkbox marks it done: the title gets a line-through (CSS `text-decoration-line: line-through` on the title text element) and the status count decreases by one. Unticking restores both.
- Clicking a row's `Remove` deletes that row; the status count updates accordingly (removing a not-done item decreases the count; removing a done item does not).
- No persistence is required. A page reload starts empty.

## Notes

- The grader uses these item titles: `alpha task`, `beta task`, `gamma task` — entered verbatim through the input.
- The grader fills the input by setting its value and dispatching an `input` event, clicks buttons with `.click()`, and reads rendered text and computed styles. All text must be real DOM text.
