# Soulrun Pixel-Art Bible

## Visual Direction

`魂夜輪迴` uses compact, high-contrast 16-bit pixel art at a `480×270`
logical resolution. Silhouettes must remain readable against a crowded arena.
Use hard pixel clusters, one-pixel highlights, no gradients, no antialiasing,
and nearest-neighbor scaling at integer multiples. Runtime CSS and Phaser
textures must keep smoothing disabled.

The 引魂者 is identified by a triangular navy cloak, cyan soul-flame face,
bone clasp, short violet scarf, and lantern. Enemies use broader or more
angular silhouettes; Bosses occupy `48×48` frames and must not resemble a
scaled-up normal enemy. Cyan is reserved for soul energy, pickups, aim cues,
and friendly readability. Coral/red communicates damage or healing.

## Fixed Palettes

Colors are ordered darkest to lightest and stored verbatim in
`assets/manifest.json`.

| ID | Purpose | Colors |
| --- | --- | --- |
| `ui` | Hero, weapons, HUD | `#101426 #20284a #46506e #d7d0b4 #50e3e6 #a8ffff #d65a62 #ff9a8f` |
| `cemetery` | Moss, stone, moonlit spirits | `#101426 #252a3a #39483b #56624a #6c7180 #9aa0ad #d7d0b4 #7456a6 #50e3e6 #a8ffff` |
| `dungeon` | Cold masonry, arcane violet | `#0d1020 #22263a #3c4058 #62657a #9693a5 #c9c0b0 #584780 #8e70ba #55c9d3` |
| `inferno` | Ash, ember, molten gold | `#160f1d #332036 #5a2c3c #8c3f3b #cc5b38 #f09a45 #ffd27a #6f3f76 #d8c6d8` |

Do not introduce near-duplicate colors. Palette changes require updating the
manifest and regenerating every affected asset.

## Grid, Direction, and Animation

- World tiles are `16×16`; tile `0` is fully transparent and reserved empty.
- Player and normal-enemy frames are `32×32`; Cemetery Boss frames are `48×48`.
- Direction rows are always `e,se,s,sw,w,nw,n,ne`.
- Player columns are `idle-0`, `walk-0..3`, `hurt-0`, `attack-0..1`, `death-0`.
- Cemetery enemy/Boss columns are `idle-0`, `walk-0..3`, `hurt-0`; later
  attack/death sheets keep the same direction rows.
- Walk loops play at 8 fps and alternate lower-body/wing stride plus body bob.
  Player attacks play at 10 fps with a forward lean and extending soul flare.
  Death plays hurt into a compressed, partially faded collapse at 6 fps. Hit
  VFX plays at 14 fps.

Feet share a baseline. Anchors are normalized per frame and collision excludes
glow, cloak trails, wings, chains, and shadows. Contact sheets show the full
grid plus native and nearest-neighbor `4×` views; cyan crosses mark anchors and
coral outlines mark collision.

## Export and Naming

Runtime images are sRGB RGBA PNGs with binary alpha and lowercase kebab-case
filenames in `assets/images/`. No runtime image embeds `pHYs` scaling metadata.
Code loads manifest keys, never paths. Original ImageGen boards live in
`assets/source/imagegen/`; they are references, not runtime textures.

All work in this delivery is original. No third-party game sprites, tiles,
logos, or traced assets were used.
