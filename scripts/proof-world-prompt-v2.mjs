// Offline evidence only. Uses the runtime layout helper, real atlas registration
// and font outlines; never starts a browser, server or Phaser game.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { create } from 'fontkitten';
import ts from 'typescript';

async function moduleUrl(file) {
  let source = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const name of ['world-depth', 'world-ui']) {
    if (source.includes(`from './${name}'`)) source = source.replace(`from './${name}'`, `from '${await moduleUrl(`web/src/${name}.ts`)}'`);
  }
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const { interactionPromptLayout } = await import(await moduleUrl('web/src/world-prompt.ts'));
const font = async (family, weight) => create(await readFile(`node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff`));
const sans = await font('dm-sans', 400), bold = await font('dm-sans', 700), title = await font('fraunces', 400);
const D = 2, W = 1200, H = 720, layers = [];
const round = value => Math.round(value * D);
const measure = (text, size, face = sans) => face.glyphsForString(text).reduce((width, glyph) => width + glyph.advanceWidth, 0) * size / face.unitsPerEm;

function textPaths(text, x, y, size, face = sans, color = '#35473c', centred = false, outline = false) {
  const glyphs = face.glyphsForString(text), scale = size / face.unitsPerEm;
  const min = Math.min(...glyphs.map(g => g.bbox.minY)), max = Math.max(...glyphs.map(g => g.bbox.maxY));
  let cursor = x - (centred ? measure(text, size, face) / 2 : 0);
  const paths = glyphs.map(g => {
    const path = `<path d="${g.path.toSVG()}"${outline ? ` stroke-width="${3 / scale}"` : ''} transform="translate(${cursor} ${y + (min + max) * scale / 2}) scale(${scale} ${-scale})"/>`;
    cursor += g.advanceWidth * scale; return path;
  }).join('');
  // Outline at output-pixel size, matching the world label's painted contrast.
  return `<g fill="${color}"${outline ? ' stroke="#25362d" stroke-width="3" paint-order="stroke" stroke-linejoin="round"' : ''}>${paths}</g>`;
}
const annotations = [];
const label = (...args) => annotations.push(textPaths(...args));
async function addImage(input, x, y, width, height) {
  layers.push({ input: await sharp(input).resize(round(width), round(height), { fit: 'fill' }).png().toBuffer(), left: round(x), top: round(y) });
}
async function person(id, frameNumber, footX, footY, bodyHeight) {
  const atlas = JSON.parse(await readFile(`web/public/assets/character-cast/${id}.atlas.json`, 'utf8'));
  const page = atlas.textures.find(page => page.frames.some(frame => frame.filename === String(frameNumber)));
  const frame = page.frames.find(frame => frame.filename === String(frameNumber));
  const f = frame.frame, s = frame.spriteSourceSize, source = frame.sourceSize;
  const scale = bodyHeight / (71 * source.h / 96);
  const input = await sharp(`web/public/assets/character-cast/${page.image.split('?')[0]}`).extract({ left: f.x, top: f.y, width: f.w, height: f.h }).png().toBuffer();
  const shadow = `<svg width="${W * D}" height="${H * D}" viewBox="0 0 ${W} ${H}"><ellipse cx="${footX + 2}" cy="${footY + 2}" rx="14" ry="4" fill="#4f5b53" opacity=".24"/></svg>`;
  layers.push({ input: Buffer.from(shadow), left: 0, top: 0 });
  await addImage(input, footX + (s.x - source.w / 2) * scale, footY + (s.y - source.h * .9) * scale, f.w * scale, f.h * scale);
  return source.w * scale;
}
async function prompt(x, y, spriteWidth, touch) {
  const layout = interactionPromptLayout(measure('Sprechen', 12), spriteWidth);
  const directory = 'web/public/assets/ui/world-prompt-v2-';
  await addImage(`${directory}tab.webp`, x + layout.tabX - layout.tabWidth / 2, y + layout.tabY - 12, layout.tabWidth, 24);
  await addImage(`${directory}${touch ? 'touch' : 'keycap'}.webp`, x + layout.keyX - layout.keySize / 2, y + layout.keyY - layout.keySize / 2, layout.keySize, layout.keySize);
  label('Sprechen', x + layout.tabX, y + layout.tabY, 12, sans, '#302b21', true);
  if (!touch) label('E', x + layout.keyX, y + layout.keyY, 12, bold, '#302b21', true);
  return layout;
}

