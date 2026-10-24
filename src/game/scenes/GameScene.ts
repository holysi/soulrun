import Phaser from 'phaser';

import { imageAsset } from '../assets';
import {
  GHOST_ARROW_CONFIG,
  PLAYER_CONFIG,
  SCENE_KEYS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../constants';
import { GameEventPublisher } from '../events/GameEventBus';
import { BossSafetyWindow } from '../player/BossSafetyWindow';
import { PlayerModel } from '../player/PlayerModel';
import { aimDirectionForVector, normalizeMovement } from '../player/direction';
import type { AimDirection } from '../testing/types';

const PLAYER_ASSET_KEY = 'player-soul-guide';
const ARROW_ASSET_KEY = 'weapon-ghost-arrow';
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
  private readonly arrows = new Set<Phaser.Physics.Arcade.Image>();
  private eventsOut!: GameEventPublisher;

  constructor() {
    super(SCENE_KEYS.game);
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
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) this.setPaused(!this.paused, 'user');
    if (this.paused || this.model.dead) return;

    this.simulationTimeMs += delta;
    this.updateAim();
    this.updateMovement();
    this.updateAnimation();
    this.fireWhenReady();
    this.reflectState();
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
    this.eventsOut.emit('player:damaged', {
      amount: result.amount,
      sourceId,
      invulnerableUntilMs: result.invulnerableUntilMs,
    });
    this.eventsOut.emit('player:health-changed', {
      current: this.model.health,
      maximum: this.model.maxHealth,
      delta: -result.amount,
      sourceId,
    });
    this.player.setTintFill(0xff9a8f);
    this.time.delayedCall(90, () => this.player.clearTint());
    if (result.died) {
      this.player.setVelocity(0, 0).play(`player-death-${this.aimDirection}`);
      this.physics.world.pause();
      this.eventsOut.emit('player:died', { sourceId });
      this.reflectState();
    }
    return true;
  }

  healPlayer(amount = PLAYER_CONFIG.healAmount): number {
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
      Number(this.movementKeys.right.isDown || this.cursors.right.isDown) -
      Number(this.movementKeys.left.isDown || this.cursors.left.isDown);
    const y =
      Number(this.movementKeys.down.isDown || this.cursors.down.isDown) -
      Number(this.movementKeys.up.isDown || this.cursors.up.isDown);
    const movement = normalizeMovement(x, y);
    this.player.setVelocity(
      movement.x * PLAYER_CONFIG.moveSpeed,
      movement.y * PLAYER_CONFIG.moveSpeed,
    );
  }

  private updateAim(): void {
    const pointer = this.input.activePointer;
    const x = pointer.worldX - this.player.x;
    const y = pointer.worldY - this.player.y;
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
    this.attackId += 1;
    const arrow = this.physics.add.image(this.player.x, this.player.y - 6, ARROW_ASSET_KEY);
    arrow.setDepth(2).setRotation(Math.atan2(this.aimVector.y, this.aimVector.x));
    arrow.setVelocity(
      this.aimVector.x * GHOST_ARROW_CONFIG.speed,
      this.aimVector.y * GHOST_ARROW_CONFIG.speed,
    );
    this.arrows.add(arrow);
    this.time.delayedCall(GHOST_ARROW_CONFIG.lifetimeMs, () => {
      this.arrows.delete(arrow);
      arrow.destroy();
    });
    this.eventsOut.emit('weapon:fired', {
      weaponId: 'ghost-arrow',
      attackId: `ghost-arrow:${this.attackId}`,
      origin: { x: this.player.x, y: this.player.y },
      aim: { ...this.aimVector },
    });
  }

  private setPaused(paused: boolean, reason: 'user' | 'blur'): void {
    if (this.paused === paused || this.model.dead) return;
    this.paused = paused;
    if (paused) this.physics.world.pause();
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
    mount.dataset.gameState = this.model.dead
      ? 'adventure-ended'
      : this.paused
        ? 'paused'
        : 'playing';
    mount.dataset.playerX = this.player.x.toFixed(2);
    mount.dataset.playerY = this.player.y.toFixed(2);
    mount.dataset.aimDirection = this.aimDirection;
    mount.dataset.ghostArrowCount = String(this.attackId);
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
