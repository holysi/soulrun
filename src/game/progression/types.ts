import type { PassiveConfig, WeaponConfig } from '../content';

export type WeaponId = WeaponConfig['id'];
export type PassiveId = PassiveConfig['id'];
export type MasteryId = 'mastery-damage' | 'mastery-health' | 'mastery-pickup';
export type UpgradeId = WeaponId | PassiveId | MasteryId;
export type UpgradeSource = 'level' | 'boss';

export interface UpgradeOffer {
  readonly id: string;
  readonly source: UpgradeSource;
  readonly optionIds: readonly UpgradeId[];
}

export interface ProgressionSnapshot {
  readonly level: number;
  readonly xp: number;
  readonly queuedLevelUps: number;
  readonly weaponLevels: Readonly<Record<string, number>>;
  readonly passiveLevels: Readonly<Record<string, number>>;
  readonly masteryLevels: Readonly<Record<string, number>>;
  readonly activeOffer: UpgradeOffer | null;
}

export interface AppliedUpgrade {
  readonly optionId: UpgradeId;
  readonly newLevel: number;
  readonly maximumHealthAdded: number;
  readonly healing: number;
}
