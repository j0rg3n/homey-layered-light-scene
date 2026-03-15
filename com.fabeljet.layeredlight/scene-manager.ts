import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import _ from 'lodash';

const sceneStackVariableName = 'Tilstand: Aktive Scener';
const scenePriorityVariableName = 'Grenser: Sceneprioritet';
const sceneArrangementVariableName = 'Grenser: Lysrekkefølge';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

export interface Scene {
    [key: string]: number[]|boolean|null;
}

export interface SceneStringStack {
    [key: string]: string;
}

function isEqualSetting(a : number[]|boolean|null|undefined, b : number[]|boolean|null|undefined) : boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }

  if (a === null || b === null) {
    return a === b;
  }

  if (a === true || a === false) {
    return a === b;
  }

  if (!Array.isArray(b)) {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export class SceneManager {

  async findVariable(logic : HomeyAPI.ManagerLogic, name : string) : Promise<any> {
    const vars = await logic.getVariables();
    const controlValue = _.find(vars, (o : any) => o.name === name);
    if (controlValue === undefined) {
      throw new Error(`Control variable ${name} missing.`);
    }

    if (controlValue.type !== 'string') {
      throw new Error(`Control variable ${name} (${controlValue.type}) is not a string.`);
    }

    return controlValue;
  }

  async getVariable(logic : HomeyAPI.ManagerLogic, name : string) : Promise<string> {
    const controlValue = await this.findVariable(logic, name);
    log('Variable ', name, '=', controlValue.value);
    return controlValue.value;
  }

  async getJsonVariable(logic : HomeyAPI.ManagerLogic, name : string) : Promise<any> {
    return JSON.parse(await this.getVariable(logic, name));
  }

  async getScenePriorities(logic : HomeyAPI.ManagerLogic) : Promise<string[]> {
    return await this.getJsonVariable(logic, scenePriorityVariableName);
  }

  async getSceneArrangement(logic : HomeyAPI.ManagerLogic) : Promise<string[][]> {
    return await this.getJsonVariable(logic, sceneArrangementVariableName);
  }

  getSceneFromJson(scene : string) : Scene {
    return JSON.parse(scene);
  }

  getJsonFromScene(scene : Scene) : string {
    return JSON.stringify(scene);
  }

  getSceneFromString(sceneString : string) : Scene {
    const scene : Scene = {};
    const groups = sceneString.split(':');

    let lightName : string = groups[0].trim();
    for (let i = 1; i < groups.length; i++) {
      const matches : RegExpMatchArray|null = groups[i].match(/\s*(\S+)(:?\s+(.+))?/);
      if (matches === null) {
        throw new Error(`Invalid scene string: ${sceneString}`);
      }

      const colorString = matches[1];
      const nextLightName = matches[3];
      if (colorString === 'null') {
        scene[lightName] = null;
      } else if (colorString === 'on') {
        scene[lightName] = true;
      } else if (colorString === 'off') {
        scene[lightName] = false;
      } else {
        const rgb = this.getRgbVectorFromRgbString(colorString);
        if (rgb.length === 3) {
          const color = this.getHueSaturationLightnessFromRgb(rgb as [number, number, number]);
          scene[lightName] = color;
        } else {
          scene[lightName] = rgb;
        }
      }

      lightName = nextLightName;
    }
    return scene;
  }

  getRgbVectorFromRgbString(rgb : string) : number[] {
    if (rgb.length === 6) {
      const r = parseInt(rgb.substring(0, 2), 16) / 255;
      const g = parseInt(rgb.substring(2, 4), 16) / 255;
      const b = parseInt(rgb.substring(4, 6), 16) / 255;
      return [r, g, b];
    } if (rgb.length === 4) {
      const temperature = parseInt(rgb.substring(0, 2), 16) / 255;
      const lightness = parseInt(rgb.substring(2, 4), 16) / 255;
      return [temperature, lightness];
    } if (rgb.length === 2) {
      const lightness = parseInt(rgb.substring(0, 2), 16) / 255;
      return [lightness];
    }
    throw new Error(`Invalid RGB string: ${rgb}`);
  }

  getHueSaturationLightnessFromRgb(rgb : [number, number, number]) : [number, number, number] {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (d === 0) {
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

    return [h / 360, s, l];
  }

  layerScenes(base : Scene, modifier : Scene) : Scene {
    const result = { ...base };
    for (const lightName in modifier) {
      const newValue = modifier[lightName];
      if (newValue === null) {
        delete result[lightName];
      } else {
        result[lightName] = newValue;
      }
    }
    return result;
  }

  flattenStack(stack : SceneStringStack, priorities : string[]) : Scene {
    let result = {};
    for (const sceneName of priorities) {
      const sceneJson = stack[sceneName];
      if (sceneJson !== undefined) {
        const scene = this.getSceneFromJson(sceneJson);
        result = this.layerScenes(result, scene);
      }
    }
    return result;
  }

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

  getChanges(before : Scene, after : Scene) : Scene {
    const result : Scene = {};
    for (const lightName in after) {
      if (!isEqualSetting(before[lightName], after[lightName])) {
        result[lightName] = after[lightName];
      }
    }
    return result;
  }

  updateStack(
    stack : SceneStringStack,
    layerName : string,
    sceneString : string,
    clear : boolean,
  ) : SceneStringStack {
    const newStack = { ...stack };
    const existingScene = stack[layerName];
    const newScene = this.getJsonFromScene(this.getSceneFromString(sceneString));

    if (clear || existingScene === undefined) {
      newStack[layerName] = newScene;
    } else {
      const existingSceneObj = this.getSceneFromJson(existingScene);
      const newSceneObj = this.getSceneFromJson(newScene);
      const mergedSceneObj = this.layerScenes(existingSceneObj, newSceneObj);
      newStack[layerName] = this.getJsonFromScene(mergedSceneObj);
    }

    return newStack;
  }

}

export default SceneManager;
