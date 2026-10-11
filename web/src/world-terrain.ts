import type * as Phaser from 'phaser';
import type { TerrainTile } from './scenery-animation';

/** Four bounded textures retain close-up detail without a giant GPU texture. */
export class WorldTerrain {
  private root: Phaser.GameObjects.Container;
  private images: Phaser.GameObjects.Image[] = [];
  key: string;
  tint = 0xffffff;
  destroyed = false;
  constructor(private scene: Phaser.Scene, key: string, tiles?: readonly TerrainTile[]) {
    this.root = scene.add.container(0, 0);
    this.key = key;
    this.setTexture(key, tiles);
  }
  get alpha(): number { return this.root.alpha; }
  get visible(): boolean { return this.root.visible; }
  get nativeSize(): { width: number; height: number } {
    const image = this.images[0], ratio = image?.frame?.width / image?.displayWidth;
    return Number.isFinite(ratio) ? { width: Math.round(1536 * ratio), height: Math.round(1024 * ratio) } : { width: 0, height: 0 };
  }
  setTexture(key: string, tiles?: readonly TerrainTile[]): this {
    for (const image of this.images) image.destroy();
    this.key = key;
    const sections: readonly TerrainTile[] = tiles?.length && tiles.every(tile => this.scene.textures.exists(tile.key))
      ? tiles : [{ key, x: 0, y: 0, width: 1536, height: 1024 }];
    this.images = sections.map(tile => {
      if (tile.crop) {
        const texture = this.scene.textures.get(tile.key);
        if (!texture.has('terrain-detail')) texture.add('terrain-detail', 0, tile.crop.x, tile.crop.y, tile.crop.width, tile.crop.height);
      }
      return this.scene.add.image(tile.x, tile.y, tile.key, tile.crop ? 'terrain-detail' : undefined)
        .setOrigin(0).setDisplaySize(tile.width, tile.height).setTint(this.tint);
    });
    this.root.add(this.images);
    return this;
  }
  setDisplaySize(width: number, height: number): this { this.root.setScale(width / 1536, height / 1024); return this; }
  setDepth(depth: number): this { this.root.setDepth(depth); return this; }
  setAlpha(alpha: number): this { this.root.setAlpha(alpha); return this; }
  setVisible(visible: boolean): this { this.root.setVisible(visible); return this; }
  setTint(tint: number): this { this.tint = tint; for (const image of this.images) image.setTint(tint); return this; }
  destroy(): void { this.destroyed = true; this.root.destroy(); this.images = []; }
}
