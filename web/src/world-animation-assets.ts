import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { sceneryAnimationManifestKey, sceneryAnimationTextureKeys, sceneryTerrainKey, type SceneryAnimationManifest } from './scenery-animation';

/** A loader completion is only a batch boundary; failed files are not ready art. */
export class WorldAnimationAssets {
  private requests = new Map<string, ((ready: boolean) => void)[]>();
  constructor(private scene: Phaser.Scene) {}

  ready(id: MapId, period: WorldPeriod): boolean {
    const manifest = this.scene.cache.json.get(sceneryAnimationManifestKey(id, period)) as SceneryAnimationManifest | undefined;
    if (!manifest) return false;
    const terrain = sceneryTerrainKey(id, manifest);
    return sceneryAnimationTextureKeys(manifest).every(key => this.scene.textures.exists(key))
      && (!terrain || this.scene.textures.exists(terrain));
  }

  pending(id: MapId, period: WorldPeriod): boolean {
    return this.requests.has(sceneryAnimationManifestKey(id, period));
  }

  /** Shared sheets must survive while another period is still loading them. */
  get pendingTextures(): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const request of this.requests.keys()) {
      const manifest = this.scene.cache.json.get(request) as SceneryAnimationManifest | undefined;
      if (manifest) {
        for (const key of sceneryAnimationTextureKeys(manifest)) keys.add(key);
        if (manifest.terrain) keys.add(manifest.terrain);
      }
    }
    return keys;
  }

  /** Both sides of a fade remain live until the old scenery is destroyed. */
  retainedTextures(id: MapId, period: WorldPeriod, previous?: WorldPeriod): ReadonlySet<string> {
    const keys = new Set(this.pendingTextures);
    for (const retainedPeriod of [period, previous]) {
      if (!retainedPeriod) continue;
      const manifest = this.scene.cache.json.get(sceneryAnimationManifestKey(id, retainedPeriod)) as SceneryAnimationManifest | undefined;
      if (!manifest) continue;
      for (const key of sceneryAnimationTextureKeys(manifest)) keys.add(key);
      const terrain = sceneryTerrainKey(id, manifest);
      if (terrain) keys.add(terrain);
    }
    return keys;
  }

  load(id: MapId, period: WorldPeriod, onLoaded?: (ready: boolean) => void, start = true): void {
    const key = sceneryAnimationManifestKey(id, period);
    const pending = this.requests.get(key);
    if (pending) { if (onLoaded) pending.push(onLoaded); return; }
    if (this.ready(id, period)) { onLoaded?.(true); return; }
    this.requests.set(key, onLoaded ? [onLoaded] : []);
    const enqueue = (manifest: SceneryAnimationManifest) => {
      for (const page of sceneryAnimationTextureKeys(manifest)) {
        if (!this.scene.textures.exists(page)) this.scene.load.atlas(page, `/assets/${page}.webp`, `/assets/${page}.json`);
      }
      const terrain = sceneryTerrainKey(id, manifest);
      if (terrain && !this.scene.textures.exists(terrain)) this.scene.load.image(terrain, `/assets/${manifest.terrain}.webp`);
    };
    const manifestEvent = `filecomplete-json-${key}`;
    const onManifestLoaded = (_key: string, _type: string, manifest: SceneryAnimationManifest) => enqueue(manifest);
    const cached = this.scene.cache.json.get(key) as SceneryAnimationManifest | undefined;
    if (cached) enqueue(cached);
    else {
      this.scene.load.once(manifestEvent, onManifestLoaded);
      this.scene.load.json(key, `/assets/${id}-${period}-animations.json`);
    }
    this.scene.load.once('complete', () => {
      this.scene.load.off(manifestEvent, onManifestLoaded);
      // Arrival callbacks can queue another period. Run them after all listeners
      // for the finishing batch, so new requests cannot observe that old event.
      queueMicrotask(() => {
        const callbacks = this.requests.get(key) ?? [];
        this.requests.delete(key);
        const ready = this.ready(id, period);
        for (const callback of callbacks) callback(ready);
      });
    });
    if (start && !this.scene.load.isLoading()) this.scene.load.start();
  }
}
