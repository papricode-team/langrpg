import { describe, expect, it } from 'vitest';
import rules from '../../server/story_rules.json';
import { quests } from './content';
import { getWorldScene } from './scene-data';
import type { Progress } from './api';
import { dowsing, emptyMechanics, inkActive, inkLevel, inkSpeakMarkup, openTickets, storyMarks, ticketsPage, trainState, type StoryMechanics } from './story-mechanics';

const mechanics = { ink: (rules as unknown as StoryMechanics).ink, sideQuests: (rules as unknown as StoryMechanics).sideQuests } as StoryMechanics;
const questIds = new Set(quests.map(quest => quest.id));
const progress = (completed: string[], extra: Partial<Progress> = {}): Progress => ({
  revision: 1, xp: 0, completedQuestIds: completed, attempts: 0, correctAttempts: 0, items: {}, words: {}, completedUnitIds: [], activities: {}, exerciseStats: {}, recentAttempts: {},
  intake: { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: [] },
  story: { flags: {}, inventory: [], reputation: { brassOffice: 0, lamplighters: 0, unwritten: 0 }, bell: 0, day: 1, nodes: {}, choices: {}, inspections: {} },
  ...extra,
});
const through = (id: string) => quests.slice(0, quests.findIndex(quest => quest.id === id) + 1).map(quest => quest.id);

