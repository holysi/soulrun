import { describe, expect, it } from 'vitest';

import { moveCircleAgainstRectangles } from '../../src/game/stages';

const bounds = { x: 0, y: 0, width: 200, height: 120 };
const wall = { x: 100, y: 60, width: 20, height: 80 };

describe('stage collision movement', () => {
  it('stops a moving circle at a wall instead of teleporting through it', () => {
    expect(
      moveCircleAgainstRectangles({ x: 70, y: 60 }, { x: 40, y: 0 }, 8, bounds, [wall]),
    ).toEqual({ x: 82, y: 60 });
  });

  it('slides along a wall and remains inside world bounds', () => {
    expect(
      moveCircleAgainstRectangles({ x: 82, y: 60 }, { x: 10, y: 12 }, 8, bounds, [wall]),
    ).toEqual({ x: 82, y: 72 });
    expect(moveCircleAgainstRectangles({ x: 8, y: 8 }, { x: -20, y: -20 }, 8, bounds, [])).toEqual({
      x: 8,
      y: 8,
    });
  });
});
