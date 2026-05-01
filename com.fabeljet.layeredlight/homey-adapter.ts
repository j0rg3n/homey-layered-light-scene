/* eslint-disable max-classes-per-file */

'use strict';

import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import Homey from 'homey';
import {
  SceneStore, SceneProvider, DeviceProvider, LightDevice,
} from './interfaces.ts';
import { SceneStringStack } from './scene-manager.ts';

export class HomeySceneStore implements SceneStore {

  private stackToken: Homey.FlowToken;
  private stackValue: string = '{}';

  constructor(stackToken: Homey.FlowToken) {
    this.stackToken = stackToken;
  }

  async getStack(): Promise<SceneStringStack> {
    return JSON.parse(this.stackValue);
  }

  async setStack(stack: SceneStringStack): Promise<void> {
    this.stackValue = JSON.stringify(stack);
    await this.stackToken.setValue(this.stackValue);
  }

}

export class HomeySceneProvider implements SceneProvider {

  private logic: HomeyAPI.ManagerLogic;

  constructor(logic: HomeyAPI.ManagerLogic) {
    this.logic = logic;
  }

  async getScenePriorities(): Promise<string[]> {
    const vars = await this.logic.getVariables();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priorityVar = Object.values(vars as any).find((v: any) => v.name === 'Grenser: Sceneprioritet');
    if (priorityVar) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return JSON.parse((priorityVar as any).value);
    }
    return [];
  }

  async getSceneArrangement(): Promise<string[][]> {
    const vars = await this.logic.getVariables();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arrangementVar = Object.values(vars as any).find((v: any) => v.name === 'Grenser: Lysrekkefølge');
    if (arrangementVar) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return JSON.parse((arrangementVar as any).value);
    }
    return [];
  }

}

export class HomeyDeviceProvider implements DeviceProvider {

  private devices: HomeyAPI.ManagerDevices;

  constructor(devices: HomeyAPI.ManagerDevices) {
    this.devices = devices;
  }

  async getDevices(): Promise<LightDevice[]> {
    const allDevices = await this.devices.getDevices();
    const lights: LightDevice[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const device of Object.values(allDevices) as any[]) {
      if (device.class === 'light'
          || device.virtualClass === 'light'
          || device.virtualClass === 'other') {
        lights.push(device as unknown as LightDevice);
      }
    }

    return lights;
  }

}
