import { SceneManager, Scene, SceneStringStack } from './scene-manager';
import { LightController } from './light-controller';
import { SceneStore, SceneProvider, LightEngineDeps } from './interfaces';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

export interface LightEngineConfig {
  deps: LightEngineDeps;
  heartbeatIntervalMs?: number;
}

export class LightEngine {
  private sceneStore: SceneStore;
  private sceneProvider: SceneProvider;
  private sceneManager: SceneManager;
  private lightController: LightController;
  private heartbeatIntervalMs: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastAppliedScene: Scene = {};

  constructor(config: LightEngineConfig) {
    this.sceneStore = config.deps.sceneStore;
    this.sceneProvider = config.deps.sceneProvider;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;

    this.sceneManager = new SceneManager();
    this.lightController = new LightController(config.deps.lightControllerDeps);
  }

  async setSceneStack(newStack: SceneStringStack) {
    const newValue = JSON.stringify(newStack);
    log('Stack :=', newValue);

    try {
      await this.sceneStore.setStack(newStack);
    } catch (error) {
      log(`Failed setting stack: ${error}`);
    }
  }

  async getSceneStack(): Promise<SceneStringStack> {
    return this.sceneStore.getStack();
  }

  start() {
    if (this.isRunning) {
      log('LightEngine already running');
      return;
    }

    log(`Starting LightEngine with heartbeat of ${this.heartbeatIntervalMs}ms`);
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.tick().catch((err) => {
        log(`LightEngine tick error: ${err}`);
      });
    }, this.heartbeatIntervalMs);

    this.tick().catch((err) => {
      log(`LightEngine initial tick error: ${err}`);
    });
  }

  stop() {
    if (!this.isRunning) {
      log('LightEngine already stopped');
      return;
    }

    log('Stopping LightEngine');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async tick() {
    try {
      log('LightEngine tick...');

      const priorities = await this.sceneProvider.getScenePriorities();
      const stack = await this.getSceneStack();

      const targetScene = this.sceneManager.flattenStack(stack, priorities);
      log('Target scene:', targetScene);

      const changes = this.sceneManager.getChanges(this.lastAppliedScene, targetScene);

      if (Object.keys(changes).length === 0) {
        log('No changes to apply');
        return;
      }

      log('Changes to apply:', changes);

      await this.lightController.applyScene(changes);

      this.lastAppliedScene = targetScene;
      log('Applied target scene');
    } catch (error) {
      log(`LightEngine tick failed: ${error}`);
    }
  }

  async applyFullScene() {
    try {
      const priorities = await this.sceneProvider.getScenePriorities();
      const stack = await this.getSceneStack();
      const targetScene = this.sceneManager.flattenStack(stack, priorities);

      await this.lightController.applyScene(targetScene);

      this.lastAppliedScene = targetScene;
      log('Full scene applied');
    } catch (error) {
      log(`Apply full scene failed: ${error}`);
    }
  }

  getLastAppliedScene(): Scene {
    return this.lastAppliedScene;
  }
}

export default LightEngine;
