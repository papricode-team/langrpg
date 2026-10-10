// Original deterministic compositions and synthesized foley. No samples or
// third-party music. Rebuild with Node and ffmpeg; see audio/world/provenance.json.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRandom, encodeMonoPcmWav, synthesizeAmbience, worldAudioRate } from './world-audio-synthesis.mjs';
const dir = fileURLToPath(new URL('../web/public/audio/world/', import.meta.url));
mkdirSync(dir, { recursive: true });
const rate = worldAudioRate;
const random = createRandom();
const ambienceOnly = process.argv.includes('--ambience-only');
function exportSound(name, samples) {
  const wav = encodeMonoPcmWav(samples, rate);
  const source = `${dir}${name}.wav`; writeFileSync(source, wav);
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-c:a', 'libopus', '-b:a', '64k', `${dir}${name}.ogg`]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  unlinkSync(source);
}
function tone(samples, onset, duration, midi, strength, reed = false) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  for (let i = 0, n = Math.floor(duration * rate); i < n; i++) {
    const t = i / rate, pos = (Math.round(onset * rate) + i) % samples.length;
    const envelope = Math.min(1, t * 40) * Math.exp(-t * (reed ? 1.5 : 2.8)) * Math.min(1, (duration - t) * 8);
    samples[pos] += strength * envelope * (Math.sin(t * f * 2 * Math.PI) + .22 * Math.sin(t * f * 4 * Math.PI) + .06 * Math.sin(t * f * 6 * Math.PI));
  }
}
const motifs = {
  lindenhafen: { root: 60, notes: [7, 12, 9, 7, 4, 7, 2, 4, 7, 9, 12, 14, 12, 9, 7, 4], chords: [0, 5, 9, 7] },
  waldruh: { root: 57, notes: [0, 7, 10, 12, 10, 7, 5, 3, 2, 5, 7, 10, 7, 5, 3, 0], chords: [0, 5, 3, 7] },
  nebelstadt: { root: 55, notes: [7, 10, 12, 14, 12, 10, 7, 5, 3, 7, 10, 12, 10, 7, 5, 2], chords: [0, 3, 5, 7] },
};
for (const [town, motif] of Object.entries(motifs)) {
  const music = new Float32Array(rate * 48);
  for (let i = 0; i < 64; i++) {
    const onset = i * .75, chord = motif.chords[Math.floor(i / 16)];
    tone(music, onset, 2.8, motif.root - 12 + chord + [0, 7, 12, 7][i % 4], .18);
    if (i % 2 === 0) tone(music, onset, 2.1, motif.root + motif.notes[Math.floor(i / 2) % 16], .12, town === 'nebelstadt');
  }
  if (!ambienceOnly) exportSound(`music-${town}`, music);
  const nightMusic=new Float32Array(rate*48);
  for(let i=0;i<64;i++){
    const onset=i*.75,chord=motif.chords[Math.floor(i/16)];
    if(i%2===0)tone(nightMusic,onset,4.4,motif.root-12+chord+[0,7,12,7][i%4],.14,true);
    if(i%4===0)tone(nightMusic,onset,3.8,motif.root+motif.notes[Math.floor(i/2)%16],.10,true);
  }
  if (!ambienceOnly) exportSound(`music-${town}-night`,nightMusic);
  exportSound(`ambience-${town}`, synthesizeAmbience(town, random, rate));
}
if (!ambienceOnly) {
for (const kind of ['stone', 'wood']) {
  const sound = new Float32Array(Math.round(rate * .18));
  for (let i = 0; i < sound.length; i++) { const t = i / rate; sound[i] = Math.exp(-t * 35) * ((random() * 2 - 1) * .25 + Math.sin(t * (kind === 'wood' ? 150 : 85) * Math.PI * 2) * .25); }
  exportSound(`step-${kind}`, sound);
}
const bell = new Float32Array(rate * 5);
for (let i = 0; i < bell.length; i++) { const t = i / rate; bell[i] = [261.63, 522.4, 785.3, 1049.8].reduce((sum, f, n) => sum + Math.sin(t * f * Math.PI * 2) * Math.exp(-t * (.7 + n * .3)) / (n + 1), 0) * Math.min(t * 100, 1); }
exportSound('bell', bell);
const door = new Float32Array(Math.round(rate * .5));
for (let i = 0; i < door.length; i++) { const t = i / rate; door[i] = Math.sin(t * (100 - t * 80) * Math.PI * 2) * Math.exp(-t * 9) * .3 + (random() * 2 - 1) * Math.exp(-Math.abs(t - .28) * 60) * .15; }
exportSound('door', door);
}
writeFileSync(`${dir}provenance.json`, JSON.stringify({ author: 'The Lantern Atlas project', source: 'scripts/generate-world-audio.mjs', license: 'Original project compositions and synthesized audio; no external samples', sampleRate: rate, seeds: [8317], tracks: Object.keys(motifs), arrangements:['day','night'], ambienceLoopCrossfadeSamples: Math.floor(rate / 4), encoding: 'Ogg Opus 64 kbps', note: 'Generated instrumental sketches; human composition and recorded foley remain a production milestone.' }, null, 2) + '\n');
