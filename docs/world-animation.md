# Living world animation

The three maps retain their painted backgrounds. Separate engine layers now animate activity in the town and physical details in the environment, so motion does not require repainting the full map each frame.

## Implemented motion

- Lindenhafen: moving canal highlights, fountain streams, splash droplets and expanding rings, drifting chimney smoke, butterflies, birds and lantern glows.
- Waldruh: downward waterfall flow, river currents, fountain water, rising smoke, turning mill spokes and moving clock hands, autumn leaves and birds.
- Nebelstadt: harbor currents, drifting fog, lighthouse beam and beacon, chimney smoke, birds and lantern glows.
- Nine painted background residents, three per region, stroll between destinations and pause for two to five seconds. Their feet follow the existing street navigation and avoid blocked gardens, buildings and water. Quest characters remain at their landmarks. Background residents have local visual identities and do not appear as connected players or in chat.
- Inspecting a fountain, clock mechanism or lantern briefly strengthens its physical effects alongside the existing discovery marker.

`web/src/world-life.ts` compiles resident routes once when entering a map. `sampleResidentMotion` samples continuous closed loops with reusable output objects. The renderer reuses the existing directional character material atlas and palette tints; residents add no character atlas copies.

`web/src/world-environment.ts` creates shared effect textures once and caches them across region visits. Updates change sprite position, rotation, scale and opacity. They do not redraw canvas textures, upload new textures, run pathfinding or create timers each frame. Environment budgets cap this layer at 52 sprites on desktop and 32 on mobile; actual maximums are 51 and 29. Existing small foliage/bird/light effects and characters are additional, separately bounded layers. Off-screen effects and residents are culled; all map-owned sprites are destroyed on travel. Resizing across the phone breakpoint recreates the environment at the appropriate budget.

Decorative motion uses a separate scene clock. It pauses when the world sleeps behind a menu or hidden page and respects the operating system's reduced-motion preference, including live changes. Reduced motion holds scenery and background residents steady while player-controlled walking and multiplayer movement remain available. Settings → World motion offers Follow device preference, Full world animation and Calm, still scenery; the selection persists on this device.

## Visual and behavioral verification

All 110 frontend tests, TypeScript and the production build passed. Five resident tests cover dense road safety, disconnected route rejection, real pauses and continuous loop closure. Simulated updates across all six map/device combinations checked finite transforms, viewport culling, live reduced-motion freeze, interaction responses and repeated cleanup.

Browser verification covered all three regions, map travel, fountain inspection, switching calm motion on and back to the device preference, 390×844 portrait and 844×390 landscape. Neither phone layout had horizontal overflow; exploration controls met the 44-pixel touch target. The TryCloudflare preview serves the updated world bundle and its API remains available.

The [animated capture](screenshots/world-alive.gif) records approximately five seconds of actual browser animation. It demonstrates motion, rather than measuring the game's frame rate. [Portrait](screenshots/world-alive-mobile.jpg) and [landscape](screenshots/world-alive-landscape.jpg) captures show the compact controls.

## Art structure for richer scenery

Independent tree canopies, cloth awnings, doors, boats and articulated character actions benefit from separately authored transparent layers with clean background plates. Those layers can preserve painterly edges while moving at different speeds and depths. The current paintings bake those details together; the new engine layers supply environmental flow and town activity around that base. Source-layer animation is the appropriate art pipeline for bending whole canopies, opening painted doors or moving existing boats cleanly.
