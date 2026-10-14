// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import fixtures from '../../content/alignments/fixtures.json';
import { alignedHighlights, installAlignedLineInteractions, personalizeAlignedLine, renderAlignedLine, renderAlignedMeaning, type AlignedLine } from './aligned-line';
import { dialogueMarkup } from './dialogue-view';
import { renderNarrative, installSentenceTranslations } from './sentence-translations';
import { setBaseLanguage } from './i18n';

const line = (name: string) => fixtures.find(value => value.fixture === name)! as unknown as AlignedLine;
function token(value: AlignedLine, word: string): number { return value.de.tokens.findIndex(([start, end]) => value.de.text.slice(start, end) === word); }
function counterparts(name: string, word: string, language: 'en' | 'tr' = 'en'): string[] {
  const value = line(name), support = value.support[language]!;
  return alignedHighlights(value, token(value, word), language).map(({ start, end }) => support.text.slice(start, end));
}
afterEach(async () => { document.body.replaceChildren(); await setBaseLanguage('en'); });

describe('authored contextual alignment', () => {
  it.each([
    ['marta','Hallo',['Hello']], ['marta','Möchtest',['Would','like']], ['marta','du',['you']], ['marta','einen',['a']], ['marta','Kaffee',['coffee']],
    ['otto','Guten',['Good']], ['otto','Morgen',['morning']], ['otto','Willkommen',['Welcome']], ['otto','in',['to']],
    ['clauses','Dein',['Your']], ['clauses','ist',['is']], ['clauses','schlafen',['sleeping']], ['clauses','Die',['The']],
    ['help-question','helfen',['help']], ['help-infinitive','helfen',['to','help']], ['help-inflection','hilft',['helps']],
    ['invitation','möchtest',['would','like']], ['formal-invitation','Möchten',['Would','like']],
    ['she','Sie',['She']], ['formal-you','Sie',['you']], ['they','sie',['they']],
    ['ambiguous-sie','Sie',[]], ['ambiguous-bank','Bank',[]], ['demonstrative','Das',[]], ['article-boundary','Ein',[]], ['verb-boundary','helfe',[]],
    ['emoji','Kaffee',['coffee']], ['cloud','Wolke',['cloud']],
  ] as const)('preserves %s / %s from the authored fixtures', (name, word, expected) => {
    expect(counterparts(name, word)).toEqual(expected);
  });
  it('marks suffixed Turkish words and shared equivalents without gloss matching', () => {
    expect(counterparts('screen-ticket','Fahrkarte','tr')).toEqual(['Biletiniz']);
    expect(counterparts('screen-ticket','Ihre','tr')).toEqual(['Biletiniz']);
    expect(counterparts('screen-ticket','geprüft','tr')).toEqual(['denetlenmesi']);
    expect(counterparts('screen-ticket','Auch','tr')).toEqual(['da']);
    expect(counterparts('screen-ticket','bitte')).toEqual(['please']);
  });
  it('fails closed for malformed offsets or alignment indices', () => {
    const bad = structuredClone(line('ticket'));
    bad.support.en!.align = [[1,99]];
    expect(alignedHighlights(bad,1,'en')).toEqual([]);
    bad.de.tokens = [[-1,4]];
    expect(alignedHighlights(bad,0,'tr')).toEqual([]);
  });
  it('returns the original UTF-16 offset after an emoji', () => {
    const value=line('emoji'),start=value.support.en!.text.indexOf('coffee');
    expect(alignedHighlights(value,token(value,'Kaffee'),'en')).toEqual([{start,end:start+6}]);
  });
  it('adjusts stored offsets for names and escapes markup', () => {
    const value:AlignedLine={id:'name',de:{text:'Hallo {name}, Kaffee.',tokens:[[0,5],[7,11],[14,20]]},support:{en:{text:'Coffee, {name}.',tokens:[[0,6],[9,13]],align:[[1,1],[2,0]]}}};
    const personalized=personalizeAlignedLine(value,'<Ada & Bo>');
    expect(personalized.de.text).toBe('Hallo <Ada & Bo>, Kaffee.');
    expect(personalized.support.en!.text).toBe('Coffee, <Ada & Bo>.');
    expect(renderAlignedMeaning(personalized,{selectedToken:2})).toBe('<mark>Coffee</mark>, &lt;Ada &amp; Bo&gt;.');
    document.body.innerHTML=renderAlignedLine(personalized,{showMeaning:true,selectedToken:1});
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('mark')?.textContent).toBe('<Ada & Bo>');
  });
});

describe('shared rendering and keyboard interaction', () => {
  it.each(['en','tr'] as const)('renders an aligned dialogue and narrative in %s', async language => {
    await setBaseLanguage(language);
    const value=line('screen-ticket');
    const presentation={title:'Station',line:{id:value.id,speaker:'otto',german:value.de.text,english:value.support.en!.text,clipId:'ticket',aligned:value},name:'Deniz',portrait:'',index:0,total:1,help:true,busy:false,glosses:{},lookup:{word:'Fahrkarte',index:token(value,'Fahrkarte'),gloss:''}};
    const html=dialogueMarkup(presentation);
    document.body.innerHTML=html;
    expect(document.querySelector('mark')?.textContent).toBe(language==='tr'?'Biletiniz':'ticket');
    expect(document.querySelector('.dialogue-translation')?.getAttribute('lang')).toBe(language);
    expect(renderNarrative([{german:value.de.text,english:value.support.en!.text,aligned:value}])).toContain('data-aligned-line=');
    expect(renderAlignedLine(value,{language,showMeaning:true,selectedToken:1})).toMatchSnapshot();
  });
  it('moves selection with arrow keys and clears it with Escape', () => {
    document.body.innerHTML=renderAlignedLine(line('ticket'),{showMeaning:true});
    const dispose=installAlignedLineInteractions(document);
    const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-aligned-token]')];
    buttons[0].click();
    expect(document.querySelector('mark')?.textContent).toBe('Your');
    buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    expect(document.activeElement).toBe(buttons[1]);
    expect(document.querySelector('mark')?.textContent).toBe('ticket');
    buttons[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(document.querySelector('mark')).toBeNull();
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
    dispose();
  });
  it('shows the aligned meaning in a narrative tooltip immediately on a word tap', () => {
    const value=line('ticket');
    document.body.innerHTML=renderNarrative([{german:value.de.text,english:value.support.en!.text,aligned:value}]);
    const dispose=installSentenceTranslations(document);
    document.querySelector<HTMLButtonElement>('[data-aligned-token="1"]')!.click();
    expect(document.querySelector('.sentence-translation-tooltip mark')?.textContent).toBe('ticket');
    document.querySelector<HTMLButtonElement>('[data-aligned-token="1"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(document.querySelector('.sentence-translation-tooltip')).toBeNull();
    dispose();
  });
});
