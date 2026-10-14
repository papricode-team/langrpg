// @vitest-environment happy-dom
import './test-support/expedition-fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkExpeditionPlan, expeditionGames, expeditionGameStatus, freshExpeditionPlan, mountExpeditionGame, saveExpeditionPlan, type ServerExpeditionPlan } from './expedition-games';

beforeEach(() => {
  const values = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); } });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('durable expedition agreements', () => {
  it('renders earlier authoritative agreements safely when an optional timing token was added',()=>{
    const game=expeditionGames[0],root=document.createElement('div');document.body.append(root);
    const old:ServerExpeditionPlan={level:'A2',values:{permission:1,gate:0,recipient:2},order:game.steps.map(step=>step.id),completed:true,attempts:1};
    const controller=mountExpeditionGame(root,game,{level:'A2',speak:vi.fn(),onComplete:vi.fn(),initialPlan:()=>old});
    expect(root.textContent).toContain('Everyone can work from this plan.');
    expect(root.textContent).toContain('siebzehn Uhr');
    expect(old.values).not.toHaveProperty('arrival');
    controller.destroy();
  });
  it('places every neighborhood token by tap, speaks it, and submits the actual allocation',async()=>{
    for(const game of expeditionGames) {
      const root=document.createElement('div');document.body.append(root);
      const speak=vi.fn(),onExposure=vi.fn(),onComplete=vi.fn();
      const submitPlan=vi.fn(async(plan:Parameters<NonNullable<Parameters<typeof mountExpeditionGame>[2]['submitPlan']>>[0])=>({correct:checkExpeditionPlan(game,plan).correct,plan:{...plan,completed:true,attempts:1}}));
      const controller=mountExpeditionGame(root,game,{level:'A2',seed:'test-board',speak,onExposure,onComplete,submitPlan});
      expect(root.querySelector('select')).toBeNull();
      expect(root.querySelector('.expedition-region-board')?.getAttribute('style')).toContain(`${game.id}-preview.webp`);
      for(const field of game.fields) {
        root.querySelector<HTMLButtonElement>(`[data-exp-zone="${field.id}"]`)!.click();
        const value=game.solution[field.id],option=field.options.find(option=>option.value===value)!;
        root.querySelector<HTMLButtonElement>(`[data-exp-token="${field.id}"][data-exp-value="${value}"]`)!.click();
        expect(speak).toHaveBeenLastCalledWith(option.label);
        expect(onExposure).toHaveBeenLastCalledWith({mapId:game.id,level:'A2',text:option.label,kind:'placement'});
      }
      for(const step of game.steps)root.querySelector<HTMLButtonElement>(`[data-exp-add="${step.id}"]`)!.click();
      expect(submitPlan).not.toHaveBeenCalled();
      root.querySelector<HTMLButtonElement>('[data-exp-check]')!.click();
      await Promise.resolve();await Promise.resolve();
      expect(submitPlan).toHaveBeenCalledOnce();
      expect(submitPlan.mock.calls[0][0].values).toEqual(game.solution);
      expect(submitPlan.mock.calls[0][0].order).toEqual(game.steps.map(step=>step.id));
      expect(onComplete).toHaveBeenCalledOnce();
      expect(onExposure).toHaveBeenCalledTimes(1+game.fields.length+game.steps.length);
      controller.destroy();root.remove();
    }
  });

  it('accepts a drag only at its matching target, and keeps tap input available',()=>{
    const root=document.createElement('div');document.body.append(root);
    const game=expeditionGames[0],speak=vi.fn();
    const controller=mountExpeditionGame(root,game,{level:'A1',seed:'drag-board',speak,onComplete:vi.fn()});
    const event=(type:string,target:Element)=>target.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));
    const field=game.fields[0],value=game.solution[field.id];
    const token=root.querySelector(`[data-exp-token="${field.id}"][data-exp-value="${value}"]`)!;
    event('dragstart',token);event('drop',root.querySelector(`[data-exp-zone="${game.fields[1].id}"]`)!);
    expect(speak).not.toHaveBeenCalled();
    event('dragstart',token);event('drop',root.querySelector(`[data-exp-zone="${field.id}"]`)!);
    expect(speak).toHaveBeenCalledOnce();
    const placed=root.querySelector(`[data-exp-zone="${field.id}"]`)!;
    expect(placed.textContent).toContain(field.options.find(option=>option.value===value)!.label);
    controller.pause();root.querySelector<HTMLButtonElement>('[data-exp-add]')!.click();expect(speak).toHaveBeenCalledOnce();
    controller.resume();root.querySelector<HTMLButtonElement>('[data-exp-add]')!.click();expect(speak).toHaveBeenCalledTimes(2);
    controller.destroy();expect(root.innerHTML).toBe('');
  });

  it('a local completion claim cannot create an authoritative notebook entry', () => {
    const game = expeditionGames[0], plan = freshExpeditionPlan(game, 'A1');
    plan.values = { ...game.solution }; plan.order = game.steps.map(step => step.id); plan.completed = true;
    saveExpeditionPlan(game, plan);
    expect(expeditionGameStatus(game.id, 'A1', {})).toBe('started');
    const root = document.createElement('div'); document.body.append(root);
    const engine = mountExpeditionGame(root, game, { level: 'A1', speak: vi.fn(), onComplete: vi.fn(), submitPlan: vi.fn() });
    expect(root.querySelector('[data-exp-check]')).not.toBeNull();
    expect(root.textContent).not.toContain('Everyone can work from this plan.');
    engine.destroy();
  });

  it('waits for the server before marking a valid-looking plan completed', async () => {
    const game = expeditionGames[0], plan = freshExpeditionPlan(game, 'A1');
    plan.values = { ...game.solution }; plan.order = game.steps.map(step => step.id);
    saveExpeditionPlan(game, plan);
    let resolve!: (value: { correct: boolean; plan: ServerExpeditionPlan }) => void;
    const submitPlan = vi.fn(() => new Promise<{ correct: boolean; plan: ServerExpeditionPlan }>(done => { resolve = done; }));
    const onComplete = vi.fn();
    const root = document.createElement('div'); document.body.append(root);
    const engine = mountExpeditionGame(root, game, { level: 'A1', speak: vi.fn(), onComplete, submitPlan });
    root.querySelector<HTMLButtonElement>('[data-exp-check]')!.click();
    expect(submitPlan).toHaveBeenCalledOnce(); expect(onComplete).not.toHaveBeenCalled();
    resolve({ correct: true, plan: { ...plan, completed: true, attempts: 1 } });
    await Promise.resolve(); await Promise.resolve();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Everyone can work from this plan.');
    engine.destroy();
  });
});
