# Visual and Audio Asset Contract

## Manifest

`assets/manifest.json` is UTF-8 JSON validated against
`docs/spec/asset-manifest.schema.json`. Every image, audio, and map asset entry
has a unique lowercase kebab-case `key`, repository-relative `path`,
discriminating `kind`, and `license: "original"`.
Paths use forward slashes and lowercase kebab-case filenames. PNGs use sRGB,
full alpha, no embedded scaling, and no smoothing. Runtime code refers only to
manifest keys, never raw paths.

Required top-level fields are `schemaVersion: 1`, `palette`, `images`, `audio`,
and `maps`. Palette entries name `id` and ordered `colors` (`#rrggbb`); fixed
IDs are `ui`, `cemetery`, `dungeon`, and `inferno`.

Map entries name `key`, `path`, `kind: 'map'`, `license`, `tilesetKey`, `width`, `height`,
`tileWidth: 16`, `tileHeight: 16`, and `layers`. Each layer entry names `name`,
`kind: 'tile'|'object'`, and `collision`; the required layer names are listed
below. Map dimensions are tile counts and MUST resolve to the world dimensions
in the gameplay configuration.

Image entries add:

```ts
interface ImageAsset {
  key: string; path: string; kind: 'sprite'|'tileset'|'vfx'|'ui';
  license: 'original'; width: number; height: number;
  frameWidth: number; frameHeight: number;
  anchor: { x: number; y: number }; paletteId: string;
  animations?: AnimationDef[];
  collision?: CollisionDef;
}
interface AnimationDef {
  key: string; frames: number[]; frameRate: number;
  repeat: -1|0; direction?: Direction;
}
interface CollisionDef {
  shape: 'circle'|'rect'; offsetX: number; offsetY: number;
  radius?: number; width?: number; height?: number;
}
```

Anchors are normalized frame coordinates; collision dimensions are logical
pixels relative to the anchor. Collision MUST approximate the visible body,
not weapon trails, shadows, horns, or transparent padding. Code uses manifest
collision data unchanged; Art may propose changes through the owning Issue.

## Sprite layout

Directional sheets use rows in this exact order:
`e,se,s,sw,w,nw,n,ne`. Within every row, columns are `idle-0`, `walk-0`,
`walk-1`, `walk-2`, `walk-3`, `hurt-0`, `attack-0`, `attack-1`, and `death-0`
unless the entry declares a smaller allowed animation set. No animation may
reorder frames based on facing. Player art supplies all rows and columns.
Enemies/Bosses MUST supply eight-direction idle/walk/hurt frames; attack/death
may be separate sheets but retain the same row order. Contacts sheets display
labels, frame grid, anchor, collision outline, and 1x/4x previews.

Tilesets use `16x16` tiles on a transparent grid, with tile `0` reserved as
empty. Map JSON uses logical tile coordinates and named layers `ground`,
`obstacles`, `hazards`, `decorations`, and `spawns`; only `obstacles` has solid
collision. `hazards` carries a stable `hazardId`. VFX frames are centered and
never define gameplay hitboxes.

## Required visual keys

- Player: `player-soul-guide`.
- Enemies: `enemy-zombie`, `enemy-bat`, `enemy-skeleton-archer`,
  `enemy-splitting-slime`, `enemy-small-slime`, `enemy-swift-demon`,
  `enemy-flame-skull`.
- Bosses: `boss-graveyard-guardian`, `boss-skeleton-warden`,
  `boss-flame-demon`.
- Weapons/effects: `weapon-ghost-arrow`, `weapon-soul-blade`,
  `vfx-death-aura`, `vfx-hit`, `vfx-telegraph-line`,
  `vfx-telegraph-circle`, `vfx-lava`.
- Pickups/UI: `pickup-xp-gem`, `pickup-heal`, `ui-upgrade-icons`,
  `ui-heart`, `ui-pointer`.
- World: `tileset-cemetery`, `tileset-dungeon`, `tileset-inferno`;
  `map-cemetery`, `map-dungeon`, `map-inferno`.

Art delivery for each key includes the PNG/JSON, manifest entry, and contact
sheet preview. Placeholder assets may implement the same key and dimensions;
replacement MUST NOT require code changes.

## Audio

Audio entries add `key`, `path`, `kind: 'music'|'sfx'`, `license: 'original'`,
`format: 'ogg'|'mp3'`, `loop`, `defaultVolume`, and optional `maxVoices`.
Music loops must have seamless loop points and one track per stage. Required
keys are:

- Music: `music-title`, `music-cemetery`, `music-dungeon`, `music-inferno`,
  `music-boss`, `music-results`.
- SFX: `sfx-ghost-arrow`, `sfx-soul-blade`, `sfx-death-aura`, `sfx-hit-enemy`,
  `sfx-player-hurt`, `sfx-enemy-defeated`, `sfx-xp-pickup`, `sfx-heal-pickup`,
  `sfx-level-up`, `sfx-upgrade-select`, `sfx-boss-enter`, `sfx-boss-defeated`,
  `sfx-stage-complete`, `sfx-pause`, `sfx-ui-confirm`.

SFX must remain intelligible at `maxVoices`; exceeding the limit steals the
oldest voice. Music and SFX route through separate buses governed by storage
settings. Reduced flashes affects only visuals; mute affects both buses.
