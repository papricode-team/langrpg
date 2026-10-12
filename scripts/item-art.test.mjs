import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createItemArtPlan } from './item-art-plan.mjs';
import { synthesizeMiniGameSfx, minigameSfxNames } from './generate-minigame-sfx.mjs';
import { minigameAudioJobs } from './minigame-audio-content.mjs';
import { encodeMonoPcmWav } from './world-audio-synthesis.mjs';

test('art plan names 181 real concrete course nouns with one visual identity each',async()=>{
  const plan=await createItemArtPlan(),frames=plan.sheets.flatMap(sheet=>sheet.frames),nouns=frames.filter(frame=>frame.lexemeId);
  assert.equal(nouns.length,181);assert.equal(new Set(nouns.map(frame=>frame.lexemeId)).size,181);
  assert.equal(frames.length,208);assert.ok(plan.sheets.every(sheet=>sheet.frames.length===16));
  for(const id of ['kaffee','buch','zug','fahrkarte','bahnsteig','schluessel'])assert.ok(nouns.some(frame=>frame.lexemeId===`${id}-noun`));
  assert.notEqual(nouns.find(frame=>frame.lexemeId==='apfel-noun').subject,nouns.find(frame=>frame.lexemeId==='tomate-noun').subject);
});
test('foley exports are deterministic, finite, distinct, and taper to silence',()=>{
  const hashes=new Set();
  for(const name of minigameSfxNames){
    const samples=synthesizeMiniGameSfx(name);assert.ok(samples.length>=2205);assert.ok(samples.every(Number.isFinite));
    assert.ok(Math.abs(samples.at(-1))<.01);assert.deepEqual(samples,synthesizeMiniGameSfx(name));
    const wav=encodeMonoPcmWav(samples);assert.equal(wav.toString('ascii',0,4),'RIFF');
    const hash=createHash('sha256').update(wav).digest('hex');assert.ok(!hashes.has(hash));hashes.add(hash);
  }
  assert.throws(()=>synthesizeMiniGameSfx('unknown'),/Unknown/);
});

test('spoken instructions cover each expedition brief in all three levels',async()=>{
  const jobs=await minigameAudioJobs();assert.equal(new Set(jobs.map(job=>job.id)).size,jobs.length);
  assert.ok(jobs.every(job=>job.text.trim()&&/^[a-z0-9_-]+$/.test(job.id)));
  assert.equal(jobs.filter(job=>job.id.startsWith('expedition-')&&job.id.includes('-brief-')).length,30);
  assert.ok(jobs.some(job=>job.id==='minigame-tray-tea-bread'));
  assert.equal(jobs.filter(job=>job.id.startsWith('expedition-')&&!job.id.includes('-brief-')).length,180);
  assert.equal(jobs.filter(job=>job.id.startsWith('story-')).length,31);
});
