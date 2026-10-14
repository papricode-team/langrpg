import type { Narrative } from './sentence-translations';
import type { AlignedLine } from './aligned-line';

/** Original glotworld learning content. Curriculum tags describe practice, not certification. */
export type Level = 'A1' | 'A2' | 'B1';
export type ExerciseMode = 'choice' | 'listen' | 'sentence' | 'type';
export interface Exercise {
  id: string;
  localized?: boolean;
  audioPath?:string;
  placementLineId?:string; placementSpeaker?:string;
  exampleLineId?:string;
  aligned?:AlignedLine;
  itemId: string;
  mode: ExerciseMode;
  prompt: string;
  /** Reference example and listening text. Hide before answering sentence/type exercises. */
  german: string;
  english: string;
  answer?: string;
  options?: string[];
  tokens?: string[];
  hint: string;
  explanation?: string;
  acceptedAnswers?: string[];
  /** Sentence starts, German nouns and formal Sie retain their authored capitals. */
  caseSensitive?: boolean;
}
export interface Quest {
  id: string;
  level: Level;
  title: string;
  subtitle: string;
  npcId: string;
  location: string;
  story: Narrative;
  objectives: string[];
  reward: number;
  exercises: Exercise[];
  exerciseIds?: string[];
  graphId?: string;
}
export interface NPC {
  contentId?:string; portraitId?:string;
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  color: string;
  greeting: string;
  greetingSentences?: Narrative;
  greetingLineIds?:string[];
  portrait?: string;
}
export interface VocabularyItem { id: string; german: string; english: string; level: Level; example: string; }
export interface Chapter { level: Level; title: string; description: string; color: string; }

/** Account-visible metadata. Populated only after authenticated bootstrap. */
export const npcs: NPC[] = [];
export const chapters: Chapter[] = [];
export const quests: Quest[] = [];
export const vocabulary: VocabularyItem[] = [];
export const npcQuests = (npcId: string, level?: Level): Quest[] =>
  quests.filter(quest => quest.npcId === npcId && (!level || quest.level === level));

export function installContentCatalog(value: {npcs: NPC[]; chapters?: Chapter[]; quests: Quest[]}): void {
  npcs.splice(0, npcs.length, ...value.npcs.map(npc=>({...npc,contentId:npc.id,id:npc.portraitId??npc.id})));
  chapters.splice(0, chapters.length, ...(value.chapters ?? []));
  quests.splice(0, quests.length, ...value.quests.map(quest => ({...quest, npcId:npcs.find(npc=>npc.contentId===quest.npcId)?.id??quest.npcId, story: quest.story ?? quests.find(previous=>previous.id===quest.id)?.story ?? [], objectives: quest.objectives ?? [], exercises: quests.find(previous=>previous.id===quest.id)?.exercises ?? []})));
  if(!quests.some(quest=>quest.exercises.length))vocabulary.splice(0);
}
export function installQuestExercises(questId: string, exercises: readonly Exercise[]): void {
  const quest = quests.find(quest => quest.id === questId);
  if (!quest) return;
  for (const exercise of exercises) {
    const previous = quest.exercises.findIndex(item => item.id === exercise.id);
    if (previous < 0) quest.exercises.push(exercise); else quest.exercises[previous] = exercise;
    const entry = {id: exercise.itemId, german: exercise.german, english: exercise.english, level: quest.level, example: exercise.german};
    const index = vocabulary.findIndex(word => word.id === entry.id);
    if (index < 0) vocabulary.push(entry); else vocabulary[index] = entry;
  }
}
export function clearContentCatalog(): void {
  npcs.splice(0); chapters.splice(0); quests.splice(0); vocabulary.splice(0);
}
