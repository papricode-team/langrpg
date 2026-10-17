# Lantern harbor campaign illustration

`lantern-harbor.png` was generated with the built-in imagegen tool for the public
Astro landing page. This is campaign illustration, not a gameplay screenshot.
The page labels it accordingly. Optimized AVIF/WebP sizes and the 1200 × 630 social
image are committed in `site/public/images/`; regenerate with
`node scripts/prepare-site-art.mjs` after `npm run art`.

## Prompt

Use case: stylized-concept. Asset type: original cinematic website hero key art
for glotworld, a cozy mysterious German-learning story RPG. Create a breathtaking
painterly wide landscape, 16:9. A storybook German harbor town at the edge of an
enchanted forest: steep red-roofed half-timbered houses, warm amber lit bakery
windows, a small stone arch bridge crossing a teal canal, distant railway station
and slender clock tower, forested hills in dusk mist. At the far right foreground
a small back-facing traveler with a satchel and brass lantern looks across the
town; loose golden letter-like sparks drift subtly over the canal, no readable
writing. Rich hand-painted game concept art, confident brushwork, layered
atmospheric perspective, warm apricot sunset behind the skyline contrasting with
deep petrol teal shadows. Composition: richly detailed town and traveler on right
two thirds, left third is darker forest and quiet atmospheric sky with space for
a large cream heading added by the website; allow readable text overlay.
Luxurious cinematic lighting, inviting and adventurous, never childish. No logos,
no text, no UI, no watermark. Original environment, no existing franchise characters.

## Other website images

The gameplay and café images are optimized copies of the repository's
`docs/screenshots/desktop.jpg` and `docs/screenshots/interiors/cafe.jpg` captures.
Town cards use the campaign vistas documented below.

## Dusk campaign art pass (2026-10-17)

The second visual pass uses the original harbor as the palette and brushwork
reference. All new masters were generated with the built-in imagegen tool;
exact prompts are saved in matching `*-prompt.txt` files. These are original
campaign illustrations, not screenshots or promises of exact in-game geometry.

| Master | Public export | Use |
| --- | --- | --- |
| `lindenhafen-vista.png` | `lindenhafen.webp`, 720 × 600 | Harbor and railway act key art |
| `waldruh-vista.png` | `waldruh.webp`, 720 × 600 | Forest and stopped-clock act key art |
| `nebelstadt-vista.png` | `nebelstadt.webp`, 720 × 600 | Lighthouse and fading-sign act key art |
| `hero-foreground.png` | `hero-foreground.avif` and `.webp` fallback, 1920 × 1080 | Transparent forest, railing and traveler layer |
| `hero-sky.png` | `hero-sky.webp`, 1440 × 810 | Dusk sky and distant hills atmosphere |
| `hero-town.png` | `hero-town.webp`, 1920 × 1080; `hero-town-960.webp`, 960 × 540 | Transparent town and canal atmosphere |
| `fog.png` | `fog.webp`, 768 × 256 | Transparent drifting mist |
| `brass-frame.png` | `brass-frame.webp`, 512 × 512 | Nine-slice brass and lantern-glass panel chrome; 128 px corners |
| `brass-divider.png` | `brass-divider.webp`, 1024 × 128 | Lantern and brass section ornament |
| `lantern-sparks.png` | `sparks.webp`, 1024 × 128 | Eight-frame transparent golden-mote sprite sheet |

All transparent assets retain alpha. The original hero stays the preloaded LCP
image; its atmospheric overlays are decorative CSS backgrounds. The sky and
town plates are lazy decorative images that carry the scene through later
sections without duplicating the traveler. The town key art replaces the
obsolete tile-map preview exports.

`node scripts/prepare-site-art.mjs` regenerates the optimized exports, then calls
`prepare-site-sprites.mjs` for the actual game cast/animals and
`prepare-site-sparks.mjs` for the generated spark animation. The art script
asserts the unchanged 550 KiB limit for each image. Masters remain Git LFS files;
only optimized assets enter `site/public/images/`.
