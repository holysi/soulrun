import { describe, expect, it } from 'vitest';

import { circleContains, consumePenetratingHit } from '../../src/game/cemetery';

describe('cemetery combat helpers', () => {
  it('consumes penetration only for unique targets and releases after the final allowance', () => {
    const first = consumePenetratingHit(
      { hitIds: new Set<string>(), remainingPenetration: 1 },
      'enemy:1',
    );
    expect(first).toMatchObject({ accepted: true, remainingPenetration: 0, release: false });

    const duplicate = consumePenetratingHit(first, 'enemy:1');
    expect(duplicate).toMatchObject({ accepted: false, remainingPenetration: 0, release: false });

    const second = consumePenetratingHit(duplicate, 'enemy:2');
    expect(second).toMatchObject({ accepted: true, remainingPenetration: 0, release: true });
  });

  it('uses the captured telegraph center for slam geometry', () => {
    const captured = { x: 100, y: 100 };
    expect(circleContains(captured, { x: 150, y: 100 }, 64)).toBe(true);
    expect(circleContains(captured, { x: 165, y: 100 }, 64)).toBe(false);
  });
});
