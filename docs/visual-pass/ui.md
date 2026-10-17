# UI visual pass

Implemented finding 6 of `docs/visual-style-review.md`.

- Added `web/src/tokens.css`, imported before all other dependencies in `main.ts`: one brass family, ink/parchment/forest materials, text colours, Fraunces/DM Sans stacks, spacing, radii, shadows and brass focus ring. Previous `style.css` and `game-ui.css` palette definitions now resolve through compatibility aliases in this file.
- Encounters (including interiors), letters, ink entries and journal cards/pages use parchment with readable ink. Menu, world dialogue, HUD, activity controls, account dialogs and the course player use forest glass. Journal components scope existing semantic variables to their document material.
- `activities.css` exclusively owns the activity dialog/shell material. Removed the competing shell definitions from `activities-hud.css` and `game-ui.css`; the HUD stylesheet now skins controls and popovers. Painted order/evidence props remain documents.
- Brass primary and outlined secondary controls share materials across modes, including activity and interior dialogs. Keyboard/gamepad focus shares the brass ring, with forced-colour support.
- Removed the duplicate picker mounting block from `main.ts`. Story and Learn no longer prepend course settings. The existing functional picker under **You → Options → Language** in `options-panel.ts` remains the destination; standalone course play retains its picker. No course activation or support-language logic changed.

## Files

New: `web/src/tokens.css`.

Changed: `web/src/main.ts`; `web/src/style.css`, `style-encounters.css`, `style-menu-pages.css`, `style-play-frame.css`, `game-ui.css`, `game-menu.css`, `menu-home.css`, `dialogue.css`, `activities.css`, `activities-hud.css`, `activities-viewport.css`, `activities-overlays.css`, `course-player.css`, `course-ui.css`, `you-menu.css`, `hud.css`, `interiors.css`, `story-mechanics.css`, `player-account.css`, `game-access.css`; this handover.

No art, Phaser scene files, minigame files, site files, generators or git state changed by this pass.

## Evidence and checks

Before evidence inspected: `docs/screenshots/ui/home-desktop.png` and the four images in `docs/audits/visual-style/`. The home image demonstrates the duplicate course form preceding the story hero. Also read all three `docs/style/*.md` town briefs.

After screenshot paths: **unavailable**. Attempted `ATLAS_UI_DIRECTORY=output/ui-screenshots npm run ui:check`. Chromium failed before opening a page:

```text
FATAL:base/apple/mach_port_rendezvous_mac.cc:159
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)
```

Connected-browser inspection was also rejected by browser security policy for localhost access. No fresh screenshots were captured or accepted. Run outside this restricted session with the existing API/dev services:

```sh
ATLAS_UI_DIRECTORY="$PWD/output/ui-screenshots" npm run ui:check
```

- Final `npm run check --workspace web`: **passed**, including type checking, UI type/layout budgets (45 stylesheets), and template budget (0 legacy usages). An intermediate attempt encountered concurrent scene-file type errors; these cleared before the final run.
- `npx vitest run src/course-player.test.ts src/encounter-panels.test.ts src/story-panels.test.ts src/options-menu.test.ts src/menu-navigation.test.ts src/menu-refresh.test.ts` from `web/`: **6 files / 41 tests passed**. No test expectations changed or checks loosened.
- Static token contrast calculation: system text 12.52:1; muted system text on raised forest 6.11:1; document text 9.29:1; muted document text 5.15:1; dark brass on parchment 5.27:1; primary label on brass 7.09:1. These calculations verify the palette, not every rendered element. Existing 12px caption floor remains intact; the UI budget check passes.

## Remaining work / coordination

Fresh desktop/phone screenshots and rendered font/overflow/contrast inspection remain unverified because both browser routes were blocked. No change requested in another agent's area. Semantic success/error colours, artwork effects and specialised physical activity props retain their purposeful colours; this pass consolidates the shared materials rather than mechanically replacing every colour literal.
