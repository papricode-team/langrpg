import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { LampLight, SceneryView } from './world-scenery';
import { nightIntensity } from './world-clock';
import { getWorldScene } from './scene-data';
import { worldDepth } from './world-depth';

// Weather sits above the ground plate and below people, buildings and labels.
export const WEATHER_DEPTH = 2;
/** Drops and motes per whole map at full strength; a view shows its share of them. */
const RAIN_PER_MAP = 130, MOTES_PER_MAP = 34;
const RAIN_SPEED = { x: -90, y: 460 };

export function atmosphereProfile(id: MapId, storm: boolean, rain?: number) {
  return { fog: id === 'nebelstadt' ? .34 : id === 'rainmarket' ? .08 : 0,
    rain: storm && id === 'nebelstadt' ? 1 : rain ?? (id === 'rainmarket' ? .55 : 0),
    leaves: id === 'waldruh', dust: id !== 'rainmarket' };
}

/** Peak opacity painted into the mist tile; the tile's alpha is the region's fog, so Nebelstadt peaks near 0.1. */
export const MIST_TEXTURE_ALPHA = .3;
export const LAMP_CORE_ALPHA = .16;
export const LAMP_HALO_ALPHA = .072;
export const LAMP_POOL_ALPHA = .045;

/** Soft shapes drawn once into canvas textures that particles, tiles and lamps share. */
export function createAtmosphereTextures(scene: Phaser.Scene): void {
  const canvas = (key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) return;
    draw(texture.context);
    texture.refresh();
  };
  const radial = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string, alpha: number) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${colour},${alpha})`);
    gradient.addColorStop(1, `rgba(${colour},0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  canvas('atmo-rain', 2, 17, context => { context.fillStyle = '#ffffff'; context.fillRect(0, 0, 2, 17); });
  canvas('atmo-mote', 8, 8, context => radial(context, 4, 4, 4, '255,255,255', 1));
  canvas('atmo-leaf', 8, 4, context => { context.fillStyle = '#ffffff'; context.beginPath(); context.ellipse(4, 2, 4, 2, 0, 0, Math.PI * 2); context.fill(); });
  canvas('atmo-glow', 64, 64, context => radial(context, 32, 32, 32, '255,200,120', 1));
  canvas('atmo-core', 16, 16, context => radial(context, 8, 8, 8, '255,218,148', 1));
  canvas('atmo-pool', 64, 16, context => { context.save(); context.scale(1, .25); radial(context, 32, 32, 32, '232,174,98', 1); context.restore(); });
  // A seamless band of low street mist: every blob is also drawn one tile over on each side.
  canvas('atmo-mist', 512, 256, context => {
    context.save(); context.scale(1, .3);
    for (const [x, y, r] of [[80, 200, 170], [300, 520, 210], [430, 140, 150], [200, 760, 190]] as const) {
      for (const dx of [-512, 0, 512]) for (const dy of [-853, 0, 853]) radial(context, x + dx, y + dy, r, '209,223,227', MIST_TEXTURE_ALPHA);
    }
    context.restore();
  });
}

interface Zone { x: number; y: number; width: number; height: number }
/** A random emission zone over a rectangle that is moved with the camera each frame. */
const randomIn = (zone: Zone) => ({ getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
  point.x = zone.x + Math.random() * zone.width; point.y = zone.y + Math.random() * zone.height;
} });

interface Lamp { light: LampLight; halo: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image; pool: Phaser.GameObjects.Image; flicker: { value: number }; tween?: Phaser.Tweens.Tween }

/** Weather and lamplight on Phaser primitives: a scrolling mist tile, particle rain and motes, tweened lamp glow. */
export class WorldAtmosphere {
  private mist: Phaser.GameObjects.TileSprite;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainZone: Zone = { x: 0, y: 0, width: 0, height: 0 };
  private moteZone: Zone = { x: 0, y: 0, width: 0, height: 0 };
  private lamps: Lamp[] = [];
  private visible = true;
  private reduced = false;
  private moteTint = 0xffeed0;
  /** The Act III dark beam puts out lanterns as it sweeps over them. */
  darkAt?: (x: number, y: number) => boolean;
  private darkness = new WeakMap<Lamp, number>();
  constructor(private scene: Phaser.Scene, private id: MapId, lights: readonly LampLight[], private bounds = getWorldScene(id)) {
    createAtmosphereTextures(scene);
    const profile = atmosphereProfile(id, false);
    this.mist = scene.add.tileSprite(0, 0, bounds.width, bounds.height, 'atmo-mist').setOrigin(0).setDepth(WEATHER_DEPTH)
      .setAlpha(profile.fog).setVisible(profile.fog > 0);
    this.rain = scene.add.particles(0, 0, 'atmo-rain', {
      emitting: false, lifespan: 600, speedX: RAIN_SPEED.x, speedY: RAIN_SPEED.y, rotate: 17.35, scaleX: .35, scaleY: 1,
      tint: 0xc4d8e7, alpha: .26, emitZone: { type: 'random', source: randomIn(this.rainZone) },
    }).setDepth(WEATHER_DEPTH);
    this.motes = scene.add.particles(0, 0, profile.leaves ? 'atmo-leaf' : 'atmo-mote', {
      emitting: false, lifespan: 9000, speedX: { min: 2, max: 6 }, speedY: { min: -2.5, max: 2.5 },
      scale: profile.leaves ? .5 : .19, emitZone: { type: 'random', source: randomIn(this.moteZone) },
      // Motes breathe in and out over their life instead of popping.
      alpha: { onEmit: () => 0, onUpdate: (_particle, _key, t) => Math.sin(Math.PI * t) * this.moteAlpha },
      tint: { onEmit: () => this.moteTint, onUpdate: () => this.moteTint },
    }).setDepth(WEATHER_DEPTH);
    this.setLampLights(lights);
  }
  private moteAlpha = .18;

