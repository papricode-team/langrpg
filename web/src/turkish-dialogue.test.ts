// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestController } from './quest-controller';
import { emptyProgress, type Progress } from './api';
import { emptyStory } from './dialogue';
import { installOverlay, setBaseLanguage } from './i18n';
import { authoredTurkishOverlay as turkishOverlay } from './test-support/content-fixtures';
import { dialogueMarkup } from './dialogue-view';
import { questGraph } from './quest-graph';

let controller: QuestController | undefined;
beforeEach(async () => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) });
  installOverlay(turkishOverlay);
  await setBaseLanguage('tr');
});
afterEach(async () => { controller?.destroy(); controller = undefined; document.body.innerHTML = ''; installOverlay(undefined); await setBaseLanguage('en'); vi.unstubAllGlobals(); });

function fixture(stage: 'intro' | 'gate' = 'intro', questId = 'a1-arrival', beginner = false) {
  let progress: Progress = { ...emptyProgress(), story: emptyStory() };
  progress.story!.nodes[questId] = stage;
  const api = {
    request: vi.fn(async () => ({ attemptId: 'saved', correct: false, reason: 'Compare your answer with the authored target, then try again.', progress })),
    inspectStory: vi.fn(),
    storyTransition: vi.fn(async () => ({ story: progress.story!, progress })),
  };
  const options = { beginnerMode: () => beginner, api: api as never, progress: () => progress, playerName: () => 'Deniz', portrait: () => '', speak: vi.fn(), audioEnabled: () => true, setAudioEnabled: vi.fn(), stopSpeech: vi.fn(), onOpen: vi.fn(), onClose: vi.fn(), onProgress: (next: Progress) => { progress = next; }, onInvestigate: vi.fn(), onComplete: vi.fn(), expose: vi.fn() };
  controller = new QuestController(options);
  return { api, options, controller };
}

