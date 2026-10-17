import { seededShuffle } from '../game-shuffle';
import type { SpriteLibrary } from './sprite-library';
import { catchingNumberLabel } from './game-pools';
import './catching.css';

export { catchingNumberLabel };

export type CatchLane = 0 | 1 | 2;
export interface CatchingChoice { label: string; sprite?: string; answer: string; }
export interface CatchingOptions {
  choices: readonly CatchingChoice[]; targetAnswer: string; sprites: SpriteLibrary;
  reducedMotion: boolean; durationMs: number; onCatch(index: number): void; onMiss(): void;
}
export interface FallingApple { choiceIndex: number; lane: CatchLane; }
export interface CatchingState {
  apples: readonly FallingApple[]; durationMs: number; elapsedMs: number;
  crateLane: CatchLane; armed: boolean; finished: boolean;
}
export interface CatchingStep { state: CatchingState; caughtIndex?: number; missed: boolean; }
export interface CatchingController { start(): void; pause(): void; resume(): void; destroy(): void; }

/** The target only ensures a valid pool. The selected crate lane supplies the answer. */
export function createCatchingState(choices: readonly CatchingChoice[], targetAnswer: string, durationMs: number): CatchingState {
  const targetIndex = choices.findIndex(choice => choice.answer === targetAnswer);
  // hundert/einhundert and tausend/eintausend share the same visible number;
  // they cannot serve as distinguishable distractors in a number-catching task.
  const signature = (choice: CatchingChoice) => catchingNumberLabel(choice) ?? choice.sprite ?? choice.answer;
  const used = new Set<string>();
  const unique = (targetIndex < 0 ? [] : [targetIndex, ...choices.map((_, index) => index).filter(index => index !== targetIndex)])
    .filter(index => { const value = signature(choices[index]); if (used.has(value)) return false; used.add(value); return true; });
  if (targetIndex < 0 || unique.length < 2) throw Error('Catching needs the restored target and at least one distinct distractor.');
  if (!Number.isFinite(durationMs) || durationMs < 250) throw Error('Catching needs a valid falling duration.');
  const seed = choices.map((choice, index) => `${index}:${choice.answer}:${choice.label}`).join('|');
  const indices = seededShuffle(unique, `${seed}:apples`).slice(0, 3);
  if (!indices.includes(targetIndex)) indices[seededShuffle([0, 1, 2], `${seed}:inclusion`)[0]] = targetIndex;
  const lanes = seededShuffle([0, 1, 2] as CatchLane[], `${seed}:lanes`);
  return { apples: indices.map((choiceIndex, index) => ({ choiceIndex, lane: lanes[index] })), durationMs, elapsedMs: 0, crateLane: 1, armed: false, finished: false };
}
export function selectCatchLane(state: CatchingState, lane: CatchLane): CatchingState {
  return state.finished ? state : { ...state, crateLane: lane, armed: true };
}
/** One collision reports one real original choice index, including index zero. */
export function advanceCatching(state: CatchingState, deltaMs: number): CatchingStep {
  if (state.finished) return { state, missed: false };
  const elapsedMs = Math.min(state.durationMs, state.elapsedMs + (Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0));
  if (elapsedMs < state.durationMs) return { state: { ...state, elapsedMs }, missed: false };
  const apple = state.armed ? state.apples.find(apple => apple.lane === state.crateLane) : undefined;
  return { state: { ...state, elapsedMs, finished: true }, caughtIndex: apple?.choiceIndex, missed: !apple };
}

