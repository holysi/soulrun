import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../../src/game/constants';

describe('game foundation', () => {
  it('uses the frozen logical resolution', () => {
    expect({ width: GAME_WIDTH, height: GAME_HEIGHT }).toEqual({ width: 480, height: 270 });
  });

  it('preserves the contracted scene keys', () => {
    expect(Object.values(SCENE_KEYS)).toEqual([
      'BootScene',
      'TitleScene',
      'GameScene',
      'OverlayScene',
    ]);
  });
});
