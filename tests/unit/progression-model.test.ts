import { describe, expect, it } from 'vitest';

import { GAME_CONFIG } from '../../src/game/content';
import { ProgressionModel } from '../../src/game/progression';
import { createGameplayStreams } from '../../src/game/random/RandomSource';

function model(seed = 'upgrade-seed-001'): ProgressionModel {
  return new ProgressionModel(GAME_CONFIG, createGameplayStreams(seed).upgrade);
}

describe('ProgressionModel', () => {
  it('preserves XP overflow and queues every crossed level', () => {
    const progression = model();

    expect(progression.collectXp(26)).toEqual([
      { level: 2, overflowXp: 21 },
      { level: 3, overflowXp: 13 },
      { level: 4, overflowXp: 1 },
    ]);
    expect(progression.snapshot()).toMatchObject({ level: 4, xp: 1, queuedLevelUps: 3 });

    const first = progression.offerNextQueuedLevel();
    expect(first?.source).toBe('level');
    expect(new Set(first?.optionIds).size).toBe(3);
    expect(progression.offerNextQueuedLevel()).toBeNull();
  });

  it('uses only the named upgrade stream and reproduces fixed-seed offers', () => {
    const left = model();
    const unrelated = createGameplayStreams('upgrade-seed-001');
    unrelated.spawn.next();
    unrelated.loot.next();
    unrelated.boss.next();
    const right = new ProgressionModel(GAME_CONFIG, unrelated.upgrade);

    left.collectXp(5);
    right.collectXp(5);
    expect(left.offerNextQueuedLevel()?.optionIds).toEqual(right.offerNextQueuedLevel()?.optionIds);
  });

  it('caps all three weapons at five and all five passives at five', () => {
    const progression = model('caps-seed');
    progression.collectXp(100_000);

    for (let pick = 0; pick < 200; pick += 1) {
      const offer = progression.offerNextQueuedLevel();
      if (!offer) break;
      const normal = offer.optionIds.find((id) => !id.startsWith('mastery-'));
      progression.select(normal ?? (offer.optionIds[0] as never));
    }

    expect(progression.snapshot().weaponLevels).toEqual({
      'death-aura': 5,
      'ghost-arrow': 5,
      'soul-blade': 5,
    });
    expect(progression.snapshot().passiveLevels).toEqual({
      'cooldown-reduction': 5,
      'max-health': 5,
      'move-speed': 5,
      'pickup-range': 5,
      'weapon-damage': 5,
    });
  });

  it('keeps remaining normal candidates and fills only empty slots with unique mastery', () => {
    const progression = model('mastery-seed');
    progression.collectXp(100_000);
    let fallbackOffer: readonly string[] | undefined;

    for (let pick = 0; pick < 200; pick += 1) {
      const offer = progression.offerNextQueuedLevel();
      if (!offer) break;
      const normalOptions = offer.optionIds.filter((id) => !id.startsWith('mastery-'));
      const masteryOptions = offer.optionIds.filter((id) => id.startsWith('mastery-'));
      if (normalOptions.length > 0 && normalOptions.length < 3) {
        fallbackOffer = offer.optionIds;
        expect(new Set(masteryOptions).size).toBe(masteryOptions.length);
        progression.select(normalOptions[0] as never);
        break;
      }
      progression.select((normalOptions[0] ?? offer.optionIds[0]) as never);
    }

    expect(fallbackOffer).toBeDefined();
    expect(fallbackOffer).toHaveLength(3);
  });

  it('applies max-health upgrades as immediate healing and allows repeatable mastery', () => {
    const progression = model('health-seed');
    progression.collectXp(100_000);
    let healthResult;

    for (let pick = 0; pick < 200; pick += 1) {
      const offer = progression.offerNextQueuedLevel();
      if (!offer) break;
      const health = offer.optionIds.find((id) => id === 'max-health');
      const normal = offer.optionIds.find((id) => !id.startsWith('mastery-'));
      const result = progression.select((health ?? normal ?? offer.optionIds[0]) as never);
      if (result.optionId === 'max-health') {
        healthResult = result;
        break;
      }
    }

    expect(healthResult).toMatchObject({ maximumHealthAdded: 15, healing: 15 });
  });
});
