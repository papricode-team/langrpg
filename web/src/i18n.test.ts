// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  baseLanguage, cachedBaseLanguage, clearMissingTranslations, installOverlay, lexemeMeaning, localized, localizedExercise,
  localizedGrammar, localizedExerciseOption, localizedLexemeForm, missingTranslations, setBaseLanguage, supportText, t, upper, type LanguageOverlay,
} from './i18n';
import { turkishOverlay } from './i18n-tr';
import { storyCoverage, storyUnits, uiKeys } from './i18n-units';
import { courseCoverage, coverageSummary } from './i18n-course-coverage';
import recordedCoverage from './data/i18n/tr-coverage.json';
import { Api, normalizeSession, emptyProgress, type SessionResult } from './api';
import { renderNarrative } from './sentence-translations';
import { translationHighlights } from './dialogue-translation';
import { quests } from './content';
import { courseExercises, courseExerciseById, courseLexicon, courseUnits } from './course';
import { exerciseOptionsMarkup } from './exercise-options';
import { attemptFeedback, answerMatches } from './learning';
import { reviewExercises } from './review';

const emptyOverlay = (): LanguageOverlay => ({ story: {}, ui: {}, course: { lexicon: {}, grammar: {}, exercises: {} } });

beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) });
  clearMissingTranslations();
});
afterEach(async () => { installOverlay(undefined); await setBaseLanguage('en'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('support-language fallback', () => {
  it('keeps English untouched and never consults an overlay', async () => {
    expect(baseLanguage()).toBe('en');
    expect(t('Continue')).toBe('Continue');
    expect(t('Find {name}', { name: 'Otto' })).toBe('Find Otto');
    expect(localized({ german: 'Hallo!', english: 'Hello!' })).toBe('Hello!');
    expect(missingTranslations().size).toBe(0);
  });

  it('falls back to English for a missing Turkish string, records it and never throws', async () => {
    installOverlay({ ...emptyOverlay(), ui: { Continue: 'Devam' }, story: { 'x': { de: 'Hallo!', tr: 'Merhaba!' } } });
    await setBaseLanguage('tr');
    expect(t('Continue')).toBe('Devam');
    expect(t('Not translated yet')).toBe('Not translated yet');
    expect(localized({ german: 'Hallo!', english: 'Hello!' })).toBe('Merhaba!');
    expect(supportText({ german: 'Tschüss!', english: 'Bye!' })).toEqual({ text: 'Bye!', lang: 'en' });
    expect(localized('An untranslated title')).toBe('An untranslated title');
    expect([...missingTranslations().keys()]).toEqual(expect.arrayContaining(['ui:Not translated yet', 'sentence:Tschüss!', 'text:An untranslated title']));
  });

  it('keeps placeholders and ignores stale course entries', async () => {
    installOverlay({ ...emptyOverlay(), ui: { 'Find {name}': '{name} kişisini bul' }, course: { lexicon: { 'ich-pron': { en: 'an old gloss', tr: 'eski' } }, grammar: {}, exercises: {} } });
    await setBaseLanguage('tr');
    expect(t('Find {name}', { name: 'Otto' })).toBe('Otto kişisini bul');
    // A gloss written for a different English sense must not be shown.
    expect(lexemeMeaning({ id: 'ich-pron', english: 'I' })).toBe('I');
  });

});

describe('Turkish casing', () => {
  it('uppercases support text with Turkish rules and sets the document language for CSS', async () => {
    expect(upper('istasyon')).toBe('ISTASYON');
    installOverlay(turkishOverlay);
    await setBaseLanguage('tr');
    expect(upper('istasyon ışığı')).toBe('İSTASYON IŞIĞI');
    expect(document.documentElement.lang).toBe('tr');
    await setBaseLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('Turkish coverage', () => {
  const units = storyUnits();
  it('translates every story unit, keeps placeholders and gives one German sentence one meaning', () => {
    const report = storyCoverage(units, turkishOverlay.story);
    expect(report.missing.map(unit => unit.id)).toEqual([]);
    expect(report.stale.map(item => item.unit.id)).toEqual([]);
    expect(report.placeholders).toEqual([]);
    expect(report.inconsistent).toEqual([]);
    expect(report.translated).toBe(report.total);
    // Never attach a Turkish suffix to the unknown player name.
    expect(Object.values(turkishOverlay.story).filter(entry => /\{name\}['’]/.test(entry.tr))).toEqual([]);
  });

  it('fails when a story unit has no Turkish entry or its source changed', () => {
    const [first, second] = units;
    const overlay = { ...turkishOverlay.story };
    delete overlay[first.id];
    overlay[second.id] = { ...overlay[second.id], [second.kind === 'sentence' ? 'de' : 'en']: 'an older source' };
    const report = storyCoverage(units, overlay);
    expect(report.missing.map(unit => unit.id)).toEqual([first.id]);
    expect(report.stale.map(item => item.unit.id)).toEqual([second.id]);
  });

  it('covers every interface string routed through t()', () => {
    const root = join(__dirname);
    const sources = readdirSync(root).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => readFileSync(join(root, name), 'utf8'));
    const keys = uiKeys(sources);
    expect(keys.length).toBeGreaterThan(200);
    expect(keys.filter(key => !turkishOverlay.ui[key])).toEqual([]);
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join();
    expect(keys.filter(key => placeholders(key) !== placeholders(turkishOverlay.ui[key]))).toEqual([]);
  });

  it('shows players the coverage the report actually measures', () => {
    const root = join(__dirname);
    const sources: string[] = [];
    const walk = (dir: string) => { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, item.name); if (item.isDirectory()) walk(path); else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) sources.push(readFileSync(path, 'utf8')); } };
    walk(root);
    const keys = uiKeys(sources);
    const summary = coverageSummary({ story: storyCoverage(units, turkishOverlay.story), uiTotal: keys.length, uiTranslated: keys.filter(key => turkishOverlay.ui[key]).length, course: courseCoverage(turkishOverlay.course, turkishOverlay.ui) });
    // Out of date? Run: node scripts/i18n-coverage.mjs --write
    expect(recordedCoverage).toEqual(summary);
  });

  it('requires complete Turkish course support across A1, A2 and B1', () => {
    const report = courseCoverage(turkishOverlay.course, turkishOverlay.ui);
    for (const [part, counts] of Object.entries(report)) expect(counts.translated, part).toBe(counts.total);
  });

  it('localizes gate exercises and guides without touching answers', async () => {
    installOverlay(turkishOverlay);
    await setBaseLanguage('tr');
    const gate = quests.find(quest => quest.id === 'a1-arrival')!.exercises.find(exercise => exercise.id === 'a1-arrival-exercise-7')!;
    const turkish = localizedExercise(gate);
    expect(turkish.answer).toBe(gate.answer);
    expect(turkish.german).toBe(gate.german);
    expect(turkish.hint).not.toBe(gate.hint);
    expect(turkish.english).not.toBe(gate.english);
    const guide = localizedGrammar({ id: 'a1-nouns', title: 'x', explanation: 'y', examples: [] });
    // Stale sources fall back to the canonical English text.
    expect(guide.title).toBe('x');
  });
});

describe('Turkish generated word practice', () => {
  const exercise = (word: string, mode = 'recognition') => courseExerciseById.get(`lex-${word}-${mode}`)!;
  const turkish = async () => { installOverlay(turkishOverlay); await setBaseLanguage('tr'); };

  it('localizes the pictured sein question, answer labels, hint and feedback while preserving grading values', async () => {
    await turkish();
    const source = exercise('sein-verb'), shown = localizedExercise(source);
    expect(shown.prompt).toBe('“sein” ne anlama geliyor?');
    expect(shown.english).toBe('olmak');
    expect(shown.explanation).toBe('sein — olmak. Biçimler: şimdiki zaman (er/sie/es): ist; geçmiş zaman ortacı: gewesen.');
    expect(shown.hint).toBe(shown.explanation);
    expect(shown.answer).toBe(source.answer);
    expect(shown.options).toEqual(source.options);
    expect(shown.german).toBe(source.german);
    const host = document.createElement('div');
    host.innerHTML = exerciseOptionsMarkup(source, source.options!);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map(button => button.textContent?.slice(1))).toEqual(['olmak', 'bisiklete binmek', 'duş almak', 'kapatmak; kapanmak']);
    expect(buttons.map(button => button.dataset.answer)).toEqual(source.options);
    expect(answerMatches(source, buttons[0].dataset.answer!)).toBe(true);
    expect(answerMatches(source, buttons[1].dataset.answer!)).toBe(false);
    expect(attemptFeedback(source, source.answer, source.explanation)).toBe(shown.explanation);
    expect(attemptFeedback(source, source.options![1], source.explanation)).toBe(shown.explanation);
    expect(missingTranslations().size).toBe(0);
  });

  it('localizes production and listening instructions while keeping German answers and forms', async () => {
    await turkish();
    const production = exercise('sein-verb', 'production'), listening = exercise('sein-verb', 'listening');
    expect(localizedExercise(production).prompt).toBe('“olmak” anlamına gelen Almanca fiilin mastarını yaz.');
    expect(localizedExercise(production).answer).toBe('sein');
    expect(localizedExercise(listening).prompt).toBe('Dinle, sonra duyduğun Almanca kelimeyi veya ifadeyi seç.');
    expect(localizedExercise(listening).hint).toMatch(/^Sesi tekrar dinle\. sein — olmak\./);
    expect(listening.options!.map(option => localizedExerciseOption(listening, option))).toEqual(listening.options);
    const noun = localizedExercise(exercise('tisch-noun', 'production'));
    expect(noun.prompt).toContain('Artikeli yazmak isteğe bağlıdır; ismi büyük harfle başlat.');
    expect(noun.explanation).toContain('Çoğul: Tische.');
    expect(localizedLexemeForm('past participle: gewesen')).toBe('geçmiş zaman ortacı: gewesen');
    expect(localizedLexemeForm('gereift')).toBe('gereift');
  });

  it('covers every generated word task and its recognition distractors across all three levels', async () => {
    await turkish();
    for (const source of courseExercises.filter(ex => ex.targetWordId)) {
      const shown = localizedExercise(source);
      expect(shown.prompt, source.id).not.toBe(source.prompt);
      expect(shown.english, source.id).toBe(turkishOverlay.course.lexicon[source.targetWordId!].tr);
      expect(shown.hint, source.id).not.toContain(' Forms: ');
      expect(shown.explanation, source.id).not.toContain(' Plural: ');
      for (const option of source.options ?? []) localizedExerciseOption(source, option);
    }
    expect([...missingTranslations().keys()]).toEqual([]);
  });

  it('keeps English unchanged and rejects changed generator sources or stale Turkish glosses', async () => {
    const source = exercise('sein-verb');
    expect(localizedExercise(source)).toBe(source);
    expect(exerciseOptionsMarkup(source, source.options!)).toContain('>A</span>to be</button>');
    await turkish();
    const changed = { ...source, prompt: 'A newly authored question' };
    expect(localizedExercise(changed)).toBe(changed);
    const stale = { ...source, english: 'a changed sense' };
    expect(localizedExercise(stale)).toBe(stale);
    expect(localizedExerciseOption({ id: 'story-choice', mode: 'choice' }, 'to be')).toBe('to be');
  });
});

describe('complete Turkish course route', () => {
  beforeEach(async () => { installOverlay(turkishOverlay); await setBaseLanguage('tr'); });

  it.each(['A1', 'A2', 'B1'])('renders every %s task and feedback without English fallback while preserving submitted answers', level => {
    const exercises = courseExercises.filter(exercise => exercise.level === level);
    expect(exercises.length).toBeGreaterThan(100);
    for (const source of exercises) {
      const shown = localizedExercise(source);
      expect(shown.prompt, source.id).not.toBe(source.prompt);
      expect(shown).toMatchObject({ id: source.id, itemId: source.itemId, german: source.german, answer: source.answer, mode: source.mode });
      expect(shown.options, source.id).toEqual(source.options);
      expect(shown.acceptedAnswers, source.id).toEqual(source.acceptedAnswers);
      const options = source.options?.map(option => localizedExerciseOption(source, option));
      if (options) expect(new Set(options).size, source.id).toBe(options.length);
      for (const value of [shown.prompt, shown.hint, shown.explanation, shown.english]) expect(value, source.id).not.toMatch(/Read the (?:note|new text)|Write:|Build:|What does|Forms:|past participle:|Model:|Relevant answer:|The detail you need is:/);
      const feedback = attemptFeedback(source, source.answer, 'An English server reason.');
      expect(feedback, source.id).not.toContain('An English server reason.');
      expect(attemptFeedback(source, '__wrong_answer__', 'An English server reason.'), source.id).not.toContain('An English server reason.');
    }
    for (const word of courseLexicon.filter(word => word.level === level)) expect(lexemeMeaning(word), word.id).toBe(turkishOverlay.course.lexicon[word.id].tr);
    for (const unit of courseUnits.filter(unit => unit.level === level)) { localized(unit.title); localized(unit.summary); }
    expect([...missingTranslations().keys()]).toEqual([]);
  });

  it('shows Turkish comprehension choices and keeps their canonical values for grading', () => {
    const source = courseExercises.find(exercise => exercise.level === 'A2' && exercise.answer === 'rain is expected')!;
    const host = document.createElement('div');
    host.innerHTML = exerciseOptionsMarkup(source, source.options!);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons[0].textContent).toContain('yağmur bekleniyor');
    expect(buttons.map(button => button.dataset.answer)).toEqual(source.options);
    expect(answerMatches(source, buttons[0].dataset.answer!)).toBe(true);
    const reference = courseExercises.find(exercise => exercise.level === 'B1' && exercise.unitId.includes('-reference-forms-'))!;
    expect(localizedExercise(reference).explanation).toContain('Anlamı:');
    expect(reference.options!.map(option => localizedExerciseOption(reference, option))).not.toEqual(reference.options);
  });

  it('keeps review prompts Turkish after a sentence becomes a recall task', () => {
    const source = courseExerciseById.get('course-b1-passive-exercise-3')!;
    const progress = emptyProgress(), due = '2026-10-10T00:00:00Z';
    progress.items[source.itemId] = { itemId: source.itemId, dueAt: due, lastSeenAt: due, stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0, modeStats: {} };
    const [review] = reviewExercises(progress, [source], [], Date.parse('2026-10-12T00:00:00Z'));
    expect(review.mode).toBe('type');
    expect(localizedExercise(review).prompt).toContain('Güzergâh kapatıldı.');
    expect(localizedExercise(review).prompt).not.toContain('Write in German');
    expect(review.answer).toBe(source.answer);
  });

  it('detects missing A2/B1 glosses, stale task text and untranslated comprehension options', () => {
    const course = structuredClone(turkishOverlay.course);
    const word = courseLexicon.find(word => word.level === 'B1')!;
    delete course.lexicon[word.id];
    const source = courseExercises.find(exercise => exercise.level === 'A2' && exercise.kind === 'reading')!;
    delete course.exercises[source.id].options![source.options![0]];
    const task = courseExercises.find(exercise => exercise.level === 'B1' && !exercise.targetWordId)!;
    course.exercises[task.id].source.prompt = 'An older source';
    const report = courseCoverage(course, turkishOverlay.ui);
    expect(report['all lexicon glosses'].translated).toBe(report['all lexicon glosses'].total - 1);
    expect(report['other course tasks'].translated).toBeLessThan(report['other course tasks'].total);
  });
});

describe('base-language persistence (client)', () => {
  it('caches the choice locally and restores it', async () => {
    installOverlay(turkishOverlay);
    await setBaseLanguage('tr');
    expect(cachedBaseLanguage()).toBe('tr');
    await setBaseLanguage('en');
    expect(cachedBaseLanguage()).toBe('en');
    localStorage.setItem('atlas.baseLanguage', 'fr');
    expect(cachedBaseLanguage()).toBe('en');
  });

  it('round-trips the preference through the server API and defaults old sessions to English', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ preferences: { baseLanguage: 'tr' } })));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    api.token = 'token';
    expect(await api.savePreferences({ baseLanguage: 'tr' })).toEqual({ baseLanguage: 'tr' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/preferences');
    expect(JSON.parse(init.body)).toEqual({ baseLanguage: 'tr' });
    const legacy = { token: 't', player: {}, progress: {}, account: { registered: false, email: '' } } as unknown as SessionResult;
    expect(normalizeSession(legacy).preferences).toEqual({ baseLanguage: 'en' });
    expect(normalizeSession({ ...legacy, preferences: { baseLanguage: 'tr' } }).preferences).toEqual({ baseLanguage: 'tr' });
  });

  it('sends the first-run choice only when creating a session', async () => {
    const session = { token: 't', player: { id: 'p' }, progress: {}, account: { registered: false, email: '' }, preferences: { baseLanguage: 'tr' } };
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(session)));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    api.token = '';
    const result = await api.session('Deniz', { hair: '#302020', skin: '#edcaaa', outfit: '#456789' }, 'tr');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ name: 'Deniz', baseLanguage: 'tr' });
    expect(result.preferences.baseLanguage).toBe('tr');
    await api.session('Deniz', { hair: '#302020', skin: '#edcaaa', outfit: '#456789' });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('baseLanguage');
  });
});

