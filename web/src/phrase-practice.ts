import type { Exercise, Quest } from './content';
import type { Progress } from './api';
import { dueItems, practiceExercises } from './learning';
import { questAvailable } from './progression';
import { missingWordCount } from './intake';
import { localizedExercise, t } from './i18n';

/** Selecting a phrase never bypasses the review deadline, clue order, or optional practice gates. */
export function phrasePracticeQueue(id: string, progress: Progress, quests: readonly Quest[], options: {
  silent: boolean; writingReady: boolean; contextWords?: Record<string, string[]>; now?: number;
}): Exercise[] {
  if (!progress.items[id] || !dueItems(progress, options.now).includes(id)) return [];
  const quest = quests.find(item => item.exercises.some(exercise => exercise.itemId === id));
  if (!quest || !questAvailable(quest.id, progress)) return [];
  const exercises = quest.exercises.filter(exercise => exercise.itemId === id
    && !missingWordCount(options.contextWords?.[exercise.id] ?? [], progress)).map(exercise =>
    exercise.mode === 'sentence' ? { ...exercise, mode: 'type' as const,
      prompt: t('Write in German: {english}', { english: localizedExercise(exercise).english }) } : exercise);
  return practiceExercises(exercises, options.silent, options.writingReady).slice(0, 1);
}
