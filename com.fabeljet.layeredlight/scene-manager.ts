'use strict';

import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import _ from 'lodash';

const scenePriorityVariableName = 'Grenser: Sceneprioritet';
const sceneArrangementVariableName = 'Grenser: Lysrekkefølge';

function log(message : string, ...optionalParams : unknown[]) {
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
  loopTransitionMs?: number;
}

export type Setting = number[] | boolean | null;

export interface SegmentInfo {
  value: Setting;
  transition: {
    sFrom: Setting;
    sTo: Setting;
    totalMs: number;
    elapsedMs: number;
    isStep: boolean;
  } | null;
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

function isAnimation(value: unknown): value is Animation {
  return value !== null && typeof value === 'object' && 'keyframes' in value && 'loop' in value;
}

function isEqualAnimation(a: Animation, b: Animation): boolean {
  if (a.loop !== b.loop || a.keyframes.length !== b.keyframes.length) {
    return false;
  }
  if ((a.loopTransitionMs || 0) !== (b.loopTransitionMs || 0)) {
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

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpHue(a: number, b: number, t: number): number {
  const diff = b - a;
  let adjusted: number;
  if (diff > 0.5) {
    adjusted = diff - 1;
  } else if (diff < -0.5) {
    adjusted = diff + 1;
  } else {
    adjusted = diff;
  }
  let result = a + adjusted * t;
  if (result < 0) result += 1;
  if (result > 1) result -= 1;
  return result;
}

function toSettingArray(s: Setting): number[] {
  if (Array.isArray(s)) return s;
  if (s === true) return [1];
  return [0]; // false or null
}

function padToWidth(arr: number[], targetLen: number): number[] {
  if (arr.length === targetLen) return arr;
  if (targetLen === 2) {
    // brightness [b] → [b, 0.5]: assume neutral color temperature
    return [arr[0], 0.5];
  }
  if (targetLen === 3) {
    // brightness [b] or [b, t] → [0, 0, b]: neutral hue+saturation, preserve brightness
    return [0, 0, arr[0]];
  }
  // fallback: append zeros
  const padded = [...arr];
  while (padded.length < targetLen) padded.push(0);
  return padded;
}

function promoteSetting(a: Setting, b: Setting): [number[], number[]] {
  const aArr = toSettingArray(a);
  const bArr = toSettingArray(b);
  const len = Math.max(aArr.length, bArr.length);
  return [padToWidth(aArr, len), padToWidth(bArr, len)];
}

export function interpolateLinear(sFrom: Setting, sTo: Setting, progress: number): Setting {
  if (sFrom === null) return sTo;
  if (sTo === null) return sFrom;
  if (typeof sFrom === 'boolean' || typeof sTo === 'boolean') {
    return progress < 1 ? sFrom : sTo;
  }

  const [a, b] = promoteSetting(sFrom, sTo);
  const result: number[] = [];

  for (let i = 0; i < a.length; i++) {
    if (i === 0 && a.length >= 3) {
      result.push(lerpHue(a[i], b[i], progress));
    } else {
      result.push(lerp(a[i], b[i], progress));
    }
  }

  return result;
}

export function interpolateStep(sFrom: Setting, sTo: Setting, progress: number): Setting {
  return progress < 1 ? sFrom : sTo;
}

export function interpolate(
  sFrom: Setting,
  sTo: Setting,
  progress: number,
  isStep: boolean,
): Setting {
  if (isStep) {
    return interpolateStep(sFrom, sTo, progress);
  }
  return interpolateLinear(sFrom, sTo, progress);
}

export class SceneManager {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findVariable(logic : HomeyAPI.ManagerLogic, name : string) : Promise<any> {
    const vars = await logic.getVariables();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getJsonVariable(logic : HomeyAPI.ManagerLogic, name : string) : Promise<any> {
    return JSON.parse(await this.getVariable(logic, name));
  }

  async getScenePriorities(logic : HomeyAPI.ManagerLogic) : Promise<string[]> {
    return this.getJsonVariable(logic, scenePriorityVariableName);
  }

  async getSceneArrangement(logic : HomeyAPI.ManagerLogic) : Promise<string[][]> {
    return this.getJsonVariable(logic, sceneArrangementVariableName);
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
    if (!valueString) {
      return this.parseSimpleValue(valueString);
    }

    const hasSeparator = /\/(\d+(?:\.\d+)?(ms|s|m|h)?)|\|(\d+(?:\.\d+)?(ms|s|m|h)?)\|/.test(valueString);

    if (!hasSeparator) {
      return this.parseSimpleValue(valueString);
    }

    const isLoop = valueString.endsWith('/') || valueString.endsWith('|');
    const isHard = valueString.includes('|');

    const tokens: string[] = [];
    let i = 0;

    while (i < valueString.length) {
      const remaining = valueString.slice(i);

      // Claim hex color values and keywords BEFORE trying separator patterns,
      // so that decimal-looking hex like "00" or "80" isn't mistaken for a duration.
      const valueMatch = remaining.match(/^([0-9a-fA-F]{2}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|on|off|null)/);
      if (valueMatch) {
        tokens.push(valueMatch[0]);
        i += valueMatch[0].length;
        continue;
      }

      const pipeSepMatch = remaining.match(/^(\|)(\d+(?:\.\d+)?)(ms|s|m|h)?(\|)/);

      if (pipeSepMatch) {
        tokens.push(pipeSepMatch[0]);
        i += pipeSepMatch[0].length;
        continue;
      }

      // Require an explicit leading "/" and explicit unit suffix to avoid matching hex digits as durations
      const sepWithDurMatch = remaining.match(/^(\/)(\d+(?:\.\d+)?)(ms|s|m|h)(\/)/);

      if (sepWithDurMatch) {
        tokens.push(sepWithDurMatch[0]);
        i += sepWithDurMatch[0].length;
        continue;
      }

      if (remaining[0] === '/' || remaining[0] === '|') {
        tokens.push(remaining[0]);
        i++;
        continue;
      }

      i++;
    }

    const keyframes: Keyframe[] = [];
    let pendingDuration: { ms: number; hard: boolean; isLeading: boolean } | null = null;
    let loopTransitionMs: number | undefined;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      const pipeMatch = token.match(/^(\|)(\d+(?:\.\d+)?)(ms|s|m|h)?(\|)$/);
      const sepMatch = token.match(/^(\/|)(\d+(?:\.\d+)?)(ms|s|m|h)(\/|)?$/);
      const isPipe = token === '|';
      const isSep = token === '/';

      if (pipeMatch || sepMatch || isPipe || isSep) {
        const isSepHard = token.includes('|') || isPipe;

        if (isPipe || isSep) {
          pendingDuration = null;
          continue;
        }

        const durationMatch = token.match(/(\d+(?:\.\d+)?)(ms|s|m|h)?/);
        const duration = durationMatch ? durationMatch[1] + (durationMatch[2] || '') : '';

        if (duration) {
          pendingDuration = { ms: parseDuration(duration), hard: isSepHard, isLeading: false };
        }

        const hasTrailing = token.endsWith('/') || token.endsWith('|');

        if (hasTrailing && i === tokens.length - 1 && keyframes.length > 0) {
          const lastKf = keyframes[keyframes.length - 1];
          if (pendingDuration) {
            if (pendingDuration.hard || lastKf.value === null || typeof lastKf.value === 'boolean') {
              // Step transition: hold at last value before snapping back to first
              lastKf.holdMs = pendingDuration.ms;
              lastKf.hard = true;
            } else {
              // Linear fade-back: store as loop-back transition, don't touch last keyframe
              loopTransitionMs = pendingDuration.ms;
            }
          }
        }

        continue;
      }

      const simpleValue = this.parseSimpleValue(token);
      const isBinary = simpleValue === null || simpleValue === true || simpleValue === false;

      const keyframe: Keyframe = {
        value: simpleValue,
        hard: isHard || isBinary,
      };

      if (pendingDuration) {
        if (pendingDuration.hard || isBinary) {
          keyframe.holdMs = pendingDuration.ms;
          keyframe.hard = true;
        } else {
          keyframe.transitionMs = pendingDuration.ms;
        }
        pendingDuration = null;
      }

      keyframes.push(keyframe);
    }

    if (keyframes.length > 0) {
      return { keyframes, loop: isLoop, loopTransitionMs };
    }

    return this.parseSimpleValue(valueString);
  }

  parseSimpleValue(valueString: string): number[] | boolean | null {
    if (valueString === 'null') {
      return null;
    } if (valueString === 'on') {
      return true;
    } if (valueString === 'off') {
      return false;
    }
    const rgb = this.getRgbVectorFromRgbString(valueString);
    if (rgb.length === 3) {
      return this.getHueSaturationLightnessFromRgb(rgb as [number, number, number]);
    }
    return rgb;
  }

  getRgbVectorFromRgbString(rgb : string) : number[] {
    if (rgb.length === 6) {
      const r = parseInt(rgb.substring(0, 2), 16) / 255;
      const g = parseInt(rgb.substring(2, 4), 16) / 255;
      const b = parseInt(rgb.substring(4, 6), 16) / 255;
      return [r, g, b];
    } if (rgb.length === 4) {
      const brightness = parseInt(rgb.substring(0, 2), 16) / 255;
      const temperature = parseInt(rgb.substring(2, 4), 16) / 255;
      return [brightness, temperature];
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

    if (d !== 0) {
      if (max === r) {
        h = 60 * (((g - b) / d) % 6);
      } else if (max === g) {
        h = 60 * (((b - r) / d) + 2);
      } else if (max === b) {
        h = 60 * (((r - g) / d) + 4);
      }

      s = d / (1 - Math.abs(2 * l - 1));
    }

    return [h / 360, s, l];
  }

  layerScenes(base : Scene, modifier : Scene) : Scene {
    const result = { ...base };
    for (const lightName of Object.keys(modifier)) {
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

  evaluateLayer(layerScene: Scene, tAssign: number, tNow: number): Scene {
    const result: Scene = {};
    for (const lightName of Object.keys(layerScene)) {
      const pattern = layerScene[lightName];
      const value = this.eval(pattern, tAssign, tNow);
      result[lightName] = value;
      if (value === null) {
        delete result[lightName];
      }
    }
    return result;
  }

  flattenLayers(layers: { scene: Scene; setTimestamp: number }[], tNow: number): Scene {
    const evaluated = layers.map((layer) => this.evaluateLayer(layer.scene, layer.setTimestamp, tNow));

    const allLights = new Set<string>();
    for (const scene of evaluated) {
      for (const lightName of Object.keys(scene)) {
        allLights.add(lightName);
      }
    }

    const result: Scene = {};
    for (const lightName of allLights) {
      for (let i = evaluated.length - 1; i >= 0; i--) {
        const val = evaluated[i][lightName];
        if (val !== null && val !== undefined) {
          result[lightName] = val;
          break;
        }
      }
      if (!result[lightName]) {
        result[lightName] = false;
      }
    }

    return result;
  }

  evaluateLayerInfo(layerScene: Scene, tAssign: number, tNow: number): Map<string, SegmentInfo> {
    const result = new Map<string, SegmentInfo>();
    for (const lightName of Object.keys(layerScene)) {
      const info = this.evalSegmentInfo(layerScene[lightName], tAssign, tNow);
      if (info.value !== null) {
        result.set(lightName, info);
      }
    }
    return result;
  }

  flattenLayersInfo(layers: { scene: Scene; setTimestamp: number }[], tNow: number): Map<string, SegmentInfo> {
    const evaluated = layers.map((layer) => this.evaluateLayerInfo(layer.scene, layer.setTimestamp, tNow));

    const allLights = new Set<string>();
    for (const infoMap of evaluated) {
      for (const name of infoMap.keys()) allLights.add(name);
    }

    const result = new Map<string, SegmentInfo>();
    for (const lightName of allLights) {
      let found = false;
      for (let i = evaluated.length - 1; i >= 0; i--) {
        const info = evaluated[i].get(lightName);
        if (info !== undefined && info.value !== null) {
          result.set(lightName, info);
          found = true;
          break;
        }
      }
      if (!found) {
        result.set(lightName, { value: false, transition: null });
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
      for (const lightName of Object.keys(scene)) {
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
    for (const lightName of Object.keys(after)) {
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

  evalSegmentInfo(pattern: LightValue, tAssign: number, tNow: number): SegmentInfo {
    if (!isAnimation(pattern)) {
      return { value: pattern as Setting, transition: null };
    }

    const animation = pattern as Animation;
    const { keyframes } = animation;
    if (keyframes.length === 0) {
      return { value: null, transition: null };
    }

    const keyframeDuration = keyframes.reduce((sum, kf) => {
      return sum + (kf.transitionMs || 0) + (kf.holdMs || 0);
    }, 0);
    const totalDuration = keyframeDuration + (animation.loopTransitionMs || 0);

    if (totalDuration === 0) {
      return { value: keyframes[keyframes.length - 1].value as Setting, transition: null };
    }

    const elapsed = tNow - tAssign;
    let tElapsed = animation.loop ? elapsed % totalDuration : Math.min(elapsed, totalDuration);

    if (tElapsed < 0) tElapsed = 0;

    let cursor = 0;
    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      const transitionDuration = kf.transitionMs || 0;
      const holdDuration = kf.holdMs || 0;
      const segmentEnd = cursor + transitionDuration + holdDuration;

      if (tElapsed < segmentEnd) {
        const elapsedInSegment = tElapsed - cursor;
        const inTransition = transitionDuration > 0 && elapsedInSegment < transitionDuration;

        if (inTransition) {
          const progress = elapsedInSegment / transitionDuration;
          const sFrom = keyframes[Math.max(0, i - 1)].value as Setting;
          const sTo = kf.value as Setting;
          const isStep = kf.hard || false;
          const value = interpolate(sFrom, sTo, progress, isStep);
          return {
            value,
            transition: isStep ? null : {
              sFrom, sTo, totalMs: transitionDuration, elapsedMs: elapsedInSegment, isStep: false,
            },
          };
        }
        return { value: kf.value as Setting, transition: null };
      }
      cursor = segmentEnd;
    }

    // Loop-back transition: fade from last keyframe value back to first
    if (animation.loop && animation.loopTransitionMs && animation.loopTransitionMs > 0) {
      const elapsedInSegment = tElapsed - cursor;
      const progress = elapsedInSegment / animation.loopTransitionMs;
      const sFrom = keyframes[keyframes.length - 1].value as Setting;
      const sTo = keyframes[0].value as Setting;
      const value = interpolate(sFrom, sTo, Math.min(progress, 1), false);
      return {
        value,
        transition: {
          sFrom, sTo, totalMs: animation.loopTransitionMs, elapsedMs: elapsedInSegment, isStep: false,
        },
      };
    }

    if (animation.loop) {
      return { value: keyframes[0].value as Setting, transition: null };
    }

    return { value: keyframes[keyframes.length - 1].value as Setting, transition: null };
  }

  eval(pattern: LightValue, tAssign: number, tNow: number): Setting {
    return this.evalSegmentInfo(pattern, tAssign, tNow).value;
  }

  evalAtTimestamp(pattern: LightValue, timestamp: number): Setting {
    return this.eval(pattern, 0, timestamp);
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
