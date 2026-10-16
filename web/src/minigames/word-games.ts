import { escapeHtml as e } from '../icons';
import { seededShuffle } from '../game-shuffle';
import { scaffoldStage, scaffoldText } from '../typing-scaffold';
import { distractors } from './pool';
import { RoundQueue, responseLimit } from './rounds';
import { miniGameDefinitions } from './catalogue';
import { isWordGame } from './word-game-mechanics';
import type { GameItem, MiniGame, MiniGameDefinition, MiniGameHost, MiniGameOptions, Modality, RoundResult, RoundSummary } from './types';
import './word-games.css';

/**
 * Ten short word-memory games. Each one asks for a different kind of retrieval (matching, judging, spelling,
 * sorting, spotting, building) but every decision is still a real answer graded by the server: choices submit
 * the chosen word's lemma, topic baskets submit the chosen topic, and letter games submit the spelled word as
 * supported production. Nothing here decides correctness on the client.
 */

/** Topic baskets name the course's concrete topics; catch-all topics would make a sorting answer arbitrary. */
export const basketTopics: Readonly<Record<string,string>> = {food:'Food & drink',travel:'Travel',time:'Time',home:'Home',health:'Health',work:'Work',learning:'Learning',people:'People',feelings:'Feelings',culture:'Culture',nature:'Nature',society:'Town & society',actions:'Doing words',describing:'Describing words'};
const basketOrder = Object.keys(basketTopics);
const meaningfulCapitals = new Set(['Sie','Ihnen','Ihr','Ihre']);
const alphabet = [...'abcdefghijklmnopqrstuvwxyzäöüß'];
const fillLetters = [...'ABCDEFGHIKLMNOPRSTUWZÄÖÜEEINNRSST'];

/** Letter games spell one plain German word from tiles, a grid or guessed letters. */
export function isLetterWord(item: Pick<GameItem,'lemma'>, max = 10): boolean {
  return /^\p{L}+$/u.test(item.lemma) && [...item.lemma].length >= 3 && [...item.lemma].length <= max && !meaningfulCapitals.has(item.lemma);
}
/** Small deterministic generator for layouts; a new run seed gives a new board. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0 || 1;
  return () => { value = (value + 0x6d2b79f5) >>> 0; let t = Math.imul(value ^ (value >>> 15), value | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Shuffled letters that never spell the answer outright when another order exists. */
export function scrambleLetters(word: string, seed: number): string[] {
  const letters = [...word];
  for (let attempt = 0; attempt < 8; attempt++) { const mixed = seededShuffle(letters, seed + attempt * 31); if (mixed.join('') !== word) return mixed; }
  return [...letters].reverse();
}
/** Hidden letters stay as gaps; guesses match regardless of case. */
export function maskWord(word: string, guessed: ReadonlySet<string>): string {
  return [...word].map(letter => guessed.has(letter.toLocaleLowerCase('de')) ? letter : '_').join('');
}
export interface LetterGrid { size: number; cells: string[]; placed: { word: string; cells: number[] }[] }
/** A word-search grid: words run right or down (and diagonally from B1); empty cells take ordinary German letters. */
export function buildLetterGrid(words: readonly string[], size: number, seed: number, diagonal = false): LetterGrid {
  const random = seededRandom(seed), cells = Array<string>(size * size).fill(''), placed: LetterGrid['placed'] = [];
  const directions = diagonal ? [[0,1],[1,0],[1,1]] : [[0,1],[1,0]];
  for (const word of words) {
    // Upper-casing ß would give two letters (SS); the grid keeps one cell per letter with capital ẞ.
    const letters = [...word].map(letter => letter === 'ß' ? 'ẞ' : letter.toLocaleUpperCase('de'));
    if (letters.length > size) continue;
    for (let attempt = 0; attempt < 160; attempt++) {
      const [dr, dc] = directions[Math.floor(random() * directions.length)];
      const row = Math.floor(random() * (size - dr * (letters.length - 1))), col = Math.floor(random() * (size - dc * (letters.length - 1)));
      const path = letters.map((_, index) => (row + dr * index) * size + col + dc * index);
      if (!path.every((cell, index) => !cells[cell] || cells[cell] === letters[index])) continue;
      path.forEach((cell, index) => cells[cell] = letters[index]); placed.push({ word, cells: path }); break;
    }
  }
  for (let index = 0; index < cells.length; index++) if (!cells[index]) cells[index] = fillLetters[Math.floor(random() * fillLetters.length)];
  return { size, cells, placed };
}
/** Cells on the straight line from one cell to another, or undefined when the two do not share a row, column or diagonal. */
export function lineCells(from: number, to: number, size: number): number[] | undefined {
  const [r1, c1, r2, c2] = [Math.floor(from / size), from % size, Math.floor(to / size), to % size];
  const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1), length = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  if (r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return undefined;
  return Array.from({ length: length + 1 }, (_, index) => (r1 + dr * index) * size + c1 + dc * index);
}
/** The next word game in a fixed rotation, so a "play another" button always offers something different. */
export function nextWordGame(after?: string): string {
  const ids = miniGameDefinitions.filter(isWordGame).map(game => game.id);
  return ids[(Math.max(-1, ids.indexOf(after ?? '')) + 1) % ids.length] ?? ids[0];
}

interface Round { tick?(delta: number): void; key?(event: KeyboardEvent): boolean; resume?(): void; destroy?(): void; }
interface Entry { item: GameItem; retry: boolean }
const display = (item: GameItem) => item.article ? `${item.article} ${item.articleForm ?? item.lemma}` : item.lemma;
const sameLetters = (a: string, b: string) => a.normalize('NFC').toLocaleLowerCase('de') === b.normalize('NFC').toLocaleLowerCase('de');

export class WordMemoryGame implements MiniGame {
  readonly id: string; readonly title: string; readonly host: string; readonly modalities: Modality[]; readonly levels: MiniGameDefinition['levels'];
  private root!: HTMLElement; private services!: MiniGameHost; private opts!: MiniGameOptions;
  private pool: GameItem[] = []; private queue!: RoundQueue; private round?: Round;
  private summary!: RoundSummary; private chain = 0; private seen = new Set<string>(); private count = 0;
  private elapsed = 0; private previous = 0; private raf = 0; private shownSeconds = -1;
  private running = false; private paused = false; private manualPaused = false; private destroyed = false; private saving = false;
  private generation = 0; private timers = new Set<ReturnType<typeof setTimeout>>();
  private patience?: { limit: number; used: number; done: () => void };
  constructor(private definition: MiniGameDefinition) { this.id = definition.id; this.title = definition.title; this.host = definition.host; this.modalities = definition.modalities; this.levels = definition.levels; }

