import { describe, expect, it } from 'vitest';
import { npcRoutine, npcRoutines, residentRoutine, WorldBarkDirector, type BarkContext, type RoutineLexeme } from './world-routines';
import type { WordMemory } from './api';

describe('town routines and ambient German', () => {
  it('keeps every required story actor at the authoritative feet position at every hour', () => {
    for (const id of Object.keys(npcRoutines)) for (let hour = 0; hour < 24; hour += .125) {
      const active = npcRoutine(id, hour, id);
      expect(active.interactable).toBe(true);
      expect(active.action).toBe('listen');
      expect([active.offsetX, active.offsetY]).toEqual([0, 0]);
      const background = npcRoutine(id, hour);
      expect(Math.hypot(background.offsetX, background.offsetY)).toBeLessThan(.04);
    }
  });

  it('changes work at opening and closing time without a position jump', () => {
    expect(npcRoutine('marta', 8).action).toBe('serve');
    expect(npcRoutine('fritz', 18.5).action).toBe('pack');
    expect(npcRoutine('ada', 20).action).toBe('pack');
    const before = npcRoutine('marta', 19 - .00001), after = npcRoutine('marta', 19);
    expect(Math.hypot(before.offsetX - after.offsetX, before.offsetY - after.offsetY)).toBeLessThan(.00001);
    expect(residentRoutine('lindenhafen-resident-reader', 2)).toEqual({ action: 'rest', pace: .8, visible: false });
    expect(residentRoutine('waldruh-resident-commuter', 7).pace).toBe(1);
  });

  it('paces bubbles and keeps dialogue and required characters free of interruption', () => {
    const director = new WorldBarkDirector();
    const context: BarkContext = { speakerId: 'marta', mapId: 'lindenhafen', level: 'A1', hour: 8, elapsedSeconds: 0 };
    expect(director.next({ ...context, requiredNpcId: 'marta' })).toBeUndefined();
    expect(director.next({ ...context, conversationActive: true })).toBeUndefined();
    expect(director.next(context)?.german).toContain('Kaffee');
    expect(director.next({ ...context, elapsedSeconds: 35 })).toBeUndefined();
    expect(director.next({ ...context, elapsedSeconds: 36 })).toBeDefined();
    expect(director.next({ ...context, speakerId: 'fritz', elapsedSeconds: 40 })).toBeUndefined();
    expect(director.stats.emitted).toBe(2);
  });

  it('reuses genuinely due words, leaves established future cards resting and does not promote exposure to mastery', () => {
    const director = new WorldBarkDirector();
    const words: RoutineLexeme[] = [
      { id: 'lampe-noun', lemma: 'Lampe', english: 'lamp', level: 'A1', pos: 'noun', article: 'die', topic: 'home' },
      { id: 'uhr-noun', lemma: 'Uhr', english: 'clock', level: 'A1', pos: 'noun', article: 'die', topic: 'time' },
      { id: 'versprechen-noun', lemma: 'Versprechen', english: 'promise', level: 'B1', pos: 'noun', article: 'das', topic: 'connections' },
    ];
    const memory = { 'lampe-noun': { directAttempts: 1, dueAt: '2026-10-09T00:00:00Z' } as WordMemory,
      'uhr-noun': { directAttempts: 3, dueAt: '2026-10-11T00:00:00Z' } as WordMemory };
    const context: BarkContext = { speakerId: 'marta', mapId: 'lindenhafen', level: 'A1', hour: 8, elapsedSeconds: 0,
      lexicon: words, progress: { words: memory }, now: Date.parse('2026-10-10T00:00:00Z') };
    director.next(context);
    const due = director.next({ ...context, speakerId: 'emil', elapsedSeconds: 10 });
    expect(due?.source).toBe('due-word');
    expect(due?.wordIds).toEqual(['lampe-noun']);
    expect(due?.german).toContain('die Lampe');
    const resting = director.next({ ...context, speakerId: 'fritz', elapsedSeconds: 20 });
    expect(resting?.source).toBe('routine');
    expect(resting?.wordIds).toEqual([]);
    expect(memory['lampe-noun'].directAttempts).toBe(1);
    expect(memory['uhr-noun'].dueAt).toBe('2026-10-11T00:00:00Z');
  });

  it('lets course headwords return as exact labels at their authored level', () => {
    const director = new WorldBarkDirector();
    const context: BarkContext = { speakerId: 'marta', mapId: 'waldruh', level: 'A2', hour: 10, elapsedSeconds: 0,
      lexicon: [{ id: 'anschluss-noun', lemma: 'Anschluss', english: 'connection', level: 'A2', pos: 'noun', article: 'der', topic: 'travel' }] };
    director.next(context);
    const label = director.next({ ...context, speakerId: 'otto', elapsedSeconds: 10 });
    expect(label?.source).toBe('course-word'); expect(label?.wordIds).toEqual(['anschluss-noun']);
    expect(label?.german).toContain('der Anschluss');
    expect(label?.german).toContain('Schild');
    director.reset();
    expect(director.next({ ...context, level: 'A1' })?.source).toBe('routine');
    expect(director.next({ ...context, speakerId: 'otto', level: 'A1', elapsedSeconds: 10 })?.source).toBe('routine');
  });
});
