// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  baseLanguage, cachedBaseLanguage, clearMissingTranslations, installOverlay, lexemeMeaning, localized, localizedExercise,
  localizedGrammar, missingTranslations, setBaseLanguage, supportText, t, upper, type LanguageOverlay,
} from './i18n';
import { turkishOverlay } from './i18n-tr';
import { storyCoverage, storyUnits, uiKeys } from './i18n-units';
import { courseCoverage, coverageSummary } from './i18n-course-coverage';
import recordedCoverage from './data/i18n/tr-coverage.json';
import { Api, normalizeSession, type SessionResult } from './api';
import { renderNarrative } from './sentence-translations';
import { translationHighlights } from './dialogue-translation';
import { quests } from './content';

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
    const summary = coverageSummary({ story: storyCoverage(units, turkishOverlay.story), uiTotal: keys.length, uiTranslated: keys.filter(key => turkishOverlay.ui[key]).length, course: courseCoverage(turkishOverlay.course) });
    // Out of date? Run: node scripts/i18n-coverage.mjs --write
    expect(recordedCoverage).toEqual(summary);
  });

  it('covers the A1 lexicon, the grammar guides and every story-quest exercise', () => {
    const report = courseCoverage(turkishOverlay.course);
    for (const part of ['A1 lexicon glosses', 'grammar guides', 'story quest exercises']) expect(report[part].translated, part).toBe(report[part].total);
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
