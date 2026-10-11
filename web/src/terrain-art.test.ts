import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile, stat } from 'node:fs/promises';
import { getMap, storyMaps } from './maps';
import { sceneryTerrainKey } from './scenery-animation';

describe('high-resolution story terrain exports', () => {
  for (const map of storyMaps) for (const period of ['day', 'night']) {
    it(`${map.name} ${period} retains the stitched resolution and original world footprint`, async () => {
      const source = new URL(`../../art/source/terrain-detail/${map.id}-${period}.json`, import.meta.url);
      const manifest = JSON.parse(await readFile(source, 'utf8'));
      expect(manifest.worldSize).toEqual({ width: 1536, height: 1024 });
      expect(manifest.outputSize).toEqual({ width: 6144, height: 4096 });
      expect(manifest.sourceCropSize).toEqual({ width: 432, height: 304 });
      expect(manifest.overlap).toBe(64);
      expect(manifest.tiles).toHaveLength(16);
      for (const tile of manifest.tiles as { nativeSize: { width: number; height: number } }[]) {
        expect(tile.nativeSize.width).toBeGreaterThanOrEqual(1450);
        expect(tile.nativeSize.height).toBeGreaterThanOrEqual(1000);
        expect(tile.nativeSize.width / manifest.sourceCropSize.width).toBeGreaterThan(3.35);
      }
      const animation = JSON.parse(await readFile(new URL(`../public/assets/${map.id}-${period}-animations.json`, import.meta.url), 'utf8'));
      expect(animation.terrainTiles.map(({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => [x, y, width, height]))
        .toEqual([[0, 0, 768, 512], [768, 0, 768, 512], [0, 512, 768, 512], [768, 512, 768, 512]]);
      for (const tile of animation.terrainTiles) {
        const path = new URL(`../public/assets/${tile.key}.webp`, import.meta.url);
        const detail = await sharp(path.pathname).metadata();
        expect([detail.width, detail.height]).toEqual([3073, 2049]);
        expect([tile.crop.width, tile.crop.height]).toEqual([3072, 2048]);
        expect(tile.crop.width / tile.width).toBe(4);
        expect((await stat(path)).size).toBeLessThanOrEqual(2 * 1024 * 1024);
      }
      const name = period === 'day' && map.id !== 'nebelstadt' ? map.id : `${map.id}-${period}`;
      const runtime = new URL(`../public/assets/${name}-terrain.webp`, import.meta.url);
      const metadata = await sharp(runtime.pathname).metadata();
      expect([metadata.width, metadata.height]).toEqual([3072, 2048]);
      if (map.id === 'nebelstadt') {
        const day = new URL('../public/assets/nebelstadt-day-terrain.webp', import.meta.url);
        expect((await readFile(new URL(`../public${map.asset}`, import.meta.url))).equals(await readFile(day))).toBe(true);
        expect(sceneryTerrainKey(map.id, { version: 1, framesPerAsset: 6, assets: {}, terrain: 'nebelstadt-day-terrain' })).toBe(map.id);
        expect(sceneryTerrainKey(map.id, { version: 1, framesPerAsset: 6, assets: {}, terrain: 'nebelstadt-night-terrain' })).toBe('nebelstadt-night-terrain');
      }
      expect((await stat(runtime)).size).toBeLessThanOrEqual(2 * 1024 * 1024);
      const preview = await sharp(new URL(`../public/assets/${map.id}-preview.webp`, import.meta.url).pathname).metadata();
      const bounds=getMap(map.id), scale=Math.min(1,1536/bounds.width,1024/bounds.height);
      expect([preview.width, preview.height]).toEqual([Math.round(bounds.width*scale),Math.round(bounds.height*scale)]);
    });
  }
  it('uses high-resolution terrain on initial arrival in every story town', async () => {
    for (const map of storyMaps) {
      const metadata = await sharp(new URL(`../public${map.asset}`, import.meta.url).pathname).metadata();
      expect([metadata.width, metadata.height]).toEqual([3072, 2048]);
    }
  });
});
