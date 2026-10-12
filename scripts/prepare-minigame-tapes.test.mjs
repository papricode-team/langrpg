import test from 'node:test';
import assert from 'node:assert/strict';
import { composeTapeSamples, synthesizeTapeCough, tapeExerciseIds } from './prepare-minigame-tapes.mjs';
import { worldAudioRate } from './world-audio-synthesis.mjs';

test('the repeated cough cue is deterministic, audible and finite', () => {
  const cough = synthesizeTapeCough();
  assert.deepEqual(cough, synthesizeTapeCough());
  assert.ok(cough.every(Number.isFinite));
  assert.ok(cough.some(sample => Math.abs(sample) > .15));
  assert.equal(cough.length, Math.round(worldAudioRate * .38));
});

test('tapes preserve decoded speech between actual identical cough cues', () => {
  const voice = Float32Array.from([.2, -.3, .4, -.1]), cough = synthesizeTapeCough();
  const tape = composeTapeSamples(voice), gap = Math.round(worldAudioRate * .3);
  const speechStart = cough.length + gap, secondCough = speechStart + voice.length + gap;
  assert.deepEqual(tape.samples.slice(0, cough.length), cough);
  assert.deepEqual(tape.samples.slice(speechStart, speechStart + voice.length), voice);
  assert.deepEqual(tape.samples.slice(secondCough, secondCough + cough.length), cough);
  assert.deepEqual(tape.coughPositionsMs, [0, Math.round(secondCough * 1000 / worldAudioRate)]);
  assert.equal(tapeExerciseIds.length, 3);
  assert.throws(() => composeTapeSamples(new Float32Array()), /non-empty/);
  assert.throws(() => composeTapeSamples(Float32Array.from([NaN])), /finite/);
});
