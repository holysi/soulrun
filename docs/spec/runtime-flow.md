# Runtime Flow and Event Contract

## Scenes and state machine

The Phaser scene keys are `BootScene`, `TitleScene`, `GameScene`, and
`OverlayScene`. `BootScene` validates config/manifests and preloads mandatory
assets, then starts `TitleScene`. `GameScene` owns simulation and persists for
one adventure. `OverlayScene` is launched in parallel for HUD and modal UI; it
MUST NOT mutate gameplay objects directly.

Adventure states are:

```text
idle -> loading-stage -> playing -> boss-intro -> boss-fight
                        playing -> level-up -> playing
boss-fight -> level-up -> boss-fight
boss-fight -> boss-cleanup -> level-up -> boss-cleanup
boss-cleanup -> stage-summary -> upgrade-choice -> loading-stage
playing|boss-fight -> paused -> previous state
playing|boss-fight -> adventure-ended -> idle
```

Only player health reaching zero emits `adventure:ended`. A Boss defeat emits
`boss:defeated` and enters `boss-cleanup`. The ordered cleanup sequence is:

1. Stop ordinary spawns and combat damage; award Boss score.
2. Collect every remaining XP gem in ascending runtime entity ID, emitting the
   normal collection/level events and queueing one level-up per crossed level.
3. Clear enemies, projectiles, hazards, healing pickups, and other battlefield
   state. XP gems have already been removed by collection, never by clearing.
4. Resolve queued level-up offers one at a time in FIFO level order.
5. Show the stage summary, then heal 30% maximum health.
6. Present the one forced Boss upgrade, then load the next stage.

During `playing` or `boss-fight`, reaching a level immediately enters
`level-up`, pauses the simulation, resolves one queued offer, and repeats until
the queue is empty before returning to the exact prior state. During
`boss-cleanup`, levels are queued but no modal opens until collection and clear
finish; the return state is `boss-cleanup`, never `boss-fight`. Boss upgrades
do not consume or replace queued level upgrades. Completing `inferno`
increments `completedLoops` after its Boss upgrade and before the next
`stage:loading`. Stage time does not advance during level-up, pause, cleanup,
summary, upgrade choice, or browser blur. Browser blur always requests pause.

## Event envelope

All cross-system events use this envelope and are declared in one typed
`GameEventMap`; arbitrary string emits are forbidden.

```ts
interface EventEnvelope<T> {
  type: keyof GameEventMap;
  adventureId: string;
  sequence: number;       // strictly increasing per adventure
  simulationTimeMs: number;
  payload: T;
}
```

Event names and payload fields are frozen:

| Event | Payload |
| --- | --- |
| `adventure:started` | `seed`, `adventureId` |
| `adventure:ended` | `reason: 'player-defeated'`, `score`, `level`, `completedLoops`, `survivalTimeMs`, `killsByEnemyId` |
| `stage:loading` | `stageId`, `stageIndex`, `completedLoops` |
| `stage:started` | `stageId`, `stageIndex`, `completedLoops` |
| `stage:timer-changed` | `remainingMs` |
| `stage:pressure-changed` | `step` |
| `boss:spawned` | `bossId`, `safeUntilMs` |
| `boss:phase-changed` | `bossId`, `phase: 2` |
| `boss:defeated` | `bossId`, `stageId`, `scoreAwarded` |
| `stage:completed` | `stageId`, `elapsedMs`, `kills`, `damageTaken`, `scoreEarned` |
| `loop:completed` | `completedLoops` |
| `player:aim-changed` | `direction`, `angleDeg` |
| `player:health-changed` | `current`, `maximum`, `delta`, `sourceId` |
| `player:damaged` | `amount`, `sourceId`, `invulnerableUntilMs` |
| `player:died` | `sourceId` |
| `xp:spawned` | `entityId`, `value`, `x`, `y` |
| `xp:collected` | `entityId`, `value`, `totalXp`, `level` |
| `level:reached` | `level`, `overflowXp` |
| `upgrade:offered` | `offerId`, `source: 'level'|'boss'`, `optionIds` |
| `upgrade:selected` | `offerId`, `optionId`, `newLevel` |
| `weapon:fired` | `weaponId`, `attackId`, `origin`, `aim` |
| `enemy:spawned` | `entityId`, `enemyId`, `elite`, `x`, `y` |
| `enemy:defeated` | `entityId`, `enemyId`, `elite`, `scoreAwarded`, `xpGemValue` |
| `score:changed` | `score`, `delta`, `sourceId` |
| `game:pause-changed` | `paused`, `reason: 'user'|'blur'` |
| `settings:changed` | `settings` (the complete v1 settings object) |
| `records:changed` | `records` (the complete v1 records object) |

`direction` is one of `e,se,s,sw,w,nw,n,ne`, selected in clockwise 45-degree
sectors; exact boundary angles choose the clockwise sector. `origin` and `aim`
are `{x, y}` snapshots. IDs referring to runtime entities or offers are unique
within the adventure and generated from monotonic counters, not RNG.

## Input contract

`WASD` and arrow keys produce a normalized movement vector; mouse position in
world coordinates produces aim. Weapons fire automatically. `Digit1`–`Digit3`
or pointer click select upgrades, `Escape` pauses/returns, `KeyM` toggles mute,
and `Enter`/`Space` activates the primary action. Inputs are ignored by
simulation while a modal state is active except for that modal's listed keys.
The game targets desktop Chrome, Edge, and Firefox; touch/gamepad behavior is
out of scope.
