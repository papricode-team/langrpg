// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type AttemptResult } from '../api';
import { miniGameDefinitions } from './catalogue';
import { loadMiniGame } from './index';
import { buildLetterGrid, isLetterWord, lineCells, maskWord, nextWordGame, scrambleLetters, WordMemoryGame } from './word-games';
import { isWordGame } from './word-game-mechanics';
import type { GameItem, MiniGameHost, MiniGameOptions, RoundResult } from './types';

let frames: Map<number, FrameRequestCallback>, frameId: number, games: WordMemoryGame[];
const flush = async () => { for (let index = 0; index < 32; index++) await Promise.resolve(); };
async function advance(ms: number) {
  for (let left = ms; left > 0;) { const delta = Math.min(100, left); left -= delta; await vi.advanceTimersByTimeAsync(delta); const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(performance.now()); await flush(); }
}
const item = (lemma: string, english: string, extra: Partial<GameItem> = {}): GameItem => ({ lexemeId: `${lemma.toLowerCase()}-id`, lemma, english, topic: 'food', level: 'A1', pos: 'noun', audio: '', exerciseIds: { recognition: '', listening: '', production: '' }, stability: 0, due: { recognition: false, listening: false, production: false }, seen: { recognition: false, listening: false, production: false }, recalls: { recognition: 0, listening: 0, production: 0 }, ...extra });
const words = () => [item('Kaffee', 'coffee', { article: 'der', sprite: 'kaffee' }), item('Zug', 'train', { article: 'der', topic: 'travel', sprite: 'zug' }), item('Brot', 'bread', { article: 'das', sprite: 'brot' }), item('Uhr', 'clock', { article: 'die', topic: 'time', sprite: 'uhr' }), item('Haus', 'house', { article: 'das', topic: 'home', sprite: 'haus' })];
const byEnglish = new Map(words().map(word => [word.english, word]));
/** The fake server grades like the real one: the chosen lemma (or topic, or spelling) must belong to the target. */
const grade = (result: RoundResult) => {
  const target = words().find(word => word.lexemeId === result.lexemeId)!;
  return result.answerKind === 'topic' ? result.answer === target.topic : result.answer.toLocaleLowerCase('de') === target.lemma.toLocaleLowerCase('de');
};
function setup(id: string, extra: Partial<MiniGameHost> = {}, options: Partial<MiniGameOptions> = {}) {
  const root = document.createElement('div'); document.body.append(root);
  const host = { pool: vi.fn(() => words()), submit: vi.fn(async (result: RoundResult): Promise<AttemptResult> => ({ attemptId: `a-${result.lexemeId}`, correct: grade(result), xpAdded: 0, duplicate: false, correctedAnswer: result.answer, reason: 'Saved', progress: emptyProgress() })), speak: vi.fn(async () => {}), speakText: vi.fn(async () => {}), sprites: { has: vi.fn(() => true), preload: vi.fn(async () => {}), render: vi.fn((_frame: string, alt: string) => { const image = document.createElement('img'); image.alt = alt; return image; }) }, audio: { sfx: vi.fn(), stop: vi.fn() }, input: { bind: vi.fn(() => vi.fn()) }, end: vi.fn(), expose: vi.fn(), progress: () => emptyProgress(), exercises: new Map(), playerName: 'Ada', silent: false, reducedMotion: true, ...extra } as unknown as MiniGameHost;
  const game = new WordMemoryGame(miniGameDefinitions.find(game => game.id === id)!); games.push(game);
  game.mount(root, host, { level: 'A1', seed: 7, ...options });
  const start = async () => { root.querySelector<HTMLButtonElement>('[data-game-action="start"]')!.click(); await flush(); };
  const button = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!;
  const cue = () => byEnglish.get(root.querySelector('.minigame-context')?.textContent ?? '') ?? words().find(word => [word.lemma, `${word.article} ${word.lemma}`].includes(root.querySelector('.minigame-cue,.word-basket-card,.word-bells-glimpse')?.textContent ?? ''))!;
  const submitted = () => (host.submit as ReturnType<typeof vi.fn>).mock.calls.map(([result]) => result as RoundResult);
  return { root, host, game, start, button, cue, submitted };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] }); frames = new Map(); frameId = 0; games = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const storage = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { for (const game of games) game.destroy(); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('word-game helpers', () => {
  it('scrambles letters without spelling the word and masks unguessed letters', () => {
    for (const seed of [1, 2, 3, 4]) { const mixed = scrambleLetters('Bahnhof', seed); expect(mixed.join('')).not.toBe('Bahnhof'); expect([...mixed].sort()).toEqual([...'Bahnhof'].sort()); }
    expect(maskWord('Straße', new Set(['s', 'e']))).toBe('S____e');
    expect(isLetterWord({ lemma: 'Zug' })).toBe(true);
    expect(isLetterWord({ lemma: 'guten Tag' })).toBe(false);
    expect(isLetterWord({ lemma: 'Sie' })).toBe(false);
  });
  it('weaves every word into a straight line of the grid', () => {
    const grid = buildLetterGrid(['Kaffee', 'Zug', 'Straße', 'Uhr'], 8, 42);
    expect(grid.cells).toHaveLength(64);
    expect(grid.placed.map(row => row.word).sort()).toEqual(['Kaffee', 'Straße', 'Uhr', 'Zug']);
    for (const placement of grid.placed) {
      expect(lineCells(placement.cells[0], placement.cells.at(-1)!, 8)).toEqual(placement.cells);
      expect(placement.cells.map(cell => grid.cells[cell]).join('').replace(/ẞ/g, 'ß').toLocaleLowerCase('de')).toBe(placement.word.toLocaleLowerCase('de'));
    }
    expect(lineCells(0, 10, 8)).toBeUndefined();
    expect(lineCells(0, 18, 8)).toEqual([0, 9, 18]);
  });
  it('registers ten word games and rotates through all of them', () => {
    const ids = miniGameDefinitions.filter(isWordGame).map(game => game.id);
    expect(ids).toHaveLength(10);
    expect(new Set(miniGameDefinitions.filter(isWordGame).map(game => game.mechanic)).size).toBe(10);
    const seen = new Set<string>(); let id: string | undefined;
    for (let index = 0; index < 10; index++) { id = nextWordGame(id); seen.add(id); }
    expect(seen.size).toBe(10);
  });
  it('loads every word game through the shared loader', async () => {
    for (const definition of miniGameDefinitions.filter(isWordGame)) expect(await loadMiniGame(definition.id)).toBeInstanceOf(WordMemoryGame);
  });
});

describe('the ten word games submit real answers', () => {
  it('Lantern Pairs grades the meaning tied to a German word and clears matched tiles', async () => {
    const { root, start, submitted } = setup('lantern-pairs'); await start();
    const german = root.querySelector<HTMLButtonElement>('[data-wg^="de:"]')!, word = words().find(row => `${row.article} ${row.lemma}` === german.textContent)!;
    german.click(); [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="en:"]')].find(tile => tile.textContent !== word.english)!.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'recognition', answerKind: 'lexeme', hinted: false });
    expect(german.classList.contains('is-matched')).toBe(false);
    german.click(); [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="en:"]')].find(tile => tile.textContent === word.english)!.click(); await flush();
    expect(submitted()[1]).toMatchObject({ lexemeId: word.lexemeId, answer: word.lemma, hinted: true });
    expect(german.classList.contains('is-matched')).toBe(true);
  });
  it('The Honest Mirror asks for the true meaning before a rejection counts', async () => {
    const { root, start, cue, submitted } = setup('honest-mirror'); await start();
    const word = cue(), proposal = root.querySelector('.word-mirror-glass strong')!.textContent!;
    if (proposal === word.english) { root.querySelector<HTMLButtonElement>('[data-wg="true"]')!.click(); await flush(); expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, answer: word.lemma }); return; }
    root.querySelector<HTMLButtonElement>('[data-wg="false"]')!.click(); await flush();
    expect(submitted()).toHaveLength(0);
    [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="fix:"]')].find(button => button.textContent?.includes(word.english))!.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, answer: word.lemma, modality: 'recognition' });
  });
  it('The Scrambled Sign submits the word typed from its lower-case tiles as supported production', async () => {
    const { root, start, cue, submitted } = setup('scrambled-sign'); await start();
    const word = cue();
    const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.append(root); dialog.setAttribute('open', '');
    for (const letter of word.lemma) document.dispatchEvent(new KeyboardEvent('keydown', { key: letter }));
    await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'production', answer: word.lemma.toLocaleLowerCase('de'), hinted: true });
    expect(root.querySelector('.word-anagram-sign')!.textContent).toBe(word.lemma);
    expect(submitted()[0].answerKind).toBeUndefined();
  });
  it('Marta’s Market Baskets submits the chosen topic', async () => {
    const { root, start, cue, submitted } = setup('market-baskets'); await start();
    const word = cue();
    [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="basket:"]')].find(button => button.textContent?.includes({ food: 'Food', travel: 'Travel', time: 'Time', home: 'Home' }[word.topic]!))!.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, answerKind: 'topic', answer: word.topic, modality: 'recognition' });
  });
  it('Falling Leaves records a miss when the true leaf lands', async () => {
    const { start, cue, submitted } = setup('falling-leaves', { reducedMotion: false }); await start();
    const word = cue();
    await advance(15000);
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, answer: '__timeout__' });
  });
  it('Falling Leaves grades a caught leaf', async () => {
    const { root, start, cue, submitted } = setup('falling-leaves'); await start();
    const word = cue();
    [...root.querySelectorAll<HTMLButtonElement>('.word-leaf')].find(leaf => leaf.textContent?.startsWith(word.english))!.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, answer: word.lemma, answerKind: 'lexeme' });
  });
  it('The Letter Loom submits the word between the chosen first and last letters', async () => {
    const { root, start, submitted } = setup('letter-loom'); await start();
    const clue = root.querySelector('.word-loom-clues li.is-current')!.textContent!, word = byEnglish.get(clue)!;
    const cells = [...root.querySelectorAll<HTMLButtonElement>('.word-loom-cell')], size = 7, letters = cells.map(cell => cell.textContent!);
    // Find the word the way a player would: scan rows and columns for its letters.
    const target = word.lemma.toLocaleUpperCase('de'); let found: [number, number] | undefined;
    for (let start = 0; start < letters.length && !found; start++) for (const step of [1, size]) {
      const end = start + step * (target.length - 1); if (end >= letters.length || step === 1 && Math.floor(start / size) !== Math.floor(end / size)) continue;
      if (Array.from({ length: target.length }, (_, index) => letters[start + step * index]).join('') === target) found = [start, end];
    }
    expect(found).toBeDefined();
    cells[found![0]].click(); cells[found![1]].click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'production', answer: word.lemma, hinted: true });
    expect(cells[found![0]].classList.contains('is-found')).toBe(true);
  });
  it('The Lantern Fuse submits once every letter is guessed and burns on wrong letters', async () => {
    const { root, start, cue, submitted } = setup('lantern-fuse'); await start();
    const word = cue();
    const wrong = [...'qxjy'].find(letter => !word.lemma.toLowerCase().includes(letter))!;
    root.querySelector<HTMLButtonElement>(`[data-wg="letter:${wrong}"]`)!.click();
    expect(root.querySelector('.word-fuse-lives')!.textContent).toBe('6 sparks left');
    for (const letter of new Set(word.lemma.toLowerCase())) root.querySelector<HTMLButtonElement>(`[data-wg="letter:${letter}"]`)!.click();
    await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'production', answer: word.lemma, hinted: true });
  });
  it('The Fog Window grades the German name chosen for the picture', async () => {
    const { root, host, start, submitted } = setup('fog-window'); await start();
    const sprite = (host.sprites.render as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string, word = words().find(row => row.sprite === sprite)!;
    [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="fog:"]')].find(button => button.textContent?.includes(word.lemma))!.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, answer: word.lemma, modality: 'recognition', answerKind: 'lexeme' });
  });
  it('the prologue Fog Window offers picture choices and works silently', async () => {
    const {root,host,start,submitted}=setup('fog-window',{silent:true},{prologue:true}); await start();
    const label=root.querySelector('.word-fog-picture')!.textContent;
    const word=words().find(word=>label===`${word.article} ${word.lemma}`)!;
    const choice=[...root.querySelectorAll<HTMLButtonElement>('[data-wg^="fog:"]')].find(button=>button.querySelector('img')?.alt===word.english)!;
    expect(choice.textContent?.includes(word.lemma)).toBe(false);
    expect(host.speak).not.toHaveBeenCalled();
    choice.click();await flush();expect(submitted()[0]).toMatchObject({answer:word.lemma,modality:'recognition'});
  });
  it('the first prologue train prompt accepts the player name without grading a word', async () => {
    const {root,start,submitted}=setup('night-train',{}, {namePractice:true});await start();
    const input=root.querySelector<HTMLInputElement>('#word-train-name')!;
    expect(input).not.toBeNull(); input.value='Ada';
    input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(submitted()).toHaveLength(0);expect(root.querySelector('#word-train-answer')).not.toBeNull();
  });
  it('Echo Bells waits for the word to be heard and submits listening evidence', async () => {
    let finish!: () => void;
    const speak = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { root, start, submitted } = setup('echo-bells', { speak }); await start();
    const word = words().find(row => row.lexemeId === (speak.mock.calls[0] as unknown as [GameItem])[0].lexemeId)!;
    const bell = [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="bell:"]')].find(button => button.textContent?.includes(word.english))!;
    bell.click(); await flush();
    expect(submitted()).toHaveLength(0);
    finish(); await flush(); bell.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'listening', answer: word.lemma, hinted: false });
  });
  it('Echo Bells shows the word for a moment in silent mode and records reading', async () => {
    const { root, start, cue, submitted } = setup('echo-bells', { silent: true }); await start();
    const word = cue();
    await advance(1700);
    expect(root.querySelector('.word-bells-glimpse')!.classList.contains('is-faded')).toBe(true);
    [...root.querySelectorAll<HTMLButtonElement>('[data-wg^="bell:"]')].find(button => button.textContent?.includes(word.english))!.click(); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'recognition', answer: word.lemma });
  });
  it('The Night Train submits the typed word and times out when the train leaves', async () => {
    const { root, start, cue, submitted } = setup('night-train'); await start();
    const word = cue();
    root.querySelector<HTMLInputElement>('#word-train-answer')!.value = word.lemma.toLowerCase();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
    expect(submitted()[0]).toMatchObject({ lexemeId: word.lexemeId, modality: 'production', answer: word.lemma.toLowerCase() });
    await advance(900);
    const next = cue();
    await advance(25000);
    expect(submitted()[1]).toMatchObject({ lexemeId: next.lexemeId, answer: '__timeout__' });
  });
});

