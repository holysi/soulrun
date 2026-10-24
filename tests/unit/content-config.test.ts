import { describe, expect, it } from 'vitest';

import {
  CONTENT_CONFIG,
  createEnemyBehaviorPlan,
  validateContentConfig,
} from '../../src/game/content';
import type { ContentConfig } from '../../src/game/content';

describe('content configuration', () => {
  it('validates the three-stage authored content graph', () => {
    expect(() => validateContentConfig(CONTENT_CONFIG)).not.toThrow();
    expect(CONTENT_CONFIG.stages.map((stage) => stage.id)).toEqual([
      'cemetery',
      'dungeon',
      'inferno',
    ]);
    expect(CONTENT_CONFIG.stages.map((stage) => stage.bossId)).toEqual([
      'graveyard-guardian',
      'skeleton-warden',
      'flame-demon',
    ]);
  });

  it('rejects unresolved IDs and unsorted weighted pools', () => {
    const invalid = {
      ...CONTENT_CONFIG,
      stages: [
        {
          ...CONTENT_CONFIG.stages[0],
          enemyPool: [
            { id: 'zombie', weight: 1 },
            { id: 'bat', weight: 1 },
          ],
        },
        ...CONTENT_CONFIG.stages.slice(1),
      ],
    } as ContentConfig;
    expect(() => validateContentConfig(invalid)).toThrow(/sorted/);
  });

  it('exposes a typed runtime plan for every enemy behavior', () => {
    expect(
      CONTENT_CONFIG.enemies.map((enemy) => createEnemyBehaviorPlan(enemy, { x: 5, y: 8 }).kind),
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
