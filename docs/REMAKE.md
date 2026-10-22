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
  `blast` · `lesson {step}` · `relic {id, ruin}` (a relic from a ruin's chest; `puzzle` also carries
  `kind, ruin, zone`). Add a type if you need one; write it here.
- **Old Star talks through the tutor** (`ui.tutor`, owned by the home part):
  `ui.tutor.say(html, { mood, key, wait })` (a speech card with his portrait; mood: `calm`,
  `happy`, `stern`, `proud`, `worried`, `laugh`), `ui.tutor.hide()`. Always call it as
  `game.ui.tutor?.say(...)` so scenes still run without it.
- **Objectives are quests** (`game.quests`, owned by the quests part): `quests.active()`,
  `quests.start(id)`, `quests.step(id)`, `quests.done(id)`; the objective line on screen is the
  tracked quest's current step. Scenes don't set objective text themselves.
- **Skills** (`state.skill(key)` → a multiplier ≥ 1, or 0 for perks not taken; owned by the skills
  part): keys `power rate glint clean block damage stamina cook forge sell forage carry lamp`
  (and more: see "Skill tree: as built" below). **≥ 1 always means better**: where a smaller
  number is better (swing interval, scratch loss, damage taken) divide by it.
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
| **Title, save stones, hanging signs, menus** | `src/scenes/TitleScene.js`, `src/bookends/title*.js` (forge diorama, smith, props, save stones), `src/ui/signs.js`, the pause menu (`ui.openMenu` → `src/ui/PauseMenu.js`, also the shared Settings board), `src/core/saves.js` (3 slots, `state.completion()`) |
| **Home: Old Star's cave workshop, waking up, tutor, forge lessons** | `src/scenes/HomeScene.js`, `src/home/*`, `src/iso/homeLayout.js`, `src/ui/Tutor.js`, the forge tutorial (`src/scenes/ForgeScene.js`, `src/forge/*`) |
| **Mining lessons in Old Star's dig** | `src/deep/Prologue.js`, `src/deep/prologue/*`, `src/deep/gen/prologue.js` |
| **Quests, the book, the hand-drawn map** | `src/core/quests.js`, `src/data/quests.js`, `src/ui/Journal.js` (the book shell with tabs), `src/ui/Survey.js` (the map), the objective tracker |
| **Skill tree** | `src/core/skills.js`, `src/data/skills.js`, `src/ui/SkillTree.js` (a tab in the book) |
| **Inventory and Nugget's walking coop** | `src/core/inventory.js`, `src/ui/Backpack.js` (+ `invGrid.js`, `invArt.js`, `backpack.css`), `src/deep/Nugget.js`, `src/home/nugget.js`, `src/gfx/char/coop.js` (`makeCoop(opts)`), `src/gfx/char/chicken.js` |
| **Cooking and foraging** | `src/scenes/CookingScene.js`, `src/cooking/*`, `src/data/recipes.js`, `src/ui/Forage.js`, the harvesting part of `src/deep/Props.js` |
| **Monsters, ecosystem, combat** | `src/deep/Enemies.js`, `src/deep/enemies/*`, `src/data/creatures.js`, block poses in `src/fps/ViewModel.js` |
| **NPC burrows and traders** (Rocco the raccoon too) | `src/deep/gen/burrows.js`, `src/deep/Traders.js`, `src/deep/traders/*`, `src/data/shops.js` |
| **Ruins, trails, puzzles** | `src/deep/gen/ruins.js`, `src/deep/gen/trails.js`, `src/deep/Ruins.js` |
| **Deep Town and characters** (chibi folk, expressions) | `src/scenes/TownScene.js`, `src/town/*`, `src/gfx/characters.js`, `src/gfx/char/*` (not hero/coop/chicken/starmole) |
| **Lead** | `src/deep/DigScene.js`, `Generator.js` (cave shapes, biomes, plan hooks), `World/Terrain/Mesher/Dig/Player/TerrainMaterial`, `scripts/e2e.mjs`, integration |

## Characters: expressions (Deep Town part)

