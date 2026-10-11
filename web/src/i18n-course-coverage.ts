/** Course-side Turkish coverage. The course is large; only its declared scope is required. */
import { courseLexicon, courseGrammar, courseExercises } from './course';
import { quests } from './content';
import type { CourseOverlay } from './i18n';

export interface CoveragePart { translated: number; total: number; }

export function courseCoverage(overlay: CourseOverlay): Record<string, CoveragePart> {
  const glossed = (word: { id: string; english: string }) => overlay.lexicon[word.id]?.en === word.english && !!overlay.lexicon[word.id]?.tr.trim();
  const a1 = courseLexicon.filter(word => word.level === 'A1');
  const storyExercises = quests.flatMap(quest => quest.exercises);
  const exerciseDone = (exercise: { id: string; prompt: string; hint: string; explanation: string; english: string }) => {
    const entry = overlay.exercises[exercise.id];
    return !!entry && (['prompt', 'hint', 'explanation', 'english'] as const).every(field => entry.source[field] === exercise[field] && !!entry.tr[field]?.trim());
  };
  const guideDone = (guide: { id: string; title: string; explanation: string; examples: { german: string }[] }) => {
    const entry = overlay.grammar[guide.id];
    return !!entry && entry.title[0] === guide.title && entry.explanation[0] === guide.explanation && guide.examples.every(example => !!entry.examples[example.german]);
  };
  const count = <T>(items: readonly T[], done: (item: T) => boolean): CoveragePart => ({ translated: items.filter(done).length, total: items.length });
  const lexiconAll = count(courseLexicon, glossed);
  const courseTasks = count(courseExercises, exerciseDone);
  return {
    'A1 lexicon glosses': count(a1, glossed),
    'all lexicon glosses': lexiconAll,
    'grammar guides': count(courseGrammar, guideDone),
    'story quest exercises': count(storyExercises, exerciseDone),
    'other course tasks': courseTasks,
  };
}

/** Rounded percentages for the honest coverage note in Settings (web/src/data/i18n/tr-coverage.json). */
export function coverageSummary(input: { story: { translated: number; total: number }; uiTranslated: number; uiTotal: number; course: Record<string, CoveragePart> }): { story: number; ui: number; words: number; tasks: number } {
  const pct = (part: number, whole: number) => whole ? Math.floor(part / whole * 1000) / 10 : 0;
  const tasks = [input.course['story quest exercises'], input.course['other course tasks']];
  return {
    story: pct(input.story.translated, input.story.total),
    ui: pct(input.uiTranslated, input.uiTotal),
    words: pct(input.course['all lexicon glosses'].translated, input.course['all lexicon glosses'].total),
    tasks: pct(tasks.reduce((sum, part) => sum + part.translated, 0), tasks.reduce((sum, part) => sum + part.total, 0)),
  };
}
