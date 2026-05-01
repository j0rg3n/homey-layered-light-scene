# Test Plan — master branch on device

## Setup

```bash
# Deploy new version
cd /home/jorgen/Documents/LayeredLight/com.fabeljet.layeredlight
homey app install

# Rollback command (keep this handy)
cd /home/jorgen/Documents/LayeredLight/stable/com.fabeljet.layeredlight
homey app install
```

---

## 1. Smoke test — app starts without crashing

- Open Homey developer tools / app log
- Confirm log shows `LightEngine started with 30s heartbeat`
- Confirm no uncaught exceptions in the first 30 seconds
- Confirm the heartbeat tick fires after 30s (`LightEngine tick...`)

**Rollback trigger:** app crashes on start or heartbeat throws

---

## 2. Static scene — basic light control

Trigger the `applylayeredscene` flow card with:

| `layer_name` | `scene`        | `clear` | Expected                    |
|---|---|---|---|
| `base`       | `<light>:ff`   | true    | Light goes full brightness  |
| `base`       | `<light>:80`   | true    | Light goes ~50% brightness  |
| `base`       | `<light>:off`  | true    | Light turns off             |
| `overlay`    | `<light>:ff`   | true    | Light goes full brightness (overlay wins) |
| `overlay`    | `<light>:null` | true    | Light reverts to base layer value |

Replace `<light>` with an actual light name from your setup.

**Rollback trigger:** light doesn't respond, or wrong brightness applied

---

## 3. Layer priority

Set two layers, verify higher priority wins:

1. Set `base` layer: `<light>:00` (off)
2. Set `overlay` layer: `<light>:ff` (full)
3. Confirm light is **on** (overlay wins)
4. Clear `overlay` (`clear=true`, scene=`<light>:null`)
5. Confirm light goes **off** (falls back to base)

> Priority order comes from the Homey variable `Grenser: Sceneprioritet`. Confirm
> that variable is set correctly — if it's empty, all layers will be ignored.

**Rollback trigger:** layer priority not respected

---

## 4. Non-looping animation

Trigger with scene string `<light>:ff/3s/00` (`clear=true`):

- Light should go to full brightness immediately, then fade to off over 3 seconds
- After 3s it holds at off (non-looping — no further changes)
- Wait for the next heartbeat tick (up to 30s) and confirm the light stays off

**Rollback trigger:** light doesn't move, or keeps looping after 3s

---

## 5. Looping animation

Trigger with `<light>:ff/2s/00/2s/` (`clear=true`):

- Light should continuously fade between full and off, 2s each way (4s total period)
- Wait two full cycles (~8s) and confirm the loop continues
- Wait for the next heartbeat tick — loop should still be running
- Replace the layer with a static scene (`<light>:80`) — light should stop animating
  and settle at ~50%

**Rollback trigger:** animation doesn't run, doesn't loop, or doesn't stop when overridden

---

## 6. Hardware fade delegation

During a running fade (e.g. `<light>:ff/5s/00/5s/`), check the app log for a tick
mid-fade. You should see two `setCapabilityValue` calls for the same light in quick
succession — one without a duration (snap to current interpolated position) and one
with a duration (hand off remaining fade to Homey hardware).

Expected log pattern:
```
Applying [0.5] to <light>...           ← snap to mid-point
Applying [0] to <light> over 4500ms... ← hardware takes over remaining fade
```

**Rollback trigger:** only one call per tick (no hardware delegation), or rapid
repeated calls at 100ms intervals (polling mode), or visible flickering

---

## 7. Rollback verification

At any point, deploy v0.7:

```bash
cd /home/jorgen/Documents/LayeredLight/stable/com.fabeljet.layeredlight
homey app install
```

- Confirm previously working static scenes still work
- Confirm no data corruption from the new version's stack format (both versions
  store the stack as a JSON token in the same format)

---

## Known risk areas

- **Empty priorities variable** — if `Grenser: Sceneprioritet` is empty or malformed,
  `tick()` will always evaluate to an empty scene and turn everything off on first tick
- **Light name mismatches** — scene strings use exact device names; a renamed device
  will silently not match
- **First tick after install** — the engine applies a full diff on the first tick; if
  `lastAppliedScene` is empty, it will send commands to every light in every active layer
