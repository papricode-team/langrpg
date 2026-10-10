import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, crossfadeLoopStart, encodeMonoPcmWav, synthesizeAmbience, worldAudioRate } from './world-audio-synthesis.mjs';

test('fractional fade lengths use integer sample indices', () => {
  const samples = Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...crossfadeLoopStart(samples, 2.5)], [7, 5, 3, 4, 5, 6, 7, 8]);
});

test('every deterministic 22050 Hz ambience bed encodes audible finite PCM', () => {
  const build = () => {
    const random = createRandom();
    return ['lindenhafen', 'waldruh', 'nebelstadt'].map(town => {
      const samples = synthesizeAmbience(town, random);
      assert.equal(samples.length, worldAudioRate * 24);
      assert.ok(samples.every(Number.isFinite), `${town}: non-finite samples`);
      const wav = encodeMonoPcmWav(samples);
      let peak = 0, energy = 0;
      for (let i = 44; i < wav.length; i += 2) {
        const value = wav.readInt16LE(i);
        peak = Math.max(peak, Math.abs(value));
        energy += value ** 2;
      }
      assert.equal(peak, 23000, `${town}: expected normalized waveform`);
      assert.ok(Math.sqrt(energy / samples.length) > 1000, `${town}: silent or inaudible PCM`);
      return wav;
    });
  };
  assert.deepEqual(build(), build(), 'same seeds must yield identical source audio');
});

test('encoding refuses invalid synthesis instead of writing a silent asset', () => {
  assert.throws(() => encodeMonoPcmWav(Float32Array.from([0, NaN, .2])), /Non-finite audio sample at 1/);
  assert.throws(() => encodeMonoPcmWav(Float32Array.from([Infinity])), /Non-finite audio sample at 0/);
});
