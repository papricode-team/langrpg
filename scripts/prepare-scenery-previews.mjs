#!/usr/bin/env node
/** Compose map cards from the same day textures, scales and pivots as the renderer. */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expeditionArt } from './expedition-art-plan.mjs';
const root = resolve(import.meta.dirname, '..'), out = resolve(root, 'web/public/assets');
const stories = ['lindenhafen', 'waldruh', 'nebelstadt'];
async function module(path) {
  const code = ts.transpileModule(await readFile(resolve(root, path), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const expeditions = await module('web/src/expeditions.ts');
const args = process.argv.slice(2);
for (const map of args.length ? args : [...stories, ...expeditionArt.map(region => region.id)]) {
  const placements = stories.includes(map) ? (await module(`web/src/placed-${map}.ts`))[`${map}Placements`] : expeditions.expeditionPlacements[map];
  const manifest = JSON.parse(await readFile(resolve(out, `${map}-day-animations.json`), 'utf8'));
  const atlases = new Map(), images = [];
  for (const spec of [...placements].sort((a, b) => (a.depth ?? a.y + 10.5) - (b.depth ?? b.y + 10.5))) {
    const name = spec.frame ?? spec.asset, entry = manifest.assets[name];
    const key = entry?.base?.key ?? entry?.key ?? `${map}-${spec.variant ? 'variations' : 'props'}`;
    if (!atlases.has(key)) atlases.set(key, JSON.parse(await readFile(resolve(out, `${key}.json`), 'utf8')));
    const frameName = entry?.base?.frame ?? entry?.frames[0] ?? name, rect = atlases.get(key).frames[frameName]?.frame;
    if (!rect) throw Error(`${map}/${name}: missing preview frame`);
    const scale = spec.width / (entry?.base?.referenceWidth ?? entry?.referenceWidth ?? rect.w);
    const width = Math.round(rect.w * scale), height = Math.round(rect.h * scale);
    const left = Math.round(spec.x - width * (entry?.base?.originX ?? entry?.originX ?? .5));
    const top = Math.round(spec.y - height * (entry?.base?.originY ?? entry?.originY ?? 1));
    const cropLeft = Math.max(0, -left), cropTop = Math.max(0, -top);
    const cropWidth = Math.min(width - cropLeft, 1536 - Math.max(0, left)), cropHeight = Math.min(height - cropTop, 1024 - Math.max(0, top));
    if (cropWidth <= 0 || cropHeight <= 0) continue;
    let image = sharp(resolve(out, `${key}.webp`)).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).resize(width, height);
    if (spec.flipX) image = image.flop();
    const input = await sharp(await image.png().toBuffer()).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }).png().toBuffer();
    images.push({ input, left: Math.max(0, left), top: Math.max(0, top) });
  }
  await sharp(resolve(out, `${manifest.terrain ?? `${map}-terrain`}.webp`)).composite(images).webp({ quality: 86, effort: 4 }).toFile(resolve(out, `${map}-preview.webp`));
  console.log(`${map}: preview uses runtime building stills and ground anchors`);
}
