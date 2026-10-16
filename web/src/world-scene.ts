import * as Phaser from 'phaser';
import { worldDaySeconds, worldStartHour, type WorldSimulationTime } from './shared-world-time';
import { ResidentActivityWorld, type ActivityResidentSample } from './resident-activities';
import { worldRain, type WorldWeatherMode } from './world-weather';
import { residentActionKey, residentActionPose, residentComponentPose, residentSeatedOffset, RESIDENT_ACTION_ART } from './resident-action-art';
import { npcs } from './content';
import { createMapNavigation, type MapPoint, type NavigationGrid } from './navigation';
import { getMap, maps, type MapId, type WorldMapSpec } from './maps';
import { castActor } from './character-cast';
import { poseColumn } from './character-pose';
import { characterFrame, MODULAR_ART } from './avatar-options';
import { createWorldResidents, sampleResidentMotion, sampleResidentSchedule } from './world-life';
import { residentFacingLeft, residentWalkDistance } from './resident-animation';
import { WorldScenery } from './world-scenery';
import { sceneryTextureKey } from './placed-scenery';
import { createSceneryOcclusion } from './scenery-occlusion';
import { setDepthIfChanged, worldDepth, type OcclusionCharacter } from './world-depth';
import { GroundTerrain } from './ground-terrain';
import { getWorldScene } from './scene-data';
import { sceneNavigationGeometry } from './scene-navigation';
import { sceneryThumbnail, WorldEditController, type EditSurface } from './world-edit-mode';
import type { WorldEditOp } from './world-edit-ops';
import { WorldMapAssets, regionAssets } from './world-map-assets';
import { WorldAnimationAssets } from './world-animation-assets';
import { worldAmbient, timeAmbient } from './world-lighting';
import { WorldAtmosphere } from './world-atmosphere';
import { WorldStoryMarks } from './world-story-marks';
import { emptyStoryMarks, type StoryMarks } from './story-mechanics';
import type { WorldObjectSpec } from './maps';
import { npcRoutine, residentRoutine, WorldBarkDirector } from './world-routines';
import { NpcRoutineWalk } from './npc-motion';
import { sceneryAnimationManifestKey, sceneryAnimationTextureKeys, type SceneryAnimationManifest } from './scenery-animation';
import type { WorldPeriod, WorldTimeState } from './world-clock';
import { buildingEntrances, type InteriorId } from './interiors';
import { ExploreScene, clamp, type Character } from './explore-scene';
import { emitWorld, followWorld, readWorld, SceneKeys, WorldEvents, writeWorld, type WorldLearningContext, type WorldPlayer, type WorldStoryState } from './world-state';

/** Routine offsets are human-scale distances authored in the original 1536 × 1024 frame, not fractions of today's larger maps. */
const ROUTINE_FRAME = { width: 1536, height: 1024 };
/** The arrival curtain lifts once the visible ground has painted, or after this long regardless. */
const TERRAIN_WAIT_MS = 4000;

