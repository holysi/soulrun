import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_STORED_DATA,
  SOULRUN_INVALID_PREFIX,
  SOULRUN_STORAGE_KEY,
  SoulrunStorage,
  type StorageLike,
} from '../../src/game/storage';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('SoulrunStorage', () => {
  it('uses defaults without writing when no stored data exists', () => {
    const backing = new MemoryStorage();
    const store = new SoulrunStorage(backing);
    expect(store.snapshot()).toEqual(DEFAULT_STORED_DATA);
    expect(backing.values.size).toBe(0);
  });

  it('validates fields, clamps finite values, and discards unknown fields', () => {
    const backing = new MemoryStorage();
    backing.values.set(
      SOULRUN_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        records: { highScore: 42.9, bestCompletedLoops: -2, extra: 99 },
        settings: {
          musicVolume: 4,
          soundVolume: -0.5,
          muted: 'yes',
          screenShake: false,
          extra: 'discarded',
        },
        adventure: { seed: 'must-not-survive' },
      }),
    );

    expect(new SoulrunStorage(backing).snapshot()).toEqual({
      schemaVersion: 1,
      records: { highScore: 42, bestCompletedLoops: 0, bestSurvivalTimeMs: 0 },
      settings: {
        musicVolume: 1,
        soundVolume: 0,
        muted: false,
        screenShake: false,
        reducedFlashes: false,
      },
    });
  });

  it.each(['{broken', JSON.stringify({ schemaVersion: 2, records: {} })])(
    'quarantines invalid data and replaces it with defaults',
    (raw) => {
      const backing = new MemoryStorage();
      backing.values.set(SOULRUN_STORAGE_KEY, raw);
      const diagnostic = vi.fn();
      const store = new SoulrunStorage(backing, { now: () => 1234.9, onDiagnostic: diagnostic });

      expect(store.snapshot()).toEqual(DEFAULT_STORED_DATA);
      expect(backing.values.get(`${SOULRUN_INVALID_PREFIX}1234`)).toBe(raw);
      expect(JSON.parse(backing.values.get(SOULRUN_STORAGE_KEY)!)).toEqual(DEFAULT_STORED_DATA);
      expect(diagnostic).toHaveBeenCalledOnce();
      expect(diagnostic.mock.calls[0]?.[0]).toMatchObject({ kind: 'invalid-data' });
    },
  );

  it('updates only supplied settings and persists the complete versioned value', () => {
    const backing = new MemoryStorage();
    const store = new SoulrunStorage(backing);
    expect(store.updateSettings({ muted: true, musicVolume: 0.25 })).toMatchObject({
      muted: true,
      musicVolume: 0.25,
      soundVolume: 0.8,
    });
    expect(JSON.parse(backing.values.get(SOULRUN_STORAGE_KEY)!)).toEqual(store.snapshot());
  });

  it('updates record maxima independently, including a survival-only result', () => {
    const backing = new MemoryStorage();
    const store = new SoulrunStorage(backing);
    store.recordAdventure({ score: 100, completedLoops: 3, survivalTimeMs: 1_000 });
    expect(store.recordAdventure({ score: 0, completedLoops: 1, survivalTimeMs: 2_000 })).toEqual({
      highScore: 100,
      bestCompletedLoops: 3,
      bestSurvivalTimeMs: 2_000,
    });
  });

  it('falls back to memory and emits only one diagnostic when storage fails', () => {
    const diagnostic = vi.fn();
    const denied: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const store = new SoulrunStorage(denied, { onDiagnostic: diagnostic });
    store.updateSettings({ reducedFlashes: true });
    store.recordAdventure({ score: 7, completedLoops: 0, survivalTimeMs: 25 });

    expect(store.snapshot()).toMatchObject({
      records: { highScore: 7, bestSurvivalTimeMs: 25 },
      settings: { reducedFlashes: true },
    });
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(diagnostic.mock.calls[0]?.[0]).toMatchObject({ kind: 'storage-unavailable' });
  });

  it('resets the primary value even when invalid-data quarantine is denied', () => {
    const values = new Map([[SOULRUN_STORAGE_KEY, '{broken']]);
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key.startsWith(SOULRUN_INVALID_PREFIX)) throw new Error('quarantine denied');
        values.set(key, value);
      },
    };
    const store = new SoulrunStorage(storage, { onDiagnostic: vi.fn() });

    expect(store.snapshot()).toEqual(DEFAULT_STORED_DATA);
    expect(JSON.parse(values.get(SOULRUN_STORAGE_KEY)!)).toEqual(DEFAULT_STORED_DATA);
  });
});
