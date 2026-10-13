import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from './world';
import { getMap } from './maps';
import { timeAmbient } from './world-lighting';
import { createMapNavigation, NavigationGrid, PLAYER_RADIUS } from './navigation';
import { regionPeopleFrames, regionPeopleKey } from './world-map-assets';
import { buildingEntrances, getInterior, type InteriorId } from './interiors';
import { sampleResidentMotion, type WorldResident } from './world-life';
import { sampleSceneryFrame } from './scenery-animation';
import type { WorldPlayer } from './world';
import { characterFrame, MODULAR_ART } from './avatar-options';
import { explorationZoom } from './world-camera';
import {WorldClock} from './world-clock';

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
    fillStyle() { return this; } fillRect() { return this; } clear() { return this; }
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
    setDisplaySize(_width: number, _height: number) { return this; } setTexture(key: string) { this.key = key; return this; }
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
    events = {once: vi.fn(),off: vi.fn()};
    time = { now: 0 };
    textures = { exists: (key: string) => this.textureKeys.has(key), remove: (key: string) => this.textureKeys.delete(key),
      get: (key: string) => ({ has: (frame: string) => {
        const variant = Number(frame.split('-')[1]);
        return key.endsWith(variant < 4 ? '-people' : variant < 10 ? '-people-1' : '-people-2');
      }, get: () => this.frameGeometry, add: vi.fn(), getSourceImage: () => ({width:3073,height:2049}) }),
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
      on: (event: string, callback: (...args: unknown[]) => void) => {
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
        if (failed.includes(task.key)) {this.emit('loaderror',{key:task.key});continue;}
        if (task.kind !== 'json') { this.textureKeys.add(task.key);this.emit(`filecomplete-${task.kind}-${task.key}`);continue; }
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

it('keeps authored tasks synchronized while reduced motion, local sky previews and culling change',()=>{
  const {world,scene}=fixture(),renderer=Object.getPrototypeOf(scene);
  let now=0;
  scene.navigation=createMapNavigation('lindenhafen');scene.playerArtReady=true;
  scene.clock=new WorldClock({mode:'cycle',hour:12},()=>now);
  scene.clock.setSharedTime({epoch:'2026-10-11T00:00:00.000Z',seed:'0123456789abcdef0123456789abcdef',serverTime:'2026-10-11T00:00:45.000Z',elapsedSeconds:45,dayLengthSeconds:720,day:1,hour:8.5});
  for(const look of ['anne','ella','karl','mila'])scene.textureKeys.add(`lindenhafen-resident-actions-${look}`);
  renderer.createResidents.call(scene);
  expect(world.getWorldStats().residents).toBe(15);
  const first=world.getActivityResidents();
  expect(first.find(resident=>resident.name==='Ella')?.state).toMatchObject({phase:'act',action:'carry',heldObject:'parcel'});
  const courier=scene.activityResidents.find((resident:any)=>resident.character.id==='lindenhafen-parcel-courier');
  expect(courier.actionFigure.frame).toBe('carry');expect(courier.prop.visible).toBe(false);
  expect(courier.character.layers.every((layer:any)=>!layer.visible)).toBe(true);
  world.setMotionPreference('reduced');
  world.setWeatherPreview('shower'); // A local preview must not change shared physical state.
  scene.clock.configure({mode:'manual',hour:22});
  scene.cameras.main.worldView={x:-3000,y:-3000,right:-2000,bottom:-2000};
  const visit=scene.activityWorld.day(scene.clock.simulationTime()).plan.activities.find((visit:any)=>visit.residentId==='lindenhafen-promenade-reader'&&visit.task.id==='morning-reading');
  now=(visit.arrival+7-7*30-45)*1000;renderer.updateActivityResidents.call(scene);
  const expected=scene.activityWorld.sample(scene.clock.simulationTime());
  expect(world.getActivityResidents().map(resident=>resident.state)).toEqual(expected);
  expect(world.getActivityResidents()).not.toEqual(first);
  expect(scene.activityResidents.every((resident:any)=>!resident.character.root.visible)).toBe(true);
  const reader=scene.activityResidents.find((resident:any)=>resident.character.id==='lindenhafen-promenade-reader');
  expect(reader.actionFigure.frame).toBe('read');expect(reader.actionFigure.flipX).toBe(true);
  scene.cameras.main.worldView={x:0,y:0,right:3072,bottom:1024};
  world.setMotionPreference('full');renderer.updateActivityResidents.call(scene);
  expect(world.getActivityResidents().map(resident=>resident.state)).toEqual(expected);
  now=(visit.finished+1-7*30-45)*1000;renderer.updateActivityResidents.call(scene);
  expect(reader.sample.phase).toBe('return');expect(reader.actionFigure.visible).toBe(false);
  expect(reader.character.layers.every((layer:any)=>layer.visible)).toBe(true);expect(reader.prop.visible).toBe(false);
  world.destroy();
});
it('renders one parcel and one exchange speaker while respecting dialogue, culling and vocabulary intake',()=>{
  const {world,scene}=fixture(),renderer=Object.getPrototypeOf(scene);
  scene.navigation=createMapNavigation('lindenhafen');scene.playerArtReady=true;
  scene.clock=new WorldClock({mode:'manual',hour:11.75});
  scene.cameras.main.worldView={x:0,y:0,right:3072,bottom:2048};
  for(const look of ['anne','ella','karl','mila'])scene.textureKeys.add(`lindenhafen-resident-actions-${look}`);
  renderer.createResidents.call(scene);world.setWeatherPreview('dry');world.setMotionPreference('reduced');world.observeResident('lindenhafen-promenade-reader');
  renderer.updateActivityResidents.call(scene);
  const vendor=scene.activityResidents.find((item:any)=>item.character.id==='lindenhafen-parcel-vendor');
  const customer=scene.activityResidents.find((item:any)=>item.character.id==='lindenhafen-promenade-reader');
  const exchangeHour=(residentId:string)=>{
    for(let seconds=0;seconds<720;seconds++){
      const sample=scene.activityWorld.sample({seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:seconds},'dry')
        .find((sample:any)=>sample.residentId===residentId);
      if(sample?.exchange?.speaking&&sample.heldObject==='parcel')return (7+seconds/30)%24;
    }
    throw new Error(`No speaking parcel exchange for ${residentId}`);
  };
  scene.clock.configure({mode:'manual',hour:exchangeHour(vendor.character.id)});renderer.updateActivityResidents.call(scene);
  expect(vendor.actionFigure.frame).toBe('carry');expect(vendor.prop.visible).toBe(false);expect(vendor.speech.visible).toBe(true);
  expect(customer.sample.heldObject).toBeUndefined();expect(customer.speech?.visible??false).toBe(false);expect(customer.character.name.visible).toBe(false);
  world.setLearningContext([],{words:{}},new Set(),()=>false);renderer.updateActivityResidents.call(scene);expect(vendor.speech.visible).toBe(false);
  world.setLearningContext([],{words:{}},new Set(),()=>true);scene.clock.configure({mode:'manual',hour:exchangeHour(customer.character.id)});renderer.updateActivityResidents.call(scene);
  expect(customer.actionFigure.frame).toBe('carry');expect(customer.prop.visible).toBe(false);expect(customer.speech.visible).toBe(true);expect(vendor.sample.heldObject).toBeUndefined();expect(vendor.speech.visible).toBe(false);
  scene.conversationTarget='marta';renderer.updateActivityResidents.call(scene);expect(customer.speech.visible).toBe(false);
  scene.conversationTarget=undefined;scene.cameras.main.worldView={x:-3000,y:-3000,right:-2000,bottom:-2000};renderer.updateActivityResidents.call(scene);
  expect(customer.speech.visible).toBe(false);expect(customer.sample.heldObject).toBe('parcel');expect(customer.character.root.visible).toBe(false);
  world.destroy();
});
vi.mock('phaser', () => ({ AUTO: 0, Scene: harness.Scene, Game: harness.Game,
  Loader: { Events: { COMPLETE: 'complete' } }, GameObjects: { Image: harness.Picture } }));
vi.mock('./screen-filters', () => ({ createScreenFilter: () => undefined }));
vi.mock('./scenery-occlusion', () => ({ createSceneryOcclusion: () => undefined }));
vi.mock('./world-scenery', () => ({ WorldScenery: class {
  lampLights = [];
  occlusionFor() { return undefined; }
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
  vi.stubGlobal('window', { location:{search:''}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} });
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
  scene.cameras = { main: { width:900, height:600, zoom:1, setBounds:vi.fn(), setZoom(zoom:number){this.zoom=zoom;}, worldView:{x:0,y:0,width:1536,height:1024,right:1536,bottom:1024} } };
  scene.ready = true;
  scene.local = { x: 0, y: 0, facing: 0, walkDistance: 0 };
  scene.animateCharacter = vi.fn(); scene.frameCamera = vi.fn(); scene.setTerrainOnly = vi.fn();
  scene.createMapCharacters = vi.fn(); scene.createMapObjects = vi.fn();
  scene.createBuildingEntrances = vi.fn(); scene.createResidents = vi.fn();
  return { world, scene, ready, move, interiorChange, npc, interiorInteract };
}

async function finishLoads(scene: typeof harness.Scene.prototype) {
  const live = scene as typeof scene & Record<string, any>;
  for (let frame=0; frame<12;frame++) {
    scene.finishLoad();
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    live.background?.update?.(live.cameras.main.worldView,live.cameras.main.zoom);
    live.pendingTerrain?.update(live.cameras.main.worldView,live.cameras.main.zoom);
    live.updateWorldTime(0);
  }
}

function indoorFixture() {
  const result = fixture(), { scene } = result;
  // Room presence tests use the supported instant transition preference.
  scene.reducedMotion = true;
  scene.navigation = createMapNavigation('lindenhafen');
  scene.local = scene.createCharacter('self', 'You', 800, 640, { hair: '#000000', skin: '#ccaa99', outfit: '#557755' });
  for (const method of ['clearControls', 'createInteriorPropTargets', 'createPortal', 'transitionRoom', 'refreshNearby', 'updateResidents', 'updateWorldTime']) scene[method] = vi.fn();
  scene.marker = new harness.Picture(); scene.marker.visible = false;
  scene.cameras = { main: { width: 900, height: 600, zoom: 1, setBounds:vi.fn(), setZoom(zoom: number) { this.zoom = zoom; }, worldView: { x: 0, y: 0, width:1536, height:1024, right: 1536, bottom: 1024 } } };
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
    scene.navigation = { canWalkSegment: () => true, closestPoint: (x: number, y: number) => ({ x, y }), findPath: (_from: unknown, to: { x: number; y: number }) => [
      { x: to.x, y: to.y + 30 }, to,
    ], move: (from: { x: number; y: number }, delta: { x: number; y: number }) => ({ x: from.x + delta.x, y: from.y + delta.y }) };
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
    scene.navigation = { closestPoint: (x: number, y: number) => ({ x, y }), findPath: (_from: unknown, to: { x: number; y: number }) => [to], canWalkSegment: () => true,
      move: (from: { x: number; y: number }, delta: { x: number; y: number }) => ({ x: from.x + delta.x, y: from.y + delta.y }) };
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
  it('restores a safe outdoor footprint when a saved doorway return is too close to scenery', () => {
    const { world, scene } = indoorFixture();
    scene.mapSpec = getMap('nebelstadt');
    const returnPoint = buildingEntrances('nebelstadt').find(entrance => entrance.interiorId === 'supermarket')!.returnPoint;
    const x = returnPoint.x * scene.mapSpec.width, y = returnPoint.y * scene.mapSpec.height;
    // A newly placed object comes within three units of an old door return.
    scene.navigation = new NavigationGrid([[[0,0],[2304,0],[2304,1024],[0,1024]]],
      [[[x+3,y-20],[x+33,y-20],[x+33,y+20],[x+3,y+20]]], scene.mapSpec, {agentRadius:PLAYER_RADIUS});
    world.enterInterior('supermarket');
    const outdoors = scene.outdoors;
    expect(outdoors.navigation.isWalkable(outdoors.x, outdoors.y)).toBe(false);
    world.leaveInterior();
    expect(scene.navigation).toBe(outdoors.navigation);
    expect(scene.navigation.isWalkable(scene.local.x, scene.local.y)).toBe(true);
    expect(scene.navigation.clearanceAt(scene.local.x, scene.local.y)).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(Math.hypot(scene.local.x - outdoors.x, scene.local.y - outdoors.y)).toBeLessThan(PLAYER_RADIUS + scene.navigation.cellSize);
    expect(scene.local.targetX).toBe(scene.local.x);
    expect(scene.local.targetY).toBe(scene.local.y);
    world.destroy();
  });

  it('walks into the doorway for 250ms and preserves an input change during the transition',()=>{
    const {world,scene,interiorChange}=indoorFixture();scene.reducedMotion=false;
    let options:any;scene.tweens={add:(value:any)=>{options=value;return{stop:vi.fn()};}};
    world.enterInterior('cafe');
    expect(options.duration).toBe(250);expect(scene.interiorId).toBeUndefined();expect(scene.controlsEnabled).toBe(false);
    options.onUpdate({progress:.5});expect(scene.local.root.alpha).toBe(.5);
    world.setInputEnabled(false);
    options.onComplete();
    expect(scene.interiorId).toBe('cafe');expect(scene.local.root.alpha).toBe(1);expect(scene.controlsEnabled).toBe(false);
    expect(interiorChange).toHaveBeenCalledExactlyOnceWith('cafe');world.destroy();
  });
  it('cancels a pending doorway walk and returns the player to walkable ground',()=>{
    const {world,scene}=indoorFixture();scene.reducedMotion=false;
    const stop=vi.fn();scene.tweens={add:()=>({stop})};
    world.enterInterior('cafe');world.leaveInterior();
    expect(stop).toHaveBeenCalledOnce();expect(scene.interiorId).toBeUndefined();expect(scene.local.root.alpha).toBe(1);
    expect(scene.navigation.isWalkable(scene.local.x,scene.local.y)).toBe(true);world.destroy();
  });
  it('lets an active conversation finish after visiting hours, then releases the visitor',()=>{
    const {world,scene}=indoorFixture();world.enterInterior('inn');
    const spec=getInterior('inn').npcs[0];
    const host=scene.createCharacter(spec.id,'Greta',spec.x*1536,spec.y*1024,scene.local.avatar);
    scene.characters.set(spec.id,host);scene.clock.configure({mode:'manual',hour:17});
    world.setConversationTarget(spec.id);expect(scene.conversationTarget).toBe(spec.id);
    scene.clock.configure({mode:'manual',hour:23});
    scene.update(100,50);expect(host.root.visible).toBe(true);
    world.setConversationTarget(undefined);scene.update(150,50);expect(host.root.visible).toBe(false);
    world.setConversationTarget(spec.id);expect(scene.conversationTarget).toBeUndefined();
    world.destroy();
  });

  it('holds only the conversation partner and walks back to routines after a long reading pause',()=>{
    const {world,scene}=indoorFixture();scene.navigation={canWalkSegment:()=>true};
    scene.mapSpec={...getMap('lindenhafen'),npcs:[{id:'marta',x:.2,y:.2},{id:'otto',x:.25,y:.2}]};
    scene.clock.configure({mode:'manual',hour:9});
    for(const anchor of scene.mapSpec.npcs)scene.characters.set(anchor.id,scene.createCharacter(anchor.id,anchor.id,anchor.x*scene.worldWidth,anchor.y*scene.worldHeight,scene.local.avatar));
    const marta=scene.characters.get('marta'),otto=scene.characters.get('otto');
    const frozen={x:marta.x,y:marta.y},passing={x:otto.x,y:otto.y};world.setConversationTarget('marta');
    scene.clock.configure({mode:'manual',hour:14});scene.update(100,50);
    expect({x:marta.x,y:marta.y}).toEqual(frozen);
    expect(Math.hypot(otto.x-passing.x,otto.y-passing.y)).toBeGreaterThan(0);
    world.setConversationTarget(undefined);scene.update(150,50);
    const resumedDistance=Math.hypot(marta.x-frozen.x,marta.y-frozen.y);
    expect(resumedDistance).toBeGreaterThan(0);expect(resumedDistance).toBeLessThanOrEqual(36*.05+.00001);
    world.destroy();
  });

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
    const door=buildingEntrances('lindenhafen').find(value=>value.interiorId==='cafe')!;
    expect({x:scene.local.x,y:scene.local.y}).toEqual({x:door.returnPoint.x*getMap('lindenhafen').width,y:door.returnPoint.y*getMap('lindenhafen').height});
    world.setPlayers([player('self'), player('outside')], 'self');
    expect(scene.local.x).not.toBe(indoors.x);
    world.destroy();
  });
});

describe('scene travel while destination art streams', () => {
  it('keeps the terrain footprint fixed when a period swaps to a larger painting', () => {
    const { world, scene } = indoorFixture();
    const background = new harness.Picture('lindenhafen');
    let displayed = [1536, 1024];
    background.setTexture = () => { displayed = [3072, 2048]; return background; };
    background.setDisplaySize = (width: number, height: number) => { displayed = [width, height]; return background; };
    scene.background = background;
    scene.reducedMotion = true;
    scene.applyPeriod('night');
    expect(displayed).toEqual([1536, 1024]);
    world.destroy();
  });

  it('builds the atmosphere even when audio is unavailable', async () => {
    const { world, scene } = fixture();
    expect(scene.audio).toBeUndefined();
    world.setMap('waldruh'); await finishLoads(scene);
    expect(scene.atmosphere).toBeDefined();
    world.destroy();
  });

  it('keeps the existing painting opaque while the next period fades over it', async () => {
    const { world, scene } = indoorFixture();
    scene.reducedMotion=false;
    scene.textureKeys.add('lindenhafen');
    scene.manifests.set('lindenhafen-night-animations', { assets: {}, terrain: 'lindenhafen-terrain' });
    scene.background = new harness.Picture('lindenhafen');
    const oldBackground = scene.background;
    const oldScenery = { ...scene.scenery, setAlpha: vi.fn(), destroy: vi.fn() };
    scene.scenery = oldScenery;
    let tween: { targets: { alpha: number }; onUpdate: () => void; onComplete: () => void };
    scene.tweens = { add: (options: typeof tween) => { tween = options; return { stop() {} }; } };
    scene.applyPeriod('night');
    expect(scene.background).toBe(oldBackground);
    await finishLoads(scene);scene.applyPeriod('night');
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
    expect(scene.background.period).toBe('night');
    expect(scene.scenery).not.toBe(dayScenery);
    expect(destroy).toHaveBeenCalledOnce();
    world.destroy();
  });

  it('keeps the fading terrain and scenery alive when the camera changes to mobile', async () => {
    const { world, scene } = indoorFixture();
    scene.reducedMotion=false;
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
    await finishLoads(scene);scene.applyPeriod('night');
    scene.fitCamera(600,900,1);
    expect(scene.mobileCamera).toBe(true);
    expect(scene.textureKeys.has('lindenhafen-day-trees')).toBe(true);
    expect(scene.textureKeys.has('lindenhafen-day-terrain')).toBe(true);
    complete();
    expect(scene.textureKeys.has('lindenhafen-day-trees')).toBe(false);
    expect(scene.previousBackground).toBeUndefined();
    expect(scene.textureKeys.has('lindenhafen-night-trees')).toBe(true);
    expect(scene.textureKeys.has('lindenhafen-night-terrain')).toBe(true);
    world.destroy();
  });

  it('shows the newest arrival when returning to a destination whose first load is in flight', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('waldruh'); world.setMap('nebelstadt'); world.setMap('waldruh');
    expect(scene.requests.filter(task => task.key === 'waldruh-props')).toHaveLength(1);
    await finishLoads(scene);
    expect(ready.mock.calls).toEqual([['waldruh']]);
    expect(scene.createMapCharacters).toHaveBeenCalledOnce();
    expect(scene.createMapCharacters).toHaveBeenCalledWith(getMap('waldruh'));
    expect(scene.textureKeys.has('waldruh-props')).toBe(true);
    expect(scene.textureKeys.has('nebelstadt-motions')).toBe(false);
    expect(scene.textureKeys.has('nebelstadt-props')).toBe(false);
    world.destroy();
  });
  it('releases a departed destination when its detail sheet finishes after travel', async () => {
    const { world, scene, ready } = fixture();
    world.setMap('waldruh'); scene.finishLoad();
    world.setMap('nebelstadt'); await finishLoads(scene);
    expect(ready.mock.calls).toEqual([['nebelstadt']]);
    expect(scene.textureKeys.has('nebelstadt-props')).toBe(true);
    expect([...scene.textureKeys].every(key=>key.startsWith('nebelstadt')||key.startsWith('world-expansions/nebelstadt/'))).toBe(true);
    world.destroy();
  });
  it('keeps the active motion atlas when day and night share the same region sheet', async () => {
    const { world, scene } = fixture();
    world.setMap('waldruh'); await finishLoads(scene);
    const neighbor=new harness.Picture();
    scene.characters.set('waldruh-neighbor',{localArtVariant:0,figure:neighbor});
    world.setMotionPreference('reduced');
    world.setTimePreference({ mode: 'manual', hour: 22 }); await finishLoads(scene);
    expect(scene.background.tint).toBe(timeAmbient('waldruh',22,'night').terrain);
    expect(neighbor.tint).toBe(timeAmbient('waldruh',22,'night').people);
    expect(world.getWorldTime().period).toBe('night');
    expect(scene.textureKeys.has('waldruh-motions')).toBe(true);
    expect(scene.requests.filter(task => task.key === 'waldruh-motions')).toHaveLength(1);
    world.setTimePreference({mode:'manual',hour:12}); await finishLoads(scene);
    expect(scene.background.tint).toBe(0xffffff);
    expect(neighbor.tint).toBe(0xffffff);
    scene.characters.clear();
    world.destroy();
  });

  it('retains shared native bases through cached town travel, lighting changes and stale load cleanup', async () => {
    const {world,scene}=fixture();
    const shared=['story-quality-props','story-quality-misc','story-quality-boat','story-quality-inn',
      'story-quality-bakery','story-quality-grocery','lindenhafen-day-building-bases','waldruh-day-building-greenhouse'];
    const assets=Object.fromEntries(shared.map((key,index)=>[`asset-${index}`,{
      key,frames:['painting'],fps:0,width:200,height:250,referenceWidth:200,originX:.5,originY:1,
      base:{key,frame:'painting'},
    }]));
    for(const id of ['lindenhafen','waldruh','nebelstadt'])for(const period of ['day','night'])
      scene.manifests.set(`${id}-${period}-animations`,{version:3,framesPerAsset:1,assets});
    for(const key of shared)scene.textureKeys.add(key);
    world.setMotionPreference('reduced');
    world.setMap('waldruh');await finishLoads(scene);
    world.setTimePreference({mode:'manual',hour:22});await finishLoads(scene);
    expect(scene.period).toBe('night');

    // An obsolete destination finishes in the same batch as a cached arrival.
    scene.manifests.set('nebelstadt-day-animations',{version:3,framesPerAsset:1,assets:{...assets,
      obsolete:{key:'nebelstadt-obsolete-page',frames:['painting'],fps:0,width:200,height:250,referenceWidth:200,originX:.5,originY:1},
    }});
    scene.animationAssets.load('nebelstadt','day',()=>scene.releaseAnimationAssets('nebelstadt','day'));
    world.setMap('lindenhafen');await finishLoads(scene);
    expect(scene.mapSpec.id).toBe('lindenhafen');
    expect(scene.textureKeys.has('nebelstadt-obsolete-page')).toBe(false);
    expect(shared.every(key=>scene.textureKeys.has(key))).toBe(true);
    world.setMap('nebelstadt');await finishLoads(scene);
    world.setTimePreference({mode:'manual',hour:12});await finishLoads(scene);
    expect(scene.period).toBe('day');
    expect(shared.every(key=>scene.textureKeys.has(key))).toBe(true);
    expect(scene.requests.some(task=>shared.includes(task.key))).toBe(false);
    world.destroy();
  });

  it('binds all sixteen local characters to distinct global frames throughout movement', () => {
    const { world, scene } = fixture();
    scene.mapSpec = getMap('waldruh');
    scene.navigation = createMapNavigation('waldruh');
    scene.playerArtReady = true;
    for (const variant of [0, 4, 10]) scene.textureKeys.add(regionPeopleKey('waldruh', variant));
    const renderer = Object.getPrototypeOf(scene);
    const people = Array.from({length:16},(_,variant)=>scene.createCharacter(`waldruh-person-${variant}`,`Person ${variant}`,100,100,
      {hair:'#000000',skin:'#ccaa99',outfit:'#557755'},undefined,variant,variant));
    expect(people).toHaveLength(16);
    expect(people.map(person => person.localArtVariant)).toEqual(Array.from({ length: 16 }, (_, index) => index));
    expect(new Set(people.map(person => `${person.figure.key}:${person.figure.frame}`)).size).toBe(16);
    for (const person of people) {
      expect(person.walkingAnimation.key).toBe(regionPeopleKey('waldruh', person.localArtVariant));
      expect(person.walkingAnimation.frames).toEqual(regionPeopleFrames(person.localArtVariant));
      expect(person.idleAnimation).toBeUndefined();
      for (const seconds of [1, 2, 3]) {
        scene.decorativeElapsed = seconds;
        renderer.animateCharacter.call(scene, person, -3, 1, seconds);
        expect(person.figure.key).toBe(regionPeopleKey('waldruh', person.localArtVariant));
        expect(person.figure.frame).toMatch(new RegExp(`^person-${person.localArtVariant}-[0-3]$`));
        expect(person.figure.flipX).toBe(true);
      }
    }
    world.destroy();
  });
});

