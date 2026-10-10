import type { Progress } from './api';
import type { Exercise } from './content';

export function normalizedAnswer(answer: string): string {
  return answer.normalize('NFC').toLocaleLowerCase('de').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}
export function answerMatches(exercise: Exercise & { caseSensitive?: boolean }, answer: string): boolean {
  const acceptable = [exercise.answer, ...((exercise as Exercise & { acceptedAnswers?: string[] }).acceptedAnswers ?? [])];
  const normalize = exercise.caseSensitive ? (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '') : normalizedAnswer;
  return acceptable.some(value => normalize(value) === normalize(answer) ||
    ((exercise.mode === 'type' || exercise.mode === 'sentence') && productionAnswerMatches(normalize(answer), normalize(value))));
}

const umlautKeyboardForm = (value: string): string => value.replace(/[äöüÄÖÜ]/g, letter => ({ä:'ae',ö:'oe',ü:'ue',Ä:'Ae',Ö:'Oe',Ü:'Ue'}[letter]!));

function mechanicalTypo(answer: string, expected: string): boolean {
  const a = Array.from(answer), b = Array.from(expected);
  if (a.length < 5 || b.length < 5 || !/^\p{L}+$/u.test(answer) || !/^\p{L}+$/u.test(expected)) return false;
  if (a.length === b.length) {
    const first = a.findIndex((letter, index) => letter !== b[index]);
    return first >= 0 && first < a.length - 1 &&
      a[first] === a[first].toLocaleLowerCase('de') && a[first + 1] === a[first + 1].toLocaleLowerCase('de') &&
      a[first] === b[first + 1] && a[first + 1] === b[first] && a.slice(first + 2).join('') === b.slice(first + 2).join('');
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.length === shorter.length + 1 && longer.some((letter, index) => index > 0 &&
    letter === longer[index - 1] && letter === letter.toLocaleLowerCase('de') &&
    [...longer.slice(0, index), ...longer.slice(index + 1)].join('') === shorter.join(''));
}

function productionAnswerMatches(answer: string, expected: string): boolean {
  const actualWords = umlautKeyboardForm(answer).split(' '), expectedWords = umlautKeyboardForm(expected).split(' ');
  if (actualWords.length !== expectedWords.length) return false;
  let slips = 0;
  return actualWords.every((word, index) => word === expectedWords[index] || (++slips <= 1 && mechanicalTypo(word, expectedWords[index])));
}

export function gradeFeedback(exercise: Exercise & { caseSensitive?: boolean }, answer: string): string {
  if (answerMatches(exercise, answer)) return exercise.explanation;
  const actual = answer.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const expected = exercise.answer.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (exercise.caseSensitive && umlautKeyboardForm(actual.toLocaleLowerCase('de')) === umlautKeyboardForm(expected.toLocaleLowerCase('de'))) return 'Check capitalization: begin sentences, German nouns and formal Sie with a capital letter.';
  const a = normalizedAnswer(answer).split(' '), b = normalizedAnswer(exercise.answer).split(' ');
  const articles = new Set(['der','die','das','den','dem','des','ein','eine','einen','einem','einer','eines']);
  if (a.length===b.length&&a.some((token,index)=>token!==b[index]&&articles.has(token)&&articles.has(b[index]))) return "Check the article: its ending must match the noun's gender and its role in the sentence.";
  if (a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')) return b.some(token=>['weil','dass','obwohl','wenn','falls'].includes(token))
    ? 'Check word order: after weil, dass, obwohl, wenn or falls, the conjugated verb belongs at the end of that clause.'
    : 'Check word order: in a statement, the conjugated verb normally takes the second position.';
  return exercise.mode === 'type' || exercise.mode === 'sentence'
    ? `Check spelling and the requested form. Use ae, oe or ue when your keyboard cannot type an umlaut. ${exercise.explanation}`
    : exercise.explanation;
}

/** Add plausible grammar choices while retaining every canonical answer tile. */
export function sentenceTiles(exercise: Exercise): string[] {
  const tokens = [...(exercise.tokens ?? exercise.answer.split(' '))];
  const alternatives: Record<string, string[]> = {
    der:['die','das'],die:['der','das'],das:['der','die'],den:['dem','der'],dem:['den','des'],
    ein:['eine','einen'],eine:['ein','einen'],einen:['ein','einem'],einem:['einen','eines'],
    ich:['du','wir'],du:['ich','er'],wir:['ich','sie'],ist:['sind','war'],sind:['ist','seid'],
    habe:['hat','haben'],hat:['habe','haben'],haben:['hat','habt'],möchte:['möchten','möchtest'],
    kann:['können','kannst'],können:['kann','könnt'],weil:['aber','obwohl'],dass:['wenn','weil'],
    mit:['ohne','für'],für:['mit','von'],auf:['unter','neben'],im:['am','in'],zu:['zum','zur'],
  };
  const distractors: string[] = [];
  for (const token of tokens) {
    for (const candidate of alternatives[normalizedAnswer(token)] ?? []) {
      const value = token[0] === token[0]?.toLocaleUpperCase('de') ? candidate[0].toLocaleUpperCase('de') + candidate.slice(1) : candidate;
      if (!tokens.includes(value) && !distractors.includes(value)) distractors.push(value);
      if (distractors.length === 3) return [...tokens, ...distractors];
    }
  }
  for (const value of ['nicht','morgen','bitte']) if (!tokens.includes(value) && !distractors.includes(value)) distractors.push(value);
  return [...tokens, ...distractors.slice(0,3)];
}
export function dueItems(progress: Progress, now = Date.now()): string[] {
  return Object.values(progress.items)
    .filter(item => Number.isFinite(Date.parse(item.dueAt)) && Date.parse(item.dueAt) <= now)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .map(item => item.itemId);
}
export function memoryLabel(repetitions: number, stability: number): string {
  if (repetitions < 2) return 'Taking root';
  if (stability < 7) return 'Growing';
  return 'Settling in';
}
export function modeFor(exercise: Exercise): 'recognition' | 'production' | 'listening' {
  return exercise.mode === 'listen' ? 'listening' : exercise.mode === 'choice' ? 'recognition' : 'production';
}

export function practiceExercises<T extends Exercise>(exercises: readonly T[], silentMode: boolean): T[] {
  return exercises.filter(exercise => !silentMode || exercise.mode !== 'listen');
}

export function remainingQuestExercises(exercises: readonly Exercise[], progress: Progress, silentMode: boolean): Exercise[] {
  return practiceExercises(exercises, silentMode).filter(exercise =>
    !Object.values(progress.items[exercise.itemId]?.modeStats ?? {}).some(stats => stats.correct > 0));
}

/** Keep answered history and the cursor intact when silent mode is enabled mid-session. */
export function skipListeningExercises(session: { queue: Exercise[]; index: number; targetCount: number }): void {
  const pending = session.queue.slice(session.index);
  const skipped = new Set(pending.filter(exercise => exercise.mode === 'listen').map(exercise => exercise.id));
  session.queue = [...session.queue.slice(0, session.index), ...practiceExercises(pending, true)];
  session.targetCount -= skipped.size;
}
