import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../constants';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#09070d');

    this.add
      .text(GAME_WIDTH / 2, 82, '魂夜輪迴', {
        color: '#8ef6e4',
        fontFamily: 'monospace',
        fontSize: '32px',
        fontStyle: 'bold',
        resolution: 1,
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#293241', 0, false, true);

    this.add
      .text(GAME_WIDTH / 2, 130, '穿越三個亡魂領域，直到力量耗盡', {
        color: '#d9d4e7',
        fontFamily: 'monospace',
        fontSize: '11px',
        resolution: 1,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 184, 'WASD／方向鍵移動  ·  滑鼠瞄準', {
        color: '#908aa0',
        fontFamily: 'monospace',
        fontSize: '10px',
        resolution: 1,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 42, 'Enter／Space／點擊開始', {
        color: '#ffcb77',
        fontFamily: 'monospace',
        fontSize: '10px',
        resolution: 1,
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.once('keydown-ENTER', this.startGame, this);
      keyboard.once('keydown-SPACE', this.startGame, this);
    }
    this.input.once('pointerdown', this.startGame, this);
  }

  private startGame(): void {
    this.scene.start(SCENE_KEYS.game);
  }
}
