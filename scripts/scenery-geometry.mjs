/** Compact runtime geometry is generated from the same manifests as the compiler. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=resolve(import.meta.dirname,'..');
const towns=['lindenhafen','waldruh','nebelstadt'];
const fields=['referenceWidth','footprint','sortLine','door'];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;

export function geometryFromManifest(manifest){
  return {assets:Object.fromEntries(Object.entries(manifest.assets??{}).map(([name,asset])=>[name,
    Object.fromEntries(fields.filter(field=>asset[field]!==undefined).map(field=>[field,asset[field]]))]))};
}

/** Report drift before a scene can validate against collision the runtime never sees. */
export function validateSceneryGeometry(town,manifest,snapshot){
  const expected=geometryFromManifest(manifest),actual=snapshot?.[town];
  if(JSON.stringify(stable(expected))===JSON.stringify(stable(actual)))return [];
  return [`${town}: runtime scenery geometry differs from its art manifest; run node scripts/scenery-geometry.mjs`];
}

export async function exportSceneryGeometry(root=projectRoot){
  const geometry={};
  for(const town of towns){
    const manifest=JSON.parse(await readFile(resolve(root,`web/public/assets/${town}-day-animations.json`),'utf8'));
    geometry[town]=geometryFromManifest(manifest);
  }
  const path=resolve(root,'web/src/data/scenery-geometry.json');
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(geometry,null,2)+'\n');
  return geometry;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await exportSceneryGeometry();
