// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as Phaser from 'phaser';
import { settle } from './test-support/phaser-harness';
import { bootWorld, player } from './test-support/world-fixture';
import { buildingEntrances, getInterior } from './interiors';
import { getMap } from './maps';
import { SceneKeys } from './world-state';

const status = (game: Phaser.Game, key: string) => game.scene.getScene(key)?.sys.settings.status;

describe('scene lifecycle on the real Phaser scene manager', () => {
  it('boots shared art first, then starts the map behind a curtain that lifts once the map reports ready', async () => {
    const { game, town, calls, until } = await bootWorld();
    expect(status(game, SceneKeys.Boot)).toBe(Phaser.Scenes.SHUTDOWN);
    expect(town.mapSpec.id).toBe('lindenhafen');
    expect(calls.ready).toHaveBeenCalledOnce();
    expect(status(game, SceneKeys.Travel)).toBe(Phaser.Scenes.RUNNING);
    // No terrain tile can load here, so the curtain lifts on its four-second limit.
    await until(() => calls.mapReady.mock.calls.length > 0, 400);
    expect(calls.mapReady).toHaveBeenCalledWith('lindenhafen');
    await until(() => status(game, SceneKeys.Travel) === Phaser.Scenes.SHUTDOWN, 120);
  });

  it('travels by restarting the map scene, cancelling a destination that is still loading', async () => {
    const fixture = await bootWorld();
    const { world, game, harness, calls, until } = fixture;
    harness.hold(key => key.startsWith('waldruh'));
    world.setMap('waldruh');
    await settle(harness, 2);
    expect(status(game, SceneKeys.World)).toBe(Phaser.Scenes.LOADING);
    expect(status(game, SceneKeys.Travel)).toBe(Phaser.Scenes.RUNNING);
    world.setMap('nebelstadt');
    harness.release();
    await until(() => fixture.town.ready && fixture.town.mapSpec.id === 'nebelstadt');
    await until(() => calls.mapReady.mock.calls.some(([id]) => id === 'nebelstadt'), 400);
    expect(calls.mapReady.mock.calls.map(([id]) => id)).not.toContain('waldruh');
    // One stale wake handler per run would replay arrivals; restarts must not accumulate listeners.
    expect(fixture.town.events.listenerCount(Phaser.Scenes.Events.WAKE)).toBe(1);
  });

  it('returns to the spawn without reloading when travel targets the current map', async () => {
    const { world, town, calls, until } = await bootWorld();
    const preload = vi.spyOn(town, 'preload');
    town.local.x = 50; town.local.y = 50;
    world.setMap('lindenhafen');
    await until(() => calls.mapReady.mock.calls.length > 0, 30);
    expect(preload).not.toHaveBeenCalled();
    const spawn = town.navigation.closestPoint(town.mapSpec.spawn.x * town.worldWidth, town.mapSpec.spawn.y * town.worldHeight);
    expect({ x: town.local.x, y: town.local.y }).toEqual(spawn);
  });

  it('opens a room in its own scene while the town sleeps with its terrain intact, then wakes at the door', async () => {
    const { world, game, town, calls, room, until } = await bootWorld({ motion: 'reduced' });
    const background = town.background;
    world.enterInterior('cafe');
    await until(() => room().ready);
    expect(status(game, SceneKeys.World)).toBe(Phaser.Scenes.SLEEPING);
    expect(world.getInteriorId()).toBe('cafe');
    expect(calls.interiorChange).toHaveBeenCalledWith('cafe');
    expect(town.background).toBe(background);
    expect(background.destroyed).toBe(false);
    world.leaveInterior();
    await until(() => status(game, SceneKeys.World) === Phaser.Scenes.RUNNING && status(game, SceneKeys.Interior) === Phaser.Scenes.SHUTDOWN);
    expect(calls.interiorChange).toHaveBeenLastCalledWith(undefined);
    const door = buildingEntrances('lindenhafen').find(value => value.interiorId === 'cafe')!;
    expect({ x: town.local.x, y: town.local.y }).toEqual({ x: door.returnPoint.x * getMap('lindenhafen').width, y: door.returnPoint.y * getMap('lindenhafen').height });
  });

  it('walks into the doorway for 250ms without fading the avatar, holding input until the room opens', async () => {
    const { world, town, room, harness, until } = await bootWorld();
    world.setInputEnabled(true);
    world.enterInterior('cafe');
    expect(town.controlsEnabled).toBe(false);
    harness.advance(125);
    expect(town.local.root.alpha).toBe(1);
    harness.advance(200);
    expect(town.local.root.alpha).toBe(1);
    await until(() => room().ready);
    expect(world.getInteriorId()).toBe('cafe');
  });

  it('cancels a pending doorway walk and returns the player to walkable ground', async () => {
    const { world, town, harness } = await bootWorld();
    world.enterInterior('cafe');
    harness.advance(100);
    world.leaveInterior();
    harness.advance(400);
    expect(world.getInteriorId()).toBeUndefined();
    expect(town.local.root.alpha).toBe(1);
    expect(town.navigation.isWalkable(town.local.x, town.local.y)).toBe(true);
    expect(town.controlsEnabled).toBe(true);
  });

  it('applies a server-confirmed room without the doorway walk, and leaves on confirmation too', async () => {
    const { world, game, room, until } = await bootWorld();
    world.confirmInterior('bakery');
    await until(() => room().ready);
    expect(room().interiorId).toBe('bakery');
    world.confirmInterior(undefined);
    await until(() => status(game, SceneKeys.World) === Phaser.Scenes.RUNNING);
    expect(world.getInteriorId()).toBeUndefined();
  });

  it('pauses the scene behind a menu and hides it under a full-screen activity, keeping the camera still', async () => {
    const { world, game, town } = await bootWorld();
    const camera = town.cameras.main, before = { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    world.setPresentation('paused');
    expect(status(game, SceneKeys.World)).toBe(Phaser.Scenes.PAUSED);
    expect(town.sys.settings.visible).toBe(true);
    world.setPresentation('hidden');
    expect(town.sys.settings.visible).toBe(false);
    world.setPresentation('live');
    expect(status(game, SceneKeys.World)).toBe(Phaser.Scenes.RUNNING);
    expect(town.sys.settings.visible).toBe(true);
    expect({ x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom }).toEqual(before);
  });

  it('queues commands for a room that is still loading and runs them once it can walk', async () => {
    const { world, room, until, calls } = await bootWorld({ motion: 'reduced' });
    world.enterInterior('inn');
    const spec = getInterior('inn').npcs[0];
    world.focusNpc(spec.id);
    await until(() => room().ready && !(world as unknown as { pending: unknown[] }).pending.length);
    expect(calls.interiorInteract.mock.calls.length + (room().pendingInteraction ? 1 : 0)).toBeGreaterThan(0);
  });

  it('shows and moves only players in the same room and region', async () => {
    const { world, town, room, harness, until, calls } = await bootWorld({ motion: 'reduced' });
    world.setPlayers([player('self'), player('outside')], 'self');
    expect([...town.peers.keys()]).toEqual(['outside']);
    world.enterInterior('cafe');
    await until(() => room().ready);
    world.setPlayers([player('self', 'cafe'), player('friend', 'cafe'), player('outside'),
      player('elsewhere', 'bakery'), player('another-region', 'cafe', 'waldruh')], 'self');
    expect([...room().peers.keys()]).toEqual(['friend']);
    // The sleeping town keeps its own outdoor peers current for the return.
    expect([...town.peers.keys()]).toEqual(['outside']);
    const friend = room().peers.get('friend');
    world.setPlayers([player('self', 'cafe'), { ...player('friend', 'cafe'), x: getInterior('cafe').spawn.x - .03 }], 'self');
    const before = friend.x;
    harness.step(4);
    expect(friend.x).toBeLessThan(before);
    room().local.x += 40;
    harness.step(6);
    expect(calls.move).toHaveBeenCalledWith(room().local.x / room().worldWidth, room().local.y / room().worldHeight);
    world.setPlayers([player('self', 'cafe')], 'self');
    expect(room().peers.size).toBe(0);
  });

  it('keeps outdoor snapshots from moving the indoor self', async () => {
    const { world, room, harness, until } = await bootWorld({ motion: 'reduced' });
    world.setPlayers([player('self'), player('friend', 'cafe')], 'self');
    world.enterInterior('cafe');
    await until(() => room().ready);
    world.setPlayers([player('self', 'cafe'), player('friend', 'cafe')], 'self');
    harness.step();
    const indoors = { x: room().local.x, y: room().local.y };
    world.setPlayers([player('self'), player('friend', 'cafe')], 'self');
    expect({ x: room().local.x, y: room().local.y }).toEqual(indoors);
  });

  it('follows the player with Phaser\'s camera, keeping them framed under zoom', async () => {
    const { town, harness } = await bootWorld();
    for (const density of [1, 2]) {
      town.fitCamera(900 * density, 600 * density, density);
      harness.step(2);
      const camera = town.cameras.main, view = camera.worldView;
      const centerX = view.x + view.width / 2;
      expect(Math.abs(centerX - town.local.x)).toBeLessThan(view.width * .08 + 1);
      expect(town.local.y).toBeGreaterThan(view.y);
      expect(town.local.y).toBeLessThan(view.bottom);
    }
  });
});
