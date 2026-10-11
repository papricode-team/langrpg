# Painted resident actions

The built-in ImageGen tool generated the Anne, Ella, Karl and Mila action sheets from identity references composed from the game's existing avatar layers. Each `*-prompts.json` retains the exact prompt and original input path. The byte-identical identity references are retained beside the native PNGs. No API/CLI image-generation fallback was used.

| Look | Native source | Exact prompt |
| --- | --- | --- |
| Anne | [anne.png](anne.png) | [anne-prompts.json](anne-prompts.json) |
| Ella | [ella.png](ella.png) | [ella-prompts.json](ella-prompts.json) |
| Karl | [karl.png](karl.png) | [karl-prompts.json](karl-prompts.json) |
| Mila | [mila.png](mila.png) | [mila-prompts.json](mila-prompts.json) |

Each sheet contains twelve poses, in four columns and three rows: idle, read, page turn, seated rest, work, lowered tool, serve, greet, hold parcel, and three carrying stride poses. The native outputs are 1254 × 1254 for Anne, Ella and Mila, and 1086 × 1448 for Karl. All four retain transparent alpha. The different canvas aspect ratios do not change runtime character proportions.

Run `node scripts/prepare-resident-action-art.mjs` to rebuild the four 512 × 576 runtime atlases and their frame JSON under `web/public/assets/resident-actions`. The exporter identifies transparent row separators rather than assuming equal generated padding; splitting the native image into equal rows clipped a lower-row head. It checks the twelve silhouettes for clipping, measures each boot baseline, and uses one isotropic scale per identity from its standing height. Sitting figures remain naturally shorter. Alpha is preserved inside rectangular crops; output is lossless WebP. `*-export.json` records the source hash, native crop geometry and frame registration. These small atlases add approximately 0.46 MiB of compressed art and 4.5 MiB of decoded texture memory when all four are loaded.

Runtime `actionArt` is an explicit scene-resident appearance choice. It must match that look's avatar colors and cannot also select regional `artVariant` art. A map loads only its registered action sheets and releases them with its other destination textures. Failed downloads leave the original avatar and simple held props available; they do not make the resident disappear. New regional identities still need matching painted sheets.

Action frames use the shared task phase time, and carrying strides use route distance. Reduced motion keeps a calm action frame while task state continues. A painted book/tool/parcel suppresses the corresponding simple prop. After the visit ends, normal walking layers return. For benches, seated art moves back from the walkable arrival anchor to the bench's ground anchor; a short shared-time transition settles it onto the seat. The actor's route and reservation anchor remain unchanged. This is a presentation offset, not extra walkable geometry or a persistent task outcome.

The browser was reviewed at actual activity destinations. Evidence is retained locally in `output/qa/resident-seated-reading.png`, `resident-painted-parcel.png` and `resident-painted-work.png`. Shared-time reconstruction, reduced motion, pose restoration and duplicate-prop suppression are covered by the resident-action and renderer tests.
