import Phaser from 'phaser';

import { GAME_HEIGHT, SCENE_KEYS } from '../constants';
import { offGameEvent, onGameEvent, type EventEnvelope } from '../events/GameEventBus';

export class OverlayScene extends Phaser.Scene {
  private healthText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private upgradeText!: Phaser.GameObjects.Text;

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
    this.upgradeText = this.add
      .text(240, GAME_HEIGHT / 2, '', {
        align: 'center',
        backgroundColor: '#101426ee',
        color: '#d9d4e7',
        fontFamily: 'monospace',
        fontSize: '11px',
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);

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
    const options = event.payload.optionIds.map((id, index) => `${index + 1}. ${id}`).join('\n');
    this.upgradeText.setText(`${heading}\n\n${options}`).setVisible(true);
  }

  private onUpgradeSelected(): void {
    this.upgradeText.setVisible(false);
  }
}
