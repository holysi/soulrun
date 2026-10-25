import manifest from '../../assets/manifest.json';
import playerSoulGuideUrl from '../../assets/images/player-soul-guide.png?url';
import weaponGhostArrowUrl from '../../assets/images/weapon-ghost-arrow.png?url';
import weaponSoulBladeUrl from '../../assets/images/weapon-soul-blade.png?url';
import vfxDeathAuraUrl from '../../assets/images/vfx-death-aura.png?url';
import bossGraveyardGuardianUrl from '../../assets/images/boss-graveyard-guardian.png?url';
import enemyBatUrl from '../../assets/images/enemy-bat.png?url';
import enemyZombieUrl from '../../assets/images/enemy-zombie.png?url';
import pickupHealUrl from '../../assets/images/pickup-heal.png?url';
import pickupXpGemUrl from '../../assets/images/pickup-xp-gem.png?url';
import tilesetCemeteryUrl from '../../assets/images/tileset-cemetery.png?url';
import vfxHitUrl from '../../assets/images/vfx-hit.png?url';
import vfxTelegraphCircleUrl from '../../assets/images/vfx-telegraph-circle.png?url';
import vfxTelegraphLineUrl from '../../assets/images/vfx-telegraph-line.png?url';

const bundledImageUrls: Readonly<Record<string, string>> = {
  'player-soul-guide': playerSoulGuideUrl,
  'weapon-ghost-arrow': weaponGhostArrowUrl,
  'weapon-soul-blade': weaponSoulBladeUrl,
  'vfx-death-aura': vfxDeathAuraUrl,
  'enemy-zombie': enemyZombieUrl,
  'enemy-bat': enemyBatUrl,
  'boss-graveyard-guardian': bossGraveyardGuardianUrl,
  'tileset-cemetery': tilesetCemeteryUrl,
  'pickup-xp-gem': pickupXpGemUrl,
  'pickup-heal': pickupHealUrl,
  'vfx-hit': vfxHitUrl,
  'vfx-telegraph-line': vfxTelegraphLineUrl,
  'vfx-telegraph-circle': vfxTelegraphCircleUrl,
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
}

export function imageAsset(key: string): ImageAssetDefinition {
  const asset = manifest.images.find((candidate) => candidate.key === key);
  if (!asset) throw new Error(`Missing image asset: ${key}`);
  const bundledPath = bundledImageUrls[key];
  if (!bundledPath) throw new Error(`Image asset is not bundled for runtime use: ${key}`);
  return { ...asset, path: bundledPath } as ImageAssetDefinition;
}
