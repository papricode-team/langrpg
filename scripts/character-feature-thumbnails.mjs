/** Focus builder tiles on the selected feature using the published editor art. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { combineMaterials, clearWhiteMatte, over } from '../web/src/character-compositor.mjs';
import { characterSheetPages } from '../web/src/character-sheets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

export async function exportFeatureThumbnails(root = ROOT) {
  const catalogue = JSON.parse(await readFile(resolve(root, 'web/src/data/character-kit.json'), 'utf8'));
  const [width, height] = catalogue.format.editorCell;
  const raw = { width, height, channels: 4 };
  const cache = new Map();
  const render = async part => {
    if (cache.has(part.id)) return cache.get(part.id);
    const frame = part.id === 'bag-backpack' ? 18 : part.id === 'bag-tote' ? 27 : 0;
    const materials = await Promise.all(part.materials.filter(material =>
      part.slot === 'body' || part.slot === 'face' || part.tints[material] !== 'skin'
    ).map(async material => {
      const page = characterSheetPages(part.sheets[material], 'editor', [width, height], [frame])[0];
      const localFrame = frame - page.firstFrame;
      const data = await sharp(resolve(root, 'web/public', catalogue.assetBase.slice(1), page.path))
        .extract({ left: localFrame % page.columns * width, top: Math.floor(localFrame / page.columns) * height, width, height }).ensureAlpha().raw().toBuffer();
      const key = part.tints[material];
      return { data, material, tint: key == null ? 0xffffff : parseInt(catalogue.defaultColors[key].slice(1), 16) };
    }));
    const pixels = combineMaterials(materials);
    const detail = materials.find(material => material.material === 'detail' && material.tint === 0xffffff);
    if (detail) clearWhiteMatte(pixels, detail.data, width, height, part.slot === 'body');
    cache.set(part.id, pixels);
    return pixels;
  };
  const directory = resolve(root, 'web/public/assets/character-features');
  await mkdir(directory, { recursive: true });
  const thumbnails = {};
  for (const part of catalogue.components) {
    let pixels = await render(part);
    let preview;
    if (['face', 'markings', 'facial-hair'].includes(part.slot)) {
      // Facial details need a head for context, but never the rest of the body.
      const body = catalogue.components.find(candidate => candidate.slot === 'body' && candidate.build === part.build);
      pixels = over(new Uint8ClampedArray(await render(body)), pixels);
      preview = sharp(Buffer.from(pixels), { raw }).extract({
        left: Math.round(width * .32), top: Math.round(height * .12),
        width: Math.round(width * .36), height: Math.round(height * (part.slot === 'facial-hair' ? .22 : .18)),
      });
    } else {
      // Isolate clothes and accessories, including long dresses and small items.
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right < left) throw new Error(`Empty feature: ${part.id}`);
      preview = sharp(Buffer.from(pixels), { raw }).extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
    }
    const bytes = await preview.resize(160, 176, { fit: 'contain', background: '#00000000' })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' })
      .webp({ lossless: true }).toBuffer();
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    await writeFile(resolve(directory, `${part.id}.webp`), bytes);
    thumbnails[part.id] = `/assets/character-features/${part.id}.webp?v=${version}`;
  }
  await writeFile(resolve(root, 'web/src/data/character-feature-thumbnails.json'), JSON.stringify(thumbnails, null, 2) + '\n');
  return { thumbnails: Object.keys(thumbnails).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await exportFeatureThumbnails());
}
