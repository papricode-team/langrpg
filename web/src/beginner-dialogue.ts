import type { DialogueChoice } from './dialogue';

/** Complete replies let new learners recognize the meaning before composing German. */
const gateReplies: Record<string, readonly (readonly [german: string, english: string])[]> = {
  'a1-arrival-exercise-6': [
    ['Helfen Sie mir bitte.', 'Please help me.'],
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
  return (gateReplies[exerciseId] ?? []).map(([german, english]) => ({
    id: german, german, english, next: '', effects: [],
  }));
}

const greetingMeanings: Record<string, string> = {
  'Guten Morgen!': 'Good morning!',
  'Guten Abend!': 'Good evening!',
  'Gute Nacht!': 'Good night!',
  'Auf Wiedersehen!': 'Goodbye!',
};

export function beginnerReplyMeaning(german: string): string | undefined {
  return greetingMeanings[german];
}
