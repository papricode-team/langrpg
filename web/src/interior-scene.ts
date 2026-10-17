import { storyQuestId, storyQuestComplete } from './prologue-progress';
import * as Phaser from 'phaser';
import type { MapId } from './maps';
import { quests } from './content';
import type { MapPoint, NavigationGrid } from './navigation';
import { INTERIOR_CHARACTER_HEIGHT } from './character-art';
import { createInteriorNavigation, getInterior, interiorNpcAvailable, interiorObjectAvailable, type InteriorId, type InteriorSpec } from './interiors';
import { WorldInterior } from './world-interior';
import { worldDepth } from './world-depth';
import type { SceneryAnimationManifest } from './scenery-animation';
import { worldAssetUrl } from './world-asset-url';
import {castActor,castAssetUrl,castAtlasUrl} from './character-cast';
import { ExploreScene, type Character, type WorldObject } from './explore-scene';
import { emitWorld, readWorld, SceneKeys, WorldEvents, writeWorld, type WorldPlayer } from './world-state';
import type { WorldScene } from './world-scene';

export interface InteriorSceneData { id: InteriorId; mapId: MapId; instant?: boolean }
const sharedSheets = ['cafe-objects', 'bakery-objects', 'supermarket-objects', 'decor', 'furniture'] as const;

