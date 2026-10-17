import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedAnswersFor, expandAnswerPattern, isAnswerPattern, MAX_EXPANSIONS} from './answer-patterns.mjs';

test('alternatives and optional parts expand in order', () => {
  assert.deepEqual(expandAnswerPattern('Wann ist {das Fahrrad|es} fertig?'), ['Wann ist das Fahrrad fertig?', 'Wann ist es fertig?']);
  assert.deepEqual(expandAnswerPattern('Wann fährt der Zug[ ab]?'), ['Wann fährt der Zug?', 'Wann fährt der Zug ab?']);
});

test('nested syntax, tidy spacing and a capital first letter', () => {
  assert.deepEqual(expandAnswerPattern('[Ich möchte ]ein Ticket nach Berlin[, bitte].'),
    ['Ein Ticket nach Berlin.', 'Ein Ticket nach Berlin, bitte.', 'Ich möchte ein Ticket nach Berlin.', 'Ich möchte ein Ticket nach Berlin, bitte.']);
  assert.deepEqual(expandAnswerPattern('{Ich möchte [bitte ]|Ich hätte gern }einen Tee.'),
    ['Ich möchte einen Tee.', 'Ich möchte bitte einen Tee.', 'Ich hätte gern einen Tee.']);
  assert.deepEqual(expandAnswerPattern('{A|A}'), ['A']);
});

test('malformed patterns fail with their position', () => {
  for (const bad of ['{a|b', '[a', 'a}', 'a]', 'a|b', '', '{|}']) assert.throws(() => expandAnswerPattern(bad), /answer pattern/);
});

test('patterns cannot accept an unbounded number of answers', () => {
  assert.throws(() => expandAnswerPattern('[a][b][c][d][e][f][g]'), new RegExp(`more than ${MAX_EXPANSIONS}`));
  assert.equal(expandAnswerPattern('[a ][b ][c ][d ][e ][f ]x').length, 64);
});

test('accepted answers merge literal entries, entry patterns and answerPattern without the canonical answer', () => {
  assert.deepEqual(acceptedAnswersFor({id:'x', answer:'Ich zahle jetzt.', acceptedAnswers:['Ich zahle jetzt', 'Jetzt zahle ich.'], answerPattern:'Ich {zahle|bezahle} jetzt.'}),
    ['Ich zahle jetzt', 'Jetzt zahle ich.', 'Ich bezahle jetzt.']);
  assert.deepEqual(acceptedAnswersFor({id:'y', answer:'Ich möchte einen Tee.', acceptedAnswers:['{Ich möchte|Ich hätte gern} einen Tee, bitte.']}),
    ['Ich möchte einen Tee, bitte.', 'Ich hätte gern einen Tee, bitte.']);
  assert.deepEqual(acceptedAnswersFor({id:'z', answer:'Ja.'}), []);
  assert.equal(isAnswerPattern('Noch einmal, bitte.'), false);
});

test('the pattern must produce the canonical answer', () => {
  assert.throws(() => acceptedAnswersFor({id:'x', answer:'Das Fahrrad ist neu.', answerPattern:'{Es|Das Rad} ist neu.'}), /does not produce the answer/);
});

test('every accepted answer keeps the target word', () => {
  assert.deepEqual(acceptedAnswersFor({id:'x', answer:'Das Fahrrad ist neu.', answerPattern:'Das {Fahrrad|Rad} ist neu.'}, {forms:['neu']}), ['Das Rad ist neu.']);
  assert.throws(() => acceptedAnswersFor({id:'x', answer:'Das Fahrrad ist neu.', answerPattern:'{Das Fahrrad|Es} ist neu.'}, {forms:['Fahrrad']}), /drops the target word/);
});
