import { Scene } from './scene-manager';
import { LightDevice, DeviceProvider } from './interfaces';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

export class LightController {
  private deviceProvider: DeviceProvider;

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

  async applySetting(device: LightDevice, setting: number[]|boolean|null) {
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

  async getLights(): Promise<LightDevice[]> {
    return this.deviceProvider.getDevices();
  }
}

export default LightController;
