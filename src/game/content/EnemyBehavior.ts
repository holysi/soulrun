import type { EnemyConfig, Point } from './types';

export type EnemyBehaviorPlan =
  | Readonly<{ kind: 'steer'; target: Point; turnRateDegPerSec?: number }>
  | Readonly<{
      kind: 'dash-cycle';
      windupMs: number;
      activeMs: number;
      speed: number;
      recoveryMs: number;
    }>
  | Readonly<{
      kind: 'ranged-cycle';
      preferredDistance: number;
      retreatDistance?: number;
      cooldownMs: number;
      telegraphMs: number;
      projectileSpeed: number;
      projectileLifetimeMs: number;
      projectileDamage: number;
    }>
  | Readonly<{ kind: 'split-on-defeat'; childEnemyId: string; childCount: number }>
  | Readonly<{ kind: 'flank'; leadDistance: number; repathMs: number; turnRateDegPerSec: number }>;

export function createEnemyBehaviorPlan(enemy: EnemyConfig, player: Point): EnemyBehaviorPlan {
  switch (enemy.behavior) {
    case 'chase':
      return { kind: 'steer', target: player, turnRateDegPerSec: enemy.params.turnRateDegPerSec };
    case 'dash':
      return {
        kind: 'dash-cycle',
        windupMs: enemy.params.windupMs,
        activeMs: enemy.params.dashMs,
        speed: enemy.params.dashSpeed,
        recoveryMs: enemy.params.recoveryMs,
      };
    case 'kite-ranged':
      return {
        kind: 'ranged-cycle',
        preferredDistance: enemy.params.preferredDistance,
        retreatDistance: enemy.params.retreatDistance,
        cooldownMs: enemy.params.attackCooldownMs,
        telegraphMs: enemy.params.telegraphMs,
        projectileSpeed: enemy.params.projectileSpeed,
        projectileLifetimeMs: enemy.params.projectileLifetimeMs,
        projectileDamage: enemy.params.projectileDamage,
      };
    case 'split':
      return {
        kind: 'split-on-defeat',
        childEnemyId: enemy.params.childEnemyId,
        childCount: enemy.params.childCount,
      };
    case 'flank':
      return {
        kind: 'flank',
        leadDistance: enemy.params.leadDistance,
        repathMs: enemy.params.repathMs,
        turnRateDegPerSec: enemy.params.turnRateDegPerSec,
      };
    case 'ranged':
      return {
        kind: 'ranged-cycle',
        preferredDistance: enemy.params.preferredDistance,
        cooldownMs: enemy.params.attackCooldownMs,
        telegraphMs: enemy.params.telegraphMs,
        projectileSpeed: enemy.params.projectileSpeed,
        projectileLifetimeMs: enemy.params.projectileLifetimeMs,
        projectileDamage: enemy.params.projectileDamage,
      };
  }
}
