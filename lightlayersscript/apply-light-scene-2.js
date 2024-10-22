/**
 * Break apart scene into stages according to the given arrangement.
 * @param {object} scene Scene object with light names as keys and light setup as values.
 * @param {array} arrangement List of lists of light names in the order to compile them. Lights not in any list are placed last.
 * @returns {array} List of scenes.
 */
function getSceneOrdering(scene, arrangement) {
    const orderedScene = [];

    const coveredLights = new Set();
    for (const group of arrangement) {
        const orderedGroup = {};
        for (const lightName of group) {
            if (scene[lightName] !== undefined) {
                orderedGroup[lightName] = scene[lightName];
                coveredLights.add(lightName);
            }
        }
        if (Object.keys(orderedGroup).length > 0) {
            orderedScene.push(orderedGroup);
        }
    }

    if (coveredLights.size < Object.keys(scene).length) {
        const lastGroup = {};
        for (const lightName in scene) {
            if (!coveredLights.has(lightName)) {
                lastGroup[lightName] = scene[lightName];
            }
        }
        orderedScene.push(lastGroup);
    }

    return orderedScene;
}

/**
 * Compute aggregate scene by overlaying one scene on top of another.
 * @param {object} base Base scene
 * @param {object} modifier Scene to add on top
 */
function layerScenes(base, modifier) {
    const result = { ...base };
    for (const lightName in modifier) {
        result[lightName] = modifier[lightName];
    }
    return result;
}

/**
 * Compute final light values given a stack of scenes and a priority list.
 * @param {object} stack dictionary of scene names to string scene definitions.
 * @param {string} priorities list of scene names in the order to compile them.
 */
function flattenStack(stack, priorities) {
    let result = {};
    for (const sceneName of priorities) {
        const sceneString = stack[sceneName];
        if (sceneString !== undefined) {
            const scene = getSceneFromString(sceneString);
            result = layerScenes(result, scene);
        }
    }
    return result;
}

/**
 * @param {string} namedSceneString Scene name, colon, then a full scene string.
 * @returns {array} Scene name, then the scene string.
 */
function getNamedSceneFromString(namedSceneString) {
    const matches = namedSceneString.match(/\s*(\S+?)\s*:(.*)/);
    const name = matches[1];
    const sceneString = matches[2];
    return [name, sceneString];
}
  
/**
 * @param {string} sceneString List of light names and colors in the format "light 1:color1 light 2:color2 ..."
 * Colors are hexadecimal strings representing RGB colors, or null to turn off the light.
 * @returns {object} Scene object with light names as keys and HSL color vectors, temperature/lightness pairs, or just lightness as values.
 */
function getSceneFromString(sceneString) {
    const scene = {};
    
    // Parse into light names and colors; lights can have spaces, colors cannot.
    const groups = sceneString.split(':');

    // First element in each group is a color, the rest is the light name.
    // Exception: The first group has only a light name, the last group has only a color.
    lightName = groups[0].trim();
    for (let i = 1; i < groups.length; i++) {
        // Parse out the first word using regexp
        const matches = groups[i].match(/\s*(\S+)(:?\s+(.+))?/);
        const colorString = matches[1];
        const nextLightName = matches[3]
        //const [colorString, ...nextLightNameSegments] = groups[i].split(' ');
        if (colorString === 'null') {
            scene[lightName] = null;
        } else if (colorString === 'on') {
            scene[lightName] = true;
        } else if (colorString === 'off') {
            scene[lightName] = false;
        } else {
            const rgb = getRgbVectorFromRgbString(colorString);
            if (rgb.length === 3) {
                const color = getHueSaturationLightnessFromRgb(rgb);
                scene[lightName] = color;
            } else {
                scene[lightName] = rgb;
            } 
        }
        
        lightName = nextLightName;
    }
    return scene;
}

/**
 * @param {string} rgbOrTemperatureLightnessOrLightness Hexadecimal string representing an RGB color (if 6 digits),
 * or a decimal string representing a color temperature (if 4 digits), or a decimal string representing a lightness (if 2 digits).
 * @returns {number[]} Array of three numbers in range 0 to 1 representing red, green and blue components of the color.
 */
