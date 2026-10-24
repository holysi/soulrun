export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
export const GAME_BACKGROUND = '#09070d';

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1072;

export const PLAYER_CONFIG = {
  maxHealth: 100,
  moveSpeed: 90,
  invulnerabilityMs: 600,
  healAmount: 20,
} as const;

export const GHOST_ARROW_CONFIG = {
  cooldownMs: 700,
  speed: 260,
  lifetimeMs: 1200,
} as const;

export const SCENE_KEYS = {
  boot: 'BootScene',
  title: 'TitleScene',
  game: 'GameScene',
  overlay: 'OverlayScene',
} as const;
