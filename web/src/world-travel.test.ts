import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from './world';
import { getMap } from './maps';
import { worldAmbient } from './world-lighting';

const harness = vi.hoisted(() => {
  class Picture {
    destroyed = false;
    tint = 0xffffff;
    constructor(public key = '') {}
    fillStyle() { return this; } fillRect() { return this; }
    setDepth() { return this; } setOrigin() { return this; }
    setTint(tint: number) { this.tint = tint; return this; }
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
    textures = { exists: (key: string) => this.textureKeys.has(key), remove: (key: string) => this.textureKeys.delete(key) };
    cache = { json: { get: (key: string) => this.manifests.get(key) } };
    add = { graphics: () => new Picture(), image: (_x: number, _y: number, key: string) => new Picture(key) };
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

beforeEach(() => {
  vi.stubGlobal('document', { hasFocus: () => true, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const ready = vi.fn();
  const world = new World({ clientWidth: 900, clientHeight: 600 } as HTMLElement,
    { onNpc() {}, onMove() {}, onMapReady: ready, time: { mode: 'manual', hour: 12 } });
  // Exercise real scene travel and animation loading, with graphics-only work
  // replaced so network/lifecycle behavior can be tested without a browser GPU.
  const scene = harness.state.scene! as typeof harness.Scene.prototype & Record<string, any>;
  scene.ready = true;
  scene.local = { x: 0, y: 0, facing: 0, walkDistance: 0 };
  scene.animateCharacter = vi.fn(); scene.frameCamera = vi.fn(); scene.setTerrainOnly = vi.fn();
  scene.createMapCharacters = vi.fn(); scene.createMapObjects = vi.fn();
  scene.createBuildingEntrances = vi.fn(); scene.createResidents = vi.fn();
  return { world, scene, ready };
}

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
    expect([...scene.textureKeys].sort()).toEqual(['saffroncourt', 'saffroncourt-motions', 'saffroncourt-people', 'saffroncourt-props']);
    world.destroy();
  });
  it('releases a departed destination when its detail sheet finishes after travel', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('windplain'); scene.finishLoad();
    world.setMap('cedarbay'); scene.finishLoad(); scene.finishLoad();
    await Promise.resolve();
    expect(ready.mock.calls).toEqual([['cedarbay']]);
    expect([...scene.textureKeys].sort()).toEqual(['cedarbay', 'cedarbay-motions', 'cedarbay-people', 'cedarbay-props']);
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
});
