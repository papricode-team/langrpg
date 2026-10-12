import { describe, it, expect } from 'vitest';
import { quests, type Level } from './content';
import { learnerLevel, scaffoldStage, scaffoldText } from './typing-scaffold';

const questLevels = new Map<string, Level>(quests.map(quest => [quest.id, quest.level]));

describe('typed recall scaffolds', () => {
  it('starts with the beginning and end of every word and fades with each unaided recall', () => {
    expect(scaffoldText('Hier ist Ihr Paket.', 'edges')).toBe('H__r i_t I_r P___t.');
    expect(scaffoldText('Hier ist Ihr Paket.', 'initials')).toBe('H___ i__ I__ P____.');
    expect(scaffoldText('Hier ist Ihr Paket.', 'shape')).toBe('____ ___ ___ _____.');
    expect(scaffoldText('Hier ist Ihr Paket.', 'none')).toBe('');
    expect(scaffoldText('Grüß dich, wie geht’s?', 'edges')).toBe('G__ß d__h, w_e g__t’s?');
    expect(scaffoldText('Um 8 Uhr.', 'shape')).toBe('__ 8 ___.');
  });

  it('keeps scaffolds during training at the sentence’s level', () => {
    expect(scaffoldStage('A1', 'A1', 0)).toBe('edges');
    expect(scaffoldStage('A1', 'A1', 1)).toBe('initials');
    expect(scaffoldStage('A1', 'A1', 5)).toBe('shape');
    expect(scaffoldStage('A2', 'A1', 0)).toBe('edges');
  });

  it('expects full recall of earlier levels once the learner has moved on', () => {
    expect(scaffoldStage('A1', 'A2', 0)).toBe('none');
    expect(scaffoldStage('A2', 'B1', 0)).toBe('none');
    expect(scaffoldStage('A2', 'A2', 0)).toBe('edges');
  });

  it('follows the story milestones that open each town', () => {
    expect(learnerLevel([], questLevels)).toBe('A1');
    expect(learnerLevel(['a1-arrival', 'a1-cafe'], questLevels)).toBe('A1');
    expect(learnerLevel(['a1-lost-parcel'], questLevels)).toBe('A2');
    expect(learnerLevel(['a2-apartment'], questLevels)).toBe('A2');
    expect(learnerLevel(['a2-archive'], questLevels)).toBe('B1');
    expect(learnerLevel(['b1-witness'], questLevels)).toBe('B1');
  });
});
