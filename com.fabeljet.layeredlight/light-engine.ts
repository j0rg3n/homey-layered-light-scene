'use strict';

import {
  SceneManager, Scene, SceneStringStack, Setting, SegmentInfo,
} from './scene-manager';
import { LightController } from './light-controller';
import {
  SceneStore, SceneProvider, LightEngineDeps, LayerState,
} from './interfaces';

function log(message : string, ...optionalParams : unknown[]) {
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
  private animationTickId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastAppliedScene: Scene = {};
  private layerStates: Map<string, LayerState> = new Map();
  private currentLightValues: Map<string, Setting> = new Map();

  constructor(config: LightEngineConfig) {
    this.sceneStore = config.deps.sceneStore;
    this.sceneProvider = config.deps.sceneProvider;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;

    this.sceneManager = new SceneManager();
    this.lightController = new LightController(config.deps.lightControllerDeps);
  }

  async setLayer(layerName: string, sceneString: string, timestamp: number) {
    const scene = this.sceneManager.getSceneFromString(sceneString);
    this.setLayerScene(layerName, scene, timestamp);
  }

  setLayerScene(layerName: string, scene: Scene, timestamp: number) {
    this.layerStates.set(layerName, { layerName, scene, setTimestamp: timestamp });
    log(`Layer set: ${layerName} at ${timestamp}`);
    this.tick(timestamp).catch((err) => log(`LightEngine tick error after setLayer: ${err}`));
  }

  getLayerScene(layerName: string): Scene | undefined {
    return this.layerStates.get(layerName)?.scene;
  }

  async clearLayer(layerName: string, timestamp: number) {
    this.layerStates.delete(layerName);
    log(`Layer cleared: ${layerName}`);
    this.tick(timestamp).catch((err) => log(`LightEngine tick error after clearLayer: ${err}`));
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

    this.loadPersistedState().then(() => this.tick()).catch((err) => {
      log(`LightEngine startup error: ${err}`);
    });
  }

  private async loadPersistedState() {
    const stack = await this.sceneStore.getStack();
    const priorities = await this.sceneProvider.getScenePriorities();
    const t = Date.now();
    for (const layerName of priorities) {
      const sceneJson = stack[layerName];
      if (sceneJson) {
        const scene = this.sceneManager.getSceneFromJson(sceneJson);
        this.layerStates.set(layerName, { layerName, scene, setTimestamp: t });
        log(`Loaded persisted layer: ${layerName}`);
      }
    }
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

    if (this.animationTickId) {
      clearTimeout(this.animationTickId);
      this.animationTickId = null;
    }
  }

  async tick(timestamp?: number) {
    const t = timestamp ?? Date.now();

    try {
      log('LightEngine tick...');

      const priorities = await this.sceneProvider.getScenePriorities();
      const layers: { scene: Scene; setTimestamp: number }[] = [];

      for (const layerName of priorities) {
        const layerState = this.layerStates.get(layerName);
        if (layerState) {
          layers.push({ scene: layerState.scene, setTimestamp: layerState.setTimestamp });
        }
      }

      const infoMap = this.sceneManager.flattenLayersInfo(layers, t);

      const evaluatedScene: Scene = {};
      for (const [lightName, info] of infoMap) {
        evaluatedScene[lightName] = info.value;
      }

      const changes = this.sceneManager.getChanges(this.lastAppliedScene, evaluatedScene);

      // Schedule next tick at keyframe boundary before early-return (handles hold segments too)
      this.scheduleAnimationTick(infoMap);

      if (Object.keys(changes).length === 0) {
        log('No changes to apply');
        return;
      }

      log('Changes to apply:', changes);

      for (const lightName of Object.keys(changes)) {
        const setting = changes[lightName] as Setting;
        this.currentLightValues.set(lightName, setting);
      }

      await this.lightController.applySceneInfo(infoMap, changes);

      this.lastAppliedScene = evaluatedScene;
      log('Applied target scene');
    } catch (error) {
      log(`LightEngine tick failed: ${error}`);
    }
  }

  private scheduleAnimationTick(infoMap: Map<string, SegmentInfo>) {
    let minRemaining = Infinity;
    for (const [, info] of infoMap) {
      if (info.transition !== null) {
        const remaining = info.transition.totalMs - info.transition.elapsedMs;
        if (remaining > 0) minRemaining = Math.min(minRemaining, remaining);
      }
    }

    if (this.animationTickId) {
      clearTimeout(this.animationTickId);
      this.animationTickId = null;
    }

    if (minRemaining < Infinity && minRemaining < this.heartbeatIntervalMs) {
      const delay = minRemaining + 50;
      this.animationTickId = setTimeout(() => {
        this.animationTickId = null;
        this.tick().catch((err) => log(`LightEngine animation tick error: ${err}`));
      }, delay);
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

  getCurrentLightValues(): Map<string, Setting> {
    return this.currentLightValues;
  }

  getLayerTimestamps(): Map<string, number> {
    const timestamps = new Map<string, number>();
    for (const [name, state] of this.layerStates) {
      timestamps.set(name, state.setTimestamp);
    }
    return timestamps;
  }

}

export default LightEngine;
