// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { Progress } from './api';
import { emptyStory } from './dialogue';
import { storyClues, type StoryClue } from './story';
import { endings, evidenceBoard, specialItems } from './story-panels';

const itemId = '7b94f4ad-cf60-56f7-91c5-9e60dd4596fc';
const clue: StoryClue = {
  questId: 'quest-uuid', title: 'The name on a fading ticket', evidenceItem: itemId,
  heading: { german: 'Der Name auf der blassen Fahrkarte', english: 'The name on the faded ticket' },
  text: [{ german: 'Bahnsteig sieben ist zu.', english: 'Platform seven is closed.' }], lead: [], letter: [],
};
const progress = (inventory: string[], ending?: string) => ({ story: { ...emptyStory(), inventory, ...(ending ? { ending } : {}) } }) as unknown as Progress;
const page = (markup: string) => { const root = document.createElement('div'); root.innerHTML = markup; return root; };

describe('evidence board', () => {
  afterEach(() => {
    storyClues.splice(storyClues.indexOf(clue), 1);
    delete specialItems[itemId.replace('7b', 'aa')];
    delete endings['test-ending'];
  });

  it('names evidence held by public id with the German heading of its clue', () => {
    storyClues.push(clue);
    const root = page(evidenceBoard(progress([itemId])));
    const heading = root.querySelector('.evidence-card h3')!;
    expect(heading.textContent).toBe('Der Name auf der blassen Fahrkarte');
    expect(heading.querySelector('.translated-sentence')?.getAttribute('data-translation')).toBe('The name on the faded ticket');
    expect(root.textContent).not.toContain(itemId);
    expect(root.querySelector<HTMLElement>('[data-replay-dialogue]')?.dataset.replayDialogue).toBe('quest-uuid');
  });

  it('shows special items and endings in German, with English as the translation', () => {
    storyClues.push(clue);
    const special = itemId.replace('7b', 'aa');
    specialItems[special] = { title: 'Herr Falk’s ink', text: 'Herr Falk says his ink never fades.', heading: { german: 'Herr Falks Tinte', english: 'Herr Falk’s ink' }, story: [{ german: 'Herr Falk sagt: Diese Tinte verblasst nie.', english: 'Herr Falk says: this ink never fades.' }] };
    endings['test-ending'] = { title: 'The towns choose', text: 'Each town has a voice.', heading: { german: 'Die Städte entscheiden', english: 'The towns decide' }, story: [{ german: 'Jede Stadt hat eine Stimme im Atlas.', english: 'Each town has a voice in the Atlas.' }] };
    const root = page(evidenceBoard(progress([special], 'test-ending')));
    expect(root.querySelector('.evidence-card h3')!.textContent).toBe('Herr Falks Tinte');
    expect(root.querySelector('.evidence-detail')!.textContent).toContain('Diese Tinte verblasst nie.');
    expect(root.querySelector('.ending-card h3')!.textContent).toBe('Die Städte entscheiden');
    expect(root.querySelector('.ending-card p .translated-sentence')).not.toBeNull();
  });

  it('never shows a raw id for an item without authored text', () => {
    storyClues.push(clue);
    const root = page(evidenceBoard(progress(['0f0f0f0f-0000-5000-8000-000000000000'])));
    expect(root.textContent).not.toContain('0f0f0f0f');
  });
});
