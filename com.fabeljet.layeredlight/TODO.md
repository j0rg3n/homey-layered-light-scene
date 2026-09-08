# TODO

## Fix: responsiveness under rapid flow-card triggering (bug — **HIGH PRIORITY**)

**Blocking several applications of the app in daily use.** Rapid repeated triggering (family
pressing buttons because a scene doesn't apply fast enough) makes the engine stop responding
entirely for up to a minute, which provokes more presses.

Four independent causes, all in the trigger → tick → device path:

1. **The flow card awaits persistence.** `CardHandler.handleApplyScene` awaits
   `getSceneStack()` and `setSceneStack()` (Homey settings I/O) before returning, so the card
   run listener stays open long after the in-memory scene is already applied.

2. **Two Homey API round-trips per tick.** `LightEngine.tick` calls
   `sceneProvider.getScenePriorities()` (variable read) and
   `LightController.applySceneInfo` calls `deviceProvider.getDevices()` — both on every tick,
   including every heartbeat and every animation tick.

3. **Ticks are not serialized — lost update on `lastAppliedScene`.** `setLayerScene` fires
   `tick()` un-awaited, and the heartbeat and animation timers fire independently. Concurrent
   ticks each read `this.lastAppliedScene` (`light-engine.ts:156`) and write it after their
   awaits (`light-engine.ts:175`). A late-finishing tick overwrites a newer one, after which
   `getChanges` returns `{}` and the engine goes silent until an unrelated change perturbs it.
   This is the "needs to rest for a minute" symptom.

4. **No supersession.** Ten presses fan out ten full command sets to a device that Homey
   serializes internally, so the queue drains at device speed while newer targets wait behind
   obsolete ones.

Affected files: `light-engine.ts`, `card-handler.ts`, `light-controller.ts`, `interfaces.ts`.

See SPEC.md § Responsiveness and Concurrency for the normative guarantees.

- [x] Single-flight tick in `LightEngine`: at most one tick executing, at most one pending;
      a new request while one is pending replaces the pending one rather than queueing
- [x] Make `lastAppliedScene` / `currentLightValues` updates safe under the single-flight
      model (write only from the tick that owns the flight; no read-modify-write across await)
- [x] Cache scene priorities in `LightEngine`, refreshed on heartbeat, with a miss-driven
      refetch when a layer name is absent from the cached list
- [x] Cache the device list in `LightController` (plus a name index), refreshed on heartbeat
- [x] `CardHandler.handleApplyScene`: apply in-memory + return; persist without awaiting,
      with failures logged rather than surfaced to the card
- [x] Tests: N rapid `handleApplyScene` calls converge on the last scene; concurrent ticks
      never leave `lastAppliedScene` stale; priorities/devices fetched once per burst
- [ ] Per-device supersession in `LightController`: a newer target for a light drops any
      not-yet-sent commands for that light instead of queueing behind them — deferred until
      device testing shows whether the above is already enough
- [ ] **Verify on device**: rapid repeated triggering, a layer newly added to
      `Grenser: Sceneprioritet`, and a renamed light

---

## Fix: settings-page preview never reached the device (bug)

Moving any slider in the scene helper did nothing. `postPreview` in `api.js` calls
`homey.app.homeyApi.devices.getDeviceById({ id: deviceId })`, and **there is no such method**:
the HomeyAPIV3Local specification
(`node_modules/homey-api/assets/specifications/HomeyAPIV3Local.json`) gives `ManagerDevices`
exactly one `getOne` operation, `getDevice -> get /device/:id`. So preview has been broken for
every axis since the settings page was written (`b6e2d7e`), not just for temperature.

It went unnoticed because the failure was silent at both ends: `sendPreview` passes an empty
callback to `Homey.api`, and `postPreview` logs nothing, so a rejected call looked exactly like
an unresponsive lamp. Confirmed by running `homey app run -r` while adjusting a slider — the
app log recorded nothing at all.

Do not conflate this with the flow-card path, which works: `LightController` resolves devices
through `deviceProvider.getDevices()`, a different operation that does exist.

See SPEC.md § Scene Helper UI → Preview.

- [x] `api.js`: `getDeviceById` → `getDevice({ id })`
- [x] `api.js`: log the request, the resolved device, each capability set, and any failure;
      throw on failure so the caller sees it
- [x] `settings/main.js`: surface preview errors via `showStatus` instead of swallowing them
- [x] Verify on device: temperature adjustment and variable loading both confirmed working
      (2026-09-08)

### Fix: loading a variable drops every device whose name contains a space

Loading `Scene: Kj Arbeid` restored 2 of 5 lights. `parseSceneStringIntoState` in
`settings/main.js` splits the scene string on whitespace (`sceneStr.trim().split(/\s+/)`),
but the canonical grammar allows spaces in device names: `SceneManager.getSceneFromString`
splits on `:`, takes the first non-space run as the value, and treats **the rest of the run
up to the next colon as the next light's name**. So `Kjøkkenbenk Ytre:ff80` becomes
`Kjøkkenbenk` (no colon — skipped) and `Ytre:ff80` (unknown device — skipped), and only
single-word device names survive.

Writing is unaffected: `buildSceneString` emits `Name:token` joined by single spaces, which the
engine parses correctly. Only the settings page's own reader is wrong, so a scene written by
the page cannot be loaded back into it.

- [x] Move the parse into `settings/scene-builder.js` as `parseSceneString`, ported from
      `SceneManager.getSceneFromString` so the page and the engine cannot disagree
- [x] `parseSceneStringIntoState` uses it
- [x] Unit tests: names with spaces, several entries, `off` / `null` tokens, trailing spaces
- [x] E2E: a fixture device whose name contains a space round-trips through load

### Deferred: does `light_mode` matter?

A colour+white lamp uses Homey's `light_mode` capability (`'color'` | `'temperature'`) to pick
which axis it applies, and neither `postPreview` nor `LightController` ever sets it. A first
attempt at fixing preview assumed this was the cause and was reverted (842a717 / a7d8271): it
was built on the untested assumption that the call reached the device at all, which it did not.
Re-open only with device evidence — get preview working first, then check whether the
temperature slider moves a lamp that is currently in colour mode.

- [ ] Determine on device whether temperature is applied without `light_mode` being set
- [ ] If it is not: set `light_mode` before the colour/temperature values in both `api.js` and
      `LightController` (`applySimpleSetting`, `applyPrioritizedFade`), never with a duration

---

## Fix: "Copy to clipboard" reports "Copy failed" (bug)

`onCopy` in `settings/main.js` calls `navigator.clipboard.writeText`, whose promise rejects and
lands in a `.catch` that discards the error and shows the bare string `Copy failed`.

Most likely cause: the settings page runs inside Homey's iframe, and the async Clipboard API is
gated by the `clipboard-write` Permissions Policy — which the embedding iframe has to grant
via `allow="clipboard-write"`. A page that cannot control its own embedding cannot rely on it,
and the rejection is a `NotAllowedError` rather than anything the page did wrong. (A
non-secure context would do the same, but Homey serves the settings page over https.)

Confirm before fixing: the `.catch` throws away the only evidence, so log the rejection first
(`dbg(String(err))` plus `err.name`) and read it off the device — the same
swallowed-error pattern that hid the preview defect.

Then fix by not depending on the async API alone:

- [ ] Log the rejection name and message before deciding anything
- [ ] Fall back to a hidden `<textarea>` + `document.execCommand('copy')` when
      `writeText` rejects — deprecated, but it is synchronous, needs no Permissions Policy and
      works inside an iframe
- [ ] If both fail, select the text in `#scene-output` and tell the user to press Ctrl+C,
      rather than reporting a dead end
- [ ] Report the actual reason in the status line instead of a bare "Copy failed"
- [ ] E2E: assert the fallback path runs when `navigator.clipboard.writeText` is stubbed to
      reject (the Playwright harness can stub it directly)

---

## Clean up the lint baseline (**SECOND PRIORITY** — after the current functionality pass)

`npm run lint` cannot be used as a pass/fail gate today: it reports ~379 problems, so a real
regression is invisible in the noise. CLAUDE.md therefore states the weaker gate — *no new
problems in the files you touched* — which depends on whoever is working remembering to scope
the command by hand.

Distribution of the problems:

| File | Count | Nature |
| ---- | ----- | ------ |
| `settings/main.js` | ~287 | Browser JS predating the Homey eslint config: `no-var`, `vars-on-top`, `no-undef`, `brace-style` |
| `settings/main.pw.test.js` | ~53 | Playwright spec: implicit `any`, `window` property access |
| `settings/scene-builder.test.js` | ~39 | Same class as above |
| `light-engine.test.ts` | ~15 | `any` casts in the existing animation tests, one unused variable |
| TypeScript sources | 7 | Warnings only — `no-console`, `homey-app/global-timers` |

About 185 are auto-fixable. Do this **after** the animation and responsiveness work lands, not
before: `--fix` across `settings/main.js` touches the whole settings page, and reviewing that
diff on top of in-flight functionality changes is how real bugs get waved through.

- [ ] `npm run lint -- --fix`, then review the diff file by file (not as one blob)
- [ ] Hand-fix the remainder in `settings/main.js` — `no-undef` there usually means a genuinely
      missing `/* global */` declaration or a real typo, so read each one
- [ ] Type the Playwright and settings test files enough to satisfy the config, or scope an
      eslint override to them with a comment saying why
- [ ] Replace the `any` casts in `light-engine.test.ts` with typed mock helpers
- [ ] Decide on the two TypeScript warning classes: silence `no-console` app-wide via a logger,
      or accept them as warnings forever and say so in CLAUDE.md
- [ ] Once clean: promote `npm run lint` to a hard gate in CLAUDE.md § Before every deployment
      and delete the "lint baseline" section

---

## Fix: stepped animations never loop or advance (bug)

Reported program: `Luftballong:h00ffff|5s|h0000ff|5s|ha0ffff|5s|`
Observed: white, then blue after ~30 s, then no further changes.

Two defects, both required to explain the observation:

1. **Hold binds to the following keyframe instead of the preceding one.** In
   `SceneManager.parseLightValue` a pending `|d|` duration is written as `holdMs` on the
   *next* keyframe. So `h00ffff` gets a zero-length segment: `evalSegmentInfo` computes
   `segmentEnd === cursor` and skips it entirely, making `h0000ff` (saturation 0 → white)
   the first visible value. The trailing `|5s|` then overwrites the last keyframe's existing
   `holdMs` rather than contributing a loop-back hold.

2. **Step segments never schedule a wake-up.** `LightEngine.scheduleAnimationTick` inspects
   only `info.transition`, which `evalSegmentInfo` sets to `null` for step transitions and
   hold segments. Its comment claims it "handles hold segments too" — it does not. A purely
   stepped animation therefore only advances on the 30 s heartbeat, and 30 s aliases against
   the 10 s loop period so every heartbeat samples the same phase.

Affected: `scene-manager.ts` (`parseLightValue`, `evalSegmentInfo`, `SegmentInfo`),
`light-engine.ts` (`scheduleAnimationTick`).

See SPEC.md § Hold and Loop Semantics for the normative timeline.

- [ ] `parseLightValue`: `|d|` sets `holdMs` on the keyframe *before* it
- [ ] Trailing `|d|` holds the final keyframe for `d` before wrapping, without clobbering an
      already-assigned `holdMs`
- [ ] `SegmentInfo` carries the time remaining in the current segment even when
      `transition === null` (add e.g. `segmentEndsInMs`)
- [ ] `scheduleAnimationTick` uses that value, so step/hold boundaries wake the engine
- [ ] Regression test: the reported program shows red → white → blue at 0/5/10 s and wraps

---

## Animation test harness

The two bugs above both survived the unit suite because animation tests assert single-tick
command shapes at hand-picked timestamps. Nothing drives an animation across several
segments, across a loop boundary, or with an animation on more than one layer.

See SPEC.md § Animation Test Harness for the contract.

- [ ] Virtual-clock harness: run a scene string for N virtual seconds against a fake device
      that records an ordered `(t, capabilityId, value, duration)` command log
- [ ] Assert against the whole log — order, absence, and timing — not just presence
- [ ] Table-driven cases covering every grammar form: `/d/` linear, `|d|` step, trailing
      separator loop-back, non-looping tails, mixed-width keyframes
- [ ] Loop cases: wrap-around correctness, phase after several periods, re-assignment
      mid-loop
- [ ] Layered-animation cases: animation over animation, animation under a static layer,
      `null` passthrough from an animated layer to the layer below

---

## Evaluate: port to Python (deferred)

Homey now supports Python apps ([SDK docs](https://apps.developer.homey.app/the-basics/app#python-1)).

Recorded as an evaluation item, not a commitment. A port would discard the TypeScript engine,
the Jest suite, and the device-verified quirk handling in `LightController` (capability
ordering, IKEA minimum-dim floor, `onoff`-with-duration). Revisit only if the Python SDK
offers something the TS SDK cannot — no such need is known today.

- [ ] Decide keep-TS vs. port, and record the reason here

---

## ~~Native HSV color format~~ ✓

**Add `h`-prefix HSV token to the scene string grammar**

Implemented: tokenizer and `parseSimpleValue` in `scene-manager.ts` recognise
`h[0-9a-fA-F]{6}` and return `[h, s, v]` directly. RGB backward compat preserved.
Refactoring helper and scene helper UI updates deferred (those features don't exist yet).

- [x] Add `h`-token branch to the tokenizer regex in `SceneManager.parseLightValue`
- [x] `parseSimpleValue` returns `[h, s, v]` bypassing `getHueSaturationLightnessFromRgb`
- [x] Type-promotion for mixed keyframes handled by existing `padToWidth`
- [x] Keep bare 6-char RGB for backward compat
- [ ] Update refactoring helper (deferred — helper not yet built)
- [ ] Update scene helper UI (deferred — UI not yet built)

---

## Scene helper UI

A settings page (or dedicated flow card) for composing scene strings without hand-editing hex
values. See SPEC.md for the full feature spec.

Implementation on `feat/scene-builder-module` (PR #1, merged): backend API routes,
scene-builder.js module, HTML/CSS, and JS controller are all in. Unit tests pass (232).
**No E2E test has run yet** — blocked by the SDK v3 API registration bug below.

### Fix: SDK v3 settings page API registration (bug — app crashes on startup)

`homey app run -r` crashes: `managerApi.registerApiHandler is not a function`.

Homey SDK v3 does not support dynamic handler registration in `onInit()`. Routes must be
declared in the manifest and implemented in a standalone module.

Affected files:
- `app.ts` — remove all `managerApi.registerApiHandler(...)` calls
- `.homeycompose/app.json` — add `"api"` block declaring the 4 routes; add `"homey:manager:api"` permission
- `settings/api.js` (new) — export `getDevices`, `getVariables`, `postVariable`, `postPreview` handler functions

See SPEC.md § Settings Page API for the handler signatures.

- [x] Remove `registerApiHandler` calls from `app.ts`
- [x] Declare routes in `.homeycompose/app.json`
- [x] Create `settings/api.js` with the 4 exported handlers
- [x] Verify `homey app run -r` starts without crash

### Fix: settings page never becomes visible (bug — spinner stuck)

Two issues discovered during E2E testing:

1. **`api.js` wrong location** — file is at `settings/api.js` but SDK v3 requires it at the
   app root (`api.js`). Move and delete the old file.

2. **`Homey.ready()` inverted** — settings page is hidden by Homey until the page calls
   `Homey.ready()` (no args). The correct entry point is `function onHomeyReady(Homey)`
   (called by Homey SDK). Inside, fetch data, then call `Homey.ready()` to reveal the page.
   Current code treats it as an event listener, so the page never shows.

Affected files:
- `settings/api.js` → move to `api.js` (app root)
- `settings/main.js` — replace `Homey.ready(fn)` block with `onHomeyReady(Homey)` function

- [x] Move `settings/api.js` to `api.js`
- [x] Fix `main.js` to use `onHomeyReady(Homey)` + call `Homey.ready()` immediately
- [x] Add `<script src="/homey.js" data-origin="settings">` to index.html `<head>` — without
      this the Homey SDK never loads, `onHomeyReady` is never called, page stays on spinner

---

## Refactoring helper

A settings page tool that validates existing scene strings against the live device list and
capability set. See SPEC.md for the full feature spec.

---

## ~~Parser strictness~~ ✓

**Make `parseLightValue` reject bare separators**

Implemented: tokenizer and token-processing loop in `parseLightValue` now throw on
bare `/` or `|` (without duration). Valid forms `/<duration>/` and `|<duration>|`
are unaffected.

- [x] Tokenizer throws on bare `/` or `|`
- [x] Token-processing safety guard throws on bare separator tokens

---

## Configurable variable names

**Replace hardcoded Homey variable names with app settings**

The app currently looks up variables by hardcoded names (e.g. `"Grenser: Sceneprioritet"`).
These should be configurable in Homey app settings so users can name their variables freely.

Affected: `SceneProvider` (wherever `getScenePriorities` and `getSceneArrangement` resolve
the variable name). Add a setting key (e.g. `priorityVariableName`) with the current string
as default so existing installs are unaffected.
