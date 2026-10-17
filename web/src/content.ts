import type { Narrative } from './sentence-translations';

/** Original glotworld learning content. Curriculum tags describe practice, not certification. */
export type CourseLevel = 'A1' | 'A2' | 'B1';
/** A0 is a story scaffold, never a lexicon or certification band. */
export type Level = 'A0' | CourseLevel;
export type ExerciseMode = 'choice' | 'listen' | 'sentence' | 'type';
export interface Exercise {
  id: string;
  /** Public authored sentence references; model answers arrive only after grading. */
  sentenceId?: string;
  exampleSentenceId?: string;
  optionSentenceIds?: Record<string, string>;
  audioRequires?: boolean;
  wordIds?: string[];
  itemId: string;
  mode: ExerciseMode;
  prompt: string;
  /** Reference example and listening text. Hide before answering sentence/type exercises. */
  german: string;
  english: string;
  answer: string;
  options?: string[];
  tokens?: string[];
  hint: string;
  explanation: string;
  acceptedAnswers?: string[];
  /** Sentence starts, German nouns and formal Sie retain their authored capitals. */
  caseSensitive?: boolean;
}
export interface Quest {
  id: string;
  worldId?: string;
  level: Level;
  title: string;
  subtitle: string;
  npcId: string;
  location: string;
  story: Narrative;
  objectives: string[];
  reward: number;
  exercises: Exercise[];
  /** Authenticated recognition exercises for completed prologue phrase practice. */
  practiceExerciseIds?: string[];
}
export interface NPC {
  prologueOnly?: boolean;
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  color: string;
  greeting: string;
  greetingSentences?: Narrative;
  portrait?: string;
}
export interface VocabularyItem { id: string; german: string; english: string; level: Level; example: string; }
export interface Chapter { level: Level; title: string; description: string; color: string; }

/** The quest, character and chapter data a client or tool works with; content/source.json is its only source. */
export interface AuthoredContent { npcs: NPC[]; chapters: Chapter[]; quests: Quest[]; }

/*
 * These registries start empty. The browser fills them from the authenticated content API: in every
 * non-test Vite build the content runtime plugin replaces these initialisers with runtime registries, so
 * answers never ship in the bundle. Node tools fill them from content/source.json through
 * scripts/content-source.mjs, and Vitest through test-support/authored-content.ts (below).
 */
export const npcs: NPC[] = [];
export const chapters: Chapter[] = [];
export const quests: Quest[] = [];
/** Each target is a useful contextual chunk; repeats in story do not imply a new mastery item. */
export const vocabulary: VocabularyItem[] = [];

/** Fill the registries in place, so modules that already hold them see the content. */
export function installAuthoredContent(source: AuthoredContent): void {
  npcs.splice(0, npcs.length, ...source.npcs);
  chapters.splice(0, chapters.length, ...source.chapters);
  quests.splice(0, quests.length, ...source.quests);
  vocabulary.splice(0, vocabulary.length, ...source.quests.flatMap(quest =>
    quest.exercises.map(exercise => ({
      id: exercise.itemId,
      german: exercise.german,
      english: exercise.english,
      level: quest.level,
      example: exercise.german,
    }))));
}

export const npcQuests = (npcId: string, level?: Level): Quest[] =>
  quests.filter(quest => quest.npcId === npcId && (!level || quest.level === level));

// Vitest runs without the content plugin and without a server. `import.meta.env` is undefined under plain
// Node, and a production build folds this condition to false, dropping the test-only import entirely.
if (import.meta.env && import.meta.env.MODE === 'test') installAuthoredContent((await import('./test-support/authored-content')).authoredContent());
