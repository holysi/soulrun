import { roundHalfUp } from './WaveScheduler';
import type { EnemyConfig, ProgressionConfig, StageConfig } from './types';

export interface ScaledEnemyStats {
  readonly maximumHealth: number;
  readonly damage: number;
  readonly moveSpeed: number;
  readonly radius: number;
}

export function scaleEnemyStats(
  enemy: EnemyConfig,
  completedLoops: number,
  elite: boolean,
  capStacks: number,
  cap: StageConfig['capEscalation'],
  progression: ProgressionConfig,
): ScaledEnemyStats {
  if (!Number.isInteger(completedLoops) || completedLoops < 0) {
    throw new Error('Completed loops must be a non-negative integer');
  }
  if (!Number.isInteger(capStacks) || capStacks < 0 || capStacks > cap.maxStacks) {
    throw new Error('Cap escalation stacks are outside the configured range');
  }
  if (elite && !enemy.eliteEligible) throw new Error(`${enemy.id} cannot become elite`);

  const eliteHealth = elite ? progression.eliteHealthMultiplier : 1;
  const eliteDamage = elite ? progression.eliteDamageMultiplier : 1;
  const eliteScale = elite ? progression.eliteScaleMultiplier : 1;
  const health = enemy.health * (1 + 0.35 * completedLoops) * eliteHealth;
  const damage = enemy.contactDamage * (1 + 0.2 * completedLoops) * eliteDamage;

  return {
    maximumHealth: roundHalfUp(health * (1 + cap.healthPerStack * capStacks)),
    damage: roundHalfUp(damage * (1 + cap.damagePerStack * capStacks)),
    moveSpeed: Math.min(enemy.moveSpeed * (1 + 0.03 * completedLoops), enemy.moveSpeed * 1.25),
    radius: enemy.radius * eliteScale,
  };
}
