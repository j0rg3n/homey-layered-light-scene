'use strict';

import {
  Scene, Animation, Setting, SegmentInfo,
} from './scene-manager.ts';
import { LightDevice, DeviceProvider } from './interfaces.ts';

function log(message : string, ...optionalParams : unknown[]) {
  console.log(message, ...optionalParams);
}

function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

export class LightController {

  private deviceProvider: DeviceProvider;
  private activeAnimations: Map<string, { cancel: () => void }> = new Map();
  private knownValues: Map<string, Setting> = new Map();

  constructor(deps: { deviceProvider: DeviceProvider }) {
    this.deviceProvider = deps.deviceProvider;
  }

  async setCapabilityFloat(device: LightDevice, capabilityName: string, value: number, duration?: number) {
    const capability = device.capabilitiesObj[capabilityName];
    if (!capability) {
      log(`Warning: capability ${capabilityName} not found on ${device.name}`);
      return;
    }

    const scaledValue = value * (capability.max - capability.min) + capability.min;
    const description = `${device.name} ${capabilityName} to ${value} (=${scaledValue}${capability.units ?? ''}; range [${capability.min}, ${capability.max}])`;

    try {
      await device.setCapabilityValue({ capabilityId: capabilityName, value: scaledValue, duration });
      log(`OK: ${description}${duration ? ` over ${duration}ms` : ''}`);
    } catch (error) {
      log(`Error: ${description}: ${error}`);
    }
  }

  async setOnOff(device: LightDevice, on: boolean, duration?: number) {
    try {
      await device.setCapabilityValue({ capabilityId: 'onoff', value: on, duration });
      log(`OK: ${device.name} ${on ? 'on' : 'off'}${duration ? ` over ${duration}ms` : ''}`);
    } catch (error) {
      log(`Error: ${device.name} ${on ? 'on' : 'off'}: ${error}`);
    }
  }

  async applySimpleSetting(device: LightDevice, setting: number[]|boolean|null, duration?: number) {
    log(`Applying ${setting} to ${device.name}${duration ? ` over ${duration}ms` : ''}...`);

    if (setting === null) {
      await this.setOnOff(device, false, duration);
    } else if (setting === true || setting === false) {
      await this.setOnOff(device, setting, duration);
    } else if (setting.length === 3) {
      const [h, s, l] = setting;
      await Promise.all([
        this.setOnOff(device, l > 0.01, duration),
        this.setCapabilityFloat(device, 'dim', l, duration),
        this.setCapabilityFloat(device, 'light_hue', h, duration),
        this.setCapabilityFloat(device, 'light_saturation', s, duration),
      ]);
    } else if (setting.length === 2) {
      const [l, t] = setting;
      await Promise.all([
        this.setOnOff(device, l > 0.01, duration),
        this.setCapabilityFloat(device, 'dim', l, duration),
        this.setCapabilityFloat(device, 'light_temperature', t, duration),
      ]);
    } else if (setting.length === 1) {
      const [l] = setting;
      await Promise.all([
        this.setOnOff(device, l > 0.01, duration),
        this.setCapabilityFloat(device, 'dim', l, duration),
      ]);
    }
  }

  async applyAnimation(device: LightDevice, animation: Animation): Promise<{ cancel: () => void }> {
    const animationId = `${device.id}-${Date.now()}`;
    let cancelled = false;

    const cancel = () => {
      cancelled = true;
      this.activeAnimations.delete(animationId);
    };

    this.activeAnimations.set(animationId, { cancel });

    const runAnimation = async () => {
      let prevValue: number[] | boolean | null = animation.keyframes[0]?.value ?? null;
      do {
        for (const keyframe of animation.keyframes) {
          if (cancelled) return;

          if (keyframe.transitionMs && !keyframe.hard) {
            await this.applyTransition(device, prevValue, keyframe.value, keyframe.transitionMs);
          } else {
            await this.applySimpleSetting(device, keyframe.value);
          }

          prevValue = keyframe.value;

          if (keyframe.holdMs && !cancelled) {
            await wait(keyframe.holdMs);
          }
        }
      } while (animation.loop && !cancelled);

      this.activeAnimations.delete(animationId);
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    runAnimation();

    return { cancel };
  }

  async applyTransition(
    device: LightDevice,
    fromValue: number[] | boolean | null,
    targetValue: number[] | boolean | null,
    durationMs: number,
  ) {
    const steps = Math.max(1, Math.ceil(durationMs / 100));
    const stepDuration = Math.floor(durationMs / steps);

    if (typeof targetValue === 'boolean' || targetValue === null
        || typeof fromValue === 'boolean' || fromValue === null) {
      await this.applySimpleSetting(device, targetValue);
      return;
    }

    const from = fromValue as number[];
    const to = targetValue as number[];
    const len = Math.max(from.length, to.length);

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const stepped: number[] = [];
      for (let ch = 0; ch < len; ch++) {
        const a = from[ch] ?? 0;
        const b = to[ch] ?? 0;
        stepped.push(a + (b - a) * progress);
      }
      await this.applySimpleSetting(device, stepped);
      if (i < steps) await wait(stepDuration);
    }
  }

  async applySetting(device: LightDevice, setting: number[]|boolean|null|Animation) {
    if (setting !== null && typeof setting === 'object' && 'keyframes' in setting) {
      await this.applyAnimation(device, setting as Animation);
    } else {
      await this.applySimpleSetting(device, setting as number[]|boolean|null);
    }
  }

  async applyScene(scene: Scene) {
    const lights = await this.deviceProvider.getDevices();
    const jobs = [];

    for (const device of lights) {
      const setting = scene[device.name];
      if (setting === undefined) {
        continue;
      }

      jobs.push(this.applySetting(device, setting));
    }

    await Promise.all(jobs);
    log('Done!');
  }

  async applySceneInfo(infoMap: Map<string, SegmentInfo>, changes: Scene) {
    const lights = await this.deviceProvider.getDevices();
    const jobs: Promise<void>[] = [];

    for (const device of lights) {
      if (!(device.name in changes)) continue;

      const info = infoMap.get(device.name);
      if (!info) continue;

      if (info.transition !== null) {
        const remainingMs = info.transition.totalMs - info.transition.elapsedMs;
        jobs.push(this.emitInterpolation(device, info.value, info.transition.sTo, remainingMs));
      } else {
        jobs.push(this.applySimpleSetting(device, info.value));
      }
    }

    await Promise.all(jobs);
    log('Done!');
  }

  cancelAllAnimations() {
    for (const [, animation] of this.activeAnimations) {
      animation.cancel();
    }
    this.activeAnimations.clear();
  }

  async emitInterpolation(device: LightDevice, currentValue: Setting, targetValue: Setting, durationMs: number) {
    // Snap to current interpolated position immediately (no duration)
    await this.applySimpleSetting(device, currentValue);
    // Delegate the remaining fade to Homey hardware
    if (durationMs > 0) {
      await this.applySimpleSetting(device, targetValue, durationMs);
    }
    this.knownValues.set(device.name, targetValue);
  }

  getKnownValues(): Map<string, Setting> {
    return this.knownValues;
  }

  setKnownValue(lightName: string, value: Setting) {
    this.knownValues.set(lightName, value);
  }

  async getLights(): Promise<LightDevice[]> {
    return this.deviceProvider.getDevices();
  }

}

export default LightController;
