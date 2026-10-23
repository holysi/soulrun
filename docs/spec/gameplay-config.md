# Gameplay Configuration Contract

## Root and common fields

The immutable `GameConfig` root owns all balance values. Runtime systems read
it but MUST NOT mutate it. Every referenced ID MUST resolve exactly once.

```ts
interface GameConfig {
  schemaVersion: 1;
  world: WorldConfig;
  player: PlayerConfig;
  stages: StageConfig[];
  enemies: EnemyConfig[];
  bosses: BossConfig[];
  weapons: WeaponConfig[];
  passives: PassiveConfig[];
  mastery: MasteryConfig;
  progression: ProgressionConfig;
  scoring: ScoringConfig;
}
interface WeightedId { id: string; weight: number }
interface Rect { x: number; y: number; width: number; height: number }
```

`world` defaults: `logicalWidth: 480`, `logicalHeight: 270`,
`updateHz: 60`, `mapWidth: 1920`, `mapHeight: 1072`, `maxEnemies: 120`,
`maxProjectiles: 200`, `safeSpawnRadius: 240`, `offscreenSpawnMargin: 32`.
Spawns MUST be inside map bounds, outside the camera plus margin, and outside
the safe radius. The map is exactly `120x67` tiles at `16x16`; partial edge
tiles are forbidden. Damage simulation is never skipped.

## Player and progression

`PlayerConfig` fields are `maxHealth`, `moveSpeed`, `contactDamageCooldownMs`,
`invulnerabilityMs`, `pickupRadius`, `startingWeaponId`, `weaponSlots`, and
`postBossHealRatio`. Defaults are `100`, `90`, `250`, `600`, `28`,
`ghost-arrow`, `3`, and `0.30`. Healing pickups restore `20`, capped at current
maximum health. The player has no dash, shield, or extra life in v1.

`ProgressionConfig` contains `xpByLevel: number[]`, `upgradeChoiceCount`, and
`maxLevelPolicy`. The default is three unique choices and XP thresholds
`[5, 8, 12, 17, 23, 30, 38, 47, 57, 68, 80, 93, 107, 122, 138]`; beyond the
array, the next requirement is `round(previous * 1.12)`. Bosses grant no XP and
instead force one upgrade choice after the transition summary.

Upgrade candidates are unowned weapons with a free compatible slot, owned
non-max weapons, and non-max passives. They are sorted by ID then sampled
without replacement. When fewer than three normal candidates remain, every
remaining normal candidate is included and the unfilled slots are sampled
without replacement from the three mastery IDs. The final three-option offer
is shuffled with the upgrade RNG stream. Thus mastery may first appear while
one or two normal upgrades remain, but never displaces one. Mastery IDs are
unique within an offer even though they are repeatable across offers.

## Weapons, passives, and mastery

Every `WeaponConfig` names `id`, `slot` (`directional|orbiting|area`),
`maxLevel: 5`, `cooldownMs`, `damage`, `assetKey`, `audioKey`, and five
`levels` containing only additive/multiplicative deltas.

```ts
interface WeaponLevelDelta {
  damageAdd?: number; projectileCountAdd?: number; penetrationAdd?: number;
  cooldownMultiplier?: number; bladeCountAdd?: number;
  orbitRadiusAdd?: number; orbitSpeedAddDegPerSec?: number;
  effectRadiusAdd?: number;
}
interface WeaponConfig {
  id: WeaponId; slot: 'directional'|'orbiting'|'area'; maxLevel: 5;
  cooldownMs: number; damage: number; assetKey: string; audioKey: string;
  projectileSpeed?: number; projectileLifetimeMs?: number;
  projectileCount?: number; penetration?: number;
  bladeCount?: number; orbitRadius?: number; orbitSpeedDegPerSec?: number;
  effectRadius?: number; levels: readonly [WeaponLevelDelta,
    WeaponLevelDelta, WeaponLevelDelta, WeaponLevelDelta, WeaponLevelDelta];
}
```

Fields that do not apply to the declared slot MUST be absent. `levels[0]` is
an empty base unlock; indexes 1–4 are the L2–L5 deltas.

