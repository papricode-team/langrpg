import * as Phaser from 'phaser';
import { NPC_ART } from './character-art';
import { MODULAR_ART, modularAssets, partTextureKey } from './avatar-options';
import { loadWorldAudio } from './world-audio';
import { sceneryAnimationTextureKeys, type SceneryAnimationManifest } from './scenery-animation';
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
    this.load.once('filecomplete-json-residents-animations', (_key: string, _type: string, manifest: SceneryAnimationManifest) => {
      for (const page of sceneryAnimationTextureKeys(manifest)) this.load.atlas(page, `/assets/${page}.webp`, `/assets/${page}.json`);
    });
    this.load.json('residents-animations', '/assets/residents-animations.json');
    this.load.spritesheet('story-cast', '/assets/story-cast/directions.webp', { frameWidth: 256, frameHeight: 384 });
    this.load.spritesheet('main-cast', '/assets/story-cast/main-directions.webp', { frameWidth: 256, frameHeight: 384 });
    this.load.image('greenhouse-train', '/assets/story-cast/greenhouse-train.webp');
    this.load.spritesheet(NPC_ART.key, '/assets/characters.webp', { frameWidth: NPC_ART.width, frameHeight: NPC_ART.height });
    for (const asset of modularAssets) this.load.spritesheet(partTextureKey(asset.id, ''), `/assets/player-layers/${asset.id}-preview.webp?v=layers12`, { frameWidth: MODULAR_ART.width, frameHeight: MODULAR_ART.height });
  }

  create(): void {
    this.scene.start(SceneKeys.World, { mapId: readWorld(this.registry, 'mapId') });
  }
}
