import { describe, expect, it, vi } from 'vitest';

import { UpgradeFlow, synchronizePhysicsWorld } from '../../src/game/progression';

describe('UpgradeFlow', () => {
  it.each(['playing', 'boss-fight', 'boss-cleanup'] as const)(
    'returns a level-up to its exact %s state',
    (baseState) => {
      const flow = new UpgradeFlow();
      flow.enterBaseState(baseState);
      flow.openLevelUp();
      expect(flow.state).toBe('level-up');
      flow.finishOffer(false);
      expect(flow.state).toBe(baseState);
    },
  );

  it('keeps queued level offers modal and represents the forced Boss offer distinctly', () => {
    const flow = new UpgradeFlow();
    flow.enterBaseState('boss-cleanup');
    flow.openLevelUp();
    flow.finishOffer(true);
    expect(flow.state).toBe('level-up');
    flow.finishOffer(false);
    flow.openBossUpgrade();
    expect(flow.state).toBe('upgrade-choice');
  });
});

describe('synchronizePhysicsWorld', () => {
  it('pauses a normal Arcade world only while a modal is active', () => {
    const world = { pause: vi.fn(), resume: vi.fn() };
    const normal = {
      testControlled: false,
      userPaused: false,
      playerDead: false,
      modalActive: false,
      simulationSuspended: false,
    };

    expect(synchronizePhysicsWorld(world, normal)).toBe('running');
    expect(world.resume).toHaveBeenCalledOnce();
    expect(synchronizePhysicsWorld(world, { ...normal, modalActive: true })).toBe('paused');
    expect(world.pause).toHaveBeenCalledOnce();
    expect(synchronizePhysicsWorld(world, normal)).toBe('running');
    expect(world.resume).toHaveBeenCalledTimes(2);
  });

  it('does not resume after a modal while user or blur pause remains active', () => {
    const world = { pause: vi.fn(), resume: vi.fn() };
    expect(
      synchronizePhysicsWorld(world, {
        testControlled: false,
        userPaused: true,
        modalActive: false,
        simulationSuspended: false,
        playerDead: false,
      }),
    ).toBe('paused');
    expect(world.resume).not.toHaveBeenCalled();
  });
});
