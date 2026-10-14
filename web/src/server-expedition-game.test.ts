// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkExpeditionPlan, expeditionAgreement, expeditionAgreementKey, freshExpeditionPlan, loadExpeditionPlan, mountExpeditionGame, saveExpeditionPlan, serverExpeditionGame, type ExpeditionGame, type ExpeditionPlan } from './expedition-games';

const payload = {
  id: 'saffroncourt', title: 'Delivery', summary: 'Prepare the delivery.',
  german: { A1: 'Plane die Lieferung.', A2: 'Plane die Lieferung.', B1: 'Plane die Lieferung.' }, glossary: '',
  fields: [{ id: 'arrival', label: 'Ankunft', english: 'Arrival', options: [{ value: 16, label: '16:00', english: '16:00' }, { value: 18, label: '18:00', english: '18:00' }] }],
  steps: [{ id: 'gate', label: 'Tor', english: 'Gate' }, { id: 'permission', label: 'Fragen', english: 'Ask' }],
  orderPrompt: 'Prepare the route.',
};
const gameFor = (scope = 'account:course') => serverExpeditionGame(JSON.parse(JSON.stringify(payload)) as ExpeditionGame, scope);
beforeEach(() => {
  const drafts = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => drafts.get(key) ?? null, setItem: (key: string, value: string) => { drafts.set(key, value); } });
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('server-owned planning games', () => {
  it('renders JSON without validator functions and accepts only the server grading result', async () => {
    const game = gameFor(), root = document.createElement('main'); document.body.append(root);
    const submit = vi.fn(async (plan: ExpeditionPlan) => ({ correct: plan.order.join(',') === 'permission,gate', plan: { ...plan, completed: true, attempts: 1 }, agreement: 'Mit Erlaubnis liefern wir um sechzehn Uhr.' }));
    const complete = vi.fn();
    const controller = mountExpeditionGame(root, game, { level: 'A1', speak() {}, onComplete: complete, submitPlan: submit });
    try {
      expect(root.querySelector('.expedition-resource')?.textContent).toContain('Ankunft: 16:00');
      root.querySelector<HTMLButtonElement>('[data-exp-add="permission"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-exp-add="gate"]')!.click();
      expect(checkExpeditionPlan(game, { ...freshExpeditionPlan(game, 'A1'), order: ['permission', 'gate'] }).correct).toBe(false);
      root.querySelector<HTMLButtonElement>('[data-exp-check]')!.click();
      await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(submit).toHaveBeenCalledTimes(1);
      expect(root.querySelector('.expedition-plan-feedback blockquote')?.textContent).toBe('Mit Erlaubnis liefern wir um sechzehn Uhr.');
      expect(game.solution).toEqual({});
    } finally { controller.destroy(); }
  });

  it('restores a completed server plan even when public step order differs from its accepted order', () => {
    const game = gameFor(), root = document.createElement('main'); document.body.append(root);
    const values = { arrival: 18 }, agreement = 'Die Lieferung kommt um achtzehn Uhr.';
    game.agreements = { [expeditionAgreementKey(game, values)]: agreement };
    const controller = mountExpeditionGame(root, game, { level: 'A1', speak() {}, onComplete() {}, initialPlan: () => ({ level: 'A1', values, order: ['permission', 'gate'], completed: true, attempts: 1 }) });
    try {
      expect(root.querySelector('[data-exp-check]')).toBeNull();
      expect(root.querySelector('.expedition-plan-feedback blockquote')?.textContent).toBe(agreement);
      expect(expeditionAgreement(game, { arrival: 16 })).toBe('');
    } finally { controller.destroy(); }
  });

  it('keeps planning drafts separate by account and course without trusting cached completion', () => {
    const game = gameFor(), plan = { ...freshExpeditionPlan(game, 'A1'), values: { arrival: 18 }, order: ['permission', 'gate'], completed: true };
    saveExpeditionPlan(game, plan);
    expect(loadExpeditionPlan(game, 'A1')).toMatchObject({ values: { arrival: 18 }, completed: false });
    expect(loadExpeditionPlan(gameFor('another-account:course'), 'A1').values.arrival).toBe(16);
    expect(loadExpeditionPlan(gameFor('account:another-course'), 'A1').values.arrival).toBe(16);
  });
});
