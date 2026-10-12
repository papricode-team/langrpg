import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {authoredStoryScripts as data,writeAuthoredStoryScripts} from './author-minigame-stories.mjs';

const byId=new Map(data.exercises.map(row=>[row.id,row]));
const lexicon=JSON.parse(await readFile(new URL('../web/src/data/course-meta.json',import.meta.url),'utf8')).lexicon;
const syllabus=JSON.parse(await readFile(new URL('../web/src/data/syllabus.json',import.meta.url),'utf8'));
const known=new Set(lexicon.map(word=>word.id));

test('each authored decision is bound to its story and syllabus target, with supporting words gated',()=>{
  assert.equal(data.exercises.length,32);assert.equal(byId.size,32);
  assert.deepEqual(Object.fromEntries(Object.keys(data.games).map(id=>[id,data.exercises.filter(row=>row.miniGameId===id).length])),{'lost-hour':12,'seed-packets':15,'17-59':5});
  for(const row of data.exercises){
    const game=data.games[row.miniGameId];assert.equal(row.contentId,game.contentId);assert.equal(row.level,'A2');assert.equal(row.questId,game.questId);
    assert.equal(row.itemId,`word-${row.targetWordId}`);assert(row.wordIds.includes(row.targetWordId));assert(row.wordIds.every(id=>known.has(id)&&game.requiredWordIds.includes(id)),row.id);
    assert(syllabus.quests.find(quest=>quest.questId===row.questId).wordIds.includes(row.targetWordId),row.id);
  }
  assert(data.games['lost-hour'].requiredWordIds.length>12);
  assert(!data.games['seed-packets'].requiredWordIds.includes('celsius-name'));
  assert(!data.games['seed-packets'].requiredWordIds.includes('gramm-noun'));
});

test('the twelve perfect-tense dependency cards bind to twelve five-minute placements without printing their answers',()=>{
  const events=data.games['lost-hour'].events;assert.equal(events.length,12);
  assert(events[0].german.startsWith('Zuerst '));assert(events.at(-1).german.startsWith('Schließlich '));
  for(const [index,event]of events.entries()){
    const row=byId.get(event.exerciseId);assert.equal(row.mode,'recognition');assert.equal(row.answer,`23:${String(index*5).padStart(2,'0')}`);
    assert.match(event.german,/\b(?:habe|hat)\b/);assert(!/23:\d\d/.test(event.german));
    if(index)assert(row.explanation.includes(events[index-1].german));
  }
});

test('twelve fictional memory packets lead to three actual production addresses',()=>{
  const game=data.games['seed-packets'];assert.equal(game.packets.length,12);assert.equal(game.addresses.length,3);
  assert.equal(new Set(game.packets.map(packet=>packet.sprite)).size,12);
  for(const packet of game.packets){const row=byId.get(packet.exerciseId);assert.equal(row.answer,packet.id);assert.equal(row.mode,'recognition');assert(game.addresses.some(address=>address.id===packet.addressId));}
  for(const address of game.addresses){const row=byId.get(address.exerciseId);assert.equal(row.mode,'production');assert.equal(row.answer,address.text);assert.equal(game.packets.filter(packet=>packet.addressId===address.id).length,4);}
  assert.match(game.brief,/memory markers/);
});

test('the live timetable preserves the17:59 trap and gives exactly one viable later Waldruh ticket',()=>{
  const game=data.games['17-59'];assert.equal(game.arrival,'18:00');assert.equal(game.announcements.length,4);assert.equal(game.tickets.length,4);
  assert.deepEqual(game.announcements.map(row=>row.targetWordId),['fahren-verb','nicht-adv','nach-prep','anschluss-noun']);
  for(const row of game.announcements){const exercise=byId.get(row.exerciseId);assert.equal(exercise.mode,'listening');assert.equal(exercise.answer,[row.fields.time,row.fields.platform,row.fields.destination,row.fields.status].join('|'));}
  const valid=game.tickets.filter(ticket=>{const announcement=game.announcements.find(row=>row.id===ticket.announcementId);return announcement.fields.destination===game.destination&&announcement.fields.status==='fährt'&&announcement.fields.time>game.arrival;});
  assert.deepEqual(valid.map(ticket=>ticket.id),['ticket-uhr']);assert.equal(byId.get(game.ticketExerciseId).answer,'ticket-uhr');
  assert.equal(game.tickets[0].time,'18:00');assert.equal(game.announcements[0].fields.time,'17:59');
});

test('speech jobs follow the exact authored cue text and generated client/server copies are current',async()=>{
  assert.equal(data.audio.length,31);assert.equal(new Set(data.audio.map(row=>row.id)).size,31);
  const cues=[...data.games['lost-hour'].events,...data.games['seed-packets'].packets,...data.games['seed-packets'].addresses,...data.games['17-59'].announcements];
  for(const cue of cues){const job=data.audio.find(row=>row.path===cue.audio);assert(job);assert.equal(job.text,cue.spoken??cue.german);assert.equal(job.path,`/audio/${job.id}.mp3`);}
  await writeAuthoredStoryScripts({check:true});
  assert.equal(await readFile(new URL('../web/src/minigames/story-scripts.json',import.meta.url),'utf8'),await readFile(new URL('../server/minigame_stories.json',import.meta.url),'utf8'));
});

test('freshness validation rejects a changed canonical copy without rewriting it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-story-check-'));
  try{
    await mkdir(join(root,'web/src/minigames'),{recursive:true});await mkdir(join(root,'server'),{recursive:true});
    await writeAuthoredStoryScripts({root});await writeAuthoredStoryScripts({check:true,root});
    const path=join(root,'server/minigame_stories.json'),stale='{ "stale": true }\n';await writeFile(path,stale);
    await assert.rejects(writeAuthoredStoryScripts({check:true,root}),/Stale authored story script: server/);assert.equal(await readFile(path,'utf8'),stale);
  }finally{await rm(root,{recursive:true,force:true});}
});
