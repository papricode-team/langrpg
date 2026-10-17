import { t } from './i18n';

/** What the coach knows about the player's place in the prologue. Pure data, so the rules are testable. */
export interface CoachState {
  /** Quest id of the unfinished beat (`a0-ticket` …; a content id in the browser) or `done`. */
  beat: string;
  /** Server cursor stage for that beat. */
  stage: 'intro' | 'gate' | 'choice' | 'complete';
  /** Story objects the beat needs before its question, not yet looked at (`interior:prologue-ticket`). */
  lookFor: readonly string[];
  /** Objects the beat needs after the player's answer (the washroom door). */
  findAfter: readonly string[];
  /** The player has walked somewhere on the train. */
  moved: boolean;
  /** The player has opened this beat's conversation in this visit. */
  talked: boolean;
  /** A conversation or evidence card is on screen. */
  dialogueOpen: boolean;
  /** Touch is the primary input. */
  touch: boolean;
}

export interface CoachStep {
  id: string;
  title: string;
  text: string;
  /** World objective: the conductor's id, `object:<interior object>`, or none when the player should find it alone. */
  target?: string;
}

const CONDUCTOR = 'schaffner';

/** Where Brandt is, in words the player can follow before they can read German. */
function talkText(beat: string, touch: boolean): string {
  const how = touch ? t('Tap him to talk.') : t('Walk up to him and press E, or click him.');
  switch (beat) {
    case 'a0-ticket': return `${t('The conductor is coming down the aisle.')} ${how}`;
    case 'a0-name': return `${t('Brandt is frowning at your ticket.')} ${how}`;
    case 'a0-wagen': return `${t('Brandt is by the window, counting.')} ${how}`;
    case 'a0-tee': return `${t('Brandt has moved to the counter.')} ${how}`;
    case 'a0-wo': return `${t('You need the washroom. Ask Brandt where it is.')} ${how}`;
    case 'a0-langsam': return `${t('Brandt has an announcement.')} ${how}`;
    case 'a0-morgen': return `${t('It is morning. Brandt is by the door.')} ${how}`;
    default: return how;
  }
}

/** Inside a conversation the coach points at one control at a time. */
function dialogueTip(state: CoachState): CoachStep | undefined {
  if (state.beat === 'a0-ticket' && state.stage === 'intro') return { id: 'tap-word', title: t('Tap a word'), text: t('Every German word shows its meaning when you tap it. Listen again plays the line once more.') };
  if (state.beat === 'a0-ticket') return { id: 'reply', title: t('Your turn'), text: t('Pick what you would say. The meaning sits under each reply for now.') };
  if (state.beat === 'a0-name' && state.stage === 'gate') return { id: 'name', title: t('Your name'), text: t('Write only your name. It is the one thing you type on the train.') };
  if (state.beat === 'a0-wagen') return { id: 'listen', title: t('Listen'), text: t('Numbers are easier heard than read. Listen again as often as you like.') };
  if (state.beat === 'a0-tee' && state.stage !== 'intro') return { id: 'no-english', title: t('German only'), text: t('From now on the replies show German only. Tap a word if you need its meaning.') };
  if (state.beat === 'a0-langsam') return { id: 'slower', title: t('Too fast?'), text: t('Echo · slower plays the line slowly. Then tell Brandt what happened.') };
  return undefined;
}

/** The single next thing to do on the night train, or nothing once the coach has nothing to add. */
export function coachStep(state: CoachState): CoachStep | undefined {
  if (state.dialogueOpen) return dialogueTip(state);
  if (state.beat === 'done') return { id: 'leave', title: t('Platform seven'), text: state.touch ? t('Tap the carriage door to step off the train.') : t('Walk to the carriage door to step off the train.') };
  if (state.beat === 'a0-ticket' && !state.moved && !state.talked) {
    return { id: 'walk', title: t('Walk'), text: state.touch ? t('Tap the floor to walk there.') : t('Use WASD or the arrow keys, or click the floor.'), target: CONDUCTOR };
  }
  if (state.stage === 'intro' && state.talked && state.lookFor.length) {
    const target = state.lookFor[0];
    const text = target.endsWith('ticket') ? t('Your ticket is on the little table. Walk over and look at it.')
      : target.endsWith('wagen') ? t('Look out of the window and count the carriages.') : t('Walk to the glowing object and look at it.');
    return { id: 'look', title: t('Look'), text: `${text} ${state.touch ? t('Tap it.') : t('Press E or click it.')}`, target: `object:${target}` };
  }
  if (state.stage === 'choice' && state.findAfter.length) {
    // The one beat without a beacon: the player follows the direction Brandt gave.
    return { id: 'follow', title: t('Go where he points'), text: t('Brandt said “Da!” and pointed. No marker this time: find the door yourself.') };
  }
  if (state.stage === 'choice' || state.talked && (state.stage === 'gate' || state.stage === 'intro')) return { id: 'answer', title: t('Answer Brandt'), text: t('Go back to Brandt. He is waiting for your answer.'), target: CONDUCTOR };
  return { id: 'talk', title: t('Talk'), text: talkText(state.beat, state.touch), target: CONDUCTOR };
}
