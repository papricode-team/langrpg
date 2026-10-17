import { currentPrologueBeat, storyQuestComplete } from './prologue-progress';
import {buildingRoomId, buildingRoomRoot} from './room-layout';
import * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { MapPoint, NavigationGrid } from './navigation';
import { INTERIOR_CHARACTER_HEIGHT } from './character-art';
import { createInteriorNavigation, getInterior, interiorNpcAvailable, interiorObjectAvailable, type InteriorId, type InteriorSpec } from './interiors';
import { paintedRoomKey, WorldInterior } from './world-interior';
import { worldDepth } from './world-depth';
import type { SceneryAnimationManifest } from './scenery-animation';
import { worldAssetUrl } from './world-asset-url';
import {castActor,castAssetUrl,castAtlasUrl} from './character-cast';
import { ExploreScene, type Character, type WorldObject } from './explore-scene';
import { emitWorld, readWorld, SceneKeys, WorldEvents, writeWorld, type WorldPlayer } from './world-state';
import {roomMaterials} from './room-kit';
import {terrainMaterial, terrainMaterialKey} from './terrain-materials';
import type { WorldScene } from './world-scene';
import { NpcRoutineWalk } from './npc-motion';

export interface InteriorSceneData { id: InteriorId; mapId: MapId; instant?: boolean; stairs?: boolean }
const sharedSheets = ['cafe-objects', 'bakery-objects', 'supermarket-objects', 'decor', 'furniture'] as const;
/** The carriage door is a story object: it opens onto platform seven only after the last beat. */
export const TRAIN_DOOR_ID = 'interior:prologue-exit';

/** Rooms load their own painting on first entry; shared furniture sheets stay cached afterwards. */
export function loadInteriorAssets(load: Phaser.Loader.LoaderPlugin, spec: InteriorSpec): void {
  if (spec.presentation === 'painted') {
    load.image(paintedRoomKey(spec), worldAssetUrl(spec.asset));
    if (spec.dawnAsset) load.image(paintedRoomKey(spec, true), worldAssetUrl(spec.dawnAsset));
    load.atlas('interior-train-furniture', worldAssetUrl('/assets/interior-train-furniture.webp'), worldAssetUrl('/assets/interior-train-furniture.json'));
    load.json('interior-train-stills', worldAssetUrl('/assets/interior-train-stills.json'));
  } else {
    load.image('room-kit-furniture', worldAssetUrl('/assets/room-kit-furniture.webp'));
    for (const id of roomMaterials) {
      const material = terrainMaterial(id)!;
      load.image(terrainMaterialKey(id), worldAssetUrl(material.asset));
    }
  }
  for (const sheet of sharedSheets) load.atlas(`interior-${sheet}`, worldAssetUrl(`/assets/interior-${sheet}.webp`), worldAssetUrl(`/assets/interior-${sheet}.json`));
  load.json('interior-animations', worldAssetUrl('/assets/interior-animations.json'));
  load.atlas('interior-effects', worldAssetUrl('/assets/interior-effects.webp'), worldAssetUrl('/assets/interior-effects.json'));
  load.json('interior-effect-animations', worldAssetUrl('/assets/interior-effect-animations.json'));
  load.atlas('interior-proportioned', worldAssetUrl('/assets/interior-proportioned.webp'), worldAssetUrl('/assets/interior-proportioned.json'));
  load.json('interior-stills', worldAssetUrl('/assets/interior-stills.json'));
}

/** One room in the current town. The town sleeps underneath and wakes on the way out. */
export class InteriorScene extends ExploreScene {
  protected readonly objectPrefix = 'interior' as const;
  spec: InteriorSpec = getInterior('cafe');
  private mapId: MapId = 'lindenhafen';
  private room?: WorldInterior;
  private propTargets: Phaser.GameObjects.Zone[] = [];
  private instant = false;
  private stairTransition = false;
  private leaving = false;
  private beat = 'done';
  private stationWalks = new Map<Character, NpcRoutineWalk>();
  private completedSounds = new Set<string>();

  constructor() { super({ key: SceneKeys.Interior }); }

