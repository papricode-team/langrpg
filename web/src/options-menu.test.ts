// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindOptionRows, optionsMarkup, stepOption, type OptionRow } from './options-menu';

const pace: OptionRow = { kind: 'choice', id: 'pace', label: 'Listening pace', help: 'How fast German is spoken.', value: '0.82', choices: [{ value: '0.65', label: 'Slower' }, { value: '0.82', label: 'Easy' }, { value: '1', label: 'Natural' }] };
const sound: OptionRow = { kind: 'choice', id: 'sound', label: 'Sounds', help: '', value: 'on', choices: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] };
const hour: OptionRow = { kind: 'scale', id: 'hour', label: 'Hour', help: '', value: 22, min: 0, max: 23, step: 1, display: '22:00' };

afterEach(() => document.body.replaceChildren());

describe('stepOption', () => {
  it('clamps lists, wraps toggles and bounds scales', () => {
    expect(stepOption(pace, 1)).toBe('1');
    expect(stepOption({ ...pace, value: '1' }, 1)).toBe('1');
    expect(stepOption(sound, 1)).toBe('off');
    expect(stepOption({ ...sound, value: 'off' }, 1)).toBe('on');
    expect(stepOption(hour, 1)).toBe(23);
    expect(stepOption({ ...hour, value: 23 }, 1)).toBe(23);
  });
});

describe('option rows', () => {
  it('render one focusable value per row with its help on the row', () => {
    document.body.innerHTML = optionsMarkup('audio', [pace, hour, { kind: 'action', id: 'credits', label: 'Credits', help: 'Sources', action: 'course-sources', button: 'Open' }]);
    expect(document.querySelectorAll('[data-option]').length).toBe(2);
    expect(document.querySelector('[data-option="pace"]')!.textContent).toContain('Easy');
    expect(document.querySelectorAll('.option-cells i.on').length).toBe(23);
    expect(document.querySelector('[data-action="course-sources"]')!.closest<HTMLElement>('[data-help]')!.dataset.help).toBe('Sources');
    expect([...document.querySelectorAll('.option-arrow')].every(arrow => arrow.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('change with left and right, arrows and clicks', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = optionsMarkup('audio', [pace]);
    const change = vi.fn(), sounds = vi.fn();
    const unbind = bindOptionRows(root, [pace], change, sounds);
    const value = root.querySelector<HTMLElement>('[data-option="pace"]')!;
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(change).toHaveBeenLastCalledWith(pace, '0.65');
    root.querySelector<HTMLElement>('[data-option-step="1"]')!.click();
    expect(change).toHaveBeenLastCalledWith(pace, '1');
    value.click();
    expect(change).toHaveBeenCalledTimes(3);
    expect(sounds).toHaveBeenCalledWith('confirm');
    unbind();
    value.click();
    expect(change).toHaveBeenCalledTimes(3);
  });
});
