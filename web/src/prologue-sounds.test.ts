// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountSoundsBoard, prologueSounds } from './prologue-sounds';

afterEach(() => document.body.replaceChildren());

function board(silent = false) {
  const root = document.createElement('div'); document.body.append(root);
  const speak = vi.fn(), onClose = vi.fn();
  mountSoundsBoard(root, {silent, speak, onClose});
  const tap = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click();
  return {root, speak, onClose, tap};
}

it('plays a cue before revealing its letters and repeats it after a mistaken tile', () => {
  const {root, speak, tap} = board();
  expect(speak).toHaveBeenLastCalledWith('ä', 'prologue-sound-0');
  expect(root.querySelector('.sound-cue')!.textContent).toBe('♪');
  tap('[data-letter="ö"]');
  expect(root.querySelector('.sound-cue')!.textContent).toBe('ä');
  expect(root.querySelector('[role="status"]')!.textContent).toBe('Look and listen once more.');
  expect(speak).toHaveBeenLastCalledWith('ä', 'prologue-sound-0');
  tap('[data-sound="next"]');
  expect(speak).toHaveBeenLastCalledWith('ö', 'prologue-sound-1');
});

it('lets a silent player recognise every letter pattern and finish without audio', () => {
  const {root, speak, onClose, tap} = board(true);
  for (const sound of prologueSounds) {
    expect(root.querySelector('.sound-cue')!.textContent).toBe(sound);
    tap(`[data-letter="${sound}"]`);
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Yes.');
    tap('[data-sound="next"]');
  }
  expect(speak).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  expect(root.onclick).toBeNull();
});

it('allows the board to be skipped immediately', () => {
  const {onClose, tap} = board();
  tap('[data-sound="close"]');
  expect(onClose).toHaveBeenCalledOnce();
});
