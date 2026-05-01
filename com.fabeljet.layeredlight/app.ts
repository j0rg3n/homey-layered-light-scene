'use strict';

import Homey from 'homey';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import { LightEngine } from './light-engine.ts';
import { CardHandler } from './card-handler.ts';
import { HomeySceneStore, HomeySceneProvider, HomeyDeviceProvider } from './homey-adapter.ts';

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
  }

  async onUninit() {
    if (this.lightEngine) {
      this.lightEngine.stop();
      this.log('LightEngine stopped');
    }
  }

}

module.exports = MyApp;
