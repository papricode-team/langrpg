import {describe, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {sceneDocument} from './scene-data';
import {sceneTerrainImage} from './scene-terrain';
import {parseWorldSceneDocument} from './scene-schema';

describe('detailed scene terrain', () => {
  it('uses the exact same four-pixel artwork and guard crops in editor and runtime', async () => {
    for (const id of ['lindenhafen', 'waldruh', 'nebelstadt']) for (const period of ['day', 'night'] as const) {
      const scene = sceneDocument.maps[id];
      const manifest = JSON.parse(await readFile(new URL(`../public/assets/${id}-${period}-animations.json`, import.meta.url), 'utf8'));
      expect(scene.terrain.filter(tile=>tile.x<1536&&tile.y<1024).map(tile => { const {asset: _asset, ...rendered} = sceneTerrainImage(tile, period); return rendered; }))
        .toEqual(manifest.terrainTiles);
      for (const tile of scene.terrain) expect(tile.pixelDensity).toBe(4);
    }
  });
  it('rejects pixel-density mismatches and invalid guard crops before authoring', () => {
    const draft = structuredClone(sceneDocument);
    draft.maps.lindenhafen.terrain[0].dayCrop!.width--;
    expect(() => parseWorldSceneDocument(draft)).toThrow(/pixel density/);
    draft.maps.lindenhafen.terrain[0].dayCrop!.width++;
    draft.maps.lindenhafen.terrain[0].dayCrop!.x = -.5;
    expect(() => parseWorldSceneDocument(draft)).toThrow(/nonnegative pixels/);
  });
  it('keeps the daytime crop when a scene has no separate night image', () => {
    const day = {...sceneDocument.maps.lindenhafen.terrain[0], nightAsset: undefined, nightCrop: undefined};
    expect(sceneTerrainImage(day, 'night')).toEqual(sceneTerrainImage(day, 'day'));
  });
});