The Deep Town part also builds the characters (`src/gfx/characters.js`, `src/gfx/char/*` except
`hero.js`, `coop.js`, `chicken.js`, `starmole.js`). `makeCharacter(spec, opts)` keeps its API.
Every `CharacterRig` (so Old Star's `StarMoleRig` too) has:

```js
rig.setExpression(name, { hold, body })  // the face (brows, lids, mouth, cheeks) and, while idle/talking, a body gesture
//   names: neutral happy laugh sad angry surprised worried smug sleepy thinking, plus stern
//          (a milder angry: squint, flat mouth) and asleep (eyes shut, snoring, head nodding)
//   aliases: calm→neutral, joy→happy, proud→smug, surprise/shock→surprised, scared/nervous→worried,
//            tired→sleepy, think/puzzled→thinking, grumpy→stern (so ui.tutor moods map straight on)
//   hold: seconds, then back to the mood; without hold the expression becomes the mood
//   body: false = face only (no gesture)
rig.setMood(name)          // the resting expression (default 'neutral'); rig.mood, rig.expression read them
rig.talk(on)               // true: the mouth talks (shaped by the expression) until talk(false);
                           // a number = talk for that many seconds (old API); no argument = 1.5 s
rig.lookAt(target)         // THREE.Vector3 (world) or Object3D (followed); null lets go. The head
                           // turns (clamped, smoothed), the shoulders a little; nothing right behind
rig.blink()                // blinks now (they also blink on their own, expression-aware)
```

- **Chibi folk (the default).** The player asked for the old cute, blocky chibi style, so
  `makeCharacter` builds the classic rig unless asked otherwise (`opts.build` / `spec.build`).
  The chibi build gets the expressions and the tailoring that suits it: shirts under overalls and
  aprons, button plackets and chest pockets, belts with brass buckles (and a little pouch),
  watch chains, a tuft of chest fur at open collars. Gestures are made for short chibi arms (paw to
  the chin, paws wringing, paws on the belly, paws tucked behind a proud back).
- **The tall build** (`build: 'tall'`: about 2.8 heads tall, elbows and knees, boots, rolled
  sleeves, hands with thumbs) still exists for whoever asks for it; nothing in Deep Town uses it.
  Heads are the same in both builds, so neck-space anchors (`rig.anchors`) work either way.
- `renderPortrait(renderer, spec, size, { expression })` frames the head and shoulders.
- `EXPRESSIONS` (exported from `characters.js`) lists the names.

**As built (characters).** Files: `src/gfx/char/expr.js` (the expression table: eye lids, mouth
shapes, brow lift/tilt per side, extras, talking mouths, and each expression's body gesture),
`src/gfx/char/jointed.js` (the tall build's two-part limbs: shoulder caps, sleeves with seams and
buttoned cuffs or rolled past the elbow, small hands with a thumb and nails or the moles' spade paws
with knuckles, pads and claws, thighs with trouser pockets, shins with rolled cuffs, knee patches,
laced work boots with soles and toe caps), `rig.js` (expressions, joints, talk, lookAt),
`face.js` (new lids `smile wide smug drowsy up squint`, new mouths, `soft` brows for everyone,
the extras `blush tear sweat vein`), `body.js` (a grown-up torso with chest, waist and hips;
under-shirts beneath overalls/aprons, button plackets, chest pockets with a pencil, belts with
brass buckles and loops, tool belts with a pouch and a hammer, watch chains, chest-fur tufts and a
ragged fur fringe), `head.js` (spots for the extras in `info.expr`), `spec.js` (`proportions(spec,
{ build })`, new optional spec fields `shirt rolled belt boots mood build`, from a third random
stream so old seeds keep their look).
- Faces: lids, mouths and brows switch per expression; blinks are natural (double blinks, slow and
  heavy when sleepy, none for a moment when startled, a blink on every change of face); talking
  mouths are shaped by the expression (smiling, snarling, wailing, gasping); sleepy folk yawn,
  sleepers snore; blush, tears that slide down, a sweat drop and a throbbing anger mark; ears and
  whiskers droop or perk. Gestures (idle, talking, sitting): a happy bounce, paws on the belly
  laughing, a sad sigh and droop, angry fists and a stomp, a startled jump with paws up, wringing
  paws, paws on hips (smug), nodding off, paw to the chin (thinking). Talkers beat a paw.
- The tall build adds `rig.elbowL/R`, `rig.kneeL/R` (walks bend the knees, runs tuck the elbows),
  `rig.seatY` (seat height in rig units: sitting folk reach the floor or dangle their feet),
  `rig.fx`, `rig.build`. Classic rigs (Old Star, the hero, `spec.player`) have no joints and pose
  exactly as before, but get the whole expression API (their own mouth sets fall back sensibly).
- A chibi townsperson is ~13k triangles (a tall one ~18–22k); the town's `RigLOD` snaps far folk to
  2 and 4 voxels and keeps every face variant.

## Deep Town (as built)

- **Folk with faces** (`src/town/folk.js`, `src/town/moods.js`): every townsperson has a resting
  mood for their role (cheerful vendors, grumpy old Hollis, sleepy miners, a thinking fisher, a
  badger asleep on the bench...), looks at you when you come close, lights up (or startles) when
  you walk up, talks with a face read from the line, startles then glares or frets when you bump
  into them, and acts out their little scenes with expressions (the fisher's bite, catch and miss,
  the tag kids' laugh and outrage, gossip pairs reacting to each other, the miners' relief).
- **Keepers** (`TownScene`): tempers per shop (`KEEPER_MOODS`), extra tailoring (`KEEPER_LOOKS`),
  they look at you, greet you with a face, and react while their shop is open to money changing
  hands (`state` `gold` events, and `act` `buy`/`sell` when those are emitted): a happy hop for a
  sale, a laugh or a gasp for a big one, a wave goodbye. Each stands so its eyes sit in the upper
  part of the serving window (whatever its height); the lamp over the keeper is softer and sits in
  front of the face so faces read. Folk on the plaza benches sit on the slats (`seat.top`), their
  bubbles anchored at the sitting head. The fountain's "toss a coin" target is the basin only, so the folk on the
  benches round it can be talked to.
- **Props at 1/32** (`src/town/props.js`): broom, lute, fishing rod, ore crate.
- **Performance**: the previous agent's static batching and patch LOD (`src/town/batch.js`,
  `lod.js`; `?nolod=1`, `?tstats=1`, `?l1gain=`) are kept; hidden folk animate every 6th frame and
  folk behind the camera every 3rd (time accumulates). Fixed in it: far patches' 16-bit positions
  could wrap round when snapping pushed a vertex outside its frame (long slivers across the sky);
  frames are padded and clamped now. Meshes can opt out of simplifying (`userData.lod = 'keep'`):
  the shop sign boards do, so their signs stay readable far off. The lift: alpha-tested pixel lattice panels,
  a timbered shaft with rails, a ladder and cables fading into the dark.
- **Test hooks** (`scene.debug`): `useLift(id)`, `run(sec)`, `skipArrival()`, `place(x, y, z, yaw,
  pitch)` (town units), `talkTo(name)`, `openShop(id)`, `goHome()`, `perf()`, `patches()`, `names()`.
  Townsfolk are `scene.folk.list` (`{ a: actor, role, mood, name }`; `a.rig.expression`), keepers
  `scene.keepers`.

## The hero mole (journey part): `makeHeroMole`

The player as a blacksmith adventurer: scorched leather apron, tool belt, rust-red shirt with the
sleeves rolled over big forearms (a bracer, a wrap), brass goggles pushed up on the forehead,
heavy brows and a smirk, boot wraps, a travel pack (bedroll, rope, pot, lantern) and a big
cross-peen smithing hammer. One skinned mesh like every character (`src/gfx/char/hero.js`).

```js
import { makeHeroMole } from '../gfx/char/hero.js';
const rig = makeHeroMole({ height: 0.86, pack: true, hammer: true, goggles: 'up', kind: 'toon' });
scene.add(rig.root); rig.play('walk'); rig.face(yaw); rig.update(dt); /* exit: */ rig.dispose();
```

- `height`: top of the head without goggles/cowlick (meters at FPS scale; default 0.86).
  It is a `CharacterRig`: `play face talk doEmote holdItem update dispose root height anchors neck
  handL handR` all work, and so does every base state.
- His own or reworked states: `idle` (sturdy stance, hammer on the shoulder) · `walk`/`run`
  (swagger, hammer on the shoulder) · `hammer` (one-handed forging blows: drive `rig.swingPhase`
  0..1 yourself, impact at 0/1, or set `rig.autoSwing = blowsPerSecond` and
  `rig.onStrike = (faceWorldPos) => sparks()`) · `fall` (tumbling, flailing) · `brace` (the ground
  moves: knees bent, arms out) · `reach` (left paw reaching forward) · `peer` (looking down at his
  feet) · `pose` (hammer head planted, chin up) · `lie` (flat on his back, out cold).
- `rig.setHammer('shoulder' | 'hand' | 'back' | 'none' | null)` (null = automatic by state; holding
  something in the right paw moves it to his back), `rig.setPack(on)`, `rig.setGoggles('up' |
  'down')` (down over the eyes for forging), `rig.look(yaw, pitch)` (head turn, smoothed),
  `rig.headWorld(out)` (above the head, for bubbles), `rig.hammerFaceWorld(out)` (the striking face,
  for sparks). In `hammer` the left paw is held out front (put tongs in it with `holdItem(obj, 'L')`).
  At impact the hammer face is about (0.10, 0.19, 0.56) from his feet in root space (facing +z,
  height 0.86; it scales with height): put the anvil's top there. ~24k triangles, 2 meshes.
- `bookends/actors.js` `makeMole()` now returns the hero at the classic player size (1.375 units,
  no pack), so the ending's ride and beach show him too (sunglasses still fit).

## Journey intro, surface, post shaders, lift map (journey part): as built

**The journey** (`src/scenes/FallScene.js`, ~37 s, skippable by Skip / Esc / a tap): golden hour
on an old forest trail (`src/bookends/forest.js`). A crane down the trail into the sun, a tracking
shot of the hero and Nugget's coop (`makeCoop`, loaded with `import.meta.glob`; a stand-in hut in
`bookends/journey.js` if the file is ever missing), the stream: he takes the log footbridge, the
coop wades and splashes. The clearing: the strange chest glints in a beam of light, he stops,
stares, Nugget squawks, he walks up and reaches for it. The crust sags, cracks race over the
clearing, it breaks, the chest and a shower of coins and gems go down with him, a fall down the
dark shaft (`bookends/fallshaft.js`, streamed in while they walk) seen from below against the
shrinking hole, then darkness: muffled hearing (a lowpass on the master bus, restored on exit), a
slowing heartbeat, a few heavy blinks (iris) at the speck of light far above. Ends with
`goto('home', { from: 'fall' })`.
- Files: `bookends/forest.js` (layout: trail, stream, clearing; terrain, trees, undergrowth, props,
  light shafts, mist, birds, butterflies, backdrop treelines), `forestfx.js` (sun-dapple toon
  material keyed to a canopy-openness map, the stream shader, mist sheets), `foresttrees.js` (tall
  pines at two levels of detail, stump, footbridge, signpost; chunked instancing), `chest.js` (the
  chest, the spill, the breakable crust, the crack decal), `journey.js` (coop loader, birdsong,
  heartbeat, muffle). The old meadow (`bookends/meadow.js`) is gone; `landscape.js` and
  `meadowfx.js` are still used for oaks, birches, bushes, grass and sprites.
- Phones (and the 'Simple'/'Off' shader levels) get a lighter forest (`buildForest({ lite })`).
- Test hooks: `?scene=fall&at=secs` (start later), `&freeze=1`, `&lite=1`;
  `scene.debug.{ at(secs), time(), shot(), state(), skip() }`. `scene.skip()` is safe at any time
  (if it lands mid-transition it waits for it, then leaves for `home`).

**Post shaders** (`src/core/Engine.js`). On top of outlines, dither and vignette: bloom (quantized,
dithered halos), god rays (`raysDir` toward a sun, `raysPos` toward a lamp or a hole, or
`raysScreen`), a lift/gamma/gain grade (`post.grade` = a `GRADES` name or `{lift, gamma, gain}`,
`gradeMix`, `mixGrade(a, b, t)`), chromatic `fringe` and `underwater` (wobble + murk). Keys and
defaults are documented on `DEFAULT_POST`. The glow runs as two 1/4-res passes and is skipped when
bloom and rays are 0.
- Every scene gets its own light by default (`SCENE_POST` in Engine.js: home 'tavern', deep
  'deep', town 'town', forge 'forge', cooking 'warm', title 'tavern'); a scene's own `post` keys
  win. One hook in `Game.goto`: `this.engine.sceneName = name`.
- Quality: `engine.setFx('high' | 'low' | 'off')` (saved per device; `?fx=` overrides; touch
  devices default to 'low': 4-tap prefilter, half-length rays). A settings menu can offer it.
- `ZONE_GRADES[zone]` gives each mine stratum its own grade (see the lead hooks below).

**The lift map** (`src/fps/liftPanel.js`/`.css`, opened by `openLiftPanel` in `lifts.js`): a
scrolling pixel-art cross-section of the earth. On top the forest and its clearing with the chest
and the hole "you fell in here"; Old Star's cave workshop 5 m down (forge glow, anvil, quench
trough, his bed, Old Star) is the Home stop, and the lift shaft starts from its floor; then every
stratum down to the Core, every known stop a lit tag (tap to ride), buried lifts as "?" pins, "you
are here" on the current one. Once Deep Town is known, the locked Surface Express shaft rises from
it to a padlocked gate in the grass: "the way up, 1,000,000 g".

