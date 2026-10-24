import { describe, expect, it } from 'vitest';

import { UPGRADE_OPTION_BOUNDS, upgradeOptionAt } from '../../src/game/ui/upgradeLayout';

describe('upgradeOptionAt', () => {
  it('maps each rendered row to its matching option', () => {
    UPGRADE_OPTION_BOUNDS.forEach((bounds, index) => {
      expect(upgradeOptionAt(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)).toBe(
        index,
      );
    });
  });

  it('ignores clicks outside the rendered rows', () => {
    expect(upgradeOptionAt(20, 135)).toBeNull();
    expect(upgradeOptionAt(240, 105)).toBeNull();
  });
});