export function mountCatching(root: HTMLElement, options: CatchingOptions): CatchingController {
  let state = createCatchingState(options.choices, options.targetAnswer, options.durationMs);
  const labels = new Map(state.apples.map(apple => [apple.choiceIndex, catchingNumberLabel(options.choices[apple.choiceIndex])]));
  if (state.apples.some(apple => !labels.get(apple.choiceIndex) && !options.choices[apple.choiceIndex].sprite)) throw Error('A catching choice needs a numeric label or a distinct painted sprite.');
  let started = false, paused = false, destroyed = false, raf = 0, previous = 0;
  let pointer: { x: number; y: number; id: number } | undefined;
  const board = document.createElement('section'); board.className = 'catching-board';
  board.classList.toggle('catching-reduced', options.reducedMotion);
  board.setAttribute('aria-label', 'Fritz’s falling apples');
  board.innerHTML = '<div class="catching-stage" tabindex="0" role="group" aria-label="Move the crate with left and right arrows, or choose a lane"><div class="catching-awning" aria-hidden="true"></div><div class="catching-lanes" aria-hidden="true"><i></i><i></i><i></i></div><div class="catching-line" aria-hidden="true"></div><div class="catching-crate" aria-hidden="true"></div><div class="catching-meter" aria-hidden="true"><i></i></div></div><div class="catching-controls" role="group" aria-label="Crate lane"><button type="button" data-game-action="catch-left" data-catch-lane="0" aria-label="Left lane" aria-pressed="false" disabled>← <kbd>1</kbd></button><button type="button" data-game-action="catch-center" data-catch-lane="1" aria-label="Center lane" aria-pressed="false" disabled>↓ <kbd>2</kbd></button><button type="button" data-game-action="catch-right" data-catch-lane="2" aria-label="Right lane" aria-pressed="false" disabled>→ <kbd>3</kbd></button></div><p class="catching-status" role="status" aria-live="polite">Listen to Fritz first.</p>';
  root.append(board);
  const stage = board.querySelector<HTMLElement>('.catching-stage')!, crate = board.querySelector<HTMLElement>('.catching-crate')!;
  const status = board.querySelector<HTMLElement>('.catching-status')!, meter = board.querySelector<HTMLElement>('.catching-meter i')!;
  crate.append(options.sprites.render('prop-crate', '', 136));
  const apples = state.apples.map(apple => {
    const choice = options.choices[apple.choiceIndex], number = labels.get(apple.choiceIndex);
    const element = document.createElement('div'); element.className = 'catching-apple';
    element.style.setProperty('--lane', String(apple.lane));
    element.setAttribute('role', 'img'); element.setAttribute('aria-label', number ? `Number ${number}` : 'Painted item');
    element.append(options.sprites.render(choice.sprite ?? 'item-apfel-noun', '', 98));
    if (number) { const digit = document.createElement('span'); digit.className = 'catching-digit'; digit.textContent = number; element.append(digit); }
    stage.append(element); return element;
  });
  const buttons = [...board.querySelectorAll<HTMLButtonElement>('[data-catch-lane]')];
  const render = () => {
    const progress = Math.min(1, state.elapsedMs / state.durationMs);
    board.style.setProperty('--fall', String(options.reducedMotion ? .82 : progress));
    crate.style.setProperty('--lane', String(state.crateLane)); crate.classList.toggle('catching-unarmed', !state.armed);
    meter.style.transform = `scaleX(${1 - progress})`;
    for (const button of buttons) {
      button.disabled = !started || paused || destroyed || state.finished;
      button.setAttribute('aria-pressed', String(state.armed && Number(button.dataset.catchLane) === state.crateLane));
    }
  };
  const choose = (lane: CatchLane) => {
    if (!started || paused || destroyed || state.finished || document.hidden) return;
    state = selectCatchLane(state, lane); status.textContent = 'Catch the number Fritz called.'; render();
  };
  const click = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-catch-lane]');
    if (button && !button.disabled && board.contains(button)) choose(Number(button.dataset.catchLane) as CatchLane);
  };
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || !started || paused || destroyed || state.finished) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !board.contains(target) || target.matches('input,textarea,select') || target.isContentEditable) return;
    let lane: CatchLane | undefined;
    if (event.key === 'ArrowLeft') lane = Math.max(0, state.crateLane - 1) as CatchLane;
    else if (event.key === 'ArrowRight') lane = Math.min(2, state.crateLane + 1) as CatchLane;
    else if (/^[1-3]$/.test(event.key)) lane = (Number(event.key) - 1) as CatchLane;
    if (lane !== undefined) { event.preventDefault(); event.stopPropagation(); choose(lane); }
  };
  const down = (event: PointerEvent) => {
    if (!started || paused || destroyed || state.finished) return;
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
    try { stage.setPointerCapture?.(event.pointerId); } catch { /* Capture may be unavailable on an older touch browser. */ }
  };
  const up = (event: PointerEvent) => {
    const initial = pointer; pointer = undefined;
    if (!initial || initial.id !== event.pointerId) return;
    const dx = event.clientX - initial.x, dy = event.clientY - initial.y;
    if (Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy)) { event.preventDefault(); choose(Math.max(0, Math.min(2, state.crateLane + Math.sign(dx))) as CatchLane); }
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const bounds = stage.getBoundingClientRect();
      if (bounds.width > 0) choose(Math.max(0, Math.min(2, Math.floor((event.clientX - bounds.left) / bounds.width * 3))) as CatchLane);
    }
  };
  const cancelPointer = () => { pointer = undefined; };
  const tick = (now: number) => {
    if (destroyed || paused || state.finished) return;
    const delta = Math.max(0, Math.min(100, now - previous)); previous = now;
    if (!document.hidden) {
      const outcome = advanceCatching(state, delta); state = outcome.state; render();
      if (state.finished) {
        status.textContent = outcome.missed ? 'No apple reached the crate.' : 'An apple reached the crate.';
        if (outcome.caughtIndex !== undefined) { apples[state.apples.findIndex(apple => apple.choiceIndex === outcome.caughtIndex)]?.classList.add('catching-caught'); options.onCatch(outcome.caughtIndex); }
        else if (outcome.missed) options.onMiss();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  board.addEventListener('click', click); root.addEventListener('keydown', key, true);
  stage.addEventListener('pointerdown', down); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', cancelPointer);
  render();
  return {
    start() { if (started || destroyed) return; started = true; previous = performance.now(); status.textContent = 'Choose a lane. The apples are falling.'; render(); stage.focus(); if (!paused) raf = requestAnimationFrame(tick); },
    pause() { if (destroyed || paused || state.finished) return; paused = true; pointer = undefined; cancelAnimationFrame(raf); status.textContent = 'Paused.'; render(); },
    resume() { if (destroyed || !paused || state.finished) return; paused = false; previous = performance.now(); status.textContent = 'Catch the number Fritz called.'; render(); if (started) { stage.focus(); raf = requestAnimationFrame(tick); } },
    destroy() { if (destroyed) return; destroyed = true; pointer = undefined; cancelAnimationFrame(raf); root.removeEventListener('keydown', key, true); board.removeEventListener('click', click); stage.removeEventListener('pointerdown', down); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', cancelPointer); board.remove(); },
  };
}
