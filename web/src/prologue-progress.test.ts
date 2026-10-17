import { describe, expect, it, vi } from 'vitest';
import type { Progress } from './api';
import { emptyStory } from './dialogue';
import { shouldStartPrologue } from './prologue-progress';

// Exercise the public UUIDs used by authenticated content, with stable authored names.
vi.mock('./content', () => ({ quests: [
  { id: 'ticket-uuid', worldId: 'a0-ticket', level: 'A0' },
  { id: 'morning-uuid', worldId: 'a0-morgen', level: 'A0' },
  { id: 'arrival-uuid', worldId: 'a1-arrival', level: 'A1' },
  { id: 'cafe-uuid', worldId: 'a1-cafe', level: 'A1' },
] }));

const emptyProgress = (): Pick<Progress, 'completedQuestIds' | 'story'> => ({ completedQuestIds: [] });

describe('the default story opening', () => {
  it('starts a fresh adventure on the train without device preferences', () => {
    expect(shouldStartPrologue(emptyProgress())).toBe(true);
  });

  it('resumes an unfinished train journey from saved progress on another device', () => {
    expect(shouldStartPrologue({ ...emptyProgress(), completedQuestIds: ['ticket-uuid'] })).toBe(true);
    expect(shouldStartPrologue({ ...emptyProgress(), story: { ...emptyStory(), nodes: { 'ticket-uuid': 'gate-uuid' } } })).toBe(true);
  });

  it('enters town once the train journey is complete', () => {
    expect(shouldStartPrologue({ ...emptyProgress(), completedQuestIds: ['ticket-uuid', 'morning-uuid'] })).toBe(false);
  });

  it.each<Partial<Progress>>([
    { completedQuestIds: ['arrival-uuid'] },
    { completedQuestIds: ['cafe-uuid'] },
    { story: { ...emptyStory(), nodes: { 'arrival-uuid': 'intro-uuid' } } },
    { story: { ...emptyStory(), choices: { 'arrival-uuid': 'choice-uuid' } } },
    { story: { ...emptyStory(), inspections: { 'arrival-uuid': ['object-uuid'] } } },
    { story: { ...emptyStory(), flags: { 'cinematic:arrival': true } } },
  ])('keeps an existing town adventure in place: %j', saved => {
    expect(shouldStartPrologue({ ...emptyProgress(), ...saved })).toBe(false);
  });

  it('keeps optional practice separate from the story starting point', () => {
    const progress = { ...emptyProgress(), xp: 200, attempts: 20, completedUnitIds: ['unit-uuid'] };
    expect(shouldStartPrologue(progress)).toBe(true);
  });
});
