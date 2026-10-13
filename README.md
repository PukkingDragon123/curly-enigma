# MOLEFORGE

*One million gold to the surface.*

You are a very dirty mole stuck deep underground. A one-way **Surface Express** ticket costs **1,000,000 gold**. Dig for ore, forge it into weapons, sell everything, and when you can finally afford the ticket, go up to the surface and take a beach vacation with your chicken, Nugget.

Moleforge is a pixel-art voxel game that runs in the browser. It combines a side-view mining game with a medieval blacksmith sim, cooking, home building and a cozy underground town. Every model, texture, sound effect and music track is generated in code. There are no asset files.

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
| Move | `A` `D` (`W` `S` in town and home) |
| Jump / climb walls | `W` / `Space` (moles grip dirt) |
| Dig / use tool | Left mouse (hold) |
| Grab, harvest, catch | Right mouse |
| Tools | `1`–`8` or mouse wheel |
| Interact | `E` |
| Quick snack | `Q` |
| Index Book / Bag / Menu | `B` / `I` / `Esc` |
| Build mode (home) | `X`, rotate with `R` |

On touch screens, on-screen buttons appear. Tap the world to dig or aim.

## What's in it

- **Mining in a flat 2D side view of 3D voxel rock.** The camera never rotates. Rock cracks, chips and shatters into physical debris. Dust hangs in the lamplight. Ceilings creak and cave in when you dig too wide, so place support beams. Sand and rubble pour down, water and lava flow and react, and fire spreads through roots and coal. Everything is lit by a colored light grid with real shadows.
- **Careful extraction.** Ore hides inside rock until it's exposed, brushed or X-rayed. Hitting ore with a pick or drill chips its quality, and heavy blows shake the ore next to them. A chisel removes the rock around ore safely, and brushing a loosened find out keeps it *pristine*. Tools: pickaxe, chisel, brush, drill (which overheats), X-ray lamp, support beams and glow stakes.
- **Six depth zones:** Rootsoil, Clayworks, Crystal Grotto, Magma Deep, Frost Vault and The Core. They hold 29 minerals and gems, 15 plants and 15 creatures, many with their own behavior:
  - *Bioxide* zaps bare paws and explodes when struck; rubber gloves protect you.
  - *Gravium* falls upward, *echo crystal* shatters from vibration, *moonsilver* tarnishes in air, and *starmetal* pulls loose metal toward it.
  - *Magmaite* sets things alight, *frostite* freezes water, and *voidstone* drinks light.
  - Ore slugs eat your ore, bats wake in lamplight, rock crabs pinch, and a void wisp can only be caught with an X-ray beam.
- **No tutorial.** You learn by experimenting. The **Index Book** records every mineral, plant, creature, weapon, recipe and mechanic as you discover it, with hints about where to look next.
- **Blacksmithing.** Smelt ore into ingots and alloys (bronze, steel), then forge weapons with a realistic heat → hammer → balance → quench process. Each metal has its own working temperatures. Special minerals can be infused into blades, and every weapon is graded from F to S.
- **Home.** Your isometric burrow uses tile-based building: furniture, floors and walls. It holds your forge, stove, bed, planters and a chicken coop.
- **Cooking.** A small first-person, Cooking Mama-style scene shows the mole's own paws chopping, stirring, frying and seasoning. Recipes are discovered by trying ingredient combinations, and dishes restore energy and give buffs.
- **Deep Town.** An animated underground town of chibi animal NPCs, mostly moles of many breeds, ages, body types and dirty outfits. It has shops for tools, food, furniture, blueprints and gear, plus an assay office with daily commissions and the ticket office.
- **Energy instead of hunger.** Digging, climbing and the deep heat and cold all use energy. If you faint, you lose part of your haul.

## Debug helpers

- URL params: `?scene=mine&zone=3`, `?fresh=1` (ignore the save), `?gold=50000`, `?give=bioxide,iron_ingot`, `?overview=1` (in the mine)
- Type `motherlode` in game for +250,000 gold, `deepdive` to unlock every lift stop, or `fullbelly` to restore energy.
- `node scripts/shot.mjs "scene=mine&zone=2" shots/out.png` takes a headless screenshot (see `docs/DEV_GUIDE.md`).

## Tech

Three.js 0.185 and Vite 7, plain ES modules. The canvas renders at about 1/3 resolution and is upscaled with nearest-neighbor filtering. A post pass adds 1px outlines, ordered dithering and a light color grade. Audio is synthesized with the Web Audio API. Progress is saved to `localStorage`.
