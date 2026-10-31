import {
  CapEscalation,
  GAME_CONFIG,
  WaveScheduler,
  getBossPhase,
  planSpawnBatch,
  scaleEnemyStats,
} from '../content';
import type { BossConfig, EnemyConfig, Point, Rect, StageConfig } from '../content';
import { createGameplayStreams } from '../random/RandomSource';
import type { RandomSource } from '../random/RandomSource';

export interface StageEnemyState {
  readonly entityId: string;
  readonly enemyId: EnemyConfig['id'];
  readonly elite: boolean;
  readonly x: number;
  readonly y: number;
  readonly maxHealth: number;
  readonly health: number;
  readonly damage: number;
  readonly attackDamageMultiplier: number;
  readonly moveSpeed: number;
  readonly radius: number;
  readonly spawnedAtMs: number;
}

export interface StageBossState {
  readonly id: BossConfig['id'];
  readonly health: number;
  readonly maximumHealth: number;
  readonly phase: 1 | 2;
  readonly spawnedAtMs: number;
}

export type StageDirectorEvent =
  | Readonly<{ kind: 'enemy-spawned'; enemy: StageEnemyState }>
  | Readonly<{ kind: 'boss-spawned'; boss: StageBossState }>
  | Readonly<{ kind: 'boss-phase'; phase: 2 }>
  | Readonly<{ kind: 'enemy-defeated'; enemy: StageEnemyState }>
  | Readonly<{ kind: 'boss-defeated'; boss: StageBossState }>;

export class StageDirector {
  readonly stage: StageConfig;
  readonly bossConfig: BossConfig;
  private readonly scheduler: WaveScheduler;
  private readonly spawnRandom: RandomSource;
  private readonly capEscalation;
  private readonly enemies = new Map<string, StageEnemyState>();
  private entityCounter: number;
  private bossValue: StageBossState | null = null;

  constructor(
    readonly stageId: StageConfig['id'],
    seed: string,
    private readonly completedLoops = 0,
    private readonly spawnExclusionRects: readonly Rect[] = [],
    spawnRandom?: RandomSource,
    initialEntityCounter = 0,
  ) {
    const stage = GAME_CONFIG.stages.find((candidate) => candidate.id === stageId);
    if (!stage) throw new Error(`Unknown stage ${stageId}`);
    const boss = GAME_CONFIG.bosses.find((candidate) => candidate.id === stage.bossId);
    if (!boss) throw new Error(`Missing Boss ${stage.bossId} for ${stageId}`);
    this.stage = stage;
    this.bossConfig = boss;
    this.scheduler = new WaveScheduler(stage, completedLoops);
    this.spawnRandom = spawnRandom ?? createGameplayStreams(seed).spawn;
    this.entityCounter = initialEntityCounter;
    this.capEscalation = new CapEscalation(stage.capEscalation);
  }

  get boss(): StageBossState | null {
    return this.bossValue;
  }

  get activeEnemies(): readonly StageEnemyState[] {
    return [...this.enemies.values()].sort((left, right) =>
      left.entityId.localeCompare(right.entityId, undefined, { numeric: true }),
    );
  }

  get pressureStacks(): number {
    return this.capEscalation.stacks;
  }

  get currentEntityCounter(): number {
    return this.entityCounter;
  }