  private get mechanic() { return this.definition.mechanic; }
  private get silent() { return this.services.silent; }
  private get play() { return this.root.querySelector<HTMLElement>('.minigame-play')!; }
  private get feedback() { return this.root.querySelector<HTMLElement>('.minigame-feedback')!; }
  private get modality(): Modality { return this.mechanic === 'bells' && !this.silent ? 'listening' : ['anagram','loom','fuse','train'].includes(this.mechanic) ? 'production' : 'recognition'; }

  mount(root: HTMLElement, host: MiniGameHost, opts: MiniGameOptions) {
    this.root = root; this.services = host; this.opts = opts;
    this.summary = { gameId: this.id, attempts: 0, correct: 0, hinted: 0, activeMs: 0, longestChain: 0 };
    let pool = host.pool({ modality: this.modality, level: opts.level, topics: this.definition.topics, nouns: this.definition.nouns, sprites: this.definition.sprites, fixedPool: opts.fixedPool, seed: opts.seed });
    if (['anagram','fuse'].includes(this.mechanic)) pool = pool.filter(item => isLetterWord(item));
    if (this.mechanic === 'loom') pool = pool.filter(item => isLetterWord(item, opts.level === 'A1' ? 7 : 8));
    if (this.mechanic === 'baskets') pool = pool.filter(item => item.topic in basketTopics);
    // A meaning shared by two words would make a meaning choice ambiguous.
    if (['pairs','mirror','leaves','bells'].includes(this.mechanic)) { const meanings = new Set<string>(); pool = pool.filter(item => { const key = item.english.toLocaleLowerCase('en'); if (meanings.has(key)) return false; meanings.add(key); return true; }); }
    this.pool = pool; this.queue = new RoundQueue(pool, this.definition.rounds);
    root.innerHTML = `<section class="minigame word-game" data-game-mechanic="${e(this.mechanic)}" style="--minigame-art:url('${e(opts.backdrop ?? '/assets/lindenhafen-preview.webp')}')"><header class="minigame-heading"><div><h2>${e(this.title)}</h2><p class="word-game-host">${e(this.host)}</p></div><div class="minigame-score"><span data-game-score>0 / 0</span><time data-game-time>${this.definition.seconds}s</time></div></header><div class="minigame-lanterns" aria-hidden="true">${Array.from({ length: 12 }, () => '<i></i>').join('')}</div><div class="minigame-play"></div><p class="minigame-feedback" role="status" aria-live="polite"></p><footer class="minigame-footer"><span>${['anagram','fuse'].includes(this.mechanic) ? 'Type letters · Backspace' : this.mechanic === 'train' ? 'Type · Enter' : '1–6 · ← → · Enter'}</span><button type="button" data-game-action="pause">Pause</button><button type="button" data-game-action="finish">Finish round</button></footer></section>`;
    const minimum = this.modality === 'production' ? 1 : this.mechanic === 'pairs' || this.mechanic === 'baskets' ? 3 : 2;
    if (this.pool.length < minimum) {
      const pictures = this.definition.sprites ? ' This game uses painted objects, so it needs restored nouns with pictures.' : '';
      this.play.innerHTML = `<div class="minigame-intro"><h3>These words are still returning.</h3><p>Restore more words in the town, then return for this game. Only familiar words enter the pool.${pictures}</p><button type="button" class="primary-button" data-action="todays-words">Practise today’s words</button>${nextWordGame(this.id) ? `<button type="button" class="outline-button" data-minigame="${e(nextWordGame(this.id))}">Try another word game</button>` : ''}</div>`;
      this.root.querySelector<HTMLElement>('.minigame-footer')!.hidden = true; return;
    }
    const listening = this.modality === 'listening' ? ' · listen first' : this.mechanic === 'bells' ? ' · silent mode: each word appears for a moment' : '';
    this.play.innerHTML = `<div class="minigame-intro"><span class="minigame-seal word-game-seal" aria-hidden="true"></span><h3>${e(this.definition.instruction)}</h3><p>${this.definition.seconds} seconds · ${this.pool.length} restored words${listening} · every answer saved</p><button type="button" class="primary-button" data-game-action="start">Begin</button><p class="minigame-best">${e(this.bestLabel())}</p></div>`;
    root.addEventListener('click', this.click); root.addEventListener('submit', this.submitForm); root.addEventListener('pointerdown', this.pointerDown); root.addEventListener('pointerup', this.pointerUp);
    document.addEventListener('keydown', this.keydown);
    this.unbind = host.input.bind(root);
    if (this.definition.sprites || ['anagram','train'].includes(this.mechanic)) void host.sprites.preload(this.pool.flatMap(item => item.sprite ? [item.sprite] : [])).catch(() => {});
    root.querySelector<HTMLButtonElement>('[data-game-action="start"]')?.focus();
  }
  private unbind?: () => void;

