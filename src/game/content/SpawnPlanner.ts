import type { RandomSource } from '../random/RandomSource';
import type { Point, Rect, StageConfig, WeightedId } from './types';

export interface SpawnRequest {
  readonly enemyId: string;
  readonly elite: boolean;
  readonly position: Point;
}

function contains(rect: Rect, point: Point, padding = 0): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}

function distanceSquared(left: Point, right: Point): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

export function isLegalSpawn(
  point: Point,
  mapBounds: Rect,
  cameraBounds: Rect,
  player: Point,
  offscreenMargin: number,
  safeRadius: number,
): boolean {
  return (
    contains(mapBounds, point) &&
    !contains(cameraBounds, point, offscreenMargin) &&
    distanceSquared(point, player) >= safeRadius ** 2
  );
}

function weightedPick(pool: readonly WeightedId[], random: RandomSource): string {
  if (pool.length === 0) throw new Error('Spawn pool is empty');
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let target = random.next() * total;
  for (const entry of pool) {
    target -= entry.weight;
    if (target < 0) return entry.id;
  }
  return pool[pool.length - 1]!.id;
}

function randomPosition(bounds: Rect, random: RandomSource): Point {
  return {
    x: bounds.x + random.next() * bounds.width,
    y: bounds.y + random.next() * bounds.height,
  };
}

export function planSpawnBatch(
  options: Readonly<{
    intendedCount: number;
    activeEnemies: number;
    maxEnemies: number;
    elite: boolean;
    stage: StageConfig;
    cameraBounds: Rect;
    player: Point;
    safeSpawnRadius: number;
    offscreenSpawnMargin: number;
    random: RandomSource;
    maxPositionAttempts?: number;
  }>,
): Readonly<{ requests: readonly SpawnRequest[]; skippedByCap: number }> {
  if (
    !Number.isInteger(options.intendedCount) ||
    options.intendedCount < 0 ||
    !Number.isInteger(options.activeEnemies) ||
    options.activeEnemies < 0 ||
    !Number.isInteger(options.maxEnemies) ||
    options.maxEnemies <= 0
  ) {
    throw new Error('Spawn counts and cap must be non-negative integers with a positive cap');
  }
  const admitted = Math.max(
    0,
    Math.min(options.intendedCount, options.maxEnemies - options.activeEnemies),
  );
  const pool = options.elite ? options.stage.eliteEnemyPool : options.stage.enemyPool;
  const requests: SpawnRequest[] = [];
  const attempts = options.maxPositionAttempts ?? 64;

  for (let index = 0; index < admitted; index += 1) {
    let position: Point | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = randomPosition(options.stage.bounds, options.random);
      if (
        isLegalSpawn(
          candidate,
          options.stage.bounds,
          options.cameraBounds,
          options.player,
          options.offscreenSpawnMargin,
          options.safeSpawnRadius,
        )
      ) {
        position = candidate;
        break;
      }
    }
    if (!position) throw new Error(`Unable to find legal spawn after ${attempts} attempts`);
    requests.push({ enemyId: weightedPick(pool, options.random), elite: options.elite, position });
  }

  return { requests, skippedByCap: options.intendedCount - admitted };
}
