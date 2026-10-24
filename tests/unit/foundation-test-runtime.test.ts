// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FoundationTestRuntime } from '../../src/game/testing/FoundationTestRuntime';
import { TEST_SEEDS } from '../fixtures/seeds';

describe('foundation test runtime', () => {
  let mount: HTMLElement;
  let runtime: FoundationTestRuntime;

  beforeEach(() => {
    mount = document.createElement('main');
    runtime = new FoundationTestRuntime(mount, TEST_SEEDS.smoke, Promise.resolve());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts, pauses, resumes, advances, and resets deterministically', async () => {
    await runtime.startAdventure({ seed: TEST_SEEDS.smoke });
    await runtime.advance(1000);
    expect(runtime.snapshot().simulationTimeMs).toBeCloseTo(1000, 8);
    runtime.input('pause', true);
    await runtime.advance(500);
    expect(runtime.snapshot().simulationTimeMs).toBeCloseTo(1000, 8);
    runtime.input('pause', true);
    await runtime.advance(500);
    expect(runtime.snapshot().simulationTimeMs).toBeCloseTo(1500, 8);
    await runtime.reset();
    expect(runtime.snapshot()).toMatchObject({ state: 'idle', seed: TEST_SEEDS.smoke });
  });

  it('reports aim, boss, damage, and end state as plain snapshots', async () => {
    await runtime.startAdventure({ seed: TEST_SEEDS.boss });
    runtime.aimAt(0, -10);
    await runtime.forceBoss();
    runtime.damagePlayer(100);
    const snapshot = runtime.snapshot();
    expect(snapshot.player.aimDirection).toBe('n');
    expect(snapshot.boss).toEqual({ id: 'graveyard-guardian', health: 1000, phase: 1 });
    expect(snapshot).toMatchObject({ state: 'adventure-ended', eventSequence: 4 });
    expect(() => structuredClone(snapshot)).not.toThrow();
  });

  it('resets in-memory state when browser storage is denied', async () => {
    await runtime.startAdventure({ seed: TEST_SEEDS.smoke });
    await runtime.advance(500);
    vi.stubGlobal('localStorage', {
      get length(): number {
        throw new DOMException('Storage denied', 'SecurityError');
      },
    });

    await expect(runtime.reset({ clearStorage: true })).resolves.toBeUndefined();
    expect(runtime.snapshot()).toMatchObject({
      state: 'idle',
      seed: TEST_SEEDS.smoke,
      simulationTimeMs: 0,
    });
  });

  it('moves diagonally at normalized speed and applies damage cooldowns', async () => {
    await runtime.startAdventure({ seed: TEST_SEEDS.smoke });
    runtime.input('right', true);
    runtime.input('down', true);
    await runtime.advance(1000);
    runtime.input('right', false);
    runtime.input('down', false);

    const moved = runtime.snapshot();
    expect(Math.hypot(moved.player.x, moved.player.y)).toBeCloseTo(90, 8);
    runtime.damagePlayer(20);
    runtime.damagePlayer(20);
    expect(runtime.snapshot().player.health).toBe(80);
    await runtime.advance(600);
    runtime.damagePlayer(20);
    expect(runtime.snapshot().player.health).toBe(60);

    runtime.input('right', true);
    await runtime.advance(30_000);
    expect(runtime.snapshot().player.x).toBe(1920);
  });
});
