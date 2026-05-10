# TODO

## Configurable variable names

**Replace hardcoded Homey variable names with app settings**

The app currently looks up variables by hardcoded names (e.g. `"Grenser: Sceneprioritet"`).
These should be configurable in Homey app settings so users can name their variables freely.

Affected: `SceneProvider` (wherever `getScenePriorities` and `getSceneArrangement` resolve
the variable name). Add a setting key (e.g. `priorityVariableName`) with the current string
as default so existing installs are unaffected.

---

## Scene helper UI

A settings page (or dedicated flow card) for composing scene strings without hand-editing hex
values. See SPEC.md for the full feature spec.

---

## Refactoring helper

A settings page tool that validates existing scene strings against the live device list and
capability set. See SPEC.md for the full feature spec.

---

## Native HSV color format

**Add `h`-prefix HSV token to the scene string grammar**

Replaces the lossy RGB round-trip for color values. Token: `h[0-9a-fA-F]{6}` encoding
hue (0°–360°), saturation (0–1), and dim/value (0–1) as three bytes — maps directly to
Homey capabilities with no conversion. See SPEC.md for the full spec.

- Add `h`-token branch to the tokenizer regex in `SceneManager.parseLightValue`
  (`scene-manager.ts`); parse as `[h, s, v]` triple, store as `SettingValue` length-3
  array (same shape as existing RGB path, but bypass `getHueSaturationLightnessFromRgb`)
- Update `applySimpleSetting` / `applyPrioritizedFade` in `light-controller.ts`: existing
  code already works in H/S/dim space, so the only change is skipping the RGB conversion
- Update type-promotion logic in interpolation for mixed `h`-token + DT or RGB keyframes
  (see SPEC.md)
- Update refactoring helper to flag bare 6-char RGB tokens and suggest `h`-prefix rewrites
- Update scene helper UI to emit `h`-prefix tokens by default
- Keep bare 6-char RGB for backward compat

---

## Parser strictness

**Make `parseLightValue` reject bare separators**

The grammar defines only two valid transition forms:
- `/<duration>/` — linear fade
- `|<duration>|` — step/hold

The parser currently accepts bare `/` and `|` tokens (without duration) silently,
treating them as no-ops. These were never intended to be valid. The parser should
reject them with a parse error instead.

Affected code: `SceneManager.parseLightValue` in `scene-manager.ts`, tokenizer loop
and token-processing loop. The `sepWithDurMatch` already requires a duration and
both delimiters; the fallback single-char match (`remaining[0] === '/'`) is what
allows bare separators through.
