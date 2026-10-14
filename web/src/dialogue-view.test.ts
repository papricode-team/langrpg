// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogueView, type DialoguePresentation } from './dialogue-view';
import { clearSentences, registerSentence } from './translated-sentence';

let view: DialogueView | undefined;
afterEach(() => { view?.destroy(); view = undefined; document.body.replaceChildren(); clearSentences(); });

function fixture(overrides: Partial<DialoguePresentation> = {}) {
  const actions = { action: vi.fn(), choice: vi.fn(), answer: vi.fn(), gloss: vi.fn() };
  view = new DialogueView(actions);
  const presentation: DialoguePresentation = {
    title: 'At the café', name: 'Willow', portrait: '', index: 0, total: 2, help: false, busy: false,
    line: { id: 'coffee-line', speaker: 'marta', german: 'Möchtest du einen Kaffee?', english: 'Would you like a coffee?', clipId: 'coffee-line' },
    glosses: { möchtest: 'would like', du: 'you', einen: 'a (accusative masculine)', kaffee: 'coffee' },
    ...overrides,
  };
  const source = presentation.line.german, translated = presentation.line.english;
  const authored = [['Möchtest', ['Would', 'like']], ['möchtest', ['Would', 'like']], ['du', ['you']], ['einen', ['a']], ['Kaffee', ['coffee']]] as [string, string[]][];
  const words = authored.filter(([word]) => source.includes(word)).map(([word, targets]) => ({ source: { text: word, occurrence: 1 }, targets: targets.map(text => ({ text, occurrence: 1 })), sourceRange: { start: source.indexOf(word), end: source.indexOf(word) + word.length }, targetRanges: targets.map(text => ({ start: translated.indexOf(text), end: translated.indexOf(text) + text.length })) }));
  registerSentence({ id: presentation.line.id, text: source, target: 'de', translations: { en: { text: translated, words } }, words: words.map(word => ({ source: word.source, range: word.sourceRange, glosses: { en: presentation.glosses[word.source.text.toLocaleLowerCase('de')] } })) });
  view.render(presentation);
  const word = (text: string) => view!.host.querySelector<HTMLButtonElement>(`button[aria-label="Meaning of ${text}"]`)!;
  const translation = () => view!.host.querySelector<HTMLElement>('.dialogue-translation-body');
  return { view, actions, presentation, word, translation };
}

describe('conversation word lookup', () => {
  it('keeps the plot-critical letter meaning hidden until requested', () => {
    const f = fixture({ line: { id: 'letter', speaker: 'lina', german: 'Bevor du uns wieder auslöschst, komm.', english: 'Before you erase us again, come.', clipId: 'letter' } });
    expect(f.translation()).toBeNull();
    expect(f.view.host.querySelector('[data-dialogue-action="translate"]')?.getAttribute('aria-pressed')).toBe('false');
    f.view.render({ ...f.presentation, help: true });
    expect(f.translation()?.textContent).toBe('Before you erase us again, come.');
  });
  it('shows the translation toggle state and preserves keyboard focus when toggled', () => {
    const f = fixture();
    const toggle = () => f.view.host.querySelector<HTMLButtonElement>('[data-dialogue-action="translate"]')!;
    toggle().focus(); toggle().click();
    expect(f.actions.action).toHaveBeenCalledWith('translate');
    f.view.render({ ...f.presentation, help: true });
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(toggle());
    f.view.render(f.presentation);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(toggle());
    expect(f.translation()).toBeNull();
  });
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
    f.view.render({ ...f.presentation, help: false });
    expect(f.translation()).toBeNull();
    expect(f.view.host.querySelector('.dialogue-word.is-selected')).toBeNull();
    expect(f.view.host.querySelector<HTMLInputElement>('#dialogue-answer')!.value).toBe('Einen Kaffee, bitte.');
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

describe('conversation history', () => {
  it('keeps earlier lines and chosen replies above the current line and clears on close', () => {
    const f = fixture({ choices: [{ id: 'yes', german: 'Ja, gern.', english: 'Yes, please.', next: '', effects: [] }] });
    expect(f.view.host.querySelector('.dialogue-history')).toBeNull();
    f.view.render({ ...f.presentation, help: true });
    expect(f.view.host.querySelector('.dialogue-history')).toBeNull();
    f.view.host.querySelector<HTMLButtonElement>('[data-dialogue-choice="yes"]')!.click();
    expect(f.actions.choice).toHaveBeenCalledWith('yes');
    f.view.render({ ...f.presentation, busy: true });
    f.view.render({ ...f.presentation, choices: [], index: 1, line: { id: 'milk', speaker: 'marta', german: 'Mit Milch?', english: 'With milk?', clipId: 'milk' } });
    const entries = [...f.view.host.querySelectorAll('.dialogue-history li')].map(li => li.textContent);
    expect(entries).toEqual(['marta' + 'Möchtest du einen Kaffee?', 'You' + 'Ja, gern.']);
    expect(f.view.host.querySelector('.dialogue-history')!.nextElementSibling?.classList.contains('dialogue-line')).toBe(true);
    f.view.close();
    f.view.render(f.presentation);
    expect(f.view.host.querySelector('.dialogue-history')).toBeNull();
  });
});

describe('conversation reply controls', () => {
  it('keeps both authored and plain reply help separate from submission', () => {
    const choices = [
      { id: 'authored', german: 'Möchtest du einen Kaffee?', english: 'Would you like a coffee?', next: '', effects: [] },
      { id: 'plain', german: 'Nein, danke, {name}.', english: 'No, thank you, {name}.', next: '', effects: [] },
    ];
    const f = fixture({ choices });
    expect(f.view.host.querySelector('.dialogue-choice [data-sentence-inline-translation]')).toBeNull();
    f.view.render({ ...f.presentation, help: true });
    const rows = [...f.view.host.querySelectorAll('.dialogue-choice')];
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.querySelector('[data-sentence-inline-translation]')?.textContent)).toEqual(['Would you like a coffee?', 'No, thank you, Willow.']);
    for (const row of rows) {
      const phrase = row.querySelector<HTMLElement>('.translated-sentence')!;
      expect(phrase.closest('[data-dialogue-choice]')).toBeNull();
      phrase.click();
    }
    expect(f.actions.choice).not.toHaveBeenCalled();
    const submit = rows[1].querySelector<HTMLButtonElement>('[data-dialogue-choice]')!;
    expect(submit.getAttribute('aria-label')).toBe('Say it: Nein, danke, Willow.');
    submit.click();
    expect(f.actions.choice).toHaveBeenCalledExactlyOnceWith('plain');
    f.view.render({ ...f.presentation, busy: true });
    for (const button of f.view.host.querySelectorAll<HTMLButtonElement>('[data-dialogue-choice]')) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    expect(f.actions.choice).toHaveBeenCalledTimes(1);
  });
});

