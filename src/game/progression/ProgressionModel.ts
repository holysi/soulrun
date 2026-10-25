import type { GameConfig } from '../content';
import type { RandomSource } from '../random/RandomSource';
import type {
  AppliedUpgrade,
  MasteryId,
  PassiveId,
  ProgressionSnapshot,
  UpgradeId,
  UpgradeOffer,
  UpgradeSource,
  WeaponId,
} from './types';

const MASTERY_IDS: readonly MasteryId[] = ['mastery-damage', 'mastery-health', 'mastery-pickup'];

export class ProgressionModel {
  private levelValue = 1;
  private xpValue = 0;
  private queuedLevelUpsValue = 0;
  private offerCounter = 0;
  private offer: UpgradeOffer | null = null;
  private readonly weapons = new Map<WeaponId, number>();
  private readonly passives = new Map<PassiveId, number>();
  private readonly masteries = new Map<MasteryId, number>();

  constructor(
    private readonly config: GameConfig,
    private readonly upgradeRandom: RandomSource,
  ) {
    this.weapons.set(config.player.startingWeaponId, 1);
  }

  get level(): number {
    return this.levelValue;
  }

  get xp(): number {
    return this.xpValue;
  }

  get queuedLevelUps(): number {
    return this.queuedLevelUpsValue;
  }

  get activeOffer(): UpgradeOffer | null {
    return this.offer;
  }

  xpRequiredForLevel(level = this.levelValue): number {
    if (!Number.isInteger(level) || level < 1) throw new Error('Level must be a positive integer');
    const configured = this.config.progression.xpByLevel;
    if (level <= configured.length) return configured[level - 1] as number;
    let requirement = configured.at(-1) as number;
    for (let current = configured.length + 1; current <= level; current += 1) {
      requirement = Math.round(requirement * 1.12);
    }
    return requirement;
  }

  collectXp(value: number): readonly { level: number; overflowXp: number }[] {
    assertNonNegativeInteger(value, 'XP');
    this.xpValue += value;
    const reached: { level: number; overflowXp: number }[] = [];
    while (this.xpValue >= this.xpRequiredForLevel()) {
      this.xpValue -= this.xpRequiredForLevel();
      this.levelValue += 1;
      this.queuedLevelUpsValue += 1;
      reached.push({ level: this.levelValue, overflowXp: this.xpValue });
    }
    return reached;
  }

  offerNextQueuedLevel(): UpgradeOffer | null {
    if (this.offer || this.queuedLevelUpsValue === 0) return null;
    this.queuedLevelUpsValue -= 1;
    return this.createOffer('level');
  }

  offerBossUpgrade(): UpgradeOffer {
    if (this.offer) throw new Error('An upgrade offer is already active');
    if (this.queuedLevelUpsValue > 0) {
      throw new Error('Queued level upgrades must resolve before the Boss upgrade');
    }
    return this.createOffer('boss');
  }

  select(optionId: UpgradeId): AppliedUpgrade {
    if (!this.offer || !this.offer.optionIds.includes(optionId)) {
      throw new Error(`Upgrade ${optionId} is not in the active offer`);
    }
    const result = this.apply(optionId);
    this.offer = null;
    return result;
  }

  snapshot(): ProgressionSnapshot {
    return {
      level: this.levelValue,
      xp: this.xpValue,
      queuedLevelUps: this.queuedLevelUpsValue,
      weaponLevels: sortedRecord(this.weapons),
      passiveLevels: sortedRecord(this.passives),
      masteryLevels: sortedRecord(this.masteries),
      activeOffer: this.offer ? { ...this.offer, optionIds: [...this.offer.optionIds] } : null,
    };
  }

  private createOffer(source: UpgradeSource): UpgradeOffer {
    const normal = this.normalCandidates();
    const count = this.config.progression.upgradeChoiceCount;
    let selected: UpgradeId[];
    if (normal.length >= count) {
      selected = sample(this.upgradeRandom, normal, count);
    } else {
      const masteryCount = count - normal.length;
      selected = [...normal, ...sample(this.upgradeRandom, MASTERY_IDS, masteryCount)];
    }
    selected = this.upgradeRandom.shuffle(selected);
    this.offer = {
      id: `upgrade:${++this.offerCounter}`,
      source,
      optionIds: selected,
    };
    return this.offer;
  }

  private normalCandidates(): UpgradeId[] {
    const candidates: UpgradeId[] = [];
    const ownedSlots = new Set(
      this.config.weapons
        .filter((weapon) => this.weapons.has(weapon.id))
        .map((weapon) => weapon.slot),
    );
    for (const weapon of this.config.weapons) {
      const level = this.weapons.get(weapon.id);
      if (level !== undefined ? level < weapon.maxLevel : !ownedSlots.has(weapon.slot)) {
        candidates.push(weapon.id);
      }
    }
    for (const passive of this.config.passives) {
      if ((this.passives.get(passive.id) ?? 0) < passive.maxLevel) candidates.push(passive.id);
    }
    return candidates.sort((left, right) => left.localeCompare(right));
  }

  private apply(optionId: UpgradeId): AppliedUpgrade {
    const weapon = this.config.weapons.find((item) => item.id === optionId);
    if (weapon) {
      const newLevel = (this.weapons.get(weapon.id) ?? 0) + 1;
      if (newLevel > weapon.maxLevel) throw new Error(`${optionId} is already capped`);
      this.weapons.set(weapon.id, newLevel);
      return { optionId, newLevel, maximumHealthAdded: 0, healing: 0 };
    }
    const passive = this.config.passives.find((item) => item.id === optionId);
    if (passive) {
      const newLevel = (this.passives.get(passive.id) ?? 0) + 1;
      if (newLevel > passive.maxLevel) throw new Error(`${optionId} is already capped`);
      this.passives.set(passive.id, newLevel);
      const health = passive.id === 'max-health' ? passive.perLevel : 0;
      return { optionId, newLevel, maximumHealthAdded: health, healing: health };
    }
    const mastery = this.config.mastery.options.find((item) => item.id === optionId);
    if (!mastery) throw new Error(`Unknown upgrade ${optionId}`);
    const newLevel = (this.masteries.get(mastery.id) ?? 0) + 1;
    this.masteries.set(mastery.id, newLevel);
    const health = mastery.id === 'mastery-health' ? mastery.perPick : 0;
    return { optionId, newLevel, maximumHealthAdded: health, healing: health };
  }
}

function sample<T>(random: RandomSource, sortedItems: readonly T[], count: number): T[] {
  if (count > sortedItems.length) throw new Error('Cannot sample more unique items than available');
  const pool = [...sortedItems];
  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const chosen = random.integer(0, pool.length - 1);
    selected.push(pool.splice(chosen, 1)[0] as T);
  }
  return selected;
}

function sortedRecord<K extends string>(
  values: ReadonlyMap<K, number>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...values.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer`);
}
