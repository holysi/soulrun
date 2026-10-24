import { describe, expect, it } from 'vitest';

import { GAME_CONFIG } from '../../src/game/content';
import { ScoreModel, scoreAward } from '../../src/game/progression';

describe('scoring', () => {
  it('scales normal, elite, and Boss rewards by completed loops', () => {
    expect(scoreAward(10, 0, GAME_CONFIG)).toBe(10);
    expect(scoreAward(10, 1, GAME_CONFIG)).toBe(15);
    expect(scoreAward(100, 2, GAME_CONFIG)).toBe(200);
    expect(scoreAward(1000, 3, GAME_CONFIG)).toBe(2500);
  });

  it('rounds half up only at the final integer boundary', () => {
    const config = {
      ...GAME_CONFIG,
      scoring: { loopMultiplierPerCompletion: 0.5 },
    };
    expect(scoreAward(1, 1, config)).toBe(2);
    const score = new ScoreModel(config);
    expect(score.award(1, 1)).toBe(2);
    expect(score.score).toBe(2);
  });

  it('selects exact normal, elite, and Boss rewards from configuration', () => {
    const score = new ScoreModel(GAME_CONFIG);
    expect(score.awardEnemy('zombie', false, 1)).toEqual({ score: 15, xp: 1 });
    expect(score.awardEnemy('zombie', true, 1)).toEqual({ score: 150, xp: 8 });
    expect(score.awardEnemy('small-slime', false, 4)).toEqual({ score: 0, xp: 1 });
    expect(() => score.awardEnemy('small-slime', true, 0)).toThrow(/cannot be awarded/);
    expect(score.awardBoss('graveyard-guardian', 1)).toBe(1500);
    expect(score.score).toBe(1665);
  });
});
