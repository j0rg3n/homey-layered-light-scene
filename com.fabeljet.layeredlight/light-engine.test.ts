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
