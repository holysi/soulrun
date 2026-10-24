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
import {
  ProgressionModel,
  ScoreModel,
  UpgradeFlow,
  effectivePlayerStats,
  effectiveWeaponStats,
  synchronizePhysicsWorld,
} from '../progression';
import type { UpgradeOffer } from '../progression';
import { createGameplayStreams } from '../random/RandomSource';
import type {
  AimDirection,
  TestInputCommand,
  TestSnapshot,
  TestRuntimeState,
} from '../testing/types';
import { upgradeOptionAt } from '../ui/upgradeLayout';

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
function weaponConfig(id: 'soul-blade' | 'death-aura') {
  const weapon = GAME_CONFIG.weapons.find((candidate) => candidate.id === id);
  if (!weapon) throw new Error(`${id} config is missing`);
  return weapon;
}
const SOUL_BLADE_CONFIG = weaponConfig('soul-blade');
const DEATH_AURA_CONFIG = weaponConfig('death-aura');
const SOUL_BLADE_ASSET = imageAsset(SOUL_BLADE_CONFIG.assetKey);
const DEATH_AURA_ASSET = imageAsset(DEATH_AURA_CONFIG.assetKey);

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
  private progression!: ProgressionModel;
  private readonly upgradeFlow = new UpgradeFlow();
  private score = new ScoreModel(GAME_CONFIG);
  private upgradeKeys!: Phaser.Input.Keyboard.Key[];
  private xpEntityId = 0;
  private readonly xpGems = new Map<string, { value: number; x: number; y: number }>();
  private readonly soulBlades: Phaser.GameObjects.Image[] = [];
  private deathAura!: Phaser.GameObjects.Image;
  private nextAuraAtMs = 0;
  private bladeOrbitAngle = 0;
  private secondaryAttackId = 0;

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
    this.load.image(SOUL_BLADE_CONFIG.assetKey, SOUL_BLADE_ASSET.path);
    this.load.spritesheet(DEATH_AURA_CONFIG.assetKey, DEATH_AURA_ASSET.path, {
      frameWidth: DEATH_AURA_ASSET.frameWidth,
      frameHeight: DEATH_AURA_ASSET.frameHeight,
    });
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
    this.progression = new ProgressionModel(
      GAME_CONFIG,
      createGameplayStreams(this.seed || 'local-adventure').upgrade,
    );
    this.upgradeFlow.reset();
    this.score = new ScoreModel(GAME_CONFIG);
    this.xpEntityId = 0;
    this.xpGems.clear();
    this.soulBlades.splice(0).forEach((blade) => blade.destroy());
    this.nextAuraAtMs = 0;
    this.bladeOrbitAngle = 0;
    this.secondaryAttackId = 0;
    this.eventsOut = new GameEventPublisher(
      this.registry.events,
      'adventure-local-1',
      () => this.simulationTimeMs,
    );
    this.eventsOut.emit('adventure:started', {
      seed: this.seed || 'local-adventure',
      adventureId: 'adventure-local-1',
    });
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawWorld();
    this.createAnimations();
    this.createPlayer();
    this.deathAura = this.add
      .image(this.player.x, this.player.y, DEATH_AURA_CONFIG.assetKey)
      .setDepth(1)
      .setVisible(false);
    this.createObstacles();
    this.configureInput();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.selectUpgradeWithPointer, this);

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
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.selectUpgradeWithPointer, this);
      this.scene.stop(SCENE_KEYS.overlay);
    });
    this.syncPhysicsPause();
  }

  update(_time: number, delta: number): void {
    if (this.testControlled) return;
    if (!this.upgradeFlow.modalActive && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.setPaused(!this.paused, 'user');
    }
    const selectedIndex = this.upgradeKeys.findIndex((key) => Phaser.Input.Keyboard.JustDown(key));
    if (selectedIndex >= 0 && this.progression.activeOffer) this.selectUpgrade(selectedIndex);
    if (this.simulationSuspended()) return;
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
    if (
      this.paused ||
      this.model.dead ||
      this.upgradeFlow.modalActive ||
      this.upgradeFlow.baseState === 'boss-cleanup'
    )
      return;
    const fixedStepMs = 1000 / 60;
    this.testRemainderMs += ms;
    const steps = Math.floor((this.testRemainderMs + fixedStepMs * 1e-9) / fixedStepMs);
    this.testRemainderMs -= steps * fixedStepMs;
    for (let step = 0; step < steps; step += 1) {
      if (this.simulationSuspended()) break;
      this.runSimulation(fixedStepMs, true);
    }
    await Promise.resolve();
  }

  forceBossForTest(): void {
    if (this.model.dead) throw new Error('Boss can only be forced during play');
    this.upgradeFlow.enterBaseState('boss-fight');
    this.boss = { id: 'graveyard-guardian', health: 1000, phase: 1 };
    this.beginBossSafetyWindow();
    this.syncPhysicsPause();
    this.reflectState();
  }

  chooseUpgradeForTest(index: 0 | 1 | 2): void {
    this.selectUpgrade(index);
  }

  spawnXpGem(value: number, x: number, y: number): string {
    if (!Number.isInteger(value) || value < 0)
      throw new Error('XP value must be a non-negative integer');
    const entityId = `xp:${++this.xpEntityId}`;
    this.xpGems.set(entityId, { value, x, y });
    this.eventsOut.emit('xp:spawned', { entityId, value, x, y });
    return entityId;
  }

  collectXpGem(entityId: string): void {
    const gem = this.xpGems.get(entityId);
    if (!gem) throw new Error(`Unknown or collected XP gem ${entityId}`);
    this.xpGems.delete(entityId);
    const { value } = gem;
    const reached = this.progression.collectXp(value);
    this.eventsOut.emit('xp:collected', {
      entityId,
      value,
      totalXp: this.progression.xp,
      level: this.progression.level,
    });
    for (const level of reached) this.eventsOut.emit('level:reached', level);
    if (this.upgradeFlow.baseState !== 'boss-cleanup') this.offerNextQueuedLevel();
    this.reflectState();
  }

  awardEnemyDefeat(
    entityId: string,
    enemyId: (typeof GAME_CONFIG.enemies)[number]['id'],
    elite: boolean,
    x: number,
    y: number,
    completedLoops = 0,
  ): string {
    const { score: scoreAwarded, xp } = this.score.awardEnemy(enemyId, elite, completedLoops);
    const gemId = this.spawnXpGem(xp, x, y);
    this.eventsOut.emit('enemy:defeated', {
      entityId,
      enemyId,
      elite,
      scoreAwarded,
      xpGemValue: xp,
    });
    this.eventsOut.emit('score:changed', {
      score: this.score.score,
      delta: scoreAwarded,
      sourceId: entityId,
    });
    return gemId;
  }

  awardBossDefeat(bossId: (typeof GAME_CONFIG.bosses)[number]['id'], completedLoops = 0): number {
    const boss = GAME_CONFIG.bosses.find((candidate) => candidate.id === bossId);
    if (!boss) throw new Error(`Unknown Boss ${bossId}`);
    const scoreAwarded = this.score.awardBoss(bossId, completedLoops);
    this.eventsOut.emit('boss:defeated', { bossId, stageId: boss.stageId, scoreAwarded });
    this.eventsOut.emit('score:changed', {
      score: this.score.score,
      delta: scoreAwarded,
      sourceId: bossId,
    });
    return scoreAwarded;
  }

  offerBossUpgrade(): void {
    const offer = this.progression.offerBossUpgrade();
    this.upgradeFlow.openBossUpgrade();
    this.publishOffer(offer);
    this.syncPhysicsPause();
    this.reflectState();
  }

  beginBossCleanup(): void {
    this.upgradeFlow.enterBaseState('boss-cleanup');
    this.syncPhysicsPause();
    this.reflectState();
  }

  resolveBossCleanupLevelUps(): void {
    if (this.upgradeFlow.baseState !== 'boss-cleanup') {
      throw new Error('Queued cleanup levels require boss-cleanup state');
    }
    this.offerNextQueuedLevel();
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
        : this.upgradeFlow.state;
    const progression = this.progression.snapshot();
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
        level: progression.level,
        xp: progression.xp,
      },
      score: this.score.score,
      weaponLevels: progression.weaponLevels,
      passiveLevels: progression.passiveLevels,
      masteryLevels: progression.masteryLevels,
      enemyCountsById: {},
      boss: this.boss,
      activeUpgradeOffer: progression.activeOffer
        ? {
            id: progression.activeOffer.id,
            source: progression.activeOffer.source,
            optionIds: progression.activeOffer.optionIds,
          }
        : null,
      eventSequence: this.eventsOut.currentSequence,
    };
  }

  damagePlayer(amount: number, sourceId = 'contact'): boolean {
    if (this.paused || this.model.dead || this.upgradeFlow.modalActive) return false;
    return this.applyDamage(amount, sourceId);
  }

  damagePlayerFromBoss(amount: number, bossId: string): boolean {
    if (this.paused || this.model.dead || this.upgradeFlow.modalActive) return false;
    if (!this.bossSafety.canDamagePlayer(this.simulationTimeMs)) return false;
    return this.applyDamage(amount, `boss:${bossId}`);
  }

  private applyDamage(amount: number, sourceId: string): boolean {
    const result = this.model.damage(amount, this.simulationTimeMs);
    if (!result.applied) return false;
    const progression = this.progression.snapshot();
    publishPlayerDamage(this.eventsOut, result, this.model.health, this.model.maxHealth, sourceId, {
      score: this.score.score,
      level: progression.level,
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
    this.upgradeKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
    ];
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
    const progression = this.progression.snapshot();
    const playerStats = effectivePlayerStats(
      progression.passiveLevels,
      progression.masteryLevels,
      GAME_CONFIG,
    );
    this.player.setVelocity(movement.x * playerStats.moveSpeed, movement.y * playerStats.moveSpeed);
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
    const progression = this.progression.snapshot();
    const weaponLevel = progression.weaponLevels['ghost-arrow'] ?? 1;
    const stats = effectiveWeaponStats(
      GHOST_ARROW_CONFIG,
      weaponLevel,
      progression.passiveLevels,
      progression.masteryLevels,
      GAME_CONFIG,
    );
    this.nextAttackAtMs = this.simulationTimeMs + stats.cooldownMs;
    const nextAttackNumber = this.attackId + 1;
    const projectileCount = stats.projectileCount ?? 1;
    const projectileIds = Array.from(
      { length: projectileCount },
      (_, index) => `ghost-arrow:${nextAttackNumber}:${index + 1}`,
    );
    if (
      !this.projectileBudget.reservePattern(
        projectileIds,
        this.simulationTimeMs,
        GHOST_ARROW_CONFIG.projectileLifetimeMs,
      )
    ) {
      return;
    }
    this.attackId += 1;
    const collision = ARROW_ASSET.collision;
    if (
      collision?.shape !== 'rect' ||
      collision.width === undefined ||
      collision.height === undefined
    ) {
      throw new Error(`${ARROW_ASSET_KEY} requires rectangle collision data`);
    }
    const collisionWidth = collision.width;
    const collisionHeight = collision.height;
    projectileIds.forEach((attackId, index) => {
      const arrow = this.physics.add.image(this.player.x, this.player.y - 6, ARROW_ASSET_KEY);
      const body = arrow.body as Phaser.Physics.Arcade.Body;
      body.setSize(collisionWidth, collisionHeight);
      body.setOffset(
        ARROW_ASSET.anchor.x * ARROW_ASSET.frameWidth + collision.offsetX - collisionWidth / 2,
        ARROW_ASSET.anchor.y * ARROW_ASSET.frameHeight + collision.offsetY - collisionHeight / 2,
      );
      const spread = Phaser.Math.DegToRad((index - (projectileCount - 1) / 2) * 8);
      const angle = Math.atan2(this.aimVector.y, this.aimVector.x) + spread;
      const aim = { x: Math.cos(angle), y: Math.sin(angle) };
      arrow
        .setDepth(2)
        .setRotation(angle)
        .setData({ damage: stats.damage, penetration: stats.penetration ?? 0 });
      arrow.setVelocity(
        aim.x * GHOST_ARROW_CONFIG.projectileSpeed,
        aim.y * GHOST_ARROW_CONFIG.projectileSpeed,
      );
      this.arrows.set(attackId, arrow);
      const mount = this.game.canvas.parentElement;
      if (mount) mount.dataset.lastProjectileBody = `${body.width}x${body.height}`;
      this.eventsOut.emit('weapon:fired', {
        weaponId: 'ghost-arrow',
        attackId,
        origin: { x: this.player.x, y: this.player.y },
        aim,
      });
    });
  }

  private setPaused(paused: boolean, reason: 'user' | 'blur'): void {
    if (reason === 'user' && this.upgradeFlow.modalActive) return;
    if (this.paused === paused || this.model.dead) return;
    this.paused = paused;
    this.syncPhysicsPause();
    this.eventsOut.emit('game:pause-changed', { paused, reason });
    this.reflectState();
  }

  private pauseForBlur(): void {
    this.setPaused(true, 'blur');
  }

  private reflectState(): void {
    const mount = this.game.canvas.parentElement;
    if (!mount) return;
    const state = this.model.dead
      ? 'adventure-ended'
      : this.paused
        ? 'paused'
        : this.upgradeFlow.state;
    mount.dataset.gameState = state;
    if (this.testControlled) mount.dataset.testState = state;
    mount.dataset.playerX = this.player.x.toFixed(2);
    mount.dataset.playerY = this.player.y.toFixed(2);
    mount.dataset.aimDirection = this.aimDirection;
    mount.dataset.ghostArrowCount = String(this.attackId);
    mount.dataset.soulBladeCount = String(this.soulBlades.length);
    mount.dataset.deathAuraCount = String(this.secondaryAttackId);
    mount.dataset.activeProjectileCount = String(this.projectileBudget.activeCount);
    const firstProjectile = this.arrows.values().next().value;
    if (firstProjectile) mount.dataset.firstProjectileX = firstProjectile.x.toFixed(2);
    else delete mount.dataset.firstProjectileX;
    mount.dataset.eventSequence = String(this.eventsOut.currentSequence);
  }

  private offerNextQueuedLevel(): void {
    const offer = this.progression.offerNextQueuedLevel();
    if (!offer) return;
    this.upgradeFlow.openLevelUp();
    this.publishOffer(offer);
    this.syncPhysicsPause();
    this.reflectState();
  }

  private publishOffer(offer: UpgradeOffer): void {
    this.eventsOut.emit('upgrade:offered', {
      offerId: offer.id,
      source: offer.source,
      optionIds: offer.optionIds,
    });
  }

  private selectUpgrade(index: number): void {
    const offer = this.progression.activeOffer;
    const optionId = offer?.optionIds[index];
    if (!offer || !optionId) throw new Error('No upgrade option is available at that index');
    const applied = this.progression.select(optionId);
    if (applied.maximumHealthAdded > 0) {
      this.model.increaseMaxHealth(applied.maximumHealthAdded);
      this.eventsOut.emit('player:health-changed', {
        current: this.model.health,
        maximum: this.model.maxHealth,
        delta: applied.healing,
        sourceId: optionId,
      });
    }
    this.eventsOut.emit('upgrade:selected', {
      offerId: offer.id,
      optionId,
      newLevel: applied.newLevel,
    });
    this.syncSecondaryWeapons();
    const nextOffer = this.progression.offerNextQueuedLevel();
    this.upgradeFlow.finishOffer(nextOffer !== null);
    if (nextOffer) this.publishOffer(nextOffer);
    this.syncPhysicsPause();
    this.reflectState();
  }

  private selectUpgradeWithPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.progression.activeOffer) return;
    const index = upgradeOptionAt(pointer.x, pointer.y);
    if (index !== null) this.selectUpgrade(index);
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
    this.collectNearbyXpGems();
    this.updateAnimation();
    this.updateSecondaryWeapons(delta);
    for (const projectileId of this.projectileBudget.releaseExpired(this.simulationTimeMs)) {
      this.arrows.get(projectileId)?.destroy();
      this.arrows.delete(projectileId);
    }
    this.fireWhenReady();
    this.reflectState();
  }

  private collectNearbyXpGems(): void {
    const progression = this.progression.snapshot();
    const { pickupRadius } = effectivePlayerStats(
      progression.passiveLevels,
      progression.masteryLevels,
      GAME_CONFIG,
    );
    const nearby = [...this.xpGems.entries()]
      .filter(
        ([, gem]) =>
          Phaser.Math.Distance.Between(this.player.x, this.player.y, gem.x, gem.y) <= pickupRadius,
      )
      .map(([entityId]) => entityId)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    for (const entityId of nearby) {
      this.collectXpGem(entityId);
      if (this.upgradeFlow.modalActive) break;
    }
  }

  private syncPhysicsPause(): void {
    synchronizePhysicsWorld(this.physics.world, {
      testControlled: this.testControlled,
      userPaused: this.paused,
      modalActive: this.upgradeFlow.modalActive,
      simulationSuspended: this.upgradeFlow.baseState === 'boss-cleanup',
      playerDead: this.model.dead,
    });
  }

  private simulationSuspended(): boolean {
    return (
      this.paused ||
      this.model.dead ||
      this.upgradeFlow.modalActive ||
      this.upgradeFlow.baseState === 'boss-cleanup'
    );
  }

  private syncSecondaryWeapons(): void {
    const progression = this.progression.snapshot();
    const bladeLevel = progression.weaponLevels['soul-blade'] ?? 0;
    const desired =
      bladeLevel === 0
        ? 0
        : (effectiveWeaponStats(
            SOUL_BLADE_CONFIG,
            bladeLevel,
            progression.passiveLevels,
            progression.masteryLevels,
            GAME_CONFIG,
          ).bladeCount ?? 0);
    while (this.soulBlades.length < desired) {
      this.soulBlades.push(
        this.add.image(this.player.x, this.player.y, SOUL_BLADE_CONFIG.assetKey).setDepth(2),
      );
    }
    while (this.soulBlades.length > desired) this.soulBlades.pop()?.destroy();
  }

  private updateSecondaryWeapons(delta: number): void {
    const progression = this.progression.snapshot();
    const bladeLevel = progression.weaponLevels['soul-blade'] ?? 0;
    if (bladeLevel > 0) {
      const stats = effectiveWeaponStats(
        SOUL_BLADE_CONFIG,
        bladeLevel,
        progression.passiveLevels,
        progression.masteryLevels,
        GAME_CONFIG,
      );
      this.bladeOrbitAngle += Phaser.Math.DegToRad(
        (stats.orbitSpeedDegPerSec ?? 0) * (delta / 1000),
      );
      this.soulBlades.forEach((blade, index) => {
        const angle = this.bladeOrbitAngle + (index / this.soulBlades.length) * Math.PI * 2;
        blade
          .setPosition(
            this.player.x + Math.cos(angle) * (stats.orbitRadius ?? 0),
            this.player.y + Math.sin(angle) * (stats.orbitRadius ?? 0),
          )
          .setRotation(angle)
          .setData('damage', stats.damage);
      });
    }
    const auraLevel = progression.weaponLevels['death-aura'] ?? 0;
    if (auraLevel === 0 || this.simulationTimeMs < this.nextAuraAtMs) return;
    const stats = effectiveWeaponStats(
      DEATH_AURA_CONFIG,
      auraLevel,
      progression.passiveLevels,
      progression.masteryLevels,
      GAME_CONFIG,
    );
    this.nextAuraAtMs = this.simulationTimeMs + stats.cooldownMs;
    const radius = stats.effectRadius ?? 0;
    this.deathAura
      .setPosition(this.player.x, this.player.y)
      .setDisplaySize(radius * 2, radius * 2)
      .setData('damage', stats.damage)
      .setAlpha(0.65)
      .setVisible(true);
    this.tweens.add({
      targets: this.deathAura,
      alpha: 0,
      duration: 180,
      onComplete: () => this.deathAura.setVisible(false),
    });
    const attackId = `death-aura:${++this.secondaryAttackId}`;
    this.eventsOut.emit('weapon:fired', {
      weaponId: 'death-aura',
      attackId,
      origin: { x: this.player.x, y: this.player.y },
      aim: { x: 0, y: 0 },
    });
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
