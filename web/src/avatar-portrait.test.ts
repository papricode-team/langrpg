// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarPortraitMarkup, observeAvatarPortraits, updateSelfPortraits } from './avatar-portrait';
import { normalizeAvatar } from './character-recipe.mjs';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

describe('actual player portraits', () => {
  it('shares one bake across HUD, chat and dynamically opened panels', async () => {
    const recipe = normalizeAvatar({ skin:'#ab1122' });
    document.body.innerHTML = avatarPortraitMarkup(recipe, 'portrait', true) + avatarPortraitMarkup(recipe, 'message-avatar', true);
    const render = vi.fn().mockResolvedValue('data:image/png;base64,test-one');
    const stop = observeAvatarPortraits(document.body, render);
    try {
      await flush();
      document.body.insertAdjacentHTML('beforeend', avatarPortraitMarkup(recipe));
      await flush();
      expect(render).toHaveBeenCalledTimes(1);
      expect([...document.querySelectorAll('img')].every(image => image.src.endsWith('test-one'))).toBe(true);
    } finally { stop(); }
  });
  it('cannot install an obsolete portrait after a profile edit', async () => {
    document.body.innerHTML = avatarPortraitMarkup({skin:'#ab1123'}, 'portrait', true);
    const pending: ((url:string)=>void)[] = [];
    const render = vi.fn().mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
    const stop = observeAvatarPortraits(document.body, render);
    try {
      await flush(); updateSelfPortraits(document, {skin:'#ab1124'}); await flush();
      pending[1]('data:image/png;base64,new'); await flush();
      pending[0]('data:image/png;base64,old'); await flush();
      expect(document.querySelector('img')!.src).toBe('data:image/png;base64,new');
    } finally { stop(); }
  });
  it('retries missing sheets', async () => {
    document.body.innerHTML = avatarPortraitMarkup({skin:'#ab1125'});
    const render = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('data:image/png;base64,recovered');
    const stop = observeAvatarPortraits(document.body, render);
    try {
      await flush();
      await vi.waitFor(()=>expect(document.querySelector('img')!.src).toContain('recovered'), {timeout:1500});
      expect(render).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });
  it('ignores a pending bake after disposal', async () => {
    document.body.innerHTML = avatarPortraitMarkup({skin:'#ab1126'});
    let finish!: (url:string)=>void;
    const stop = observeAvatarPortraits(document.body,()=>new Promise(resolve=>{finish=resolve;}));
    await flush(); stop(); finish('data:image/png;base64,late'); await flush();
    expect(document.querySelector('img')!.hasAttribute('src')).toBe(false);
  });
});


describe('dialogue portrait expressions', () => {
  it('cannot install an obsolete expression after the next dialogue line', async () => {
    const recipe=normalizeAvatar({v:2,skin:'#ab1130',parts:{face:'soft'}});
    document.body.innerHTML=avatarPortraitMarkup(recipe,'portrait',false,'smile');
    const pending=new Map<string,(url:string)=>void>();
    const render=vi.fn().mockImplementation((_recipe,expression)=>new Promise(resolve=>pending.set(expression,resolve)));
    const stop=observeAvatarPortraits(document.body,render);
    try {
      await flush();const image=document.querySelector('img')!;
      image.dataset.avatarExpression='worried';await flush();
      pending.get('worried')!('data:image/png;base64,worried');await flush();
      pending.get('smile')!('data:image/png;base64,smile');await flush();
      expect(image.src).toBe('data:image/png;base64,worried');
      image.dataset.avatarExpression='neutral';await flush();
      pending.get('neutral')!('data:image/png;base64,neutral');await flush();
      expect(image.src).toBe('data:image/png;base64,neutral');
      expect(render.mock.calls.every(([value])=>JSON.stringify(value)===JSON.stringify(recipe))).toBe(true);
    }finally{stop();}
  });
  it('shares expression bakes and falls back to the actual neutral face when unsupported', async () => {
    const recipe=normalizeAvatar({v:2,skin:'#ab1131',parts:{face:'soft'}});
    document.body.innerHTML=avatarPortraitMarkup(recipe,'portrait',false,'smile').repeat(2);
    const render=vi.fn().mockResolvedValue('data:image/png;base64,shared-smile');
    const stop=observeAvatarPortraits(document.body,render);
    try {
      await flush();expect(render).toHaveBeenCalledTimes(1);expect(render).toHaveBeenLastCalledWith(recipe,'smile');
      const other=normalizeAvatar({...recipe,parts:{...recipe.parts,face:'oval'}});
      document.body.insertAdjacentHTML('beforeend',avatarPortraitMarkup(other,'portrait',false,'worried'));
      await flush();expect(render).toHaveBeenLastCalledWith(other,'neutral');
    }finally{stop();}
  });
});
