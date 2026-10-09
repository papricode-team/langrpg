import type * as Phaser from 'phaser';
import type { WorldMapSpec } from './maps';
import { sceneryTextureKey, sceneryVariationKey } from './placed-scenery';

const originalMaps = new Set(['lindenhafen', 'waldruh', 'nebelstadt']);
export const regionPeopleKey = (id: string): string => `${id}-people`;
export const hasRegionPeople = (id: string): boolean => !originalMaps.has(id);

interface RegionAsset { key: string; image: string; atlas?: string; }
/** A region's complete visual budget; shared player and interior art is separate. */
export function regionAssets(map: WorldMapSpec): readonly RegionAsset[] {
  const assets: RegionAsset[] = [
    { key: map.id, image: map.asset },
    { key: sceneryTextureKey(map.id), image: map.sceneryAsset, atlas: map.sceneryAtlas },
  ];
  // Expedition props already include every local house and tree silhouette.
  if (map.variationAsset !== map.sceneryAsset || map.variationAtlas !== map.sceneryAtlas) {
    assets.push({ key: sceneryVariationKey(map.id), image: map.variationAsset, atlas: map.variationAtlas });
  }
  if (hasRegionPeople(map.id)) assets.push({ key: regionPeopleKey(map.id), image: `/assets/${map.id}-people.webp`, atlas: `/assets/${map.id}-people.json` });
  return assets;
}

/** Load one destination at a time, coalescing rapid travel and in-flight requests. */
export class WorldMapAssets {
  private requests = new Map<string, (() => void)[]>();
  constructor(private scene: Phaser.Scene) {}
  load(map: WorldMapSpec, onLoaded?: () => void, start = true): void {
    const pending = this.requests.get(map.id);
    if (pending) { if (onLoaded) pending.push(onLoaded); return; }
    const missing = regionAssets(map).filter(asset => !this.scene.textures.exists(asset.key));
    if (!missing.length) { onLoaded?.(); return; }
    this.requests.set(map.id, onLoaded ? [onLoaded] : []);
    for (const asset of missing) {
      if (asset.atlas) this.scene.load.atlas(asset.key, asset.image, asset.atlas);
      else this.scene.load.image(asset.key, asset.image);
    }
    this.scene.load.once('complete', () => {
      const callbacks = this.requests.get(map.id) ?? [];
      this.requests.delete(map.id);
      for (const callback of callbacks) callback();
    });
    if (start && !this.scene.load.isLoading()) this.scene.load.start();
  }
  /** Wait until a stale destination finishes loading before reclaiming its pages. */
  release(map: WorldMapSpec): boolean {
    if (this.requests.has(map.id)) return false;
    for (const asset of regionAssets(map)) if (this.scene.textures.exists(asset.key)) this.scene.textures.remove(asset.key);
    return true;
  }
}
