#!/usr/bin/env node
/** Read-only scale, composition and exact runtime reachability audit. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';

const args=process.argv.slice(2);
if(args.length>2)throw Error('Usage: map-scale-audit.mjs [root] [town]');
const root=resolve(args[0]??process.cwd());
await import(pathToFileURL(resolve(root,'scripts/register-content-loader.mjs')).href);
const moduleAt=path=>import(pathToFileURL(resolve(root,path)).href);
const {sceneDocument}=await moduleAt('web/src/scene-data.ts');
const {createMapNavigation}=await moduleAt('web/src/navigation.ts');
const {getSceneryGeometry,sceneEntrancePoint,PERSON_HEIGHT}=await moduleAt('web/src/scene-schema.ts');
const {auditSceneQuality}=await moduleAt('scripts/scene-quality.mjs');
const ids=args[1]?[args[1]]:['lindenhafen','waldruh','nebelstadt'];
const reports=[];
for(const id of ids){
  const scene=sceneDocument.maps[id];
  if(!scene)throw Error(`Unknown active town ${id}`);
  const manifest=JSON.parse(await readFile(resolve(root,`web/public/assets/${id}-day-animations.json`),'utf8'));
  const quality=auditSceneQuality(scene,manifest);
  const grid=createMapNavigation(id),reachability=grid.auditReachability(scene.spawn);
  const {unreachablePoints,...navigation}=reachability;
  const entrances=(scene.entrances??[]).map(entrance=>{
    const owner=scene.scenery.find(item=>item.id===entrance.ownerId);
    const geometry=getSceneryGeometry(id,owner),scale=geometry?owner.width/geometry.referenceWidth:0;
    return {id:entrance.id,ownerId:owner.id,doorHeight:geometry?.door?geometry.door.height*scale:0,
      doorHeightPersons:geometry?.door?geometry.door.height*scale/PERSON_HEIGHT:0,
      approach:sceneEntrancePoint(scene,entrance),return:sceneEntrancePoint(scene,entrance,true)};
  });
  reports.push({id,width:scene.width,height:scene.height,scenery:scene.scenery.length,
    ...quality,navigation,unreachablePoints,connectedArea:grid.auditConnectedArea(scene.spawn).connectedArea,entrances});
}
console.log(JSON.stringify({method:'Native reference pixels per world unit; authored chunk density; 6-unit walkable samples connected through exact runtime segment checks.',maps:reports},null,2));
