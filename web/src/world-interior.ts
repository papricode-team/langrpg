import type * as Phaser from 'phaser';
import type { InteriorSpec } from './interiors';
import { sceneryPhase } from './placed-scenery';
import type { SceneryAnimation, SceneryAnimationManifest } from './scenery-animation';
import type { SceneryView } from './world-scenery';
import { worldDepth } from './world-depth';

interface InteriorLayer {
  sprite: Phaser.GameObjects.Sprite;
  width: number;
  height: number;
}

interface InteriorEffect {
  propId: string;
  sprites: readonly [Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite];
  animation: SceneryAnimation;
  width: number;
  height: number;
  alpha: number;
  phase: number;
}

function inView(sprite: Phaser.GameObjects.Sprite, width: number, height: number, view: SceneryView): boolean {
  return sprite.x + width * (1 - sprite.originX) >= view.x && sprite.x - width * sprite.originX <= view.right
    && sprite.y + height * (1 - sprite.originY) >= view.y && sprite.y - height * sprite.originY <= view.bottom;
}

/** Fixed furniture keeps its pixels and foot anchor; only separate details animate. */
export class WorldInterior {
  private background: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private ticket?: Phaser.GameObjects.Sprite;
  private layers: InteriorLayer[] = [];
  private effects: InteriorEffect[] = [];
  private visible = true;
  private reducedMotion = false;
  private motionTime = 0;
  private dawn?: Phaser.GameObjects.Rectangle;
  private dawnActive = false;

  constructor(scene: Phaser.Scene, spec: InteriorSpec) {
    const backgroundKey = `interior-${spec.id}-room`;
    this.background = scene.textures.exists(backgroundKey)
      ? scene.add.image(0, 0, backgroundKey).setOrigin(0).setDisplaySize(spec.width, spec.height).setDepth(-1000)
      : scene.add.graphics().fillStyle(0x584e38).fillRect(0, 0, spec.width, spec.height).setDepth(-1000);
    if (spec.id.startsWith('train-')) this.dawn = scene.add.rectangle(0,0,spec.width,spec.height,0xffd4a0,.18).setOrigin(0).setDepth(-999).setVisible(false);
    const trainStills = scene.cache.json.get('interior-train-stills') as SceneryAnimationManifest | undefined;
    const manifest = scene.cache.json.get('interior-animations') as SceneryAnimationManifest | undefined;
    const stills = scene.cache.json.get('interior-stills') as SceneryAnimationManifest | undefined;
    const effectManifest = scene.cache.json.get('interior-effect-animations') as SceneryAnimationManifest | undefined;
    const fog = (scene.cache.json.get('interior-train-effects') as SceneryAnimationManifest | undefined)?.assets.fog;
    if (fog && scene.textures.exists(fog.key)) for (const [index, detail] of (spec.windowEffects ?? []).entries()) {
      const scale = detail.width / fog.referenceWidth;
      const create = () => scene.add.sprite(detail.x, detail.y, fog.key, fog.frames[0])
        .setOrigin(fog.originX, fog.originY).setScale(scale).setDepth(-998).setAlpha(0);
      this.effects.push({propId:`window-${index}`,sprites:[create(),create()],animation:fog,width:fog.width*scale,height:fog.height*scale,alpha:detail.alpha,phase:index});
    }
    for (const prop of spec.props) {
      const animation = trainStills?.assets[prop.asset] ?? stills?.assets[prop.asset] ?? manifest?.assets[prop.asset];
      if (!animation || !scene.textures.exists(animation.key)) continue;
      // The authored poses differ in rigid geometry, even with a shared pivot.
      // One canonical pose also keeps independently placed tabletop goods aligned.
      const frame = animation.frames[0];
      if (!scene.textures.get(animation.key).has(frame)) continue;
      const scale = prop.width / animation.referenceWidth;
      const sprite = scene.add.sprite(prop.x, prop.y, animation.key, frame)
        .setOrigin(animation.originX, animation.originY).setScale(scale).setDepth(worldDepth(prop.depth ?? prop.y));
      if (prop.asset === 'train-ticket-pale') this.ticket = sprite;
      this.layers.push({ sprite, width: animation.width * scale, height: animation.height * scale });
      for (const [index, detail] of (prop.effects ?? []).entries()) {
        const effect = effectManifest?.assets[detail.asset];
        if (!effect || !effect.frames.length || !scene.textures.exists(effect.key)
          || !effect.frames.every(name => scene.textures.get(effect.key).has(name))) continue;
        const detailScale = detail.width / effect.referenceWidth;
        const create = () => scene.add.sprite(prop.x + detail.x, prop.y + detail.y, effect.key, effect.frames[0])
          .setOrigin(effect.originX, effect.originY).setScale(detailScale).setDepth(worldDepth(prop.depth ?? prop.y)).setAlpha(0);
        this.effects.push({ propId: prop.id, sprites: [create(), create()], animation: effect, width: effect.width * detailScale,
          height: effect.height * detailScale, alpha: detail.alpha,
          phase: sceneryPhase(`${prop.id}:${index}`) / (Math.PI * 2) * effect.frames.length });
      }
    }
  }

  restoreTicket(restored: boolean): void { this.ticket?.setFrame(restored ? 'train-ticket-dark' : 'train-ticket-pale'); }
  setDawn(active: boolean): void { this.dawnActive = active; this.dawn?.setVisible(active && this.visible); }
  get objectCount(): number { return this.layers.length; }
  get animatedObjectCount(): number { return new Set(this.effects.map(effect => effect.propId)).size; }
  setReducedMotion(reduced: boolean): void { this.reducedMotion = reduced; }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.background.setVisible(visible);
    this.dawn?.setVisible(visible && this.dawnActive);
    if (!visible) for (const layer of this.layers) layer.sprite.setVisible(false);
    if (!visible) for (const effect of this.effects) for (const sprite of effect.sprites) sprite.setVisible(false);
  }

  update(seconds: number, view: SceneryView): void {
    if (!this.reducedMotion) this.motionTime = seconds;
    for (const layer of this.layers) {
      layer.sprite.setVisible(this.visible && inView(layer.sprite, layer.width, layer.height, view));
    }
    for (const effect of this.effects) {
      const [current, next] = effect.sprites;
      const visible = this.visible && inView(current, effect.width, effect.height, view);
      current.setVisible(visible); next.setVisible(visible);
      if (!visible) continue;
      // Blend detail frames so their shape changes gently rather than popping.
      const cycle = this.motionTime * effect.animation.fps + effect.phase;
      const index = Math.floor(cycle) % effect.animation.frames.length;
      const blend = cycle - Math.floor(cycle);
      current.setFrame(effect.animation.frames[index]).setAlpha(effect.alpha * (1 - blend));
      next.setFrame(effect.animation.frames[(index + 1) % effect.animation.frames.length]).setAlpha(effect.alpha * blend);
    }
  }

  destroy(): void {
    this.background.destroy();
    this.dawn?.destroy();
    for (const layer of this.layers) layer.sprite.destroy();
    for (const effect of this.effects) for (const sprite of effect.sprites) sprite.destroy();
    this.layers = [];
    this.effects = [];
  }
}
