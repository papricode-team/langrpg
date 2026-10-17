import type * as Phaser from 'phaser';
import { sceneryFootprints, type PlacedScenerySpec } from './placed-scenery';
import type { SceneryGeometry, ScenePolygon } from './scene-schema';
import { worldDepth } from './world-depth';
import { foundationGround, foundationPatches, paintFoundationDressing,type FoundationGround } from './foundation-dressing';
import { frameImageRect } from './texture-frame';

// Feathered ground marks do not need the native resolution of the building art.
const REFERENCE_WIDTH = 256, MARGIN = 24;
// Ground effects must stay below every wall strip and every character, including
// someone behind a building. Sorting them at the building's feet paints over both.
export const FOUNDATION_DEPTH = worldDepth(0, 'shadow');
/**
 * Ground marks sort in blend bands rather than per object, so every town draws them in three
 * batches: contact shadows, then all wear, then building shadows. Each object keeps its own order.
 */
export const FOUNDATION_WEAR_DEPTH = FOUNDATION_DEPTH + .25;
export const BUILDING_SHADOW_DEPTH = FOUNDATION_DEPTH + .5;
/** Grime painted along a wall's base. */
const SURFACE_COLOUR = [70, 59, 44] as const;

/**
 * Turns a grime stroke into a normal-blend overlay of the wall beneath it, in place.
 *
 * Multiplying an opaque wall W by colour S at alpha a gives W·(1−a+a·S). With b = a·(1−min S) the
 * same pixel is P + W·(1−b) for a premultiplied P = W·a·(S−min S), so an overlay of colour
 * W·(S−min S)/(1−min S) at alpha b matches the multiply. Tinted like the wall it stays exact, and
 * unlike a multiply it batches with the wall strips around it. `stroke` and `wall` are RGBA rows of
 * the same size; the stroke's alpha is clipped to the wall's.
 */
export function surfaceOverlay(stroke: Uint8ClampedArray, wall: Uint8ClampedArray, colour: readonly [number, number, number] = SURFACE_COLOUR): void {
  const least = Math.min(...colour), range = 255 - least;
  for (let index = 0; index < stroke.length; index += 4) {
    const alpha = stroke[index + 3] * wall[index + 3] / 255;
    for (let channel = 0; channel < 3; channel++) stroke[index + channel] = wall[index + channel] * (colour[channel] - least) / range;
    stroke[index + 3] = alpha * range / 255;
  }
}
export interface FoundationArtwork {
  frame: Phaser.Textures.Frame;
  referenceWidth: number;
  originX: number;
  originY: number;
}

/** Ground material colours from docs/style; unknown regions keep neutral wear. */
export function foundationPalette(mapId: string) {
  switch (mapId) {
    case 'lindenhafen': return { bounce: 0xe9d7a6, soil: '113,96,70', moss: '125,147,96' };
    case 'waldruh': return { bounce: 0xc2ad81, soil: '114,82,61', moss: '118,128,91' };
    case 'nebelstadt': return { bounce: 0xb7baa6, soil: '104,126,130', moss: '106,119,102' };
    default: return { bounce: 0xffffff, soil: '110,107,99', moss: '113,117,101' };
  }
}

