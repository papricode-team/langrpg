// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogueView } from './dialogue-view';
import { createInteriorConversationState, renderInteriorConversation } from './interior-conversations';
import { installSentenceTranslations } from './sentence-translations';
import { clearSentences, registerSentence } from './translated-sentence';

let view: DialogueView | undefined;
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; view?.destroy(); view = undefined; clearSentences(); document.body.replaceChildren(); });

function authoredCoffee() {
  registerSentence({ id: 'coffee', text: 'Möchtest du einen Kaffee?', target: 'de', words: [
    { source: { text: 'Möchtest', occurrence: 1 }, range: { start: 0, end: 8 }, glosses: { en: 'would like' } },
    { source: { text: 'Kaffee', occurrence: 1 }, range: { start: 18, end: 24 }, glosses: { en: 'coffee' } },
  ], translations: { en: { text: 'Would you like a coffee?', words: [
    { source: { text: 'Möchtest', occurrence: 1 }, sourceRange: { start: 0, end: 8 }, targets: [{ text: 'Would', occurrence: 1 }, { text: 'like', occurrence: 1 }], targetRanges: [{ start: 0, end: 5 }, { start: 10, end: 14 }] },
    { source: { text: 'Kaffee', occurrence: 1 }, sourceRange: { start: 18, end: 24 }, targets: [{ text: 'coffee', occurrence: 1 }], targetRanges: [{ start: 17, end: 23 }] },
  ] } } });
}

describe('authored reply surfaces', () => {
  it('looks up and navigates choice words without submitting a reply or closing the dialogue', () => {
    authoredCoffee();
    const actions = { action: vi.fn(), choice: vi.fn(), answer: vi.fn(), gloss: vi.fn() };
    view = new DialogueView(actions);
    view.render({ title: 'Café', name: 'Ada', portrait: '', index: 0, total: 1, help: false, busy: false, glosses: {},
      line: { id: 'hello', speaker: 'Marta', german: 'Hallo!', english: 'Hello!', clipId: '' },
      choices: [{ id: 'ask', sentenceId: 'coffee', german: 'Möchtest du einen Kaffee?', english: '', next: '', effects: [] }],
    });
    dispose = installSentenceTranslations(view.host);
    const first = view.host.querySelector<HTMLButtonElement>('[data-sentence-word-index="0"]')!;
    first.focus(); first.click();
    expect([...document.querySelectorAll('.sentence-translation-tooltip mark')].map(mark => mark.textContent)).toEqual(['Would', 'like']);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement?.textContent).toBe('Kaffee');
    expect(document.querySelector('.sentence-translation-tooltip mark')?.textContent).toBe('coffee');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(actions.choice).not.toHaveBeenCalled(); expect(actions.action).not.toHaveBeenCalled();
    view.host.querySelector<HTMLButtonElement>('[data-dialogue-choice="ask"]')!.click();
    expect(actions.choice).toHaveBeenCalledExactlyOnceWith('ask');
  });

  it('keeps interior reply text outside its submit control so authored word help stays independent', () => {
    registerSentence({ id: 'milk', text: 'Einen Kaffee mit Milch, bitte.', target: 'de', words: [
      { source: { text: 'Kaffee', occurrence: 1 }, range: { start: 6, end: 12 }, glosses: { en: 'coffee' } },
    ], translations: { en: { text: 'A coffee with milk, please.', words: [
      { source: { text: 'Kaffee', occurrence: 1 }, sourceRange: { start: 6, end: 12 }, targets: [{ text: 'coffee', occurrence: 1 }], targetRanges: [{ start: 2, end: 8 }] },
    ] } } });
    document.body.innerHTML = renderInteriorConversation(createInteriorConversationState('interior:cafe:coffee')!);
    dispose = installSentenceTranslations(document);
    const word = document.querySelector<HTMLButtonElement>('.conversation-choice-line [data-sentence-word-index]')!;
    expect(word.closest('[data-interior-choice]')).toBeNull(); word.click();
    expect(document.querySelector('.sentence-translation-tooltip mark')?.textContent).toBe('coffee');
    expect(document.querySelector('[data-interior-choice]')?.getAttribute('aria-label')).toContain('Einen Kaffee mit Milch, bitte.');
  });
});
