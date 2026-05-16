'use strict';

import Homey from 'homey';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import { LightEngine } from './light-engine';
import { CardHandler } from './card-handler';
import { HomeySceneStore, HomeySceneProvider, HomeyDeviceProvider } from './homey-adapter';

class MyApp extends Homey.App {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  homeyApi: any;
  lightEngine: LightEngine | null = null;
  cardHandler: CardHandler | null = null;

  async onInit() {
    this.log('MyApp has been initialized');

    const stackToken = await this.homey.flow.createToken('layered_light_stack', {
      type: 'string',
      title: 'Light Scene Stack',
      value: '{}',
    });

    this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });

    const sceneStore = new HomeySceneStore(stackToken);
    const sceneProvider = new HomeySceneProvider(this.homeyApi.logic as HomeyAPI.ManagerLogic);
    const deviceProvider = new HomeyDeviceProvider(this.homeyApi.devices as HomeyAPI.ManagerDevices);

    this.lightEngine = new LightEngine({
      deps: {
        sceneStore,
        sceneProvider,
        lightControllerDeps: {
          deviceProvider,
        },
      },
      heartbeatIntervalMs: 30000,
    });

    this.cardHandler = new CardHandler({
      lightEngine: this.lightEngine,
    });

    this.cardHandler.registerFlowCards(this);

    this.lightEngine.start();

    this.log('LightEngine started with 30s heartbeat');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const managerApi = this.homey.api as any;

    managerApi.registerApiHandler({
      method: 'GET',
      path: '/devices',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn: async (_request: any, response: any) => {
        try {
          const lights = (await deviceProvider.getDevices()).map((d) => ({
            id: d.id,
            name: d.name,
            caps: {
              hasDim: 'dim' in (d.capabilitiesObj ?? {}),
              hasColor: 'light_hue' in (d.capabilitiesObj ?? {}),
              hasTemp: 'light_temperature' in (d.capabilitiesObj ?? {}),
            },
          }));
          response.json(lights);
        } catch (err: unknown) {
          response.status(500).send((err as Error).message);
        }
      },
    });

    managerApi.registerApiHandler({
      method: 'GET',
      path: '/variables',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn: async (_request: any, response: any) => {
        try {
          const vars = await this.homeyApi.logic.getVariables();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stringVars = (Object.values(vars) as any[])
            .filter((v) => v.type === 'string')
            .map((v) => ({
              id: v.id as string,
              name: v.name as string,
              value: v.value as string,
            }));
          response.json(stringVars);
        } catch (err: unknown) {
          response.status(500).send((err as Error).message);
        }
      },
    });

    managerApi.registerApiHandler({
      method: 'POST',
      path: '/variable',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn: async (request: any, response: any) => {
        try {
          const { id, value } = request.body as { id: string; value: string };
          await this.homeyApi.logic.updateVariable({ id, value });
          response.json({ ok: true });
        } catch (err: unknown) {
          response.status(500).send((err as Error).message);
        }
      },
    });

    managerApi.registerApiHandler({
      method: 'POST',
      path: '/preview',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn: async (request: any, response: any) => {
        try {
          const {
            deviceId, dim, hue, sat, temp, onoff,
          } = request.body as {
            deviceId: string;
            dim?: number;
            hue?: number;
            sat?: number;
            temp?: number;
            onoff?: boolean;
          };
          const device = await this.homeyApi.devices.getDeviceById(deviceId);
          const caps: Array<{ capabilityId: string; value: number | boolean }> = [];
          if (onoff !== undefined) caps.push({ capabilityId: 'onoff', value: onoff });
          if (dim !== undefined) caps.push({ capabilityId: 'dim', value: dim });
          if (hue !== undefined) caps.push({ capabilityId: 'light_hue', value: hue });
          if (sat !== undefined) caps.push({ capabilityId: 'light_saturation', value: sat });
          if (temp !== undefined) caps.push({ capabilityId: 'light_temperature', value: temp });
          await Promise.all(caps.map(({ capabilityId, value }) => device.setCapabilityValue({ capabilityId, value })));
          response.json({ ok: true });
        } catch (err: unknown) {
          response.status(500).send((err as Error).message);
        }
      },
    });
  }

  async onUninit() {
    if (this.lightEngine) {
      this.lightEngine.stop();
      this.log('LightEngine stopped');
    }
  }

}

module.exports = MyApp;
