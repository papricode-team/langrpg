import { describe, expect, it } from 'vitest';
import { characterFrame, MODULAR_ART, NATIVE_MODULAR_ART } from './avatar-options';
import { advanceWalkClock, advanceWalkDistance, advanceWalkPhase, PREVIEW_WALK_CYCLE_MS, WALK_POSE_COLUMNS, WALK_SPEED, walkSpeedForHeight, walkPoseColumn, type WalkClock } from './walk-animation';

import { CAST_ART } from './character-cast';
const worldCycleDistance = MODULAR_ART.cycleDistance * MODULAR_ART.worldHeight / MODULAR_ART.bodyHeight;
const worldCycleMs = worldCycleDistance / WALK_SPEED * 1000;

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
        const distance = WALK_SPEED * index / fps;
        const phase = distance % worldCycleDistance / worldCycleDistance * WALK_POSE_COLUMNS.length;
        const column = characterFrame(3, phase) % MODULAR_ART.columns;
        expect((column - previous + WALK_POSE_COLUMNS.length) % WALK_POSE_COLUMNS.length).toBeLessThanOrEqual(1);
        seen.add(column); previous = column;
      }
      expect([...seen].sort()).toEqual(WALK_POSE_COLUMNS);
    }
  });

  it('fits a left/right stride to the painted body at every rendering scale', () => {
    for (const art of [MODULAR_ART, NATIVE_MODULAR_ART, CAST_ART]) {
      for (const height of [72, 132, 240, 72 * .7]) {
        const cycle = art.cycleDistance * height / art.bodyHeight;
        // Two contact poses each span about half a body height. A cadence-only
        // test used to accept a cycle that slid nearly three heights instead.
        expect(cycle / height).toBeGreaterThanOrEqual(.9);
        expect(cycle / height).toBeLessThanOrEqual(1.1);
        expect(cycle).toBeCloseTo(worldCycleDistance * height / MODULAR_ART.worldHeight);
        expect(cycle / walkSpeedForHeight(height) * 1000).toBeCloseTo(PREVIEW_WALK_CYCLE_MS);
      }
    }
    expect(PREVIEW_WALK_CYCLE_MS).toBeCloseTo(worldCycleMs);
  });

  it.each([30, 60, 120])('accounts for every pixel of delayed peer travel at %i Hz', fps => {
    const seconds = 1 / fps;
    const interpolation = 1 - Math.exp(-12 * seconds);
    for (const height of [MODULAR_ART.worldHeight, 132]) {
      const cycleDistance = MODULAR_ART.cycleDistance * height / MODULAR_ART.bodyHeight;
      let peerX = 0, targetX = WALK_SPEED * .5, walkDistance = 0;
      for (let index = 0; index < fps * 2; index++) {
        const actualDistance = (targetX - peerX) * interpolation;
        peerX += actualDistance;
        walkDistance = advanceWalkDistance(walkDistance, actualDistance, cycleDistance);
        // Catch-up must not silently discard travel from the feet's clock.
        expect(walkDistance).toBeCloseTo(peerX % cycleDistance, 8);
        targetX += WALK_SPEED * seconds;
      }
    }
  });

  it('retains partial steps across pauses and counts only actual movement', () => {
    let distance = advanceWalkDistance(0, 3, worldCycleDistance);
    distance = advanceWalkDistance(distance, 0, worldCycleDistance);
    distance = advanceWalkDistance(distance, 4, worldCycleDistance);
    expect(distance).toBe(7);
    const largeStep = worldCycleDistance * 1.25;
    expect(advanceWalkDistance(distance, largeStep, worldCycleDistance)).toBeCloseTo((7 + largeStep) % worldCycleDistance);
  });

  it('resumes a paused or stalled preview without a catch-up jump', () => {
    const before = { phase: 2.4, lastTimeMs: 100 };
    const paused = advanceWalkClock(before, 5000, { active: false });
    expect(paused).toEqual({ phase: 2.4, lastTimeMs: null });
    const resumed = advanceWalkClock(paused, 10000);
    expect(resumed.phase).toBeCloseTo(before.phase);
    expect(advanceWalkClock(before, 10000).phase).toBeCloseTo(before.phase);
    expect(advanceWalkClock(resumed, 10000 + 1000 / 60).phase).toBeCloseTo(2.4 + 8 * (1000 / 60) / PREVIEW_WALK_CYCLE_MS);
  });
});
