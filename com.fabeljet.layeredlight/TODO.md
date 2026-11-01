# TODO — Completed Items Archive

Open work items are tracked in [GitHub Issues](https://github.com/j0rg3n/homey-layered-light-scene/issues).
This file retains completed items as a historical record.

---

## Fix: responsiveness under rapid flow-card triggering

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

> Remaining open items → [GitHub Issues](https://github.com/j0rg3n/homey-layered-light-scene/issues)

---

## Fix: settings-page preview never reached the device

- [x] `api.js`: `getDeviceById` → `getDevice({ id })`
- [x] `api.js`: log the request, the resolved device, each capability set, and any failure;
      throw on failure so the caller sees it
- [x] `settings/main.js`: surface preview errors via `showStatus` instead of swallowing them
- [x] Verify on device: temperature adjustment and variable loading both confirmed working
      (2026-09-08)

### Fix: loading a variable drops every device whose name contains a space

- [x] Move the parse into `settings/scene-builder.js` as `parseSceneString`, ported from
      `SceneManager.getSceneFromString` so the page and the engine cannot disagree
- [x] `parseSceneStringIntoState` uses it
- [x] Unit tests: names with spaces, several entries, `off` / `null` tokens, trailing spaces
- [x] E2E: a fixture device whose name contains a space round-trips through load

### Deferred: does `light_mode` matter?

> Open items → [GitHub Issues](https://github.com/j0rg3n/homey-layered-light-scene/issues)

---

## Fix: "Copy to clipboard" reports "Copy failed"

> All items open → [GitHub Issues](https://github.com/j0rg3n/homey-layered-light-scene/issues)

---

## Fix: stepped animations never loop or advance

> All items open → [GitHub Issues #2](https://github.com/j0rg3n/homey-layered-light-scene/issues/2)

---

## Clean up the lint baseline

> All items open → [GitHub Issues](https://github.com/j0rg3n/homey-layered-light-scene/issues)

---

## ~~Native HSV color format~~ ✓

**Add `h`-prefix HSV token to the scene string grammar**

Implemented: tokenizer and `parseSimpleValue` in `scene-manager.ts` recognise
`h[0-9a-fA-F]{6}` and return `[h, s, v]` directly. RGB backward compat preserved.

- [x] Add `h`-token branch to the tokenizer regex in `SceneManager.parseLightValue`
- [x] `parseSimpleValue` returns `[h, s, v]` bypassing `getHueSaturationLightnessFromRgb`
- [x] Type-promotion for mixed keyframes handled by existing `padToWidth`
- [x] Keep bare 6-char RGB for backward compat
- [ ] Update refactoring helper (deferred — helper not yet built → GitHub Issues)
- [ ] Update scene helper UI (deferred — UI not yet built → GitHub Issues)

---

## Scene helper UI

Implementation on `feat/scene-builder-module` (PR #1, merged): backend API routes,
scene-builder.js module, HTML/CSS, and JS controller are all in. Unit tests pass (232).

### Fix: SDK v3 settings page API registration

- [x] Remove `registerApiHandler` calls from `app.ts`
- [x] Declare routes in `.homeycompose/app.json`
- [x] Create `settings/api.js` with the 4 exported handlers
- [x] Verify `homey app run -r` starts without crash

### Fix: settings page never becomes visible

- [x] Move `settings/api.js` to `api.js`
- [x] Fix `main.js` to use `onHomeyReady(Homey)` + call `Homey.ready()` immediately
- [x] Add `<script src="/homey.js" data-origin="settings">` to index.html `<head>`

> E2E tests → [GitHub Issues](https://github.com/j0rg3n/homey-layered-light-scene/issues)

---

## ~~Parser strictness~~ ✓

**Make `parseLightValue` reject bare separators**

Implemented: tokenizer and token-processing loop in `parseLightValue` now throw on
bare `/` or `|` (without duration). Valid forms `/<duration>/` and `|<duration>|`
are unaffected.

- [x] Tokenizer throws on bare `/` or `|`
- [x] Token-processing safety guard throws on bare separator tokens
