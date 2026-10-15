// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as Phaser from 'phaser';
import { World } from './world';
import { WorldScene } from './world-scene';
import { SceneKeys, WorldEvents } from './world-state';

/**
 * The facade's command routing, with stand-in scenes instead of a booted Phaser game. Phaser queues scene
 * restarts and wakes until its next step; the stand-ins model that by changing state only when told to.
 */
function facade() {
  const events = new Phaser.Events.EventEmitter();
  const values = new Map<string, unknown>([['mapId', 'lindenhafen'], ['interiorId', undefined], ['players', { players: [], selfId: 'me' }]]);
  const registry = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value); }, has: (key: string) => values.has(key) };
  let sleeping = false, active = true;
  const town = Object.create(WorldScene.prototype) as WorldScene;
  const plugin = { restart: vi.fn(), launch: vi.fn(), bringToTop: vi.fn(), wake: vi.fn(), isSleeping: () => sleeping };
  Object.assign(town, {
    ready: true, mapSpec: { id: 'lindenhafen' }, game: { events }, scene: plugin,
    sys: { isActive: () => active, isSleeping: () => sleeping, settings: { status: Phaser.Scenes.RUNNING }, setVisible: () => undefined },
    openInterior: vi.fn((id: string) => { values.set('interiorId', id); }), returnToSpawn: vi.fn(),
  });
  const interior = { ready: false, sys: { isActive: () => false, settings: { status: Phaser.Scenes.PENDING } }, leave: vi.fn() };
  const cinematics: { reduced?: boolean; complete: () => void }[] = [];
  const scenes = { getScene: (key: string) => key === SceneKeys.World ? town : key === SceneKeys.Interior ? interior : undefined, stop: vi.fn(), start: vi.fn(),
    isActive: () => false, run: vi.fn((_key: string, data: { reduced?: boolean; complete: () => void }) => { cinematics.push(data); }) };
  const world = Object.create(World.prototype) as World;
  Object.assign(world, { alive: true, pending: [], presentation: 'live', game: { events, registry, scene: scenes }, audio: { setVisible: () => undefined }, options: {},
    motionMode: 'full', motionPreference: { matches: false } });
  (world as unknown as { bindEvents(): void }).bindEvents();
  /** The queued restart has run and the new town has built and announced itself. */
  const newRunReady = (mapId: string) => { Object.assign(town, { mapSpec: { id: mapId }, ready: true }); events.emit(WorldEvents.ExploreReady, SceneKeys.World); };
  const control = {
    sleep: () => { sleeping = true; active = false; },
    wake: () => { sleeping = false; active = true; events.emit(WorldEvents.ExploreReady, SceneKeys.World); },
  };
  return { world, town, plugin, values, newRunReady, control, cinematics };
}

describe('server-confirmed rooms', () => {
  it('opens a room confirmed with a map change only once the restarted town is ready', () => {
    const { world, town, plugin, newRunReady } = facade();
    world.setMap('waldruh');
    expect(plugin.restart).toHaveBeenCalledWith({ mapId: 'waldruh' });
    world.confirmInterior('bakery');
    // The old Lindenhafen run is still on screen and must not open Waldruh's bakery.
    expect(town.openInterior).not.toHaveBeenCalled();
    newRunReady('waldruh');
    expect(town.openInterior).toHaveBeenCalledExactlyOnceWith('bakery', true);
  });

  it('drops a waiting room when a newer confirmation says the player is outside', () => {
    const { world, town, newRunReady } = facade();
    world.setMap('waldruh');
    world.confirmInterior('bakery');
    world.confirmInterior(undefined);
    newRunReady('waldruh');
    expect(town.openInterior).not.toHaveBeenCalled();
  });

  it('opens a confirmed room immediately when the town is already ready', () => {
    const { world, town } = facade();
    world.confirmInterior('cafe');
    expect(town.openInterior).toHaveBeenCalledExactlyOnceWith('cafe', true);
  });
});

describe('travel to the current map', () => {
  it('returns a sleeping town to the spawn only after it wakes', () => {
    const { world, town, plugin, control } = facade();
    control.sleep();
    world.setMap('lindenhafen');
    expect(plugin.wake).toHaveBeenCalledWith(SceneKeys.World, { instant: true });
    expect(town.returnToSpawn).not.toHaveBeenCalled();
    control.wake();
    expect(town.returnToSpawn).toHaveBeenCalledOnce();
  });

  it('returns an awake town to the spawn at once', () => {
    const { world, town, plugin } = facade();
    world.setMap('lindenhafen');
    expect(plugin.wake).not.toHaveBeenCalled();
    expect(town.returnToSpawn).toHaveBeenCalledOnce();
  });
});

describe('story beats', () => {
  it('reports a beat as played once it has been shown, and as skipped while the town is changing', async () => {
    const { world, cinematics, newRunReady } = facade();
    const shown = world.playCutscene('arrival');
    expect(cinematics).toHaveLength(1);
    cinematics[0].complete();
    await expect(shown).resolves.toBe('played');
    world.setMap('waldruh');
    await expect(world.playCutscene('travel')).resolves.toBe('skipped');
    newRunReady('waldruh');
    const later = world.playCutscene('travel');
    cinematics[1].complete();
    await expect(later).resolves.toBe('played');
  });

  it('plays a still version for reduced motion instead of skipping the story', async () => {
    const { world, cinematics } = facade();
    Object.assign(world, { motionMode: 'reduced' });
    const shown = world.playCutscene('arrival');
    expect(cinematics[0].reduced).toBe(true);
    cinematics[0].complete();
    await expect(shown).resolves.toBe('played');
  });
});
