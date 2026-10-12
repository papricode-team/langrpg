import type { MapPoint } from '../navigation';
import type { World } from '../world';
import type { GameItem, MiniGameHost, RoundResult, RoundSummary } from './types';

type Direction = 'links' | 'rechts' | 'oben' | 'unten';
const directions: readonly Direction[] = ['links', 'rechts', 'oben', 'unten'];
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const validPoint = (point: MapPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Map-aligned directions are inferred from actual feet positions. */
export function directionForSegment(from: MapPoint, to: MapPoint): Direction | undefined {
  if (!validPoint(from) || !validPoint(to) || distance(from, to) < .001) return undefined;
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? dx < 0 ? 'links' : 'rechts' : dy < 0 ? 'oben' : 'unten';
}
export function directionWord(pool: readonly GameItem[], lemma: string | undefined): GameItem | undefined {
  return pool.find(item => item.lemma === lemma);
}
export interface ReachedDeliveryNode { point: MapPoint; direction: Direction; checkpoint: boolean; }
/** The reached node supplies the answer; the target's label never supplies a wrong turn. */
export function reachedDeliveryNode(origin: MapPoint, target: MapPoint, alternatives: readonly MapPoint[], position: MapPoint): ReachedDeliveryNode | undefined {
  const expected = directionForSegment(origin, target);
  if (!expected || !validPoint(position)) return undefined;
  const radius = Math.max(2, Math.min(24, distance(origin, target) / 4));
  const other = alternatives.filter(point => validPoint(point) && distance(point, origin) > radius * 2 && distance(point, target) > .001
    && directionForSegment(origin, point) !== expected && distance(position, point) <= radius)
    .sort((a, b) => distance(position, a) - distance(position, b))[0];
  if (distance(position, target) <= radius && (!other || distance(position, target) <= distance(position, other))) return { point: target, direction: expected, checkpoint: true };
  const direction = other && directionForSegment(origin, other);
  return other && direction ? { point: other, direction, checkpoint: false } : undefined;
}

type DeliveryWorld = Pick<World, 'deliveryRoute' | 'getPlayerPosition' | 'showDeliveryCheckpoints' | 'showDeliveryArrival' | 'setInputEnabled'> & {
  deliveryChoices?(origin: MapPoint, target: MapPoint): MapPoint[];
};

export class WorldDeliveryRun {
  private overlay?: HTMLElement;
  private current = 1;
  private route!: { recipient: string; points: MapPoint[] };
  private item?: GameItem;
  private pool: GameItem[] = [];
  private alternatives: MapPoint[] = [];
  private armedPosition?: MapPoint;
  private awaitingOrigin = false;
  private raf = 0;
  private previous = 0;
  private elapsed = 0;
  private roundMs = 0;
  private paused = false;
  private manualPause = false;
  private busy = false;
  private destroyed = false;
  private hinted = false;
  private heard = false;
  private generation = 0;
  private movementEnabled?: boolean;
  private pending?: RoundResult;
  private pendingCheckpoint = false;
  private seen = new Set<string>();
  private chain = 0;
  private summary: RoundSummary = { gameId: 'delivery-run', attempts: 0, correct: 0, hinted: 0, activeMs: 0, longestChain: 0 };
  constructor(private world: DeliveryWorld, private host: MiniGameHost, private finish: () => void, private active: () => boolean = () => true) {}

  mount(root: HTMLElement): boolean {
    const route = this.world.deliveryRoute();
    if (this.destroyed || this.overlay || this.host.silent || !route || route.points.length < 2 || !route.points.every(validPoint)) return false;
    const points = route.points.filter((point, index) => index === 0 || distance(point, route.points[index - 1]) > .001);
    if (points.length < 2) return false;
    this.route = { ...route, points };
    this.pool = this.host.pool({ modality: 'listening' }).filter(item => directions.includes(item.lemma as Direction));
    // Alternatives must be restored as well as the spoken target; an unknown
    // branch must never be invented as lexical evidence.
    if (directions.some(direction => !directionWord(this.pool, direction))) return false;
    this.overlay = document.createElement('section');
    this.overlay.className = 'delivery-run-overlay';
    this.overlay.setAttribute('aria-label', 'Lina’s courtyard delivery');
    this.overlay.innerHTML = '<small>LINA · COURTYARD DELIVERY</small><strong>Follow the voice through town.</strong><p role="status" aria-live="polite"></p><div><button type="button" data-delivery="replay">Hear again</button><button type="button" data-delivery="pause">Pause</button><button type="button" data-delivery="save" hidden>Retry saving</button><button type="button" data-delivery="finish">Leave run</button></div>';
    root.append(this.overlay);
    this.overlay.addEventListener('click', this.click);
    this.next();
    this.previous = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    return true;
  }
  private click = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-delivery]');
    if (!button || button.disabled || this.destroyed) return;
    switch (button.dataset.delivery) {
      case 'replay': if (!this.pending && !this.busy) { this.hinted = true; void this.speak(); } break;
      case 'pause': if (this.paused) this.resume(true); else this.pause(true); break;
      case 'save': void this.save(); break;
      case 'finish': this.complete(); break;
    }
  };
  private get status() { return this.overlay!.querySelector<HTMLElement>('p')!; }
  private isActive() { return !document.hidden && this.active(); }
  get canMove(): boolean { return !this.destroyed && !this.paused && this.isActive() && this.heard && !this.busy && !this.pending; }
  private syncInput() {
    const enabled = this.canMove;
    if (this.movementEnabled !== enabled) { this.movementEnabled = enabled; this.world.setInputEnabled(enabled); }
    if (this.overlay) this.overlay.querySelector<HTMLButtonElement>('[data-delivery="replay"]')!.disabled = this.paused || this.busy || !!this.pending;
  }
  private next() {
    if (this.current >= this.route.points.length) { this.world.showDeliveryArrival(this.route.recipient); this.complete(); return; }
    const origin = this.route.points[this.current - 1], target = this.route.points[this.current];
    this.item = directionWord(this.pool, directionForSegment(origin, target));
    const choices=[target,...(this.world.deliveryChoices?.(origin,target)??[])].filter((point,index,points)=>validPoint(point)&&distance(point,origin)>2&&points.findIndex(other=>directionForSegment(origin,other)===directionForSegment(origin,point))===index);
    this.alternatives = [...choices, ...this.route.points];
    // Equal unlit branch markers carry no route solution. The starting/previous
    // lantern stays visible so a wrong turn can always be corrected on touch.
    const visited=this.route.points.slice(0,this.current);
    this.world.showDeliveryCheckpoints([...visited,...choices.filter(point=>!visited.some(previous=>distance(point,previous)<2))],visited.length);
    this.roundMs = 0; this.hinted = this.seen.has(this.item!.lexemeId); this.heard = false;
    this.pending = undefined; this.awaitingOrigin = false; this.armedPosition = undefined;
    this.status.textContent = `Lantern ${this.current} / ${this.route.points.length - 1} · ${this.summary.correct} restored directions`;
    if (!this.paused && this.isActive()) void this.speak();
    this.syncInput();
  }
  private async speak() {
    if (!this.item || this.destroyed || this.paused || !this.isActive() || this.pending) return;
    const version = ++this.generation, item = this.item;
    this.heard = false; this.armedPosition = undefined; this.syncInput();
    try {
      await this.host.speak(item);
      if (this.destroyed || this.paused || !this.isActive() || version !== this.generation) return;
      const position = this.world.getPlayerPosition(), origin = this.route.points[this.current - 1], target = this.route.points[this.current];
      const originRadius = Math.max(2, Math.min(24, distance(origin, target) / 4));
      this.awaitingOrigin ||= !position || distance(position, origin) > originRadius;
      if (position) this.armedPosition = { ...position };
      this.heard = true; this.previous = performance.now(); this.syncInput();
      if (this.awaitingOrigin) this.status.textContent = `Nein, ${item.lemma}. Return to the previous lantern, then follow the voice.`;
    } catch (error) {
      if (!this.destroyed && version === this.generation) { this.status.textContent = error instanceof Error ? error.message : 'Audio unavailable. Hear the direction again.'; this.syncInput(); }
    }
  }
  private tick = (now: number) => {
    if (this.destroyed) return;
    const delta = Math.max(0, Math.min(100, now - this.previous)); this.previous = now;
    if (!this.isActive()) this.pause();
    else if (this.paused && !this.manualPause) this.resume();
    if (!this.paused && !this.busy && !this.pending && this.heard && this.isActive()) {
      const position = this.world.getPlayerPosition(), target = this.route.points[this.current], origin = this.route.points[this.current - 1];
      if (position && validPoint(position)) {
        if (this.awaitingOrigin) {
          if (distance(position, origin) <= Math.max(2, Math.min(24, distance(origin, target) / 4))) {
            this.awaitingOrigin = false; this.roundMs = 0; this.armedPosition = { ...position };
            this.status.textContent = 'Follow Lina’s direction to the next lantern.';
          }
        } else {
          this.elapsed += delta; this.roundMs += delta;
          const moved = this.armedPosition && distance(position, this.armedPosition) >= Math.min(8, distance(origin, target) / 3);
          const reached = moved && reachedDeliveryNode(origin, target, this.alternatives, position);
          if (reached || this.roundMs >= 15000) {
            this.pendingCheckpoint = !!reached && reached.checkpoint;
            this.pending = { lexemeId: this.item!.lexemeId, modality: 'listening', hinted: this.hinted, responseMs: this.roundMs, answer: reached ? reached.direction : '__timeout__', answerKind: 'lexeme' };
            this.syncInput(); void this.save();
          }
        }
      }
    }
    if (!this.destroyed) this.raf = requestAnimationFrame(this.tick);
  };
  private async save() {
    if (this.busy || !this.pending || this.destroyed) return;
    this.busy = true; this.syncInput();
    const pending = this.pending, checkpoint = this.pendingCheckpoint;
    try {
      const result = await this.host.submit(pending);
      if (this.destroyed || pending !== this.pending) return;
      this.summary.attempts++; if (result.correct) this.summary.correct++; if (pending.hinted) this.summary.hinted++;
      this.seen.add(pending.lexemeId);
      this.pending = undefined; this.overlay!.querySelector<HTMLButtonElement>('[data-delivery="save"]')!.hidden = true;
      if (result.correct && checkpoint) {
        this.chain++; this.summary.longestChain = Math.max(this.chain, this.summary.longestChain);
        if (!this.paused && this.isActive()) this.host.audio.sfx('lantern-light');
        this.current++; this.next();
      } else {
        this.chain = 0; this.hinted = true; this.roundMs = 0; this.heard = false; this.awaitingOrigin = true;
        this.status.textContent = `Nein, ${this.item!.lemma}. Return to the previous lantern.`;
        this.host.expose([this.item!.lexemeId]);
        if (!this.paused && this.isActive()) void this.speak();
      }
    } catch (error) {
      if (!this.destroyed) {
        this.status.textContent = error instanceof Error ? error.message : 'This direction could not be saved.';
        this.overlay!.querySelector<HTMLButtonElement>('[data-delivery="save"]')!.hidden = false;
      }
    } finally { this.busy = false; this.syncInput(); }
  }
  /** Visibility pauses do not undo a pause the learner chose themselves. */
  pause(manual = false) {
    if (this.destroyed || !this.overlay) return;
    this.manualPause ||= manual;
    if (this.paused) return;
    this.paused = true; this.heard = false; this.generation++; this.host.audio.stop(); this.syncInput();
    this.overlay.querySelector('[data-delivery="pause"]')!.textContent = 'Resume';
  }
  resume(manual = false) {
    if (this.destroyed || !this.overlay || !this.paused || !this.isActive() || (this.manualPause && !manual)) return;
    this.manualPause = false; this.paused = false; this.previous = performance.now();
    this.overlay.querySelector('[data-delivery="pause"]')!.textContent = 'Pause';
    if (!this.pending) { this.hinted = true; void this.speak(); }
    this.syncInput();
  }
  private complete() {
    if (this.destroyed) return;
    this.summary.activeMs = this.elapsed;
    this.host.end({ ...this.summary }); this.destroy(); this.finish();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.generation++; cancelAnimationFrame(this.raf);
    this.world.showDeliveryCheckpoints([], 0); this.host.audio.stop(); this.syncInput();
    this.overlay?.removeEventListener('click', this.click); this.overlay?.remove();
  }
}
