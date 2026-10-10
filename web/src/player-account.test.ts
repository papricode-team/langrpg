import { describe, expect, it } from 'vitest';
import { AccountReminder, nameSuggestions, suggestedNames, WRITING_UNLOCK_MS } from './player-account';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function play(reminder: AccountReminder, seconds: number, start = 0) {
  reminder.tick(start, true);
  for (let second = 1; second <= seconds; second++) reminder.tick(start + second * 1000, true);
}
describe('player names and account reminder', () => {
  it('offers four distinct valid names', () => {
    const names = nameSuggestions();
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    names.forEach(name => { expect(suggestedNames).toContain(name); expect(name).toMatch(/^[A-Za-z]{2,24}$/); });
  });
  it('becomes due at five minutes of play and stays due until presented', () => {
    const reminder = new AccountReminder('player', storage());
    play(reminder, 299);
    expect(reminder.due).toBe(false);
    expect(reminder.tick(300000, true)).toBe(true);
    expect(reminder.tick(301000, true)).toBe(true);
    reminder.markShown();
    expect(reminder.due).toBe(false);
  });
  it('opens writing at ten active minutes, including after the account reminder was shown', () => {
    const reminder = new AccountReminder('player', storage());
    play(reminder, 300);
    reminder.markShown();
    play(reminder, 299, 300000);
    expect(reminder.elapsedMs).toBe(WRITING_UNLOCK_MS - 1000);
    expect(reminder.writingReady).toBe(false);
    reminder.tick(WRITING_UNLOCK_MS, true);
    expect(reminder.writingReady).toBe(true);
    expect(reminder.due).toBe(false);
  });
  it('retains the writing introduction across reloads and scopes it to the player', () => {
    const saved = storage();
    play(new AccountReminder('player', saved), 400);
    const reminder = new AccountReminder('player', saved);
    expect(reminder.elapsedMs).toBe(400000);
    expect(reminder.writingReady).toBe(false);
    play(reminder, 200);
    expect(new AccountReminder('player', saved).writingReady).toBe(true);
    expect(new AccountReminder('other-player', saved).writingReady).toBe(false);
  });
  it('does not unlock writing from a paused or background visit', () => {
    const reminder = new AccountReminder('player', storage());
    play(reminder, 599);
    reminder.tick(599000, false);
    reminder.tick(WRITING_UNLOCK_MS + 600000, false);
    expect(reminder.elapsedMs).toBe(599000);
    expect(reminder.writingReady).toBe(false);
    reminder.tick(1200000, true);
    reminder.tick(1201000, true);
    expect(reminder.writingReady).toBe(true);
  });
  it('resumes accumulated play after reload and only prompts once per player', () => {
    const saved = storage();
    play(new AccountReminder('player', saved), 150);
    const reminder = new AccountReminder('player', saved);
    play(reminder, 150);
    expect(reminder.due).toBe(true);
    reminder.markShown();
    expect(new AccountReminder('player', saved).due).toBe(false);
    expect(new AccountReminder('other-player', saved).due).toBe(false);
  });
  it('does not count background time or time spent entering credentials', () => {
    const reminder = new AccountReminder('player', storage());
    play(reminder, 120);
    reminder.tick(120000, false);
    reminder.tick(720000, false);
    reminder.tick(720000, true);
    play(reminder, 179, 720000);
    expect(reminder.due).toBe(false);
    expect(reminder.tick(900000, true)).toBe(true);
  });
  it('survives corrupted or unavailable storage', () => {
    const reminder = new AccountReminder('player', { getItem() { return '{'; }, setItem() { throw new Error('blocked'); } });
    play(reminder, 300);
    expect(reminder.due).toBe(true);
  });
});
