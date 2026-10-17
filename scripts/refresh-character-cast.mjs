/** Reuse unchanged native bakes; changed resolved inputs always get a new bake. */
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {Worker} from 'node:worker_threads';
import {totalmem} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bakeNativeCastVariant,castSourceSignature,castBakeArtifactsCurrent,indoorCastIds} from './character-cast.mjs';
import {characterCastEncodingId} from './character-cast-encoding.mjs';
import {avatarTextureKey,catalogueForPose} from '../web/src/character-recipe.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const ROOT=resolve(import.meta.dirname,'..');

/** A newly authored identity has a recipe but no previous bake to reuse. */
export async function planCastRefresh(entry,poseSet,catalogue,{root=ROOT}={}) {
  const name=poseSet==='walk'?entry.id:`poses/${poseSet}/${entry.id}`,path=`web/public/assets/character-cast/${name}.json`;
  const recipe=await json(resolve(root,`art/source/character-kit/cast/${entry.id}.json`));
  let report;
  try {report=await json(resolve(root,path));}
  catch(error) {if(error.code!=='ENOENT')throw error;report=null;}
  const currentInputs=castSourceSignature(recipe,catalogue,poseSet);
  const nativeExpected=poseSet==='walk'&&(await indoorCastIds()).has(entry.id);
  const reusable=report!==null&&Boolean(report.native)===nativeExpected&&await castBakeArtifactsCurrent(report,{root,sourceComponentsSha256:currentInputs,encodingId:characterCastEncodingId});
  return {path,recipe,report,currentInputs,reusable};
}

export async function refreshCharacterCast() {
const frozen='art/source/character-kit/cast/component-catalogue.json';
const previous=await json(frozen),next=await json('server/character-kit.json'),source=await json('art/source/character-kit/cast/catalogue.json');
if(next.format.runtimeCell.join()!==previous.format.runtimeCell.join()||next.format.editorCell.join()!==previous.format.editorCell.join())throw Error('Resolution changed: rebuild the complete cast explicitly');
const jobs=[];let reused=0;
for(const entry of source.entries)for(const poseSet of ['walk',...Object.keys(entry.poses??{})]){
  const {path,report,recipe,currentInputs,reusable}=await planCastRefresh(entry,poseSet,next);
  if(!reusable){jobs.push({entry,poseSet});continue;}
  if(previous.assetVersion!==next.assetVersion)report.componentRevisionRebind={from:previous.assetVersion,to:next.assetVersion,unchangedResolvedInputsSha256:currentInputs};
  report.assetVersion=next.assetVersion;report.sourceComponentsSha256=currentInputs;
  if(poseSet==='walk')report.native=await bakeNativeCastVariant(entry,{componentCatalogue:next});
  await writeFile(path,JSON.stringify(report,null,2)+'\n');
  for(const [sidecar,sha256] of [[`${report.atlas}.json`,report.atlasSha256],[`${report.proof.replace(/\.png$/,'.webp')}.json`,report.editorSha256]]){
    const meta=await json(sidecar);meta.assetVersion=next.assetVersion;meta.recipeKey=avatarTextureKey(recipe,catalogueForPose(poseSet,next));meta.sha256=sha256;
    if(sidecar.startsWith('web/')){meta.atlas=report.geometry;meta.textureBytes=report.textureBytes;}
    await writeFile(sidecar,JSON.stringify(meta,null,2)+'\n');
  }
  reused++;
}
sharp.cache(false);sharp.concurrency(2);let baked=0;const failures=[];
const concurrency=totalmem()>=24*1024**3?4:2;
await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},(_,index)=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./character-cast-bake-worker.mjs',import.meta.url),{workerData:{catalogue:next,jobs:jobs.filter((_,i)=>i%concurrency===index)}});
  worker.on('message',result=>{if(result.error){failures.push(result);console.error(JSON.stringify(result));}else console.log(JSON.stringify({baked:++baked,...result}));});
  worker.on('error',reject);worker.on('exit',code=>code?reject(Error(`Cast worker exited ${code}`)):resolve());
})));
if(failures.length)throw Error(JSON.stringify(failures));
await writeFile(frozen,JSON.stringify(next,null,2)+'\n');
console.log(JSON.stringify({reused,baked,assetVersion:next.assetVersion}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)refreshCharacterCast().catch(error=>{console.error(error);process.exitCode=1;});
