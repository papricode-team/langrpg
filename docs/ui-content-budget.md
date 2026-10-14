# UI content and layout budget

The interface gives each surface one job and one dominant action. Navigation words belong in headers and buttons. Character voice and longer descriptions belong in dialogue, lore details or a help control.

## Type and layout

Use the four shared tokens from `web/src/style.css`:

| Token | Phone | Desktop | Purpose |
| --- | --- | --- | --- |
| `--type-display` | 28px | 34px | Page and dialog titles |
| `--type-title` | 20px | 22px | Card titles and German lines |
| `--type-body` | 16px | 16px | Prose and meanings |
| `--type-caption` | 13px | 12px | Necessary secondary values |

Text must never render below 12px. Necessary uppercase labels use the caption token and at most 0.6px letter spacing. Remove text that cannot fit at a readable size.

Compose layouts at the shared 600px phone and 1000px tablet thresholds. A separate landscape rule at a maximum height of 520px keeps controls reachable on short screens. Desktop uses a list and detail pane where detail is needed; phones use a full-width bottom sheet with 16px gutters. Avoid adding component-specific breakpoint thresholds.

The definitions live in `scripts/ui-layout.mjs`. Source styles use `@media (--phone)`, `(--above-phone)`, `(--tablet)`, `(--desktop)`, `(--short-landscape)` and `(--above-short)`. The Vite pre-transform expands these aliases before CSS is parsed in development and production. They are build aliases, so preview source styles through Vite rather than loading an uncompiled stylesheet directly. `--above-phone` starts at 601px, `--desktop` at 1001px and `--above-short` at 521px; compound conditions keep their original behavior. Container queries remain component-specific.

## Content per surface

| Surface | Visible content |
| --- | --- |
| Dialog header | Portrait, name, one role label |
| Card | Title, one body line, one action |
| List item | Label and one trailing value or chevron |
| Page intro | Title; explanations behind a `?` help control |
| Button | Verb phrase and an optional icon |
| Menu chrome | One brand mark, four sections and close control; offline status on close |

Do not add decorative kickers, repeated help sentences, subtitles under every navigation target or empty and zero-valued rows. A word card shows article, word and meaning. Plural, forms, examples, memory evidence, audio and practice belong in its detail sheet or pane. Unit rows show a title and progress indicator.

## Play and navigation

During play, keep the objective chip, menu affordance and necessary controls. Town arrival labels fade after two seconds. XP gains are transient. Desktop's keyboard legend appears for the first minute and remains available in help; phones keep movement and interaction controls, with the nearby target name. The access timer appears only during the last 60 seconds. Character details and account controls live in You.

The menu has four sections: Map, Story, Learn and You. Desktop has one header row and a page rail. Phones have a fixed 56px bottom section bar, large page tiles and one back control for a pushed page. Keyboard and controller hints stay inside the section buttons. Menu home contains the act title, a next-step line with portrait, Continue and four destination tiles.

Encounters put the German line and word chips before a full-width primary session action. Translation is disclosed on interaction. Keep one secondary mini-game link beside Leave. Scripted conversations provide an action when graded practice is unavailable; their dialogue choices are ungraded and do not award learning credit or bypass word and route unlocks. Live chat is removed from the interface, client API and world server.

## Checks and screenshot review

`npm run check` runs the template budget lint. New `eyebrow` markup and `<small>` templates fail unless explicitly justified in `scripts/ui-template-allowlist.json`. Replacing a decorative label with a caption does not make its content necessary.

The browser check uses the production renderers through development-only `?ui-check=` fixtures. These previews use deterministic sample progress, a static painted background and local UI state. They do not connect an account or write server progress. Do not expose the fixtures in production builds.

To regenerate the gallery locally, install the browser once:

```sh
npx playwright install chromium
```

Start the development frontend in one terminal:

```sh
npm run dev --workspace web -- --host 127.0.0.1 --port 5187 --strictPort
```

Run the browser check from the repository root in another terminal:

```sh
npm run ui:check
```

The check measures menu home, options, an encounter, the word journal and an activity at 1440×900 and 390×844. It fails on rendered text below 12px and regenerates the ten screenshots, `font-floor.json` and `index.html` under `docs/screenshots/ui/`. Review both viewports for action visibility, content density and overflow; a passing font floor alone does not establish a good composition.

CI installs Chromium, starts the development frontend, runs the same check, stops the frontend and uploads the gallery artifact even after a failed check. No Go server is needed for these previews. To check another frontend origin, set `ATLAS_UI_URL`; `ATLAS_CHROMIUM_PATH` selects an existing Chromium executable when needed.
