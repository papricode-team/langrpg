import type { MapId } from './maps';
import { createMapNavigation, MAP_HEIGHT, MAP_WIDTH, type MapPoint, type NavigationGrid } from './navigation';

export interface ResidentAvatar { hair: string; skin: string; outfit: string; }
export interface ResidentStop extends MapPoint { pauseSeconds: number; }
export interface ResidentSpec {
  id: string;
  name: string;
  avatar: ResidentAvatar;
  /** Pixels per second. Residents stroll more slowly than the player. */
  speed: number;
  /** A fraction of the compiled loop, so residents do not depart together. */
  phase: number;
  /** Normalized foot positions, traced from the painted streets. */
  stops: readonly ResidentStop[];
}

export interface ResidentSegment {
  from: MapPoint;
  to: MapPoint;
  startSeconds: number;
  durationSeconds: number;
  velocityX: number;
  velocityY: number;
  moving: boolean;
}
export interface WorldResident {
  id: string;
  name: string;
  avatar: ResidentAvatar;
  segments: readonly ResidentSegment[];
  cycleSeconds: number;
  phaseSeconds: number;
}
export interface ResidentMotion extends MapPoint {
  velocityX: number;
  velocityY: number;
  moving: boolean;
}

const stop = (x: number, y: number, pauseSeconds = 3): ResidentStop => ({ x, y, pauseSeconds });
const palette = (hair: string, skin: string, outfit: string): ResidentAvatar => ({ hair, skin, outfit });

/** Background residents have no quest, interaction target or network identity. */
export const worldResidentSpecs: Readonly<Record<MapId, readonly ResidentSpec[]>> = {
  lindenhafen: [
    {
      id: 'lindenhafen-resident-courier', name: 'Nora', speed: 72, phase: .12,
      avatar: palette('#62412f', '#c18b60', '#4e729a'),
      // A square-to-market errand, along the outside of the stalls.
      stops: [stop(.570,.610,2.8),stop(.650,.552,2),stop(.769,.466,4.2),stop(.800,.397,3.5)],
    },
    {
      id: 'lindenhafen-resident-reader', name: 'Jakob', speed: 57, phase: .49,
      avatar: palette('#d0c9b9', '#ecc4a2', '#75855f'),
      // The library lane and café frontage, below the roofs and terrace tables.
      stops: [stop(.288,.439,4.6),stop(.365,.492,2.1),stop(.446,.463,5),stop(.493,.405,3.2)],
    },
    {
      id: 'lindenhafen-resident-gardener', name: 'Zara', speed: 62, phase: .76,
      avatar: palette('#302b2d', '#744c38', '#a55c50'),
      // The outer garden promenade; nobody cuts across the statue or flowers.
      stops: [stop(.390,.638,3.7),stop(.290,.756,2.5),stop(.340,.867,3.1),stop(.435,.919,4.3),stop(.541,.866,2.9)],
    },
  ],
  waldruh: [
    {
      id: 'waldruh-resident-guest', name: 'Hanna', speed: 55, phase: .16,
      avatar: palette('#d7ae61', '#ecc4a2', '#797197'),
      // Inn forecourt, from the terrace steps to the village square.
      stops: [stop(.132,.357,4),stop(.240,.369,2.4),stop(.342,.402,3.2),stop(.350,.438,4.8)],
    },
    {
      id: 'waldruh-resident-commuter', name: 'Ben', speed: 74, phase: .51,
      avatar: palette('#62412f', '#b07a55', '#4e729a'),
      // The road in front of the station, never the platform or train tracks.
      stops: [stop(.561,.348,2.3),stop(.631,.311,3.1),stop(.708,.300,2),stop(.816,.313,5.2)],
    },
    {
      id: 'waldruh-resident-shopper', name: 'Dalia', speed: 61, phase: .81,
      avatar: palette('#302b2d', '#c18b60', '#b18b4d'),
      // Outside the market tents, then back around the southern edge.
      stops: [stop(.337,.744,4.2),stop(.413,.824,2.2),stop(.495,.820,4.4),stop(.566,.765,3.5),stop(.598,.658,2.7)],
    },
  ],
  nebelstadt: [
    {
      id: 'nebelstadt-resident-archivist', name: 'Ruth', speed: 56, phase: .18,
      avatar: palette('#d0c9b9', '#c18b60', '#797197'),
      // Council archive frontage and the square's west-side stairs.
      stops: [stop(.127,.471,4.4),stop(.254,.458,3.2),stop(.304,.395,4.7),stop(.371,.389,2.6)],
    },
    {
      id: 'nebelstadt-resident-sailor', name: 'Oskar', speed: 68, phase: .52,
      avatar: palette('#62412f', '#ecc4a2', '#477e77'),
      // From the open square to the signal bridge and back along the parapet.
      stops: [stop(.573,.483,3.3),stop(.647,.427,2.5),stop(.755,.426,3.8),stop(.869,.385,5.3)],
    },
    {
      id: 'nebelstadt-resident-port-worker', name: 'Ilyas', speed: 70, phase: .79,
      avatar: palette('#302b2d', '#744c38', '#a55c50'),
      // Workshop lane to the market apron, staying above the harbor docks.
      stops: [stop(.127,.732,4),stop(.261,.762,3.3),stop(.313,.709,2.4),stop(.360,.610,3.8),stop(.430,.593,3)],
    },
  ],
};

