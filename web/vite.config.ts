/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { compactTranslationsPlugin } from '../scripts/compact-translations.mjs';
import { uiLayoutPlugin } from '../scripts/ui-layout.mjs';
import { contentRuntimePlugin } from '../scripts/content-runtime-plugin.mjs';
import { assetQualityPlugin } from '../scripts/asset-quality.mjs';

export default defineConfig(({ command, mode }) => {
  const version = command === 'build' ? crypto.randomUUID() : 'development';
  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [...(mode === 'test' ? [] : [contentRuntimePlugin(fileURLToPath(new URL('..', import.meta.url))), assetQualityPlugin(fileURLToPath(new URL('..', import.meta.url)))]), uiLayoutPlugin(), compactTranslationsPlugin(fileURLToPath(new URL('..', import.meta.url)), ['character-kit', 'character-cast', 'player-portraits'].map(name => `web/src/data/${name}.json`)), {
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
    // Content and map tests parse multi-megabyte JSON; 5 s fails on shared CI runners.
    test: { testTimeout: 20000 },
    build: {
      target: 'es2022', chunkSizeWarningLimit: 1800,
      rolldownOptions: {
        input: {
          game: fileURLToPath(new URL('./index.html', import.meta.url)),
          admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
          resetPassword: fileURLToPath(new URL('./reset-password.html', import.meta.url)),
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
