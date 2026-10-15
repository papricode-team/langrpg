import * as Phaser from 'phaser';
import { createAtmosphereTextures } from './world-atmosphere';
import { setDepthIfChanged, worldDepth } from './world-depth';
import { dowsing, type InkMark, type StoryMarks, type TrainState } from './story-mechanics';

/** Where the story's spectacle happens, in each town's canonical world units. */
export interface StorySpectacle {
  /** The chimney of the train painted inside the station: its steam shows a train at platform seven. */
  train?: { x: number; y: number };
  /** The lighthouse whose dark beam sweeps the harbour in Act III. */
  beam?: { x: number; y: number; radius: number };
}
export const storySpectacle: Readonly<Record<string, StorySpectacle>> = {
  lindenhafen: { train: { x: 1560, y: 139 } },
  nebelstadt: { beam: { x: 924, y: 470, radius: 1500 } },
};

const INK_COLOR = '#1b1712';
const PAPER = '#efe2c4';

/**
 * Fading names are written into the world itself: a plate, a chalk line, a name
 * on a stone. Their ink pales with the server's clock and darkens when spoken.
 * The repaired lantern leans toward the palest name nearby.
 */
export class WorldStoryMarks {
  private labels = new Map<string, Phaser.GameObjects.Container>();
  private lamp?: Phaser.GameObjects.Image;
  private lampCore?: Phaser.GameObjects.Image;
  private marks: StoryMarks;
  private trainState: TrainState;
  private steam?: Phaser.GameObjects.Particles.ParticleEmitter;
  private trainGlow?: Phaser.GameObjects.Image;
  private beam?: Phaser.GameObjects.Graphics;
  private beamAngle = -Math.PI * .8;
  /** 0 dark, 1 bright: read by the HUD to show the lamp's lean. */
  lampStrength = 0;
  lampTarget?: string;

  constructor(private scene: Phaser.Scene, private mapId: string, private width: number, private height: number, marks: StoryMarks) {
    createAtmosphereTextures(scene);
    this.marks = marks;
    this.setMarks(marks);
  }

  setMarks(marks: StoryMarks): void {
    this.marks = marks.mapId === this.mapId ? marks : { ...marks, inks: [], tickets: [], lamp: marks.lamp, beam: false };
    const wanted = new Set(this.marks.inks.map(ink => ink.id));
    for (const [id, label] of [...this.labels]) if (!wanted.has(id)) { label.destroy(); this.labels.delete(id); }
    for (const ink of this.marks.inks) this.label(ink);
    if (this.marks.lamp && !this.lamp) {
      this.lamp = this.scene.add.image(0, 0, 'atmo-glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.lampCore = this.scene.add.image(0, 0, 'atmo-core').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    }
    if (!this.marks.lamp) { this.lamp?.destroy(); this.lampCore?.destroy(); this.lamp = this.lampCore = undefined; this.lampStrength = 0; }
    const spectacle = storySpectacle[this.mapId];
    if (this.marks.beam && spectacle?.beam && !this.beam) this.beam = this.scene.add.graphics().setDepth(worldDepth(this.height + 50, 'label')).setBlendMode(Phaser.BlendModes.MULTIPLY);
    if (!this.marks.beam) { this.beam?.destroy(); this.beam = undefined; }
  }

  private label(ink: InkMark): void {
    let label = this.labels.get(ink.id);
    const x = ink.x * this.width, y = ink.y * this.height - (ink.objectId ? 70 : 48);
    if (!label) {
      const paper = this.scene.add.rectangle(0, 0, 10, 10, Phaser.Display.Color.HexStringToColor(ink.kind === 'chalk' || ink.kind === 'slate' ? '#2f3b39' : ink.kind === 'stone' ? '#8c8a80' : PAPER).color, .82)
        .setStrokeStyle(1, 0x6b5638, .55);
      const text = this.scene.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'italic', color: ink.kind === 'chalk' || ink.kind === 'slate' ? '#f4efe2' : INK_COLOR, padding: { x: 7, y: 3 } }).setOrigin(.5);
      label = this.scene.add.container(x, y, [paper, text]);
      label.setData('paper', paper); label.setData('text', text);
      this.labels.set(ink.id, label);
    }
    const text = label.getData('text') as Phaser.GameObjects.Text, paper = label.getData('paper') as Phaser.GameObjects.Rectangle;
    const shown = ink.lost && !ink.silent ? '· · ·' : ink.text;
    if (text.text !== shown) { text.setText(shown); paper.setSize(text.width + 6, text.height + 2); }
    label.setPosition(x, y);
    label.setData('level', ink.level);
    setDepthIfChanged(label, worldDepth(ink.y * this.height + 2, 'label'));
  }

