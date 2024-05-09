const util = require('./apply-light-scene-2.js');

test('rgb string to vector: plain white', () => {
    expect(util.getRgbVectorFromRgbString('ff')).toEqual([1]);
});

test('rgb string to vector: cold white', () => {
    expect(util.getRgbVectorFromRgbString('00ff')).toEqual([0, 1]);
});

test('rgb string to vector: red', () => {
    expect(util.getRgbVectorFromRgbString('ff0000')).toEqual([1, 0, 0]);
});

test('rgb string to vector: purple', () => {
    expect(util.getRgbVectorFromRgbString('FF0033')).toEqual([1, 0, .2]);
});

test('white to hsl', () => {
    expect(util.getHueSaturationLightnessFromRgb([1, 1, 1])).toEqual([0, 0, 1]);
});

test('black to hsl', () => {
    expect(util.getHueSaturationLightnessFromRgb([0, 0, 0])).toEqual([0, 0, 0]);
});

test('red to hsl', () => {
    expect(util.getHueSaturationLightnessFromRgb([1, 0, 0])).toEqual([0, 1, .5]);
});

test('basic, named scene from string', () => {
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

test('basic scene from string', () => {
    const scene = util.getSceneFromString('alice:ff0000 bob:ff claire:null dave:00ff eddie:on fiona:off');
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
    const scene = util.getSceneFromString('alice in wonderland: ff0000 bob george:ff claire danes:null dave fitzwilliam:00ff');
    expect(scene).toEqual({
        'alice in wonderland': [0, 1, .5],
        'bob george': [1],
        'claire danes': null,
        'dave fitzwilliam': [0, 1]
    });
});

test('layer scenes', () => {
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
    const actual = util.flattenStack(stack, ['one', 'two', 'three']);
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
    const actual = util.flattenStack(stack, ['one', 'three', 'two']);
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
    const actual = util.flattenStack(stack, ['one', 'three', 'two', 'four']);
    expect(actual).toEqual({
        alice: null,
        bob: [0.8],
        claire: null,
        dave: [0, 1]
    });
});

test('order scene lights by arrangement', () => {
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