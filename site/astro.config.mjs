import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://glotworld.com',
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'always' },
  integrations: [sitemap({ filter: page => !/\/404(?:\.html|\/)$/.test(page) })],
  vite: {
    plugins: [{
      name: 'local-game-link',
      configureServer(server) {
        // Development runs the game in Vite separately. Redirect only game
        // navigation; production Go serves both builds on the same origin.
        server.middlewares.use((req, res, next) => {
          if (!/^\/game(?:[/?]|$)/.test(req.url || '')) return next();
          res.writeHead(307, { Location: `http://127.0.0.1:${process.env.ATLAS_WEB_PORT || '5187'}${req.url}` });
          res.end();
        });
      },
    }],
  },
});
