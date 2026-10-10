import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from './world';
import { getMap } from './maps';
import { timeAmbient } from './world-lighting';
import { getExpedition } from './expeditions';
import { createMapNavigation } from './navigation';
import { regionPeopleFrames, regionPeopleKey } from './world-map-assets';
import { getInterior, type InteriorId } from './interiors';
import { sampleResidentMotion, type WorldResident } from './world-life';
import { sampleSceneryFrame } from './scenery-animation';
import type { WorldPlayer } from './world';
import { characterFrame, MODULAR_ART } from './avatar-options';
import { explorationZoom } from './world-camera';

const harness = vi.hoisted(() => {
  class Picture {
    destroyed = false;
    visible = true;
    tint = 0xffffff;
    flipX = false;
    originX = .5;
    originY = .5;
    alpha = 1;
    resolution = 1;
    constructor(public key = '', public frame?: string | number) {}
    fillStyle() { return this; } fillRect() { return this; }
    setDepth() { return this; }
    setOrigin(x = .5, y = x) { this.originX = x; this.originY = y; return this; }
    setTint(tint: number) { this.tint = tint; return this; }
    setScale() { return this; } setVisible(visible: boolean) { this.visible = visible; return this; } setColor() { return this; }
    setAlpha(alpha: number) { this.alpha = alpha; return this; }
    setResolution(resolution: number) { this.resolution = resolution; return this; }
    setText() { return this; }
    setY() { return this; } setPosition() { return this; } add() { return this; }
    setFrame(frame: string | number) { this.frame = frame; return this; }
    setFlipX(flipX: boolean) { this.flipX = flipX; return this; }
    setDisplaySize() { return this; } setTexture(key: string) { this.key = key; return this; }
    destroy() { this.destroyed = true; }
  }
  type Task = { key: string; kind: 'image' | 'atlas' | 'json' };
  class Scene {
    textureKeys = new Set<string>();
    manifests = new Map<string, unknown>();
    queued: Task[] = [];
    listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    loading = false;
    requests: Task[] = [];
    frameGeometry = { width: 100, height: 180, customPivot: true, pivotX: .5, pivotY: .97 };
    input = { keyboard: undefined };
    time = { now: 0 };
    textures = { exists: (key: string) => this.textureKeys.has(key), remove: (key: string) => this.textureKeys.delete(key),
      get: (key: string) => ({ has: (frame: string) => {
        const variant = Number(frame.split('-')[1]);
        return key.endsWith(variant < 4 ? '-people' : variant < 10 ? '-people-1' : '-people-2');
      }, get: () => this.frameGeometry }),
    };
    cache = { json: { get: (key: string) => this.manifests.get(key) } };
    add = { graphics: () => new Picture(), image: (_x: number, _y: number, key: string, frame?: string | number) => new Picture(key, frame),
      text: (_x: number, _y: number, _value: string, style?: { resolution?: number }) => new Picture().setResolution(style?.resolution ?? 1), container: () => new Picture(),
    };
    load = {
      image: (key: string) => this.enqueue(key, 'image'), atlas: (key: string) => this.enqueue(key, 'atlas'),
      json: (key: string) => this.enqueue(key, 'json'), isLoading: () => this.loading,
      start: () => { this.loading = true; },
      once: (event: string, callback: (...args: unknown[]) => void) => {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), callback]);
      },
      off: (event: string, callback: (...args: unknown[]) => void) => {
        this.listeners.set(event, (this.listeners.get(event) ?? []).filter(fn => fn !== callback));
      },
    };
    enqueue(key: string, kind: Task['kind']) { const task = { key, kind }; this.queued.push(task); this.requests.push(task); }
    emit(event: string, ...args: unknown[]) {
      const callbacks = this.listeners.get(event) ?? []; this.listeners.delete(event);
      for (const callback of callbacks) callback(...args);
    }
    finishLoad(failed: string[] = []) {
      while (this.queued.length) {
        const task = this.queued.shift()!;
        if (failed.includes(task.key)) continue;
        if (task.kind !== 'json') { this.textureKeys.add(task.key); continue; }
        const id = task.key.replace(/-(day|night)-animations$/, '');
        const animation = { key: `${id}-motions`, frames: ['motion-tree-0'], width: 100, height: 120, referenceWidth: 100, originX: .5, originY: 1, fps: 4 };
        const manifest = { version: 1, framesPerAsset: 1, terrain: `${id}-terrain`, assets: { 'motion-tree': animation } };
        this.manifests.set(task.key, manifest);
        this.emit(`filecomplete-json-${task.key}`, task.key, 'json', manifest);
      }
      this.loading = false;
      this.emit('complete');
    }
  }
  const state: { scene?: Scene } = {};
  class Game {
    constructor(config: { scene: Scene[] }) { state.scene = config.scene[0]; }
    destroy() {}
  }
  return { Scene, Game, Picture, state };
});
vi.mock('phaser', () => ({ AUTO: 0, Scene: harness.Scene, Game: harness.Game,
  Loader: { Events: { COMPLETE: 'complete' } }, GameObjects: { Image: harness.Picture } }));
