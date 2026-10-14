# UI content and layout budget

The interface gives each surface one job and one dominant action. Navigation words belong in headers and buttons. Character voice and longer descriptions belong in dialogue, lore details or a help control.

Simplicity is not emptiness. A screen that has room should tell the player where they are, who they are and what is next. The first simplification pass removed the player plate, the place name and the story context from the menu home; that left desktop screens blank and the story action flat. The rules below restore that information in a fixed, small set of places.

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
| Hero or town card | One kicker line (act, place or status), title, one short line of story or description |
| Button | Verb phrase and an optional icon |
| Menu chrome | One brand mark, four sections and close control; offline status on close |

Do not add repeated help sentences, subtitles under every navigation target or empty and zero-valued rows. A kicker (`.kicker`, caption size, uppercase) is allowed once per hero, town card or beacon, where it carries real context such as the act, the place or the next conversation. Doorway cards on the menu home carry one live value each (towns open, clues found, words due) instead of repeating the section tabs. A word card shows article, word and meaning. Plural, forms, examples, memory evidence, audio and practice belong in its detail sheet or pane. Unit rows show a title and progress indicator.

## Play and navigation

During play, the HUD frames the world with four pieces: the player plate (portrait, name, level and title, XP and chapter progress) at top left, the place name and subtitle at top centre, the golden story beacon at top right, and the menu button. The beacon is the one animated, gold action over the world; indoors it becomes a quiet glass plate that leads back outside. The place name swells into a title card on arrival and then settles; below 1001px it appears only as the arrival card. XP gains are transient. Desktop's keyboard legend appears for the first minute and remains available in help; phones keep movement and interaction controls, with the nearby target name. The access timer appears only during the last 60 seconds. Character details and account controls live in You.

The menu has four sections: Map, Story, Learn and You. Desktop has one header row and a page rail. Phones have a fixed 56px bottom section bar, large page tiles and one back control for a pushed page. Keyboard and controller hints stay inside the section buttons. Menu home contains a story hero (act kicker, act title, act goal, next conversation with portrait, Continue the story and chapter progress pips), a town card (place, subtitle, description, places you can enter and today's lantern) and four doorway cards with live values. On desktop the hero and town card sit side by side; tablets and phones stack them.

## Focus and selection

Keyboard and controller focus uses one brass ring, `--focus-ring` in `web/src/game-ui.css`: a dark gap, a light gold ring and a soft glow, drawn with `box-shadow` so it follows rounded corners. Selection is a separate signal: the active section tab carries a lit underline and the selected page carries a lit bar on its left edge. Never express selection with the focus ring, and never draw a second outline around a focused control.

Encounters put the German line and word chips before a full-width primary session action. Translation is disclosed on interaction. Keep one secondary mini-game link beside Leave. Scripted conversations provide an action when graded practice is unavailable; their dialogue choices are ungraded and do not award learning credit or bypass word and route unlocks. Live chat is removed from the interface, client API and world server.

## Checks and screenshot review

`npm run check` runs the template budget lint. New `eyebrow` markup and `<small>` templates fail unless explicitly justified in `scripts/ui-template-allowlist.json`. Replacing a decorative label with a caption does not make its content necessary.

The browser check uses the production renderers through development-only `?ui-check=` fixtures. These previews use deterministic sample progress, a static painted background and local UI state. Learning content is session-gated, so each preview creates a throwaway guest session and uses it only for `/api/content/` reads; it never writes progress. Do not expose the fixtures in production builds.

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

CI installs Chromium, starts the development frontend, runs the same check, stops the frontend and uploads the gallery artifact even after a failed check. The previews need the Go server running behind the development proxy for content reads. To check another frontend origin, set `ATLAS_UI_URL`; `ATLAS_CHROMIUM_PATH` selects an existing Chromium executable when needed.
