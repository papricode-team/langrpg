#!/usr/bin/env node
/** Compose map cards from the same day textures, scales and pivots as the renderer. */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import './register-content-loader.mjs';
import {WEBP_QUALITY} from './webp-quality.mjs';
const {sceneDocument} = await import('../web/src/scene-data.ts');
const root = resolve(import.meta.dirname, '..'), out = resolve(root, 'web/public/assets');
const args = process.argv.slice(2);
for (const map of args.length ? args : Object.keys(sceneDocument.maps)) {
  const scene = sceneDocument.maps[map];
  if (!scene) throw Error(`Unknown scene ${map}`);
  // Painted-ground towns are captured by the real renderer; composing props on a flat backdrop would show a stale town.
  if (scene.ground) { console.log(`${map}: preview comes from scripts/capture-town-previews.mjs`); continue; }
  // Keep cards bounded, while preserving the world's aspect ratio and anchors.
  const cardScale = Math.min(1, 1536 / scene.width, 1024 / scene.height);
  const canvasWidth = Math.round(scene.width * cardScale), canvasHeight = Math.round(scene.height * cardScale);
  const placements = scene.scenery;
  const manifest = JSON.parse(await readFile(resolve(out, `${map}-day-animations.json`), 'utf8'));
  const atlases = new Map(), images = [];
  for (const tile of scene.terrain) {
    const asset = tile.dayPreviewAsset ?? tile.dayAsset;
    let terrain = sharp(resolve(root, 'web/public', asset.slice(1)));
    if (!tile.dayPreviewAsset && tile.dayCrop) {
      const {x:left,y:top,width,height} = tile.dayCrop;
      terrain = terrain.extract({left,top,width,height});
    }
    images.push({input:await terrain.resize(Math.round(tile.width*cardScale),Math.round(tile.height*cardScale)).png().toBuffer(),
      left:Math.round(tile.x*cardScale),top:Math.round(tile.y*cardScale)});
  }
  for (const spec of [...placements].sort((a, b) => (a.depth ?? a.y + 10.5) - (b.depth ?? b.y + 10.5))) {
    const name = spec.frame ?? spec.asset, entry = manifest.assets[name];
    const key = entry?.base?.key ?? entry?.key ?? `${map}-${spec.variant ? 'variations' : 'props'}`;
    if (!atlases.has(key)) atlases.set(key, JSON.parse(await readFile(resolve(out, `${key}.json`), 'utf8')));
    const frameName = entry?.base?.frame ?? entry?.frames[0] ?? name, rect = atlases.get(key).frames[frameName]?.frame;
    if (!rect) throw Error(`${map}/${name}: missing preview frame`);
    const scale = cardScale * spec.width / (entry?.base?.referenceWidth ?? entry?.referenceWidth ?? rect.w);
    const width = Math.round(rect.w * scale), height = Math.round(rect.h * scale);
    const originX = entry?.base?.originX ?? entry?.originX ?? .5;
    const left = Math.round(spec.x * cardScale - width * (spec.flipX ? 1 - originX : originX));
    const top = Math.round(spec.y * cardScale - height * (entry?.base?.originY ?? entry?.originY ?? 1));
    const cropLeft = Math.max(0, -left), cropTop = Math.max(0, -top);
    const cropWidth = Math.min(width - cropLeft, canvasWidth - Math.max(0, left)), cropHeight = Math.min(height - cropTop, canvasHeight - Math.max(0, top));
    if (cropWidth <= 0 || cropHeight <= 0) continue;
    let image = sharp(resolve(out, `${key}.webp`)).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).resize(width, height);
    if (spec.flipX) image = image.flop();
    const input = await sharp(await image.png().toBuffer()).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }).png().toBuffer();
    images.push({ input, left: Math.max(0, left), top: Math.max(0, top) });
  }
  await sharp({create:{width:canvasWidth,height:canvasHeight,channels:4,background:'#c6cdb9'}}).composite(images).webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(resolve(out, `${map}-preview.webp`));
  console.log(`${map}: preview ${canvasWidth}×${canvasHeight} uses canonical terrain, runtime stills and ground anchors`);
}
