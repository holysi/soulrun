import type Phaser from 'phaser';

import { SCENE_KEYS } from '../constants';
import { GAME_CONFIG } from '../content';
import { GameScene } from '../scenes/GameScene';
import { resetSoulrunStorage } from '../storage';
import type { SoulrunTestApi, TestInputCommand, TestSnapshot } from './types';

const STORAGE_PREFIX = 'soulrun:';

function idleSnapshot(seed: string): TestSnapshot {
  return {
    state: 'idle',
    seed,
    simulationTimeMs: 0,
    stageId: 'cemetery',
    stageTimeMs: 0,
    completedLoops: 0,
    player: {
      x: 0,
      y: 0,
      aimDirection: 'e',
      health: GAME_CONFIG.player.maxHealth,
      maxHealth: GAME_CONFIG.player.maxHealth,
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

export class LiveGameTestAdapter implements SoulrunTestApi {
  readonly version = 1 as const;
  private seed: string;

  constructor(
    private readonly game: Phaser.Game,
    seed: string,
    private readonly readyPromise: Promise<void>,
  ) {
    this.seed = seed;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  async startAdventure(options: {
    seed: string;
    stageId?: TestSnapshot['stageId'];
  }): Promise<void> {
    this.seed = options.seed;
    this.game.scene.stop(SCENE_KEYS.overlay);
    this.game.scene.stop(SCENE_KEYS.title);
    this.game.scene.start(SCENE_KEYS.game, {
      seed: options.seed,
      stageId: options.stageId ?? 'cemetery',
      testControlled: true,
    });
    await this.waitForGameScene();
  }

  input(command: TestInputCommand, pressed: boolean): void {
    this.scene().setTestInput(command, pressed);
  }

  aimAt(x: number, y: number): void {
    this.scene().setTestAim(x, y);
  }

  advance(ms: number): Promise<void> {
    return this.scene().advanceForTest(ms);
  }

  async chooseUpgrade(index: 0 | 1 | 2): Promise<void> {
    const scene = this.scene();
    const before = scene.snapshotForTest();
    const transitionsStage = before.activeUpgradeOffer?.source === 'boss';
    scene.chooseUpgradeForTest(index);
    if (transitionsStage) await this.waitForStageTransition(before.stageId, before.eventSequence);
    else await Promise.resolve();
  }

  async spawnXpGem(options: { value: number; x: number; y: number }): Promise<string> {
    const entityId = this.scene().spawnXpGem(options.value, options.x, options.y);
    await Promise.resolve();
    return entityId;
  }

  snapshot(): Readonly<TestSnapshot> {
    if (!this.game.scene.isActive(SCENE_KEYS.game)) return idleSnapshot(this.seed);
    return structuredClone(this.scene().snapshotForTest());
  }

  async forceBoss(): Promise<void> {
    this.scene().forceBossForTest();
    await Promise.resolve();
  }

  damageBoss(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Damage must be finite and non-negative');
    }
    this.scene().damageBossForTest(amount);
  }

  damagePlayer(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Damage must be finite and non-negative');
    }
    this.scene().damagePlayerForTest(amount);
  }

  async reset(options?: { clearStorage?: boolean }): Promise<void> {
    if (options?.clearStorage) this.clearStorage();
    this.game.scene.stop(SCENE_KEYS.overlay);
    this.game.scene.stop(SCENE_KEYS.game);
    this.game.scene.start(SCENE_KEYS.title);
    const mount = this.game.canvas.parentElement;
    if (mount) {
      mount.dataset.testState = 'idle';
      delete mount.dataset.playerX;
      delete mount.dataset.playerY;
      delete mount.dataset.aimDirection;
    }
    await Promise.resolve();
  }

  private scene(): GameScene {
    const scene = this.game.scene.getScene(SCENE_KEYS.game);
    if (!(scene instanceof GameScene) || !scene.scene.isActive()) {
      throw new Error('No active adventure');
    }
    return scene;
  }

  private async waitForGameScene(): Promise<void> {
    for (let attempts = 0; attempts < 120; attempts += 1) {
      const scene = this.game.scene.getScene(SCENE_KEYS.game);
      if (scene instanceof GameScene && scene.scene.isActive()) {
        try {
          scene.snapshotForTest();
          return;
        } catch {
          // Phaser may mark a scene active one frame before create finishes.
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw new Error('GameScene did not become ready');
  }

  private async waitForStageTransition(
    previousStageId: TestSnapshot['stageId'],
    previousSequence: number,
  ): Promise<void> {
    for (let attempts = 0; attempts < 120; attempts += 1) {
      const scene = this.game.scene.getScene(SCENE_KEYS.game);
      if (scene instanceof GameScene && scene.scene.isActive()) {
        try {
          const snapshot = scene.snapshotForTest();
          if (
            snapshot.stageId !== previousStageId &&
            snapshot.state === 'playing' &&
            snapshot.eventSequence > previousSequence
          ) {
            return;
          }
        } catch {
          // The restarted scene may be active before create has finished.
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw new Error('Stage transition did not become ready');
  }

  private clearStorage(): void {
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // Storage cleanup is best-effort; denied storage must not break test isolation.
    }
    resetSoulrunStorage();
  }
}