const assetKey = (path: string) => path.replace(/^\/assets\//, '').replace(/\.[^.]+$/, '');
/** Region sheets, manifests and painted pages a map uses, as far as its cached manifests say. */
function mapKeys(id: MapId, cache: Phaser.Cache.BaseCache): Set<string> {
  const keys = new Set(regionAssets(getMap(id)).map(asset => asset.key));
  for (const period of ['day', 'night'] as const) {
    keys.add(sceneryAnimationManifestKey(id, period));
    const manifest = cache.get(sceneryAnimationManifestKey(id, period)) as SceneryAnimationManifest | undefined;
    if (manifest) for (const page of sceneryAnimationTextureKeys(manifest)) keys.add(page);
  }
  return keys;
}
/**
 * Whether a completed file belongs only to other maps. A restart cannot abort a request already in
 * flight; when such a file arrives after travel it is dropped instead of staying in memory.
 */
function foreignToMap(key: string, current: MapId, cache: Phaser.Cache.BaseCache): boolean {
  if (mapKeys(current, cache).has(key)) return false;
  return maps.some(map => map.id !== current && mapKeys(map.id, cache).has(key));
}

interface LegacyResident {
  character: Character;
  motion: ReturnType<typeof createWorldResidents>[number];
  sample: ReturnType<typeof sampleResidentMotion>;
  routineElapsed?: number;
  homeReached?: boolean;
}
interface ActivityResident {
  character: Character;
  prop: Phaser.GameObjects.Graphics;
  actionFigure?: Phaser.GameObjects.Image;
  speech?: Phaser.GameObjects.Text;
  propKind?: string;
  sample?: ActivityResidentSample;
}
export interface WorldSceneData { mapId?: MapId }
export interface WorldWakeData { returnFrom?: InteriorId; instant?: boolean }

/** One outdoor map. Travel restarts this scene; rooms sleep it so the town is intact on return. */
export class WorldScene extends ExploreScene implements EditSurface {
  protected readonly objectPrefix = 'object' as const;
  mapSpec: WorldMapSpec = getMap('lindenhafen');
  private background?: GroundTerrain;
  private pendingTerrain?: GroundTerrain;
  private previousBackground?: GroundTerrain;
  private scenery?: WorldScenery;
  private previousScenery?: WorldScenery;
  private periodFade?: Phaser.Tweens.Tween;
  private previousPeriod?: WorldPeriod;
  private period: WorldPeriod = 'day';
  private pendingPeriod?: string;
  private mapAnimationsReady = false;
  private animationRetryAt = 0;
  private lastAmbient = '';
  private atmosphere?: WorldAtmosphere;
  private residents: LegacyResident[] = [];
  private activityWorld?: ResidentActivityWorld;
  private activityResidents: ActivityResident[] = [];
  private weatherPreview: WorldWeatherMode = 'regional';
  private observedResidentId?: string;
  private deliveryMarkers: Phaser.GameObjects.Container[] = [];
  private barkDirector = new WorldBarkDirector();
  private bark?: Phaser.GameObjects.Text;
  private barkUntil = 0;
  private barkSpeaker?: Character;
  private readonly routineWalks = new WeakMap<Character, NpcRoutineWalk>();
  private learning: WorldLearningContext = { lexicon: [], progress: { words: {} } };
  private silhouette?: Phaser.GameObjects.Container;
  private silhouetteLayers: Phaser.GameObjects.Image[] = [];
  private navigationOverlay?: Phaser.GameObjects.Graphics;
  private navigationOverlayAt = -Infinity;
  private readonly navigationDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('nav') === '1';
  private entranceTransition?: Phaser.Tweens.Tween;
  private enteringInterior = false;
  private mapAnnounced = false;
  private regionAssets = new WorldMapAssets(this);
  private animationAssets = new WorldAnimationAssets(this);
  private editController?: WorldEditController;
  private readonly occlusionList: OcclusionCharacter[] = [];
  private readonly occlusionPool: OcclusionCharacter[] = [];
  private storyMarks?: WorldStoryMarks;
  /** Ticket addresses and fading names that need their own marker in the world. */
  private mechanicsObjects: WorldObjectSpec[] = [];

  constructor() { super({ key: SceneKeys.World }); }
  get lampStrength(): number { return this.storyMarks?.lampStrength ?? 0; }

  get worldWidth(): number { return this.mapSpec.width; }
  get worldHeight(): number { return this.mapSpec.height; }

  init(data: WorldSceneData = {}): void {
    super.init();
    this.mapSpec = getMap(data.mapId ?? readWorld(this.registry, 'mapId') ?? 'lindenhafen');
    this.regionId = this.mapSpec.id;
    this.background = this.pendingTerrain = this.previousBackground = undefined;
    this.scenery = this.previousScenery = undefined;
    this.periodFade = undefined; this.previousPeriod = undefined; this.pendingPeriod = undefined;
    this.mapAnimationsReady = false; this.animationRetryAt = 0; this.lastAmbient = '';
    this.atmosphere = undefined; this.residents = []; this.activityWorld = undefined; this.activityResidents = [];
    this.storyMarks = undefined; this.mechanicsObjects = [];
    this.observedResidentId = readWorld(this.registry, 'observedResident');
    this.weatherPreview = readWorld(this.registry, 'weatherPreview') ?? 'regional';
    this.deliveryMarkers = []; this.bark = undefined; this.barkSpeaker = undefined; this.barkUntil = 0;
    this.silhouette = undefined; this.silhouetteLayers = []; this.navigationOverlay = undefined; this.navigationOverlayAt = -Infinity;
    this.entranceTransition = undefined; this.enteringInterior = false; this.mapAnnounced = false;
    // Bark timing is measured against this run's elapsed time, which init() just reset.
    this.barkDirector.reset(); this.learning = { lexicon: [], progress: { words: {} } };
    // Loader requests belong to one scene run; a restart abandons the previous batch.
    this.regionAssets = new WorldMapAssets(this);
    this.animationAssets = new WorldAnimationAssets(this);
    // Registered before preload so a run abandoned mid-load still releases what it fetched.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownMap());
    const current = this.mapSpec.id;
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string, type: string) => {
      if (!foreignToMap(key, current, this.cache.json)) return;
      if (type === 'json') this.cache.json.remove(key);
      else if (this.textures.exists(key)) this.textures.remove(key);
    });
  }

  /** Everything the arrival needs, loaded before anything is built: no placeholder ground or swapped scenery. */
  preload(): void {
    const label = this.mapSpec.name;
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => emitWorld(this.game, WorldEvents.LoadProgress, value, label));
    this.period = readWorld(this.registry, 'clock').advance(0).period;
    this.regionAssets.load(this.mapSpec, undefined, false);
    const id = this.mapSpec.id, period = this.period;
    this.animationAssets.load(id, period, () => {
      if (this.ready && this.mapSpec.id !== id) this.releaseAnimationAssets(id, period);
    }, false);
  }

  create(): void {
    super.create();
    const booted = this.registry.get('worldBooted') === true;
    this.registry.set('worldBooted', true);
    // Scene emitters outlive a restart; listeners added here are removed at shutdown.
    this.events.on(Phaser.Scenes.Events.WAKE, this.handleWake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.WAKE, this.handleWake, this));
    this.time.delayedCall(TERRAIN_WAIT_MS, () => this.announceMap());
    if (!booted) emitWorld(this.game, WorldEvents.Ready);
  }

  protected createNavigation(): NavigationGrid { return createMapNavigation(this.mapSpec.id); }
  protected spawnPoint(): MapPoint { return this.navigation.closestPoint(this.mapSpec.spawn.x * this.worldWidth, this.mapSpec.spawn.y * this.worldHeight); }
  protected spawnFacing(): number { return 0; }
  protected ownsPlayer(player: WorldPlayer): boolean {
    return (player.mapId ?? 'lindenhafen') === this.mapSpec.id && !player.interiorId;
  }

  protected buildScene(): void {
    const map = this.mapSpec;
    this.learning = readWorld(this.registry, 'learning') ?? this.learning;
    this.background = new GroundTerrain(this, getWorldScene(map.id), this.period).setTint(worldAmbient(map.id, this.period).terrain);
    this.background.update(this.cameras.main.worldView, this.cameras.main.zoom);
    this.mapAnimationsReady = this.animationAssets.ready(map.id, this.period);
    this.scenery = new WorldScenery(this, map.id, this.period, undefined, createSceneryOcclusion);
    this.scenery.setReducedMotion(this.reducedMotion);
    this.createMapCharacters(map);
    this.createMapObjects(map.objects);
    for (const entrance of buildingEntrances(map.id)) {
      const signKey = sceneryTextureKey(map.id);
      const sign = this.textures.exists(signKey) && this.textures.get(signKey).has('sign') ? this.add.image(0, -21, signKey, 'sign').setDisplaySize(38, 46) : undefined;
      this.createPortal(entrance.id, entrance.x * this.worldWidth, entrance.y * this.worldHeight, entrance.label, sign);
    }
    this.createResidents();
    this.atmosphere = new WorldAtmosphere(this, map.id, this.scenery.lampLights);
    const marks = readWorld(this.registry, 'storyMarks') ?? emptyStoryMarks(map.id);
    this.storyMarks = new WorldStoryMarks(this, map.id, this.worldWidth, this.worldHeight, marks);
    this.atmosphere.darkAt = (x, y) => this.storyMarks?.beamCovers(x, y) ?? false;
    this.applyStoryMarks(marks);
    this.audio?.setRegion(map.id);
    this.setTerrainOnly(this.terrainOnly);
    this.followWorldOnly();
    this.updateWorldTime();
  }

  private followWorldOnly(): void {
    followWorld(this, 'learning', context => { this.learning = context; });
    followWorld(this, 'storyMarks', marks => this.applyStoryMarks(marks));
    followWorld(this, 'weatherPreview', mode => { this.weatherPreview = mode; this.updateActivityResidents(); });
    followWorld(this, 'observedResident', id => { this.observedResidentId = id; });
    followWorld(this, 'editBridge', () => this.syncEditMode());
    this.syncEditMode();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.editController?.destroy(); this.editController = undefined; this.editing = false; });
  }

  // Edit mode ---------------------------------------------------------------

  private syncEditMode(): void {
    const bridge = readWorld(this.registry, 'editBridge');
    if (!bridge) {
      this.editController?.destroy(); this.editController = undefined; this.editing = false;
      return;
    }
    if (this.editController) return;
    this.editing = true;
    this.clearControls();
    this.editController = new WorldEditController(this, bridge);
  }
  get editMapId(): string { return this.mapSpec.id; }
  editScenery(): WorldScenery | undefined { return this.scenery; }
  editNavigation(): NavigationGrid { return this.navigation; }
  editAnchors(): { kind: 'npc' | 'object'; id: string; x: number; y: number }[] {
    const scene = getWorldScene(this.mapSpec.id), story = new Set(scene.objects.map(object => object.id));
    return [
      ...[...this.characters.values()].filter(character => scene.npcs.some(npc => npc.id === character.id))
        .map(character => ({ kind: 'npc' as const, id: character.id, x: character.x, y: character.y })),
      ...[...this.objects.values()].filter(object => story.has(object.spec.id)).map(object => ({ kind: 'object' as const, id: object.spec.id, x: object.x, y: object.y })),
    ];
  }
  editThumbnail(frame: string): string | undefined { return sceneryThumbnail(this, this.mapSpec.id, this.period, frame); }

  /**
   * Apply admin edits in place: scenery, collision, story markers, doors and
   * residents follow the new document without reloading the town.
   */
  applyWorldEdits(ops: readonly WorldEditOp[]): void {
    const id = this.mapSpec.id, relevant = ops.filter(op => op.map === id);
    if (!relevant.length || !this.ready) { this.editController?.documentChanged(); return; }
    const scene = getWorldScene(id);
    this.mapSpec = getMap(id);
    this.scenery?.sync(scene.scenery);
    this.previousScenery?.sync(scene.scenery);
    if (this.scenery) this.atmosphere?.setLampLights(this.scenery.lampLights);
    if(relevant.some(op=>op.kind==='ground'||op.kind==='paint')){
      // Repaint in place: a new layer would drop the loaded ground art and fetch it all again.
      for(const layer of [this.background,this.previousBackground,this.pendingTerrain])layer?.setWorld(scene);
    }
    this.navigation = this.navigation.withObstacles(sceneNavigationGeometry(scene).barriers);
    const spawn = this.spawnPoint();
    this.navigation.prepareReachability(spawn);
    // A player standing where something was just built steps out onto open ground.
    if (!this.navigation.isWalkable(this.local.x, this.local.y)) {
      const free = this.navigation.closestPoint(this.local.x, this.local.y, spawn);
      this.local.x = this.local.targetX = free.x; this.local.y = this.local.targetY = free.y;
      this.target = undefined; this.waypoints = [];
    }
    for (const op of relevant) if (op.kind === 'moveAnchor' && op.anchor === 'npc') {
      const character = this.characters.get(op.id);
      if (character) { const point = this.navigation.closestPoint(op.x, op.y); character.x = point.x; character.y = point.y; }
    }
    this.syncMapObjects();
    this.syncPortals();
    const owners = new Set((scene.activities ?? []).map(slot => slot.ownerId));
    if (relevant.some(op => op.kind === 'residents' || op.kind === 'ground' || op.kind === 'paint' || (op.kind !== 'moveAnchor' && op.kind !== 'place' && owners.has(op.id)) || (op.kind === 'place' && op.activities?.length))) this.rebuildActivityResidents();
    this.editController?.documentChanged();
    this.refreshNearby();
  }

  /** Fading names are written on the map; tickets and loose names become markers. */
  private applyStoryMarks(marks: StoryMarks): void {
    if (!this.storyMarks) return;
    const own = marks.mapId === this.mapSpec.id;
    this.storyMarks.setMarks(marks);
    this.storyMarks.setTrain(own ? marks.train : undefined, this.reducedMotion);
    const base = { exerciseIds: [], prompt: '', description: '' };
    this.mechanicsObjects = own ? [
      ...marks.tickets.map(ticket => ({ ...base, id: `side:${ticket.id}`, label: ticket.label, kind: 'parcel' as const, x: ticket.x, y: ticket.y })),
      ...marks.inks.filter(ink => ink.interactive).map(ink => ({ ...base, id: `ink:${ink.id}`, label: ink.text, kind: 'noticeboard' as const, x: ink.x, y: ink.y })),
    ] : [];
    this.syncMapObjects();
  }

  private syncMapObjects(): void {
    const wanted = new Map([...this.mapSpec.objects, ...this.mechanicsObjects].map(spec => [spec.id, spec]));
    for (const [id, object] of [...this.objects]) {
      const spec = wanted.get(id);
      if (!spec) { object.root.destroy(); this.objects.delete(id); continue; }
      wanted.delete(id);
      const x = spec.x * this.worldWidth, y = spec.y * this.worldHeight;
      if (x === object.x && y === object.y) continue;
      object.x = x; object.y = y; object.spec = spec;
      object.root.setPosition(x, y).setDepth(worldDepth(y, 'shadow'));
    }
    if (wanted.size) this.createMapObjects([...wanted.values()]);
  }

  private syncPortals(): void {
    const wanted = new Map(buildingEntrances(this.mapSpec.id).map(entrance => [entrance.id as string, entrance]));
    for (const [id, portal] of [...this.portals]) {
      const entrance = wanted.get(id);
      if (!entrance) { portal.root.destroy(); this.portals.delete(id); continue; }
      wanted.delete(id);
      portal.x = entrance.x * this.worldWidth; portal.y = entrance.y * this.worldHeight;
      portal.root.setPosition(portal.x, portal.y).setDepth(worldDepth(portal.y, 'label'));
    }
    for (const entrance of wanted.values()) {
      const signKey = sceneryTextureKey(this.mapSpec.id);
      const sign = this.textures.exists(signKey) && this.textures.get(signKey).has('sign') ? this.add.image(0, -21, signKey, 'sign').setDisplaySize(38, 46) : undefined;
      this.createPortal(entrance.id, entrance.x * this.worldWidth, entrance.y * this.worldHeight, entrance.label, sign);
    }
    this.resizeHitTargets();
  }

  /** The first painted view ends the travel curtain; failed tiles cannot hold it forever. */
  private announceMap(): void {
    if (this.mapAnnounced || !this.ready) return;
    this.mapAnnounced = true;
    emitWorld(this.game, WorldEvents.MapReady, this.mapSpec.id);
  }

  private shutdownMap(): void {
    this.finishPeriodTransition();
    this.atmosphere?.destroy();
    this.storyMarks?.destroy(); this.storyMarks = undefined;
    this.residents = []; this.activityResidents = []; this.activityWorld = undefined;
    this.deliveryMarkers = [];
    // The loader was reset with this run, so nothing of this map is still pending: release it now,
    // keeping any sheet the next destination already lists.
    const next = readWorld(this.registry, 'mapId');
    if (next === this.mapSpec.id) return;
    const keep = mapKeys(next, this.cache.json);
    for (const key of mapKeys(this.mapSpec.id, this.cache.json)) {
      if (keep.has(key) || key === this.mapSpec.id) continue;
      if (this.textures.exists(key)) this.textures.remove(key);
    }
  }

  // Interiors ---------------------------------------------------------------

  protected controlsHeld(): boolean { return this.enteringInterior; }

  protected usePortal(id: string): void {
    const entrance = buildingEntrances(this.mapSpec.id).find(building => building.id === id);
    if (entrance) this.enterInterior(entrance.interiorId);
  }

  /** Walk into the doorway, then hand the frame to the room scene while this map sleeps. */
  enterInterior(id: InteriorId, instant = false): void {
    if (this.enteringInterior) return;
    const entrance = buildingEntrances(this.mapSpec.id).find(item => item.interiorId === id);
    if (!entrance) return;
    if (instant || this.reducedMotion) { this.openInterior(id, instant); return; }
    this.clearControls();
    this.enteringInterior = true;
    this.refreshControls();
    this.entranceTransition = this.tweens.add({ targets: this.local, x: entrance.x * this.worldWidth, y: entrance.y * this.worldHeight, duration: 250, ease: 'Sine.easeIn',
      onComplete: () => {
        this.entranceTransition = undefined; this.enteringInterior = false; this.local.root.setAlpha(1);
        this.refreshControls();
        this.openInterior(id);
      } });
  }

  /** The room scene loads, then sleeps this map; until then the town stays on screen, frozen. */
  openInterior(id: InteriorId, instant = false): void {
    this.cancelEntrance();
    this.finishPeriodTransition();
    this.clearControls();
    this.suspended = true;
    writeWorld(this.registry, 'interiorId', id);
    this.scene.launch(SceneKeys.Interior, { id, mapId: this.mapSpec.id, instant });
    emitWorld(this.game, WorldEvents.InteriorChange, id);
  }

  /** Called by a closing room: wake if the room got as far as sleeping this map, otherwise resume in place. */
  resumeFromInterior(data: WorldWakeData): void {
    if (this.scene.isSleeping()) this.scene.wake(SceneKeys.World, data);
    else this.returnFromInterior(data);
  }

  /** A cancelled walk-in must not leave the player halfway inside a wall. */
  cancelEntrance(): void {
    if (!this.entranceTransition) return;
    this.entranceTransition.stop(); this.entranceTransition = undefined; this.enteringInterior = false;
    this.local.root.setAlpha(1);
    const point = this.navigation.closestPoint(this.local.x, this.local.y);
    this.local.x = this.local.targetX = point.x; this.local.y = this.local.targetY = point.y;
    this.refreshControls();
  }

  private handleWake(_sys: Phaser.Scenes.Systems, data?: WorldWakeData): void { this.returnFromInterior(data ?? {}); }

  private returnFromInterior(data: WorldWakeData): void {
    this.suspended = false;
    const entrance = data.returnFrom ? buildingEntrances(this.mapSpec.id).find(item => item.interiorId === data.returnFrom) : undefined;
    this.clearControls();
    if (entrance) {
      // Scenery placed since the door was authored may crowd its return point; step out onto clear ground.
      const returnPoint = this.navigation.closestPoint(entrance.returnPoint.x * this.worldWidth, entrance.returnPoint.y * this.worldHeight);
      this.local.x = this.local.targetX = returnPoint.x;
      this.local.y = this.local.targetY = returnPoint.y;
    }
    this.local.walkDistance = 0; this.local.lastWalkTime = undefined;
    this.cameraLead = { x: 0, y: 0 };
    this.lastAmbient = '';
    const snapshot = readWorld(this.registry, 'players');
    if (snapshot) this.syncPlayers(snapshot.players, snapshot.selfId);
    this.resetPlayerPosition();
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.updateResidents();
    this.fitCamera(this.scale.width, this.scale.height, this.density);
    if (!data.instant) this.transitionRoom();
    this.refreshControls();
    this.refreshNearby();
    emitWorld(this.game, WorldEvents.ExploreReady, SceneKeys.World);
  }

  /** Re-travel to the current map: the art is intact, so only the player returns to the spawn. */
  returnToSpawn(): void {
    this.cancelEntrance();
    this.clearControls();
    this.resetPlayerPosition();
    this.cameraLead = { x: 0, y: 0 };
    const spawn = this.spawnPoint();
    this.navigation.prepareReachability(spawn);
    this.local.x = this.local.targetX = spawn.x;
    this.local.y = this.local.targetY = spawn.y;
    this.local.facing = 0; this.local.walkDistance = 0; this.local.lastWalkTime = undefined;
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.fitCamera(this.scale.width, this.scale.height, this.density);
    this.time.delayedCall(0, () => emitWorld(this.game, WorldEvents.MapReady, this.mapSpec.id));
  }

  transitionRoom(): void {
    this.audio?.effect('door', .16);
    this.cameras.main.resetFX();
    if (!this.reducedMotion) this.cameras.main.fadeIn(220, 29, 35, 30);
  }

  approachBuilding(id: InteriorId): void { this.approachInteraction(`building:${id}`); }

  // Story -------------------------------------------------------------------

  setStoryState(state: WorldStoryState): void {
    if (state.bellCount > this.storyState.bellCount) {
      this.audio?.effect('bell', .24);
      if (!this.reducedMotion) this.cameras?.main.shake?.(240, .003);
    }
    super.setStoryState(state);
  }

  protected routineStep(npc: Character, seconds: number): MapPoint {
    const anchor = this.mapSpec.npcs.find(position => position.id === npc.id);
    if (!anchor) return { x: 0, y: 0 };
    const routine = npcRoutine(npc.id, this.clock.gameplayHour(), this.objective);
    const desiredX = anchor.x * this.worldWidth + routine.offsetX * ROUTINE_FRAME.width, desiredY = anchor.y * this.worldHeight + routine.offsetY * ROUTINE_FRAME.height;
    let walk = this.routineWalks.get(npc);
    if (!walk) { walk = new NpcRoutineWalk(); this.routineWalks.set(npc, walk); }
    const step = walk.step(npc, { x: desiredX, y: desiredY }, seconds,
      (from, to) => this.navigation.canWalkSegment(from.x, from.y, to.x, to.y));
    npc.x += step.x; npc.y += step.y;
    return step;
  }

  protected afterCharacter(npc: Character): void {
    if (Math.hypot(npc.x - this.local.x, npc.y - this.local.y) < 230) this.maybeBark(npc);
  }

  private maybeBark(character: Character): void {
    const bark = this.barkDirector.next({ speakerId: character.id, mapId: this.mapSpec.id, level: this.mapSpec.level, hour: this.clock.gameplayHour(), elapsedSeconds: this.elapsed,
      requiredNpcId: this.objective, conversationActive: !!this.conversationTarget || !!this.cinematicTarget || this.watching || !this.controlsEnabled,
      lexicon: this.learning.lexicon, progress: this.learning.progress, introduced: this.learning.introduced, lineAllowed: this.learning.lineAllowed });
    if (!bark) return;
    this.bark ??= this.add.text(0, 0, '', { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff3d5', backgroundColor: '#20352d', padding: { x: 9, y: 6 }, wordWrap: { width: 270 }, align: 'center' }).setOrigin(.5, 1);
    this.bark.setText(bark.german); this.barkSpeaker = character; this.barkUntil = this.elapsed + 5;
    emitWorld(this.game, WorldEvents.Bark, bark);
  }

  // Frame -------------------------------------------------------------------

  protected updateScene(seconds: number): void {
    const view = this.cameras.main.worldView;
    if (this.bark && this.barkSpeaker) {
      const halfWidth = this.bark.width * this.density / (2 * this.cameras.main.zoom);
      const barkX = clamp(this.barkSpeaker.x, view.x + halfWidth + 4, view.right - halfWidth - 4);
      this.bark.setVisible(!this.conversationTarget && !this.cinematicTarget && this.elapsed < this.barkUntil && !this.terrainOnly)
        .setPosition(barkX, this.barkSpeaker.y - 92).setScale(this.labelScale);
      setDepthIfChanged(this.bark, worldDepth(this.worldHeight + 100, 'label'));
    }
    const time = this.frameClock ?? this.clock.advance(0);
    this.updateWorldTime(time);
    this.updateResidents(seconds);
    this.scenery?.update(this.decorativeElapsed, view, this.occlusionCharacters(), seconds);
    this.updateSilhouette();
    this.updateNavigationOverlay();
    this.editController?.update();
    this.storyMarks?.update(seconds, this.local, view, this.labelScale, this.reducedMotion, this.terrainOnly || this.watching);
    this.atmosphere?.update(this.decorativeElapsed, time.hour, view, this.reducedMotion,
      this.storyState.flags?.storm_active ?? (this.storyState.completedQuestIds.includes('b1-council') && !this.storyState.completedQuestIds.includes('b1-storm')), this.rainIntensity());
    this.background?.update(view, this.cameras.main.zoom);
    this.previousBackground?.update(view, this.cameras.main.zoom);
    this.pendingTerrain?.update(view, this.cameras.main.zoom);
    if (!this.mapAnnounced && this.background?.ready) this.announceMap();
  }

  /** The shared clock has already advanced this frame; follow its light and period. */
  private updateWorldTime(state: WorldTimeState = this.clock.advance(0)): void {
    const ambientStamp = `${Math.round(state.hour * 120)}:${this.period}`;
    if (ambientStamp !== this.lastAmbient) {
      this.lastAmbient = ambientStamp;
      const ambient = timeAmbient(this.mapSpec.id, state.hour, this.period);
      this.background?.setTint(ambient.terrain);
      this.scenery?.setAmbientTint(ambient.scenery, ambient.light, ambient.ground);
      this.applyAmbient();
    }
    const request = `${this.mapSpec.id}-${state.period}`;
    if ((state.period !== this.period || !this.mapAnimationsReady) && this.pendingPeriod !== request && this.time.now >= this.animationRetryAt) {
      this.pendingPeriod = request;
      const id = this.mapSpec.id;
      this.animationAssets.load(id, state.period, loaded => {
        if (this.pendingPeriod === request) this.pendingPeriod = undefined;
        if (this.ready && this.mapSpec.id === id && this.clock.advance(0).period === state.period) {
          if (loaded) this.applyPeriod(state.period);
          else this.animationRetryAt = this.time.now + 3000;
        } else if (this.mapSpec.id !== id || this.period !== state.period) this.releaseAnimationAssets(id, state.period);
      });
    }
  }

  private applyAmbient(): void {
    const tint = timeAmbient(this.mapSpec.id, this.clock.advance(0).hour, this.period).people;
    for (const character of this.characters.values()) this.setCharacterAmbient(character, tint);
    if (this.local) this.setCharacterAmbient(this.local, tint);
    for (const peer of this.peers.values()) this.setCharacterAmbient(peer, tint);
    for (const { character } of this.residents) this.setCharacterAmbient(character, tint);
    for (const { character } of this.activityResidents) this.setCharacterAmbient(character, tint);
  }

  private releaseAnimationAssets(id: MapId, period: WorldPeriod): void {
    const key = sceneryAnimationManifestKey(id, period);
    // A partly loaded atlas must remain intact until its completion callbacks
    // decide whether to display it or release the stale request.
    if (this.animationAssets.pending(id, period)) return;
    const manifest = this.cache.json.get(key) as SceneryAnimationManifest | undefined;
    const retainedPages = id === this.mapSpec.id && this.ready ? this.animationAssets.retainedTextures(this.mapSpec.id, this.period, this.previousPeriod) : new Set<string>();
    if (manifest) for (const page of sceneryAnimationTextureKeys(manifest)) {
      // Expedition day/night periods can share one authored detail sheet.
      if (!retainedPages.has(page) && this.textures.exists(page)) this.textures.remove(page);
    }
  }

  protected mobileCameraChanged(): void {
    if (!this.mobileCamera) return;
    for (const map of maps) for (const period of ['day', 'night'] as const) {
      if (map.id !== this.mapSpec.id || period !== this.period) this.releaseAnimationAssets(map.id, period);
    }
  }

  /** Day and night crossfade on a tween; the old painting stays opaque until the new one has streamed. */
  private applyPeriod(period: WorldPeriod): void {
    if (period === this.period && this.mapAnimationsReady) return;
    if (!this.animationAssets.ready(this.mapSpec.id, period)) return;
    let terrain = this.background?.period === period ? this.background : undefined;
    if (!terrain) {
      if (this.pendingTerrain?.period !== period) {
        this.pendingTerrain?.destroy();
        this.pendingTerrain = new GroundTerrain(this, getWorldScene(this.mapSpec.id), period).setAlpha(0);
      }
      this.pendingTerrain.update(this.cameras.main.worldView, this.cameras.main.zoom);
      if (!this.pendingTerrain.ready) return;
      terrain = this.pendingTerrain; this.pendingTerrain = undefined;
    }
    this.finishPeriodTransition();
    const previous = this.period, oldScenery = this.scenery, oldBackground = this.background;
    this.period = period;
    this.background = terrain;
    this.scenery = new WorldScenery(this, this.mapSpec.id, period, undefined, createSceneryOcclusion);
    this.mapAnimationsReady = true;
    this.atmosphere?.setLampLights(this.scenery.lampLights);
    this.scenery.setReducedMotion(this.reducedMotion);
    this.scenery.setVisible(!this.terrainOnly);
    // An unchanged period still swaps scenery art once its native sheets arrive; fade that swap too.
    if (oldBackground && !this.reducedMotion) {
      this.previousScenery = oldScenery; this.previousPeriod = previous;
      if (oldBackground !== terrain) { this.previousBackground = oldBackground; terrain.setAlpha(0); }
      const fade = { alpha: 0 };
      this.scenery.setAlpha(0);
      this.periodFade = this.tweens.add({ targets: fade, alpha: 1, duration: previous !== period ? 1300 : 400, ease: 'Sine.easeInOut',
        onUpdate: () => {
          this.scenery?.setAlpha(fade.alpha);
          this.previousScenery?.setGroundContactAlpha(1-fade.alpha);
          if (this.previousBackground) this.background?.setAlpha(fade.alpha);
        },
        onComplete: () => this.finishPeriodTransition() });
    } else {
      oldScenery?.destroy();
      if (oldBackground !== terrain) oldBackground?.destroy();
      terrain.setAlpha(1).setTint(timeAmbient(this.mapSpec.id, this.clock.advance(0).hour, period).terrain);
      if (previous !== period) this.releaseAnimationAssets(this.mapSpec.id, previous);
    }
    this.lastAmbient = '';
    this.applyAmbient();
    this.pendingPeriod = undefined;
  }

  private finishPeriodTransition(): void {
    this.periodFade?.stop(); this.periodFade = undefined;
    this.previousScenery?.destroy(); this.previousScenery = undefined;
    this.previousBackground?.destroy(); this.previousBackground = undefined;
    this.scenery?.setAlpha(1); this.background?.setAlpha(1);
    const previous = this.previousPeriod; this.previousPeriod = undefined;
    if (previous && previous !== this.period) this.releaseAnimationAssets(this.mapSpec.id, previous);
  }

  // Residents ---------------------------------------------------------------

  private createResidents(): void {
    if (!this.playerArtReady) return;
    const authored = getWorldScene(this.mapSpec.id);
    // Authored sitting and working poses use exact prop anchors. Residents
    // keep their point routes while the player walks with body clearance.
    const actorNavigation = createMapNavigation(this.mapSpec.id, { agentRadius: 0 });
    this.activityWorld = this.compileActivityWorld(actorNavigation);
    for (const motion of createWorldResidents(this.mapSpec.id, actorNavigation).filter(motion => !authored.residents?.some(resident => resident.id === motion.id))) {
      const sharedTime = this.clock.simulationTime();
      const schedule = sharedTime ? sampleResidentSchedule(motion, sharedTime) : undefined;
      const homeReached = schedule?.homeReached ?? (residentRoutine(motion.id, this.clock.gameplayHour()).action === 'rest');
      const routineElapsed = schedule?.sampleSeconds ?? (homeReached
        ? Math.ceil((this.decorativeElapsed + motion.phaseSeconds) / motion.cycleSeconds) * motion.cycleSeconds - motion.phaseSeconds
        : this.decorativeElapsed);
      const position = sampleResidentMotion(motion, routineElapsed);
      const character = this.createCharacter(motion.id, motion.name, position.x, position.y, motion.avatar, undefined, motion.artVariant ?? -1, motion.artVariant);
      this.animateCharacter(character, 0, 0, this.elapsed, Infinity, {
        moving: position.moving, distance: residentWalkDistance(motion, routineElapsed),
        velocityX: position.velocityX, velocityY: position.velocityY, facingLeft: residentFacingLeft(motion, routineElapsed),
      });
      character.name.setColor('#ddd6b5').setVisible(false);
      character.root.setVisible(!homeReached && !this.terrainOnly);
      this.residents.push({ character, motion, sample: position, routineElapsed, homeReached });
    }
    this.createActivityResidents();
  }

  /** A routine that no longer fits the town must not stop the town from loading. */
  private compileActivityWorld(navigation: NavigationGrid): ResidentActivityWorld | undefined {
    try { return new ResidentActivityWorld(getWorldScene(this.mapSpec.id), navigation); }
    catch (error) { console.warn('Resident routines are paused until the schedule is fixed.', error); return undefined; }
  }

  private rebuildActivityResidents(): void {
    for (const { character } of this.activityResidents) character.root.destroy();
    this.activityResidents = [];
    this.activityWorld = this.compileActivityWorld(createMapNavigation(this.mapSpec.id, { agentRadius: 0 }));
    this.createActivityResidents();
  }

  private createActivityResidents(): void {
    if (!this.activityWorld) return;
    for (const { spec } of this.activityWorld.residents) {
      const character = this.createCharacter(spec.id, spec.name, spec.home.x, spec.home.y, spec.avatar, undefined, spec.artVariant ?? -1, spec.artVariant);
      const key = spec.actionArt ? residentActionKey(this.mapSpec.id, spec.actionArt) : undefined;
      const actionFigure = key && this.textures.exists(key) ? this.add.image(0, 0, key, 'idle').setOrigin(.5, RESIDENT_ACTION_ART.footY).setScale(MODULAR_ART.worldHeight / RESIDENT_ACTION_ART.bodyHeight).setVisible(false) : undefined;
      if (actionFigure) character.root.add(actionFigure);
      const prop = this.add.graphics(); character.root.add(prop); character.name.setColor('#ddd6b5');
      this.activityResidents.push({ character, prop, actionFigure });
    }
    this.updateActivityResidents();
  }

  private updateResidents(seconds?: number): void {
    const view = this.cameras.main.worldView;
    const sharedTime = this.clock.simulationTime();
    for (const resident of this.residents) {
      const { character, motion, sample } = resident;
      resident.routineElapsed ??= this.decorativeElapsed;
      const schedule = sharedTime ? sampleResidentSchedule(motion, sharedTime) : undefined;
      const routine = residentRoutine(character.id, this.clock.gameplayHour());
      if (!schedule && routine.action !== 'rest') resident.homeReached = false;
      if (!schedule && seconds !== undefined && !this.reducedMotion) {
        if (routine.action === 'rest' && !resident.homeReached) {
          const phase = (resident.routineElapsed + motion.phaseSeconds) % motion.cycleSeconds;
          const remaining = phase < .00001 ? 0 : motion.cycleSeconds - phase;
          const step = Math.min(seconds * routine.pace, remaining);
          resident.routineElapsed += step;
          if (step >= remaining) resident.homeReached = true;
        } else if (routine.action !== 'rest') resident.routineElapsed += seconds * routine.pace;
      }
      if (schedule) { resident.routineElapsed = schedule.sampleSeconds; resident.homeReached = schedule.homeReached; }
      const sampleTime = schedule?.sampleSeconds ?? (seconds === undefined ? this.decorativeElapsed : resident.routineElapsed);
      const position = sampleResidentMotion(motion, sampleTime, sample);
      const dx = position.x - character.x, dy = position.y - character.y;
      character.x = position.x; character.y = position.y;
      const visible = character.x >= view.x - 90 && character.x <= view.right + 90 && character.y >= view.y - 100 && character.y <= view.bottom + 100;
      character.root.setVisible(visible && !resident.homeReached && !this.terrainOnly);
      // Sampling the exact route gait also advances culled residents, so they
      // return with the same pose and facing as continuously visible people.
      this.animateCharacter(character, this.reducedMotion ? 0 : dx, this.reducedMotion ? 0 : dy, this.elapsed, Infinity, {
        moving: position.moving && !resident.homeReached, distance: residentWalkDistance(motion, sampleTime),
        velocityX: position.velocityX, velocityY: position.velocityY, facingLeft: residentFacingLeft(motion, sampleTime),
      });
      // Passing locals have no quest markers or player labels to crowd the map.
      character.name.setScale(this.labelScale).setVisible(!resident.homeReached && !position.moving && this.controlsEnabled
        && Math.hypot(character.x - this.local.x, character.y - this.local.y) < 100);
    }
    this.updateActivityResidents();
  }

  private weatherMode(): WorldWeatherMode { return this.clock.simulationTime() ? 'regional' : this.weatherPreview; }
  rainIntensity(): number { return worldRain(this.mapSpec.id, this.activityTime(), this.weatherMode()); }
  private activityTime(): WorldSimulationTime {
    return this.clock.simulationTime() ?? { seed: '0123456789abcdef0123456789abcdef', dayLengthSeconds: worldDaySeconds,
      elapsedSeconds: ((this.clock.gameplayHour() - worldStartHour + 24) % 24) * worldDaySeconds / 24 };
  }

  private updateActivityResidents(): void {
    if (!this.activityWorld) return;
    const samples = this.activityWorld.sample(this.activityTime(), this.weatherMode()), view = this.cameras.main.worldView;
    // The period's people tint is the same for every resident this frame.
    let people: number | undefined;
    const peopleTint = () => people ??= timeAmbient(this.mapSpec.id, this.clock.gameplayHour(), this.period).people;
    const bySpeaker = new Map(samples.map(sample => [sample.residentId, sample]));
    for (const resident of this.activityResidents) {
      const sample = bySpeaker.get(resident.character.id)!; resident.sample = sample;
      const character = resident.character, dx = sample.x - character.x, dy = sample.y - character.y;
      character.x = sample.x; character.y = sample.y;
      if (sample.facingLeft !== undefined && !sample.moving) character.facing = sample.facingLeft ? 3 : 1;
      const actor=character.componentCast?castActor(character.id):undefined,poseSet=residentComponentPose(sample);
      const candidate=poseSet?actor?.poses?.[poseSet]:undefined;
      const componentPose=candidate&&this.textures.exists(candidate.key)?candidate:undefined;
      if(componentPose){
        this.fitCharacterToRoom(character);
        character.root.setPosition(character.x,character.y);
        setDepthIfChanged(character.root,worldDepth(character.y, 'character'));
        const frame=character.facing*9+(this.reducedMotion?3:poseColumn(sample.phaseSeconds*1000,componentPose.frameDurations));
        if(character.componentPoseSet!==poseSet)character.figure!.setTexture(componentPose.key,frame);
        character.componentPoseSet=poseSet;
        character.figure!.setFrame(frame).setFlipX(false).setTint(peopleTint());
      }else{
        if(character.componentPoseSet){
          character.figure!.setTexture(actor!.key,characterFrame(character.facing)).setPosition(0,0).setFlipX(false);
          character.componentPoseSet=undefined;character.frame=-1;
        }
        this.animateCharacter(character,this.reducedMotion?0:dx,this.reducedMotion?0:dy,this.elapsed,Infinity,
          {moving:sample.moving,distance:sample.walkDistance,velocityX:sample.velocityX,velocityY:sample.velocityY,facingLeft:sample.facingLeft});
      }
      const pose=!componentPose&&resident.actionFigure?residentActionPose(sample,this.reducedMotion):undefined;
      for(const layer of character.layers)layer.setVisible(!pose && (character.componentCast || !!character.avatarLease));
      resident.actionFigure?.setVisible(!!pose);
      const seatedOffset=pose||componentPose&&poseSet==='seated'?residentSeatedOffset(sample,this.reducedMotion):0;
      if(componentPose)character.figure!.setPosition(0,seatedOffset);
      if(pose)resident.actionFigure!.setFrame(pose.frame).setPosition(0,seatedOffset).setFlipX(sample.facingLeft??character.facing===3).setTint(peopleTint());
      character.shadow.setPosition(0,2+seatedOffset);
      character.name.setY(((pose||componentPose&&poseSet==='seated')&&sample.seatedOffsetY!==undefined?-62:-79)+seatedOffset);
      const visible = !this.terrainOnly && sample.phase !== 'home' && sample.x >= view.x - 90 && sample.x <= view.right + 90 && sample.y >= view.y - 100 && sample.y <= view.bottom + 100;
      character.root.setVisible(visible);
      character.name.setScale(this.labelScale).setVisible(!sample.exchange && sample.phase === 'act' && (character.id === this.observedResidentId || this.controlsEnabled && Math.hypot(character.x - this.local.x, character.y - this.local.y) < 100));
      if (resident.propKind !== sample.heldObject) {
        resident.propKind = sample.heldObject; const prop = resident.prop; prop.clear();
        if (sample.heldObject === 'parcel') prop.fillStyle(0x745031).fillRect(-9, -39, 18, 14).fillStyle(0xcda36e).fillRect(-8, -38, 16, 11).fillStyle(0xf0d5a0).fillRect(-1, -38, 3, 11);
        else if (sample.heldObject === 'book') prop.fillStyle(0x324c51).fillRect(-10, -37, 20, 12).fillStyle(0xf0e2bd).fillRect(-8, -36, 7, 9).fillRect(1, -36, 7, 9);
        else if (sample.heldObject === 'tool') prop.fillStyle(0x916b41).fillRect(-2, -41, 4, 18).fillStyle(0xaab6b0).fillRect(-7, -43, 14, 5);
      }
      resident.prop.setVisible(!!sample.heldObject && pose?.bakedObject !== sample.heldObject);
      const exchange = sample.exchange;
      const speaking = visible && exchange?.speaking && !this.conversationTarget && !this.cinematicTarget && !this.watching
        && (this.controlsEnabled && Math.hypot(character.x - this.local.x, character.y - this.local.y) < 230 || character.id === this.observedResidentId || exchange.partnerId === this.observedResidentId)
        && (!this.learning.lineAllowed || this.learning.lineAllowed(exchange.german));
      if (speaking) {
        if (!resident.speech) { resident.speech = this.add.text(0, -106, '', { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff3d5', backgroundColor: '#20352d', padding: { x: 9, y: 6 }, wordWrap: { width: 190 }, align: 'center' }).setOrigin(.5, 1); character.root.add(resident.speech); }
        resident.speech.setText(exchange.german).setScale(this.labelScale);
        character.name.setVisible(false);
      }
      resident.speech?.setVisible(!!speaking);
    }
  }

  get activityResidentStates(): { id: string; name: string; state: ActivityResidentSample }[] {
    return this.activityResidents.flatMap(resident => resident.sample ? [{ id: resident.character.id, name: this.activityWorld!.residents.find(item => item.spec.id === resident.character.id)!.spec.name, state: { ...resident.sample } }] : []);
  }

  protected observedCharacter(): Character | undefined {
    return this.activityResidents.find(resident => resident.character.id === this.observedResidentId)?.character;
  }

  protected actors(): Character[] {
    return [...super.actors(), ...this.residents.map(resident => resident.character), ...this.activityResidents.map(resident => resident.character)];
  }

  setReducedMotion(reduced: boolean): void {
    super.setReducedMotion(reduced);
    this.scenery?.setReducedMotion(reduced);
  }

  setTerrainOnly(terrainOnly: boolean): void {
    super.setTerrainOnly(terrainOnly);
    this.scenery?.setVisible(!terrainOnly);
    this.atmosphere?.setVisible(!terrainOnly);
  }

  protected applyLabelDensity(density: number): void {
    super.applyLabelDensity(density);
    this.bark?.setResolution(density);
    for (const resident of this.activityResidents) resident.speech?.setResolution(density);
  }

  /** Rebuilt every frame into reused records, in the same order as actors(); the scenery copies what it keeps. */
  private occlusionCharacters(): OcclusionCharacter[] {
    const list = this.occlusionList, pool = this.occlusionPool;
    list.length = 0;
    const add = (character: Character | undefined) => {
      if (!character?.root.visible) return;
      const entry = pool[list.length] ??= { id: '', x: 0, y: 0, depth: 0, height: 0 };
      entry.id = character.id; entry.x = character.x; entry.y = character.y; entry.depth = character.root.depth; entry.height = character.npc ? 82 : 72;
      list.push(entry);
    };
    add(this.local);
    for (const character of this.characters.values()) add(character);
    for (const character of this.peers.values()) add(character);
    for (const resident of this.residents) add(resident.character);
    for (const resident of this.activityResidents) add(resident.character);
    return list;
  }

  private updateSilhouette(): void {
    const occlusion = !this.terrainOnly && this.local.root.visible ? this.scenery?.occlusionFor(this.local.id) : undefined;
    if (!occlusion || occlusion.depth <= this.local.root.depth) { this.silhouette?.setVisible(false); return; }
    if (!this.silhouette) this.silhouette = this.add.container();
    while (this.silhouetteLayers.length > this.local.layers.length) this.silhouetteLayers.pop()!.destroy();
    this.local.layers.forEach((source, index) => {
      let layer = this.silhouetteLayers[index];
      if (!layer) { layer = this.add.image(0, 0, source.texture.key, source.frame.name); this.silhouetteLayers.push(layer); this.silhouette!.add(layer); }
      layer.setTexture(source.texture.key, source.frame.name).setOrigin(source.originX, source.originY).setPosition(source.x, source.y)
        .setScale(source.scaleX, source.scaleY).setRotation(source.rotation).setFlip(source.flipX, source.flipY)
        .setTint(0x1b2a33).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.NORMAL).setVisible(source.visible);
    });
    this.silhouette.setPosition(this.local.x, this.local.y).setAlpha(.55 * occlusion.strength * this.local.root.alpha).setVisible(true);
    setDepthIfChanged(this.silhouette, occlusion.depth + 2);
  }

  private updateNavigationOverlay(): void {
    if (!this.navigationDebug || this.elapsed - this.navigationOverlayAt < .15) return;
    this.navigationOverlayAt = this.elapsed;
    if (!this.navigationOverlay) this.navigationOverlay = this.add.graphics();
    const graphics = this.navigationOverlay, geometry = this.navigation.debugGeometry(this.cameras.main.worldView);
    graphics.clear().setVisible(!this.terrainOnly);
    setDepthIfChanged(graphics, worldDepth(this.worldHeight + 120, 'label'));
    const polygon = (points: readonly (readonly [number, number])[], colour: number) => {
      if (!points.length) return;
      graphics.lineStyle(1, colour, .85).fillStyle(colour, .1).beginPath().moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) graphics.lineTo(point[0], point[1]);
      graphics.closePath().fillPath().strokePath();
    };
    geometry.walkable.forEach(points => polygon(points, 0x66df81));
    geometry.obstacles.forEach(points => polygon(points, 0xff6d72));
    graphics.fillStyle(0x84ffb2, .55);
    for (const point of geometry.nodes) graphics.fillCircle(point.x, point.y, .9);
    if (this.target) {
      graphics.lineStyle(2, 0xffe381, 1).beginPath().moveTo(this.local.x, this.local.y).lineTo(this.target.x, this.target.y);
      for (const point of this.waypoints) graphics.lineTo(point.x, point.y);
      graphics.strokePath();
    }
  }

  // Delivery run --------------------------------------------------------------

  playerPosition(): MapPoint { return { x: this.local.x, y: this.local.y }; }
  deliveryChoices(origin: MapPoint, target: MapPoint): MapPoint[] {
    const distance = Math.max(55, Math.min(130, Math.hypot(target.x - origin.x, target.y - origin.y))), points: MapPoint[] = [target];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const point = this.navigation.closestPoint(origin.x + dx * distance, origin.y + dy * distance);
      if (Math.hypot(point.x - origin.x, point.y - origin.y) < 45 || points.some(existing => Math.hypot(existing.x - point.x, existing.y - point.y) < 45) || !this.navigation.canWalkSegment(origin.x, origin.y, point.x, point.y)) continue;
      points.push(point);
    }
    return points;
  }
  deliveryRoute(): { recipient: string; points: MapPoint[] } | undefined {
    const candidates = [...this.characters.values()].filter(npc => this.characterRevealed(npc)).sort((a, b) => Math.abs(Math.hypot(a.x - this.local.x, a.y - this.local.y) - 450) - Math.abs(Math.hypot(b.x - this.local.x, b.y - this.local.y) - 450));
    for (const npc of candidates) {
      const endpoint = this.navigation.closestPoint(npc.x, npc.y + 45), path = this.navigation.findPath(this.local, endpoint);
      if (!path.length || Math.hypot(endpoint.x - this.local.x, endpoint.y - this.local.y) < 180) continue;
      const points: MapPoint[] = [this.playerPosition()]; let previous = this.playerPosition();
      for (const point of path) { const distance = Math.hypot(point.x - previous.x, point.y - previous.y), pieces = Math.max(1, Math.ceil(distance / 120)); for (let i = 1; i <= pieces; i++) points.push({ x: previous.x + (point.x - previous.x) * i / pieces, y: previous.y + (point.y - previous.y) * i / pieces }); previous = point; }
      if (points.length > 2) return { recipient: npc.id, points };
    }
  }
  showDeliveryCheckpoints(points: readonly MapPoint[], lit: number): void {
    this.deliveryMarkers.forEach(marker => marker.destroy()); this.deliveryMarkers = [];
    for (const [index, point] of points.entries()) {
      const glow = this.add.ellipse(0, 0, 45, 24, index < lit ? 0xffdc81 : 0x847856, index < lit ? .6 : .15).setStrokeStyle(2, 0xe5c37c, .65);
      const marker = this.add.image(0, -18, 'discovery').setTint(index < lit ? 0xffdc81 : 0x948567).setAlpha(index < lit ? 1 : .45);
      const size = Math.max(52, 44 / this.fitZoom), hit = this.add.zone(0, -10, size, size).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); if (this.controlsEnabled && !this.watching) this.walkTo(point.x, point.y); });
      this.deliveryMarkers.push(this.add.container(point.x, point.y, [glow, marker, hit]).setDepth(worldDepth(point.y, 'label')));
    }
  }
  showDeliveryArrival(recipient: string): void {
    const npc = [...this.characters.values()].find(npc => npc.id === recipient || npcs.find(spec => spec.id === npc.id)?.name.toLocaleLowerCase() === recipient.toLocaleLowerCase());
    if (!npc) return;
    const parcel = this.add.image(this.local.x, this.local.y - 35, 'discovery').setDepth(worldDepth(Math.max(this.local.y, npc.y) + 100, 'label')).setTint(0xf7d38a);
    this.tweens.add({ targets: parcel, x: npc.x, y: npc.y - 35, scale: .3, alpha: 0, duration: this.reducedMotion ? 1 : 800, onComplete: () => parcel.destroy() });
    npc.halo?.setAlpha(.7); this.audio?.effect('bell');
  }

  // Inspection ----------------------------------------------------------------

  get worldStats() {
    return { objects: this.scenery?.objectCount ?? 0, residents: this.residents.length + this.activityResidents.length,
      animated: this.scenery?.animatedObjectCount ?? 0, seconds: this.decorativeElapsed, period: this.period, ...this.frames.snapshot() };
  }
  get terrainStats() {
    const size = this.background ? this.background.nativeSize : { width: 0, height: 0 };
    return { ...size, pixelZoom: size.width ? this.cameras.main.zoom / (size.width / this.mapSpec.width) : 0 };
  }
}
