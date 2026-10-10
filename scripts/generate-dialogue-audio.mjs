// Per-character offline de-DE voice sketches, with stable graph clip IDs.
// These are installed macOS voices, not a neural/human VO claim.
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { cast, jobs } from './dialogue-audio-content.mjs';
const output = resolve('web/public/audio/dialogue');
const seen = new Set();
for (const job of jobs) { if (seen.has(job.clipId)) throw new Error(`Duplicate clip ${job.clipId}`); seen.add(job.clipId); if (!cast[job.speaker]) throw new Error(`No voice for ${job.speaker}`); }
function run(cmd, args) { return new Promise((yes, no) => { const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let errors = ''; child.stderr.on('data', chunk => errors += chunk); child.on('error', no); child.on('close', code => code === 0 ? yes() : no(new Error(`${cmd}: ${errors}`))); }); }
await mkdir(output, { recursive: true });
const temp = await mkdtemp(resolve(tmpdir(), 'atlas-dialogue-'));
let previous = { clips: [] };
try { previous = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')); } catch {}
const existing = new Map(previous.clips.map(clip => [clip.id, clip]));
let cursor = 0, count = 0;
const clips = [];
try {
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++], voice = cast[job.speaker], path = resolve(output, `${job.clipId}.mp3`);
      const old = existing.get(job.clipId); let ready = false;
      if (old?.text === job.german && old.voice === voice) { try { await access(path); ready = true; } catch {} }
      if (!ready) {
        const aiff = resolve(temp, `${job.clipId}.aiff`);
        await run('/usr/bin/say', ['-v', voice, '-r', '145', '-o', aiff, job.german]);
        await run('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-codec:a', 'libmp3lame', '-b:a', '48k', path]);
      }
      clips.push({ id: job.clipId, text: job.german, speaker: job.speaker, voice });
      count++; if (count % 25 === 0) process.stdout.write(`${count}/${jobs.length} dialogue clips\n`);
    }
  }));
  clips.sort((a,b) => a.id.localeCompare(b.id));
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ provider: 'Installed macOS de-DE voices', productionStatus: 'Distinct character voice sketches; neural and human VO remain a production milestone.', cast, rate: 145, bitRate: 48000, dynamicNames: 'German browser synthesis when available; otherwise play the recorded name-free version while displaying the chosen name.', clips }, null, 2) + '\n');
} finally { await rm(temp, { recursive: true, force: true }); }
