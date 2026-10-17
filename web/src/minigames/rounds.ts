import type { GameItem, Modality } from './types';
/** A word is asked at most this many times per run before misses; a small pool ends the run early instead of drilling it. */
export const maxCuesPerWord = 2;
/** Misses return after two other items, and remain supported recalls on every retry. */
export class RoundQueue {
  private queue: { item: GameItem; retry: boolean }[];
  private presented = new Set<string>();
  constructor(pool: readonly GameItem[], count: number) {
    this.queue = pool.length ? Array.from({length:Math.min(count,pool.length*maxCuesPerWord)},(_,index) => ({item:pool[index%pool.length],retry:false})) : [];
  }
  next() {
    const next = this.queue.shift();
    if (!next) return undefined;
    const retry = next.retry || this.presented.has(next.item.lexemeId);
    this.presented.add(next.item.lexemeId);
    return { item: next.item, retry };
  }
  miss(item: GameItem) { this.queue.splice(Math.min(2,this.queue.length),0,{item,retry:true}); }
  get remaining() { return this.queue.length; }
}
export function optionCount(item: GameItem, modality: Modality): number { return item.recalls[modality] < 1 ? 2 : (item.stabilityByMode?.[modality] ?? item.stability) < 7 ? 4 : 6; }
export function responseLimit(item: GameItem, production: boolean): number {
  const stability = production ? item.stabilityByMode?.production ?? item.stability : item.stability;
  return production ? stability >= 7 ? 10000 : 18000 : stability >= 7 ? 6000 : 12000;
}
