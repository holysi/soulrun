import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../constants';
import { getSoulrunStorage, type SoulrunSettings } from '../storage';

const TEXT = {
  primary: '#d9d4e7',
  accent: '#8ef6e4',
  action: '#ffcb77',
} as const;

export class TitleScene extends Phaser.Scene {
  private starting = false;
  private settings!: SoulrunSettings;
  private settingsText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    this.starting = false;
    const stored = getSoulrunStorage().snapshot();
    this.settings = stored.settings;
    this.applySettings();
    this.cameras.main.setBackgroundColor('#09070d');
    const mount = this.game.canvas.parentElement;
    if (mount) {
      mount.dataset.gameState = 'title';
      mount.dataset.uiPanel = 'title';
      delete mount.dataset.resultScore;
      delete mount.dataset.resultLoops;
      delete mount.dataset.resultLevel;
      delete mount.dataset.resultSurvivalMs;
      delete mount.dataset.resultSeed;
      mount.dataset.highScore = String(stored.records.highScore);
      mount.dataset.bestLoops = String(stored.records.bestCompletedLoops);
      mount.dataset.bestSurvivalMs = String(stored.records.bestSurvivalTimeMs);
    }

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 432, 238, 0x101426, 0.92);
    this.add.rectangle(GAME_WIDTH / 2, 61, 398, 76, 0x171c2e, 0.94);
    this.add
      .text(GAME_WIDTH / 2, 44, '魂夜輪迴', {
        color: TEXT.accent,
        fontFamily: 'monospace',
        fontSize: '30px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#293241', 0, false, true);
    this.add
      .text(GAME_WIDTH / 2, 75, '穿越三個亡魂領域，直到力量耗盡', {
        color: TEXT.primary,
        fontFamily: 'monospace',
        fontSize: '10px',
      })
      .setOrigin(0.5);
    this.add
      .text(
        GAME_WIDTH / 2,
        94,
        `最高分 ${stored.records.highScore} / 最佳輪迴 ${stored.records.bestCompletedLoops}`,
        { color: '#908aa0', fontFamily: 'monospace', fontSize: '8px' },
      )
      .setOrigin(0.5);

    this.add
      .text(54, 112, '操作方式', {
        color: TEXT.action,
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.add.text(
      54,
      128,
      [
        'WASD／方向鍵　移動',
        '滑鼠　　　　　瞄準（自動攻擊）',
        '1／2／3 或點擊　選擇升級',
        'ESC　　　　　 暫停／返回',
        'M　　　　　　 靜音切換',
      ].join('\n'),
      { color: TEXT.primary, fontFamily: 'monospace', fontSize: '9px', lineSpacing: 3 },
    );

    this.settingsText = this.add
      .text(GAME_WIDTH / 2, 207, '', {
        align: 'center',
        color: TEXT.action,
        fontFamily: 'monospace',
        fontSize: '8px',
      })
      .setOrigin(0.5);
    this.renderSettings();
    this.addSettingHitArea(55, () =>
      this.updateSettings({ musicVolume: cycleVolume(this.settings.musicVolume) }),
    );
    this.addSettingHitArea(155, () =>
      this.updateSettings({ soundVolume: cycleVolume(this.settings.soundVolume) }),
    );
    this.addSettingHitArea(255, () =>
      this.updateSettings({ screenShake: !this.settings.screenShake }),
    );
    this.addSettingHitArea(355, () =>
      this.updateSettings({ reducedFlashes: !this.settings.reducedFlashes }),
    );
    this.addSettingHitArea(445, () => this.toggleFullscreen());

    this.add
      .text(301, 112, '冒險規則', {
        color: TEXT.action,
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.add.text(
      301,
      128,
      '擊敗每關首領\n選擇獎勵後前往下一關\n通過煉獄即開始更強輪迴\n生命歸零才會結束冒險',
      {
        color: TEXT.primary,
        fontFamily: 'monospace',
        fontSize: '9px',
        lineSpacing: 3,
      },
    );

    const startButton = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 31, 190, 30, 0x315c67, 1)
      .setStrokeStyle(1, 0x8ef6e4)
      .setInteractive({ useHandCursor: true });
    const startLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 31, '開始冒險  Enter／Space', {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    startButton.on('pointerover', () => startButton.setFillStyle(0x477c86));
    startButton.on('pointerout', () => startButton.setFillStyle(0x315c67));
    startButton.on('pointerdown', this.startGame, this);
    startLabel.setInteractive({ useHandCursor: true }).on('pointerdown', this.startGame, this);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.once('keydown-ENTER', this.startGame, this);
      keyboard.once('keydown-SPACE', this.startGame, this);
      keyboard.on('keydown-M', this.toggleMute, this);
      keyboard.on('keydown-F', this.toggleFullscreen, this);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown-M', this.toggleMute, this);
      keyboard?.off('keydown-F', this.toggleFullscreen, this);
    });
  }

  private startGame(): void {
    if (this.starting) return;
    this.starting = true;
    this.scene.start(SCENE_KEYS.game);
  }

  private addSettingHitArea(x: number, action: () => void): void {
    this.add
      .rectangle(x, 207, 90, 20, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', action);
  }

  private toggleMute(): void {
    this.updateSettings({ muted: !this.settings.muted });
  }

  private toggleFullscreen(): void {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  private updateSettings(patch: Partial<SoulrunSettings>): void {
    this.settings = getSoulrunStorage().updateSettings(patch);
    this.applySettings();
    this.renderSettings();
  }

  private applySettings(): void {
    this.sound.mute = this.settings.muted;
    this.sound.volume = this.settings.soundVolume;
    this.registry.set('soulrun:music-volume', this.settings.musicVolume);
    this.registry.set('soulrun:sound-volume', this.settings.soundVolume);
    const mount = this.game.canvas.parentElement;
    if (!mount) return;
    mount.dataset.muted = String(this.settings.muted);
    mount.dataset.musicVolume = String(this.settings.musicVolume);
    mount.dataset.soundVolume = String(this.settings.soundVolume);
    mount.dataset.screenShake = String(this.settings.screenShake);
    mount.dataset.reducedFlashes = String(this.settings.reducedFlashes);
  }

  private renderSettings(): void {
    this.settingsText?.setText(
      `音樂 ${Math.round(this.settings.musicVolume * 100)}% / 音效 ${Math.round(this.settings.soundVolume * 100)}% / 震動 ${this.settings.screenShake ? '開' : '關'} / 低閃光 ${this.settings.reducedFlashes ? '開' : '關'} / F 全螢幕`,
    );
  }
}

function cycleVolume(value: number): number {
  return Math.round(((value + 0.1) % 1.1) * 10) / 10;
}
