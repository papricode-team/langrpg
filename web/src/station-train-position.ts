import type { SceneScenery } from './scene-schema';

/** Chimney landmarks in the combined station and independent locomotive art. */
export function stationTrainPosition(station: Pick<SceneScenery, 'x' | 'y' | 'width' | 'flipX' | 'frame'>): {x: number; y: number} {
  const modular = station.frame === 'railway-locomotive';
  const scale = station.width / (modular ? 1254 : 1222);
  return {x: station.x + (modular ? -256 : 128) * scale * (station.flipX ? -1 : 1), y: station.y - (modular ? 639 : 379) * scale};
}
