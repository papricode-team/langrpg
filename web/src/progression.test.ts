import { describe, expect, it } from 'vitest';
import { quests } from './content';
import { firstAvailableMap, questUnlocked, routeUnlocked } from './progression';

describe('the restored routes', () => {
  it('opens towns at their clue milestones and the coastline at the finale', () => {
    expect(routeUnlocked('lindenhafen', [])).toBe(true);
    expect(routeUnlocked('waldruh', [])).toBe(false);
    expect(routeUnlocked('waldruh', ['a1-lost-parcel'])).toBe(true);
    expect(routeUnlocked('nebelstadt', ['a1-lost-parcel'])).toBe(false);
    expect(routeUnlocked('nebelstadt', ['a2-archive'])).toBe(true);
    expect(routeUnlocked('saffroncourt', ['b1-storm'])).toBe(false);
    expect(routeUnlocked('saffroncourt', ['b1-atlas'])).toBe(true);
  });

  it('preserves old out-of-order discoveries but requires missing clues for new ones', () => {
    expect(firstAvailableMap('nebelstadt', ['b1-witness'])).toBe('nebelstadt');
    expect(firstAvailableMap('nebelstadt', [])).toBe('lindenhafen');
    expect(questUnlocked('a1-market', ['a1-cafe'])).toBe(false);
    expect(questUnlocked('a1-cafe', ['a1-cafe'])).toBe(true);
    expect(questUnlocked('a1-market', quests.slice(0, 2).map(q => q.id))).toBe(true);
  });
});
