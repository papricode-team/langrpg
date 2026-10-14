// @vitest-environment happy-dom
import './test-support/expedition-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { installOverlay, setBaseLanguage } from './i18n';
import { getInteriorObject, interiors } from './interiors';
import { courseWordDetail, interiorWordDetail, renderWordDetail } from './word-detail';
import type { CourseLexeme } from './course';

afterEach(async () => { await setBaseLanguage('en', { persist: false }); installOverlay(undefined); });

const word: CourseLexeme = { id: 'kaffee-noun', article: 'der', lemma: 'Kaffee', english: 'coffee', level: 'A1', pos: 'noun', topic: 'food', sourceId: 'dictionary', sourceUrl: 'https://example.com/coffee', plural: 'die Kaffees', forms: ['des Kaffees'] };

describe('shared word detail sheet and pane', () => {
  it('keeps lexical facts, a complete sentence example, evidence and practice in the detail view', () => {
    const host = document.createElement('div');
    host.innerHTML = renderWordDetail(courseWordDetail(word, {
      example: [{ german: 'Der Kaffee ist warm.', english: 'The coffee is warm.' }],
      details: [{ label: 'Read', value: 'retained' }, { label: 'Attempts', value: 0 }],
    }), { backAction: 'journal' });
    expect(host.querySelector('h2')?.textContent).toBe('der Kaffee');
    expect(host.querySelector('p')?.textContent).toBe('coffee');
    expect(host.querySelector('dl')?.textContent).toContain('Pluraldie KaffeesFormsdes KaffeesReadretained');
    expect(host.querySelector('dl')?.textContent).not.toContain('Attempts');
    expect(host.querySelector('.word-detail-example')?.textContent).toBe('Der Kaffee ist warm.');
    expect(host.querySelector('[data-speak="der Kaffee"]')).not.toBeNull();
    expect(host.querySelector('[data-speak="Der Kaffee ist warm."]')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('[data-word-practice]')?.dataset.wordPractice).toBe(word.id);
    expect(host.querySelector<HTMLElement>('[data-word-detail-back]')?.dataset.wordDetailBack).toBe('journal');
  });

  it('hides empty and placeholder plural/forms/evidence rows and preserves nominative article forms', () => {
    const host = document.createElement('div');
    host.innerHTML = renderWordDetail(courseWordDetail({ ...word, lemma: 'Beamter', articleForm: 'Beamte', plural: '—', forms: ['', '—'] }, { details: [{ label: 'Empty', value: '' }, { label: 'Zero', value: '0' }] }));
    expect(host.querySelector('h2')?.textContent).toBe('der Beamte');
    expect(host.querySelector('dl, blockquote, small, .eyebrow')).toBeNull();
  });

  it('does not repeat a lexical recognition prompt as an example sentence', () => {
    const host = document.createElement('div');
    host.innerHTML = renderWordDetail(courseWordDetail(word, { example: [{ german: 'der Kaffee', english: 'coffee' }] }));
    expect(host.querySelector('.word-detail-example')).toBeNull();
    expect(host.querySelectorAll('[data-speak]')).toHaveLength(1);
  });

  it('uses authored interior meanings/examples and only links to practice without recording a result', () => {
    const object = getInteriorObject('interior:cafe:coffee')!;
    const detail = interiorWordDetail(object, 1)!;
    expect(detail.meaning).toBe('milk');
    expect(detail.practice).toEqual({ kind: 'interior', id: object.id });
    expect(detail.example?.[0].german).toContain('Milch');
    const host = document.createElement('div');
    host.innerHTML = renderWordDetail(detail);
    expect(host.querySelector('dl')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-practice-interior]')?.dataset.practiceInterior).toBe(object.id);
    expect(interiorWordDetail(object, -1)).toBeUndefined();
    expect(interiorWordDetail(object, 99)).toBeUndefined();
    expect(interiorWordDetail(object, 0, word)?.practice).toEqual({ kind: 'word', id: word.id });
  });

  it('provides a translated meaning and example for every normal interior word in Turkish', async () => {
    installOverlay({ story: {}, ui: {}, course: { lexicon: {}, grammar: {}, exercises: {} } });
    await setBaseLanguage('tr', { persist: false });
    for (const object of interiors.flatMap(room => room.objects)) {
      object.vocabulary.forEach((word, index) => {
        const detail = interiorWordDetail(object, index)!;
        expect(detail.meaning.trim(), word.lemma).not.toBe('');
        expect(detail.meaningLang).toBe('tr');
        expect(detail.example?.length ?? 0, word.lemma).toBeGreaterThan(0);
      });
    }
    const detail = interiorWordDetail(getInteriorObject('interior:cafe:coffee')!, 1)!;
    const host = document.createElement('div');
    host.innerHTML = renderWordDetail(detail);
    expect(host.querySelector('p')?.textContent).toBe('süt');
    expect(host.querySelector<HTMLElement>('.translated-sentence')?.dataset.translationLang).toBe('tr');
    expect(host.querySelector<HTMLElement>('.word-detail-example .translated-sentence')?.dataset.translation).toBe('Sütlü bir kahve, lütfen.');
  });
});
