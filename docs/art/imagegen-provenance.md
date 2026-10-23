# ImageGen Provenance and Post-processing

## Provenance

The six source boards in `assets/source/imagegen/` were generated on
2026-10-23 with Codex's built-in ImageGen tool in transparent-background mode.
No external images or third-party assets were supplied. The request taxonomy
was `stylized-concept`; each prompt required original designs, hard pixel
clusters, a restricted palette, no text, logos, watermarks, or recognizable
copyrighted designs.

| Source | Production use | Prompt summary |
| --- | --- | --- |
| `soul-guide-imagegen.png` | 引魂者 silhouette and eight facings | Hooded psychopomp; navy cloak, cyan soul flame, bone clasp, violet scarf, lantern; eight directions; 32×32 intent. |
| `cemetery-kit-imagegen.png` | Cemetery tile/object language | Cracked grass, stone paths, graves, fences, shrubs, wisps, ritual stone; isolated top-down pieces; 16×16 intent. |
| `cemetery-enemies-imagegen.png` | Zombie and bat silhouettes | Mossy zombie and angular spectral bat; eight directions each; 32×32 intent. |
| `graveyard-guardian-imagegen.png` | Cemetery Boss silhouette | Grave-marker stone sentinel, chains, moss, cyan soul core; eight directions; 48×48 intent. |
| `effects-pickups-imagegen.png` | Weapons, VFX, pickups, HUD | Ghost arrow, soul blade, aura, hit spark, telegraphs, XP gem, healing vial, heart, pointer. |
| `soul-guide-animation-reference-v2.png` | Review-driven animation reference | Same Soul Guide identity with materially distinct walk stride, cyan soul attack, and collapsed death silhouettes; generated after PR review found translated idle poses. |

The exact production prompts followed the same structure for every board:

```text
Use case: stylized-concept
Asset type: original pixel-art <character/environment/enemy/boss/effects> production reference
Primary request: <the subject and requested directional or frame variants above>
Scene/backdrop: genuinely transparent background; isolated elements with generous padding
Style/medium: crisp hand-authored 16-bit pixel art; hard pixel clusters; no antialiasing
Color palette: the fixed UI or Cemetery colors in the art bible
Constraints: original design only; no text, labels, logos, watermark, crops, or extra subjects
Avoid: painterly rendering, gradients, soft edges, realism, and recognizable copyrighted designs
```

## Deterministic Post-processing

`tools/art/build-vertical-slice.cjs` performs the reproducible export:

1. Crops isolated concepts from the generated source boards; the v2 animation
   board is retained as the visual reference for the review-driven motion
   semantics.
2. Fits them into `16×16`, `32×32`, or `48×48` logical frames.
3. Resamples only with nearest-neighbor filtering.
4. Snaps every opaque pixel to the nearest approved palette color.
5. Converts edge alpha to binary `0/255` transparency.
6. Assembles fixed direction rows and animation columns.
7. Authors deterministic stride/body-bob, soul-flare attack, hit-recoil, and
   collapse/fade states from each original directional pose.
8. Removes PNG physical-density metadata, then writes runtime PNGs,
   `assets/manifest.json`, and labeled contact sheets.

Install repository dependencies, then run the committed scripts:

```powershell
npm ci
npm run art:build
npm run art:validate
```

Generated source boards are retained for auditability. Runtime assets are
smaller, palette-locked derivatives; regenerating from the committed sources
does not call ImageGen again.
