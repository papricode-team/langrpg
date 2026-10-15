// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessSession, type AccessHost } from './access-session';
import { AccessClock, type GameAccess } from './game-access';
import type { Api } from './api';

const trial: GameAccess = { phase: 'trial', remainingSeconds: 600, playedSeconds: 300, registered: false, billingAvailable: true };

function session(overrides: Partial<AccessHost> = {}) {
  const clock = new AccessClock();
  clock.update(trial, performance.now());
  let resolveHeartbeat: (() => void) | undefined;
  const api = {
    accessHeartbeat: vi.fn(() => new Promise<{ access: GameAccess }>(resolve => { resolveHeartbeat = () => resolve({ access: trial }); })),
    destroy: vi.fn(), connect: vi.fn(), access: vi.fn(async () => ({ access: trial })),
  };
  const host: AccessHost = {
    api: api as unknown as Api, clock, uiCheck: false, started: () => true, connection: () => 'online', account: () => ({ registered: false, email: '' }),
    activeCourse: () => undefined, toast: vi.fn(), syncWorldMode: vi.fn(), showSaveAccount: vi.fn(), pauseForAccount: vi.fn(), accountShown: vi.fn(), discardPlay: vi.fn(),
    ...overrides,
  };
  return { access: new AccessSession(host), api, host, settle: () => resolveHeartbeat?.() };
}
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

beforeEach(() => { document.body.innerHTML = '<dialog id="account-dialog"></dialog><p id="account-error"></p>'; });

describe('access session', () => {
  it('sends one heartbeat at a time and only the latest state that changed meanwhile', async () => {
    const { access, api, settle } = session();
    void access.sendHeartbeat(true);
    void access.sendHeartbeat(false);
    void access.sendHeartbeat(true);
    expect(api.accessHeartbeat).toHaveBeenCalledOnce();
    settle(); await flush();
    // The queued state equals the one just sent, so nothing more goes out.
    expect(api.accessHeartbeat).toHaveBeenCalledOnce();
    void access.sendHeartbeat(false);
    expect(api.accessHeartbeat).toHaveBeenCalledTimes(2);
    expect(access.heartbeatDue(performance.now())).toBe(false);
    expect(access.heartbeatDue(performance.now() + 10000)).toBe(true);
  });

  it('releases the world connection while play is covered and reopens it after', () => {
    const { access, api } = session();
    access.connectionPaused = true;
    access.syncActivity();
    expect(api.connect).toHaveBeenCalledOnce();
    document.querySelector<HTMLDialogElement>('#account-dialog')!.setAttribute('open', '');
    access.syncActivity();
    expect(api.destroy).toHaveBeenCalledOnce();
  });

  it('meters nothing before the game starts or in a UI preview', () => {
    for (const overrides of [{ started: () => false }, { uiCheck: true }]) {
      const { access, api } = session(overrides);
      void access.sendHeartbeat(true); access.syncActivity();
      expect(api.accessHeartbeat).not.toHaveBeenCalled();
      expect(api.connect).not.toHaveBeenCalled();
    }
  });

  it('shows errors in the account dialog', () => {
    const { access } = session();
    access.showError(new Error('The card was declined.'));
    expect(document.querySelector('#account-error')!.textContent).toBe('The card was declined.');
  });
});
