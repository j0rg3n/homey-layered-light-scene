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

## Fix: settings-page preview ignores temperature (bug)

Selecting a light in the scene helper and moving the **Temp** slider did nothing on the device.
Three separate defects, any one of which is enough to produce that:

1. **`light_mode` is never sent.** Homey lights with both colour and white use the `light_mode`
   capability (`'color'` | `'temperature'`) to choose which axis is live. `postPreview` in
   `api.js` sends `light_temperature` without ever setting `light_mode`, so a lamp sitting in
   colour mode discards the temperature command.

2. **Colour and temperature are sent together.** `onDeviceToggle` in `settings/main.js` seeds
   `hue`, `sat` *and* `temp` for a device that has both capabilities, and `postPreview` then
   sends all of them in one batch. Even with the mode set, the colour values fight the
   temperature value.

3. **`buildSceneString` silently prefers colour.** In `settings/scene-builder.js` the
   `hue !== undefined && sat !== undefined` branch precedes the `temp` branch, so for a
   colour-capable device the exported string is always an `h`-token and the temperature the
   user set never reaches the scene string either.

The failure was invisible as well as ineffective: `sendPreview` calls
`Homey.api('POST', '/preview', body, function () {})` with an empty callback, and `postPreview`
logs nothing, so neither the page nor the app log showed anything at all.

See SPEC.md § Scene Helper UI → Preview for the intended behaviour.

- [ ] `api.js`: report `hasMode` from `getDevices`; in `postPreview` send `light_mode` first
      (only when the device has it), then colour or temperature, then dim, then onoff
- [ ] `api.js`: log the preview request and any capability failure; throw so the page sees it
- [ ] `settings/main.js`: colour/white selector on cards for devices with both capabilities;
      state carries `colorMode` and only that mode's values
- [ ] `settings/main.js`: surface preview errors via `showStatus`
- [ ] `settings/scene-builder.js`: honour `colorMode` instead of preferring colour by accident
- [ ] `parseToken`: set `colorMode` from the token shape when loading an existing variable
- [ ] Tests for `buildSceneString` with `colorMode`, both modes and single-capability devices

### Same root cause in the engine (not yet fixed)

`LightController.applySimpleSetting` has the identical `light_mode` gap: the `[l, t]` branch
sets `dim` + `light_temperature` and the `[h, s, l]` branch sets hue/saturation, neither ever
setting `light_mode`. On a colour+white lamp, a scene's 4-digit dim+temperature token is
therefore ignored whenever the lamp happens to be in colour mode — and `applyPrioritizedFade`
has the same hole. Kept separate from the preview fix because it changes device behaviour for
every scene and can only be verified on the device.

- [ ] `LightController`: set `light_mode` before the colour/temperature values in
      `applySimpleSetting` and `applyPrioritizedFade`, guarded on the capability existing
- [ ] Never send `light_mode` with a duration (it is an enum, like `onoff`)
- [ ] Tests asserting `light_mode` precedes hue/sat and temperature, and carries no duration

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