describe('the Atlas rule as play', () => {
  it('anchors every fading name and ticket to a real place, scene and decay', () => {
    expect(mechanics.ink.decaySeconds).toBeGreaterThanOrEqual(900);
    expect(new Set(mechanics.ink.entries.map(entry => entry.id)).size).toBe(mechanics.ink.entries.length);
    for (const entry of mechanics.ink.entries) {
      for (const quest of [entry.from, entry.until, entry.keep, ...(entry.restoredBy ?? [])]) if (quest) expect(questIds.has(quest), `${entry.id} → ${quest}`).toBe(true);
      if (entry.kind === 'hud') continue;
      const [kind, id] = (entry.anchor ?? '').split(':');
      const scene = getWorldScene(entry.mapId as 'lindenhafen');
      const anchor = (kind === 'object' ? scene.objects : kind === 'npc' ? scene.npcs : scene.scenery).find(item => item.id === id);
      expect(anchor, `${entry.id} anchor ${entry.anchor}`).toBeDefined();
      expect(entry.x).toBeCloseTo(anchor!.x / scene.width, 4);
      expect(entry.y).toBeCloseTo(anchor!.y / scene.height, 4);
      if (entry.silent) expect(entry.bell, `${entry.id} cannot crack the bell`).toBeFalsy();
    }
    expect(new Set(mechanics.sideQuests.map(side => side.id)).size).toBe(mechanics.sideQuests.length);
    for (const side of mechanics.sideQuests) {
      expect(side.quest && questIds.has(side.quest), side.id).toBe(true);
      expect(side.place.german && side.place.english && side.memory.german && side.memory.english, side.id).toBeTruthy();
      // Act I memories stay within the A1 turn length; later acts follow the B1 sentence limit.
      const limit = quests.find(quest => quest.id === side.quest)?.level === 'A1' ? 12 : 19;
      expect(side.memory.german.split(/\s+/).length, `${side.id} memory stays short`).toBeLessThanOrEqual(limit);
      const scene = getWorldScene(side.mapId as 'lindenhafen');
      if (side.anchor) {
        const [kind, id] = side.anchor.split(':');
        expect((kind === 'npc' ? scene.npcs : kind === 'object' ? scene.objects : scene.scenery).some(item => item.id === id), side.id).toBe(true);
      } else expect(side.x > 0 && side.x < 1 && side.y > 0 && side.y < 1, `${side.id} has a fixed place`).toBe(true);
    }
  });

  it('pales names with visible play and darkens them when a scene says them', () => {
    const plate = mechanics.ink.entries.find(entry => entry.id === 'berg-plate')!;
    const before = progress(through('a1-shopping'));
    expect(inkActive(plate, before)).toBe(false);
    const after = progress(through('a1-market'), { story: { ...progress([]).story!, ink: { 'berg-plate': { spokenAt: 100 } } } as Progress['story'] });
    after.intake!.activeSeconds = 100 + mechanics.ink.decaySeconds * .75;
    expect(inkLevel(plate, after, mechanics.ink)).toBeCloseTo(.25, 2);
    expect(inkLevel(plate, after, mechanics.ink, mechanics.ink.decaySeconds)).toBe(0);
    const marks = storyMarks('lindenhafen', after, mechanics, 'Mira');
    const mark = marks.inks.find(ink => ink.id === 'berg-plate')!;
    expect(mark.pale).toBe(true);
    expect(mark.objectId).toBe('lindenhafen-berg-house');
    expect(mark.interactive).toBe(false);
    expect(marks.inks.find(ink => ink.id === 'board-w')!.text).toContain('W…');
  });

  it('opens tickets after Otto’s office and lists returned names in the journal', () => {
    const tickets = (state: Progress) => openTickets(state, mechanics).filter(side => side.kind === 'ticket');
    expect(tickets(progress(through('a1-weather').filter(id => id !== 'a1-station')))).toHaveLength(0);
    const open = tickets(progress(through('a1-station')));
    expect(open.length).toBeGreaterThanOrEqual(8);
    const returned = progress(through('a1-station'));
    returned.story!.flags[`side:${open[0].id}`] = true;
    const page = ticketsPage(returned, mechanics, id => id);
    expect(page).toContain(open[0].german);
    expect(page).toContain(`data-follow-ticket="${open[1].id}"`);
    expect(storyMarks('lindenhafen', returned, mechanics, 'Mira').tickets.some(ticket => ticket.id === open[0].id)).toBe(false);
  });

  it('lets the lamp lean toward the palest name and the train keep its timetable', () => {
    const state = progress(through('a1-market'), { story: { ...progress([]).story!, inventory: ['signal-lamp'], ink: { 'berg-plate': { spokenAt: 0 } } } as Progress['story'] });
    state.intake!.activeSeconds = mechanics.ink.decaySeconds;
    const marks = storyMarks('lindenhafen', state, mechanics, 'Mira');
    const plate = marks.inks.find(ink => ink.id === 'berg-plate')!;
    const near = dowsing(marks, plate.x * 2304 + 20, plate.y * 1536, 2304, 1536);
    const far = dowsing(marks, plate.x * 2304 + 800, plate.y * 1536, 2304, 1536);
    expect(near.strength).toBeGreaterThan(far.strength);
    expect(near.target?.id).toBe('berg-plate');
    expect(dowsing({ ...marks, lamp: false }, 0, 0, 1, 1).strength).toBe(0);
    expect(trainState('lindenhafen', progress([]))).toBe('arriving');
    expect(trainState('lindenhafen', progress(through('a1-weather')))).toBeUndefined();
    expect(trainState('lindenhafen', progress(through('a1-lost-parcel')))).toBe('waiting');
    expect(trainState('lindenhafen', progress(through('a1-departure')))).toBe('departing');
  });

  it('never prints a silent name and offers to say the player’s own', () => {
    const silent = mechanics.ink.entries.find(entry => entry.silent)!;
    const html = inkSpeakMarkup([silent], progress(through('a1-timetable')), mechanics, 'Mira');
    expect(html).not.toContain('name="answer"');
    expect(html).not.toContain(`>${silent.german}<`);
    const own = mechanics.ink.entries.find(entry => entry.kind === 'hud')!;
    expect(inkSpeakMarkup([own], progress(through('a1-arrival')), mechanics, 'Mira')).toContain('Mira');
    expect(storyMarks('lindenhafen', progress([]), emptyMechanics(), 'Mira').inks).toHaveLength(0);
  });
});
