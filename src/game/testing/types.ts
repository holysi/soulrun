export type AimDirection = 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'n' | 'ne';
export type TestInputCommand = 'up' | 'down' | 'left' | 'right' | 'pause' | 'confirm';
export type TestRuntimeState = 'idle' | 'playing' | 'level-up' | 'paused' | 'adventure-ended';

export interface TestSnapshot {
  readonly state: TestRuntimeState;
  readonly seed: string;
  readonly simulationTimeMs: number;
  readonly stageId: 'cemetery' | 'dungeon' | 'inferno';
  readonly stageTimeMs: number;
  readonly completedLoops: number;
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly aimDirection: AimDirection;
    readonly health: number;
    readonly maxHealth: number;
    readonly level: number;
    readonly xp: number;
  };
  readonly score: number;
  readonly weaponLevels: Readonly<Record<string, number>>;
  readonly passiveLevels: Readonly<Record<string, number>>;
  readonly masteryLevels: Readonly<Record<string, number>>;
  readonly enemyCountsById: Readonly<Record<string, number>>;
  readonly boss: Readonly<{ id: string; health: number; phase: 1 | 2 }> | null;
  readonly activeUpgradeOffer: Readonly<{ id: string; optionIds: readonly string[] }> | null;
  readonly eventSequence: number;
}

export interface SoulrunTestApi {
  readonly version: 1;
  ready(): Promise<void>;
  startAdventure(options: { seed: string; stageId?: TestSnapshot['stageId'] }): Promise<void>;
  input(command: TestInputCommand, pressed: boolean): void;
  aimAt(x: number, y: number): void;
  advance(ms: number): Promise<void>;
  chooseUpgrade(index: 0 | 1 | 2): Promise<void>;
  snapshot(): Readonly<TestSnapshot>;
  forceBoss(): Promise<void>;
  damagePlayer(amount: number): void;
  reset(options?: { clearStorage?: boolean }): Promise<void>;
}

declare global {
  interface Window {
    __SOULRUN_TEST__?: SoulrunTestApi;
  }
}
