import { describe, expect, it } from 'vitest';
import { characterFrame, MODULAR_ART } from './avatar-options';
import { advanceWalkClock, advanceWalkDistance, advanceWalkPhase, PREVIEW_WALK_CYCLE_MS, WALK_POSE_COLUMNS, walkPoseColumn, type WalkClock } from './walk-animation';

const WORLD_WALK_SPEED = 225;
const worldCycleDistance = MODULAR_ART.cycleDistance * MODULAR_ART.worldHeight / MODULAR_ART.bodyHeight;
const worldCycleMs = worldCycleDistance / WORLD_WALK_SPEED * 1000;

describe('painted walk timing', () => {
  it('keeps phase as the index of each of the eight painted slots', () => {
    expect(WALK_POSE_COLUMNS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from({ length: 8 }, (_, phase) => walkPoseColumn(phase + .4))).toEqual(WALK_POSE_COLUMNS);
    expect(walkPoseColumn(8)).toBe(1);
    expect(walkPoseColumn(-1)).toBe(8);
  });

  it('advances the same distance in animation time at 30, 60, and 120 Hz', () => {
    const phases = [30, 60, 120].map(fps => {
      let clock: WalkClock = { phase: .3, lastTimeMs: null };
      for (let index = 0; index <= fps * 2; index++) clock = advanceWalkClock(clock, index * 1000 / fps, { cycleMs: worldCycleMs });
      return clock.phase;
    });
    for (const phase of phases) expect(phase).toBeCloseTo(advanceWalkPhase(.3, 2000, worldCycleMs), 8);
  });

  it('keeps the actual configured outdoor walk cycle between 0.8 and 1.2 seconds', () => {
    expect(worldCycleMs).toBeGreaterThanOrEqual(800);
    expect(worldCycleMs).toBeLessThanOrEqual(1200);
  });

  it('shows every pose without skipping at normal cadence on 30, 60, and 120 Hz displays', () => {
    for (const cycleMs of [PREVIEW_WALK_CYCLE_MS, worldCycleMs]) for (const fps of [30, 60, 120]) {
      let clock: WalkClock = { phase: 0, lastTimeMs: null }, previous = 1;
      const seen = new Set<number>();
      for (let index = 0; index <= fps * 3; index++) {
        clock = advanceWalkClock(clock, index * 1000 / fps, { cycleMs });
        const column = walkPoseColumn(clock.phase);
        expect((column - previous + 8) % 8).toBeLessThanOrEqual(1);
        seen.add(column); previous = column;
      }
      expect([...seen].sort()).toEqual(WALK_POSE_COLUMNS);
    }
  });

  it('samples every game pose at the actual configured travel distance on 30, 60, and 120 Hz displays', () => {
    for (const fps of [30, 60, 120]) {
      let previous = 1;
      const seen = new Set<number>();
      for (let index = 0; index <= fps * 3; index++) {
        const distance = WORLD_WALK_SPEED * index / fps;
        const phase = distance % worldCycleDistance / worldCycleDistance * WALK_POSE_COLUMNS.length;
        const column = characterFrame(3, phase) % MODULAR_ART.columns;
        expect((column - previous + WALK_POSE_COLUMNS.length) % WALK_POSE_COLUMNS.length).toBeLessThanOrEqual(1);
        seen.add(column); previous = column;
      }
      expect([...seen].sort()).toEqual(WALK_POSE_COLUMNS);
    }
  });

  it.each([30, 60, 120])('keeps delayed peers at normal cadence without skipping poses at %i Hz', fps => {
    const seconds = 1 / fps;
    const interpolation = 1 - Math.exp(-12 * seconds);
    const maxGaitDistance = WORLD_WALK_SPEED * seconds;
    for (const bodyHeight of [MODULAR_ART.worldHeight, 132]) {
      const cycleDistance = MODULAR_ART.cycleDistance * bodyHeight / MODULAR_ART.bodyHeight;
      let peerX = 0, targetX = 112.5, walkDistance = 0, totalGaitDistance = 0, previous = 1;
      const seen = new Set([previous]);
      for (let index = 0; index < fps * 2; index++) {
        // Half a second of delayed movement leaves the peer ahead of its drawn position.
        const actualDistance = (targetX - peerX) * interpolation;
        peerX += actualDistance;
        const nextDistance = advanceWalkDistance(walkDistance, actualDistance, cycleDistance, maxGaitDistance);
        const gaitDistance = (nextDistance - walkDistance + cycleDistance) % cycleDistance;
        expect(gaitDistance).toBeLessThanOrEqual(maxGaitDistance + 1e-9);
        if (index === 0) {
          expect(peerX).toBeCloseTo(112.5 * interpolation);
          expect(actualDistance).toBeGreaterThan(maxGaitDistance);
          expect(gaitDistance).toBeCloseTo(maxGaitDistance);
        }
        totalGaitDistance += gaitDistance;
        walkDistance = nextDistance;
        const column = characterFrame(1, walkDistance / cycleDistance * WALK_POSE_COLUMNS.length) % MODULAR_ART.columns;
        expect((column - previous + WALK_POSE_COLUMNS.length) % WALK_POSE_COLUMNS.length).toBeLessThanOrEqual(1);
        seen.add(column); previous = column;
        targetX += WORLD_WALK_SPEED * seconds;
      }
      expect(totalGaitDistance).toBeCloseTo(WORLD_WALK_SPEED * 2);
      expect([...seen].sort()).toEqual(WALK_POSE_COLUMNS);
    }
  });

  it('preserves actual travel for local movement and peers below the gait cap', () => {
    const largeStep = worldCycleDistance * 1.25;
    expect(advanceWalkDistance(12, largeStep, worldCycleDistance)).toBeCloseTo((12 + largeStep) % worldCycleDistance);
    expect(advanceWalkDistance(12, 3, worldCycleDistance, 7.5)).toBe(15);
  });

  it('resumes a paused or stalled preview without a catch-up jump', () => {
    const before = { phase: 2.4, lastTimeMs: 100 };
    const paused = advanceWalkClock(before, 5000, { active: false });
    expect(paused).toEqual({ phase: 2.4, lastTimeMs: null });
    const resumed = advanceWalkClock(paused, 10000);
    expect(resumed.phase).toBeCloseTo(before.phase);
    expect(advanceWalkClock(before, 10000).phase).toBeCloseTo(before.phase);
    expect(advanceWalkClock(resumed, 10000 + 1000 / 60).phase).toBeCloseTo(2.4 + 8 / 60);
  });
});
