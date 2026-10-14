import type { MapPoint } from './navigation';

export const NPC_MIN_WALK_SECONDS = 1;

/** Slow down short legs rather than turn early or slide sideways around corners. */
export const npcTravelSeconds = (distance: number, speed: number): number => Math.max(NPC_MIN_WALK_SECONDS, distance / speed);

/** Story routines commit to a destination instead of chasing a shifting clock target. */
export class NpcRoutineWalk {
  private leg?: { from: MapPoint; to: MapPoint; elapsed: number; duration: number };
  private pause = 0;

  step(position: MapPoint, destination: MapPoint, seconds: number, canWalk: (from: MapPoint, to: MapPoint) => boolean): MapPoint {
    if (seconds <= 0) return { x: 0, y: 0 };
    if (this.pause > 0) {
      this.pause = Math.max(0, this.pause - seconds);
      return { x: 0, y: 0 };
    }
    if (!this.leg) {
      const distance = Math.hypot(destination.x - position.x, destination.y - position.y);
      // Accumulate subpixel schedule drift into an intentional step.
      if (distance < 2 || !canWalk(position, destination)) return { x: 0, y: 0 };
      this.leg = { from: { x: position.x, y: position.y }, to: { ...destination }, elapsed: 0, duration: npcTravelSeconds(distance, 36) };
    }
    const leg = this.leg;
    leg.elapsed = Math.min(leg.duration, leg.elapsed + seconds);
    const fraction = leg.elapsed / leg.duration;
    const next = { x: leg.from.x + (leg.to.x - leg.from.x) * fraction, y: leg.from.y + (leg.to.y - leg.from.y) * fraction };
    if (!canWalk(position, next)) {
      this.leg = undefined;
      this.pause = NPC_MIN_WALK_SECONDS;
      return { x: 0, y: 0 };
    }
    if (leg.elapsed >= leg.duration) {
      this.leg = undefined;
      this.pause = NPC_MIN_WALK_SECONDS;
    }
    return { x: next.x - position.x, y: next.y - position.y };
  }
}
