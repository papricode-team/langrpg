// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshLearningMenu } from './menu-refresh';

afterEach(()=>document.body.replaceChildren());
describe('passive learning menu refresh',()=>{
  it('keeps the active filter, caret, and scroll when exposure updates arrive',()=>{
    const content=document.createElement('div');document.body.append(content);
    content.innerHTML='<input id="lexicon-search" type="search">';
    const input=content.querySelector<HTMLInputElement>('input')!;
    input.value='Milch';input.focus();input.setSelectionRange(2,4);content.scrollTop=160;
    const filtered=vi.fn();
    refreshLearningMenu(content,()=>{content.innerHTML='<input id="lexicon-search" type="search">';content.querySelector('input')!.addEventListener('input',filtered);});
    const updated=content.querySelector<HTMLInputElement>('input')!;
    expect(updated.value).toBe('Milch');expect(document.activeElement).toBe(updated);
    expect([updated.selectionStart,updated.selectionEnd]).toEqual([2,4]);
    expect(content.scrollTop).toBe(160);expect(filtered).toHaveBeenCalledOnce();
  });
  it('keeps a filter without stealing focus from an open detail pane',()=>{
    const content=document.createElement('div');document.body.append(content);
    content.innerHTML='<input id="word-search" value="Kaffee">';
    const detail=document.createElement('button');document.body.append(detail);detail.focus();
    refreshLearningMenu(content,()=>{content.innerHTML='<input id="word-search">';});
    expect(content.querySelector<HTMLInputElement>('input')!.value).toBe('Kaffee');
    expect(document.activeElement).toBe(detail);
  });
});