function getRgbVectorFromRgbString(rgb) {
    if (rgb.length === 6) {
        const r = parseInt(rgb.substring(0, 2), 16) / 255;
        const g = parseInt(rgb.substring(2, 4), 16) / 255;
        const b = parseInt(rgb.substring(4, 6), 16) / 255;
        return [r, g, b];
    } else if (rgb.length === 4) {
        const temperature = parseInt(rgb.substring(0, 2), 16) / 255;
        const lightness = parseInt(rgb.substring(2, 4), 16) / 255;
        return [temperature, lightness];
    } else if (rgb.length === 2) {
        const lightness = parseInt(rgb.substring(0, 2), 16) / 255;
        return [lightness]
    } else {
        throw new Error('Invalid RGB string: ' + rgb);
    }
}

/**
 * @param {number[]} rgb Array of three numbers in range 0 to 1 representing red, green and blue components of the color.
 * @returns {number[]} Array of three numbers in range 0 to 1 representing hue, saturation and lightness components of the color.
 */
function getHueSaturationLightnessFromRgb(rgb) {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;

    if (d === 0) {
        // achromatic
        h = 0;
        s = 0;
    } else {
        if (max == r) {
            h = 60 * (((g - b) / d) % 6);
        } else if (max == g) {
            h = 60 * (((b - r) / d) + 2);
        } else if (max == b) {
            h = 60 * (((r - g) / d) + 4);
        }

        s = d / (1 - Math.abs(2 * l - 1));
    }

    // normalize hue to [0, 1]
    return [h / 360, s, l];
}

// -----------------
// Node.js specifics
// -----------------

/**
module.exports = { 
    getRgbVectorFromRgbString, 
    getHueSaturationLightnessFromRgb,
    getSceneFromString, 
    layerScenes, 
    flattenStack, 
    getNamedSceneFromString,
    getSceneOrdering
};
/**/

// ---------------------
// HomeyScript specifics
// ---------------------

const sceneStackVariableName = 'Tilstand: Aktive Scener'
const scenePriorityVariableName = 'Grenser: Sceneprioritet'
const sceneArrangementVariableName = 'Grenser: Lysrekkefølge'

async function findVariable(name) {
    const vars = await Homey.logic.getVariables(); 
    const controlValue = _.find(vars, (o) => o.name === name);
    if (controlValue === undefined) {
      throw new Error(`Control variable ${name} missing.`)
    }

    if (controlValue.type !== 'string') {
      throw new Error(`Control variable ${name} (${controlValue.type}) is not a string.`)
    }

    return controlValue;
}

async function getVariable(name) {
    const controlValue = await findVariable(name);
    log('Variable ', name, '=', controlValue.value);
    return controlValue.value
}

async function getJsonVariable(name) {
    return JSON.parse(await getVariable(name));
}

async function setVariable(name, value) {
    const controlValue = await findVariable(name);

    const newValue = JSON.stringify(value)
    log('Variable ', name, '=', newValue);

    await Homey.logic.updateVariable({id: controlValue.id, variable: {value: newValue}}) 
}

/**
 * Get scene priorities from global variable.
 */
async function getScenePriorities() {
  return getJsonVariable(scenePriorityVariableName);
}

/**
 * Get scene stack from global variable.
 */
async function getSceneStack() {
  return getJsonVariable(sceneStackVariableName);
}

/**
 * Get scene arrangement from global variable.
 */
async function getSceneArrangement() {
  return getJsonVariable(sceneArrangementVariableName);
}

/**
 * Assign scene stack to global variable.
 * 
 * @param {object} newStack Scene stack to assign.
 */
async function setSceneStack(newStack) {
  await setVariable(sceneStackVariableName, newStack);
}

/**
 * Get script argument.
 */
async function getArg() {
    if (args.length == 1) {
        if (typeof args[0] !== 'string') {
            throw new Error('This script must be run from a Flow!');
        }
        return args[0]
    } else {
        return 'døgn: ' + await getVariable(true ? 'Scene: Stue_natt' : 'Scene: StuKj_Levedlys');
    }
}

/**
 * Set scalar capability value.
 */
