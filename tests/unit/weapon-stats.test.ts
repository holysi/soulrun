import { describe, expect, it } from 'vitest';

import { GAME_CONFIG } from '../../src/game/content';
import { effectivePlayerStats, effectiveWeaponStats } from '../../src/game/progression';

describe('effectiveWeaponStats', () => {
  it('applies each five-level weapon identity from configuration', () => {
    const arrow = GAME_CONFIG.weapons.find((weapon) => weapon.id === 'ghost-arrow');
    const blade = GAME_CONFIG.weapons.find((weapon) => weapon.id === 'soul-blade');
    const aura = GAME_CONFIG.weapons.find((weapon) => weapon.id === 'death-aura');
    if (!arrow || !blade || !aura) throw new Error('Missing weapon config');

    expect(effectiveWeaponStats(arrow, 5, {}, {}, GAME_CONFIG)).toMatchObject({
      damage: 18,
      cooldownMs: 675,
      projectileCount: 2,
      penetration: 1,
    });
    expect(effectiveWeaponStats(blade, 5, {}, {}, GAME_CONFIG)).toMatchObject({
      damage: 14,
      bladeCount: 3,
      orbitRadius: 58,
      orbitSpeedDegPerSec: 150,
    });
    expect(effectiveWeaponStats(aura, 5, {}, {}, GAME_CONFIG)).toMatchObject({
      damage: 20,
      cooldownMs: 1050,
      effectRadius: 74,
    });
  });

  it('uses additive base multipliers and enforces cooldown reduction cap', () => {
    const arrow = GAME_CONFIG.weapons.find((weapon) => weapon.id === 'ghost-arrow');
    if (!arrow) throw new Error('Missing Ghost Arrow config');
    const stats = effectiveWeaponStats(
      arrow,
      1,
      { 'weapon-damage': 5, 'cooldown-reduction': 99 },
      { 'mastery-damage': 2 },
      GAME_CONFIG,
    );

    expect(stats.damage).toBeCloseTo(12 * 1.56);
    expect(stats.cooldownMs).toBeCloseTo(900 * 0.7);
  });

  it('applies movement and pickup bonuses from base values without compounding', () => {
    const stats = effectivePlayerStats(
      { 'move-speed': 5, 'pickup-range': 5 },
      { 'mastery-pickup': 2 },
      GAME_CONFIG,
    );
    expect(stats.moveSpeed).toBeCloseTo(126);
    expect(stats.pickupRadius).toBeCloseTo(58.8);
  });
});
