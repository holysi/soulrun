export interface RandomSnapshot {
  readonly algorithm: 'mulberry32-v1';
  readonly state: number;
}

export interface RandomSource {
  readonly seed: string;
  next(): number;
  integer(min: number, max: number): number;
  pick<T>(sortedItems: readonly T[]): T;
  shuffle<T>(sortedItems: readonly T[]): T[];
  snapshot(): RandomSnapshot;
  restore(snapshot: RandomSnapshot): void;
}

export function hashSeed(seed: string): number {
  const bytes = new TextEncoder().encode(seed);
  let hash = 0x811c9dc5;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export class Mulberry32Random implements RandomSource {
  readonly seed: string;
  private state: number;

  constructor(seed: string) {
    if (seed.length === 0) {
      throw new Error('Random seed must not be empty');
    }

    this.seed = seed;
    this.state = hashSeed(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new Error('Random integer bounds must be integers with min <= max');
    }

    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(sortedItems: readonly T[]): T {
    if (sortedItems.length === 0) {
      throw new Error('Cannot pick from an empty collection');
    }

    return sortedItems[this.integer(0, sortedItems.length - 1)] as T;
  }

  shuffle<T>(sortedItems: readonly T[]): T[] {
    const result = [...sortedItems];

    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.integer(0, index);
      [result[index], result[other]] = [result[other] as T, result[index] as T];
    }

    return result;
  }

  snapshot(): RandomSnapshot {
    return { algorithm: 'mulberry32-v1', state: this.state };
  }

  restore(snapshot: RandomSnapshot): void {
    if (snapshot.algorithm !== 'mulberry32-v1' || !Number.isInteger(snapshot.state)) {
      throw new Error('Unsupported random snapshot');
    }

    this.state = snapshot.state >>> 0;
  }
}

export function createGameplayStreams(adventureSeed: string): Readonly<{
  spawn: RandomSource;
  upgrade: RandomSource;
  loot: RandomSource;
  boss: RandomSource;
}> {
  return Object.freeze({
    spawn: new Mulberry32Random(`${adventureSeed}:spawn`),
    upgrade: new Mulberry32Random(`${adventureSeed}:upgrade`),
    loot: new Mulberry32Random(`${adventureSeed}:loot`),
    boss: new Mulberry32Random(`${adventureSeed}:boss`),
  });
}