  // ——— shared loop ———
  private click = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled || !this.root.contains(button)) return;
    const action = button.dataset.gameAction;
    if (action === 'start') { this.running = true; this.previous = performance.now(); this.startFrames(); this.next(); }
    else if (action === 'finish') this.finish();
    else if (action === 'pause') { if (this.paused) this.resume(true); else this.pause(true); }
    else if (button.dataset.wg && this.ready() && (!this.awaitingRetry || button.dataset.wg === 'retry')) this.handlers.get(button.dataset.wg.split(':')[0])?.(button.dataset.wg.split(':').slice(1).join(':'), button);
  };
  private handlers = new Map<string, (value: string, button: HTMLButtonElement) => void>();
  private on(name: string, handler: (value: string, button: HTMLButtonElement) => void) { this.handlers.set(name, handler); }
  private awaitingRetry = false;
  private submitForm = (event: Event) => { event.preventDefault(); if (this.ready() && !this.awaitingRetry) this.handlers.get('form')?.('', event.target as HTMLButtonElement); };
  private keydown = (event: KeyboardEvent) => {
    if (!this.ready() || this.awaitingRetry || event.ctrlKey || event.metaKey || event.altKey || !this.root.closest('dialog')?.open) return;
    const target = event.target; if (target instanceof HTMLElement && target.matches('input,textarea,select')) return;
    if (this.round?.key?.(event)) event.preventDefault();
  };
  private dragFrom?: number;
  private pointerDown = (event: PointerEvent) => { const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-wg^="cell:"]'); this.dragFrom = cell ? Number(cell.dataset.wg!.slice(5)) : undefined; };
  private pointerUp = (event: PointerEvent) => {
    const start = this.dragFrom; this.dragFrom = undefined; if (start === undefined || !this.ready() || this.awaitingRetry) return;
    const cell = (document.elementFromPoint?.(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-wg^="cell:"]');
    const end = cell ? Number(cell.dataset.wg!.slice(5)) : undefined;
    if (end !== undefined && end !== start) { this.handlers.get('drag')?.(`${start}:${end}`, cell as unknown as HTMLButtonElement); this.suppressClick(); }
  };
  /** A drag that ended on another cell must not also count as a tap on that cell. */
  private suppressClick() { const stop = (event: Event) => { event.stopPropagation(); event.preventDefault(); }; this.root.addEventListener('click', stop, { capture: true, once: true }); this.later(() => this.root.removeEventListener('click', stop, { capture: true }), 50); }
  private ready() { return this.running && !this.paused && !this.saving && !this.destroyed; }
  private later(callback: () => void, ms: number) { const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, ms); this.timers.add(timer); }
  private startFrames() {
    const loop = (now: number) => { if (this.destroyed || !this.running) { this.raf = 0; return; } this.tick(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  private tick(now: number) {
    const delta = Math.min(100, Math.max(0, now - this.previous)); this.previous = now;
    if (this.paused || !this.running) return;
    this.elapsed += delta;
    const remaining = Math.max(0, this.definition.seconds - Math.floor(this.elapsed / 1000));
    if (remaining !== this.shownSeconds) { this.shownSeconds = remaining; this.root.querySelector('[data-game-time]')!.textContent = `${remaining}s`; }
    if (this.saving) return;
    this.round?.tick?.(delta);
    const patience = this.patience;
    if (patience) {
      patience.used += delta;
      const bar = this.play.querySelector<HTMLElement>('.minigame-patience i'); if (bar) bar.style.transform = `scaleX(${Math.max(0, 1 - patience.used / patience.limit)})`;
      if (patience.used >= patience.limit) { this.patience = undefined; patience.done(); }
    }
    if (this.elapsed >= this.definition.seconds * 1000 && !this.saving) this.finish();
  }
  private take(count: number, accept: (item: GameItem) => boolean = () => true): Entry[] {
    const entries: Entry[] = [], ids = new Set<string>();
    while (entries.length < count && this.queue.remaining) { const entry = this.queue.next()!; if (!ids.has(entry.item.lexemeId) && accept(entry.item)) { ids.add(entry.item.lexemeId); entries.push(entry); } }
    return entries;
  }
  private hinted(entry: Entry) { return entry.retry || this.seen.has(entry.item.lexemeId); }
  private choicesFor(item: GameItem, count: number, exclude: readonly GameItem[] = []) {
    const others = this.pool.filter(other => !exclude.some(row => row.lexemeId === other.lexemeId));
    return distractors(item, others.includes(item) ? others : [item, ...others], this.opts.seed + this.count * 7, count);
  }
  private next() {
    if (this.destroyed || !this.running) return;
    this.round?.destroy?.(); this.round = undefined; this.patience = undefined; this.handlers.clear(); this.awaitingRetry = false;
    if (this.elapsed >= this.definition.seconds * 1000 || !this.queue.remaining) { this.finish(); return; }
    this.count++; this.generation++; this.feedback.textContent = ''; this.feedback.classList.remove('is-miss');
    const build = { pairs: this.pairs, mirror: this.mirror, anagram: this.anagram, baskets: this.baskets, leaves: this.leaves, loom: this.loom, fuse: this.fuse, fog: this.fog, bells: this.bells, train: this.train } as Record<string, () => Round | undefined>;
    this.round = build[this.mechanic]?.call(this);
    if (!this.round) this.finish();
  }
  private wait(limit: number, done: () => void) { this.patience = { limit, used: 0, done }; }
  private patienceBar() { return '<div class="minigame-patience"><i></i></div>'; }

  /** Saves one decision's answers; every miss returns two turns later and is repeated aloud when sound is on. */
  private async grade(results: RoundResult[], items: readonly GameItem[], correction?: string): Promise<boolean[] | undefined> {
    if (this.destroyed) return;
    const generation = this.generation; this.saving = true; this.patience = undefined; this.play.setAttribute('aria-busy', 'true');
    try {
      const grades = await Promise.all(results.map(result => this.services.submit(result)));
      if (this.destroyed || generation !== this.generation) return;
      const marks = grades.map(grade => grade.correct), correct = marks.every(Boolean);
      this.summary.attempts += marks.length; this.summary.correct += marks.filter(Boolean).length; this.summary.hinted += results.filter(result => result.hinted).length;
      results.forEach(result => this.seen.add(result.lexemeId));
      if (correct) { this.chain++; this.summary.longestChain = Math.max(this.summary.longestChain, this.chain); }
      else { this.chain = 0; items.forEach((item, index) => { if (!marks[index]) this.queue.miss(item); }); }
      this.services.audio.sfx(correct ? this.mechanic === 'bells' ? 'bell' : this.mechanic === 'fuse' ? 'lantern-light' : this.mechanic === 'train' ? 'flap' : 'chime' : 'miss');
      this.root.querySelector('[data-game-score]')!.textContent = `${this.summary.correct} / ${this.summary.attempts}`;
      this.root.querySelectorAll('.minigame-lanterns i').forEach((lamp, index) => lamp.classList.toggle('is-lit', index < this.chain));
      this.feedback.classList.toggle('is-miss', !correct);
      const shown = correction ?? items.map(item => `${display(item)} · ${item.english}`).join(' · ');
      this.feedback.textContent = correct ? `✓ ${shown}` : `${shown} · returns in two turns`;
      if (!correct && !this.silent && items[0]) void this.services.speak(items[0]).catch(() => {});
      return marks;
    } catch (error) {
      if (this.destroyed || generation !== this.generation) return;
      this.feedback.textContent = (error as Error).message;
      return new Promise(resolve => {
        this.play.insertAdjacentHTML('beforeend', '<button type="button" class="primary-button word-game-retry" data-wg="retry">Retry saving this answer</button>');
        this.saving = false; this.awaitingRetry = true;
        this.on('retry', (_value, button) => { button.remove(); this.awaitingRetry = false; resolve(this.grade(results, items, correction)); });
      });
    } finally { if (generation === this.generation && !this.destroyed) { this.saving = false; this.play.removeAttribute('aria-busy'); } }
  }
  private result(entry: Entry, answer: string, modality: Modality = this.modality, extra: Partial<RoundResult> = {}): RoundResult {
    return { lexemeId: entry.item.lexemeId, modality, hinted: this.hinted(entry), responseMs: Math.round(this.patience?.used ?? 0), answer, answerKind: modality === 'production' ? undefined : 'lexeme', ...extra };
  }
  private advance(ms = 700) { const generation = this.generation; this.later(() => { if (generation === this.generation && !this.paused) this.next(); else if (generation === this.generation) this.resumeNext = true; }, ms); }
  private resumeNext = false;

  // ——— 1. Lantern Pairs: tie each German word to its meaning on a shared board ———
  private pairs(): Round | undefined {
    const entries = this.take(this.opts.level === 'A1' ? 4 : 5); if (!entries.length) return;
    const left = seededShuffle(entries, this.opts.seed + this.count), right = seededShuffle(entries, this.opts.seed + this.count * 3);
    let german: number | undefined, meaning: number | undefined; const matched = new Set<string>();
    this.play.innerHTML = `<div class="word-pairs"><div class="word-pairs-column" role="group" aria-label="German words">${left.map((entry, index) => `<button type="button" class="word-tile" lang="de" data-game-option="${index}" data-wg="de:${index}">${e(display(entry.item))}</button>`).join('')}</div><div class="word-pairs-rope" aria-hidden="true"></div><div class="word-pairs-column" role="group" aria-label="Meanings">${right.map((entry, index) => `<button type="button" class="word-tile word-tile-meaning" data-game-key="meaning" data-wg="en:${index}">${e(entry.item.english)}</button>`).join('')}</div></div>`;
    const select = (side: 'de' | 'en', index: number) => {
      if (side === 'de') german = german === index ? undefined : index; else meaning = meaning === index ? undefined : index;
      this.play.querySelectorAll<HTMLElement>('[data-wg^="de:"]').forEach((tile, i) => tile.classList.toggle('is-selected', i === german));
      this.play.querySelectorAll<HTMLElement>('[data-wg^="en:"]').forEach((tile, i) => tile.classList.toggle('is-selected', i === meaning));
      if (german === undefined || meaning === undefined) return;
      const word = left[german], chosen = right[meaning], [g, m] = [german, meaning]; german = meaning = undefined;
      void this.grade([this.result(word, chosen.item.lemma)], [word.item], `${display(word.item)} = ${word.item.english}`).then(marks => {
        if (!marks) return;
        const tiles = [this.play.querySelector<HTMLButtonElement>(`[data-wg="de:${g}"]`), this.play.querySelector<HTMLButtonElement>(`[data-wg="en:${m}"]`)];
        tiles.forEach(tile => tile?.classList.remove('is-selected'));
        if (marks[0]) {
          matched.add(word.item.lexemeId);
          tiles.forEach(tile => { if (tile) { tile.classList.add('is-matched'); tile.disabled = true; } });
          // The meaning tile that belongs to this word is the one cleared; a correct grade means they are the same entry.
          if (matched.size === entries.length) this.advance(600);
          else this.play.querySelector<HTMLButtonElement>('[data-wg^="de:"]:not(:disabled)')?.focus();
        } else { tiles.forEach(tile => tile?.classList.add('is-shaking')); this.later(() => tiles.forEach(tile => tile?.classList.remove('is-shaking')), 450); this.seen.add(word.item.lexemeId); }
      });
    };
    this.on('de', value => select('de', Number(value))); this.on('en', value => select('en', Number(value)));
    this.play.querySelector<HTMLButtonElement>('[data-wg="de:0"]')?.focus();
    return {};
  }

  // ——— 2. Honest Mirror: is this the true meaning? If not, name the true one ———
  private mirror(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    const item = entry.item, random = seededRandom(this.opts.seed + this.count * 13);
    const others = this.choicesFor(item, 4).filter(other => other.lexemeId !== item.lexemeId);
    const proposal = random() < .5 || !others.length ? item : others[0];
    this.play.innerHTML = `<div class="word-mirror"><p class="minigame-round-kicker">Does the mirror tell the truth? Stimmt = true · Stimmt nicht = false</p><h3 class="minigame-cue" lang="de">${e(display(item))}</h3><div class="word-mirror-glass"><span>means</span><strong>${e(proposal.english)}</strong></div><div class="minigame-options" role="group" aria-label="Your verdict"><button type="button" class="minigame-object word-verdict" data-game-option="0" data-wg="true"><span class="minigame-object-label" lang="de">Stimmt</span><kbd>1</kbd></button><button type="button" class="minigame-object word-verdict" data-game-option="1" data-wg="false"><span class="minigame-object-label" lang="de">Stimmt nicht</span><kbd>2</kbd></button></div>${this.patienceBar()}</div>`;
    const finish = (answer: string) => void this.grade([this.result(entry, answer)], [item], `${display(item)} = ${item.english}`).then(marks => { if (marks) this.advance(marks[0] ? 650 : 1500); });
    this.on('true', () => finish(proposal.lemma));
    this.on('false', () => {
      // A rejection is only an answer once the true meaning is named.
      const fixes = seededShuffle([item, ...others.filter(other => other !== proposal)].slice(0, 3), this.opts.seed + this.count * 5);
      this.play.querySelector('.word-mirror .minigame-options')!.outerHTML = `<p class="minigame-round-kicker">Then what does it mean?</p><div class="minigame-options" role="group" aria-label="The true meaning">${fixes.map((fix, index) => `<button type="button" class="minigame-object" data-game-option="${index}" data-wg="fix:${index}"><span class="minigame-object-label">${e(fix.english)}</span><kbd>${index + 1}</kbd></button>`).join('')}</div>`;
      this.on('fix', value => finish(fixes[Number(value)].lemma));
      this.play.querySelector<HTMLButtonElement>('[data-wg="fix:0"]')?.focus();
    });
    this.wait(responseLimit(item, false) + 3000, () => finish('__timeout__'));
    this.play.querySelector<HTMLButtonElement>('[data-wg="true"]')?.focus();
    return {};
  }

  // ——— 3. Scrambled Sign: rebuild the word from its letters ———
  private anagram(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    // Lower-case tiles keep a noun's capital from giving away its first letter; grading ignores case.
    const item = entry.item, letters = scrambleLetters(item.lemma.toLocaleLowerCase('de'), this.opts.seed + this.count), used: number[] = [];
    this.play.innerHTML = `<div class="word-anagram"><p class="minigame-round-kicker">The sign painter mixed up the letters.</p>${item.sprite ? '<div class="minigame-prompt-picture"></div>' : ''}<p class="minigame-context">${e(item.english)}</p><div class="word-anagram-sign" lang="de" aria-live="polite">${letters.map(() => '<span>_</span>').join('')}</div><div class="word-letter-tiles" role="group" aria-label="Letters">${letters.map((letter, index) => `<button type="button" class="word-letter" data-game-key="tile" data-wg="tile:${index}" lang="de">${e(letter)}</button>`).join('')}</div><div class="minigame-tray-actions"><button type="button" data-game-key="undo" data-wg="undo">Undo</button><button type="button" data-game-key="clear" data-wg="clear">Start again</button></div>${this.patienceBar()}</div>`;
    if (item.sprite) this.play.querySelector('.minigame-prompt-picture')?.append(this.services.sprites.render(item.sprite, 'Word to spell', 120));
    const render = () => {
      this.play.querySelectorAll<HTMLElement>('.word-anagram-sign span').forEach((slot, index) => { slot.textContent = used[index] === undefined ? '_' : letters[used[index]]; slot.classList.toggle('is-set', used[index] !== undefined); });
      this.play.querySelectorAll<HTMLButtonElement>('[data-wg^="tile:"]').forEach((tile, index) => tile.disabled = used.includes(index));
    };
    const submit = (answer: string) => void this.grade([this.result({ ...entry, retry: true }, answer, 'production')], [item]).then(marks => { if (marks) { const sign = this.play.querySelector('.word-anagram-sign'); sign?.classList.add(marks[0] ? 'is-solved' : 'is-wrong'); sign?.querySelectorAll('span').forEach((slot, index) => { slot.textContent = [...item.lemma][index] ?? ''; }); this.advance(marks[0] ? 700 : 1700); } });
    const place = (index: number) => { if (used.includes(index)) return; used.push(index); render(); if (used.length === letters.length) submit(used.map(i => letters[i]).join('')); };
    this.on('tile', value => place(Number(value)));
    this.on('undo', () => { used.pop(); render(); });
    this.on('clear', () => { used.length = 0; render(); });
    this.wait(responseLimit(item, true) * 1.5, () => submit('__timeout__'));
    return { key: event => {
      if (event.key === 'Backspace') { used.pop(); render(); return true; }
      const index = letters.findIndex((letter, i) => !used.includes(i) && sameLetters(letter, event.key));
      if (event.key.length === 1 && index >= 0) { place(index); return true; }
      return false;
    } };
  }

  // ——— 4. Market Baskets: sort each word into the basket of its topic ———
  private baskets(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    const item = entry.item, others = seededShuffle(basketOrder.filter(topic => topic !== item.topic), this.opts.seed + this.count).slice(0, this.opts.level === 'A1' ? 2 : 3);
    const topics = [item.topic, ...others].sort((a, b) => basketOrder.indexOf(a) - basketOrder.indexOf(b));
    this.play.innerHTML = `<div class="word-baskets"><p class="minigame-round-kicker">Which basket does Marta pack this in?</p><div class="word-basket-card" lang="de">${e(display(item))}</div><div class="minigame-options" role="group" aria-label="Baskets">${topics.map((topic, index) => `<button type="button" class="minigame-object word-basket" data-game-option="${index}" data-wg="basket:${index}"><span class="word-basket-weave" aria-hidden="true"></span><span class="minigame-object-label">${e(basketTopics[topic])}</span><kbd>${index + 1}</kbd></button>`).join('')}</div>${this.patienceBar()}</div>`;
    const finish = (answer: string) => void this.grade([this.result(entry, answer, 'recognition', { answerKind: 'topic' })], [item], `${display(item)} · ${item.english} → ${basketTopics[item.topic]}`).then(marks => { if (marks) this.advance(marks[0] ? 600 : 1500); });
    this.on('basket', value => { this.play.querySelector('.word-basket-card')?.classList.add('is-dropping'); finish(topics[Number(value)]); });
    this.wait(responseLimit(item, false), () => finish('__timeout__'));
    this.play.querySelector<HTMLButtonElement>('[data-wg="basket:0"]')?.focus();
    return {};
  }

  // ——— 5. Falling Leaves: catch the leaf with the meaning before it reaches the ground ———
  private leaves(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    const item = entry.item, options = this.choicesFor(item, this.opts.level === 'A1' ? 3 : 4), random = seededRandom(this.opts.seed + this.count * 11);
    const limit = responseLimit(item, false) + 1500, motion = !this.services.reducedMotion;
    // The true leaf starts last of all, so the others have landed before it is out of time.
    const leaves = options.map(option => ({ option, delay: option === item ? 600 : random() * 900, duration: option === item ? limit - 600 : limit * (.55 + random() * .3), sway: random() * Math.PI * 2 }));
    this.play.innerHTML = `<div class="word-leaves"><h3 class="minigame-cue" lang="de">${e(display(item))}</h3><div class="word-leaves-sky ${motion ? '' : 'is-still'}" role="group" aria-label="Falling meanings">${leaves.map((leaf, index) => `<button type="button" class="word-leaf" style="--lane:${(index + .5) / leaves.length}" data-game-option="${index}" data-wg="leaf:${index}"><span>${e(leaf.option.english)}</span><kbd>${index + 1}</kbd></button>`).join('')}<div class="word-leaves-ground" aria-hidden="true"></div></div>${motion ? '' : this.patienceBar()}</div>`;
    let time = 0, done = false;
    const finish = (answer: string) => { if (done) return; done = true; void this.grade([this.result(entry, answer)], [item], `${display(item)} = ${item.english}`).then(marks => { if (marks) this.advance(marks[0] ? 600 : 1500); }); };
    this.on('leaf', (value, button) => { button.classList.add('is-caught'); finish(leaves[Number(value)].option.lemma); });
    if (!motion) { this.wait(limit, () => finish('__timeout__')); return {}; }
    const buttons = [...this.play.querySelectorAll<HTMLElement>('.word-leaf')];
    return { tick: delta => {
      time += delta;
      leaves.forEach((leaf, index) => {
        const progress = Math.max(0, Math.min(1, (time - leaf.delay) / leaf.duration));
        buttons[index].style.setProperty('--fall', String(progress)); buttons[index].style.setProperty('--sway', String(Math.sin(time / 520 + leaf.sway)));
        buttons[index].classList.toggle('is-landed', progress >= 1);
        if (progress >= 1 && leaf.option === item) finish('__timeout__');
      });
    } };
  }

  // ——— 6. Letter Loom: find the German word for each meaning in the letter grid ———
  private loom(): Round | undefined {
    const size = this.opts.level === 'A1' ? 7 : 8;
    const entries = this.take(this.opts.level === 'A1' ? 3 : 4); if (!entries.length) return;
    const grid = buildLetterGrid(entries.map(entry => entry.item.lemma), size, this.opts.seed + this.count * 101, this.opts.level === 'B1');
    const clues = entries.filter(entry => grid.placed.some(row => row.word === entry.item.lemma));
    // A word that did not fit the grid simply waits for the next one.
    if (!clues.length) return this.loom();
    let start: number | undefined; const found = new Set<number>();
    this.play.innerHTML = `<div class="word-loom"><div class="word-loom-clues"><p class="minigame-round-kicker">Find the German word for</p><ol>${clues.map(entry => `<li data-clue="${e(entry.item.lexemeId)}">${e(entry.item.english)}</li>`).join('')}</ol></div><div class="word-loom-grid" style="--size:${size}" role="grid" aria-label="Letter grid: choose the first and last letter of the word">${grid.cells.map((letter, index) => `<button type="button" class="word-loom-cell" data-game-key="cell" data-wg="cell:${index}" aria-label="Row ${Math.floor(index / size) + 1}, column ${index % size + 1}: ${e(letter)}">${e(letter)}</button>`).join('')}</div>${this.patienceBar()}</div>`;
    const current = () => clues[0];
    const mark = () => { this.play.querySelectorAll('[data-clue]').forEach(row => row.classList.toggle('is-current', row.getAttribute('data-clue') === current()?.item.lexemeId)); };
    const choose = (from: number, to: number) => {
      const cells = lineCells(from, to, size), entry = current();
      this.play.querySelectorAll('.word-loom-cell.is-start').forEach(cell => cell.classList.remove('is-start')); start = undefined;
      if (!cells || cells.length < 2 || !entry) { this.feedback.textContent = 'Choose the first and last letter of one straight line.'; return; }
      const spelled = cells.map(cell => grid.cells[cell]).join('').replace(/ẞ/g, 'ß');
      // Grid letters are capitals; only the letters are tested, so a matching spelling is sent in its dictionary case.
      const answer = sameLetters(spelled, entry.item.lemma) ? entry.item.lemma : spelled.toLocaleLowerCase('de');
      void this.grade([this.result({ ...entry, retry: true }, answer, 'production')], [entry.item]).then(marks => {
        if (!marks) return;
        const placement = grid.placed.find(row => row.word === entry.item.lemma)!;
        if (marks[0]) placement.cells.forEach(cell => found.add(cell)); else this.flash(cells);
        clues.shift(); if (!marks[0]) placement.cells.forEach(cell => this.play.querySelector(`[data-wg="cell:${cell}"]`)?.classList.add('is-revealed'));
        this.play.querySelector(`[data-clue="${CSS.escape(entry.item.lexemeId)}"]`)?.classList.add(marks[0] ? 'is-found' : 'is-missed');
        found.forEach(cell => this.play.querySelector(`[data-wg="cell:${cell}"]`)?.classList.add('is-found'));
        if (!clues.length) this.advance(marks[0] ? 900 : 1800); else { mark(); this.wait(30000, timeout); }
      });
    };
    const timeout = () => { const entry = current(); if (!entry) return; const placement = grid.placed.find(row => row.word === entry.item.lemma)!; choose(placement.cells[0], placement.cells[0]); };
    this.on('cell', value => {
      const cell = Number(value);
      if (start === undefined) { start = cell; this.play.querySelector(`[data-wg="cell:${cell}"]`)?.classList.add('is-start'); this.feedback.textContent = ''; }
      else if (start === cell) { start = undefined; this.play.querySelector(`[data-wg="cell:${cell}"]`)?.classList.remove('is-start'); }
      else choose(start, cell);
    });
    this.on('drag', value => { const [from, to] = value.split(':').map(Number); choose(from, to); });
    mark(); this.wait(30000, timeout);
    return {};
  }
  private flash(cells: number[]) { cells.forEach(cell => this.play.querySelector(`[data-wg="cell:${cell}"]`)?.classList.add('is-wrong')); this.later(() => cells.forEach(cell => this.play.querySelector(`[data-wg="cell:${cell}"]`)?.classList.remove('is-wrong')), 700); }

  // ——— 7. Lantern Fuse: guess the letters before the fuse burns down ———
  private fuse(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    const item = entry.item, guessed = new Set<string>(), lives = this.opts.level === 'A1' ? 7 : 6; let wrong = 0, over = false;
    const needed = new Set([...item.lemma.toLocaleLowerCase('de')]);
    this.play.innerHTML = `<div class="word-fuse"><p class="minigame-context">${e(item.english)}</p><div class="word-fuse-line" aria-hidden="true"><span class="word-fuse-cord"></span><span class="word-fuse-spark"></span><span class="word-fuse-lantern"></span></div><p class="word-fuse-word" lang="de" aria-live="polite">${e(maskWord(item.lemma, guessed))}</p><p class="word-fuse-lives" aria-live="polite">${lives} sparks left</p><div class="word-fuse-keys" role="group" aria-label="German letters">${alphabet.map(letter => `<button type="button" data-game-key="letter" data-wg="letter:${letter}" lang="de">${letter}</button>`).join('')}</div></div>`;
    const finish = (answer: string) => { over = true; void this.grade([this.result({ ...entry, retry: true }, answer, 'production')], [item]).then(marks => { if (marks) { this.play.querySelector('.word-fuse-word')!.textContent = item.lemma; this.play.querySelector('.word-fuse')?.classList.add(marks[0] ? 'is-lit' : 'is-out'); this.advance(marks[0] ? 900 : 1800); } }); };
    const guess = (letter: string) => {
      if (over || guessed.has(letter)) return; guessed.add(letter);
      const button = this.play.querySelector<HTMLButtonElement>(`[data-wg="letter:${letter}"]`);
      if (button) { button.disabled = true; button.classList.add(needed.has(letter) ? 'is-hit' : 'is-miss'); }
      if (!needed.has(letter)) { wrong++; this.services.audio.sfx('smudge'); }
      this.play.querySelector('.word-fuse-word')!.textContent = maskWord(item.lemma, guessed);
      this.play.querySelector<HTMLElement>('.word-fuse-line')!.style.setProperty('--burnt', String(wrong / lives));
      this.play.querySelector('.word-fuse-lives')!.textContent = `${lives - wrong} ${lives - wrong === 1 ? 'spark' : 'sparks'} left`;
      if ([...needed].every(value => guessed.has(value))) finish(item.lemma);
      else if (wrong >= lives) finish('__timeout__');
    };
    this.on('letter', value => guess(value));
    return { key: event => { const letter = event.key.toLocaleLowerCase('de'); if (alphabet.includes(letter)) { guess(letter); return true; } return false; } };
  }

  // ——— 8. Fog Window: name the object before the fog clears ———
  private fog(): Round | undefined {
    const [entry] = this.take(1, item => !!item.sprite); if (!entry) return;
    const item = entry.item, options = this.choicesFor(item, this.opts.level === 'A1' ? 3 : 4), limit = responseLimit(item, false) + 2000;
    this.play.innerHTML = `<div class="word-fog"><div class="word-fog-window" style="--clear:0"><div class="word-fog-picture"></div><span class="word-fog-mist" aria-hidden="true"></span></div><div class="minigame-options" role="group" aria-label="What is behind the fog?">${options.map((option, index) => `<button type="button" class="minigame-object" data-game-option="${index}" data-wg="fog:${index}" lang="de"><span class="minigame-object-label">${e(display(option))}</span><kbd>${index + 1}</kbd></button>`).join('')}</div>${this.patienceBar()}</div>`;
    this.play.querySelector('.word-fog-picture')!.append(this.services.sprites.render(item.sprite!, 'An object in the fog', 180));
    const finish = (answer: string) => { this.play.querySelector<HTMLElement>('.word-fog-window')!.style.setProperty('--clear', '1'); void this.grade([this.result(entry, answer)], [item]).then(marks => { if (marks) this.advance(marks[0] ? 650 : 1500); }); };
    this.on('fog', value => finish(options[Number(value)].lemma));
    this.wait(limit, () => finish('__timeout__'));
    const window = this.play.querySelector<HTMLElement>('.word-fog-window')!;
    return { tick: () => { if (this.patience) window.style.setProperty('--clear', String(Math.min(1, this.patience.used / (limit * .7)))); } };
  }

  // ——— 9. Echo Bells: hear the word (or glimpse it in silent mode), then ring the bell with its meaning ———
  private bells(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    const item = entry.item, options = this.choicesFor(item, this.opts.level === 'A1' ? 3 : 4), generation = this.generation;
    let modality = this.modality, ready = false, hinted = false, interrupted = false;
    this.play.innerHTML = `<div class="word-bells"><div class="word-bells-echo" lang="de" aria-live="polite">${modality === 'listening' ? '<span class="minigame-listening-cue" aria-label="Listen to the German word">♪</span>' : `<span class="word-bells-glimpse">${e(display(item))}</span>`}</div>${modality === 'listening' ? '<div class="minigame-audio-controls"><button type="button" data-game-key="replay" data-wg="replay">Hear again</button></div>' : ''}<div class="minigame-options word-bell-row" role="group" aria-label="Bells">${options.map((option, index) => `<button type="button" class="minigame-object word-bell" data-game-option="${index}" data-wg="bell:${index}"><span class="word-bell-shape" aria-hidden="true"></span><span class="minigame-object-label">${e(option.english)}</span><kbd>${index + 1}</kbd></button>`).join('')}</div>${this.patienceBar()}</div>`;
    const begin = () => { if (generation !== this.generation || ready) return; ready = true; this.wait(responseLimit(item, false) + 2000, () => finish('__timeout__')); };
    const listen = (replay: boolean) => {
      if (replay) hinted = true;
      void this.services.speak(item).then(begin, () => {
        if (generation !== this.generation) return;
        if (this.paused) { interrupted = true; return; }
        // Without audio the word is shown instead, which is reading, not listening.
        modality = 'recognition'; this.play.querySelector('.word-bells-echo')!.innerHTML = `<span class="word-bells-glimpse">${e(display(item))}</span>`; begin();
      });
    };
    const finish = (answer: string) => void this.grade([this.result(entry, answer, modality, { hinted: this.hinted(entry) || hinted })], [item], `${display(item)} = ${item.english}`).then(marks => { if (marks) this.advance(marks[0] ? 650 : 1500); });
    this.on('bell', (value, button) => { if (!ready) { this.feedback.textContent = modality === 'listening' ? 'Listen to the whole word first.' : 'Wait for the echo to fade.'; return; } button.classList.add('is-ringing'); finish(options[Number(value)].lemma); });
    this.on('replay', () => { if (modality === 'listening') listen(true); });
    if (modality === 'listening') listen(false);
    else this.later(() => { if (generation !== this.generation) return; this.play.querySelector('.word-bells-glimpse')?.classList.add('is-faded'); begin(); }, this.opts.level === 'A1' ? 1600 : 1100);
    return { resume: () => { if (interrupted && !ready) { interrupted = false; listen(false); } }, destroy: () => this.services.audio.stop() };
  }

  // ——— 10. Night Train: write the German word before the train leaves the platform ———
  private train(): Round | undefined {
    const [entry] = this.take(1); if (!entry) return;
    const item = entry.item, stage = scaffoldStage(item.level, this.opts.currentLevel ?? this.opts.level, item.recalls.production);
    const scaffolded = stage !== 'edges' && stage !== 'none' || entry.retry, limit = responseLimit(item, true) + 4000;
    this.play.innerHTML = `<div class="word-train"><div class="word-train-track" aria-hidden="true"><span class="word-train-engine" style="--depart:0"><span class="word-train-car">${item.sprite ? '<span class="word-train-cargo"></span>' : ''}</span></span></div><p class="minigame-context">${e(item.english)}</p>${scaffolded || stage === 'edges' ? `<p class="minigame-scaffold" lang="de">${e(scaffoldText(item.lemma, stage))}</p>` : ''}<form class="minigame-recall"><input id="word-train-answer" aria-label="German word" lang="de" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…" required/><div class="minigame-umlauts">${['ä','ö','ü','ß'].map(letter => `<button type="button" data-game-key="umlaut" data-wg="umlaut:${letter}">${letter}</button>`).join('')}</div><button type="submit" class="primary-button">Board the train</button></form>${this.patienceBar()}</div>`;
    if (item.sprite) this.play.querySelector('.word-train-cargo')?.append(this.services.sprites.render(item.sprite, '', 64));
    const input = this.play.querySelector<HTMLInputElement>('#word-train-answer')!;
    const finish = (answer: string) => { input.disabled = true; void this.grade([this.result(entry, answer, 'production', { hinted: this.hinted(entry) || scaffolded })], [item]).then(marks => { if (marks) { this.play.querySelector('.word-train')?.classList.add(marks[0] ? 'is-boarded' : 'is-missed'); this.advance(marks[0] ? 800 : 1800); } }); };
    this.on('form', () => { const answer = input.value.trim(); if (answer) finish(answer); });
    this.on('umlaut', value => { input.setRangeText(value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end'); input.focus(); });
    this.wait(limit, () => finish(input.value.trim() || '__timeout__'));
    const engine = this.play.querySelector<HTMLElement>('.word-train-engine')!;
    input.focus();
    return { tick: () => { if (this.patience) engine.style.setProperty('--depart', String(this.patience.used / limit)); } };
  }

  // ——— lifecycle ———
  pause(manual = false) {
    if (manual) this.manualPaused = true;
    if (this.destroyed || this.paused) return;
    this.paused = true; this.services.audio.stop();
    const button = this.root.querySelector<HTMLButtonElement>('[data-game-action="pause"]'); if (button) button.textContent = 'Resume';
    this.root.classList.add('minigame-paused');
  }
  resume(manual = false) {
    if (this.manualPaused && !manual) return;
    if (manual) this.manualPaused = false;
    if (this.destroyed || !this.paused) return;
    this.paused = false; this.previous = performance.now();
    const button = this.root.querySelector<HTMLButtonElement>('[data-game-action="pause"]'); if (button) button.textContent = 'Pause';
    this.root.classList.remove('minigame-paused');
    if (this.resumeNext) { this.resumeNext = false; this.next(); } else this.round?.resume?.();
  }
  private endRound() {
    this.round?.destroy?.(); this.round = undefined; this.patience = undefined;
    this.running = false; this.generation++; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.timers.forEach(timer => clearTimeout(timer)); this.timers.clear();
    this.services.audio.stop(); this.summary.activeMs = this.elapsed; this.saveBest(); this.services.end(this.summary);
  }
  private finish() {
    if (!this.running || this.destroyed || this.saving) return;
    this.endRound();
    const rate = this.elapsed > 0 ? Math.round(this.summary.attempts * 3600000 / this.elapsed) : 0, other = miniGameDefinitions.find(game => game.id === nextWordGame(this.id));
    this.play.innerHTML = `<div class="minigame-intro"><span class="minigame-seal">${this.summary.correct}</span><h3>The words are back in their places.</h3><p>${this.summary.correct} / ${this.summary.attempts} answers · ${this.summary.hinted} supported recalls</p><p>${rate} retrievals per active hour · longest chain ${this.summary.longestChain}</p><p>${e(this.bestLabel())}</p><div class="word-game-finish"><button type="button" class="primary-button" data-minigame="${e(this.id)}">Play again</button>${other ? `<button type="button" class="outline-button" data-minigame="${e(other.id)}">Next: ${e(other.title)}</button>` : ''}<button type="button" data-action="close-dialog">Back to the town</button></div></div>`;
    this.feedback.textContent = 'Your answers are in the Atlas. Due words will return.';
    this.root.querySelector<HTMLElement>('.minigame-footer')!.hidden = true;
  }
  private bestKey() { const date = new Date(); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return `atlas.minigame.chain:${this.services.playerId ?? 'local'}:${this.id}:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; }
  private bestLabel() { try { return `This week’s longest chain: ${Number(localStorage.getItem(this.bestKey()) ?? 0)}`; } catch { return ''; } }
  private saveBest() { try { const best = Number(localStorage.getItem(this.bestKey()) ?? 0); localStorage.setItem(this.bestKey(), String(Math.max(best, this.summary.longestChain))); } catch { /* Optional record only. */ } }
  destroy() {
    if (this.running && !this.destroyed) this.endRound();
    this.destroyed = true; this.generation++; if (this.raf) cancelAnimationFrame(this.raf);
    this.timers.forEach(timer => clearTimeout(timer)); this.timers.clear(); this.round?.destroy?.(); this.unbind?.();
    document.removeEventListener('keydown', this.keydown);
    if (this.root) { this.root.removeEventListener('click', this.click); this.root.removeEventListener('submit', this.submitForm); this.root.removeEventListener('pointerdown', this.pointerDown); this.root.removeEventListener('pointerup', this.pointerUp); }
    this.services?.audio.stop();
  }
}
