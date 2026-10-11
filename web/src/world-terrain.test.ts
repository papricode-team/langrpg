import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { WorldTerrain } from './world-terrain';
import type { TerrainTile } from './scenery-animation';

function fixture(missing?: string) {
  const images: { x: number; y: number; key: string; frame?: string; width: number; height: number; tint: number; destroyed: boolean }[] = [];
  const frames = new Map<string, Set<string>>();
  const addFrame = vi.fn((key: string, name: string, ..._coordinates: number[]) => {
    frames.set(key, new Set([...(frames.get(key) ?? []), name]));
  });
  const root = { alpha: 1, visible: true, scale: [1, 1], add() {}, setDepth() {}, destroy: vi.fn(),
    setScale(x: number, y: number) { this.scale = [x, y]; },
    setAlpha(alpha: number) { this.alpha = alpha; }, setVisible(visible: boolean) { this.visible = visible; } };
  const scene = { textures: { exists: (key: string) => key !== missing, get: (key: string) => ({
    has: (frame: string) => frames.get(key)?.has(frame), add: (frame: string, ...coordinates: number[]) => addFrame(key, frame, ...coordinates),
  }) }, add: { container: () => root, image: (x: number, y: number, key: string, frame?: string) => {
    const image = { x, y, key, frame, width: 0, height: 0, tint: 0xffffff, destroyed: false,
      setOrigin() { return this; }, setDisplaySize(width: number, height: number) { this.width = width; this.height = height; return this; },
      setTint(tint: number) { this.tint = tint; return this; }, destroy() { this.destroyed = true; } };
    images.push(image); return image;
  } } } as unknown as Phaser.Scene;
  return { scene, root, images, addFrame };
}
const tiles: TerrainTile[] = Array.from({ length: 4 }, (_, index) => ({ key: `tile-${index}`, x: index % 2 * 768,
  y: Math.floor(index / 2) * 512, width: 768, height: 512,
  crop: { x: index % 2, y: Math.floor(index / 2), width: 3072, height: 2048 } }));

describe('bounded high-resolution terrain rendering', () => {
  it('places cropped GPU pieces into the exact original world without overlapping geometry', () => {
    const mock = fixture();
    new WorldTerrain(mock.scene, 'base', tiles).setDisplaySize(1536, 1024);
    expect(mock.images.map(({ x, y, width, height, frame }) => ({ x, y, width, height, frame })))
      .toEqual(tiles.map(({ x, y, width, height }) => ({ x, y, width, height, frame: 'terrain-detail' })));
    expect(mock.addFrame).toHaveBeenCalledWith('tile-3', 'terrain-detail', 0, 1, 1, 3072, 2048);
    expect(mock.root.scale).toEqual([1, 1]);
  });
  it('keeps the complete base while a piece is missing and replaces it atomically when ready', () => {
    const mock = fixture('tile-2'), terrain = new WorldTerrain(mock.scene, 'base', tiles);
    expect(mock.images.map(image => image.key)).toEqual(['base']);
    expect([mock.images[0].width, mock.images[0].height]).toEqual([1536, 1024]);
    terrain.setTexture('night', tiles.map(tile => ({ ...tile, key: `night-${tile.key}` })));
    expect(mock.images[0].destroyed).toBe(true);
    expect(mock.images.slice(1).map(image => image.key)).toEqual(['night-tile-0', 'night-tile-1', 'night-tile-2', 'night-tile-3']);
  });
  it('fades, hides, tints and destroys the entire painting together', () => {
    const mock = fixture(), terrain = new WorldTerrain(mock.scene, 'base', tiles);
    terrain.setAlpha(.4).setVisible(false).setTint(0x8899aa);
    expect(terrain.alpha).toBe(.4);
    expect(terrain.visible).toBe(false);
    expect(mock.images.map(image => image.tint)).toEqual(Array(4).fill(0x8899aa));
    terrain.destroy();
    expect(mock.root.destroy).toHaveBeenCalledOnce();
  });
  it('preserves chunk scale and coordinates inside doubled map bounds', () => {
    const mock = fixture();
    const expanded = [...tiles, {...tiles[0], key: 'new-district', x: 2304, y: 1536}];
    new WorldTerrain(mock.scene, 'base', expanded, {width: 3072, height: 2048}).setDisplaySize(3072, 2048);
    expect(mock.root.scale).toEqual([1, 1]);
    expect(mock.images.map(({x, y, width, height}) => ({x, y, width, height})))
      .toEqual(expanded.map(({x, y, width, height}) => ({x, y, width, height})));
  });
});
