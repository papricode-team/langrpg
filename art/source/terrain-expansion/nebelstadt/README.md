# Nebelstadt harbour ground

`harbour-front` and `harbour-supply` use the same authored street blockout and
the existing Nebelstadt grey stone palette. Four native 1536×1024 paintings cover
four 384×256 world quadrants per chunk: four source pixels per world unit. Each
night section is a lighting edit of its matching day section. Exact prompts and
selected source paths are recorded in the day/night prompt JSON files.

Every painting contains only flat paving and inset masonry. Buildings, trees,
plants, furniture, lamps, market counters and people are independent scenery.
The empty plots accept the two authored buildings without baked silhouettes or
object shadows. Ground geometry follows the shared street/plaza blockout.

```sh
node scripts/prepare-nebelstadt-harbour-terrain.mjs
```

The exporter keeps native resolution, joins the quadrants using narrow copied
edge strips and the existing seam solver, and adds one copied pixel around the
3072×2048 visible frame. Runtime files are 3074×2050 with crop
`{x:1,y:1,width:3072,height:2048}`. Their 768×512 overviews come from the same
paintings. Detailed exports stay under 2 MiB each. The exporter never changes
canonical scene coordinates or navigation.

The core-to-harbour join uses a localized terrain edit at world
`x=1410,y=325,width=126,height=125`. Its day/night sources are
`harbour-bridge-*-patch.png`; exact prompts and the safe connector polygon are
recorded in `harbour-bridge-prompts.json`. Run
`node scripts/prepare-nebelstadt-harbour-bridge.mjs` to reproduce the sibling
core textures, their overviews and the matching loading fallback plates.
The old diagonal bridge stays intact, while a short visible deck connects its
head to the harbour street. No walking rectangle spans the painted water.
