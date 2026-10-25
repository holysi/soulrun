import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

export interface UpgradeOptionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const UPGRADE_PANEL = Object.freeze({
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT / 2,
  width: 196,
  height: 116,
});

export const UPGRADE_HEADING_Y = GAME_HEIGHT / 2 - 40;

export const UPGRADE_OPTION_BOUNDS: readonly UpgradeOptionBounds[] = Object.freeze(
  [0, 1, 2].map((index) =>
    Object.freeze({
      x: GAME_WIDTH / 2 - 82,
      y: GAME_HEIGHT / 2 - 16 + index * 24,
      width: 164,
      height: 20,
    }),
  ),
);

export function upgradeOptionAt(x: number, y: number): 0 | 1 | 2 | null {
  const index = UPGRADE_OPTION_BOUNDS.findIndex(
    (bounds) =>
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height,
  );
  return index >= 0 ? (index as 0 | 1 | 2) : null;
}
