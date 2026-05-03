'use strict';

import {
  Scene, Animation, Setting, SegmentInfo,
} from './scene-manager';
import { LightDevice, DeviceProvider } from './interfaces';

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
      if (duration && l > 0.01) await this.setOnOff(device, true); // must be on before fading to bright
      if (!duration && l > 0.01) {
        // Color before brightness: Homey serializes capabilities to the device, so the order
        // they're sent determines the order they take effect. Setting hue/sat first ensures
        // the light comes on in the correct color rather than flashing the previous color.
        await Promise.all([
          this.setCapabilityFloat(device, 'light_hue', h),
          this.setCapabilityFloat(device, 'light_saturation', s),
        ]);
        await Promise.all([
          this.setCapabilityFloat(device, 'dim', l),
          this.setOnOff(device, true),
        ]);
      } else {
        const ops: Promise<void>[] = [
          this.setCapabilityFloat(device, 'dim', l, duration),
          this.setCapabilityFloat(device, 'light_hue', h, duration),
          this.setCapabilityFloat(device, 'light_saturation', s, duration),
        ];
        if (!duration) ops.push(this.setOnOff(device, false));
        await Promise.all(ops);
      }
      this.knownValues.set(device.name, setting);
    } else if (setting.length === 2) {
      const [l, t] = setting;
      if (duration && l > 0.01) await this.setOnOff(device, true);
      const ops: Promise<void>[] = [
        this.setCapabilityFloat(device, 'dim', l, duration),
        this.setCapabilityFloat(device, 'light_temperature', t, duration),
      ];
      if (!duration) ops.push(this.setOnOff(device, l > 0.01));
      await Promise.all(ops);
      this.knownValues.set(device.name, setting);
    } else if (setting.length === 1) {
      const [l] = setting;
      if (duration && l > 0.01) await this.setOnOff(device, true);
      const ops: Promise<void>[] = [this.setCapabilityFloat(device, 'dim', l, duration)];
      if (!duration) ops.push(this.setOnOff(device, l > 0.01));
      await Promise.all(ops);
      this.knownValues.set(device.name, setting);
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

  private getLightness(setting: number[]): number {
    return setting.length === 3 ? setting[2] : setting[0];
  }

  async emitInterpolation(device: LightDevice, currentValue: Setting, targetValue: Setting, durationMs: number) {
    // If the previous hw fade targeted dim≈0, the device may be at its hardware minimum
    // brightness (not truly off). Send onoff=false first so we start from a clean off state.
    const prevKnown = this.knownValues.get(device.name);
    if (Array.isArray(prevKnown) && this.getLightness(prevKnown) <= 0.01) {
      await this.setOnOff(device, false);
    }
    // Snap to current interpolated position immediately (no duration)
    await this.applySimpleSetting(device, currentValue);
    // Delegate the remaining fade to Homey hardware, prioritizing the dominant dimension
    if (durationMs > 0) {
      await this.applyPrioritizedFade(device, currentValue, targetValue, durationMs);
    }
  }

  // Fades only the dominant dimension; snaps the others to avoid multi-axis interpolation
  // artifacts (e.g. fading through white when transitioning between two saturated colors).
  // Weights: dim × 3, hue × 1 (max 0.5 for complementary), saturation × 0.5.
  async applyPrioritizedFade(
    device: LightDevice,
    from: Setting,
    to: Setting,
    durationMs: number,
  ) {
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 3 || to.length !== 3) {
      await this.applySimpleSetting(device, to, durationMs);
      return;
    }

    const [fH, fS, fL] = from as number[];
    const [tH, tS, tL] = to as number[];

    const dimScore = Math.abs(tL - fL) * 3;
    const hueScore = Math.min(Math.abs(tH - fH), 1 - Math.abs(tH - fH)) * 1;
    const satScore = Math.abs(tS - fS) * 0.5;

    if (dimScore >= hueScore && dimScore >= satScore) {
      // Dim dominates — snap color to target first (invisible while dark), then fade brightness
      if (tL > 0.01) await this.setOnOff(device, true);
      await Promise.all([
        this.setCapabilityFloat(device, 'light_hue', tH),
        this.setCapabilityFloat(device, 'light_saturation', tS),
      ]);
      await this.setCapabilityFloat(device, 'dim', tL, durationMs);
    } else if (hueScore >= satScore) {
      // Hue dominates — snap dim and saturation, fade hue only
      if (tL > 0.01) await this.setOnOff(device, true);
      await Promise.all([
        this.setCapabilityFloat(device, 'dim', tL),
        this.setCapabilityFloat(device, 'light_saturation', tS),
      ]);
      if (tL <= 0.01) await this.setOnOff(device, false);
      await this.setCapabilityFloat(device, 'light_hue', tH, durationMs);
    } else {
      // Saturation dominates — snap dim and hue, fade saturation only
      if (tL > 0.01) await this.setOnOff(device, true);
      await Promise.all([
        this.setCapabilityFloat(device, 'dim', tL),
        this.setCapabilityFloat(device, 'light_hue', tH),
      ]);
      if (tL <= 0.01) await this.setOnOff(device, false);
      await this.setCapabilityFloat(device, 'light_saturation', tS, durationMs);
    }

    this.knownValues.set(device.name, to);
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
