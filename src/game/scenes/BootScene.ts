import Phaser from 'phaser';

import { SCENE_KEYS } from '../constants';
import { GAME_CONFIG, validateGameConfig } from '../content';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    validateGameConfig(GAME_CONFIG);
    this.scene.start(SCENE_KEYS.title);
  }
}
