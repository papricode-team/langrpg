// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogueView, type DialoguePresentation } from './dialogue-view';

let view: DialogueView | undefined;
afterEach(() => { view?.destroy(); view = undefined; document.body.replaceChildren(); });

function fixture(overrides: Partial<DialoguePresentation> = {}) {
  const actions = { action: vi.fn(), choice: vi.fn(), answer: vi.fn(), gloss: vi.fn() };
  view = new DialogueView(actions);
  const presentation: DialoguePresentation = {
    title: 'At the café', name: 'Willow', portrait: '', index: 0, total: 2, help: false, busy: false,
    line: { id: 'coffee-line', speaker: 'marta', german: 'Möchtest du einen Kaffee?', english: 'Would you like a coffee?', clipId: 'coffee-line' },
    glosses: { möchtest: 'would like', du: 'you', einen: 'a (accusative masculine)', kaffee: 'coffee' },
    ...overrides,
  };
  view.render(presentation);
  const word = (text: string) => view!.host.querySelector<HTMLButtonElement>(`button[aria-label="Meaning of ${text}"]`)!;
  const translation = () => view!.host.querySelector<HTMLElement>('.dialogue-translation');
  return { view, actions, presentation, word, translation };
}

describe('conversation word lookup', () => {
  it('shows an icon audio toggle outside the text and preserves its keyboard focus', () => {
    const f = fixture({ audioEnabled: false });
    const toggle = () => f.view.host.querySelector<HTMLButtonElement>('[data-dialogue-action="audio"]')!;
    expect(toggle().closest('.dialogue-heading')).not.toBeNull();
    expect(toggle().textContent).toBe('');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(f.view.host.querySelector<HTMLButtonElement>('[data-dialogue-action="listen"]')!.disabled).toBe(true);
    toggle().focus(); toggle().click();
    expect(f.actions.action).toHaveBeenCalledWith('audio');
    f.view.render({ ...f.presentation, audioEnabled: true });
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(f.view.host.querySelector<HTMLButtonElement>('[data-dialogue-action="listen"]')!.disabled).toBe(false);
    expect(document.activeElement).toBe(toggle());
  });

  it('reveals the whole English sentence and marks the selected contextual counterpart', () => {
    const f = fixture();
    expect(f.translation()).toBeNull();
    f.word('Kaffee').click();
    expect(f.translation()?.textContent).toBe('Would you like a coffee?');
    expect(f.translation()?.querySelector('mark')?.textContent).toBe('coffee');
    expect(f.word('Kaffee').classList.contains('is-selected')).toBe(true);
    expect(f.word('Kaffee').getAttribute('aria-pressed')).toBe('true');
    expect(f.actions.gloss).toHaveBeenCalledTimes(1);
    expect(f.actions.action).not.toHaveBeenCalled();
  });

  it('moves the English and German selections when another word is looked up', () => {
    const f = fixture();
    f.word('Kaffee').click();
    f.word('du').click();
    expect(f.translation()?.textContent).toBe('Would you like a coffee?');
    expect([...f.translation()!.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['you']);
    expect(f.word('du').classList.contains('is-selected')).toBe(true);
    expect(f.word('du').getAttribute('aria-pressed')).toBe('true');
    expect(f.word('Kaffee').classList.contains('is-selected')).toBe(false);
    expect(f.word('Kaffee').getAttribute('aria-pressed')).toBe('false');
    expect(f.actions.gloss).toHaveBeenCalledTimes(2);
  });

  it('uses the article in the sentence when its dictionary gloss includes a grammar note', () => {
    const f = fixture();
    f.word('einen').click();
    expect(f.translation()?.textContent).toBe('Would you like a coffee?');
    expect(f.translation()?.querySelector('mark')?.textContent).toBe('a');
    expect(f.word('einen').getAttribute('aria-pressed')).toBe('true');
    expect(f.actions.gloss).toHaveBeenCalledTimes(1);
  });

  it('keeps lookup and the typed gate answer when the same line is replayed or rendered again', () => {
    const f = fixture({ gate: { id: 'coffee-answer', itemId: 'coffee-answer', mode: 'type', prompt: 'Ask for a coffee.', german: 'Einen Kaffee, bitte.', english: 'A coffee, please.', answer: 'Einen Kaffee, bitte.', hint: 'Begin with Einen.', explanation: '' } });
    f.view.host.querySelector<HTMLInputElement>('#dialogue-answer')!.value = 'Einen Kaffee, bitte.';
    f.word('Kaffee').click();
    f.view.host.querySelector<HTMLButtonElement>('[aria-label="Listen to this line"]')!.click();
    expect(f.actions.action).toHaveBeenCalledWith('listen');
    f.view.render({ ...f.presentation, help: true, error: 'Keep your reply here.' });
    expect(f.view.host.querySelector<HTMLInputElement>('#dialogue-answer')!.value).toBe('Einen Kaffee, bitte.');
    expect(f.translation()?.textContent).toBe('Would you like a coffee?');
    expect(f.translation()?.querySelector('mark')?.textContent).toBe('coffee');
    expect(f.word('Kaffee').getAttribute('aria-pressed')).toBe('true');
    expect(f.actions.gloss).toHaveBeenCalledTimes(1);
  });

  it('clears lookup when a new line is displayed or a closed conversation is opened again', () => {
    const f = fixture();
    f.word('Kaffee').click();
    f.view.render({ ...f.presentation, index: 1, line: { id: 'bread-line', speaker: 'marta', german: 'Möchtest du Brot?', english: 'Would you like bread?', clipId: 'bread-line' } });
    expect(f.translation()).toBeNull();
    expect(f.view.host.querySelector('.dialogue-word.is-selected')).toBeNull();
    f.view.render(f.presentation);
    f.word('Kaffee').click();
    f.view.close();
    expect(f.view.host.hidden).toBe(true);
    f.view.render(f.presentation);
    expect(f.translation()).toBeNull();
    expect(f.view.host.querySelector('.dialogue-word.is-selected')).toBeNull();
    expect(f.actions.gloss).toHaveBeenCalledTimes(2);
  });

  it('starts a distinct dialogue line clean even when its text and audio clip are repeated', () => {
    const f = fixture();
    f.word('Kaffee').click();
    f.view.render({ ...f.presentation, index: 1, line: { ...f.presentation.line, id: 'later-coffee-line' } });
    expect(f.translation()).toBeNull();
    expect(f.view.host.querySelector('.dialogue-word.is-selected')).toBeNull();
    expect(f.word('Kaffee').getAttribute('aria-pressed')).toBe('false');
    expect(f.actions.gloss).toHaveBeenCalledTimes(1);
  });

  it('personalizes the whole English lookup without interpreting a player name as HTML', () => {
    const name = '<img src=x onerror="alert(1)">& Willow';
    const f = fixture({ name, line: { id: 'personal-coffee', speaker: 'marta', german: 'Hallo {name}, möchtest du einen Kaffee?', english: 'Would you like a coffee, {name}?', clipId: 'personal-coffee' } });
    f.word('Kaffee').click();
    expect(f.translation()?.textContent).toBe(`Would you like a coffee, ${name}?`);
    expect(f.translation()?.querySelector('mark')?.textContent).toBe('coffee');
    expect(f.view.host.querySelector('img')).toBeNull();
    expect(f.view.host.querySelector('[onerror]')).toBeNull();
    expect(f.actions.gloss).toHaveBeenCalledTimes(1);
  });
});
