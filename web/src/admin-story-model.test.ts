import {describe,expect,it} from 'vitest';
import {
  blockTitle,checkLine,conditionOnPath,describeCondition,describeEffect,firstAppearances,flagSources,newWordsByScene,
  readingOrder,searchStory,wordReport,type StoryLine,type StoryListing,type StoryScene,type StoryText,
} from './admin-story-model';

const text = (value: string, lexemes: Record<string, string> = {}): StoryText => {
  const words = [...value.matchAll(/\p{L}+/gu)].map(match => ({start: match.index!, end: match.index! + match[0].length, lexeme: lexemes[match[0]]}));
  return {text: value, translations: {en: `[${value}]`, tr: `(${value})`}, words};
};
const line = (id: string, value: string, lexemes: Record<string, string> = {}, extra: Partial<StoryLine> = {}): StoryLine =>
  ({id, speaker: 'otto', audio: true, hidden: false, ...text(value, lexemes), ...extra});

function scenes(): StoryScene[] {
  const first: StoryScene = {
    graphId: 'g1', courseId: 'de', questId: 'a1-arrival', questUuid: 'q1', level: 'A1', title: 'Arrival', subtitle: '', npc: 'otto', location: 'Station', start: 'intro', synopsis: [], objectives: [],
    blocks: [
      {id: 'intro', kind: 'intro', label: '', next: 'gate', lines: [line('l1', 'Guten Morgen', {Guten: 'gut', Morgen: 'morgen'}), line('l2', 'Die Laterne', {Laterne: 'laterne'})]},
      {id: 'gate', kind: 'gate', label: '', next: 'choice', lines: [line('l3', 'Bitte langsam')]},
      {id: 'choice', kind: 'choice', label: '', lines: [line('l4', 'Wer bekommt sie')], choices: [
        {id: 'give', next: 'after-give', effects: [{flag: 'ticket-given'}, {faction: 'brassOffice', amount: 1}], ...text('Hier, bitte')},
        {id: 'keep', next: 'after-keep', effects: [{flag: 'ticket-kept'}], ...text('Nein')},
      ]},
      {id: 'after-keep', kind: 'complete', label: '', next: 'complete', lines: [line('l6', 'Gut so')]},
      {id: 'after-give', kind: 'complete', label: '', next: 'complete', lines: [line('l5', 'Danke')]},
      {id: 'complete', kind: 'complete', label: '', terminal: true, lines: [line('l7', 'Komm mit')]},
      {id: 'who', kind: 'topic', label: '', question: text('Wer ist Voss?'), lines: [line('l8', 'Voss ist vom Amt')]},
    ],
  };
  const second: StoryScene = {
    ...first, graphId: 'g2', questId: 'a1-timetable', questUuid: 'q2', title: 'Timetable', start: 'intro2',
    blocks: [{id: 'intro2', kind: 'intro', label: '', lines: [
      line('m1', 'Guten Tag', {Guten: 'gut', Tag: 'tag'}),
      line('m2', 'Du hast die Karte', {Karte: 'karte'}, {condition: {flag: 'ticket-kept'}}),
      line('m3', 'Voss hat die Karte', {Karte: 'karte'}, {condition: {flag: 'ticket-given'}}),
      line('m4', 'Wieder da', {}, {condition: {flag: 'quest:a1-arrival'}}),
    ]}],
  };
  return [first, second];
}

const listing = (all: StoryScene[]): StoryListing => ({
  courses: [{id: 'de', title: 'German', target: 'de', supportLanguages: ['en', 'tr']}], acts: [], chapters: [],
  npcs: {otto: {name: 'Otto', role: '', color: '#fff'}},
  lexemes: {gut: {lemma: 'gut', level: 'A1', meaning: 'good'}, morgen: {lemma: 'Morgen', level: 'A1', meaning: 'morning'}, laterne: {lemma: 'Laterne', level: 'B1', meaning: 'lantern'}, tag: {lemma: 'Tag', level: 'A1', meaning: 'day'}, karte: {lemma: 'Karte', level: 'A1', meaning: 'ticket'}},
  scenes: all,
});

describe('story order', () => {
  it('reads the main path, then each branch after the decision, then questions', () => {
    const [scene] = scenes();
    expect(readingOrder(scene).map(block => block.id)).toEqual(['intro', 'gate', 'choice', 'after-give', 'complete', 'after-keep', 'who']);
    expect(blockTitle(scene, scene.blocks[4])).toBe('If the player says “Hier, bitte”');
    expect(blockTitle(scene, scene.blocks[5])).toBe('Ending');
  });
});