/** Resolve the painting's exact collision geometry once, never during update. */
export function compileResident(spec: ResidentSpec, navigation: NavigationGrid): WorldResident | undefined {
  if (spec.stops.length < 2 || !Number.isFinite(spec.speed) || spec.speed <= 0) return undefined;
  const positions = spec.stops.map(point => navigation.closestPoint(point.x * MAP_WIDTH, point.y * MAP_HEIGHT));
  if (positions.some(point => !navigation.isWalkable(point.x, point.y))) return undefined;
  const segments: ResidentSegment[] = [];
  let cycleSeconds = 0;
  for (let index = 0; index < positions.length; index++) {
    const nextIndex = (index + 1) % positions.length;
    let previous = positions[index];
    const route = navigation.findPath(previous, positions[nextIndex]);
    if (!route.length) return undefined;
    for (const point of route) {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      if (distance > .001) {
        const durationSeconds = distance / spec.speed;
        segments.push({
          from: previous, to: point, startSeconds: cycleSeconds, durationSeconds,
          velocityX: (point.x - previous.x) / durationSeconds,
          velocityY: (point.y - previous.y) / durationSeconds, moving: true,
        });
        cycleSeconds += durationSeconds;
      }
      previous = point;
    }
    const pauseSeconds = Math.max(0, Number.isFinite(spec.stops[nextIndex].pauseSeconds) ? spec.stops[nextIndex].pauseSeconds : 0);
    if (pauseSeconds > 0) {
      segments.push({ from: previous, to: previous, startSeconds: cycleSeconds, durationSeconds: pauseSeconds, velocityX: 0, velocityY: 0, moving: false });
      cycleSeconds += pauseSeconds;
    }
  }
  if (!segments.length || cycleSeconds <= 0) return undefined;
  return { id: spec.id, name: spec.name, avatar: spec.avatar, segments, cycleSeconds, phaseSeconds: Math.max(0, Math.min(.999, spec.phase)) * cycleSeconds };
}

export function createWorldResidents(mapId: MapId, navigation = createMapNavigation(mapId)): WorldResident[] {
  return worldResidentSpecs[mapId].flatMap(spec => {
    const resident = compileResident(spec, navigation);
    return resident ? [resident] : [];
  });
}

/**
 * Use the scene's elapsed seconds (which pause with the world), not Date.now().
 * Supplying an output object lets the render loop avoid per-frame allocations.
 */
export function sampleResidentMotion(resident: WorldResident, elapsedSeconds: number, output: ResidentMotion = { x: 0, y: 0, velocityX: 0, velocityY: 0, moving: false }): ResidentMotion {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const time = (elapsed + resident.phaseSeconds) % resident.cycleSeconds;
  const segment = resident.segments.find(candidate => time < candidate.startSeconds + candidate.durationSeconds) ?? resident.segments[resident.segments.length - 1];
  const fraction = Math.min(1, Math.max(0, (time - segment.startSeconds) / segment.durationSeconds));
  output.x = segment.from.x + (segment.to.x - segment.from.x) * fraction;
  output.y = segment.from.y + (segment.to.y - segment.from.y) * fraction;
  output.velocityX = segment.velocityX;
  output.velocityY = segment.velocityY;
  output.moving = segment.moving;
  return output;
}
