import * as Phaser from 'phaser';
import { deviceCeiling, QUALITY_MODES, QUALITY_TIERS, QualityGovernor } from './quality-governor';
import type { DeviceHints, QualityMode, QualityTier } from './quality-governor';
import { graphicsQualityMode, graphicsQualityTier, logicalSize, notifyGraphicsQualityChange, onGraphicsQualityChange, qualityGovernor, qualityUrl, setQualityGovernor, tieredAsset, type TieredSource } from './quality-state';
import { QUALITY_SWAP_EVENT } from './texture-frame';

/**
 * Graphics quality for Phaser textures (tiers are built by scripts/asset-quality.mjs).
 *
 * Every tiered image first loads at Low. Its texture keeps the master's logical size, so atlas
 * frames, display sizes and UVs are identical at every tier and only the GPU copy changes. Once no
 * scene is loading, textures below the target tier are swapped in place, one at a time.
 */
export const QUALITY_MANIFEST_KEY = 'asset-quality-manifest';
export const QUALITY_MANIFEST_URL = '/assets/q/manifest.json';
// At most a few uploads per second, so an upgrade never costs more than an occasional frame.
const SWAP_SPACING_MS = 120;

const sources = new WeakMap<Phaser.Textures.TextureSource, TieredSource>();
const imageAssets = new WeakMap<HTMLImageElement, TieredSource>();
const controllers = new Set<TextureQualityController>();

let patched = false;
function patchPhaser(): void {
  if (patched) return;
  patched = true;
  const loader = Phaser.Loader.LoaderPlugin.prototype as unknown as { addFile(file: Phaser.Loader.File | Phaser.Loader.File[]): void };
  const addFile = loader.addFile;
  loader.addFile = function (file) {
    for (const item of Array.isArray(file) ? file : [file]) {
      if ((item.type !== 'image' && item.type !== 'spritesheet') || typeof item.url !== 'string' || !webglActive()) continue;
      // Foreground cutscene art needs its native pixels even on Low/Retina.
      if (tieredAsset(item.url)?.rel === 'story-cast/greenhouse-train.webp') continue;
      item.url = qualityUrl(item.url, 'low');
      const asset = tieredAsset(item.url);
      if (!asset) continue;
      // The loader decodes through a blob URL, so remember which asset each image element holds.
      const processed = item.onProcessComplete;
      item.onProcessComplete = function (this: Phaser.Loader.File) {
        if (typeof HTMLImageElement !== 'undefined' && this.data instanceof HTMLImageElement) imageAssets.set(this.data, asset);
        return processed.call(this);
      };
    }
    return addFile.call(this, file);
  };
  const textures = Phaser.Textures.TextureManager.prototype as unknown as { create(this: Phaser.Textures.TextureManager, ...args: unknown[]): Phaser.Textures.Texture | null };
  const create = textures.create;
  textures.create = function (...args) {
    const texture = create.apply(this, args);
    if (texture) for (const source of texture.source) adopt(source);
    return texture;
  };
}

const webglActive = () => [...controllers].some(controller => controller.webgl);

/** Gives a tiered image its master's logical size before any frame is parsed. */
function adopt(source: Phaser.Textures.TextureSource): void {
  const image = source.image;
  if (typeof HTMLImageElement === 'undefined' || !(image instanceof HTMLImageElement)) return;
  const asset = imageAssets.get(image) ?? tieredAsset(image.src);
  if (!asset || asset.rel === 'story-cast/greenhouse-train.webp') return;
  const [width, height] = logicalSize(asset.rel)!;
  source.width = width; source.height = height;
  sources.set(source, asset);
  for (const controller of controllers) if (controller.game.textures === source.texture.manager) controller.track(source);
}

function deviceHints(): DeviceHints {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  return { deviceMemory: nav.deviceMemory, saveData: nav.connection?.saveData, effectiveType: nav.connection?.effectiveType };
}

class TextureQualityController {
  private tracked = new Set<Phaser.Textures.TextureSource>();
  private swapping = false;
  private nextSwap = 0;
  private disposed = false;

