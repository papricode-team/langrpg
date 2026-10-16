import type { SceneScenery } from './scene-schema';

/** Chimney landmark in the Lindenhafen station's native cropped painting. */
export function stationTrainPosition(station: Pick<SceneScenery, 'x' | 'y' | 'width' | 'flipX'>): {x: number; y: number} {
  const scale = station.width / 1222;
  return {x: station.x + 128 * scale * (station.flipX ? -1 : 1), y: station.y - 379 * scale};
}
