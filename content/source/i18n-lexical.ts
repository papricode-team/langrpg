import type { CourseOverlay, ExerciseText } from './i18n';

type Translate = (source: string, vars?: Record<string, string | number>) => string;
type LexicalExercise = ExerciseText & { id: string; german?: string };

/** Only the labels are support text; the inflected German forms stay intact. */
export function translatedLexemeForm(form: string, t: Translate): string {
  const separator = form.indexOf(': ');
  if (separator < 0) return form;
  const label = form.slice(0, separator), value = form.slice(separator + 2);
  switch (label) {
    case 'present 3sg': return t('Present (er/sie/es): {form}', { form: value });
    case 'past participle': return t('Past participle: {form}', { form: value });
    case 'comparative': return t('Comparative: {form}', { form: value });
    case 'superlative': return t('Superlative: {form}', { form: value });
    case 'other gender':
    case 'other genders': return t('Other genders: {form}', { form: value });
    default: return form;
  }
}

/** Translate the known generator templates without duplicating thousands of overlay entries. */
export function generatedLexicalExerciseText(exercise: LexicalExercise, lexicon: CourseOverlay['lexicon'], t: Translate): ExerciseText | undefined {
  const match = /^lex-(.+)-(recognition|listening|production)$/.exec(exercise.id);
  if (!match) return;
  const gloss = lexicon[match[1]];
  if (!gloss?.tr || gloss.en !== exercise.english) return;
  const meaning = gloss.tr;
  let prompt: string | undefined;
  if (match[2] === 'recognition' && exercise.prompt === `What does “${exercise.german}” mean?`) {
    prompt = t('What does “{german}” mean?', { german: exercise.german! });
  } else if (match[2] === 'listening') {
    if (exercise.prompt === 'Listen, then choose the German word or expression you hear.') prompt = t('Listen, then choose the German word or expression you hear.');
    if (exercise.prompt === 'Listen to the sentence. Choose the German pronoun in its context.') prompt = t('Listen to the sentence. Choose the German pronoun in its context.');
  } else if (match[2] === 'production') {
    const article = ' The article is optional; capitalize the noun.';
    const source = exercise.prompt.endsWith(article) ? exercise.prompt.slice(0, -article.length) : exercise.prompt;
    if (source === `Write the German noun for “${gloss.en}”.`) prompt = t('Write the German noun for “{meaning}”.', { meaning });
    if (source === `Write the German infinitive for “${gloss.en}”.`) prompt = t('Write the German infinitive for “{meaning}”.', { meaning });
    if (source === `Write the German word or expression for “${gloss.en}”.`) prompt = t('Write the German word or expression for “{meaning}”.', { meaning });
    if (prompt && exercise.prompt.endsWith(article)) prompt += ` ${t('The article is optional; capitalize the noun.')}`;
  }
  if (!prompt) return;

  const note = (source: string): string | undefined => {
    if (source.startsWith('Replay the audio. ')) {
      const rest = note(source.slice('Replay the audio. '.length));
      return rest === undefined ? undefined : t('Replay the audio. {note}', { note: rest });
    }
    const separator = source.indexOf(` — ${gloss.en}.`);
    if (separator < 0) return;
    let suffix = source.slice(separator + ` — ${gloss.en}.`.length);
    const formsAt = suffix.indexOf(' Forms: ');
    const forms = formsAt < 0 ? '' : suffix.slice(formsAt + ' Forms: '.length, -1);
    if (formsAt >= 0) suffix = suffix.slice(0, formsAt);
    if (suffix && !(suffix.startsWith(' Plural: ') && suffix.endsWith('.'))) return;
    const plural = suffix ? ` ${t('Plural: {plural}', { plural: suffix.slice(' Plural: '.length, -1) })}.` : '';
    const formText = forms ? ` ${t('Forms: {forms}', { forms: forms.split('; ').map(form => translatedLexemeForm(form, t)).join('; ') })}.` : '';
    return `${source.slice(0, separator)} — ${meaning}.${plural}${formText}`;
  };
  const hint = note(exercise.hint), explanation = note(exercise.explanation);
  if (hint === undefined || explanation === undefined) return;
  return { prompt, hint, explanation, english: meaning };
}

/** Canonical English options remain the submitted values; this is only their visible label. */
export function generatedLexicalOption(option: string, meanings: ReadonlyMap<string, string>, t: Translate): string | undefined {
  const meaning = meanings.get(option);
  if (meaning) return meaning;
  switch (option) {
    case 'a postal stamp': return t('a postal stamp');
    case 'to repair a clock': return t('to repair a clock');
    case 'unfortunately': return t('unfortunately');
    case 'a quiet room': return t('a quiet room');
    default: return undefined;
  }
}
