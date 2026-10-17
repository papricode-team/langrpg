import type { GameItem, MiniGameOptions, Modality } from './types';

/**
 * Adaptive pace for the word games. A run starts from how well the player already knows the pool (and where their
 * last run of this game ended), then moves up after quick correct answers and down after misses. The pace only
 * changes how hard a round is to answer — more options, shorter timers, bigger grids — never what counts as correct.
 */

export type PaceTier = 0 | 1 | 2 | 3;
export const paceNames = ['Gentle', 'Steady', 'Brisk', 'Swift'] as const;
const top: PaceTier = 3;
const clamp = (tier: number): PaceTier => Math.max(0, Math.min(top, Math.round(tier))) as PaceTier;

/** One word's memory as a tier: unrecalled words are new, stable words are well known. */
function itemTier(item: GameItem, modality: Modality): number {
  if (item.recalls[modality] < 1) return 1;
  const stability = item.stabilityByMode?.[modality] ?? item.stability;
  return stability < 7 ? 1.5 : stability < 21 ? 2.25 : 3;
}

/**
 * Where a run begins. New words start at Steady rather than Gentle: Gentle is only reached by missing.
 * A previous run's pace counts as much as the pool's memory, and the course level sets a floor.
 */
export function startingPace(pool: readonly GameItem[], modality: Modality, level: MiniGameOptions['level'], previous?: number): PaceTier {
  const memory = pool.length ? pool.reduce((sum, item) => sum + itemTier(item, modality), 0) / pool.length : 1;
  const blended = previous === undefined || !Number.isFinite(previous) ? memory : (memory + previous) / 2;
  return clamp(Math.max(level === 'A1' ? 1 : 2, Math.floor(blended)));
}

/** Points needed to move up a tier, and the debt that moves down one. */
const raiseAt = 3, lowerAt = -2;

export class Pace {
  private points = 0;
  constructor(public tier: PaceTier) {}
  /**
   * Records one graded answer. `speed` is the share of the time limit used (0 = instant, 1 = ran out), or undefined
   * when the round has no timer. Returns +1 or -1 when the tier changed, otherwise 0.
   */
  record(correct: boolean, speed?: number): -1 | 0 | 1 {
    this.points += !correct ? -2 : speed === undefined ? .75 : speed < .35 ? 1.5 : speed < .7 ? 1 : .5;
    if (this.points >= raiseAt && this.tier < top) { this.tier = clamp(this.tier + 1); this.points = 0; return 1; }
    if (this.points <= lowerAt && this.tier > 0) { this.tier = clamp(this.tier - 1); this.points = 0; return -1; }
    // At the top there is nothing to save up for; banked points would only delay slowing down.
    this.points = Math.max(lowerAt, Math.min(this.tier === top ? 1 : raiseAt, this.points));
    return 0;
  }
}

export interface PaceSettings {
  /** Choices shown in a single-answer round, the correct one included. */
  options: number;
  /** Multiplier on every response timer. */
  time: number;
  /** Words matched on one Lantern Pairs board. */
  pairs: number;
  /** Clues and side length of a Letter Loom grid, and whether words may run diagonally. */
  loomWords: number; loomSize: number; diagonal: boolean;
  /** Wrong letters Lantern Fuse allows. */
  lives: number;
  /** How long the Echo Bells word stays visible in silent mode. */
  glimpseMs: number;
}

export function paceSettings(tier: PaceTier, level: MiniGameOptions['level']): PaceSettings {
  return {
    options: [3, 4, 5, 6][tier],
    time: [1.3, 1, .8, .65][tier],
    pairs: [3, 4, 5, 6][tier],
    loomWords: [3, 3, 4, 5][tier], loomSize: [7, 7, 8, 9][tier], diagonal: level === 'B1' || tier === top,
    lives: [8, 7, 6, 5][tier],
    glimpseMs: [1900, 1600, 1200, 900][tier],
  };
}
