import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {toTiled} from './map-editor-format.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=new URL('../web/src/data/world-scenes.json',import.meta.url);
test('legacy exchanges require explicit conversion opt-in',async()=>{
  const legacy=JSON.parse(await readFile(new URL('../web/src/data/world-navigation.json',import.meta.url),'utf8'));
  const directory=await mkdtemp(join(tmpdir(),'lantern-legacy-import-'));
  try {
    const path=join(directory,'legacy.tmj');await writeFile(path,JSON.stringify(toTiled('lindenhafen',legacy)));
    const original=await readFile(source,'utf8');
    const result=spawnSync(process.execPath,['scripts/map-editor.mjs','import',path],{cwd:root,encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/requires --legacy/);
    assert.equal(await readFile(source,'utf8'),original);
  }finally{await rm(directory,{recursive:true,force:true});}
});
