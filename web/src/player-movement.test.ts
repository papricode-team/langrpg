import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationGrid, type MapPoint } from './navigation';
import { World } from './world';

const harness = vi.hoisted(() => {
  class Picture {
    visible = false;
    setVisible(value: boolean) { this.visible = value; return this; }
    setPosition() { return this; }
    setAlpha() { return this; }
    setScale() { return this; }
  }
  class Scene { input = { keyboard: undefined }; }
  const state: { scene?: Scene } = {};
  class Game {
    constructor(config: { scene: Scene[] }) { state.scene = config.scene[0]; }
    destroy() {}
  }
  return { Scene, Game, Picture, state };
});

vi.mock('phaser', () => ({ AUTO: 0, Scene: harness.Scene, Game: harness.Game,
  Input: { Keyboard: { JustDown: () => false } } }));
vi.mock('./screen-filters', () => ({ createScreenFilter: () => undefined }));
vi.mock('./scenery-occlusion', () => ({ createSceneryOcclusion: () => undefined }));

beforeEach(() => {
  vi.stubGlobal('document', { hasFocus: () => true, hidden: false, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { location: { search: '' }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('navigator', { getGamepads: () => [] });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

const rectangle = (x: number, y: number, width: number, height: number): readonly (readonly [number, number])[] =>
  [[x,y], [x+width,y], [x+width,y+height], [x,y+height]];

function fixture(navigation: NavigationGrid, start: MapPoint) {
  const world = new World({ clientWidth: 900, clientHeight: 600 } as HTMLElement, { onNpc: vi.fn(), onMove: vi.fn() });
  const scene = harness.state.scene! as typeof harness.Scene.prototype & Record<string, any>;
  scene.ready = true;
  scene.navigation = navigation;
  scene.local = { ...start, name: new harness.Picture() };
  scene.marker = new harness.Picture();
  scene.cameras = { main: { zoom: 1, worldView: { x: 0, y: 0, right: 600, bottom: 400 } } };
  // Leave the scene's real input, route, collision, arrival and timing logic in
  // place; the renderer and unrelated ambient simulation need no browser GPU.
  for (const method of ['animateCharacter', 'frameCamera', 'updateWorldTime', 'updateResidents', 'updateObjects', 'updatePortals',
    'updateSilhouette', 'updateNavigationOverlay', 'refreshNearby']) scene[method] = vi.fn();
  scene.triggerInteraction = vi.fn();
  scene.interactionPosition = () => scene.local;
  const key = (isDown = false) => ({ isDown });
  scene.keys = { left: key(), right: key(), up: key(), down: key(), arrowLeft: key(), arrowRight: key(),
    arrowUp: key(), arrowDown: key(), interact: key() };
  return { world, scene };
}

const openGround = () => new NavigationGrid([rectangle(20,20,560,360)], [], { width: 600, height: 400 }, { agentRadius: 10 });

describe('player movement through the live scene', () => {
  it('projects a click on an isolated decorative island onto reachable streets', () => {
    const navigation = new NavigationGrid([rectangle(20,20,200,360), rectangle(260,160,90,40)], [],
      { width: 600, height: 400 }, { agentRadius: 10 });
    const start = { x: 70, y: 180 }, click = { x: 330, y: 180 };
    expect(navigation.isWalkable(click.x,click.y)).toBe(true);
    expect(navigation.findPath(start,click)).toEqual([]);
    const { world, scene } = fixture(navigation,start);
    expect(scene.walkTo(click.x,click.y)).toBe(true);
    for (let frame=0;frame<40 && scene.target;frame++) scene.update(frame*50,50);
    expect(scene.local.x).toBeGreaterThan(200);
    expect(scene.local.x).toBeLessThan(220);
    expect(navigation.canWalkSegment(start.x,start.y,scene.local.x,scene.local.y)).toBe(true);
    expect(scene.marker.visible).toBe(false);
    world.destroy();
  });

  it('approaches a seated actor from connected pavement when the preferred offset is on an isolated island', () => {
    const navigation = new NavigationGrid([rectangle(20,20,200,360), rectangle(260,160,90,40)], [],
      { width: 600, height: 400 }, { agentRadius: 10 });
    const start = { x: 70, y: 180 }, actor = { x: 330, y: 180 };
    expect(navigation.isWalkable(272,180)).toBe(true);
    expect(navigation.findPath(start,{x:272,y:180})).toEqual([]);
    const { world, scene } = fixture(navigation,start);
    scene.interactionPosition = () => actor;
    scene.approachInteraction('witness');
    expect(scene.target).toBeDefined();
    for (let frame=0;frame<40 && scene.target;frame++) scene.update(frame*50,50);
    expect(scene.local.x).toBeLessThan(220);
    expect(Math.hypot(scene.local.x-actor.x,scene.local.y-actor.y)).toBeLessThanOrEqual(140);
    expect(scene.triggerInteraction).toHaveBeenCalledExactlyOnceWith('witness');
    world.destroy();
  });

  it('uses the nearest connected actor approach when snapping its offset would stop beyond interaction range', () => {
    const navigation = new NavigationGrid([
      rectangle(40,140,150,210), rectangle(40,290,340,60), rectangle(310,270,70,80), rectangle(300,160,60,40),
    ], [], { width: 600, height: 400 }, { agentRadius: 10 });
    const start = { x: 80, y: 180 }, actor = { x: 330, y: 180 };
    const offset = navigation.closestPoint(272,180,start);
    expect(Math.hypot(offset.x-actor.x,offset.y-actor.y)).toBeGreaterThan(140);
    const { world, scene } = fixture(navigation,start);
    scene.interactionPosition = () => actor;
    scene.approachInteraction('witness');
    expect(scene.target).toBeDefined();
    for (let frame=0;frame<80 && scene.target;frame++) scene.update(frame*50,50);
    expect(scene.local.y).toBeGreaterThan(270);
    expect(Math.hypot(scene.local.x-actor.x,scene.local.y-actor.y)).toBeLessThanOrEqual(140);
    expect(scene.triggerInteraction).toHaveBeenCalledExactlyOnceWith('witness');
    world.destroy();
  });

  it('clears an earlier interaction route when the newly selected actor has no approach within speaking distance', () => {
    const navigation = new NavigationGrid([rectangle(20,20,200,360)], [], { width: 600, height: 400 }, { agentRadius: 10 });
    const { world, scene } = fixture(navigation,{ x: 80, y: 180 });
    scene.target = { x: 90, y: 180 };
    scene.pendingInteraction = 'previous-witness';
    scene.marker.setVisible(true);
    scene.interactionPosition = () => ({ x: 500, y: 180 });
    scene.approachInteraction('far-witness');
    scene.update(50,50);
    expect(scene.local).toMatchObject({ x: 80, y: 180 });
    expect(scene.target).toBeUndefined();
    expect(scene.pendingInteraction).toBeUndefined();
    expect(scene.marker.visible).toBe(false);
    expect(scene.triggerInteraction).not.toHaveBeenCalled();
    world.destroy();
  });

  it('continues along a diagonal wall while holding a cardinal direction', () => {
    const navigation = new NavigationGrid([rectangle(20,20,560,360)], [
      [[200,100], [480,380], [550,50]],
    ], { width: 600, height: 400 }, { agentRadius: 10 });
    const { world, scene } = fixture(navigation, { x: 230, y: 150 });
    scene.keys.right.isDown = true;
    for (let frame = 0; frame < 25; frame++) {
      scene.update(frame * 50, 50);
      expect(navigation.isWalkable(scene.local.x, scene.local.y)).toBe(true);
    }
    expect(scene.local.x).toBeGreaterThan(330);
    expect(scene.local.y).toBeGreaterThan(230);
    world.destroy();
  });

  it('sweeps the final short waypoint and cancels a route invalidated by a thin blocker', () => {
    const navigation = new NavigationGrid([rectangle(20,20,560,360)], [rectangle(183,80,1,200)], { width: 600, height: 400 });
    const { world, scene } = fixture(navigation, { x: 180, y: 150 });
    scene.target = { x: 186, y: 150 };
    scene.marker.setVisible(true);
    scene.pendingInteraction = 'witness';
    scene.update(50, 50);
    expect(scene.local.x).toBeLessThan(183);
    expect(navigation.isWalkable(scene.local.x, scene.local.y)).toBe(true);
    expect(scene.target).toBeUndefined();
    expect(scene.pendingInteraction).toBeUndefined();
    expect(scene.marker.visible).toBe(false);
    expect(scene.triggerInteraction).not.toHaveBeenCalled();
    world.destroy();
  });

  it('uses one frame budget across short waypoints and triggers arrival exactly once', () => {
    const { world, scene } = fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 83, y: 100 };
    scene.waypoints = [{ x: 86, y: 100 }, { x: 90, y: 100 }];
    scene.pendingInteraction = 'witness';
    scene.marker.setVisible(true);
    scene.update(50, 50);
    expect(scene.local).toMatchObject({ x: 90, y: 100 });
    expect(scene.target).toBeUndefined();
    expect(scene.marker.visible).toBe(false);
    expect(scene.triggerInteraction).toHaveBeenCalledExactlyOnceWith('witness');
    scene.update(100, 50);
    expect(scene.triggerInteraction).toHaveBeenCalledOnce();
    world.destroy();
  });

  it('never exceeds the movement budget to snap to a nearby destination', () => {
    const { world, scene } = fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 91.8, y: 100 };
    scene.update(50, 50);
    expect(scene.local.x).toBeCloseTo(91.25, 8);
    expect(scene.target).toEqual({ x: 91.8, y: 100 });
    world.destroy();
  });

  it.each(['controlsEnabled', 'watching'])('pauses queued routes when %s disables walking', mode => {
    const { world, scene } = fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 86, y: 100 };
    scene.pendingInteraction = 'witness';
    scene[mode] = mode === 'watching';
    scene.update(50, 50);
    expect(scene.local).toMatchObject({ x: 80, y: 100 });
    expect(scene.target).toEqual({ x: 86, y: 100 });
    expect(scene.triggerInteraction).not.toHaveBeenCalled();
    world.destroy();
  });

  it.each([20, 60, 120])('walks the same route distance at %i frames per second', fps => {
    const { world, scene } = fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 85, y: 100 };
    scene.waypoints = Array.from({ length: 89 }, (_, index) => ({ x: 90 + index * 5, y: 100 }));
    for (let frame = 0; frame < fps; frame++) scene.update(frame * 1000 / fps, 1000 / fps);
    expect(scene.local.x).toBeCloseTo(305, 7);
    expect(scene.local.y).toBe(100);
    world.destroy();
  });
});
