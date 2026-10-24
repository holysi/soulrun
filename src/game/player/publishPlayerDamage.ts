import type { GameEventPublisher } from '../events/GameEventBus';
import type { DamageResult } from './PlayerModel';

interface AdventureResultContext {
  readonly score: number;
  readonly level: number;
  readonly completedLoops: number;
  readonly survivalTimeMs: number;
  readonly killsByEnemyId: Readonly<Record<string, number>>;
}

export function publishPlayerDamage(
  events: GameEventPublisher,
  result: DamageResult,
  currentHealth: number,
  maximumHealth: number,
  sourceId: string,
  adventure: AdventureResultContext,
): void {
  events.emit('player:damaged', {
    amount: result.amount,
    sourceId,
    invulnerableUntilMs: result.invulnerableUntilMs,
  });
  events.emit('player:health-changed', {
    current: currentHealth,
    maximum: maximumHealth,
    delta: -result.amount,
    sourceId,
  });
  if (!result.died) return;
  events.emit('player:died', { sourceId });
  events.emit('adventure:ended', {
    reason: 'player-defeated',
    score: adventure.score,
    level: adventure.level,
    completedLoops: adventure.completedLoops,
    survivalTimeMs: adventure.survivalTimeMs,
    killsByEnemyId: adventure.killsByEnemyId,
  });
}
