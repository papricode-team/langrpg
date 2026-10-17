import { getMap, maps } from './maps';
import { WORLD_UI, loadWorldUi, waitForWorldUi } from './world-ui';
import { WORLD_TITLE_FONT, refreshWorldFonts } from './world-fonts';
import * as Phaser from 'phaser';
import { emitWorld, readWorld, SceneKeys, WorldEvents } from './world-state';

export interface TravelSceneData { label: string }

/** A curtain over the map while its art loads; it lifts when the map reports its first painted view. */
export class TravelScene extends Phaser.Scene {
  private label = '';
  private backdrop!: Phaser.GameObjects.Rectangle;
  private painting?: Phaser.GameObjects.Image;
  private titlePlate?: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private track!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Rectangle;
  private progress = 0;
  private lifting = false;
  private painted = false;
  private mapReady = false;

  constructor() { super({ key: SceneKeys.Travel }); }

  init(data: TravelSceneData): void {
    this.label = data.label;
    this.progress = 0;
    this.lifting = false;
    this.painting = this.titlePlate = undefined;
    this.painted = false; this.mapReady = false;
    this.game.events.on(WorldEvents.LoadProgress, this.handleProgress, this);
    this.game.events.on(WorldEvents.MapReady, this.lift, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(WorldEvents.LoadProgress, this.handleProgress, this);
      this.game.events.off(WorldEvents.MapReady, this.lift, this);
    });
  }

  preload(): void {
    loadWorldUi(this.load);
    const map = maps.find(map => map.name === this.label) ?? getMap(readWorld(this.registry, 'mapId'));
    this.load.image('world-travel-preview', map.previewAsset);
  }

  async create(): Promise<void> {
    let alive = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { alive = false; });
    await waitForWorldUi(this.textures);
    if (!alive || !this.sys.isActive()) return;
    refreshWorldFonts(this);
    const density = readWorld(this.registry, 'density') ?? 1;
    // The curtain takes pointer input so nothing behind it can be clicked during the load.
    this.backdrop = this.add.rectangle(0, 0, 1, 1, 0x1d2a26).setOrigin(0).setInteractive();
    if (this.textures.exists('world-travel-preview')) this.painting = this.add.image(0, 0, 'world-travel-preview').setAlpha(.66);
    this.titlePlate = this.add.image(0, 0, WORLD_UI.ink);
    this.title = this.add.text(0, 0, this.label, { fontFamily: WORLD_TITLE_FONT, fontSize: `${22 * density}px`, color: '#302c22' }).setOrigin(.5);
    this.track = this.add.rectangle(0, 0, 1, 2 * density, 0x3b4c43).setOrigin(0, .5);
    this.bar = this.add.rectangle(0, 0, 1, 2 * density, 0xe5c37c).setOrigin(0, .5);
    this.painted = true;
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.game.events.off(WorldEvents.LoadProgress, this.handleProgress, this);
      this.game.events.off(WorldEvents.MapReady, this.lift, this);
      this.painting?.destroy();
      if (this.textures.exists('world-travel-preview')) this.textures.remove('world-travel-preview');
      this.painted = false;
    });
    if (this.mapReady) this.lift();
  }

  private layout(): void {
    const { width, height } = this.scale, barWidth = Math.min(width * .4, 360 * (readWorld(this.registry, 'density') ?? 1));
    this.backdrop.setSize(width, height);
    const density = readWorld(this.registry, 'density') ?? 1;
    if (this.painting) {
      const frame = this.painting.frame;
      const scale = Math.min(width * .88 / frame.width, height * .74 / frame.height);
      this.painting.setPosition(width / 2, height / 2 - 20*density).setScale(scale);
    }
    this.titlePlate?.setPosition(width / 2, height * .75).setDisplaySize(Math.min(width * .78, 430*density), 90*density);
    this.title.setPosition(width / 2, height * .75).setFontSize(Math.min(22*density, width / Math.max(15, this.title.text.length)));
    this.track.setPosition(width / 2 - barWidth / 2, height * .75 + 56*density).setSize(barWidth, this.track.height);
    this.bar.setPosition(this.track.x, this.track.y).setSize(Math.max(1, barWidth * this.progress), this.bar.height);
  }

  private handleProgress(value: number, label: string): void {
    this.progress = Math.max(this.progress, Math.min(1, value));
    if (label) this.label = label;
    if (this.painted) { this.title.setText(this.label); this.layout(); }
  }

  private lift(): void {
    this.mapReady = true;
    if (!this.painted || this.lifting) return;
    this.lifting = true;
    this.progress = 1; this.layout();
    this.backdrop.disableInteractive();
    if (readWorld(this.registry, 'reducedMotion')) { this.scene.stop(); return; }
    this.tweens.add({ targets: [this.backdrop, this.painting, this.titlePlate, this.title, this.track, this.bar].filter(Boolean), alpha: 0, duration: 450, ease: 'Sine.easeOut', onComplete: () => this.scene.stop() });
  }
}

/** Raise the curtain from a running scene; it stops itself once the map announces it is ready. */
export function raiseTravelCurtain(from: Phaser.Scene, label: string): void {
  from.scene.launch(SceneKeys.Travel, { label } satisfies TravelSceneData);
  from.scene.bringToTop(SceneKeys.Travel);
  emitWorld(from.game, WorldEvents.LoadProgress, 0, label);
}
