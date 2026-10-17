import type Phaser from 'phaser';
import { ITEM_ATLAS_KEY, itemAtlases, allGameSpriteFrames, minigameActionAtlas } from './item-manifest';

/** One verified noun library shared by DOM paper props and the Phaser game scene. */
export class SpriteLibrary {
  private images = new Map<string, HTMLImageElement>();
  private failed = new Set<string>();
  has(frame: string): boolean { return Boolean(allGameSpriteFrames[frame]) && !this.failed.has(frame); }
  get(frame: string): HTMLImageElement | undefined {
    if (!this.has(frame)) return undefined;
    let image = this.images.get(frame);
    if (!image) {
      image = new Image(); image.src = allGameSpriteFrames[frame].url; image.decoding = 'async';
      image.addEventListener('error', () => { this.failed.add(frame); }, { once: true });
      this.images.set(frame, image);
    }
    return image;
  }
  render(frame: string, alt = '', size = 128): HTMLElement {
    if (!this.has(frame)) {
      const missing = document.createElement('span'); missing.className = 'minigame-sprite-missing';
      missing.textContent = 'Art unavailable'; missing.dataset.missingSprite = frame; return missing;
    }
    const image = document.createElement('img'); image.className = 'minigame-item-sprite';
    image.src = allGameSpriteFrames[frame].url; image.alt = alt; image.width = size; image.height = size;
    image.draggable = false; image.decoding = 'async'; image.style.objectFit = 'contain';
    image.addEventListener('error', () => { this.failed.add(frame); image.hidden = true; }, { once: true });
    return image;
  }
  async preload(frames = Object.keys(allGameSpriteFrames)): Promise<void> {
    await Promise.all(frames.map(async frame => {
      const image = this.get(frame); if (!image) return;
      try { await image.decode(); } catch { this.failed.add(frame); }
    }));
  }
  /** Invoke during the scene preload phase, using native TexturePacker frame names. */
  loadPhaser(scene: Phaser.Scene): void {
    if (!scene.textures.exists('interior-train-furniture')) scene.load.atlas('interior-train-furniture', '/assets/interior-train-furniture.webp', '/assets/interior-train-furniture.json');
    for (const atlas of itemAtlases) if (!scene.textures.exists(atlas.key)) scene.load.atlas(atlas.key, atlas.image, atlas.data);
    if (!scene.textures.exists(minigameActionAtlas.key)) scene.load.atlas(minigameActionAtlas.key, minigameActionAtlas.image, minigameActionAtlas.data);
  }
  phaserFrame(frame: string): { key: string; frame: string } | undefined {
    return this.has(frame) ? { key: allGameSpriteFrames[frame].atlasKey ?? ITEM_ATLAS_KEY, frame } : undefined;
  }
}
