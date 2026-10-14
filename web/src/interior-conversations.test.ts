// @vitest-environment happy-dom
import './test-support/expedition-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { installOverlay, setBaseLanguage } from './i18n';
import { interiors } from './interiors';
import {installSentenceTranslations} from './sentence-translations';
import {
  backInteriorConversation, chooseInteriorConversation, createInteriorConversationState,
  interiorConversationFor, interiorConversationNode, interiorConversations, renderInteriorConversation,
  replayInteriorConversation, type InteriorConversationState,
} from './interior-conversations';

afterEach(async () => { await setBaseLanguage('en', { persist: false }); installOverlay(undefined); });

describe('authored interior conversations', () => {
  it('covers every shop station and the inn welcome without replacing rest or evidence actions', () => {
    const stations = interiors.flatMap(room => room.objects.filter(object => room.id !== 'inn' || object.id === 'interior:inn:welcome').map(object => object.id));
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
    const answer = host.querySelector<HTMLElement>('[data-interior-choice="first"]')!;
    expect(answer.parentElement?.querySelector<HTMLElement>('.conversation-choice-line .translated-sentence')?.dataset.translation).toBe('A coffee with milk, please.');
    expect(answer.getAttribute('aria-label')).toBe('Choose reply: Einen Kaffee mit Milch, bitte.');
    expect(answer.tabIndex).toBe(0);
    expect(host.querySelector('[data-interior-conversation="encounter"]')).not.toBeNull();
    expect(host.querySelector('.eyebrow, small')).toBeNull();
  });

  it('uses authored Turkish meanings for the lines and choices without waiting for an overlay entry', async () => {
    installOverlay({ story: {}, ui: {}, course: { lexicon: {}, grammar: {}, exercises: {} } });
    await setBaseLanguage('tr', { persist: false });
    const host = document.createElement('div');
    host.innerHTML = renderInteriorConversation(createInteriorConversationState('interior:cafe:coffee')!);
    expect(host.querySelector<HTMLElement>('.conversation-choice-line .translated-sentence')?.dataset.translation).toBe('Sütlü bir kahve, lütfen.');
    expect(host.querySelector('[data-interior-choice="first"]')?.getAttribute('aria-label')).toBe('Yanıtı seç: Einen Kaffee mit Milch, bitte.');
    expect(host.querySelector<HTMLElement>('.translated-sentence')?.dataset.translationLang).toBe('tr');
    expect(host.textContent).not.toContain('Sütlü bir kahve, lütfen.');
    expect(host.querySelector('.encounter-role')?.textContent).toBe('Ev sahibi');
  });
  it.each(['en','tr'] as const)('reveals a reply word in %s without choosing it, then chooses through the adjacent control',async language=>{
    await setBaseLanguage(language,{persist:false});
    const state=createInteriorConversationState('interior:cafe:coffee')!,current=interiorConversationNode(state)!;
    const line=current.line.aligned!,choice=current.choices[0].line.aligned!;
    const previous=line.glosses,previousChoice=choice.glosses,previousEN=choice.support.en!.align,previousTR=choice.support.tr!.align;
    let dispose:()=>void=()=>{};
    try{
      line.glosses={'0':'00000000-0000-4000-8000-000000000001'};
      choice.glosses={'1':'00000000-0000-4000-8000-000000000001'};
      // Exact authored sentence: Einen Kaffee mit Milch, bitte. The Turkish
      // noun and its modifier occur in different positions from the German.
      choice.support.en!.align=[[1,1],[2,2],[3,3]];
      choice.support.tr!.align=[[1,2],[2,0],[3,0]];
      const host=document.createElement('div');host.innerHTML=renderInteriorConversation(state);document.body.append(host);
      let selected=state,transitions=0;
      host.addEventListener('click',event=>{
        const control=(event.target as HTMLElement).closest<HTMLElement>('[data-interior-choice]');
        if(control){selected=chooseInteriorConversation(selected,control.dataset.interiorChoice!);transitions++;}
      });
      dispose=installSentenceTranslations(host);
      expect(host.querySelector('.interior-dialogue .dialogue-word')).not.toBeNull();
      expect(host.querySelector('[data-interior-choice] .dialogue-word, [data-interior-choice] button')).toBeNull();
      const word=host.querySelector<HTMLButtonElement>('.conversation-choice-line [data-aligned-token="1"]')!;
      expect(word.textContent).toBe('Kaffee');word.click();
      expect(transitions).toBe(0);expect(selected).toBe(state);
      expect(document.querySelector('.sentence-translation-tooltip mark')?.textContent).toBe(language==='tr'?'kahve':'coffee');
      host.querySelector<HTMLButtonElement>('.conversation-choice [data-speak]')!.click();expect(transitions).toBe(0);
      host.querySelector<HTMLButtonElement>('[data-interior-choice="first"]')!.click();
      expect(transitions).toBe(1);expect(interiorConversationNode(selected)?.line.german).toContain('mit Milch');
    }finally{dispose();document.body.replaceChildren();line.glosses=previous;choice.glosses=previousChoice;choice.support.en!.align=previousEN;choice.support.tr!.align=previousTR;}
  });
});