function regionalFixture() {
  const result = fixture(), { scene } = result;
  scene.mapSpec = getMap('waldruh');
  scene.playerArtReady = true;
  scene.cameras = { main: { worldView: { x: 0, y: 0, width:1536, height:1024, right: 1536, bottom: 1024 } } };
  scene.textureKeys.add(regionPeopleKey('waldruh', 8));
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
  it('keeps connected resident positions current in reduced motion and after a late visit', () => {
    const first = regionalFixture(), second = regionalFixture();
    let now = 0;
    const epoch = '2026-10-11T00:00:00.000Z';
    const sync = (scene: any, elapsedSeconds: number) => {
      scene.clock = new WorldClock({mode: 'manual', hour: 2}, () => now);
      scene.setSharedClock({epoch, seed: '0123456789abcdef0123456789abcdef', elapsedSeconds,
        hour: (7 + elapsedSeconds / 30) % 24, day: 1 + Math.floor(elapsedSeconds / 720), dayLengthSeconds: 720,
        serverTime: new Date(Date.parse(epoch) + elapsedSeconds * 1000).toISOString()});
    };
    sync(first.scene, 100);
    first.world.setMotionPreference('reduced');
    first.renderer.updateResidents.call(first.scene, .016);
    const before = {x: first.person.x, y: first.person.y};
    now = 1700;
    sync(second.scene, 101.7);
    first.renderer.updateResidents.call(first.scene, .016);
    second.renderer.updateResidents.call(second.scene, .016);
    const position = (fixture: typeof first) => ({x: fixture.person.x, y: fixture.person.y, visible: fixture.person.root.visible});
    expect(position(first)).toEqual(position(second));
    expect({x: first.person.x, y: first.person.y}).not.toEqual(before);
    expect(first.scene.clock.advance(0).hour).toBe(2);
    first.world.destroy(); second.world.destroy();
  });

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
