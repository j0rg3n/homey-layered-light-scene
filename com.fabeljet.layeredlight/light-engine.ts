import { HomeyAPIV3Local as HomeyAPI } from 'homey-api';
import Homey from 'homey';
import { SceneManager, Scene, SceneStringStack } from './scene-manager.js';
import { LightController } from './light-controller.js';

function log(message : string, ...optionalParams : any[]) {
  console.log(message, ...optionalParams);
}

function wait(durationMs : number) : Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), durationMs);
  });
}

export interface LightEngineConfig {
    devices : HomeyAPI.ManagerDevices;
    logic : HomeyAPI.ManagerLogic;
    stackToken : Homey.FlowToken;
    heartbeatIntervalMs? : number;
}

export class LightEngine {

    private devices : HomeyAPI.ManagerDevices;
    private logic : HomeyAPI.ManagerLogic;
    private stackToken : Homey.FlowToken;
    private sceneManager : SceneManager;
    private lightController : LightController;
    private heartbeatIntervalMs : number;
    private stack : string = '{}';
    private intervalId : NodeJS.Timeout | null = null;
    private isRunning : boolean = false;
    private lastAppliedScene : Scene = {};

    constructor(config : LightEngineConfig) {
      this.devices = config.devices;
      this.logic = config.logic;
      this.stackToken = config.stackToken;
      this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;

      this.sceneManager = new SceneManager();
      this.lightController = new LightController(this.devices);
    }

    async setSceneStack(newStack : SceneStringStack) {
      const newValue = JSON.stringify(newStack);
      log('Stack :=', newValue);
      this.stack = newValue;

      try {
        await this.stackToken.setValue(newValue);
      } catch (error) {
        log(`Failed setting stack token: ${error}`);
      }
    }

    async getSceneStack() : Promise<SceneStringStack> {
      log('Stack =', this.stack);
      return JSON.parse(this.stack);
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

        const priorities = await this.sceneManager.getScenePriorities(this.logic);
        const stack = await this.getSceneStack();

        const targetScene = this.sceneManager.flattenStack(stack, priorities);
        log('Target scene:', targetScene);

        const changes = this.sceneManager.getChanges(this.lastAppliedScene, targetScene);

        if (Object.keys(changes).length === 0) {
          log('No changes to apply');
          return;
        }

        log('Changes to apply:', changes);

        const lights = await this.lightController.getLights();
        await this.lightController.applyScene(lights, changes);

        this.lastAppliedScene = targetScene;
        log('Applied target scene');
      } catch (error) {
        log(`LightEngine tick failed: ${error}`);
      }
    }

    async applyFullScene() {
      try {
        const priorities = await this.sceneManager.getScenePriorities(this.logic);
        const stack = await this.getSceneStack();
        const targetScene = this.sceneManager.flattenStack(stack, priorities);

        const lights = await this.lightController.getLights();
        await this.lightController.applyScene(lights, targetScene);

        this.lastAppliedScene = targetScene;
        log('Full scene applied');
      } catch (error) {
        log(`Apply full scene failed: ${error}`);
      }
    }

}

export default LightEngine;
