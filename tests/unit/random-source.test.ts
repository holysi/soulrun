import { describe, expect, it } from 'vitest';

import {
  createGameplayStreams,
  hashSeed,
  Mulberry32Random,
} from '../../src/game/random/RandomSource';
import { TEST_SEEDS } from '../fixtures/seeds';

describe('deterministic random source', () => {
  it('hashes UTF-8 seeds and reproduces the same sequence', () => {
    expect(hashSeed('魂夜')).toBe(467_434_178);
    const first = new Mulberry32Random(TEST_SEEDS.smoke);
    const second = new Mulberry32Random(TEST_SEEDS.smoke);
    expect(Array.from({ length: 5 }, () => first.next())).toEqual(
      Array.from({ length: 5 }, () => second.next()),
    );
  });

  it('restores snapshots exactly', () => {
    const random = new Mulberry32Random(TEST_SEEDS.upgrade);
    random.next();
    const snapshot = random.snapshot();
    const expected = [random.next(), random.next(), random.next()];
    random.restore(snapshot);
    expect([random.next(), random.next(), random.next()]).toEqual(expected);
  });

  it('keeps gameplay streams isolated by purpose', () => {
    const streams = createGameplayStreams(TEST_SEEDS.loop);
    const baseline = createGameplayStreams(TEST_SEEDS.loop);
    streams.spawn.next();
    streams.spawn.next();
    expect(streams.upgrade.next()).toBe(baseline.upgrade.next());
    expect(streams.loot.seed).toBe(`${TEST_SEEDS.loop}:loot`);
    expect(streams.boss.seed).toBe(`${TEST_SEEDS.loop}:boss`);
  });

  it('validates collection and integer bounds', () => {
    const random = new Mulberry32Random(TEST_SEEDS.boss);
    expect(() => random.integer(2, 1)).toThrow(/bounds/);
    expect(() => random.pick([])).toThrow(/empty/);
    expect(random.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
