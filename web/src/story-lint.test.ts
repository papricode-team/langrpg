import { describe, expect, it } from 'vitest';
import serverRules from '../../server/story_rules.json';
import { questGraphs } from './quest-graph';
import { lintStory, type StoryRule } from './story-lint';
import { storyClues } from './story';
import { ambientCallbacks } from './npc-dialogue';
import { cinematicBeats } from './cinematic-content';
import { npcs, quests } from './content';

describe('story bible', () => {
  it('keeps every scene inside the narrative lint (reveals, address, instructions, prompts, server contract)', () => {
    expect(lintStory(questGraphs as never, serverRules.rules as StoryRule[], quests)).toEqual([]);
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
  it('checks the practice summaries for premature reveals too', () => {
    const summaries = structuredClone(quests);
    summaries[0].story = [{ german: 'Elise hat dir geschrieben.', english: 'Elise has written to you.' }];
    expect(lintStory(questGraphs as never, serverRules.rules as StoryRule[], summaries).some(error => error.includes('before a1-lost-parcel'))).toBe(true);
  });
  it('distinguishes sentence-initial her from formal speech to the player or an official', () => {
    const graph = structuredClone(questGraphs) as typeof questGraphs;
    const line = graph[1].nodes[0].lines[0];
    line.german = 'Ihr Name fehlt.';
    expect(lintStory(graph as never, serverRules.rules as StoryRule[])).toEqual([]);
    line.german = 'Ich helfe Ihnen.';
    expect(lintStory(graph as never, serverRules.rules as StoryRule[]).some(error => error.includes('residents say du'))).toBe(true);
    line.addressedTo = 'inspector';
    expect(lintStory(graph as never, serverRules.rules as StoryRule[])).toEqual([]);
  });
});

describe('story continuity across paths and surfaces', () => {
  const scene = (questId: string) => questGraphs.find(graph => graph.questId === questId)!;
  const spoken = (questId: string) => scene(questId).nodes.flatMap(node => node.lines);
  it('delivers the letter warning before the archive and finale pay it off', () => {
    const warning = 'Bevor du uns wieder auslöschst, komm.';
    const parcel = scene('a1-lost-parcel').nodes.find(node => node.id === 'complete')!.lines;
    expect(parcel.at(-1)).toMatchObject({ german: warning, english: 'Before you erase us again, come.' });
    expect(storyClues.find(clue => clue.questId === 'a1-lost-parcel')!.letter.some(sentence => sentence.german.includes(warning))).toBe(true);
    expect(spoken('a2-archive').some(line => line.german.includes('auslöschst'))).toBe(true);
    expect(spoken('b1-atlas').some(line => line.german.includes('auslöschst'))).toBe(true);
  });
  it('uses the same recording in the station, performance and witness account', () => {
    const recording = 'Ist da jemand? Ich bin noch hier.';
    expect(spoken('a1-station').some(line => line.german === recording)).toBe(true);
    expect(cinematicBeats('recording', 'lindenhafen')[0].german).toBe(recording);
    expect(spoken('b1-witness').some(line => line.german.includes(recording))).toBe(true);
  });
  it('lets the player experience the missed train before revealing the early departure', () => {
    const rail = scene('a2-rail-trip');
    expect(rail.nodes.find(node => node.id === 'intro')!.lines.some(line => line.german.includes('17:59'))).toBe(false);
    expect(rail.investigations.some(item => item.german.includes('17:59'))).toBe(false);
    expect(rail.nodes.find(node => node.id === 'choice')!.lines.some(line => line.german.includes('17:59'))).toBe(true);
  });
  it('makes Voss confess on the common path before any ledger choice', () => {
    const common = scene('b1-work').nodes.find(node => node.id === 'choice')!.lines.filter(line => !line.condition && line.speaker === 'inspector').map(line => line.german).join(' ');
    expect(common).toMatch(/Schließung/);
    expect(common).toMatch(/Unterschrift|unterschrieben/);
    expect(common).toMatch(/Löschspulen/);
    expect(spoken('b1-atlas').map(line => line.german).join(' ')).not.toContain('Frau Sander');
  });
  it('keeps Ada’s first speaking appearance in the archive, including cinematics', () => {
    expect(cinematicBeats('clockmill', 'waldruh').some(beat => beat.speaker === 'Ada')).toBe(false);
  });
  it('leaves key custody to the final choice because earlier trust selects the ending', () => {
    const endingLines = scene('b1-atlas').nodes.find(node => node.id === 'complete')!.lines.filter(line => line.condition?.ending);
    expect(endingLines.map(line => line.german).join(' ')).not.toContain('Schlüssel');
    for (const ending of ['routes-reopened', 'towns-consent', 'brass-reformed']) {
      const performance = cinematicBeats('bell', 'nebelstadt', ending).map(beat => beat.german).join(' ');
      expect(performance).not.toMatch(/Schlüssel.*(?:beim Rat|für den Kreis)|drei Schlüssel/);
    }
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
