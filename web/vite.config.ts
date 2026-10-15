import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { gameDistributionPlugin } from '../scripts/optimize-game-distribution.mjs';
import { sceneAuthoringPlugin } from '../scripts/scene-authoring-service.mjs';
import { compactTranslationsPlugin } from '../scripts/compact-translations.mjs';
import { uiLayoutPlugin } from '../scripts/ui-layout.mjs';
import { contentRuntimePlugin } from '../scripts/content-runtime-plugin.mjs';

export default defineConfig(({ command, mode }) => {
  const version = command === 'build' ? crypto.randomUUID() : 'development';
  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [...(mode === 'test' ? [] : [contentRuntimePlugin(fileURLToPath(new URL('..', import.meta.url)))]), uiLayoutPlugin(), sceneAuthoringPlugin(fileURLToPath(new URL('..', import.meta.url))), gameDistributionPlugin(fileURLToPath(new URL('..', import.meta.url))), compactTranslationsPlugin(fileURLToPath(new URL('..', import.meta.url)), ['character-kit', 'character-cast', 'player-portraits'].map(name => `web/src/data/${name}.json`)), {
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
          admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
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
