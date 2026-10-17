/** Export the four independent furniture cells, preserving ImageGen's native alpha. */
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
const source = new URL('../art/source/interiors/room-kit-furniture.png', import.meta.url);
const {data, info} = await sharp(source.pathname).raw().toBuffer({resolveWithObject: true});
if (info.channels !== 4 || info.width !== 1536 || info.height !== 1024) throw new Error('Room kit needs the original RGBA 1536 × 1024 sheet.');
const frames = {};
for (const [index, name] of ['bed','desk','lamp','window'].entries()) {
  const left = index % 2 * 768, top = Math.floor(index / 2) * 512;
  let x0 = left + 768, y0 = top + 512, x1 = left, y1 = top;
  for (let y = top; y < top + 512; y++) for (let x = left; x < left + 768; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 8) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  frames[name] = {x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1};
}
await sharp(source.pathname).webp({quality:90,alphaQuality:100}).toFile(new URL('../web/public/assets/room-kit-furniture.webp',import.meta.url).pathname);
await writeFile(new URL('../web/src/data/room-kit-furniture.json',import.meta.url),JSON.stringify(frames,null,2)+'\n');
console.log('Exported bed, desk, lamp and window components.');
