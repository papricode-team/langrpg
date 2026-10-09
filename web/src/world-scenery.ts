import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import { getScenery, packScenery, sceneryDepth, type SceneryPolygon } from './scenery';

interface SceneryLayer {
  sprite: Phaser.GameObjects.Image;
  x: number; y: number; right: number; bottom: number;
}

/** Reuses the exact painted pixels as transparent foreground silhouettes.
 * One shared atlas per active map, one GPU upload on entry, no masks or canvas
 * redraws per actor/frame. Works in both Phaser WebGL and Canvas renderers. */
export class WorldScenery {
  private readonly layers: SceneryLayer[] = [];
  private readonly key: string;

  constructor(private readonly scene: Phaser.Scene, mapId: MapId) {
    this.key = `scenery-${mapId}`;
    if (!scene.textures.exists(mapId)) return;
    const { frames, width, height } = packScenery(getScenery(mapId));
    if (!frames.length) return;
    const source = scene.textures.get(mapId).getSourceImage() as CanvasImageSource;
    const texture = scene.textures.createCanvas(this.key, width, height);
    if (!texture) return;
    const ctx = texture.context;
    const path = (outline: SceneryPolygon): void => {
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let index = 1; index < outline.length; index++) ctx.lineTo(outline[index][0], outline[index][1]);
      ctx.closePath();
    };
    for (const frame of frames) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frame.atlasX, frame.atlasY, frame.width, frame.height);
      ctx.clip();
      ctx.translate(frame.atlasX - frame.x, frame.atlasY - frame.y);
      ctx.beginPath();
      path(frame.spec.outline);
      for (const hole of frame.spec.holes ?? []) path(hole);
      ctx.clip('evenodd');
      ctx.drawImage(source, 0, 0, 1536, 1024);
      ctx.restore();
      texture.add(frame.spec.id, 0, frame.atlasX, frame.atlasY, frame.width, frame.height);
    }
    texture.refresh();
    for (const frame of frames) {
      const sprite = scene.add.image(frame.x, frame.y, this.key, frame.spec.id)
        .setOrigin(0).setDepth(sceneryDepth(frame.spec.baseY));
      this.layers.push({ sprite, x: frame.x, y: frame.y, right: frame.x + frame.width, bottom: frame.y + frame.height });
    }
  }

  update(view: { x: number; y: number; right: number; bottom: number }): void {
    for (const item of this.layers) item.sprite.setVisible(item.right >= view.x && item.x <= view.right
      && item.bottom >= view.y && item.y <= view.bottom);
  }

  destroy(): void {
    for (const { sprite } of this.layers) sprite.destroy();
    this.layers.length = 0;
    // Only the active map keeps an occlusion atlas in GPU memory.
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
