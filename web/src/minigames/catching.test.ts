// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededShuffle } from '../game-shuffle';
import { advanceCatching, catchingNumberLabel, createCatchingState, mountCatching, selectCatchLane, type CatchingChoice, type CatchingOptions } from './catching';
import type { SpriteLibrary } from './sprite-library';
import { MiniGameInput } from './input';

const choices: CatchingChoice[] = [{ label: 'eins', answer: 'eins' }, { label: 'zwei', answer: 'zwei' }, { label: 'drei', answer: 'drei' }];
let frames: Map<number, FrameRequestCallback>, clock: number, serial: number;
let mounted: ReturnType<typeof mountCatching> | undefined;
beforeEach(() => {
  frames = new Map(); clock = 0; serial = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const id = ++serial; frames.set(id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});
afterEach(() => { mounted?.destroy(); mounted = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function frame(ms = 100) { clock += ms; const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(clock); }
function harness(extra: Partial<CatchingOptions> = {}) {
  const root = document.createElement('section'); document.body.append(root);
  const options: CatchingOptions = {
    choices, targetAnswer: 'eins', reducedMotion: false, durationMs: 1000,
    sprites: { render: vi.fn((name: string) => { const image = document.createElement('img'); image.dataset.frame = name; image.alt = ''; return image; }) } as unknown as SpriteLibrary,
    onCatch: vi.fn(), onMiss: vi.fn(), ...extra,
  };
  mounted = mountCatching(root, options);
  const stage = root.querySelector<HTMLElement>('.catching-stage')!;
  return { root, options, run: mounted, stage };
}

describe('falling-lane simulation', () => {
  it('keeps a valid target and restored distractors while preserving original choice indices', () => {
    const large = [...choices, { label: 'vier', answer: 'vier' }, { label: 'fünf', answer: 'fünf' }, { label: 'sechs', answer: 'sechs' }];
    const state = createCatchingState(large, 'sechs', 1000);
    expect(state.apples).toHaveLength(3);
    expect(state.apples.some(apple => apple.choiceIndex === 5)).toBe(true);
    expect(new Set(state.apples.map(apple => apple.lane)).size).toBe(3);
    expect(createCatchingState(large, 'sechs', 1000)).toEqual(state);
    const lanes = new Set(Array.from({ length: 12 }, (_, seed) => {
      const shuffled = seededShuffle(large, seed), target = shuffled.findIndex(choice => choice.answer === 'sechs');
      return createCatchingState(shuffled, 'sechs', 1000).apples.find(apple => apple.choiceIndex === target)!.lane;
    }));
    expect(lanes.size).toBeGreaterThan(1);
  });

  it('catches the actual wrong apple at the line without any client correctness result', () => {
    const state = createCatchingState(choices, 'eins', 1000), wrong = state.apples.find(apple => apple.choiceIndex !== 0)!;
    const before = advanceCatching(selectCatchLane(state, wrong.lane), 999);
    expect(before.caughtIndex).toBeUndefined(); expect(before.missed).toBe(false);
    const outcome = advanceCatching(before.state, 1);
    expect(outcome.caughtIndex).toBe(wrong.choiceIndex); expect(outcome.missed).toBe(false);
    expect(outcome).not.toHaveProperty('correct');
    expect(advanceCatching(outcome.state, 1000).caughtIndex).toBeUndefined();
  });

  it('retains original index zero and never rewards an unarmed default crate', () => {
    const state = createCatchingState(choices, 'eins', 1000), lane = state.apples.find(apple => apple.choiceIndex === 0)!.lane;
    expect(advanceCatching(selectCatchLane(state, lane), 1000).caughtIndex).toBe(0);
    expect(advanceCatching(state, 1000).missed).toBe(true);
    const two = createCatchingState(choices.slice(0, 2), 'eins', 1000);
    const empty = ([0, 1, 2] as const).find(lane => !two.apples.some(apple => apple.lane === lane))!;
    expect(advanceCatching(selectCatchLane(two, empty), 1000).missed).toBe(true);
  });

  it('uses numeric meanings and refuses pools without a target or a distractor', () => {
    expect(catchingNumberLabel({ label: 'zwölf', answer: 'zwölf' })).toBe('12');
    expect(catchingNumberLabel({ label: 'vierzig', answer: 'vierzig' })).toBe('40');
    expect(catchingNumberLabel({ label: '4,50 €', answer: 'price' })).toBe('4,50 €');
    expect(catchingNumberLabel({ label: 'some word', answer: 'unmapped' })).toBeUndefined();
    expect(() => createCatchingState(choices, 'missing', 1000)).toThrow('target');
    expect(() => createCatchingState([choices[0], choices[0]], 'eins', 1000)).toThrow('distractor');
    const aliases = [{ label: 'hundert', answer: 'hundert' }, { label: 'einhundert', answer: 'einhundert' }, choices[1]];
    const hundred = createCatchingState(aliases, 'einhundert', 1000);
    expect(hundred.apples.map(apple => apple.choiceIndex).sort()).toEqual([1, 2]);
    expect(() => createCatchingState(aliases.slice(0, 2), 'hundert', 1000)).toThrow('distractor');
  });
});

describe('catching controls, audio gate and lifecycle', () => {
  it('renders painted apples/crate and native lane controls without printing German answer words', () => {
    const h = harness();
    expect(h.options.sprites.render).toHaveBeenCalledWith('prop-crate', '', 136);
    expect(h.options.sprites.render).toHaveBeenCalledWith('item-apfel-noun', '', 98);
    expect(h.root.querySelectorAll('[data-game-action^="catch-"]')).toHaveLength(3);
    expect([...h.root.querySelectorAll('[data-catch-lane]')].every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(h.root.textContent).not.toContain('eins'); expect(h.root.textContent).not.toContain('zwei');
    expect(h.root.querySelector('[aria-label="Left lane"]')).not.toBeNull();
    expect(h.root.querySelector('[data-game-option]')).toBeNull();
    for (let i = 0; i < 20; i++) frame();
    expect(h.options.onCatch).not.toHaveBeenCalled(); expect(h.options.onMiss).not.toHaveBeenCalled();
  });

  it('waits for start after audio, then catches once through a native lane button', () => {
    const h = harness(), state = createCatchingState(choices, 'eins', 1000), apple = state.apples.find(apple => apple.choiceIndex === 0)!;
    h.run.start(); h.run.start();
    h.root.querySelector<HTMLButtonElement>(`[data-catch-lane="${apple.lane}"]`)!.click();
    expect(h.options.onCatch).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) frame();
    expect(h.options.onCatch).toHaveBeenCalledExactlyOnceWith(0); expect(h.options.onMiss).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) frame();
    expect(h.options.onCatch).toHaveBeenCalledOnce();
  });

  it('captures crate arrow keys before the shared document focus handler', () => {
    const h = harness(), leaked = vi.fn(); document.addEventListener('keydown', leaked);
    h.run.start();
    h.stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(h.root.querySelector('[data-catch-lane="0"]')!.getAttribute('aria-pressed')).toBe('true');
    h.stage.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
    expect(h.root.querySelector('[data-catch-lane="2"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(leaked).not.toHaveBeenCalled(); document.removeEventListener('keydown', leaked);
  });

  it('moves the crate through a horizontal swipe and does not intercept vertical scrolling', () => {
    const h = harness(); h.run.start();
    h.stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 150, clientY: 100, bubbles: true }));
    h.stage.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 210, clientY: 104, bubbles: true, cancelable: true }));
    expect(h.root.querySelector('[data-catch-lane="2"]')!.getAttribute('aria-pressed')).toBe('true');
    h.stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 100, clientY: 100, bubbles: true }));
    h.stage.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: 102, clientY: 160, bubbles: true, cancelable: true }));
    expect(h.root.querySelector('[data-catch-lane="2"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('uses the shared gamepad focus buttons to move the crate without immediately submitting', () => {
    const h = harness(), dialog = document.createElement('dialog'); dialog.open = true;
    document.body.append(dialog); dialog.append(h.root);
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false }));
    const pad = { connected: true, axes: [1, 0], buttons };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const unbind = new MiniGameInput().bind(h.root);
    h.run.start(); frame(300);
    expect(document.activeElement).toBe(h.root.querySelector('[data-game-action="catch-left"]'));
    pad.axes[0] = 0; frame(); buttons[0].pressed = true; frame();
    expect(h.root.querySelector('[data-catch-lane="0"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(h.options.onCatch).not.toHaveBeenCalled();
    for (let i = 0; i < 7; i++) frame();
    const actualIndex = createCatchingState(choices, 'eins', 1000).apples.find(apple => apple.lane === 0)!.choiceIndex;
    expect(h.options.onCatch).toHaveBeenCalledExactlyOnceWith(actualIndex);
    unbind();
  });

  it('excludes paused time and releases controls/listeners on cleanup', () => {
    const h = harness(); h.run.start();
    for (let i = 0; i < 5; i++) frame();
    h.run.pause(); for (let i = 0; i < 20; i++) frame();
    expect(h.options.onMiss).not.toHaveBeenCalled();
    expect(h.root.querySelector<HTMLButtonElement>('[data-catch-lane="1"]')!.disabled).toBe(true);
    h.run.resume(); for (let i = 0; i < 4; i++) frame();
    expect(h.options.onMiss).not.toHaveBeenCalled(); frame(); expect(h.options.onMiss).toHaveBeenCalledOnce();
    h.run.destroy(); expect(h.root.querySelector('.catching-board')).toBeNull(); expect(frames.size).toBe(0);
    h.run.resume(); h.run.start(); for (let i = 0; i < 20; i++) frame(); expect(h.options.onMiss).toHaveBeenCalledOnce();
  });

  it('uses the same collision semantics with reduced motion', () => {
    const h = harness({ reducedMotion: true }); h.run.start();
    const before = h.root.querySelector<HTMLElement>('.catching-board')!.style.getPropertyValue('--fall');
    for (let i = 0; i < 5; i++) frame();
    expect(h.root.querySelector<HTMLElement>('.catching-board')!.style.getPropertyValue('--fall')).toBe(before);
    for (let i = 0; i < 5; i++) frame(); expect(h.options.onMiss).toHaveBeenCalledOnce();
  });
});
