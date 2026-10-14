import type { DialogueChoice } from './dialogue';
import type { Progress } from './api';
import type {AlignedLine} from './aligned-line';

/** Optional writing can open earlier; story support fades only after independent practice. */
export function needsBeginnerStorySupport(progress: Progress): boolean {
  const foundations = ['a1-arrival', 'a1-cafe', 'a1-market'];
  if (!foundations.every(id => progress.completedQuestIds.includes(id))) return true;
  const attempts = Object.values(progress.recentAttempts)
    .filter(attempt => !attempt.hinted)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 24);
  const correct = attempts.filter(attempt => attempt.correct);
  // Repeating one easy reply, watching the story or choosing translated answers
  // cannot unlock harder demands. Include recall as well as recognition.
  return new Set(correct.map(attempt => attempt.itemId)).size < 12
    || new Set(correct.filter(attempt => attempt.mode === 'production').map(attempt => attempt.itemId)).size < 4
    || correct.length / attempts.length < .8;
}

/** Candidates are installed from the currently entitled exercise slice. */
export const beginnerGateTranslations: Record<string, readonly (readonly [german:string, english:string])[]> = {};
export const greetingMeanings: Record<string,string> = {};
const gateLineRefs:Record<string,Record<string,{lineId:string;aligned?:AlignedLine}>>={};
const replyLineRefs:Record<string,{lineId:string;aligned?:AlignedLine}>={};
interface BeginnerExerciseContent {
  id:string;
  guidedChoices?:readonly {german:string;english?:string;lineId?:string;support?:Record<string,{english?:string}>}[];
  optionMeanings?:Record<string,string>;
  optionLineIds?:Record<string,string>;
}
export function installBeginnerExercise(exercise:BeginnerExerciseContent):void {
  if(exercise.guidedChoices)beginnerGateTranslations[exercise.id]=exercise.guidedChoices.map(choice=>[choice.german,choice.english??''] as const);
  if(exercise.guidedChoices)gateLineRefs[exercise.id]=Object.fromEntries(exercise.guidedChoices.flatMap(choice=>choice.lineId?[[choice.german,{lineId:choice.lineId}]]:[]));
  if(exercise.optionMeanings)Object.assign(greetingMeanings,exercise.optionMeanings);
  for(const [german,lineId]of Object.entries(exercise.optionLineIds??{}))replyLineRefs[german]={lineId};
}
export function installBeginnerLines(lines:readonly AlignedLine[]):void {
  const byID=new Map(lines.map(line=>[line.id,line]));
  for(const value of [...Object.values(gateLineRefs).flatMap(Object.values),...Object.values(replyLineRefs)]){const line=byID.get(value.lineId);if(line)value.aligned=line;}
}
export function beginnerReplyContent(german:string):{lineId?:string;aligned?:AlignedLine}{return replyLineRefs[german]??{};}
export function installBeginnerTranslations(translations:typeof beginnerGateTranslations,meanings:typeof greetingMeanings={}):void {
  Object.assign(beginnerGateTranslations,structuredClone(translations));Object.assign(greetingMeanings,meanings);
}
export function clearBeginnerContent():void {
  for(const key of Object.keys(beginnerGateTranslations))delete beginnerGateTranslations[key];
  for(const key of Object.keys(greetingMeanings))delete greetingMeanings[key];
  for(const key of Object.keys(gateLineRefs))delete gateLineRefs[key];
  for(const key of Object.keys(replyLineRefs))delete replyLineRefs[key];
}
/** German choice values are submitted to authoritative server grading. */
export function beginnerGateChoices(exerciseId:string):DialogueChoice[] {
  return (beginnerGateTranslations[exerciseId]??[]).map(([german,english])=>({id:german,german,english,...gateLineRefs[exerciseId]?.[german],next:'',effects:[]}));
}
export function beginnerReplyMeaning(german:string):string|undefined {return greetingMeanings[german];}
