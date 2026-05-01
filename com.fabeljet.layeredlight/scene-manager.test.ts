'use strict';

import {
  SceneManager, Scene, SceneStringStack, Animation, interpolateLinear, SegmentInfo,
} from './scene-manager';

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

  describe('parseLightValue', () => {
    test('simple value returns as-is', () => {
      const result = getUtil().parseLightValue('ff0000');
      expect(result).toEqual([0, 1, 0.5]);
    });

    test('simple on returns boolean true', () => {
      const result = getUtil().parseLightValue('on');
      expect(result).toBe(true);
    });

    test('simple off returns boolean false', () => {
      const result = getUtil().parseLightValue('off');
      expect(result).toBe(false);
    });

    test('simple null returns null', () => {
      const result = getUtil().parseLightValue('null');
      expect(result).toBe(null);
    });

    test('hard transition with pipes creates animation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('|ff|2|00|2|') as any;
      expect(result).toHaveProperty('loop', true);
      expect(result).toHaveProperty('keyframes');
      expect(Array.isArray(result.keyframes)).toBe(true);
      expect(result.keyframes.length).toBeGreaterThan(0);
      expect(result.keyframes[0]).toHaveProperty('hard', true);
    });

    test('fade transition with slashes creates animation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/ff/500ms/') as any;
      expect(result).toHaveProperty('loop', true);
      expect(result).toHaveProperty('keyframes');
      expect(Array.isArray(result.keyframes)).toBe(true);
      expect(result.keyframes.length).toBeGreaterThan(0);
    });

    test('leading separator with duration creates animation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/500ms/ff') as any;
      expect(result).toHaveProperty('loop', false);
      expect(result).toHaveProperty('keyframes');
      expect(Array.isArray(result.keyframes)).toBe(true);
      expect(result.keyframes.length).toBeGreaterThan(0);
      expect(result.keyframes[0]).toHaveProperty('transitionMs', 500);
    });

    test('trailing separator means loop', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/ff/5s/') as any;
      expect(result).toHaveProperty('loop', true);
    });

    test('no trailing separator means no loop', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/ff/5s') as any;
      expect(result).toHaveProperty('loop', false);
    });

    test('on/off/null become hard transitions', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/on/5s/off') as any;
      expect(result).toHaveProperty('loop', false);
      expect(result.keyframes[0]).toHaveProperty('hard', true);
      expect(result.keyframes[1]).toHaveProperty('hard', true);
    });

    test('fade transition with slashes creates animation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/ff/500ms/') as any;
      expect(result).toHaveProperty('loop', true);
      expect(result).toHaveProperty('keyframes');
      expect(Array.isArray(result.keyframes)).toBe(true);
      expect(result.keyframes.length).toBeGreaterThan(0);
    });

    test('leading separator with duration creates animation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/500ms/ff') as any;
      expect(result).toHaveProperty('loop', false);
      expect(result).toHaveProperty('keyframes');
      expect(Array.isArray(result.keyframes)).toBe(true);
      expect(result.keyframes.length).toBeGreaterThan(0);
    });

    test('trailing separator means loop', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/ff/5s/') as any;
      expect(result).toHaveProperty('loop', true);
    });

    test('no trailing separator means no loop', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = getUtil().parseLightValue('/ff/5s') as any;
      expect(result).toHaveProperty('loop', false);
    });

    test('duration with h creates animation with hour duration', () => {
      const result = getUtil().parseLightValue('/ff/1h/');
      expect(result).toHaveProperty('loop', true);
    });

    // Issue #1: tokenizer misidentifies hex values like 00 as durations
    test('hex color 00 between slashes is parsed as brightness zero, not a duration', () => {
      const result = getUtil().parseLightValue('/00/2s/ff/2s/') as Animation;
      expect(result).toHaveProperty('keyframes');
      expect(result.keyframes).toHaveLength(2);
      expect(result.keyframes[0].value).toEqual([0]);
      expect(result.keyframes[1].value).toEqual([1]);
    });

    test('hex color 80 between slashes is parsed as brightness 0.5, not a duration', () => {
      const result = getUtil().parseLightValue('/80/2s/ff/2s/') as Animation;
      expect(result.keyframes[0].value).toEqual([0.5019607843137255]);
    });

    // Issue #2: loop-back transition
    test('trailing slash-duration stores loopTransitionMs, not on last keyframe transitionMs', () => {
      const result = getUtil().parseLightValue('ff/2s/00/2s/') as Animation;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).loopTransitionMs).toBe(2000);
      // last keyframe transitionMs should still be 2000 (the INTO-00 transition), not overwritten
      expect(result.keyframes[1].transitionMs).toBe(2000);
    });

    test('asymmetric loop: ff/3s/00/2s/ keeps separate in/out durations', () => {
      const result = getUtil().parseLightValue('ff/3s/00/2s/') as Animation;
      expect(result.keyframes[1].transitionMs).toBe(3000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).loopTransitionMs).toBe(2000);
    });
  });

  // Issue #2: loop-back transition eval
  describe('eval loop-back transition', () => {
    test('looping animation fades back from last to first value', () => {
      // ff/2s/00/2s/ = period 4s: 0-2s fade ff→00, 2s-4s fade 00→ff
      const anim = getUtil().parseLightValue('ff/2s/00/2s/') as Animation;
      const sm = getUtil();
      // t=3000: 1s into loop-back, halfway through 2s fade from [0] back to [1]
      const val = sm.eval(anim, 0, 3000) as number[];
      expect(val[0]).toBeCloseTo(0.5, 1);
    });

    test('looping animation period includes loop-back duration', () => {
      // Total period = 4s. At t=4000, wraps to t=0 → ff = [1]
      const anim = getUtil().parseLightValue('ff/2s/00/2s/') as Animation;
      const val = getUtil().eval(anim, 0, 4000) as number[];
      expect(val[0]).toBeCloseTo(1, 1);
    });
  });

  // Issue #3: cursor offset in eval
  describe('eval cursor offset', () => {
    test('transition after a hold phase interpolates correctly', () => {
      // kf[0]: hold [0] for 1s, kf[1]: fade to [1] over 2s
      // At tElapsed=2500: 1.5s into the 2s transition → progress=0.75 → [0.75]
      const anim: Animation = {
        keyframes: [
          { value: [0], holdMs: 1000 },
          { value: [1], transitionMs: 2000 },
        ],
        loop: false,
      };
      const val = getUtil().eval(anim, 0, 2500) as number[];
      expect(val[0]).toBeCloseTo(0.75, 1);
    });

    test('hold phase before transition returns the hold value, not interpolated', () => {
      const anim: Animation = {
        keyframes: [
          { value: [0], holdMs: 1000 },
          { value: [1], transitionMs: 2000 },
        ],
        loop: false,
      };
      // At tElapsed=500: still in hold phase → [0]
      const val = getUtil().eval(anim, 0, 500) as number[];
      expect(val[0]).toBeCloseTo(0, 1);
    });
  });

  // Issue #6: promoteSetting type promotion
  describe('interpolateLinear type promotion', () => {
    test('brightness to HSL: brightness placed at lightness position [2]', () => {
      // [0.8] → [0, 0, 0.8] when promoting to HSL [h, s, l]
      // Interpolating halfway between [0.8] and [0, 0, 0.0] should give [0, 0, 0.4]
      const result = interpolateLinear([0.8], [0, 0, 0.0], 0.5) as number[];
      expect(result[0]).toBeCloseTo(0, 2); // hue stays neutral
      expect(result[1]).toBeCloseTo(0, 2); // saturation stays neutral
      expect(result[2]).toBeCloseTo(0.4, 1); // brightness halved
    });

    test('brightness to brightness+temp: temperature defaults to neutral (0.5)', () => {
      // [0.8] → [0.8, 0.5] when promoting to [brightness, temperature]
      // Halfway between [0.8] and [0.0, 0.5] should give [0.4, 0.5]
      const result = interpolateLinear([0.8], [0.0, 0.5], 0.5) as number[];
      expect(result[0]).toBeCloseTo(0.4, 1);
      expect(result[1]).toBeCloseTo(0.5, 1); // not 0.25 (which old code would give)
    });
  });

  // Issue #7 (from review): SegmentInfo / evalSegmentInfo
  describe('evalSegmentInfo', () => {
    test('static value returns transition: null', () => {
      const info = getUtil().evalSegmentInfo([0.5], 0, 1000) as SegmentInfo;
      expect(info.value).toEqual([0.5]);
      expect(info.transition).toBeNull();
    });

    test('animation in hold phase returns transition: null', () => {
      const anim: Animation = {
        keyframes: [{ value: [0], holdMs: 2000 }],
        loop: false,
      };
      const info = getUtil().evalSegmentInfo(anim, 0, 500);
      expect(info.value).toEqual([0]);
      expect(info.transition).toBeNull();
    });

    test('animation in linear transition returns segment info', () => {
      const anim: Animation = {
        keyframes: [
          { value: [0] },
          { value: [1], transitionMs: 2000 },
        ],
        loop: false,
      };
      // tElapsed=1000: halfway through 2s fade
      const info = getUtil().evalSegmentInfo(anim, 0, 1000);
      expect(info.value).toEqual([0.5]);
      expect(info.transition).not.toBeNull();
      expect(info.transition!.sFrom).toEqual([0]);
      expect(info.transition!.sTo).toEqual([1]);
      expect(info.transition!.totalMs).toBe(2000);
      expect(info.transition!.elapsedMs).toBe(1000);
      expect(info.transition!.isStep).toBe(false);
    });

    test('animation in step transition returns transition: null (no hardware fade needed)', () => {
      const anim: Animation = {
        keyframes: [
          { value: [0] },
          { value: [1], holdMs: 2000, hard: true },
        ],
        loop: false,
      };
      const info = getUtil().evalSegmentInfo(anim, 0, 500);
      expect(info.transition).toBeNull();
    });
  });

  describe('flattenLayers', () => {
    // Construct a 2s looping fade from [0] to [1] directly (bypassing the parser)
    function makeFade2s(): Animation {
      return {
        keyframes: [
          { value: [0] },
          { value: [1], transitionMs: 2000 },
        ],
        loop: true,
      };
    }

    test('animation timing is relative to tAssign, not tNow', () => {
      // fade [0]→[1] over 2s, assigned at t=1000, evaluated at t=2000
      // elapsed = 1000ms = halfway through 2s fade → ~[0.5]
      const scene: Scene = { alice: makeFade2s() };
      const result = getUtil().flattenLayers([{ scene, setTimestamp: 1000 }], 2000);
      const val = result['alice'] as number[];
      expect(Array.isArray(val)).toBe(true);
      expect(val[0]).toBeCloseTo(0.5, 1);
    });

    test('two layers with different setTimestamps animate independently', () => {
      // Same tNow=1000, same 2s fade, but different tAssign:
      // alice: tAssign=0  → elapsed=1000ms → 50% → [0.5]
      // bob:   tAssign=500 → elapsed=500ms  → 25% → [0.25]
      const scene1: Scene = { alice: makeFade2s() };
      const scene2: Scene = { bob: makeFade2s() };
      const result = getUtil().flattenLayers(
        [
          { scene: scene1, setTimestamp: 0 },
          { scene: scene2, setTimestamp: 500 },
        ],
        1000,
      );
      const alice = result['alice'] as number[];
      const bob = result['bob'] as number[];
      expect(alice[0]).toBeCloseTo(0.5, 1);
      expect(bob[0]).toBeCloseTo(0.25, 1);
    });
  });
});
