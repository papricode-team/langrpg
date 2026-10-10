import type * as Phaser from 'phaser';

export const NPC_ART = { key: 'town-characters', width: 256, height: 384, bodyHeight: 338, footY: 0.9 };
export const PLAYER_ART = { source: 'wanderer-source', width: 192, height: 288, bodyHeight: 246, columns: 8, rows: 5, frameCount: 36, footY: 0.9, idle: 32 };
export const INTERIOR_CHARACTER_HEIGHT = 132;

/** Indoor adults share one visible body height, independent of transparent canvas padding. */
export function characterArtScale(bodyHeight: number, canvasHeight: number, indoors: boolean, indoorHeight = INTERIOR_CHARACTER_HEIGHT): number {
  return indoors ? indoorHeight / bodyHeight : 82 / canvasHeight;
}
export const PLAYER_LAYERS = ['wanderer-detail', 'wanderer-outfit', 'wanderer-hair', 'wanderer-skin'] as const;
export type PlayerPalette = { outfit: number; hair: number; skin: number };

export function playerMaterialShadows(palette: PlayerPalette): number[] {
  const shade = (value: number, amount: number) => (Math.round((value >> 16 & 255) * amount) << 16) | (Math.round((value >> 8 & 255) * amount) << 8) | Math.round((value & 255) * amount);
  const hairBrightness = (palette.hair >> 16 & 255) * 0.2126 + (palette.hair >> 8 & 255) * 0.7152 + (palette.hair & 255) * 0.0722;
  // Minification blends the fine dark strands together. Light hair needs a
  // brighter shadow material to retain its chosen color at game-world scale.
  const hairFloor = 0.16 + 0.4 * Math.min(1, Math.max(0, (hairBrightness - 70) / 120));
  return [0, shade(palette.outfit, 0.035), shade(palette.hair, hairFloor), 0];
}

type Material = 0 | 1 | 2 | 3;
interface SkinPatch { x: number; y: number; rx: number; ry: number; }
interface FrameBounds { top: number; bottom: number; headX: number; hands: SkinPatch[]; }

/** Four shared atlases, independent of the number of avatars or palettes. */
export function prepareCharacterArt(scene: Phaser.Scene): boolean {
  createContactShadow(scene);
  if (!scene.textures.exists(PLAYER_ART.source)) return false;
  const source = scene.textures.get(PLAYER_ART.source).getSourceImage() as HTMLImageElement;
  const width = PLAYER_ART.width * PLAYER_ART.columns;
  const height = PLAYER_ART.height * PLAYER_ART.rows;
  const input = document.createElement('canvas');
  input.width = width;
  input.height = height;
  const context = input.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const layers = PLAYER_LAYERS.map(() => new ImageData(width, height));
  const bounds = Array.from({ length: PLAYER_ART.frameCount }, (_, frame) => frameBounds(pixels, frame));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (!pixels.data[offset + 3]) continue;
      const column = Math.floor(x / PLAYER_ART.width);
      const row = Math.floor(y / PLAYER_ART.height);
      const frame = row * PLAYER_ART.columns + column;
      if (frame >= PLAYER_ART.frameCount) continue;
      const direction = frame >= PLAYER_ART.idle ? frame - PLAYER_ART.idle : row;
      const material = pixelMaterial(pixels.data, offset, x % PLAYER_ART.width, y % PLAYER_ART.height, direction, bounds[frame]);
      const output = layers[material].data;
      if (material === 0) {
        output[offset] = pixels.data[offset];
        output[offset + 1] = pixels.data[offset + 1];
        output[offset + 2] = pixels.data[offset + 2];
      } else {
        // Normalize each material's painted lighting before GPU color multiplication.
        // Pixels belong to exactly one layer, preserving the original alpha contour.
        const luminance = pixels.data[offset] * 0.2126 + pixels.data[offset + 1] * 0.7152 + pixels.data[offset + 2] * 0.0722;
        const reference = material === 1 ? 113 : material === 2 ? 54 : 180;
        const gray = Math.min(255, Math.round(luminance * 255 / reference));
        output[offset] = output[offset + 1] = output[offset + 2] = gray;
      }
      output[offset + 3] = pixels.data[offset + 3];
    }
  }

  PLAYER_LAYERS.forEach((key, layer) => {
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) throw new Error(`Unable to create shared character material ${key}`);
    texture.context.putImageData(layers[layer], 0, 0);
    for (let frame = 0; frame < PLAYER_ART.frameCount; frame++) {
      texture.add(frame, 0, frame % PLAYER_ART.columns * PLAYER_ART.width, Math.floor(frame / PLAYER_ART.columns) * PLAYER_ART.height, PLAYER_ART.width, PLAYER_ART.height);
    }
    texture.refresh();
  });
  // Release the original GPU upload after decomposing it. Runtime memory stays
  // at four 1536×1440 RGBA atlases (~34 MiB), even with 128 distinct palettes.
  scene.textures.remove(PLAYER_ART.source);
  input.width = input.height = 1;
  return true;
}

