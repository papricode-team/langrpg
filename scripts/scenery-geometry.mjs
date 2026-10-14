/** Compact runtime geometry is generated from the same manifests as the compiler. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import './register-content-loader.mjs';
const {buildingBounds}=await import('../web/src/building-spacing.ts');

const projectRoot=resolve(import.meta.dirname,'..');
const towns=['lindenhafen','waldruh','nebelstadt'];
const fields=['referenceWidth','footprint','sortLine','door'];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;

/** Native atlas dimensions take precedence over cached animation dimensions. */
export async function sceneryFrameSizes(manifests,readAtlas){
  const keys=[...new Set(manifests.flatMap(manifest=>Object.values(manifest.assets??{})
    .map(asset=>asset.base?.key??asset.key).filter(Boolean)))];
  return Object.fromEntries(await Promise.all(keys.map(async key=>{
    const atlas=await readAtlas(key);
    return [key,Object.fromEntries(Object.entries(atlas.frames??{}).map(([name,{frame}])=>[name,{width:frame.w,height:frame.h}]))];
  })));
}

export function geometryFromManifest(manifest,nightManifest,frameSizes){
  return {assets:Object.fromEntries(Object.entries(manifest.assets??{}).map(([name,asset])=>{
    const geometry=Object.fromEntries(fields.filter(field=>asset[field]!==undefined).map(field=>[field,asset[field]]));
    // Night crops can differ in size and resolution. Normalize both paintings
    // to the day geometry reference so every authoring path shares one envelope.
    const bounds=[asset,nightManifest?.assets?.[name]].filter(Boolean).map(period=>{
      const size=frameSizes?.[period.base?.key??period.key]?.[period.base?.frame??period.frames?.[0]];
      return buildingBounds({asset:name,x:0,y:0,width:asset.referenceWidth},size?{...period,...size}:period);
    }).filter(Boolean);
    if(bounds.length)geometry.visualBounds={
      left:Math.min(...bounds.map(bound=>bound.left)),top:Math.min(...bounds.map(bound=>bound.top)),
      right:Math.max(...bounds.map(bound=>bound.right)),bottom:Math.max(...bounds.map(bound=>bound.bottom)),
    };
    return [name,geometry];
  }))};
}

/** Report drift before a scene can validate against collision the runtime never sees. */
export function validateSceneryGeometry(town,manifest,snapshot,nightManifest,frameSizes){
  const expected=geometryFromManifest(manifest,nightManifest,frameSizes),actual=snapshot?.[town];
  if(JSON.stringify(stable(expected))===JSON.stringify(stable(actual)))return [];
  return [`${town}: runtime scenery geometry differs from its art manifest; run node scripts/scenery-geometry.mjs`];
}

export async function exportSceneryGeometry(root=projectRoot){
  const geometry={};
  for(const town of towns){
    const [manifest,nightManifest]=await Promise.all(['day','night'].map(async period=>
      JSON.parse(await readFile(resolve(root,`web/public/assets/${town}-${period}-animations.json`),'utf8'))));
    const frameSizes=await sceneryFrameSizes([manifest,nightManifest],async key=>
      JSON.parse(await readFile(resolve(root,`web/public/assets/${key}.json`),'utf8')));
    geometry[town]=geometryFromManifest(manifest,nightManifest,frameSizes);
  }
  const path=resolve(root,'web/src/data/scenery-geometry.json');
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(geometry,null,2)+'\n');
  return geometry;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await exportSceneryGeometry();
