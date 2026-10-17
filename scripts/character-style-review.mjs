/** Review boards and registration audit for the 2026-10-17 material pass. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'art/proofs/character-style-review';
const sourcePath = 'art/source/character-kit/cast/catalogue.json';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await json(sourcePath);
const main = ['marta', 'otto', 'lina', 'emil', 'ada', 'fritz', 'greta', 'inspector', 'elise'];
const label = (text, width, height = 30) => Buffer.from(`<svg width="${width}" height="${height}"><text x="12" y="22" font-family="sans-serif" font-size="18" fill="#40392f">${text}</text></svg>`);
await mkdir(directory, { recursive: true });

if (process.argv[2] === 'pilot') {
  const cells = [
    await sharp('web/public/assets/portraits.webp').extract({ left: 0, top: 0, width: 443, height: 443 }).resize(320, 420, { fit: 'contain', background: '#e8dec3' }).png().toBuffer(),
    await sharp('web/public/assets/characters.webp').extract({ left: 0, top: 0, width: 256, height: 384 }).resize(320, 420, { fit: 'contain', background: '#e8dec3' }).png().toBuffer(),
    await sharp(`${directory}/marta-before.webp`).extract({ left: 0, top: 0, width: 512, height: 768 }).resize(320, 420, { fit: 'contain', background: '#e8dec3' }).png().toBuffer(),
    await sharp(`${directory}/marta-identity-pilot.webp`).extract({ left: 0, top: 0, width: 512, height: 768 }).resize(320, 420, { fit: 'contain', background: '#e8dec3' }).png().toBuffer(),
  ];
  await sharp({ create: { width: 1280, height: 456, channels: 4, background: '#e8dec3' } }).composite(cells.flatMap((input, index) => [
    { input, left: index * 320, top: 36 },
    { input: label(['Portrait identity', 'Original painted sprite', 'Previous kit', 'Paint + identity pilot'][index], 320), left: index * 320, top: 0 },
  ])).png().toFile(`${directory}/marta-portrait-old-new.png`);
  const cafe = await sharp('web/public/assets/lindenhafen-day-building-cafe.webp').resize(640, 720, { fit: 'contain', background: '#d7c9a7' }).png().toBuffer();
  const sprite = await sharp(`${directory}/marta-identity-pilot.webp`).extract({ left: 0, top: 0, width: 512, height: 768 }).resize(100, 150).png().toBuffer();
  await sharp(cafe).composite([{ input: sprite, left: 330, top: 555 }]).png().toFile(`${directory}/marta-cafe-context.png`);
  process.exit(0);
}

const audit = [], boards = [];
const limit = process.argv[2] === undefined ? source.entries.length : Number(process.argv[2]);
if (!Number.isInteger(limit) || limit < 1 || limit > source.entries.length) throw Error('Expected an optional actor count');
// Every frame of every actor appears, grouped in four-facing contact sheets.
for (let start = 0; start < limit; start += 8) {
  const entries = source.entries.slice(start, Math.min(start + 8, limit)), composites = [];
  for (const [row, entry] of entries.entries()) {
    const report = await json(`web/public/assets/character-cast/${entry.id}.json`);
    if (!report.proof.startsWith('art/proofs/character-cast-painted/')) throw Error(`Paint bake pending: ${entry.id}`);
    const path = report.proof.replace(/\.png$/, '.webp');
    const sheet = await sharp(path).resize(864, 576).png().toBuffer();
    composites.push({ input: sheet, left: row % 4 * 864, top: Math.floor(row / 4) * 606 + 30 });
    composites.push({ input: label(entry.id, 864), left: row % 4 * 864, top: Math.floor(row / 4) * 606 });
    const oldRecipeHash = (entry.paintBaseline ?? entry.review).recipeSha256;
    let alphaDifferences = null;
    if (oldRecipeHash === report.recipeSha256) {
      const before = await sharp(`art/proofs/character-cast/${entry.id}.webp`).ensureAlpha().raw().toBuffer();
      const after = await sharp(path).ensureAlpha().raw().toBuffer();
      if (before.length !== after.length) throw Error(`Cell dimensions changed: ${entry.id}`);
      alphaDifferences = 0;
      for (let p = 3; p < before.length; p += 4) if (before[p] !== after[p]) alphaDifferences++;
      if (alphaDifferences) throw Error(`Registration/coverage changed: ${entry.id}`);
    }
    audit.push({ id: entry.id, frames: 36, identityChanged: oldRecipeHash !== report.recipeSha256, alphaDifferences });
    for (const pose of Object.keys(entry.poses ?? {})) {
      const posed = await json(`web/public/assets/character-cast/poses/${pose}/${entry.id}.json`);
      if (!posed.proof.startsWith('art/proofs/character-cast-painted/')) throw Error(`Paint bake pending: ${entry.id}/${pose}`);
      const before = await sharp(`art/proofs/character-cast/poses/${pose}/${entry.id}.webp`).ensureAlpha().raw().toBuffer();
      const after = await sharp(posed.proof.replace(/\.png$/, '.webp')).ensureAlpha().raw().toBuffer();
      if (before.length !== after.length) throw Error(`Pose cell dimensions changed: ${entry.id}/${pose}`);
      let differences = 0;
      for (let p = 3; p < before.length; p += 4) if (before[p] !== after[p]) differences++;
      if (differences) throw Error(`Pose coverage changed: ${entry.id}/${pose}`);
      audit.push({ id: entry.id, pose, frames: 36, identityChanged: false, alphaDifferences: differences });
    }
    if (main.includes(entry.id)) await sharp(path).resize(1728, 1152).flatten({ background: '#e8dec3' }).png().toFile(`${directory}/${entry.id}-all-frames.png`);
  }
  const path = `${directory}/cast-board-${String(start / 8).padStart(2, '0')}.png`;
  await sharp({ create: { width: 3456, height: Math.ceil(entries.length / 4) * 606, channels: 4, background: '#e8dec3' } }).composite(composites).png().toFile(path);
  boards.push({ path, sha256: hash(await readFile(path)), ids: entries.map(entry => entry.id) });
}
await writeFile(`${directory}/registration-audit.json`, JSON.stringify({ actors: audit, boards }, null, 2) + '\n');
const lineup = [];
for (const [index, id] of main.entries()) lineup.push({
  input: await sharp(`art/proofs/character-cast-painted/${id}.webp`)
    .extract({ left: 0, top: 0, width: 512, height: 768 }).resize(256, 384).png().toBuffer(),
  left: index * 256, top: 30,
}, { input: label(id, 256), left: index * 256, top: 0 });
await sharp({ create: { width: main.length * 256, height: 414, channels: 4, background: '#e8dec3' } })
  .composite(lineup).png().toFile(`${directory}/main-cast-lineup.png`);
console.log(JSON.stringify({ walkingCasts: limit, poseSheets: audit.length - limit,
  frames: audit.length * 36, boards: boards.length, unchangedAlpha: audit.filter(row => row.alphaDifferences === 0).length }));
