import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5187,
    strictPort: true,
    watch: { ignored: ['**/public/audio/**'] },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8097', ws: true },
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
});
