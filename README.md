# MOLEFORGE

*One million gold to the surface.*

You are a very dirty mole who fell down a sinkhole into an old burrow deep underground, along with your chicken, Nugget. A one-way **Surface Express** ticket costs **1,000,000 gold**. Dig for ore, forge it into weapons, sell everything, and when you can finally afford the ticket, go up to the surface and take a beach vacation with your chicken, Nugget.

Moleforge is a pixel-art voxel game that runs in the browser. It combines first-person voxel mining with a medieval blacksmith sim, cooking, home building and a cozy isometric underground town. Every model, texture, sound effect and music track is generated in code. There are no asset files.

## Play

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

### Controls

| | |
|---|---|
| Move | `W` `A` `S` `D` |
| Look around (underground) | Mouse (click the view to capture it, `Esc` frees it) |
| Jump / climb a wall | `Space` (hold it against a wall to climb) |
| Run | `Shift` |
| Dig / use tool | Left mouse (hold) |
| Tools | `1`–`7` or mouse wheel |
| Interact (dig out of a wall at home, doors, lift bell) | `E` |
| Quick snack | `Q` |
| Map | `M` (or click the radar) |
| Index Book / Backpack / Journal | `B` / `I` or `Tab` / `Esc` |
| Build mode (home) | `X`, rotate with `R` |

On touch screens, underground, the left half of the screen is a floating stick and dragging the right half looks around; a big leather button digs (hold it), with jump, use, snack and next-tool buttons around it. In town and at home a carved stone stick moves the mole. Tap the backpack or the Index Book in the corner to open them, and the radar for the map. The game works in landscape and portrait.

## What's in it

- **It starts with a fall.** A sunny meadow, a sinkhole that gives way, and a long tumble down a shaft of roots, fossils, a waterfall and a glow-worm grotto, crashing through the roof of an abandoned burrow with Nugget. The door to town is caved in and the hole is far too high to climb: walk up to any wall of the house and dig your way out.
- **First-person mining in a 3D voxel underground.** Your own furry paws hold the pick, chisel, brush, drill and lamp. Rock is made of eighth-meter voxels drawn as pixel art, split into plates along visible cracks: each blow lands on the plate under the crosshair and, when it gives, the plate crumbles out of the wall as tumbling chunks and grit. Tunnel anywhere: down, sideways, into caverns, lava lakes and flooded caves. The world is generated lazily around you, remembers every voxel you dug, and the tunnels you dig from the house stay open as doorways in its walls.
- **Radar and survey map.** A brass radar shows the tunnels you've explored, the way to Deep Town, home, ore areas nearby, danger zones (lava, floods, nests, gas) and lift stations. The survey map lets you look at any depth.
- **Fantasy creatures.** Pebble mimics and rubble golems sleep as rock until you get close, gloom wisps drain your light, ember imps lob bouncing fireballs, crystal wyrmlings coil and lunge, spore puffers sneeze stinging clouds and shade bats swoop at your lamp. They telegraph every attack, squash and stretch, and burst into tumbling voxel chunks. Harmless critters live among them: grab worms and glow beetles, net cave fish, brush dust bunnies and gem tortoises, x-ray a void wisp.
- **Nugget comes along.** The hen trots after you through the tunnels, hops up ledges, flutters down drops and clucks at ore showing in the rock.
- **The town and the burrow stay isometric.** The house is a cozy timber-framed burrow with a crystal window, a light shaft from the hole you fell through, lanterns and clutter, and every tunnel you dug.
- **Almost no interface.** Everything on screen is an object. Your gold is a coin pouch that drops in when it changes, energy is a lantern flame, buffs are charms, and the day is a tear-off calendar. Your tools hang on a leather belt that tucks away to just the one in your paw. The backpack in the corner fills and bulges as you dig, and the Index Book leans against it. The backpack opens into leather pockets with paper tags on every item. The Index Book has sketches and charcoal silhouettes, with pages that turn in 3D. Shops have hanging signs, the keeper's portrait, shelves and price tags, and the assay office weighs your ore on a brass scale. Messages are notes pinned with a tack, prompts are chalk slates, and the pause menu is a little green journal.
- **Careful extraction.** Ore hides inside rock until you uncover it or see it glowing through the rock with the X-ray lamp. Hitting ore with a pick or drill chips its quality, and heavy blows shake fragile ore nearby. Clear the rock around a deposit and it pops out of the wall and flies into your backpack; chisel or brush it free and it stays *pristine*. Tools: pickaxe, chisel, brush, drill (which overheats), X-ray lamp and glow stakes.
- **Six depth zones:** Rootsoil, Clayworks, Crystal Grotto, Magma Deep, Frost Vault and The Core. They hold 29 minerals and gems, 15 plants and 15 creatures, many with their own behavior:
  - *Bioxide* zaps bare paws and explodes when struck; rubber gloves protect you.
  - *Gravium* falls upward, *echo crystal* shatters from vibration, *moonsilver* tarnishes in air, and *starmetal* pulls loose metal toward it.
  - *Magmaite* sets things alight, *frostite* freezes water, and *voidstone* drinks light.
- **No tutorial.** You learn by experimenting. The **Index Book** records every mineral, plant, creature, weapon, recipe and mechanic as you discover it, with hints about where to look next.
- **Blacksmithing.** Smelt ore into ingots and alloys (bronze, steel), then forge weapons with a realistic heat → hammer → balance → quench process. Each metal has its own working temperatures. Special minerals can be infused into blades, and every weapon is graded from F to S.
- **Home.** Your isometric burrow uses tile-based building: furniture, floors and walls. It holds your forge, stove, bed, planters and a chicken coop.
- **Cooking.** A small first-person, Cooking Mama-style scene shows the mole's own paws chopping, stirring, frying and seasoning. Recipes are discovered by trying ingredient combinations, and dishes restore energy and give buffs.
- **Deep Town.** An animated underground town of chibi animal NPCs, mostly moles of many breeds, ages, body types and dirty outfits. It has shops for tools, food, furniture, blueprints and gear, plus an assay office with daily commissions and the ticket office.
- **Energy instead of hunger.** Digging, climbing and the deep heat and cold all use energy. If you faint, you lose part of your haul.

## Debug helpers

- URL params: `?scene=deep` (first person underground), `?scene=fall`, `?fresh=1` (ignore the save), `?gold=50000`, `?give=bioxide,iron_ingot`
- Type `motherlode` in game for +250,000 gold, `deepdive` to unlock every lift stop, or `fullbelly` to restore energy.
- `node scripts/shot.mjs "scene=deep&fresh=1" shots/out.png` takes a headless screenshot (see `docs/DEV_GUIDE.md`); `node scripts/e2e.mjs` and `node scripts/e2e-touch.mjs [--portrait]` play through the game headless.

## Tech

Three.js 0.185 and Vite 7, plain ES modules. The canvas renders at 540–720 lines and is upscaled with nearest-neighbor filtering. The underground is a seeded voxel world (1/8 m voxels in 32³ chunks) generated lazily around the player from a cheap world plan, greedy-meshed with per-vertex ambient occlusion and drawn by one pixel-art terrain shader (texels, rock plates and cracks, the helmet lamp and cave lights); dug voxels are saved run-length encoded. A post pass adds 1px outlines, ordered dithering and a light color grade. Audio is synthesized with the Web Audio API. Progress is saved to `localStorage`.