  drainThrough(
    stageTimeMs: number,
    player: Readonly<{ x: number; y: number }>,
    cameraBounds: Rect,
  ): readonly StageDirectorEvent[] {
    const events: StageDirectorEvent[] = [];
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
        excludedRects: this.spawnExclusionRects,
        collisionPadding: this.maximumSpawnRadius(scheduled.kind === 'elite'),
      });
      const previousStacks = this.capEscalation.stacks;
      this.capEscalation.recordBatch(scheduled.count, planned.requests.length);
      if (this.capEscalation.stacks !== previousStacks) this.rescaleActiveEnemies();
      for (const request of planned.requests) {
        events.push(
          this.spawnEnemy(
            request.enemyId as EnemyConfig['id'],
            request.elite,
            request.position,
            scheduled.atMs,
          ),
        );
      }
    }
    return events;
  }

  forceBoss(stageTimeMs: number): StageDirectorEvent | null {
    return this.bossValue ? null : this.spawnBoss(stageTimeMs);
  }

  damageEnemy(entityId: string, amount: number): readonly StageDirectorEvent[] {
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
  ): readonly StageDirectorEvent[] {
    const events: StageDirectorEvent[] = [];
    for (
      let index = 0;
      index < count && this.enemies.size < GAME_CONFIG.world.maxEnemies;
      index += 1
    ) {
      const angle = (index / count) * Math.PI * 2;
      const candidate = {
        x: clamp(center.x + Math.cos(angle) * radius, this.stage.bounds.x, this.stage.bounds.width),
        y: clamp(
          center.y + Math.sin(angle) * radius,
          this.stage.bounds.y,
          this.stage.bounds.height,
        ),
      };
      events.push(
        this.spawnEnemy(
          enemyId,
          false,
          this.findLegalSummonPosition(enemyId, candidate, center),
          stageTimeMs,
        ),
      );
    }
    return events;
  }

  damageBoss(amount: number): readonly StageDirectorEvent[] {
    const boss = this.bossValue;
    if (!boss || amount <= 0 || boss.health <= 0) return [];
    const health = Math.max(0, boss.health - amount);
    const phase = getBossPhase(this.bossConfig, health);
    const events: StageDirectorEvent[] = [];
    if (phase === 2 && boss.phase === 1 && health > 0)
      events.push({ kind: 'boss-phase', phase: 2 });
    this.bossValue = { ...boss, health, phase };
    if (health === 0) events.push({ kind: 'boss-defeated', boss: this.bossValue });
    return events;
  }

  clearEnemies(): readonly StageEnemyState[] {
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

  private spawnEnemy(
    enemyId: EnemyConfig['id'],
    elite: boolean,
    position: Readonly<{ x: number; y: number }>,
    stageTimeMs: number,
  ): StageDirectorEvent {
    const config = GAME_CONFIG.enemies.find((candidate) => candidate.id === enemyId);
    if (!config) throw new Error(`Unknown enemy ${enemyId}`);
    const stats = scaleEnemyStats(
      config,
      this.completedLoops,
      elite,
      this.capEscalation.stacks,
      this.stage.capEscalation,
      GAME_CONFIG.progression,
    );
    const enemy: StageEnemyState = {
      entityId: `enemy:${++this.entityCounter}`,
      enemyId,
      elite,
      x: position.x,
      y: position.y,
      maxHealth: stats.maximumHealth,
      health: stats.maximumHealth,
      damage: stats.damage,
      attackDamageMultiplier: stats.attackDamageMultiplier,
      moveSpeed: stats.moveSpeed,
      radius: stats.radius,
      spawnedAtMs: stageTimeMs,
    };
    this.enemies.set(enemy.entityId, enemy);
    return { kind: 'enemy-spawned', enemy };
  }

  private spawnBoss(stageTimeMs: number): StageDirectorEvent {
    this.bossValue = {
      id: this.bossConfig.id,
      health: this.bossConfig.health,
      maximumHealth: this.bossConfig.health,
      phase: 1,
      spawnedAtMs: stageTimeMs,
    };
    return { kind: 'boss-spawned', boss: this.bossValue };
  }

  private rescaleActiveEnemies(): void {
    for (const [entityId, enemy] of this.enemies) {
      const config = GAME_CONFIG.enemies.find((candidate) => candidate.id === enemy.enemyId)!;
      const stats = scaleEnemyStats(
        config,
        this.completedLoops,
        enemy.elite,
        this.capEscalation.stacks,
        this.stage.capEscalation,
        GAME_CONFIG.progression,
      );
      const maximumHealthDelta = Math.max(0, stats.maximumHealth - enemy.maxHealth);
      this.enemies.set(entityId, {
        ...enemy,
        maxHealth: stats.maximumHealth,
        health: enemy.health + maximumHealthDelta,
        damage: stats.damage,
        attackDamageMultiplier: stats.attackDamageMultiplier,
        moveSpeed: stats.moveSpeed,
        radius: stats.radius,
      });
    }
  }

  private maximumSpawnRadius(elite: boolean): number {
    const pool = elite ? this.stage.eliteEnemyPool : this.stage.enemyPool;
    const scale = elite ? GAME_CONFIG.progression.eliteScaleMultiplier : 1;
    return Math.max(
      0,
      ...pool.map((entry) => {
        const config = GAME_CONFIG.enemies.find((candidate) => candidate.id === entry.id);
        if (!config) throw new Error(`Unknown enemy ${entry.id}`);
        return config.radius * scale;
      }),
    );
  }

  private findLegalSummonPosition(
    enemyId: EnemyConfig['id'],
    candidate: Point,
    center: Point,
  ): Point {
    const config = GAME_CONFIG.enemies.find((enemy) => enemy.id === enemyId);
    if (!config) throw new Error(`Unknown enemy ${enemyId}`);
    const radius = scaleEnemyStats(
      config,
      this.completedLoops,
      false,
      this.capEscalation.stacks,
      this.stage.capEscalation,
      GAME_CONFIG.progression,
    ).radius;
    const candidates = [candidate, center];
    const step = Math.max(8, radius * 2);
    for (let distance = step; distance <= 256; distance += step) {
      candidates.push(
        { x: center.x + distance, y: center.y },
        { x: center.x - distance, y: center.y },
        { x: center.x, y: center.y + distance },
        { x: center.x, y: center.y - distance },
        { x: center.x + distance, y: center.y + distance },
        { x: center.x - distance, y: center.y + distance },
        { x: center.x + distance, y: center.y - distance },
        { x: center.x - distance, y: center.y - distance },
      );
    }
    const position = candidates.find((point) => this.isClear(point, radius));
    if (!position) throw new Error(`Unable to place summoned ${enemyId} outside solid geometry`);
    return position;
  }

  private isClear(point: Point, radius: number): boolean {
    const bounds = this.stage.bounds;
    if (
      point.x < bounds.x + radius ||
      point.x > bounds.x + bounds.width - radius ||
      point.y < bounds.y + radius ||
      point.y > bounds.y + bounds.height - radius
    )
      return false;
    return !this.spawnExclusionRects.some(
      (rect) =>
        point.x >= rect.x - radius &&
        point.x <= rect.x + rect.width + radius &&
        point.y >= rect.y - radius &&
        point.y <= rect.y + rect.height + radius,
    );
  }
}

function clamp(value: number, origin: number, length: number): number {
  return Math.max(origin, Math.min(origin + length, value));
}
