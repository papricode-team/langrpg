import type { DialogueChoice } from './dialogue';
import type { Progress } from './api';

/** Optional writing can open earlier; story support fades only after independent practice. */
export function needsBeginnerStorySupport(progress: Progress): boolean {
  const foundations = ['a1-arrival', 'a1-cafe', 'a1-market'];
  if (!foundations.every(id => progress.completedQuestIds.includes(id))) return true;
  const attempts = Object.values(progress.recentAttempts)
    .filter(attempt => !attempt.hinted)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 24);
  const correct = attempts.filter(attempt => attempt.correct);
  // Repeating one easy reply, watching the story or choosing translated answers
  // cannot unlock harder demands. Include recall as well as recognition.
  return new Set(correct.map(attempt => attempt.itemId)).size < 12
    || new Set(correct.filter(attempt => attempt.mode === 'production').map(attempt => attempt.itemId)).size < 4
    || correct.length / attempts.length < .8;
}

/** Complete replies let new learners recognize the meaning before composing German. */
export const beginnerGateTranslations: Record<string, readonly (readonly [german: string, english: string])[]> = {
  'a1-arrival-exercise-7': [
    ['Noch einmal, bitte.', 'Once again, please.'],
    ['Guten Morgen!', 'Good morning!'],
  ],
  'a1-cafe-exercise-1': [
    ['Ich möchte einen Tee.', 'I would like a tea.'],
    ['Ich möchte einen Kaffee.', 'I would like a coffee.'],
  ],
  'a1-market-exercise-1': [
    ['Ich brauche zwei Äpfel.', 'I need two apples.'],
    ['Ich brauche einen Kaffee.', 'I need a coffee.'],
  ],
  'a1-station-exercise-5': [
    ['Guten Morgen!', 'Good morning!'],
    ['Ist dieser Platz frei?', 'Is this seat free?'],
  ],
  'a1-workshop-exercise-2': [
    ['Ich brauche eine Lampe.', 'I need a lamp.'],
    ['Ich brauche einen Kaffee.', 'I need a coffee.'],
  ],
  'a1-lost-parcel-exercise-2': [
    ['Wie heißen Sie?', 'What is your name?'],
    ['Wie ist die Adresse?', 'What is the address?'],
  ],
};

/** Choice IDs remain canonical German answers so the existing server can grade them. */
export function beginnerGateChoices(exerciseId: string): DialogueChoice[] {
  return (beginnerGateTranslations[exerciseId] ?? []).map(([german, english]) => ({
    id: german, german, english, next: '', effects: [],
  }));
}

export const greetingMeanings: Record<string, string> = {
  'Guten Morgen!': 'Good morning!',
  'Guten Abend!': 'Good evening!',
  'Gute Nacht!': 'Good night!',
  'Auf Wiedersehen!': 'Goodbye!',
};

export function beginnerReplyMeaning(german: string): string | undefined {
  return greetingMeanings[german];
}
