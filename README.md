# MOLEFORGE

*One million gold to the surface.*

You are a very dirty mole who fell down a sinkhole into an old burrow deep underground, along with your chicken, Nugget. A one-way **Surface Express** ticket costs **1,000,000 gold**. Dig for ore, forge it into weapons, sell everything, and when you can finally afford the ticket, go up to the surface and take a beach vacation with your chicken, Nugget.

Moleforge is a pixel-art voxel game that runs in the browser. It's played entirely in first person: voxel mining, a medieval blacksmith sim at your own anvil, cooking, building your burrow, and a cozy underground town. Every model, texture, sound effect and music track is generated in code. There are no asset files.

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
| Look around | Mouse (click the view to capture it, `Esc` frees it) |
| Jump / climb a wall | `Space` (hold it against a wall to climb) |
| Run | `Shift` |
| Dig / use tool | Left mouse (hold) |
| Tools | `1`–`8` or mouse wheel (slot 7 builds: `R` switches ladder / platform / block) |
| Interact (doors, lifts, shops, people, furniture; pick up / bag an ore clump) | `E` |
| Ore clump in your paws | Left mouse chips, right-drag turns, `G` drops (hold to throw), `E` bags it |
| Quick snack | `Q` |
| Map | `M` (or click the radar) |
| Index Book / Backpack / Journal | `B` / `I` or `Tab` / `Esc` |
| Build mode (home) | `X`, rotate with `R`, `F` stores |

On touch screens the left half of the screen is a floating stick and dragging the right half looks around; a big leather button digs or places (hold it), with jump, use, snack and next-tool buttons around it. Tap the backpack or the Index Book in the corner to open them, and the radar for the map. The game works in landscape and portrait.

## What's in it

- **It starts with a fall.** A sunny meadow, a sinkhole that gives way, and a long tumble down a shaft of roots, fossils, a waterfall and a glow-worm grotto, crashing through the roof of an abandoned burrow with Nugget. The door to town is caved in and the hole is far too high to climb: walk up to any wall of the house and dig your way out.
- **First-person mining in a 3D voxel underground.** Your own furry paws hold the pick, chisel, brush, drill and lamp. Rock is made of eighth-meter voxels drawn as pixel art, split into plates along visible cracks: each blow lands on the plate under the crosshair and, when it gives, the plate crumbles out of the wall as tumbling chunks and grit. Tunnel anywhere: down, sideways, into caverns, lava lakes and flooded caves. The world is generated lazily around you, remembers every voxel you dug, and the tunnels you dig from the house stay open as doorways in its walls.
- **Living caves.** Every depth zone dresses its caves differently: glowing mushrooms and hanging roots, bones and fossils in the clay, crystal clusters and glow-worm threads, obsidian spikes and ember vents, icicles, floating void shards. Old miners left rail camps, carts, ladders, lanterns and signposts pointing to town. Plants grow where they belong and can be picked for cooking. Dig into a lake and the water pours out and floods your tunnel; lava oozes, cools to rock and turns to obsidian in a burst of steam where water meets it. Surfaces wobble like jelly, splashes bounce, drips fall from the ceilings and lava lights the cave.
- **Radar and survey map.** A brass radar shows the tunnels you've explored, the way to Deep Town, home, ore areas nearby, danger zones (lava, floods, nests, gas) and lift stations. The survey map lets you look at any depth.
- **Fantasy creatures.** Pebble mimics and rubble golems sleep as rock until you get close, gloom wisps drain your light, ember imps lob bouncing fireballs, crystal wyrmlings coil and lunge, spore puffers sneeze stinging clouds and shade bats swoop at your lamp. They telegraph every attack, squash and stretch, and burst into tumbling voxel chunks. Harmless critters live among them: grab worms and glow beetles, net cave fish, brush dust bunnies and gem tortoises, x-ray a void wisp.
- **Nugget comes along.** The hen trots after you through the tunnels, hops up ledges, flutters down drops and clucks at ore showing in the rock.
- **Your burrow, in first person.** A cozy timber-framed room with a crystal window, a light shaft from the hole you fell through, lanterns and clutter, every tunnel you dug, and an old cage lift in the corner that rides down to the mine. Decorate in first person: a ghost of the furniture snaps to the floor or wall where you look, green when it fits.
- **Lifts.** Old miners' lifts are buried in every zone. Dig to one, ring its bell, and it's yours: ride home when your energy runs low, and come back down to it later. The radar picks up the faint signal of lifts you haven't found yet.
- **Ore clumps.** Ore breaks out of the wall wrapped in its rock. Pick it up and it floats in your paws as a finely detailed model: turn it, chip the rock away with the chisel, sweep the dirt with the brush (the pick is fast but scratches the ore), and bag it. A spotless, unscratched clump is worth full value and counts as pristine.
- **Build underground.** Ladders (climb out of any hole for free), plank platforms and brick blocks.
- **Deep Town, in first person.** A cavern village with a glow-worm ceiling and a sunbeam on the Surface Express booth, shops with keepers behind their counters, townsfolk who walk, chat, fish and wave, a fountain, a lift tower over a deep pit.
- **Forging, in first person.** Your paws hold the billet in tongs while you pump the bellows, swing the hammer where you aim on the glowing bar, and plunge it into the quench barrel in a burst of steam.
- **Almost no interface.** Everything on screen is an object. Your gold is a coin pouch that drops in when it changes, energy is a lantern flame, buffs are charms, and the day is a tear-off calendar. Your tools hang on a leather belt that tucks away to just the one in your paw. The backpack in the corner fills and bulges as you dig, and the Index Book leans against it. The backpack opens into leather pockets with paper tags on every item. The Index Book has sketches and charcoal silhouettes, with pages that turn in 3D. Shops have hanging signs, the keeper's portrait, shelves and price tags, and the assay office weighs your ore on a brass scale. Messages are notes pinned with a tack, prompts are chalk slates, and the pause menu is a little green journal.
- **Careful extraction.** Ore hides inside rock until you uncover it or see it glowing through the rock with the X-ray lamp. Hitting ore with a pick or drill chips its quality, and heavy blows shake fragile ore nearby. Clear the rock around a deposit and it pops out of the wall and flies into your backpack; chisel or brush it free and it stays *pristine*. Tools: pickaxe, chisel, brush, drill (which overheats), X-ray lamp and glow stakes.
- **Six depth zones:** Rootsoil, Clayworks, Crystal Grotto, Magma Deep, Frost Vault and The Core. They hold 29 minerals and gems, 15 plants and 15 creatures, many with their own behavior:
  - *Bioxide* zaps bare paws and explodes when struck; rubber gloves protect you.
  - *Gravium* falls upward, *echo crystal* shatters from vibration, *moonsilver* tarnishes in air, and *starmetal* pulls loose metal toward it.
  - *Magmaite* sets things alight, *frostite* freezes water, and *voidstone* drinks light.
