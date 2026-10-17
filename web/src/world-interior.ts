import {roomKind} from './room-kind';
import type * as Phaser from 'phaser';
import type { InteriorSpec } from './interiors';
import { sceneryPhase } from './placed-scenery';
import type { SceneryAnimation, SceneryAnimationManifest } from './scenery-animation';
import type { SceneryView } from './world-scenery';
import furnitureFrames from './data/room-kit-furniture.json';
import {paintRoomKit, roomKit} from './room-kit';
import {terrainMaterialKey} from './terrain-materials';
import {roomLayoutFingerprint} from './room-layout';
import { worldDepth } from './world-depth';

interface InteriorLayer {
  sprite: Phaser.GameObjects.Sprite;
  width: number;
  height: number;
  /** Story props appear or change with the prologue (`ticket`, `tea`). */
  story?: 'ticket' | 'tea';
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

/** Texture key of a painted room, or of its dawn frame. */
export const paintedRoomKey = (spec: Pick<InteriorSpec, 'id'>, dawn = false): string => `interior-${roomKind(spec.id)}-${dawn ? 'dawn' : 'room'}`;

/** Fixed furniture keeps its pixels and foot anchor; only separate details animate. */
export class WorldInterior {
  private background: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private layers: InteriorLayer[] = [];
  private effects: InteriorEffect[] = [];
  private visible = true;
  private reducedMotion = false;
  private motionTime = 0;
  private dawn?: Phaser.GameObjects.Image;
  private dawnActive = false;
  private teaServed = false;

  constructor(private scene: Phaser.Scene, spec: InteriorSpec) {
    if (spec.presentation === 'painted') {
      // The painting is the room; its furniture is baked into the band behind the walkable floor.
      const key = paintedRoomKey(spec), dawnKey = paintedRoomKey(spec, true);
      this.background = scene.textures.exists(key)
        ? scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(spec.width, spec.height).setDepth(-1000)
        : scene.add.graphics().fillStyle(0x2a2118).fillRect(0, 0, spec.width, spec.height).setDepth(-1000);
      if (spec.dawnAsset && scene.textures.exists(dawnKey)) this.dawn = scene.add.image(0, 0, dawnKey).setOrigin(0).setDisplaySize(spec.width, spec.height).setDepth(-999).setAlpha(0);
    } else {
    const backgroundKey = `room-kit-${spec.layout ? spec.id : roomKind(spec.id)}`;
    const signature = roomLayoutFingerprint(spec.layout)+(Object.keys(spec.stairDirections ?? {}).length?JSON.stringify(spec.stairDirections):'');
    if (scene.textures.exists(backgroundKey) && (scene.textures.get(backgroundKey).customData as {layout?:string}).layout !== signature) scene.textures.remove(backgroundKey);
    if (!scene.textures.exists(backgroundKey)) {
      const texture = scene.textures.createCanvas(backgroundKey, spec.width, spec.height)!;
      paintRoomKit(texture.context, spec, id => {
        const key = id === 'room-kit-furniture' ? id : terrainMaterialKey(id);
        return scene.textures.exists(key) ? scene.textures.get(key).getSourceImage() as HTMLImageElement : undefined;
      });
      texture.customData = {layout:signature};
      texture.refresh();
    }
    this.background = scene.add.image(0, 0, backgroundKey).setOrigin(0).setDisplaySize(spec.width, spec.height).setDepth(-1000);
    // Tall fixtures sort against people by their feet, just like the existing furniture atlas.
    if (scene.textures.exists('room-kit-furniture')) for (const fixture of roomKit(spec).fixtures) {
      const frame = furnitureFrames[fixture.kind], texture = scene.textures.get('room-kit-furniture');
      if (!texture.has(fixture.kind)) texture.add(fixture.kind, 0, frame.x, frame.y, frame.width, frame.height);
      const bottom = fixture.y + fixture.height;
      const sprite = scene.add.sprite(fixture.x + fixture.width / 2, bottom, 'room-kit-furniture', fixture.kind)
        .setOrigin(.5, 1).setScale(fixture.width / frame.width).setDepth(worldDepth(bottom));
      this.layers.push({sprite, width: fixture.width, height: fixture.width * frame.height / frame.width});
    }
    }
    const trainStills = scene.cache.json.get('interior-train-stills') as SceneryAnimationManifest | undefined;
    const manifest = scene.cache.json.get('interior-animations') as SceneryAnimationManifest | undefined;
    const stills = scene.cache.json.get('interior-stills') as SceneryAnimationManifest | undefined;
    const effectManifest = scene.cache.json.get('interior-effect-animations') as SceneryAnimationManifest | undefined;
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
      this.layers.push({ sprite, width: animation.width * scale, height: animation.height * scale,
        ...(prop.asset.startsWith('train-ticket') ? { story: 'ticket' as const } : prop.asset === 'train-tea' ? { story: 'tea' as const } : {}) });
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

  /** The ink on the ticket darkens once the player has said their name. */
  restoreTicket(restored: boolean): void {
    for (const layer of this.layers) if (layer.story === 'ticket') layer.sprite.setFrame(restored ? 'train-ticket-dark' : 'train-ticket-pale');
  }
  serveTea(served: boolean): void { this.teaServed = served; }
  /** Crossfade the night painting to its dawn frame; reduced motion switches at once. */
  setDawn(active: boolean): void {
    if (!this.dawn || active === this.dawnActive) return;
    this.dawnActive = active;
    this.scene.tweens.killTweensOf(this.dawn);
    if (this.reducedMotion) this.dawn.setAlpha(active ? 1 : 0);
    else this.scene.tweens.add({ targets: this.dawn, alpha: active ? 1 : 0, duration: 2600, ease: 'Sine.easeInOut' });
  }
  get objectCount(): number { return this.layers.length; }
  get animatedObjectCount(): number { return new Set(this.effects.map(effect => effect.propId)).size; }
  setReducedMotion(reduced: boolean): void { this.reducedMotion = reduced; }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.background.setVisible(visible);
    this.dawn?.setVisible(visible);
    if (!visible) for (const layer of this.layers) layer.sprite.setVisible(false);
    if (!visible) for (const effect of this.effects) for (const sprite of effect.sprites) sprite.setVisible(false);
  }

  update(seconds: number, view: SceneryView): void {
    if (!this.reducedMotion) this.motionTime = seconds;
    for (const layer of this.layers) {
      layer.sprite.setVisible(this.visible && (layer.story !== 'tea' || this.teaServed) && inView(layer.sprite, layer.width, layer.height, view));
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