**Hooks for the lead** (not applied, `src/deep/DigScene.js`): after `const zone = zoneAt(depth);`
in the depth/zone block, `this.post.grade = ZONE_GRADES[zone] || 'deep';` and
`this.post.underwater = pl.headUnder ? 1 : 0;` (import `ZONE_GRADES` from `../core/Engine.js`).

## Nugget's walking coop (inventory part): `makeCoop`

A little Baba Yaga hut on two big feathered-and-scaly chicken legs (`src/gfx/char/coop.js`): log
walls with crossed log ends, board gables, a mossy shingle roof with a carved rooster on the ridge,
a crooked brick chimney that puffs smoke, Nugget the hen (a real `makeChicken` rig) peeking out of
the round gable window, an arched plank door that swings open, a glowing side window, a hanging
lantern, patches (planks, tin, sackcloth) and charms swinging under the eaves. ~1 cm voxels, one
skinned mesh + the hen + one small unlit mesh for the glowing glass.

```js
import { makeCoop } from '../gfx/char/coop.js';
const coop = makeCoop({ height: 1.0, kind: 'toon', hen: true, shadow: true });
scene.add(coop.root);                       // root on the ground between the feet, faces +z
coop.update(dt, { speed, moving, airborne }); // speed in m/s: the gait follows it (no foot sliding)
coop.face(yaw, instant);                    // smoothed turn, like the characters
coop.play('idle' | 'sit' | 'stuck' | 'carried');
coop.setDoor(k);                            // 0 shut … 1 open (springs there with a bounce)
coop.setNugget(on);                         // the hen in the window (false: an empty dark window)
/* exit: */ coop.dispose();
```

- `height`: meters from the ground to the roof ridge when standing (default 1.0; the chimney adds
  ~0.1). Also `coop.vs` (voxel size), `coop.height`, `coop.radius` (footprint, m), `coop.legs`
  (`[{ hip, knee, ankle, toes, side }]`, 0 = left), `coop.hen` (the ChickenRig), `coop.body`,
  `coop.hut`, `coop.door`, `coop.chimney`.
- States: `idle` walks by itself when `speed > 0` (2-bone IK, knees bend backwards, toes curl in
  the swing and grip in the stance, the hut bobs, rolls and leans; charms, lantern and chimney
  swing with it; smoke trails behind) and shuffles when standing (a step, scratching the ground,
  a ruffle, settling, a look round) · `sit` (legs folded under, the hen sulks) · `stuck` (flailing,
  hopping, door banging, the hen flapping) · `carried` (level, legs dangling and paddling).
  `airborne: true` tucks the legs.
- Cues: `hop()` (crouch before a jump), `land(fallSpeed)` (squash), `shake(k)` (a shiver),
  `peck()`, `layEgg()` (squat, the door pops open, `rig.onEgg(worldPos)` fires at the plop; returns
  the duration), `setGlow(k)` (windows and lantern).
- Callbacks for sound: `rig.onStep(side, strength)`, `rig.onJingle(k)` (the bell charm).
- World points: `windowWorld(out)` (bubbles), `doorWorld(out)`, `chimneyWorld(out)`.
- Review: `?scene=showroom&mode=hen`, then in an eval `const { makeCoop } = await
  import('/src/gfx/char/coop.js')`.

## Inventory, the coop's shelves, Nugget (inventory part): as built

