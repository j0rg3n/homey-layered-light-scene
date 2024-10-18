'use strict';

import Homey from 'homey';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import LightLayers from './lightlayers.js';

class MyApp extends Homey.App {
  homeyApi: any;
  lightLayers: LightLayers|null = null;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MyApp has been initialized');

    this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });
    this.lightLayers = new LightLayers(this.homeyApi.devices as HomeyAPI.ManagerDevices, this.homeyApi.logic as HomeyAPI.ManagerLogic);

    const stopRainingAction = this.homey.flow.getActionCard('applylayeredscene');
    stopRainingAction.registerRunListener(async (args, state) => {
      //var layers = new LightLayers()
      if (this.lightLayers === null) {
        throw new Error('LightLayers not initialized');
      }
      await this.lightLayers.applyNamedSceneString(args.layer_name, args.scene, args.step_interval_ms, args.clear);
    });
  }

}

module.exports = MyApp;
