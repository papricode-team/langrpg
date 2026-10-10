import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import './register-content-loader.mjs';
const runtime=await import('../web/src/course.ts');
const source=JSON.parse(await readFile(new URL('../web/src/data/course.json',import.meta.url),'utf8'));
test('bounded runtime course parts preserve canonical content and authored exercise order',async()=>{
  const metadataPath=new URL('../web/src/data/course-meta.json',import.meta.url);
  const metadata=JSON.parse(await readFile(metadataPath,'utf8'));
  const {exercises,...expectedMetadata}=source;
  assert.deepEqual(metadata,expectedMetadata);
  assert.ok((await stat(metadataPath)).size<3*1024*1024,'course metadata exceeds 3 MiB');
  assert.deepEqual(runtime.courseExercises,exercises);
  assert.deepEqual(runtime.courseLexicon,source.lexicon);
  assert.deepEqual(runtime.courseUnits,source.units);
  const indices=[];
  for(const level of ['A1','A2','B1']) {
    const path=new URL(`../web/src/data/course-exercises-${level.toLowerCase()}.json`,import.meta.url);
    const part=JSON.parse(await readFile(path,'utf8'));
    assert.equal(part.edition,source.edition);
    assert.equal(part.indices.length,part.exercises.length);
    assert.ok((await stat(path)).size<4*1024*1024,`${level} exercise data exceeds 4 MiB`);
    for(let index=0;index<part.exercises.length;index++) {
      assert.equal(part.exercises[index].level,level);
      assert.deepEqual(part.exercises[index],source.exercises[part.indices[index]]);
      indices.push(part.indices[index]);
    }
  }
  assert.deepEqual(indices.sort((a,b)=>a-b),source.exercises.map((_,index)=>index));
});
