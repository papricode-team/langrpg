# Illustrated button audit — 15 October 2026

The game menu now uses a generated forest-green enamel and brass 2D sprite, with three gold menu bars. The original is `art/ui/menu-button-v1.png`; the 192px runtime asset is `web/public/assets/ui/menu-button-v1.webp`. Generation provenance and the exact prompt are in `docs/prompts/menu-button-v1.txt`. The HTML button retains its localized accessible name, desktop Menu label, Esc hint, review indicator, and existing navigation behavior. Hover and pressed feedback use the same artwork; no animation sheet is needed.

## Best next replacements

| Priority | Surface and source | Current artwork | Proposed matching sprite |
| --- | --- | --- | --- |
| High | Main menu tabs, `web/src/menu-navigation.ts`, `menuTabsMarkup` | SVG compass, scroll, book, shirt | Brass compass, parchment scroll, open leather book, folded travel coat. Keep text labels and selected-state styling. |
| High | Journey shortcuts, `web/src/game-panels.ts`, `adventureHome` | SVG compass, lantern, leaf, cup | Reuse compass and add lantern, pressed leaf, ceramic cup as standalone cutouts; avoid placing a second button frame inside the cards. |
| High | World interaction, `web/src/main.ts`, `#talk-button` | SVG chat bubble | Warm ivory conversation bubble with a brass outline. Retain nearby character/object name. |
| Medium | Optional activity entry points, `web/src/main.ts`, `sideActivities`; `web/src/game-panels.ts` | SVG cup, basket, clue, parcel | Coffee cup, market basket, magnifying glass, tied parcel. Reuse existing activity item art where suitable before generating duplicates. |
| Medium | Audio and silent-mode buttons, `web/src/main.ts`, `web/src/dialogue-view.ts`, `web/src/game-panels.ts` | SVG volume/muted symbols | Matched speaker-on and speaker-off sprites, with an obvious mute slash. Keep small inline audio controls simple until readability is verified at their actual size. |
| Low | Menu/dialog close, `web/src/menu-navigation.ts` and `web/src/main.ts` | SVG cross | Small enamel close button, only if it remains legible at compact sizes. |

These are recommendations; only the primary game menu button is replaced in this change. Do not globally replace `icon()` in `web/src/icons.ts`: the same glyphs are used in tiny inline controls, status marks and headings, where detailed raster art can become muddy.

## Emoji and text-symbol findings

A source scan of production TypeScript found no pictorial emoji used as game button artwork. Most icons come from the shared SVG helper. Remaining text symbols include:

- `web/src/options-menu.ts`: ◀ / ▶ option-step buttons. Keep these crisp directional controls.
- `web/src/admin-users.ts`: ✕ close button; `web/src/world-edit-overlay.ts`: × inspector close. These are editor/admin utilities, lower priority than player-facing art.
- `web/src/minigames/scripted-stories.ts`: ✓ / ♪ announcement state indicators inside buttons. These communicate completed/heard status and should remain readable at text size.
- `web/src/minigames/engine.ts`: ♪ listening cue, which is not a button.
- `web/src/activities.ts`: × quantity notation in inventory controls, not an icon to replace.

Keep arrows, chevrons, checks, plus/minus, keyboard/gamepad hints, and textual quantities as vectors or text. For future illustrated sprites, use true alpha transparency, a consistent light direction and palette, and optimized assets at two to three times their displayed dimensions.

## Validation

- Web TypeScript and UI template/type/layout budgets passed.
- Menu navigation and refresh tests: 17 passed.
- Existing UI gallery: all 10 desktop/phone surfaces passed asset, layout and interaction checks.
- Focused browser checks at 1440 × 900, 390 × 844 and 844 × 390 verified sprite decoding, on-screen hit areas of at least 44px, the shared keyboard focus ring, Enter/click opening, close-button return and Escape navigation. Phone Escape preserves the existing page → hub → world sequence.
- Runtime WebP is 192 × 192, approximately 12 KB, with verified alpha transparency. Desktop, phone and landscape screenshots were visually inspected.