function frameBounds(image: ImageData, frame: number): FrameBounds {
  const column = frame % PLAYER_ART.columns;
  const row = Math.floor(frame / PLAYER_ART.columns);
  let top = PLAYER_ART.height;
  let bottom = 0;
  for (let y = 0; y < PLAYER_ART.height; y++) {
    for (let x = 0; x < PLAYER_ART.width; x++) {
      const alpha = image.data[((row * PLAYER_ART.height + y) * image.width + column * PLAYER_ART.width + x) * 4 + 3];
      if (alpha < 100) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (bottom <= top) return { top: 0, bottom: PLAYER_ART.height, headX: PLAYER_ART.width / 2, hands: [] };
  let sum = 0;
  let count = 0;
  const headBottom = top + (bottom - top) * 0.095;
  for (let y = top; y < headBottom; y++) {
    for (let x = 0; x < PLAYER_ART.width; x++) {
      const alpha = image.data[((row * PLAYER_ART.height + y) * image.width + column * PLAYER_ART.width + x) * 4 + 3];
      if (alpha < 100) continue;
      sum += x;
      count++;
    }
  }
  const headX = count ? sum / count : PLAYER_ART.width / 2;
  const handPoints: [number, number][][] = [[], []];
  const sideIdle = frame >= PLAYER_ART.idle && (frame - PLAYER_ART.idle) % 2 === 1;
  for (let y = Math.ceil(top + (bottom - top) * (sideIdle ? 0.54 : 0.30)); y < top + (bottom - top) * (sideIdle ? 0.72 : 0.62); y++) {
    for (let x = 0; x < PLAYER_ART.width; x++) {
      const lateral = Math.abs(x - headX) / (bottom - top);
      if (sideIdle ? lateral > 0.065 : lateral < 0.13) continue;
      const offset = ((row * PLAYER_ART.height + y) * image.width + column * PLAYER_ART.width + x) * 4;
      const alpha = image.data[offset + 3];
      if (alpha <= 100) continue;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (luminance > 100 && r / Math.max(g, 1) > 1.05 && r / Math.max(g, 1) < 1.60 && b / Math.max(g, 1) > 0.64 && b < r * 0.88) handPoints[sideIdle ? 0 : x < headX ? 0 : 1].push([x, y]);
    }
  }
  const hands = handPoints.filter(points => points.length >= 10).map(points => {
    const minX = Math.min(...points.map(point => point[0]));
    const maxX = Math.max(...points.map(point => point[0]));
    const minY = Math.min(...points.map(point => point[1]));
    const maxY = Math.max(...points.map(point => point[1]));
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, rx: (maxX - minX) / 2 + 2, ry: (maxY - minY) / 2 + 2 };
  });
  return { top, bottom, headX, hands };
}

function pixelMaterial(pixels: Uint8ClampedArray, offset: number, x: number, y: number, direction: number, bounds: FrameBounds): Material {
  const r = pixels[offset];
  const g = pixels[offset + 1];
  const b = pixels[offset + 2];
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const chroma = maximum - minimum;
  let hue = maximum === r ? (g - b) / chroma : maximum === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
  hue = (hue * 60 + 360) % 360;
  const saturation = maximum ? chroma / maximum : 0;
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const bodyHeight = bounds.bottom - bounds.top;
  const relativeY = (y - bounds.top) / bodyHeight;
  const headX = (x - bounds.headX) / bodyHeight;
  const warm = hue >= 10 && hue <= 48 && saturation >= 0.15 && saturation <= 0.75;

  // The teal fabric classifier excludes the cream shirt and warm leather.
  if (relativeY > 0.15 && relativeY < 0.70 && hue >= 120 && hue <= 230 && chroma >= 2 && saturation >= 0.035) return 1;

  const faceX = direction === 1 ? 0.027 : direction === 3 ? -0.027 : 0;
  const face = ((headX - faceX - (direction === 0 ? 0.009 : 0)) / (direction === 0 ? 0.055 : 0.052)) ** 2 + ((relativeY - 0.135) / 0.073) ** 2 < 1;
  const neck = relativeY >= 0.17 && relativeY < 0.255 && Math.abs(headX - faceX * 0.45) < 0.032;
  const ear = direction === 2 && relativeY >= 0.11 && relativeY < 0.175 && Math.abs(headX) > 0.04;
  const hand = relativeY > 0.30 && relativeY < 0.62 && Math.abs(headX) > 0.105;
  const skinColor = warm && luminance > 60 && r / Math.max(g, 1) > 1.05 && r / Math.max(g, 1) < 1.8 && b / Math.max(g, 1) > 0.52;
  if (direction !== 2 && face) {
    const eyeWhite = relativeY > 0.095 && relativeY < 0.14 && saturation < 0.16 && luminance > 145;
    const lip = relativeY > 0.14 && hue < 10 && saturation > 0.2;
    return eyeWhite || lip ? 0 : 3;
  }
  // Bright skin seeds locate the hands; fill their painted shadow contours
  // spatially instead of leaving pale holes when a darker skin is selected.
  for (const patch of bounds.hands) {
    if (((x - patch.x) / patch.rx) ** 2 + ((y - patch.y) / patch.ry) ** 2 < 1) return 3;
  }
  const handColor = skinColor && luminance > 70 && r / Math.max(g, 1) < 1.65 && b / Math.max(g, 1) > 0.62;
  if ((skinColor && ((direction !== 2 && neck) || ear)) || (hand && handColor)) return 3;

  // Hair is restricted to the head, so bags, belts, trousers and boots retain
  // their original painted colors for every avatar customization.
  const hairColor = (hue >= 8 && hue <= 65 && saturation >= 0.12) || (saturation < 0.15 && luminance < 110);
  if (relativeY < 0.175 && Math.abs(headX) < 0.11 && (relativeY < 0.065 || (hairColor && luminance < 210))) return 2;
  return 0;
}

export function createContactShadow(scene: Phaser.Scene): void {
  const texture = scene.textures.createCanvas('character-shadow', 160, 64);
  if (!texture) return;
  const context = texture.context;
  context.save();
  context.translate(80, 32);
  context.scale(1, 0.4);
  const gradient = context.createRadialGradient(0, 0, 2, 0, 0, 75);
  gradient.addColorStop(0, 'rgba(22,28,24,.36)');
  gradient.addColorStop(0.35, 'rgba(22,28,24,.22)');
  gradient.addColorStop(1, 'rgba(22,28,24,0)');
  context.fillStyle = gradient;
  context.fillRect(-80, -80, 160, 160);
  context.restore();
  texture.refresh();
}

/** CPU-only preview of the same materials. No avatar-specific GPU texture. */
export function paintAvatarPreview(scene: Phaser.Scene, canvas: HTMLCanvasElement, palette: PlayerPalette, frame = PLAYER_ART.idle): boolean {
  if (!scene.textures.exists(PLAYER_LAYERS[0])) return false;
  const context = canvas.getContext('2d');
  if (!context) return false;
  const sourceX = frame % PLAYER_ART.columns * PLAYER_ART.width;
  const sourceY = Math.floor(frame / PLAYER_ART.columns) * PLAYER_ART.height;
  const scale = Math.min(canvas.width / PLAYER_ART.width, canvas.height / PLAYER_ART.height);
  const width = PLAYER_ART.width * scale;
  const height = PLAYER_ART.height * scale;
  const targetX = (canvas.width - width) / 2;
  const targetY = (canvas.height - height) / 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scratch = document.createElement('canvas');
  scratch.width = PLAYER_ART.width;
  scratch.height = PLAYER_ART.height;
  const layerContext = scratch.getContext('2d');
  if (!layerContext) return false;
  const tints = [0xffffff, palette.outfit, palette.hair, palette.skin];
  const shadows = playerMaterialShadows(palette);
  PLAYER_LAYERS.forEach((key, index) => {
    const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    layerContext.globalCompositeOperation = 'source-over';
    layerContext.clearRect(0, 0, scratch.width, scratch.height);
    layerContext.drawImage(source, sourceX, sourceY, PLAYER_ART.width, PLAYER_ART.height, 0, 0, PLAYER_ART.width, PLAYER_ART.height);
    if (index > 0) {
      const pixels = layerContext.getImageData(0, 0, scratch.width, scratch.height);
      const tint = tints[index];
      const shadow = shadows[index];
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        if (!pixels.data[offset + 3]) continue;
        for (let channel = 0; channel < 3; channel++) {
          const gray = pixels.data[offset + channel] / 255;
          const shift = (2 - channel) * 8;
          pixels.data[offset + channel] = Math.round(gray * (tint >> shift & 255) + (1 - gray) * (shadow >> shift & 255));
        }
      }
      layerContext.putImageData(pixels, 0, 0);
    }
    context.drawImage(scratch, targetX, targetY, width, height);
  });
  scratch.width = scratch.height = 1;
  return true;
}
