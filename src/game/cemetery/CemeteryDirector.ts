import {
  CapEscalation,
  GAME_CONFIG,
  WaveScheduler,
  getBossPhase,
  planSpawnBatch,
  scaleEnemyStats,
} from '../content';
import type { BossConfig, EnemyConfig, Rect } from '../content';
import { createGameplayStreams } from '../random/RandomSource';

export interface CemeteryEnemyState {
  readonly entityId: string;
  readonly enemyId: EnemyConfig['id'];
  readonly elite: boolean;
  readonly x: number;
  readonly y: number;
  readonly maxHealth: number;
  readonly health: number;
  readonly damage: number;
  readonly moveSpeed: number;
  readonly radius: number;
  readonly spawnedAtMs: number;
}

export interface CemeteryBossState {
  readonly id: 'graveyard-guardian';
  readonly health: number;
  readonly maximumHealth: number;
  readonly phase: 1 | 2;
  readonly spawnedAtMs: number;
}

export type CemeteryDirectorEvent =
  | Readonly<{ kind: 'enemy-spawned'; enemy: CemeteryEnemyState }>
  | Readonly<{ kind: 'boss-spawned'; boss: CemeteryBossState }>
  | Readonly<{ kind: 'boss-phase'; phase: 2 }>
  | Readonly<{ kind: 'enemy-defeated'; enemy: CemeteryEnemyState }>
  | Readonly<{ kind: 'boss-defeated'; boss: CemeteryBossState }>;

export class CemeteryDirector {
  readonly stage = GAME_CONFIG.stages.find((candidate) => candidate.id === 'cemetery')!;
  readonly bossConfig = GAME_CONFIG.bosses.find(
    (candidate) => candidate.id === 'graveyard-guardian',
  ) as BossConfig & { readonly id: 'graveyard-guardian' };
  private readonly scheduler: WaveScheduler;
  private readonly spawnRandom;
  private readonly capEscalation = new CapEscalation(this.stage.capEscalation);
  private readonly enemies = new Map<string, CemeteryEnemyState>();
  private entityCounter = 0;
  private bossValue: CemeteryBossState | null = null;

  constructor(seed: string, completedLoops = 0) {
    this.scheduler = new WaveScheduler(this.stage, completedLoops);
    this.spawnRandom = createGameplayStreams(seed).spawn;
  }

  get boss(): CemeteryBossState | null {
    return this.bossValue;
  }

  get activeEnemies(): readonly CemeteryEnemyState[] {
    return [...this.enemies.values()].sort((left, right) =>
      left.entityId.localeCompare(right.entityId, undefined, { numeric: true }),
    );
  }

  get pressureStacks(): number {
    return this.capEscalation.stacks;
  }

  drainThrough(
    stageTimeMs: number,
    player: Readonly<{ x: number; y: number }>,
    cameraBounds: Rect,
  ): readonly CemeteryDirectorEvent[] {
    const events: CemeteryDirectorEvent[] = [];
    for (const scheduled of this.scheduler.drainThrough(stageTimeMs)) {
      if (scheduled.kind === 'boss') {
        if (!this.bossValue) events.push(this.spawnBoss(stageTimeMs));
        continue;
      }
      const planned = planSpawnBatch({
        intendedCount: scheduled.count,
        activeEnemies: this.enemies.size,
        maxEnemies: GAME_CONFIG.world.maxEnemies,
        elite: scheduled.kind === 'elite',
        stage: this.stage,
        cameraBounds,
        player,
        safeSpawnRadius: GAME_CONFIG.world.safeSpawnRadius,
        offscreenSpawnMargin: GAME_CONFIG.world.offscreenSpawnMargin,
        random: this.spawnRandom,
      });
      this.capEscalation.recordBatch(scheduled.count, planned.requests.length);
      for (const request of planned.requests) {
        const config = GAME_CONFIG.enemies.find((candidate) => candidate.id === request.enemyId)!;
        const stats = scaleEnemyStats(
          config,
          0,
          request.elite,
          this.capEscalation.stacks,
          this.stage.capEscalation,
          GAME_CONFIG.progression,
        );
        const enemy: CemeteryEnemyState = {
          entityId: `enemy:${++this.entityCounter}`,
          enemyId: config.id,
          elite: request.elite,
          x: request.position.x,
          y: request.position.y,
          maxHealth: stats.maximumHealth,
          health: stats.maximumHealth,
          damage: stats.damage,
          moveSpeed: stats.moveSpeed,
          radius: stats.radius,
          spawnedAtMs: scheduled.atMs,
        };
        this.enemies.set(enemy.entityId, enemy);
        events.push({ kind: 'enemy-spawned', enemy });
      }
    }
    return events;
  }

