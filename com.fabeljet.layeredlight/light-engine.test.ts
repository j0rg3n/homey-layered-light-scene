'use strict';

import { LightEngine } from './light-engine';
import {
  SceneStore, SceneProvider, DeviceProvider, LightDevice, LightEngineDeps,
} from './interfaces';
import { SceneStringStack } from './scene-manager';

function createMockSceneStore(initialStack: SceneStringStack = {}): SceneStore {
  let stack = { ...initialStack };
  return {
    getStack: jest.fn().mockImplementation(async () => stack),
    setStack: jest.fn().mockImplementation(async (newStack: SceneStringStack) => {
      stack = { ...newStack };
    }),
  };
}

function createMockSceneProvider(priorities: string[] = [], arrangement: string[][] = []): SceneProvider {
  return {
    getScenePriorities: jest.fn().mockResolvedValue(priorities),
    getSceneArrangement: jest.fn().mockResolvedValue(arrangement),
  };
}

function createMockDeviceProvider(lights: LightDevice[] = []): DeviceProvider {
  return {
    getDevices: jest.fn().mockResolvedValue(lights),
  };
}

function createMockLightDevice(name: string, id: string = 'device-1'): LightDevice {
  return {
    id,
    name,
    class: 'light',
    capabilitiesObj: {
      dim: { min: 0, max: 1 },
      onoff: { min: 0, max: 1 },
      light_hue: { min: 0, max: 1 },
      light_saturation: { min: 0, max: 1 },
      light_temperature: { min: 0, max: 1 },
    },
    setCapabilityValue: jest.fn().mockResolvedValue(undefined),
  };
}

function createEngine(deps?: Partial<LightEngineDeps>, heartbeatMs: number = 30000): LightEngine {
  return new LightEngine({
    deps: {
      sceneStore: deps?.sceneStore ?? createMockSceneStore(),
      sceneProvider: deps?.sceneProvider ?? createMockSceneProvider(),
      lightControllerDeps: {
        deviceProvider: deps?.lightControllerDeps?.deviceProvider ?? createMockDeviceProvider(),
      },
    },
    heartbeatIntervalMs: heartbeatMs,
  });
}