/** Keep contact independent of collidability, but honour edited collision shapes. */
export function foundationPolygons(spec: PlacedScenerySpec, geometry?: SceneryGeometry): readonly ScenePolygon[] {
  const name = spec.frame ?? spec.asset;
  return sceneryFootprints([{ ...spec, collision: spec.collision?.polygons.length ? spec.collision : undefined,
    x: 0, y: 0, width: REFERENCE_WIDTH, collidable: true }],
    geometry ? { assets: { [name]: geometry } } : undefined)
    // Saved collision snapshots at different placement sizes accumulate tiny
    // floating-point differences. Quantize below a visible pixel to share art.
    .map(polygon => polygon.map(([x,y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as const)
      .filter(([x,y], index, points) => index === 0 || x !== points[0][0] || y !== points[0][1]));
}

export function foundationBounds(polygons: readonly ScenePolygon[]) {
  const points = polygons.flat(), xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const x = Math.floor(Math.min(...xs) - MARGIN), y = Math.floor(Math.min(...ys) - MARGIN);
  return { x, y, width: Math.ceil(Math.max(...xs) + MARGIN - x), height: Math.ceil(Math.max(...ys) + MARGIN - y) };
}

/** Front of the collider is a height guide, not the visible stone edge. */
function frontAt(polygons: readonly ScenePolygon[], x: number): number {
  let front = -Infinity;
  for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    const y = a[0] === b[0] ? Math.max(a[1], b[1]) : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    front = Math.max(front, y);
  }
  if (Number.isFinite(front)) return front;
  return polygons.flat().reduce((nearest, point) => Math.abs(point[0] - x) < Math.abs(nearest[0] - x) ? point : nearest)[1];
}

/** Trace actual painted contact, including stones, barrels and projecting steps.
 * Gaps stay open; a roof overhang above the local wall base cannot cast a contact mark.
 */
export function traceFoundationContact(pixels: Uint8ClampedArray, width: number, height: number,
  artwork: {width:number;height:number;referenceWidth:number;originX:number;originY:number},
  polygons: readonly ScenePolygon[], flipX = false): readonly ScenePolygon[] {
  const scale = REFERENCE_WIDTH / artwork.referenceWidth, lines: [number, number][][] = [];
  let line: [number, number][] = [];
  for (let column = 0; column < width; column++) {
    const x = ((column + .5) / width - artwork.originX) * artwork.width * scale * (flipX ? -1 : 1);
    let row = height - 1;
    while (row >= 0 && pixels[(row * width + column) * 4 + 3] < 128) row--;
    const y = ((row + 1) / height - artwork.originY) * artwork.height * scale;
    if (row < 0 || y < frontAt(polygons, x) - 10) {
      if (line.length > 1) lines.push(line);
      line = [];
    } else line.push([x, y]);
  }
  if (line.length > 1) lines.push(line);
  return lines;
}

function paintedContact(artwork: FoundationArtwork | undefined, polygons: readonly ScenePolygon[], flipX: boolean): readonly ScenePolygon[] | undefined {
  const frame = artwork?.frame;
  if (!artwork || !frame?.source?.image || frame.trimmed || frame.rotated) return;
  const density = Math.min(1, 512 / frame.width, 512 / frame.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(frame.width * density)); canvas.height = Math.max(1, Math.ceil(frame.height * density));
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) return;
  context.drawImage(frame.source.image as CanvasImageSource, ...frameImageRect(frame), 0, 0, canvas.width, canvas.height);
  const lines = traceFoundationContact(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height,
    {...artwork, width: frame.width, height: frame.height}, polygons, flipX);
  return lines.length ? lines : undefined;
}

/** Small overlapping feather strokes avoid a hard polygon edge without filters. */
export function paintFoundation(context: CanvasRenderingContext2D, polygons: readonly ScenePolygon[], contact?: readonly ScenePolygon[]): void {
  context.save();
  context.translate(.7, 1); // Upper-left sunlight; keep the seam attached.
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const polygon of contact ?? polygons) {
    if (polygon.length < 2) continue;
    context.beginPath();
    polygon.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    if (!contact) context.closePath();
    for (const [width,alpha] of [[18,.025],[12,.04],[8,.07],[5,.11],[2.5,.19],[1,.23]]) {
      context.strokeStyle = `rgba(53,47,39,${alpha})`;
      context.lineWidth = width; context.stroke();
    }
    if (!contact) { context.fillStyle = 'rgba(53,47,39,.22)'; context.fill(); }
  }
  context.restore();
}

interface CachedFoundation { key: string; bounds: ReturnType<typeof foundationBounds>; density: number; surface: boolean; users: number; }
const caches = new WeakMap<Phaser.Textures.TextureManager, Map<string, CachedFoundation>>();
let textureSequence = 0;

