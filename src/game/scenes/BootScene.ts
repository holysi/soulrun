import Phaser from 'phaser';

import { SCENE_KEYS } from '../constants';
import { CONTENT_CONFIG, validateContentConfig } from '../content';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    validateContentConfig(CONTENT_CONFIG);
    this.scene.start(SCENE_KEYS.title);
  }
}
