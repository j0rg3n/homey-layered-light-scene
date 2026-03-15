import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import { Scene } from './scene-manager.js';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

export class LightController {

    private devices : HomeyAPI.ManagerDevices;

    constructor(devices : HomeyAPI.ManagerDevices) {
      this.devices = devices;
    }

    async setCapabilityFloat(device : HomeyAPI.ManagerDevices.Device, capabilityName : string, value : any) {
      const capability : any = (device as any).capabilitiesObj[capabilityName];
      const scaledValue = value * (capability.max - capability.min) + capability.min;
      const description = `${device.name} ${capability.id} to ${value} (=${scaledValue}${capability.units ?? ''}; range [${capability.min}, ${capability.max}])`;

      try {
        await device.setCapabilityValue({ capabilityId: capabilityName, value: scaledValue });
        log(`OK: ${description}`);
      } catch (error) {
        log(`Error: ${description}: ${error}`);
      }
    }

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
        await this.setOnOff(device, false);
      } else if (setting === true || setting === false) {
        await this.setOnOff(device, setting);
      } else if (setting.length == 3) {
        const [h, s, l] = setting;
        await Promise.all([
          this.setOnOff(device, l > 0.01),
          this.setCapabilityFloat(device, 'dim', l),
          this.setCapabilityFloat(device, 'light_hue', h),
          this.setCapabilityFloat(device, 'light_saturation', s),
        ]);
      } else if (setting.length == 2) {
        const [l, t] = setting;
        await Promise.all([
          this.setOnOff(device, l > 0.01),
          this.setCapabilityFloat(device, 'dim', l),
          this.setCapabilityFloat(device, 'light_temperature', t),
        ]);
      } else if (setting.length == 1) {
        const [l] = setting;
        await Promise.all([
          this.setOnOff(device, l > 0.01),
          this.setCapabilityFloat(device, 'dim', l),
        ]);
      }
    }

    async applyScene(lights : HomeyAPI.ManagerDevices.Device[], scene : Scene) {
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

    async getLights() : Promise<HomeyAPI.ManagerDevices.Device[]> {
      const devices = await this.devices.getDevices();
      const lights : HomeyAPI.ManagerDevices.Device[] = [];

      for (const devicex of Object.values(devices)) {
        const device : any = devicex;

        if (device.class === 'light'
                || device.virtualClass === 'light'
                || device.virtualClass === 'other') {
          lights.push(device);
        }
      }

      return lights;
    }

}

export default LightController;
