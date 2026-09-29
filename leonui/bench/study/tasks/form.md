# Task: signup form with validation

Build a single HTML page: a signup form with inline validation.

## Required UI

- An `<h1>` with the exact text `Sign up`.
- A `<form>` (bypass native browser validation — `novalidate` or equivalent) containing three text fields, all `type="text"`:
  - labeled `Name`, `<input name="name">`
  - labeled `Email`, `<input name="email">`
  - labeled `Age`, `<input name="age">` (optional field)
- A submit button with the exact label `Sign up`.

## Validation (on submit)

- Empty name → show exactly `Name is required`.
- Email that is empty, or that does not contain both `@` and `.`, → show exactly `Enter a valid email`.
- Age that is present but not an integer in 1..120 → show exactly `Age must be 1-120`. (`300`, `abc`, and `12.5` are all invalid; an empty age is valid.)
- Each error message renders next to (or under) its own field, and only invalid fields show errors.
- A valid submit (name non-empty, email valid, age empty or valid) renders exactly `Welcome, {name}!` where `{name}` is the entered name.

## Notes

- The grader fills fields by their `name` attribute (set value + dispatch `input`), submits with `form.requestSubmit()`, and checks rendered text.
- Error and success text must be real DOM text that appears and disappears with state.