  /** Steam from platform seven: a train arrives, waits with lit windows, then leaves. */
  setTrain(state: TrainState, reducedMotion: boolean): void {
    const spot = storySpectacle[this.mapId]?.train;
    if (state === this.trainState || !spot) return;
    this.trainState = state;
    if (!state) { this.steam?.destroy(); this.trainGlow?.destroy(); this.steam = undefined; this.trainGlow = undefined; return; }
    if (!this.steam) {
      this.steam = this.scene.add.particles(spot.x, spot.y, 'atmo-mote', { frequency: 120, lifespan: 3200, speedY: { min: -34, max: -18 }, speedX: { min: -4, max: 10 },
        scale: { start: 1.6, end: 6.5 }, alpha: { start: .55, end: 0 }, tint: 0xf4f1ea }).setDepth(worldDepth(spot.y + 200, 'label'));
      this.trainGlow = this.scene.add.image(spot.x - 30, spot.y + 60, 'atmo-glow').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(220, 140).setDepth(worldDepth(spot.y + 200, 'label')).setAlpha(0);
    }
    this.scene.tweens.killTweensOf(this.trainGlow!);
    if (reducedMotion) { this.steam.frequency = state === 'departing' ? -1 : 300; this.trainGlow!.setAlpha(state === 'departing' ? 0 : .35); return; }
    if (state === 'arriving') {
      this.steam.frequency = 45;
      this.scene.time.delayedCall(4500, () => { if (this.steam && this.trainState === 'arriving') this.steam.frequency = 140; });
      this.scene.tweens.add({ targets: this.trainGlow, alpha: .45, duration: 2400, ease: 'Sine.easeOut' });
    }
    if (state === 'waiting') { this.steam.frequency = 140; this.scene.tweens.add({ targets: this.trainGlow, alpha: { from: .3, to: .45 }, duration: 1800, yoyo: true, repeat: -1 }); }
    if (state === 'departing') {
      this.steam.frequency = 35;
      this.scene.tweens.add({ targets: this.trainGlow, alpha: 0, duration: 4800, ease: 'Sine.easeIn' });
      this.scene.time.delayedCall(5200, () => { if (this.steam && this.trainState === 'departing') this.steam.stop(); });
    }
  }

  update(seconds: number, player: { x: number; y: number }, view: Phaser.Geom.Rectangle, scale: number, reducedMotion: boolean, hidden: boolean): void {
    for (const ink of this.marks.inks) {
      const label = this.labels.get(ink.id);
      if (!label) continue;
      const distance = Math.hypot(label.x - player.x, label.y - player.y);
      const reach = ink.pale ? 900 : 520;
      const onScreen = label.x > view.x - 80 && label.x < view.right + 80 && label.y > view.y - 80 && label.y < view.bottom + 80;
      label.setVisible(!hidden && onScreen && distance < reach);
      const level = Number(label.getData('level') ?? 1);
      const shimmer = ink.pale && !reducedMotion ? .08 * Math.sin(performance.now() / 380 + ink.x * 40) : 0;
      (label.getData('text') as Phaser.GameObjects.Text).setAlpha(Math.max(.12, .14 + .86 * level + shimmer));
      label.setScale(scale);
    }
    if (this.lamp && this.lampCore) {
      const lean = dowsing(this.marks, player.x, player.y, this.width, this.height);
      const target = lean.strength > this.lampStrength ? lean.strength : this.lampStrength + (lean.strength - this.lampStrength) * Math.min(1, seconds * 2.5);
      this.lampStrength = target;
      this.lampTarget = lean.target?.id;
      const pulse = reducedMotion ? 0 : Math.sin(performance.now() / (260 - 140 * target)) * .07 * target;
      this.lamp.setPosition(player.x, player.y - 40).setDisplaySize(120 + 260 * target, 120 + 260 * target).setAlpha(hidden ? 0 : .14 + .5 * target + pulse).setDepth(worldDepth(player.y + 1, 'label'));
      this.lampCore.setPosition(player.x + 10, player.y - 46).setDisplaySize(14 + 10 * target, 14 + 10 * target).setAlpha(hidden ? 0 : .5 + .5 * target).setDepth(worldDepth(player.y + 1, 'label'));
    }
    const beam = storySpectacle[this.mapId]?.beam;
    if (this.beam && beam) {
      if (!reducedMotion) this.beamAngle += seconds * .22;
      const spread = .2, a = this.beamAngle;
      this.beam.clear().fillStyle(0x2a3550, .42).beginPath().moveTo(beam.x, beam.y)
        .lineTo(beam.x + Math.cos(a - spread) * beam.radius, beam.y + Math.sin(a - spread) * beam.radius)
        .lineTo(beam.x + Math.cos(a + spread) * beam.radius, beam.y + Math.sin(a + spread) * beam.radius).closePath().fillPath();
      this.beam.setVisible(!hidden);
    }
  }

  /** Whether the dark beam covers a world point now: lanterns there go out. */
  beamCovers(x: number, y: number): boolean {
    const beam = storySpectacle[this.mapId]?.beam;
    if (!this.beam || !beam) return false;
    const angle = Math.atan2(y - beam.y, x - beam.x), delta = Math.atan2(Math.sin(angle - this.beamAngle), Math.cos(angle - this.beamAngle));
    return Math.abs(delta) < .2 && Math.hypot(x - beam.x, y - beam.y) < beam.radius;
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
    this.lamp?.destroy(); this.lampCore?.destroy(); this.steam?.destroy(); this.trainGlow?.destroy(); this.beam?.destroy();
  }
}
