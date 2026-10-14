import type { DialogueChoice } from './dialogue';
import type { Progress } from './api';

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
interface BeginnerExerciseContent {
  id:string;
  guidedChoices?:readonly {german:string;english?:string;support?:Record<string,{english?:string}>}[];
  optionMeanings?:Record<string,string>;
}
export function installBeginnerExercise(exercise:BeginnerExerciseContent):void {
  if(exercise.guidedChoices)beginnerGateTranslations[exercise.id]=exercise.guidedChoices.map(choice=>[choice.german,choice.english??''] as const);
  if(exercise.optionMeanings)Object.assign(greetingMeanings,exercise.optionMeanings);
}
export function installBeginnerTranslations(translations:typeof beginnerGateTranslations,meanings:typeof greetingMeanings={}):void {
  Object.assign(beginnerGateTranslations,structuredClone(translations));Object.assign(greetingMeanings,meanings);
}
export function clearBeginnerContent():void {
  for(const key of Object.keys(beginnerGateTranslations))delete beginnerGateTranslations[key];
  for(const key of Object.keys(greetingMeanings))delete greetingMeanings[key];
}
/** German choice values are submitted to authoritative server grading. */
export function beginnerGateChoices(exerciseId:string):DialogueChoice[] {
  return (beginnerGateTranslations[exerciseId]??[]).map(([german,english])=>({id:german,german,english,next:'',effects:[]}));
}
export function beginnerReplyMeaning(german:string):string|undefined {return greetingMeanings[german];}
