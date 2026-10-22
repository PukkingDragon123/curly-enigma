# The remake: shared contract

The game is being remade in many parts at once. This file says what the story is now, how the
parts talk to each other, and who owns which files. Read it before you change anything, and keep
your section of it true when you finish (add an "As built" note under your part).
`docs/FPS.md` (first-person kit, lifts) and `docs/DEEP.md` (the mine) still hold.

## The story now

1. **Title.** A tough old-school blacksmith mole works his forge in a cave behind the menu (sparks,
   glow, hammer blows). The menu buttons are wooden signs hanging on chains that swing with 2D
   physics. **New Game / Continue** shows **three save stones**: an empty slot is a rough stone; the
   further that save has got, the more the stone has turned into a cut gem (with its percentage).
2. **The journey** (`fall` scene, cinematic). Up on the surface, a blacksmith adventurer mole
   (leather apron, goggles, a hammer, a pack) walks a beautiful forest trail. Beside him walks
   **Nugget's coop**: a little Baba Yaga hut on two big chicken legs, Nugget the hen peeking out of
   its window. In a clearing they find a **strange chest spilling gold and gems**. The mole steps
   closer, the ground sags, cracks, and gives way; he falls into the dark and **blacks out**.
   Ends with `goto('home', { from: 'fall' })`.
