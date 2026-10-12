/** Refresh authored Turkish course overlays; missing source translations stop the update. */
import './register-content-loader.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { courseExercises, courseUnits, courseGrammar } = await import('../web/src/course.ts');

const root = fileURLToPath(new URL('..', import.meta.url));
const coursePath = resolve(root, 'web/src/data/i18n/tr-course.json');
const course = JSON.parse(readFileSync(coursePath, 'utf8'));
const ui = JSON.parse(readFileSync(resolve(root, 'web/src/data/i18n/tr-ui.json'), 'utf8'));
const authoredPath = resolve(root, 'scripts/turkish-course-texts.json');
const authored = JSON.parse(readFileSync(authoredPath, 'utf8'));
const known = new Map(Object.values(course.lexicon).map(entry => [entry.en, entry.tr]));
for (const guide of courseGrammar) {
  const tr = course.grammar[guide.id];
  known.set(guide.title, tr.title[1]);
  known.set(guide.explanation, tr.explanation[1]);
  for (const example of guide.examples) known.set(example.english, tr.examples[example.german]);
}
for (const [source, tr] of Object.entries(ui)) known.set(source, tr);
const missing = new Set();
const text = source => {
  if (authored[source]) return authored[source];
  if (known.get(source)) return known.get(source);
  missing.add(source);
  return `⟦${source}⟧`;
};
const prompt = source => {
  for (const label of ['Read the note.', 'Read the new text.']) {
    if (source.startsWith(`${label}\n\n`)) {
      const [body, question] = source.slice(label.length + 2).split('\n\n');
      return `${label === 'Read the note.' ? 'Notu oku.' : 'Yeni metni oku.'}\n\n${body}\n\n${text(question)}`;
    }
  }
  if (source.startsWith('Complete: ')) return `Tamamla: ${source.slice('Complete: '.length).replace(/\(([^)]+)\)/g, (_, value) => `(${text(value)})`)}`;
  for (const label of ['Write: ', 'Build: ', 'Write a clear request: ']) {
    if (source.startsWith(label)) return `${label === 'Build: ' ? 'Cümleyi kur' : label === 'Write a clear request: ' ? 'Açık bir rica yaz' : 'Almanca yaz'}: ${text(source.slice(label.length))}`;
  }
  let match = /^Read: “(.+)”\nWhat meaning does the element “(.+)” contribute\?$/.exec(source);
  if (match) return `Oku: “${match[1]}”\n“${match[2]}” öğesi hangi anlamı katıyor?`;
  match = /^In a German text, what does “(.+)” mean\?$/.exec(source);
  if (match) return `Almanca bir metinde “${match[1]}” ne anlama geliyor?`;
  return text(source);
};
const note = (exercise, source) => {
  for (const label of ['The detail you need is: ', 'Relevant answer: ']) {
    const index = source.lastIndexOf(`\n${label}`);
    if (index >= 0) return `${source.slice(0, index)}\nİstenen ayrıntı: ${exercise.prompt.includes('German') ? exercise.answer : text(exercise.answer)}.`;
  }
  let index = source.lastIndexOf('\nModel: ');
  if (index >= 0) return `${text(source.slice(0, index))}\nÖrnek yanıt: ${source.slice(index + '\nModel: '.length)}`;
  if (source.startsWith('Use what you learned in a new situation. Model: ')) return `Öğrendiklerini yeni bir durumda kullan. Örnek yanıt: ${source.slice('Use what you learned in a new situation. Model: '.length)}`;
  if (exercise.unitId.includes('-reference-forms-')) {
    const ending = ` ${exercise.answer}.`;
    if (!source.endsWith(ending)) throw new Error(`Unknown reference explanation: ${exercise.id}`);
    const head = source.slice(0, -ending.length);
    const parts = /^(.*?) is (a grammatical form or stem|an abbreviation|a word-building element|a variant or expression) related to (.+)\.$/.exec(head);
    if (!parts) throw new Error(`Unknown reference explanation: ${exercise.id}`);
    const kinds = { 'a grammatical form or stem': 'bir dilbilgisel biçim veya köktür', 'an abbreviation': 'bir kısaltmadır', 'a word-building element': 'bir sözcük türetme öğesidir', 'a variant or expression': 'bir varyant veya ifadedir' };
    return `${parts[1]}, ${parts[3]} ile bağlantılı ${kinds[parts[2]]}. Anlamı: ${text(exercise.answer)}.`;
  }
  return text(source);
};

for (const exercise of courseExercises.filter(exercise => !exercise.targetWordId)) {
  const source = Object.fromEntries(['prompt', 'hint', 'explanation', 'english'].map(field => [field, exercise[field]]));
  const translatedPrompt = prompt(exercise.prompt);
  const tr = { prompt: translatedPrompt, hint: note(exercise, exercise.hint), explanation: note(exercise, exercise.explanation), english: translatedPrompt };
  if (exercise.unitId.includes('-reference-forms-')) tr.english = text(exercise.answer);
  else if (/^(Write: |Build: |Write a clear request: )/.test(exercise.prompt)) tr.english = text(exercise.prompt.replace(/^(Write: |Build: |Write a clear request: )/, ''));
  const supportOptions = exercise.unitId.includes('-reference-forms-') || ['reading', 'listening'].includes(exercise.kind) && !exercise.prompt.includes('German');
  const options = exercise.options && Object.fromEntries(exercise.options.map(option => [option, supportOptions ? text(option) : option]));
  course.exercises[exercise.id] = { german: exercise.german, source, tr, ...(options ? { options } : {}) };
}

course.texts = {};
for (const unit of courseUnits) {
  const lexicalTitle = /^(.*?) · (\d+)$/.exec(unit.title);
  const checkpointTitle = /^(A1|A2|B1) checkpoint · (.+)$/.exec(unit.title);
  course.texts[unit.title] = checkpointTitle ? `${checkpointTitle[1]} seviye kontrolü · ${text(checkpointTitle[2])}` : lexicalTitle ? `${text(lexicalTitle[1])} · ${lexicalTitle[2]}` : text(unit.title);
  const lexicalSummary = /^(\d+) useful headwords\. Notice their meanings and forms, hear them, then retrieve the German yourself\. Complete this route in short batches\.$/.exec(unit.summary);
  course.texts[unit.summary] = lexicalSummary ? `${lexicalSummary[1]} yararlı temel kelime. Anlamlarını ve biçimlerini incele, dinle, ardından Almancalarını kendin hatırla. Bu rotayı kısa bölümler hâlinde tamamla.` : text(unit.summary);
}

if (missing.size) {
  const requests = [...missing];
  console.log(requests.map((source, index) => `${index}\t${source}`).join('\n'));
  console.error(`${missing.size} course support strings need authored Turkish.`);
  process.exitCode = 1;
} else {
  writeFileSync(coursePath, JSON.stringify(course, null, 1) + '\n');
  console.log(`Turkish: ${Object.keys(course.lexicon).length} meanings; ${Object.keys(course.exercises).length} authored exercises; ${Object.keys(course.texts).length} route strings.`);
}
