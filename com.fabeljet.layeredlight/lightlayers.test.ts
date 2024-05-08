import { assert } from 'console';
import LightLayers, { LightLayersConfig } from './lightlayers.ts';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';

function getUtil() : LightLayers {
    const config = new LightLayersConfig(((null as unknown) as HomeyAPI.ManagerDevices), 
        ((null as unknown) as HomeyAPI.ManagerLogic),
        ((null as unknown) as any));
    return new LightLayers(config);
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
    const [name, sceneString] = util.getNamedSceneFromString('døgn: alice:ff0000 bob:ff claire:off dave:00ff');
    const scene = util.getSceneFromString(sceneString);
    expect(name).toBe('døgn');
    expect(scene).toEqual({
        alice: [0, 1, .5],
        bob: [1],
        claire: false,
        dave: [0, 1]
    });
});

test('basic, named scene from string, w/o spaces', () => {
    var util = getUtil();
    const [name, sceneString] = util.getNamedSceneFromString('effekt:alice:ff0000 bob:ff claire:off dave:00ff');
    const scene = util.getSceneFromString(sceneString);
    expect(name).toBe('effekt');
    expect(scene).toEqual({
        alice: [0, 1, .5],
        bob: [1],
        claire: false,
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
    const scene = getUtil().getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff eddie:on fiona:off');
    expect(scene).toEqual({
        alice: [0, 1, .5],
        bob: [1],
        claire: false,
        dave: [0, 1],
        eddie: true,
        fiona: false
    });
});

test('basic scene from string with spaces', () => {
    const scene = getUtil().getSceneFromString('alice in wonderland: ff0000 bob george:ff claire danes:off dave fitzwilliam:00ff');
    expect(scene).toEqual({
        'alice in wonderland': [0, 1, .5],
        'bob george': [1],
        'claire danes': false,
        'dave fitzwilliam': [0, 1]
    });
});

test('layer scenes', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff');
    const modifier = util.getSceneFromString('alice:off bob:cc');
    const actual = util.layerScenes(base, modifier);
    expect(actual).toEqual({
        alice: false,
        bob: [0.8],
        claire: false,
        dave: [0, 1]
    });
});

test('merge scenes with clears', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff');
    const modifier = util.getSceneFromString('alice:off bob:null');
    const actual = util.layerScenes(base, modifier);
    expect(actual).toEqual({
        alice: false,
        claire: false,
        dave: [0, 1]
    });
});

function makeStackEntry(scene : string) : string {
    return getUtil().getJsonFromScene(getUtil().getSceneFromString(scene));
}

function makeStack(stack : {[key: string]: string}) : {[key: string]: string} {
    const result : {[key: string]: string} = {};
    for (const key in stack) {
        result[key] = makeStackEntry(stack[key]);
    }
    return result;
}

test('flatten, three layers, basic', () => {
    const stack = makeStack({
        'one': 'alice:ff0000 bob:ff claire:off dave:00ff',
        'two': 'alice:off bob:cc',
        'three': 'bob:00ff'
    })    
    const actual = getUtil().flattenStack(stack, ['one', 'two', 'three']);
    expect(actual).toEqual({
        alice: false,
        bob: [0, 1],
        claire: false,
        dave: [0, 1]
    });
});

test('flatten, three layers, with clears', () => {
    const stack = makeStack({
        'one': 'alice:ff0000 bob:ff claire:off dave:00ff',
        'two': 'alice:off bob:null',
        'three': 'alice:null bob:00ff'
    })    
    const actual = getUtil().flattenStack(stack, ['one', 'two', 'three']);
    expect(actual).toEqual({
        bob: [0, 1],
        claire: false,
        dave: [0, 1]
    });
});

