import { describe, expect, it } from 'vitest';

import { GAME_CONFIG } from '../../src/game/content';
import { StageDirector } from '../../src/game/stages';

const player = { x: 960, y: 536 };
const camera = { x: 720, y: 401, width: 480, height: 270 };

describe('stage director', () => {
  it('selects the configured Dungeon pools and Skeleton Warden', () => {
    const director = new StageDirector('dungeon', 'dungeon-director-seed');

    expect(director.stage.id).toBe('dungeon');
    expect(director.bossConfig.id).toBe('skeleton-warden');
    director.drainThrough(30_000, player, camera);
    expect(
      director.activeEnemies.every((enemy) =>
        ['skeleton-archer', 'splitting-slime', 'zombie'].includes(enemy.enemyId),
      ),
    ).toBe(true);

    expect(director.forceBoss(180_000)).toMatchObject({
      kind: 'boss-spawned',
      boss: { id: 'skeleton-warden', health: 2200, phase: 1 },
    });
  });

  it('uses the shared cap and loop scaling for Dungeon summons', () => {
    const director = new StageDirector('dungeon', 'dungeon-loop-seed', 2);
    const archer = GAME_CONFIG.enemies.find((enemy) => enemy.id === 'skeleton-archer')!;

    director.summon('skeleton-archer', 1, player, 40, 1000);
    expect(director.activeEnemies[0]).toMatchObject({
      enemyId: 'skeleton-archer',
      maxHealth: Math.round(archer.health * 1.7),
      damage: Math.round(archer.contactDamage * 1.4),
    });
  });

  it('rejects an unknown stage instead of silently falling back', () => {
    expect(() => new StageDirector('crypt' as 'dungeon', 'bad-stage')).toThrow(
      'Unknown stage crypt',
    );
  });
});
