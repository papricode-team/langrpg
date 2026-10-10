// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expeditionGames, expeditionGameStatus, freshExpeditionPlan, mountExpeditionGame, saveExpeditionPlan, type ServerExpeditionPlan } from './expedition-games';

beforeEach(() => {
  const values = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); } });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('durable expedition agreements', () => {
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
