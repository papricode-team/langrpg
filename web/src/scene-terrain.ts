import type {SceneTerrain} from './scene-schema';
import type {TerrainTile} from './scenery-animation';

/** Shared keys let the editor reuse artwork already loaded by the game. */
export function sceneTerrainImage(tile: SceneTerrain, period: 'day' | 'night'): TerrainTile & {asset: string} {
  const night = period === 'night' && !!tile.nightAsset;
  const asset = night ? tile.nightAsset! : tile.dayAsset;
  return {
    key: asset.replace(/^\/assets\//, '').replace(/\.[^.]+$/, ''), asset,
    x: tile.x, y: tile.y, width: tile.width, height: tile.height,
    crop: night ? tile.nightCrop : tile.dayCrop,
  };
}
