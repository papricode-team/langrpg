#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import './register-content-loader.mjs';
import {toTiled,fromTiled} from './map-editor-format.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'web/src/data/world-navigation.json');
const document=JSON.parse(await readFile(source,'utf8'));
const {parseMapNavigationDocument}=await import('../web/src/map-authoring.ts');
const {validateAuthoredReachability}=await import('../web/src/navigation.ts');
const {storyMaps}=await import('../web/src/maps.ts');
const validate=value=>{
  const parsed=parseMapNavigationDocument(value),errors=validateAuthoredReachability(parsed);
  for(const [id,map] of Object.entries(parsed.maps))for(const kind of ['npcs','objects']) {
    const registered=storyMaps.find(map=>map.id===id)?.[kind]??[];
    for(const point of map[kind])if(!registered.some(item=>item.id===point.id))errors.push(`${id}: ${kind} placement ${point.id} has no authored content`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return parsed;
};
const [command,mapOrFile,destination]=process.argv.slice(2);
if(command==='check') {validate(document);console.log('All three authored maps have valid geometry and reachable interaction targets.');}
else if(command==='export') {
  validate(document);if(!destination)throw new Error('Usage: node scripts/map-editor.mjs export <mapId> <output.tmj>');
  const target=resolve(destination);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(toTiled(mapOrFile,document),null,2)+'\n');console.log(`Exported ${mapOrFile} to ${target}`);
} else if(command==='import') {
  if(!mapOrFile)throw new Error('Usage: node scripts/map-editor.mjs import <edited.tmj>');
  const edited=JSON.parse(await readFile(resolve(mapOrFile),'utf8')),next=validate(fromTiled(edited,document));
  await writeFile(source,JSON.stringify(next,null,2)+'\n');console.log(`Imported validated geometry and placements into ${source}`);
} else throw new Error('Usage: node scripts/map-editor.mjs check | export <mapId> <output.tmj> | import <edited.tmj>');
