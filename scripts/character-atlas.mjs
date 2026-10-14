import sharp from 'sharp';

/** Trim only transparent pixels; Phaser restores each frame's original anchor. */
export async function packCharacterAtlas(input, cell, { columns = 9, count = 36, pageWidth = 2048 } = {}) {
  const [width, height] = cell;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width * columns || info.height !== height * Math.ceil(count / columns)) throw new Error('Character atlas geometry mismatch');
  const cells = [];
  for (let index = 0; index < count; index++) {
    const left = index % columns * width, top = Math.floor(index / columns) * height;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!data[((top + y) * info.width + left + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < x0) throw new Error(`Empty character frame ${index}`);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const pixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) data.copy(pixels, y * w * 4, ((top + y0 + y) * info.width + left + x0) * 4, ((top + y0 + y) * info.width + left + x0 + w) * 4);
    cells.push({ index, x0, y0, w, h, pixels });
  }
  const frames = {}, composites = [];
  let x = 1, y = 1, rowHeight = 0, usedWidth = 0;
  for (const cell of cells.sort((a, b) => b.h - a.h || a.index - b.index)) {
    if (cell.w + 2 > pageWidth) throw new Error('Character frame exceeds atlas width');
    if (x + cell.w + 1 > pageWidth) { x = 1; y += rowHeight + 2; rowHeight = 0; }
    frames[cell.index] = { frame: { x, y, w: cell.w, h: cell.h }, rotated: false, trimmed: true,
      spriteSourceSize: { x: cell.x0, y: cell.y0, w: cell.w, h: cell.h }, sourceSize: { w: width, h: height } };
    composites.push({ input: cell.pixels, raw: { width: cell.w, height: cell.h, channels: 4 }, left: x, top: y });
    usedWidth = Math.max(usedWidth, x + cell.w + 1); x += cell.w + 2; rowHeight = Math.max(rowHeight, cell.h);
  }
  const size = { w: usedWidth, h: y + rowHeight + 1 };
  if (size.h > 4096) throw new Error('Character atlas exceeds texture limit');
  const image = await sharp({ create: { width: size.w, height: size.h, channels: 4, background: '#00000000' } })
    .composite(composites).webp({ lossless: true, effort: 6 }).toBuffer();
  return { image, atlas: { frames, meta: { size, scale: '1' } }, textureBytes: size.w * size.h * 4 };
}

/** Preserve native frames while keeping each compressed texture within budget. */
export async function packCharacterAtlasPages(input, cell, { maxBytes = 2 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Character atlas byte limit must be a positive integer');
  if (!Array.isArray(cell) || cell.length !== 2 || cell.some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error('Invalid character atlas cell');
  const pack = async (source, firstFrame, frameCount) => {
    try {
      const packed = await packCharacterAtlas(source, cell, { count: frameCount });
      return packed.image.length <= maxBytes ? { ...packed, firstFrame, frameCount } : null;
    } catch (error) {
      // A smaller page can also resolve the original packer's texture-height
      // limit. Geometry, empty-frame and all other errors remain actionable.
      if (error.message === 'Character atlas exceeds texture limit') return null;
      throw error;
    }
  };
  const full = await pack(input, 0, 36);
  if (full) return { pages: [full], textureBytes: full.textureBytes };
  const [width, height] = cell;
  for (const frameCount of [18, 9]) {
    const pages = [];
    for (let firstFrame = 0; firstFrame < 36; firstFrame += frameCount) {
      // Extract complete source rows before trimming. The packer records the
      // unchanged sourceSize and spriteSourceSize for every local frame.
      const source = await sharp(input).extract({ left: 0, top: firstFrame / 9 * height, width: width * 9, height: frameCount / 9 * height }).png().toBuffer();
      const page = await pack(source, firstFrame, frameCount);
      if (!page) break;
      pages.push(page);
    }
    if (pages.length === 36 / frameCount) return { pages, textureBytes: pages.reduce((total, page) => total + page.textureBytes, 0) };
  }
  throw new Error(`Character facing page exceeds compressed byte or texture limit (${maxBytes} bytes)`);
}
