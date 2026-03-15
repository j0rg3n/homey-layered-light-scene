import { SceneManager, Scene, SceneStringStack } from './scene-manager';

function getUtil() : SceneManager {
  return new SceneManager();
}

describe('SceneManager', () => {
  describe('getRgbVectorFromRgbString', () => {
    test('plain white', () => {
      expect(getUtil().getRgbVectorFromRgbString('ff')).toEqual([1]);
    });

    test('cold white', () => {
      expect(getUtil().getRgbVectorFromRgbString('00ff')).toEqual([0, 1]);
    });

    test('red', () => {
      expect(getUtil().getRgbVectorFromRgbString('ff0000')).toEqual([1, 0, 0]);
    });

    test('blue', () => {
      expect(getUtil().getRgbVectorFromRgbString('0000ff')).toEqual([0, 0, 1]);
    });

    test('purple', () => {
      expect(getUtil().getRgbVectorFromRgbString('FF0033')).toEqual([1, 0, 0.2]);
    });
  });

  describe('getHueSaturationLightnessFromRgb', () => {
    test('white', () => {
      expect(getUtil().getHueSaturationLightnessFromRgb([1, 1, 1])).toEqual([0, 0, 1]);
    });

    test('black', () => {
      expect(getUtil().getHueSaturationLightnessFromRgb([0, 0, 0])).toEqual([0, 0, 0]);
    });

    test('red', () => {
      expect(getUtil().getHueSaturationLightnessFromRgb([1, 0, 0])).toEqual([0, 1, 0.5]);
    });

    test('blue', () => {
      expect(getUtil().getHueSaturationLightnessFromRgb([0, 0, 1])).toEqual([2.0 / 3, 1, 0.5]);
    });
  });

  describe('getSceneFromString', () => {
    test('basic scene from string', () => {
      const scene = getUtil().getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff eddie:on fiona:off');
      expect(scene).toEqual({
        alice: [0, 1, 0.5],
        bob: [1],
        claire: false,
        dave: [0, 1],
        eddie: true,
        fiona: false,
      });
    });

    test('basic scene from string with spaces', () => {
      const scene = getUtil().getSceneFromString('alice in wonderland: ff0000 bob george: ff claire danes: off dave fitzwilliam: 00ff');
      expect(scene).toEqual({
        'alice in wonderland': [0, 1, 0.5],
        'bob george': [1],
        'claire danes': false,
        'dave fitzwilliam': [0, 1],
      });
    });
  });

  describe('layerScenes', () => {
    test('layer scenes', () => {
      const base: Scene = { alice: [1], bob: [0.5] };
      const modifier: Scene = { bob: [0.8], charlie: [0.3] };
      const result = getUtil().layerScenes(base, modifier);
      expect(result).toEqual({
        alice: [1],
        bob: [0.8],
        charlie: [0.3],
      });
    });

    test('merge scenes with clears', () => {
      const base: Scene = { alice: [1], bob: [0.5] };
      const modifier: Scene = { bob: null };
      const result = getUtil().layerScenes(base, modifier);
      expect(result).toEqual({
        alice: [1],
      });
    });
  });

  describe('flattenStack', () => {
    test('flatten, three layers, basic', () => {
      const stack: SceneStringStack = {
        night: '{"alice": [0.1]}',
        evening: '{"bob": [0.5], "charlie": [0.8]}',
        day: '{"alice": [1], "dave": [0.6]}',
      };
      const priorities = ['night', 'evening', 'day'];
      const result = getUtil().flattenStack(stack, priorities);
      expect(result).toEqual({
        alice: [1],
        bob: [0.5],
        charlie: [0.8],
        dave: [0.6],
      });
    });

    test('flatten, three layers, with clears', () => {
      const stack: SceneStringStack = {
        night: '{"alice": [0.1], "bob": [0.2]}',
        evening: '{"bob": null, "charlie": [0.8]}',
        day: '{"alice": [1], "dave": [0.6]}',
      };
      const priorities = ['night', 'evening', 'day'];
      const result = getUtil().flattenStack(stack, priorities);
      expect(result).toEqual({
        alice: [1],
        charlie: [0.8],
        dave: [0.6],
      });
    });

    test('flatten with last two levels swapped', () => {
      const stack: SceneStringStack = {
        night: getUtil().getJsonFromScene(getUtil().getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff')),
        evening: getUtil().getJsonFromScene(getUtil().getSceneFromString('alice:off bob:cc')),
        day: getUtil().getJsonFromScene(getUtil().getSceneFromString('bob:00ff')),
      };
      const priorities = ['night', 'day', 'evening'];
      const result = getUtil().flattenStack(stack, priorities);
      expect(result).toEqual({
        alice: false,
        bob: [0.8],
        claire: false,
        dave: [0, 1],
      });
    });

    test('flatten missing data for one priority level', () => {
      const stack: SceneStringStack = {
        evening: '{"bob": [0.5]}',
      };
      const priorities = ['night', 'evening', 'day'];
      const result = getUtil().flattenStack(stack, priorities);
      expect(result).toEqual({
        bob: [0.5],
      });
    });

    test('flatten morning before 1', () => {
      const stack: SceneStringStack = {
        night: '{"alice": [0.1]}',
        morning: '{"alice": [0.3], "bob": [0.5]}',
      };
      const priorities = ['night', 'morning'];
      const result = getUtil().flattenStack(stack, priorities);
      expect(result).toEqual({
        alice: [0.3],
        bob: [0.5],
      });
    });

    test('flatten morning before 2', () => {
      const stack: SceneStringStack = {
        night: '{"alice": [0.1]}',
        morning: '{"bob": [0.5]}',
        evening: '{"alice": [0.8], "charlie": [0.9]}',
      };
      const priorities = ['night', 'morning', 'evening'];
      const result = getUtil().flattenStack(stack, priorities);
      expect(result).toEqual({
        alice: [0.8],
        bob: [0.5],
        charlie: [0.9],
      });
    });
  });

  describe('getSceneOrdering', () => {
    test('order scene lights by arrangement', () => {
      const scene: Scene = { alice: [1], bob: [0.5], charlie: [0.8] };
      const arrangement = [['alice'], ['charlie', 'bob']];
      const result = getUtil().getSceneOrdering(scene, arrangement);
      expect(result).toEqual([
        { alice: [1] },
        { charlie: [0.8], bob: [0.5] },
      ]);
    });

    test('order scene lights by incomplete arrangement', () => {
      const scene: Scene = { alice: [1], bob: [0.5], charlie: [0.8] };
      const arrangement = [['alice']];
      const result = getUtil().getSceneOrdering(scene, arrangement);
      expect(result).toEqual([
        { alice: [1] },
        { bob: [0.5], charlie: [0.8] },
      ]);
    });

    test('order incomplete scene lights by arrangement', () => {
      const scene: Scene = { alice: [1] };
      const arrangement = [['alice', 'bob', 'charlie']];
      const result = getUtil().getSceneOrdering(scene, arrangement);
      expect(result).toEqual([
        { alice: [1] },
      ]);
    });
  });

  describe('getChanges', () => {
    test('changes with smaller after set', () => {
      const before: Scene = { alice: [1], bob: [0.5] };
      const after: Scene = { alice: [0.8] };
      const result = getUtil().getChanges(before, after);
      expect(result).toEqual({
        alice: [0.8],
      });
    });

    test('changes with larger after set', () => {
      const before: Scene = { alice: [1] };
      const after: Scene = { alice: [0.8], bob: [0.5] };
      const result = getUtil().getChanges(before, after);
      expect(result).toEqual({
        alice: [0.8],
        bob: [0.5],
      });
    });

    test('changes with empty after set', () => {
      const before: Scene = { alice: [1], bob: [0.5] };
      const after: Scene = {};
      const result = getUtil().getChanges(before, after);
      expect(result).toEqual({});
    });

    test('changes with different light values', () => {
      const before: Scene = { alice: [0.1], bob: [0.3], charlie: [0.5] };
      const after: Scene = { alice: [0.1], bob: [0.5], charlie: [0.8] };
      const result = getUtil().getChanges(before, after);
      expect(result).toEqual({
        bob: [0.5],
        charlie: [0.8],
      });
    });

    test('changes including on/off', () => {
      const before: Scene = { alice: true, bob: false };
      const after: Scene = { alice: false, bob: true };
      const result = getUtil().getChanges(before, after);
      expect(result).toEqual({
        alice: false,
        bob: true,
      });
    });
  });

  describe('updateStack', () => {
    test('update stack with clear', () => {
      const stack: SceneStringStack = {
        layer1: '{"alice": [1]}',
        layer2: '{"bob": [0.5]}',
      };
      const result = getUtil().updateStack(stack, 'layer3', 'charlie:ff0000', true);
      expect(result).toEqual({
        layer1: '{"alice": [1]}',
        layer2: '{"bob": [0.5]}',
        layer3: '{"charlie":[0,1,0.5]}',
      });
    });

    test('update stack without clear (merge)', () => {
      const stack: SceneStringStack = {
        layer1: '{"alice": [1]}',
      };
      const result = getUtil().updateStack(stack, 'layer1', 'bob:ff0000', false);
      expect(result).toEqual({
        layer1: '{"alice":[1],"bob":[0,1,0.5]}',
      });
    });

    test('update stack with null (turn off)', () => {
      const stack: SceneStringStack = {
        layer1: '{"alice": [1], "bob": [0.5]}',
      };
      const result = getUtil().updateStack(stack, 'layer1', 'alice:null', false);
      expect(result).toEqual({
        layer1: '{"bob":[0.5]}',
      });
    });
  });
});
