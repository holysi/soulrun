import Phaser from 'phaser';

import { imageAsset } from '../assets';
import { HEAL_PICKUP_AMOUNT, SCENE_KEYS } from '../constants';
import { GAME_CONFIG } from '../content';
import { GameEventPublisher } from '../events/GameEventBus';
import { BossSafetyWindow } from '../player/BossSafetyWindow';
import { PlayerModel } from '../player/PlayerModel';
import { ProjectileBudget } from '../player/ProjectileBudget';
import { aimDirectionForVector, normalizeMovement } from '../player/direction';
import { publishPlayerDamage } from '../player/publishPlayerDamage';
import type {
  AimDirection,
  TestInputCommand,
  TestSnapshot,
  TestRuntimeState,
} from '../testing/types';

const PLAYER_ASSET_KEY = 'player-soul-guide';
const PLAYER_CONFIG = GAME_CONFIG.player;
const WORLD_WIDTH = GAME_CONFIG.world.mapWidth;
const WORLD_HEIGHT = GAME_CONFIG.world.mapHeight;
function ghostArrowConfig() {
  const weapon = GAME_CONFIG.weapons.find((candidate) => candidate.id === 'ghost-arrow');
  if (weapon?.projectileSpeed === undefined || weapon.projectileLifetimeMs === undefined) {
    throw new Error('Ghost Arrow projectile configuration is incomplete');
  }
  return weapon;
}
const GHOST_ARROW_CONFIG = ghostArrowConfig();
const ARROW_ASSET_KEY = GHOST_ARROW_CONFIG.assetKey;
const PLAYER_ASSET = imageAsset(PLAYER_ASSET_KEY);
const ARROW_ASSET = imageAsset(ARROW_ASSET_KEY);

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private model = new PlayerModel(PLAYER_CONFIG);
  private bossSafety = new BossSafetyWindow();
  private aimDirection: AimDirection = 'e';
  private aimVector = { x: 1, y: 0 };
  private simulationTimeMs = 0;
  private nextAttackAtMs = 0;
  private paused = false;
  private attackId = 0;
  private readonly arrows = new Map<string, Phaser.Physics.Arcade.Image>();
  private readonly projectileBudget = new ProjectileBudget(GAME_CONFIG.world.maxProjectiles);
  private eventsOut!: GameEventPublisher;
  private testControlled = false;
  private readonly testInputs = new Set<TestInputCommand>();
  private testAim: { x: number; y: number } | null = null;
  private testRemainderMs = 0;
  private seed = '';
  private stageId: TestSnapshot['stageId'] = 'cemetery';
  private boss: TestSnapshot['boss'] = null;

  constructor() {
    super(SCENE_KEYS.game);
  }

  init(data?: {
    seed?: string;
    stageId?: TestSnapshot['stageId'];
    testControlled?: boolean;
  }): void {
    this.seed = data?.seed ?? '';
    this.stageId = data?.stageId ?? 'cemetery';
    this.testControlled = data?.testControlled ?? false;
  }

  preload(): void {
    this.load.spritesheet(PLAYER_ASSET_KEY, PLAYER_ASSET.path, {
      frameWidth: PLAYER_ASSET.frameWidth,
      frameHeight: PLAYER_ASSET.frameHeight,
    });
    this.load.image(ARROW_ASSET_KEY, ARROW_ASSET.path);
  }

  create(): void {
    this.model = new PlayerModel(PLAYER_CONFIG);
    this.bossSafety = new BossSafetyWindow();
    this.aimDirection = 'e';
    this.aimVector = { x: 1, y: 0 };
    this.simulationTimeMs = 0;
    this.nextAttackAtMs = 0;
    this.paused = false;
    this.attackId = 0;
    this.arrows.clear();
    this.projectileBudget.clear();
    this.testInputs.clear();
    this.testAim = null;
    this.testRemainderMs = 0;
    this.boss = null;
    this.eventsOut = new GameEventPublisher(
      this.registry.events,
      'adventure-local-1',
      () => this.simulationTimeMs,
    );
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawWorld();
    this.createAnimations();
    this.createPlayer();
    this.createObstacles();
    this.configureInput();

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setRoundPixels(true);
    this.scene.launch(SCENE_KEYS.overlay);
    this.eventsOut.emit('player:health-changed', {
      current: this.model.health,
      maximum: this.model.maxHealth,
      delta: 0,
      sourceId: 'adventure-start',
    });
    this.reflectState();

    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseForBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseForBlur, this);
      this.scene.stop(SCENE_KEYS.overlay);
    });
    if (this.testControlled) this.physics.world.pause();
  }

  update(_time: number, delta: number): void {
    if (this.testControlled) return;
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) this.setPaused(!this.paused, 'user');
    if (this.paused || this.model.dead) return;
    this.runSimulation(delta, false);
  }

  setTestInput(command: TestInputCommand, pressed: boolean): void {
    if (!this.testControlled) throw new Error('Scene is not test-controlled');
    if (command === 'pause') {
      if (pressed) this.setPaused(!this.paused, 'user');
      return;
    }
    if (pressed) this.testInputs.add(command);
    else this.testInputs.delete(command);
  }

  setTestAim(x: number, y: number): void {
    this.testAim = { x, y };
    this.updateAim();
    this.reflectState();
  }

  async advanceForTest(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error('advance(ms) requires a finite non-negative value');
    }
    if (this.paused || this.model.dead) return;
    const fixedStepMs = 1000 / 60;
    this.testRemainderMs += ms;
    const steps = Math.floor((this.testRemainderMs + fixedStepMs * 1e-9) / fixedStepMs);
    this.testRemainderMs -= steps * fixedStepMs;
    for (let step = 0; step < steps; step += 1) this.runSimulation(fixedStepMs, true);
    await Promise.resolve();
  }

  forceBossForTest(): void {
    if (this.model.dead) throw new Error('Boss can only be forced during play');
    this.boss = { id: 'graveyard-guardian', health: 1000, phase: 1 };
    this.beginBossSafetyWindow();
  }

  damagePlayerForTest(amount: number): boolean {
    return this.boss
      ? this.damagePlayerFromBoss(amount, this.boss.id)
      : this.damagePlayer(amount, 'test-damage');
  }

  snapshotForTest(): TestSnapshot {
    const state: TestRuntimeState = this.model.dead
      ? 'adventure-ended'
      : this.paused
        ? 'paused'
        : 'playing';
    return {
      state,
      seed: this.seed,
      simulationTimeMs: this.simulationTimeMs,
      stageId: this.stageId,
      stageTimeMs: this.simulationTimeMs,
      completedLoops: 0,
      player: {
        x: this.player.x,
        y: this.player.y,
        aimDirection: this.aimDirection,
        health: this.model.health,
        maxHealth: this.model.maxHealth,
        level: 1,
        xp: 0,
      },
      score: 0,
      weaponLevels: { 'ghost-arrow': 1 },
      passiveLevels: {},
      masteryLevels: {},
      enemyCountsById: {},
      boss: this.boss,
      activeUpgradeOffer: null,
      eventSequence: this.eventsOut.currentSequence,
    };
  }

  damagePlayer(amount: number, sourceId = 'contact'): boolean {
    if (this.paused || this.model.dead) return false;
    return this.applyDamage(amount, sourceId);
  }

  damagePlayerFromBoss(amount: number, bossId: string): boolean {
    if (this.paused || this.model.dead) return false;
    if (!this.bossSafety.canDamagePlayer(this.simulationTimeMs)) return false;
    return this.applyDamage(amount, `boss:${bossId}`);
  }

  private applyDamage(amount: number, sourceId: string): boolean {
    const result = this.model.damage(amount, this.simulationTimeMs);
    if (!result.applied) return false;
    publishPlayerDamage(this.eventsOut, result, this.model.health, this.model.maxHealth, sourceId, {
      score: 0,
      level: 1,
      completedLoops: 0,
      survivalTimeMs: this.simulationTimeMs,
      killsByEnemyId: {},
    });
    this.player.setTintFill(0xff9a8f);
    this.time.delayedCall(90, () => this.player.clearTint());
    if (result.died) {
      this.player.setVelocity(0, 0).play(`player-death-${this.aimDirection}`);
      this.physics.world.pause();
      this.reflectState();
    }
    return true;
  }

  healPlayer(amount = HEAL_PICKUP_AMOUNT): number {
    const healed = this.model.heal(amount);
    if (healed > 0) {
      this.eventsOut.emit('player:health-changed', {
        current: this.model.health,
        maximum: this.model.maxHealth,
        delta: healed,
        sourceId: 'pickup-heal',
      });
    }
    return healed;
  }

  beginBossSafetyWindow(): number {
    const safeUntilMs = this.bossSafety.begin(this.simulationTimeMs, 2000);
    return safeUntilMs;
  }

  private configureInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = keyboard.createCursorKeys();
    this.movementKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, PLAYER_ASSET_KEY, 0);
    this.player.setOrigin(PLAYER_ASSET.anchor.x, PLAYER_ASSET.anchor.y).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const collision = PLAYER_ASSET.collision;
    if (collision?.shape !== 'circle' || collision.radius === undefined) {
      throw new Error(`${PLAYER_ASSET_KEY} requires circle collision data`);
    }
    body.setCircle(
      collision.radius,
      PLAYER_ASSET.anchor.x * PLAYER_ASSET.frameWidth + collision.offsetX - collision.radius,
      PLAYER_ASSET.anchor.y * PLAYER_ASSET.frameHeight + collision.offsetY - collision.radius,
    );
    this.player.play('player-idle-e');
  }

  private createObstacles(): void {
    const obstacles = this.physics.add.staticGroup();
    const placements = [
      [WORLD_WIDTH / 2 - 128, WORLD_HEIGHT / 2 - 80, 48, 18],
      [WORLD_WIDTH / 2 + 144, WORLD_HEIGHT / 2 + 72, 64, 18],
      [WORLD_WIDTH / 2 - 112, WORLD_HEIGHT / 2 + 108, 22, 54],
    ] as const;
    for (const [x, y, width, height] of placements) {
      const obstacle = this.add.rectangle(x, y, width, height, 0x39483b, 1);
      obstacle.setStrokeStyle(2, 0x6c7180);
      obstacles.add(obstacle);
    }
    this.physics.add.collider(this.player, obstacles);
  }

  private drawWorld(): void {
    this.cameras.main.setBackgroundColor('#101426');
    const grid = this.add.graphics();
    grid.fillStyle(0x252a3a, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    grid.lineStyle(1, 0x39483b, 0.32);
    for (let x = 0; x <= WORLD_WIDTH; x += 16) grid.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += 16) grid.lineBetween(0, y, WORLD_WIDTH, y);
  }

  private updateMovement(): void {
    const x =
      Number(
        this.testInputs.has('right') ||
          (!this.testControlled && (this.movementKeys.right.isDown || this.cursors.right.isDown)),
      ) -
      Number(
        this.testInputs.has('left') ||
          (!this.testControlled && (this.movementKeys.left.isDown || this.cursors.left.isDown)),
      );
    const y =
      Number(
        this.testInputs.has('down') ||
          (!this.testControlled && (this.movementKeys.down.isDown || this.cursors.down.isDown)),
      ) -
      Number(
        this.testInputs.has('up') ||
          (!this.testControlled && (this.movementKeys.up.isDown || this.cursors.up.isDown)),
      );
    const movement = normalizeMovement(x, y);
    this.player.setVelocity(
      movement.x * PLAYER_CONFIG.moveSpeed,
      movement.y * PLAYER_CONFIG.moveSpeed,
    );
  }

  private updateAim(): void {
    const target = this.testAim ?? {
      x: this.input.activePointer.worldX,
      y: this.input.activePointer.worldY,
    };
    const x = target.x - this.player.x;
    const y = target.y - this.player.y;
    if (Math.hypot(x, y) < 0.001) return;
    const length = Math.hypot(x, y);
    this.aimVector = { x: x / length, y: y / length };
    const nextDirection = aimDirectionForVector(x, y);
    if (nextDirection !== this.aimDirection) {
      this.aimDirection = nextDirection;
      this.eventsOut.emit('player:aim-changed', {
        direction: nextDirection,
        angleDeg: (Math.atan2(y, x) * 180) / Math.PI,
      });
    }
  }

  private updateAnimation(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moving = body.velocity.lengthSq() > 0;
    const key = `player-${moving ? 'walk' : 'idle'}-${this.aimDirection}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key, true);
  }

  private fireWhenReady(): void {
    if (this.simulationTimeMs < this.nextAttackAtMs) return;
    this.nextAttackAtMs = this.simulationTimeMs + GHOST_ARROW_CONFIG.cooldownMs;
    const attackId = `ghost-arrow:${this.attackId + 1}`;
    if (
      !this.projectileBudget.reservePattern(
        [attackId],
        this.simulationTimeMs,
        GHOST_ARROW_CONFIG.projectileLifetimeMs,
      )
    ) {
      return;
    }
    this.attackId += 1;
    const arrow = this.physics.add.image(this.player.x, this.player.y - 6, ARROW_ASSET_KEY);
    const collision = ARROW_ASSET.collision;
    if (
      collision?.shape !== 'rect' ||
      collision.width === undefined ||
      collision.height === undefined
    ) {
      throw new Error(`${ARROW_ASSET_KEY} requires rectangle collision data`);
    }
    const body = arrow.body as Phaser.Physics.Arcade.Body;
    body.setSize(collision.width, collision.height);
    body.setOffset(
      ARROW_ASSET.anchor.x * ARROW_ASSET.frameWidth + collision.offsetX - collision.width / 2,
      ARROW_ASSET.anchor.y * ARROW_ASSET.frameHeight + collision.offsetY - collision.height / 2,
    );
    arrow.setDepth(2).setRotation(Math.atan2(this.aimVector.y, this.aimVector.x));
    arrow.setVelocity(
      this.aimVector.x * GHOST_ARROW_CONFIG.projectileSpeed,
      this.aimVector.y * GHOST_ARROW_CONFIG.projectileSpeed,
    );
    this.arrows.set(attackId, arrow);
    const mount = this.game.canvas.parentElement;
    if (mount) mount.dataset.lastProjectileBody = `${body.width}x${body.height}`;
    this.eventsOut.emit('weapon:fired', {
      weaponId: 'ghost-arrow',
      attackId,
      origin: { x: this.player.x, y: this.player.y },
      aim: { ...this.aimVector },
    });
  }

  private setPaused(paused: boolean, reason: 'user' | 'blur'): void {
    if (this.paused === paused || this.model.dead) return;
    this.paused = paused;
    if (paused || this.testControlled) this.physics.world.pause();
    else this.physics.world.resume();
    this.eventsOut.emit('game:pause-changed', { paused, reason });
    this.reflectState();
  }

  private pauseForBlur(): void {
    this.setPaused(true, 'blur');
  }

  private reflectState(): void {
    const mount = this.game.canvas.parentElement;
    if (!mount) return;
    const state = this.model.dead ? 'adventure-ended' : this.paused ? 'paused' : 'playing';
    mount.dataset.gameState = state;
    if (this.testControlled) mount.dataset.testState = state;
    mount.dataset.playerX = this.player.x.toFixed(2);
    mount.dataset.playerY = this.player.y.toFixed(2);
    mount.dataset.aimDirection = this.aimDirection;
    mount.dataset.ghostArrowCount = String(this.attackId);
    mount.dataset.activeProjectileCount = String(this.projectileBudget.activeCount);
    mount.dataset.eventSequence = String(this.eventsOut.currentSequence);
  }

  private runSimulation(delta: number, manuallyIntegrateMovement: boolean): void {
    this.simulationTimeMs += delta;
    this.updateAim();
    this.updateMovement();
    if (manuallyIntegrateMovement) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      this.player.setPosition(
        Phaser.Math.Clamp(this.player.x + body.velocity.x * (delta / 1000), 0, WORLD_WIDTH),
        Phaser.Math.Clamp(this.player.y + body.velocity.y * (delta / 1000), 0, WORLD_HEIGHT),
      );
      for (const arrow of this.arrows.values()) {
        const arrowBody = arrow.body as Phaser.Physics.Arcade.Body;
        arrow.setPosition(
          arrow.x + arrowBody.velocity.x * (delta / 1000),
          arrow.y + arrowBody.velocity.y * (delta / 1000),
        );
      }
    }
    this.updateAnimation();
    for (const projectileId of this.projectileBudget.releaseExpired(this.simulationTimeMs)) {
      this.arrows.get(projectileId)?.destroy();
      this.arrows.delete(projectileId);
    }
    this.fireWhenReady();
    this.reflectState();
  }

  private createAnimations(): void {
    const directions: readonly AimDirection[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
    directions.forEach((direction, row) => {
      const first = row * 9;
      this.createAnimation(`player-idle-${direction}`, [first], 1, -1);
      this.createAnimation(
        `player-walk-${direction}`,
        [first + 1, first + 2, first + 3, first + 4],
        8,
        -1,
      );
      this.createAnimation(`player-death-${direction}`, [first + 5, first + 8], 6, 0);
    });
  }

  private createAnimation(key: string, frames: number[], frameRate: number, repeat: number): void {
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: frames.map((frame) => ({ key: PLAYER_ASSET_KEY, frame })),
      frameRate,
      repeat,
    });
  }
}
