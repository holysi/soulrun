import manifest from '../../assets/manifest.json';
import dungeonMapData from '../../assets/maps/map-dungeon.json';
import dungeonMapUrl from '../../assets/maps/map-dungeon.json?url';
import infernoMapData from '../../assets/maps/map-inferno.json';
import infernoMapUrl from '../../assets/maps/map-inferno.json?url';
import playerSoulGuideUrl from '../../assets/images/player-soul-guide.png?url';
import weaponGhostArrowUrl from '../../assets/images/weapon-ghost-arrow.png?url';
import weaponSoulBladeUrl from '../../assets/images/weapon-soul-blade.png?url';
import vfxDeathAuraUrl from '../../assets/images/vfx-death-aura.png?url';
import bossGraveyardGuardianUrl from '../../assets/images/boss-graveyard-guardian.png?url';
import enemyBatUrl from '../../assets/images/enemy-bat.png?url';
import enemyZombieUrl from '../../assets/images/enemy-zombie.png?url';
import enemySkeletonArcherUrl from '../../assets/images/enemy-skeleton-archer.png?url';
import enemySplittingSlimeUrl from '../../assets/images/enemy-splitting-slime.png?url';
import enemySmallSlimeUrl from '../../assets/images/enemy-small-slime.png?url';
import enemySwiftDemonUrl from '../../assets/images/enemy-swift-demon.png?url';
import enemyFlameSkullUrl from '../../assets/images/enemy-flame-skull.png?url';
import pickupHealUrl from '../../assets/images/pickup-heal.png?url';
import pickupXpGemUrl from '../../assets/images/pickup-xp-gem.png?url';
import tilesetCemeteryUrl from '../../assets/images/tileset-cemetery.png?url';
import tilesetDungeonUrl from '../../assets/images/tileset-dungeon.png?url';
import bossSkeletonWardenUrl from '../../assets/images/boss-skeleton-warden.png?url';
import bossFlameDemonUrl from '../../assets/images/boss-flame-demon.png?url';
import vfxHitUrl from '../../assets/images/vfx-hit.png?url';
import vfxTelegraphCircleUrl from '../../assets/images/vfx-telegraph-circle.png?url';
import vfxTelegraphLineUrl from '../../assets/images/vfx-telegraph-line.png?url';
import vfxLavaUrl from '../../assets/images/vfx-lava.png?url';
import tilesetInfernoUrl from '../../assets/images/tileset-inferno.png?url';

const bundledImageUrls: Readonly<Record<string, string>> = {
  'player-soul-guide': playerSoulGuideUrl,
  'weapon-ghost-arrow': weaponGhostArrowUrl,
  'weapon-soul-blade': weaponSoulBladeUrl,
  'vfx-death-aura': vfxDeathAuraUrl,
  'enemy-zombie': enemyZombieUrl,
  'enemy-bat': enemyBatUrl,
  'boss-graveyard-guardian': bossGraveyardGuardianUrl,
  'enemy-skeleton-archer': enemySkeletonArcherUrl,
  'enemy-splitting-slime': enemySplittingSlimeUrl,
  'enemy-small-slime': enemySmallSlimeUrl,
  'enemy-swift-demon': enemySwiftDemonUrl,
  'enemy-flame-skull': enemyFlameSkullUrl,
  'boss-skeleton-warden': bossSkeletonWardenUrl,
  'boss-flame-demon': bossFlameDemonUrl,
  'tileset-cemetery': tilesetCemeteryUrl,
  'tileset-dungeon': tilesetDungeonUrl,
  'tileset-inferno': tilesetInfernoUrl,
  'pickup-xp-gem': pickupXpGemUrl,
  'pickup-heal': pickupHealUrl,
  'vfx-hit': vfxHitUrl,
  'vfx-telegraph-line': vfxTelegraphLineUrl,
  'vfx-telegraph-circle': vfxTelegraphCircleUrl,
  'vfx-lava': vfxLavaUrl,
};

interface CollisionDefinition {
  readonly shape: 'circle' | 'rect';
  readonly offsetX: number;
  readonly offsetY: number;
  readonly radius?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ImageAssetDefinition {
  readonly key: string;
  readonly path: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly collision?: CollisionDefinition;
  readonly animations?: readonly {
    readonly key: string;
    readonly frames: readonly number[];
    readonly frameRate: number;
    readonly repeat: number;
  }[];
}

export interface StageMapObject {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly point?: boolean;
  readonly properties?: readonly {
    readonly name: string;
    readonly type: string;
    readonly value: string | number | boolean;
  }[];
}

export interface StageMapData {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers: readonly {
    readonly name: string;
    readonly type: string;
    readonly data?: readonly number[];
    readonly objects?: readonly StageMapObject[];
  }[];
}

export interface MapAssetDefinition {
  readonly key: string;
  readonly path: string;
  readonly tilesetKey: string;
  readonly data: StageMapData;
}

export function imageAsset(key: string): ImageAssetDefinition {
  const asset = manifest.images.find((candidate) => candidate.key === key);
  if (!asset) throw new Error(`Missing image asset: ${key}`);
  const bundledPath = bundledImageUrls[key];
  if (!bundledPath) throw new Error(`Image asset is not bundled for runtime use: ${key}`);
  return { ...asset, path: bundledPath } as ImageAssetDefinition;
}

const bundledMaps: Readonly<
  Record<string, { readonly path: string; readonly data: StageMapData }>
> = {
  'map-dungeon': { path: dungeonMapUrl, data: dungeonMapData as StageMapData },
  'map-inferno': { path: infernoMapUrl, data: infernoMapData as StageMapData },
};

export function mapAsset(key: string): MapAssetDefinition {
  const asset = manifest.maps.find((candidate) => candidate.key === key);
  if (!asset) throw new Error(`Missing map asset: ${key}`);
  const bundled = bundledMaps[key];
  if (!bundled) throw new Error(`Map asset is not bundled for runtime use: ${key}`);
  return { ...asset, ...bundled } as MapAssetDefinition;
}