**Slots** (`src/core/inventory.js`). What the mole carries is a grid of stacks: `data.inv.slots`
(rows of 6). A new mole has **6 pockets**; the equipped bag's `slots` sets it (`bag_small` 6,
`bag_medium` 12, `bag_large` 18, `bag_huge` 24, `bag_bottomless` 36, bought in the shops), plus 1
per 2 levels of Deeper Pockets and pockets from `skill('carry')` (max 48). Stacks: ores 16, gems 8,
ingots 8, plants 16, critters 8, food 8, supplies 10, hen feed 24 (`stack` on an item overrides).
Quality items stack per item (the stack keeps its lots and shows the average). Forged weapons take a
pocket each. Tools, gear, blueprints, floors, wall styles, keys and unplaced furniture take none.
- **State API kept**: `addItem` (slotted items: returns `null` and emits `'full' {id, n}` when it
  doesn't fit; `{ spill: true }` sends what doesn't fit to the **stash** (the trunk at home) and
  emits `'stash' {id, n}`), `count`, `owns`, `lotsOf`, `removeItem`, `removeLot`, `inventory`,
  `addWeapon` (no pocket free → the stash), `removeWeapon`, `buy` (refuses with "No room in your
  backpack"), `sell*`. New: `state.canAdd(id, n)`, `state.bagSlots()`, `state.bagFill()` →
  `{ used, slots, free, full }`. `data.lots / counts / weapons` are now read-only mirrors of the
  pockets. `bagCapacity()` still means the old "finds per trip" until the mine switches.
- Old saves migrate on load (food and supplies first; what doesn't fit waits in the stash).
- **Test URLs**: `?bag=N` gives N pockets; any `?give=` lifts the bag to 48 so test setups never
  drop items. In evals: `state.data.owned.bag_bottomless = 1; state.equip('bag_bottomless')`.
- **Coop shelves**: `data.coop = { level, slots, food, laid, layT, ... }`, 4/6/9/12 shelves ("Nail
  on a shelf" in the coop panel: 300/1200/4500g). Stash: `data.stash.slots` (grows).
- **Nugget's care**: `Inv.feedHen(state, id?, from)` (emits `act {type:'feed', who:'nugget', id}`),
  `Inv.henMood(state)` → `happy | ok | peckish | hungry`, `Inv.tickHen`, `Inv.eggToCoop`. Hen food:
  items with `hen` (how much it fills her): `chicken_feed` 0.5 (new, feed sack icon), `fat_grub`
  0.45 (new), `worm` 0.3, `cave_seeds` 0.3 (new). `skill('nugget')`: hunger drain ÷, laying and
  finds ×. She scratches up grubs and seeds now and then (onto her shelf); with Nugget's Nose (the
  Miners' Board) a bit of ore for your bag.

**The backpack** (`src/ui/Backpack.js`, `src/ui/invGrid.js`, `src/ui/invArt.js`,
`src/ui/backpack.css`): the leather rucksack with canvas pockets; sewn-shut pockets show what the
next bag unlocks. Drag to move / merge / swap, right-click or long-press to take half into your paw
(click or tap a slot to put it down, right-click puts one), double-click / double-tap / shift-click
sends a stack to the other side, drop on the toss pit to throw away (asks for anything worth 60g+),
"Tidy" sorts and stacks, hover tooltips, quality pips and colour bars, the paper tag with Eat / Feed
Nugget / Take / Split / Toss, sounds and bounces everywhere. The right side shows the front pockets,
or (when Nugget's coop is within ~2.3 m, or `side: 'coop'`) her coop: portrait, how fed she is,
the feed bowl (drop food on it), the straw cubbies; or the trunk at home. Phones: portrait stacks
everything, landscape folds the gear into two slim columns. `openBackpack(game, { side })` from
`Backpack.js`; `ui.openInventory()` picks the coop automatically. `bagFullToast(game, id)` for
pickups that didn't fit. Test hooks: the panel handle's `h.inv.{ move, select, split, tidy, feed,
toss, setSide, side, dnd }`.

**Nugget in the mine** (`src/deep/Nugget.js`): the coop follows the mole's trail, cuts corners
where it's clear, hops ledges up to ~0.46 m; hungry, it sits and sulks; it gets **stuck** at tall
ledges, crawlways lower than ~0.75 m, deep water and pits (flails, squawks, a toast; it tries again
every 5 s), and you **carry** it (E picks up, it rides in front of you in the paws' overlay, E puts
it down). E on the coop: Feed (peckish/hungry and you have hen food) · Carry (stuck, or hungry with no
food) · Open the coop. She lays eggs onto her shelf (or out of the door when it's full). Test hooks:
`scene.nugget.debug.{ state(), feed(id?), hunger(food), stuck(kind), carry(), put(), egg(), here(d),
teleport(x,y,z), open(), aim(), coop }`. **At home** (`src/home/nugget.js`): the same coop on the
room's tile grid, same `HomeNugget` interface (actor, ai, setBlocked, update); it adds its own E
interaction (Feed / Open the coop) through `scene.addIt`; `scene.nug.debug.{ state, feed, hunger,
egg, open }`.

## Old Star's tutor (home part): `game.ui.tutor`

`src/ui/Tutor.js`, created by `UI` (one hook in `UI.js`: built in the constructor, ticked from
`ui.update`). A parchment card with Old Star's pixel-art portrait (his face changes with the mood,
blinks, his star nose wiggles, his mouth moves while the words type out in his mumbly voice).

```js
await game.ui.tutor?.say(html, { mood, key, wait, dur, name, sound })  // resolves when the line is gone
game.ui.tutor?.hide(key?)        // hide the line (with a key: only if that line is showing)
game.ui.tutor?.next()            // carry on, as the player would (tests)
game.ui.tutor?.active            // { key, mood, html, wait } or null
```

- `mood`: `calm` (default) · `happy` · `stern` · `proud` · `worried` · `laugh`.
- `key`: the line's id. Saying the same key again while it is up updates it in place (no retyping
  if the text is the same), so a per-frame tip can be re-said safely; `hide(key)` leaves other lines
  alone.
- `wait: true`: the card stays until the player carries on (`E`, `Space`, `Enter`, a click or a
  tap on the card; while it waits those keys don't reach the game). Use it for scripted lines you
  `await`. Without `wait` it goes after a reading time; `dur` (seconds) overrides that, and
  `dur: Infinity` keeps it up until `hide()` or the next line (step-by-step instructions).
- A new line replaces the one showing (whose promise then resolves). `name` defaults to
  `'Old Star'`; `sound: false` mutes his voice. HTML: `<b>` (rust red), `<i>` (soft), `.gold-txt`.
- Placement: bottom-centre on desktop, top-centre on touch screens (clear of the thumbs).
- `import { starPortrait, starPortraitURL, MOODS } from '../ui/Tutor.js'` gives the portrait as a
  40×40 canvas / data URL per mood (for the book, notes or a quest card).

## Old Star's cave workshop, waking up, lessons (home part): as built

**The home** (`home`): your old room (build mode, the bed, Nugget, the Miners' Board all still
there) opens through a carved arch and worn steps (`ARCH`, `STAIRS` in `src/home/units.js`) into
Old Star's cave (`HALL`: x −5.4…11.6, z −11.6…−0.31 m). The cave is real voxel rock built with the
mine's mesher and terrain shader (`src/home/caveRock.js`, 1/16 m voxels, ~105 chunks; the plan of
the lobes, floor and ceiling heights, dripstones, the pool and the fall mound is pure maths in
`src/home/caveShape.js`), so it shares the mine's materials and lamp. No digging at home: the rock
is collision only (`CaveWorld`). Props are code-made voxels (`src/home/caveProps.js`,
`src/home/ruinProps.js`), placed and batched by `CaveHall` (`src/home/cave.js`, `SPOTS` and
`STAR_SPOTS` are the named places):
- **forge corner** (NW): brick forge with a flue up a crack in the roof, glowing coals, embers and
  flames, bellows on a pole (pump them), anvil, a cold-water quench trough (splash your face),
  his bucket, a tool rack, a coal heap, his cot (where he sleeps) with a crate and candle;
- **hearth** (W): cooking fire with a pot and kettle, armchair, table and stools, a herb line, shelf,
  log stack; his **notes board** and **chest** on the west wall (his gift in it most mornings;
  otherwise it's your **trunk**: `openBackpack(game, { side: 'trunk' })`);
- **ruins** (NE): a sealed carved doorway with a faint teal glow, broken pillars, a fallen drum, a
  cracked mosaic, a dais;
- **lift bay** (E): the cage lift in its shaft (`useLift` / `openLiftPanel` / `rideTo` as before),
  rails and an ore cart (coal, 3 a day), a winch, the Miners' Board;
- **the passage** (N, `FRONT`): the way out to the town; **the hole** (`HOLE`): where you fell in,
  roots and loam round its throat, a trickle of earth; the rubble mound under it;
- life: drips from dripstones with ripples and splash sounds, a still pool (drink: +energy, once a
  day), glow-worm threads that flicker, moss, roots, dust motes, creaks, the forge's smoke, glints in
  the rock (a few coins or quartz).

**Old Star** (`src/home/oldstar.js`, the `StarMoleRig` with `setExpression` moods): walks the cave on
an A* grid, works the anvil (clangs, sparks, the anvil flashes), pumps the bellows (the forge flares),
stirs the pot, reads his board, ponders the ruins, sits in his armchair with his pipe in the evening,
sleeps on his cot at night (snoring), and turns to you when you come near. Talk to him (E) for the
lesson, a tip, or skipping. His save corner: `state.data.oldstar` (`src/home/starData.js`):
`lesson: 'wake' | 'mine' | 'forge' | 'cook' | 'done'` (+ `skipped`, `talkI`, daily counters).

**Waking up** (`home { from: 'fall' }`, `src/home/wake.js`): black, then eyelids crack open on the
cave roof (blurred, the canvas is CSS-blurred; heartbeat), muffled lines on the tutor card, Old Star
leans over you, fetches his bucket from the trough and throws it: a water sheet down the screen,
drops, splash, gasp, a flash; the view sharpens, you sit up shivering. Then his lines (each waits for
E / tap): who he is, an old smith stuck down here, a **million gold** for the way up, he'll teach
you, and your hen. Sets `flag('fallen')`, `flag('nugget')`, starts the chain
(`game.quests?.start('lessons')`), emits `lesson wake` + `talk oldstar`, stage → `mine`.

**The lessons** (`src/home/lessons.js`; the objective line follows `NEXT[stage]`):
- `mine`: the lift is labelled "Ride down to the dig" and goes straight to
  `deep { from: 'lift', lift: 'L0', lesson: 'mine' }` (emits `lesson lift`); the mine-lessons part
  takes over there and comes back with `home { from: 'lift', lesson: 'mine' }`. With copper ore in
  the bag he sniffs it (`lesson copper_home`), gives coal if you're short, stage → `forge`;
  without it he sends you back down.
- `forge`: the forge / anvil says "Forge with Old Star" → `forge { from: 'home', tutorial: true }`
  (below). The forge sets the stage to `cook`; back home he admires the blade (grade line).
- `cook`: the hearth says "Cook with Old Star" → `cooking { from: 'home', tutorial: true }` (eggs
  and mushrooms topped up). Back with `home { from: 'cooking', lesson: 'cook_done' }` he tastes it,
  `lesson cook_done`, stage → `done`, his graduation lines (the million, Deep Town). Without a dish he
  sends you back to the pot.
- Skipping: talk to him → "Skip the lessons" (confirm): gifts for what's left (a copper ingot, coal,
  a dish), `lesson skip`, stage → `done`.

**The forge lesson** (`src/forge/tutorial.js`, `scene.lesson` in `ForgeScene` when
`params.tutorial`): Old Star stands by the hearth and talks on the tutor card (top of the screen):
smelt your copper (the recipe row pulses gold, quick smelt is hidden), hold the pour band (reacts to
the melt), then the Dagger in copper (plan preselected): heat (the work band's numbers), hammer
(reacts to cold, cracked, burning, good and bad blows, cooling off), grind, balance, quench, the
grade. Emits `lesson forge_smelt` (first ingot) and `lesson forge_done` (first blade), then walks you
home. The forge's activities call `scene.lesson?.event('step' | 'strike' | 'melt' | 'ingot' |
'result', data)`; the forge also emits `act smelt { id, recipe, q }` and `act forge { weapon, metal,
grade, score }`. Skills: timing windows widen by `state.skill?.('forge')` (work and quench bands,
the pour band, balance tolerance), and a blow's energy is divided by `state.skill?.('stamina')`.

**Test hooks**: `__game.scene.debug` at home: `useLift(id)`, `toggleBuild(on)`, `placeAt(id, x, z, r)`,
`interact(label)`, `labels()`, `talk()`, `openNotes(i)`, `minersBoard(tab)`, `openChest()`,
`clock(h)`, `star(spot?)` (his state; a spot name from `STAR_SPOTS` puts him there), `lesson(stage?)`,
`skipLessons()`, `await finishWake(maxFrames)` (plays the wake-up through, carrying on every card),
`wakeFx()`, `arrive(from)` (as if back from `'lift' | 'forge' | 'cooking'`), `aim(x, y, z)`,
`stand(x, z, yaw, pitch)`, `step(n, dt)` (synchronous), `await run(n, dt, until?)` (frames with the
scripted scenes' awaits let through: use it for the wake-up and Old Star's lines; `step` alone
can't move an awaited sequence on), `stats()` (draw calls, triangles), `spots`. Forge:
`scene.lesson.debug.stage()` plus the forge's own `scene.debug` (smelt, forge, pump, strike...).
Tutor: `ui.tutor.next()` (the first press finishes the typing, the second carries on), `ui.tutor.active`.
Query strings: `?scene=home&fresh=1&from=fall` (wake-up), `?scene=forge&fresh=1&tutorial=1&from=home`.

## Plan hooks in the mine (lead)

`world.plan` gains lists the other parts stamp or populate (all meters, deterministic per seed):
- `plan.burrows: [{ id, kind: 'trader'|'herbalist'|'raccoon'|..., x, y, z, yaw, zone }]`
- `plan.ruins: [{ id, kind, x, y, z, yaw, r, zone, seed }]`
- `plan.trails: [{ id, pts: [{x,y,z}...], from, to }]` (old dug tunnels joining lifts, burrows,
  ruins and the town)
- biomes now include `4` **dino caverns** (huge caves, ferns, giant bones) for the creatures part.

Each is also a plan feature (`kind: 'burrow' | 'ruin' | 'trail'`, with a `bb`) whose voxels are
stamped by the owning part's `stamp*(f, vox, X0, Y0, Z0, CS)` (pure: it may run in a worker).
Voxel material ids (`src/deep/materials.js`): base 0–42, ruins 96–119, NPC burrows 120–127, ores 128+.

## Ruins, trails and puzzles (ruins part): as built

**The ruins** (`src/deep/gen/ruins.js` + `src/deep/ruins/{common,hall,shrine,vault,well}.js`, pure,
worker-safe). Each `plan.ruins` entry is laid out on its own voxel grid (yaw snapped to a quarter
turn so walls stay straight; `ruinLayout(f)` is cached per feature) and stamped by `stampRuin`
(the bb grows to fit the kind: entrance corridor, treasure room, the well's shaft; a per-column y
span skips the plain rock of the well's deep box). New voxel materials, ids 96–114 (`src/deep/ruins/
mats.js`, registered by one hook in `materials.js`, all `made: true`): fitted polygonal stone,
dressed basalt, carved frieze, flagstone, six mosaic tesserae, glowing runes (teal; red in the
Magma Deep), carved (dark) runes, warded seal-stone (`ward: true`), cracked stone, gold leaf,
gold hoard (`hoard: true`), weathered marble, verdigris bronze.
- **Pillared hall**: barrel-vaulted nave on two rows of fluted pillars with gilded capitals and
  ribs, pilasters, a gilded symbol frieze on a dark plinth, a mosaic carpet, a cave-in (rubble
  slope under a broken chimney, snapped pillars with their drums lying beside them, roots), an
  arched corridor half swallowed by rubble, the sealed door under a lintel of signs.
- **Star shrine**: round domed chamber, a seated star-nosed idol on a stepped dais (gilded crown,
  star nose, offering bowl, eyes that light when it opens), offering bowls, a ring of glowing
  runes, a sunburst mosaic floor, roots through the oculus, a toppled guardian.
- **Sealed vault**: coffered ceiling with gold rosettes, a great round seal-door with rings,
  spokes, boss and eight rune studs in a gilded frame, two marble guardians with spears (one
  fallen and broken), checkerboard floor with a gold-edged path, a collapsed corner.
- **Drowned well**: low dome, wave mosaic, parapet and timber winch (rope and bucket hang down
  the shaft), a spiral stair of treads down the shaft wall past glowing rune niches to a landing
  over the water; under the water an arch into a flooded gallery with the sealed door.
- Every ruin: the door is seal-stone over a bedrock core, and the treasure room (gold-leafed
  walls, mosaic floor, diggable hoard heaps) is wrapped in bedrock: the puzzle is the way in.

**Puzzles** (`src/deep/Ruins.js`, `src/deep/ruins/{site,puzzles,models,sfx}.js`), by kind and zone
(`puzzleFor`; every one appears in a world): hall → `switch` (odd zones) / `levers`; shrine →
`dials` (odd) / `beams`; vault → `levers` (odd) / `plates`; well → `valve`.
- `levers`: four levers in wall niches, each under its frieze symbol (and on its plaque); pull them
  in the order the lintel shows; a wrong pull clatters them all back.
- `switch`: a cracked wall panel (dust sifts out of it, a draught whistles) hides a niche with a
  pull switch; the lintel shows a hammer and an arrow toward it.
- `dials`: three hexagonal symbol drums on an altar under a mosaic mural; turning a drum also
  turns its left neighbour; match the mural's three signs.
- `beams`: a sun crystal in the wall shines a beam; three crystal mirrors (4 orientations each,
  the back is dark) carry it round to the socket in front of the idol. The beam is traced in the
  ruin's grid and stopped by any solid voxel (so a built block blocks it).
- `plates`: three plates in the floor must be down at once: the mole, a clump of ore lying on it
  (`owner.clumps.list`), or any solid voxel in its pit (a build-tool block).
- `valve`: the drain wheel on the landing; the shaft and the gallery drain layer by layer, then
  the door gives.
- Feedback: door runes light pair by pair with progress (chimes rising), a rumble and grinding when
  the seal goes (an animated replica sinks into the floor, or the vault's disc rolls into the
  wall), shake, dust, braziers light, the idol's eyes wake. The chest (E) gives gold, the zone's
  gems and the ruin's **relic** as `{ loot }` events (what doesn't fit goes to the trunk at home
  via DigScene.collect; the relic is also `state.discover('relic', id)`) (11 relics, one per ruin:
  `src/deep/ruins/relics.js`, icons `relicArt.js`; items `cat: 'relic'`, Index chapter "Relics").
  Digging the hoard pays gold into the pouch.
- Events: `act puzzle {id, kind, ruin, zone}`, `act relic {id, ruin}`, toasts, loot (gems,
  relic). They come out of `ruins.update()` / `ruins.use()`, so DigScene must relay update's
  events (see the hooks below) for quests to hear `puzzle`.
- Save: `state.data.deep.ruins[id] = { seen, open, solved, chest, gemsLeft, seq, dials, mirrors,
  drained, ... }`; door/rune voxel changes are world edits (persist), re-synced on load.

**Trails** (`src/deep/gen/trails.js`, now mine; `src/deep/ruins/trailDress.js`). The stamp adds
cave-ins (`trailCollapse(f)`: a rubble plug with a snapped cap beam, only where the trail ran
through solid rock, never in burrows or caves) and plank decks on timber stringers wherever the
floor is missing (chasms, open caves, water), and leaves ruin stone alone. At play time: a
signpost at every place's way out with hand-painted arrow boards (1/64 m voxel paint, readable from
both sides) turned along each trail toward its far end and one pointing back in (names from
`plan.lifts`, `plan.burrows`, Deep Town), milestones halfway along long trails, iron rails on the
cart tracks, ore carts (some tipped), lost tools (a snapped pick and a bucket at every cave-in),
and hand ropes with hangers along every plank bridge. Signposts are readable with E.

**Test hooks**: `scene.ruins.debug` — `list()`, `go(id, where, look)` (where: `entry|mid|door|room|
puzzle` or a local `[a, y, b]`; look: `idol|door|chest|dials|beams|plates|lever|switch|valve|shaft|
gallery`), `solve(id)`, `reset(id)`, `press(id, i | 'chest')`, `puzzle(id)`, `site(id)`, `trail()`,
`sign(k)`. Headless the shrine/vault/well/hall walkthroughs are in the report.

**Lead hooks wanted** (DigScene and friends are the lead's): construct `Ruins` like Props
(`'./Ruins.js'` in the module glob and list, key `ruins`); call
`this.events(this.ruins.update(dt, { player, eye, time }))` each frame; add `this.ruins` to the
`lights()` sources and dispose it on exit; radar: `markers.push(...this.ruins.radarMarkers(pos,
!!o.survey))` (kind `ruin`, glyph added in `ui/deepArt.js`); `Dig.breakable` should refuse
`MAT[m].ward`; Props should treat `MAT[m].made` as man-made (no mushrooms/crystals/crates growing
in the ruins); and trails to the ruins: `ruinDoor(f)` gives the entrance point and its outward
direction for `addTrail`.

## Old Star's mining lesson (mine-lessons part): as built

`src/deep/Prologue.js` (+ `src/deep/prologue/*`, the dig's voxels in `src/deep/gen/prologue.js`).
Active in `deep` while `flag('prologue')` is unset **and** the mole came down by the L0 cage
(`deep { from: 'lift', lift: 'L0' }`; also `lesson: 1` for tests); otherwise inert, so other parts'
`scene=deep` tests are untouched. Old Star rides down with you, then the lesson goes:
out of the cage, the trail's east wall a few steps on is his loam **plug** (dig through; it sits
where the trail from L0 can't carve it away) → follow him down his crawl into the
dig → dig round the **copper** (not on it), pick the clump up, chip it clean with his spare chisel,
bag it → the south wall **winks**: dig into a little **geode**, take the amethyst → a **ladder** (build
tool) up to the ledge, take his **map** (`ui.openBook?.('map')` after his line; the radar comes on) →
a **rock-nibbler** comes out of its hole: hold block (mouse 2 / `F`, DigScene's `blocking`/`blockT`;
it lunges after a hissing tell, guarded hits come back as `blocked` / `parried` events) and give the
dizzy thing a tap of the pick → back up the crawl into the cage with him, ring the bell:
`goto('home', { from: 'lift', lesson: 'mine' })` (the copper is in your bag; skipping hands you a
lump so `copper_home` can still happen).
- Emits, in order: `lesson` steps `dig` (on arrival) · `mine_rock` (plug through) · `mine_ore` ·
  `mine_clean` · `mine_gem` · `mine_ladder` · `mine_map` · `mine_block` · `mine_done` (+ `skip`
  when "Skip all lessons" is chosen); `reach { place: 'dig' }` entering the chamber;
  `talk { npc: 'oldstar' }` when you talk to him. Loot goes through the scene (`gem` / `ore` acts).
- He talks through `ui.tutor` (moods per line; the step's instruction stays up as a `dur: Infinity`
  line keyed `os-tip` between his other lines), falling back on a bubble over his head. The
  objective tag is only drawn while `game.quests` doesn't exist.
- Talking to him (E): what to do now + "Skip this lesson" / "Skip all lessons".
- Progress: `state.data.deep.prologue.step`; a lesson left half way resumes on the next ride down.
- Touch: the touch controls' block button (`.d-block`) is lit while the critter is out; a stand-in
  "hold to block" button appears only if there is none. `scene.prologue.threat()` gives the critter
  as `{ kind, dist }` (like `enemies.threat()`) for the button glow and the music.
- His rig: `StarMoleRig` (`makeStarMole`) wears the shared faces (`rig.setExpression`, expr.js:
  lids, brows, mouth, blush / tears / sweat / anger mark); his star joins in: it flares when he's
  glad or surprised, folds when worried or sad, bristles when stern.
- The dig's stamp keeps sand and gravel out of its shell and firms up any round the L0 lift room,
  so nothing pours into the lesson.
- Test hooks: `__game.scene.prologue.debug` (`steps`, `step()`, `go(step)`, `run(sec)`, ...).

## Quests, the book and the map (quests part): what it listens for

`game.quests` (src/core/quests.js, data in src/data/quests.js) only listens to `act` events; emit
these and the quests move on their own (nothing else to call). Fields not listed are ignored.

- **Lesson steps** (`{ type: 'lesson', step }`, chain `lessons`, in this order). A later step
  completes every earlier one, so a part may skip steps it doesn't teach:
  `wake` (home: Old Star has woken you) · `lift` (home: you rode the cage down) · `dig` (mine:
  arrived in his practice dig) · `mine_rock` (first rock dug) · `mine_ore` (first ore clump freed) ·
  `mine_clean` (clump cleaned and bagged) · `mine_gem` (the geode's gem found and taken) ·
  `mine_ladder` (ladder up / climbed out) · `mine_map` (Old Star's map taken) · `mine_block` (the
  rock-nibbler blocked and seen off) · `mine_done` (mining lessons over; `flag('prologue')` is set
  then too) · `copper_home` (home: the copper handed to Old Star) · `forge_smelt`
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
- **Explore**: `explore { zone: 1..6, biome, cell: 'x,y,z', n }` (biome as BIOMES index or id; `n` new cells).
- **New type**: `nest { id, kind, zone }` when a creature nest is cleared (monsters part).
- `puzzle { id }` (ruin id or puzzle id) when a ruin puzzle is solved.
- Rewards use `state.addSkillPoints?.(n)` (skills part).

### As built (quests part)

- **Engine** `game.quests` (`src/core/quests.js`, made in `Game` after the UI): `start(id)`,
  `step(id)` → `{ i, def, n, max, text, hint }`, `done(id)`, `active()`, `get(id)`, `list()` →
  `{ active, done, open }`, `track(id)` / `tracked()`, `forNpc(npc)`, `on('start'|'progress'|'step'|
  'done'|'track'|'change', fn)`. Save: `state.data.quests = { active: { id: { s, n, u? } }, done:
  { id: day }, tracked, order, seen }` (old saves well under way skip the lessons). Places from the
  mine are normalised (`'trader'` → `burrow:trader`, `'R21'` → `ruin:R21`, `'L11'` → `lift:L11`);
  numeric biomes become ids. Lessons also skip ahead on the natural act of a later step (reaching
  `L0`, an `ore`, a `smelt`...). Until the forge and the kitchen emit `forge`/`smelt`/`cook`, the
  engine reads them off the state (a new weapon; an ingot made in `forge`; a dish made in
  `cooking`) and stops as soon as a real act of that type arrives.
- **Data** (`src/data/quests.js`, 37 quests): `lessons` (14 steps) → `million`; Old Star's
  follow-ups (Deep Town, the neighbours, first gem, Rocco, each zone 2–6, three lifts, pristine ore,
  a grade-B blade, three dishes, feed Nugget, dynamite, a ruin, 100k gold); requests offered on
  `talk` by the trader (5), the herbalist (5), Rocco (6) and the outpost warden (2). Names come from
  `SHOPS[npc].keeper.name` when the characters part adds them (`npcName`, `{trader}` tokens).
- **Objective strip** (`src/ui/Tracker.js`, `quests.css`; `ui.tracker`, made in the UI): a
  parchment scroll under the backpack in every `hud = 'deep'` scene. Quill-scratched counts, a
  ticked box and a strike-through per step, the scroll rolls up and opens on the next, Old Star's
  red stamp (and ink spatter) on a finished quest, then a toast with the giver's last line. Tap it
  for the book. `ui.tracker.mute(true)` hides it for a cutscene.
- **The book** (`src/ui/Journal.js` `openBook`, `journal.css`; `ui.openBook(tab, { focus })`,
  B / M / the book in the backpack / the strip / the radar): tabs Quests, Map, Skills
  (`renderSkills(host, game)`), Index (a summary; opens the Index Book on top), Notes (Old Star's
  notes, marks `notesRead`). Two pages, one page under 700 px wide; 1–5 jump to a tab, ←/→ turn.
  The pause menu (`openJournal`) still lives at the bottom of Journal.js.
- **The map** (`src/ui/Survey.js` `renderMap`, `mapInk.js`, `atlas.css`): only walked cells
  (`state.data.deep.explored`) get ink: wobbly walls, hachures, hatching and stipple for rock,
  washes for water and lava, dashed old trails, doodles and hand lettering for Old Star's, his dig,
  lifts, Deep Town and its shaft, burrows, ruins, lakes, nests, ore finds and glow stakes, pencil
  spot depths, a compass rose, scale bar, stains and folds. Layers are the zones (yours first).
  Ground walked since the last look is inked in by a quill (brush sounds). Pins (6 kinds) in
  `state.data.atlas.pins`; quest marks (red rings for the tracked one, pencil "?" where unwalked,
  an arrow on the edge when off the sheet); you and Nugget. Works outside the mine (it builds the
  plan with `makePlan`). The ink skill (`state.skill('ink')`) widens the inked rock and the quill.
- **Test hooks:** `game.quests.debug.{ list(), step(id?), complete(id?), start(id), act(a), reset(),
  data() }`; `game.ui.openBook(tab)` → handle with `.tab(name)`, `.chapter`, `.map`;
  `game.ui.book.map.debug.{ state(), ready(), finish(), zoom(k), center(x, z), zone(n),
  pin(x, z, kind), pinMode(kind), reveal(fromOrd), draw() }`.

## Skill tree (skills part): as built

Files: `src/core/skills.js` (XP, levels, points, effects, perks), `src/data/skills.js` (lines, keys,
the trees, XP rules, the level curve), `src/ui/SkillTree.js` (the page, `ui.openSkills`, feedback
anywhere), `src/ui/skillArt.js` (pixel art: 51 glyphs, wax seals, ink medallions, pencil sketches),
`src/ui/skilltree.css`. Hooks: `State.js` (attach, `data.skills`, fill on load, and the effect
hooks listed below), `UI.js` (`installSkillFeedback(this)`, `ui.openSkills(line?)`).

- **Lines** (7): `mining smithing cooking combat exploring foraging trading`. XP comes only from
  `act` events (`XP_RULES` in data/skills.js); bursty types (`dig`, `explore`, `block`, `hurt`,
  `talk`, `feed`, `blast`) are capped per second, first-time finds (`zone`, `biome`, `place`,
  `puzzle`, `npc`, a new `dish`) give a one-off bonus, a cleared `nest` 35 Combat XP. Lesson steps
  give 15 XP to the matching line (`skip` gives none).
  Curve: Lv 2 at 40 XP (about a minute of digging or one dish), Lv 5 ~15 min, Lv 10 ~2 h of one
  activity, max Lv 20. Each level = 1 skill point, levels 5/10/15/20 = 2. Points are one pool.
- **Trees**: 11–12 nodes per line on 5 tiers (needs line Lv 1/3/6/10/15), costs 1/1/2/2/3, `req` =
  any one stamped parent, one exclusive pair per line (tier 4: e.g. Brute Force *or* Featherpick).
  "Scrape page" refunds a line's points for 30g a point.
- **Save**: `state.data.skills = { v, xp{line}, lvl{line}, points, earned, granted, nodes{id: day},
  seen{key: day}, respecs, nudge, opened, view }`. Old saves get a block built from their `stats`
  (capped at Lv 8), then missing level points are paid on load.
- **API**: `state.skill(key)`, `state.addSkillPoints(n, reason)`, `state.skillLevel(line)`,
  `state.skillPoints()`, `state.addSkillXp(line, xp)`; events `state.on('skill', e)` with
  `e.type` `xp | level | unlock | points | perk | respec`. UI: `renderSkills(host, game, {line})` →
  `{ el, dispose(), select(id), stamp(id), line(id) }` (the book's Skills tab calls it);
  `ui.openSkills(line?)` opens the same page as its own little book.
- **Feedback anywhere**: an XP ribbon slides in at the left edge (line seal, bar, +N), a level-up
  note pins itself to the toasts with the line's seal stamping in (+ jingle; tap/`B` opens the
  book at Skills), perk notes (Second helping!, bonus ingot, tips...), and while points wait a
  small wax seal sits on the HUD book button plus a gentle toast every 5 min of play.
- **Test hooks**: `state.skillsDebug.xp(line, n)`, `.level(line, L)`, `.unlock(id)` (free),
  `.unlockAll(line?)`, `.points(n)`, `.act(type, payload)` (no rate cap), `.force(key, v)` (pretend a
  key has a value, to test what reads it; `force()` clears), `.reset()`, `.dump()`.
  `ui.openSkills().debug` = the page controller. `ui.skillNudge.now()` shows the nudge.

### Effect keys (`state.skill(key)`)

`mult` keys return 1 + the stamped bonuses, **always ≥ 1 and bigger is better**: where a smaller
number is better in your code (an interval, a loss, damage taken), **divide** by it.
`chance` keys return 0..0.95; `perk` keys 0 or 1 (2 for a perk's follow-up).

| key | kind | who reads it | how |
|---|---|---|---|
| `power` | mult | mine | pick power × skill |
| `rate` | mult | mine | swing interval **÷** skill |
| `glint` | mult | mine | hidden-ore glint range × skill |
| `clean` | mult | mine | ore quality lost to scratches **÷** skill (Clumps too) |
| `blast` | mult | mine | blast radius × skill |
| `stamina` | mult | mine, forge | energy spent on work (blows, strikes, swimming) ÷ skill; not damage |
| `hide` | mult | mine/combat | damage taken ÷ skill |
| `fall` | mult | mine | fall damage ÷ skill |
| `speed` | mult | mine | walk/run speed × skill |
| `damage` | mult | combat | damage dealt × skill |
| `block` | mult | combat | block/parry window × skill, damage through a block ÷ skill |
| `riposte` | perk | combat | a perfect block staggers the attacker |
| `forge` | mult | forge | the forge minigames' good windows × skill |
| `cook` | mult | cooking | cooking windows × skill |
| `forage` | mult | foraging | pull window × skill |
| `sense` | perk | foraging | forageables twinkle from further |
| `hearty` | mult | `game.eat` | energy from food × skill |
| `nugget` | mult | Nugget | her hunger drain ÷ skill, finds/patience × skill |
| `ink` | mult | map | the radius the map inks around you × skill |
| `fence` | mult | traders | what Rocco pays for weapons × skill |
| `carry` | mult | **skills** | `bagCapacity()` × skill (inventory's `bagSlots` adds pockets from it too) |
| `lamp` | mult | **skills** | `lightRadius()` × skill |
| `sell` | mult | **skills** | ore & gem prices × skill (inside `sellPrice`, so shown = paid) |
| `haggle` | mult | **skills** | `state.buy` charges `state.buyPrice(p)` = p ÷ skill; shops should show `buyPrice` |
| `craft`, `gemset` | mult | **skills** | forged weapon value × skill (× gemset if it has a pommel gem), in `addWeapon` |
| `buff` | mult | **skills** | every buff's duration × skill (`addBuff`) |
| `thrift` / `helping` / `double` / `tips` | chance | **skills** | bonus ingot on `smelt`, extra dish on `cook`, extra plant on `forage`, a 10% tip on a sale ≥ 100g |
| `hunger` / `wind` / `pathfinder` | perk | **skills** | +6 energy per `kill`, +4 per perfect `block`, +15 on a new zone/biome |
| `sleeper` / `interest` | perk | **skills** | wake with Lucky Nose; overnight interest on gold (1%/250g, 1.5%/600g) |

"skills" = applied by the skills system itself (perks fire on `act` / `day` events); the rest need
the reader named. `smelt {id}` may be the recipe id (`smelt_iron`) or the ingot id.
Read today: the mine (`DigScene.bonus`: power rate glint clean), combat (`block`, `damage`),
foraging (`forage`), cooking (`cook`), inventory (`carry` → pockets), quests (`addSkillPoints`).
**Open (lead):** `DigScene.bonus(k)` multiplies the skill for `rate` and `clean` too, which makes
swings slower and scratches worse as those skills grow; those two must divide (see the report).

## Title, save stones, hanging signs, pause menu (title part): as built

- **Title backdrop** (`src/bookends/titleForge.js`, props in `titleProps.js`, the smith in
  `titleSmith.js`): a forge cave (voxel shell with flagstones, soot, strata, crystals and
  mushrooms for cold contrast), a stone forge with a brick hood and chimney, bellows, an anvil on a
  stump, a quench tub, tool walls, a weapon rack, coal, ingots, a grindstone, a chain hoist,
  timber frames, a lantern. The smith is `makeHeroMole({ pack: false, goggles: 'down' })` (falls
  back to a classic-chibi `makeCharacter` stand-in if hero.js is missing or throws; `?smith=standin` forces it).
  His loop: bouts of 3-6 blows (the anvil is built to the height of his hammer face at impact;
  1px spark streaks bounce off the anvil and floor, a flash, clang + thud, a camera nudge), he
  turns the blade over, steps to the forge to reheat it while the bellows roar, now and then
  quenches it (steam) and strikes his pose (goggles up, a look at the camera). The tongs aim at the
  blade like a tiny IK; the blade's glow shows its heat. Slow cinematic camera drift; wide and tall
  framings for the menu and a push-in for the stones (`dio.shots`).
- **Hanging signs** (`src/ui/signs.js`): `makeSignMenu(container, items, opts)` → `{ el, layer,
  buttons, items, signs, focus(i), yank(i), setLabel(i, s), setDisabled(i, on), raise(on),
  relayout(), step(dt, n), energy(), destroy() }`. Items `{ label, onClick, primary, header, tone:
  'oak'|'walnut'|'pine'|'red'|'ash', disabled, aria }`. Opts: `audio, layer` (an untransformed
  full-screen element), `mount: 'bracket'|'beam'|'ceiling'|'hooks'`, `hanger: 'chain'|'rope'`,
  `columns, width, scale, gap, top, drop, breeze, label, autofocus, onEscape, onFocus`. Verlet chains
  that only pull, a rigid four-point sign (angular momentum), springy hooks, sign-on-sign contacts,
  a breeze from fast pointers, squash on a yank, drag to swing; clinks, creaks, knocks. Drawn by a
  software rasteriser into one low-res canvas (1 px = `--px`), so rotation stays hard-edged pixel
  art; real transparent `<button>`s ride on the signs (keyboard: arrows/Home/End/Enter/Space).
- **Save slots** (`src/core/saves.js`): slot 1 *is* the old key `moleforge.save.v1` (so old saves
  are slot 1 with no copying); slots 2-3 are `moleforge.save.v1.slot2/3`; `moleforge.slots.v1`
  remembers `{ current, world }`. State: `state.slot`, `state.listSlots()` → `[{ i, used,
  completion, gold, day, playTime, scene, fallen, saved, current }]`, `state.useSlot(i, { fresh })`
  (loads the slot, or wipes it for a new game; settings carry over), `state.deleteSlot(i)`,
  `state.completion()`. `save()/load()/hasSave()/wipeSave()/reset()` work on the current slot;
  `save()` stamps `data.saved`. The mine's edits (`moleforge.world.v1`, World.js) belong to the slot
  that played last: switching slots parks them under `moleforge.world.v1.slotN` and brings the new
  slot's back, so World.js needed no change.
- **Completion** (`completionOf(data)`, 0-100, integer; 100 only for the ending or everything
  full): gold 60% × `sqrt(min(1, max(gold, earned / 2) / 1,000,000))` · lessons 10% (the step
  reached in the `lessons` quest, `quests.active.lessons.s / steps`, 1 once done; old saves count
  mined/forged/cooked) · zones 10% `(zoneMax - 1) / 5` · Index Book 10% (entries known / all
  minerals, gems, plants, creatures, weapons, recipes, mechanics) · quests 10% (`quests.done` /
  all of `QUESTS`). A missing part hands its weight to the others; `flags.endingSeen` = 100.
- **Save stones** (`src/bookends/titleStones.js`): Continue / New Game raises the signs off the
  screen and brings three stones up on a ledge. Empty = mossy rough stone ("A new adventure");
  used = rock that turns into a cut gem as completion grows (slot 1 round ruby, 2 step-cut
  emerald, 3 oval sapphire): coloured flecks, then cracks leaking light, the table breaking through
  and the cut opening outward facet by facet, the crust thinning, at 100% a flawless gem with a
  glow and turning rays. Plaques show %, gold, day, play time; "last played" marks the latest.
  Click/tap/Enter a used stone to continue, an empty one to start a new game (`fall`). The hammer
  button (or Delete) asks `ui.confirm`, then a hammer swings down, the stone cracks, bursts into
  chunks that bounce on the ledge and the rubble re-forms into a rough stone. Back sign / Esc.
- **Pause menu** (`src/ui/PauseMenu.js`, `ui.openMenu()` returns the panel): signs drop from the
  cave roof over the dimmed scene: a gold "Paused" banner, Resume, Book (`ui.openBook()`, else
  `ui.openIndex()`), Settings, Save & Quit (saves, then `goto('title')`); a tag shows the save
  stone (slot, gem, %), day and play time. Short screens: two columns, no banner.
  `openSettings(game, { onClose })` is the Settings board for both title and pause (music, sound,
  pixels, shaders, screen shake). `Journal.js`'s `openJournal` is no longer called by `openMenu`.
- **Test hooks**: `__game.scene.debug` on the title: `step(sec)` (drives diorama, signs and
  stones), `openStones() closeStones() pick(i) fake(i, pct) smash(i) shot('menu'|'stones')`,
  `.menu .stones .smith`. Pause: `ui.openMenu().signs.step(1/30, n)`. Signs: `menu.state`,
  `menu.energy()`. Dev: `?cam=x,y,z,lx,ly,lz,fov`, `?smith=standin`.


## Cooking and foraging (cooking part): as built

Files: `src/ui/Forage.js` (the pull minigame overlay + sims), `src/cooking/forage.js` (how each plant
comes out), `src/cooking/forageArt.js` (its 112×84 pixel scene), `src/cooking/plantModels.js` (mine
models for the new plants, added to `props/models.js` `BUILD`), `src/cooking/icons.js` (32×32 icons:
`{ k: 'cook' }` specs), `src/cooking/buffs.js` (food effects + the HUD strip), `src/cooking/quality.js`
(save data, quality stacks, the pantry), `src/cooking/lesson.js` (Old Star's lesson), new steps in
`src/cooking/steps/` (`simmer flip grate roll bake mash`), `src/data/recipes.js`, `CookingScene.js`.

- **Foraging** (mine): E on a plant (`props.target` → "Pull Glowcap", "Peel Glow Moss", "Pick Cave
  Berries", "Dig up Fat Grubs", "Lift Dino Egg") opens the overlay (a `ui.openPanel` parchment sheet;
  the pointer is re-locked so the paw is the cursor and mining carries on after). Techniques:
  **pull** (tension needle in the green band; wiggle sideways to loosen the roots first; too hard
  strains, then snaps; ceiling plants pull down), **peel** (slow steady drag; sparkmoss zaps unless
  you let go on the crackle), **pick** (ripe berries only, timed), **dig** (scrub the soil off, then
  ease it out; a grub wriggles the band), **lift** (raise the egg slowly, lean against the wobble).
  Hazards: emberbloom burns, frostbloom numbs, gloomshroom spores on yanks (gear protects). Mouse
  (also pointer-locked), touch, or keys (Space/E grip, W/S pull, A/D wiggle). Esc leaves the plant.
- **Quality**: every plant and dish is now a quality item (`q`, `p` = pristine: whole with roots).
  `props.use()` returns `{ forage: id }` at once; when the plant is out, Props calls
  `owner.events([{ loot: { id, q, p } }, ...hurts, says])`, so DigScene's `collect` adds it and emits
  `forage {id, q, pristine}` as usual (no DigScene change). Old saves: plain stacks of plants/dishes
  become lots (q 72) on load (`fixQualityStacks`, run by the buff strip at UI start and on `load`).
- **New plants in the mine** (Props.js `TYPES`/`PLANTS` + `BIO_PLANTS` biome lean): cave berries,
  stone thyme, tunnel tubers, cave garlic, glow moss (walls), truffle mounds, grub loam, dino-egg
  nests (Dino Caverns). Zones 1–3 have ~1.35× the plant density. Forageables glint now and then;
  the skill tree's `sense` perk makes them glint from 18 m instead of 7 (`Props.twinkle`).
- **Skills read**: `skill('forage')` widens the pull/peel windows; `skill('cook')` widens every
  cooking step's good window (`Step.win()`); buff durations get `skill('buff')` inside `addBuff`.
- **Cooking**: 32 dishes (real recipes, up to 4 ingredients: Mushroom Stew, Cave-Truffle Omelette,
  Root-Vegetable Pie, Glowcap Soup, Fried Grubs, Salted Cave Fish, Berry Jam Toast, Stone-Thyme Bread,
  Dino-Egg Frittata, Spiced Drake Jerky, Glow-Moss Pesto Noodles, Garlic Tuber Mash, Stargazer Fish
  Pie, Stone-Thyme Tea, Cave Berry Jam, and the old ones). Each is a chain of minigames; new ones:
  **simmer** (heat knob, lag, boil-overs), **flip** (toss at golden, catch with the pan), **grate**
  (strokes, pile band, knuckles), **roll** (lean the pin on the thick side, even strips), **bake**
  (hearth oven: stoke the fire, pull at golden, scorching), **mash** (aim + steady presses). Chop and
  knead have combo streaks. Score = 80% steps + 20% ingredient quality; it becomes the dish's `q`.
  The pantry is the backpack **plus the stash at home**; a one-short combo gets a sniff hint.
  Recipes are discovered by cooking (`discover('recipe', dish, { best })`, recipe cards in the pantry).
  Emits `act { type: 'cook', dish, score, isNew }`.
- **Buffs** (`BUFFS` in recipes.js, timed by the dish's quality: 0.6×–1.4× of `secs`):
  `zippy strong hearty glow warm cool guard lucky pack sturdy bouncy sense`. `game.eat` →
  `foodBuffs(game, id, q)` (hook in Game.js). The HUD strip (`ui.buffs`, hook in UI.js) shows each as
  the dish's icon with a draining bar and a timer (tap/hover: name, effect, source); it replaces the
  old charms. `hearty` runs itself (+0.6 energy/s, cooking/buffs.js). **The mine should read**
  (lead / combat): `strong` (already), `zippy` (already), `sturdy` (already), `glow` (State), plus
  `warm` (cold drain ×0.3), `cool` (heat/lava drain ×0.4), `guard` (damage through a block ×0.5,
  parry window ×1.4), `lucky` (freed ore/gem q +10, pristine chance ×1.5), `pack` (bag/trip
  capacity +6 or +1 pocket), `bouncy` (jump ×1.35), `sense` (glint hidden ore within 4 m).
- **Old Star's lesson** (`cooking { tutorial: true }`): hands over a glowcap and rock salt if
  missing, then walks you through Glowcap Soup (chop › simmer › season) with a tip per step and a
  reaction to each score; the pantry only cooks that dish while he teaches. On the dish:
  `act { type: 'lesson', step: 'cook_done' }`. Leaving goes `home { from: 'cooking', lesson }`.
- **Hooks in shared files**: `PixelArt.drawIconArt` (`|| drawCookIcon(...)`), `items.js` (merge
  `INGREDIENTS`, plants get `q`), `Game.eat` (`foodBuffs`), `UI.js` (`ui.buffs = new BuffStrip`,
  ticked in `ui.update`), `Props.js` (harvest section, plant tables, `twinkle` call in `update`).
- **Test hooks**: `scene.debug` in cooking: `start(dish | ids, { q })`, `auto(score, delay)`,
  `run(secs)`, `finishStep(score)`, `state()`, `result()`. `window.__forage`: `open(id, opts)`,
  `sim(id, 'good'|'rush'|'yank'|'soft'|fn)` (headless, also in node), `active.drive(script, secs)`,
  `active.step(input, secs)`, `specs`. Props: `props.debugPlants(x, y, z, r)`. URL `?tutorial=1`.
- **For other parts**: shops could stock `drake_meat` (120g, Rocco / trading post) and the grocer
  `stone_thyme`, `cave_garlic`, `tunnel_tuber`; monsters could drop `drake_meat` (rock drakes) and
  `grub`. Quests can ask for dishes by id and quality (`cook {dish, score}`).
