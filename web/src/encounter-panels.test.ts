// @vitest-environment happy-dom
import './test-support/expedition-fixtures';
import { describe, expect, it } from 'vitest';
import { renderInteriorEncounter } from './encounter-panels';
import { getInterior, getInteriorObject } from './interiors';

describe('compact interior encounter', () => {
  it('keeps the session title as its always-available primary action and puts one game after it', () => {
    const object = getInteriorObject('interior:cafe:coffee')!;
    const host = document.createElement('div');
    host.innerHTML = renderInteriorEncounter({ room: getInterior('cafe'), object, portraitMarkup: '<img class="portrait" alt="" />', miniGame: { id: 'tray-rush', title: 'Tray Rush' } });
    expect(host.querySelector('h2')?.textContent).toBe('Marta');
    expect(host.querySelector('.encounter-role')?.textContent).toBe('Host');
    expect(host.querySelectorAll('.primary-button')).toHaveLength(1);
    expect(host.querySelector<HTMLElement>('.primary-button')?.dataset.practiceInterior).toBe(object.id);
    expect(host.querySelector('.primary-button')?.textContent).toContain(object.sessionTitle);
    expect(host.querySelectorAll('[data-minigame]')).toHaveLength(1);
    expect(host.querySelector('[data-minigame]')?.closest('.encounter-secondary')).not.toBeNull();
    expect(host.querySelector('.eyebrow, small, .interior-description, .interior-practice-card, .interior-game-card')).toBeNull();
    expect(host.textContent).not.toContain('0 expressions');
    expect(host.textContent).not.toContain('The espresso machine');
  });

  it('makes word chips select the shared detail surface, with meanings and empty plurals hidden', () => {
    const object = getInteriorObject('interior:cafe:coffee')!;
    const host = document.createElement('div');
    host.innerHTML = renderInteriorEncounter({ room: getInterior('cafe'), object });
    const chips = [...host.querySelectorAll<HTMLElement>('[data-interior-word]')];
    expect(chips.map(chip => chip.textContent)).toEqual(['der Kaffee', 'die Milch', 'der Zucker']);
    expect(chips.map(chip => chip.dataset.wordIndex)).toEqual(['0', '1', '2']);
    expect(chips.every(chip => chip.dataset.interiorWord === object.id)).toBe(true);
    expect(host.textContent).not.toContain('milk');
    expect(host.textContent).not.toContain('—');
    expect(host.querySelector('[data-minigame]')).toBeNull();
    expect(host.querySelector<HTMLElement>('.translated-sentence')?.dataset.translation).toContain('Good morning!');
    expect(host.textContent).not.toContain('Good morning!');
    expect(host.querySelector('[data-action="close-dialog"]')?.textContent).toBe('Leave');
  });

  it('escapes station titles, word chips and supplied game labels', () => {
    const object = { ...getInteriorObject('interior:inn:bed')!, label: '<script>', sessionTitle: 'Rest <here>', vocabulary: [{ article: 'das', lemma: '<Bett>', english: 'bed', plural: '' }] };
    const host = document.createElement('div');
    host.innerHTML = renderInteriorEncounter({ room: getInterior('inn'), object, miniGame: { id: 'word-chain', title: '<game>' } });
    expect(host.querySelector('script, game, bett, here')).toBeNull();
    expect(host.querySelector('h2')?.textContent).toBe('<script>');
    expect(host.querySelector('.primary-button')?.textContent).toContain('Rest <here>');
  });
});
