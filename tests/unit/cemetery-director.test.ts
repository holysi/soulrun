import { describe, expect, it } from 'vitest';

import { CemeteryDirector } from '../../src/game/cemetery';
import { GAME_CONFIG, isLegalSpawn } from '../../src/game/content';

const player = { x: 960, y: 536 };
const camera = { x: 720, y: 401, width: 480, height: 270 };

describe('cemetery director', () => {
  it('keeps deterministic waves off-screen, outside the safe center, and capped', () => {
    const director = new CemeteryDirector('cemetery-director-seed');
    director.drainThrough(90_000, player, camera);

    expect(director.activeEnemies.length).toBeLessThanOrEqual(GAME_CONFIG.world.maxEnemies);
    expect(director.activeEnemies.some((enemy) => enemy.elite)).toBe(true);
    for (const enemy of director.activeEnemies) {
      expect(
        isLegalSpawn(
          enemy,
          director.stage.bounds,
          camera,
          player,
          GAME_CONFIG.world.offscreenSpawnMargin,
          GAME_CONFIG.world.safeSpawnRadius,
        ),
      ).toBe(true);
    }
  });

  it('spawns the guardian at three minutes and emits one phase transition and defeat', () => {
    const director = new CemeteryDirector('guardian-seed');
    const events = director.drainThrough(180_000, player, camera);
    expect(events.filter((event) => event.kind === 'boss-spawned')).toHaveLength(1);
    expect(director.boss).toMatchObject({ health: 1500, phase: 1, spawnedAtMs: 180_000 });

    expect(director.damageBoss(750)).toEqual([{ kind: 'boss-phase', phase: 2 }]);
    expect(director.damageBoss(750).map((event) => event.kind)).toEqual(['boss-defeated']);
    expect(director.boss).toMatchObject({ health: 0, phase: 2 });
  });

  it('uses the production enemy state for damage, defeat, and summons', () => {
    const director = new CemeteryDirector('damage-seed');
    const enemy = director.drainThrough(0, player, camera)[0];
    if (enemy?.kind !== 'enemy-spawned') throw new Error('Expected opening enemy');
    expect(director.damageEnemy(enemy.enemy.entityId, enemy.enemy.maxHealth)).toMatchObject([
      { kind: 'enemy-defeated' },
    ]);
    expect(director.activeEnemies).toHaveLength(0);
    expect(director.summon('zombie', 4, player, 110, 1000)).toHaveLength(4);
  });

  it('rescales every live enemy after a capped batch and scales later summons', () => {
    const director = new CemeteryDirector('cap-seed');
    director.summon('zombie', GAME_CONFIG.world.maxEnemies, player, 110, 0);
    const before = director.activeEnemies[0];
    if (!before) throw new Error('Expected a capped battlefield');

    director.drainThrough(5000, player, camera);
    const after = director.activeEnemies.find((enemy) => enemy.entityId === before.entityId);
    expect(director.pressureStacks).toBeGreaterThan(0);
    expect(after?.maxHealth).toBeGreaterThan(before.maxHealth);
    expect(after?.health).toBe((before.health ?? 0) + ((after?.maxHealth ?? 0) - before.maxHealth));
    expect(after?.damage).toBeGreaterThan(before.damage);

    director.clearEnemies();
    director.summon('zombie', 1, player, 110, 2000);
    expect(director.activeEnemies[0]).toMatchObject({
      maxHealth: after?.maxHealth,
      damage: after?.damage,
    });
  });
});