  setLampLights(lights: readonly LampLight[]): void {
    for (const lamp of this.lamps) { lamp.tween?.remove(); lamp.halo.destroy(); lamp.core.destroy(); lamp.pool.destroy(); }
    const glowDepth = worldDepth(this.bounds.height + 1, 'label');
    this.lamps = lights.map((light, index) => {
      const radius = Math.max(16, light.width * .9);
      const halo = this.scene.add.image(light.x, light.y, 'atmo-glow').setDisplaySize(radius * 2, radius * 2).setDepth(glowDepth).setAlpha(0);
      const coreRadius = Math.max(1.2, light.width * .045);
      const core = this.scene.add.image(light.x, light.y, 'atmo-core').setDisplaySize(coreRadius * 2, coreRadius * 2).setDepth(glowDepth).setAlpha(0);
      const pool = this.scene.add.image(light.x, light.footY - 3, 'atmo-pool').setDisplaySize(light.width * 2.4, light.width * .65).setDepth(WEATHER_DEPTH).setAlpha(0);
      const lamp: Lamp = { light, halo, core, pool, flicker: { value: 1 } };
      lamp.tween = this.flickerTween(lamp, index);
      return lamp;
    });
    this.setVisible(this.visible);
  }

  private flickerTween(lamp: Lamp, index: number): Phaser.Tweens.Tween | undefined {
    if (this.reduced) { lamp.flicker.value = 1; return undefined; }
    return this.scene.tweens.add({ targets: lamp.flicker, value: { from: .96, to: 1 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (index * 397) % 1500 });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.mist.setVisible(visible && this.mist.alpha > 0);
    this.rain.setVisible(visible); this.motes.setVisible(visible);
    if (!visible) for (const lamp of this.lamps) { lamp.halo.setVisible(false); lamp.core.setVisible(false); lamp.pool.setVisible(false); }
  }

  private setReduced(reduced: boolean): void {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    // Still-world mode holds the weather where it is; the lamps stop flickering.
    if (reduced) { this.rain.pause(); this.motes.pause(); } else { this.rain.resume(); this.motes.resume(); }
    this.lamps.forEach((lamp, index) => { lamp.tween?.remove(); lamp.tween = this.flickerTween(lamp, index); });
  }

  update(time: number, hour: number, view: SceneryView, reduced: boolean, storm: boolean, rain?: number): void {
    this.setReduced(reduced);
    if (!this.visible) return;
    const night = nightIntensity(hour), profile = atmosphereProfile(this.id, storm, rain);
    const width = view.right - view.x, height = view.bottom - view.y;
    const share = Math.max(0, width * height) / (this.bounds.width * this.bounds.height);
    if (!reduced) this.mist.tilePositionX = time * 5;
    this.mist.setAlpha(profile.fog).setVisible(profile.fog > 0);
    // Particles spawn across the view; their rate keeps the same density per map area as the authored count.
    Object.assign(this.rainZone, { x: view.x, y: view.y - 40, width, height });
    const drops = RAIN_PER_MAP * profile.rain * share;
    this.rain.setAlpha(profile.rain > 0 ? 1 : 0);
    this.rain.particleAlpha = .26 * Math.max(profile.rain, 0);
    if (drops > .05) { this.rain.frequency = 600 / drops; if (!this.rain.emitting) this.rain.start(); } else if (this.rain.emitting) this.rain.stop();
    Object.assign(this.moteZone, { x: view.x, y: view.y, width, height });
    this.moteAlpha = profile.leaves ? .45 : .18 + night * .18;
    this.moteTint = profile.leaves ? 0xe5b969 : night > .5 ? 0xdfffa9 : 0xffeed0;
    const motes = profile.dust ? MOTES_PER_MAP * share : 0;
    if (motes > .05) { this.motes.frequency = 9000 / motes; if (!this.motes.emitting) this.motes.start(); } else if (this.motes.emitting) this.motes.stop();
    for (const lamp of this.lamps) {
      const { light } = lamp;
      const shown = light.x >= view.x - 120 && light.x <= view.right + 120 && light.y >= view.y - 120 && light.y <= view.bottom + 120;
      const covered = this.darkAt?.(light.x, light.y) ? 1 : 0, previous = this.darkness.get(lamp) ?? 0;
      const dark = reduced ? covered : previous + (covered - previous) * .12;
      this.darkness.set(lamp, dark);
      const lit = night * (1 - .92 * dark);
      // A small amber halo preserves the painted lantern and nearby silhouettes.
      lamp.halo.setVisible(shown).setAlpha(lit * lamp.flicker.value * LAMP_HALO_ALPHA);
      lamp.core.setVisible(shown).setAlpha(lit * LAMP_CORE_ALPHA);
      lamp.pool.setVisible(shown).setAlpha(lit * lamp.flicker.value * LAMP_POOL_ALPHA);
    }
  }

  destroy(): void {
    for (const lamp of this.lamps) { lamp.tween?.remove(); lamp.halo.destroy(); lamp.core.destroy(); lamp.pool.destroy(); }
    this.lamps = [];
    this.mist.destroy(); this.rain.destroy(); this.motes.destroy();
  }
}
