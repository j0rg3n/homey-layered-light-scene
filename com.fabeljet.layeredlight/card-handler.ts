'use strict';

import Homey from 'homey';
import { SceneManager } from './scene-manager';
import { LightEngine } from './light-engine';

function log(message : string, ...optionalParams : unknown[]) {
  console.log(message, ...optionalParams);
}

export interface CardHandlerConfig {
  lightEngine: LightEngine;
}

export class CardHandler {

  private lightEngine: LightEngine;
  private sceneManager: SceneManager;

  constructor(config: CardHandlerConfig) {
    this.lightEngine = config.lightEngine;
    this.sceneManager = new SceneManager();
  }

  registerFlowCards(app : Homey.App) {
    const applyLayeredSceneAction = app.homey.flow.getActionCard('applylayeredscene');

    /* eslint-disable-next-line camelcase */
    applyLayeredSceneAction.registerRunListener(async (args: { layer_name: string; scene: string; clear: boolean }, state: unknown) => {
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
