import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';

import {
  GameEventPublisher,
  type EventEnvelope,
  type GameEventMap,
} from '../../src/game/events/GameEventBus';
import { PlayerModel } from '../../src/game/player/PlayerModel';
import { publishPlayerDamage } from '../../src/game/player/publishPlayerDamage';

describe('player lifecycle events', () => {
  it('publishes player:died before the complete adventure:ended event', () => {
    const published: EventEnvelope<keyof GameEventMap>[] = [];
    const emitter = {
      emit: (_type: string, event: EventEnvelope<keyof GameEventMap>) => published.push(event),
    } as unknown as Phaser.Events.EventEmitter;
    const events = new GameEventPublisher(emitter, 'adventure-test', () => 2500);
    const player = new PlayerModel({ maxHealth: 100, invulnerabilityMs: 600 });
    const result = player.damage(100, 2500);

    publishPlayerDamage(events, result, player.health, player.maxHealth, 'enemy:zombie:1', {
      score: 40,
      level: 3,
      completedLoops: 1,
      survivalTimeMs: 2500,
      killsByEnemyId: { zombie: 4 },
    });

    expect(published.map((event) => event.type)).toEqual([
      'player:damaged',
      'player:health-changed',
      'player:died',
      'adventure:ended',
    ]);
    expect(published.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(published.at(-1)?.payload).toEqual({
      reason: 'player-defeated',
      score: 40,
      level: 3,
      completedLoops: 1,
      survivalTimeMs: 2500,
      killsByEnemyId: { zombie: 4 },
    });
  });
});
