import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import _ from 'lodash';

const sceneStackVariableName = 'Tilstand: Aktive Scener';
const scenePriorityVariableName = 'Grenser: Sceneprioritet';
const sceneArrangementVariableName = 'Grenser: Lysrekkefølge';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

export interface Keyframe {
  value: number[] | boolean | null;
  transitionMs?: number;
  holdMs?: number;
  hard?: boolean;
  fromCurrent?: boolean;
}

export interface Animation {
  keyframes: Keyframe[];
  loop: boolean;
}

export type LightValue = number[] | boolean | null | Animation;

export interface Scene {
    [key: string]: LightValue;
}

export interface SceneStringStack {
    [key: string]: string;
}

function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration: ${durationStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 's';

  switch (unit) {
    case 'ms': return Math.round(value);
    case 's': return Math.round(value * 1000);
    case 'm': return Math.round(value * 60000);
    case 'h': return Math.round(value * 3600000);
    default: return Math.round(value * 1000);
  }
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

function isAnimation(value: any): value is Animation {
  return value !== null && typeof value === 'object' && 'keyframes' in value && 'loop' in value;
}

function isEqualAnimation(a: Animation, b: Animation): boolean {
  if (a.loop !== b.loop || a.keyframes.length !== b.keyframes.length) {
    return false;
  }

  for (let i = 0; i < a.keyframes.length; i++) {
    const ka = a.keyframes[i];
    const kb = b.keyframes[i];

    if (!isEqualSetting(ka.value, kb.value)) return false;
    if (ka.transitionMs !== kb.transitionMs) return false;
    if (ka.holdMs !== kb.holdMs) return false;
    if (ka.hard !== kb.hard) return false;
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

      const valueString = matches[1];
      const nextLightName = matches[3];

      scene[lightName] = this.parseLightValue(valueString);
      lightName = nextLightName;
    }
    return scene;
  }

  parseLightValue(valueString: string): LightValue {
    const hasLeadingSlash = valueString.startsWith('/');
    const hasTrailingSlash = valueString.endsWith('/');
    const hasLeadingPipe = valueString.startsWith('|');
    const hasTrailingPipe = valueString.endsWith('|');

    if (hasLeadingSlash || hasLeadingPipe || hasTrailingSlash || hasTrailingPipe) {
      const isHard = hasLeadingPipe || hasTrailingPipe;
      const isLoop = hasTrailingSlash || hasTrailingPipe;

      const innerString = valueString.slice(1, -1);
      const separator = isHard ? '|' : '/';
      const parts = innerString.split(separator);
      const keyframes: Keyframe[] = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part && i < parts.length - 1) {
          keyframes.push({
            value: null,
            fromCurrent: true,
          });
          continue;
        }
        if (!part) continue;

        const lastDigitMatch = part.match(/(\d+)((ms|s|m|h)?)$/);
        let valuePart: string;
        let durationStr: string | undefined;

        if (lastDigitMatch) {
          const numPart = lastDigitMatch[1];
          const unitPart = lastDigitMatch[2];
          const digitStartIndex = lastDigitMatch.index!;

          if (digitStartIndex > 0) {
            valuePart = part.slice(0, digitStartIndex);
            if (unitPart) {
              durationStr = numPart + unitPart;
            }
          } else if (unitPart) {
            durationStr = numPart + unitPart;
            valuePart = '';
          } else {
            valuePart = part;
          }
        } else {
          valuePart = part;
        }

        const simpleValue = valuePart ? this.parseSimpleValue(valuePart) : undefined;
        const isBinary = simpleValue === null || simpleValue === true || simpleValue === false;

        const transitionMs = durationStr && !isHard && !isBinary ? parseDuration(durationStr) : undefined;
        const holdMs = durationStr && (isHard || isBinary) ? parseDuration(durationStr) : undefined;

        if (i > 0 && !durationStr && !isHard) {
          keyframes[i - 1].holdMs = 0;
        }

        keyframes.push({
          value: simpleValue !== undefined ? simpleValue : null,
          transitionMs,
          holdMs,
          hard: isHard || isBinary,
          fromCurrent: valuePart === '' && durationStr !== undefined,
        });
      }

      if (keyframes.length > 0) {
        return { keyframes, loop: isLoop };
      }
    }

    return this.parseSimpleValue(valueString);
  }

  parseSimpleValue(valueString: string): number[] | boolean | null {
    if (valueString === 'null') {
      return null;
    } else if (valueString === 'on') {
      return true;
    } else if (valueString === 'off') {
      return false;
    } else {
      const rgb = this.getRgbVectorFromRgbString(valueString);
      if (rgb.length === 3) {
        return this.getHueSaturationLightnessFromRgb(rgb as [number, number, number]);
      } else {
        return rgb;
      }
    }
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
      const beforeValue = before[lightName];
      const afterValue = after[lightName];

      if (isAnimation(beforeValue) || isAnimation(afterValue)) {
        if (!isAnimation(beforeValue) || !isAnimation(afterValue) || !isEqualAnimation(beforeValue, afterValue)) {
          result[lightName] = afterValue;
        }
      } else if (!isEqualSetting(beforeValue, afterValue)) {
        result[lightName] = afterValue;
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
