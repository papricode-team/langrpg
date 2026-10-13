import * as Phaser from 'phaser';
import { vi } from 'vitest';

/**
 * Deterministic control over a real Phaser game in tests: a wall clock for tweens, manual frames
 * for the loop, a loader that never touches the network, and helpers that seed assets so scenes
 * build exactly what a test needs.
 */
export interface PhaserHarness {
  /** Advance the game by whole frames, moving the tween clock with it. */
  step(frames?: number, ms?: number): void;
  /** Advance by a duration in milliseconds. */
  advance(ms: number, frameMs?: number): void;
  /** Files the loader was asked for, in order. */
  requests: string[];
  /** Hold matching requests until released, instead of failing them at once. */
  hold(match: (key: string) => boolean): void;
  /** Finish held requests. By default they fail; `arrive` delivers them as completed assets first. */
  release(match?: (key: string) => boolean, arrive?: boolean): void;
  restore(): void;
}

let installed: PhaserHarness | undefined;

export function phaserHarness(): PhaserHarness {
  installed?.restore();
  let wall = 1_000_000, time = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => wall);
  const requests: string[] = [];
  const held: Phaser.Loader.File[] = [];
  let holding: ((key: string) => boolean) | undefined;
  const file = Phaser.Loader.File.prototype as unknown as { load: () => void };
  const original = file.load;
  // No network: a request either waits for the test or fails on the next microtask.
  file.load = function (this: Phaser.Loader.File) {
    this.state = Phaser.Loader.FILE_LOADING;
    requests.push(this.key);
    if (holding?.(this.key)) { held.push(this); return; }
    queueMicrotask(() => this.onError(undefined as unknown as XMLHttpRequest, undefined as unknown as ProgressEvent));
  };
  const harness: PhaserHarness = {
    requests,
    step(frames = 1, ms = 1000 / 60) {
      for (const game of liveGames) if (game.isBooted) game.loop.stop();
      for (let frame = 0; frame < frames; frame++) {
        wall += ms; time += ms;
        for (const game of liveGames) if (game.isBooted && !destroyed(game)) game.step(time, ms);
      }
    },
    advance(ms, frameMs = 1000 / 60) { harness.step(Math.max(1, Math.round(ms / frameMs)), frameMs); },
    hold(match) { holding = match; },
    release(match = () => true, arrive = false) {
      for (const pending of held.filter(item => match(item.key))) {
        held.splice(held.indexOf(pending), 1);
        if (arrive) {
          const game = pending.loader.systems.game;
          if (pending.type === 'json') game.cache.json.add(pending.key, {});
          else if (!game.textures.exists(pending.key)) seedTexture(game, pending.key);
          pending.loader.emit(Phaser.Loader.Events.FILE_COMPLETE, pending.key, pending.type, undefined);
        }
        pending.onError(undefined as unknown as XMLHttpRequest, undefined as unknown as ProgressEvent);
      }
    },
    restore() {
      file.load = original;
      clock.mockRestore();
      for (const game of liveGames) if (!destroyed(game)) game.destroy(true);
      liveGames.clear();
      installed = undefined;
    },
  };
  installed = harness;
  return harness;
}

const liveGames = new Set<Phaser.Game>();
const destroyed = (game: Phaser.Game) => (game as unknown as { pendingDestroy?: boolean }).pendingDestroy === true;
/** Games created while a harness is active are stepped by it and destroyed with it. */
export function trackGame(game: Phaser.Game): Phaser.Game { liveGames.add(game); return game; }

/** A texture with named or numbered frames of a fixed size; returns the key. */
export function seedTexture(game: Phaser.Game, key: string, frames: readonly (string | number)[] = [], width = 4, height = 4,
  pivot?: { x: number; y: number }): string {
  if (game.textures.exists(key)) game.textures.remove(key);
  const texture = game.textures.createCanvas(key, Math.max(1, width * Math.max(1, frames.length)), height)!;
  frames.forEach((name, index) => {
    const frame = texture.add(name, 0, index * width, 0, width, height);
    if (frame && pivot) { frame.customPivot = true; frame.pivotX = pivot.x; frame.pivotY = pivot.y; }
  });
  texture.refresh();
  return key;
}

export function seedJson(game: Phaser.Game, key: string, value: unknown): void {
  if (game.cache.json.exists(key)) game.cache.json.remove(key);
  game.cache.json.add(key, value);
}

/** Resolve once a microtask-driven loader batch has settled. */
export async function settle(harness: PhaserHarness, frames = 3): Promise<void> {
  for (let round = 0; round < frames; round++) {
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    harness.step();
  }
}
