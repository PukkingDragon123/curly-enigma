# MOLEFORGE

*One million gold to the surface.*

You are a blacksmith adventurer mole, wandering the forest with Nugget the hen and her walking Baba Yaga coop. In a clearing you find a strange chest spilling gold and gems, and as you reach for it the ground gives way. You wake up deep underground with a bucket of cold quench water in your face: **Old Star**, an old star-nosed mole blacksmith, needed it for his forge anyway. He was this close to getting out: the way up costs **1,000,000 gold**. He'll teach you to mine, forge and cook, and together you'll earn it.

Moleforge is a pixel-art voxel game that runs in the browser, played in first person: mining in huge Minecraft-like caves, a blacksmith sim at the anvil, cooking minigames, foraging, trading with the folk who live down there, ruins with puzzles, monsters and dinosaurs. Every model, texture, sound effect and music track is generated in code. There are no asset files.

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
| Run / crouch (dive in water) | `Shift` / `C` |
| Dig / use tool | Left mouse (hold) |
| Block (combat) | Right mouse or `F` (hold) |
| Tools | `1`–`9` or mouse wheel (the build slot: `R` switches ladder / platform / block) |
| Interact (people, shops, lifts, plants, Nugget, puzzles; pick up / bag an ore clump) | `E` |
| Ore clump in your paws | Left mouse chips, right-drag turns, `G` drops (hold to throw), `E` bags it |
| Quick snack | `Q` |
| The book (quests, map, skills, index, notes) / map | `B` / `M` |
| Backpack / pause | `I` or `Tab` / `Esc` |
| Build mode (your room) | `X`, rotate with `R`, `F` stores |

On touch screens the left half of the screen is a floating stick and dragging the right half looks around; a big leather button digs or places (hold it), with jump, use, block, crouch, snack and next-tool buttons around it. The game works in landscape and portrait.

## What's in it

- **Three save stones.** Each save slot is a stone on a ledge that turns into a cut gem as that game gets closer to the end. The menu is wooden signs hanging on chains that swing when you touch them, in front of a blacksmith mole hammering at his forge.
- **The journey.** A forest trail at golden hour, the hero and Nugget's coop on its chicken legs, a stream, the chest in the clearing, the ground giving way, the fall and the blackout.
- **Old Star's cave workshop.** Your new home: a living cave with drips and glow-worms, his forge and quench trough, the hearth, old ruins, mining gear, his notes and chest, your bed, and the cage lift down to the mine. Old Star works, cooks, smokes his pipe and snores.
- **An interactive tutorial.** Old Star takes you down to his practice dig (dig around ore, chip a clump clean, find a gem, fetch his map, learn to block), then talks you through smelting and forging a copper dagger and cooking a glowcap soup. Talk to him to skip it.
- **Huge caves.** Winding cave ways, crawlways you crouch through, pillared halls tens of meters across, deep ravines, and **dinosaur caverns** of ferns and giant bones. Biomes: mossy grottos with hanging vines, sandstone hollows, mushroom hollows with glowcaps taller than a mole. Rock is 1/16 m voxels and the pick bites round craters out of it.
- **Gems and ore.** Ore glints through the rock and twinkles on the cave walls; hidden geodes hold gems on their inner walls. Ore breaks out as clumps you chip clean for full value.
- **Old trails and ruins.** Hand-dug tunnels with timber frames, rails, lanterns, signposts, cave-ins and plank bridges join the lifts, the burrows and Deep Town. Ruins of the old ones (a pillared hall, a star shrine, a sealed vault, a drowned well) hide treasure behind puzzles: levers, a hidden switch, symbol drums, light beams and mirrors, pressure plates, a drain valve.
- **Monsters and an ecosystem.** Goblins and kobold miners, cave trolls, giant spiders, wraiths, slimes, drakes, crystal-back golems (mine the crystal off their back) and dinosaurs: raptors that hunt in packs, a cave tyrant, grazers and pterosaurs. Grazers eat moss, predators hunt them, scavengers clean up. Block their telegraphed attacks; a perfect block parries.
- **Foraging.** Pull mushrooms, roots and herbs out of the cave with little hands-on minigames: mind the tension, wiggle the roots loose, don't snap the stem.
- **Cooking.** 32 real recipes, each a chain of minigames (chop, simmer, grate, roll, bake, flip, mash...). Dishes give timed buffs: faster swings, stronger blows, warmth in the Frost Vault, luck with gems, a higher jump.
- **NPC burrows.** Walk the trails to the trading post, the herbalist's hollow and the deep outpost, and sell your weapons to **Rocco**, a shady raccoon with a storage burrow, a haggling meter and a secret door.
- **Deep Town.** A cavern village of chibi folk with faces that smile, frown, gossip and startle, shops, the assay office and the ticket office (the way up: 1,000,000 gold).
- **Nugget's walking coop.** Feed her and her coop follows you through the tunnels, carrying your extra finds; she sulks when hungry, gets stuck on ledges and in crawlways, and you carry her.
- **Inventory like Minecraft.** Six pockets to start; backpacks add rows. Drag, split and sort; what doesn't fit waits in the trunk at home.
- **Quests, the book and the map.** Old Star and the burrow folk give quests that advance as you play. The leather book holds your quests, Old Star's notes, the Index, the skill tree and a hand-drawn map that is only inked where you have actually walked.
- **Skill tree.** Mining, smithing, cooking, combat, exploring, foraging and trading earn XP from doing them; spend the points on 78 skills stamped into the book with wax seals.
- **Progression.** The Miners' Board (upgrades with gold), a ladder of pickaxes, dynamite, milestones, and a tavern income at home.
- **Blacksmithing.** Smelt ore into ingots and alloys, then forge weapons with a heat → hammer → balance → quench process; every weapon is graded from F to S.

## Debug helpers

- URL params: `?scene=deep` (first person underground), `?scene=fall`, `?scene=home&from=fall` (waking up), `?fresh=1` (ignore the save), `?gold=50000`, `?give=bioxide,iron_ingot`, `?bag=48` (a big backpack)
- Type `motherlode` in game for +250,000 gold, `deepdive` to unlock every lift stop, or `fullbelly` to restore energy.
- `node scripts/shot.mjs "scene=deep&fresh=1" shots/out.png` takes a headless screenshot (see `docs/DEV_GUIDE.md`); `node scripts/e2e.mjs` and `node scripts/e2e-touch.mjs [--portrait]` play through the game headless.

## Tech

Three.js 0.185 and Vite 7, plain ES modules. The canvas renders at 540–720 lines and is upscaled with nearest-neighbor filtering. The underground is a seeded voxel world (1/16 m voxels in 32³ chunks, generated and meshed in web workers) built lazily around the player from a world plan (caves, biomes, trails, burrows, ruins, geodes), greedy-meshed with per-vertex ambient occlusion and drawn by one pixel-art terrain shader (texels, rock plates and cracks, the helmet lamp and cave lights); dug voxels are saved run-length encoded. A post pass adds 1px outlines, ordered dithering, bloom, god rays and a per-scene color grade. Audio is synthesized with the Web Audio API. Progress is saved to `localStorage`, in three save slots.
