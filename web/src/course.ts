import type { Exercise, Level } from './content';
import type { TranslatedSentence } from './sentence-translations';

/** Lexical facts from attributed open dictionaries; levels are course placements. */
export interface CourseLexeme {
  id: string;
  lemma: string;
  english: string;
  level: Level;
  pos: string;
  article?: string;
  /** Nominative form after a definite article, e.g. der Beamte (headword Beamter). */
  articleForm?: string;
  plural?: string;
  forms?: string[];
  /** Attested surface forms for exposure mapping; not separate counted words. */
  surfaceForms?: string[];
  topic: string;
  sourceUrl: string;
  sourceId: string;
  sourceNote?: string;
  frequencyRank?: number;
  aliases?: {form: string; kind: string; english?: string}[];
  placement?: string;
  exerciseIds?: Partial<Record<'recognition' | 'listening' | 'production', string[]>>;
  exampleLineId?: string;
  meaning?: string;
  audio?:string; itemId?:string;
  localized?: boolean;
}
export type CourseKind = 'word' | 'grammar' | 'reading' | 'writing' | 'listening';
export interface CourseExercise extends Exercise {
  level: Level;
  kind: CourseKind;
  unitId: string;
  wordIds: string[];
  targetWordId?: string;
  caseSensitive?: boolean;
}
export interface CourseUnit {
  unlocked?:boolean; exerciseCount?:number; wordCount?:number;
  id: string;
  level: Level;
  title: string;
  topic: string;
  grammarIds: string[];
  summary: string;
  exerciseIds: string[];
  wordIds: string[];
  reward: number;
  requiredItemIds: string[];
  requiredWordIds: string[];
  requiredExerciseIds: string[];
}
export interface CourseGrammar {
  instruction?:string; unitId?:string; unlocked?:boolean; localized?:boolean;
  id: string;
  level: Level;
  title: string;
  explanation: string;
  examples: TranslatedSentence[];
}
export interface CourseSource {
  id: string;
  title: string;
  url: string;
  license: string;
  licenseUrl: string;
  retrievedAt: string;
  description: string;
}

/** Only records served to this session live in these registries. */
export let courseEdition = '';
export const courseSources: CourseSource[] = [];
export const courseLexicon: CourseLexeme[] = [];
export const courseUnits: CourseUnit[] = [];
export const courseGrammar: CourseGrammar[] = [];
export const courseExercises: CourseExercise[] = [];
export const courseExerciseById = new Map<string, CourseExercise>();
export const lexemeById = new Map<string, CourseLexeme>();
export const courseContextWordIds: Record<string, string[]> = {};
export const courseActivityWordIds: Record<string, string[]> = {};
export const courseNPCWordIds: Record<string, string[]> = {};
export let courseReferenceCoverage: {mappedForms:number;remainingForms:string[];normalizedReferenceForms:number;exclusions:{form:string}[]}[] = [];
export let courseCounts: Record<string, number> = {};
function upsert<T extends {id:string}>(items:T[], values:readonly T[]):void {
  for (const value of values) {
    const index=items.findIndex(item=>item.id===value.id);
    if(index<0)items.push(value);else items[index]=value;
  }
}
export function installCourseMetadata(value:{edition?:string;sources?:CourseSource[];units?:CourseUnit[];grammar?:CourseGrammar[];counts?:Record<string,number>}):void {
  courseEdition=value.edition??courseEdition;
  if(value.sources)courseSources.splice(0,courseSources.length,...value.sources);
  if(value.units)upsert(courseUnits,value.units.map(unit=>({...unit,exerciseIds:unit.exerciseIds??[],wordIds:unit.wordIds??[],grammarIds:unit.grammarIds??[],requiredItemIds:unit.requiredItemIds??[],requiredWordIds:unit.requiredWordIds??[],requiredExerciseIds:unit.requiredExerciseIds??[]})));
  if(value.grammar)upsert(courseGrammar,value.grammar.map(guide=>({...courseGrammar.find(previous=>previous.id===guide.id),...guide,examples:guide.examples??courseGrammar.find(previous=>previous.id===guide.id)?.examples??[]})));
  if(value.counts)courseCounts={...value.counts};
}
export function installLexemes(words:readonly CourseLexeme[]):void {
  upsert(courseLexicon,words);
  for(const word of words)lexemeById.set(word.id,word);
}
export function installCourseExercises(exercises:readonly CourseExercise[]):void {
  upsert(courseExercises,exercises);
  for(const exercise of exercises){courseExerciseById.set(exercise.id,exercise);courseContextWordIds[exercise.id]=exercise.wordIds??[];}
}
export function clearCourseContent():void {
  courseEdition='';courseSources.splice(0);courseLexicon.splice(0);courseUnits.splice(0);courseGrammar.splice(0);courseExercises.splice(0);
  courseExerciseById.clear();lexemeById.clear();courseCounts={};courseReferenceCoverage=[];
  for(const index of [courseContextWordIds,courseActivityWordIds,courseNPCWordIds])for(const key of Object.keys(index))delete index[key];
}
