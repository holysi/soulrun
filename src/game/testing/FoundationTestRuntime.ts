import { Mulberry32Random } from '../random/RandomSource';
import type {
  AimDirection,
  SoulrunTestApi,
  TestInputCommand,
  TestSnapshot,
  TestRuntimeState,
} from './types';

const FIXED_STEP_MS = 1000 / 60;
const STORAGE_PREFIX = 'soulrun:';

function directionForVector(x: number, y: number): AimDirection {
  if (x === 0 && y === 0) return 'e';
  const directions: readonly AimDirection[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  const clockwiseAngle = (Math.atan2(y, x) * 180) / Math.PI;
  const sector = Math.round(((clockwiseAngle + 360) % 360) / 45) % 8;
  return directions[sector] as AimDirection;
}

function initialSnapshot(seed: string, stageId: TestSnapshot['stageId']): TestSnapshot {
  return {
    state: 'idle',
    seed,
    simulationTimeMs: 0,
    stageId,
    stageTimeMs: 0,
    completedLoops: 0,
    player: {
      x: 0,
      y: 0,
      aimDirection: 'e',
      health: 100,
      maxHealth: 100,
      level: 1,
      xp: 0,
    },
    score: 0,
    weaponLevels: { 'ghost-arrow': 1 },
    passiveLevels: {},
    masteryLevels: {},
    enemyCountsById: {},
    boss: null,
    activeUpgradeOffer: null,
    eventSequence: 0,
  };
}

export class FoundationTestRuntime implements SoulrunTestApi {
  readonly version = 1 as const;
  private readonly mount: HTMLElement;
  private current: TestSnapshot;
  private remainderMs = 0;
  private random: Mulberry32Random;
  private readonly readyPromise: Promise<void>;

  constructor(mount: HTMLElement, seed: string, readyPromise: Promise<void>) {
    this.mount = mount;
    this.current = initialSnapshot(seed, 'cemetery');
    this.random = new Mulberry32Random(seed);
    this.readyPromise = readyPromise;
    this.reflectState();
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  async startAdventure(options: {
    seed: string;
    stageId?: TestSnapshot['stageId'];
  }): Promise<void> {
    this.random = new Mulberry32Random(options.seed);
    this.current = {
      ...initialSnapshot(options.seed, options.stageId ?? 'cemetery'),
      state: 'playing',
      eventSequence: 1,
    };
    this.remainderMs = 0;
    this.reflectState();
  }

  input(command: TestInputCommand, pressed: boolean): void {
    if (command !== 'pause' || !pressed) return;
    const nextState: TestRuntimeState = this.current.state === 'paused' ? 'playing' : 'paused';
    if (this.current.state !== 'playing' && this.current.state !== 'paused') return;
    this.current = {
      ...this.current,
      state: nextState,
      eventSequence: this.current.eventSequence + 1,
    };
    this.reflectState();
  }

  aimAt(x: number, y: number): void {
    this.current = {
      ...this.current,
      player: { ...this.current.player, aimDirection: directionForVector(x, y) },
      eventSequence: this.current.eventSequence + 1,
    };
  }

  async advance(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms < 0)
      throw new Error('advance(ms) requires a finite non-negative value');
    if (this.current.state !== 'playing') return;
    this.remainderMs += ms;
    const steps = Math.floor((this.remainderMs + FIXED_STEP_MS * 1e-9) / FIXED_STEP_MS);
    this.remainderMs -= steps * FIXED_STEP_MS;
    const elapsed = steps * FIXED_STEP_MS;
    this.current = {
      ...this.current,
      simulationTimeMs: this.current.simulationTimeMs + elapsed,
      stageTimeMs: this.current.stageTimeMs + elapsed,
    };
    await Promise.resolve();
  }

  async chooseUpgrade(index: 0 | 1 | 2): Promise<void> {
    const offer = this.current.activeUpgradeOffer;
    if (!offer || !offer.optionIds[index])
      throw new Error('No upgrade option is available at that index');
  }

  snapshot(): Readonly<TestSnapshot> {
    return structuredClone(this.current);
  }

  async forceBoss(): Promise<void> {
    if (this.current.state !== 'playing') throw new Error('Boss can only be forced during play');
    this.current = {
      ...this.current,
      boss: { id: 'graveyard-guardian', health: 1000, phase: 1 },
      eventSequence: this.current.eventSequence + 1,
    };
  }

  damagePlayer(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error('Damage must be finite and non-negative');
    const health = Math.max(0, this.current.player.health - amount);
    this.current = {
      ...this.current,
      state: health === 0 ? 'adventure-ended' : this.current.state,
      player: { ...this.current.player, health },
      eventSequence: this.current.eventSequence + 1,
    };
    this.reflectState();
  }

  async reset(options?: { clearStorage?: boolean }): Promise<void> {
    if (options?.clearStorage) {
      try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
        }
      } catch {
        // Storage cleanup is best-effort; denied storage must not break test isolation.
      }
    }
    const seed = this.random.seed;
    this.random = new Mulberry32Random(seed);
    this.current = initialSnapshot(seed, 'cemetery');
    this.remainderMs = 0;
    this.reflectState();
    await Promise.resolve();
  }

  private reflectState(): void {
    this.mount.dataset.testState = this.current.state;
  }
}
