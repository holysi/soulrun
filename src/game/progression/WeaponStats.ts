import type { GameConfig, WeaponConfig } from '../content';

export interface EffectiveWeaponStats {
  readonly damage: number;
  readonly cooldownMs: number;
  readonly projectileCount?: number;
  readonly penetration?: number;
  readonly bladeCount?: number;
  readonly orbitRadius?: number;
  readonly orbitSpeedDegPerSec?: number;
  readonly effectRadius?: number;
}

export interface EffectivePlayerStats {
  readonly moveSpeed: number;
  readonly pickupRadius: number;
}

export function effectivePlayerStats(
  passiveLevels: Readonly<Record<string, number>>,
  masteryLevels: Readonly<Record<string, number>>,
  config: GameConfig,
): EffectivePlayerStats {
  return {
    moveSpeed:
      config.player.moveSpeed *
      (1 + (passiveLevels['move-speed'] ?? 0) * passivePerLevel(config, 'move-speed')),
    pickupRadius:
      config.player.pickupRadius *
      (1 +
        (passiveLevels['pickup-range'] ?? 0) * passivePerLevel(config, 'pickup-range') +
        (masteryLevels['mastery-pickup'] ?? 0) * masteryPerPick(config, 'mastery-pickup')),
  };
}

export function effectiveWeaponStats(
  weapon: WeaponConfig,
  level: number,
  passiveLevels: Readonly<Record<string, number>>,
  masteryLevels: Readonly<Record<string, number>>,
  config: GameConfig,
): EffectiveWeaponStats {
  if (!Number.isInteger(level) || level < 1 || level > weapon.maxLevel) {
    throw new Error(`Invalid ${weapon.id} level ${level}`);
  }
  let damage = weapon.damage;
  let cooldownMultiplier = 1;
  let projectileCount = weapon.projectileCount;
  let penetration = weapon.penetration;
  let bladeCount = weapon.bladeCount;
  let orbitRadius = weapon.orbitRadius;
  let orbitSpeedDegPerSec = weapon.orbitSpeedDegPerSec;
  let effectRadius = weapon.effectRadius;
  for (const delta of weapon.levels.slice(0, level)) {
    damage += delta.damageAdd ?? 0;
    cooldownMultiplier *= delta.cooldownMultiplier ?? 1;
    projectileCount = addOptional(projectileCount, delta.projectileCountAdd);
    penetration = addOptional(penetration, delta.penetrationAdd);
    bladeCount = addOptional(bladeCount, delta.bladeCountAdd);
    orbitRadius = addOptional(orbitRadius, delta.orbitRadiusAdd);
    orbitSpeedDegPerSec = addOptional(orbitSpeedDegPerSec, delta.orbitSpeedAddDegPerSec);
    effectRadius = addOptional(effectRadius, delta.effectRadiusAdd);
  }
  const passiveDamage = passiveLevels['weapon-damage'] ?? 0;
  const masteryDamage = masteryLevels['mastery-damage'] ?? 0;
  const damageMultiplier =
    1 +
    passiveDamage * passivePerLevel(config, 'weapon-damage') +
    masteryDamage * masteryPerPick(config, 'mastery-damage');
  const reduction = Math.min(
    0.3,
    (passiveLevels['cooldown-reduction'] ?? 0) * passivePerLevel(config, 'cooldown-reduction'),
  );
  return {
    damage: damage * damageMultiplier,
    cooldownMs: weapon.cooldownMs * cooldownMultiplier * (1 - reduction),
    projectileCount,
    penetration,
    bladeCount,
    orbitRadius,
    orbitSpeedDegPerSec,
    effectRadius,
  };
}

function addOptional(value: number | undefined, delta: number | undefined): number | undefined {
  return value === undefined ? undefined : value + (delta ?? 0);
}

function passivePerLevel(config: GameConfig, id: string): number {
  return config.passives.find((item) => item.id === id)?.perLevel ?? 0;
}

function masteryPerPick(config: GameConfig, id: string): number {
  return config.mastery.options.find((item) => item.id === id)?.perPick ?? 0;
}
