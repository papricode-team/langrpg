import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';

// Repack the generated 4×2 plate into a CSS steps(8) strip. Preserve its alpha.
const source = 'art/source/marketing/lantern-sparks.png';
const { width, height, hasAlpha } = await sharp(source).metadata();
if (!hasAlpha || width !== height * 2) throw new Error('Sparks master must be a transparent 4×2 square-cell plate.');
// Generated dimensions may be odd. Round cell edges, never clip a last pixel.
const frames = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
  const column = i % 4, row = Math.floor(i / 4);
  const left = Math.round(column * width / 4), top = Math.round(row * height / 2);
  return {
    input: await sharp(source).extract({ left, top, width: Math.round((column + 1) * width / 4) - left, height: Math.round((row + 1) * height / 2) - top }).resize(128, 128).png().toBuffer(),
    left: i * 128, top: 0,
  };
}));
await mkdir('site/public/images', { recursive: true });
const output = 'site/public/images/sparks.webp';
await sharp({ create: { width: 1024, height: 128, channels: 4, background: '#00000000' } }).composite(frames).webp({ quality: 80, alphaQuality: 100, effort: 6 }).toFile(output);
if ((await stat(output)).size >= 550 * 1024) throw new Error('Sparks exceed the unchanged 550 KiB image budget.');
console.log('Prepared eight transparent lantern-spark frames.');