test('flatten with last two levels swapped', () => {
    const stack = makeStack({
        'one': 'alice:ff0000 bob:ff claire:off dave:00ff',
        'two': 'alice:off bob:cc',
        'three': 'bob:00ff'
    })
    const actual = getUtil().flattenStack(stack, ['one', 'three', 'two']);
    expect(actual).toEqual({
        alice: false,
        bob: [0.8],
        claire: false,
        dave: [0, 1]
    });
});

test('flatten missing data for one priority level', () => {
    const stack = makeStack({
        'one': 'alice:ff0000 bob:ff claire:off dave:00ff',
        'two': 'alice:off bob:cc',
        'three': 'bob:00ff'
    })    
    const actual = getUtil().flattenStack(stack, ['one', 'three', 'two', 'four']);
    expect(actual).toEqual({
        alice: false,
        bob: [0.8],
        claire: false,
        dave: [0, 1]
    });
});

test('flatten morning before 1', () => {
    const stack = makeStack({
        "døgn":"Astrid Tak:off Skrivebord A:off Les nede A:off",
        "effekt":"",
        "stuekj":"  ",
        "stue":""
    })
    const actual = getUtil().flattenStack(stack, ["basis", "døgn", "stuekj", "effekt"]);
    expect(actual).toEqual({
        "Astrid Tak": false,
        "Skrivebord A": false,
        "Les nede A": false
    });
});

function toArray(description : string) : number[]|boolean|null {
    const util = getUtil();
    if (description == 'on') {
        return true;
    } else if (description == 'off') {
        return false;
    } else if (description == 'null') {
        return null;
    }

    const vector = util.getRgbVectorFromRgbString(description);
    if (vector.length == 3) {
        return util.getHueSaturationLightnessFromRgb([vector[0], vector[1], vector[2]]);
    } 
    
    return vector;
}

test('flatten morning before 2', () => {
    const stack = makeStack({
        "døgn":'Kjøkkenbenk Ytre:off Kjøkkenbenk Indre:off Kjøkkenbenk Midt:1900 S sterk:off ' +
        'Kjøkkenbord:off Veggkalender:off Taklys Stue:off Piano:off Skrivebord Stue:off Gang indre 2:1900 Gang Yttre (Wiz):0A00 ' +
        'Leselampe J:CC Stålampe Stue:off Skatoll:off Soverom Tak:off Flomlys:off Edderkoppspot:off Ladestrøm Steinar:off Luftballong:000088 ' +
        'Bokspot:off Overbygd terrasse:off',
        "effekt":"",
        "stuekj":"  ",
        "stue":""
    })
    const util = getUtil();
    const actual = util.flattenStack(stack, ["basis", "døgn", "stuekj", "effekt"]);
    expect(actual).toEqual({
        'Kjøkkenbenk Ytre': false, 
        'Kjøkkenbenk Indre': false, 
        'Kjøkkenbenk Midt': toArray('1900'), 
        'S sterk': false, 
        'Kjøkkenbord': false, 
        'Veggkalender': false, 
        'Taklys Stue': false, 
        'Piano': false, 
        'Skrivebord Stue': false, 
        'Gang indre 2': toArray('1900'), 
        'Gang Yttre (Wiz)': toArray('0A00'), 
        'Leselampe J': toArray('CC'), 
        'Stålampe Stue': false, 
        'Skatoll': false, 
        'Soverom Tak': false, 
        'Flomlys': false, 
        'Edderkoppspot': false, 
        'Ladestrøm Steinar': false, 
        'Luftballong': toArray('000088'), 
        'Bokspot': toArray('off'),
        'Overbygd terrasse': toArray('off')
    });
});

test('order scene lights by arrangement', () => {
    var util = getUtil();
    const scene = util.getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff');
    const arrangement = [['bob', 'alice'], ['dave'], ['claire']];
    const orderedScene = util.getSceneOrdering(scene, arrangement);
    expect(orderedScene).toEqual([
        {
            bob: [1],
            alice: [0, 1, .5]
        },
        {dave: [0, 1]},
        {claire: false},
    ]);
});

