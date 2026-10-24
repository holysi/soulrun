import type Phaser from 'phaser';

import type { AimDirection } from '../testing/types';

interface PointValue {
  readonly x: number;
  readonly y: number;
}

export interface GameEventMap {
  'adventure:ended': {
    readonly reason: 'player-defeated';
    readonly score: number;
    readonly level: number;
    readonly completedLoops: number;
    readonly survivalTimeMs: number;
    readonly killsByEnemyId: Readonly<Record<string, number>>;
  };
  'player:aim-changed': { readonly direction: AimDirection; readonly angleDeg: number };
  'player:health-changed': {
    readonly current: number;
    readonly maximum: number;
    readonly delta: number;
    readonly sourceId: string;
  };
  'player:damaged': {
    readonly amount: number;
    readonly sourceId: string;
    readonly invulnerableUntilMs: number;
  };
  'player:died': { readonly sourceId: string };
  'weapon:fired': {
    readonly weaponId: string;
    readonly attackId: string;
    readonly origin: PointValue;
    readonly aim: PointValue;
  };
  'game:pause-changed': { readonly paused: boolean; readonly reason: 'user' | 'blur' };
}

export interface EventEnvelope<K extends keyof GameEventMap> {
  readonly type: K;
  readonly adventureId: string;
  readonly sequence: number;
  readonly simulationTimeMs: number;
  readonly payload: GameEventMap[K];
}

export class GameEventPublisher {
  private sequence = 0;

  constructor(
    private readonly emitter: Phaser.Events.EventEmitter,
    private readonly adventureId: string,
    private readonly simulationTime: () => number,
  ) {}

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): EventEnvelope<K> {
    const event: EventEnvelope<K> = {
      type,
      adventureId: this.adventureId,
      sequence: ++this.sequence,
      simulationTimeMs: this.simulationTime(),
      payload,
    };
    this.emitter.emit(type, event);
    return event;
  }

  get currentSequence(): number {
    return this.sequence;
  }
}

export function onGameEvent<K extends keyof GameEventMap>(
  emitter: Phaser.Events.EventEmitter,
  type: K,
  listener: (event: EventEnvelope<K>) => void,
  context: object,
): void {
  emitter.on(type, listener, context);
}

export function offGameEvent<K extends keyof GameEventMap>(
  emitter: Phaser.Events.EventEmitter,
  type: K,
  listener: (event: EventEnvelope<K>) => void,
  context: object,
): void {
  emitter.off(type, listener, context);
}