  constructor(readonly game: Phaser.Game, private readonly judge: boolean) {
    game.events.on(Phaser.Core.Events.POST_STEP, this.step, this);
    game.events.once(Phaser.Core.Events.DESTROY, this.dispose, this);
  }

  /** Before boot the renderer is unknown; Phaser.AUTO picks WebGL wherever the game runs. */
  get webgl(): boolean { return !this.game.renderer || this.game.renderer.type === Phaser.WEBGL; }

  track(source: Phaser.Textures.TextureSource): void { this.tracked.add(source); }

  target(): QualityTier { return graphicsQualityTier(); }

  retarget(): void { qualityGovernor()?.hold(performance.now(), 2000); }

  private loading(): boolean {
    return this.game.scene.getScenes(true).some(scene => scene.load?.isLoading());
  }

  private step(): void {
    if (this.disposed || !this.webgl) return;
    const now = performance.now();
    const governor = qualityGovernor();
    if (this.judge && governor) {
      // Swaps stay under judgement: if an upgrade itself makes play stutter, Auto must be able to back out.
      if (this.loading() || document.hidden) governor.hold(now, 500);
      else if (graphicsQualityMode() === 'auto') {
        const loop = this.game.loop as Phaser.Core.TimeStep & { rawDelta?: number };
        if (governor.sample(loop.rawDelta ?? loop.delta, now)) notifyGraphicsQualityChange();
      }
    }
    if (!this.swapping && !this.loading() && now >= this.nextSwap) void this.swapNext();
  }

  private next(): Phaser.Textures.TextureSource | undefined {
    const target = this.target();
    // Newest first: the scene that just loaded is the one on screen.
    for (const source of [...this.tracked].reverse()) {
      const texture = source.texture;
      if (!source.glTexture || !texture || this.game.textures.get(texture.key) !== texture) { this.tracked.delete(source); continue; }
      if (sources.get(source)?.tier !== target) return source;
    }
  }

  private async swapNext(): Promise<void> {
    const source = this.next();
    if (!source) return;
    const asset = sources.get(source)!, tier = this.target();
    this.swapping = true;
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = `/assets/${tier === 'high' ? '' : `q/${tier}/`}${asset.rel}${asset.query}`;
      await image.decode();
      // Let the frame that decoded finish before uploading; one upload per frame keeps play smooth.
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (this.disposed || !source.glTexture || this.target() !== tier) return;
      this.replace(source, image);
      sources.set(source, { ...asset, tier });
      this.game.textures.emit(QUALITY_SWAP_EVENT, source.texture.key);
    } catch {
      // A missing tier keeps the copy already on screen.
      this.tracked.delete(source);
    } finally { this.swapping = false; this.nextSwap = performance.now() + SWAP_SPACING_MS; }
  }

  private replace(source: Phaser.Textures.TextureSource, image: HTMLImageElement): void {
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const old = source.glTexture;
    if (!old) return;
    source.source = image; source.image = image;
    source.glTexture = renderer.createTextureFromSource(image, image.naturalWidth, image.naturalHeight, source.scaleMode, false, source.flipY);
    renderer.glTextureUnits?.unbindTexture(old);
    renderer.deleteTexture(old);
  }

  private dispose(): void {
    this.disposed = true;
    this.game.events.off(Phaser.Core.Events.POST_STEP, this.step, this);
    controllers.delete(this);
    if (this.judge) setQualityGovernor(null);
  }
}

let retargetBound = false;
/** Call right after creating a game, before its first scene loads. */
export function installTextureQuality(game: Phaser.Game): void {
  patchPhaser();
  const judge = !qualityGovernor();
  if (judge) setQualityGovernor(new QualityGovernor(deviceCeiling(deviceHints())));
  // A new target gives the swaps a moment before Auto judges frames again.
  if (!retargetBound) { retargetBound = true; onGraphicsQualityChange(() => { for (const controller of controllers) controller.retarget(); }); }
  controllers.add(new TextureQualityController(game, judge));
}

export { QUALITY_MODES, QUALITY_TIERS };
export type { QualityMode, QualityTier };
export { graphicsQualityMode, graphicsQualityTier, onGraphicsQualityChange, qualityUrl, setGraphicsQualityMode, setQualityManifest, tieredAsset } from './quality-state';
