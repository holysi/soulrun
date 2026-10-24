export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

export interface WeightedId {
  readonly id: string;
  readonly weight: number;
}

export interface PressureStep {
  readonly atMs: number;
  readonly spawnIntervalMs: number;
  readonly batchSize: number;
}

export interface StageConfig {
  readonly id: 'cemetery' | 'dungeon' | 'inferno';
  readonly order: number;
  readonly mapKey: string;
  readonly tilesetKey: string;
  readonly musicKey: string;
  readonly bounds: Rect;
  readonly playerSpawn: Point;
  readonly obstacleLayer: 'obstacles';
  readonly hazardLayer?: 'hazards';
  readonly enemyPool: readonly WeightedId[];
  readonly eliteEnemyPool: readonly WeightedId[];
  readonly pressureSchedule: readonly PressureStep[];
  readonly capEscalation: Readonly<{
    healthPerStack: number;
    damagePerStack: number;
    maxStacks: number;
  }>;
  readonly durationMs: number;
  readonly eliteTimesMs: readonly number[];
  readonly bossId: BossId;
  readonly paletteId: string;
}

interface EnemyBase {
  readonly id: EnemyId;
  readonly health: number;
  readonly moveSpeed: number;
  readonly contactDamage: number;
  readonly radius: number;
  readonly assetKey: string;
  readonly audioKey: string;
  readonly eliteEligible: boolean;
  readonly rewards: Readonly<{
    normal: Readonly<{ xp: number; score: number }>;
    elite?: Readonly<{ xp: number; score: number }>;
  }>;
}

export type EnemyId =
  | 'zombie'
  | 'bat'
  | 'skeleton-archer'
  | 'splitting-slime'
  | 'small-slime'
  | 'swift-demon'
  | 'flame-skull';

export type EnemyConfig = EnemyBase &
  (
    | Readonly<{ behavior: 'chase'; params: { readonly turnRateDegPerSec: number } }>
    | Readonly<{
        behavior: 'dash';
        params: Readonly<{
          windupMs: number;
          dashMs: number;
          dashSpeed: number;
          recoveryMs: number;
        }>;
      }>
    | Readonly<{
        behavior: 'kite-ranged';
        params: Readonly<{
          preferredDistance: number;
          retreatDistance: number;
          attackCooldownMs: number;
          projectileSpeed: number;
          projectileLifetimeMs: number;
          telegraphMs: number;
          projectileDamage: number;
        }>;
      }>
    | Readonly<{
        behavior: 'split';
        params: Readonly<{ childEnemyId: EnemyId; childCount: number }>;
      }>
    | Readonly<{
        behavior: 'flank';
        params: Readonly<{ leadDistance: number; repathMs: number; turnRateDegPerSec: number }>;
      }>
    | Readonly<{
        behavior: 'ranged';
        params: Readonly<{
          preferredDistance: number;
          attackCooldownMs: number;
          projectileSpeed: number;
          projectileLifetimeMs: number;
          telegraphMs: number;
          projectileDamage: number;
        }>;
      }>
  );

export type BossId = 'graveyard-guardian' | 'skeleton-warden' | 'flame-demon';

interface BossAttackBase {
  readonly id: string;
  readonly cooldownMs: number;
  readonly telegraphMs: number;
  readonly damage: number;
}

export type BossAttack = BossAttackBase &
  (
    | Readonly<{ kind: 'summon'; enemyId: EnemyId; count: number; spawnRadius: number }>
    | Readonly<{ kind: 'line'; length: number; width: number; activeMs: number }>
    | Readonly<{
        kind: 'fan';
        projectileCount: number;
        arcDeg: number;
        projectileSpeed: number;
        projectileLifetimeMs: number;
      }>
    | Readonly<{ kind: 'slam'; radius: number; activeMs: number }>
    | Readonly<{ kind: 'block'; width: number; height: number; activeMs: number }>
    | Readonly<{
        kind: 'ring';
        projectileCount: number;
        projectileSpeed: number;
        projectileLifetimeMs: number;
      }>
    | Readonly<{ kind: 'charge'; distance: number; speed: number; recoveryMs: number }>
    | Readonly<{ kind: 'hazard'; radius: number; activeMs: number; tickMs: number }>
  );

export interface BossConfig {
  readonly id: BossId;
  readonly stageId: StageConfig['id'];
  readonly health: number;
  readonly moveSpeed: number;
  readonly contactDamage: number;
  readonly score: 1000;
  readonly radius: number;
  readonly assetKey: string;
  readonly musicKey: string;
  readonly phaseThreshold: 0.5;
  readonly safeEntryMs: 2000;
  readonly phase2CooldownMultiplier: number;
  readonly attacks: readonly BossAttack[];
}

export interface ContentConfig {
  readonly schemaVersion: 1;
  readonly world: Readonly<{
    logicalWidth: number;
    logicalHeight: number;
    mapWidth: number;
    mapHeight: number;
    maxEnemies: number;
    maxProjectiles: number;
    safeSpawnRadius: number;
    offscreenSpawnMargin: number;
  }>;
  readonly elite: Readonly<{
    healthMultiplier: number;
    damageMultiplier: number;
    scaleMultiplier: number;
  }>;
  readonly stages: readonly StageConfig[];
  readonly enemies: readonly EnemyConfig[];
  readonly bosses: readonly BossConfig[];
}
