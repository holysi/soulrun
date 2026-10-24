import { GAME_CONFIG } from './content';

export const GAME_WIDTH = GAME_CONFIG.world.logicalWidth;
export const GAME_HEIGHT = GAME_CONFIG.world.logicalHeight;
export const GAME_BACKGROUND = '#09070d';
export const HEAL_PICKUP_AMOUNT = 20;

export const SCENE_KEYS = {
  boot: 'BootScene',
  title: 'TitleScene',
  game: 'GameScene',
  overlay: 'OverlayScene',
} as const;
