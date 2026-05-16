# TODO

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
