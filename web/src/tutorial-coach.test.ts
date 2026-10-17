import { describe, expect, it } from 'vitest';
import { coachStep, type CoachState } from './tutorial-coach';

const base: CoachState = { beat: 'a0-ticket', stage: 'intro', lookFor: ['interior:prologue-ticket'], findAfter: [], moved: false, talked: false, dialogueOpen: false, touch: false };
const step = (change: Partial<CoachState>) => coachStep({ ...base, ...change });

describe('tutorial coach', () => {
  it('teaches walking first, then talking, then looking, then answering', () => {
    expect(step({})).toMatchObject({ id: 'walk', target: 'schaffner' });
    expect(step({ moved: true })).toMatchObject({ id: 'talk', target: 'schaffner' });
    expect(step({ moved: true, talked: true })).toMatchObject({ id: 'look', target: 'object:interior:prologue-ticket' });
    expect(step({ moved: true, talked: true, lookFor: [] })).toMatchObject({ id: 'answer', target: 'schaffner' });
  });

  it('names the input the player actually has', () => {
    expect(step({})?.text).toContain('WASD');
    expect(step({ touch: true })?.text).toContain('Tap the floor');
    expect(step({ moved: true, touch: true })?.text).toContain('Tap him');
  });

  it('points at one dialogue control at a time', () => {
    expect(step({ dialogueOpen: true })).toMatchObject({ id: 'tap-word' });
    expect(step({ dialogueOpen: true, stage: 'gate' })).toMatchObject({ id: 'reply' });
    expect(step({ dialogueOpen: true, beat: 'a0-name', stage: 'gate' })).toMatchObject({ id: 'name' });
    expect(step({ dialogueOpen: true, beat: 'a0-tee', stage: 'gate' })).toMatchObject({ id: 'no-english' });
    expect(step({ dialogueOpen: true, beat: 'a0-langsam', stage: 'gate' })).toMatchObject({ id: 'slower' });
    expect(step({ dialogueOpen: true, beat: 'a0-wo', stage: 'gate' })).toBeUndefined();
  });

  it('withholds the beacon when the player must follow directions', () => {
    const follow = step({ beat: 'a0-wo', stage: 'choice', lookFor: [], findAfter: ['interior:prologue-wo'], moved: true, talked: true });
    expect(follow).toMatchObject({ id: 'follow' });
    expect(follow?.target).toBeUndefined();
  });

  it('sends a returning player back to a conversation that is waiting for an answer', () => {
    expect(step({ beat: 'a0-tee', stage: 'choice', lookFor: [], moved: true })).toMatchObject({ id: 'answer', target: 'schaffner' });
  });

  it('sends the player to the door once the train has arrived', () => {
    expect(step({ beat: 'done', lookFor: [] })).toMatchObject({ id: 'leave' });
  });
});
