import { describe, expect, it } from 'vitest';
import serverRules from '../../server/story_rules.json';
import { questGraphs } from './quest-graph';
import { lintStory, type StoryRule } from './story-lint';
import { storyClues } from './story';
import { ambientCallbacks } from './npc-dialogue';
import { cinematicBeats } from './cinematic-content';
import { npcs } from './content';

describe('story bible', () => {
  it('keeps every scene inside the narrative lint (reveals, address, instructions, prompts, server contract)', () => {
    expect(lintStory(questGraphs as never, serverRules.rules as StoryRule[])).toEqual([]);
  });
  it('flags a tutorial instruction spoken by an NPC and a generic choice prompt', () => {
    const broken = structuredClone(questGraphs) as typeof questGraphs;
    broken[1].nodes.find(node => node.id === 'intro')!.lines.at(-1)!.german = 'Bitte mich um einen Kaffee.';
    broken[1].nodes.find(node => node.id === 'choice')!.lines.at(-1)!.german = 'Was möchtest du tun?';
    const errors = lintStory(broken as never, serverRules.rules as StoryRule[]);
    expect(errors.some(error => error.includes('tutorial instruction'))).toBe(true);
    expect(errors.some(error => error.includes('generic choice prompt'))).toBe(true);
  });
  it('flags a reveal that appears before its scene', () => {
    const broken = structuredClone(questGraphs) as typeof questGraphs;
    broken[0].nodes[0].lines[0].german = 'Elise ist hier.';
    expect(lintStory(broken as never, serverRules.rules as StoryRule[]).some(error => error.includes('before a1-lost-parcel'))).toBe(true);
  });
});

describe('Elise letters, topics and callbacks', () => {
  it('unlocks one translated letter from Elise with every quest', () => {
    expect(storyClues).toHaveLength(18);
    for (const clue of storyClues) {
      expect(clue.letter.length, clue.questId).toBeGreaterThanOrEqual(1);
      for (const sentence of clue.letter) { expect(sentence.german.trim(), clue.questId).not.toBe(''); expect(sentence.english.trim(), clue.questId).not.toBe(''); }
    }
  });
  it('gives each scene optional questions with answers', () => {
    for (const graph of questGraphs) {
      expect(graph.topics?.length, graph.questId).toBeGreaterThanOrEqual(1);
      for (const topic of graph.topics!) expect(topic.lines.every(line => npcs.some(npc => npc.id === line.speaker)), topic.id).toBe(true);
    }
  });
  it('lets residents remember choices with real people, flags and levels', () => {
    for (const callback of ambientCallbacks) {
      expect(npcs.some(npc => npc.id === callback.npc), callback.german).toBe(true);
      expect(callback.german.trim() && callback.english.trim()).toBeTruthy();
    }
    expect(new Set(ambientCallbacks.map(callback => callback.german)).size).toBe(ambientCallbacks.length);
  });
  it('performs the four story reveals as short cinematics and keeps the lost time at one hour', () => {
    for (const kind of ['recording', 'erasure', 'confession', 'ledger'] as const) expect(cinematicBeats(kind, 'lindenhafen').length, kind).toBeGreaterThanOrEqual(2);
    const text = (['arrival', 'platform', 'recording', 'erasure', 'clockmill', 'confession', 'dark-beam', 'ledger', 'storm', 'bell', 'travel'] as const).flatMap(kind => cinematicBeats(kind, 'lindenhafen')).map(beat => beat.german).join(' ');
    expect(text).not.toMatch(/elf Minuten/);
    expect(text).toContain('eine Stunde');
  });
});
