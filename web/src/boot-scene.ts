import { loadWorldFonts } from './world-fonts';
import { loadWorldUi } from './world-ui';
import * as Phaser from 'phaser';
import { castActorsForMap, castAssets, castAssetUrl, castAtlasUrl } from './character-cast';
import { loadWorldAudio } from './world-audio';
import { getMap } from './maps';
import { emitWorld, readWorld, SceneKeys, WorldEvents } from './world-state';
import { QUALITY_MANIFEST_KEY, QUALITY_MANIFEST_URL, setQualityManifest } from './texture-quality';

/** Art and sound every map shares, loaded once with progress before the first map starts. */
export class BootScene extends Phaser.Scene {
  // The tier manifest arrives before preload so every image request below can start at Low.
  constructor() { super({ key: SceneKeys.Boot, pack: { files: [{ type: 'json', key: QUALITY_MANIFEST_KEY, url: QUALITY_MANIFEST_URL } as Phaser.Types.Loader.FileConfig] } }); }

  init(): void {
    setQualityManifest(this.cache.json.get(QUALITY_MANIFEST_KEY));
    this.scene.launch(SceneKeys.Travel, { label: getMap(readWorld(this.registry, 'mapId')).name });
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => emitWorld(this.game, WorldEvents.LoadProgress, value * .5, getMap(readWorld(this.registry, 'mapId')).name));
    loadWorldAudio(this);
    loadWorldUi(this.load);
    this.load.image('greenhouse-train', '/assets/story-cast/greenhouse-train.webp');
    for (const actor of castActorsForMap(null)) for (const asset of castAssets(actor)) {
      if(asset.multiAtlas)this.load.multiatlas(asset.key,castAtlasUrl(asset),'/assets/character-cast/');
      else this.load.atlas(asset.key, castAssetUrl(asset), castAtlasUrl(asset));
    }
  }

  async create(): Promise<void> {
    await loadWorldFonts();
    if (!this.sys.isActive()) return;
    this.scene.start(SceneKeys.World, { mapId: readWorld(this.registry, 'mapId') });
  }
}
