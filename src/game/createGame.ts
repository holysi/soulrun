import Phaser from 'phaser';

import { GAME_BACKGROUND, GAME_HEIGHT, GAME_WIDTH } from './constants';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { OverlayScene } from './scenes/OverlayScene';
import { TitleScene } from './scenes/TitleScene';

export function createGame(parent: string | HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: GAME_BACKGROUND,
    pixelArt: true,
    roundPixels: true,
    render: {
      antialias: false,
      antialiasGL: false,
      pixelArt: true,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [BootScene, TitleScene, GameScene, OverlayScene],
  });
}
