import type { Exercise, Quest } from '../content';
import type { Progress } from '../api';
import type { PhrasePair } from './types';

/** Completion permits practice; intake still decides which phrases can enter it. */
export async function loadProloguePhrases(quests: readonly Quest[], progress: Progress, load: (id: string) => Promise<Exercise>): Promise<PhrasePair[]> {
  const restored = new Set(progress.intake?.wordIds ?? []), german = new Set<string>(), meanings = new Set<string>();
  const exercises = await Promise.all(quests.filter(quest => quest.level === 'A0' && progress.completedQuestIds.includes(quest.id))
    .flatMap(quest => quest.practiceExerciseIds ?? []).map(load));
  const phrases: PhrasePair[] = [];
  for (const exercise of exercises) {
    const words = exercise.wordIds ?? [];
    if (exercise.mode !== 'choice' || !words.length || !words.every(id => restored.has(id)) || /\{/.test(exercise.german)
      || (exercise.german.match(/\p{L}+/gu)?.length ?? 0) < 2 || !exercise.english || german.has(exercise.german) || meanings.has(exercise.english)) continue;
    german.add(exercise.german); meanings.add(exercise.english);
    const recording = (exercise as Exercise & {audio?: string | {path: string}}).audio;
    phrases.push({exerciseId: exercise.id, wordIds: words, german: exercise.german, meaning: exercise.english,
      audio: typeof recording === 'string' ? recording : recording?.path});
  }
  return phrases;
}
