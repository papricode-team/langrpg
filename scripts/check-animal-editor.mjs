/** Exercise animal edits through the real publication worker; kept outside the unit suites. */
import './register-content-loader.mjs';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
const {parseWorldSceneDocument} = await import('../web/src/scene-schema.ts');
const {animalSpawns} = await import('../web/src/animal-spawns.ts');
const document = parseWorldSceneDocument(JSON.parse(await readFile(new URL('../content/world-seed.json', import.meta.url), 'utf8')));
const home = animalSpawns(document.maps.lindenhafen)[0];
const movedHome = animalSpawns(document.maps.lindenhafen)[1];
const item = {...home, id: 'lindenhafen-editor-check', species: 'cat', variant: 1};
const worker = spawn(process.execPath, ['scripts/admin-world-worker.mjs'], {stdio:['pipe','pipe','inherit']});
const lines = createInterface({input: worker.stdout})[Symbol.asyncIterator]();
assert.equal(JSON.parse((await lines.next()).value).ready, true);
let serial = 0;
async function request(value) {
  worker.stdin.write(JSON.stringify({id: ++serial, ...value}) + '\n');
  const line = await lines.next();
  assert.ok(!line.done, 'Worker exited before replying');
  return JSON.parse(line.value);
}
try {
  const added = await request({type:'apply', base:{key:'animal-check',document}, ops:[{kind:'placeAnimal',map:'lindenhafen',item}]});
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.bundle.document.maps.lindenhafen.animals.length, 13);
  const changed = await request({type:'apply',base:{key:added.key},ops:[{kind:'updateAnimal',map:'lindenhafen',id:item.id,species:'sheep',variant:2,x:movedHome.x,y:movedHome.y}]});
  assert.equal(changed.ok, true, JSON.stringify(changed));
  const saved = parseWorldSceneDocument(JSON.parse(JSON.stringify(changed.bundle.document)));
  assert.deepEqual(saved.maps.lindenhafen.animals.find(a=>a.id===item.id), {...item,species:'sheep',variant:2,x:movedHome.x,y:movedHome.y});
  const rejected = await request({type:'apply',base:{key:changed.key},ops:[{kind:'updateAnimal',map:'lindenhafen',id:item.id,x:-10}]});
  assert.equal(rejected.ok, false);
  const removed = await request({type:'apply',base:{key:'reloaded',document:saved},ops:[{kind:'removeAnimal',map:'lindenhafen',id:item.id}]});
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.equal(removed.bundle.document.maps.lindenhafen.animals.length, 12);
  console.log('Animal publication: place, species/variant change, serialized reload, invalid-home rejection and removal passed.');
} finally { worker.stdin.end(); worker.kill(); }
