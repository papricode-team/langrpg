/**
 * Answer patterns: one authored string that lists every accepted form of a production answer.
 *
 *   {A|B}   exactly one of the alternatives
 *   [X]     optional text
 *
 * Both nest: `{Ich möchte|Ich hätte gern} [bitte ]einen Tee[, bitte].` The build expands a pattern into the
 * exercise's acceptedAnswers, so the Go and browser graders keep comparing against a plain list. Course-wide
 * spellings (noch mal, gerne, digits, commas) are handled by the graders' equivalents and need no pattern.
 */

export const MAX_EXPANSIONS = 64;
const SYNTAX = /[{}[\]|]/;

/** True when an authored string uses pattern syntax rather than being one literal answer. */
export const isAnswerPattern = value => SYNTAX.test(value);

/** Expand a pattern into its distinct answers, tidied and with a capital first letter. */
export function expandAnswerPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('answer pattern is empty');
  let index = 0;
  const fail = message => { throw new Error(`answer pattern ${JSON.stringify(pattern)}: ${message} at ${index}`); };
  const limit = values => { if (values.length > MAX_EXPANSIONS) fail(`more than ${MAX_EXPANSIONS} expansions`); return values; };
  const concat = (left, right) => limit(left.flatMap(a => right.map(b => a + b)));
  // sequence := (text | '{' alternatives '}' | '[' sequence ']')*
  const sequence = closers => {
    let values = [''];
    while (index < pattern.length && !closers.includes(pattern[index])) {
      const char = pattern[index];
      if (char === '{') {
        index++;
        const options = [];
        for (;;) {
          options.push(...sequence('|}'));
          if (pattern[index] === '|') { index++; continue; }
          if (pattern[index] === '}') { index++; break; }
          fail('unclosed {');
        }
        values = concat(values, options);
      } else if (char === '[') {
        index++;
        const optional = sequence(']');
        if (pattern[index] !== ']') fail('unclosed [');
        index++;
        values = concat(values, ['', ...optional]);
      } else if (char === '}' || char === ']' || char === '|') {
        fail(`unexpected ${char}`);
      } else {
        let end = index;
        while (end < pattern.length && !SYNTAX.test(pattern[end])) end++;
        const text = pattern.slice(index, end);
        index = end;
        values = values.map(value => value + text);
      }
    }
    return values;
  };
  const values = sequence('');
  if (index !== pattern.length) fail(`unexpected ${pattern[index]}`);
  const tidy = value => {
    const text = value.replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').replace(/^[\s,;:]+/, '').trim();
    return text ? text[0].toLocaleUpperCase('de') + text.slice(1) : text;
  };
  const answers = [...new Set(values.map(tidy))];
  if (answers.some(answer => !answer)) fail('an expansion is empty');
  return answers;
}

const words = text => text.normalize('NFC').toLocaleLowerCase('de').match(/\p{L}+(?:[-'’]\p{L}+)*/gu) ?? [];

/**
 * The accepted answers an exercise ships to the grader: its literal acceptedAnswers in authored order, then
 * every expansion of its answerPattern and of any acceptedAnswers entry written as a pattern. The canonical
 * answer must be one of the pattern's expansions. When `forms` (the target word's lemma and surface forms)
 * is given, every accepted answer must contain one of them, so an alternative never drops the word the
 * exercise teaches.
 */
export function acceptedAnswersFor(exercise, {forms} = {}) {
  const label = exercise.id ?? exercise.answer;
  const accepted = [];
  const push = value => { if (value !== exercise.answer && !accepted.includes(value)) accepted.push(value); };
  for (const entry of exercise.acceptedAnswers ?? []) {
    if (isAnswerPattern(entry)) expandAnswerPattern(entry).forEach(push);
    else push(entry);
  }
  if (exercise.answerPattern !== undefined) {
    const expansions = expandAnswerPattern(exercise.answerPattern);
    if (!expansions.includes(exercise.answer)) throw new Error(`${label}: answerPattern does not produce the answer ${JSON.stringify(exercise.answer)}`);
    expansions.forEach(push);
  }
  if (accepted.length + 1 > MAX_EXPANSIONS) throw new Error(`${label}: more than ${MAX_EXPANSIONS} accepted answers`);
  if (forms?.length) {
    const wanted = new Set(forms.flatMap(words));
    for (const value of accepted) if (!words(value).some(word => wanted.has(word))) throw new Error(`${label}: accepted answer ${JSON.stringify(value)} drops the target word`);
  }
  return accepted;
}
