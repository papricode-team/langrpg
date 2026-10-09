import type * as Phaser from 'phaser';
import type { InteriorSpec, InteriorPropSpec } from './interiors';
import { sampleSceneryFrame, type SceneryAnimation, type SceneryAnimationManifest } from './scenery-animation';
import type { SceneryView } from './world-scenery';

interface InteriorLayer {
  spec: InteriorPropSpec;
  sprite: Phaser.GameObjects.Sprite;
  animation: SceneryAnimation;
  frame: string;
  width: number;
  height: number;
}

/** Room architecture stays behind independently animated, foot-sorted furniture. */
export class WorldInterior {
  private background: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private layers: InteriorLayer[] = [];
  private visible = true;
  private reducedMotion = false;
  private motionTime = 0;

  constructor(scene: Phaser.Scene, spec: InteriorSpec) {
    const backgroundKey = `interior-${spec.id}-room`;
    this.background = scene.textures.exists(backgroundKey)
      ? scene.add.image(0, 0, backgroundKey).setOrigin(0).setDisplaySize(spec.width, spec.height).setDepth(-1000)
      : scene.add.graphics().fillStyle(0x584e38).fillRect(0, 0, spec.width, spec.height).setDepth(-1000);
    const manifest = scene.cache.json.get('interior-animations') as SceneryAnimationManifest | undefined;
    for (const prop of spec.props) {
      const animation = manifest?.assets[prop.asset];
      if (!animation || !scene.textures.exists(animation.key)) continue;
      const frame = sampleSceneryFrame(animation, prop.id, 0);
      if (!scene.textures.get(animation.key).has(frame)) continue;
      const scale = prop.width / animation.referenceWidth;
      const sprite = scene.add.sprite(prop.x, prop.y, animation.key, frame)
        .setOrigin(animation.originX, animation.originY).setScale(scale).setDepth(prop.depth ?? prop.y);
      this.layers.push({ spec: prop, sprite, animation, frame, width: animation.width * scale, height: animation.height * scale });
    }
  }

  get objectCount(): number { return this.layers.length; }
  get animatedObjectCount(): number { return this.layers.length; }
  setReducedMotion(reduced: boolean): void { this.reducedMotion = reduced; }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.background.setVisible(visible);
    if (!visible) for (const layer of this.layers) layer.sprite.setVisible(false);
  }

  update(seconds: number, view: SceneryView): void {
    if (!this.reducedMotion) this.motionTime = seconds;
    for (const layer of this.layers) {
      const { spec, sprite, animation, width, height } = layer;
      const visible = this.visible && spec.x + width >= view.x && spec.x - width <= view.right
        && spec.y + height * .12 >= view.y && spec.y - height * 1.1 <= view.bottom;
      sprite.setVisible(visible);
      if (!visible) continue;
      const frame = sampleSceneryFrame(animation, spec.id, this.motionTime);
      if (frame !== layer.frame) { sprite.setFrame(frame); layer.frame = frame; }
    }
  }

  destroy(): void {
    this.background.destroy();
    for (const layer of this.layers) layer.sprite.destroy();
    this.layers = [];
  }
}