  forceBoss(stageTimeMs: number): CemeteryDirectorEvent | null {
    return this.bossValue ? null : this.spawnBoss(stageTimeMs);
  }

  damageEnemy(entityId: string, amount: number): readonly CemeteryDirectorEvent[] {
    const enemy = this.enemies.get(entityId);
    if (!enemy || amount <= 0) return [];
    const health = Math.max(0, enemy.health - amount);
    const updated = { ...enemy, health };
    if (health > 0) {
      this.enemies.set(entityId, updated);
      return [];
    }
    this.enemies.delete(entityId);
    return [{ kind: 'enemy-defeated', enemy: updated }];
  }

  summon(
    enemyId: EnemyConfig['id'],
    count: number,
    center: Readonly<{ x: number; y: number }>,
    radius: number,
    stageTimeMs: number,
  ): readonly CemeteryDirectorEvent[] {
    const config = GAME_CONFIG.enemies.find((candidate) => candidate.id === enemyId);
    if (!config) throw new Error(`Unknown summoned enemy ${enemyId}`);
    const events: CemeteryDirectorEvent[] = [];
    for (
      let index = 0;
      index < count && this.enemies.size < GAME_CONFIG.world.maxEnemies;
      index += 1
    ) {
      const angle = (index / count) * Math.PI * 2;
      const enemy: CemeteryEnemyState = {
        entityId: `enemy:${++this.entityCounter}`,
        enemyId,
        elite: false,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        maxHealth: config.health,
        health: config.health,
        damage: config.contactDamage,
        moveSpeed: config.moveSpeed,
        radius: config.radius,
        spawnedAtMs: stageTimeMs,
      };
      this.enemies.set(enemy.entityId, enemy);
      events.push({ kind: 'enemy-spawned', enemy });
    }
    return events;
  }

  damageBoss(amount: number): readonly CemeteryDirectorEvent[] {
    const boss = this.bossValue;
    if (!boss || amount <= 0 || boss.health <= 0) return [];
    const health = Math.max(0, boss.health - amount);
    const phase = getBossPhase(this.bossConfig, health);
    const events: CemeteryDirectorEvent[] = [];
    if (phase === 2 && boss.phase === 1 && health > 0)
      events.push({ kind: 'boss-phase', phase: 2 });
    this.bossValue = { ...boss, health, phase };
    if (health === 0) events.push({ kind: 'boss-defeated', boss: this.bossValue });
    return events;
  }

  clearEnemies(): readonly CemeteryEnemyState[] {
    const removed = this.activeEnemies;
    this.enemies.clear();
    return removed;
  }

  countsById(): Readonly<Record<string, number>> {
    const counts = new Map<string, number>();
    for (const enemy of this.enemies.values()) {
      counts.set(enemy.enemyId, (counts.get(enemy.enemyId) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
  }

  private spawnBoss(stageTimeMs: number): CemeteryDirectorEvent {
    this.bossValue = {
      id: 'graveyard-guardian',
      health: this.bossConfig.health,
      maximumHealth: this.bossConfig.health,
      phase: 1,
      spawnedAtMs: stageTimeMs,
    };
    return { kind: 'boss-spawned', boss: this.bossValue };
  }
}
