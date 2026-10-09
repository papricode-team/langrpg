#!/usr/bin/env node
/** Rectangular export of ImageGen-authored transparent assets. Source alpha stays intact. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roles = ['archive','cafe','station','workshop','house','tree','cypress','lamp','stall','fountain','arch','greenhouse','boat','bench','planter','sign'];
const regions = process.argv.slice(2);
for (const map of regions.length ? regions : ['lindenhafen','waldruh','nebelstadt']) {
  if (!['lindenhafen','waldruh','nebelstadt'].includes(map)) throw new Error(`Unknown region ${map}`);
  const source = await readFile(resolve(root, `art/source/${map}-props.png`));
  const meta = await sharp(source).metadata();
  if (!meta.hasAlpha) throw new Error(`${map}: transparent source required`);
  const boxes = JSON.parse(await readFile(resolve(root, `art/source/${map}-props-crops.json`), 'utf8'));
  const frames = {}, images = [];
  let x = 2, y = 2, rowHeight = 0;
  for (const role of roles) {
    const box = boxes[role];
    if (!box || box.left < 0 || box.top < 0 || box.left + box.width > meta.width || box.top + box.height > meta.height) throw new Error(`${map}: invalid ${role} crop`);
    // Size is proportional; each instance specifies its physical displayed width.
    const scale = Math.min(1, 360 / Math.max(box.width, box.height));
    const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
    const pixels = await sharp(source).extract(box).resize(width, height).ensureAlpha().raw().toBuffer();
    let transparent = 0, opaque = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparent++;
      if (pixels[offset] > 128) opaque++;
    }
    if (transparent < width * height * .03 || opaque < 10) throw new Error(`${map}: ${role} is not isolated transparent artwork`);
    if (x + width + 2 > 1024) { x = 2; y += rowHeight + 4; rowHeight = 0; }
    frames[role] = { frame: { x, y, w: width, h: height }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height }, sourceSize: { w: width, h: height } };
    images.push({ input: await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer(), left: x, top: y });
    x += width + 4; rowHeight = Math.max(rowHeight, height);
  }
  const height = y + rowHeight + 2;
  if (height > 2048) throw new Error(`${map}: atlas exceeds 1024×2048`);
  const out = resolve(root, 'web/public/assets');
  await mkdir(out, { recursive: true });
  await sharp({ create: { width: 1024, height, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite(images).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(out, `${map}-props.webp`));
  await writeFile(resolve(out, `${map}-props.json`), JSON.stringify({ frames, meta: { image: `${map}-props.webp`, size: { w:1024,h:height }, scale:'1' } }, null, 2) + '\n');
  console.log(`${map}: 16 isolated frames → 1024×${height} atlas`);
}

// Static UI previews are exports of the same placement lists, not source-map
// paintings. Runtime exploration continues to place and animate each object.
const { default: ts } = await import('typescript');
for (const map of regions.length ? regions : ['lindenhafen','waldruh','nebelstadt']) {
  const source = await readFile(resolve(root, `web/src/placed-${map}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext } }).outputText;
  const exported = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const placements = exported[`${map}Placements`];
  const atlas = await readFile(resolve(root, `web/public/assets/${map}-props.webp`));
  const frames = JSON.parse(await readFile(resolve(root, `web/public/assets/${map}-props.json`), 'utf8')).frames;
  const variationAtlas = await readFile(resolve(root, `web/public/assets/${map}-variations.webp`));
  const variationFrames = JSON.parse(await readFile(resolve(root, `web/public/assets/${map}-variations.json`), 'utf8')).frames;
  const images = [];
  for (const spec of [...placements].sort((a,b)=>(a.depth ?? a.y+10.5)-(b.depth ?? b.y+10.5))) {
    const rect = (spec.variant ? variationFrames : frames)[spec.frame ?? spec.asset].frame;
    const width = Math.round(spec.width), height = Math.round(rect.h * spec.width / rect.w);
    const left = Math.round(spec.x-width/2), top = Math.round(spec.y-height);
    const cropLeft = Math.max(0,-left), cropTop = Math.max(0,-top);
    const cropWidth = Math.min(width-cropLeft,1536-Math.max(0,left));
    const cropHeight = Math.min(height-cropTop,1024-Math.max(0,top));
    if (cropWidth<=0||cropHeight<=0) continue;
    let image = sharp(spec.variant ? variationAtlas : atlas).extract({left:rect.x,top:rect.y,width:rect.w,height:rect.h}).resize(width,height);
    if (spec.flipX) image=image.flop();
    // A new pipeline commits the proportional resize before clipping map edges.
    const input = await sharp(await image.png().toBuffer()).extract({left:cropLeft,top:cropTop,width:cropWidth,height:cropHeight}).png().toBuffer();
    images.push({input,left:Math.max(0,left),top:Math.max(0,top)});
  }
  await sharp(resolve(root, `web/public/assets/${map}-terrain.webp`)).composite(images)
    .webp({quality:85,effort:4}).toFile(resolve(root, `web/public/assets/${map}-preview.webp`));
  console.log(`${map}: UI preview exported from ${placements.length} placed objects`);
}
