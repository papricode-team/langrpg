/** Assemble and check one generated wardrobe component without publishing it. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assembleCroppedHD} from './character-kit-hd.mjs';

const root = resolve(import.meta.dirname, '..');
const id = process.argv[2];
const hd = 'art/source/character-kit/hd';
const cataloguePath = `${hd}/wardrobe-catalogue.json`;
const catalogue = JSON.parse(await readFile(resolve(root,cataloguePath)));
const entry = catalogue.entries.find(entry => entry.id === id && entry.status === 'candidate');
if (!entry) throw Error('Choose a candidate from the staged wardrobe catalogue');
const logs = resolve(root,'output/wardrobe-checks');
await mkdir(logs,{recursive:true});
for (const page of entry.authoring.pages) await readFile(resolve(root,page.path));
await assembleCroppedHD(id,entry.authoring.pages,{root});
function run(command,args=[]) {
  const result = spawnSync(process.execPath,['scripts/character-kit.mjs',command,id,'--catalogue',cataloguePath,...args],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  if (result.error) throw result.error;
  return result;
}
for (const command of ['lock','check']) {
  const result = run(command);
  await writeFile(resolve(logs,`${id}.${command}.log`),result.stdout+result.stderr);
  if (result.status !== 0) throw Error(`${id}: ${command} failed; inspect output/wardrobe-checks/${id}.${command}.log`);
}
const companions = [`face-soft-${entry.build}`,`hair-waves-${entry.build}`,`top-shirt-${entry.build}`,`bottom-straight-${entry.build}`,`footwear-boots-${entry.build}`].filter(partId => {
  const part = catalogue.entries.find(part => part.id === partId);
  return part && part.slot !== entry.slot && !entry.occupies?.includes(part.slot);
});
const proof = `art/proofs/character-kit-hd/${id}--wardrobe-review.png`;
const result = run('proof',['--with',companions.join(','),'--out',proof]);
await writeFile(resolve(logs,`${id}.proof.log`),result.stdout+result.stderr);
if (result.status !== 0) throw Error(`${id}: proof failed; inspect output/wardrobe-checks/${id}.proof.log`);
const report = JSON.parse(await readFile(resolve(root,proof.replace('.png','.json'))));
if (!report.valid) throw Error(`${id}: composed proof is invalid`);
console.log(`${id}: validated; visual review required at ${proof}`);
