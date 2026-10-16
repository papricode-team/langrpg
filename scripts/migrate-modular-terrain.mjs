#!/usr/bin/env node
import './register-content-loader.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const {editableTerrainFromScene}=await import('../web/src/modular-terrain.ts');
const {parseWorldSceneDocument}=await import('../web/src/scene-schema.ts');
const path='content/world-seed.json';
const document=parseWorldSceneDocument(JSON.parse(await readFile(path,'utf8')));
for(const scene of Object.values(document.maps))if(scene.kind!=='interior')scene.modularTerrain=editableTerrainFromScene(scene);
parseWorldSceneDocument(document);
await writeFile(path,JSON.stringify(document,null,2)+'\n');
console.log('Migrated terrain without moving scenery, story anchors or hazard boundaries.');
