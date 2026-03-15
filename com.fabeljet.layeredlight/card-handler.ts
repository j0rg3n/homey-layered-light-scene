import Homey from 'homey';
import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import { SceneManager, SceneStringStack } from './scene-manager.js';
import { LightEngine } from './light-engine.js';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

export interface CardHandlerConfig {
    devices : HomeyAPI.ManagerDevices;
    logic : HomeyAPI.ManagerLogic;
    lightEngine : LightEngine;
}

export class CardHandler {

    private devices : HomeyAPI.ManagerDevices;
    private logic : HomeyAPI.ManagerLogic;
    private lightEngine : LightEngine;
    private sceneManager : SceneManager;

    constructor(config : CardHandlerConfig) {
      this.devices = config.devices;
      this.logic = config.logic;
      this.lightEngine = config.lightEngine;
      this.sceneManager = new SceneManager();
    }

    registerFlowCards(app : Homey.App) {
      const applyLayeredSceneAction = app.homey.flow.getActionCard('applylayeredscene');

      applyLayeredSceneAction.registerRunListener(async (args: { layer_name: string; scene: string; clear: boolean }, state: any) => {
        log(`Card triggered: ${args.layer_name} = ${args.scene} (clear: ${args.clear})`);

        await this.handleApplyScene(
          args.layer_name,
          args.scene,
          args.clear,
        );
      });

      log('Flow cards registered');
    }

    async handleApplyScene(layerName : string, sceneString : string, clear : boolean) {
      const stack = await this.lightEngine.getSceneStack();
      log('Current stack:', stack);

      const newStack = this.sceneManager.updateStack(
        stack,
        layerName,
        sceneString,
        clear,
      );

      await this.lightEngine.setSceneStack(newStack);
      log('Stack updated, LightEngine will apply on next tick');
    }

}

export default CardHandler;
