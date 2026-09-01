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
  private persistQueue: Promise<void> = Promise.resolve();

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
    const t = Date.now();
    const newScene = this.sceneManager.getSceneFromString(sceneString);

    // Merge into existing layer if not clearing
    const existing = this.lightEngine.getLayerScene(layerName) ?? {};
    const mergedScene = clear ? newScene : this.sceneManager.layerScenes(existing, newScene);

    // Persistence is queued, not awaited: it is only needed for restart recovery, and the
    // Homey token write must never sit between a button press and the light responding.
    this.queuePersist(layerName, sceneString, clear);

    // Update in-memory state and apply — this is the whole critical path.
    await this.lightEngine.setLayerScene(layerName, mergedScene, t);
  }

  /**
   * Serializes stack writes. Read-modify-write of the stack must not interleave, or a burst
   * of triggers can persist a stack that never existed.
   */
  private queuePersist(layerName : string, sceneString : string, clear : boolean) {
    this.persistQueue = this.persistQueue
      .then(async () => {
        const stack = await this.lightEngine.getSceneStack();
        const newStack = this.sceneManager.updateStack(stack, layerName, sceneString, clear);
        await this.lightEngine.setSceneStack(newStack);
        log('Stack updated');
      })
      .catch((err) => log(`Failed persisting stack for layer ${layerName}: ${err}`));
  }

  /** Test hook: resolves once every queued stack write has settled. */
  async flushPersist() {
    await this.persistQueue;
  }

}

export default CardHandler;
