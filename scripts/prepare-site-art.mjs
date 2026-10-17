import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const out = 'site/public/images';
await mkdir(out, { recursive: true });
const hero = 'art/source/marketing/lantern-harbor.png';
await Promise.all([
  ...[960, 1920].map(width => sharp(hero).resize(width, Math.round(width * 9 / 16), { fit: 'cover' }).webp({ quality: 82 }).toFile(`${out}/hero-${width}.webp`)),
  ...[960, 1920].map(width => sharp(hero).resize(width, Math.round(width * 9 / 16), { fit: 'cover' }).avif({ quality: 55, effort: 5 }).toFile(`${out}/hero-${width}.avif`)),
  sharp(hero).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 85, mozjpeg: true }).toFile(`${out}/glotworld-social.jpg`),
  ...['lindenhafen', 'waldruh', 'nebelstadt'].map(town => sharp(`web/public/assets/${town}-preview.webp`).resize(720, 600, { fit: 'cover' }).webp({ quality: 80 }).toFile(`${out}/${town}.webp`)),
  sharp('docs/screenshots/desktop.jpg').resize(1280, 720).webp({ quality: 78 }).toFile(`${out}/gameplay.webp`),
  sharp('docs/screenshots/desktop.jpg').resize(640, 360).webp({ quality: 78 }).toFile(`${out}/gameplay-640.webp`),
  sharp('docs/screenshots/interiors/cafe.jpg').resize(720, 480, { fit: 'cover' }).webp({ quality: 80 }).toFile(`${out}/cafe.webp`),
]);
console.log('Prepared responsive campaign artwork, game images and social preview.');
