// I want to use HomeyAPIV3Local, but there doesn't seem to be any ways of controlling anything with that;
// the older API seems to be the only way. It's weird.
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import _ from 'lodash';

const sceneStackVariableName = 'Tilstand: Aktive Scener'
const scenePriorityVariableName = 'Grenser: Sceneprioritet'
const sceneArrangementVariableName = 'Grenser: Lysrekkefølge'

function log(message : string, ...optionalParams : any[]) {
    console.log(message, ...optionalParams);
}

/**
 * Wait for a number of milliseconds.
 * @param {number} durationMs Number of milliseconds to wait.
 */
function wait(durationMs : number) : Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), durationMs);
    });
}

interface Scene {
    [key: string]: number[]|boolean|null;
}

interface SceneStringStack {
    [key: string]: string;
}

interface CapabilitiesObj {
    [key: string]: HomeyAPI.ManagerDevices.Capability;
}

class LightLayers {
    devices : HomeyAPI.ManagerDevices;
    logic : HomeyAPI.ManagerLogic;

    constructor(devices : HomeyAPI.ManagerDevices, logic : HomeyAPI.ManagerLogic) {
        this.devices = devices;
        this.logic = logic;
    }

    /**
     * Break apart scene into stages according to the given arrangement.
     * @param {object} scene Scene object with light names as keys and light setup as values.
     * @param {array} arrangement List of lists of light names in the order to compile them. Lights not in any list are placed last.
     * @returns {array} List of scenes.
     */
    getSceneOrdering(scene : Scene, arrangement : string[][]) : Scene[] {
        const orderedScene : Scene[] = [];

        const coveredLights = new Set();
        for (const group of arrangement) {
            const orderedGroup : Scene = {};
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
            const lastGroup : Scene = {};
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
    layerScenes(base : Scene, modifier : Scene) : Scene {
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
    flattenStack(stack : SceneStringStack, priorities : string[]) : Scene {
        let result = {};
        for (const sceneName of priorities) {
            const sceneString = stack[sceneName];
            if (sceneString !== undefined) {
                const scene = this.getSceneFromString(sceneString);
                result = this.layerScenes(result, scene);
            }
        }
        return result;
    }

    /**
     * @param {string} namedSceneString Scene name, colon, then a full scene string.
     * @returns {array} Scene name, then the scene string.
     */
    getNamedSceneFromString(namedSceneString : string) : [string, string]|null {
        const matches : RegExpMatchArray|null = namedSceneString.match(/\s*(\S+?)\s*:(.*)/);
        if (matches === null) {
            return null;
        }

        const name = matches[1];
        const sceneString = matches[2];
        return [name, sceneString];
    }
    
    /**
     * @param {string} sceneString List of light names and colors in the format "light 1:color1 light 2:color2 ..."
     * Colors are hexadecimal strings representing RGB colors, or null to turn off the light.
     * @returns {object} Scene object with light names as keys and HSL color vectors, temperature/lightness pairs, or just lightness as values.
     */
    getSceneFromString(sceneString : string) : Scene {
        const scene : Scene = {};
        
        // Parse into light names and colors; lights can have spaces, colors cannot.
        const groups = sceneString.split(':');

        // First element in each group is a color, the rest is the light name.
        // Exception: The first group has only a light name, the last group has only a color.
        var lightName : string = groups[0].trim();
        for (let i = 1; i < groups.length; i++) {
            // Parse out the first word using regexp
            const matches : RegExpMatchArray|null = groups[i].match(/\s*(\S+)(:?\s+(.+))?/);
            if (matches === null) {
                throw new Error('Invalid scene string: ' + sceneString);
            }

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
                const rgb = this.getRgbVectorFromRgbString(colorString);
                if (rgb.length === 3) {
                    const color = this.getHueSaturationLightnessFromRgb(rgb as [number,number,number]);
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
    getRgbVectorFromRgbString(rgb : string) : number[] {
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
    getHueSaturationLightnessFromRgb(rgb : [number, number, number]) : [number, number, number] {
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        const l = (max + min) / 2;

        var h = 0;
        var s = 0;

        if (d === 0) {
            // achromatic
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

     // ---------------------
    // HomeyScript specifics
    // ---------------------

    async findVariable(name : string) : Promise<any> {//Promise<HomeyAPI.ManagerLogic.Variable> {
        const vars = await this.logic.getVariables();
        const controlValue = _.find(vars, (o : any) => o.name === name);
        if (controlValue === undefined) {
            throw new Error(`Control variable ${name} missing.`)
        }

        if (controlValue.type !== 'string') {
            throw new Error(`Control variable ${name} (${controlValue.type}) is not a string.`)
        }

        return controlValue;
    }

    async getVariable(name : string) : Promise<string> {
        const controlValue = await this.findVariable(name);
        log('Variable ', name, '=', controlValue.value);
        return controlValue.value
    }

    async getJsonVariable(name : string) : Promise<any> {
        return JSON.parse(await this.getVariable(name));
    }

    async setVariable(name : string, value : any) {
        const controlValue = await this.findVariable(name);

        const newValue = JSON.stringify(value)
        log('Variable ', name, ':=', newValue);

        try {
            await this.logic.updateVariable({id: controlValue.id, variable: {value: newValue}}) 
        } catch (error) {
            log(`Failed setting variable: ${error}`);
        }
    }

    /**
     * Get scene priorities from global variable.
     */
    async getScenePriorities() : Promise<string[]> {
        return await this.getJsonVariable(scenePriorityVariableName);
    }

    /**
     * Get scene stack from global variable.
     */
    async getSceneStack() : Promise<SceneStringStack> {
        return await this.getJsonVariable(sceneStackVariableName);
    }

    /**
     * Get scene arrangement from global variable.
     */
    async getSceneArrangement() : Promise<string[][]> {
        return await this.getJsonVariable(sceneArrangementVariableName);
    }

    /**
     * Assign scene stack to global variable.
     * 
     * @param {object} newStack Scene stack to assign.
     */
    async setSceneStack(newStack : SceneStringStack) {
        await this.setVariable(sceneStackVariableName, newStack);
    }

    /**
     * Set scalar capability value.
     */
    async setCapabilityFloat(device : HomeyAPI.ManagerDevices.Device, capabilityName : string, value : any) {
        var settings : any = await this.devices.getDeviceSettingsObj({ id: device.id });
        log(`Settings for ${device.name} is `, settings);

        const capability : any = (settings.capabilitiesOptions as CapabilitiesObj)[capabilityName];
        const scaledValue = value * (capability.max - capability.min) + capability.min;
        const description = `${device.name} ${capability.id} to ${value} (=${scaledValue}${capability.units ?? ''}; range [${capability.min}, ${capability.max}])`

        try {
            await device.setCapabilityValue({ capabilityId: capabilityName, value: scaledValue});
            log(`OK: ${description}`);
        } catch (error) {
            log(`Error: ${description}: ${error}`);
        }
    }

    /**
     * Set on/off
     */
    async setOnOff(device : HomeyAPI.ManagerDevices.Device, on : boolean) {
        try {
            await device.setCapabilityValue({ capabilityId: 'onoff', value: on });
            log(`OK: ${device.name} ${on ? 'on' : 'off'}`);
        } catch (error) {
            log(`Error: ${device.name} ${on ? 'on' : 'off'}: ${error}`);
        }
    }

    async applySetting(device : HomeyAPI.ManagerDevices.Device, setting : number[]|boolean|null) {
        log(`Applying ${setting} to ${device.name}...`);

        if (setting === null) {
            await this.setOnOff(device, false)
        } else if (setting === true || setting === false) {
            await this.setOnOff(device, setting);
        } else if (setting.length == 3) {
            const [h, s, l] = setting;
            await Promise.all([this.setOnOff(device, l > 0.01),
                this.setCapabilityFloat(device, 'dim', l),
                this.setCapabilityFloat(device, 'light_hue', h),
                this.setCapabilityFloat(device, 'light_saturation', s)]);
        } else if (setting.length == 2) {
            const [l, t] = setting;
            await Promise.all([this.setOnOff(device, l > 0.01),
                this.setCapabilityFloat(device, 'dim', l),
                this.setCapabilityFloat(device, 'light_temperature', t)]);
        } else if (setting.length == 1) {
            const [l] = setting;
            await Promise.all([this.setOnOff(device, l > 0.01),
                this.setCapabilityFloat(device, 'dim', l)]);
        }
    }

    /**
     * Apply light settings to each light in the scene.
     * @param {lights} array of lights
     * @param {object} scene Light settings
     */
    async applyScene(lights : HomeyAPI.ManagerDevices.Device[], scene : Scene) {
        const jobs = [];

        for (const device of lights) {
            const setting = scene[device.name]
            if (setting === undefined) {
                continue;
            }
        
            jobs.push(this.applySetting(device, setting));
        }

        await Promise.all(jobs);

        log('Done!');
    }

    async getLights() : Promise<HomeyAPI.ManagerDevices.Device[]> {
        const devices = await this.devices.getDevices();
        const lights : HomeyAPI.ManagerDevices.Device[] = [];

        for (const devicex of Object.values(devices)) {
            var device : any = devicex;
            var settings = this.devices.getDeviceSettingsObj({ id: device.id });
            log(`Settings for ${device.name} is `, settings);
    
            // If this device is a light (class)
            // Or this is a 'What's plugged in?'-light (virtualClass)
            if (device.class === 'light' || device.virtualClass === 'light') {
                lights.push(device);
            }                
        }

        return lights;
    }

    async applyNamedSceneString(layerName : string, sceneString : string, spreadMs : number, clear : boolean) {
        //const namedSceneString = await getArg();
        //const [name, sceneString] = getNamedSceneFromString(namedSceneString);

        log(`Operation: ${layerName} = ${sceneString} (spread ${spreadMs} ms, clear ${clear})`);

        const priorities = await this.getScenePriorities();
        log('Priorities is ', priorities);

        var stack = await this.getSceneStack();
        log('Stack was ', stack);

        const before = this.flattenStack(stack, priorities)

        if (clear) {
            stack = {}
        }

        stack[layerName] = sceneString;
        
        await this.setSceneStack(stack);
        log('Stack is ', stack);

        const after : Scene = this.flattenStack(stack, priorities)
        log('Flattened scene stack is ', after);

        const lights = await this.getLights();
        if (spreadMs == 0) {
            await this.applyScene(lights, after);
        } else {
            const arrangement = await this.getSceneArrangement();
            const stages = this.getSceneOrdering(after, arrangement);
            // Apply stages with a small delay after, except the last one.
            const jobs : object[] = [];
            var stageIndex : number = 0
            for (const stage of stages) { 
                const stageTime = stageIndex * spreadMs;
                const applyStage = async () => {
                    await wait(stageTime);
                    log(`Stage at ${stageTime} ms`, stage);
                    await this.applyScene(lights, stage);
                }
                jobs.push(applyStage());
                ++stageIndex;
            }
            log(`made ${jobs.length} jobs`);
            await Promise.all(jobs);
        }
    }
}
/**/

export default LightLayers;