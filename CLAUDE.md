# LayeredLight

Homey Pro app. The app itself lives in `com.fabeljet.layeredlight/` — run every command below
from that directory. `stable/com.fabeljet.layeredlight/` is the rollback baseline.

See `AGENTS.md` for the development process (docs-before-code, test coverage targets).

## Before every deployment

**Never deploy without a green build and a review.** `homey app run -r` and `homey app install`
push to the physical Homey, where a broken build costs a rollback and a house full of wrong
lights. Run all of this first, from `com.fabeljet.layeredlight/`:

```bash
npm run build     # tsc — must exit 0
npm test          # jest — all suites must pass
npm run lint      # see the note on the lint baseline below
homey app build   # what the CLI actually runs on deploy: compile + validate
```

`homey app build` is not optional: it runs the manifest pre-processing and validation that
plain `tsc` does not, so it catches app.json and flow-card problems that the other three miss.

Then **review the diff** before pushing to the device:

- Read `git diff` in full — not just the files you remember touching.
- Check the change against `SPEC.md` and the relevant `TODO.md` entry. If behaviour changed
  and the spec did not, fix that first (see AGENTS.md § Before fixing bugs).
- Confirm new behaviour has tests that would fail without the change.
- Note anything that can only be verified on the device, and re-run the relevant part of
  `TEST_PLAN.md` after deploying.

Deploy with `homey app run -r` (deploys **and** streams logs). Plain `homey app run` does not
deploy to the device. Rollback: `cd stable/com.fabeljet.layeredlight && homey app install`.

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
