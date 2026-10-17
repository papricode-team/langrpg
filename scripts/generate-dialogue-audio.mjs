// Character-voiced German audio with local Qwen3-TTS (design once, then clone; see scripts/tts/README.md).
// Voices every dialogue, cinematic, evidence and greeting clip in its speaker's voice, and every story
// exercise and NPC greeting in the voice of the quest's resident. Unchanged clips are skipped.
// Usage: node scripts/generate-dialogue-audio.mjs [--only <clip regex>] [--dry-run]
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { resolve } from 'node:path';
import { quests, npcs } from './content-source.mjs';
import { cast, jobs } from './dialogue-audio-content.mjs';
import {canVoiceDialogue} from '../web/src/dialogue.ts';

const root = resolve(import.meta.dirname, '..');
const python = process.env.LANTERN_TTS_PYTHON ?? resolve(homedir(), '.cache/lantern-tts/venv/bin/python');
const dialogueDir = resolve(root, 'web/public/audio/dialogue'), exerciseDir = resolve(root, 'web/public/audio');
const args = process.argv.slice(2), pass = [];
for (const flag of ['--only']) { const at = args.indexOf(flag); if (at >= 0) pass.push(flag, args[at + 1]); }
if (args.includes('--dry-run')) pass.push('--dry-run');
try { await access(python); } catch { throw new Error(`Qwen3-TTS environment not found at ${python}. Set it up as described in scripts/tts/README.md, or set LANTERN_TTS_PYTHON.`); }

const seen = new Set();
for (const job of jobs) {
  if (seen.has(job.clipId)) throw new Error(`Duplicate clip ${job.clipId}`);
  seen.add(job.clipId);
  if (!cast[job.speaker]) throw new Error(`No voice for ${job.speaker}`);
}
const exerciseJobs = [
  ...quests.flatMap(quest => quest.exercises.map(exercise => ({ clipId: exercise.id, speaker: quest.npcId, german: exercise.german }))),
  ...npcs.map(npc => ({ clipId: `npc-${npc.id}`, speaker: npc.id, german: npc.greeting })),
].filter(job=>canVoiceDialogue(job.german));
for (const job of exerciseJobs) if (!cast[job.speaker]) throw new Error(`No voice for ${job.speaker}`);

function run(command, commandArgs) {
  return new Promise((done, fail) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit' });
    child.on('error', fail);
    child.on('close', code => code === 0 ? done() : fail(new Error(`${command} exited with ${code}`)));
  });
}
const temp = await mkdtemp(resolve(tmpdir(), 'atlas-voices-'));
try {
  const synthesize = async (list, out, cacheName) => {
    const file = resolve(temp, `${cacheName}.json`);
    await writeFile(file, JSON.stringify(list.map(({ clipId, speaker, german, rate }) => ({ clipId, speaker: cast[speaker], german, rate }))));
    await run(python, [resolve(root, 'scripts/tts/qwen_tts.py'), '--jobs', file, '--out', out, '--cache', resolve(root, `scripts/tts/cache/${cacheName}.json`), ...pass]);
  };
  await synthesize(jobs, dialogueDir, 'dialogue');
  await synthesize(exerciseJobs, exerciseDir, 'exercises');
} finally { await rm(temp, { recursive: true, force: true }); }
if (args.includes('--dry-run') || args.includes('--only')) process.exit(0);

const voice = speaker => `qwen3:${cast[speaker]}`;
const clips = jobs.map(job => ({ id: job.clipId, text: job.german, speaker: job.speaker, voice: voice(job.speaker) })).sort((a, b) => a.id.localeCompare(b.id));
await writeFile(resolve(dialogueDir, 'manifest.json'), JSON.stringify({
  provider: 'Qwen3-TTS 1.7B (VoiceDesign + Base clone, 8-bit MLX) via mlx-audio, run locally',
  productionStatus: 'Synthetic character voices designed from text descriptions in scripts/tts/voices.json; human voice-over remains a production milestone.',
  cast, codec: 'opus', bitRate: 24000,
  dynamicNames: 'Lines containing runtime variables remain visible and silent, including personalized names.',
  clips,
}, null, 2) + '\n');
// Mark character-voiced exercise clips so the pronunciation generator (generate-audio.mjs) keeps them.
const manifestPath = resolve(exerciseDir, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const byId = new Map(manifest.clips.filter(clip => !clip.id.startsWith('a0-') || exerciseJobs.some(job => job.clipId === clip.id)).map(clip => [clip.id, clip]));
for (const job of exerciseJobs) byId.set(job.clipId, { id: job.clipId, text: job.german, path: `/audio/${job.clipId}.ogg`, voice: voice(job.speaker) });
manifest.clips = [...byId.values()];
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Voiced ${clips.length} dialogue clips and ${exerciseJobs.length} story exercise and greeting clips.`);
