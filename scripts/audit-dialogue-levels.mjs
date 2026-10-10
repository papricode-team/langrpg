#!/usr/bin/env node
import './register-content-loader.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {auditInputLevel,placementDialogue,placementExerciseIds} from '../web/src/learning-context.ts';
import {quests} from '../web/src/content.ts';
const course=JSON.parse(await readFile(new URL('../web/src/data/course.json',import.meta.url),'utf8'));
const graphs=JSON.parse(await readFile(new URL('../web/src/data/dialogue-graphs.json',import.meta.url),'utf8'));
const lines=graphs.flatMap(graph=>graph.nodes.flatMap(node=>node.lines.map(line=>({questId:graph.questId,lineId:line.id,level:graph.level,german:line.german,...auditInputLevel(line.german,graph.level,course.lexicon)}))));
const variants=graphs.flatMap(graph=>graph.nodes.flatMap(node=>node.lines.flatMap(line=>(line.variants??[]).map((variant,index)=>({questId:graph.questId,lineId:line.id,variant:index+1,level:graph.level,german:variant.german,...auditInputLevel(variant.german,graph.level,course.lexicon)})))));
const placement=placementExerciseIds.map(id=>{const quest=quests.find(quest=>quest.exercises.some(exercise=>exercise.id===id));if(!quest)throw new Error(`Missing graded placement response ${id}`);const turn=placementDialogue[id];return {exerciseId:id,level:quest.level,german:turn.german,...auditInputLevel(turn.german,quest.level,course.lexicon)};});
const summarize=collection=>Object.fromEntries(['A1','A2','B1'].map(level=>{const subset=collection.filter(line=>line.level===level);return [level,{lines:subset.length,linesWithAboveLevelWords:subset.filter(line=>line.aboveLevelWords.length).length,linesWithGrammarFlags:subset.filter(line=>line.advancedGrammar.length).length,longSentences:subset.reduce((sum,line)=>sum+line.longSentences,0)}];}));
const summary=summarize(lines),variantSummary=summarize(variants),placementSummary=summarize(placement);
await mkdir(new URL('../docs/audits/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/audits/dialogue-levels.json',import.meta.url),JSON.stringify({method:'Conservative dictionary surface matching and sentence-pattern flags. Unmapped proper names, inflections and story terms require editorial review. This does not establish CEFR proficiency or learner known-word coverage.',summary,variantSummary,placementSummary,lines,variants,placement},null,2)+'\n');
console.log(JSON.stringify({summary,variantSummary,placementSummary},null,2));
