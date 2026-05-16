# Light Engine Specification

## Overview

Refactor the LightEngine to be timestamp-driven for unit testability, with proper layer semantics (null = inherit) and animation support.

**Reference**: See `KEYFRAME_DESIGN.md` for the detailed design document.

## Core Principles

1. **Timestamp-driven**: All time-related operations accept a timestamp parameter
2. **Null = transparent**: A layer value of `null` means "inherit from lower priority layers"
3. **Engine is authoritative**: Engine stores current computed values for each light
4. **Homey handles fades**: Send target + duration to Homey API

## Architecture

See KEYFRAME_DESIGN.md Section 1 (Grammar) and Section 5 (Layer Flattening).

### Key Data Structures

- **Layer**: named collection of light assignments (pattern per light)
- **Pattern**: sequence of settings with transitions between them
- **Setting**: `octet{1,3}` | `on` | `off` | `null`
- **Transition**: `/duration` (linear) or `|duration` (step)

### Layer State

```typescript
interface LayerState {
  layerName: string;
  scene: Scene;           // parsed scene with animations
  setTimestamp: number;   // when this layer was set
}
```

## Engine State

```typescript
interface LightEngineState {
  layers: Map<string, LayerState>;                    // by layerName
  currentLightValues: Map<string, SettingValue>;     // last computed value per light
}
```

## Interface

```typescript
class LightEngine {
  async setLayer(layerName: string, sceneString: string, timestamp: number): Promise<void>;
  async clearLayer(layerName: string, timestamp: number): Promise<void>;
  async tick(timestamp: number): Promise<void>;
  getCurrentLightValues(): Map<string, SettingValue>;
  getLayerTimestamps(): Map<string, number>;
}
```

## Evaluation

See KEYFRAME_DESIGN.md Section 3 (Time Model & Keyframe Evaluation).

Key function: `eval(pattern, t_assign, t_now)` → setting value

- Finds active segment in animation timeline
- Handles looping (trailing transition)
- Interpolates between keyframes

## Layer Flattening

See KEYFRAME_DESIGN.md Section 5 (Layer Flattening).

Process layers in priority order (highest first):
1. Evaluate each layer at timestamp to get scene
2. For each light, find first non-null value (null passes through)
3. If all layers null, default to off

## Interpolation

See KEYFRAME_DESIGN.md Section 4 (Interpolation).

- Linear (`/`): `lerp(a, b, t) = a + (b - a) * t`
- Step (`|`): hold `s_from` until progress = 1.0
- Type promotion: brightness → brightness+temp → HSL
- Hue: shortest path around color wheel

## Output Commands

See KEYFRAME_DESIGN.md Section 6 (Output Command Generation).

For linear transitions:
1. Set current value immediately (duration=0)
2. Set target value with duration

For step transitions:
1. Set value at keyframe time

## Optimizer

See KEYFRAME_DESIGN.md Section 7 (Optimizer).

- Skip if known state matches (within epsilon)
- Skip if already transitioning to target
- Handle staleness

## Default Values

- Default light value = off
- Default brightness = 0

## Testability

- All timestamps passed as parameters
- No real-time dependencies
- Mock time for testing animations mid-transition

---

## Native HSV Color Format

### Motivation

The existing 6-char RGB hex token requires a round-trip through RGB color space, which:
- Loses white-spectrum temperature information (an RGB light set via `light_temperature` cannot round-trip through RGB hex)
- Forces perceptually unintuitive interpolation in animations (intermediate frames pass through grey)
- Doesn't match Homey's native capability space (`light_hue`, `light_saturation`, `dim`)

### Token Format

`h[0-9a-fA-F]{6}` — a literal `h` (not a valid hex digit, so unambiguous) followed by 6 hex digits encoding three bytes:

| Bytes | Capability | Mapping |
|-------|-----------|---------|
| `hh` | `light_hue` | 0x00–0xff → 0°–360° |
| `ss` | `light_saturation` | 0x00–0xff → 0.0–1.0 |
| `vv` | `dim` | 0x00–0xff → 0.0–1.0 |

Model: **HSV** (not HSL). `vv=ff` means full brightness at any hue/saturation; `vv=00` means off/black. This matches Homey's `dim` capability semantics — a fully-saturated color at `vv=ff` is the maximum-intensity version of that color.

### Examples

```
h00ffff   H=0°,   S=1.0,  dim=1.0  — full-brightness red
haaff ff  H=240°, S=1.0,  dim=1.0  — full-brightness blue
h102680   H=24°,  S=0.15, dim=0.5  — warm white tint at half brightness
h000080   H=any,  S=0,    dim=0.5  — neutral white at half brightness
```

