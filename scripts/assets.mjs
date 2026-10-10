// Reproducible active exporters, in dependency order. Historical experimental
// player editors are deliberately excluded: they overwrite approved walking art.
import { spawnSync } from 'node:child_process';
const content = [
  ['build-story-curriculum.mjs'],
  ['build-course.mjs'],
  ['map-editor.mjs', 'check'],
  ['export-world-content.mjs'],
  ['audit-dialogue-levels.mjs'],
];
const paint = ['prepare-world-art.mjs', 'prepare-world-variations.mjs', 'prepare-world-animations.mjs', 'prepare-interior-art.mjs', 'prepare-interior-stills.mjs', 'prepare-interior-effects.mjs', 'prepare-expedition-art.mjs', 'prepare-story-cast.mjs'];
const jobs = process.argv.includes('--art') ? [...content,...paint.map(name=>[name])] : [...content];
if (process.argv.includes('--audio')) jobs.push(['generate-world-audio.mjs'],['generate-dialogue-audio.mjs']);
for (const [name,...args] of jobs) {
  console.log(`Assets: ${name}`);
  const result = spawnSync(process.execPath, [`scripts/${name}`,...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
