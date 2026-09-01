# Plan — responsiveness and concurrency (high priority)

Addresses the "button-mashing jams the app" issue. See TODO.md § *Fix: responsiveness under
rapid flow-card triggering* and SPEC.md § *Responsiveness and Concurrency*.

## Findings

The trigger → tick → device path did four expensive or unsafe things per button press:

1. `HomeySceneProvider.getScenePriorities` calls `logic.getVariables()` — **every** Homey
   variable — on every tick.
2. `HomeyDeviceProvider.getDevices` fetches **every** Homey device on every tick, and
   `applySceneInfo` then scanned that list per light.
3. Ticks were unserialized. Concurrent ticks read `lastAppliedScene` and wrote it after their
   awaits; a late tick overwriting a newer one makes `getChanges` return `{}`, which silences
   the engine until something unrelated changes. This is the minute-long freeze.
4. The flow card awaited the Homey token write before returning.

## Stage 1 — Remove per-tick Homey API reads ✓

- `LightEngine.getPriorities` caches the priority list; heartbeat invalidates it.
- `LightController` caches the device list plus a `name → device` index; heartbeat
  invalidates it, and both caches refill lazily on next read.
- Miss-driven refresh: an unknown layer name or light name forces one refetch, so added or
  renamed layers/devices work on first use rather than after a heartbeat.

## Stage 2 — Single-flight, coalescing tick ✓

- `LightEngine.tick` is now a request, not an execution: it marks a pending request and
  returns a promise; `drainTicks` runs `runTick` bodies one at a time until no request is
  pending, then releases all waiters.
- A request arriving during a pass replaces any already-queued request. N triggers ⇒ 2 passes.
- Because only one `runTick` body runs at a time, the `lastAppliedScene` read-modify-write can
  no longer interleave — the lost-update freeze is structurally impossible.
- `getTickCount()` exposes the pass count so coalescing is directly testable.

## Stage 3 — Persistence off the card path ✓

- `CardHandler.handleApplyScene` queues the stack write on a serial `persistQueue` and awaits
  only the in-memory apply. Write failures are logged, never surfaced to the card.
- Serialization matters: an interleaved read-modify-write of the stack can persist a
  combination that never existed.

## Stage 4 — Per-device supersession (not started)

Highest remaining risk, lowest remaining urgency — do it only if device-level lag persists
after Stages 1–3 are on the device.

- Per-device slot in `LightController`: one running job, at most one pending; a newer target
  replaces the pending one instead of queueing behind it.
- Homey serializes capability calls per device, so obsolete queued commands directly delay the
  newest target.
- Care required around `knownValues` (update only after a send completes) and the IKEA
  `onoff=false` pre-step in `emitInterpolation`.

## Stage 5 — Remaining test work

Done here: burst call-counts, coalescing pass-count, convergence, waiter semantics,
miss-driven refresh, heartbeat invalidation, card-latency and persist-ordering tests.

Still to build, as part of the animation work: the virtual-clock timeline harness described in
SPEC.md § *Animation Test Harness*. The gated-device fake added in `light-engine.test.ts` is
the seed of its recording device.

## Verification

- `npx jest` — 128 unit tests pass (the Playwright spec is not a Jest suite).
- `npx tsc --noEmit` — clean for the TypeScript sources.
- `npx eslint` — no new errors; only the pre-existing `no-console` and global-timer warnings.
- **Not yet verified on device.** Deploy with `homey app run -r` and re-run TEST_PLAN.md,
  paying attention to: rapid repeated triggering of the same layer, a layer name newly added
  to `Grenser: Sceneprioritet`, and a renamed light.
