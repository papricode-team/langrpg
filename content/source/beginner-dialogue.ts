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
  'a1-timetable-exercise-1': [
    ['Wann fährt der Zug?', 'When does the train leave?'],
    ['Wo ist der Zug?', 'Where is the train?'],
  ],
  'a1-cafe-exercise-1': [
    ['Ich möchte einen Tee.', 'I would like a tea.'],
    ['Ich möchte einen Kaffee.', 'I would like a coffee.'],
  ],
  'a1-room-exercise-1': [
    ['Ich möchte ein Bad.', 'I would like a bathroom.'],
    ['Hast du ein Zimmer frei?', 'Do you have a room free?'],
  ],
  'a1-shopping-exercise-1': [
    ['Ich möchte Eier.', 'I would like eggs.'],
    ['Was kostet das Brot?', 'What does the bread cost?'],
  ],
  'a1-market-exercise-1': [
    ['Ich brauche zwei Äpfel.', 'I need two apples.'],
    ['Ich brauche einen Kaffee.', 'I need a coffee.'],
  ],
  'a1-neighbour-exercise-1': [
    ['Wo ist Frau Berg?', 'Where is Frau Berg?'],
    ['Wie ist Frau Berg?', 'What is Frau Berg like?'],
  ],
  'a1-pharmacy-exercise-1': [
    ['Ich habe Kopfschmerzen.', 'I have a headache.'],
    ['Ich habe Hunger.', 'I am hungry.'],
  ],
  'a1-directions-exercise-1': [
    ['Wo ist die Gartenstraße?', 'Where is Gartenstraße?'],
    ['Wo ist der Zug?', 'Where is the train?'],
  ],
  'a1-station-exercise-5': [
    ['Guten Abend!', 'Good evening!'],
    ['Ist dieser Platz frei?', 'Is this seat free?'],
  ],
  'a1-weather-exercise-1': [
    ['Wie ist das Wetter morgen?', 'What is the weather like tomorrow?'],
    ['Wie spät ist es?', 'What time is it?'],
  ],
  'a1-workshop-exercise-2': [
    ['Ich brauche eine Lampe.', 'I need a lamp.'],
    ['Ich brauche einen Kaffee.', 'I need a coffee.'],
  ],
  'a1-bike-exercise-1': [
    ['Wann ist das Fahrrad fertig?', 'When is the bike ready?'],
    ['Wo ist das Fahrrad?', 'Where is the bike?'],
  ],
  'a1-phone-exercise-1': [
    ['Kann ich bitte Otto sprechen?', 'May I speak to Otto, please?'],
    ['Wo ist das Telefon?', 'Where is the telephone?'],
  ],
  'a1-invitation-exercise-1': [
    ['Ja, ich komme gern.', 'Yes, I will gladly come.'],
    ['Nein, ich esse allein.', 'No, I eat alone.'],
  ],
  'a1-lost-found-exercise-1': [
    ['Meine Tasche ist blau.', 'My bag is blue.'],
    ['Das ist mein Mantel.', 'That is my coat.'],
  ],
  'a1-lost-parcel-exercise-2': [
    ['Wie heißt du?', 'What is your name?'],
    ['Wie ist die Adresse?', 'What is the address?'],
  ],
  'a1-departure-exercise-1': [
    ['Eine Fahrkarte nach Waldruh, bitte.', 'A ticket to Waldruh, please.'],
    ['Wo ist der Zug?', 'Where is the train?'],
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