describe('vocabulary', () => {
  it('records the scene where each word first appears, ignoring hidden lines', () => {
    const all = scenes();
    expect(newWordsByScene(all)).toEqual([['gut', 'morgen', 'laterne'], ['tag', 'karte']]);
    all[0].blocks[0].lines[1].hidden = true;
    expect(newWordsByScene(all)[0]).toEqual(['gut', 'morgen']);
  });

  it('counts an edit instead of the authored line', () => {
    const all = scenes();
    all[0].blocks[0].lines[1].edit = {...text('Die Karte', {Karte: 'karte'}), by: 'Ada', at: ''};
    expect(firstAppearances(all).get('karte')).toBe(0);
    expect(firstAppearances(all).get('laterne')).toBeUndefined();
  });

  it('tells known, new, pulled-forward, fresh and unlisted words apart', () => {
    const all = scenes(), data = listing(all), first = firstAppearances(all, 'l2');
    const report = wordReport(text('Gut Tag Karte Laterne Voss', {Gut: 'gut', Tag: 'tag', Karte: 'karte', Laterne: 'laterne'}), 1, 'A1', first, data.lexemes);
    expect(report.map(word => word.status)).toEqual(['known', 'new', 'new', 'fresh', 'unlisted']);
    expect(report[3].above).toBe(true);
    expect(wordReport(text('Tag', {Tag: 'tag'}), 0, 'A1', first, data.lexemes)[0]).toMatchObject({status: 'earlier', firstScene: 1});
  });
});

describe('branches', () => {
  it('names the decision a line depends on', () => {
    const all = scenes(), sources = flagSources(all);
    expect(describeCondition({flag: 'ticket-kept'}, all, sources)).toBe('If the player said “Nein” in scene 1');
    expect(describeCondition({withoutFlag: 'ticket-kept'}, all, sources)).toBe('Unless the player said “Nein” in scene 1');
    expect(describeCondition({flag: 'quest:a1-arrival'}, all, sources)).toBe('After scene 1, “Arrival”');
    expect(describeEffect({faction: 'brassOffice', amount: 1})).toBe('+1 brass office');
    expect(describeEffect({flag: 'ticket-kept'})).toBe('sets ticket kept');
  });

  it('keeps every line open until the editor picks a reply, then follows that playthrough', () => {
    const all = scenes(), sources = flagSources(all), [kept, given, after] = all[1].blocks[0].lines.slice(1).map(value => value.condition);
    expect(conditionOnPath(kept, 1, all, {}, sources)).toBe('open');
    expect(conditionOnPath(kept, 1, all, {g1: 'keep'}, sources)).toBe('met');
    expect(conditionOnPath(given, 1, all, {g1: 'keep'}, sources)).toBe('unmet');
    expect(conditionOnPath(after, 1, all, {}, sources)).toBe('met');
    expect(conditionOnPath(after, 0, all, {}, sources)).toBe('unmet');
  });
});

describe('search', () => {
  it('matches either language and speaker names, ignoring accents', () => {
    const all = scenes(), data = listing(all);
    expect(searchStory(data, all, 'karte').map(hit => hit.lineId)).toEqual(['m2', 'm3']);
    expect(searchStory(data, all, 'otto laterne').map(hit => hit.lineId)).toEqual(['l2']);
    expect(searchStory(data, all, '[nein]')[0]).toMatchObject({speaker: 'Player', sceneIndex: 0});
    expect(searchStory(data, all, 'wer ist')[0]).toMatchObject({speaker: 'Question'});
  });
});

describe('line checks', () => {
  const base = () => {
    const all = scenes(), original = all[0].blocks[0].lines[0];
    return {all, original, scene: all[0], supportLanguages: ['en', 'tr'], newInScene: 3};
  };
  it('warns about stale translations, lost audio and words above the level', () => {
    const {all, original, scene, supportLanguages} = base(), data = listing(all);
    const draft = text('Guten Morgen, die Laterne', {Guten: 'gut', Morgen: 'morgen', Laterne: 'laterne'});
    const report = wordReport(draft, 0, 'A1', firstAppearances(all, original.id), data.lexemes);
    const checks = checkLine({text: draft.text, original, scene, report, translations: {...original.translations, en: 'Good morning, the lantern'}, supportLanguages, newInScene: 3});
    const messages = checks.map(check => `${check.level}: ${check.message}`);
    expect(messages).toContain('warning: Above A1: Laterne.');
    expect(messages).toContain('warning: The Turkish translation still matches the old line.');
    expect(messages.some(message => message.startsWith('note: Players will not hear the recorded voice'))).toBe(true);
    expect(checks.some(check => check.level === 'error')).toBe(false);
  });
  it('stops a save on server problems or empty text and flags overlong A1 turns', () => {
    const {original, scene, supportLanguages} = base();
    expect(checkLine({text: '', original, scene, report: [], translations: original.translations, supportLanguages, newInScene: 0}).some(check => check.level === 'error')).toBe(true);
    expect(checkLine({text: 'Hallo', original, scene, report: [], translations: {}, supportLanguages, newInScene: 0, problems: ['Use only {name}.']})[0]).toEqual({level: 'error', message: 'Use only {name}.'});
    const long = Array.from({length: 18}, () => 'Wort').join(' ');
    expect(checkLine({text: long, original, scene, report: [], translations: {en: 'x', tr: 'y'}, supportLanguages, newInScene: 0}).map(check => check.message).join(' ')).toMatch(/18 words/);
  });
});
