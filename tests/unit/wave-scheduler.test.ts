import { describe, expect, it } from 'vitest';

import {
  CapEscalation,
  GAME_CONFIG,
  effectiveSpawnInterval,
  scaleEnemyStats,
  WaveScheduler,
} from '../../src/game/content';

const cemetery = GAME_CONFIG.stages[0];

describe('wave scheduler', () => {
  it('changes pressure on exact 30-second boundaries without duplicate spawns', () => {
    const scheduler = new WaveScheduler(cemetery);
    const events = scheduler.drainThrough(30_000).filter((event) => event.kind === 'spawn');
    expect(events.at(-2)).toEqual({ kind: 'spawn', atMs: 29_000, count: 1 });
    expect(events.at(-1)).toEqual({ kind: 'spawn', atMs: 30_000, count: 1 });
    expect(events.filter((event) => event.atMs === 30_000)).toHaveLength(1);
  });

  it('orders Boss before ordinary spawn at 3:00 and keeps final pressure active', () => {
    const scheduler = new WaveScheduler(cemetery);
    const atBoss = scheduler.drainThrough(180_000).filter((event) => event.atMs === 180_000);
    expect(atBoss.map((event) => event.kind)).toEqual(['boss', 'spawn']);
    expect(scheduler.drainThrough(180_500)).toEqual([{ kind: 'spawn', atMs: 180_500, count: 3 }]);
  });

  it('scales intervals deterministically and escalates once per capped batch', () => {
    expect(effectiveSpawnInterval(500, 1)).toBe(435);
    const escalation = new CapEscalation(cemetery.capEscalation);
    escalation.recordBatch(3, 2);
    escalation.recordBatch(3, 0);
    escalation.recordBatch(3, 3);
    expect(escalation.stacks).toBe(2);
    expect(escalation.multipliers()).toEqual({ health: 1.04, damage: 1.04 });
  });

  it('applies loop, elite, then cap scaling with final half-up rounding', () => {
    const zombie = GAME_CONFIG.enemies[0];
    expect(
      scaleEnemyStats(zombie, 1, true, 2, cemetery.capEscalation, GAME_CONFIG.progression),
    ).toEqual({ maximumHealth: 123, damage: 15, moveSpeed: 43.26, radius: 8.75 });
  });
});
