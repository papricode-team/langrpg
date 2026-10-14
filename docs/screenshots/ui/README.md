# UI review gallery

Open `index.html` to compare the five production UI surfaces at desktop (1440 × 900) and phone (390 × 844) sizes. `font-floor.json` records measured text, the smallest computed font, asset loading, browser errors, and interaction checks.

Regenerate with Vite running:

```sh
npm ci
npx playwright install chromium
npm run dev --workspace web
# In a second terminal:
npm run ui:check --workspace web
```

The development-only `?ui-check=` route seeds representative learning state and renders the normal menu, options, encounter, journal, and activity components. It pauses the world renderer to keep screenshots stable. The browser check includes all rendered scroll content, validates the visible primary action on home and encounter screens, and exercises phone page navigation plus word details and the empty-queue conversation, Back, and replay.

Use `ATLAS_UI_URL` for another development server. `ATLAS_CHROMIUM_PATH` selects an installed Chromium executable. For focused iteration, `ATLAS_UI_SURFACES=encounter` and `ATLAS_UI_VIEWPORT=phone` run a subset; always regenerate the full gallery before review. `ATLAS_UI_VIEWPORT=landscape` checks 844 × 390 and writes a separate `index-landscape.html` and `landscape-check.json`.

`npm run check` also enforces the template budget: new `<small>` or `eyebrow` markup fails. Its allowlist is empty after the copy audit.

Stylesheets use named media predicates (`--phone`, `--tablet`, and their complements) from `scripts/ui-layout.mjs`. Vite expands them before parsing CSS. The static check rejects unshared layout thresholds and literal type sizes below 12px.
