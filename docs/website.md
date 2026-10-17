# Public website and search

The Astro workspace in `site/` builds the public website at
`https://glotworld.com/`. The Phaser application lives at `/game/`. The existing
Go service serves both, alongside `/api/`, audio, game assets and admin tools.
No extra deployment service, Node server, DNS change or Sites project is needed.

## Develop and build

- `npm ci` installs both workspaces.
- `npm run dev` starts the game and API as before, on ports 5187 and 8097.
  Open `http://127.0.0.1:5187/game/` for the game.
- `npm run dev:site` starts Astro on port 4321 (or the next available port).
  Use the URL printed by Astro. Development game links redirect to the separate
  Vite server; production game links stay on the same origin. `ATLAS_WEB_PORT`
  selects the Vite port if overridden. Astro 7 runs a background development
  server; stop it with `npm exec --workspace site -- astro dev stop`.
- `npm run build` builds Vite, builds Astro, moves the game HTML to
  `web/dist/game/index.html`, then merges the public site into `web/dist/`.
  Game assets retain their absolute `/assets/` and `/audio/` paths.
- `STATIC_DIR=/absolute/path/to/web/dist` makes the Go service serve the combined
  build locally. Use a disposable `DATA_PATH` for QA, not production state.

The Docker build installs both workspaces and runs the combined root build.
Keep `PUBLIC_URL=https://glotworld.com` as an origin, without `/game`. Checkout
and invite links append `/game/` in the server. Old root links with `ref` or
`billing` queries temporarily redirect to `/game/`, retaining the query. Existing
browser-held sessions use the same origin and storage keys.

## Public content

The homepage has a cinematic illustrated introduction, three story towns, a
learning walkthrough, a two-step café example, level explanations, a field-note
section and accessible FAQ disclosures. It loads no Phaser or game content API.
The café example is standalone public teaching material, not an imported game
answer or private content bundle.

Seven Markdown guides in `site/src/pages/learn-german/` cover beginner German,
café phrases, noun articles, word order, practice through games, A1–B1 levels and
vocabulary review. Metadata lives in `site/src/data/guides.ts`. Add one metadata
entry and one Markdown file using `ArticleLayout.astro` to publish a new guide.
Use an original useful example, accurate explanations, a self-check and related
links; avoid thin pages made only to repeat keywords. Source externally grounded
claims and distinguish practice activities from certified outcomes.

The hero is original generated campaign artwork, labelled as illustration.
Its source, generation method and prompt are in `art/source/marketing/` (LFS).
`node scripts/prepare-site-art.mjs` regenerates the committed optimized public
images from the master and existing game art/screenshots. It is not needed in
Docker; production consumes the committed public exports.

## Technical search setup

- Static, complete HTML for every public page, including guides and exercises.
- Unique titles/descriptions; absolute canonicals; Open Graph and Twitter cards.
- Organization, WebSite, WebPage, VideoGame, Article and BreadcrumbList JSON-LD
  describing visible content. No invented reviews, ratings or promises of FAQ
  rich results. No misleading course certification or fluency claims.
- Generated sitemap at `/sitemap-index.xml`, referenced by `/robots.txt`.
- One canonical trailing-slash route for directory pages; 308 redirects from
  their slashless and `index.html` aliases, preserving query parameters.
- Game, admin and password-reset routes carry `X-Robots-Tag: noindex, follow`.
  They remain crawlable so crawlers can see noindex; API and QA routes are
  excluded in robots.txt. Unknown public URLs return a styled HTTP 404.
- Responsive, dimensioned AVIF/WebP artwork; lazy below-the-fold images; prioritized
  hero; self-hosted fonts; inline critical CSS; small scripts; reduced-motion support and semantic
  keyboard-accessible controls. No marketing third-party scripts or cookies.
- Public HTML, sitemaps and mutable images revalidate. Fingerprinted Astro assets
  have immutable caching. Docker precompresses HTML, CSS, JS, JSON, SVG and XML.
- Campaign and referral parameters carry through internal pages using tab-scoped
  session storage and into play links. They are not included in canonical URLs.

`npm run verify` includes Astro type checks and production website checks through
`npm run budgets`. `scripts/check-site.mjs` validates compiled HTML, canonical
and sitemap parity, metadata uniqueness, structured data, guide depth, local
assets, all internal links/anchors and small image/script budgets.

For browser QA against the combined Go build:

```sh
SITE_UI_URL=http://127.0.0.1:8098 node scripts/check-site-ui.mjs
```

Set `ATLAS_CHROMIUM_PATH` if a local Chrome executable is needed. Screenshots and
reports go to `output/ui-screenshots/landing`, never the tracked screenshot gallery.
The check covers 1440, 390 and 320 pixel widths, missing images, overflow, the
café exercise, mobile navigation, attribution and JavaScript-disabled reading.

## Release and discoverability

Deploy the verified branch through the existing Dokploy Compose service. The
public route remains `/` on port 8080. Verify homepage, one guide, `/game/`,
`/api/health`, sitemap, a real 404, checkout return and an existing guest session
on the deployed origin. Configure HTTP-to-HTTPS and a single hostname redirect
in Dokploy/Traefik (redirect `www` to the apex if both are configured).

In the domain owner's Google Search Console property, submit
`https://glotworld.com/sitemap-index.xml`, inspect the homepage and guide URLs,
and monitor indexing, search queries and field Core Web Vitals. Add Bing
Webmaster Tools if desired. Ownership verification and sitemap submission require
access to those accounts; repository changes cannot perform them.

Keep previews off public indexing at the hosting layer, using authentication or
an environment-specific `X-Robots-Tag: noindex`. Production canonicals intentionally
point at glotworld.com. There is no fabricated `lastmod`: add true editorial
revision dates if an ongoing publishing workflow is introduced.

These changes establish crawlability, useful public content and performance
budgets. Rankings, rich-result display and awards are not guaranteed by code.
