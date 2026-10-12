// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gamepadInput } from '../world-gamepad';
import { MiniGameInput } from './input';

vi.mock('../world-gamepad', () => ({ gamepadInput: vi.fn(() => ({ x: 0, y: 0, interact: false })) }));
let frames: FrameRequestCallback[];
let unbind: (() => void) | undefined;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.mocked(gamepadInput).mockReturnValue({ x: 0, y: 0, interact: false });
});
afterEach(() => { unbind?.(); unbind = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });

function surface() {
  document.body.innerHTML = `<button id="outside">Outside</button><dialog open><section id="game"><input id="typing"/><button data-game-option="0">First</button><button data-game-option="1">Second</button><div hidden><button data-game-option="2">Hidden</button></div><button data-game-action="pause">Pause</button></section></dialog>`;
  const root = document.querySelector<HTMLElement>('#game')!;
  const first = root.querySelector<HTMLButtonElement>('[data-game-option="0"]')!;
  const second = root.querySelector<HTMLButtonElement>('[data-game-option="1"]')!;
  const clicked = vi.fn(); root.addEventListener('click', clicked);
  unbind = new MiniGameInput().bind(root);
  return { root, first, second, clicked };
}

describe('mini-game keyboard and controller input', () => {
  it('supports option hotkeys, focus arrows and Enter while leaving typed digits alone', () => {
    const { first, second, clicked } = surface();
    const typing = document.querySelector<HTMLInputElement>('#typing')!;
    typing.focus(); typing.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(clicked).not.toHaveBeenCalled();
    first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(second);
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(clicked).toHaveBeenCalledOnce();
    second.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    expect(clicked).toHaveBeenCalledTimes(2);
    second.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
    expect(clicked).toHaveBeenCalledTimes(2);
  });

  it('does not capture another control, a closed dialog, modifiers or held keys', () => {
    const { first, clicked } = surface(), outside = document.querySelector<HTMLButtonElement>('#outside')!;
    outside.focus(); outside.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    first.focus();
    for (const extra of [{ ctrlKey: true }, { repeat: true }, { altKey: true }, { metaKey: true }]) first.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, ...extra }));
    document.querySelector('dialog')!.open = false;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('scopes gamepad activation to the game and activates once per press', () => {
    const { first, second, clicked } = surface(), outside = document.querySelector<HTMLButtonElement>('#outside')!;
    const outsideClick = vi.fn(); outside.addEventListener('click', outsideClick);
    outside.focus();
    vi.mocked(gamepadInput).mockReturnValue({ x: 0, y: 0, interact: true });
    frames.shift()!(1000);
    expect(outsideClick).not.toHaveBeenCalled();
    vi.mocked(gamepadInput).mockReturnValue({ x: 0, y: 0, interact: false }); frames.shift()!(1100);
    first.focus();
    vi.mocked(gamepadInput).mockReturnValue({ x: 1, y: 0, interact: false }); frames.shift()!(1500);
    expect(document.activeElement).toBe(second);
    vi.mocked(gamepadInput).mockReturnValue({ x: 0, y: 0, interact: true }); frames.shift()!(1600); frames.shift()!(1700);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('releases listeners and animation polling on destroy', () => {
    const { first, clicked } = surface(); first.focus();
    unbind!(); unbind = undefined;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    const count = frames.length; frames.shift()!(1000);
    expect(frames.length).toBe(count - 1);
    expect(clicked).not.toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
