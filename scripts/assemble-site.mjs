import { cp, mkdir, readdir, readFile, rename, stat } from 'node:fs/promises';

// Keep game assets at their existing absolute URLs: saved sessions, audio,
// admin tools and world editing all share the same origin and asset catalogue.
await stat('site/dist/index.html');
await mkdir('web/dist/game', { recursive: true });
await rename('web/dist/index.html', 'web/dist/game/index.html');
for (const entry of await readdir('site/dist')) {
  // The favicon is intentionally shared. Fail rather than overwrite any other
  // game output if the site's output paths accidentally collide in the future.
  if (entry === 'favicon.svg') {
    const [site, game] = await Promise.all([readFile(`site/dist/${entry}`), readFile(`web/dist/${entry}`)]);
    if (!site.equals(game)) throw new Error('Site and game favicons must match.');
    continue;
  }
  await cp(`site/dist/${entry}`, `web/dist/${entry}`, { recursive: true, force: false, errorOnExist: true });
}
console.log('Assembled Astro at / and the game at /game/.');
