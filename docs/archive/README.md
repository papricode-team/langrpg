# Archived map content

The playable atlas contains Lindenhafen, Waldruh and Nebelstadt. The ten unfinished expedition scenes are preserved in [expedition-scenes.json](expedition-scenes.json), their Tiled exchange files in [maps/](maps/), and their map-only art in [art/archive/expedition-maps/](../../art/archive/expedition-maps/). These files are excluded from scene compilation and the web distribution.

Lindenhafen's former 3072 × 2048 scene is preserved in [lindenhafen-before-compact.json](lindenhafen-before-compact.json). Its active 2304 × 1536 replacement retains all 43 original activity IDs and adds four activities in the core. The 28 terrain assets no longer used by the compact town are preserved in [art/archive/unused-terrain/world-expansions/lindenhafen/](../../art/archive/unused-terrain/world-expansions/lindenhafen/) and excluded from the web distribution. Four superseded Nebelstadt core-0-1 files (day/night detail and overview) are preserved separately in [art/archive/unused-terrain/nebelstadt/](../../art/archive/unused-terrain/nebelstadt/); the active terrain uses the upgraded harbour bridge. The bridge exporter retains these archived originals as rebuild inputs and archives regenerated duplicates after a successful export.

Expedition encounters, learning evidence and neighborhood games remain available from Activities after the three-town story. Their previews and portraits stay in `web/public/assets` because the activities use them. `server/expeditions.json` exports this learning content independently of the playable map registry.

See [map-quality-implementation.md](../map-quality-implementation.md) for the active content, artwork provenance, review images and audit commands.
