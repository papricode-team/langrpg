/** Course-side Turkish coverage. Every A1–B1 support string is required. */
import { courseLexicon, courseGrammar, courseExercises, courseUnits } from './course';
import { quests } from './content';
import type { CourseOverlay } from './i18n';
import { generatedLexicalExerciseText, generatedLexicalOption } from './i18n-lexical';

export interface CoveragePart { translated: number; total: number; }

export function courseCoverage(overlay: CourseOverlay, ui: Record<string, string>): Record<string, CoveragePart> {
  const meanings = new Map(Object.values(overlay.lexicon).filter(entry => entry.tr).map(entry => [entry.en, entry.tr]));
  const translate = (source: string, vars?: Record<string, string | number>) => (ui[source] ?? '').replace(/\{(\w+)\}/g, (match, name: string) => vars && name in vars ? String(vars[name]) : match);
  const glossed = (word: { id: string; english: string }) => overlay.lexicon[word.id]?.en === word.english && !!overlay.lexicon[word.id]?.tr.trim();
  const a1 = courseLexicon.filter(word => word.level === 'A1');
  const storyExercises = quests.flatMap(quest => quest.exercises);
  const exerciseDone = (exercise: { id: string; prompt: string; hint: string; explanation: string; english: string; german?: string; mode: string; options?: string[] }) => {
    const entry = overlay.exercises[exercise.id];
    if (!entry) {
      const generated = generatedLexicalExerciseText(exercise, overlay.lexicon, translate);
      return !!generated && Object.values(generated).every(text => text.trim()) && (exercise.mode !== 'choice' || (exercise.options ?? []).every(option => !!generatedLexicalOption(option, meanings, translate)?.trim()));
    }
    const needsOptions = !!exercise.options?.length && exercise.id.startsWith('course-');
    return entry.german === exercise.german && (['prompt', 'hint', 'explanation', 'english'] as const).every(field => entry.source[field] === exercise[field] && !!entry.tr[field]?.trim()) && (!needsOptions && !entry.options || (exercise.options ?? []).every(option => !!entry.options?.[option]?.trim()));
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
    'course route text': count(courseUnits, unit => !!overlay.texts?.[unit.title]?.trim() && !!overlay.texts?.[unit.summary]?.trim()),
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
