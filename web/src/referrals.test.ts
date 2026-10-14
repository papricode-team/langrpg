import { describe, expect, it } from 'vitest';
import { captureReferral, clearReferral, pendingReferral, referralAvailable } from './referrals';
import type { GameAccess } from './game-access';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}

describe('referral attribution', () => {
  it('keeps the first invite across reloads and removes only its URL parameter', () => {
    const storage = memoryStorage();
    expect(captureReferral(storage, 'https://glotworld.com/?ref=first_friend_123&billing=success#atlas')).toBe('https://glotworld.com/?billing=success#atlas');
    expect(pendingReferral(storage)).toBe('first_friend_123');
    captureReferral(storage, 'https://glotworld.com/?ref=another_friend_456');
    expect(pendingReferral(storage)).toBe('first_friend_123');
    clearReferral(storage);
    expect(pendingReferral(storage)).toBeUndefined();
  });
  it('ignores malformed codes and preserves a link when storage cannot persist it', () => {
    const storage = memoryStorage();
    expect(captureReferral(storage, 'https://glotworld.com/?ref=%3Cscript%3E')).toBeUndefined();
    expect(pendingReferral(storage)).toBeUndefined();
    const unavailable = { ...storage, setItem: () => { throw new Error('blocked'); } };
    expect(captureReferral(unavailable, 'https://glotworld.com/?ref=friend_123456')).toBeUndefined();
  });
  it('offers invites only during registered free play', () => {
    const trial: GameAccess = { registered: true, phase: 'trial', remainingSeconds: 600, playedSeconds: 300, billingAvailable: true };
    expect(referralAvailable(trial)).toBe(true);
    expect(referralAvailable({ ...trial, referralBonusSeconds: 5400, remainingSeconds: 6000 })).toBe(true);
    for (const phase of ['guest', 'login_required', 'payment_required', 'paid'] as const) expect(referralAvailable({ ...trial, phase })).toBe(false);
  });
});
