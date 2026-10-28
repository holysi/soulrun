import { describe, expect, it } from 'vitest';

import { GAME_CONFIG, isLegalSpawn, ObjectPool, planSpawnBatch } from '../../src/game/content';
import { Mulberry32Random } from '../../src/game/random/RandomSource';

describe('spawn planning and object pools', () => {
  it('enforces camera, player-safe-radius, and map bounds', () => {
    const map = { x: 0, y: 0, width: 1920, height: 1072 };
    const camera = { x: 720, y: 401, width: 480, height: 270 };
    const player = { x: 960, y: 536 };
    expect(isLegalSpawn({ x: 10, y: 10 }, map, camera, player, 32, 240)).toBe(true);
    expect(isLegalSpawn({ x: 700, y: 536 }, map, camera, player, 32, 240)).toBe(false);
    expect(isLegalSpawn({ x: -1, y: 10 }, map, camera, player, 32, 240)).toBe(false);
  });

  it('does not consume RNG for enemies skipped by the cap', () => {
    const random = new Mulberry32Random('cap-seed');
    const before = random.snapshot();
    const result = planSpawnBatch({
      intendedCount: 3,
      activeEnemies: 120,
      maxEnemies: 120,
      elite: false,
      stage: GAME_CONFIG.stages[0],
      cameraBounds: { x: 720, y: 401, width: 480, height: 270 },
      player: { x: 960, y: 536 },
      safeSpawnRadius: 240,
      offscreenSpawnMargin: 32,
      random,
    });
    expect(result).toEqual({ requests: [], skippedByCap: 3 });
    expect(random.snapshot()).toEqual(before);
  });

  it('produces identical legal batches for the same seed', () => {
    const options = {
      intendedCount: 3,
      activeEnemies: 0,
      maxEnemies: 120,
      elite: false,
      stage: GAME_CONFIG.stages[0],
      cameraBounds: { x: 720, y: 401, width: 480, height: 270 },
      player: { x: 960, y: 536 },
      safeSpawnRadius: 240,
      offscreenSpawnMargin: 32,
    } as const;
    const first = planSpawnBatch({ ...options, random: new Mulberry32Random('spawn-seed') });
    const second = planSpawnBatch({ ...options, random: new Mulberry32Random('spawn-seed') });
    expect(first).toEqual(second);
    expect(
      first.requests.every((request) =>
        isLegalSpawn(
          request.position,
          options.stage.bounds,
          options.cameraBounds,
          options.player,
          options.offscreenSpawnMargin,
          options.safeSpawnRadius,
        ),
      ),
    ).toBe(true);
  });

  it('excludes solid stage geometry with collision padding', () => {
    const wall = { x: 0, y: 0, width: 900, height: 1072 };
    const options = {
      intendedCount: 8,
      activeEnemies: 0,
      maxEnemies: 120,
      elite: false,
      stage: GAME_CONFIG.stages[1],
      cameraBounds: { x: 720, y: 401, width: 480, height: 270 },
      player: { x: 960, y: 536 },
      safeSpawnRadius: 240,
      offscreenSpawnMargin: 32,
      excludedRects: [wall],
      collisionPadding: 18,
    } as const;
    const result = planSpawnBatch({ ...options, random: new Mulberry32Random('solid-seed') });
    expect(result.requests).toHaveLength(8);
    expect(result.requests.every((request) => request.position.x > 918)).toBe(true);
  });

  it('reserves projectile patterns atomically at a fixed boundary', () => {
    const pool = new ObjectPool(3, (id) => ({ id, active: false }));
    expect(pool.reserve(2)).toHaveLength(2);
    expect(pool.reserve(2)).toBeUndefined();
    expect(pool.activeCount).toBe(2);
    pool.reset();
    expect(pool.activeCount).toBe(0);
  });
});
