import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { gameDistributionPlugin } from '../scripts/optimize-game-distribution.mjs';
import { compactTranslationsPlugin } from '../scripts/compact-translations.mjs';
import { uiLayoutPlugin } from '../scripts/ui-layout.mjs';
import { contentIdentifiersPlugin } from '../scripts/content-identifiers.mjs';

export default defineConfig(({ command }) => {
  const version = command === 'build' ? crypto.randomUUID() : 'development';
  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    test: { setupFiles: ['./src/test-support/content-fixtures.ts'] },
    plugins: [contentIdentifiersPlugin(fileURLToPath(new URL('..', import.meta.url))), uiLayoutPlugin(), gameDistributionPlugin(fileURLToPath(new URL('..', import.meta.url))), compactTranslationsPlugin(fileURLToPath(new URL('..', import.meta.url)), ['character-kit', 'character-cast', 'player-portraits'].map(name => `web/src/data/${name}.json`)), {
      name: 'app-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
      },
    }],
    server: {
      port: 5187,
      strictPort: true,
      watch: { ignored: ['**/public/audio/**'] },
      proxy: {
        '/api': { target: process.env.ATLAS_API_ORIGIN || 'http://127.0.0.1:8097', ws: true },
      },
    },
    build: {
      target: 'es2022', chunkSizeWarningLimit: 1800,
      rolldownOptions: {
        input: {
          game: fileURLToPath(new URL('./index.html', import.meta.url)),
          editor: fileURLToPath(new URL('./editor.html', import.meta.url)),
        },
        output: {
          codeSplitting: {
            groups: ['meta', 'exercises-a1', 'exercises-a2', 'exercises-b1'].map(part => ({
              name: `course-${part}`,
              test: new RegExp(`[\\\\/]data[\\\\/]course-${part}\\.json$`),
            })),
          },
        },
      },
    },
  };
});
