import { describe, expect, it } from 'vitest';
import { quests } from './content';
import { firstAvailableMap, questAvailable, questLockReason, questUnlocked, routeUnlocked } from './progression';
import { emptyProgress, type Progress } from './api';
import { intakeStatus, secondsPerWord, syllabus } from './intake';

describe('the restored routes', () => {
  it('opens towns at their clue milestones and the coastline at the finale', () => {
    expect(routeUnlocked('lindenhafen', [])).toBe(true);
    expect(routeUnlocked('waldruh', [])).toBe(false);
    expect(routeUnlocked('waldruh', ['a1-lost-parcel'])).toBe(false);
    expect(routeUnlocked('waldruh', ['a1-departure'])).toBe(true);
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
    expect(questUnlocked('a1-market', quests.slice(0, quests.findIndex(q => q.id === 'a1-market')).map(q => q.id))).toBe(true);
    // A save that finished the old Act I may skip the everyday scenes added before its furthest scene.
    expect(questUnlocked('a1-departure', ['a1-arrival', 'a1-cafe', 'a1-market', 'a1-station', 'a1-workshop', 'a1-lost-parcel'])).toBe(true);
    expect(questUnlocked('a1-departure', ['a1-arrival', 'a1-cafe', 'a1-market', 'a1-station', 'a1-lost-parcel'])).toBe(false);
  });
});

describe('story access independent of vocabulary pacing', () => {
  const fresh = emptyProgress();
  const progressWithWords = (count: number): Progress => ({
    ...emptyProgress(),
    intake: { version: 1, activeSeconds: 0, creditSeconds: count * secondsPerWord(), lastBeatAt: '', wordIds: syllabus.wordIds.slice(0, count) },
  });
  const opening = progressWithWords(syllabus.openingWords);
  const unrecognised = progressWithWords(syllabus.brake.maxUnsettled);
  const overdue = progressWithWords(syllabus.brake.maxDue);
  const evidence = { attempts: 1, correct: 1, unaidedSuccesses: 1, status: 'learning' as const, dueAt: '2020-01-01T00:00:00Z', stabilityDays: 1 };
  overdue.words = Object.fromEntries(overdue.intake!.wordIds.map(id => [id, {
    wordId: id, directAttempts: 1, dueAt: '2020-01-01T00:00:00Z',
    exposures: 1, contextExposures: 0, mastery: 'learning' as const, lastSeenAt: '',
    stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0,
    modeStats: { recognition: { attempts: 1, correct: 1, unaidedSuccesses: 1 } },
    evidence: { recognition: evidence, listening: evidence, production: evidence },
  }]));

  it('covers fresh, opening, practice-paused and review-paused intake', () => {
    expect(intakeStatus(opening).introduced).toBe(syllabus.openingWords);
    expect(intakeStatus(unrecognised).paused).toBe('practise');
    expect(intakeStatus(overdue).paused).toBe('review');
  });

  it.each([
    ['no intake', fresh], ['opening words', opening], ['unrecognised words', unrecognised], ['overdue review', overdue],
  ])('keeps every next scene accessible with %s', (_label, intakeProgress) => {
    const progress = { ...intakeProgress, completedQuestIds: [] as string[] };
    for (const quest of quests) {
      expect(questAvailable(quest.id, progress), quest.id).toBe(true);
      expect(questLockReason(quest.id, progress), quest.id).toBe('');
      progress.completedQuestIds.push(quest.id);
      expect(questAvailable(quest.id, progress), `revisit ${quest.id}`).toBe(true);
    }
  });

  it('still requires earlier discoveries even when every course word is restored', () => {
    const progress = progressWithWords(syllabus.wordIds.length);
    expect(questAvailable('a1-cafe', progress)).toBe(false);
    expect(questLockReason('a1-cafe', progress)).toContain('Follow the current witness');
  });
});
