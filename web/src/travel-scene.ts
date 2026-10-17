import * as Phaser from 'phaser';
import { emitWorld, readWorld, SceneKeys, WorldEvents } from './world-state';

export interface TravelSceneData { label: string }

/** A curtain over the map while its art loads; it lifts when the map reports its first painted view. */
export class TravelScene extends Phaser.Scene {
  private label = '';
  private backdrop!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private track!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Rectangle;
  private progress = 0;
  private lifting = false;

  constructor() { super({ key: SceneKeys.Travel }); }

  init(data: TravelSceneData): void {
    this.label = data.label;
    this.progress = 0;
    this.lifting = false;
  }

  create(): void {
    const density = readWorld(this.registry, 'density') ?? 1;
    // The curtain takes pointer input so nothing behind it can be clicked during the load.
    this.backdrop = this.add.rectangle(0, 0, 1, 1, 0x1d2a26).setOrigin(0).setInteractive();
    this.title = this.add.text(0, 0, this.label, { fontFamily: 'Georgia, serif', fontSize: `${22 * density}px`, color: '#f3e3bb' }).setOrigin(.5);
    this.track = this.add.rectangle(0, 0, 1, 2 * density, 0x3b4c43).setOrigin(0, .5);
    this.bar = this.add.rectangle(0, 0, 1, 2 * density, 0xe5c37c).setOrigin(0, .5);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.game.events.on(WorldEvents.LoadProgress, this.handleProgress, this);
    this.game.events.on(WorldEvents.MapReady, this.lift, this);
    this.game.events.on(WorldEvents.ExploreReady, this.handleExploreReady, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.game.events.off(WorldEvents.LoadProgress, this.handleProgress, this);
      this.game.events.off(WorldEvents.MapReady, this.lift, this);
      this.game.events.off(WorldEvents.ExploreReady, this.handleExploreReady, this);
    });
  }

  private layout(): void {
    const { width, height } = this.scale, barWidth = Math.min(width * .4, 360 * (readWorld(this.registry, 'density') ?? 1));
    this.backdrop.setSize(width, height);
    this.title.setPosition(width / 2, height / 2 - 18);
    this.track.setPosition(width / 2 - barWidth / 2, height / 2 + 22).setSize(barWidth, this.track.height);
    this.bar.setPosition(this.track.x, this.track.y).setSize(Math.max(1, barWidth * this.progress), this.bar.height);
  }

  private handleProgress(value: number, label: string): void {
    this.progress = Math.max(this.progress, Math.min(1, value));
    if (label) this.title.setText(label);
    this.layout();
  }

  private handleExploreReady(key: string): void {
    // A restored room can sleep the town before its terrain ever paints. The
    // room's first frame is sufficient; town readiness still waits for MapReady.
    if (key === SceneKeys.Interior) this.lift();
  }

  private lift(): void {
    if (this.lifting) return;
    this.lifting = true;
    this.progress = 1; this.layout();
    this.backdrop.disableInteractive();
    if (readWorld(this.registry, 'reducedMotion')) { this.scene.stop(); return; }
    this.tweens.add({ targets: [this.backdrop, this.title, this.track, this.bar], alpha: 0, duration: 450, ease: 'Sine.easeOut', onComplete: () => this.scene.stop() });
  }
}

/** Raise the curtain from a running scene; it stops itself once the map announces it is ready. */
export function raiseTravelCurtain(from: Phaser.Scene, label: string): void {
  from.scene.launch(SceneKeys.Travel, { label } satisfies TravelSceneData);
  from.scene.bringToTop(SceneKeys.Travel);
  emitWorld(from.game, WorldEvents.LoadProgress, 0, label);
}
