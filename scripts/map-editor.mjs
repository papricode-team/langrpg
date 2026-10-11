#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import './register-content-loader.mjs';
import {toTiled,fromTiled} from './map-editor-format.mjs';
import {compileSceneDocument,saveSceneDocument} from './scene-compiler.mjs';
import {tiledSceneImages} from './map-editor-images.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'web/src/data/world-scenes.json');
const document=JSON.parse(await readFile(source,'utf8'));
const {maps}=await import('../web/src/maps.ts');
const [command,mapOrFile,destination]=process.argv.slice(2);
if(command==='check') {
  await compileSceneDocument(document);
  console.log(`All ${Object.keys(document.maps).length} canonical scenes have valid geometry, content and reachable interaction targets.`);
} else if(command==='export'||command==='export-all') {
  await compileSceneDocument(document);
  const ids=command==='export-all'?Object.keys(document.maps):[mapOrFile];
  if(command==='export'&&!destination)throw new Error('Usage: node scripts/map-editor.mjs export <mapId> <output.tmj>');
  for(const id of ids) {
    const scene=document.maps[id],content=maps.find(map=>map.id===id);
    if(!scene||!content)throw new Error(`Unknown scene ${id}`);
    const target=command==='export-all'?resolve(mapOrFile??'docs/maps',`${id}.tmj`):resolve(destination);
    const images=await tiledSceneImages(scene,content,root);
    const tiled=toTiled(id,document,{images,imagePath:asset=>relative(dirname(target),resolve(root,'web/public',asset.slice(1))).replaceAll('\\','/')});
    await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(tiled,null,2)+'\n');console.log(`Exported ${id} to ${target}`);
  }
} else if(command==='import') {
  if(!mapOrFile)throw new Error('Usage: node scripts/map-editor.mjs import <edited.tmj> [--legacy]');
  const edited=JSON.parse(await readFile(resolve(mapOrFile),'utf8'));
  let next;
  if(edited.properties?.find(value=>value.name==='navigationVersion')?.value===1) {
    if(destination!=='--legacy')throw new Error('Legacy v1 import requires --legacy; only the three original story-map exchanges are supported');
    const legacy=JSON.parse(await readFile(resolve(root,'web/src/data/world-navigation.json'),'utf8'));
    const imported=fromTiled(edited,legacy),id=edited.properties.find(value=>value.name==='mapId').value;
    next=structuredClone(document);
    const original=legacy.maps[id],update=imported.maps[id],current=next.maps[id];
    if(current.legacyOffset?.x||current.legacyOffset?.y)throw new Error('Legacy import needs zero core offset; use a v2 exchange');
    if(current.walkable.length<original.walkable.length||current.obstacles.length<original.obstacles.length)throw new Error('Legacy core geometry is no longer identifiable; use a v2 exchange');
    current.walkable=[...update.walkable,...current.walkable.slice(original.walkable.length)];
    current.obstacles=[...update.obstacles,...current.obstacles.slice(original.obstacles.length)];
    current.spawn=update.spawn;current.npcs=update.npcs;current.objects=update.objects;
  } else next=fromTiled(edited,document);
  const result=await saveSceneDocument(next);
  console.log(`Imported validated scene and compiled authority (${result.contentVersion}).`);
} else throw new Error('Usage: node scripts/map-editor.mjs check | export <mapId> <output.tmj> | export-all [directory] | import <edited.tmj> [--legacy]');