### Interpolation

HSV-native tokens skip the RGB→HSL conversion step. The prioritized-axis fade already operates in H/S/dim space; HSV tokens feed directly into that path.

Type promotion for mixed-format interpolation:
- `h`-token + 2-char dim: promote dim to HSV with S=0 (neutral white at that brightness)
- `h`-token + 4-char DT: interpolate H/S/dim; temperature axis snaps at keyframe boundary (temperature has no perceptual meaning mid-fade into a saturated color)
- `h`-token + 6-char RGB: convert RGB keyframe to HSV, then interpolate in HSV space

### Backward Compatibility

Bare 6-char RGB hex tokens remain valid indefinitely. The refactoring helper flags them and suggests `h`-prefix equivalents. New scenes produced by the scene helper UI emit `h`-prefix tokens by default.

---

## Scene Helper UI

An interactive tool for composing scene strings without hand-editing hex values or animation
syntax. Delivered as either a Homey app settings page or a dashboard widget — decision
pending. Settings page is simpler to build; dashboard widget allows use alongside active
flows without leaving the home screen.

### Workflow

1. **Select scope** — pick a layer name from the scene priority list (or type a new one).
2. **Select devices** — choose one or more lights from the live Homey device list.
3. **Adjust values** — per device, set target brightness / color / on-off via sliders or
   color picker. Changes apply to the actual device in real time for live preview.
4. **Export** — produce a scene string (e.g. `Kitchen:ff Living Room:800000`) and either:
   - Copy to clipboard for pasting into a flow card argument, or
   - Write directly to a new or existing Homey string variable.

### Starting from an existing variable

When a Homey variable is selected as the starting point, the helper parses its current value
and pre-populates the device controls, so the user edits rather than starts from scratch.

### Constraints

- Only devices present in the live Homey device list are selectable.
- The generated string uses the canonical scene-string format (KEYFRAME_DESIGN.md §1).
- Animation keyframes are out of scope for v1; the helper targets static single-value scenes.

### Settings Page API

Homey SDK v3 requires routes to be declared in the app manifest (`"api"` block in
`.homeycompose/app.json`) and implemented in `settings/api.js` (a CommonJS module whose
exports match the manifest keys). Dynamic `registerApiHandler()` does not exist in SDK v3.

**Manifest declaration** (`.homeycompose/app.json`):
```json
"permissions": ["homey:manager:api"],
"api": {
  "getDevices":   { "method": "GET",  "path": "/devices"  },
  "getVariables": { "method": "GET",  "path": "/variables" },
  "postVariable": { "method": "POST", "path": "/variable"  },
  "postPreview":  { "method": "POST", "path": "/preview"   }
}
```

**Handler module** (`settings/api.js`):
```javascript
module.exports = {
  async getDevices({ homey }) { /* return [{id, name, caps}] */ },
  async getVariables({ homey }) { /* return [{id, name, value}] for string vars */ },
  async postVariable({ homey, body }) { /* body: {id, value} */ },
  async postPreview({ homey, body }) { /* body: {deviceId, dim?, hue?, sat?, temp?, onoff?} */ },
};
```

Each handler receives `{ homey, query, params, body }`. Access the app instance via
`homey.app`. Throw to return an error response; return a value to respond with 200 + JSON.

---

## Refactoring Helper

A validation tool for existing scene strings. Surfaces in Homey app settings.

### Inputs

- One or more Homey string variables (selected from a dropdown), **or**
- A raw scene string pasted into a text field.

### Checks

1. **Device name match** — each light name in the scene string is compared against the live
   Homey device list. Unknown names are flagged; close matches (edit-distance) are suggested
   as replacements.

2. **Capability match** — for each matched device, verify that the encoded value type is
   supported:
   - A 6-char hex (HSL) requires `light_hue` + `light_saturation` + `dim` capabilities.
   - A 4-char hex (dim + temperature) requires `dim` + `light_temperature`.
   - A 2-char hex or bare brightness requires `dim`.
   Mismatches are flagged with a suggested rewrite (e.g. downgrade 6-char to 2-char if device
   is brightness-only).

3. **Syntax** — full parse via `SceneManager.parseLightValue`; any parse errors are surfaced
   with the token position and a plain-language description.

### Output

A per-entry report (pass / warning / error) with inline suggested rewrites. A "fix all"
action applies non-ambiguous suggestions automatically and offers a copy/save of the
corrected string.