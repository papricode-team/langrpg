import { describe, expect, it } from 'vitest';
import { emptyProgress } from './api';
import { emptyStory } from './dialogue';
import { contentEntitlementKey } from './content-entitlements';

describe('catalogue refresh entitlements', () => {
  it('keeps train word restoration and inspection on their direct read paths', () => {
    const before = {...emptyProgress(), story: emptyStory(), intake: {version:1, activeSeconds:0, creditSeconds:0, lastBeatAt:'', wordIds:[] as string[]}}, after = structuredClone(before);
    after.intake.wordIds.push('new-word');
    after.story.inspections.ticket = ['ticket'];
    expect(contentEntitlementKey(after, true)).toBe(contentEntitlementKey(before, true));
    expect(contentEntitlementKey(after, false)).not.toBe(contentEntitlementKey(before, false));
  });
  it('refreshes after a train scene unlocks the next scene', () => {
    const before = emptyProgress(), after = structuredClone(before);
    after.completedQuestIds.push('a0-ticket');
    expect(contentEntitlementKey(after, true)).not.toBe(contentEntitlementKey(before, true));
  });
  it('retains town evidence and inventory refreshes', () => {
    const before = {...emptyProgress(), story: emptyStory()}, after = structuredClone(before);
    after.story.inspections.arrival = ['ticket'];
    expect(contentEntitlementKey(after, false)).not.toBe(contentEntitlementKey(before, false));
  });
});
