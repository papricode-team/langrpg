# Story character identities

2026-10-17. Portraits are the identity authority: `web/public/assets/portraits.webp`
and the native expression paintings in `art/source/character-portraits/`.
Voss and Elise use the dedicated native repaints in `art/source/story-cast/`.
Colours below are recipe pigments, before shared material shading and warm finish.
Recipes live in `cast/<id>.json`; retain these identities when adding new pieces.

| Character | Skin and face | Hair | Signature wardrobe and colours | Kit interpretation / remaining detail |
| --- | --- | --- | --- | --- |
| Marta | Warm olive tan `#c7976b`, soft face, dark eyes | Dark brown `#33251f`, loose curls around face | Cream linen blouse `#fff2d6`, dark olive apron `#63713e`, cocoa skirt `#734b37` | Curls replace the severe smooth bun. Portrait has a loose curly updo and gold hoop earrings; kit has no earring slot, so hoops remain an authored-component follow-up. |
| Otto | Warm light skin `#d6a07d`, mature face, round spectacles | Silver `#c6c1b5`, crop and large moustache | Navy railway coat/cap `#263e57`, brass trim `#d7b56b`, cream shirt `#fff3dd`, red neckerchief `#a44139` | Blazer approximates the railway coat. |
| Lina | Warm brown `#c18b60`, round smiling face, freckles | Copper curls `#b65a2c` | Blue travel jacket `#436d96`, golden scarf `#dcae3e`, cream shirt, brown trousers and leather satchel | Keep the golden scarf visible against the blue collar. |
| Emil | Warm tan `#c18b60`, angular face and short stubble | Short brown crop `#483023` | Burgundy collared shirt `#963e43`, olive work trousers `#665f3d`, leather tool pouch and boots | Short crop approximates the tousled portrait hair; short beard approximates stubble; goggles are not available in the kit. Do not replace with clear spectacles. |
| Ada | Warm light skin `#d6a07d`, mature face, rectangular spectacles | Silver bob `#d1cfc5` | Plum cardigan `#66334f`, cream blouse `#fff0d4`, patterned mauve neckerchief `#94758b`, dark plum skirt | Cardigan and kerchief preserve portrait silhouette and colour; printed scarf pattern awaits a garment master. |
| Fritz | Rosy light tan `#d6a07d`, round face and broad moustache | Copper crop/moustache `#ad592f` | Forest waistcoat `#3e5b36`, brass `#b79a58`, cream shirt `#fff0d6`, brick neckerchief `#974841` | Existing regular body is retained to preserve registration; broad character-specific build remains future authoring. |
| Greta | Warm brown `#bc855b`, almond eyes and freckles | Dark brown-black curls `#302b2d` | Sage blouse `#9da37a`, lavender waistband `#9676a1`, earth skirt `#79644a`, leather herb tote | Blouse secondary tint stands in for the lavender sash; lavender sprigs need a new hair accessory. |
| Inspector Voss | Warm light tan `#d6a07d`, mature stern face | Swept silver `#c5c3b9`, moustache | Charcoal coat `#443d38`, brass trim `#bda15f`, ochre waistcoat `#d4a34e`, burgundy tie `#943d3b` | Trench, shirt and kerchief approximate the layered coat/waistcoat/tie; badge and case remain portrait details. |
| Elise | Warm tan `#c79972`, mature face, round dark spectacles | Silver wavy bob `#d0cbc4` | Blue-grey travelling coat `#526d86`, cream shirt `#fff0d6`, burgundy kerchief `#91433d`, leather satchel | Bob replaces the incorrect tight bun. Brass lantern and shoulder strap retained. |
| Player / Wanderer defaults | Player-selected skin; default warm sand `#d6a07d` | Player-selected hair; default brown `#48372e`, waves | Teal travel jacket `#326a65`, cream shirt, charcoal trousers, brown boots | Same material normalization and painted finish as all cast. Saved colours, body builds, four directions and action registration remain intact. The painted wanderer portrait also has a white collar, leather strap and teal coat. |

The checkout also contains eight expansion-story identities beyond the review's
original nine. They have no dedicated painted portrait masters: dialogue uses
their composed avatar portrait. Preserve these existing identities from the
authored recipes and `docs/story-expansion-plan.md`, rather than inventing
portrait evidence. They receive the same finish automatically.

| Character | Skin | Hair / face | Signature garments |
| --- | --- | --- | --- |
| Kessler | Light warm `#e2b896` | Brown `#4a4038` bun, angular face, square glasses | Slate blazer `#5d6670`, ivory shirt `#e8e4da`, slate skirt, leather satchel |
| Pip | Warm brown `#c18b60` | Copper `#a75532` curls, round face, freckles | Ochre tee `#d9a441`, blue shorts `#4e6a8a`, brown boots |
| Berg | Light peach `#ecc4a2` | White `#e6e2da` bun, mature face, round glasses | Lavender cardigan `#8c6fa6`, ivory blouse, dark violet skirt, rose scarf `#b05a6a` |
| Hilde | Sand `#d6a07d` | White `#f0ede6` bob, mature face | Plum long dress `#6e4f6a`, cream apron `#d9c8a8`, rust kerchief, wooden clogs |
| Falk | Light warm `#e2b896` | Black-brown `#2f2a28` crop/moustache, angular face | Blue waistcoat `#3f5f8a`, cream shirt, charcoal brimmed hat, satchel |
| Jakob | Warm brown `#c18b60` | Grey-brown `#7d7468` crop/full beard, mature face | Rust sweater `#a4513a`, slate beanie `#2f4c5c`, earth cargo trousers |
| Ruth | Warm brown `#c18b60` | Copper `#a75532` ponytail, soft face | Sage day dress `#6f8f6a`, ivory apron `#f3efe5`, brown flats |
| Jonas | Copper brown `#b07a55` | Dark `#302b2d` crop, angular face | Deep slate raincoat `#2f4c5c`, dark cap with brass trim, cream knit collar, charcoal trousers |

## Finish and registration contract

`character-compositor.mjs` normalizes tintable clothing against the native
catalogue's 180-grey material reference, preserving untinted detail paint and
skin/hair pigment. A deterministic frame-local finish lifts midtones, enriches
pigment, adds short diagonal brush/tooth variation and shades lower-right edges
against warm upper-left highlights. It runs once after composition in browser
and offline bakes. Alpha is byte-identical; no silhouettes, anchors, limbs,
frame order, timing or perspective are transformed. Existing 60-degree paintings
remain the geometry authority. Texture identity includes the paint revision.

This is a material/identity integration pass. It does not claim a fully bespoke
painted face or garment master for every character. The missing signature pieces
above require new registered kit art, rather than adding unregistered decoration.
