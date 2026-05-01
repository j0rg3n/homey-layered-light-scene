'use strict';

import { Scene, SceneStringStack } from './scene-manager.ts';

export type SettingValue = number[] | boolean | null;

export interface LayerState {
  layerName: string;
  scene: Scene;
  setTimestamp: number;
}

export interface SceneStore {
  getStack(): Promise<SceneStringStack>;
  setStack(stack: SceneStringStack): Promise<void>;
}

export interface SceneProvider {
  getScenePriorities(): Promise<string[]>;
  getSceneArrangement(): Promise<string[][]>;
}

export interface DeviceCapabilities {
  setCapabilityValue(capabilityId: string, value: boolean | number | string, duration?: number): Promise<void>;
}

export interface LightDevice {
  id: string;
  name: string;
  class?: string;
  virtualClass?: string;
  capabilitiesObj: Record<string, {
    min: number;
    max: number;
    units?: string;
  }>;
  setCapabilityValue(args: { capabilityId: string; value: boolean | number | string; duration?: number }): Promise<void>;
}

export interface DeviceProvider {
  getDevices(): Promise<LightDevice[]>;
}

export interface LightControllerDeps {
  deviceProvider: DeviceProvider;
}

export interface OptimizerState {
  knownValues: Map<string, SettingValue>;
  knownTimestamps: Map<string, number>;
}

export interface LightEngineDeps {
  sceneStore: SceneStore;
  sceneProvider: SceneProvider;
  lightControllerDeps: LightControllerDeps;
}
