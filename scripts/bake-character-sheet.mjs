#!/usr/bin/env node
/** Offline IO around the browser-independent recipe resolver and pixel compositor. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { characterCatalogue, catalogueForPose, catalogueForExpression, recipeErrors, resolveRecipe, avatarTextureKey } from '../web/src/character-recipe.mjs';
import { characterSheetPages } from '../web/src/character-sheets.mjs';
import { composeAtlas } from '../web/src/character-compositor.mjs';

export async function bakeCharacterSheet(recipe, { root = resolve(import.meta.dirname, '..'), out, editor = false, preview = false, poseSet = 'walk', catalogue = characterCatalogue, expression = catalogue.expression ?? 'neutral' } = {}) {
  if (!out) throw new Error('An output path is required');
  catalogue = catalogueForExpression(recipe, expression, catalogueForPose(poseSet, catalogue));
  const errors = recipeErrors(recipe, catalogue).filter(error => !preview || !error.startsWith('Missing required '));
  if (errors.length) throw new Error(`Invalid avatar: ${errors.join('; ')}`);
  const [width, height] = editor ? catalogue.format.editorCell : catalogue.format.runtimeCell;
  const resolved = ['down', 'right', 'up', 'left'].map(facing => resolveRecipe(recipe, facing, catalogue));
  const pieces = new Map(resolved.flatMap(result => result.layers.map(layer => [layer.id, layer]))), images = new Map();
  for (const piece of pieces.values()) for (const material of piece.materials) {
    for(const page of characterSheetPages(piece.sheets[material],editor?'editor':'runtime',[width,height])){
      const path=resolve(root,'web/public',catalogue.assetBase.replace(/^\//,''),page.path);
      const bytes=await readFile(path);
      if(createHash('sha256').update(bytes).digest('hex')!==page.sha256)throw new Error(`Stale or changed asset ${piece.id}.${material}`);
      const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if(info.width!==page.width||info.height!==page.height)throw new Error(`Malformed character page ${page.path}`);
      const image={data,width:info.width,height:info.height,firstFrame:page.firstFrame,frameCount:page.frameCount,columns:page.columns};
      for(let frame=page.firstFrame;frame<page.firstFrame+page.frameCount;frame++)images.set(`${piece.id}.${material}.${frame}`,image);
    }
  }
  const atlas = composeAtlas(resolved.map(result => result.layers), images, width, height);
  const encoded = await sharp(atlas.data, { raw: { width: atlas.width, height: atlas.height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
  const path = resolve(root, out); await mkdir(dirname(path), { recursive: true }); await writeFile(path, encoded);
  const report = { recipe, assetVersion: catalogue.assetVersion, recipeKey: avatarTextureKey(recipe, catalogue), ...(poseSet === 'walk' ? {} : {poseSet}), ...(expression === 'neutral' ? {} : {expression}), preview, frames: 36, cell: [width, height], sha256: createHash('sha256').update(encoded).digest('hex') };
  await writeFile(`${path}.json`, JSON.stringify(report, null, 2) + '\n');
  return { path, ...report };
}

export async function main(args = process.argv.slice(2), root = resolve(import.meta.dirname, '..')) {
  const i = args.indexOf('--out');
  if (!args[0] || i < 0 || !args[i + 1]) throw new Error('Usage: bake <recipe.json> --out <atlas.webp> [--editor] [--preview] [--pose-set walk] [--expression neutral]');
  const poseIndex = args.indexOf('--pose-set');
  if (poseIndex >= 0 && (!args[poseIndex + 1] || args[poseIndex + 1].startsWith('--'))) throw new Error('--pose-set needs a value');
  const expressionIndex = args.indexOf('--expression');
  if (expressionIndex >= 0 && (!args[expressionIndex + 1] || args[expressionIndex + 1].startsWith('--'))) throw new Error('--expression needs a value');
  const recipe = JSON.parse(await readFile(resolve(root, args[0]), 'utf8'));
  console.log(JSON.stringify(await bakeCharacterSheet(recipe, { root, out: args[i + 1], editor: args.includes('--editor'), preview: args.includes('--preview'), poseSet: poseIndex < 0 ? 'walk' : args[poseIndex + 1], expression: expressionIndex < 0 ? 'neutral' : args[expressionIndex + 1] })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