3. **Waking up** (`home`, now **Old Star's cave workshop**). Darkness, blurry eyes, then a bucket of
   **cold quench water** in the face: Old Star, an old star-nosed mole blacksmith, needed the water
   for his forge anyway. His home is a living cave: rough rock, drips, glow-worms, roots, the ruins
   of something older (carved arches, broken pillars), old mining gear (carts, rails, a winch), his
   forge and quench trough, a cooking hearth, his notes, his chest, a bed (yours now), and the cage
   lift down to the mine. He was this close to getting out: **he needed a million gold** for the
   way up, and he'll teach you so you can both make it.
4. **The lessons** (an interactive tutorial, quest chain `lessons`): **mining** (ride the lift down
   to his practice dig, `deep`), **forging** (his forge, `forge { tutorial: true }`), **cooking**
   (his hearth, `cooking { tutorial: true }`). Each scene shows Old Star's tips through the tutor
   (below) and advances the quest by acting (`act` events). Then free play: earn the million.
5. **Free play.** Big, dangerous Minecraft-like caves (dinosaur caverns, ravines, lakes, ruins with
   puzzles, old trails), monsters and an ecosystem, gems and ores to dig, mushrooms to pull,
   **NPC burrows you walk to** to trade (a trading post, an herbalist, **Rocco the shady raccoon**
   who buys weapons in his storage burrow), Deep Town (shops, assay, the ticket office: the 1M ending).
   Nugget follows you if you keep her fed; her coop carries your extra stuff; she can get stuck and
   you carry her. Skill points come from doing things; spend them in the skill tree in your book.

## Shared conventions (all parts)

- **Tutorials are wanted now.** DEV_GUIDE's "no tutorials" rule is replaced: Old Star's lessons are
  an interactive tutorial (learn by doing, he reacts to what you do; skippable by talking to him).
  Outside the lessons keep guidance light (tips, toasts, the objective line).
- **Keys** (first person): `E` use, `Space` jump, `C` crouch/dive, `Shift` run, mouse 0 tool,
  **mouse 2 or `F` hold = block** (combat), `Q` snack, `B` the book (quests, map, skills, index),
  `M` the book at the map, `I` backpack, `Esc` menu. Touch has buttons for each.

- **Activities are events.** Anything the player does emits `state.emit('act', { type, ... })`.
  Quests, skills, milestones and the map listen; nobody calls them directly. Types:
  `dig {mat, n}` · `ore {id, q, pristine}` · `gem {id, q}` · `forage {id, q}` · `smelt {id}` ·
  `forge {weapon, grade}` · `cook {dish, score}` · `kill {kind}` · `block {perfect}` ·
  `hurt {n, by}` · `explore {zone, biome, cell}` · `reach {place}` · `talk {npc}` ·
  `sell {id, gold, to}` · `buy {id, gold, from}` · `feed {who}` · `puzzle {id}` · `sleep` ·
  `blast` · `lesson {step}`. Add a type if you need one; write it here.
- **Old Star talks through the tutor** (`ui.tutor`, owned by the home part):
  `ui.tutor.say(html, { mood, key, wait })` (a speech card with his portrait; mood: `calm`,
  `happy`, `stern`, `proud`, `worried`, `laugh`), `ui.tutor.hide()`. Always call it as
  `game.ui.tutor?.say(...)` so scenes still run without it.
- **Objectives are quests** (`game.quests`, owned by the quests part): `quests.active()`,
  `quests.start(id)`, `quests.step(id)`, `quests.done(id)`; the objective line on screen is the
  tracked quest's current step. Scenes don't set objective text themselves.
- **Skills** (`state.skill(key)` → a multiplier ≥ 1, or 0 for perks not taken; owned by the skills
  part): keys `power rate glint clean block damage stamina cook forge sell forage carry lamp`.
  The mine multiplies them with the Miners' Board bonuses.
- **Modules, not rewrites.** Put your system in its own files. Touch shared files (`State.js`,
  `UI.js`, `DigScene.js`, `items.js`) only with small hooks, and re-read right before editing (other
  parts edit them at the same time). **`src/deep/DigScene.js` belongs to the lead**: if you need a
  hook there, write it in your report (what to call, where) or ask; don't edit it.
- **State.** New save data goes under your own key in `state.data` (default in `defaultData()`,
  fill missing keys on load so old saves work).
- **No git.** The lead commits. `npx vite build` must pass before you report. Test in the browser
  (`node scripts/shot.mjs`, see FPS.md › Testing) and look at your screenshots.
- **Report** (when done): what you built, files, test hooks (`scene.debug.*` etc.), hooks you need
  from the lead, screenshots (paths under `shots/<your-part>/`).

## Parts and owners

| Part | Owns |
|---|---|
| **Journey intro, surface, post shaders, lift menu, hero mole** | `src/scenes/FallScene.js`, `src/bookends/*` (not title files), `src/core/Engine.js` post, `src/fps/lifts.js`, `src/fps/liftPanel.*`, `src/gfx/char/hero.js` (the player mole: `makeHeroMole(opts)`) |
| **Title, save stones, hanging signs, menus** | `src/scenes/TitleScene.js`, `src/ui/signs.js`, the pause menu (`ui.openMenu`), `src/core/saves.js` (3 slots, `state.completion()`) |
| **Home: Old Star's cave workshop, waking up, tutor, forge lessons** | `src/scenes/HomeScene.js`, `src/home/*`, `src/iso/homeLayout.js`, `src/ui/Tutor.js`, the forge tutorial (`src/scenes/ForgeScene.js`, `src/forge/*`) |
| **Mining lessons in Old Star's dig** | `src/deep/Prologue.js`, `src/deep/prologue/*`, `src/deep/gen/prologue.js` |
| **Quests, the book, the hand-drawn map** | `src/core/quests.js`, `src/data/quests.js`, `src/ui/Journal.js` (the book shell with tabs), `src/ui/Survey.js` (the map), the objective tracker |
| **Skill tree** | `src/core/skills.js`, `src/data/skills.js`, `src/ui/SkillTree.js` (a tab in the book) |
| **Inventory and Nugget's walking coop** | `src/core/inventory.js`, `src/ui/Backpack.js`, `src/deep/Nugget.js`, `src/home/nugget.js`, `src/gfx/char/coop.js` (`makeCoop(opts)`), `src/gfx/char/chicken.js` |
| **Cooking and foraging** | `src/scenes/CookingScene.js`, `src/cooking/*`, `src/data/recipes.js`, `src/ui/Forage.js`, the harvesting part of `src/deep/Props.js` |
| **Monsters, ecosystem, combat** | `src/deep/Enemies.js`, `src/deep/enemies/*`, `src/data/creatures.js`, block poses in `src/fps/ViewModel.js` |
| **Characters, NPC burrows, traders** | `src/gfx/characters.js`, `src/gfx/char/*` (not hero/coop/chicken/starmole), `src/deep/gen/burrows.js`, `src/deep/Traders.js`, `src/data/shops.js` |
| **Ruins, trails, puzzles** | `src/deep/gen/ruins.js`, `src/deep/gen/trails.js`, `src/deep/Ruins.js` |
| **Deep Town** | `src/scenes/TownScene.js`, `src/town/*` |
| **Lead** | `src/deep/DigScene.js`, `Generator.js` (cave shapes, biomes, plan hooks), `World/Terrain/Mesher/Dig/Player/TerrainMaterial`, `scripts/e2e.mjs`, integration |

## Characters: expressions and taller folk (Deep Town part)

The Deep Town part also builds the characters (`src/gfx/characters.js`, `src/gfx/char/*` except
`hero.js`, `coop.js`, `chicken.js`, `starmole.js`). `makeCharacter(spec, opts)` keeps its API.
Every `CharacterRig` (so Old Star's `StarMoleRig` too) has:

```js
rig.setExpression(name, { hold, body })  // the face (brows, lids, mouth, cheeks) and, while idle/talking, a body gesture
//   names: neutral happy laugh sad angry surprised worried smug sleepy thinking
//   aliases: calm→neutral, joy→happy, stern→angry (milder), proud→smug, surprise→surprised,
//            scared→worried, tired→sleepy, think→thinking (so ui.tutor moods map straight on)
//   hold: seconds, then back to the mood; without hold the expression becomes the mood
//   body: false = face only (no gesture)
rig.setMood(name)          // the resting expression (default 'neutral'); rig.mood, rig.expression read them
rig.talk(on)               // true: the mouth talks (shaped by the expression) until talk(false);
                           // a number = talk for that many seconds (old API); no argument = 1.5 s
rig.lookAt(target)         // THREE.Vector3 (world) or Object3D (followed); null lets go. The head
                           // turns (clamped, smoothed) and the body follows if it is far round
rig.blink()                // blinks now (they also blink on their own, expression-aware)
```

- **Taller folk:** adults are built with longer bodies and legs (about 2.8 heads tall instead of 2):
  a townsfolk adult is ~1.6–1.7 rig units tall (≈1.0 m in Deep Town, was ≈0.82 m). Kids and babies
  stay small and round. Heads are unchanged, so neck-space anchors (`rig.anchors`, sunglasses,
  bubbles from `rig.height`) still work. `spec.player` (the old player mole) and `proportions(spec)`
  without options keep the classic build (Old Star and the hero are untouched); pass
  `makeCharacter(spec, { build: 'classic' })` to get the old shape.
- `renderPortrait(renderer, spec, size, { expression })` frames the head and shoulders.

## Plan hooks in the mine (lead)

`world.plan` gains lists the other parts stamp or populate (all meters, deterministic per seed):
- `plan.burrows: [{ id, kind: 'trader'|'herbalist'|'raccoon'|..., x, y, z, yaw, zone }]`
- `plan.ruins: [{ id, kind, x, y, z, yaw, r, zone, seed }]`
- `plan.trails: [{ id, pts: [{x,y,z}...], from, to }]` (old dug tunnels joining lifts, burrows,
  ruins and the town)
- biomes now include `4` **dino caverns** (huge caves, ferns, giant bones) for the creatures part.

Each is also a plan feature (`kind: 'burrow' | 'ruin' | 'trail'`, with a `bb`) whose voxels are
stamped by the owning part's `stamp*(f, vox, X0, Y0, Z0, CS)` (pure: it may run in a worker).

## Quests, the book and the map (quests part): what it listens for

`game.quests` (src/core/quests.js, data in src/data/quests.js) only listens to `act` events; emit
these and the quests move on their own (nothing else to call). Fields not listed are ignored.

- **Lesson steps** (`{ type: 'lesson', step }`, chain `lessons`, in this order). A later step
  completes every earlier one, so a part may skip steps it doesn't teach:
  `wake` (home: Old Star has woken you) · `lift` (home: you rode the cage down) · `dig` (mine:
  arrived in his practice dig) · `mine_rock` (first rock dug) · `mine_ore` (first ore clump freed) ·
  `mine_clean` (clump cleaned and bagged) · `mine_ladder` (ladder up / climbed out) · `mine_done`
  (mining lessons over) · `copper_home` (home: the copper handed to Old Star) · `forge_smelt`
  (first ingot) · `forge_done` (first weapon forged) · `cook_done` (first dish) · `skip` (talked
  him out of the rest: completes the chain).
- **Places** (`{ type: 'reach', place }`): `home`, `dig` (Old Star's dig), `town`, `burrow:<id>`
  (plan.burrows id: `burrow:trader`, `burrow:herbalist`, `burrow:raccoon`, `burrow:outpost`),
  `ruin:<id>` (plan.ruins id), `lift:<id>`.
- **NPC ids** (`talk {npc}`, `sell {to}`, `buy {from}`): `oldstar`, `trader`, `herbalist`,
  `rocco` (`raccoon` is accepted too), `outpost`, Deep Town keepers by shop id (`tools`, `grocer`,
  `assay`...). Talking to a burrow NPC offers their next request and hands over deliveries, so emit
  `talk` when the player opens their dialog. `quests.forNpc(npc)` → `{ lines: [html], offers,
  delivers }` gives quest lines a dialog may show (optional).
- **Weapons sold**: `sell { id: <weapon type>, weapon: { type, metal, grade, score }, gold, to }`.
- **Explore**: `explore { zone: 1..6, biome: BIOMES[i].id | null, cell: 'x,y,z' }` once per new cell.
- **New type**: `nest { id, kind, zone }` when a creature nest is cleared (monsters part).
- `puzzle { id }` (ruin id or puzzle id) when a ruin puzzle is solved.
- Rewards use `state.addSkillPoints?.(n)` (skills part).
