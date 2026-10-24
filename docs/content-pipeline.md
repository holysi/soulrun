# Content Pipeline

`src/game/content/contentConfig.ts` exports the single immutable `GAME_CONFIG`
root. Runtime systems consume its stage, enemy, Boss, progression, and world
sections; they do not embed balance values in scenes.

Call `validateGameConfig` during boot before creating gameplay entities. A
validation error is fatal because it indicates an unresolved ID, invalid
schedule, unsorted weighted pool, or broken Boss/stage relationship.

## Runtime boundaries

- `WaveScheduler` emits every due spawn in chronological order, including
  missed ticks. At 3:00 it emits the Boss before the coincident ordinary batch
  and continues the final pressure step during the fight.
- `planSpawnBatch` applies the enemy cap before consuming spawn RNG. It rejects
  camera-visible, out-of-bounds, and player-safe-radius positions.
- `ObjectPool.reserve(count)` is atomic. Use one enemy pool capped by
  `world.maxEnemies` and separate projectile pools whose combined active count
  is capped by `world.maxProjectiles`; a full attack pattern is skipped when
  the reservation fails.
- `createEnemyBehaviorPlan` translates config into renderer/physics-neutral
  chase, dash, ranged, split, and flank commands.
- `BossAttackTimeline` keeps telegraph time non-damaging for every reusable
  attack kind, including persistent hazards. Phase 2 changes cooldown only.

All random choices accept `RandomSource`; gameplay code must pass the named
`spawn` or `boss` stream rather than `Math.random()`.
