'use strict';

import Homey from 'homey';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import { LightEngine, LightEngineConfig } from './light-engine.js';
import { CardHandler } from './card-handler.js';

class MyApp extends Homey.App {

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

    const engineConfig: LightEngineConfig = {
      devices: this.homeyApi.devices as HomeyAPI.ManagerDevices,
      logic: this.homeyApi.logic as HomeyAPI.ManagerLogic,
      stackToken,
      heartbeatIntervalMs: 30000,
    };

    this.lightEngine = new LightEngine(engineConfig);

    this.cardHandler = new CardHandler({
      devices: this.homeyApi.devices as HomeyAPI.ManagerDevices,
      logic: this.homeyApi.logic as HomeyAPI.ManagerLogic,
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
