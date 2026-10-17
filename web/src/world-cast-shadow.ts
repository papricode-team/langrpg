import type * as Phaser from 'phaser';
import { frameImageRect } from './texture-frame';
import { graphicsQualityTier } from './quality-state';

/** Project upright painting pixels onto the paving, away from upper-left light. */
export function shadowPoint(x: number, y: number): {x: number; y: number} {
  return {x: x - y * .62, y: -y * .34};
}

/** Shared ground depth: above terrain/track, below every upright painting. */
export const CAST_SHADOW_DEPTH = 2;
const caches = new WeakMap<Phaser.Textures.TextureManager, Map<string, {key: string; refs: number}>>();

type ShadowSource = Pick<Phaser.GameObjects.Sprite, 'frame'|'texture'|'originX'|'originY'|'flipX'|'scaleX'|'x'|'y'>;

/** A bounded, blurred silhouette baked once per frame/pivot/flip. No GPU filters
 * per object, no animated-frame rebuilds and no allocation on Low. */
export class WorldCastShadow {
  private image?: Phaser.GameObjects.Image;
  private release?: () => void;
  private offset = {x: 0, y: 0};
  constructor(private scene: Phaser.Scene, private source: ShadowSource) {}

  private bake(): void {
    const {scene, source} = this, frame = source.frame;
    if (typeof document === 'undefined' || !frame.source?.image) return;
    const signature = `${source.texture.key}:${frame.name}:${source.originX}:${source.originY}:${source.flipX}`;
    let cache = caches.get(scene.textures);
    if (!cache) { cache = new Map(); caches.set(scene.textures, cache); }
    const density = Math.min(1, 320 / Math.max(frame.width, frame.height));
    const w = frame.width * density, h = frame.height * density, pad = 12;
    const pivotX = (source.flipX ? 1 - source.originX : source.originX) * w, pivotY = source.originY * h;
    const corners = [[0,0],[w,0],[0,h],[w,h]].map(([x,y]) => shadowPoint(x-pivotX,y-pivotY));
    const left = Math.min(...corners.map(p=>p.x))-pad, top = Math.min(...corners.map(p=>p.y))-pad;
    const width = Math.ceil(Math.max(...corners.map(p=>p.x))-left+pad);
    const height = Math.ceil(Math.max(...corners.map(p=>p.y))-top+pad);
    let entry = cache.get(signature);
    if (!entry) {
      const key = `world-cast-shadow:${signature}`;
      const silhouette = document.createElement('canvas'); silhouette.width = Math.ceil(w); silhouette.height = Math.ceil(h);
      const ink = silhouette.getContext('2d'); if (!ink) return;
      ink.drawImage(frame.source.image as CanvasImageSource, ...frameImageRect(frame), 0, 0, w, h);
      ink.globalCompositeOperation = 'source-in'; ink.fillStyle = '#4f5b53'; ink.fillRect(0,0,w,h);
      const texture = scene.textures.createCanvas(key, width, height); if (!texture) return;
      const ctx = texture.context;
      ctx.save(); ctx.filter = 'blur(3px)';
      ctx.translate(-left,-top); ctx.transform(1,0,-.62,-.34,-pivotX+.62*pivotY,.34*pivotY);
      if (source.flipX) { ctx.translate(w,0); ctx.scale(-1,1); }
      ctx.drawImage(silhouette,0,0); ctx.restore(); texture.refresh();
      entry = {key,refs:0}; cache.set(signature,entry);
    }
    entry.refs++;
    const shared = entry;
    this.release = () => { if (--shared.refs === 0) { scene.textures.remove(shared.key); cache!.delete(signature); } };
    const scale = source.scaleX / density;
    this.offset = {x:left*scale, y:top*scale};
    this.image = scene.add.image(source.x+this.offset.x,source.y+this.offset.y,entry.key)
      .setOrigin(0).setScale(scale).setDepth(CAST_SHADOW_DEPTH).setBlendMode('MULTIPLY');
  }

  update(x: number, y: number, visible: boolean, alpha: number, night: boolean): void {
    const enabled = visible && graphicsQualityTier() !== 'low';
    if (enabled && !this.image) this.bake();
    this.image?.setPosition(x+this.offset.x,y+this.offset.y).setVisible(enabled)
      .setAlpha(alpha*(night?.12:.30)).setTint(night?0xb9c8dc:0xffedca);
  }
  destroy(): void { this.image?.destroy(); this.release?.(); this.image = undefined; this.release = undefined; }
}
