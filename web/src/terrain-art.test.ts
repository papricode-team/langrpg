import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile, stat } from 'node:fs/promises';
import { storyMaps } from './maps';
import { sceneryTerrainKey } from './scenery-animation';

describe('high-resolution story terrain exports', () => {
  for (const map of storyMaps) for (const period of ['day', 'night']) {
    it(`${map.name} ${period} retains the stitched resolution and original world footprint`, async () => {
      const source = new URL(`../../art/source/terrain-hd/${map.id}-${period}.json`, import.meta.url);
      const manifest = JSON.parse(await readFile(source, 'utf8'));
      expect(manifest.worldSize).toEqual({ width: 1536, height: 1024 });
      expect(manifest.outputSize).toEqual({ width: 3072, height: 2048 });
      expect(manifest.overlap).toBe(128);
      expect(Object.keys(manifest.tiles)).toEqual(['nw', 'ne', 'sw', 'se']);
      for (const tile of Object.values(manifest.tiles) as { nativeSize: { width: number; height: number } }[]) {
        expect(tile.nativeSize.width).toBeGreaterThanOrEqual(1450);
        expect(tile.nativeSize.height).toBeGreaterThanOrEqual(1000);
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
      expect([preview.width, preview.height]).toEqual([1536, 1024]);
    });
  }
  it('uses high-resolution terrain on initial arrival in every story town', async () => {
    for (const map of storyMaps) {
      const metadata = await sharp(new URL(`../public${map.asset}`, import.meta.url).pathname).metadata();
      expect([metadata.width, metadata.height]).toEqual([3072, 2048]);
    }
  });
});
