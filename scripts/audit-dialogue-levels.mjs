#!/usr/bin/env node
import './register-content-loader.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {auditInputLevel,placementDialogue,placementExerciseIds} from '../web/src/learning-context.ts';
import {quests,npcs} from '../web/src/content.ts';
import {auditDialogueCorpus,summarizeInput} from './dialogue-level-audit.mjs';
const course=JSON.parse(await readFile(new URL('../web/src/data/course.json',import.meta.url),'utf8'));
const graphs=JSON.parse(await readFile(process.env.DIALOGUE_GRAPHS?new URL(`file://${process.env.DIALOGUE_GRAPHS}`):new URL('../web/src/data/dialogue-graphs.json',import.meta.url),'utf8'));
const {storyMaps}=await import('../web/src/maps.ts');
const corpus=auditDialogueCorpus({graphs,lexicon:course.lexicon,questOrder:quests.map(quest=>quest.id),properNames:[...npcs.map(npc=>npc.name),...storyMaps.map(map=>map.name)]});
const collection=kind=>corpus.entries.filter(entry=>entry.kind===kind);
const lines=collection('line'),variants=collection('variant'),corrections=collection('correction'),investigations=collection('investigation'),choices=collection('choice');
const placement=placementExerciseIds.map(id=>{const quest=quests.find(quest=>quest.exercises.some(exercise=>exercise.id===id));if(!quest)throw new Error(`Missing graded placement response ${id}`);const turn=placementDialogue[id];return {exerciseId:id,level:quest.level,german:turn.german,...auditInputLevel(turn.german,quest.level,course.lexicon)};});
const summary=summarizeInput(lines),variantSummary=summarizeInput(variants),placementSummary=summarizeInput(placement);
const report={method:'Raw dictionary matches are retained beside adjusted flags. Explicitly English-glossed story vocabulary carries forward in canonical quest order, with at most two new story words per Act I quest. Bounded resolutions cover registered character/town names, surnames after Frau/Herr, single-letter clues, standard contractions and level-tagged surface forms. Act I checks every dialogue line, simpler variant, reply correction, investigation and choice; all unapproved above-level words, unresolved words, listed advanced patterns and turns over 16 words fail. Level tags, homographs, imported inflections and grammar heuristics still require editorial review. A zero result is not CEFR certification or measured learner known-word coverage; placement is reported separately and is outside this story gate.',summary,variantSummary,placementSummary,rawSummary:corpus.rawSummary,adjustedSummary:corpus.adjustedSummary,introductions:corpus.introductions,actOneGate:corpus.actOneGate,lines,variants,corrections,investigations,choices,placement};
if(!process.argv.includes('--check')&&!process.env.DIALOGUE_GRAPHS){
  await mkdir(new URL('../docs/audits/',import.meta.url),{recursive:true});
  await writeFile(new URL('../docs/audits/dialogue-levels.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({summary,variantSummary,placementSummary,adjustedSummary:corpus.adjustedSummary,actOneGate:corpus.actOneGate},null,2));
if(!corpus.actOneGate.passed)process.exitCode=1;
