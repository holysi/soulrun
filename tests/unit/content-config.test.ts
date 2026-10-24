import { describe, expect, it } from 'vitest';

import { GAME_CONFIG, createEnemyBehaviorPlan, validateGameConfig } from '../../src/game/content';
import type { GameConfig } from '../../src/game/content';

describe('content configuration', () => {
  it('validates the three-stage authored content graph', () => {
    expect(() => validateGameConfig(GAME_CONFIG)).not.toThrow();
    expect(Object.isFrozen(GAME_CONFIG)).toBe(true);
    expect(Object.isFrozen(GAME_CONFIG.progression)).toBe(true);
    expect(GAME_CONFIG.world.updateHz).toBe(60);
    expect(GAME_CONFIG.stages.map((stage) => stage.id)).toEqual(['cemetery', 'dungeon', 'inferno']);
    expect(GAME_CONFIG.stages.map((stage) => stage.bossId)).toEqual([
      'graveyard-guardian',
      'skeleton-warden',
      'flame-demon',
    ]);
  });

  it('rejects unresolved IDs and unsorted weighted pools', () => {
    const invalid = {
      ...GAME_CONFIG,
      stages: [
        {
          ...GAME_CONFIG.stages[0],
          enemyPool: [
            { id: 'zombie', weight: 1 },
            { id: 'bat', weight: 1 },
          ],
        },
        ...GAME_CONFIG.stages.slice(1),
      ],
    } as GameConfig;
    expect(() => validateGameConfig(invalid)).toThrow(/sorted/);
  });

  it('rejects world-rate and full pressure-row drift', () => {
    const wrongRate = {
      ...GAME_CONFIG,
      world: { ...GAME_CONFIG.world, updateHz: 30 },
    } as GameConfig;
    expect(() => validateGameConfig(wrongRate)).toThrow(/60 Hz/);

    const wrongPressure = {
      ...GAME_CONFIG,
      stages: [
        {
          ...GAME_CONFIG.stages[0],
          pressureSchedule: GAME_CONFIG.stages[0].pressureSchedule.map((step, index) =>
            index === 1 ? { ...step, spawnIntervalMs: 1, batchSize: 999 } : step,
          ),
        },
        ...GAME_CONFIG.stages.slice(1),
      ],
    } as GameConfig;
    expect(() => validateGameConfig(wrongPressure)).toThrow(/pressure schedule/);
  });

  it('rejects a non-positive hazard tick interval', () => {
    const infernoBoss = GAME_CONFIG.bosses[2];
    const invalid = {
      ...GAME_CONFIG,
      bosses: [
        ...GAME_CONFIG.bosses.slice(0, 2),
        {
          ...infernoBoss,
          attacks: infernoBoss.attacks.map((attack) =>
            attack.kind === 'hazard' ? { ...attack, tickMs: 0 } : attack,
          ),
        },
      ],
    } as GameConfig;
    expect(() => validateGameConfig(invalid)).toThrow(/tickMs/);
  });

  it('exposes a typed runtime plan for every enemy behavior', () => {
    expect(
      GAME_CONFIG.enemies.map((enemy) => createEnemyBehaviorPlan(enemy, { x: 5, y: 8 }).kind),
    ).toEqual([
      'steer',
      'dash-cycle',
      'ranged-cycle',
      'split-on-defeat',
      'steer',
      'flank',
      'ranged-cycle',
    ]);
  });
});
