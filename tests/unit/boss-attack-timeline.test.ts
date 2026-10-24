import { describe, expect, it } from 'vitest';

import {
  BOSSES,
  BossAttackTimeline,
  bossAttackCooldown,
  getBossPhase,
} from '../../src/game/content';

describe('Boss attack timeline', () => {
  it('transitions once at half health and shortens only cooldown in phase two', () => {
    const boss = BOSSES[0];
    const attack = boss.attacks[0];
    expect(getBossPhase(boss, 751)).toBe(1);
    expect(getBossPhase(boss, 750)).toBe(2);
    expect(bossAttackCooldown(boss, attack, 2)).toBe(2400);
    expect(attack.telegraphMs).toBe(800);
  });

  it('never deals damage during a telegraph', () => {
    const attack = BOSSES[2].attacks[1];
    const timeline = new BossAttackTimeline(attack, 10_000, attack.cooldownMs);
    expect(timeline.stateAt(10_849)).toBe('telegraph');
    expect(timeline.canDealDamage(10_849)).toBe(false);
    expect(timeline.stateAt(10_850)).toBe('active');
    expect(timeline.canDealDamage(10_850)).toBe(true);
    expect(timeline.damageMomentsBetween(10_000, 10_849)).toEqual([]);
    expect(timeline.damageMomentsBetween(10_849, 12_400)).toEqual([10_850, 11_350, 11_850, 12_350]);
  });
});
