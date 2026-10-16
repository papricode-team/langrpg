// Reproducible active exporters, in dependency order. Historical experimental
// player editors are deliberately excluded: they overwrite approved walking art.
import { spawnSync } from 'node:child_process';
const content = [
  ['build-story-curriculum.mjs'],
  ['build-course.mjs'],
  ['build-syllabus.mjs'],
  ['export-world-content.mjs'],
  ['expedition-learning.mjs'],
  ['author-minigame-stories.mjs'],
  ['audit-dialogue-levels.mjs'],
  ['audit-pacing.mjs'],
];
const paint = [
  ['prepare-resident-action-art.mjs'],
  ['prepare-core-ground-masks.mjs'], ['prepare-terrain-detail.mjs'],
  ['prepare-world-art.mjs'], ['prepare-world-variations.mjs'],
  ['prepare-world-animations.mjs', '--set', 'day'], ['prepare-world-animations.mjs', '--set', 'night'],
  ['prepare-interior-art.mjs'], ['prepare-interior-stills.mjs'], ['prepare-interior-effects.mjs'],
  ['prepare-story-cast.mjs'], ['prepare-static-buildings.mjs'],
  ['prepare-map-quality-art.mjs'],
  ['prepare-nebelstadt-harbour-terrain.mjs'], ['prepare-nebelstadt-harbour-bridge.mjs'], ['prepare-terrain-overviews.mjs'],
];
const jobs = process.argv.includes('--art') ? [...content,...paint,['export-world-content.mjs'],['prepare-scenery-previews.mjs']] : [...content];
if (process.argv.includes('--audio')) jobs.push(['generate-world-audio.mjs'],['generate-dialogue-audio.mjs']);
for (const [name,...args] of jobs) {
  console.log(`Assets: ${name}`);
  const result = spawnSync(process.execPath, [`scripts/${name}`,...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
