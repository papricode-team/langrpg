import { buildWidth, MODULAR_ART, normalizeParts, partTextureKey } from './avatar-options';

export type ModularAvatar = { hair: string; skin: string; outfit: string } & Partial<ReturnType<typeof normalizeParts>>;
export interface PieceLayer { id: string; key: string; frame: number; tint: number; width: number; }
const hex = (value: string | undefined, fallback: string) => parseInt((/^#[\da-f]{6}$/i.test(value ?? '') ? value! : fallback).slice(1), 16);

/** Every piece is a complete registered frame. Only the common frame changes. */
export function characterLayers(avatar: ModularAvatar, frame = 0): PieceLayer[] {
  const parts = normalizeParts(avatar);
  const skin = hex(avatar.skin, '#d8a077'), hair = hex(avatar.hair, '#48372e');
  const outfit = hex(avatar.outfit, '#326a65'), pants = hex(parts.pants, '#44464d');
  const layer = (id: string, tint = 0xffffff): PieceLayer => ({ id, key: partTextureKey(id, ''), frame, tint, width: buildWidth(parts.build) });
  return [
    layer('bottom-detail'), layer('bottom-fabric', pants),
    layer('body-skin', skin), layer('head-detail'),
    layer('jacket-detail'), layer('jacket-fabric', outfit),
    ...(parts.hairstyle === 'bald' ? [] : [layer(`hair-${parts.hairstyle}`, hair)]),
  ];
}

const images = new Map<string, Promise<HTMLImageElement>>();
function imageFor(id: string) {
  let promise = images.get(id);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { images.delete(id); reject(new Error(`Missing character piece ${id}`)); };
      image.src = `/assets/player-layers/${id}-preview.webp?v=layers11`;
    });
    images.set(id, promise);
  }
  return promise;
}

const paints = new WeakMap<HTMLCanvasElement, number>();
export async function paintCharacter(canvas: HTMLCanvasElement, avatar: ModularAvatar, frame = 0): Promise<void> {
  const version = (paints.get(canvas) ?? 0) + 1;
  paints.set(canvas, version);
  const layers = characterLayers(avatar, frame), sources = await Promise.all(layers.map(layer => imageFor(layer.id)));
  if (paints.get(canvas) !== version) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const { previewWidth: width, previewHeight: height, columns } = MODULAR_ART;
  const scale = Math.min(canvas.width / (width * 1.28), canvas.height / height);
  const piece = document.createElement('canvas');
  piece.width = width; piece.height = height;
  const pieceContext = piece.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, (canvas.height - height * scale) / 2);
  layers.forEach((layer, index) => {
    const source = sources[index], sourceX = layer.frame % columns * width, sourceY = Math.floor(layer.frame / columns) * height;
    pieceContext.clearRect(0, 0, width, height);
    pieceContext.drawImage(source, sourceX, sourceY, width, height, 0, 0, width, height);
    if (layer.tint !== 0xffffff) {
      pieceContext.globalCompositeOperation = 'multiply';
      pieceContext.fillStyle = `#${layer.tint.toString(16).padStart(6, '0')}`;
      pieceContext.fillRect(0, 0, width, height);
      pieceContext.globalCompositeOperation = 'destination-in';
      pieceContext.drawImage(source, sourceX, sourceY, width, height, 0, 0, width, height);
      pieceContext.globalCompositeOperation = 'source-over';
    }
    context.save();
    context.scale(layer.width, 1);
    context.drawImage(piece, -width * scale / 2, 0, width * scale, height * scale);
    context.restore();
  });
  context.restore();
}
