import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../constants';
import { GAME_CONFIG } from '../content';
import { offGameEvent, onGameEvent, type EventEnvelope } from '../events/GameEventBus';
import { getSoulrunStorage, type SoulrunSettings } from '../storage';
import type { TestSnapshot } from '../testing/types';
import { UPGRADE_HEADING_Y, UPGRADE_OPTION_BOUNDS, UPGRADE_PANEL } from '../ui/upgradeLayout';
import { GameScene } from './GameScene';

const STAGE_NAMES: Readonly<Record<string, string>> = {
  cemetery: '墓園',
  dungeon: '地牢',
  inferno: '煉獄',
};

export class OverlayScene extends Phaser.Scene {
  private healthText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private loopText!: Phaser.GameObjects.Text;
  private modalShade!: Phaser.GameObjects.Rectangle;
  private pausePanel!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private summaryPanel!: Phaser.GameObjects.Rectangle;
  private summaryText!: Phaser.GameObjects.Text;
  private gameOverPanel!: Phaser.GameObjects.Rectangle;
  private gameOverText!: Phaser.GameObjects.Text;
  private upgradePanel!: Phaser.GameObjects.Rectangle;
  private upgradeHeading!: Phaser.GameObjects.Text;
  private readonly upgradeRows: Phaser.GameObjects.Rectangle[] = [];
  private readonly upgradeOptions: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENE_KEYS.overlay);
  }

  create(): void {
    this.upgradeRows.splice(0);
    this.upgradeOptions.splice(0);
    const mount = this.game.canvas.parentElement;
    if (mount) mount.dataset.uiPanel = 'none';
    this.createHud();
    this.createPausePanel();
    this.renderPauseSettings(getSoulrunStorage().snapshot().settings);
    this.createSummaryPanel();
    this.createGameOverPanel();
    this.createUpgradePanel();
    this.bindEvents();
    this.hydrateFromGameScene();
  }

  private createHud(): void {
    this.add.rectangle(GAME_WIDTH / 2, 13, GAME_WIDTH, 26, 0x09070d, 0.82).setDepth(5);
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#d9d4e7',
      fontFamily: 'monospace',
      fontSize: '9px',
    };
    this.healthText = this.add.text(8, 5, '生命 100/100', style).setDepth(6);
    this.xpText = this.add.text(8, 15, '等級 1　靈魂 0', style).setDepth(6);
    this.stageText = this.add
      .text(GAME_WIDTH / 2, 5, '墓園', { ...style, color: '#8ef6e4' })
      .setOrigin(0.5, 0)
      .setDepth(6);
    this.timerText = this.add
      .text(GAME_WIDTH / 2, 15, '03:00', style)
      .setOrigin(0.5, 0)
      .setDepth(6);
    this.scoreText = this.add
      .text(GAME_WIDTH - 8, 5, '分數 0', style)
      .setOrigin(1, 0)
      .setDepth(6);
    this.loopText = this.add
      .text(GAME_WIDTH - 8, 15, '輪迴 0', style)
      .setOrigin(1, 0)
      .setDepth(6);
    this.setHudData({
      health: '100/100',
      xp: '0',
      level: '1',
      timer: '03:00',
      score: '0',
      stage: '墓園',
      loop: '0',
    });
  }

  private hydrateFromGameScene(): void {
    const gameScene = this.scene.get(SCENE_KEYS.game);
    if (!(gameScene instanceof GameScene) || !gameScene.scene.isActive()) return;
    const snapshot = gameScene.snapshotForTest();
    this.applySnapshot(snapshot);
    if (snapshot.activeUpgradeOffer) {
      this.showUpgrade(snapshot.activeUpgradeOffer.source, snapshot.activeUpgradeOffer.optionIds);
    }
  }

  private applySnapshot(snapshot: TestSnapshot): void {
    const stage = STAGE_NAMES[snapshot.stageId] ?? snapshot.stageId;
    const duration = GAME_CONFIG.stages.find(
      (candidate) => candidate.id === snapshot.stageId,
    )!.durationMs;
    const remainingMs = Math.max(0, duration - snapshot.stageTimeMs);
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const timer = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    const health = `${Math.ceil(snapshot.player.health)}/${Math.ceil(snapshot.player.maxHealth)}`;
    this.healthText.setText(`生命 ${health}`);
    this.xpText.setText(`等級 ${snapshot.player.level} / 靈魂 ${snapshot.player.xp}`);
    this.stageText.setText(stage);
    this.timerText.setText(timer);
    this.scoreText.setText(`分數 ${snapshot.score}`);
    this.loopText.setText(`輪迴 ${snapshot.completedLoops}`);
    this.setHudData({
      health,
      xp: String(snapshot.player.xp),
      level: String(snapshot.player.level),
      timer,
      score: String(snapshot.score),
      stage,
      loop: String(snapshot.completedLoops),
    });
  }

  private createPausePanel(): void {
    this.modalShade = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x030205, 0.72)
      .setDepth(20)
      .setVisible(false);
    this.pausePanel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 260, 156, 0x101426, 0.98)
      .setStrokeStyle(1, 0xffcb77)
      .setDepth(21)
      .setVisible(false);
    this.pauseText = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        '暫停\n\nESC　繼續冒險\nM　　靜音切換\n\n設定\n音樂／音效音量・螢幕震動\n減少閃光・全螢幕',
        {
          align: 'center',
          color: '#d9d4e7',
          fontFamily: 'monospace',
          fontSize: '10px',
          lineSpacing: 3,
        },
      )
      .setOrigin(0.5)
      .setDepth(22)
      .setVisible(false);
  }

  private createSummaryPanel(): void {
    this.summaryPanel = this.add
      .rectangle(GAME_WIDTH / 2, 77, 260, 72, 0x101426, 0.97)
      .setStrokeStyle(1, 0x8ef6e4)
      .setDepth(14)
      .setVisible(false);
    this.summaryText = this.add
      .text(GAME_WIDTH / 2, 77, '', {
        align: 'center',
        color: '#d9d4e7',
        fontFamily: 'monospace',
        fontSize: '9px',
        lineSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(15)
      .setVisible(false);
  }

  private createGameOverPanel(): void {
    this.gameOverPanel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 300, 172, 0x101426, 0.99)
      .setStrokeStyle(1, 0xff7b72)
      .setDepth(30)
      .setVisible(false);
    this.gameOverText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        align: 'center',
        color: '#d9d4e7',
        fontFamily: 'monospace',
        fontSize: '11px',
        lineSpacing: 5,
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setVisible(false);
  }

  private createUpgradePanel(): void {
    this.upgradePanel = this.add
      .rectangle(
        UPGRADE_PANEL.x,
        UPGRADE_PANEL.y,
        UPGRADE_PANEL.width,
        UPGRADE_PANEL.height,
        0x101426,
        0.98,
      )
      .setStrokeStyle(1, 0x8ef6e4)
      .setDepth(24)
      .setVisible(false);
    this.upgradeHeading = this.add
      .text(UPGRADE_PANEL.x, UPGRADE_HEADING_Y, '', {
        align: 'center',
        color: '#ffcb77',
        fontFamily: 'monospace',
        fontSize: '13px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setVisible(false);
    UPGRADE_OPTION_BOUNDS.forEach((bounds) => {
      this.upgradeRows.push(
        this.add
          .rectangle(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
            bounds.width,
            bounds.height,
            0x252a3a,
          )
          .setStrokeStyle(1, 0x4f586f)
          .setDepth(25)
          .setVisible(false),
      );
      this.upgradeOptions.push(
        this.add
          .text(bounds.x + 6, bounds.y + bounds.height / 2, '', {
            color: '#d9d4e7',
            fixedWidth: bounds.width - 12,
            fontFamily: 'monospace',
            fontSize: '10px',
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0, 0.5)
          .setDepth(26)
          .setVisible(false),
      );
    });
  }

  private bindEvents(): void {
    onGameEvent(this.registry.events, 'player:health-changed', this.onHealth, this);
    onGameEvent(this.registry.events, 'xp:collected', this.onXpCollected, this);
    onGameEvent(this.registry.events, 'stage:loading', this.onStageLoading, this);
    onGameEvent(this.registry.events, 'stage:started', this.onStageStarted, this);
    onGameEvent(this.registry.events, 'stage:timer-changed', this.onTimer, this);
    onGameEvent(this.registry.events, 'score:changed', this.onScore, this);
    onGameEvent(this.registry.events, 'loop:completed', this.onLoopCompleted, this);
    onGameEvent(this.registry.events, 'stage:completed', this.onStageCompleted, this);
    onGameEvent(this.registry.events, 'adventure:ended', this.onAdventureEnded, this);
    onGameEvent(this.registry.events, 'game:pause-changed', this.onPause, this);
    onGameEvent(this.registry.events, 'upgrade:offered', this.onUpgradeOffered, this);
    onGameEvent(this.registry.events, 'upgrade:selected', this.onUpgradeSelected, this);
    onGameEvent(this.registry.events, 'settings:changed', this.onSettingsChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offGameEvent(this.registry.events, 'player:health-changed', this.onHealth, this);
      offGameEvent(this.registry.events, 'xp:collected', this.onXpCollected, this);
      offGameEvent(this.registry.events, 'stage:loading', this.onStageLoading, this);
      offGameEvent(this.registry.events, 'stage:started', this.onStageStarted, this);
      offGameEvent(this.registry.events, 'stage:timer-changed', this.onTimer, this);
      offGameEvent(this.registry.events, 'score:changed', this.onScore, this);
      offGameEvent(this.registry.events, 'loop:completed', this.onLoopCompleted, this);
      offGameEvent(this.registry.events, 'stage:completed', this.onStageCompleted, this);
      offGameEvent(this.registry.events, 'adventure:ended', this.onAdventureEnded, this);
      offGameEvent(this.registry.events, 'game:pause-changed', this.onPause, this);
      offGameEvent(this.registry.events, 'upgrade:offered', this.onUpgradeOffered, this);
      offGameEvent(this.registry.events, 'upgrade:selected', this.onUpgradeSelected, this);
      offGameEvent(this.registry.events, 'settings:changed', this.onSettingsChanged, this);
    });
  }

  private onHealth(event: EventEnvelope<'player:health-changed'>): void {
    const health = `${Math.ceil(event.payload.current)}/${Math.ceil(event.payload.maximum)}`;
    this.healthText.setText(`生命 ${health}`);
    this.setHudData({ health });
  }

  private onXpCollected(event: EventEnvelope<'xp:collected'>): void {
    this.xpText.setText(`等級 ${event.payload.level} / 靈魂 ${event.payload.totalXp}`);
    this.setHudData({ xp: String(event.payload.totalXp), level: String(event.payload.level) });
  }

  private onStageLoading(event: EventEnvelope<'stage:loading'>): void {
    const stage = STAGE_NAMES[event.payload.stageId] ?? event.payload.stageId;
    this.stageText.setText(`${stage}・載入中`);
    this.loopText.setText(`輪迴 ${event.payload.completedLoops}`);
    this.setHudData({ stage, loop: String(event.payload.completedLoops) });
    this.hideSummary();
  }

  private onStageStarted(event: EventEnvelope<'stage:started'>): void {
    const stage = STAGE_NAMES[event.payload.stageId] ?? event.payload.stageId;
    this.stageText.setText(stage);
    this.loopText.setText(`輪迴 ${event.payload.completedLoops}`);
    this.setHudData({ stage, loop: String(event.payload.completedLoops) });
    this.hideSummary();
  }

  private onTimer(event: EventEnvelope<'stage:timer-changed'>): void {
    const totalSeconds = Math.ceil(event.payload.remainingMs / 1000);
    const timer = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    this.timerText.setText(timer);
    this.setHudData({ timer });
  }

  private onScore(event: EventEnvelope<'score:changed'>): void {
    this.scoreText.setText(`分數 ${event.payload.score}`);
    this.setHudData({ score: String(event.payload.score) });
  }

  private onLoopCompleted(event: EventEnvelope<'loop:completed'>): void {
    this.loopText.setText(`輪迴 ${event.payload.completedLoops}`);
    this.setHudData({ loop: String(event.payload.completedLoops) });
  }

  private onStageCompleted(event: EventEnvelope<'stage:completed'>): void {
    const seconds = Math.floor(event.payload.elapsedMs / 1000);
    this.summaryText
      .setText(
        `${STAGE_NAMES[event.payload.stageId] ?? event.payload.stageId} 完成\n` +
          `時間 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 擊敗 ${event.payload.kills}\n` +
          `本關分數 ${event.payload.scoreEarned} / 承受傷害 ${Math.ceil(event.payload.damageTaken)}`,
      )
      .setVisible(true);
    this.summaryPanel.setVisible(true);
    this.setPanelData('stage-summary');
  }

  private onAdventureEnded(event: EventEnvelope<'adventure:ended'>): void {
    const seconds = Math.floor(event.payload.survivalTimeMs / 1000);
    const seed = this.game.canvas.parentElement?.dataset.resultSeed ?? '';
    this.modalShade.setVisible(true).setDepth(29);
    this.gameOverText
      .setText(
        `冒險結束\n\n分數 ${event.payload.score}\n等級 ${event.payload.level}\n輪迴 ${event.payload.completedLoops}\n` +
          `存活 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}\n種子 ${seed}\n\nEnter／Space／點擊 返回標題`,
      )
      .setVisible(true);
    this.gameOverPanel.setVisible(true);
    this.setPanelData('game-over');
    const mount = this.game.canvas.parentElement;
    if (mount) {
      mount.dataset.resultScore = String(event.payload.score);
      mount.dataset.resultLoops = String(event.payload.completedLoops);
      mount.dataset.resultLevel = String(event.payload.level);
      mount.dataset.resultSurvivalMs = String(event.payload.survivalTimeMs);
    }
  }

  private onPause(event: EventEnvelope<'game:pause-changed'>): void {
    this.modalShade.setVisible(event.payload.paused);
    this.pausePanel.setVisible(event.payload.paused);
    this.pauseText.setVisible(event.payload.paused);
    this.setPanelData(event.payload.paused ? 'pause' : 'none');
  }

  private onSettingsChanged(event: EventEnvelope<'settings:changed'>): void {
    this.renderPauseSettings(event.payload.settings);
  }

  private renderPauseSettings(settings: SoulrunSettings): void {
    this.pauseText?.setText(
      `暫停\n\nESC  繼續冒險 / M  靜音${settings.muted ? '開' : '關'} / F  全螢幕\n\n設定（標題畫面點擊調整）\n音樂 ${Math.round(settings.musicVolume * 100)}% / 音效 ${Math.round(settings.soundVolume * 100)}%\n震動 ${settings.screenShake ? '開' : '關'} / 低閃光 ${settings.reducedFlashes ? '開' : '關'}`,
    );
  }

  private onUpgradeOffered(event: EventEnvelope<'upgrade:offered'>): void {
    this.showUpgrade(event.payload.source, event.payload.optionIds);
  }

  private showUpgrade(source: 'level' | 'boss', optionIds: readonly string[]): void {
    this.modalShade.setVisible(true);
    this.upgradePanel.setVisible(true);
    this.upgradeHeading
      .setText(source === 'boss' ? '關卡獎勵・選擇一項' : '升級選擇・1／2／3')
      .setVisible(true);
    this.upgradeRows.forEach((row) => row.setVisible(true));
    this.upgradeOptions.forEach((text, index) => {
      text.setText(`${index + 1}. ${optionIds[index] ?? ''}`).setVisible(true);
    });
    this.setPanelData('upgrade');
  }

  private onUpgradeSelected(): void {
    this.upgradePanel.setVisible(false);
    this.upgradeHeading.setVisible(false);
    this.upgradeRows.forEach((row) => row.setVisible(false));
    this.upgradeOptions.forEach((text) => text.setVisible(false));
    this.modalShade.setVisible(false);
    this.setPanelData('none');
  }

  private hideSummary(): void {
    this.summaryPanel.setVisible(false);
    this.summaryText.setVisible(false);
    if (this.game.canvas.parentElement?.dataset.uiPanel === 'stage-summary')
      this.setPanelData('none');
  }

  private setPanelData(panel: 'none' | 'pause' | 'upgrade' | 'stage-summary' | 'game-over'): void {
    const mount = this.game.canvas.parentElement;
    if (mount) mount.dataset.uiPanel = panel;
  }

  private setHudData(
    values: Partial<
      Record<'health' | 'xp' | 'level' | 'timer' | 'score' | 'stage' | 'loop', string>
    >,
  ): void {
    const mount = this.game.canvas.parentElement;
    if (!mount) return;
    for (const [key, value] of Object.entries(values))
      mount.dataset[`hud${key[0]!.toUpperCase()}${key.slice(1)}`] = value;
  }
}
