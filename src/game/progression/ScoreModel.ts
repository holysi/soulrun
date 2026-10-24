import type { BossId, EnemyId, GameConfig } from '../content';

export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error('Score value must be finite and non-negative');
  return Math.floor(value + 0.5);
}

export function scoreAward(baseScore: number, completedLoops: number, config: GameConfig): number {
  if (!Number.isInteger(baseScore) || baseScore < 0)
    throw new Error('Base score must be a non-negative integer');
  if (!Number.isInteger(completedLoops) || completedLoops < 0) {
    throw new Error('Completed loops must be a non-negative integer');
  }
  return roundHalfUp(baseScore * (1 + config.scoring.loopMultiplierPerCompletion * completedLoops));
}

export class ScoreModel {
  private value = 0;

  constructor(private readonly config: GameConfig) {}

  get score(): number {
    return this.value;
  }

  award(baseScore: number, completedLoops: number): number {
    const delta = scoreAward(baseScore, completedLoops, this.config);
    this.value += delta;
    return delta;
  }

  awardEnemy(
    enemyId: EnemyId,
    elite: boolean,
    completedLoops: number,
  ): Readonly<{ score: number; xp: number }> {
    const enemy = this.config.enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy) throw new Error(`Unknown enemy ${enemyId}`);
    const reward = elite
      ? 'elite' in enemy.rewards
        ? enemy.rewards.elite
        : undefined
      : enemy.rewards.normal;
    if (!reward) throw new Error(`${enemyId} cannot be awarded as an elite`);
    return { score: this.award(reward.score, completedLoops), xp: reward.xp };
  }

  awardBoss(bossId: BossId, completedLoops: number): number {
    const boss = this.config.bosses.find((candidate) => candidate.id === bossId);
    if (!boss) throw new Error(`Unknown Boss ${bossId}`);
    return this.award(boss.score, completedLoops);
  }
}
