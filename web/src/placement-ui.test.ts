// @vitest-environment happy-dom
import {describe,it,expect,vi} from 'vitest';
import {emptyProgress,type AttemptResult,type Api} from './api';
import {mountOptionalPlacement} from './placement-ui';

async function flush(){for(let index=0;index<5;index++)await Promise.resolve();}
function button(host:HTMLElement,action:string){return host.querySelector<HTMLButtonElement>(`[data-placement="${action}"]`)!;}
describe('server graded conversational placement',()=>{
  it('uses the server result even when the selected phrase is the canonical correct option',async()=>{
    const host=document.createElement('div'),progress=emptyProgress();
    const request=vi.fn<Api['request']>().mockResolvedValue({correct:false,reason:'Check the greeting.',progress,xpAdded:0,duplicate:false} as AttemptResult);
    const panel=await mountOptionalPlacement(host,{api:{request:request as Api['request']},progress,onComplete:vi.fn(),onClose:vi.fn(),speak:vi.fn()});
    expect(host.querySelector('[lang="de"]')?.textContent).toBe('Willkommen! Es ist früh.');
    button(host,'answer').click();await flush();
    expect(host.textContent).toContain('Check the greeting.');
    expect(request.mock.calls[0][1]).toMatchObject({exerciseId:'a1-arrival-exercise-1',mode:'recognition',hinted:false,preview:true});
    expect(progress.completedQuestIds).toEqual([]);
    panel.destroy();
  });
  it('finishes the diagnostic with the original memory even when a response contains unrelated progress',async()=>{
    const host=document.createElement('div'),progress=emptyProgress(),onComplete=vi.fn();
    const request=vi.fn<Api['request']>().mockResolvedValue({correct:true,progress:{...emptyProgress(),xp:999,revision:10}});
    const panel=await mountOptionalPlacement(host,{api:{request:request as Api['request']},progress,onComplete,onClose:vi.fn(),speak:vi.fn()});
    for(let index=0;index<8;index++) {
      const input=host.querySelector<HTMLInputElement>('#placement-answer');
      if(input){input.value='a diagnostic reply';host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}
      else button(host,'answer').click();
      await flush();button(host,'next').click();
    }
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({answered:8}),progress);
    expect(progress.xp).toBe(0);expect(progress.items).toEqual({});
    expect(request.mock.calls.every(call=>(call[1] as {preview:boolean}).preview)).toBe(true);
    panel.destroy();
  });
  it('keeps the same graded answer and id when retrying after a save failure',async()=>{
    const host=document.createElement('div'),progress=emptyProgress();
    const request=vi.fn<Api['request']>().mockResolvedValue({correct:true,reason:'Saved.',progress,xpAdded:0,duplicate:false} as AttemptResult);
    request.mockRejectedValueOnce(new Error('Offline'));
    const panel=await mountOptionalPlacement(host,{api:{request:request as Api['request']},progress,onComplete:vi.fn(),onClose:vi.fn(),speak:vi.fn()});
    button(host,'hint').click();expect(host.textContent).toContain('Welcome! It is early.');
    button(host,'answer').click();await flush();
    expect(host.textContent).toContain('Retry keeps this same answer');
    host.querySelectorAll<HTMLButtonElement>('[data-placement="answer"]')[1].click();await flush();
    expect(request.mock.calls).toHaveLength(2);
    expect(request.mock.calls[0][1]).toEqual(request.mock.calls[1][1]);
    expect(request.mock.calls[1][1]).toMatchObject({hinted:true});
    panel.destroy();
  });
});
