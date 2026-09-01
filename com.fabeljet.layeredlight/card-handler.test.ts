'use strict';

import { CardHandler } from './card-handler';
import { LightEngine } from './light-engine';
import { Scene, SceneStringStack } from './scene-manager';

interface FakeEngine {
  engine: LightEngine;
  applied: { layerName: string; scene: Scene; timestamp: number }[];
  stacks: SceneStringStack[];
  releaseStackWrite: () => void;
  stackWriteStarted: () => Promise<void>;
}

/**
 * A LightEngine stand-in whose stack write blocks until released, so a test can tell whether
 * the flow card is waiting on persistence.
 */
function createFakeEngine(): FakeEngine {
  const applied: { layerName: string; scene: Scene; timestamp: number }[] = [];
  const stacks: SceneStringStack[] = [];
  let stack: SceneStringStack = {};

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  let signalStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });

  const engine = {
    getLayerScene: () => undefined,
    setLayerScene: jest.fn(async (layerName: string, scene: Scene, timestamp: number) => {
      applied.push({ layerName, scene, timestamp });
    }),
    getSceneStack: jest.fn(async () => stack),
    setSceneStack: jest.fn(async (newStack: SceneStringStack) => {
      signalStarted();
      await gate;
      stack = newStack;
      stacks.push(newStack);
    }),
  } as unknown as LightEngine;

  return {
    engine,
    applied,
    stacks,
    releaseStackWrite: () => release(),
    stackWriteStarted: () => started,
  };
}

describe('CardHandler', () => {
  test('the card returns without waiting for the stack write', async () => {
    const fake = createFakeEngine();
    const handler = new CardHandler({ lightEngine: fake.engine });

    // Resolves even though the stack write is still blocked.
    await handler.handleApplyScene('layer1', 'alice:ff', true);

    expect(fake.applied).toHaveLength(1);
    expect(fake.applied[0].layerName).toBe('layer1');
    expect(fake.stacks).toHaveLength(0);

    fake.releaseStackWrite();
    await handler.flushPersist();
    expect(fake.stacks).toHaveLength(1);
  });

  test('the scene is applied before the stack write completes', async () => {
    const fake = createFakeEngine();
    const handler = new CardHandler({ lightEngine: fake.engine });

    const card = handler.handleApplyScene('layer1', 'alice:ff', true);
    await fake.stackWriteStarted();

    await card;
    expect(fake.applied).toHaveLength(1);

    fake.releaseStackWrite();
    await handler.flushPersist();
  });

  test('a burst of triggers persists in order and lands on the last scene', async () => {
    const fake = createFakeEngine();
    const handler = new CardHandler({ lightEngine: fake.engine });

    await Promise.all([
      handler.handleApplyScene('layer1', 'alice:11', true),
      handler.handleApplyScene('layer1', 'alice:22', true),
      handler.handleApplyScene('layer1', 'alice:ff', true),
    ]);

    fake.releaseStackWrite();
    await handler.flushPersist();

    expect(fake.stacks).toHaveLength(3);
    // The stack holds parsed scenes; alice:ff is dim 1.0.
    expect(fake.stacks[fake.stacks.length - 1].layer1).toBe('{"alice":[1]}');
    expect(fake.applied.map((a) => a.layerName)).toEqual(['layer1', 'layer1', 'layer1']);
  });

  test('a failing stack write does not fail the card or block later writes', async () => {
    const fake = createFakeEngine();
    (fake.engine.setSceneStack as jest.Mock).mockRejectedValueOnce(new Error('token write failed'));
    const handler = new CardHandler({ lightEngine: fake.engine });

    await expect(handler.handleApplyScene('layer1', 'alice:ff', true)).resolves.toBeUndefined();

    await handler.handleApplyScene('layer2', 'bob:ff', true);
    fake.releaseStackWrite();
    await handler.flushPersist();

    expect(fake.applied).toHaveLength(2);
    expect(fake.stacks).toHaveLength(1);
  });
});
