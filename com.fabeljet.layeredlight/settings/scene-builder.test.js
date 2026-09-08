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

const { parseSceneString } = require('./scene-builder');
const { SceneManager } = require('../scene-manager');

describe('parseSceneString', () => {
  test('a device name containing spaces is one name, not several tokens', () => {
    expect(parseSceneString('Kjøkkenbenk Ytre:ff80 Taklys:ff')).toEqual({
      'Kjøkkenbenk Ytre': 'ff80',
      Taklys: 'ff',
    });
  });

  test('single-word names still parse', () => {
    expect(parseSceneString('Kitchen:ff')).toEqual({ Kitchen: 'ff' });
  });

  test('off and null tokens parse', () => {
    expect(parseSceneString('Hall Light:off Bed Lamp:null')).toEqual({
      'Hall Light': 'off',
      'Bed Lamp': 'null',
    });
  });

  test('leading, trailing and repeated whitespace is tolerated', () => {
    expect(parseSceneString('  Lamp One:80   Lamp Two:h00ffff  ')).toEqual({
      'Lamp One': '80',
      'Lamp Two': 'h00ffff',
    });
  });

  test('an empty string yields no entries', () => {
    expect(parseSceneString('')).toEqual({});
    expect(parseSceneString(undefined)).toEqual({});
  });

  test('every device a round-trip writes is a device it can read back', () => {
    const states = {
      'Kjøkkenbenk Ytre': { on: true, dim: 1.0, temp: 0.5 },
      Taklys: { on: true, dim: 0.5 },
      'Hall Light': { on: false },
    };

    const written = buildSceneString(states);
    expect(Object.keys(parseSceneString(written)).sort())
      .toEqual(Object.keys(states).sort());
  });

  // The page and the engine must not disagree about the grammar — that disagreement is what
  // silently dropped three of five lights on load.
  test('agrees with SceneManager.getSceneFromString on which names exist', () => {
    const sceneString = 'Kjøkkenbenk Ytre:ff80 Taklys:ff Hall Light:off';
    const engineNames = Object.keys(new SceneManager().getSceneFromString(sceneString)).sort();

    expect(Object.keys(parseSceneString(sceneString)).sort()).toEqual(engineNames);
  });
});
