/** Pure sample generation and encoding, shared by the exporter and its tests. */
export const worldAudioRate = 22050;

export function createRandom(seed = 8317) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function crossfadeLoopStart(samples, fadeLength) {
  // Sample indices must be integers: 22050 / 4 is 5512.5, which otherwise
  // reads undefined from the tail and poisons normalization with NaN.
  const count = Math.floor(fadeLength);
  if (!Number.isInteger(count) || count < 1 || count > samples.length) throw new Error('Invalid loop crossfade length');
  for (let i = 0; i < count; i++) {
    const mix = i / count;
    samples[i] = samples[i] * mix + samples[samples.length - count + i] * (1 - mix);
  }
  return samples;
}

export function synthesizeAmbience(town, random, rate = worldAudioRate) {
  const samples = new Float32Array(rate * 24);
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    low = low * .98 + (random() * 2 - 1) * .02;
    const t = i / rate;
    samples[i] = low * (.25 + Math.sin(t * Math.PI / 12) ** 2 * .4)
      + (town === 'lindenhafen' ? Math.sin(t * 1700) * Math.sin(t * 2 * Math.PI / 3) ** 24 * .009 : 0);
  }
  return crossfadeLoopStart(samples, rate / 4);
}

export function encodeMonoPcmWav(samples, rate = worldAudioRate) {
  let peak = .01;
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw new Error(`Non-finite audio sample at ${i}`);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] / peak * 23000), 44 + i * 2);
  return wav;
}
