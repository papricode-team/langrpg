export type QualityTier = 'low' | 'medium' | 'high';
export type QualityMode = 'auto' | QualityTier;
export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];
export const QUALITY_MODES: readonly QualityMode[] = ['auto', ...QUALITY_TIERS];

export interface DeviceHints { deviceMemory?: number; saveData?: boolean; effectiveType?: string; }

/** The highest tier Auto may reach on this device before any frame is measured. */
export function deviceCeiling({ deviceMemory, saveData, effectiveType }: DeviceHints): QualityTier {
  if (saveData || /(^|-)2g$/.test(effectiveType ?? '') || (deviceMemory !== undefined && deviceMemory <= 2)) return 'low';
  if (effectiveType === '3g' || (deviceMemory !== undefined && deviceMemory <= 4)) return 'medium';
  return 'high';
}

const WINDOW_MS = 3000;
// Frames above this count as visible hitches.
const HITCH_MS = 50;
// Longer gaps are a hidden tab or a debugger pause, not rendering cost.
const IGNORE_MS = 1000;

/**
 * Auto quality: starts at Low, climbs one tier after two calm windows in a row and drops one tier
 * after a window that stutters. A tier that stuttered becomes the session's ceiling, so Auto does
 * not oscillate. Callers pause judgement while scenes load or textures swap.
 */
export class QualityGovernor {
  tier: QualityTier = 'low';
  private ceiling: number;
  private started = -1;
  private frames = 0;
  private total = 0;
  private hitches = 0;
  private calm = 0;
  private heldUntil = 0;

  constructor(ceiling: QualityTier = 'high') { this.ceiling = QUALITY_TIERS.indexOf(ceiling); }

  /** Ignore frames until `now + ms`; an open window is discarded. */
  hold(now: number, ms: number): void {
    this.heldUntil = Math.max(this.heldUntil, now + ms);
    this.started = -1;
  }

  /** Feeds one frame. Returns the new tier when Auto changes it. */
  sample(deltaMs: number, now: number): QualityTier | undefined {
    if (now < this.heldUntil || !(deltaMs > 0) || deltaMs > IGNORE_MS) return;
    if (this.started < 0) { this.started = now; this.frames = this.total = this.hitches = 0; return; }
    this.frames++; this.total += deltaMs;
    if (deltaMs > HITCH_MS) this.hitches++;
    if (now - this.started < WINDOW_MS) return;
    const average = this.total / this.frames, hitches = this.hitches;
    this.started = -1;
    const index = QUALITY_TIERS.indexOf(this.tier);
    if (average > 25 || hitches >= 4) {
      this.calm = 0;
      if (index === 0) return;
      this.ceiling = index - 1;
      return this.set(index - 1, now);
    }
    if (average < 18.5 && hitches <= 1) {
      if (++this.calm >= 2 && index < this.ceiling) { this.calm = 0; return this.set(index + 1, now); }
    } else this.calm = 0;
  }

  private set(index: number, now: number): QualityTier {
    this.tier = QUALITY_TIERS[index];
    // The swap itself costs a few uploads; judge the new tier only once it is in place.
    this.hold(now, 4000);
    return this.tier;
  }
}
