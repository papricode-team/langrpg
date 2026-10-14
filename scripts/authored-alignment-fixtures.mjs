/** Reviewed regression examples. Pair arrays are authored, never inferred. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tokenized } from './content-tokenizer.mjs';
import { alignmentHash, validateAlignment } from './content-alignment.mjs';

const definitions = [
  ['marta', 'Hallo, Ada! Möchtest du einen Kaffee?', 'Hello, Ada! Would you like a coffee?', [[0,0],[1,1],[2,2],[2,4],[3,3],[4,5],[5,6]]],
  ['otto', 'Guten Morgen, Ada! Willkommen in Lindenhafen.', 'Good morning, Ada! Welcome to Lindenhafen.', [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5]]],
  ['clauses', 'Dein Zug ist da. Die Tauben schlafen noch.', 'Your train is here. The pigeons are still sleeping.', [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5],[6,8],[7,7]]],
  ['help-question', 'Kann ich helfen?', 'Can I help?', [[0,0],[1,1],[2,2]]],
  ['help-infinitive', 'Ich will helfen.', 'I want to help.', [[0,0],[1,1],[2,2],[2,3]]],
  ['help-inflection', 'Er hilft.', 'He helps.', [[0,0],[1,1]]],
  ['invitation', 'Hallo, möchtest du einen Kaffee?', 'Hello, would you like a coffee?', [[0,0],[1,1],[1,3],[2,2],[3,4],[4,5]]],
  ['formal-invitation', 'Möchten Sie Kaffee?', 'Would you like coffee?', [[0,0],[0,2],[1,1],[2,3]]],
  ['article-boundary', 'Ein Name.', 'Anna is at a_name cash.', [], {0:'Unrelated translation: no valid article equivalent.',1:'Unrelated translation: no name equivalent.'}],
  ['verb-boundary', 'Ich helfe.', 'I am helpful.', [[0,0]], {1:'Helpful is an adjective, not a translation of helfe.'}],
  ['she', 'Sie sagt: Du kannst lesen.', 'She says: You can read.', [[0,0],[1,1],[2,2],[3,3],[4,4]]],
  ['formal-you', 'Helfen Sie mir.', 'Please help me, will you?', [[0,1],[1,4],[2,2]]],
  ['they', 'Hier helfen sie.', 'Here they help you.', [[0,0],[1,2],[2,1]]],
  ['ambiguous-sie', 'Sie sind hier.', 'They are here with you.', [[1,1],[2,2]], {0:'Regression policy: ambiguous Sie has no authored sense.'}],
  ['ambiguous-bank', 'Die Bank ist dort.', 'The bank is beside the bench.', [[0,0],[2,2]], {1:'Regression policy: bank and bench occur together; no authored sense.',3:'The translation has no equivalent for dort.'}],
  ['demonstrative', 'Das ist gut.', 'That is good.', [[1,1],[2,2]], {0:'Regression policy: an article gloss must not imply a demonstrative sense.'}],
  ['emoji', 'Hallo, 🌙 <Ada & Bo>! Möchtest du einen Kaffee?', 'Hello, 🌙 <Ada & Bo>! Would you like a coffee?', [[0,0],[1,1],[2,2],[3,3],[3,5],[4,4],[5,6],[6,7]]],
  ['literal-code', 'Hier steht Code.', 'Use C++ (not CCC).', [[2,1]], {0:'Unrelated sentence: no equivalent for hier.',1:'Unrelated sentence: no equivalent for steht.'}],
  ['cloud', 'Die Wolke.', 'A cloud.', [[0,0],[1,1]]],
  ['screen-ticket', 'Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.', 'Your ticket, please. My files must be checked too.', [[0,0],[1,1],[2,2],[3,8],[4,3],[5,4],[6,5],[7,7],[8,6]], undefined, 'Biletiniz, lütfen. Benim dosyalarımın da denetlenmesi gerekiyor.', [[0,0],[1,0],[2,1],[3,4],[4,2],[5,3],[6,5],[7,5],[8,6]]],
  ['screen-records', 'Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.', 'Your ticket, please. My records must be checked too.', [[0,0],[1,1],[2,2],[3,8],[4,3],[5,4],[6,5],[7,7],[8,6]], undefined, 'Biletiniz, lütfen. Benim dosyalarımın da denetlenmesi gerekiyor.', [[0,0],[1,0],[2,1],[3,4],[4,2],[5,3],[6,5],[7,5],[8,6]]],
  ['ticket', 'Ihre Fahrkarte, bitte.', 'Your ticket, please.', [[0,0],[1,1],[2,2]], undefined, 'Biletiniz, lütfen.', [[0,0],[1,0],[2,1]]],
  ['otto-ticket', 'Deine Fahrkarte, bitte.', 'Your ticket, please.', [[0,0],[1,1],[2,2]], undefined, 'Biletin, lütfen.', [[0,0],[1,0],[2,1]]],
  ['npc-invitation', 'Möchtest du einen Kaffee?', 'Would you like a coffee?', [[0,0],[0,2],[1,1],[2,3],[3,4]], undefined, 'Bir kahve ister misin?', [[0,2],[0,3],[1,3],[2,0],[3,1]]],
  ['otto-welcome', 'Guten Morgen! Willkommen in Lindenhafen.', 'Good morning! Welcome to Lindenhafen.', [[0,0],[1,1],[2,2],[3,3],[4,4]], undefined, "Günaydın! Lindenhafen'e hoş geldin.", [[0,0],[1,0],[2,2],[2,3],[4,1]], {3:'Turkish expresses location in the suffix of Lindenhafen’e.'}],
];

export async function writeAuthoredFixtures(root) {
  const path = resolve(root, 'content/alignments/fixtures.json');
  let previous = [];
  try { previous = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const fixtures = definitions.map(([fixture, german, english, align, untranslated, turkish, trAlign, trUntranslated]) => {
    const support = { en: {...tokenized(english), align, ...(untranslated ? {untranslated} : {})} };
    if (turkish) support.tr = {...tokenized(turkish), align:trAlign, ...(trUntranslated ? {untranslated:trUntranslated} : {})};
    const line = { id: previous.find(value => value.fixture === fixture)?.id ?? randomUUID(), fixture, de:tokenized(german), support, alignmentStatus:'reviewed' };
    const failures = validateAlignment(line);
    if (failures.length) throw new Error(`${fixture}: ${failures.join('\n')}`);
    return line;
  });
  let current={entries:{}};
  try {current=JSON.parse(await readFile(resolve(root,'content/alignments/reviewed.json'),'utf8'));} catch(error){if(error.code!=='ENOENT')throw error;}
  const cache = {version:1, entries:{...current.entries,...Object.fromEntries(fixtures.map(line => [alignmentHash(line), {status:'reviewed', source:`fixture:${line.fixture}`, support:line.support}]))}};
  await writeFile(path, JSON.stringify(fixtures, null, 2) + '\n');
  await writeFile(resolve(root, 'content/alignments/reviewed.json'), JSON.stringify(cache, null, 2) + '\n');
  return fixtures;
}

if (process.argv[1]?.endsWith('/authored-alignment-fixtures.mjs')) await writeAuthoredFixtures(resolve(import.meta.dirname, '..'));
