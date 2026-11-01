---
name: deploy
description: Run the full pre-deployment checklist for LayeredLight and push to the physical Homey. Use before any `homey app run -r` or `homey app install` call.
---

# Deploy LayeredLight

**Never push to the physical Homey without a green build and a review.** A broken deploy costs
a rollback and a house full of wrong lights.

## Step 1 — Build and verify

Run all of the following from `com.fabeljet.layeredlight/`. Every command must succeed before
moving on.

```bash
npm run build                        # tsc — must exit 0
npm test                             # jest — all suites must pass
npx eslint <files you changed>       # no new problems in touched files
homey app build                      # manifest pre-processing + validation
homey app validate --level publish   # the only check that verifies file references in app.json
```

Why `homey app build` is not optional: it runs the manifest pre-processing and validation that
plain `tsc` does not. It catches `app.json` and flow-card problems the other three miss.

Why `validate --level publish` is not optional: `build` and `install` validate at level `debug`,
which does **not** check that files named in `app.json` actually exist. A missing image passes
every local step and then fails on the device with a bare `✖ Missing File` after upload.
Publish level catches it. Expect one standing complaint (`brandColor` required only for store
publication); anything beyond that is a real problem.

## Step 2 — Review the diff

```bash
git diff
```

- Read the diff in full — not just the files you remember touching.
- Check the change against `SPEC.md` and the relevant GitHub issue. If behaviour changed and
  the spec did not, update the spec first (see AGENTS.md § Before fixing bugs).
- Confirm new behaviour has tests that would fail without the change.
- Note anything that can only be verified on the device; you'll re-run that part of
  `TEST_PLAN.md` after deploying.

## Step 3 — Deploy

```bash
# from com.fabeljet.layeredlight/
homey app run -r
```

`-r` is required. Plain `homey app run` does **not** deploy to the device.

## Rollback

```bash
# from com.fabeljet.layeredlight/ (stable/ lives at the repo root)
cd ../stable/com.fabeljet.layeredlight && homey app install
```