/** One small contact atlas per regional painting, shared across placement sizes. */
export class BuildingFoundation {
  readonly kind = 'building';
  readonly shadow: Phaser.GameObjects.Image;
  readonly wear: Phaser.GameObjects.Image;
  /** Owned, segmented and depth-sorted with the building's painted parts. */
  readonly surface?: Phaser.GameObjects.Sprite;
  readonly growth?: Phaser.GameObjects.Sprite;
  private cache: Map<string, CachedFoundation>;
  private signature: string;
  private entry: CachedFoundation;
  constructor(private scene: Phaser.Scene, mapId: string, spec: PlacedScenerySpec, geometry?: SceneryGeometry, artwork?: FoundationArtwork,sample:(x:number,y:number)=>FoundationGround=(x,y)=>foundationGround(mapId,x,y)) {
    const polygons = foundationPolygons(spec, geometry);
    const contact = paintedContact(artwork, polygons, !!spec.flipX);
    const patches = contact ? foundationPatches(contact,spec,geometry,sample) : [];
    this.signature = JSON.stringify([mapId, polygons, patches, !!spec.flipX, artwork && [artwork.frame.texture?.key,artwork.frame.name,artwork.referenceWidth,artwork.originX,artwork.originY]]);
    this.cache = caches.get(scene.textures) ?? new Map();
    caches.set(scene.textures, this.cache);
    let entry = this.cache.get(this.signature);
    if (!entry) {
      const bounds = foundationBounds(contact ?? polygons), key = `foundation-${++textureSequence}`;
      // Custom editor colliders can extend far beyond the painting. Bound each
      // atlas allocation even for those, without moving its world-space points.
      const density = Math.min(contact ? 1.5 : 1, 512 / bounds.width, 512 / bounds.height);
      const width = Math.ceil(bounds.width * density), height = Math.ceil(bounds.height * density);
      const texture = scene.textures.createCanvas(key, width, height * (contact ? 4 : 2));
      if (!texture) throw new Error('Cannot create building contact texture');
      for (const [index, name] of ['shadow', 'wear'].entries()) {
        const context = texture.context;
        context.save();
        context.translate(0, index * height);
        context.scale(density, density);
        context.translate(-bounds.x, -bounds.y);
        if(index===0)paintFoundation(context, polygons, contact);
        else paintFoundationDressing(context,patches,'ground');
        context.restore();
        texture.add(name, 0, 0, index * height, width, height);
      }
      if (contact && artwork) {
        const context = texture.context, frame = artwork.frame, scale = REFERENCE_WIDTH / artwork.referenceWidth;
        context.save();
        context.translate(0, height * 2); context.scale(density, density); context.translate(-bounds.x, -bounds.y);
        context.lineJoin = context.lineCap = 'round';
        for (const line of contact) {
          context.beginPath();
          line.forEach(([x,y], index) => index ? context.lineTo(x,y-1) : context.moveTo(x,y-1));
          for (const [width,alpha] of [[12,.035],[8,.06],[5,.09],[2,.13]]) {
            context.lineWidth=width;context.strokeStyle=`rgba(${SURFACE_COLOUR.join(',')},${alpha})`;context.stroke();
          }
        }
        context.restore();
        // The wall beneath the stroke, in the same frame of reference.
        const wall = document.createElement('canvas'); wall.width = width; wall.height = height;
        const painting = wall.getContext('2d', { willReadFrequently: true })!;
        painting.scale(density, density); painting.translate(-bounds.x, -bounds.y); painting.scale(spec.flipX?-1:1,1);
        painting.drawImage(frame.source.image as CanvasImageSource,...frameImageRect(frame),
          -frame.width*artwork.originX*scale,-frame.height*artwork.originY*scale,frame.width*scale,frame.height*scale);
        const stroke = context.getImageData(0, height*2, width, height);
        surfaceOverlay(stroke.data, painting.getImageData(0, 0, width, height).data);
        context.putImageData(stroke, 0, height*2);
        texture.add('surface',0,0,height*2,width,height);
        context.save();
        context.translate(0,height*3);context.scale(density,density);context.translate(-bounds.x,-bounds.y);
        paintFoundationDressing(context,patches,'growth');
        context.restore();
        texture.add('growth',0,0,height*3,width,height);
      }
      texture.refresh();
      entry = { key, bounds, density, surface: !!contact, users: 0 };
      this.cache.set(this.signature, entry);
    }
    this.entry = entry;
    entry.users++;
    const scale = spec.width / REFERENCE_WIDTH, { x, y } = entry.bounds;
    const image = (frame: string) => scene.add.image(spec.x + x * scale, spec.y + y * scale, entry.key, frame)
      .setOrigin(0).setScale(scale / entry.density).setDepth(FOUNDATION_DEPTH).setBlendMode('MULTIPLY');
    this.wear = image('wear').setBlendMode('NORMAL').setDepth(FOUNDATION_WEAR_DEPTH);
    this.shadow = image('shadow').setDepth(BUILDING_SHADOW_DEPTH);
    if (entry.surface) this.surface=scene.add.sprite(spec.x+x*scale,spec.y+y*scale,entry.key,'surface')
      .setOrigin(0).setScale(scale/entry.density).setBlendMode('NORMAL');
    if (entry.surface) this.growth=scene.add.sprite(spec.x+x*scale,spec.y+y*scale,entry.key,'growth')
      .setOrigin(0).setScale(scale/entry.density).setBlendMode('NORMAL');
  }
  setVisible(visible: boolean) {
    for (const image of [this.wear, this.shadow]) if (image.visible !== visible) image.setVisible(visible);
  }
  setAlpha(alpha: number) { this.wear.setAlpha(alpha); this.shadow.setAlpha(alpha); }
  setTint(tint: number) { this.wear.setTint(tint); this.shadow.setTint(tint); }
  /** Editor drag previews move the ground marks with the painted wall strips. */
  moveBy(dx: number, dy: number) {
    for (const image of [this.wear, this.shadow]) image.setPosition(image.x + dx, image.y + dy);
  }
  destroy() {
    this.wear.destroy(); this.shadow.destroy();
    if (--this.entry.users === 0) {
      this.scene.textures.remove(this.entry.key);
      this.cache.delete(this.signature);
    }
  }
}
