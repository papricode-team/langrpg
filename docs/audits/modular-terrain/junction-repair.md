# Lindenhafen bridge junction correction

The canal bank renderer now unions exposed water and subtracts later land before constructing walls and coping. Paving that covers water no longer leaves a wall through the road. Shared road/water boundaries receive one coping course. Island winding is retained.

The market bridge moves 100 world units north to clear the fixed canal boat; its approaches are reconnected to the market and east promenade. The harbor's bakery/lamp quay becomes one continuous paved platform, and wider western abutments remove grass slivers at both entrances. The bridge deck collision outline excludes the near pillar cap and front parapet.

The local visual audit uses the public live document (revision `787a202fca18f09e`, 155 scenery placements), changing only `maps.lindenhafen.modularTerrain`. Closeups use the normal scene and scenery renderers at 2× zoom. Editor labels are visible. No scenery, buildings, residents, or activity coordinates are authored by this correction.

Validation: 44 focused tests; TypeScript and lint; terrain, scene, and map checks; isolated browser publication and undo with exact full-document comparison; terrain comparison and chunk seam audit (21/10,215 seam pixels exceed a 3-level channel difference; maximum 10/255). Seamless bitmap edge checks pass for all 25 materials.