| ID | Slot | Level identity |
| --- | --- | --- |
| `ghost-arrow` | directional | L1 base; L2 damage; L3 +1 projectile; L4 +1 penetration; L5 cooldown |
| `soul-blade` | orbiting | L1 base blade; L2 +1 blade; L3 damage; L4 radius/speed; L5 +1 blade |
| `death-aura` | area | L1 base pulse; L2 radius; L3 damage; L4 frequency; L5 radius/damage |

All concrete per-level numeric deltas live in this configuration, not scene
code. Directional attacks use the latest non-zero aim vector; orbiting and area
attacks ignore aim.

Each `PassiveConfig` has `id`, `maxLevel: 5`, and `perLevel`:
`move-speed` `+0.08`, `max-health` `+15` (also heals 15), `weapon-damage`
`+0.10`, `cooldown-reduction` `+0.06` (hard cap `0.30`), and
`pickup-range` `+0.20`. Multipliers apply to base values, not compounding.

`MasteryConfig` defines repeatable IDs `mastery-damage`, `mastery-health`, and
`mastery-pickup`, each with an explicit per-pick delta. It MUST NOT modify move
speed or cooldown. Default deltas are `+0.03` weapon damage, `+5` max health
(and heal 5), and `+0.05` pickup radius.

## Stages, waves, enemies, and Bosses

`StageConfig` fields: `id`, `order`, `mapKey`, `tilesetKey`, `musicKey`,
`bounds`, `playerSpawn`, `obstacleLayer`, `hazardLayer?`, `enemyPool`,
`eliteEnemyPool`, `pressureSchedule`, `capEscalation`, `durationMs`,
`eliteTimesMs`, `bossId`, and `paletteId`. Frozen order is `cemetery`, `dungeon`,
`inferno`; duration is `180000`, and elite times are `[90000, 150000]`.
`enemyPool` and `eliteEnemyPool` are sorted weighted IDs; weights must be finite
and positive.
Only `inferno` declares `hazardLayer: 'hazards'`; its map objects provide
`hazardId`, `damage`, and `tickMs` properties.

Every stage uses this exact pressure schedule; later balance changes replace
the whole ordered table rather than adding an implicit formula:

| `atMs` | `spawnIntervalMs` | `batchSize` |
| ---: | ---: | ---: |
| 0 | 1000 | 1 |
| 30000 | 900 | 1 |
| 60000 | 800 | 1 |
| 90000 | 700 | 2 |
| 120000 | 600 | 2 |
| 150000 | 500 | 3 |

At each simulation tick, all due spawn times are processed in chronological
order. The active row is the greatest `atMs <= stageTimeMs`; the first spawn is
scheduled at that row's `atMs`, and later spawns advance from the previous due
time by `spawnIntervalMs` (never from wall-clock time). On a row boundary, the
next due time is exactly the boundary and the new interval applies thereafter;
an old-row spawn at that same timestamp is replaced, not processed twice.
At `180000`, the Boss spawn is processed before an ordinary spawn due at the
same timestamp; the last pressure row remains active for the Boss fight.

`capEscalation` is `{ healthPerStack: 0.02, damagePerStack: 0.02,
maxStacks: 20 }`. After each scheduled batch, if one or more intended enemies
could not spawn because `maxEnemies` was reached, add exactly one stage-local
stack (not one per skipped entity), capped at 20. Recompute every active
non-Boss enemy's max health and damage from its base, loop multiplier, elite
multiplier, then `1 + perStack * stacks`, rounding half-up. Increase current
health by the positive max-health delta; do not revive defeated entities.
Enemies spawned later inherit the current stack. Boss stats are never affected.
Stacks reset on stage load. A batch partially admitted before the cap consumes
RNG only for admitted enemies; skipped slots consume no spawn/loot RNG. This
rule does not alter the `maxProjectiles` cap: a weapon or enemy attack that
cannot reserve its full projectile pattern is skipped atomically.
The damage multiplier applies to contact and enemy attack damage; already-live
projectiles retain the damage snapshotted when they were created.