test('order scene lights by incomplete arrangement', () => {
    var util = getUtil();
    const scene = util.getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff');
    const arrangement = [['bob', 'alice'], ['claire']];
    const orderedScene = util.getSceneOrdering(scene, arrangement);
    expect(orderedScene).toEqual([
        {
            bob: [1],
            alice: [0, 1, .5]
        },
        {claire: false},
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
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff');
    const modifier = util.getSceneFromString('alice:off bob:cc');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual({
        alice: false,
        bob: [0.8]
    });
});

test('changes with larger after set', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff');
    const modifier = util.getSceneFromString('alice:off bob:ff claire:ffffff');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual({
        alice: false,
        claire: [0, 0, 1]
    });
});

test('changes with empty after set', () => {
    var util = getUtil();
    const base = util.getSceneFromString('alice:ff0000 bob:ff claire:off dave:00ff');
    const modifier = util.getSceneFromString('');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual({});
});

test('changes in the morning', () => {
    var util = getUtil();
    const base = util.getSceneFromString('Kjøkkenbenk Ytre:off Kjøkkenbenk Indre:off Kjøkkenbenk Midt:1900 S sterk:off ' +
        'Kjøkkenbord:off Veggkalender:off Taklys Stue:off Piano:off Skrivebord Stue:off Gang indre 2:1900 Gang Yttre (Wiz):0A00 ' +
        'Leselampe J:CC Stålampe Stue:off Skatoll:off Soverom Tak:off Flomlys:off Edderkoppspot:off Ladestrøm Steinar:off Luftballong:000088 ' +
        'Bokspot:off Overbygd terrasse:off');
    
    const modifier = util.getSceneFromString('Kjøkkenbenk Ytre:FFBF Kjøkkenbenk Indre:FF7F Kjøkkenbenk Midt:FF7F Kjøkkenbord:FF7F Hjørne stue:on ' +
        'Veggkalender:B2 Taklys Stue:FF7F Piano:FF Skrivebord Stue:FF Gang indre 2:FFBF Gang Yttre (Wiz):FFBF Stålampe Stue:FF Flomlys:FF ' +
        'Luftballong:ffffaa Bokspot:BB Leselampe J:FF Skatoll:FF Soverom Tak:FFBF Overbygd terrasse:off');
    
    const expected = util.getSceneFromString('Kjøkkenbenk Ytre:FFBF Kjøkkenbenk Indre:FF7F Kjøkkenbenk Midt:FF7F Kjøkkenbord:FF7F Hjørne stue:on ' +
        'Veggkalender:B2 Taklys Stue:FF7F Piano:FF Skrivebord Stue:FF Gang indre 2:FFBF Gang Yttre (Wiz):FFBF Stålampe Stue:FF Flomlys:FF ' +
        'Luftballong:ffffaa Bokspot:BB Leselampe J:FF Skatoll:FF Soverom Tak:FFBF');

    const actual = util.getChanges(base, modifier); 
    expect(actual).toEqual(expected);
});

test('changes in the evening', () => {
    var util = getUtil();
    const base = util.getSceneFromString('Astrid Tak:off Skrivebord A:off Les nede A:off');
    const modifier = util.getSceneFromString('Kjøkkenbenk Ytre:FFBF Kjøkkenbenk Indre:FF7F Kjøkkenbenk Midt:FF7F Kjøkkenbord:FF7F Hjørne stue:on ' +
        'Veggkalender:B2 Taklys Stue:FF7F Piano:FF Skrivebord Stue:FF Gang indre 2:FFBF Gang Yttre (Wiz):FFBF Stålampe Stue:FF Flomlys:FF ' +
        'Luftballong:ffffaa Bokspot:BB Leselampe J:FF Skatoll:FF Soverom Tak:FFBF Overbygd terrasse:off');
    const actual = util.getChanges(base, modifier);
    expect(actual).toEqual(modifier);
});