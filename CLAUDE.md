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

## Synthetic data only

**No real people, places, events, or household data in anything committed** — tests, fixtures,
docs, comments, examples, issues, PRs, commit messages. This repo's author has a real Homey,
and device lists, zone/room names, variable names, UUIDs, and dumps from it are exactly what
leaks.

- Use invented, generic names: `Kitchen Counter`, `Ceiling Light`, `Living Room`, `Alice`.
  Never a real family member's name or initials, a real room layout, or a real device list.
- Never commit Homey dumps (flow card exports, device/zone/variable listings) or their IDs.
  Hand-write minimal fixtures instead.
- No absolute home paths (`/home/<user>/`, `C:\Users\<user>\`), personal emails, IPs, or
  coordinates. Use relative paths and placeholders. The `author` in `app.json` is the one
  deliberate exception.
- Exception: a name the code must match at runtime (e.g. a Homey variable the app reads) is
  functional, not an example. Keep it, but make it configurable or flag it in the issue
  rather than copying it into docs and tests.

Check added lines before committing or opening a PR (heuristic: it catches identifiers, not
names, so also read the diff for real-looking names):

```bash
git diff -U0 origin/master | grep -E '^\+' | grep -nE \
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|/home/[a-z]|C:\\Users|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'
```

Any hit needs a reason or a fix. `/deploy` and `/feature-work` both run this check.

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
