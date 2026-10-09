import { describe, it, expect } from 'vitest';
import { normalizedAnswer, dueItems } from './learning';
import { emptyProgress } from './api';

describe('language answers', () => {
  it('preserves significant German orthography while accepting case and punctuation', () => {
    expect(normalizedAnswer('  Ich  möchte einen Kaffee! ')).toBe('ich möchte einen kaffee');
    expect(normalizedAnswer('schön')).not.toBe(normalizedAnswer('schon'));
    expect(normalizedAnswer('Straße')).not.toBe(normalizedAnswer('Strasse'));
  });
});
describe('review selection', () => {
  it('selects overdue material in order and lets future reviews rest', () => {
    const progress = emptyProgress();
    const base = { stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0, lastSeenAt: '', modeStats: {} };
    progress.items = {
      later: { ...base, itemId: 'later', dueAt: '2030-01-01T00:00:00Z' },
      second: { ...base, itemId: 'second', dueAt: '2026-10-07T00:00:00Z' },
      first: { ...base, itemId: 'first', dueAt: '2026-10-06T00:00:00Z' },
    };
    expect(dueItems(progress, Date.parse('2026-10-08T00:00:00Z'))).toEqual(['first', 'second']);
  });
});
