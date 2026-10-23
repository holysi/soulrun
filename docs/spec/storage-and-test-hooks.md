# Storage and Deterministic Test Contract

## Local storage

The sole key is `soulrun:v1`. Writes occur on settings changes and adventure
end, never per frame. The complete JSON value is:

```ts
interface StoredDataV1 {
  schemaVersion: 1;
  records: {
    highScore: number;
    bestCompletedLoops: number;
    bestSurvivalTimeMs: number;
  };
  settings: {
    musicVolume: number;       // 0..1, default 0.7
    soundVolume: number;       // 0..1, default 0.8
    muted: boolean;            // default false
    screenShake: boolean;      // default true
    reducedFlashes: boolean;   // default false
  };
}
```

The current adventure, seed, upgrades, and battlefield state MUST NOT be
stored. Data is parsed and validated field-by-field. Missing fields receive
defaults; finite numeric values are clamped; unknown fields are discarded. A
malformed value or unsupported schema is copied once to
`soulrun:invalid:<unix-ms>` when possible, then replaced with defaults without
blocking play. Storage denial/failure falls back to an in-memory store and
emits one diagnostic. Future migrations are pure `vN -> vN+1` functions.

Records update with `max(old, result)` independently. A run with zero points or
loops can still set best survival time. Test setup clears both the primary key
and any `soulrun:invalid:*` keys.

## Deterministic random source

All gameplay randomness is injected through this interface; Phaser/JavaScript
global random APIs MUST NOT determine simulation results.

```ts
interface RandomSource {
  readonly seed: string;
  next(): number;                    // [0, 1)
  integer(min: number, max: number): number; // inclusive
  pick<T>(sortedItems: readonly T[]): T;
  shuffle<T>(sortedItems: readonly T[]): T[];
  snapshot(): { algorithm: 'mulberry32-v1'; state: number };
  restore(snapshot: { algorithm: 'mulberry32-v1'; state: number }): void;
}
```

Seed strings are UTF-8 hashed to an unsigned 32-bit value with FNV-1a, then
advanced with `mulberry32-v1`. An omitted seed is generated once from browser
entropy and displayed in results/debug output. Consumers receive forked streams
derived as `<adventure-seed>:spawn`, `:upgrade`, `:loot`, and `:boss`; adding a
cosmetic random draw MUST NOT alter gameplay streams. Animation, particles,
screen shake, and audio variation use a separate non-authoritative stream.

## Test entry point

Development and test builds expose `window.__SOULRUN_TEST__`; production builds
MUST omit it. `?test=1&seed=<encoded>` enables it before `BootScene`.

```ts
interface SoulrunTestApi {
  version: 1;
  ready(): Promise<void>;
  startAdventure(options: { seed: string; stageId?: StageId }): Promise<void>;
  input(command: 'up'|'down'|'left'|'right'|'pause'|'confirm', pressed: boolean): void;
  aimAt(x: number, y: number): void;
  advance(ms: number): Promise<void>;
  chooseUpgrade(index: 0|1|2): Promise<void>;
  snapshot(): Readonly<TestSnapshot>;
  forceBoss(): Promise<void>;
  damagePlayer(amount: number): void;
  reset(options?: { clearStorage?: boolean }): Promise<void>;
}
```

`TestSnapshot` names `state`, `seed`, `simulationTimeMs`, `stageId`,
`stageTimeMs`, `completedLoops`, `player` (`x`, `y`, `aimDirection`, `health`,
`maxHealth`, `level`, `xp`), `score`, `weaponLevels`, `passiveLevels`,
`masteryLevels`, `enemyCountsById`, `boss` (`id`, `health`, `phase`) or `null`,
`activeUpgradeOffer`, and `eventSequence`. Snapshots contain plain values,
sorted key maps, no Phaser objects, wall-clock time, or display coordinates.

`advance(ms)` steps a fixed `1000/60` clock and resolves only after render/event
queues settle; sub-step remainder is retained for the next call. Test-only
force/damage functions route through production domain
commands, preserving events and invariants. Required reusable fixtures are
`smoke-seed-001`, `upgrade-seed-001`, `boss-seed-001`, and `loop-seed-001`.
QA evidence records browser, viewport, seed, commands, expected/actual result,
and screenshot/trace path.
