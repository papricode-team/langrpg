import type { Exercise } from './content';
import { contentApi, getSentence } from './content-api';
import { localizedExercise, baseLanguage } from './i18n';
import type { Narrative, TranslatedSentence } from './sentence-translations';
import { renderTranslatedSentence } from './translated-sentence';

/** Load the selected example through the same access gates as other sentences. */
export async function loadExerciseExample(exercise: Exercise | undefined): Promise<Narrative | undefined> {
  if (!exercise) return;
  const sentenceId = exercise.exampleSentenceId ?? exercise.sentenceId;
  if (sentenceId) {
    await contentApi.sentences([sentenceId]);
    const sentence = getSentence(sentenceId);
    if (!sentence) return;
    return [{ sentenceId, german: sentence.text, english: sentence.translations[baseLanguage()]?.text ?? '', localized: true }];
  }
  if (!exercise.german) return;
  return [{ german: exercise.german, english: localizedExercise(exercise).english, localized: true }];
}

/** Grammar and word details share the authored occurrence renderer. */
export function renderCourseExample(example: TranslatedSentence): string {
  return renderTranslatedSentence(example, '', true);
}
