import manifest from '../../assets/manifest.json';
import playerSoulGuideUrl from '../../assets/images/player-soul-guide.png?url';
import weaponGhostArrowUrl from '../../assets/images/weapon-ghost-arrow.png?url';

const bundledImageUrls: Readonly<Record<string, string>> = {
  'player-soul-guide': playerSoulGuideUrl,
  'weapon-ghost-arrow': weaponGhostArrowUrl,
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
