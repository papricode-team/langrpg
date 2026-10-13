import { afterEach, vi } from 'vitest';
import * as Phaser from 'phaser';
import { phaserHarness, seedJson, seedTexture, settle, trackGame, type PhaserHarness } from './phaser-harness';
import { World, type WorldOptions } from '../world';
import { MODULAR_ART, modularAssets, partTextureKey } from '../avatar-options';
import { getInterior, type InteriorId } from '../interiors';
import type { MapId } from '../maps';
import { SceneKeys, type WorldPlayer } from '../world-state';
import type { WorldScene } from '../world-scene';
import type { InteriorScene } from '../interior-scene';

/** A booted World on real Phaser, stepped by hand. Import './phaser-dom' before this module. */
// Each test boots a whole map, including its navigation grids; allow for that when every file runs in parallel.
vi.setConfig({ testTimeout: 30000 });

export interface Fixture {
  harness: PhaserHarness;
  world: World;
  game: Phaser.Game;
  /** The live map scene, opened up so tests can inspect internals. */
  town: any;
  calls: { npc: ReturnType<typeof vi.fn>; move: ReturnType<typeof vi.fn>; mapReady: ReturnType<typeof vi.fn>; interiorChange: ReturnType<typeof vi.fn>; interiorInteract: ReturnType<typeof vi.fn>; object: ReturnType<typeof vi.fn>; ready: ReturnType<typeof vi.fn> };
  room(): any;
  /** Step until a condition holds, flushing loader microtasks between frames. */
  until(condition: () => boolean, limit?: number): Promise<void>;
}

/** Seed the art a scene needs so Phaser's loader skips it; everything else fails without a network. */
export function seedSharedArt(game: Phaser.Game, playerArt = true): void {
  seedJson(game, 'residents-animations', { version: 1, framesPerAsset: 1, assets: {} });
  if (playerArt) for (const asset of modularAssets) seedTexture(game, partTextureKey(asset.id, ''), Array.from({ length: MODULAR_ART.frameCount }, (_, index) => index));
  seedTexture(game, 'main-cast', Array.from({ length: 28 }, (_, index) => index));
  seedTexture(game, 'story-cast', Array.from({ length: 8 }, (_, index) => index));
}

const fixtures: Fixture[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) { fixture.world.destroy(); fixture.harness.restore(); } document.body.replaceChildren(); });

export async function bootWorld(options: Partial<WorldOptions> & { mapId?: MapId; playerArt?: boolean; seed?: (game: Phaser.Game) => void } = {}): Promise<Fixture> {
  const harness = phaserHarness();
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 900 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  document.body.append(container);
  const calls = { npc: vi.fn(), move: vi.fn(), mapReady: vi.fn(), interiorChange: vi.fn(), interiorInteract: vi.fn(), object: vi.fn(), ready: vi.fn() };
  const world = new World(container, { onNpc: calls.npc, onMove: calls.move, onMapReady: calls.mapReady, onInteriorChange: calls.interiorChange,
    onInteriorInteract: calls.interiorInteract, onObject: calls.object, onReady: calls.ready, motion: 'full', time: { mode: 'manual', hour: 12 }, ...options });
  const game = trackGame((world as unknown as { game: Phaser.Game }).game);
  if (!game.isBooted) await new Promise<void>(resolve => game.events.once(Phaser.Core.Events.READY, () => resolve()));
  game.loop.stop();
  seedSharedArt(game, options.playerArt ?? true);
  options.seed?.(game);
  if (options.mapId) world.setMap(options.mapId);
  const fixture: Fixture = {
    harness, world, game, calls,
    town: game.scene.getScene(SceneKeys.World) as WorldScene,
    room: () => game.scene.getScene(SceneKeys.Interior) as InteriorScene,
    async until(condition, limit = 600) {
      for (let frame = 0; frame < limit && !condition(); frame++) await settle(harness, 1);
      if (!condition()) throw new Error('Condition not reached');
    },
  };
  fixtures.push(fixture);
  await fixture.until(() => fixture.town.ready);
  return fixture;
}

export function player(id: string, interiorId?: InteriorId, mapId: WorldPlayer['mapId'] = 'lindenhafen'): WorldPlayer {
  const position = interiorId ? getInterior(interiorId).spawn : { x: .52, y: .61 };
  return { id, name: id, ...position, mapId, interiorId, avatar: { hair: '#000000', skin: '#ccaa99', outfit: '#557755' } };
}

