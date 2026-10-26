import Phaser from 'phaser';

import { imageAsset } from '../assets';
import { CemeteryDirector, circleContains, consumePenetratingHit } from '../cemetery';
import type { CemeteryDirectorEvent, CemeteryEnemyState } from '../cemetery';
import { HEAL_PICKUP_AMOUNT, SCENE_KEYS } from '../constants';
import { BossAttackTimeline, GAME_CONFIG, bossAttackCooldown } from '../content';
import type { BossAttack } from '../content';
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
import type { RandomSource } from '../random/RandomSource';
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
const ZOMBIE_ASSET = imageAsset('enemy-zombie');
const BAT_ASSET = imageAsset('enemy-bat');
const GUARDIAN_ASSET = imageAsset('boss-graveyard-guardian');
const XP_GEM_ASSET = imageAsset('pickup-xp-gem');
const HEAL_ASSET = imageAsset('pickup-heal');
const TELEGRAPH_LINE_ASSET = imageAsset('vfx-telegraph-line');
const TELEGRAPH_CIRCLE_ASSET = imageAsset('vfx-telegraph-circle');
const CEMETERY_STAGE = GAME_CONFIG.stages.find((candidate) => candidate.id === 'cemetery')!;
const GUARDIAN_CONFIG = GAME_CONFIG.bosses.find(
  (candidate) => candidate.id === 'graveyard-guardian',
)!;

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
  private cemetery!: CemeteryDirector;
  private readonly enemySprites = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private readonly enemyContactAt = new Map<string, number>();
  private guardian: Phaser.Physics.Arcade.Sprite | null = null;
  private guardianTimeline: BossAttackTimeline | null = null;
  private guardianAttackIndex = 0;
  private guardianPreviousAttackMs = 0;
  private guardianTarget = { x: 0, y: 0 };
  private telegraph: Phaser.GameObjects.Image | null = null;
  private readonly xpGemSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly healPickups = new Map<string, Phaser.GameObjects.Image>();
  private healPickupId = 0;
  private kills = 0;
  private readonly killsByEnemyId = new Map<string, number>();
  private damageTaken = 0;
  private stageCompleted = false;
  private lootRandom!: RandomSource;
  private lastTimerSecond = -1;
  private lastPressureStep = -1;
  private readonly bossDamageMoments = new Set<number>();
  private readonly bladeContacts = new Map<number, Set<string>>();
  private guardianContactAt = 0;
  private guardianContactHitCount = 0;
  private secondaryHitCount = 0;
  private readonly secondaryHits = new Map<string, number>();
  private penetrationUsedCount = 0;

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
    this.load.spritesheet('enemy-zombie', ZOMBIE_ASSET.path, {
      frameWidth: ZOMBIE_ASSET.frameWidth,
      frameHeight: ZOMBIE_ASSET.frameHeight,
    });
    this.load.spritesheet('enemy-bat', BAT_ASSET.path, {
      frameWidth: BAT_ASSET.frameWidth,
      frameHeight: BAT_ASSET.frameHeight,
    });
    this.load.spritesheet('boss-graveyard-guardian', GUARDIAN_ASSET.path, {
      frameWidth: GUARDIAN_ASSET.frameWidth,
      frameHeight: GUARDIAN_ASSET.frameHeight,
    });
    this.load.image('pickup-xp-gem', XP_GEM_ASSET.path);
    this.load.image('pickup-heal', HEAL_ASSET.path);
    this.load.image('vfx-telegraph-line', TELEGRAPH_LINE_ASSET.path);
    this.load.image('vfx-telegraph-circle', TELEGRAPH_CIRCLE_ASSET.path);
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
    this.cemetery = new CemeteryDirector(this.seed || 'local-adventure');
    this.enemySprites.forEach((sprite) => sprite.destroy());
    this.enemySprites.clear();
    this.enemyContactAt.clear();
    this.guardian?.destroy();
    this.guardian = null;
    this.guardianTimeline = null;
    this.guardianAttackIndex = 0;
    this.guardianPreviousAttackMs = 0;
    this.telegraph?.destroy();
    this.telegraph = null;
    this.xpGemSprites.forEach((sprite) => sprite.destroy());
    this.xpGemSprites.clear();
    this.healPickups.forEach((sprite) => sprite.destroy());
    this.healPickups.clear();
    this.healPickupId = 0;
    this.kills = 0;
    this.killsByEnemyId.clear();
    this.damageTaken = 0;
    this.stageCompleted = false;
    this.lootRandom = createGameplayStreams(this.seed || 'local-adventure').loot;
    this.lastTimerSecond = -1;
    this.lastPressureStep = -1;
    this.bossDamageMoments.clear();
    this.bladeContacts.clear();
    this.guardianContactAt = 0;
    this.guardianContactHitCount = 0;
    this.secondaryHitCount = 0;
    this.secondaryHits.clear();
    this.penetrationUsedCount = 0;
    this.eventsOut = new GameEventPublisher(
      this.registry.events,
      'adventure-local-1',
      () => this.simulationTimeMs,
    );
    this.eventsOut.emit('adventure:started', {
      seed: this.seed || 'local-adventure',
      adventureId: 'adventure-local-1',
    });
    this.eventsOut.emit('stage:loading', {
      stageId: this.stageId,
      stageIndex: 0,
      completedLoops: 0,
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
    this.eventsOut.emit('stage:started', {
      stageId: this.stageId,
      stageIndex: 0,
      completedLoops: 0,
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
    const event = this.cemetery.forceBoss(this.simulationTimeMs);
    if (event) this.handleCemeteryEvent(event);
  }

  damageBossForTest(amount: number): void {
    for (const event of this.cemetery.damageBoss(amount)) this.handleCemeteryEvent(event);
    this.syncBossSnapshot();
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
    this.xpGemSprites.set(
      entityId,
      this.add
        .image(x, y, 'pickup-xp-gem')
        .setDepth(2)
        .setScale(value >= 8 ? 1.4 : 1),
    );
    this.eventsOut.emit('xp:spawned', { entityId, value, x, y });
    return entityId;
  }

  collectXpGem(entityId: string): void {
    const gem = this.xpGems.get(entityId);
    if (!gem) throw new Error(`Unknown or collected XP gem ${entityId}`);
    this.xpGems.delete(entityId);
    this.xpGemSprites.get(entityId)?.destroy();
    this.xpGemSprites.delete(entityId);
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
      enemyCountsById: this.cemetery.countsById(),
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
    if (
      this.paused ||
      this.model.dead ||
      this.upgradeFlow.modalActive ||
      !['playing', 'boss-fight'].includes(this.upgradeFlow.baseState)
    )
      return false;
    return this.applyDamage(amount, sourceId);
  }

  damagePlayerFromBoss(amount: number, bossId: string): boolean {
    if (
      this.paused ||
      this.model.dead ||
      this.upgradeFlow.modalActive ||
      this.upgradeFlow.baseState !== 'boss-fight'
    )
      return false;
    if (!this.bossSafety.canDamagePlayer(this.simulationTimeMs)) return false;
    return this.applyDamage(amount, `boss:${bossId}`);
  }

  private applyDamage(amount: number, sourceId: string): boolean {
    const result = this.model.damage(amount, this.simulationTimeMs);
    if (!result.applied) return false;
    this.damageTaken += result.amount;
    const progression = this.progression.snapshot();
    publishPlayerDamage(this.eventsOut, result, this.model.health, this.model.maxHealth, sourceId, {
      score: this.score.score,
      level: progression.level,
      completedLoops: 0,
      survivalTimeMs: this.simulationTimeMs,
      killsByEnemyId: Object.fromEntries(this.killsByEnemyId),
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
    this.cameras.main.setBackgroundColor('#0b1113');
    const grid = this.add.graphics();
    grid.fillStyle(0x18251f, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    grid.fillStyle(0x24342a, 1).fillCircle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 105);
    grid.lineStyle(8, 0x6a6f65, 1).strokeRect(4, 4, WORLD_WIDTH - 8, WORLD_HEIGHT - 8);
    grid.lineStyle(1, 0x33463a, 0.42);
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
        .setData({
          damage: stats.damage,
          penetration: stats.penetration ?? 0,
          hitIds: new Set<string>(),
        });
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
    mount.dataset.secondaryHitCount = String(this.secondaryHitCount);
    mount.dataset.guardianContactHitCount = String(this.guardianContactHitCount);
    mount.dataset.penetrationUsedCount = String(this.penetrationUsedCount);
    for (const key of [
      'soul-blade:enemy',
      'soul-blade:boss',
      'death-aura:enemy',
      'death-aura:boss',
    ]) {
      mount.dataset[
        `hits${key.replace(/(^|-|:)([a-z])/g, (_, _separator, letter: string) => letter.toUpperCase())}`
      ] = String(this.secondaryHits.get(key) ?? 0);
    }
    mount.dataset.activeProjectileCount = String(this.projectileBudget.activeCount);
    mount.dataset.stageId = this.stageId;
    mount.dataset.stageTimeMs = this.simulationTimeMs.toFixed(0);
    mount.dataset.enemyCount = String(this.cemetery.activeEnemies.length);
    mount.dataset.xpGemCount = String(this.xpGems.size);
    mount.dataset.healPickupCount = String(this.healPickups.size);
    mount.dataset.bossPhase = String(this.cemetery.boss?.phase ?? 0);
    mount.dataset.stageCompleted = String(this.stageCompleted);
    mount.dataset.musicCue = this.cemetery.boss?.health
      ? GUARDIAN_CONFIG.musicKey
      : CEMETERY_STAGE.musicKey;
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
    const offerSource = offer.source;
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
    if (['playing', 'boss-fight'].includes(this.upgradeFlow.baseState)) this.syncSecondaryWeapons();
    const nextOffer = this.progression.offerNextQueuedLevel();
    this.upgradeFlow.finishOffer(nextOffer !== null);
    if (nextOffer) this.publishOffer(nextOffer);
    else if (offerSource === 'boss') this.handoffToNextStage();
    else if (this.upgradeFlow.baseState === 'boss-cleanup') this.showStageSummaryAndBossUpgrade();
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
    this.updateStageDirector();
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
    this.updateEnemies(delta);
    this.updateGuardian(delta);
    this.resolveProjectileHits();
    if (this.simulationSuspended()) {
      this.reflectState();
      return;
    }
    this.collectNearbyXpGems();
    this.collectNearbyHealing();
    this.updateAnimation();
    this.updateSecondaryWeapons(delta);
    for (const projectileId of this.projectileBudget.releaseExpired(this.simulationTimeMs)) {
      this.arrows.get(projectileId)?.destroy();
      this.arrows.delete(projectileId);
    }
    this.fireWhenReady();
    this.reflectState();
  }

  private updateStageDirector(): void {
    if (this.stageCompleted || !['playing', 'boss-fight'].includes(this.upgradeFlow.baseState))
      return;
    const camera = this.cameras.main.worldView;
    for (const event of this.cemetery.drainThrough(this.simulationTimeMs, this.player, {
      x: camera.x,
      y: camera.y,
      width: camera.width,
      height: camera.height,
    })) {
      this.handleCemeteryEvent(event);
    }
    const second = Math.floor(this.simulationTimeMs / 1000);
    if (second !== this.lastTimerSecond) {
      this.lastTimerSecond = second;
      this.eventsOut.emit('stage:timer-changed', {
        remainingMs: Math.max(0, CEMETERY_STAGE.durationMs - this.simulationTimeMs),
      });
    }
    const pressureStep = CEMETERY_STAGE.pressureSchedule.reduce(
      (result, step, index) => (step.atMs <= this.simulationTimeMs ? index : result),
      0,
    );
    if (pressureStep !== this.lastPressureStep) {
      this.lastPressureStep = pressureStep;
      this.eventsOut.emit('stage:pressure-changed', { step: pressureStep });
    }
  }

  private handleCemeteryEvent(event: CemeteryDirectorEvent): void {
    switch (event.kind) {
      case 'enemy-spawned':
        this.spawnEnemySprite(event.enemy);
        this.eventsOut.emit('enemy:spawned', {
          entityId: event.enemy.entityId,
          enemyId: event.enemy.enemyId,
          elite: event.enemy.elite,
          x: event.enemy.x,
          y: event.enemy.y,
        });
        break;
      case 'enemy-defeated':
        this.defeatEnemy(event.enemy);
        break;
      case 'boss-spawned':
        this.spawnGuardian();
        break;
      case 'boss-phase':
        this.guardian?.setTint(0xd9a3ff);
        this.eventsOut.emit('boss:phase-changed', {
          bossId: GUARDIAN_CONFIG.id,
          phase: 2,
        });
        break;
      case 'boss-defeated':
        this.completeCemetery();
        break;
    }
  }

  private spawnEnemySprite(enemy: CemeteryEnemyState): void {
    const assetKey = enemy.enemyId === 'bat' ? 'enemy-bat' : 'enemy-zombie';
    const sprite = this.physics.add
      .sprite(enemy.x, enemy.y, assetKey, 0)
      .setDepth(2)
      .setScale(enemy.elite ? 1.4 : 1)
      .setTint(enemy.elite ? 0xf6d365 : 0xffffff)
      .setData({ entityId: enemy.entityId, cycleStartedAt: enemy.spawnedAtMs });
    sprite.setCollideWorldBounds(true);
    this.enemySprites.set(enemy.entityId, sprite);
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.cemetery.activeEnemies) {
      const sprite = this.enemySprites.get(enemy.entityId);
      if (!sprite) continue;
      let speed = enemy.moveSpeed;
      if (enemy.enemyId === 'bat') {
        const config = GAME_CONFIG.enemies.find((candidate) => candidate.id === 'bat');
        if (config?.behavior === 'dash') {
          const cycle = config.params.windupMs + config.params.dashMs + config.params.recoveryMs;
          const elapsed = (this.simulationTimeMs - enemy.spawnedAtMs) % cycle;
          speed =
            elapsed < config.params.windupMs
              ? 0
              : elapsed < config.params.windupMs + config.params.dashMs
                ? config.params.dashSpeed
                : config.moveSpeed * 0.45;
          sprite.setAlpha(elapsed < config.params.windupMs ? 0.65 : 1);
        }
      }
      const distance = Phaser.Math.Distance.Between(
        sprite.x,
        sprite.y,
        this.player.x,
        this.player.y,
      );
      if (distance > 0.001) {
        const step = Math.min(distance, speed * (delta / 1000));
        sprite.setPosition(
          sprite.x + ((this.player.x - sprite.x) / distance) * step,
          sprite.y + ((this.player.y - sprite.y) / distance) * step,
        );
        sprite.setFlipX(this.player.x < sprite.x);
      }
      if (
        distance <= enemy.radius + 8 &&
        (this.enemyContactAt.get(enemy.entityId) ?? 0) <= this.simulationTimeMs
      ) {
        this.enemyContactAt.set(enemy.entityId, this.simulationTimeMs + 500);
        this.damagePlayer(enemy.damage, enemy.entityId);
      }
    }
  }

  private resolveProjectileHits(): void {
    for (const [projectileId, arrow] of [...this.arrows]) {
      let hitIds = (arrow.getData('hitIds') as Set<string> | undefined) ?? new Set<string>();
      let remainingPenetration = Number(arrow.getData('penetration')) || 0;
      let shouldRelease = false;
      for (const enemy of this.cemetery.activeEnemies) {
        const sprite = this.enemySprites.get(enemy.entityId);
        if (
          hitIds.has(enemy.entityId) ||
          !sprite ||
          Phaser.Math.Distance.Between(arrow.x, arrow.y, sprite.x, sprite.y) > enemy.radius + 8
        )
          continue;
        const damage = Number(arrow.getData('damage')) || 0;
        for (const event of this.cemetery.damageEnemy(enemy.entityId, damage))
          this.handleCemeteryEvent(event);
        const penetration = consumePenetratingHit({ hitIds, remainingPenetration }, enemy.entityId);
        if (penetration.remainingPenetration < remainingPenetration) this.penetrationUsedCount += 1;
        hitIds = new Set(penetration.hitIds);
        remainingPenetration = penetration.remainingPenetration;
        shouldRelease = penetration.release;
        if (shouldRelease) break;
      }
      const bossHitId = `boss:${GUARDIAN_CONFIG.id}`;
      if (!shouldRelease && !hitIds.has(bossHitId) && this.guardian && this.cemetery.boss?.health) {
        if (
          Phaser.Math.Distance.Between(arrow.x, arrow.y, this.guardian.x, this.guardian.y) <=
          GUARDIAN_CONFIG.radius + 9
        ) {
          const damage = Number(arrow.getData('damage')) || 0;
          for (const event of this.cemetery.damageBoss(damage)) this.handleCemeteryEvent(event);
          this.syncBossSnapshot();
          if (this.stageCompleted) return;
          const penetration = consumePenetratingHit({ hitIds, remainingPenetration }, bossHitId);
          if (penetration.remainingPenetration < remainingPenetration)
            this.penetrationUsedCount += 1;
          hitIds = new Set(penetration.hitIds);
          remainingPenetration = penetration.remainingPenetration;
          shouldRelease = penetration.release;
        }
      }
      arrow.setData('hitIds', hitIds).setData('penetration', remainingPenetration);
      if (shouldRelease) {
        arrow.destroy();
        this.arrows.delete(projectileId);
        this.projectileBudget.release(projectileId);
      }
    }
  }

  private defeatEnemy(enemy: CemeteryEnemyState): void {
    const sprite = this.enemySprites.get(enemy.entityId);
    const x = sprite?.x ?? enemy.x;
    const y = sprite?.y ?? enemy.y;
    sprite?.destroy();
    this.enemySprites.delete(enemy.entityId);
    this.enemyContactAt.delete(enemy.entityId);
    this.kills += 1;
    this.killsByEnemyId.set(enemy.enemyId, (this.killsByEnemyId.get(enemy.enemyId) ?? 0) + 1);
    this.awardEnemyDefeat(enemy.entityId, enemy.enemyId, enemy.elite, x, y);
    if (this.lootRandom.next() < GAME_CONFIG.progression.healDropChance) this.spawnHealing(x, y);
  }

  private spawnHealing(x: number, y: number): void {
    const id = `heal:${++this.healPickupId}`;
    this.healPickups.set(id, this.add.image(x, y, 'pickup-heal').setDepth(2));
  }

  private collectNearbyHealing(): void {
    for (const [id, pickup] of [...this.healPickups]) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y) > 18)
        continue;
      this.healPlayer();
      pickup.destroy();
      this.healPickups.delete(id);
    }
  }

  private spawnGuardian(): void {
    this.upgradeFlow.enterBaseState('boss-fight');
    const spawnX = Phaser.Math.Clamp(this.player.x, 96, WORLD_WIDTH - 96);
    const spawnY = Phaser.Math.Clamp(this.player.y - 170, 72, WORLD_HEIGHT - 72);
    this.guardian = this.physics.add
      .sprite(spawnX, spawnY, 'boss-graveyard-guardian', 0)
      .setDepth(3)
      .setScale(1.35)
      .setTint(0xc8d4b8);
    this.guardian.setCollideWorldBounds(true);
    const safeUntilMs = this.bossSafety.begin(this.simulationTimeMs, GUARDIAN_CONFIG.safeEntryMs);
    this.eventsOut.emit('boss:spawned', { bossId: GUARDIAN_CONFIG.id, safeUntilMs });
    this.guardianAttackIndex = 0;
    this.startGuardianAttack(GUARDIAN_CONFIG.attacks[0] as BossAttack);
    this.syncBossSnapshot();
    this.syncPhysicsPause();
  }

  private startGuardianAttack(attack: BossAttack): void {
    const phase = this.cemetery.boss?.phase ?? 1;
    this.guardianTimeline = new BossAttackTimeline(
      attack,
      this.simulationTimeMs,
      bossAttackCooldown(GUARDIAN_CONFIG, attack, phase),
    );
    this.guardianPreviousAttackMs = this.simulationTimeMs;
    this.guardianTarget = { x: this.player.x, y: this.player.y };
    this.telegraph?.destroy();
    if (!this.guardian) return;
    if (attack.kind === 'line') {
      const angle = Phaser.Math.Angle.Between(
        this.guardian.x,
        this.guardian.y,
        this.guardianTarget.x,
        this.guardianTarget.y,
      );
      this.telegraph = this.add
        .image(this.guardian.x, this.guardian.y, 'vfx-telegraph-line')
        .setOrigin(0, 0.5)
        .setRotation(angle)
        .setDisplaySize(attack.length, attack.width)
        .setDepth(1)
        .setAlpha(0.75);
    } else {
      const radius =
        attack.kind === 'slam' ? attack.radius : attack.kind === 'summon' ? attack.spawnRadius : 48;
      const center = attack.kind === 'summon' ? this.guardian : this.guardianTarget;
      this.telegraph = this.add
        .image(center.x, center.y, 'vfx-telegraph-circle')
        .setDisplaySize(radius * 2, radius * 2)
        .setDepth(1)
        .setAlpha(0.7);
    }
  }

  private updateGuardian(delta: number): void {
    const boss = this.cemetery.boss;
    if (!this.guardian || !boss || boss.health <= 0 || !this.guardianTimeline) return;
    const timeline = this.guardianTimeline;
    const state = timeline.stateAt(this.simulationTimeMs);
    if (state === 'telegraph')
      this.telegraph?.setAlpha(0.45 + Math.sin(this.simulationTimeMs / 70) * 0.2);
    else this.telegraph?.setAlpha(state === 'active' ? 0.95 : 0.2);

    const distance = Phaser.Math.Distance.Between(
      this.guardian.x,
      this.guardian.y,
      this.player.x,
      this.player.y,
    );
    if (state !== 'telegraph' && distance > GUARDIAN_CONFIG.radius + 7) {
      const step = Math.min(distance, GUARDIAN_CONFIG.moveSpeed * (delta / 1000));
      this.guardian.setPosition(
        this.guardian.x + ((this.player.x - this.guardian.x) / distance) * step,
        this.guardian.y + ((this.player.y - this.guardian.y) / distance) * step,
      );
    }
    const contactDistance = Phaser.Math.Distance.Between(
      this.guardian.x,
      this.guardian.y,
      this.player.x,
      this.player.y,
    );
    if (
      contactDistance <= GUARDIAN_CONFIG.radius + 8 &&
      this.simulationTimeMs >= this.guardianContactAt
    ) {
      if (this.damagePlayerFromBoss(GUARDIAN_CONFIG.contactDamage, GUARDIAN_CONFIG.id)) {
        this.guardianContactHitCount += 1;
        this.guardianContactAt = this.simulationTimeMs + GAME_CONFIG.player.contactDamageCooldownMs;
      }
    }
    for (const moment of timeline.damageMomentsBetween(
      this.guardianPreviousAttackMs,
      this.simulationTimeMs,
    )) {
      if (this.bossDamageMoments.has(moment)) continue;
      this.bossDamageMoments.add(moment);
      if (this.guardianAttackHitsPlayer(timeline.attack)) {
        this.damagePlayerFromBoss(timeline.attack.damage, GUARDIAN_CONFIG.id);
      }
    }
    if (timeline.attack.kind === 'summon') {
      const activeAt = timeline.telegraphStartedAtMs + timeline.attack.telegraphMs;
      if (this.guardianPreviousAttackMs < activeAt && this.simulationTimeMs >= activeAt) {
        for (const event of this.cemetery.summon(
          timeline.attack.enemyId,
          timeline.attack.count,
          this.guardian,
          timeline.attack.spawnRadius,
          this.simulationTimeMs,
        ))
          this.handleCemeteryEvent(event);
      }
    }
    this.guardianPreviousAttackMs = this.simulationTimeMs;
    if (state === 'complete') {
      this.guardianAttackIndex = (this.guardianAttackIndex + 1) % GUARDIAN_CONFIG.attacks.length;
      this.startGuardianAttack(GUARDIAN_CONFIG.attacks[this.guardianAttackIndex] as BossAttack);
    }
  }

  private guardianAttackHitsPlayer(attack: BossAttack): boolean {
    if (!this.guardian) return false;
    if (attack.kind === 'slam') {
      return circleContains(this.guardianTarget, this.player, attack.radius);
    }
    if (attack.kind === 'line') {
      const angle = Phaser.Math.Angle.Between(
        this.guardian.x,
        this.guardian.y,
        this.guardianTarget.x,
        this.guardianTarget.y,
      );
      const along =
        (this.player.x - this.guardian.x) * Math.cos(angle) +
        (this.player.y - this.guardian.y) * Math.sin(angle);
      const across = Math.abs(
        -(this.player.x - this.guardian.x) * Math.sin(angle) +
          (this.player.y - this.guardian.y) * Math.cos(angle),
      );
      return along >= 0 && along <= attack.length && across <= attack.width / 2 + 7;
    }
    return false;
  }

  private syncBossSnapshot(): void {
    const boss = this.cemetery.boss;
    this.boss = boss ? { id: boss.id, health: boss.health, phase: boss.phase } : null;
  }

  private completeCemetery(): void {
    if (this.stageCompleted) return;
    this.stageCompleted = true;
    this.syncBossSnapshot();
    this.beginBossCleanup();
    this.awardBossDefeat(GUARDIAN_CONFIG.id);
    for (const entityId of [...this.xpGems.keys()].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    )) {
      this.collectXpGem(entityId);
    }
    this.clearBattlefield();
    const next = this.progression.offerNextQueuedLevel();
    if (next) {
      this.upgradeFlow.openLevelUp();
      this.publishOffer(next);
    } else this.showStageSummaryAndBossUpgrade();
    this.syncPhysicsPause();
    this.reflectState();
  }

  private clearBattlefield(): void {
    this.telegraph?.destroy();
    this.telegraph = null;
    this.guardian?.destroy();
    this.guardian = null;
    this.guardianTimeline = null;
    for (const enemy of this.cemetery.clearEnemies()) {
      this.enemySprites.get(enemy.entityId)?.destroy();
    }
    this.enemySprites.clear();
    this.enemyContactAt.clear();
    for (const arrow of this.arrows.values()) arrow.destroy();
    this.arrows.clear();
    this.projectileBudget.clear();
    for (const pickup of this.healPickups.values()) pickup.destroy();
    this.healPickups.clear();
    this.soulBlades.splice(0).forEach((blade) => blade.destroy());
    this.bladeContacts.clear();
    this.tweens.killTweensOf(this.deathAura);
    this.deathAura.setVisible(false);
    this.bossDamageMoments.clear();
  }

  private showStageSummaryAndBossUpgrade(): void {
    this.upgradeFlow.enterBaseState('stage-summary');
    this.eventsOut.emit('stage:completed', {
      stageId: CEMETERY_STAGE.id,
      elapsedMs: this.simulationTimeMs,
      kills: this.kills,
      damageTaken: this.damageTaken,
      scoreEarned: this.score.score,
    });
    this.healPlayer(this.model.maxHealth * GAME_CONFIG.player.postBossHealRatio);
    const offer = this.progression.offerBossUpgrade();
    this.upgradeFlow.openBossUpgrade();
    this.publishOffer(offer);
  }

  private handoffToNextStage(): void {
    this.upgradeFlow.enterBaseState('loading-stage');
    this.stageId = 'dungeon';
    this.eventsOut.emit('stage:loading', { stageId: 'dungeon', stageIndex: 1, completedLoops: 0 });
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
      simulationSuspended: !['playing', 'boss-fight'].includes(this.upgradeFlow.baseState),
      playerDead: this.model.dead,
    });
  }

  private simulationSuspended(): boolean {
    return (
      this.paused ||
      this.model.dead ||
      this.upgradeFlow.modalActive ||
      !['playing', 'boss-fight'].includes(this.upgradeFlow.baseState)
    );
  }

  private syncSecondaryWeapons(): void {
    this.bladeContacts.clear();
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
        this.resolveSoulBladeHits(index, blade, stats.damage);
      });
    }
    if (this.stageCompleted) return;
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
    this.damageTargetsInRadius(this.player.x, this.player.y, radius, stats.damage);
  }

  private resolveSoulBladeHits(
    bladeIndex: number,
    blade: Phaser.GameObjects.Image,
    damage: number,
  ): void {
    const previous = this.bladeContacts.get(bladeIndex) ?? new Set<string>();
    const current = new Set<string>();
    for (const enemy of this.cemetery.activeEnemies) {
      const sprite = this.enemySprites.get(enemy.entityId);
      if (
        !sprite ||
        Phaser.Math.Distance.Between(blade.x, blade.y, sprite.x, sprite.y) > enemy.radius + 6
      )
        continue;
      current.add(enemy.entityId);
      if (!previous.has(enemy.entityId))
        this.damageEnemyWithSecondary(enemy.entityId, damage, 'soul-blade');
    }
    const bossId = `boss:${GUARDIAN_CONFIG.id}`;
    if (
      this.guardian &&
      this.cemetery.boss?.health &&
      Phaser.Math.Distance.Between(blade.x, blade.y, this.guardian.x, this.guardian.y) <=
        GUARDIAN_CONFIG.radius + 6
    ) {
      current.add(bossId);
      if (!previous.has(bossId)) this.damageBossWithSecondary(damage, 'soul-blade');
    }
    if (this.stageCompleted) return;
    this.bladeContacts.set(bladeIndex, current);
  }

  private damageTargetsInRadius(x: number, y: number, radius: number, damage: number): void {
    for (const enemy of this.cemetery.activeEnemies) {
      const sprite = this.enemySprites.get(enemy.entityId);
      if (!sprite || Phaser.Math.Distance.Between(x, y, sprite.x, sprite.y) > radius + enemy.radius)
        continue;
      this.damageEnemyWithSecondary(enemy.entityId, damage, 'death-aura');
    }
    if (
      this.guardian &&
      this.cemetery.boss?.health &&
      Phaser.Math.Distance.Between(x, y, this.guardian.x, this.guardian.y) <=
        radius + GUARDIAN_CONFIG.radius
    ) {
      this.damageBossWithSecondary(damage, 'death-aura');
    }
  }

  private damageEnemyWithSecondary(
    entityId: string,
    damage: number,
    weaponId: 'soul-blade' | 'death-aura',
  ): void {
    this.secondaryHitCount += 1;
    const key = `${weaponId}:enemy`;
    this.secondaryHits.set(key, (this.secondaryHits.get(key) ?? 0) + 1);
    for (const event of this.cemetery.damageEnemy(entityId, damage))
      this.handleCemeteryEvent(event);
  }

  private damageBossWithSecondary(damage: number, weaponId: 'soul-blade' | 'death-aura'): void {
    this.secondaryHitCount += 1;
    const key = `${weaponId}:boss`;
    this.secondaryHits.set(key, (this.secondaryHits.get(key) ?? 0) + 1);
    for (const event of this.cemetery.damageBoss(damage)) this.handleCemeteryEvent(event);
    this.syncBossSnapshot();
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
