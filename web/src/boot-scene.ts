import * as Phaser from 'phaser';
import { castActorsForMap, castAssets, castAssetUrl, castAtlasUrl } from './character-cast';
import { loadWorldAudio } from './world-audio';
import { getMap } from './maps';
import { emitWorld, readWorld, SceneKeys, WorldEvents } from './world-state';

/** Art and sound every map shares, loaded once with progress before the first map starts. */
export class BootScene extends Phaser.Scene {
  constructor() { super({ key: SceneKeys.Boot }); }

  init(): void {
    this.scene.launch(SceneKeys.Travel, { label: getMap(readWorld(this.registry, 'mapId')).name });
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => emitWorld(this.game, WorldEvents.LoadProgress, value * .5, getMap(readWorld(this.registry, 'mapId')).name));
    loadWorldAudio(this);
    this.load.image('greenhouse-train', '/assets/story-cast/greenhouse-train.webp');
    for (const actor of castActorsForMap(null)) for (const asset of castAssets(actor)) {
      if(asset.multiAtlas)this.load.multiatlas(asset.key,castAtlasUrl(asset),'/assets/character-cast/');
      else this.load.atlas(asset.key, castAssetUrl(asset), castAtlasUrl(asset));
    }
  }

  create(): void {
    this.scene.start(SceneKeys.World, { mapId: readWorld(this.registry, 'mapId') });
  }
}
