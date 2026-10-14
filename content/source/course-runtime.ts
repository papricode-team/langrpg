import data from './data/course-meta.json';
import a1 from './data/course-exercises-a1.json';
import a2 from './data/course-exercises-a2.json';
import b1 from './data/course-exercises-b1.json';
import type { Exercise, Level } from './content';

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
  id: string;
  level: Level;
  title: string;
  explanation: string;
  examples: { german: string; english: string }[];
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

export const courseEdition = data.edition;
export const courseSources = data.sources as CourseSource[];
export const courseLexicon = data.lexicon as CourseLexeme[];
export const courseUnits = data.units as CourseUnit[];
export const courseGrammar = data.grammar as CourseGrammar[];
const exerciseParts=[a1,a2,b1] as unknown as {indices:number[];exercises:CourseExercise[]}[];
export const courseExercises=exerciseParts.flatMap(part=>part.exercises.map((exercise,index)=>({exercise,sourceIndex:part.indices[index]}))).sort((left,right)=>left.sourceIndex-right.sourceIndex).map(entry=>entry.exercise);
export const courseExerciseById = new Map(courseExercises.map(exercise => [exercise.id, exercise]));
export const lexemeById = new Map(courseLexicon.map(word => [word.id, word]));
export const courseContextWordIds: Record<string, string[]> = data.contextWordIds;
export const courseActivityWordIds: Record<string, string[]> = data.activityWordIds;
export const courseNPCWordIds: Record<string, string[]> = data.npcWordIds;
export const courseReferenceCoverage = data.referenceCoverage;
