// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import { NavigationGrid, type MapPoint } from './navigation';
import { bootWorld } from './test-support/world-fixture';

const rectangle = (x: number, y: number, width: number, height: number): readonly (readonly [number, number])[] =>
  [[x,y], [x+width,y], [x+width,y+height], [x,y+height]];

/** The live map scene on a test grid; its real input, route, collision, arrival and timing logic run unchanged. */
async function fixture(navigation: NavigationGrid, start: MapPoint) {
  const { world, town: scene } = await bootWorld();
  world.setInputEnabled(true);
  for (const npc of scene.characters.values()) npc.root.destroy();
  scene.characters.clear(); scene.objects.clear(); scene.portals.clear();
  scene.navigation = navigation;
  Object.assign(scene.local, start);
  scene.triggerInteraction = vi.fn();
  scene.interactionPosition = () => scene.local;
  return { world, scene };
}

const openGround = () => new NavigationGrid([rectangle(20,20,560,360)], [], { width: 600, height: 400 }, { agentRadius: 10 });

describe('player movement through the live scene', () => {
  it('projects a click on an isolated decorative island onto reachable streets', async () => {
    const navigation = new NavigationGrid([rectangle(20,20,200,360), rectangle(260,160,90,40)], [],
      { width: 600, height: 400 }, { agentRadius: 10 });
    const start = { x: 70, y: 180 }, click = { x: 330, y: 180 };
    expect(navigation.isWalkable(click.x,click.y)).toBe(true);
    expect(navigation.findPath(start,click)).toEqual([]);
    const { scene } = await fixture(navigation,start);
    expect(scene.walkTo(click.x,click.y)).toBe(true);
    for (let frame=0;frame<40 && scene.target;frame++) scene.update(frame*50,50);
    expect(scene.local.x).toBeGreaterThan(200);
    expect(scene.local.x).toBeLessThan(220);
    expect(navigation.canWalkSegment(start.x,start.y,scene.local.x,scene.local.y)).toBe(true);
    expect(scene.marker.visible).toBe(false);
  });

  it('approaches a seated actor from connected pavement when the preferred offset is on an isolated island', async () => {
    const navigation = new NavigationGrid([rectangle(20,20,200,360), rectangle(260,160,90,40)], [],
      { width: 600, height: 400 }, { agentRadius: 10 });
    const start = { x: 70, y: 180 }, actor = { x: 330, y: 180 };
    expect(navigation.isWalkable(272,180)).toBe(true);
    expect(navigation.findPath(start,{x:272,y:180})).toEqual([]);
    const { scene } = await fixture(navigation,start);
    scene.interactionPosition = () => actor;
    scene.approachInteraction('witness');
    expect(scene.target).toBeDefined();
    for (let frame=0;frame<40 && scene.target;frame++) scene.update(frame*50,50);
    expect(scene.local.x).toBeLessThan(220);
    expect(Math.hypot(scene.local.x-actor.x,scene.local.y-actor.y)).toBeLessThanOrEqual(140);
    expect(scene.triggerInteraction).toHaveBeenCalledExactlyOnceWith('witness');
  });

  it('uses the nearest connected actor approach when snapping its offset would stop beyond interaction range', async () => {
    const navigation = new NavigationGrid([
      rectangle(40,140,150,210), rectangle(40,290,340,60), rectangle(310,270,70,80), rectangle(300,160,60,40),
    ], [], { width: 600, height: 400 }, { agentRadius: 10 });
    const start = { x: 80, y: 180 }, actor = { x: 330, y: 180 };
    const offset = navigation.closestPoint(272,180,start);
    expect(Math.hypot(offset.x-actor.x,offset.y-actor.y)).toBeGreaterThan(140);
    const { scene } = await fixture(navigation,start);
    scene.interactionPosition = () => actor;
    scene.approachInteraction('witness');
    expect(scene.target).toBeDefined();
    for (let frame=0;frame<80 && scene.target;frame++) scene.update(frame*50,50);
    expect(scene.local.y).toBeGreaterThan(270);
    expect(Math.hypot(scene.local.x-actor.x,scene.local.y-actor.y)).toBeLessThanOrEqual(140);
    expect(scene.triggerInteraction).toHaveBeenCalledExactlyOnceWith('witness');
  });

  it('clears an earlier interaction route when the newly selected actor has no approach within speaking distance', async () => {
    const navigation = new NavigationGrid([rectangle(20,20,200,360)], [], { width: 600, height: 400 }, { agentRadius: 10 });
    const { scene } = await fixture(navigation,{ x: 80, y: 180 });
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
  });

  it('continues along a diagonal wall while holding a cardinal direction', async () => {
    const navigation = new NavigationGrid([rectangle(20,20,560,360)], [
      [[200,100], [480,380], [550,50]],
    ], { width: 600, height: 400 }, { agentRadius: 10 });
    const { scene } = await fixture(navigation, { x: 230, y: 150 });
    scene.keys.right.isDown = true;
    for (let frame = 0; frame < 25; frame++) {
      scene.update(frame * 50, 50);
      expect(navigation.isWalkable(scene.local.x, scene.local.y)).toBe(true);
    }
    expect(scene.local.x).toBeGreaterThan(330);
    expect(scene.local.y).toBeGreaterThan(230);
  });

  it('sweeps the final short waypoint and cancels a route invalidated by a thin blocker', async () => {
    const navigation = new NavigationGrid([rectangle(20,20,560,360)], [rectangle(183,80,1,200)], { width: 600, height: 400 });
    const { scene } = await fixture(navigation, { x: 180, y: 150 });
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
  });

  it('uses one frame budget across short waypoints and triggers arrival exactly once', async () => {
    const { scene } = await fixture(openGround(), { x: 80, y: 100 });
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
  });

  it('never exceeds the movement budget to snap to a nearby destination', async () => {
    const { scene } = await fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 91.8, y: 100 };
    scene.update(50, 50);
    expect(scene.local.x).toBeCloseTo(91.25, 8);
    expect(scene.target).toEqual({ x: 91.8, y: 100 });
  });

  it.each(['controlsEnabled', 'watching'])('pauses queued routes when %s disables walking', async mode => {
    const { scene } = await fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 86, y: 100 };
    scene.pendingInteraction = 'witness';
    scene[mode] = mode === 'watching';
    scene.update(50, 50);
    expect(scene.local).toMatchObject({ x: 80, y: 100 });
    expect(scene.target).toEqual({ x: 86, y: 100 });
    expect(scene.triggerInteraction).not.toHaveBeenCalled();
  });

  it.each([20, 60, 120])('walks the same route distance at %i frames per second', async fps => {
    const { scene } = await fixture(openGround(), { x: 80, y: 100 });
    scene.target = { x: 85, y: 100 };
    scene.waypoints = Array.from({ length: 89 }, (_, index) => ({ x: 90 + index * 5, y: 100 }));
    for (let frame = 0; frame < fps; frame++) scene.update(frame * 1000 / fps, 1000 / fps);
    expect(scene.local.x).toBeCloseTo(305, 7);
    expect(scene.local.y).toBe(100);
  });
});
