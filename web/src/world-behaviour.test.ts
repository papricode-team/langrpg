import {terrainMaterialKey} from './terrain-materials';
// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as Phaser from 'phaser';
import { seedJson, seedTexture, settle } from './test-support/phaser-harness';
import { bootWorld, type Fixture } from './test-support/world-fixture';
import type { MapId } from './maps';
import { timeAmbient } from './world-lighting';
import { regionPeopleFrames, regionPeopleKey } from './world-map-assets';
import { buildingEntrances, getInterior } from './interiors';
import { NavigationGrid, PLAYER_RADIUS } from './navigation';
import { sampleResidentMotion, type WorldResident } from './world-life';
import { characterFrame, MODULAR_ART } from './avatar-options';
import { castActor, castActorsForMap, CAST_ART } from './character-cast';
import { explorationZoom } from './world-camera';
import { WorldClock } from './world-clock';
import { residentActionFrames, residentActionKey, residentActionLooks, type ResidentActionLook } from './resident-action-art';
import { getWorldScene } from './scene-data';
import { sceneTerrainImage } from './scene-terrain';
import { SceneKeys } from './world-state';

const avatar = { hair: '#000000', skin: '#ccaa99', outfit: '#557755' };
const setView = (scene: any, x: number, y: number, right: number, bottom: number) => scene.cameras.main.worldView.setTo(x, y, right - x, bottom - y);
const seedActionArt = (game: Phaser.Game, mapId = 'lindenhafen') => {
  for (const look of Object.keys(residentActionLooks) as ResidentActionLook[]) seedTexture(game, residentActionKey(mapId, look), residentActionFrames);
};
/** Preview and detail images for every terrain tile of a period, so streamed terrain can display. */
const seedTerrain = (game: Phaser.Game, mapId: MapId, period: 'day' | 'night') => {
  const modular=getWorldScene(mapId).modularTerrain;
  if(modular)for(const id of new Set([modular.base,...modular.surfaces.map(surface=>surface.material)]))seedTexture(game,terrainMaterialKey(id),[],8,8);
  for (const tile of getWorldScene(mapId).terrain) {
    const detail = sceneTerrainImage(tile, period);
    seedTexture(game, detail.key, [], 8, 8);
    const preview = period === 'night' && tile.nightAsset ? tile.nightPreviewAsset : tile.dayPreviewAsset;
    if (preview) seedTexture(game, preview.replace(/^\/assets\//, '').replace(/\.[^.]+$/, ''), [], 8, 8);
  }
};
const manifest = (assets: Record<string, unknown>, terrain?: string) => ({ version: 3, framesPerAsset: 1, terrain, assets });
const sheet = (key: string, frames = ['tree-0']) => ({ key, frames, fps: 0, width: 100, height: 120, referenceWidth: 100, originX: .5, originY: 1 });
const seedCastArt = (game: Phaser.Game, id: string) => {
  const actor = castActor(id)!;
  seedTexture(game, actor.key, Array.from({ length: 36 }, (_, frame) => frame), CAST_ART.width, CAST_ART.height);
};

describe('authored resident activities', () => {
  it('keeps authored tasks synchronized while reduced motion, local sky previews and culling change', async () => {
    const { world, town } = await bootWorld({ seed: game => seedActionArt(game) });
    let now = 0;
    town.clock = new WorldClock({ mode: 'cycle', hour: 12 }, () => now);
    town.clock.setSharedTime({ epoch: '2026-10-11T00:00:00.000Z', seed: '0123456789abcdef0123456789abcdef', serverTime: '2026-10-11T00:00:45.000Z', elapsedSeconds: 45, dayLengthSeconds: 720, day: 1, hour: 8.5 });
    setView(town, 0, 0, 3072, 2048);
    town.updateActivityResidents();
    expect(world.getWorldStats().residents).toBe(15);
    const first = world.getActivityResidents();
    expect(first.find(resident => resident.name === 'Ella')?.state).toMatchObject({ phase: 'act', action: 'carry', heldObject: 'parcel' });
    const courier = town.activityResidents.find((resident: any) => resident.character.id === 'lindenhafen-parcel-courier');
    expect(courier.actionFigure.frame.name).toBe('carry'); expect(courier.prop.visible).toBe(false);
    expect(courier.character.layers.every((layer: any) => !layer.visible)).toBe(true);
    world.setMotionPreference('reduced');
    world.setWeatherPreview('shower'); // A local preview must not change shared physical state.
    town.clock.configure({ mode: 'manual', hour: 22 });
    setView(town, -3000, -3000, -2000, -2000);
    const visit = town.activityWorld.day(town.clock.simulationTime()).plan.activities.find((item: any) => item.residentId === 'lindenhafen-promenade-reader' && item.task.id === 'morning-reading');
    now = (visit.arrival + 7 - 7 * 30 - 45) * 1000; town.updateActivityResidents();
    const expected = town.activityWorld.sample(town.clock.simulationTime());
    expect(world.getActivityResidents().map(resident => resident.state)).toEqual(expected);
    expect(world.getActivityResidents()).not.toEqual(first);
    expect(town.activityResidents.every((resident: any) => !resident.character.root.visible)).toBe(true);
    const reader = town.activityResidents.find((resident: any) => resident.character.id === 'lindenhafen-promenade-reader');
    expect(reader.actionFigure.frame.name).toBe('read'); expect(reader.actionFigure.flipX).toBe(true);
    setView(town, 0, 0, 3072, 1024);
    world.setMotionPreference('full'); town.updateActivityResidents();
    expect(world.getActivityResidents().map(resident => resident.state)).toEqual(expected);
    now = (visit.finished + 1 - 7 * 30 - 45) * 1000; town.updateActivityResidents();
    expect(reader.sample.phase).toBe('return'); expect(reader.actionFigure.visible).toBe(false);
    expect(reader.character.layers.every((layer: any) => layer.visible)).toBe(true); expect(reader.prop.visible).toBe(false);
  });

  it('renders one parcel and one exchange speaker while respecting dialogue, culling and vocabulary intake', async () => {
    const { world, town } = await bootWorld({ seed: game => seedActionArt(game) });
    town.clock = new WorldClock({ mode: 'manual', hour: 11.75 });
    setView(town, 0, 0, 3072, 2048);
    world.setWeatherPreview('dry'); world.setMotionPreference('reduced'); world.observeResident('lindenhafen-promenade-reader');
    town.updateActivityResidents();
    const vendor = town.activityResidents.find((item: any) => item.character.id === 'lindenhafen-parcel-vendor');
    const customer = town.activityResidents.find((item: any) => item.character.id === 'lindenhafen-promenade-reader');
    const exchangeHour = (residentId: string) => {
      for (let seconds = 0; seconds < 720; seconds++) {
        const sample = town.activityWorld.sample({ seed: '0123456789abcdef0123456789abcdef', dayLengthSeconds: 720, elapsedSeconds: seconds }, 'dry')
          .find((item: any) => item.residentId === residentId);
        if (sample?.exchange?.speaking && sample.heldObject === 'parcel') return (7 + seconds / 30) % 24;
      }
      throw new Error(`No speaking parcel exchange for ${residentId}`);
    };
    town.clock.configure({ mode: 'manual', hour: exchangeHour(vendor.character.id) }); town.updateActivityResidents();
    expect(vendor.actionFigure.frame.name).toBe('carry'); expect(vendor.prop.visible).toBe(false); expect(vendor.speech.visible).toBe(true);
    expect(customer.sample.heldObject).toBeUndefined(); expect(customer.speech?.visible ?? false).toBe(false); expect(customer.character.name.visible).toBe(false);
    world.setLearningContext([], { words: {} }, new Set(), () => false); town.updateActivityResidents(); expect(vendor.speech.visible).toBe(false);
    world.setLearningContext([], { words: {} }, new Set(), () => true); town.clock.configure({ mode: 'manual', hour: exchangeHour(customer.character.id) }); town.updateActivityResidents();
    expect(customer.actionFigure.frame.name).toBe('carry'); expect(customer.prop.visible).toBe(false); expect(customer.speech.visible).toBe(true);
    expect(vendor.sample.heldObject).toBeUndefined(); expect(vendor.speech.visible).toBe(false);
    world.setConversationTarget('marta'); town.updateActivityResidents(); expect(customer.speech.visible).toBe(false);
    world.setConversationTarget(undefined); setView(town, -3000, -3000, -2000, -2000); town.updateActivityResidents();
    expect(customer.speech.visible).toBe(false); expect(customer.sample.heldObject).toBe('parcel'); expect(customer.character.root.visible).toBe(false);
  });
});

/** Run the scene's own update directly, at a fixed frame rate. */
const frame = (scene: any, ms = 50) => scene.update(0, ms);

it('does not re-sort a still world, but updates ordering when a character changes depth', async () => {
  const { world, town } = await bootWorld();
  world.setMotionPreference('reduced');
  // Story witnesses still walk to their time-of-day positions in reduced motion.
  for (let index = 0; index < 600; index++) frame(town);
  town.children.depthSort();
  const compare = vi.spyOn(town.children, 'sortByDepth');
  for (let index = 0; index < 120; index++) {
    frame(town, 1000 / 60);
    town.children.depthSort();
  }
  expect(compare.mock.calls.length).toBe(0);
  const oldDepth = town.local.root.depth;
  town.local.y += 1;
  town.animateCharacter(town.local, 0, 1, town.elapsed);
  town.children.depthSort();
  expect(town.local.root.depth).toBe(oldDepth + 4);
  expect(compare).toHaveBeenCalled();
});

describe('short player steps', () => {
  it('turns toward the witness when the last path segment approaches sideways', async () => {
    const { world, town, calls } = await bootWorld();
    world.setInputEnabled(true);
    town.local.x = 400; town.local.y = 600;
    const witness = town.createCharacter('otto', 'Otto', 600, 600, avatar);
    town.characters.set('otto', witness);
    town.navigation = { canWalkSegment: () => true, closestPoint: (x: number, y: number) => ({ x, y }), findPath: (_from: unknown, to: { x: number; y: number }) => [{ x: to.x, y: to.y + 30 }, to], move: (from: { x: number; y: number }, delta: { x: number; y: number }) => ({ x: from.x + delta.x, y: from.y + delta.y }) };
    world.focusNpc('otto');
    for (let step = 0; step < 100 && !calls.npc.mock.calls.length; step++) frame(town);
    expect(calls.npc).toHaveBeenCalledExactlyOnceWith('otto');
    expect(town.local.facing).toBe(1);
    expect(town.local.frame).toBe(characterFrame(1));
  });

  it.each(['lindenhafen', 'waldruh', 'nebelstadt'] as const)('follows an NPC lead through %s and ends facing the witness exactly once', async id => {
    const { world, town, calls } = await bootWorld({ mapId: id });
    world.setInputEnabled(true);
    const character = town.characters.get('otto');
    expect(character).toBeDefined();
    world.focusNpc('otto');
    expect(town.target).toBeDefined();
    let steps = 0;
    while (!calls.npc.mock.calls.length && steps++ < 1000) frame(town);
    expect(calls.npc).toHaveBeenCalledExactlyOnceWith('otto');
    expect(Math.hypot(character.x - town.local.x, character.y - town.local.y)).toBeLessThanOrEqual(140);
    const dx = character.x - town.local.x, dy = character.y - town.local.y;
    const facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 0 : 2;
    expect(town.local.facing).toBe(facing);
    expect(town.local.frame).toBe(characterFrame(facing));
    for (let extra = 0; extra < 5; extra++) frame(town);
    expect(calls.npc).toHaveBeenCalledOnce();
  });

  it('keeps a walking player facing their route when nearby cast members glance at them', async () => {
    const { world, town } = await bootWorld();
    const playerCharacter = town.local;
    const left = town.createCharacter('otto', 'Otto', playerCharacter.x - 35, playerCharacter.y, avatar);
    const right = town.createCharacter('marta', 'Marta', playerCharacter.x + 35, playerCharacter.y, avatar);
    town.animateCharacter(playerCharacter, 4, 0, 1);
    const walkingFrame = playerCharacter.frame;
    expect(walkingFrame).not.toBe(characterFrame(1));
    town.animateCharacter(left, 0, 0, 1);
    town.animateCharacter(right, 0, 0, 1);
    expect(playerCharacter.facing).toBe(1);
    expect(playerCharacter.frame).toBe(walkingFrame);
    expect(left.facing).toBe(1);
    expect(right.facing).toBe(3);
    town.characters.set('otto', left);
    world.setConversationTarget('otto');
    expect(playerCharacter.facing).toBe(3);
    expect(playerCharacter.frame).toBe(characterFrame(3));
  });

  it('excludes Elise from keyboard, direct approach and callbacks until the storm reveal', async () => {
    const { world, town, calls } = await bootWorld();
    world.setInputEnabled(true);
    for (const npc of town.characters.values()) npc.root.destroy();
    town.characters.clear(); town.objects.clear(); town.portals.clear();
    const elise = town.createCharacter('elise', 'Elise', town.local.x + 10, town.local.y, avatar);
    town.characters.set('elise', elise);
    town.setTerrainOnly(false);
    expect(elise.root.visible).toBe(false);
    expect(town.findNearestInteraction()).toBeUndefined();
    expect(town.interactionPosition('elise')).toBeUndefined();
    town.approachNpc('elise');
    town.triggerInteraction('elise');
    expect(calls.npc).not.toHaveBeenCalled();
    world.setStoryState({ completedQuestIds: ['b1-storm'], bellCount: 0 });
    expect(town.findNearestInteraction()?.id).toBe('elise');
    town.approachNpc('elise');
    expect(calls.npc).toHaveBeenCalledWith('elise');
  });

  it.each([30, 60, 120])('shows a brief click step and retains gait progress between clicks at %i Hz', async fps => {
    const { world, town } = await bootWorld();
    world.setInputEnabled(true);
    town.navigation = { findPath: (_from: unknown, to: { x: number; y: number }) => [to], canWalkSegment: () => true, closestPoint: (x: number, y: number) => ({ x, y }), move: (from: { x: number; y: number }, delta: { x: number; y: number }) => ({ x: from.x + delta.x, y: from.y + delta.y }) };
    const character = town.local, seen = new Set<number>();
    for (let click = 0; click < 40; click++) {
      // A nearby click reaches its destination in a single update.
      town.walkTo(character.x + 1, character.y);
      town.update(0, 1000 / fps);
      expect(character.frame).not.toBe(characterFrame(character.facing));
      expect(character.layers.every((layer: any) => layer.frame.name === character.frame)).toBe(true);
      seen.add(character.frame % MODULAR_ART.columns);
      const pose = character.frame, distance = character.walkDistance;
      town.animateCharacter(character, 0, 0, town.elapsed + .05);
      expect(character.frame).toBe(pose);
      town.animateCharacter(character, 0, 0, town.elapsed + .2);
      expect(character.frame).toBe(characterFrame(character.facing));
      expect(character.walkDistance).toBe(distance);
      town.elapsed += .25;
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(character.walkDistance).toBeCloseTo(40);
  });

  it('keeps a short E tap until the next frame, and consumes it once', async () => {
    const { world, town } = await bootWorld();
    world.setInputEnabled(true);
    let interactions = 0;
    town.interactNearest = () => { interactions++; return true; };
    town.queueKeyboardInteraction();
    frame(town); frame(town);
    expect(interactions).toBe(1);
    world.setInputEnabled(false);
    town.queueKeyboardInteraction();
    world.setInputEnabled(true);
    frame(town);
    expect(interactions).toBe(1);
  });
});

/** Open a room on the real scene manager, with the instant transition reduced motion uses. */
async function inRoom(id: Parameters<Fixture['world']['enterInterior']>[0]) {
  const fixture = await bootWorld({ motion: 'reduced' });
  fixture.world.setInputEnabled(true);
  fixture.world.enterInterior(id);
  await fixture.until(() => fixture.room().ready);
  return { ...fixture, room: fixture.room() };
}

describe('rooms', () => {
  it('restores a safe outdoor footprint when a saved doorway return is too close to scenery', async () => {
    const fixture = await bootWorld({ mapId: 'nebelstadt', motion: 'reduced' });
    const { world, town, game, until } = fixture;
    const returnPoint = buildingEntrances('nebelstadt').find(entrance => entrance.interiorId === 'supermarket')!.returnPoint;
    const x = returnPoint.x * town.mapSpec.width, y = returnPoint.y * town.mapSpec.height;
    // A newly placed object comes within three units of an old door return.
    town.navigation = new NavigationGrid([[[0,0],[town.mapSpec.width,0],[town.mapSpec.width,town.mapSpec.height],[0,town.mapSpec.height]]],
      [[[x+3,y-20],[x+33,y-20],[x+33,y+20],[x+3,y+20]]], town.mapSpec, { agentRadius: PLAYER_RADIUS });
    expect(town.navigation.isWalkable(x, y)).toBe(false);
    world.enterInterior('supermarket');
    await until(() => fixture.room().ready);
    world.leaveInterior();
    await until(() => game.scene.getScene(SceneKeys.World).sys.isActive());
    expect(town.navigation.isWalkable(town.local.x, town.local.y)).toBe(true);
    expect(town.navigation.clearanceAt(town.local.x, town.local.y)).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(Math.hypot(town.local.x - x, town.local.y - y)).toBeLessThan(PLAYER_RADIUS + town.navigation.cellSize);
    expect(town.local.targetX).toBe(town.local.x);
    expect(town.local.targetY).toBe(town.local.y);
  });

  it('lets an active conversation finish after visiting hours, then releases the visitor', async () => {
    const { world, room } = await inRoom('inn');
    const spec = getInterior('inn').npcs[0];
    const host = room.characters.get(spec.id);
    room.clock.configure({ mode: 'manual', hour: 17 });
    world.setConversationTarget(spec.id); expect(room.conversationTarget).toBe(spec.id);
    room.clock.configure({ mode: 'manual', hour: 23 });
    frame(room); expect(host.root.visible).toBe(true);
    world.setConversationTarget(undefined); frame(room); expect(host.root.visible).toBe(false);
    world.setConversationTarget(spec.id); expect(room.conversationTarget).toBeUndefined();
  });

  it('routes the inn host through a room greeting and hides both actor and station after visiting hours', async () => {
    const { world, room, calls } = await inRoom('inn');
    const inn = getInterior('inn'), spec = inn.npcs[0];
    room.clock.configure({ mode: 'manual', hour: 17 });
    const host = room.characters.get(spec.id);
    room.local.x = host.x - 30; room.local.y = host.y;
    world.focusNpc(spec.id);
    expect(calls.interiorInteract).toHaveBeenCalledExactlyOnceWith(spec.interactionId);
    expect(calls.npc).not.toHaveBeenCalled();
    expect(room.local.facing).toBe(1);
    room.clock.configure({ mode: 'manual', hour: 21 });
    expect(room.findNearestInteraction()?.id === spec.interactionId).toBe(false);
    world.focusNpc(spec.id); room.triggerInteraction(spec.interactionId);
    expect(calls.interiorInteract).toHaveBeenCalledOnce();
  });

  it('frames indoor bodies by the room painting and leaves the town zoom untouched', async () => {
    const { world, town, room, game, until } = await inRoom('inn');
    const { width, height } = town.scale;
    expect(room.fitZoom).toBeCloseTo(explorationZoom(width, height, room.density, true, getInterior('inn').characterHeight, { width: room.worldWidth, height: room.worldHeight }).zoom);
    world.leaveInterior();
    await until(() => game.scene.getScene(SceneKeys.World).sys.isActive());
    expect(town.fitZoom).toBeCloseTo(explorationZoom(width, height, town.density, false, undefined, { width: town.worldWidth, height: town.worldHeight }).zoom);
  });
});

describe('labels', () => {
  it('renders labels at Retina density and refreshes existing labels when density changes', async () => {
    const { town } = await bootWorld();
    town.fitCamera(1800, 1200, 2);
    expect(town.local.name.style.resolution).toBe(2);
    const peer = town.createCharacter('friend', 'Friend', 400, 400, avatar);
    expect(peer.name.style.resolution).toBe(2);
    town.peers.set('friend', peer);
    town.fitCamera(900, 600, 1);
    expect(town.local.name.style.resolution).toBe(1);
    expect(peer.name.style.resolution).toBe(1);
  });
});

describe('story characters and routines', () => {
  it('commits to one walking direction for a second even when its autonomous target reverses', async () => {
    const { town } = await bootWorld({ seed: game => seedCastArt(game, 'fritz') });
    town.navigation = { canWalkSegment: () => true };
    const fritz = town.characters.get('fritz'), anchor = town.mapSpec.npcs.find((npc: any) => npc.id === 'fritz');
    town.routineWalks.delete(fritz);
    fritz.x = anchor.x * town.worldWidth; fritz.y = anchor.y * town.worldHeight;
    town.local.x = 0; town.local.y = 0;
    setView(town, 0, 0, town.worldWidth, town.worldHeight);
    for (let frame = 0; frame < 100; frame++) {
      // The changing clock asks for opposing targets, independently of the player.
      town.clock.configure({ mode: 'manual', hour: frame === 0 || frame % 2 ? 9 : 17 });
      const previousX = fritz.x;
      town.updateCharacters(.01);
      expect(fritz.x).toBeGreaterThan(previousX);
      expect(fritz.facing).toBe(1);
      expect(fritz.figure.frame.name).not.toBe(characterFrame(1));
    }
  });

  it('holds only the conversation partner and walks back to routines after a long reading pause', async () => {
    const { world, town } = await bootWorld();
    town.navigation = { canWalkSegment: () => true, closestPoint: (x: number, y: number) => ({ x, y }) };
    town.clock.configure({ mode: 'manual', hour: 9 });
    const marta = town.characters.get('marta'), otto = town.characters.get('otto');
    const frozen = { x: marta.x, y: marta.y }, passing = { x: otto.x, y: otto.y };
    world.setConversationTarget('marta');
    town.clock.configure({ mode: 'manual', hour: 14 }); frame(town);
    expect({ x: marta.x, y: marta.y }).toEqual(frozen);
    expect(Math.hypot(otto.x - passing.x, otto.y - passing.y)).toBeGreaterThan(0);
    world.setConversationTarget(undefined); frame(town);
    const resumed = Math.hypot(marta.x - frozen.x, marta.y - frozen.y);
    expect(resumed).toBeGreaterThan(0); expect(resumed).toBeLessThanOrEqual(36 * .05 + .00001);
  });

  it('holds native standing poses even when obsolete idle animation sheets remain cached', async () => {
    const animation = { key: 'residents-animation-0', frames: ['marta-0', 'marta-1', 'marta-2', 'marta-3', 'marta-4', 'marta-5'],
      fps: 3, width: 147, height: 230, referenceWidth: 147, originX: .5, originY: 1 };
    const { town, game } = await bootWorld({ seed: game => seedCastArt(game, 'marta') });
    seedTexture(game, animation.key, animation.frames);
    seedJson(game, 'residents-animations', { assets: { marta: animation } });
    const marta = town.createCharacter('marta', 'Marta', 100, 100, avatar, undefined, 0);
    expect(marta.componentCast).toBe(true);
    expect(marta.walkingAnimation).toBeUndefined();
    expect(marta.idleAnimation).toBeUndefined();
    for (const seconds of [0, .4, .8, 1.2]) {
      town.decorativeElapsed = seconds;
      town.animateCharacter(marta, 0, 0, seconds);
      expect(marta.figure.texture.key).toBe(castActor('marta')!.key);
      expect(marta.figure.frame.name).toBe(characterFrame(0));
    }
    town.animateCharacter(marta, 4, 0, 2);
    expect(marta.figure.frame.name).not.toBe(characterFrame(1));
    for (const seconds of [2.1, 3, 17]) {
      town.animateCharacter(marta, 0, 0, seconds);
      expect(marta.figure.frame.name).toBe(characterFrame(1));
      expect(marta.figure.originY).toBe(CAST_ART.footY);
    }
  });
});

describe('day, night and travel streaming', () => {
  it('builds the atmosphere even when audio is unavailable', async () => {
    const { town } = await bootWorld({ mapId: 'waldruh' });
    expect(town.mapSpec.id).toBe('waldruh');
    expect(town.atmosphere).toBeDefined();
  });

  it('keeps the existing painting opaque while the next period fades over it', async () => {
    const { town, game, harness } = await bootWorld({ seed: game => { seedTerrain(game, 'lindenhafen', 'day'); seedTerrain(game, 'lindenhafen', 'night'); } });
    seedJson(game, 'lindenhafen-night-animations', manifest({}, 'lindenhafen-terrain'));
    harness.step(2);
    const oldBackground = town.background, oldScenery = town.scenery;
    town.applyPeriod('night');
    town.pendingTerrain?.update(town.cameras.main.worldView, town.cameras.main.zoom);
    town.applyPeriod('night');
    expect(town.background).not.toBe(oldBackground);
    expect(town.previousBackground).toBe(oldBackground);
    harness.advance(650);
    expect(oldBackground.alpha).toBe(1);
    expect(town.background.alpha).toBeGreaterThan(.2);
    expect(town.background.alpha).toBeLessThan(.9);
    harness.advance(900);
    expect(oldBackground.destroyed).toBe(true);
    expect(town.scenery).not.toBe(oldScenery);
    expect(town.background.alpha).toBe(1);
  });

  it('keeps the current scenery after a failed night download and retries before switching', async () => {
    const { world, town, game, harness } = await bootWorld({ motion: 'reduced', seed: game => { seedTerrain(game, 'lindenhafen', 'day'); seedTerrain(game, 'lindenhafen', 'night'); } });
    const dayScenery = town.scenery, dayBackground = town.background;
    seedJson(game, 'lindenhafen-night-animations', manifest({ tree: sheet('lindenhafen-night-trees') }, 'lindenhafen-night-terrain'));
    world.setTimePreference({ mode: 'manual', hour: 22 });
    await settle(harness, 3);
    expect(town.period).toBe('day');
    expect(town.scenery).toBe(dayScenery);
    expect(town.background).toBe(dayBackground);
    expect(town.pendingPeriod).toBeUndefined();
    const failedAt = harness.requests.lastIndexOf('lindenhafen-night-trees');
    harness.advance(2500);
    expect(harness.requests.lastIndexOf('lindenhafen-night-trees')).toBe(failedAt);
    seedTexture(game, 'lindenhafen-night-trees', ['tree-0']);
    harness.advance(800); await settle(harness, 3);
    expect(town.period).toBe('night');
    expect(town.background.period).toBe('night');
    expect(town.scenery).not.toBe(dayScenery);
  });

  it('keeps the fading terrain and scenery alive when the camera changes to mobile', async () => {
    const { town, game, harness } = await bootWorld({ seed: game => { seedTerrain(game, 'lindenhafen', 'day'); seedTerrain(game, 'lindenhafen', 'night'); } });
    for (const period of ['day', 'night'] as const) {
      seedJson(game, `lindenhafen-${period}-animations`, manifest({ tree: sheet(`lindenhafen-${period}-trees`) }, `lindenhafen-${period}-terrain`));
      seedTexture(game, `lindenhafen-${period}-trees`, ['tree-0']);
    }
    town.applyPeriod('night');
    town.pendingTerrain?.update(town.cameras.main.worldView, town.cameras.main.zoom);
    town.applyPeriod('night');
    town.fitCamera(600, 900, 1);
    expect(town.mobileCamera).toBe(true);
    expect(game.textures.exists('lindenhafen-day-trees')).toBe(true);
    harness.advance(1500);
    expect(game.textures.exists('lindenhafen-day-trees')).toBe(false);
    expect(town.previousBackground).toBeUndefined();
    expect(game.textures.exists('lindenhafen-night-trees')).toBe(true);
  });

  it('shows the newest arrival when returning to a destination whose first load is in flight', async () => {
    const fixture = await bootWorld();
    const { world, harness, calls, until } = fixture;
    harness.hold(key => key.startsWith('waldruh') || key.startsWith('nebelstadt'));
    world.setMap('waldruh'); await settle(harness, 1);
    world.setMap('nebelstadt'); await settle(harness, 1);
    world.setMap('waldruh');
    harness.hold(() => false);
    harness.release();
    await until(() => fixture.town.ready && fixture.town.mapSpec.id === 'waldruh');
    await until(() => calls.mapReady.mock.calls.length > 0, 400);
    expect(calls.mapReady.mock.calls).toEqual([['waldruh']]);
    expect(fixture.game.cache.json.exists('nebelstadt-day-animations')).toBe(false);
  });

  it('releases a departed destination when its art arrives after travel', async () => {
    const fixture = await bootWorld();
    const { world, game, harness, until } = fixture;
    harness.hold(key => key.startsWith('waldruh'));
    world.setMap('waldruh'); await settle(harness, 1);
    world.setMap('nebelstadt'); await settle(harness, 1);
    harness.hold(() => false);
    // The abandoned destination's sheet completes only after the traveller has moved on.
    harness.release(key => key === 'waldruh-props', true);
    harness.release();
    await until(() => fixture.town.ready && fixture.town.mapSpec.id === 'nebelstadt');
    expect(game.textures.exists('waldruh-props')).toBe(false);
  });

  it('retains shared native bases through cached town travel and lighting changes', async () => {
    const shared = ['story-quality-props', 'story-quality-misc', 'story-quality-boat', 'story-quality-inn',
      'story-quality-bakery', 'story-quality-grocery', 'lindenhafen-day-building-bases', 'waldruh-day-building-greenhouse'];
    const assets = Object.fromEntries(shared.map((key, index) => [`asset-${index}`, {
      key, frames: ['painting'], fps: 0, width: 200, height: 250, referenceWidth: 200, originX: .5, originY: 1, base: { key, frame: 'painting' },
    }]));
    const fixture = await bootWorld({ motion: 'reduced', seed: game => {
      for (const id of ['lindenhafen', 'waldruh', 'nebelstadt'] as const) {
        seedTerrain(game, id, 'day'); seedTerrain(game, id, 'night');
        for (const period of ['day', 'night'] as const) seedJson(game, `${id}-${period}-animations`, manifest(assets));
      }
      for (const key of shared) seedTexture(game, key, ['painting']);
    } });
    const { world, game, harness, until } = fixture;
    world.setMap('waldruh'); await until(() => fixture.town.ready && fixture.town.mapSpec.id === 'waldruh');
    seedTerrain(game, 'waldruh', 'night');
    world.setTimePreference({ mode: 'manual', hour: 22 }); await settle(harness, 4);
    expect(fixture.town.period).toBe('night');
    world.setMap('lindenhafen'); await until(() => fixture.town.ready && fixture.town.mapSpec.id === 'lindenhafen');
    expect(shared.every(key => game.textures.exists(key))).toBe(true);
    world.setMap('nebelstadt'); await until(() => fixture.town.ready && fixture.town.mapSpec.id === 'nebelstadt');
    seedTerrain(game, 'nebelstadt', 'day');
    world.setTimePreference({ mode: 'manual', hour: 12 }); await settle(harness, 4);
    expect(fixture.town.period).toBe('day');
    expect(shared.every(key => game.textures.exists(key))).toBe(true);
    expect(harness.requests.some(key => shared.includes(key))).toBe(false);
  }, 30000);

  it('tints native regional fallback characters for the period and keeps shared scenery', async () => {
    const { world, town, game, harness } = await bootWorld({ mapId: 'waldruh', motion: 'reduced', seed: game => {
      seedTerrain(game, 'waldruh', 'day'); seedTerrain(game, 'waldruh', 'night');
      for (const period of ['day', 'night'] as const) seedJson(game, `waldruh-${period}-animations`, manifest({ tree: sheet('waldruh-motions') }));
      seedTexture(game, 'waldruh-motions', ['tree-0']);
    } });
    const neighbor = town.createCharacter('waldruh-neighbor', 'Neighbor', 100, 100, avatar, undefined, 0, 0);
    town.characters.set('waldruh-neighbor', neighbor);
    world.setTimePreference({ mode: 'manual', hour: 22 }); await settle(harness, 4);
    expect(town.period).toBe('night');
    expect(neighbor.modularNpc).toBe(true);
    expect(neighbor.figure.height).toBe(MODULAR_ART.height);
    expect(neighbor.avatarLease).toBeDefined();
    expect(neighbor.figure.tintTopLeft).toBe(timeAmbient('waldruh', 22, 'night').people);
    expect(game.textures.exists('waldruh-motions')).toBe(true);
    // The night switch released the day ground; it streams back in before daylight returns.
    seedTerrain(game, 'waldruh', 'day');
    world.setTimePreference({ mode: 'manual', hour: 12 }); await settle(harness, 4);
    expect(town.period).toBe('day');
    expect(neighbor.figure.tintTopLeft).toBe(0xffffff);
    expect(game.textures.exists('waldruh-motions')).toBe(true);
  });
});

describe('regional human motion', () => {
  const regionalArt = (game: Phaser.Game) => {
    for (const actor of castActorsForMap('windplain')) seedCastArt(game, actor.id);
  };
  async function regional() {
    const fixture = await bootWorld({ mapId: 'waldruh', seed: game => regionalArt(game) });
    const town = fixture.town;
    for (const resident of town.residents) resident.character.root.destroy();
    setView(town, 0, 0, 1536, 1024);
    const person = town.createCharacter('windplain-resident-0', 'Anu', 100, 100, avatar, undefined, 8, 8);
    const motion: WorldResident = {
      id: person.id, name: 'Anu', avatar, artVariant: 8, phaseSeconds: 0, cycleSeconds: 6,
      segments: [
        { from: { x: 100, y: 100 }, to: { x: 148, y: 100 }, startSeconds: 0, durationSeconds: 1, velocityX: 48, velocityY: 0, moving: true },
        { from: { x: 148, y: 100 }, to: { x: 148, y: 148 }, startSeconds: 1, durationSeconds: 1, velocityX: 0, velocityY: 48, moving: true },
        { from: { x: 148, y: 148 }, to: { x: 148, y: 148 }, startSeconds: 2, durationSeconds: 1, velocityX: 0, velocityY: 0, moving: false },
        { from: { x: 148, y: 148 }, to: { x: 100, y: 148 }, startSeconds: 3, durationSeconds: 1, velocityX: -48, velocityY: 0, moving: true },
        { from: { x: 100, y: 148 }, to: { x: 100, y: 100 }, startSeconds: 4, durationSeconds: 1, velocityX: 0, velocityY: -48, moving: true },
        { from: { x: 100, y: 100 }, to: { x: 100, y: 100 }, startSeconds: 5, durationSeconds: 1, velocityX: 0, velocityY: 0, moving: false },
      ],
    };
    town.residents = [{ character: person, motion, sample: sampleResidentMotion(motion, 0) }];
    town.activityResidents = [];
    const render = (seconds: number) => { town.decorativeElapsed = seconds; town.updateResidents(); };
    return { ...fixture, person, motion, render };
  }
  const pose = (person: any) => person.figure.frame.name;

  it('keeps all sixteen native local identities distinct through every authored facing', async () => {
    const { town } = await regional();
    const people = castActorsForMap('windplain').map((actor, variant) => town.createCharacter(actor.id, actor.name, 100, 100, actor.recipe!, undefined, variant, variant));
    expect(people).toHaveLength(16);
    expect(people.map(person => person.localArtVariant)).toEqual(Array.from({ length: 16 }, (_, index) => index));
    expect(new Set(people.map(person => `${person.figure.texture.key}:${pose(person)}`)).size).toBe(16);
    for (const person of people) {
      expect(person.componentCast).toBe(true);
      expect(person.walkingAnimation).toBeUndefined();
      expect(person.idleAnimation).toBeUndefined();
      for (const [facing, dx, dy] of [[0, 0, 3], [1, 3, 0], [2, 0, -3], [3, -3, 0]]) {
        town.animateCharacter(person, dx, dy, 1);
        expect(person.figure.texture.key).toBe(castActor(person.id)!.key);
        expect(Math.floor(Number(pose(person)) / 9)).toBe(facing);
        expect(person.figure.flipX).toBe(false);
        expect(person.figure.height).toBe(CAST_ART.height);
      }
    }
  });

  it('keeps connected resident positions current in reduced motion and after a late visit', async () => {
    const first = await regional(), second = await regional();
    let now = 0;
    const epoch = '2026-10-11T00:00:00.000Z';
    const sync = (town: any, elapsedSeconds: number) => {
      town.clock = new WorldClock({ mode: 'manual', hour: 2 }, () => now);
      town.clock.setSharedTime({ epoch, seed: '0123456789abcdef0123456789abcdef', elapsedSeconds, hour: (7 + elapsedSeconds / 30) % 24, day: 1 + Math.floor(elapsedSeconds / 720), dayLengthSeconds: 720,
        serverTime: new Date(Date.parse(epoch) + elapsedSeconds * 1000).toISOString() });
    };
    sync(first.town, 100);
    first.world.setMotionPreference('reduced');
    first.town.updateResidents(.016);
    const before = { x: first.person.x, y: first.person.y };
    now = 1700;
    sync(second.town, 101.7);
    first.town.updateResidents(.016);
    second.town.updateResidents(.016);
    const position = (fixture: typeof first) => ({ x: fixture.person.x, y: fixture.person.y, visible: fixture.person.root.visible });
    expect(position(first)).toEqual(position(second));
    expect({ x: first.person.x, y: first.person.y }).not.toEqual(before);
    expect(first.town.clock.advance(0).hour).toBe(2);
  });

  it('walks home along the route at closing time, disappears there and returns in the morning', async () => {
    const { town, person, motion, render } = await regional();
    render(3.5);
    town.residents[0].routineElapsed = 3.5;
    town.clock.configure({ mode: 'manual', hour: 22 });
    town.updateResidents(.5);
    expect(person.root.visible).toBe(true);
    expect(person.x).toBeLessThan(124);
    for (let step = 0; step < 10; step++) town.updateResidents(.5);
    expect(person.root.visible).toBe(false);
    expect({ x: person.x, y: person.y }).toEqual(motion.segments[0].from);
    const home = { x: person.x, y: person.y };
    town.updateResidents(10);
    expect({ x: person.x, y: person.y }).toEqual(home);
    town.clock.configure({ mode: 'manual', hour: 10 });
    town.updateResidents(.5);
    expect(person.root.visible).toBe(true);
    expect(person.x).toBeGreaterThan(home.x);
  });

  it('uses the native foot pivot and ignores obsolete regional pivots when composing a new resident', async () => {
    const fixture = await regional(), { town, game, person } = fixture;
    expect(person.figure.originX).toBe(.5);
    expect(person.figure.originY).toBe(CAST_ART.footY);
    for (const variant of [0, 4, 10]) seedTexture(game, regionPeopleKey('waldruh', variant),
      Array.from({ length: 16 }, (_, index) => regionPeopleFrames(index)).flat(), 4, 4, { x: .44, y: .95 });
    const newcomer = town.createCharacter('future-waldruh-resident', 'Neighbor', 100, 100, person.avatar, undefined, 8, 8);
    expect(newcomer.figure.visible).toBe(false);
    await fixture.until(() => !!newcomer.avatarLease);
    expect(newcomer.figure.texture.key).not.toBe(regionPeopleKey('waldruh', 8));
    expect(newcomer.figure.originX).toBe(.5);
    expect(newcomer.figure.originY).toBe(MODULAR_ART.footY);
    expect(newcomer.figure.displayOriginY).toBeCloseTo(MODULAR_ART.height * MODULAR_ART.footY);
  });

  it('keeps standing neighbors and paused residents planted instead of cycling step poses', async () => {
    const { town, person, render } = await regional();
    const neighbor = town.createCharacter('windplain-nomin', 'Nomin', 120, 120, person.avatar, undefined, 8, 8);
    expect(pose(neighbor)).toBe(characterFrame(0));
    for (const seconds of [.4, 2, 17]) {
      town.decorativeElapsed = seconds;
      town.animateCharacter(neighbor, 0, 0, seconds);
      expect(pose(neighbor)).toBe(characterFrame(0));
    }
    render(.8); expect(pose(person)).toBe(11);
    render(2.1); expect(pose(person)).toBe(characterFrame(1));
    const stopped = { x: person.x, y: person.y };
    render(2.9); expect(pose(person)).toBe(characterFrame(1));
    expect({ x: person.x, y: person.y }).toEqual(stopped);
    // A new departure starts from a planted pose rather than the old step.
    render(3.1); expect(pose(person)).toBe(28);
    expect(person.walkDistance).toBeCloseTo(4.8);
  });

  it('paces steps by route travel across corners and at different strolling speeds', async () => {
    const { town, person, motion, render } = await regional();
    render(.2); expect(pose(person)).toBe(10);
    render(.4); expect(pose(person)).toBe(10);
    render(.8); expect(pose(person)).toBe(11);
    // One late render must count both legs of the corner, not its diagonal.
    render(1.9); expect(pose(person)).toBe(4);
    expect(person.walkDistance).toBeCloseTo(91.2);
    town.residents[0].motion = { ...motion, cycleSeconds: 3, segments: motion.segments.map(segment => ({
      ...segment, startSeconds: segment.startSeconds / 2, durationSeconds: segment.durationSeconds / 2,
      velocityX: segment.velocityX * 2, velocityY: segment.velocityY * 2,
    })) };
    render(.35); expect(pose(person)).toBe(11);
    expect(person.walkDistance).toBeCloseTo(33.6);
  });

  it('produces the same native pose at every frame rate and while culled, with authored vertical facings', async () => {
    const { town, person, render } = await regional();
    for (let step = 1; step <= 190; step++) render(step / 100);
    const continuous = { frame: pose(person), x: person.x, y: person.y, facing: person.facing };
    for (let step = 1; step <= 38; step++) render(step / 20);
    expect({ frame: pose(person), x: person.x, y: person.y, facing: person.facing }).toEqual(continuous);
    setView(town, -3000, -3000, -2000, -2000);
    render(3.8); expect(person.root.visible).toBe(false); expect(person.facing).toBe(3);
    render(4.4); expect(person.facing).toBe(2);
    setView(town, 0, 0, 1536, 1024);
    render(4.4); expect(person.root.visible).toBe(true);
    expect(pose(person)).toBe(21);
    // Small lateral variation keeps the authored back-facing pose.
    town.animateCharacter(person, .1, -2, 4.5); expect(person.facing).toBe(2);
    expect(person.figure.flipX).toBe(false);
  });

  it('freezes the current pose and facing in still-world mode, then resumes without catching up', async () => {
    const { world, town, person, render } = await regional();
    render(3.8);
    const held = { frame: pose(person), x: person.x, y: person.y, facing: person.facing };
    world.setMotionPreference('reduced');
    for (let step = 1; step <= 50; step++) { town.elapsed += .02; render(3.8); }
    expect({ frame: pose(person), x: person.x, y: person.y, facing: person.facing }).toEqual(held);
    world.setMotionPreference('full'); render(3.81);
    expect(pose(person)).toBe(held.frame); expect(person.facing).toBe(3);
    render(4.01); expect(person.facing).toBe(2); expect(pose(person)).toBe(20);
  });

  it('selects the authored vertical facing when spawning midroute or skipping the preceding leg', async () => {
    const { town, person, motion, render } = await regional();
    render(3.5); render(4.4);
    const continuous = { frame: pose(person), facing: person.facing };
    expect(continuous.facing).toBe(2);
    person.facing = 0; render(.4); render(4.4);
    expect({ frame: pose(person), facing: person.facing }).toEqual(continuous);
    const newcomer = town.createCharacter(person.id, 'Anu', 100, 100, person.avatar, undefined, 8, 8);
    town.residents[0].character = newcomer;
    motion.phaseSeconds = 4.4;
    render(0);
    expect({ frame: pose(newcomer), facing: newcomer.facing }).toEqual(continuous);
    // Starting the cycle on its vertical leg selects that same authored facing.
    town.residents[0].motion = { ...motion, phaseSeconds: .4,
      segments: [...motion.segments.slice(4), ...motion.segments.slice(0, 4)].map((segment, index) => ({ ...segment, startSeconds: index })) };
    newcomer.facing = 0; render(0);
    expect(newcomer.facing).toBe(2);
    expect(newcomer.figure.flipX).toBe(false);
  });
});

