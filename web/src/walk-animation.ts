/** Phase is an index into the painted poses, independent of display refresh rate. */
export const WALK_POSE_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const WALK_SPEED = 90;
// The painted side-view contacts span about half a body height per step.
// One complete left/right cycle covers 72 pixels in the 96px reference cell
// (71px visible body), rather than almost three body heights.
export const WALK_REFERENCE_CYCLE_DISTANCE = 72;
export const PREVIEW_WALK_CYCLE_MS = WALK_REFERENCE_CYCLE_DISTANCE * 72 / 71 / WALK_SPEED * 1000;

/** Rooms draw larger bodies; scale travel with their legs to preserve cadence. */
export function walkSpeedForHeight(bodyHeight: number): number {
  return WALK_SPEED * bodyHeight / 72;
}

function wrapPhase(phase: number, count: number): number {
  if (!Number.isFinite(count) || count < 1) throw new RangeError('Walk pose count must be positive.');
  const remainder = Number.isFinite(phase) ? phase % count : 0;
  const value = remainder < 0 ? remainder + count : remainder;
  return value < 1e-9 || count - value < 1e-9 ? 0 : value;
}

export function walkPoseColumn(phase: number): number {
  return WALK_POSE_COLUMNS[Math.floor(wrapPhase(phase, WALK_POSE_COLUMNS.length))];
}

/** Sample actual rendered travel, including peer interpolation and wall sliding. */
export function advanceWalkDistance(walkDistance: number, travelDistance: number, cycleDistance: number): number {
  return (walkDistance + travelDistance) % cycleDistance;
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
