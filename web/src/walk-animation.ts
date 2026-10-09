/** Phase is an index into the painted poses, independent of display refresh rate. */
export const WALK_POSE_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const PREVIEW_WALK_CYCLE_MS = 1000;

function wrapPhase(phase: number, count: number): number {
  if (!Number.isFinite(count) || count < 1) throw new RangeError('Walk pose count must be positive.');
  const remainder = Number.isFinite(phase) ? phase % count : 0;
  const value = remainder < 0 ? remainder + count : remainder;
  return value < 1e-9 || count - value < 1e-9 ? 0 : value;
}

export function walkPoseColumn(phase: number): number {
  return WALK_POSE_COLUMNS[Math.floor(wrapPhase(phase, WALK_POSE_COLUMNS.length))];
}

/** Peer catch-up can move faster than walking; only animation travel is capped. */
export function advanceWalkDistance(walkDistance: number, travelDistance: number, cycleDistance: number, maxGaitDistance = Infinity): number {
  return (walkDistance + Math.min(travelDistance, maxGaitDistance)) % cycleDistance;
}

export function advanceWalkPhase(phase: number, elapsedMs: number, cycleMs = PREVIEW_WALK_CYCLE_MS, poseCount: number = WALK_POSE_COLUMNS.length): number {
  if (!Number.isFinite(cycleMs) || cycleMs <= 0) throw new RangeError('Walk cycle duration must be positive.');
  const current = wrapPhase(phase, poseCount);
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? wrapPhase(current + elapsedMs * poseCount / cycleMs, poseCount) : current;
}

export interface WalkClock { readonly phase: number; readonly lastTimeMs: number | null; }
export interface WalkClockOptions { active?: boolean; cycleMs?: number; poseCount?: number; maxGapMs?: number; }

/** Pauses and long stalls establish a fresh time origin instead of catching up. */
export function advanceWalkClock(clock: WalkClock, timestampMs: number, { active = true, cycleMs = PREVIEW_WALK_CYCLE_MS, poseCount = WALK_POSE_COLUMNS.length, maxGapMs = 100 }: WalkClockOptions = {}): WalkClock {
  const phase = wrapPhase(clock.phase, poseCount);
  if (!active || !Number.isFinite(timestampMs)) return { phase, lastTimeMs: null };
  const elapsed = clock.lastTimeMs === null ? 0 : timestampMs - clock.lastTimeMs;
  if (clock.lastTimeMs === null || elapsed < 0 || elapsed > maxGapMs) return { phase, lastTimeMs: timestampMs };
  return { phase: advanceWalkPhase(phase, elapsed, cycleMs, poseCount), lastTimeMs: timestampMs };
}
