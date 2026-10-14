import { describe, expect, it } from 'vitest';
import { AccessClock, accessBlocked, billingURL, clearGameProgress, formatAccessTime, type GameAccess } from './game-access';

const guest = (remainingSeconds = 300): GameAccess => ({ phase: 'guest', remainingSeconds, playedSeconds: 300 - remainingSeconds, registered: false, billingAvailable: true });

describe('server-backed game access clock', () => {
  it('requires an authoritative allowance before play starts', () => {
    const clock = new AccessClock();
    expect(accessBlocked(clock.snapshot(0))).toBe(true);
  });
  it('blocks an anonymous player at exactly five active minutes', () => {
    const clock = new AccessClock();
    clock.update(guest(), 0);
    clock.setActive(true, 0);
    expect(clock.snapshot(299_000)?.phase).toBe('guest');
    expect(clock.snapshot(300_000)).toMatchObject({ phase: 'login_required', remainingSeconds: 0, playedSeconds: 300 });
    expect(accessBlocked(clock.snapshot(300_000))).toBe(true);
  });
  it('does not spend free time while credentials are entered or a tab is hidden', () => {
    const clock = new AccessClock();
    clock.update(guest(), 0);
    clock.setActive(true, 0);
    clock.setActive(false, 120_000);
    expect(clock.snapshot(720_000)?.remainingSeconds).toBe(180);
    clock.setActive(true, 720_000);
    expect(clock.snapshot(899_000)?.remainingSeconds).toBe(1);
    expect(clock.snapshot(900_000)?.phase).toBe('login_required');
  });
  it('continues with the registered allowance and blocks at fifteen total minutes', () => {
    const clock = new AccessClock();
    clock.update(guest(0), 0);
    clock.setActive(false, 0);
    clock.update({ ...guest(), phase: 'trial', registered: true, playedSeconds: 300, remainingSeconds: 600 }, 10_000);
    clock.setActive(true, 10_000);
    expect(clock.snapshot(609_000)?.phase).toBe('trial');
    expect(clock.snapshot(610_000)).toMatchObject({ phase: 'payment_required', playedSeconds: 900, remainingSeconds: 0 });
  });
  it('uses the server allowance after a reload and never grants time from local storage', () => {
    const clock = new AccessClock();
    clock.update({ ...guest(), phase: 'trial', registered: true, playedSeconds: 880, remainingSeconds: 20 }, 500);
    clock.setActive(true, 500);
    expect(clock.snapshot(20_500)?.phase).toBe('payment_required');
    clock.update({ ...guest(), phase: 'payment_required', registered: true, playedSeconds: 900, remainingSeconds: 0 }, 30_000);
    expect(clock.snapshot(50_000)?.phase).toBe('payment_required');
  });
  it('grants unlimited access only when the server confirms a paid plan', () => {
    const clock = new AccessClock();
    clock.update({ ...guest(), phase: 'paid', registered: true, remainingSeconds: 0, playedSeconds: 900, plan: 'lifetime' }, 0);
    clock.setActive(true, 0);
    expect(clock.snapshot(9_000_000)).toMatchObject({ phase: 'paid', plan: 'lifetime' });
    expect(accessBlocked(clock.snapshot(9_000_000))).toBe(false);
  });
  it('accepts repeated fifteen-minute allowances from successful server resets', () => {
    const clock = new AccessClock();
    clock.update({ ...guest(0), phase: 'login_required' }, 0);
    expect(accessBlocked(clock.snapshot(1_000))).toBe(true);
    for (const registered of [false, true, true]) {
      const phase = registered ? 'trial' : 'guest';
      clock.update({ ...guest(), registered, phase, playedSeconds: 0, remainingSeconds: 900 }, 1_000);
      clock.setActive(true, 1_000);
      expect(clock.snapshot(1_000)).toMatchObject({ phase, playedSeconds: 0, remainingSeconds: 900 });
      expect(clock.snapshot(900_000)?.phase).toBe(phase);
      expect(accessBlocked(clock.snapshot(901_000))).toBe(true);
    }
  });
  it('rounds the visible timer upward and clamps expired allowances', () => {
    expect(formatAccessTime(300)).toBe('05:00');
    expect(formatAccessTime(59.2)).toBe('01:00');
    expect(formatAccessTime(-2)).toBe('00:00');
  });
});

describe('hosted billing URLs', () => {
  it('accepts HTTPS checkout and portal URLs', () => {
    expect(billingURL('https://creem.io/checkout/example')).toBe('https://creem.io/checkout/example');
  });
  it('rejects executable, insecure and credential-bearing links', () => {
    for (const value of ['javascript:alert(1)', 'http://creem.io/checkout', 'https://user:password@creem.io/checkout']) expect(() => billingURL(value)).toThrow();
  });
});

describe('game progress reset', () => {
  it('clears discoveries, unfinished activities, expedition drafts and records while preserving the character and preferences', () => {
    const progressKeys = ['atlas.placement', 'atlas.accountReminder.guest', 'atlas.acts.guest', 'atlas.objects.guest', 'atlas.sceneHinted.guest.quest', 'atlas.activity.v1:guest:interior:cafe:cafe:A1', 'atlas.minigame.chain:guest:game:week', 'lantern-story-ledger:guest:greta-memory-garden-v1', 'lantern-story-ledger:Juniper:greta-memory-garden-v1', 'atlas.expedition.plan.v1.work.A1'];
    const preservedKeys = ['atlas.token', 'atlas.profile', 'atlas.nameChosen.guest', 'atlas.baseLanguage', 'atlas.screenFilters', 'atlas.silentMode', 'atlas.activity.v1:other-player:cafe:A1', 'atlas.objects.other-player'];
    const values = new Map([...progressKeys, ...preservedKeys].map(key => [key, 'saved']));
    const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, removeItem: (key: string) => { values.delete(key); }, setItem: (key: string, value: string) => { values.set(key, value); } };
    clearGameProgress(storage, 'guest', 'Juniper');
    progressKeys.forEach(key => expect(values.has(key)).toBe(false));
    preservedKeys.forEach(key => expect(values.get(key)).toBe('saved'));
    expect(values.get('atlas.map')).toBe('lindenhafen');
    expect(values.get('atlas.level')).toBe('A1');
  });
});
