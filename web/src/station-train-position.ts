import type { SceneScenery, ScenePoint } from './scene-schema';

type StationArt = Pick<SceneScenery, 'x' | 'y' | 'width' | 'flipX' | 'frame'>;

/** Chimney landmarks in the combined station and independent locomotive art. */
export function stationTrainPosition(station: StationArt): {x: number; y: number} {
  const modular = station.frame === 'railway-locomotive';
  const scale = station.width / (modular ? 1254 : 1222);
  return {x: station.x + (modular ? -256 : 128) * scale * (station.flipX ? -1 : 1), y: station.y - (modular ? 639 : 379) * scale};
}

/** The town's train: a placed locomotive, else the combined station building with its painted train. */
export function findStation(scenery: readonly SceneScenery[]): SceneScenery | undefined {
  return scenery.find(item => item.frame === 'railway-locomotive')
    ?? scenery.find(item => item.asset === 'station' && (!item.frame || item.frame === 'station'));
}

/** Where a passenger steps off: the forecourt just below the station's base line, before snapping to open ground. */
export function stationArrival(station: Pick<SceneScenery, 'x' | 'y' | 'width'>): ScenePoint {
  return {x: station.x, y: station.y + station.width * .2};
}

/** Camera centre for station shots: between the train and the forecourt, so both are in frame. */
export function stationFocus(station: StationArt): ScenePoint {
  const train = stationTrainPosition(station), arrival = stationArrival(station);
  return {x: (train.x + arrival.x) / 2, y: (train.y + arrival.y) / 2};
}