Enemy IDs and behaviors are fixed: `zombie` (`chase`), `bat` (`dash`),
`skeleton-archer` (`kite-ranged`), `splitting-slime` (`split`),
`small-slime` (`chase`, never selected for direct spawn), `swift-demon`
(`flank`), and `flame-skull` (`ranged`). `EnemyConfig` names `id`, `behavior`,
`health`, `moveSpeed`, `contactDamage`, `rewards`, `eliteEligible`, `radius`,
`assetKey`, `audioKey`, and behavior-specific `params`. `rewards` is the sole
source for enemy XP and score and has `normal: { xp, score }` plus, only when
`eliteEligible`, `elite: { xp, score }`. An elite applies config-owned health,
damage, and size multipliers; it retains the same enemy ID plus `elite: true`.

`params` is a discriminated object with no extra fields:

| Behavior | Required fields |
| --- | --- |
| `chase` | `turnRateDegPerSec` |
| `dash` | `windupMs`, `dashMs`, `dashSpeed`, `recoveryMs` |
| `kite-ranged` | `preferredDistance`, `retreatDistance`, `attackCooldownMs`, `projectileSpeed`, `projectileLifetimeMs`, `telegraphMs`, `projectileDamage` |
| `split` | `childEnemyId`, `childCount` |
| `flank` | `leadDistance`, `repathMs`, `turnRateDegPerSec` |
| `ranged` | `preferredDistance`, `attackCooldownMs`, `projectileSpeed`, `projectileLifetimeMs`, `telegraphMs`, `projectileDamage` |

Each directly spawned normal enemy has `normal: { xp: 1, score: 10 }` and
`elite: { xp: 8, score: 100 }`; `small-slime` fixes
`normal: { xp: 1, score: 0 }` and `eliteEligible: false`. Every defeated enemy
always creates exactly one XP gem whose value is the selected reward's `xp`;
there is no XP drop roll. `healDropChance` (`0..1`) controls only the separate
20-health pickup and is resolved once with the loot RNG stream. Elite combat
multipliers are `eliteHealthMultiplier`, `eliteDamageMultiplier`, and
`eliteScaleMultiplier` on the root `progression` configuration; rewards are
the exact elite values above and are not multiplied.

Boss IDs are `graveyard-guardian`, `skeleton-warden`, and `flame-demon`.
`BossConfig` names `id`, `stageId`, `health`, `moveSpeed`, `contactDamage`,
`score: 1000`, `radius`, `assetKey`, `musicKey`, `phaseThreshold: 0.5`,
`safeEntryMs: 2000`, and ordered `attacks`. Every attack defines `id`,
`cooldownMs`, `telegraphMs`, `damage`, and geometry/behavior params. Damage MUST
begin only after its telegraph. Phase 2 may shorten cooldowns but never remove
telegraphs.

Boss attack `kind` and required fields are fixed: `summon` uses `enemyId`,
`count`, `spawnRadius`; `line` uses `length`, `width`, `activeMs`; `fan` uses
`projectileCount`, `arcDeg`, `projectileSpeed`, `projectileLifetimeMs`; `slam`
uses `radius`, `activeMs`; `block` uses `width`, `height`, `activeMs`; `ring`
uses `projectileCount`, `projectileSpeed`, `projectileLifetimeMs`; `charge`
uses `distance`, `speed`, `recoveryMs`; and `hazard` uses `radius`, `activeMs`,
`tickMs`. Each Boss config names at least three attacks matching its accepted
identity. `phase2CooldownMultiplier` is required and greater than zero.

## Loop scaling and score

After `inferno` completes, `completedLoops` increments before loading
`cemetery`. For loop index `L = completedLoops`: enemy maximum health is
`base * (1 + 0.35L)`, damage `base * (1 + 0.20L)`, and spawn rate
`base * (1 + 0.15L)`. Move speed uses `min(base * (1 + 0.03L), base * 1.25)`.
The effective interval for each pressure row is
`max(1, roundHalfUp(spawnIntervalMs / (1 + 0.15L)))`; batch size is unchanged.
Rounding is half-up at the final integer boundary.

`ScoringConfig` contains only `loopMultiplierPerCompletion: 0.5`. The base
score comes exclusively from the defeated enemy's selected `rewards` entry or
the Boss's `score`, then is multiplied by
`1 + loopMultiplierPerCompletion * completedLoops` at kill time and rounded
half-up. No other multiplier modifies rewards. Survival time never adds score.
