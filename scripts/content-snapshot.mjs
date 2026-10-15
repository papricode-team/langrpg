#!/usr/bin/env node
/**
 * Legacy importer: rebuilds content/source.json from the retained TypeScript authoring modules. Quests,
 * characters and chapters are no longer kept in TypeScript; they are carried over from source.json itself.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
async function moduleAt(path, bindings = {}, exports = []) {
  const source = (await readFile(resolve(root, path), 'utf8')).replace(/^import .*;.*$/gm, '')+(exports.length?`\nexport {${exports.join(',')}};`:'');
  const prefix = Object.entries(bindings).map(([key, value]) => `const ${key}=${typeof value === 'function' ? value.toString() : JSON.stringify(value)};`).join('\n');
  const compiled = stripTypeScriptTypes(prefix + source, { mode:'strip' });
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const content = await import('./content-source.mjs');
const course = await read('web/src/data/course-meta.json');
const exerciseParts = await Promise.all(['a1','a2','b1'].map(level => read(`web/src/data/course-exercises-${level}.json`)));
course.exercises = exerciseParts.flatMap(part => part.exercises.map((exercise, index) => ({ exercise, index: part.indices[index] }))).sort((a,b) => a.index-b.index).map(row=>row.exercise);
const graphs = await read('web/src/data/dialogue-graphs.json'), storyText = await read('web/src/data/story-text.json');
const story = await moduleAt('web/src/story.ts', { storyText });
const expeditions = await moduleAt('web/src/expeditions.ts');
const interiors = await moduleAt('web/src/interiors.ts', { npcs: content.npcs, quests: content.quests });
const npcs = await moduleAt('web/src/npc-dialogue.ts', { conditionMet: () => false });
const greetings = [];
const states = [{}, { 'quest:b1-work': true }, { 'quest:a2-archive':true }];
for (const npc of content.npcs) for (const level of ['A1','A2','B1']) for (const flags of states) {
  // Conditions are retained in the exported callbacks; no content is reviewed here.
  const state = { flags, reputation:{lamplighters:3,unwritten:3,brassOffice:0}, inventory:[], bell:0, day:1, nodes:{}, choices:{}, inspections:{} };
  // residentConversation uses conditionMet; evaluate the base lines with all callbacks removed.
  try {
    greetings.push(...npcs.residentConversation(npc, level, state).map(line=>({...line,...(npc.id==='inspector'?{when:flags['quest:b1-work']?{flag:'quest:b1-work'}:{withoutFlag:'quest:b1-work'}}:npc.id==='ada'?{when:flags['quest:a2-archive']?{flag:'quest:a2-archive'}:{withoutFlag:'quest:a2-archive'}}:{}),...(line.id.endsWith('-1')?{when:{faction:['otto','marta'].includes(npc.id)?'lamplighters':'unwritten',minimum:3}}:{})})));
  } catch { /* Literal callbacks are exported below. */ }
  for (const title of ['Lantern Bearer','Lamplighter','Route Keeper','Atlas Keeper']) { const line=npcs.earnedTitleGreeting(npc,title); if(line)greetings.push({...line,title}); }
}
const miniGames = await moduleAt('web/src/minigames/catalogue.ts');
const activities = await moduleAt('web/src/activity-stories.ts');
const beginner = await moduleAt('web/src/beginner-dialogue.ts');
const grammar = await moduleAt('web/src/contextual-grammar.ts');
const engine = await moduleAt('web/src/activity-engine.ts',{quests:content.quests});
const plans = await moduleAt('web/src/expedition-games.ts');
const lexical = await moduleAt('web/src/i18n-lexical.ts');
const routines = await moduleAt('web/src/world-routines.ts');
const cinemas = await moduleAt('web/src/cinematic-content.ts');
const maps = await moduleAt('web/src/maps.ts');
const conversations = await moduleAt('web/src/interior-conversations.ts');
const wordFacts = await moduleAt('web/src/word-detail.ts',{},['interiorMeanings','extraInteriorExamples']);
const storyPanels = await moduleAt('web/src/story-panels.ts');
const learningContext = await moduleAt('web/src/learning-context.ts');
const cinematicRows=[];
for(const mapId of ['lindenhafen','waldruh','nebelstadt'])for(const kind of ['arrival','platform','recording','erasure','clockmill','confession','dark-beam','ledger','storm','bell','travel'])for(const ending of kind==='bell'?[undefined,...cinemas.endingIds]:[undefined])cinematicRows.push({kind,mapId,...(ending?{ending}:{}),beats:cinemas.cinematicBeats(kind,mapId,ending)});
const overlays = await Promise.all(['tr-story','tr-course','tr-ui'].map(name => read(`web/src/data/i18n/${name}.json`)));
const translate = (source,vars) => (overlays[2][source] ?? source).replace(/\{(\w+)\}/g,(match,key)=>vars?.[key] ?? match);
const lexicalTranslations=new Map(Object.values(overlays[1].lexicon).map(value=>[value.en,value.tr]));
for(const exercise of course.exercises) {
  const text=lexical.generatedLexicalExerciseText(exercise,overlays[1].lexicon,translate);
  if(text)overlays[1].exercises[exercise.id]={german:exercise.german,source:Object.fromEntries(['prompt','hint','explanation','english'].map(key=>[key,exercise[key]])),tr:text,...(exercise.options?{options:Object.fromEntries(exercise.options.map(option=>[option,lexical.generatedLexicalOption(option,lexicalTranslations,translate)??option]))}:{})};
}
const files = { curriculum:'curriculum.json',course:'course.json',syllabus:'syllabus.json',storyRules:'story_rules.json',expeditions:'expeditions.json',expeditionLearning:'expedition_learning.json',minigames:'minigame_stories.json',activityBoards:'activity_boards.json' };
const legacyServer = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([kind, path]) => [kind, await read(`server/${path}`)])));
const snapshot = { version:1,npcs:content.npcs,chapters:content.chapters,quests:content.quests,course,graphs,storyText,journalNarratives:story.journalNarratives,ambientCallbacks:npcs.ambientCallbacks,greetings:[...new Map(greetings.map(line=>[line.id+line.german,line])).values()],npcRoutines:routines.npcRoutines,cinematics:cinematicRows,storyMaps:maps.storyMaps,interiors:interiors.interiors,expeditionRegions:expeditions.expeditionRegions,expeditionGames:plans.expeditionGames,activityDefinitions:engine.activityDefinitions,activityScenarios:engine.activityScenarios,inventory:engine.inventory,activityDiscoveries:activities.activityDiscoveries,beginnerGateTranslations:beginner.beginnerGateTranslations,greetingMeanings:beginner.greetingMeanings,contextualGrammar:Object.fromEntries(content.quests.map(quest=>[quest.id,grammar.grammarForQuest(quest.id)])),miniGameDefinitions:miniGames.miniGameDefinitions,miniGameScripts:await read('web/src/minigames/story-scripts.json'),miniGameAudio:await read('web/src/minigames/audio-data.json'),audioManifest:await read('web/public/audio/manifest.json'),loopData:await read('web/src/minigames/loop-data.json'),overlays:{story:overlays[0],course:overlays[1],ui:overlays[2]},legacyServer };
await mkdir(resolve(root,'content'),{recursive:true});
snapshot.interiorConversations=conversations.interiorConversations;
snapshot.interiorWordFacts={meanings:wordFacts.interiorMeanings,examples:wordFacts.extraInteriorExamples};
snapshot.specialItems=storyPanels.specialItems;
snapshot.storyEndings=storyPanels.endings;
snapshot.placement={exerciseIds:learningContext.placementExerciseIds,dialogue:learningContext.placementDialogue};
await writeFile(resolve(root,'content/source.json'),JSON.stringify(snapshot)+'\n');
console.log(`Imported ${snapshot.quests.length} quests, ${course.exercises.length} exercises and ${graphs.length} graphs into server-owned authoring source.`);
