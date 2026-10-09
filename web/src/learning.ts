import type { Progress } from './api';
import type { Exercise } from './content';

export function normalizedAnswer(answer: string): string {
  return answer.normalize('NFC').toLocaleLowerCase('de').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}
export function answerMatches(exercise: Exercise & { caseSensitive?: boolean }, answer: string): boolean {
  const acceptable = [exercise.answer, ...((exercise as Exercise & { acceptedAnswers?: string[] }).acceptedAnswers ?? [])];
  const normalize = exercise.caseSensitive ? (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '') : normalizedAnswer;
  return acceptable.some(value => normalize(value) === normalize(answer));
}
export function dueItems(progress: Progress, now = Date.now()): string[] {
  return Object.values(progress.items)
    .filter(item => Number.isFinite(Date.parse(item.dueAt)) && Date.parse(item.dueAt) <= now)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .map(item => item.itemId);
}
export function memoryLabel(repetitions: number, stability: number): string {
  if (repetitions < 2) return 'Taking root';
  if (stability < 7) return 'Growing';
  return 'Settling in';
}
export function modeFor(exercise: Exercise): 'recognition' | 'production' | 'listening' {
  return exercise.mode === 'listen' ? 'listening' : exercise.mode === 'choice' ? 'recognition' : 'production';
}

export function practiceExercises<T extends Exercise>(exercises: readonly T[], silentMode: boolean): T[] {
  return exercises.filter(exercise => !silentMode || exercise.mode !== 'listen');
}

/** Keep answered history and the cursor intact when silent mode is enabled mid-session. */
export function skipListeningExercises(session: { queue: Exercise[]; index: number; targetCount: number }): void {
  const pending = session.queue.slice(session.index);
  const skipped = new Set(pending.filter(exercise => exercise.mode === 'listen').map(exercise => exercise.id));
  session.queue = [...session.queue.slice(0, session.index), ...practiceExercises(pending, true)];
  session.targetCount -= skipped.size;
}
