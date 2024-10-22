import LightLayers from './lightlayers.js';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';

function getUtil() : LightLayers {
    return new LightLayers(((null as unknown) as HomeyAPI.ManagerDevices), ((null as unknown) as HomeyAPI.ManagerLogic));
}

test('rgb string to vector: plain white', () => {
    expect(getUtil().getRgbVectorFromRgbString('ff')).toEqual([1]);
});

test('rgb string to vector: cold white', () => {
    expect(getUtil().getRgbVectorFromRgbString('00ff')).toEqual([0, 1]);
});

test('rgb string to vector: red', () => {
    expect(getUtil().getRgbVectorFromRgbString('ff0000')).toEqual([1, 0, 0]);
});

test('rgb string to vector: blue', () => {
    expect(getUtil().getRgbVectorFromRgbString('0000ff')).toEqual([0, 0, 1]);
});

test('rgb string to vector: purple', () => {
    expect(getUtil().getRgbVectorFromRgbString('FF0033')).toEqual([1, 0, .2]);
});

test('white to hsl', () => {
    expect(getUtil().getHueSaturationLightnessFromRgb([1, 1, 1])).toEqual([0, 0, 1]);
});

test('black to hsl', () => {
    expect(getUtil().getHueSaturationLightnessFromRgb([0, 0, 0])).toEqual([0, 0, 0]);
});

test('red to hsl', () => {
    expect(getUtil().getHueSaturationLightnessFromRgb([1, 0, 0])).toEqual([0, 1, .5]);
});

test('blue to hsl', () => {
    expect(getUtil().getHueSaturationLightnessFromRgb([0, 0, 1])).toEqual([2. / 3, 1, .5]);
});

test('basic, named scene from string', () => {
    var util = getUtil();
    const [name, sceneString] = util.getNamedSceneFromString('døgn: alice:ff0000 bob:ff claire:null dave:00ff');
    const scene = util.getSceneFromString(sceneString);
    expect(name).toBe('døgn');
    expect(scene).toEqual({
        alice: [0, 1, .5],
        bob: [1],
        claire: null,
        dave: [0, 1]
    });
});

test('basic, named scene from string, w/o spaces', () => {
    var util = getUtil();
    const [name, sceneString] = util.getNamedSceneFromString('effekt:alice:ff0000 bob:ff claire:null dave:00ff');
    const scene = util.getSceneFromString(sceneString);
    expect(name).toBe('effekt');
    expect(scene).toEqual({
        alice: [0, 1, .5],
        bob: [1],
        claire: null,
        dave: [0, 1]
    });
});

test('single-entry, named scene from string, w/o spaces', () => {
    var util = getUtil();
    const [name, sceneString] = util.getNamedSceneFromString('effekt:Luftballong:0000ff');
    const scene = util.getSceneFromString(sceneString);
    expect(name).toBe('effekt');
    expect(scene).toEqual({
        Luftballong: [2. / 3, 1, .5]
    });
});

test('empty, named scene from string, w/o spaces', () => {
    var util = getUtil();
    const [name, sceneString] = util.getNamedSceneFromString('effekt:');
    const scene = util.getSceneFromString(sceneString);
    expect(name).toBe('effekt');
    expect(scene).toEqual({});
});

test('basic scene from string', () => {
    const scene = getUtil().getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff eddie:on fiona:off');
    expect(scene).toEqual({
        alice: [0, 1, .5],
        bob: [1],
        claire: null,
        dave: [0, 1],
        eddie: true,
        fiona: false
    });
});

test('basic scene from string with spaces', () => {
    const scene = getUtil().getSceneFromString('alice in wonderland: ff0000 bob george:ff claire danes:null dave fitzwilliam:00ff');
    expect(scene).toEqual({
        'alice in wonderland': [0, 1, .5],
        'bob george': [1],
        'claire danes': null,
        'dave fitzwilliam': [0, 1]
    });
});

test('layer scenes', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff');
    const modifier = util.getSceneFromString('alice:null bob:cc');
    const actual = util.layerScenes(base, modifier);
    expect(actual).toEqual({
        alice: null,
        bob: [0.8],
        claire: null,
        dave: [0, 1]
    });
});

test('flatten, three layers, basic', () => {
    const stack = {
        'one': 'alice:ff0000 bob:ff claire:null dave:00ff',
        'two': 'alice:null bob:cc',
        'three': 'bob:00ff'
    }    
    const actual = getUtil().flattenStack(stack, ['one', 'two', 'three']);
    expect(actual).toEqual({
        alice: null,
        bob: [0, 1],
        claire: null,
        dave: [0, 1]
    });
});

test('flatten with last two levels swapped', () => {
    const stack = {
        'one': 'alice:ff0000 bob:ff claire:null dave:00ff',
        'two': 'alice:null bob:cc',
        'three': 'bob:00ff'
    }    
    const actual = getUtil().flattenStack(stack, ['one', 'three', 'two']);
    expect(actual).toEqual({
        alice: null,
        bob: [0.8],
        claire: null,
        dave: [0, 1]
    });
});

test('flatten missing data for one priority level', () => {
    const stack = {
        'one': 'alice:ff0000 bob:ff claire:null dave:00ff',
        'two': 'alice:null bob:cc',
        'three': 'bob:00ff'
    }    
    const actual = getUtil().flattenStack(stack, ['one', 'three', 'two', 'four']);
    expect(actual).toEqual({
        alice: null,
        bob: [0.8],
        claire: null,
        dave: [0, 1]
    });
});

test('order scene lights by arrangement', () => {
    var util = getUtil();
    const scene = util.getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff');
    const arrangement = [['bob', 'alice'], ['dave'], ['claire']];
    const orderedScene = util.getSceneOrdering(scene, arrangement);
    expect(orderedScene).toEqual([
        {
            bob: [1],
            alice: [0, 1, .5]
        },
        {dave: [0, 1]},
        {claire: null},
    ]);
});

test('order scene lights by incomplete arrangement', () => {
    var util = getUtil();
    const scene = util.getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff');
    const arrangement = [['bob', 'alice'], ['claire']];
    const orderedScene = util.getSceneOrdering(scene, arrangement);
    expect(orderedScene).toEqual([
        {
            bob: [1],
            alice: [0, 1, .5]
        },
        {claire: null},
        {dave: [0, 1]},
    ]);
});

test('order incomplete scene lights by arrangement', () => {
    var util = getUtil();
    const scene = util.getSceneFromString('alice:ff0000 bob:ff dave:00ff');
    const arrangement = [['bob', 'alice'], ['claire']];
    const orderedScene = util.getSceneOrdering(scene, arrangement);
    expect(orderedScene).toEqual([
        {
            bob: [1],
            alice: [0, 1, .5]
        },
        {dave: [0, 1]},
    ]);
});

test('changes with smaller after set', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff');
    const modifier = util.getSceneFromString('alice:null bob:cc');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual({
        alice: null,
        bob: [0.8]
    });
});

test('changes with larger after set', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff');
    const modifier = util.getSceneFromString('alice:null bob:ff claire:ffffff');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual({
        alice: null,
        claire: [0, 0, 1]
    });
});

test('changes with empty after set', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff');
    const modifier = util.getSceneFromString('');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual({});
});