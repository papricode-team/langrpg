import { describe, expect, it } from 'vitest';
import { AccountReminder, nameSuggestions, suggestedNames } from './player-account';

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