- **No tutorial.** You learn by experimenting. The **Index Book** records every mineral, plant, creature, weapon, recipe and mechanic as you discover it, with hints about where to look next.
- **Blacksmithing.** Smelt ore into ingots and alloys (bronze, steel), then forge weapons with a realistic heat → hammer → balance → quench process. Each metal has its own working temperatures. Special minerals can be infused into blades, and every weapon is graded from F to S.
- **Home.** Tile-based building with furniture, floors and walls: your forge, stove, bed, planters and a chicken coop.
- **Cooking.** A small first-person, Cooking Mama-style scene shows the mole's own paws chopping, stirring, frying and seasoning. Recipes are discovered by trying ingredient combinations, and dishes restore energy and give buffs.
- **Townsfolk and shops.** Chibi animal NPCs, mostly moles of many breeds, ages, body types and dirty outfits. Shops for tools, food, furniture, blueprints and gear, an assay office with daily commissions, and the ticket office.
- **Energy instead of hunger.** Digging, climbing and the deep heat and cold all use energy. If you faint, you lose part of your haul.

## Debug helpers

- URL params: `?scene=deep` (first person underground), `?scene=fall`, `?fresh=1` (ignore the save), `?gold=50000`, `?give=bioxide,iron_ingot`
- Type `motherlode` in game for +250,000 gold, `deepdive` to unlock every lift stop, or `fullbelly` to restore energy.
- `node scripts/shot.mjs "scene=deep&fresh=1" shots/out.png` takes a headless screenshot (see `docs/DEV_GUIDE.md`); `node scripts/e2e.mjs` and `node scripts/e2e-touch.mjs [--portrait]` play through the game headless.

## Tech

Three.js 0.185 and Vite 7, plain ES modules. The canvas renders at 540–720 lines and is upscaled with nearest-neighbor filtering. The underground is a seeded voxel world (1/8 m voxels in 32³ chunks) generated lazily around the player from a cheap world plan, greedy-meshed with per-vertex ambient occlusion and drawn by one pixel-art terrain shader (texels, rock plates and cracks, the helmet lamp and cave lights); dug voxels are saved run-length encoded. A post pass adds 1px outlines, ordered dithering and a light color grade. Audio is synthesized with the Web Audio API. Progress is saved to `localStorage`.
