import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {toTiled} from './map-editor-format.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=new URL('../web/src/data/world-navigation.json',import.meta.url);
test('CLI rejects unreachable or unregistered imports before touching canonical runtime data',async()=>{
  const original=await readFile(source,'utf8'),document=JSON.parse(original);
  const directory=await mkdtemp(join(tmpdir(),'lantern-map-import-'));
  try {
    for(const kind of ['unreachable','unregistered']) {
      const edited=toTiled('lindenhafen',document);
      const npc=edited.layers.find(layer=>layer.name==='NPCs').objects[0];
      if(kind==='unreachable'){npc.x=2;npc.y=2;}
      else npc.properties.find(property=>property.name==='key').value='unregistered-test-character';
      const path=join(directory,`${kind}.tmj`);
      await writeFile(path,JSON.stringify(edited));
      const result=spawnSync(process.execPath,['scripts/map-editor.mjs','import',path],{cwd:root,encoding:'utf8'});
      assert.notEqual(result.status,0);
      assert.match(result.stderr,kind==='unreachable'?/no reachable interaction approach/:/no authored content/);
      assert.equal(await readFile(source,'utf8'),original);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