/** Rooms load their own painting on first entry; shared furniture sheets stay cached afterwards. */
export function loadInteriorAssets(load: Phaser.Loader.LoaderPlugin, spec: InteriorSpec): void {
  load.image(`interior-${spec.id}-room`, worldAssetUrl(spec.asset));
  if (spec.id.startsWith('train-')) {
    load.image('brandt-backdrop', '/assets/story-cast/brandt-conductor.webp');
    load.atlas('interior-train-furniture', '/assets/interior-train-furniture.webp', '/assets/interior-train-furniture.json');
    load.json('interior-train-stills', '/assets/interior-train-stills.json');
    load.atlas('interior-train-fog', '/assets/interior-train-fog.webp', '/assets/interior-train-fog.json');
    load.json('interior-train-effects', '/assets/interior-train-effects.json');
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
  private doorLabels: Phaser.GameObjects.Text[] = [];
  private instant = false;
  private leaving = false;
  private completedSounds = new Set<string>();

  constructor() { super({ key: SceneKeys.Interior }); }

  get worldWidth(): number { return this.spec.width; }
  get worldHeight(): number { return this.spec.height; }
  get interiorId(): InteriorId { return this.spec.id; }
  protected get indoor(): boolean { return true; }
  protected get indoorCharacterHeight(): number { return this.spec.characterHeight ?? INTERIOR_CHARACTER_HEIGHT; }

  protected get backdrop(): boolean { return this.spec.presentation === 'backdrop'; }

  init(data: InteriorSceneData): void {
    super.init();
    this.spec = getInterior(data.id);
    this.mapId = data.mapId;
    this.regionId = data.mapId;
    this.instant = !!data.instant;
    this.room = undefined; this.propTargets = []; this.doorLabels = []; this.leaving = false; this.completedSounds = new Set(readWorld(this.registry, 'storyState').completedQuestIds);
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
    if (!this.backdrop) this.resetPlayerPosition();
    if (this.spec.id.startsWith('train-')) {
      if (this.instant) this.audio?.effect('train-door', .12);
      if (!storyQuestComplete(readWorld(this.registry, 'storyState').completedQuestIds, 'a0-ticket')) this.audio?.effect('train-whistle', .1);
    }
  }

  protected createNavigation(): NavigationGrid { return createInteriorNavigation(this.spec.id); }
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
    this.createMapCharacters(spec, character => {
      const resident = spec.npcs.find(npc => npc.id === character.id);
      if (!resident) return;
      character.interactionId = resident.interactionId;
      character.role?.setText(resident.role);
    });
    this.createMapObjects(spec.objects.map(object => ({ ...object, kind: 'instrument' as const })), 'interior');
    if (this.backdrop) {
      const door = spec.objects.find(object => object.id === (spec.id === 'train-compartment' ? 'interior:prologue-wagen' : 'interior:prologue-wo'));
      if (door) this.doorLabels.push(this.add.text(door.x * this.worldWidth, door.y * this.worldHeight - 62, spec.id === 'train-compartment' ? '7' : 'WC', {fontFamily:'Georgia, serif',fontSize:'32px',fontStyle:'bold',color:'#f3d291',backgroundColor:'#18342d',padding:{x:12,y:6}}).setOrigin(.5).setDepth(worldDepth(door.y * this.worldHeight, 'prop')).setVisible(!this.terrainOnly));
    }
    this.createPropTargets();
    if (!this.backdrop) this.createPortal(`exit:${spec.id}`, spec.exit.x * this.worldWidth, spec.exit.y * this.worldHeight, 'Return to town', undefined, true);
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
    this.audio?.effect(this.spec.id.startsWith('train-') ? 'train-door' : 'door', .16);
    this.cameras.main.resetFX();
    if (!this.reducedMotion) this.cameras.main.fadeIn(220, 29, 35, 30);
  }

  protected usePortal(): void { this.leave(); }

  /** Hand the frame back to the town, which places the player at this room's door. */
  leave(instant = false): void {
    if (this.leaving) return;
    this.leaving = true;
    this.suspended = true;
    this.clearControls();
    writeWorld(this.registry, 'interiorId', undefined);
    const town = this.scene.get(SceneKeys.World) as WorldScene;
    town.resumeFromInterior({ returnFrom: this.spec.id, instant });
    this.scene.stop();
    emitWorld(this.game, WorldEvents.InteriorChange, undefined);
  }

  protected characterRevealed(character: Character): boolean {
    if (character.id === this.conversationTarget) return true;
    const visitor = this.spec.npcs.find(npc => npc.id === character.id);
    if (visitor && !interiorNpcAvailable(visitor, this.clock.gameplayHour())) return false;
    return super.characterRevealed(character);
  }

  protected objectAvailable(object: WorldObject): boolean {
    if (this.backdrop && !this.spec.objects.find(item => item.id === object.spec.id)?.npcId) {
      const next = quests.find(q => q.level === 'A0' && !this.storyState.completedQuestIds.includes(q.id));
      if (!next) return false;
      const id = (next.worldId ?? next.id).replace('a0-', 'interior:prologue-');
      if (object.spec.id !== id && !((next.worldId ?? next.id) === 'a0-wo' && object.spec.id === 'interior:prologue-exit')) return false;
    }
    return interiorObjectAvailable(this.spec, object.spec.id, this.clock.gameplayHour());
  }

  protected backdropFocus(): MapPoint {
    const object = [...this.objects.values()].find(item => !this.spec.objects.find(spec => spec.id === item.spec.id)?.npcId && this.objectAvailable(item));
    const conductor = this.spec.npcs[0];
    return {x: object ? (object.x + conductor.x * this.worldWidth) / 2 : this.worldWidth / 2, y: this.worldHeight / 2};
  }

  protected interactionPosition(id: string): MapPoint | undefined {
    if (!id.startsWith('interior:')) return super.interactionPosition(id);
    const station = this.objects.get(id);
    if (station && !this.objectAvailable(station)) return undefined;
    const resident = [...this.characters.values()].find(character => character.interactionId === id && this.characterRevealed(character));
    if (this.backdrop) return station ?? resident;
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
    if (resident && !this.backdrop) this.faceCharacters(this.local, resident);
    station.activatedUntil = this.elapsed + 4;
    emitWorld(this.game, WorldEvents.InteriorInteract, station.spec.id);
  }

  protected updateScene(): void {
    for (const hit of this.propTargets) { const object=this.objects.get(hit.getData('objectId')); if (hit.input) hit.input.enabled=!!object && this.objectAvailable(object); }
    const completed = readWorld(this.registry, 'storyState').completedQuestIds;
    this.room?.restoreTicket(!storyQuestComplete(completed, 'a0-ticket') || !!readWorld(this.registry, 'storyState').flags?.['prologue-name-practice']);
    this.room?.serveTea(storyQuestComplete(completed, 'a0-tee'));
    const dawn = storyQuestComplete(readWorld(this.registry, 'storyState').completedQuestIds, 'a0-langsam');
    this.room?.setDawn(dawn);
    if (this.backdrop) for (const [quest, sound] of [['a0-ticket','train-punch'],['a0-tee','train-cup'],['a0-morgen','train-brakes']] as const) {
      if (storyQuestComplete(readWorld(this.registry, 'storyState').completedQuestIds, quest) && !this.completedSounds.has(storyQuestId(quest))) { this.completedSounds.add(storyQuestId(quest)); this.audio?.effect(sound, .15); if (quest === 'a0-ticket') this.room?.punchTicket(); }
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
    for (const label of this.doorLabels) label.setVisible(!terrainOnly);
  }

  get worldStats() {
    return { objects: this.room?.objectCount ?? 0, residents: this.characters.size, animated: this.room?.animatedObjectCount ?? 0,
      seconds: this.decorativeElapsed, period: readWorld(this.registry, 'clock').advance(0).period, ...this.frames.snapshot() };
  }
}
