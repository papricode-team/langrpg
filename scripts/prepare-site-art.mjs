import sharp from 'sharp';
import { mkdir, readdir, stat } from 'node:fs/promises';
const out = 'site/public/images';
await mkdir(out, { recursive: true });
const hero = 'art/source/marketing/lantern-harbor.png';
await Promise.all([
  ...[960, 1920].map(width => sharp(hero).resize(width, Math.round(width * 9 / 16), { fit: 'cover' }).webp({ quality: 82 }).toFile(`${out}/hero-${width}.webp`)),
  ...[960, 1920].map(width => sharp(hero).resize(width, Math.round(width * 9 / 16), { fit: 'cover' }).avif({ quality: 55, effort: 5 }).toFile(`${out}/hero-${width}.avif`)),
  sharp(hero).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 85, mozjpeg: true }).toFile(`${out}/glotworld-social.jpg`),
  ...['lindenhafen', 'waldruh', 'nebelstadt'].map(town => sharp(`art/source/marketing/${town}-vista.png`).resize(720, 600, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toFile(`${out}/${town}.webp`)),
  ...['hero-foreground', 'hero-town'].map(layer => sharp(`art/source/marketing/${layer}.png`).resize(1920, 1080, { fit: 'fill' }).webp({ quality: 78, alphaQuality: 85 }).toFile(`${out}/${layer}.webp`)),
  // The foreground overlay paints above the fold on desktop; AVIF keeps it light.
  sharp('art/source/marketing/hero-foreground.png').resize(1920, 1080, { fit: 'fill' }).avif({ quality: 50, effort: 6 }).toFile(`${out}/hero-foreground.avif`),
  sharp('art/source/marketing/hero-town.png').resize(960, 540, { fit: 'fill' }).webp({ quality: 78, alphaQuality: 85 }).toFile(`${out}/hero-town-960.webp`),
  sharp('art/source/marketing/hero-sky.png').resize(1440, 810, { fit: 'fill' }).webp({ quality: 76 }).toFile(`${out}/hero-sky.webp`),
  sharp('art/source/marketing/fog.png').resize(768, 256).webp({ quality: 65, alphaQuality: 70 }).toFile(`${out}/fog.webp`),
  sharp('art/source/marketing/brass-frame.png').trim().resize(512, 512, { fit: 'fill' }).webp({ quality: 88, alphaQuality: 90 }).toFile(`${out}/brass-frame.webp`),
  sharp('art/source/marketing/brass-divider.png').trim().resize(1024, 128, { fit: 'contain', background: '#00000000' }).webp({ quality: 85, alphaQuality: 90 }).toFile(`${out}/brass-divider.webp`),
  sharp('docs/screenshots/desktop.jpg').resize(1280, 720).webp({ quality: 78 }).toFile(`${out}/gameplay.webp`),
  sharp('docs/screenshots/desktop.jpg').resize(640, 360).webp({ quality: 78 }).toFile(`${out}/gameplay-640.webp`),
  sharp('docs/screenshots/interiors/cafe.jpg').resize(720, 480, { fit: 'cover' }).webp({ quality: 80 }).toFile(`${out}/cafe.webp`),
]);
await import('./prepare-site-sprites.mjs');
await import('./prepare-site-sparks.mjs');
// Keep art regeneration accountable to the unchanged public-page image budget.
for (const name of await readdir(out)) {
  if (!/\.(avif|webp|jpg|png)$/.test(name)) continue;
  const { size } = await stat(`${out}/${name}`);
  if (size > 550 * 1024) throw new Error(`${name} exceeds the 550 KiB public image budget: ${size} bytes`);
}
console.log('Prepared responsive campaign artwork, transparent atmosphere, brass chrome, game sprites and social preview.');
