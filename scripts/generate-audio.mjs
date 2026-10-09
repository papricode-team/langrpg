#!/usr/bin/env node
// Audio provenance: locally synthesized macOS Anna (de_DE), 145 words/minute.
// Requires Node 24+, macOS with the Anna voice installed, and ffmpeg/libmp3lame.
// Run from any directory: node scripts/generate-audio.mjs
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'web/public/audio');
const voice = 'Anna';
const rate = 145;
const concurrency = Math.max(1, Math.min(8, Number(process.env.AUDIO_WORKERS) || 3));
const activeChildren = new Set();
let cancelled = false;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeChildren.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout = (stdout + data.toString()).slice(-12000); });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
    child.on('error', error => {
      activeChildren.delete(child);
      reject(new Error(`Cannot run ${command}: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      activeChildren.delete(child);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(command)} failed (${signal || code}): ${stderr.trim() || 'no diagnostic output'}`));
    });
  });
}

async function executable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.includes('/')) return candidate;
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try the next installation. */ }
  }
  return undefined;
}

function interrupt() {
  cancelled = true;
  for (const child of activeChildren) child.kill('SIGTERM');
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node 24 or newer; this script imports TypeScript curriculum files using native type stripping.');
  if (process.platform !== 'darwin') throw new Error('Audio regeneration requires macOS /usr/bin/say with the German Anna voice. The generated MP3 files themselves work on all deployment platforms.');
  const say = await executable([process.env.SAY_PATH, '/usr/bin/say']);
  if (!say) throw new Error('macOS say was not found. Set SAY_PATH to its executable.');
  const ffmpeg = await executable([process.env.FFMPEG_PATH, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']);
  try { await run(ffmpeg, ['-version']); } catch (error) {
    throw new Error(`ffmpeg is required (for example: brew install ffmpeg), or set FFMPEG_PATH. ${error.message}`);
  }
  const voices = await run(say, ['-v', '?']);
  if (!/^Anna\s+de_DE\b/m.test(voices)) throw new Error('The German Anna voice is missing. Install Anna in macOS System Settings → Accessibility → Read & Speak → System voice before regenerating audio.');

  const { quests, npcs } = await import(new URL('../web/src/content.ts', import.meta.url).href);
  const jobs = [
    ...quests.flatMap(quest => quest.exercises.map(exercise => ({ id: exercise.id, text: exercise.german }))),
    ...npcs.map(npc => ({ id: `npc-${npc.id}`, text: npc.greeting })),
  ];
  const knownTexts = new Set(jobs.map(job => job.text));
  function addJob(job) {
    if (!knownTexts.has(job.text)) { knownTexts.add(job.text); jobs.push(job); }
  }
  if (process.argv.includes('--lexicon')) {
    const lexicon = JSON.parse(await readFile(path.join(root, 'web/src/data/course-lexicon.json'), 'utf8'));
    for (const word of lexicon) addJob({ id: `word-${word.id}`, text: word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma });
  }
  if (process.argv.includes('--course')) {
    const course = JSON.parse(await readFile(path.join(root, 'web/src/data/course.json'), 'utf8'));
    for (const word of course.lexicon) addJob({ id: `word-${word.id}`, text: word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma });
    for (const exercise of course.exercises) addJob({ id: exercise.id, text: exercise.german });
    for (const guide of course.grammar) guide.examples.forEach((example, index) => addJob({ id: `guide-${guide.id}-${index + 1}`, text: example.german }));
  }
  if (process.argv.includes('--activities')) {
    const { activityAudioJobs } = await import(new URL('../web/src/activity-engine.ts', import.meta.url).href);
    for (const job of activityAudioJobs) addJob(job);
  }
  let previous;
  try { previous = JSON.parse(await readFile(path.join(outputDirectory, 'manifest.json'), 'utf8')); } catch { /* A first run creates the manifest. */ }
  const previousTexts = new Map((previous?.clips ?? []).map(job => [job.id, job.text]));
  const ids = new Set();
  for (const job of jobs) {
    if (!/^[a-z0-9_-]+$/i.test(job.id)) throw new Error(`Unsafe audio asset ID: ${job.id}`);
    if (!job.text?.trim()) throw new Error(`No German phrase for ${job.id}`);
    if (ids.has(job.id)) throw new Error(`Duplicate audio asset ID: ${job.id}`);
    ids.add(job.id);
  }
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'lernen-german-audio-'));
  let cursor = 0;
  let completed = 0;
  let totalBytes = 0;
  let failure;
  const started = Date.now();
  console.log(`Generating ${jobs.length} German pronunciation clips with ${voice} at ${rate} words/minute (${concurrency} workers).`);
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    async function worker() {
      while (!failure && !cancelled && cursor < jobs.length) {
        const job = jobs[cursor++];
        const aiff = path.join(temporaryDirectory, `${job.id}.aiff`);
        const mp3 = path.join(temporaryDirectory, `${job.id}.mp3`);
        const destination = path.join(outputDirectory, `${job.id}.mp3`);
        const staged = `${destination}.tmp`;
        try {
          if (previousTexts.get(job.id) === job.text && (previous?.voices ?? []).includes(voice)) {
            const info = await stat(destination).catch(() => undefined);
            if (info && info.size >= 500) { totalBytes += info.size; completed++; continue; }
          }
          await run(say, ['-v', voice, '-r', String(rate), '-o', aiff, job.text]);
          if (cancelled) throw new Error('Audio generation interrupted.');
          await run(ffmpeg, [
            '-hide_banner', '-loglevel', 'error', '-y', '-i', aiff,
            '-vn', '-ac', '1', '-ar', '24000', '-codec:a', 'libmp3lame', '-b:a', '64k',
            '-id3v2_version', '3', '-metadata', `title=${job.id}`,
            '-metadata', 'comment=German synthetic pronunciation: macOS Anna (de_DE), 145 words/minute.',
            mp3,
          ]);
          const info = await stat(mp3);
          if (info.size < 500) throw new Error(`Generated clip is unexpectedly empty: ${job.id}`);
          // Replace each asset atomically; interrupted runs preserve previous clips.
          await copyFile(mp3, staged);
          await rename(staged, destination);
          totalBytes += info.size;
          completed++;
          if (completed % 20 === 0 || completed === jobs.length) console.log(`${completed}/${jobs.length} clips written.`);
        } catch (error) {
          failure ||= new Error(`${job.id}: ${error.message}`);
        } finally {
          await Promise.all([rm(aiff, { force: true }), rm(mp3, { force: true }), rm(staged, { force: true })]);
        }
      }
    }
    // All workers settle before cleanup, including after a conversion failure.
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (failure) throw failure;
    if (cancelled) throw new Error('Audio generation interrupted.');
    await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify({
      languagePair: 'de-en', sourceLanguage: 'en', targetLanguage: 'de', voices: [voice],
      rate, generatedAt: new Date().toISOString(),
      clips: jobs.map(job => ({ ...job, path: `/audio/${job.id}.mp3` })),
    }, null, 2) + '\n');
    console.log(`Saved ${completed} clips (${(totalBytes / 1024 / 1024).toFixed(2)} MiB) to ${path.relative(root, outputDirectory)} in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`Audio generation failed: ${error.message}`);
  process.exitCode = 1;
});
