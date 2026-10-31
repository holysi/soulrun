import type Phaser from 'phaser';

import type { AimDirection } from '../testing/types';
import type { SoulrunRecords, SoulrunSettings } from '../storage';

interface PointValue {
  readonly x: number;
  readonly y: number;
}

export interface GameEventMap {
  'adventure:started': { readonly seed: string; readonly adventureId: string };
  'adventure:ended': {
    readonly reason: 'player-defeated';
    readonly score: number;
    readonly level: number;
    readonly completedLoops: number;
    readonly survivalTimeMs: number;
    readonly killsByEnemyId: Readonly<Record<string, number>>;
  };
  'stage:loading': {
    readonly stageId: string;
    readonly stageIndex: number;
    readonly completedLoops: number;
  };
  'stage:started': {
    readonly stageId: string;
    readonly stageIndex: number;
    readonly completedLoops: number;
  };
  'loop:completed': { readonly completedLoops: number };
  'stage:timer-changed': { readonly remainingMs: number };
  'stage:pressure-changed': { readonly step: number };
  'boss:spawned': { readonly bossId: string; readonly safeUntilMs: number };
  'boss:phase-changed': { readonly bossId: string; readonly phase: 2 };
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
  'xp:spawned': {
    readonly entityId: string;
    readonly value: number;
    readonly x: number;
    readonly y: number;
  };
  'xp:collected': {
    readonly entityId: string;
    readonly value: number;
    readonly totalXp: number;
    readonly level: number;
  };
  'level:reached': { readonly level: number; readonly overflowXp: number };
  'upgrade:offered': {
    readonly offerId: string;
    readonly source: 'level' | 'boss';
    readonly optionIds: readonly string[];
  };
  'upgrade:selected': {
    readonly offerId: string;
    readonly optionId: string;
    readonly newLevel: number;
  };
  'weapon:fired': {
    readonly weaponId: string;
    readonly attackId: string;
    readonly origin: PointValue;
    readonly aim: PointValue;
  };
  'enemy:defeated': {
    readonly entityId: string;
    readonly enemyId: string;
    readonly elite: boolean;
    readonly scoreAwarded: number;
    readonly xpGemValue: number;
  };
  'enemy:spawned': {
    readonly entityId: string;
    readonly enemyId: string;
    readonly elite: boolean;
    readonly x: number;
    readonly y: number;
  };
  'score:changed': { readonly score: number; readonly delta: number; readonly sourceId: string };
  'boss:defeated': {
    readonly bossId: string;
    readonly stageId: string;
    readonly scoreAwarded: number;
  };
  'stage:completed': {
    readonly stageId: string;
    readonly elapsedMs: number;
    readonly kills: number;
    readonly damageTaken: number;
    readonly scoreEarned: number;
  };
  'game:pause-changed': { readonly paused: boolean; readonly reason: 'user' | 'blur' };
  'settings:changed': { readonly settings: SoulrunSettings };
  'records:changed': { readonly records: SoulrunRecords };
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
