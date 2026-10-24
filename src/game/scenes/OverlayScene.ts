import Phaser from 'phaser';

import { GAME_HEIGHT, SCENE_KEYS } from '../constants';
import { offGameEvent, onGameEvent, type EventEnvelope } from '../events/GameEventBus';

export class OverlayScene extends Phaser.Scene {
  private healthText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;

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

    onGameEvent(this.registry.events, 'player:health-changed', this.onHealth, this);
    onGameEvent(this.registry.events, 'game:pause-changed', this.onPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offGameEvent(this.registry.events, 'player:health-changed', this.onHealth, this);
      offGameEvent(this.registry.events, 'game:pause-changed', this.onPause, this);
    });
  }

  private onHealth(event: EventEnvelope<'player:health-changed'>): void {
    this.healthText.setText(`HP ${event.payload.current} / ${event.payload.maximum}`);
  }

  private onPause(event: EventEnvelope<'game:pause-changed'>): void {
    this.pauseText.setVisible(event.payload.paused);
  }
}
