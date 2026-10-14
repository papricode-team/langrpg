/** Authoring corpora belong in test tooling, never in the application import graph. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import * as contentModule from '../content';
import {seededShuffle} from '../game-shuffle';
import {installActivityContent,activityAudioJobs} from '../activity-engine';
import { installContentCatalog, installQuestExercises, type Quest, type NPC, type Chapter } from '../content';
import { installCourseMetadata, installLexemes, installCourseExercises, courseContextWordIds, courseActivityWordIds, courseNPCWordIds, type CourseExercise, type CourseLexeme, type CourseUnit, type CourseGrammar, type CourseSource } from '../course';
import * as courseModule from '../course';
import { installQuestGraph } from '../quest-graph';
import type { QuestGraph,DialogueLine } from '../dialogue';
import {installScriptedStoryData} from '../minigames/scripted-stories';
import {installStoryText,type StoryAct,type StoryClue} from '../story';
import {installPlacementDialogue} from '../learning-context';
import type { LanguageOverlay } from '../i18n';
import { installContextualGrammar, clearContextualGrammar, type ContextualGrammar } from '../contextual-grammar';
import { installBeginnerTranslations, clearBeginnerContent } from '../beginner-dialogue';
import { installCinematicContent, clearCinematicContent, cutsceneKinds, endingIds, type Beat, type CutsceneKind } from '../cinematic-content';
import type { MapId } from '../maps';
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../../content/source');
function authoredModule<T>(name:string):T {
  const values:Record<string,unknown>={};
  new Function('exports','require',transpileModule(readFileSync(resolve(sourceRoot,name),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(values,()=>({localizedGrammar:(guide:CourseGrammar)=>guide}));
  return values as T;
}
const grammarNotes=authoredModule<{notes:Record<string,Omit<ContextualGrammar,'clipId'>>}>('contextual-grammar.ts').notes;
const beginnerNotes=authoredModule<{beginnerGateTranslations:Record<string,readonly(readonly[string,string])[]>;greetingMeanings:Record<string,string>}>('beginner-dialogue.ts');
const cinematicNotes=authoredModule<{cinematicBeats(kind:CutsceneKind,mapId:MapId,ending?:string):readonly Beat[]}>('cinematic-content.ts');
function read<T>(name:string):T {return JSON.parse(readFileSync(resolve(sourceRoot,name),'utf8')) as T;}
const source=readFileSync(resolve(sourceRoot,'content.ts'),'utf8');
const authored:{quests:Quest[];npcs:NPC[];chapters:Chapter[]}={} as never;
new Function('exports',transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(authored);
const data=read<{edition:string;sources:CourseSource[];lexicon:CourseLexeme[];units:CourseUnit[];grammar:CourseGrammar[];exercises:CourseExercise[];contextWordIds:Record<string,string[]>;activityWordIds:Record<string,string[]>;npcWordIds:Record<string,string[]>;referenceCoverage:typeof courseModule.courseReferenceCoverage}>('course.json');
const fixtureLexemes = new Map<string, CourseLexeme>();
for (const word of data.lexicon) {
  const lemma = word.lemma.toLocaleLowerCase('de');
  if (!fixtureLexemes.has(lemma)) fixtureLexemes.set(lemma, word);
}
export const authoredTurkishOverlay:LanguageOverlay={ui:read('tr-ui.json'),story:read('tr-story.json'),course:read('tr-course.json')};
const rawStory=read<{acts:StoryAct[];clues:StoryClue[];objects:Parameters<typeof installStoryText>[0]['objects']}>('story-text.json');
const journalExports:{journalNarratives?:Parameters<typeof installStoryText>[0]['journal']}={};
new Function('exports','require',transpileModule(readFileSync(resolve(sourceRoot,'story.ts'),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(journalExports,()=>({default:rawStory}));
const tokens=(value:string)=>[...value.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)].map(match=>[match.index!,match.index!+match[0].length] as [number,number]);
function alignedFixture(line:DialogueLine):DialogueLine {
  const glossary:Record<string,string>={};
  const spans=tokens(line.german);
  spans.forEach(([start,end],index)=>{const surface=line.german.slice(start,end).toLocaleLowerCase('de');const word=fixtureLexemes.get(surface);if(word)glossary[index]=word.id;});
  const translated=Object.values(authoredTurkishOverlay.story).find(entry=>entry.de===line.german)?.tr;
  line.aligned={id:line.id,de:{text:line.german,tokens:spans},support:{en:{text:line.english,tokens:tokens(line.english),align:[]},...(translated?{tr:{text:translated,tokens:tokens(translated),align:[]}}:{})},glosses:glossary};
  if(line.reply?.correction)alignedFixture(line.reply.correction);
  return line;
}
export function installAuthoringFixtures():void {
  clearContextualGrammar();clearBeginnerContent();clearCinematicContent();
  for(const [questId,note] of Object.entries(grammarNotes))installContextualGrammar(questId,{...note,clipId:`grammar-${questId}`});
  installBeginnerTranslations(beginnerNotes.beginnerGateTranslations,beginnerNotes.greetingMeanings);
  for(const mapId of ['lindenhafen','waldruh','nebelstadt'] as const) {
    for(const kind of cutsceneKinds)installCinematicContent(kind,mapId,cinematicNotes.cinematicBeats(kind,mapId));
    for(const ending of endingIds)installCinematicContent('bell',mapId,cinematicNotes.cinematicBeats('bell',mapId,ending),ending);
  }
  installContentCatalog(structuredClone({quests:authored.quests.map(quest=>({...quest,exerciseIds:quest.exercises.map(exercise=>exercise.id)})),npcs:authored.npcs,chapters:authored.chapters}));
  for(const quest of authored.quests)installQuestExercises(quest.id,structuredClone(quest.exercises));
  installCourseMetadata({edition:data.edition,sources:data.sources,units:data.units,grammar:data.grammar});
  installLexemes(data.lexicon.map(word=>({...word,itemId:`word-${word.id}`,audio:`/audio/word-${word.id}.mp3`,exerciseIds:Object.fromEntries(['recognition','listening','production'].map(mode=>[mode,[`lex-${word.id}-${mode}`]]))})));installCourseExercises(data.exercises);
  for(const key of Object.keys(courseContextWordIds))delete courseContextWordIds[key];
  Object.assign(courseContextWordIds,data.contextWordIds);Object.assign(courseActivityWordIds,data.activityWordIds);Object.assign(courseNPCWordIds,data.npcWordIds);
  // This authoring audit intentionally exercises the original source metadata.
  courseModule.courseReferenceCoverage.splice(0,courseModule.courseReferenceCoverage.length,...data.referenceCoverage);
  const activityFixture:Record<string,unknown>={};
  new Function('exports','require',transpileModule(readFileSync(resolve(sourceRoot,'activity-engine.ts'),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(activityFixture,(name:string)=>name.includes('content')?contentModule:{seededShuffle});
  installActivityContent({scenarios:activityFixture.activityScenarios,inventory:activityFixture.inventory} as Parameters<typeof installActivityContent>[0]);
  activityAudioJobs.splice(0,activityAudioJobs.length,...activityFixture.activityAudioJobs as typeof activityAudioJobs);
  installPlacementDialogue(read('placement-dialogue.json'));
  installScriptedStoryData(read('minigame-stories.json'));
  installStoryText({...structuredClone(rawStory),journal:structuredClone(journalExports.journalNarratives)});
  for(const graph of read<QuestGraph[]>('dialogue-graphs.json')){graph.nodes.forEach(node=>node.lines.forEach(alignedFixture));graph.topics?.forEach(topic=>topic.lines.forEach(alignedFixture));installQuestGraph(structuredClone(graph));}
}
installAuthoringFixtures();
