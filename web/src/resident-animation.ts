import type { WorldResident } from './world-life';

/** Four painted step poses cover one complete stride at the outdoor body size. */
export const RESIDENT_WALK_CYCLE_DISTANCE = 64;

/** A vertical leg or pause inherits its route's latest horizontal direction. */
export function residentFacingLeft(resident: WorldResident, elapsedSeconds: number): boolean | undefined {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const time = (elapsed + resident.phaseSeconds) % resident.cycleSeconds;
  const segmentIndex = resident.segments.findIndex(segment => time < segment.startSeconds + segment.durationSeconds);
  const current = segmentIndex < 0 ? resident.segments.length - 1 : segmentIndex;
  for (let offset = 0; offset < resident.segments.length; offset++) {
    const index = (current - offset + resident.segments.length) % resident.segments.length;
    const segment = resident.segments[index];
    if (segment.moving && Math.abs(segment.velocityX) > Math.abs(segment.velocityY) * .25 && Math.abs(segment.velocityX) > .05) return segment.velocityX < 0;
  }
  return undefined;
}

/**
 * Route travel, including the resident's initial phase, drives the painted gait.
 * Sampling the route directly keeps corners, pauses and offscreen movement
 * independent of frame rate. A pause establishes a fresh stride on departure.
 */
export function residentWalkDistance(resident: WorldResident, elapsedSeconds: number): number {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const time = (elapsed + resident.phaseSeconds) % resident.cycleSeconds;
  let distance = 0;
  for (const segment of resident.segments) {
    if (time < segment.startSeconds) break;
    if (!segment.moving) distance = 0;
    else {
      const seconds = Math.min(segment.durationSeconds, Math.max(0, time - segment.startSeconds));
      distance += Math.hypot(segment.velocityX, segment.velocityY) * seconds;
    }
    if (time < segment.startSeconds + segment.durationSeconds) break;
  }
  return distance;
}

export function residentWalkFrame(frames: readonly string[], distance: number, moving: boolean): string {
  const phase = Number.isFinite(distance) ? Math.max(0, distance) % RESIDENT_WALK_CYCLE_DISTANCE : 0;
  return frames[moving ? Math.floor(phase / RESIDENT_WALK_CYCLE_DISTANCE * frames.length) : 0];
}