async function setCapabilityFloat(device, capabilityName, value) {
    const capability = device.capabilitiesObj[capabilityName];
    const scaledValue = value * (capability.max - capability.min) + capability.min;
    const description = `${device.name} ${capability.id} to ${value} (=${scaledValue}${capability.unit ?? ''}; range [${capability.min}, ${capability.max}])`

    try {
        await device.setCapabilityValue(capabilityName, scaledValue);
        log(`OK: ${description}`);
    } catch (error) {
        log(`Error: ${description}: ${error}`);
    }
}

/**
 * Set on/off
 */
async function setOnOff(device, on) {
    try {
        await device.setCapabilityValue('onoff', on);
        log(`OK: ${device.name} ${on ? 'on' : 'off'}`);
    } catch (error) {
        log(`Error: ${device.name} ${on ? 'on' : 'off'}: ${error}`);
    }
}

async function applySetting(device, setting) {
    log(`Applying ${setting} to ${device.name}...`);

    if (setting === null) {
        await setOnOff(device, false)
    } else if (setting === true || setting === false) {
        await setOnOff(device, setting);
    } else if (setting.length == 3) {
        const [h, s, l] = setting;
        await Promise.all([setOnOff(device, l > 0.01),
            setCapabilityFloat(device, 'dim', l),
            setCapabilityFloat(device, 'light_hue', h),
            setCapabilityFloat(device, 'light_saturation', s)]);
    } else if (setting.length == 2) {
        const [l, t] = setting;
        await Promise.all([setOnOff(device, l > 0.01),
            setCapabilityFloat(device, 'dim', l),
            setCapabilityFloat(device, 'light_temperature', t)]);
    } else if (setting.length == 1) {
        const [l] = setting;
        await Promise.all([setOnOff(device, l > 0.01),
            setCapabilityFloat(device, 'dim', l)]);
    }
}

/**
 * Apply light settings to each light in the scene.
 * @param {lights} array of lights
 * @param {object} scene Light settings
 */
async function applyScene(lights, scene) {
    const jobs = [];

    for (const device of lights) {
        const setting = scene[device.name]
        if (setting === undefined) {
            continue;
        }
    
        jobs.push(applySetting(device, setting));
    }

    await Promise.all(jobs);

    log('Done!');
}

async function getLights() {
    const devices = await Homey.devices.getDevices();
    const lights = [];

    for (const device of Object.values(devices)) {
        // If this device is a light (class)
        // Or this is a 'What's plugged in?'-light (virtualClass)
        if (device.class === 'light' || device.virtualClass === 'light') {
            lights.push(device);
        }                
    }

    return lights;
}

/**

// TEST

const stack = {}
//stack['døgn'] = 'Taklys Stue:ff00'
//stack['døgn'] = 'Skrivebord Stue:null'
stack['effekt'] = 'Luftballong:0000ff'
log('Stack is ', stack);

const priorities = await getScenePriorities();
log('Priorities is ', priorities);

const final = flattenStack(stack, priorities)
log('Flattened scene stack is ', final);

const lights = await getLights();
await applyScene(lights, final);

/**/

// Actual

const namedSceneString = await getArg();

const stack = await getSceneStack();
log('Stack was ', stack);

const [name, sceneString] = getNamedSceneFromString(namedSceneString);
stack[name] = sceneString;
await setSceneStack(stack);
log('Stack is ', stack);

const priorities = await getScenePriorities();
log('Priorities is ', priorities);

const final = flattenStack(stack, priorities)
log('Flattened scene stack is ', final);

const sleep = (durationMs) => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), durationMs);
  });
}

const lights = await getLights();
const spreadMs = 100
if (spreadMs == 0) {
    await applyScene(lights, final);
} else {
    const arrangement = await getSceneArrangement();
    const stages = getSceneOrdering(final, arrangement);
    // Apply stages with a small delay after, except the last one.
    const jobs = [];
    stageIndex = 0
    for (const stage of stages) { 
        const stageTime = stageIndex * spreadMs;
        const applyStage = async () => {
            await wait(stageTime);
            log(`Stage at ${stageTime} ms`, stage);
            await applyScene(lights, stage);
        }
        jobs.push(applyStage());
        ++stageIndex;
    }
    log(`made ${jobs.length} jobs`);
    await Promise.all(jobs);
}
/**/