'use strict';

import { LightController } from './light-controller';
import { LightDevice } from './interfaces';

function createMockDevice(name = 'alice', id = 'dev-1'): LightDevice {
  return {
    id,
    name,
    class: 'light',
    capabilitiesObj: {
      dim: { min: 0, max: 1 },
      onoff: { min: 0, max: 1 },
      light_temperature: { min: 0, max: 1 },
      light_hue: { min: 0, max: 1 },
      light_saturation: { min: 0, max: 1 },
    },
    setCapabilityValue: jest.fn().mockResolvedValue(undefined),
  };
}

function createController(): LightController {
  const deviceProvider = { getDevices: jest.fn().mockResolvedValue([]) };
  return new LightController({ deviceProvider });
}

describe('LightController', () => {
  // Issue #5: applyTransition starts from fromValue, not from 0
  describe('applyTransition', () => {
    test('starts fade from fromValue, not from zero', async () => {
      const device = createMockDevice();
      const controller = createController();

      // Fade from [0.5] to [1.0] over 200ms
      await controller.applyTransition(device, [0.5], [1.0], 200);

      const { calls } = (device.setCapabilityValue as jest.Mock).mock;
      // First dim call should be close to 0.5 (not 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dimCalls = calls.filter((c: any) => c[0].capabilityId === 'dim');
      expect(dimCalls.length).toBeGreaterThan(0);
      const firstDimValue = dimCalls[0][0].value;
      expect(firstDimValue).toBeGreaterThan(0.4); // started from ~0.5, not 0
    });
  });

  // Issue #4: emitInterpolation sends hardware fade commands with duration
  describe('emitInterpolation', () => {
    test('sends current value immediately then target with duration', async () => {
      const device = createMockDevice();
      const controller = createController();

      await controller.emitInterpolation(device, [0.3], [0.8], 2000);

      const { calls } = (device.setCapabilityValue as jest.Mock).mock;
      const dimCalls = calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => c[0].capabilityId === 'dim')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => ({ value: c[0].value, duration: c[0].duration }));

      // First call: current value [0.3], no duration
      expect(dimCalls[0].value).toBeCloseTo(0.3, 2);
      expect(dimCalls[0].duration).toBeFalsy();

      // Second call: target [0.8] WITH duration 2000
      expect(dimCalls[1].value).toBeCloseTo(0.8, 2);
      expect(dimCalls[1].duration).toBe(2000);
    });

    test('skips hardware fade when durationMs is 0', async () => {
      const device = createMockDevice();
      const controller = createController();

      await controller.emitInterpolation(device, [0.3], [0.8], 0);

      const { calls } = (device.setCapabilityValue as jest.Mock).mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dimCalls = calls.filter((c: any) => c[0].capabilityId === 'dim');

      // Only one dim call (immediate snap to target), no duration call
      expect(dimCalls.length).toBe(1);
    });

    test('applySimpleSetting passes duration through to capability calls', async () => {
      const device = createMockDevice();
      const controller = createController();

      await controller.applySimpleSetting(device, [0.7], 1500);

      const dimCall = (device.setCapabilityValue as jest.Mock).mock.calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .find((c: any) => c[0].capabilityId === 'dim');
      expect(dimCall![0].duration).toBe(1500);
    });
  });
});
