// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountExpeditionEncounter, pendingEncounterCommands } from './expedition-encounter';
import { encounterLearning, type ExpeditionLearning } from './expedition-learning';
import { emptyProgress } from './api';
import { clearSentences, registerSentence } from './translated-sentence';
import { installSentenceTranslations } from './sentence-translations';
import { setBaseLanguage } from './i18n';
import type { ExpeditionEncounter } from './expeditions';

let root: HTMLElement, stop: () => void, mounted: ReturnType<typeof mountExpeditionEncounter>;
const encounter = { id: 'authored-encounter', sentenceId: 'ticket-sentence', title: 'A ticket', prompt: 'Choose a reply.', difficulty: 'A1', gameKind: 'dialogue', german: 'Ihre Fahrkarte, bitte.', translation: 'Your ticket, please.', choices: [{ text: 'Hier, bitte.', correct: true, response: 'HIDDEN LOCAL ANSWER' }, { text: 'Nein.', correct: false, response: 'HIDDEN LOCAL CORRECTION' }] } as unknown as ExpeditionEncounter;
beforeEach(async () => {
  await setBaseLanguage('tr');
  registerSentence({ id: 'ticket-sentence', text: encounter.german, target: 'de', translations: { tr: { text: 'Biletiniz, lütfen.', words: [{ source: { text: 'Fahrkarte', occurrence: 1 }, targets: [{ text: 'Biletiniz', occurrence: 1 }], sourceRange: { start: 5, end: 14 }, targetRanges: [{ start: 0, end: 9 }] }] } }, words: [{ source: { text: 'Fahrkarte', occurrence: 1 }, range: { start: 5, end: 14 }, glosses: { tr: 'bilet' } }] });
  encounterLearning.set(encounter.id, { encounterId: encounter.id, exerciseIds: { recognition: 'read-exercise', listening: 'listen-exercise' }, audio: '/audio/ticket.mp3', supported: false } as never);
  root = document.createElement('section'); document.body.append(root); stop = installSentenceTranslations(root);
});
afterEach(async () => { mounted?.destroy(); stop(); pendingEncounterCommands.clear(); encounterLearning.delete(encounter.id); clearSentences(); document.body.replaceChildren(); vi.restoreAllMocks(); await setBaseLanguage('en'); });
function fixture() {
  const progress = emptyProgress();
  const learning = { captureOwner: () => () => true, ready: () => true, expose: vi.fn().mockResolvedValue(undefined), create: vi.fn((exerciseId, answer, context) => ({ id: 'immutable-receipt', exerciseId, itemId: 'ticket-item', answer, hinted: context.hinted, mode: 'recognition', responseTimeMs: 100, miniGameId: 'expedition-encounters', regionId: 'region', contentId: 'content', level: 'A1' })), submit: vi.fn().mockResolvedValue({ progress }) };
  const options = { learning: learning as unknown as ExpeditionLearning, progress: () => progress, saveStory: vi.fn().mockResolvedValue({ progress, feedback: 'Server recorded feedback.' }), onProgress: vi.fn(), speak: vi.fn().mockResolvedValue(undefined), stopSpeech: vi.fn(), silent: true, previouslyAnswered: false, onHelp: vi.fn() };
  mounted = mountExpeditionEncounter(root, encounter, options);
  return { learning, options, click: (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click() };
}

describe('authored expedition sentence rendering', () => {
  it('uses Turkish support and marks the authored inflected counterpart in both tooltip and visible meaning', () => {
    const f = fixture();
    f.click('[data-enc-english]');
    expect(root.querySelector('[data-enc-english]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-enc-english]')?.textContent).toContain('Türkçe');
    expect(root.querySelector('[data-sentence-inline-translation]')?.textContent).toBe('Biletiniz, lütfen.');
    f.click('.sentence-word');
    expect(root.querySelector('[data-sentence-inline-translation] mark')?.textContent).toBe('Biletiniz');
    expect(document.querySelector('[role="tooltip"] mark')?.textContent).toBe('Biletiniz');
    expect(f.options.onHelp).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.translated-sentence')?.getAttribute('lang')).toBe('de');
  });
  it('records word lookup as assistance and uses only the server recorded reply feedback', async () => {
    const f = fixture();
    f.click('.sentence-word'); f.click('[data-enc-answer="0"]');
    await vi.waitFor(() => expect(f.learning.create).toHaveBeenCalled());
    expect(f.learning.create.mock.calls[0][2]).toMatchObject({ hinted: true });
    await vi.waitFor(() => expect(root.textContent).toContain('Server recorded feedback.'));
    expect(root.textContent).not.toContain('HIDDEN LOCAL ANSWER'); expect(root.textContent).not.toContain('HIDDEN LOCAL CORRECTION');
  });
});