vi.mock('./screen-filters', () => ({ createScreenFilter: () => undefined }));
vi.mock('./world-scenery', () => ({ WorldScenery: class {
  lampLights = [];
  setReducedMotion() {} setVisible() {} setAlpha() {} destroy() {}
} }));
vi.mock('./world-interior', () => ({ WorldInterior: class {
  setReducedMotion() {} setVisible() {} update() {} destroy() {}
} }));
vi.mock('./world-atmosphere', () => ({ WorldAtmosphere: class {
  setLampLights() {}
  setVisible() {} update() {} destroy() {}
} }));

beforeEach(() => {
  vi.stubGlobal('document', { hasFocus: () => true, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const ready = vi.fn(), move = vi.fn(), interiorChange = vi.fn(), npc = vi.fn(), interiorInteract = vi.fn();
  const world = new World({ clientWidth: 900, clientHeight: 600 } as HTMLElement,
    { onNpc: npc, onMove: move, onMapReady: ready, onInteriorChange: interiorChange, onInteriorInteract: interiorInteract, time: { mode: 'manual', hour: 12 } });
  // Exercise real scene travel and animation loading, with graphics-only work
  // replaced so network/lifecycle behavior can be tested without a browser GPU.
  const scene = harness.state.scene! as typeof harness.Scene.prototype & Record<string, any>;
  scene.ready = true;
  scene.local = { x: 0, y: 0, facing: 0, walkDistance: 0 };
  scene.animateCharacter = vi.fn(); scene.frameCamera = vi.fn(); scene.setTerrainOnly = vi.fn();
  scene.createMapCharacters = vi.fn(); scene.createMapObjects = vi.fn();
  scene.createBuildingEntrances = vi.fn(); scene.createResidents = vi.fn();
  return { world, scene, ready, move, interiorChange, npc, interiorInteract };
}

async function finishLoads(scene: typeof harness.Scene.prototype) {
  scene.finishLoad();
  await Promise.resolve();
  scene.finishLoad();
  await Promise.resolve();
  await Promise.resolve();
}

function indoorFixture() {
  const result = fixture(), { scene } = result;
  scene.navigation = createMapNavigation('lindenhafen');
  scene.local = scene.createCharacter('self', 'You', 800, 640, { hair: '#000000', skin: '#ccaa99', outfit: '#557755' });
  for (const method of ['clearControls', 'createInteriorPropTargets', 'createPortal', 'transitionRoom', 'refreshNearby', 'updateResidents', 'updateWorldTime']) scene[method] = vi.fn();
  scene.marker = new harness.Picture(); scene.marker.visible = false;
  scene.cameras = { main: { width: 900, height: 600, zoom: 1, setZoom(zoom: number) { this.zoom = zoom; }, worldView: { x: 0, y: 0, right: 1536, bottom: 1024 } } };
  return result;
}

function player(id: string, interiorId?: InteriorId, mapId: WorldPlayer['mapId'] = 'lindenhafen'): WorldPlayer {
  const position = interiorId ? getInterior(interiorId).spawn : { x: .52, y: .61 };
  return { id, name: id, ...position, mapId, interiorId, avatar: { hair: '#000000', skin: '#ccaa99', outfit: '#557755' } };
}

describe('short player steps', () => {
  it('turns toward the witness when the last path segment approaches sideways', () => {
    const { world, scene, npc } = indoorFixture();
    scene.mapSpec = { ...getMap('lindenhafen'), npcs: [] };
    scene.playerArtReady = true; scene.textureKeys.add('main-cast');
    scene.local.x = 0; scene.local.y = 300;
    const witness = scene.createCharacter('otto', 'Otto', 200, 300, scene.local.avatar);
    scene.characters.set('otto', witness); scene.objective = 'otto';
    scene.navigation = { canWalkSegment: () => true, findPath: (_from: unknown, to: { x: number; y: number }) => [
      { x: to.x, y: to.y + 30 }, to,
    ] };
    const renderer = Object.getPrototypeOf(scene);
    scene.animateCharacter = renderer.animateCharacter.bind(scene);
    world.focusNpc('otto');
    for (let step = 0; step < 100 && !npc.mock.calls.length; step++) scene.update(step * 50, 50);
    expect(npc).toHaveBeenCalledExactlyOnceWith('otto');
    expect(scene.local.facing).toBe(1);
    expect(scene.local.frame).toBe(characterFrame(1));
    world.destroy();
  });

  it.each(['lindenhafen', 'waldruh', 'nebelstadt'] as const)('follows an NPC lead through %s and ends facing the witness exactly once', id => {
    const { world, scene, npc } = indoorFixture();
    scene.mapSpec = getMap(id);
    scene.navigation = createMapNavigation(id);
    scene.playerArtReady = true;
    scene.textureKeys.add('main-cast');
    const witness = scene.mapSpec.npcs.find((actor: { id: string }) => actor.id === 'otto');
    const position = scene.navigation.closestPoint(witness.x * 1536, witness.y * 1024);
    const character = scene.createCharacter('otto', 'Otto', position.x, position.y, scene.local.avatar);
    scene.characters.set('otto', character);
    const spawn = scene.navigation.closestPoint(scene.mapSpec.spawn.x * 1536, scene.mapSpec.spawn.y * 1024);
    scene.local.x = spawn.x; scene.local.y = spawn.y;
    scene.objective = 'otto';
    const renderer = Object.getPrototypeOf(scene);
    scene.animateCharacter = renderer.animateCharacter.bind(scene);
    world.focusNpc('otto');
    expect(scene.target).toBeDefined();
    let steps = 0;
    while (!npc.mock.calls.length && steps++ < 1000) scene.update(steps * 50, 50);
    expect(npc).toHaveBeenCalledExactlyOnceWith('otto');
    expect(Math.hypot(character.x - scene.local.x, character.y - scene.local.y)).toBeLessThanOrEqual(140);
    const dx = character.x - scene.local.x, dy = character.y - scene.local.y;
    const facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 0 : 2;
    expect(scene.local.facing).toBe(facing);
    expect(scene.local.frame).toBe(characterFrame(facing));
    for (let frame = 0; frame < 5; frame++) scene.update((steps + frame + 1) * 50, 50);
    expect(npc).toHaveBeenCalledOnce();
    world.destroy();
  });

  it('keeps a walking player facing their route when nearby cast members glance at them', () => {
    const { world, scene } = indoorFixture();
    scene.playerArtReady = true;
    scene.textureKeys.add('main-cast');
    const renderer = Object.getPrototypeOf(scene);
    scene.animateCharacter = renderer.animateCharacter.bind(scene);
    const player = scene.local;
    const left = scene.createCharacter('otto', 'Otto', player.x - 35, player.y, player.avatar);
    const right = scene.createCharacter('marta', 'Marta', player.x + 35, player.y, player.avatar);
    scene.animateCharacter(player, 4, 0, 1);
    const walkingFrame = player.frame;
    expect(walkingFrame).not.toBe(characterFrame(1));
    scene.animateCharacter(left, 0, 0, 1);
    scene.animateCharacter(right, 0, 0, 1);
    expect(player.facing).toBe(1);
    expect(player.frame).toBe(walkingFrame);
    expect(left.facing).toBe(1);
    expect(right.facing).toBe(3);
    scene.characters.set('otto', left);
    scene.setConversationTarget('otto');
    expect(player.facing).toBe(3);
    expect(player.frame).toBe(characterFrame(3));
    world.destroy();
  });

  it('excludes Elise from keyboard, direct approach and callbacks until the storm reveal', () => {
    const { world, scene, npc } = indoorFixture();
    scene.textureKeys.add('story-cast');
    const elise = scene.createCharacter('elise', 'Elise', scene.local.x + 10, scene.local.y, scene.local.avatar);
    scene.characters.set('elise', elise);
    scene.marker = new harness.Picture();
    const renderer = Object.getPrototypeOf(scene);
    renderer.setTerrainOnly.call(scene, false);
    expect(elise.root.visible).toBe(false);
    expect(scene.findNearestInteraction()).toBeUndefined();
    expect(scene.interactionPosition('elise')).toBeUndefined();
    scene.approachNpc('elise');
    scene.triggerInteraction('elise');
    expect(npc).not.toHaveBeenCalled();
    scene.setStoryState({ completedQuestIds: ['b1-storm'], bellCount: 0 });
    expect(scene.findNearestInteraction()?.id).toBe('elise');
    scene.approachNpc('elise');
    expect(npc).toHaveBeenCalledWith('elise');
    world.destroy();
  });

  it.each([30, 60, 120])('shows a brief click step and retains gait progress between clicks at %i Hz', fps => {
    const { world, scene } = indoorFixture();
    scene.playerArtReady = true;
    const renderer = Object.getPrototypeOf(scene);
    scene.animateCharacter = renderer.animateCharacter.bind(scene);
    scene.navigation = { findPath: (_from: unknown, to: { x: number; y: number }) => [to], canWalkSegment: () => true };
    const character = scene.local, seen = new Set<number>();
    let time = 1;
    for (let click = 0; click < 40; click++) {
      // A nearby click reaches its destination in a single update.
      scene.walkTo(character.x + 1, character.y);
      scene.update(time * 1000, 1000 / fps);
      expect(character.frame).not.toBe(characterFrame(character.facing));
      expect(character.layers.every((layer: { frame: number }) => layer.frame === character.frame)).toBe(true);
      seen.add(character.frame % MODULAR_ART.columns);
      const pose = character.frame, distance = character.walkDistance;
      scene.animateCharacter(character, 0, 0, scene.elapsed + .05);
      expect(character.frame).toBe(pose);
      scene.animateCharacter(character, 0, 0, scene.elapsed + .2);
      expect(character.frame).toBe(characterFrame(character.facing));
      expect(character.walkDistance).toBe(distance);
      time += .25;
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(character.walkDistance).toBeCloseTo(40);
    world.destroy();
  });
});

describe('shared indoor rendering', () => {
  it('routes the inn host through a room greeting and hides both actor and station after visiting hours', () => {
    const { world, scene, npc, interiorInteract } = indoorFixture();
    world.enterInterior('inn');
    scene.textureKeys.add('main-cast');
    const inn = getInterior('inn'), spec = inn.npcs[0];
    const host = scene.createCharacter(spec.id, 'Greta', spec.x * 1536, spec.y * 1024, scene.local.avatar);
    host.interactionId = spec.interactionId;
    scene.characters.set(spec.id, host);
    const station = { spec: inn.objects.find(object => object.id === spec.interactionId), x: 1040, y: 745,
      root: new harness.Picture(), interactionId: spec.interactionId, activatedUntil: 0 };
    scene.objects.set(spec.interactionId, station);
    scene.local.x = host.x - 30; scene.local.y = host.y;
    world.focusNpc('greta');
    expect(interiorInteract).toHaveBeenCalledExactlyOnceWith(spec.interactionId);
    expect(npc).not.toHaveBeenCalled();
    expect(scene.local.facing).toBe(1);
    scene.clock.configure({ mode: 'manual', hour: 21 });
    expect(scene.findNearestInteraction()).toBeUndefined();
    world.focusNpc('greta'); scene.triggerInteraction(spec.interactionId);
    expect(interiorInteract).toHaveBeenCalledOnce();
    world.destroy();
  });

  it('reframes indoor body height on entry and restores outdoor zoom without a resize', () => {
    const { world, scene } = indoorFixture();
    scene.fitCamera(900, 600, 1);
    expect(scene.fitZoom).toBe(explorationZoom(900, 600, 1).zoom);
    world.enterInterior('inn');
    expect(scene.fitZoom).toBe(explorationZoom(900, 600, 1, true, getInterior('inn').characterHeight).zoom);
    world.leaveInterior();
    expect(scene.fitZoom).toBe(explorationZoom(900, 600, 1).zoom);
    world.destroy();
  });

  it('renders labels at Retina density and refreshes existing labels when density changes', () => {
    const { world, scene } = indoorFixture();
    scene.fitCamera(1800, 1200, 2);
    expect(scene.local.name.resolution).toBe(2);
    const peer = scene.createCharacter('friend', 'Friend', 400, 400, scene.local.avatar);
    expect(peer.name.resolution).toBe(2);
    scene.peers.set('friend', peer);
    scene.fitCamera(900, 600, 1);
    expect(scene.local.name.resolution).toBe(1);
    expect(peer.name.resolution).toBe(1);
    world.destroy();
  });

  it.each(['cafe', 'bakery', 'supermarket'] as const)('shows and moves only players in the same %s and region', id => {
    const { world, scene, move } = indoorFixture();
    world.setPlayers([player('self'), player('outside')], 'self');
    const outside = scene.peers.get('outside');
    world.enterInterior(id);
    expect(outside.root.destroyed).toBe(true);
    world.setPlayers([player('self', id), player('friend', id), player('outside'),
      player('elsewhere', id === 'cafe' ? 'bakery' : 'cafe'), player('another-region', id, 'waldruh')], 'self');
    expect([...scene.peers.keys()]).toEqual(['friend']);
    const friend = scene.peers.get('friend');
    expect(friend.root.visible).toBe(true);
    const shifted = { ...player('friend', id), x: getInterior(id).spawn.x - .03 };
    world.setPlayers([player('self', id), shifted], 'self');
    const before = friend.x;
    scene.update(100, 50); scene.update(150, 50);
    expect(friend.x).toBeLessThan(before);
    expect(move).toHaveBeenCalledWith(scene.local.x / 1536, scene.local.y / 1024);
    // A scenery-only toggle must not keep indoor players permanently hidden.
    const renderer = Object.getPrototypeOf(scene);
    renderer.setTerrainOnly.call(scene, true); expect(friend.root.visible).toBe(false);
    renderer.setTerrainOnly.call(scene, false); expect(friend.root.visible).toBe(true);
    world.setPlayers([player('self', id)], 'self');
    expect(scene.peers.size).toBe(0); expect(friend.root.destroyed).toBe(true);
    world.destroy();
  });

  it('keeps a short E tap until the next frame, and consumes it once', () => {
    const { world, scene } = indoorFixture();
    world.enterInterior('inn');
    scene.interactNearest = vi.fn();
    scene.queueKeyboardInteraction();
    // No held key remains when this frame runs.
    scene.update(100, 50);
    scene.update(150, 50);
    expect(scene.interactNearest).toHaveBeenCalledTimes(1);
    scene.setInputEnabled(false);
    scene.queueKeyboardInteraction();
    scene.setInputEnabled(true);
    scene.update(200, 50);
    expect(scene.interactNearest).toHaveBeenCalledTimes(1);
    world.destroy();
  });

  it('keeps outdoor snapshots from moving the indoor self and restores outdoor peers on exit', () => {
    const { world, scene } = indoorFixture();
    world.setPlayers([player('self'), player('outside'), player('friend', 'cafe')], 'self');
    world.enterInterior('cafe');
    const indoors = { x: scene.local.x, y: scene.local.y };
    world.setPlayers([player('self'), player('outside'), player('friend', 'cafe')], 'self');
    expect({ x: scene.local.x, y: scene.local.y }).toEqual(indoors);
    expect([...scene.peers.keys()]).toEqual(['friend']);
    const friend = scene.peers.get('friend');
    world.leaveInterior();
    expect(friend.root.destroyed).toBe(true);
    expect([...scene.peers.keys()]).toEqual(['outside']);
    world.setPlayers([player('self'), player('outside')], 'self');
    expect(scene.local.x).not.toBe(indoors.x);
    world.destroy();
  });
});

describe('scene travel while destination art streams', () => {
  it('builds the atmosphere even when audio is unavailable', async () => {
    const { world, scene } = fixture();
    expect(scene.audio).toBeUndefined();
    world.setMap('waldruh'); await finishLoads(scene);
    expect(scene.atmosphere).toBeDefined();
    world.destroy();
  });

  it('keeps the existing painting opaque while the next period fades over it', () => {
    const { world, scene } = indoorFixture();
    scene.textureKeys.add('lindenhafen');
    scene.manifests.set('lindenhafen-night-animations', { assets: {}, terrain: 'lindenhafen-terrain' });
    scene.background = new harness.Picture('lindenhafen');
    const oldBackground = scene.background;
    const oldScenery = { ...scene.scenery, setAlpha: vi.fn(), destroy: vi.fn() };
    scene.scenery = oldScenery;
    let tween: { targets: { alpha: number }; onUpdate: () => void; onComplete: () => void };
    scene.tweens = { add: (options: typeof tween) => { tween = options; return { stop() {} }; } };
    scene.applyPeriod('night');
    oldScenery.setAlpha.mockClear();
    tween!.targets.alpha = .5; tween!.onUpdate();
    expect(oldBackground.alpha).toBe(1);
    expect(scene.background.alpha).toBe(.5);
    expect(oldScenery.setAlpha).not.toHaveBeenCalled();
    tween!.onComplete();
    expect(oldBackground.destroyed).toBe(true);
    expect(scene.background.alpha).toBe(1);
    world.destroy();
  });

  it('keeps the current scenery after a failed night download and retries before switching', async () => {
    const { world, scene } = fixture();
    world.setMap('waldruh'); await finishLoads(scene);
    world.setMotionPreference('reduced');
    const dayScenery = scene.scenery, dayBackground = scene.background;
    const destroy = vi.spyOn(dayScenery, 'destroy');
    scene.manifests.set('waldruh-night-animations', { terrain: 'waldruh-night-terrain', assets: {
      tree: {key:'waldruh-night-trees',frames:['tree-0'],fps:0,width:100,height:120,referenceWidth:100,originX:.5,originY:1},
    } });
    world.setTimePreference({mode:'manual',hour:22});
    scene.finishLoad(['waldruh-night-trees']); await Promise.resolve();
    expect(scene.period).toBe('day');
    expect(scene.scenery).toBe(dayScenery);
    expect(scene.background).toBe(dayBackground);
    expect(destroy).not.toHaveBeenCalled();
    expect(scene.pendingPeriod).toBeUndefined();
    scene.time.now = 2999; scene.updateWorldTime(0);
    expect(scene.queued).toHaveLength(0);
    scene.time.now = 3000; scene.updateWorldTime(0);
    expect(scene.queued.map(task=>task.key)).toEqual(['waldruh-night-trees']);
    await finishLoads(scene);
    expect(scene.period).toBe('night');
    expect(scene.background.key).toBe('waldruh-night-terrain');
    expect(scene.scenery).not.toBe(dayScenery);
    expect(destroy).toHaveBeenCalledOnce();
    world.destroy();
  });

  it('keeps the fading terrain and scenery alive when the camera changes to mobile', () => {
    const { world, scene } = indoorFixture();
    for (const period of ['day','night']) {
      scene.manifests.set(`lindenhafen-${period}-animations`, {terrain:`lindenhafen-${period}-terrain`,assets:{
        tree:{key:`lindenhafen-${period}-trees`,frames:['tree-0']},
      }});
      scene.textureKeys.add(`lindenhafen-${period}-trees`);
      scene.textureKeys.add(`lindenhafen-${period}-terrain`);
    }
    scene.background = new harness.Picture('lindenhafen-day-terrain');
    let complete!: () => void;
    scene.tweens = {add: (options:{onComplete:()=>void}) => {complete=options.onComplete;return {stop(){}};}};
    scene.applyPeriod('night');
    scene.fitCamera(600,900,1);
    expect(scene.mobileCamera).toBe(true);
    expect(scene.textureKeys.has('lindenhafen-day-trees')).toBe(true);
    expect(scene.textureKeys.has('lindenhafen-day-terrain')).toBe(true);
    complete();
    expect(scene.textureKeys.has('lindenhafen-day-trees')).toBe(false);
    expect(scene.textureKeys.has('lindenhafen-day-terrain')).toBe(false);
    expect(scene.textureKeys.has('lindenhafen-night-trees')).toBe(true);
    expect(scene.textureKeys.has('lindenhafen-night-terrain')).toBe(true);
    world.destroy();
  });

  it('shows the newest arrival when returning to a destination whose first load is in flight', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('saffroncourt'); world.setMap('rainmarket'); world.setMap('saffroncourt');
    expect(scene.requests.filter(task => task.key === 'saffroncourt')).toHaveLength(1);
    await finishLoads(scene);
    expect(ready.mock.calls).toEqual([['saffroncourt']]);
    expect(scene.createMapCharacters).toHaveBeenCalledOnce();
    expect(scene.createMapCharacters).toHaveBeenCalledWith(getMap('saffroncourt'));
    expect([...scene.textureKeys].sort()).toEqual(['saffroncourt', 'saffroncourt-motions', 'saffroncourt-people', 'saffroncourt-people-1', 'saffroncourt-people-2', 'saffroncourt-props']);
    world.destroy();
  });
  it('releases a departed destination when its detail sheet finishes after travel', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('windplain'); scene.finishLoad();
    world.setMap('cedarbay'); await finishLoads(scene);
    expect(ready.mock.calls).toEqual([['cedarbay']]);
    expect([...scene.textureKeys].sort()).toEqual(['cedarbay', 'cedarbay-motions', 'cedarbay-people', 'cedarbay-people-1', 'cedarbay-people-2', 'cedarbay-props']);
    world.destroy();
  });
  it('keeps the active motion atlas when day and night share the same region sheet', async () => {
    const { world, scene } = fixture();
    world.setMap('seoulsteps'); await finishLoads(scene);
    const neighbor=new harness.Picture();
    scene.characters.set('seoulsteps-neighbor',{localArtVariant:0,figure:neighbor});
    world.setMotionPreference('reduced');
    world.setTimePreference({ mode: 'manual', hour: 22 }); await finishLoads(scene);
    expect(scene.background.tint).toBe(timeAmbient('seoulsteps',22,'night').terrain);
    expect(neighbor.tint).toBe(timeAmbient('seoulsteps',22,'night').people);
    expect(world.getWorldTime().period).toBe('night');
    expect(scene.textureKeys.has('seoulsteps-motions')).toBe(true);
    expect(scene.textureKeys.has('seoulsteps')).toBe(true);
    expect(scene.requests.filter(task => task.key === 'seoulsteps-motions')).toHaveLength(1);
    world.setTimePreference({mode:'manual',hour:12}); await finishLoads(scene);
    expect(scene.background.tint).toBe(0xffffff);
    expect(neighbor.tint).toBe(0xffffff);
    scene.characters.clear();
    world.destroy();
  });

  it('binds all sixteen local characters to distinct global frames throughout movement', () => {
    const { world, scene } = fixture();
    scene.mapSpec = getMap('saffroncourt');
    scene.navigation = createMapNavigation('saffroncourt');
    scene.playerArtReady = true;
    for (const variant of [0, 4, 10]) scene.textureKeys.add(regionPeopleKey('saffroncourt', variant));
    const renderer = Object.getPrototypeOf(scene);
    const neighbors = getExpedition('saffroncourt')!.npcs.map(npc => scene.createCharacter(
      npc.id, npc.name, 100, 100, npc.avatar, npc.role, npc.artVariant, npc.artVariant,
    ));
    // Use the real resident creation path, which must preserve the catalog's
    // identity even though residents are instantiated after the named cast.
    renderer.createResidents.call(scene);
    const people = [...neighbors, ...scene.residents.map((resident: any) => resident.character)];
    expect(people).toHaveLength(16);
    expect(people.map(person => person.localArtVariant)).toEqual(Array.from({ length: 16 }, (_, index) => index));
    expect(new Set(people.map(person => `${person.figure.key}:${person.figure.frame}`)).size).toBe(16);
    for (const person of people) {
      expect(person.walkingAnimation.key).toBe(regionPeopleKey('saffroncourt', person.localArtVariant));
      expect(person.walkingAnimation.frames).toEqual(regionPeopleFrames(person.localArtVariant));
      expect(person.idleAnimation).toBeUndefined();
      for (const seconds of [1, 2, 3]) {
        scene.decorativeElapsed = seconds;
        renderer.animateCharacter.call(scene, person, -3, 1, seconds);
        expect(person.figure.key).toBe(regionPeopleKey('saffroncourt', person.localArtVariant));
        expect(person.figure.frame).toMatch(new RegExp(`^person-${person.localArtVariant}-[0-3]$`));
        expect(person.figure.flipX).toBe(true);
      }
    }
    world.destroy();
  });
});

function regionalFixture() {
  const result = fixture(), { scene } = result;
  scene.mapSpec = getMap('windplain');
  scene.playerArtReady = true;
  scene.cameras = { main: { worldView: { x: 0, y: 0, right: 1536, bottom: 1024 } } };
  scene.textureKeys.add(regionPeopleKey('windplain', 8));
  const renderer = Object.getPrototypeOf(scene);
  scene.animateCharacter = renderer.animateCharacter.bind(scene);
  const avatar = { hair: '#000000', skin: '#ccaa99', outfit: '#557755' };
  const person = scene.createCharacter('windplain-resident-0', 'Anu', 100, 100, avatar, undefined, 8, 8);
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
  scene.residents = [{ character: person, motion, sample: sampleResidentMotion(motion, 0) }];
  const render = (seconds: number) => {
    scene.decorativeElapsed = seconds;
    renderer.updateResidents.call(scene);
  };
  return { ...result, renderer, person, motion, render };
}

describe('regional human motion', () => {
  it('walks home along the route at closing time, disappears there and returns in the morning', () => {
    const { world, scene, renderer, person, motion, render } = regionalFixture();
    render(3.5);
    scene.residents[0].routineElapsed = 3.5;
    scene.clock.configure({ mode: 'manual', hour: 22 });
    renderer.updateResidents.call(scene, .5);
    expect(person.root.visible).toBe(true);
    expect(person.x).toBeLessThan(124);
    for (let step = 0; step < 10; step++) renderer.updateResidents.call(scene, .5);
    expect(person.root.visible).toBe(false);
    expect({ x: person.x, y: person.y }).toEqual(motion.segments[0].from);
    const home = { x: person.x, y: person.y };
    renderer.updateResidents.call(scene, 10);
    expect({ x: person.x, y: person.y }).toEqual(home);
    scene.clock.configure({ mode: 'manual', hour: 10 });
    renderer.updateResidents.call(scene, .5);
    expect(person.root.visible).toBe(true);
    expect(person.x).toBeGreaterThan(home.x);
    world.destroy();
  });

  it('uses the exported sole pivot for ground contact and supports older character pages', () => {
    const { world, scene, person } = regionalFixture();
    expect(person.figure.originX).toBe(.5);
    expect(person.figure.originY).toBe(.97);
    scene.frameGeometry = { ...scene.frameGeometry, pivotX: .44, pivotY: .95 };
    const anchored = scene.createCharacter(person.id, 'Anu', 100, 100, person.avatar, undefined, 8, 8);
    expect(anchored.figure.originX).toBe(.44);
    expect(anchored.figure.originY).toBe(.95);
    scene.frameGeometry.customPivot = false;
    const legacy = scene.createCharacter(person.id, 'Anu', 100, 100, person.avatar, undefined, 8, 8);
    expect(legacy.figure.originX).toBe(.5);
    expect(legacy.figure.originY).toBe(1);
    world.destroy();
  });

  it('keeps standing neighbors and paused residents planted instead of cycling step poses', () => {
    const { world, scene, person, render } = regionalFixture();
    const neighbor = scene.createCharacter('windplain-nomin', 'Nomin', 120, 120, person.avatar, undefined, 8, 8);
    expect(neighbor.figure.frame).toBe('person-8-0');
    for (const seconds of [.4, 2, 17]) {
      scene.decorativeElapsed = seconds;
      scene.animateCharacter(neighbor, 0, 0, seconds);
      expect(neighbor.figure.frame).toBe('person-8-0');
    }
    render(.8); expect(person.figure.frame).toBe('person-8-2');
    render(2.1); expect(person.figure.frame).toBe('person-8-0');
    const stopped = { x: person.x, y: person.y };
    render(2.9); expect(person.figure.frame).toBe('person-8-0');
    expect({ x: person.x, y: person.y }).toEqual(stopped);
    // A new departure starts from a planted pose rather than the old step.
    render(3.1); expect(person.figure.frame).toBe('person-8-0');
    world.destroy();
  });

  it('paces steps by route travel across corners and at different strolling speeds', () => {
    const { world, scene, person, motion, render } = regionalFixture();
    render(.2); expect(person.figure.frame).toBe('person-8-0');
    render(.4); expect(person.figure.frame).toBe('person-8-1');
    render(.8); expect(person.figure.frame).toBe('person-8-2');
    // One late render must count both legs of the corner, not its diagonal.
    render(1.9); expect(person.figure.frame).toBe('person-8-1');
    const fast = { ...motion, cycleSeconds: 3, segments: motion.segments.map(segment => ({
      ...segment, startSeconds: segment.startSeconds / 2, durationSeconds: segment.durationSeconds / 2,
      velocityX: segment.velocityX * 2, velocityY: segment.velocityY * 2,
    })) };
    scene.residents[0].motion = fast;
    render(.2); expect(person.figure.frame).toBe('person-8-1');
    world.destroy();
  });

  it('produces the same pose at every frame rate and while culled, retaining facing through vertical movement', () => {
    const { world, scene, person, render } = regionalFixture();
    for (let frame = 1; frame <= 190; frame++) render(frame / 100);
    const continuous = { frame: person.figure.frame, x: person.x, y: person.y, flipX: person.figure.flipX };
    for (let frame = 1; frame <= 38; frame++) render(frame / 20);
    expect({ frame: person.figure.frame, x: person.x, y: person.y, flipX: person.figure.flipX }).toEqual(continuous);
    scene.cameras.main.worldView = { x: -3000, y: -3000, right: -2000, bottom: -2000 };
    render(3.8); expect(person.root.visible).toBe(false); expect(person.figure.flipX).toBe(true);
    render(4.4); expect(person.figure.flipX).toBe(true);
    scene.cameras.main.worldView = { x: 0, y: 0, right: 1536, bottom: 1024 };
    render(4.4); expect(person.root.visible).toBe(true);
    expect(person.figure.frame).toBe('person-8-0');
    // Small lateral variation while going vertically does not reverse facing.
    scene.animateCharacter(person, .1, 2, 4.5); expect(person.figure.flipX).toBe(true);
    world.destroy();
  });

  it('freezes the current pose and facing in still-world mode, then resumes without catching up', () => {
    const { world, scene, person, render } = regionalFixture();
    render(3.8);
    const held = { frame: person.figure.frame, x: person.x, y: person.y, flipX: person.figure.flipX };
    world.setMotionPreference('reduced');
    for (let frame = 1; frame <= 50; frame++) {
      scene.elapsed += .02;
      // Decorative elapsed is held by the scene while ordinary time continues.
      render(3.8);
    }
    expect({ frame: person.figure.frame, x: person.x, y: person.y, flipX: person.figure.flipX }).toEqual(held);
    world.setMotionPreference('full'); render(3.81);
    expect(person.figure.frame).toBe(held.frame); expect(person.figure.flipX).toBe(true);
    render(3.99); expect(person.figure.frame).toBe('person-8-2');
    world.destroy();
  });

  it('derives facing from the route when spawning on a vertical leg or skipping the horizontal leg', () => {
    const { world, scene, person, motion, render } = regionalFixture();
    render(3.5); render(4.4);
    const continuous = { frame: person.figure.frame, flipX: person.figure.flipX };
    expect(continuous.flipX).toBe(true);
    // The skipped leftward leg must still set the late render's facing.
    person.figure.setFlipX(false); render(.4); render(4.4);
    expect({ frame: person.figure.frame, flipX: person.figure.flipX }).toEqual(continuous);
    const newcomer = scene.createCharacter(person.id, 'Anu', 100, 100, person.avatar, undefined, 8, 8);
    scene.residents[0].character = newcomer;
    motion.phaseSeconds = 4.4;
    render(0);
    expect({ frame: newcomer.figure.frame, flipX: newcomer.figure.flipX }).toEqual(continuous);
    // A cycle that starts vertically inherits the preceding loop's leftward leg.
    scene.residents[0].motion = { ...motion, phaseSeconds: .4,
      segments: [...motion.segments.slice(4), ...motion.segments.slice(0, 4)].map((segment, index) => ({ ...segment, startSeconds: index })),
    };
    newcomer.figure.setFlipX(false); render(0);
    expect(newcomer.figure.flipX).toBe(true);
    world.destroy();
  });

  it('retains the original painted idle animations independently of walking sheets', () => {
    const { world, scene } = fixture();
    const renderer = Object.getPrototypeOf(scene);
    const animation = { key: 'residents-animation-0', frames: ['marta-0', 'marta-1', 'marta-2', 'marta-3', 'marta-4', 'marta-5'],
      fps: 3, width: 147, height: 230, referenceWidth: 147, originX: .5, originY: 1 };
    scene.textureKeys.add(animation.key);
    scene.manifests.set('residents-animations', { assets: { marta: animation } });
    const marta = scene.createCharacter('marta', 'Marta', 100, 100, { hair: '#000000', skin: '#ccaa99', outfit: '#557755' }, undefined, 0);
    expect(marta.walkingAnimation).toBeUndefined();
    const poses = new Set<string>();
    for (const seconds of [0, .4, .8, 1.2]) {
      scene.decorativeElapsed = seconds;
      renderer.animateCharacter.call(scene, marta, 0, 0, seconds);
      expect(marta.figure.frame).toBe(sampleSceneryFrame(animation, 'marta', seconds));
      poses.add(marta.figure.frame);
    }
    expect(poses.size).toBeGreaterThan(1);
    world.destroy();
  });
});