describe('Turkish meanings in narratives and highlights', () => {
  it('renders Turkish sentence translations with the right language tag', async () => {
    installOverlay(turkishOverlay);
    await setBaseLanguage('tr');
    const html = renderNarrative([{ german: 'Eine Strecke ist wiederhergestellt.', english: 'A route restored.' }, { german: 'Kein Eintrag.', english: 'No entry.' }]);
    expect(html).toContain('data-translation-lang="tr"');
    expect(html).not.toContain('A route restored.');
    // A sentence without Turkish keeps English and says so.
    expect(html).toContain('data-translation="No entry." data-translation-lang="en"');
  });

  it('highlights a Turkish gloss only on an exact whole-word match', () => {
    const german = 'Ich brauche eine Lampe.';
    expect(translationHighlights({ german, english: 'Bir lamba lazım.', word: 'Lampe', gloss: 'die Lampe — lamba', language: 'tr' })).toEqual([{ start: 4, end: 9 }]);
    // Suffixed forms are not evidence: no highlight instead of a guess.
    expect(translationHighlights({ german, english: 'Lambayı ver.', word: 'Lampe', gloss: 'lamba', language: 'tr' })).toEqual([]);
    // English heuristics (articles) never apply to Turkish.
    expect(translationHighlights({ german, english: 'Bir lamba lazım.', word: 'eine', gloss: 'bir', language: 'tr' })).toEqual([{ start: 0, end: 3 }]);
    expect(translationHighlights({ german, english: 'Bir lamba lazım.', word: 'eine', gloss: '', language: 'tr' })).toEqual([]);
    // Turkish casing: İ in the sentence still matches a lowercase gloss.
    expect(translationHighlights({ german: 'Der Bahnhof ist hier.', english: 'İstasyon burada.', word: 'Bahnhof', gloss: 'istasyon', language: 'tr' })).toEqual([{ start: 0, end: 8 }]);
  });
});