describe('dialogue with Turkish support', () => {
  it('shows requested Turkish meanings and Turkish tool labels, with the German unchanged', async () => {
    const f = fixture('intro', 'a1-arrival', true);
    await f.controller.open('a1-arrival');
    const line = document.querySelector('.dialogue-line')!;
    expect(line.getAttribute('lang')).toBe('de');
    expect(line.textContent).toBe('Guten Morgen! Willkommen in Lindenhafen.');
    expect(document.querySelector('.dialogue-translation')).toBeNull();
    expect(document.querySelector('.dialogue-choice-phrase [lang]:not([lang="de"])')).toBeNull();
    expect(document.querySelector('[data-dialogue-action="translate"]')?.getAttribute('aria-pressed')).toBe('false');
    document.querySelector<HTMLButtonElement>('[data-dialogue-action="translate"]')!.click();
    const meaning = document.querySelector('.dialogue-translation')!;
    expect(meaning.getAttribute('lang')).toBe('tr');
    expect(meaning.textContent).toBe(turkishOverlay.story['dialogue:a1-arrival-intro-0'].tr);
    expect(meaning.textContent).not.toContain('Good morning');
    const tools = document.querySelector('.dialogue-tools')!.textContent!;
    expect(tools).toContain(turkishOverlay.ui['Listen again']);
    expect(tools).toContain(turkishOverlay.ui['What did they say?']);
    expect(tools).not.toContain('What did they say?');
    // Reply meanings are Turkish too; the German reply ids sent to the server are unchanged.
    const reply = document.querySelector<HTMLButtonElement>('[data-dialogue-choice="Guten Morgen!"]')!;
    expect(reply.parentElement?.querySelector('.dialogue-choice-phrase [lang]:not([lang="de"])')!.getAttribute('lang')).toBe('tr');
    expect(reply.parentElement?.querySelector('.dialogue-choice-phrase [lang]:not([lang="de"])')!.textContent).not.toBe('Good morning!');
    document.querySelector<HTMLButtonElement>('[data-dialogue-action="translate"]')!.click();
    expect(document.querySelector('.dialogue-translation')).toBeNull();
    expect(document.querySelector('.dialogue-choice-phrase [lang]:not([lang="de"])')).toBeNull();
    expect(document.querySelector('[data-dialogue-action="translate"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.dialogue-line')!.textContent).toBe(line.textContent);
  });

  it('records assistance exactly as in English when the meaning is revealed', async () => {
    const f = fixture('gate', 'a1-arrival');
    await f.controller.open('a1-arrival');
    for (let step = 0; step < 80 && !document.querySelector('#dialogue-answer'); step++) document.querySelector<HTMLButtonElement>('[data-dialogue-action="next"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-dialogue-action="translate"]')!.click();
    expect(f.options.expose).toHaveBeenCalledWith('a1-arrival-exercise-7');
    document.querySelector<HTMLButtonElement>('[data-dialogue-action="hint"]')!.click();
    expect(document.querySelector('.dialogue-feedback')!.textContent).toBe(turkishOverlay.course.exercises['a1-arrival-exercise-7'].tr.hint);
    // The gate prompt and the exact-answer meaning are Turkish; the answer stays German.
    expect(document.querySelector('.dialogue-gate label')!.textContent).toBe(turkishOverlay.story['gate-prompt:a1-arrival'].tr);
    document.querySelector<HTMLButtonElement>('[data-dialogue-action="show-answer"]')!.click();
    expect(document.querySelector('#dialogue-exact-answer [lang="de"]')!.textContent).toBe('Noch einmal, bitte.');
    const input = document.querySelector<HTMLInputElement>('#dialogue-answer')!;
    input.value = 'Noch mal';
    input.form!.requestSubmit();
    await vi.waitFor(() => expect(f.api.request).toHaveBeenCalled());
    // Grading input is language-independent: same body as the English route, assistance flagged.
    expect(f.api.request.mock.calls[0]).toMatchObject(['/attempt', { exerciseId: 'a1-arrival-exercise-7', answer: 'Noch mal', hinted: true, mode: 'production' }]);
    expect(Object.keys((f.api.request.mock.calls[0] as unknown[])[1] as object).sort()).toEqual(['answer', 'exerciseId', 'hinted', 'id', 'itemId', 'mode', 'questId', 'responseTimeMs', 'sceneAttempt']);
    // English server feedback is replaced with the same rule's Turkish text.
    await vi.waitFor(() => expect(document.querySelector('.dialogue-feedback')?.textContent).not.toContain('Compare your answer'));
  });

  it('shows a tapped word’s Turkish gloss and never highlights a guess', () => {
    const graph = questGraph('a1-arrival')!;
    const line = graph.nodes.flatMap(node => node.lines).find(item => item.id === 'a1-arrival-intro-4')!;
    const html = dialogueMarkup({ title: 'x', line, name: 'Deniz', portrait: '', index: 0, total: 1, help: false, busy: false, glosses: { laterne: 'fener' }, lookup: { word: 'Laterne', index: 6, gloss: 'fener' } });
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(host.querySelector('.dialogue-word-gloss')!.textContent).toContain('fener');
    const marks = [...host.querySelectorAll('.dialogue-translation mark')].map(mark => mark.textContent);
    for (const mark of marks) expect(mark).toMatch(/^fener/i);
    // An untranslated gloss keeps the word tappable but shows no meaning and no highlight.
    host.innerHTML = dialogueMarkup({ title: 'x', line, name: 'Deniz', portrait: '', index: 0, total: 1, help: false, busy: false, glosses: { laterne: '' }, lookup: { word: 'Laterne', index: 6, gloss: '' } });
    expect(host.querySelector('[data-dialogue-gloss=""]')).not.toBeNull();
    expect(host.querySelector('.dialogue-word-gloss')).toBeNull();
    expect(host.querySelector('.dialogue-translation mark')).toBeNull();
    expect(host.querySelector('.dialogue-translation')!.textContent).toBe(turkishOverlay.story['dialogue:a1-arrival-intro-4'].tr);
  });
});
