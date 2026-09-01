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

## Responsiveness and Concurrency

**Priority: high.** Perceived latency and recovery from rapid repeated triggering are
correctness requirements, not optimizations: a scene that applies slowly gets re-triggered,
and the engine must stay responsive under that load rather than degrade.

### Guarantees

1. **Bounded card latency.** `applylayeredscene` returns as soon as the new layer state is in
   memory and the resulting commands have been dispatched. Persistence of the scene stack is
   not on the critical path; it happens after, and a persistence failure is logged without
   failing the card.

2. **Single-flight tick.** At most one `tick` executes at a time. A tick requested while one
   is in flight becomes *the* pending tick; a further request replaces the pending one. When
   the in-flight tick completes, the pending tick (if any) runs once, at the current
   timestamp. Consequence: N rapid triggers produce at most 2 evaluation passes in flight,
   not N.

3. **No lost updates.** `lastAppliedScene` and `currentLightValues` are written only by the
   tick holding the flight. No read-modify-write of engine state spans an `await`. A tick that
   is superseded must not write engine state at all — a stale write makes `getChanges` return
   empty and silences the engine until an unrelated change occurs.

4. **Convergence.** After a burst of triggers ends, the lights settle on the state implied by
   the *last* trigger, regardless of the order in which device commands complete.

5. **Supersession over queueing.** When a newer target arrives for a light, commands for that
   light that have not yet been sent to Homey are dropped rather than sent. Homey serializes
   capability calls per device, so queued obsolete commands directly extend the time until the
   newest target is visible.

### Caching

Per-tick Homey API round-trips are the dominant latency cost and must not scale with trigger
frequency:

- **Scene priorities** (`getScenePriorities`) are cached in `LightEngine`, invalidated on
  layer set/clear and refreshed on the heartbeat.
- **Device list** (`getDevices`) is cached in `LightController`, refreshed on the heartbeat.

Both caches are refreshed on heartbeat rather than expiring by wall-clock age, so a burst of
triggers performs zero additional API reads.

### Non-goals

Debouncing the card itself (delaying application to batch presses) is explicitly rejected — it
increases the perceived latency that causes the problem. Coalescing happens at the tick level,
after the in-memory state is already updated.

---

## Hold and Loop Semantics

A duration separator specifies the time spent **leaving** the keyframe that precedes it:

- `A/d/B` — over `d`, interpolate from `A` to `B`.
- `A|d|B` — hold `A` for `d`, then snap to `B`.

A trailing separator makes the pattern loop, and specifies the transition from the final
keyframe back to the first:

- `A/d1/B/d2/` — loops, fading `B` back to `A` over `d2`.
- `A|d1|B|d2|` — loops, holding `B` for `d2`, then snapping back to `A`.

A trailing separator never overwrites a duration already assigned to the final keyframe; it
contributes the loop-back segment only.

### Worked example

`h00ffff|5s|h0000ff|5s|ha0ffff|5s|` — period 15 s:

| t (s)  | Value      | Meaning              |
| ------ | ---------- | -------------------- |
| 0–5    | `h00ffff`  | red, full brightness |
| 5–10   | `h0000ff`  | white                |
| 10–15  | `ha0ffff`  | blue                 |
| 15     | wraps to `h00ffff` |              |

Every keyframe occupies a non-zero span. A keyframe with a zero-length segment is a parse
defect, not a valid timeline.

### Scheduling

The engine wakes at every segment boundary, whether or not that segment is a transition. A
pattern built entirely from step transitions must advance on schedule with the same accuracy
as one built from linear transitions; it must never depend on the heartbeat to advance.

To support this, `SegmentInfo` reports the time remaining in the current segment even when
`transition` is `null`, and `scheduleAnimationTick` schedules against that value.

---

## Animation Test Harness

Animations are timeline behaviour. Asserting a single tick's output at a hand-picked timestamp
does not test a timeline, and both defects recorded in TODO.md survived a passing suite for
that reason.

### Harness contract

- A **virtual clock** drives both the engine timestamps and the timer scheduling, so a test
  can run N virtual seconds in negligible real time. Anchor the fake clock at `now: 0` so
  explicit `tAssign` values and `Date.now()` agree.
- A **recording fake device** captures every capability call as an ordered
  `(t, capabilityId, value, duration)` tuple.
- A test declares a scene string, a run duration, and asserts against the **whole log**.

### Required assertions

Presence alone is insufficient. Every animation test asserts at least one of:

- **Order** — e.g. hue/saturation precede dim/onoff on a snap-to-bright.
- **Absence** — e.g. no `onoff` command carries a `duration`; no command is emitted for an
  unchanged light.
- **Timing** — the value at each virtual timestamp matches the specified timeline, including
  across at least two full loop periods.
- **Second-order effects** — a scheduled timer both fires *and* produces the next segment's
  commands.

### Required coverage

| Case                        | Must verify                                              |
| --------------------------- | -------------------------------------------------------- |
| Linear `/d/`                | interpolated value mid-segment; hw fade delegated once    |
| Step `\|d\|`                | value held for the full span; snap at the boundary        |
| Trailing separator          | loop-back segment exists; period is the sum of all spans  |
| Non-looping pattern         | final value held indefinitely; no further commands        |
| Loop wrap                   | phase correct after ≥ 2 periods                           |
| Re-assignment mid-loop      | new `tAssign` restarts the timeline from the new value    |
| Animation over animation    | higher layer wins per light for the whole timeline        |
| `null` in an animated layer | resolves to the lower layer's *animated* value, per tick  |

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

The handler file must be named `api.js` and placed at the **app root** (not in `settings/`).

### Settings page HTML bootstrap

The settings page `<head>` **must** include the Homey SDK script with `data-origin="settings"`:

```html
<script type="text/javascript" src="/homey.js" data-origin="settings"></script>
```

Without this tag the `Homey` global is never injected, `onHomeyReady` is never called, and
the page shows an infinite full-screen loading spinner.

### Settings page lifecycle

Homey hides the settings page entirely until the page calls `Homey.ready()` with no
arguments. The correct entry point is a globally-defined `onHomeyReady` function which
Homey calls with the Homey instance:

```javascript
function onHomeyReady(Homey) {
  // fetch data, populate UI ...
  Homey.ready(); // reveals the page
}
```

Call `Homey.ready()` after the UI is populated. If API calls fail, call `Homey.ready()`
anyway so the error is visible rather than leaving the user on a blank loading screen.

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