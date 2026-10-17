// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { installOverlay, setBaseLanguage } from './i18n';
import { interiors } from './interiors';
import {
  backInteriorConversation, chooseInteriorConversation, createInteriorConversationState,
  interiorConversationFor, interiorConversationNode, interiorConversations, renderInteriorConversation,
  replayInteriorConversation, type InteriorConversationState,
} from './interior-conversations';

afterEach(async () => { await setBaseLanguage('en', { persist: false }); installOverlay(undefined); });

describe('authored interior conversations', () => {
  it('covers every shop station and the inn welcome without replacing rest or evidence actions', () => {
    const stations = interiors.filter(room => !room.id.startsWith('train-')).flatMap(room => room.objects.filter(object => room.id !== 'inn' || object.id === 'interior:inn:welcome').map(object => object.id));
    expect(interiorConversations.map(conversation => conversation.objectId).sort()).toEqual(stations.sort());
    expect(interiorConversationFor('interior:inn:bed')).toBeUndefined();
    expect(createInteriorConversationState('unknown')).toBeUndefined();
  });

  it('gives every branch at least three spoken turns, complete support text, and a reachable ending', () => {
    for (const conversation of interiorConversations) {
      const visit = (state: InteriorConversationState, seen: string[] = []) => {
        const current = interiorConversationNode(state)!;
        expect(current, `${conversation.objectId}: missing node`).toBeDefined();
        expect(seen, `${conversation.objectId}: dialogue loop`).not.toContain(current.id);
        for (const value of [current.line, ...current.choices.map(choice => choice.line)]) {
          expect(value.german.trim()).not.toBe('');
          expect(value.english.trim()).not.toBe('');
          expect(value.turkish.trim()).not.toBe('');
        }
        if (!current.choices.length) expect(state.history.length).toBeGreaterThanOrEqual(2);
        for (const option of current.choices) visit(chooseInteriorConversation(state, option.id), [...seen, current.id]);
      };
      visit(createInteriorConversationState(conversation.objectId)!);
    }
  });

  it('branches on the German answer and allows back or replay without retaining a graded result', () => {
    const start = createInteriorConversationState('interior:cafe:coffee')!;
    const milk = chooseInteriorConversation(start, 'first'), black = chooseInteriorConversation(start, 'second');
    expect(interiorConversationNode(milk)?.line.german).toContain('mit Milch');
    expect(interiorConversationNode(black)?.line.german).toContain('schwarzer Kaffee');
    expect(start.history).toEqual([]);
    expect(backInteriorConversation(milk)).toEqual(start);
    expect(backInteriorConversation(start)).toBe(start);
    expect(chooseInteriorConversation(milk, 'stale-choice')).toBe(milk);
    const done = chooseInteriorConversation(milk, 'finish');
    expect(interiorConversationNode(done)?.choices).toEqual([]);
    expect(replayInteriorConversation(done)).toEqual(start);
    expect(Object.keys(done).sort()).toEqual(['history', 'nodeId', 'objectId']);
    expect(renderInteriorConversation(done)).toContain('data-interior-conversation="replay"');
  });

  it('renders German choices and audio with English meaning hidden in translation attributes', () => {
    const state = createInteriorConversationState('interior:cafe:coffee')!;
    const host = document.createElement('div');
    host.innerHTML = renderInteriorConversation(state, { portraitMarkup: '<img class="portrait" alt="" />' });
    expect(host.querySelector('h2')?.textContent).toBe('Marta');
    expect(host.querySelectorAll('[data-interior-choice]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-speak]')).toHaveLength(3);
    expect(host.textContent).toContain('Einen Kaffee mit Milch, bitte.');
    expect(host.textContent).not.toContain('A coffee with milk, please.');
    const answer = host.querySelector<HTMLElement>('.conversation-choice:first-child .conversation-choice-line .translated-sentence')!;
    expect(answer.dataset.translation).toBe('A coffee with milk, please.');
    expect(answer.tabIndex).toBe(0);
    expect(host.querySelector('[data-interior-conversation="encounter"]')).not.toBeNull();
    expect(host.querySelector('.eyebrow, small')).toBeNull();
  });

  it('uses authored Turkish meanings for the lines and choices without waiting for an overlay entry', async () => {
    installOverlay({ story: {}, ui: {}, course: { lexicon: {}, grammar: {}, exercises: {} } });
    await setBaseLanguage('tr', { persist: false });
    const host = document.createElement('div');
    host.innerHTML = renderInteriorConversation(createInteriorConversationState('interior:cafe:coffee')!);
    expect(host.querySelector<HTMLElement>('.conversation-choice:first-child .conversation-choice-line .translated-sentence')?.dataset.translation).toBe('Sütlü bir kahve, lütfen.');
    expect(host.querySelector<HTMLElement>('.translated-sentence')?.dataset.translationLang).toBe('tr');
    expect(host.textContent).not.toContain('Sütlü bir kahve, lütfen.');
    expect(host.querySelector('.encounter-role')?.textContent).toBe('Ev sahibi');
  });
});
