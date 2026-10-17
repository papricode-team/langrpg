import type { Beat, CutsceneKind } from './cinematic-content';
import type { ScenePoint, WorldScene } from './scene-schema';
import { findStation, stationArrival, stationFocus } from './station-train-position';

/** The town's live station: the shot of it and the forecourt where the player steps off the train. */
export interface StationStage { station: ScenePoint; arrival: ScenePoint; }

/** Station shots follow the station wherever the town's editors placed it. */
export function stationStage(scene: WorldScene): StationStage | undefined {
  const station = findStation(scene.scenery);
  if (!station) return undefined;
  const arrival = stationArrival(station);
  // The player stands at the spawn when it is the station forecourt; frame them rather than the bare paving.
  const near = Math.hypot(scene.spawn.x - arrival.x, scene.spawn.y - arrival.y) < station.width * .6;
  return { station: stationFocus(station), arrival: near ? scene.spawn : arrival };
}

/**
 * The authored beats carry fixed town coordinates from before the stations moved. Shots of the station
 * (the arrival, platform seven, boarding and the epilogue's first train) aim at the live one instead.
 */
export function stageBeats(kind: CutsceneKind, beats: readonly Beat[], stage: StationStage | undefined): readonly Beat[] {
  if (!stage) return beats;
  if (kind === 'arrival') return beats.map((beat, index) => ({ ...beat, ...(index === 0 ? stage.station : stage.arrival) }));
  if (kind === 'platform' || kind === 'travel' || kind === 'epilogue') return beats.map(beat => ({ ...beat, ...stage.station }));
  return beats;
}
