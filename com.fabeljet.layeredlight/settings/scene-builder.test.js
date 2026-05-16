'use strict';

const { buildSceneString } = require('./scene-builder');

describe('buildSceneString', () => {
  test('empty deviceStates returns empty string', () => {
    expect(buildSceneString({})).toBe('');
  });

  test('null state omits device from output', () => {
    expect(buildSceneString({ Kitchen: null })).toBe('');
  });

  test('null state device omitted, other devices included', () => {
    const result = buildSceneString({ Kitchen: null, Bedroom: { on: true, dim: 1.0 } });
    expect(result).toBe('Bedroom:ff');
  });

  test('off state produces "off" token', () => {
    expect(buildSceneString({ Hall: { on: false, dim: 0 } })).toBe('Hall:off');
  });

  test('color device (hue+sat) produces hXXXXXX token', () => {
    const result = buildSceneString({ Kitchen: { on: true, dim: 1.0, hue: 0.5, sat: 1.0 } });
    expect(result).toMatch(/^Kitchen:h[0-9a-f]{6}$/);
  });

  test('dim+temp device produces 4-char XXYY token', () => {
    const result = buildSceneString({ Bedroom: { on: true, dim: 1.0, temp: 0.5 } });
    expect(result).toMatch(/^Bedroom:[0-9a-f]{4}$/);
  });

  test('brightness-only device produces 2-char XX token', () => {
    const result = buildSceneString({ Lamp: { on: true, dim: 0.5 } });
    expect(result).toMatch(/^Lamp:[0-9a-f]{2}$/);
  });

  test('hue=0, sat=1, dim=1 → h00ffff (red in HSV)', () => {
    expect(buildSceneString({ Light: { on: true, dim: 1.0, hue: 0, sat: 1.0 } })).toBe('Light:h00ffff');
  });

  test('hue=0.667 (≈0xaa), sat=1, dim=1 → haaffff (blue)', () => {
    expect(buildSceneString({ Light: { on: true, dim: 1.0, hue: 0.667, sat: 1.0 } })).toBe('Light:haaffff');
  });

  test('dim=1.0, temp=0.5 → ff80 (full bright, mid temp)', () => {
    expect(buildSceneString({ Light: { on: true, dim: 1.0, temp: 0.5 } })).toBe('Light:ff80');
  });

  test('dim=0.5 → 80 (half brightness)', () => {
    expect(buildSceneString({ Light: { on: true, dim: 0.5 } })).toBe('Light:80');
  });

  test('multiple devices produce space-separated string', () => {
    const result = buildSceneString({
      Kitchen: { on: true, dim: 1.0 },
      Bedroom: { on: false, dim: 0 },
    });
    expect(result).toBe('Kitchen:ff Bedroom:off');
  });

  test('passthrough state produces "null" token', () => {
    expect(buildSceneString({ Kitchen: { passthrough: true } })).toBe('Kitchen:null');
  });

  test('passthrough device included, null-state device omitted', () => {
    const result = buildSceneString({ Kitchen: { passthrough: true }, Bedroom: null });
    expect(result).toBe('Kitchen:null');
  });

  test('device name with spaces works correctly', () => {
    const result = buildSceneString({ 'Living Room': { on: true, dim: 1.0, temp: 0.0 } });
    expect(result).toBe('Living Room:ff00');
  });
});
