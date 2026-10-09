import { describe, expect, it } from 'vitest';
import { quests } from './content';
import { actFor, clueFor, discoveredClues, objectStories, storyActs, storyClues } from './story';
import { maps } from './maps';
import { activityDiscoveries } from './activity-stories';
import type { Narrative } from './sentence-translations';

const prose: Narrative[] = [
  ...storyActs.flatMap(act => [act.premise, ...act.introduction, act.goal, act.cliffhanger]),
  ...storyClues.flatMap(clue => [clue.text, clue.lead]),
  ...Object.values(objectStories).flatMap(object => [object.detail, object.secret]),
  ...Object.values(activityDiscoveries).flatMap(discovery => [discovery.text, discovery.lead]),
];

describe('German story narrative', () => {
  it('provides a complete English translation for every sentence of visible story prose', () => {
    for (const paragraph of prose) {
      expect(paragraph.length).toBeGreaterThan(0);
      for (const sentence of paragraph) {
        expect(sentence.german.trim().length).toBeGreaterThan(0);
        expect(sentence.english.trim().length).toBeGreaterThan(0);
        expect(sentence.german.trim()).toBe(sentence.german);
        expect(sentence.english.trim()).toBe(sentence.english);
        expect(sentence.german).not.toBe(sentence.english);
        expect(sentence.german).toMatch(/[.!?][“”„"]?$/u);
        expect(sentence.english).toMatch(/[.!?][“”„"]?$/u);
      }
    }
  });

  it('preserves the three acts, their paragraph structure, and every quest discovery', () => {
    expect(storyActs.map(act => act.mapId)).toEqual(['lindenhafen', 'waldruh', 'nebelstadt']);
    for (const act of storyActs) {
      expect(act.introduction).toHaveLength(3);
      expect(actFor(act.mapId)).toBe(act);
      expect(storyClues.filter(clue => quests.some(quest => quest.id === clue.questId && quest.level === act.level))).toHaveLength(6);
    }
    expect(storyClues.map(clue => clue.questId)).toEqual(quests.map(quest => quest.id));
    for (const quest of quests) expect(clueFor(quest.id)?.text.length).toBeGreaterThan(0);
    expect(discoveredClues(['a1-cafe', 'b1-council']).map(clue => clue.questId)).toEqual(['a1-cafe', 'b1-council']);
    expect(discoveredClues([])).toEqual([]);
  });

  it('retains four side discoveries at every learning level and their route context', () => {
    for (const level of ['A1', 'A2', 'B1'] as const) {
      const ids = ['cafe', 'market', 'detective', 'delivery'].map(activity => `${activity}:${level}`);
      expect(Object.entries(activityDiscoveries).filter(([, discovery]) => discovery.level === level).map(([id]) => id)).toEqual(ids);
      for (const id of ids) {
        expect(activityDiscoveries[id].text.length).toBeGreaterThanOrEqual(2);
        expect(activityDiscoveries[id].lead.length).toBeGreaterThan(0);
      }
    }
    const answer = activityDiscoveries['delivery:B1'];
    expect(answer.text.some(sentence => sentence.german.includes('Waldruh') && sentence.english.includes('Waldruh'))).toBe(true);
    expect(answer.lead[0].german).toContain('beiden Richtungen');
  });

  it('keeps translations for each inspectable story object and the seventh-bell stakes', () => {
    const storyMaps = maps.filter(map => storyActs.some(act => act.mapId === map.id));
    expect(Object.keys(objectStories)).toEqual(storyMaps.flatMap(map => map.objects.map(object => object.id)));
    const warning = clueFor('b1-council')!.text;
    expect(warning.some(sentence => sentence.german.includes('siebte') && sentence.english.includes('seventh'))).toBe(true);
    const reveal = clueFor('a1-lost-parcel')!.text;
    expect(reveal.some(sentence => sentence.german.includes('Waldruh') && sentence.english.includes('Waldruh'))).toBe(true);
    expect(reveal.some(sentence => sentence.german.includes('auslöschst') && sentence.english.includes('erase us again'))).toBe(true);
  });
});
