import * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { MapPoint, NavigationGrid } from './navigation';
import { INTERIOR_CHARACTER_HEIGHT } from './character-art';
import { createInteriorNavigation, getInterior, interiorNpcAvailable, interiorObjectAvailable, type InteriorId, type InteriorSpec } from './interiors';
import { WorldInterior } from './world-interior';
import { worldDepth } from './world-depth';
import type { SceneryAnimationManifest } from './scenery-animation';
import { worldAssetUrl } from './world-asset-url';
import { ExploreScene, type Character, type WorldObject } from './explore-scene';
import { emitWorld, readWorld, SceneKeys, WorldEvents, writeWorld, type WorldPlayer } from './world-state';
import type { WorldScene } from './world-scene';

export interface InteriorSceneData { id: InteriorId; mapId: MapId; instant?: boolean }
const sharedSheets = ['cafe-objects', 'bakery-objects', 'supermarket-objects', 'decor', 'furniture'] as const;

/** Rooms load their own painting on first entry; shared furniture sheets stay cached afterwards. */
export function loadInteriorAssets(load: Phaser.Loader.LoaderPlugin, spec: InteriorSpec): void {
  load.image(`interior-${spec.id}-room`, worldAssetUrl(spec.asset));
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
  private leaving = false;

  constructor() { super({ key: SceneKeys.Interior }); }

  get worldWidth(): number { return this.spec.width; }
  get worldHeight(): number { return this.spec.height; }
  get interiorId(): InteriorId { return this.spec.id; }
  protected get indoor(): boolean { return true; }
  protected get indoorCharacterHeight(): number { return this.spec.characterHeight ?? INTERIOR_CHARACTER_HEIGHT; }

  init(data: InteriorSceneData): void {
    super.init();
    this.spec = getInterior(data.id);
    this.mapId = data.mapId;
    this.regionId = data.mapId;
    this.instant = !!data.instant;
    this.room = undefined; this.propTargets = []; this.leaving = false;
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => emitWorld(this.game, WorldEvents.LoadProgress, value, this.spec.name));
    loadInteriorAssets(this.load, this.spec);
  }

  create(): void {
    super.create();
    // The town stays on screen while the room loads; it sleeps once the room can draw.
    this.scene.sleep(SceneKeys.World);
    if (!this.instant) this.transitionRoom();
    this.resetPlayerPosition();
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
    this.createPropTargets();
    this.createPortal(`exit:${spec.id}`, spec.exit.x * this.worldWidth, spec.exit.y * this.worldHeight, 'Return to town', undefined, true);
  }

  private createPropTargets(): void {
    const manifest = this.cache.json.get('interior-animations') as SceneryAnimationManifest | undefined;
    const stills = this.cache.json.get('interior-stills') as SceneryAnimationManifest | undefined;
    for (const prop of this.spec.props) {
      if (!prop.interactive) continue;
      const object = this.objects.get(prop.interactive);
      if (!object) continue;
      const animation = stills?.assets[prop.asset] ?? manifest?.assets[prop.asset];
      const height = prop.width * (animation ? animation.height / animation.referenceWidth : .75);
      const centerX = prop.x + (.5 - (animation?.originX ?? .5)) * prop.width;
      const centerY = prop.y + (.5 - (animation?.originY ?? .97)) * height;
      const hit = this.add.zone(centerX, centerY, prop.width, height * .9)
        .setDepth(worldDepth(prop.depth ?? prop.y, 'label')).setInteractive({ useHandCursor: true }).setVisible(!this.terrainOnly);
      this.bindHover(hit, object, () => this.approachInteraction(object.interactionId));
      this.propTargets.push(hit);
    }
  }

  transitionRoom(): void {
    this.audio?.effect('door', .16);
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
    return interiorObjectAvailable(this.spec, object.spec.id, this.clock.gameplayHour());
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

  protected updateScene(): void {
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
