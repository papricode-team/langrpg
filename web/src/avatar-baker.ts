import type Phaser from 'phaser';
import { characterCatalogue, catalogueForPose, catalogueForExpression, recipeErrors, resolveRecipe, avatarTextureKey } from './character-recipe.mjs';
import type { AvatarRecipe, CharacterCatalogue, Facing, ResolvedComponent } from './character-recipe.mjs';
import { composeAtlas, composeFrame } from './character-compositor.mjs';
import type { PixelSheet } from './character-compositor.mjs';
import { AvatarTextureCache } from './avatar-texture-cache';
import type { TextureLease } from './avatar-texture-cache';

const facings: Facing[] = ['down', 'right', 'up', 'left'];
type Resolution = 'runtime' | 'editor';
type SheetLoader = (url: string, width: number, height: number) => Promise<PixelSheet>;
interface PoseOptions { catalogue?: CharacterCatalogue; poseSet?: string; }
interface BakeOptions extends PoseOptions { expression?: string; resolution?: Resolution; preview?: boolean; loadSheet?: SheetLoader; }

/** CPU copies are bounded separately from the GPU atlas cache. Failures are retryable. */
export class AvatarSheetCache {
  private entries = new Map<string, { promise: Promise<PixelSheet>; bytes: number }>();
  private bytes = 0;
  constructor(private decode: SheetLoader = decodeSheet, private maxBytes = 24 * 1024 * 1024) {}
  load: SheetLoader = (url, width, height) => {
    const key = `${width}x${height}:${url}`, existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key); this.entries.set(key, existing);
      return existing.promise;
    }
    const entry = { promise: undefined as unknown as Promise<PixelSheet>, bytes: 0 };
    entry.promise = Promise.resolve().then(() => this.decode(url, width, height)).then(sheet => {
      if (sheet.width !== width || sheet.height !== height || sheet.data.length !== width * height * 4) throw new Error(`Malformed character sheet ${url}`);
      entry.bytes = sheet.data.byteLength; this.bytes += entry.bytes;
      for (const [oldKey, old] of this.entries) {
        if (this.bytes <= this.maxBytes) break;
        if (old.bytes) { this.entries.delete(oldKey); this.bytes -= old.bytes; }
      }
      return sheet;
    }).catch(error => { this.entries.delete(key); throw error; });
    this.entries.set(key, entry);
    return entry.promise;
  };
}

async function decodeSheet(url: string, width: number, height: number): Promise<PixelSheet> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Missing character sheet ${url} (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    if (bitmap.width !== width || bitmap.height !== height) throw new Error(`Malformed character sheet ${url}`);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally { bitmap.close(); }
}

const sheets = new AvatarSheetCache();
function validate(recipe: AvatarRecipe, catalogue: CharacterCatalogue, preview: boolean): void {
  const errors = recipeErrors(recipe, catalogue).filter(error => !preview || !error.startsWith('Missing required '));
  if (errors.length) throw new Error(`Invalid avatar: ${errors.join('; ')}`);
}

async function loadLayers(layers: ResolvedComponent[], catalogue: CharacterCatalogue, resolution: Resolution, load: SheetLoader): Promise<Map<string, PixelSheet>> {
  const [width, height] = resolution === 'editor' ? catalogue.format.editorCell : catalogue.format.runtimeCell;
  const unique = new Map(layers.map(layer => [layer.id, layer]));
  const images = new Map<string, PixelSheet>();
  await Promise.all([...unique.values()].flatMap(layer => layer.materials.map(async material => {
    const sheet = layer.sheets[material];
    const url = `${catalogue.assetBase}${sheet[resolution]}?v=${catalogue.assetVersion}`;
    images.set(`${layer.id}.${material}`, await load(url, width * 9, height * 4));
  })));
  return images;
}

/** No Phaser dependency: editor, portrait and world baking share these pixels. */
export async function bakeAvatarPixels(recipe: AvatarRecipe, { catalogue = characterCatalogue, poseSet = catalogue.poseSet ?? 'walk', expression = catalogue.expression ?? 'neutral', resolution = 'runtime', preview = false, loadSheet = sheets.load }: BakeOptions = {}) {
  catalogue = catalogueForExpression(recipe, expression, catalogueForPose(poseSet, catalogue));
  // Snapshot before awaiting IO; rapid editor changes must not mutate a pending bake.
  const snapshot = structuredClone(recipe);
  validate(snapshot, catalogue, preview);
  const resolved = facings.map(facing => resolveRecipe(snapshot, facing, catalogue).layers);
  const images = await loadLayers(resolved.flat(), catalogue, resolution, loadSheet);
  const [width, height] = resolution === 'editor' ? catalogue.format.editorCell : catalogue.format.runtimeCell;
  return composeAtlas(resolved, images, width, height);
}

