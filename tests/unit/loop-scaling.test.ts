import { describe, expect, it } from 'vitest';

import { GAME_CONFIG, effectiveSpawnInterval, scaleEnemyStats } from '../../src/game/content';

describe('adventure loop scaling', () => {
  const enemy = GAME_CONFIG.enemies.find((candidate) => candidate.id === 'zombie')!;
  const stage = GAME_CONFIG.stages.find((candidate) => candidate.id === 'cemetery')!;

  it('raises health, damage, and spawn pressure after one completed loop', () => {
    const scaled = scaleEnemyStats(
      enemy,
      1,
      false,
      0,
      stage.capEscalation,
      GAME_CONFIG.progression,
    );
    const baseInterval = stage.pressureSchedule[0]!.spawnIntervalMs;

    expect(scaled.maximumHealth).toBe(Math.floor(enemy.health * 1.35 + 0.5));
    expect(scaled.damage).toBe(Math.floor(enemy.contactDamage * 1.2 + 0.5));
    expect(effectiveSpawnInterval(baseInterval, 1)).toBe(Math.floor(baseInterval / 1.15 + 0.5));
  });

  it('caps movement speed at 125% while other loop multipliers continue growing', () => {
    const scaled = scaleEnemyStats(
      enemy,
      20,
      false,
      0,
      stage.capEscalation,
      GAME_CONFIG.progression,
    );

    expect(scaled.moveSpeed).toBe(enemy.moveSpeed * 1.25);
    expect(scaled.maximumHealth).toBeGreaterThan(enemy.health * 7);
    expect(scaled.damage).toBe(enemy.contactDamage * 5);
  });
});
