import Phaser from 'phaser';

import { GAME_HEIGHT, SCENE_KEYS } from '../constants';
import { offGameEvent, onGameEvent, type EventEnvelope } from '../events/GameEventBus';
import { UPGRADE_HEADING_Y, UPGRADE_OPTION_BOUNDS, UPGRADE_PANEL } from '../ui/upgradeLayout';

export class OverlayScene extends Phaser.Scene {
  private healthText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private upgradePanel!: Phaser.GameObjects.Rectangle;
  private upgradeHeading!: Phaser.GameObjects.Text;
  private readonly upgradeRows: Phaser.GameObjects.Rectangle[] = [];
  private readonly upgradeOptions: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENE_KEYS.overlay);
  }

  create(): void {
    this.healthText = this.add.text(10, 8, 'HP 100 / 100', {
      color: '#d9d4e7',
      fontFamily: 'monospace',
      fontSize: '10px',
    });
    this.pauseText = this.add
      .text(240, GAME_HEIGHT / 2, '暫停\nESC 繼續', {
        align: 'center',
        color: '#ffcb77',
        fontFamily: 'monospace',
        fontSize: '16px',
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.upgradePanel = this.add
      .rectangle(
        UPGRADE_PANEL.x,
        UPGRADE_PANEL.y,
        UPGRADE_PANEL.width,
        UPGRADE_PANEL.height,
        0x101426,
        0.94,
      )
      .setDepth(9)
      .setVisible(false);
    this.upgradeHeading = this.add
      .text(UPGRADE_PANEL.x, UPGRADE_HEADING_Y, '', {
        align: 'center',
        color: '#d9d4e7',
        fontFamily: 'monospace',
        fontSize: '13px',
      })
      .setOrigin(0.5)
      .setDepth(10)
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
          .setDepth(10)
          .setVisible(false),
      );
      this.upgradeOptions.push(
        this.add
          .text(bounds.x + 6, bounds.y + bounds.height / 2, '', {
            color: '#d9d4e7',
            fixedWidth: bounds.width - 12,
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0, 0.5)
          .setDepth(10)
          .setVisible(false),
      );
    });

    onGameEvent(this.registry.events, 'player:health-changed', this.onHealth, this);
    onGameEvent(this.registry.events, 'game:pause-changed', this.onPause, this);
    onGameEvent(this.registry.events, 'upgrade:offered', this.onUpgradeOffered, this);
    onGameEvent(this.registry.events, 'upgrade:selected', this.onUpgradeSelected, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offGameEvent(this.registry.events, 'player:health-changed', this.onHealth, this);
      offGameEvent(this.registry.events, 'game:pause-changed', this.onPause, this);
      offGameEvent(this.registry.events, 'upgrade:offered', this.onUpgradeOffered, this);
      offGameEvent(this.registry.events, 'upgrade:selected', this.onUpgradeSelected, this);
    });
  }

  private onHealth(event: EventEnvelope<'player:health-changed'>): void {
    this.healthText.setText(`HP ${event.payload.current} / ${event.payload.maximum}`);
  }

  private onPause(event: EventEnvelope<'game:pause-changed'>): void {
    this.pauseText.setVisible(event.payload.paused);
  }

  private onUpgradeOffered(event: EventEnvelope<'upgrade:offered'>): void {
    const heading = event.payload.source === 'boss' ? '關卡獎勵' : '升級選擇';
    this.upgradePanel.setVisible(true);
    this.upgradeHeading.setText(heading).setVisible(true);
    this.upgradeRows.forEach((row) => row.setVisible(true));
    this.upgradeOptions.forEach((text, index) => {
      text.setText(`${index + 1}. ${event.payload.optionIds[index] ?? ''}`).setVisible(true);
    });
  }

  private onUpgradeSelected(): void {
    this.upgradePanel.setVisible(false);
    this.upgradeHeading.setVisible(false);
    this.upgradeRows.forEach((row) => row.setVisible(false));
    this.upgradeOptions.forEach((text) => text.setVisible(false));
  }
}
