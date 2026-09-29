# Task: tabs

Build a single HTML page: a three-tab section.

## Required UI

- An `<h1>` with the exact text `Plans`.
- Three tab controls (buttons with `role="tab"`, optionally inside a `role="tablist"`) labeled exactly `Overview`, `Details`, `Pricing`.
- Three panels (`role="tabpanel"`) with exactly this copy, one per tab:
  - Overview → `The starter plan includes every core feature.`
  - Details → `Billing is monthly and you can cancel anytime.`
  - Pricing → `The starter plan costs nine dollars per month.`

## Required behavior

- On load, `Overview` is the active tab: its panel is visible, the other two panels are not visible.
- The active tab has attribute `aria-selected="true"`; inactive tabs have `aria-selected="false"`.
- Clicking a tab makes it active: only its panel is visible, and every tab's `aria-selected` reflects the new active tab.
- Switching is instant: ~150 ms after the click, a `checkVisibility()` probe must already see the new state. No entrance animation on the panels.

## Notes

- The grader finds tabs by their exact label text and panels by their exact sentence, then probes visibility.
