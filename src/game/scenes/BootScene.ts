import Phaser from 'phaser';

import { SCENE_KEYS } from '../constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    this.scene.start(SCENE_KEYS.title);
  }
}
