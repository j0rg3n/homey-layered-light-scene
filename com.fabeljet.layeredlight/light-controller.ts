import { Scene, Animation, Keyframe } from './scene-manager';
import { LightDevice, DeviceProvider } from './interfaces';

function log(message : string, ...optionalParams : any[]) {
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

  constructor(deps: { deviceProvider: DeviceProvider }) {
    this.deviceProvider = deps.deviceProvider;
  }

  async setCapabilityFloat(device: LightDevice, capabilityName: string, value: any) {
    const capability = device.capabilitiesObj[capabilityName];
    if (!capability) {
      log(`Warning: capability ${capabilityName} not found on ${device.name}`);
      return;
    }

    const scaledValue = value * (capability.max - capability.min) + capability.min;
    const description = `${device.name} ${capabilityName} to ${value} (=${scaledValue}${capability.units ?? ''}; range [${capability.min}, ${capability.max}])`;

    try {
      await device.setCapabilityValue({ capabilityId: capabilityName, value: scaledValue });
      log(`OK: ${description}`);
    } catch (error) {
      log(`Error: ${description}: ${error}`);
    }
  }

  async setOnOff(device: LightDevice, on: boolean) {
    try {
      await device.setCapabilityValue({ capabilityId: 'onoff', value: on });
      log(`OK: ${device.name} ${on ? 'on' : 'off'}`);
    } catch (error) {
      log(`Error: ${device.name} ${on ? 'on' : 'off'}: ${error}`);
    }
  }

  async applySimpleSetting(device: LightDevice, setting: number[]|boolean|null) {
    log(`Applying ${setting} to ${device.name}...`);

    if (setting === null) {
      await this.setOnOff(device, false);
    } else if (setting === true || setting === false) {
      await this.setOnOff(device, setting);
    } else if (setting.length === 3) {
      const [h, s, l] = setting;
      await Promise.all([
        this.setOnOff(device, l > 0.01),
        this.setCapabilityFloat(device, 'dim', l),
        this.setCapabilityFloat(device, 'light_hue', h),
        this.setCapabilityFloat(device, 'light_saturation', s),
      ]);
    } else if (setting.length === 2) {
      const [l, t] = setting;
      await Promise.all([
        this.setOnOff(device, l > 0.01),
        this.setCapabilityFloat(device, 'dim', l),
        this.setCapabilityFloat(device, 'light_temperature', t),
      ]);
    } else if (setting.length === 1) {
      const [l] = setting;
      await Promise.all([
        this.setOnOff(device, l > 0.01),
        this.setCapabilityFloat(device, 'dim', l),
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
      do {
        for (const keyframe of animation.keyframes) {
          if (cancelled) return;

          if (keyframe.transitionMs && !keyframe.hard) {
            await this.applyTransition(device, keyframe.value, keyframe.transitionMs);
          } else {
            await this.applySimpleSetting(device, keyframe.value);
          }

          if (keyframe.holdMs && !cancelled) {
            await wait(keyframe.holdMs);
          }
        }
      } while (animation.loop && !cancelled);

      this.activeAnimations.delete(animationId);
    };

    runAnimation();

    return { cancel };
  }

  async applyTransition(device: LightDevice, targetValue: number[] | boolean | null, durationMs: number) {
    const steps = Math.max(1, Math.ceil(durationMs / 100));
    const stepDuration = Math.floor(durationMs / steps);

    if (typeof targetValue === 'boolean' || targetValue === null) {
      await this.applySimpleSetting(device, targetValue);
      return;
    }

    if (targetValue.length === 1) {
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const value = targetValue[0] * progress;
        await this.applySimpleSetting(device, [value]);
        await wait(stepDuration);
      }
    } else if (targetValue.length === 2) {
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const value = targetValue[0] * progress;
        const temp = targetValue[1];
        await this.applySimpleSetting(device, [value, temp]);
        await wait(stepDuration);
      }
    } else if (targetValue.length === 3) {
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const hue = targetValue[0];
        const sat = targetValue[1];
        const light = targetValue[2] * progress;
        await this.applySimpleSetting(device, [hue, sat, light]);
        await wait(stepDuration);
      }
    }

    await this.applySimpleSetting(device, targetValue);
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

  cancelAllAnimations() {
    for (const [, animation] of this.activeAnimations) {
      animation.cancel();
    }
    this.activeAnimations.clear();
  }

  async getLights(): Promise<LightDevice[]> {
    return this.deviceProvider.getDevices();
  }
}

export default LightController;