  get worldWidth(): number { return this.spec.width; }
  get worldHeight(): number { return this.spec.height; }
  get interiorId(): InteriorId { return this.spec.id; }
  protected get indoor(): boolean { return true; }
  protected get indoorCharacterHeight(): number { return this.spec.characterHeight ?? INTERIOR_CHARACTER_HEIGHT; }
  /** The prologue carriage: one painted room whose story objects follow the beats. */
  get train(): boolean { return this.spec.presentation === 'painted' && this.spec.id.startsWith('train-'); }
  /** The authored id of the beat the carriage is showing. */
  get prologueBeat(): string { return this.beat; }

  init(data: InteriorSceneData): void {
    super.init();
    this.spec = getInterior(data.id, data.mapId);
    this.mapId = data.mapId;
    this.regionId = data.mapId;
    this.instant = !!data.instant;
    this.stairTransition = !!data.stairs;
    this.room = undefined; this.propTargets = []; this.leaving = false; this.stationWalks = new Map();
    const completed = readWorld(this.registry, 'storyState').completedQuestIds;
    this.beat = currentPrologueBeat(completed);
    // Sounds belong to beats finished in this visit, not to the ones already behind the player.
    this.completedSounds = new Set(['a0-ticket', 'a0-tee', 'a0-morgen'].filter(id => storyQuestComplete(completed, id)));
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => emitWorld(this.game, WorldEvents.LoadProgress, value, this.spec.name));
    loadInteriorAssets(this.load, this.spec);
    const nativeKeys:string[]=[];
    for(const person of this.spec.npcs){
      const native=castActor(person.id)?.native;
      if(native){nativeKeys.push(native.key);if(!this.textures.exists(native.key)){
        if(native.multiAtlas)this.load.multiatlas(native.key,castAtlasUrl(native),'/assets/character-cast/');
        else this.load.atlas(native.key,castAssetUrl(native),castAtlasUrl(native));
      }}
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{for(const key of nativeKeys)if(this.textures.exists(key))this.textures.remove(key);});
  }

  create(): void {
    super.create();
    // The town stays on screen while the room loads; it sleeps once the room can draw.
    this.scene.sleep(SceneKeys.World);
    if (!this.instant) this.transitionRoom();
    this.resetPlayerPosition();
    if (this.train && !storyQuestComplete(readWorld(this.registry, 'storyState').completedQuestIds, 'a0-ticket')) this.audio?.effect('train-whistle', .1);
  }

  syncPlayers(players: readonly WorldPlayer[], selfId: string): void {
    // A live wall edit can strand an existing position in an empty, sealed area.
    const spawn = this.spawnPoint();
    const adjusted = this.spec.layout ? players.map(player => {
      if (!this.ownsPlayer(player)) return player;
      const point = this.navigation.closestPoint(player.x * this.worldWidth, player.y * this.worldHeight, spawn);
      return {...player,x:point.x/this.worldWidth,y:point.y/this.worldHeight};
    }) : players;
    super.syncPlayers(adjusted, selfId);
  }

  protected createNavigation(): NavigationGrid { return createInteriorNavigation(this.spec.id, {}, this.mapId); }
  protected spawnPoint(): MapPoint { return this.navigation.closestPoint(this.spec.spawn.x * this.worldWidth, this.spec.spawn.y * this.worldHeight); }
  protected spawnFacing(): number { return 2; }
  protected ownsPlayer(player: WorldPlayer): boolean {
    return (player.mapId ?? 'lindenhafen') === this.mapId && player.interiorId === this.spec.id;
  }

  protected buildScene(): void {
    const spec = this.spec;
    this.room = new WorldInterior(this, spec);
    this.room.setReducedMotion(this.reducedMotion);
    this.room.setVisible(!this.terrainOnly);
    this.room.setDawn(this.dawn());
    this.createMapCharacters(spec, character => {
      const resident = spec.npcs.find(npc => npc.id === character.id);
      if (!resident) return;
      character.interactionId = resident.interactionId;
      character.role?.setText(resident.role);
      // Rejoining mid-story puts the conductor where the current beat happens.
      const station = this.stationFor(resident.id);
      if (station) { const point = this.navigation.closestPoint(station.x, station.y); character.x = point.x; character.y = point.y; character.root.setPosition(point.x, point.y); }
    });
    this.createMapObjects(spec.objects.map(object => ({ ...object, kind: 'instrument' as const })), 'interior');
    this.createPropTargets();
    for(const door of spec.layout?.links ?? []) {
      const destination=getInterior(buildingRoomId(spec.id,door.targetRoom) as InteriorId,this.mapId);
      this.createPortal(`room-door:${door.id}`,door.x,door.y,door.kind==='stairs'?`Stairs ${spec.stairDirections?.[door.id]} · ${destination.name}`:destination.name);
    }
    this.createPortal(`exit:${spec.id}`, spec.exit.x * this.worldWidth, spec.exit.y * this.worldHeight, this.train ? 'Bahnsteig 7' : 'Return to town', undefined, true);
  }

  private createPropTargets(): void {
    const trainStills = this.cache.json.get('interior-train-stills') as SceneryAnimationManifest | undefined;
    const manifest = this.cache.json.get('interior-animations') as SceneryAnimationManifest | undefined;
    const stills = this.cache.json.get('interior-stills') as SceneryAnimationManifest | undefined;
    for (const prop of this.spec.props) {
      if (!prop.interactive) continue;
      const object = this.objects.get(prop.interactive);
      if (!object) continue;
      const animation = trainStills?.assets[prop.asset] ?? stills?.assets[prop.asset] ?? manifest?.assets[prop.asset];
      const height = prop.width * (animation ? animation.height / animation.referenceWidth : .75);
      const centerX = prop.x + (.5 - (animation?.originX ?? .5)) * prop.width;
      const centerY = prop.y + (.5 - (animation?.originY ?? .97)) * height;
      const hit = this.add.zone(centerX, centerY, prop.width, height * .9)
        .setDepth(worldDepth(prop.depth ?? prop.y, 'label')).setInteractive({ useHandCursor: true }).setVisible(!this.terrainOnly);
      this.bindHover(hit, object, () => this.approachInteraction(object.interactionId));
      hit.setData('objectId', prop.interactive);
      this.propTargets.push(hit);
    }
  }

  transitionRoom(): void {
    if (!this.stairTransition) this.audio?.effect(this.train ? 'train-door' : 'door', .16);
    this.cameras.main.resetFX();
    if (!this.reducedMotion) this.cameras.main.fadeIn(this.train ? 900 : 220, 29, 35, 30);
  }

  protected usePortal(id:string): void {
    if (this.train) { emitWorld(this.game, WorldEvents.InteriorInteract, TRAIN_DOOR_ID); return; }
    const door=this.spec.layout?.links?.find(d=>`room-door:${d.id}`===id);
    if(!door){this.leave();return;}
    if(this.leaving)return;
    this.leaving=true;this.suspended=true;this.clearControls();
    const target=buildingRoomId(this.spec.id,door.targetRoom) as InteriorId;
    writeWorld(this.registry,'interiorId',target);
    this.scene.restart({id:target,mapId:this.mapId,stairs:door.kind==='stairs'});
    emitWorld(this.game,WorldEvents.InteriorChange,target,door.id);
  }

  /** Hand the frame back to the town, which places the player at this room's door. */
  leave(instant = false): void {
    if (this.leaving) return;
    this.leaving = true;
    this.suspended = true;
    this.clearControls();
    writeWorld(this.registry, 'interiorId', undefined);
    const town = this.scene.get(SceneKeys.World) as WorldScene;
    town.resumeFromInterior({ returnFrom: buildingRoomRoot(this.spec.id) as InteriorId, instant });
    this.scene.stop();
    emitWorld(this.game, WorldEvents.InteriorChange, undefined);
  }

  protected characterRevealed(character: Character): boolean {
    if (character.id === this.conversationTarget) return true;
    const visitor = this.spec.npcs.find(npc => npc.id === character.id);
    if (visitor && !interiorNpcAvailable(visitor, this.clock.gameplayHour())) return false;
    return super.characterRevealed(character);
  }

  /** Story objects exist only in the beats that use them; everything else keeps its hours. */
  protected objectAvailable(object: WorldObject): boolean {
    const spec = this.spec.objects.find(item => item.id === object.spec.id);
    if (spec?.prologueBeats && !spec.prologueBeats.includes(this.beat)) return false;
    return interiorObjectAvailable(this.spec, object.spec.id, this.clock.gameplayHour());
  }

  private stationFor(npcId: string): MapPoint | undefined {
    const stations = this.spec.npcs.find(npc => npc.id === npcId)?.prologueStations;
    const station = stations?.[this.beat] ?? stations?.done;
    return station ? { x: station[0], y: station[1] } : undefined;
  }

  /** The conductor walks to the place where the next beat happens. */
  protected routineStep(npc: Character, seconds: number): MapPoint {
    const station = this.stationFor(npc.id);
    if (!station) return { x: 0, y: 0 };
    let walk = this.stationWalks.get(npc);
    if (!walk) { walk = new NpcRoutineWalk(); this.stationWalks.set(npc, walk); }
    const step = walk.step(npc, station, seconds, (from, to) => this.navigation.canWalkSegment(from.x, from.y, to.x, to.y));
    npc.x += step.x; npc.y += step.y;
    // The conversation hotspot travels with the conductor; his own name and star mark him.
    const hotspot = npc.interactionId ? this.objects.get(npc.interactionId) : undefined;
    if (hotspot) { hotspot.x = npc.x; hotspot.y = npc.y; hotspot.root.setPosition(npc.x, npc.y).setAlpha(0); }
    return step;
  }

  protected interactionPosition(id: string): MapPoint | undefined {
    if (!id.startsWith('interior:')) return super.interactionPosition(id);
    const station = this.objects.get(id);
    if (station && !this.objectAvailable(station)) return undefined;
    const resident = [...this.characters.values()].find(character => character.interactionId === id && this.characterRevealed(character));
    if (!station) return resident;
    if (!resident) return station;
    return Math.hypot(resident.x - this.local.x, resident.y - this.local.y)
      < Math.hypot(station.x - this.local.x, station.y - this.local.y) ? resident : station;
  }

  protected triggerInteraction(id: string): void {
    if (!id.startsWith('interior:')) { super.triggerInteraction(id); return; }
    this.cancelRoute();
    const station = this.objects.get(id);
    if (!station || !this.objectAvailable(station)) return;
    const resident = [...this.characters.values()].find(character => character.interactionId === id && this.characterRevealed(character));
    if (resident) this.faceCharacters(this.local, resident);
    station.activatedUntil = this.elapsed + 4;
    emitWorld(this.game, WorldEvents.InteriorInteract, station.spec.id);
  }

  private dawn(): boolean {
    return this.train && storyQuestComplete(readWorld(this.registry, 'storyState').completedQuestIds, 'a0-langsam');
  }

  protected updateScene(): void {
    for (const hit of this.propTargets) { const object=this.objects.get(hit.getData('objectId')); if (hit.input) hit.input.enabled=!!object && this.objectAvailable(object); }
    if (this.train) {
      const state = readWorld(this.registry, 'storyState'), completed = state.completedQuestIds;
      this.beat = currentPrologueBeat(completed);
      this.room?.restoreTicket(!!state.flags?.['prologue-name-practice'] || storyQuestComplete(completed, 'a0-name'));
      this.room?.serveTea(!!state.flags?.['prologue-tea']);
      this.room?.setDawn(this.dawn());
      for (const [quest, sound] of [['a0-ticket','train-punch'],['a0-tee','train-cup'],['a0-morgen','train-brakes']] as const) {
        if (storyQuestComplete(completed, quest) && !this.completedSounds.has(quest)) { this.completedSounds.add(quest); this.audio?.effect(sound, .15); }
      }
    }
    this.room?.update(this.decorativeElapsed, this.cameras.main.worldView);
  }

  setReducedMotion(reduced: boolean): void {
    super.setReducedMotion(reduced);
    this.room?.setReducedMotion(reduced);
  }

  setTerrainOnly(terrainOnly: boolean): void {
    super.setTerrainOnly(terrainOnly);
    this.room?.setVisible(!terrainOnly);
    for (const target of this.propTargets) target.setVisible(!terrainOnly);
  }

  get worldStats() {
    return { objects: this.room?.objectCount ?? 0, residents: this.characters.size, animated: this.room?.animatedObjectCount ?? 0,
      seconds: this.decorativeElapsed, period: readWorld(this.registry, 'clock').advance(0).period, ...this.frames.snapshot() };
  }
}