label('Interaction prompt v2', 24, 30, 26, title);
label('Offline composite · real town painting + component-kit characters + runtime WebP sprites', 24, 62, 14);
const panelWidth = 552, panelHeight = 410, panelTop = 112;
const town = await sharp('web/public/assets/lindenhafen.webp').extract({ left: 420, top: 280, width: panelWidth, height: panelHeight }).png().toBuffer();
for (const [left, touch, bodyHeight] of [[24, false, 80], [624, true, 60]]) {
  label(touch ? 'Touch · phone scale · no key letter' : 'Keyboard · player directly below NPC', left, 92, 15, bold);
  await addImage(town, left, panelTop, panelWidth, panelHeight);
  const x = left + 278, footY = panelTop + 270;
  const spriteWidth = await person('marta', 0, x, footY, bodyHeight);
  // The player is deliberately in front of the NPC, overlapping the old feet-prompt position.
  await person('otto', 0, x, footY + 40, bodyHeight);
  const nameY = footY - bodyHeight - 12, nameCanvasHeight = 22;
  const layout = interactionPromptLayout(measure('Sprechen', 12), spriteWidth);
  await prompt(x, nameY - nameCanvasHeight / 2 - 4 - layout.height / 2, spriteWidth, touch);
  label('Marta', x, nameY, 13, title, '#ffffff', true, true);
  // The offline Fraunces parser has no fallback for the diamond glyph.
  const diamond = `M${x - 31} ${nameY - 5}l4 5-4 5-4-5Z`;
  annotations.push(`<path d="${diamond}" fill="#4f5b53" stroke="#68563c" stroke-width="3"/><path d="${diamond}" fill="none" stroke="#ffe3a3" stroke-width="1.2"/>`);
  label('Alex', x, footY + 40 - bodyHeight - 12, 13, title, '#ffffff', true, true);
  label(`Adult ≈ ${bodyHeight} CSS px · prompt ${Math.round(layout.width)} × ${layout.height} px`, left + 12, panelTop + panelHeight - 17, 12, bold, '#ffffff', false, true);
}

label('Alpha / small-size inspection', 24, 551, 17, title);
// Each asset appears at native 2× density over light and dark fields.
for (const [x, background] of [[24, '#e9d7a6'], [420, '#4f5b53']]) {
  layers.push({ input: Buffer.from(`<svg width="720" height="136"><rect width="720" height="136" rx="8" fill="${background}"/></svg>`), left: round(x), top: round(574) });
  await addImage('web/public/assets/ui/world-prompt-v2-keycap.webp', x + 16, 584, 48, 48);
  await addImage('web/public/assets/ui/world-prompt-v2-tab.webp', x + 86, 584, 144, 48);
  await addImage('web/public/assets/ui/world-prompt-v2-touch.webp', x + 276, 584, 48, 48);
}
label('Above the name', 836, 586, 16, bold);
label('24 px desktop row · 12 px DM Sans', 836, 613, 13);
label('Narrow frames stack; text stays full size.', 836, 638, 13);
await prompt(940, 659, 65, false);
label('72 px desktop', 1000, 659, 12);
label('1 image pixel = 1 CSS pixel. Evidence is an offline composition, not a live game screenshot.', 24, 686, 13);

layers.push({ input: Buffer.from(`<svg width="${W * D}" height="${H * D}" viewBox="0 0 ${W} ${H}">${annotations.join('')}</svg>`), left: 0, top: 0 });
const composite = await sharp({ create: { width: W * D, height: H * D, channels: 4, background: '#f0e7d2' } }).composite(layers).png().toBuffer();
await sharp(composite).resize(W, H).png().toFile('art/ui/world-prompt-v2-proof.png');
console.log('art/ui/world-prompt-v2-proof.png: 1200×720, actual 80/60 CSS px adult scale, runtime layout and fonts.');
