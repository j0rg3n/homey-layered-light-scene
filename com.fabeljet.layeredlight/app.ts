'use strict';

import Homey from 'homey';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import LightLayers, { LightLayersConfig } from './lightlayers.js';

class MyApp extends Homey.App {
  homeyApi: any;
  lightLayers: LightLayers|null = null;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MyApp has been initialized');

    const myToken = await this.homey.flow.createToken("my_token", {
      type: "string",
      title: "My Token",
      value: "{}",
    });

    this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });
    const config = new LightLayersConfig(this.homeyApi.devices as HomeyAPI.ManagerDevices, 
      this.homeyApi.logic as HomeyAPI.ManagerLogic,
      myToken)

    this.lightLayers = new LightLayers(config);

    const applyLayeredSceneAction = this.homey.flow.getActionCard('applylayeredscene');
    applyLayeredSceneAction.registerRunListener(async (args, state) => {
      //var layers = new LightLayers()
      if (this.lightLayers === null) {
        throw new Error('LightLayers not initialized');
      }
      await this.lightLayers.applyNamedSceneString(args.layer_name, args.scene, args.step_interval_ms, args.clear);
    });
  }

}

module.exports = MyApp;
