import type { Exercise } from './content';
import type { Progress,WordMemory } from './api';
import { dueItems, modeFor, practiceExercises } from './learning';

type ReviewExercise = Exercise & { targetWordId?: string };
const ready = (date: string | undefined, now: number) => !!date && Number.isFinite(Date.parse(date)) && Date.parse(date)>0 && Date.parse(date) <= now;
/** Journal counts and review queues share the same practiced-skill deadline. */
export function wordReadyForReview(word:WordMemory,now=Date.now()):boolean {
  return word.directAttempts>0&&ready(word.dueAt,now)&&Object.values(word.evidence??{}).some(evidence=>evidence.attempts>0&&evidence.status!=='unseen'&&ready(evidence.dueAt,now));
}
/** A short session across both the extended course and the story, with one due skill per word. */
export function reviewExercises(progress: Progress, course: readonly ReviewExercise[], story: readonly Exercise[], now = Date.now(), silentMode = false, writingReady = true): Exercise[] {
  const queue: Exercise[] = [];
  course = practiceExercises(course, silentMode, writingReady);
  story = practiceExercises(story, silentMode, writingReady);
  const wordExercises = new Map(course.filter(ex => ex.targetWordId).map(ex => [`${ex.targetWordId}:${modeFor(ex)}`, ex]));
  const words = Object.values(progress.words).filter(word => wordReadyForReview(word,now)).sort((a,b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  for (const word of words) {
    for (const mode of ['production','listening','recognition'] as const) {
      const evidence = word.evidence?.[mode];
      // A different practiced skill being due does not make unseen production
      // due. Review only modalities with a real recall/practice deadline.
      if (!evidence || evidence.attempts < 1 || evidence.status === 'unseen' || !ready(evidence.dueAt, now)) continue;
      const exercise = wordExercises.get(`${word.wordId}:${mode}`);
      if (exercise) { queue.push(exercise); break; }
    }
    if (queue.length === 6) break;
  }
  const contextual = new Map([...story, ...course.filter(ex => !ex.targetWordId)].map(ex => [ex.itemId, ex]));
  for (const id of dueItems(progress, now)) {
    const exercise = contextual.get(id);
    if (!exercise) continue;
    queue.push(exercise.mode === 'sentence' ? {...exercise, mode:'type', prompt:`Write in German: ${exercise.english}`} : exercise);
    if (queue.length === 8) break;
  }
  return queue;
}