describe('word-game lifecycle', () => {
  it('explains a missing pool instead of starting', () => {
    const { root } = setup('fog-window', { pool: vi.fn(() => []) });
    expect(root.textContent).toContain('These words are still returning.');
    expect(root.querySelector('[data-action="todays-words"]')).not.toBeNull();
  });
  it('holds the clock while paused and reports the round once at the end', async () => {
    const { root, host, start } = setup('honest-mirror'); await start();
    root.querySelector<HTMLButtonElement>('[data-game-action="pause"]')!.click();
    await advance(5000);
    expect(root.querySelector('[data-game-time]')!.textContent).toBe('75s');
    root.querySelector<HTMLButtonElement>('[data-game-action="pause"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-game-action="finish"]')!.click();
    expect(host.end).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('Play again');
    expect(root.querySelector('[data-minigame]')).not.toBeNull();
  });
  it('keeps a failed save for an explicit retry with the same answer', async () => {
    let fail = true;
    const submit = vi.fn(async (result: RoundResult): Promise<AttemptResult> => { if (fail) throw new Error('Offline'); return { attemptId: 'a', correct: grade(result), xpAdded: 0, duplicate: false, correctedAnswer: result.answer, reason: 'Saved', progress: emptyProgress() }; });
    const { root, start, cue } = setup('market-baskets', { submit }); await start();
    cue(); root.querySelector<HTMLButtonElement>('[data-wg="basket:0"]')!.click(); await flush();
    expect(root.querySelector('[data-wg="retry"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-wg="basket:1"]')!.click(); await flush();
    expect(submit).toHaveBeenCalledTimes(1);
    fail = false; root.querySelector<HTMLButtonElement>('[data-wg="retry"]')!.click(); await flush();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).toBe(submit.mock.calls[0][0]);
  });
});
