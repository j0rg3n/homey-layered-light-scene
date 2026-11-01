# LayeredLight

Homey Pro app. The app itself lives in `com.fabeljet.layeredlight/` — run every command below
from that directory. `stable/com.fabeljet.layeredlight/` is the rollback baseline.

See `AGENTS.md` for the development process (docs-before-code, test coverage targets).

## Before every deployment

**Never deploy without a green build and a review.** `homey app run -r` and `homey app install`
push to the physical Homey, where a broken build costs a rollback and a house full of wrong
lights. Run the `/deploy` skill first: it covers build verification, diff review, the deploy
command, and rollback.

## Work tracking

Open work items are tracked as **GitHub Issues** on this repository. `TODO.md` retains completed
items as a historical record; new work items go to GitHub.

- Before writing code for a bug or feature: create or update the relevant issue, and update
  `SPEC.md` if observable behaviour changes.
- The issue body is the authoritative description of root cause, affected files, and checklist.

## Lint baseline

`npm run lint` currently reports pre-existing errors, almost all in `settings/main.js` (browser
JS that predates the Homey eslint config). Treat the gate as **no new problems in the files you
touched**, not a clean global run:

```bash
npx eslint <files you changed>   # this must be clean
```

The TypeScript sources report only known warnings (`no-console`, `homey-app/global-timers`).

## Build layout

- `tsconfig.json` is what the Homey CLI compiles with. It excludes tests, coverage and tool
  configs so they are not shipped in the app package — keep it that way.
- `tsconfig.eslint.json` is the inclusive project used by eslint, so test files are still
  type-aware-linted.
- Jest ignores `.homeybuild/` (compiled output) and `*.pw.test.js` (Playwright specs run under
  `npm run test:e2e`).
