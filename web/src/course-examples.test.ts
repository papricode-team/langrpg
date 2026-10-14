// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureContentSession, resetContentSession } from './content-api';
import { loadExerciseExample, renderCourseExample } from './course-examples';
import { courseWordDetail, renderWordDetail } from './word-detail';
import { installSentenceTranslations } from './sentence-translations';
import { setBaseLanguage } from './i18n';
import { registerSentence, type AuthoredSentence } from './translated-sentence';
import type { Exercise } from './content';
import type { CourseLexeme } from './course';

afterEach(async () => {
  resetContentSession(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.body.replaceChildren(); await setBaseLanguage('en', { persist: false });
});

const sentence: AuthoredSentence = {
  id: 'example-sentence', text: 'Möchtest du Kaffee?', target: 'de',
  translations: { en: { text: 'Would you like coffee?', words: [
    { source: { text: 'Möchtest', occurrence: 1 }, targets: [{ text: 'Would', occurrence: 1 }, { text: 'like', occurrence: 1 }], sourceRange: { start: 0, end: 8 }, targetRanges: [{ start: 0, end: 5 }, { start: 10, end: 14 }] },
    { source: { text: 'Kaffee', occurrence: 1 }, targets: [{ text: 'coffee', occurrence: 1 }], sourceRange: { start: 12, end: 18 }, targetRanges: [{ start: 15, end: 21 }] },
  ] } },
  words: [
    { source: { text: 'Möchtest', occurrence: 1 }, range: { start: 0, end: 8 }, glosses: { en: 'would like' } },
    { source: { text: 'Kaffee', occurrence: 1 }, range: { start: 12, end: 18 }, glosses: { en: 'coffee' } },
  ],
};
const exercise: Exercise = { id: 'exercise', itemId: 'word', mode: 'choice', prompt: 'Read the request', german: 'A cached prompt', english: 'A cached instruction', answer: '', hint: '', explanation: '' };

describe('authored course examples', () => {
  it('loads only the selected server example and retains its split alignment in word details', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ records: [{ id: sentence.id, courseId: 'course', version: 1, body: sentence }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    configureContentSession(() => 'example-token', { courseId: 'course', supportLanguage: 'en' });
    const narrative = await loadExerciseExample({ ...exercise, exampleSentenceId: sentence.id });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/content/sentences?ids=${sentence.id}`);
    expect(narrative?.[0].german).toBe(sentence.text);
    const word: CourseLexeme = { id: 'kaffee', lemma: 'Kaffee', article: 'der', english: 'coffee', level: 'A1', pos: 'noun', topic: 'food', sourceId: 'test', sourceUrl: 'https://example.com' };
    document.body.innerHTML = renderWordDetail(courseWordDetail(word, { example: narrative }));
    const dispose = installSentenceTranslations(document);
    try {
      document.querySelector<HTMLButtonElement>('.word-detail-example [data-sentence-word-index="0"]')!.click();
      expect([...document.querySelectorAll('.sentence-translation-tooltip mark')].map(mark => mark.textContent)).toEqual(['Would', 'like']);
    } finally { dispose(); }
  });

  it('does not fall back to a cached prompt when the server withholds the selected example', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })));
    configureContentSession(() => 'example-token', { courseId: 'course' });
    expect(await loadExerciseExample({ ...exercise, sentenceId: sentence.id })).toBeUndefined();
  });

  it('shows the same authored support and token interaction in both grammar containers', () => {
    registerSentence(sentence);
    const markup = renderCourseExample({ sentenceId: sentence.id, german: sentence.text, english: 'A cached instruction' });
    document.body.innerHTML = `<section class="grammar-route"><blockquote>${markup}</blockquote></section><div class="course-intro-examples"><p>${markup}</p></div>`;
    const dispose = installSentenceTranslations(document);
    try {
      for (const surface of document.querySelectorAll('.grammar-route,.course-intro-examples')) {
        expect(surface.querySelector('[data-sentence-inline-translation]')?.textContent).toBe('Would you like coffee?');
        surface.querySelector<HTMLButtonElement>('[data-sentence-word-index="1"]')!.click();
        expect(surface.querySelector('[data-sentence-inline-translation] mark')?.textContent).toBe('coffee');
      }
    } finally { dispose(); }
  });
});