describe('LightEngine', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getSceneStack / setSceneStack', () => {
    test('getSceneStack returns current stack', async () => {
      const stack: SceneStringStack = { layer1: '{"alice": [1]}' };
      const sceneStore = createMockSceneStore(stack);
      const engine = createEngine({ sceneStore });

      const result = await engine.getSceneStack();

      expect(result).toEqual(stack);
      expect(sceneStore.getStack).toHaveBeenCalled();
    });

    test('setSceneStack updates stack', async () => {
      const sceneStore = createMockSceneStore();
      const engine = createEngine({ sceneStore });

      const newStack: SceneStringStack = { layer1: '{"bob": [0.5]}' };
      await engine.setSceneStack(newStack);

      expect(sceneStore.setStack).toHaveBeenCalledWith(newStack);
    });
  });

  describe('tick', () => {
    test('tick applies changes when scene changes', async () => {
      jest.useFakeTimers();
      const lights = [createMockLightDevice('alice')];
      const deviceProvider = createMockDeviceProvider(lights);
      const sceneStore = createMockSceneStore({});
      const sceneProvider = createMockSceneProvider(['layer1']);

      const engine = createEngine({ sceneStore, sceneProvider, lightControllerDeps: { deviceProvider } });

      await engine.setLayer('layer1', 'alice:ff', 1000);
      await engine.tick(1001);
      jest.runAllTimers();

      expect(lights[0].setCapabilityValue).toHaveBeenCalled();
    });

    test('tick does not apply when no changes', async () => {
      jest.useFakeTimers();
      const lights = [createMockLightDevice('alice')];
      const deviceProvider = createMockDeviceProvider(lights);
      const sceneStore = createMockSceneStore({});
      const sceneProvider = createMockSceneProvider(['layer1']);

      const engine = createEngine({ sceneStore, sceneProvider, lightControllerDeps: { deviceProvider } });

      await engine.tick(1000);
      jest.runAllTimers();

      expect(lights[0].setCapabilityValue).not.toHaveBeenCalled();
    });

    test('tick with empty priorities returns empty target scene', async () => {
      jest.useFakeTimers();
      const sceneStore = createMockSceneStore({ layer1: '{"alice": [1]}' });
      const sceneProvider = createMockSceneProvider([]);
      const deviceProvider = createMockDeviceProvider([]);

      const engine = createEngine({ sceneStore, sceneProvider, lightControllerDeps: { deviceProvider } });

      await engine.tick();
      jest.runAllTimers();

      expect(engine.getLastAppliedScene()).toEqual({});
    });
  });

  describe('tick with animated layer', () => {
    test('tick delegates linear transition to hardware via emitInterpolation', async () => {
      jest.useFakeTimers();
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);

      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // Assign a 4s looping animation to alice at t=0
      await engine.setLayer('layer1', 'alice:ff/2s/00/2s/', 0);
      // Tick at t=1000: alice is 1s into ff→00 fade (halfway through 2s)
      await engine.tick(1000);

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      // At least one call should carry a duration > 0 (the hardware fade target command)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callsWithDuration = calls.filter((c: any) => c[0].duration && c[0].duration > 0);
      expect(callsWithDuration.length).toBeGreaterThan(0);
    });

    test('HSL snap-to-bright sends hue/sat before dim/onoff — prevents wrong-color flash', async () => {
      jest.useFakeTimers();
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // Static HSL scene — the snap path (no hw fade, no transition)
      await engine.setLayer('layer1', 'alice:ff0000', 0); // red: [0, 1, 0.5]
      await engine.tick(0);

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      const hueIdx = calls.findIndex((c: any) => c[0].capabilityId === 'light_hue');
      const dimIdx = calls.findIndex((c: any) => c[0].capabilityId === 'dim');
      const onIdx = calls.findIndex((c: any) => c[0].capabilityId === 'onoff' && c[0].value === true);

      expect(hueIdx).toBeGreaterThanOrEqual(0);
      expect(dimIdx).toBeGreaterThanOrEqual(0);
      // hue and sat must precede dim and onoff=true
      expect(hueIdx).toBeLessThan(dimIdx);
      expect(hueIdx).toBeLessThan(onIdx);
    });

    test('after hw-fade-to-black, next emitInterpolation sends onoff=false before snap', async () => {
      jest.useFakeTimers({ now: 0 });
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // Animation: bright → (2s) → black → (2s) → bright
      await engine.setLayer('layer1', 'alice:ff/2s/00/2s/ff', 0);
      await engine.tick(0);

      // Advance past segment 1 (fade-to-black) into segment 2 (fade-to-bright)
      await jest.advanceTimersByTimeAsync(2100);

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      // After segment 1 ends, the auto-tick for segment 2 should send onoff=false
      // as the first command (before the snap and new hw fade)
      const onoffFalseCalls = (calls as any[]).filter(
        (c) => c[0].capabilityId === 'onoff' && c[0].value === false,
      );
      expect(onoffFalseCalls.length).toBeGreaterThan(0);

      // The first onoff=false at segment 2 boundary must come before the hw dim fade for segment 2
      const firstOnoffFalseIdx = calls.findIndex(
        (c: any) => c[0].capabilityId === 'onoff' && c[0].value === false,
      );
      const firstSegment2DimFadeIdx = calls.findIndex(
        (c: any) => c[0].capabilityId === 'dim' && c[0].duration > 0 && c[0].duration < 2000,
      );
      expect(firstOnoffFalseIdx).toBeLessThan(firstSegment2DimFadeIdx);
    });

    test('prioritized fade — dim dominates black→magenta: color snaps, only dim gets duration', async () => {
      jest.useFakeTimers({ now: 0 });
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // 2s fade from black to magenta (000000 → ff00ff)
      // dim delta 0.5 × 3 = 1.5 (dominant), hue delta 1/6 × 1 ≈ 0.17, sat delta 1 × 0.5 = 0.5
      await engine.setLayer('layer1', 'alice:000000/2s/ff00ff', 0);
      await engine.tick(0);

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      // The hw fade step should use duration only for 'dim', not for hue or saturation
      const dimFade = (calls as any[]).filter(
        (c) => c[0].capabilityId === 'dim' && c[0].duration > 0,
      );
      const hueFade = (calls as any[]).filter(
        (c) => c[0].capabilityId === 'light_hue' && c[0].duration > 0,
      );
      const satFade = (calls as any[]).filter(
        (c) => c[0].capabilityId === 'light_saturation' && c[0].duration > 0,
      );
      expect(dimFade.length).toBeGreaterThan(0);
      expect(hueFade).toHaveLength(0);
      expect(satFade).toHaveLength(0);
    });

    test('prioritized fade — hue dominates red→blue: only hue gets duration', async () => {
      jest.useFakeTimers({ now: 0 });
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // ff0000 (red, l=0.5) → 0000ff (blue, l=0.5): dim delta 0 (dim-score=0), hue delta 1/3 × 1 ≈ 0.33
      await engine.setLayer('layer1', 'alice:ff0000/2s/0000ff', 0);
      await engine.tick(0);

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      const dimFade = (calls as any[]).filter(
        (c) => c[0].capabilityId === 'dim' && c[0].duration > 0,
      );
      const hueFade = (calls as any[]).filter(
        (c) => c[0].capabilityId === 'light_hue' && c[0].duration > 0,
      );
      expect(dimFade).toHaveLength(0);
      expect(hueFade.length).toBeGreaterThan(0);
    });

    test('onoff=false is NOT sent during a fade-to-dark — prevents immediate cut-off', async () => {
      jest.useFakeTimers();
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      await engine.setLayer('layer1', 'alice:ff/2s/00', 0);
      await engine.tick(0); // tick at start: snap to bright, hw fade to 0 over 2000ms

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onoffWithDuration = calls.filter((c: any) => c[0].capabilityId === 'onoff' && c[0].duration > 0);
      expect(onoffWithDuration).toHaveLength(0);
    });

    test('onoff=true is sent before a hw fade-to-bright when starting from dark', async () => {
      jest.useFakeTimers();
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // Animation: snap to black, then fade to bright over 2s
      await engine.setLayer('layer1', 'alice:00/2s/ff', 0);
      await engine.tick(0); // snap to black (instant), hw fade to bright over 2000ms

      const { calls } = (alice.setCapabilityValue as jest.Mock).mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onoffCalls = calls.filter((c: any) => c[0].capabilityId === 'onoff');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dimCalls = calls.filter((c: any) => c[0].capabilityId === 'dim' && c[0].duration > 0);
      // onoff=true must appear before the dim fade (light must be on before hw ramp starts)
      expect(onoffCalls.some((c: any) => c[0].value === true)).toBe(true);
      const firstOnIndex = calls.findIndex((c: any) => c[0].capabilityId === 'onoff' && c[0].value === true);
      const firstDimFadeIndex = calls.findIndex((c: any) => c[0].capabilityId === 'dim' && c[0].duration > 0);
      expect(firstOnIndex).toBeLessThan(firstDimFadeIndex);
    });

    test('engine self-schedules tick at keyframe boundary of multi-segment animation', async () => {
      // Anchor fake clock to 0 so tAssign=0 and Date.now() stay in sync
      jest.useFakeTimers({ now: 0 });
      const alice = createMockLightDevice('alice');
      const deviceProvider = createMockDeviceProvider([alice]);
      const sceneProvider = createMockSceneProvider(['layer1']);
      const engine = createEngine({ sceneProvider, lightControllerDeps: { deviceProvider } });

      // 3-keyframe animation: white → (2s) → black → (2s) → white, no loop
      await engine.setLayer('layer1', 'alice:ff/2s/00/2s/ff', 0);
      await engine.tick(0); // segment 1: snap to white, hw fade to black over 2000ms

      const callCountAfterTick1 = (alice.setCapabilityValue as jest.Mock).mock.calls.length;

      // Advance past segment 1 boundary (2000ms + 50ms buffer);
      // Date.now() advances to 2100, so auto-tick evaluates animation 100ms into segment 2
      await jest.advanceTimersByTimeAsync(2100);

      // Engine should have self-ticked: more calls should have been made
      const callCountAfterAutoTick = (alice.setCapabilityValue as jest.Mock).mock.calls.length;
      expect(callCountAfterAutoTick).toBeGreaterThan(callCountAfterTick1);
    });
  });

  describe('applyFullScene', () => {
    test('applyFullScene applies entire stack', async () => {
      jest.useFakeTimers();
      const lights = [createMockLightDevice('alice')];
      const deviceProvider = createMockDeviceProvider(lights);
      const sceneStore = createMockSceneStore({ layer1: '{"alice": [1]}' });
      const sceneProvider = createMockSceneProvider(['layer1']);

      const engine = createEngine({ sceneStore, sceneProvider, lightControllerDeps: { deviceProvider } });

      await engine.applyFullScene();
      jest.runAllTimers();

      expect(lights[0].setCapabilityValue).toHaveBeenCalled();
      expect(engine.getLastAppliedScene()).toEqual({ alice: [1] });
    });
  });
});
