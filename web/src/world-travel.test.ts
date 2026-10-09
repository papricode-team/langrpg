import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from './world';
import { getMap } from './maps';
import { worldAmbient } from './world-lighting';
import { getExpedition } from './expeditions';
import { createMapNavigation } from './navigation';
import { regionPeopleFrames, regionPeopleKey } from './world-map-assets';
import { getInterior, type InteriorId } from './interiors';
import type { WorldPlayer } from './world';

const harness = vi.hoisted(() => {
  class Picture {
    destroyed = false;
    visible = true;
    tint = 0xffffff;
    flipX = false;
    constructor(public key = '', public frame?: string | number) {}
    fillStyle() { return this; } fillRect() { return this; }
    setDepth() { return this; } setOrigin() { return this; }
    setTint(tint: number) { this.tint = tint; return this; }
    setScale() { return this; } setVisible(visible: boolean) { this.visible = visible; return this; } setColor() { return this; }
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
    input = { keyboard: undefined };
    textures = { exists: (key: string) => this.textureKeys.has(key), remove: (key: string) => this.textureKeys.delete(key),
      get: (key: string) => ({ has: (frame: string) => {
        const variant = Number(frame.split('-')[1]);
        return key.endsWith(variant < 4 ? '-people' : variant < 10 ? '-people-1' : '-people-2');
      }, get: () => ({ width: 100, height: 180 }) }),
    };
    cache = { json: { get: (key: string) => this.manifests.get(key) } };
    add = { graphics: () => new Picture(), image: (_x: number, _y: number, key: string, frame?: string | number) => new Picture(key, frame),
      text: () => new Picture(), container: () => new Picture(),
    };
    load = {
      image: (key: string) => this.enqueue(key, 'image'), atlas: (key: string) => this.enqueue(key, 'atlas'),
      json: (key: string) => this.enqueue(key, 'json'), isLoading: () => this.loading,
      start: () => { this.loading = true; },
      once: (event: string, callback: (...args: unknown[]) => void) => {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), callback]);
      },
    };
    enqueue(key: string, kind: Task['kind']) { const task = { key, kind }; this.queued.push(task); this.requests.push(task); }
    emit(event: string, ...args: unknown[]) {
      const callbacks = this.listeners.get(event) ?? []; this.listeners.delete(event);
      for (const callback of callbacks) callback(...args);
    }
    finishLoad() {
      while (this.queued.length) {
        const task = this.queued.shift()!;
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
  setReducedMotion() {} setVisible() {} destroy() {}
} }));
vi.mock('./world-interior', () => ({ WorldInterior: class {
  setReducedMotion() {} setVisible() {} update() {} destroy() {}
} }));

beforeEach(() => {
  vi.stubGlobal('document', { hasFocus: () => true, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const ready = vi.fn(), move = vi.fn(), interiorChange = vi.fn();
  const world = new World({ clientWidth: 900, clientHeight: 600 } as HTMLElement,
    { onNpc() {}, onMove: move, onMapReady: ready, onInteriorChange: interiorChange, time: { mode: 'manual', hour: 12 } });
  // Exercise real scene travel and animation loading, with graphics-only work
  // replaced so network/lifecycle behavior can be tested without a browser GPU.
  const scene = harness.state.scene! as typeof harness.Scene.prototype & Record<string, any>;
  scene.ready = true;
  scene.local = { x: 0, y: 0, facing: 0, walkDistance: 0 };
  scene.animateCharacter = vi.fn(); scene.frameCamera = vi.fn(); scene.setTerrainOnly = vi.fn();
  scene.createMapCharacters = vi.fn(); scene.createMapObjects = vi.fn();
  scene.createBuildingEntrances = vi.fn(); scene.createResidents = vi.fn();
  return { world, scene, ready, move, interiorChange };
}

function indoorFixture() {
  const result = fixture(), { scene } = result;
  scene.navigation = createMapNavigation('lindenhafen');
  scene.local = scene.createCharacter('self', 'You', 800, 640, { hair: '#000000', skin: '#ccaa99', outfit: '#557755' });
  for (const method of ['clearControls', 'createInteriorPropTargets', 'createPortal', 'transitionRoom', 'refreshNearby', 'updateResidents', 'updateWorldTime']) scene[method] = vi.fn();
  scene.marker = new harness.Picture(); scene.marker.visible = false;
  scene.cameras = { main: { worldView: { x: 0, y: 0, right: 1536, bottom: 1024 } } };
  return result;
}

function player(id: string, interiorId?: InteriorId, mapId: WorldPlayer['mapId'] = 'lindenhafen'): WorldPlayer {
  const position = interiorId ? getInterior(interiorId).spawn : { x: .52, y: .61 };
  return { id, name: id, ...position, mapId, interiorId, avatar: { hair: '#000000', skin: '#ccaa99', outfit: '#557755' } };
}

describe('shared indoor rendering', () => {
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
  it('shows the newest arrival when returning to a destination whose first load is in flight', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('saffroncourt'); world.setMap('rainmarket'); world.setMap('saffroncourt');
    expect(scene.requests.filter(task => task.key === 'saffroncourt')).toHaveLength(1);
    scene.finishLoad(); scene.finishLoad();
    await Promise.resolve();
    expect(ready.mock.calls).toEqual([['saffroncourt']]);
    expect(scene.createMapCharacters).toHaveBeenCalledOnce();
    expect(scene.createMapCharacters).toHaveBeenCalledWith(getMap('saffroncourt'));
    expect([...scene.textureKeys].sort()).toEqual(['saffroncourt', 'saffroncourt-motions', 'saffroncourt-people', 'saffroncourt-people-1', 'saffroncourt-people-2', 'saffroncourt-props']);
    world.destroy();
  });
  it('releases a departed destination when its detail sheet finishes after travel', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('windplain'); scene.finishLoad();
    world.setMap('cedarbay'); scene.finishLoad(); scene.finishLoad();
    await Promise.resolve();
    expect(ready.mock.calls).toEqual([['cedarbay']]);
    expect([...scene.textureKeys].sort()).toEqual(['cedarbay', 'cedarbay-motions', 'cedarbay-people', 'cedarbay-people-1', 'cedarbay-people-2', 'cedarbay-props']);
    world.destroy();
  });
  it('keeps the active motion atlas when day and night share the same region sheet', async () => {
    const { world, scene } = fixture();
    world.setMap('seoulsteps'); scene.finishLoad(); scene.finishLoad();
    await Promise.resolve();
    const neighbor=new harness.Picture();
    scene.characters.set('seoulsteps-neighbor',{localArtVariant:0,figure:neighbor});
    world.setMotionPreference('reduced');
    world.setTimePreference({ mode: 'manual', hour: 22 }); scene.finishLoad();
    expect(scene.background.tint).toBe(worldAmbient('seoulsteps','night').terrain);
    expect(neighbor.tint).toBe(worldAmbient('seoulsteps','night').people);
    expect(world.getWorldTime().period).toBe('night');
    expect(scene.textureKeys.has('seoulsteps-motions')).toBe(true);
    expect(scene.textureKeys.has('seoulsteps')).toBe(true);
    expect(scene.requests.filter(task => task.key === 'seoulsteps-motions')).toHaveLength(1);
    world.setTimePreference({mode:'manual',hour:12});
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
      expect(person.idleAnimation.key).toBe(regionPeopleKey('saffroncourt', person.localArtVariant));
      expect(person.idleAnimation.frames).toEqual(regionPeopleFrames(person.localArtVariant));
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