export async function avatarFramePixels(recipe: AvatarRecipe, frame: number, { catalogue = characterCatalogue, poseSet = catalogue.poseSet ?? 'walk', expression = catalogue.expression ?? 'neutral', resolution = 'editor', preview = false, loadSheet = sheets.load }: BakeOptions = {}) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 36) throw new Error('Frame must be in 0..35');
  catalogue = catalogueForExpression(recipe, expression, catalogueForPose(poseSet, catalogue));
  const snapshot = structuredClone(recipe);
  validate(snapshot, catalogue, preview);
  const layers = resolveRecipe(snapshot, facings[Math.floor(frame / 9)], catalogue).layers;
  const images = await loadLayers(layers, catalogue, resolution, loadSheet);
  const [width, height] = resolution === 'editor' ? catalogue.format.editorCell : catalogue.format.runtimeCell;
  return { data: composeFrame(layers, images, frame, width, height), width, height };
}

function pixelCanvas(pixels: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  return canvas;
}

type PreviewResources = { layers: ResolvedComponent[][]; images: Map<string, PixelSheet>; width: number; height: number };
const previews = new AvatarTextureCache<PreviewResources>(() => {}, 2, {maxBytes:128*1024*1024,sizeOf:resource=>[...resource.images.values()].reduce((sum,sheet)=>sum+sheet.data.byteLength,0)});
const paints = new WeakMap<HTMLCanvasElement, { version: number; key: string; resources: Promise<TextureLease<PreviewResources>> }>();
export function releaseAvatarPreview(canvas: HTMLCanvasElement): void {
  const state = paints.get(canvas); paints.delete(canvas);
  void state?.resources.then(lease => lease.release(true)).catch(() => {});
}
export async function paintAvatar(canvas: HTMLCanvasElement, recipe: AvatarRecipe, frame = 0, { catalogue = characterCatalogue, poseSet = catalogue.poseSet ?? 'walk' }: PoseOptions = {}): Promise<void> {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 36) throw new Error('Frame must be in 0..35');
  catalogue = catalogueForPose(poseSet, catalogue);
  const snapshot = structuredClone(recipe); validate(snapshot, catalogue, false);
  const key = avatarTextureKey(snapshot, catalogue); let state = paints.get(canvas);
  if (!state || state.key !== key) {
    void state?.resources.then(lease => lease.release()).catch(() => {});
    const resources = previews.acquire(key, async () => {
      const layers = facings.map(facing => resolveRecipe(snapshot, facing, catalogue).layers);
      const images = await loadLayers(layers.flat(), catalogue, 'editor', sheets.load);
      const [width, height] = catalogue.format.editorCell;
      return { layers, images, width, height };
    });
    state = { version: 0, key, resources }; paints.set(canvas, state);
  }
  const version = ++state.version;
  let resources: PreviewResources;
  try { resources = (await state.resources).value; }
  catch (error) { if (paints.get(canvas) === state) paints.delete(canvas); throw error; }
  if (paints.get(canvas) !== state || state.version !== version) return;
  const { width, height, layers, images } = resources;
  const pixels = { data: composeFrame(layers[Math.floor(frame / 9)], images, frame, width, height), width, height };
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const scale = Math.min(canvas.width / (pixels.width * 1.28), canvas.height / pixels.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(pixelCanvas(pixels), (canvas.width - pixels.width * scale) / 2, (canvas.height - pixels.height * scale) / 2, pixels.width * scale, pixels.height * scale);
}

const sceneCaches = new WeakMap<Phaser.Scene, { cache: AvatarTextureCache<string>; prefix: string }>();
let sceneSerial = 0;
/** Retain while a sprite uses the texture; release on change, release(true) on leave. */
export async function bakeAvatarTexture(scene: Phaser.Scene, recipe: AvatarRecipe, { catalogue = characterCatalogue, poseSet = catalogue.poseSet ?? 'walk' }: PoseOptions = {}): Promise<TextureLease<string>> {
  catalogue = catalogueForPose(poseSet, catalogue);
  const snapshot = structuredClone(recipe);
  validate(snapshot, catalogue, false);
  let state = sceneCaches.get(scene);
  if (!state) {
    const cache = new AvatarTextureCache<string>(key => { scene.textures.remove(key); }, 32, {maxBytes:128*1024*1024,sizeOf:key=>{
      const source=scene.textures.get(key).getSourceImage();
      // Canvas CPU backing and GPU RGBA allocation both belong to this cache.
      return source.width*source.height*8;
    }});
    state = { cache, prefix: `avatar-scene-${++sceneSerial}:` }; sceneCaches.set(scene, state);
    const dispose = () => {
      cache.dispose(); sceneCaches.delete(scene);
      scene.events.off('shutdown', dispose); scene.events.off('destroy', dispose);
    };
    scene.events.once('shutdown', dispose); scene.events.once('destroy', dispose);
  }
  const { cache, prefix } = state, key = prefix + avatarTextureKey(snapshot, catalogue);
  return cache.acquire(key, async () => {
    const canvas = pixelCanvas(await bakeAvatarPixels(snapshot, { catalogue }));
    if (sceneCaches.get(scene)?.cache !== cache) throw new Error('Avatar scene stopped while baking');
    const texture = scene.textures.addCanvas(key, canvas);
    if (!texture) throw new Error(`Could not register avatar texture ${key}`);
    try {
      const [frameWidth, frameHeight] = catalogue.format.runtimeCell;
      if (!scene.textures.addSpriteSheet(key, texture, { frameWidth, frameHeight, endFrame: 35 })) throw new Error('Could not register avatar frames');
    } catch (error) { scene.textures.remove(key); throw error; }
    return key;
  });
}
