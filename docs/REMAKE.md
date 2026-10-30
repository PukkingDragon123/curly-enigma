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
3. **Waking up** (`home`, **Old Star's house**). You just wake up, in a bed: heavy eyelids opening
   and closing, the room blurred and muffled, then in focus: a cosy bedroom with a fire in its
   hearth, and Old Star, an old star-nosed mole blacksmith, crouched at it with a poker. You came
   down through his ceiling, out cold, and he put you to bed. His house is dug
   into the rock beside a great glowing cavern (round windows on it): a living room with his
   fireplace, armchair and books, a kitchen with the range, a smithy with his forge, a hall with the
   cage lift down to the mine and the front door to Deep Town (caved in). He was this close to
   getting out: **he needed a million gold** for the way up, and he'll teach you so you can both
   make it.
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
  `kind, ruin, zone`) · `part {part, track, level, grade, score}` (a coop part forged at home) ·
  `install {part, track, level, q}` (a part built onto the coop) · `look {at}` (took a good look at something:
  `sunbeam well tunnel fountain notices` in town, `signpost cavein` on the trails, or a gaze at a quest's
  `lake lava nest ...`) · `lore {id, src, shelf, ruin?, isNew}` (a lore entry read or heard: src `carving
  journal tale book relic quest`). Add a type if you need one; write it here.
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
| **Home: Old Star's house, waking up, tutor, forge lessons** | `src/scenes/HomeScene.js`, `src/home/*`, `src/iso/homeLayout.js`, `src/ui/Tutor.js`, the forge tutorial (`src/scenes/ForgeScene.js`, `src/forge/*`) |
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

**The journey** (`src/scenes/FallScene.js`, ~42 s, skippable by Skip / Esc / a tap; rebuilt in wave 4,
see "As built: the forest (wave 4)" at the end of this file): golden hour in an old forest. The
hero and Nugget's coop (`makeCoop`, loaded with `import.meta.glob`; a stand-in hut in
`bookends/journey.js` if the file is ever missing) walk the trail, cross the stream (he takes the
log footbridge, the coop wades), find the strange chest glinting in a clearing; it spills gold light,
the crust sags, cracks race, it breaks, a fall down the dark shaft (`bookends/fallshaft.js`, streamed
in while they walk), then darkness: muffled hearing (a lowpass on the master bus, restored on exit), a
slowing heartbeat, a few heavy blinks (iris) at the speck of light far above. Ends with
`goto('home', { from: 'fall' })`.
- Files: `bookends/forest.js` (layout and build), `bookends/forest/*` (air and sky, trees, floor,
  grass, far trees, animals, sounds), `forestfx.js` (the forest's toon material, the stream, mist),
  `foresttrees.js` (stump, footbridge, signpost; chunked instancing), `chest.js` (the chest, the
  spill, the breakable crust, the crack decal), `journey.js` (coop loader, heartbeat, muffle),
  `meadowfx.js` (shared uniforms, sprite sheets). `landscape.js` and the old meadow are gone.
- Tiers: full, lite (phones, 'Simple'/'Off' shaders, `&lite=1`), software (SwiftShader/llvmpipe; `&lite=0` forces full).
- Test hooks: `?scene=fall&at=secs` (start later), `&freeze=1`, `&lite=0|1`;
  `scene.debug.{ at(secs), time(), shot(), state(), skip(), perf(), tris(), cam(), hold() }`.
  `scene.skip()` is safe at any time (mid-transition it waits; while the forest is still being
  built it cancels the build), then leaves for `home`.

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
(rows of **9**, Minecraft-like). A new mole has **9 pockets**; the equipped bag's `slots` sets it
(`bag_small` 9, `bag_medium` 18, `bag_large` 27, `bag_huge` 36, `bag_bottomless` 45, bought in the
shops), plus 1 per 2 levels of Deeper Pockets and pockets from `skill('carry')` (max 54). Weight
and the coop's parts: see "Weight, the coop's load and coop parts" below. Stacks: ores 16, gems 8,
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
- **Coop shelves**: `data.coop = { level, up, upQ, slots, food, laid, layT, ... }`, 6/9/12/18/27
  shelves by the Shelves part installed (`level`). Stash: `data.stash.slots` (grows).
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

## Weight, the coop's load and coop parts (lead): as built

Files: `src/core/weight.js` (weights, carry, load tiers, coop tracks), `src/data/coopParts.js` (the
parts), `src/core/inventory.js` (`bagLoad`, `canLift`, `coopLoad`, `coopRoomKg`, `installPart`,
`nextPart`), `src/gfx/char/coopGear.js` (what's built on the coop model, and its cargo), the coop side
of `src/ui/Backpack.js`, the HUD gauge (`ui.setLoad(load)` in `src/ui/Hud.js`), `src/deep/DigScene.js`
(`weigh()`, `whereTo(id)`, `tooHeavy`), `src/deep/Nugget.js` (legs, load, lantern, gear).
- **Weight.** Every slotted item weighs something (`kgOf(id)`: ore ~1–1.8 kg, ingots ~1 kg, gems
  0.12, herbs 0.08, food 0.3, a forged weapon 0.5 + 0.75 per ingot; `kg` on an item overrides). The bag
  carries `carry` kg comfortably (`bag_small` 15, satchel 24, pack 36, expedition 52, bottomless 80),
  × `skill('carry')`, +6 with the `pack` buff, +4 with `strong`. `state.bagLoad()` →
  `{ kg, carry, r, speed, jump, run, tier, max }`; tiers: `light` (≤0.6), `good` (≤1), `heavy` (≤1.5:
  walk ×0.9→0.6, no running, jump ×0.8, walking costs energy), `over` (≤2: ×0.6→0.4, jump ×0.5),
  `max` (≥2: ×0.35, nothing more can be lifted: `state.canLift(id, n)` is false). Weight only matters
  in the mine; shops and quest rewards still hand things over (the pack just gets heavier).
- **In the mine.** Pickups that don't fit by pockets or weight wait on the floor (or go to Nugget if
  she can take them: `nugget.canTake(id, range)`). The first heavy load gets a tutor line; the HUD's
  scale beside the backpack fills green → amber → red and shows `kg/carry` when heavy.
- **The coop carries the load.** The coop side of the backpack shows her load and has **Unload ore**
  (ore, ingots, parts and anything ≥0.8 kg, heaviest first, as far as her legs allow). Her legs carry
  `coopCarry(state)` kg comfortably (Legs track: 20/35/55/85/130, × part quality, × Nugget skills)
  and take at most 1.5× that; a loaded coop walks slower and hops lower.
- **Coop parts** (the user's ask: forge a component, then build it on). `COOP_PARTS` in
  `data/coopParts.js`: one part per level of five tracks (Shelves: copper brackets → steel cargo rack;
  Legs: copper bands → iron-shod talons → steel braces → mithril spurs; Nest box: tin → bronze pan →
  silver bell; Ore chute; Roof lantern: tin → lumite). Parts are quality items (`cat: 'part'`, the
  forging score is `q`; a finer part works up to ×1.1). They're forged at the home forge (forge part:
  `src/forge/parts.js`) and installed from the coop side of the backpack (**Install** on its track
  row, or on the part's tag): `Inv.installPart(state, id, { from })` checks the order, sets
  `data.coop.level` (shelves) / `data.coop.up[track]`, keeps `data.coop.upQ[track]`, emits `items`
  and `act { type: 'install', part, track, level, q }`.
- **Effects.** Shelves: 6/9/12/18/27 cubbies. Legs: carry, walking speed, hop height. Nest: laying
  ×1.35/1.7/2.1. Ore chute: when your pack is heavy (r ≥ 1) or full, what you dig (not gems) rolls
  onto her shelves if she's within 7 m. Roof lantern: a 4.2 m warm light / 6.5 m lumite glow.
- **On the model** (`CoopGear`): shelf brackets on the side walls, a rack on the back, a roof rack,
  bands/shoes/braces/spurs on the legs, a nest box under the round window (+ pan, + bell), a copper
  chute down the left wall, a lantern under the ridge; cargo (crates, sacks, ore lumps) piles up on the
  racks as her load grows. Same at home (`src/home/nugget.js`).
- **Test hooks**: `scene.nugget.debug.install(id, q)` (gives the part and fits it), `.load()` →
  `{ kg, carry, r, levels, gear }`; `state.bagLoad()`, `scene.load`.

## Old Star's tutor (home part): `game.ui.tutor`

`src/ui/Tutor.js`, created by `UI` (one hook in `UI.js`: built in the constructor, ticked from
`ui.update`). Wave 3: the carved dialogue board with the speaker's live 3D portrait (see "As built:
dialogue & 3D portraits" at the end; the calls below are unchanged, plus `who`).

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
- `import { starPortrait, starPortraitURL, MOODS } from '../ui/Tutor.js'` gives a 40×40 still of the
  3D Old Star per mood (canvas / data URL; the URL is '' until made: `portrait3d.still()` awaits it).

## Old Star's house, waking up, lessons (home part): as built

(Wave 3 replaced the cave workshop with a full house and the cold-water wake-up with eyelids.)
**Wave 4 replaced the house with an old camp in a cave: see "As built: Old Star's camp, an old house in
a cave (wave 4, house part)" near the end. What follows is the wave-3 house; the stations, lessons,
Old Star and the test hooks work the same in the camp.**

**The home** (`home`): your bedroom (the save's tile grid: build mode, the bed, Nugget's coop, your
trunk) opens through a round-topped doorway and three worn steps (`ARCH`, `STAIRS` in
`src/home/units.js`) into Old Star's house (`HALL`: its bounds, floor at y −0.5 m). The house is a
plan of rooms (`src/home/plan.js`: `ROOMS`, `DOORS`, `WINDOWS`, `FRONT_DOOR`, `roomAt`, `doorAt`)
whose walls, ceilings and floors are built by `src/home/surfaces.js` as 1/64 m textured reliefs with
the fixed lights of each room baked into the texels (a light only lights its own room): lime plaster
between oak posts, knee braces, a wall plate and lintels over a wainscot (sage panels in the living
room, oak in the hall, glazed tiles in the kitchen), the smithy in sooty brick over a stone plinth;
joisted board ceilings; oak and pine boards, terracotta tiles, flagstones, worn pale along the ways
people walk. Collision is boxes only (`BoxWorld`: walls with the doorways left open, the floor,
ceilings, every piece of furniture). Outside the round windows: the glowing cavern
(`src/home/vista.js`: two painted panoramas round the house: cliffs veined with crystal, mushroom
forests, waterfalls into the mist, a far-off burrow village, stalactites and glow-worms; a nearer
arc of rock spires). The furnishings are code-made voxels (`src/home/houseProps.js`, plus
`tavernProps.js`, `caveProps.js`, `ruinProps.js` and the 1/32 furniture builders), placed and
batched (per-room baked light) by `StarHouse` (`src/home/house.js`; `SPOTS` and `STAR_SPOTS` are
the named places; the scene still calls it `scene.cave`):
- **the living room** (straight down the steps): his fireplace between two round windows (mantel
  with the first nugget, photos, candles), his mossy armchair and a footstool, the old settee, a
  lamp table, the big woven rug, two bookcases full of books ("Browse the books" reads a title),
  the grandfather clock (its pendulum swings, it ticks; E tells the time), his notes board, his
  keepsakes on the south wall (the torn Surface Express ticket, the jar of coins, the tin train,
  the seashell, a medal) under Marigold's portrait, paintings (the sea, hills, mountains), potted
  cave plants, a sconce, the wagon-wheel chandelier; the boarded-over hole you fell through in the
  ceiling, roots poking through, dirt trickling now and then, what came down swept into the corner
  (a few coins and a quartz to pick up);
- **the kitchen** (west): the cooking range in its brick inglenook (**the cooking station**: "Cook at
  the range", the stew pot and kettle steam, copper pans on a rail, spice jars on the mantel), the
  sink and iron pump under the window ("Drink from the pump": +energy once a day; it drips), the
  pantry shelves crowded with jars, crocks, bottles, cheese, loaves and sacks, the plate dresser, the
  dining table with four rush chairs (sit), herbs drying from the beams, a hanging oil lamp;
- **the smithy** (north-west): the forge and its hood (**the forge station**: "Work the forge" on it or
  the anvil), the bellows (pump them), the anvil, the quench trough and his bucket, the tool rack,
  coal, a water barrel, sconces, and his box bed against the wall (curtains, quilt, nightcap);
- **the hall** (east): the cage lift in the east wall (`useLift` / `openLiftPanel` / `rideTo` as
  before), the front door to Deep Town in the north wall (`FRONT`; "Through to Deep Town" once
  `flag('escaped')`, rubble behind it until then), coats on hooks, boots and a stick by the door,
  his packed suitcase (the almost-escape), the Miners' Board, his chest, the coal cart (3 a day),
  the old map, crates, and his **dream wall**: a slate chalked "THE WAY UP" with a thermometer to a
  million that reached 480,000 once and was rubbed out ("LONG STORY");
- **your bedroom** (`src/home/shell.js`, `src/home/walls.js`: the same plaster over a faded blue
  wainscot; floorboards laid once on an unpainted floor, `flag('boards')`): its own hearth in the
  south wall (`HEARTH_SLOTS` / `HEARTH_X` in `src/iso/homeLayout.js` keep it clear; socks drying,
  candles, a little clock, fire irons), the round crystal window, the poster, the ledge of jars,
  lanterns, and fixed pieces that hide when furniture covers their tiles: the bedside table with a
  candle, the wardrobe, your trunk at the foot of the bed, firewood, a fern, Nugget's corner (straw,
  feed sack, water dish), the rag rug;
- life: fires breathing, embers, steam, the clock, the pump's drip, dust motes in the lamplight and
  the windows' teal glow, timbers creaking, soft contact shadows under the furniture;
- under the floors: a block of dark earth (what you see from the lift shaft riding up or down), with
  an oak sill at the landing.

**Old Star** (`src/home/oldstar.js`, the `StarMoleRig` with `setExpression` moods): walks the whole
home (house, steps and your bedroom) on an A* grid rebuilt with the collision, works the anvil
(clangs, sparks, the anvil flashes), pumps the bellows (the forge flares), stirs the pot on the
range, reads his board or a book, looks at the lift or his dream wall, sits in his armchair with
his pipe, sleeps in his box bed at night (snoring), and turns to you when you come near. Talk to
him (E) for the lesson, a tip, or skipping; he has an aside for most things you look at. His save
corner: `state.data.oldstar` (`src/home/starData.js`): `lesson: 'wake' | 'mine' | 'forge' | 'cook' |
'done'` (+ `skipped`, `talkI`, daily counters).

**Waking up** (`home { from: 'fall' }`, `src/home/wake.js`): no splash. You lie in your bed looking
up at the beams. Dark, a slow heartbeat, light glowing red through the lids; the whole mix is
muffled (a low-pass between the master gain and the compressor, opening as you come round).
Heavy eyelids (`WakeFx`: a soft dark mask, the upper lid moving most, a warm rim, lashes, CSS-blurred)
crack open on the blurred ceiling and sink shut; a second, longer look, the head rolling on the
pillow toward the fire, Old Star humming; a third, a flutter, and the room comes into focus: the
bedroom hearth, and Old Star crouched at it with a poker (pose `poke`). The bed creaks, he
straightens, turns round, waves, and talks (tutor card, each line waits): you came down through his
ceiling and he put you to bed, who he is, the **million gold** for the way up, his offer, your hen.
Then you sit up and get out of bed (on its side), he points you to the lift and walks off
downstairs to it. Sets `flag('fallen')`, `flag('nugget')`, starts the chain
(`game.quests?.start('lessons')`), emits `lesson wake` + `talk oldstar`, stage → `mine`.

**The lessons** (`src/home/lessons.js`; the objective line follows `NEXT[stage]`):
- `mine`: until `flag('prologue')` is set, the lift is labelled "Ride down to the dig" and goes
  straight to `deep { from: 'lift', lift: 'L0', lesson: 'mine' }` (emits `lesson lift`); the
  mine-lessons part takes over there and comes back with `home { from: 'lift', lesson: 'mine' }`.
  With copper ore in the bag he sniffs it (`lesson copper_home`), gives coal if you're short, stage
  → `forge` (talking to him with copper does the same); without it he sends you back down.
- `forge`: the forge / anvil says "Forge with Old Star" → `forge { from: 'home', tutorial: true }`
  (below). The forge sets the stage to `cook`; back home he admires the blade (grade line).
- `cook`: the kitchen range says "Cook with Old Star" → `cooking { from: 'home', tutorial: true }` (eggs
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

**Load and cost**: the house is built in steps that yield to the browser between them (props per
room, the surfaces, the cavern, the merge), and the scene renders nothing until `enter()` is done
(the transition's black covers it). ~1.2 M triangles in all, merged into ~100 meshes by room
(frustum-culled: you see a room or two at a time; ~90 draw calls and ~1.6 M triangles drawn from
the bedroom door with the outline pass); windows and door frames are built once and cloned; one
10-slot light pool; glows and contact shadows are two quad batches. Build time headless is ~12–20 s
on the shared, heavily loaded test box (props ~6 s, walls/ceilings/floors ~2–4 s, merge ~2 s);
`scene.buildMarks`, `scene.cave.steps` and `scene.cave.surfaces.steps` give the split.
`scene.questSpot(name)` (`lift`, `passage`, `hole`, `hearth`, `forge`) places the quest markers.

**Screenshots** (`shots/home/`): the wake-up `wake-1…9`, `phone-wake-*` (390×844), `phoneL-wake-*`
(844×390); arriving by the lift `lift-arrive-*`; the rooms `bedroom-*`, `living-*`, `kitchen-*`, `smithy-*`, `hall-*`, `window*`, and the
same on phones (`phone-*`, `phoneL-*`); the old cave for comparison in `shots/home/before/`.

**Left for other parts** (text that still mentions the old cave or the bucket): the quest hint for
`lessons.wake` ("He's the one holding the empty bucket.", `src/data/quests.js`), the forge
tutorial's "back to the cave" (`src/forge/tutorial.js`), the lift map's cave pocket under the
clearing (`src/fps/liftPanel.js`), and the e2e step label "waking up: cold water and Old Star".

**Nugget at home**: her walking coop (`src/home/nugget.js`, inventory part) keeps to your room's tile
grid; while you're out in the house she waits just inside, by the steps. "Pet" aims at `nug.head()`.

**Test hooks**: `__game.scene.debug` at home: `useLift(id)`, `toggleBuild(on)`, `placeAt(id, x, z, r)`,
`interact(label)`, `labels()`, `talk()`, `openNotes(i)`, `minersBoard(tab)`, `openChest()`,
`clock(h)`, `star(spot?)` (his state; a spot name from `STAR_SPOTS` puts him there: `anvil`, `bellows`,
`fire` (the range), `board`, `books`, `hearth`, `lift`, `ruins` (his dream wall), `pool` (the sink),
`armchair`, `cot` (his box bed)), `lesson(stage?)`,
`skipLessons()`, `await finishWake(maxFrames)` (plays the wake-up through, carrying on every card),
`wakeFx()` (`{ open, blur }` of the eyelids), `arrive(from)` (as if back from `'lift' | 'forge' |
'cooking'`), `aim(x, y, z)`,
`stand(x, z, yaw, pitch)`, `step(n, dt)` (synchronous), `await run(n, dt, until?)` (frames with the
scripted scenes' awaits let through: use it for the wake-up and Old Star's lines; `step` alone
can't move an awaited sequence on), `stats()` (draw calls, triangles), `spots` (with `rooms`). Forge:
`scene.lesson.debug.stage()` plus the forge's own `scene.debug` (smelt, forge, pump, strike...).
Tutor: `ui.tutor.next()` (the first press finishes the typing, the second carries on), `ui.tutor.active`.
Query strings: `?scene=home&fresh=1&from=fall` (wake-up), `?scene=forge&fresh=1&tutorial=1&from=home`.

## Plan hooks in the mine (lead)

`world.plan` gains lists the other parts stamp or populate (all meters, deterministic per seed):
- `plan.burrows: [{ id, kind: 'trader'|'herbalist'|'raccoon'|..., x, y, z, yaw, zone }]`
- `plan.ruins: [{ id, kind, x, y, z, yaw, r, zone, seed }]`
- `plan.trails: [{ id, pts: [{x,y,z}...], from, to }]` (old dug tunnels joining lifts, burrows,
  ruins and the town) — **empty since wave 4** (no human works in the caves; burrows have natural
  `passage` features, `plan.ruins` are dungeons; `plan.remains` and `plan.signs` are where the lost
  miners and the lift signs are: see "As built: natural caves, dungeons, the lifts")
- biomes now include `4` **dino caverns** (huge caves, ferns, giant bones) for the creatures part.

Each is also a plan feature (`kind: 'burrow' | 'ruin' | 'trail'`, with a `bb`) whose voxels are
stamped by the owning part's `stamp*(f, vox, X0, Y0, Z0, CS)` (pure: it may run in a worker).
Voxel material ids (`src/deep/materials.js`): base 0–42, dungeons and lift stations 64–79, built
blocks 80–95, ruins 96–119, NPC burrows 120–127, ores 128+.

## NPC burrows and traders (traders part): as built

**The burrows** (`src/deep/gen/burrows.js`, pure): each `plan.burrows` kind is its own place in
voxels, and lists the 3D props `Traders.js` puts in it (`burrowLayout(f)` → pieces, props, the
keeper's spot, lights, Rocco's secret passage; `roomToWorld/worldToRoom/roomYaw/wallPoint` convert
room space). All rooms get a timber-framed door, a **porch** outside it with a hanging **sign**
(TRADING POST / HERBALIST / STORAGE · NO QUESTIONS / DEEP OUTPOST) and a lamp, and a step behind
the counter for the keeper. New materials 120–127 (`FLOORBOARD PLASTER TARP IRONPLATE FLAGSTONE
STAINED COMPOST CRATEWOOD`, `hp 9999` and `unbreakable: true`).
- **Trading Post**: plank wainscot + limewash dome with cross beams, a long panelled counter (scale
  with swinging pans, ledger, bell, coins, lamp), three shelves of goods on the back wall, a display
  table of ore baskets and a gem box, crates, barrels, sacks, a chalkboard (WE BUY ORE&GEMS), a rug.
- **Herbalist's Hollow**: earthen walls, a flagstone hearth with a bubbling cauldron over embers
  under a brick hood, raised compost beds of glowing mushrooms, a work table (mortar, herbs, book),
  jar and potion shelves, a seed-drawer cabinet, a drying beam hung with herbs, peppers and garlic.
- **Rocco's Storage**: crate stacks everywhere, two tarp-covered heaps, a crate counter, weapons
  racks, a barrel of blades, the gramophone, a surface painting, a mannequin, a mounted fish, a
  coat rack, a lost & found box, the swinging lantern (its light swings too), the NO QUESTIONS
  sign on chains, and a **secret back door**: a crate stack in the back wall with tell-tale hinges.
  E once: it rattles (Rocco gets nervous); E again: the plug goes (world edits, so it stays open),
  the crate slab swings open, a timbered passage leads to his **stash nook** (chest: gold + a gem,
  once; he notices) and an unfinished dig with a pick stuck in it and a TODO note.
- **Deep Outpost**: brick walls with an iron band, flagstones, an iron-plated counter, heavy supply
  shelves (dynamite crates, rope, oil, stakes, helmets), a cot, sandbags by the door, a brazier,
  a stove, a map table, a banner.

**The keepers** (`src/deep/traders/folk.js`; specs in `SHOPS[id].keeper`, chibi build): Barnaby
Burr (trader mole, cheery), Granny Thistle (herbalist hedgehog, grumpy), **Rocco** (a fox rig
repainted as a raccoon in `traders/rocco.js`: mask, white brows, grey cheeks round a white muzzle,
ringed tail, rimmed ears, shifty eyes that dart, a too-big coat whose front panel swings open on
hidden pockets: `rig.openCoat(k)`), Warden Brask (outpost badger, stern; dozes when nobody's about
and jolts awake when you come in). They idle in character, look at you (`rig.lookAt`), greet you
once per visit with an expression and a speech bubble, chat now and then, react to every trade.

**The counters** (`src/deep/traders/shop.js`, styles reuse `ui/shop.css` + `traders/shop.css`):
the town shop room (sign, keeper portrait with changing faces, speech, shelves with tags, counter
card, ledger) with tabs **Buy · Sell · Jobs**; Rocco: **Weapons · Deal · Oddities · Shinies · Jobs**.
Prices: `shopPrice` (stock price, else value × 2.2 × markup) shown and charged through
`state.buyPrice` / `state.buy` (the Haggler skill); selling pays `sellPrice × buys.mult` (× today's
**wanted** item bonus). Rocco pays `value × grade mult (S 1.45 … F 0.6) × today's craving (+25%)
× haggling × state.skill('fence')`; **haggling** is a timing meter (push in the green: +6–12%,
miss: −5% and his patience drops; 3 pushes, 3 patience). **Deals** (one a day): a hot order (a
weapon type at 180%), a mystery crate, a tip (marks the nearest untouched geode on the radar as a
stake), or a swap (your cheapest blade for an oddity). Rewards spill to the home stash when the
pack is full. Saves under `state.data.traders = { met, found, haggle, deals, tips, sold, stash,
secret, doorHint }`.

**Events**: `reach {place: 'burrow:<kind>'}` on walking in · `talk {npc}` when a counter opens
(quests deliver/offer then; the speech shows `quests.forNpc(npc).lines`) · `buy {id, gold, from, n}`
· `sell {id, gold, to, n}` · weapons `sell {id: type, weapon: {type, metal, grade, score}, gold,
to: 'rocco'}` · `puzzle {id: 'rocco_door'}`. **Jobs** tab: the npc's active requests (deliveries
with have/need), news lines, an **Any work?** button (`game.quests.offer(npc)`) and **Hand it over**
(re-emits `talk`). NPC ids: `trader herbalist rocco outpost`.

**Module API** (`src/deep/Traders.js`, `new Traders(ctx)`): `update(dt, {player, eye, time})` →
`[]` · `target(eye, dir, reach)` → `{label, kind: 'use'}` (keepers, the secret door, the stash) ·
`use(eye, dir, reach)` → `[]` · `lights(eye)` → ≤ 4 lights (lamps, fires, the swinging lantern) ·
`onVoxel()` · `dispose()`. A burrow builds within ~22 m (a few ms a frame) and drops past 30 m.
`ui.openShop('trader'|'herbalist'|'rocco'|'outpost')` also opens these counters (`panel: 'burrow'`,
one line in `ui/ShopUI.js`).

**Test hooks**: `scene.traders.debug` — `list()`, `go(id, 'door'|'counter'|'out'|'secret')`,
`build(id)`, `talk(id)` / `shop(id, tab)` (returns the panel; `panel.debug.tab(k)`,
`.haggle(i)`, `.push(x)`), `say(id, text)`, `secret()`, `stash()`, `folk(id)`, `layout(id)`.

**Hooks the lead still needs** (DigScene/Generator/Props/Dig): load `./Traders.js` like Props
(`extModules` + `['./Traders.js', 'Traders', 'traders']`), call `this.events(this.traders.update(dt,
{ player: pl, eye: pl.eye(), time: this.time }))` next to `props.update`, `this.traders?.dispose()`
in `exit()`; stamp burrow features **after** trails (`plan.features.sort((a, b) => (a.kind ===
'burrow') - (b.kind === 'burrow'))` before `aabbOf`), else trail frames land inside the rooms;
keep cave props out of burrows in `Props.blocked`; and treat `MAT[m].unbreakable` as unbreakable in
`Dig.js` (blasts).

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
floor is missing (chasms, open caves, water), and leaves ruin stone alone. Loose rock (anything
`gran`: gravel, sand, ash, snow, rubble) within ~0.4 m of a trail tunnel or ladder shaft, and
anywhere in a ruin's box that the ruin doesn't build, is packed into dirt so nothing pours in (the
trodden gravel floor and the cave-in plugs themselves stay loose). At play time: a
signpost at every place's way out with hand-painted arrow boards (1/64 m voxel paint, readable from
both sides) turned along each trail toward its far end and one pointing back in (names from
`plan.lifts`, `plan.burrows`, Deep Town), milestones halfway along long trails, iron rails on the
cart tracks, ore carts (some tipped), lost tools (a snapped pick and a bucket at every cave-in),
and hand ropes with hangers along every plank bridge. Signposts are readable with E.

**Test hooks**: `scene.ruins.debug` — `list()`, `go(id, where, look)` (where: `entry|mid|door|room|
puzzle` or a local `[a, y, b]`; look: `idol|door|chest|dials|beams|plates|lever|switch|valve|shaft|
gallery`), `solve(id)`, `reset(id)`, `press(id, i | 'chest')`, `puzzle(id)`, `site(id)`, `trail()`,
`sign(k)`. Screenshots: `shots/ruins/` (every ruin kind, each puzzle before/after, the treasure
room, trail signpost, cave-in, plank bridge, relic icons, phone portrait/landscape).

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

### As built: wave 3 — side quests, lore, clarity (quests part)

The user: "add a lot more side quests from the village and lore … game quests and missions need to be
clear." 86 quests now (49 new): 37 village favours, 9 lore quests, 3 more burrow requests.

**Deep Town's people** (`src/data/villagers.js`): every townsperson built from a seed in
`src/town/folk.js` gets a name and a character by that seed (`VILLAGERS[npc] = { name, seed | keeper,
look, title, where, ink, about, wait, thanks, tales }`; `SEED_NPC[seed]`); keepers are listed by
their shop id, which stays their npc id (`tools grocer furniture blueprints outfitter assay ticket
lift`). The cast: Grandpa Tuck (retired Company miner), Granny Mabel (runs the Sunbeam Festival), Old
Burdock (the old lift-crank), Snorri (night watchman, asleep), Old Hollis (by the Shaft Seven
tunnel), Morel / Finnick / Garnet (market stalls), Lark (busker), Puddle (fishes in the fountain),
Bristle (sweeper), Digby and Nubs (ore haulers; Nubs is a young star-nose), Mrs. Primrose (twins),
Tilly / Hops / Twitch (kids), Bess Prickle, Nana Loam and Clover (back lanes), six gossips and two
window shoppers. `NPCS` (data/quests.js) gets an entry per villager (`town: true`); `NPC_ALIAS`
takes keeper names too (`grubb → tools`, `hazel → grocer`...).

**The quests** (`src/data/sideQuests.js`, merged into `QUESTS`; `QUEST_ORDER` is main, story,
request, village, lore; `QUEST_GROUPS` / `groupOf(kind)` for the book):
- Hazel: Fresh From the Deep → The Truffle Hunt (dig truffles with Nugget beside you; her risotto
  recipe). Grubb: Grubb's Grindstone (iron ingots → the fine chisel) → For the Window (forge a bronze
  axe B+ and hand it over → mace plans); Long Fuse, Short Temper (after Stand Well Back). Old Vex: An
  Assayer's Eye (3 pristine ores → badger brush) → Weights and Measures (kobolds stole her weights).
  Pip: A Chair for Granny (hides + iron, then tell Mabel → an armchair) → Light for the Lanes (crystal
  lamp). Dilly: The Lost Mitten (look at a lava pool in the Magma Deep; reward: a pie), Silk Scarves.
  Mr. Fennimore: Postcard From Up There (stand in the sunbeam, tell 3 old-timers) → The Fennimore Line
  (lore: 3 pages of Hobb's journal). Bramble: A Squeaky Cage → All Stations (walk 3 layers → a roof
  lantern for the coop).
- Grandpa Tuck: The Company Signposts (read 3) → Tuck's Old Pick (search a dropped pick at a cave-in).
  Granny Mabel's chain, the Sunbeam Festival: Pies (cook a root pie) → Lanterns → The Sun Hymn (read
  a ruin carving: you get a rubbing, take it to Lark, then stand in the sunbeam with the town).
  Lark: New Strings. Puddle: Fat Bait → The One That Got Away (take a good look at an underground
  lake). Bristle: Dust Bunnies. Digby: Shift Swap → The Old Workings (clear a lair). Nubs: A Nose Like
  Mine (find a Star-Nose Idol, show him). Mrs. Primrose: Breakfast for Twins (Nugget's eggs → a nest
  box for the coop). Tilly: The Dare (peer into the tunnel and the well). Hops: Beetle Jar. Twitch:
  Show and Tell (walk Nugget over). Snorri: A Strong Cup. Old Burdock: Burdock's Bells (5 lifts).
  Clover: **The Begonia Feud** (ask Hazel, then choose: "Yours" / "Hazel's" / "Hazel says you paint
  them"). Garnet: A Necklace of Colours. Morel: One of Everything (6 kinds of plant). Finnick: Frost
  Shrimp on Ice. Nana Loam: A Letter for Up Top (she hands you the letter for Fennimore's mailbag).
  Bess Prickle: Soup for Albert (a glowcap soup, score 70+).
- Lore: Professor Talpa: Rubbings of the Old Ones (carvings in 2 ruins) → A Relic for the Archive
  (any relic) → The Star Shrine (wake an idol) → **The Key With No Lock** (find the Star Key in the
  Frost Vault, then choose: archive it for 15,000 g / keep it); Survey of the Deep Garden (dino
  caverns → spear plans). Old Hollis: Shaft Seven (ask Old Star, read 2 journal pages) → **The Million
  Cart** (talk to Rocco, open his secret door: a star-stamped coin; choose: tell Old Star / let
  sleeping gold lie) → Rocco Makes Amends (only if you told: Rocco's purse to Old Star, a music box).
- Burrows: A Gem Case for the Post (trader), Garlic for the Pot (herbalist).
- Pacing: about fifteen folk have work on your first visit; the rest ask from day 2 or 3 (`onDay`),
  after an earlier favour (`requires`), or once you've reached a layer (`reached(n)`).

**Engine** (`src/core/quests.js`), new: steps `talk: npc`, `look: 'lake'`, `grant: { id: n }` (items
on the step), `say: { by, text, mood }` (a line when the step is done), `choose: { to, prompt, options:
[{ id, label, sub, say, reward, flag, take }] }`, `heard: [lines]` (said when a "tell N people" step
counts them), `deliver: { to, items, weapon: { type, metal, grade }, any: { cat, n } }` (weapons and
"any relic"; quest items are key items: given and taken back, no pockets), `need(state, game)`. Quest
fields `ask` (default for Deep Town givers: offered in their dialog, not on talk), `gives` (items on
accept), `when(state)` (offered only while it holds, e.g. `reached(3)`), `urgent` (a story beat a
burrow keeper offers first, even while their other work is under way). Rewards add `lore`,
`recipe`, `rep` (friendship; village quests give ♥1 to the giver), `flag`; a choice's reward adds to
the quest's. API: `offers(npc)`, `accept(id, npc)`, `choose(id, opt)`, `stepsFor(npc)`,
`markerFor(npc)` → `'!'` (work to offer) / `'?'` (hand in, tell, decide) / `'…'` (theirs, under way) /
null, `rep(npc)`, `choice(id)`; events `say`, `choice`, `handed`, `short` besides the old ones; the
view has `ready`, `ask`, `from`, `choice`. Save adds `rep` and `choices`. Quest items:
`src/data/questItems.js` (Dilly's mitten, Vex's weights, Tuck's pick, the Sun Hymn rubbing, the
star-stamped coin, Rocco's purse, Nana Loam's letter; `cat: 'key', quest: true`, icons in
`src/gfx/questIcons.js`, hooked into `PixelArt.drawIconArt` and merged in `data/items.js`).

**Where things are** (`src/core/questWhere.js`): `stepGoal(view)` (what a step is about: npc, place,
burrow, ruin, danger, zone, sight, biome, or the hearth/forge for cooking and smithing) and
`resolveTarget(game, view)` → `{ label, sub, pos (meters, this scene), via, depth, r }`, `bearing(game,
t)` → `{ dist, dy, rel, d3 }`. In the mine: burrows, the nearest unopened ruin (by kind), dangers,
cave-ins (`caveIns(plan)`), trail mouths, the town gate, home. In town: people's heads
(`scene.questNpcPos`), the sunbeam, well, tunnel, fountain, falls, notice board. At home: Old Star,
the hearth, the forge, the hole (the home scene's `questSpot(name)` → `{x,y,z}` for `lift passage hole hearth forge`,
else its `debug.spots`, else defaults). A goal in another scene points at the way there
(the town lift, your burrow door, the cage lift, the passage, the town gate).

**Clarity**:
- **The objective strip** (`src/ui/Tracker.js`, `quests.css`): the giver's face, the title and "step
  2 of 3"; the step in a grid (tick box | text | count) so text never runs under the box; a progress
  bar; and a where line: an arrow that turns as you turn (8 crisp pixel arrows), the distance, ▲▼ and
  metres when it's above or below you in the mine ("▼ 23 m deeper" for a layer), and the place ("Nibble
  & Root, west wall (Deep Town)", "The mine: take the town lift down"). It measures the backpack, its
  weight tag and pocket count every half second and hangs just under them (the old overlap is gone).
- **Markers** (`src/ui/QuestMarks.js`, ticked by the strip): parchment speech bubbles over people's
  heads, a gold "!" (work), gold "?" (ready), grey "?" (under way); they bob and sway, grow a little
  with distance, and a faint ghost shows through walls. Anchors: `scene.questAnchors()` (the town),
  Old Star at home (`scene.star.head()`), the burrow keepers in the mine (`scene.traders`). The
  **waypoint**: a brass diamond with the distance on the tracked goal, clamped to the screen edge with
  an arrow when it's off screen (hidden when a marked person is close). The **radar** gets a blinking
  hollow diamond (`GLYPH.quest`, rim arrow when far; one hook in `Radar.update`). The map's quest
  marks use the same goals (`Survey.questTargets`).
- **"Take a good look"** steps (`look`): stand near the thing and keep it in the middle of the screen;
  an eye fills up (1.3 s) and `act look {at}` fires ("You take a good look: An underground lake").
  Town things also count by their own E (bask, peer into the well/tunnel, a coin in the fountain, the
  notice board); the trails' signposts and cave-in tools count when read.
- **Toasts**: a new quest (who asked, its first step), progress on quests not on the strip, the next
  step, people's lines (`say`; Old Star's through the tutor when he's home), done + rewards (gold,
  items, recipes, ♥ friendship, lore).
- **Talking** (`src/ui/questTalk.js`, `questTalk(game, npc, { say, shop, tales })`): emits `talk`,
  then shows on the talk board (`openTalkMenu`, with `who` for the live 3D portrait): what just
  happened (a hand-in, thanks, the reward, "Next: …"), a choice, an offer (their words, the reward,
  "I'll do it" with the first step / "Not right now"), or a tale they haven't told you; while their
  request is under way they remind you in a bubble ("Still need 2 more Glowcaps"). Keepers: E on the
  window shows their news first (with "Let's trade"), an offer once a visit, else the shop opens as
  before. Crosshair labels say it too ("Talk to Hazel · has work for you", "· hand it over").
- **The notice board** on the plaza (E): open requests pinned up as WANTED notes (who asked, where),
  the ones you've taken, and a few town notices.
- **The book** (`src/ui/Journal.js`): Quests: "On your strip", then The Way Up (main + Old Star's) /
  Deep Town & Neighbours / Lore, "Ask around" (folk with a "!", with how to start it), Done. The right
  page: the giver's 3D face, their words, a **Now** box (step n of m, the step, count and bar, the
  hint, where), steps done, quest items you carry, the reward, pin / show on map. **Lore** replaces
  Notes (`openBook('notes')` still works and opens Old Star's notes).
- Faces (`src/ui/npcFace.js`): `npcFace(game, npc, { size, expression })` renders the character's
  real 3D rig with `renderPortrait` (folk from seed + look, keepers with their town looks), cached;
  Old Star and Rocco use `portrait3d.stillURL` when it's there, else the ink sketch. `npcWho(npc)` is
  the `who` for live portraits.

**Lore** (`src/data/lore.js`, `src/core/lore.js` = `game.lore`, made by the quests engine; save
`state.data.lore = { found, read, spots }`): 68 entries on 7 shelves plus Old Star's 19 notes:
the Old Ones (10 carvings, 11 relic labels), the old miners (Hobb's journal, 10 pages, and the Lantern &
Pick Company), Old Star (Astor the smith's boy, the Night of Shaft Seven, his red stamp, what became
of the million, Rocco's purse, his ledger: forty years of sums, then "Shaft Seven."), Deep Town (the sunbeam, the festival, the council, the lift, the honest
scale, the wishing crystal, letters up, the Fennimore Line, the ghost of Shaft Seven), star-noses
(twenty-two fingers, reading by nose, the Starfolk's children, until the stone grows warm),
creatures (11) and up top (the chest in the clearing, houses on chicken legs, what the sun is). The
canon: the ruins' builders were star-nosed moles, the Starfolk, who came down from a Long Cold, read
by touch, shut the Sky Door behind them and left gold on the surface "so that those who find them
find us" (the chest you fell for); Grubb, Nubs, Twitch and Old Star are their grandchildren. The
Lantern & Pick Company mined here until the Long Rumble; Augustus Fennimore hung the Express in the
Starfolk's Sky Stair. Old Star (Astor) saved his million in forty years and lost it when Shaft Seven
fell under his cart; he dug Hollis out; Rocco's grandfather found the cart.
- Found by: **carvings** (E on a carved frieze or rune wall in a ruin: "Read the carvings", two walls
  a ruin; one hook in `Ruins.pick`), **Hobb's journal** (E on the pick or shovel left at every trail
  cave-in: "Search the dropped pick"; `trailDress.js`), **tales** (Deep Town folk tell one when they
  have no quest business), **relics** (their label when the chest gives one), **quests**, and
  **shelves** (`game.lore.readShelf('oldstar' | 'talpa')`: Old Star's ledger and the Company smith's
  companion; Talpa's own book, the newcomers' guide, the stone guardians. Talpa lends his from his
  counter: "May I read your books?"; Old Star's shelf needs a hook at home, see the report). Every read emits `act lore`; a new find
  toasts. The reader (`src/ui/loreReader.js`, `lore.css`): a charcoal rubbing with raised runes, a torn
  journal page, a book page, a tale on parchment; "Written in your book" on new ones.
- Old Star's notes (`src/data/notes.js`) are updated for his house (no tavern, no cave workshop) and got four
  more (the carvings, his stamp, Shaft Seven, hens).

**Test hooks**: `game.quests.debug.{ list, step, complete, start, act, reset, data, give(id) }` (give:
hands you what the current delivery asks for); `game.quests.offers(npc) / accept(id) / choose(id,
opt) / markerFor(npc)`; `game.lore.{ add(id), readCarving({ id, kind }), readJournal(key), tale(npc),
readShelf(id), show(entry) }`; `ui.questMarks.{ bearing(), radarMark(), target, marks }`; town:
`scene.townQuests.debug.{ talk(npc), notices(), who(), pos(npc) }`, `scene.debug.openShop(id)` goes
straight to the shop. Screenshots: `shots/quests/` (t1–t8 town: markers, an offer, the strip and the
waypoint, a hand-in, a choice, a tale, the gaze eye; d1–d2 the mine's strip and waypoint; b1–b7 the
book (quests, an "ask around" page, lore), the carving and journal readers, the notice board; p1–p3
phone portrait).

**Hooks wanted from other parts** (not applied): home: E on Old Star's bookshelf →
`game.lore.readShelf('oldstar')` (his ledger: the million he almost had); dialogue: the talk board
gets `who` (from `npcWho`) and markup in `line` (`<b>`, `<small>`, `.qtk-reward`): keep those working.
Small hooks applied in shared files: `TownScene.js` (makes `townQuests`, `useKeeper(k, direct)`,
`k.item`, `look` acts from bask / well / tunnel / fountain, the notice board; `debug.openShop` goes
straight to the shop), `folk.js` (names, `npcId`, `talk` → `townQuests.talk`), `Ruins.js` and
`ruins/trailDress.js` (lore), `Radar.js` + `deepArt.js` (the quest mark), `PixelArt.js` +
`data/items.js` (quest items).

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

(Wave 3: the 2D foraging overlay described below is replaced by in-world 3D close-ups; the rules,
specs and results are the same. See "As built: 3D gathering".)

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
  Hazards: emberbloom burns, frostbloom numbs, gloomshroom spores on yanks (gear protects). With
  the backpack full (`state.canAdd`) the plant is left growing and a warning is said. Mouse
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
  Emits `act { type: 'cook', dish, score, isNew }`. Dishes that don't fit the backpack go to the
  stash at home (`spill`). The kitchen got a hearth oven and Old Star's cave-rock back wall.
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
  `run(secs)`, `finishStep(score)`, `toLive()`, `next(score)`, `toResult()`, `state()`, `result()`
  (`?bag=24` for room). `window.__forage`: `open(id, opts)`,
  `sim(id, 'good'|'rush'|'yank'|'soft'|fn)` (headless, also in node), `active.drive(script, secs)`,
  `active.step(input, secs)`, `specs`. Props: `props.debugPlants(x, y, z, r)`. URL `?tutorial=1`.
- **For other parts**: shops could stock `drake_meat` (120g, Rocco / trading post) and the grocer
  `stone_thyme`, `cave_garlic`, `tunnel_tuber`; monsters could drop `drake_meat` (rock drakes) and
  `grub`. Quests can ask for dishes by id and quality (`cook {dish, score}`).

## Monsters, ecosystem and combat (monsters part): as built

Files: `src/deep/Enemies.js` (the manager: frame, places, spawning helpers, pick vs creature, kills,
carcass hand-off, loot, shots, hazards, radar, lights) and `src/deep/enemies/`:
`combat.js` (blocking, parries, the mole's blows) · `beast.js` (the shared brain + `Group`) ·
`rig.js` (procedural legs with 2-bone IK, tail/neck chains, head look) · `eco.js` (carcasses,
nests and eggs, food, prey, noise) · `spawn.js` (who lives where) · `material.js` (creature shader:
coloured flash, telegraph rim, dithered translucency) · `sfx.js` (all creature/combat sounds) ·
`loot.js` · `lootArt.js` (loot item icons, hooked into `gfx/PixelArt.js`) · `debug.js` ·
`species.js` (registry) · species: `kobold.js`, `troll.js`, `spider.js` (+ `Webs`), `slime.js`,
`wraith.js`, `drake.js`, `dinos.js` (raptor, tyrant, shellback, pterosaur), the older folk
(`rock.js`, `golem.js` (crystal golem, finished), `wisp.js`, `imp.js`, `wyrm.js`, `puffer.js`,
`bats.js`, `critters.js`), `icons.js` (Index Book portraits for all of them).
Data: `src/data/creatures.js` (index entries), `src/data/items.js` (loot: `kobold_trinket
beast_hide troll_tusk spider_fang slime_gel wraith_ash drake_scale raptor_claw tyrant_tooth
armor_plate ptero_feather dino_meat drake_egg`, each with `tags` such as `forge`, `cook`, `egg`,
`meat` for the forge and cooking parts). Nests of raptors and shellbacks give the cooking part's
`dino_egg`; drakes are harvested for its `drake_meat`; kobolds sometimes carry `grub`.
`src/fps/ViewModel.js`: `vm.block(on)` (guard pose: a hafted tool held crossways in both paws,
otherwise crossed forearms; up in ~0.08 s) and `vm.guardHit(k, parried)`.
`src/ui/TouchControls.js`: a hold-to-block button (holds `F`, shield glyph) in the first-person pad;
it glows while a hostile is within 9 m (`enemies.threat()`).

- **Combat.** Every creature blow goes through `combat.incoming()`. Guard up and the blow from in
  front (±70°): blocked (¼ damage, ½ shove, energy cost; heavy blows ~60% through) or, inside the
  first 0.2 s × `skill('block')`, **parried**: no damage, the attacker recoils (0.45 s, a short
  opening); with the **`riposte`** perk it staggers 1.3 s and the next hit is a **crit** (×2.5).
  The `guard` food buff halves blocked damage and widens the parry window ×1.4.
  Telegraphs: wind-ups glow on the rim (yellow = block/parry it, red = too heavy, dodge) and a
  glint + ping marks the instant before the blow. Unblockable: shockwaves (jump them), spores,
  webs on the floor, a wraith's grasp, the tyrant's bite; fire and thrown rocks can be blocked but
  not parried. The mole's blows: combos (3rd hit within ~1 s = SMASH finisher), crits, poise
  (enough blows stagger and interrupt), hit-stop (the creature freezes, `damage()` returns
  `hitStop/shake/kick` for the scene), `skill('damage')`. Attack tokens: only 1–3 creatures swing
  at once (by zone); the rest circle on pack slots.
- **Creatures** (by zone/biome, a difficulty curve through each zone): kobold miner bands with
  lanterns (zones 1–3), cave slimes (all; big ones split), giant cave spiders with webs (1–4),
  cave trolls asleep in dens (2–6, hate light), ruin wraiths in `plan.ruins` and deep (3, 5, 6),
  cave drakes on hoard roosts with eggs (4–6, fire breath), crystal golems (2–6), and in the
  **dino caverns** (`biomeAt == 4`): raptor packs, shellback herds with young and nests, pterosaur
  flocks under tall roofs, a cave tyrant in big halls. Caps: 13 hostiles, one raptor pack, one
  tyrant/drake/golem, two trolls. Lairs at `plan.dangers` nests; nothing spawns in the burrow,
  town, stations, lifts or `plan.burrows`.
- **Ecosystem** (only near the mole): hunger; grazers crop moss/mycelium/glowcaps/vines and Props
  plants; hunters take smaller prey (packs take bigger), the victim's herd turns on the attacker;
  flesh creatures leave a **carcass** (the body keels over, scavengers and hunters eat it, it sinks
  to bones) that the mole can harvest once (E); nests with eggs (E takes one, the parents come);
  sleep and waking (noise, lamp, being close; crouching sneaks closer); wandering and long walks
  between caves; fleeing (predators, blasts, a broken band); territory; light-shy species flinch
  from the lamp; `noise()` from running, fights, roars, blasts.
- **Acts**: `kill { kind }` (the mole's kills, incl. its dynamite), `nest { id, kind, zone }` when the
  last guardian of a lair/nest falls (`lair<n>` for `plan.dangers` lairs, `nest:<kind>:x,z`,
  `roost:x,z`). Blocks: DigScene emits `block { perfect }` from the events.
- **Test hooks** (`scene.enemies.debug`): `spawn(kind, x, y, z, { awake, asleep, group: n, baby })`,
  `list()`, `get(i | kind)`, `clear()`, `auto(on)`, `peace(on)`, `block(on)` / `unblock()`,
  `hit(e, power)`, `step(n)`, `stage(kind, { n, dist, depth, test(biome, depth), awake })` (finds a
  roomy, level cave from the generator's shapes, teleports, spawns in front), `portrait(e, {dist,
  turn})`, `sheet(e, {angles, size})` (renders the real rig with plain lighting into an overlay),
  `look(e)`, `clean()`, `eco()`, `perf()`, `info()`; `enemies.combat.log` (the last blows).
- **Performance.** Only the mole's surroundings live (creatures past ~30 m are swept; far ones
  think at a lower rate); bodies walk with swept-slab collision; `enemies.update` stays ~0.3–1.5 ms
  with a dozen creatures. Models mesh with a fast greedy mesher in `vox.js` (same look as
  `meshGridGreedy`, ~3.5× faster) and the zone's likely species are built ahead of time, one per
  calm frame (`enemies.prewarm()`, never mid-fight), so a first troll or tyrant doesn't hitch.

## Decorated UI pass (ui-pass part): as built

Every screen that was still a flat panel is now a thing in the world, drawn in code at a whole
multiple of `--px` (art helpers: `ui/uiArt.js` Px + `art()`; the frames `--a-wood`, `--a-sign`,
`--a-note`, `--a-slate`, `--a-parch`, `--a-chain`, `--a-tackRed`). Game logic and the scenes' debug
hooks are unchanged; the forge (its own pass) and the backpack (lead) were left alone.

- **Cooking** (`src/cooking/ui.js` rewritten with the same API, `style.js` restyled, new
  `src/cooking/kitchenArt.js` with the sprites, published as `--a-ck-*`):
  the **pantry** is a wooden cupboard under a hanging "Pantry" sign; plants stand in wicker
  baskets, critters in slatted crates, basics in corked glass jars (the icon shows through the
  glass), on shelf planks with brass shelf plates and paper count tags (best quality pip on the
  container; picked goods glow, hop and get a green check). The **recipe box** tab shows card
  dividers (one per known recipe) over a lined index card: dish, buff chip, steps as wooden tokens,
  ingredient chips (missing ones greyed with a red seal), a grade rosette, "Into the pot"; flip with
  the ◀ ▶ arrows, ← →, swipe or the dividers (page-turn animation, `page` sound). The 1–4 slots are a
  **copper pot on the stove**: chosen ingredients drop into the broth with a splash and bob (tap to
  fish one out), empty spots are rings on the surface, steam rises; "Cook!" is a **brass service
  bell** (rings, wobbles, `bell` sound). The match line is a pinned paper slip; "Back home" is a
  hanging door plaque. **Step HUD**: an order ticket pinned at the top (dish name; steps as wooden
  tokens, the current one gold; each finished step gets a star / check / dot / cross stamp), a
  wind-up **kitchen timer** (24-frame dial, rattles red when low), the hint on a **chalk slate**,
  a "Stop" plaque (calls the scene's `askStop`, so touch players can stop too: one-line hookup in
  `CookingScene.stepHud(...)`; during Old Star's lesson on touch screens the ticket moves to the bottom,
  clear of his card). **Gauges** are glass tubes with brass caps on a notched plank (zone
  notch, brass pointer); doneness is a brass bar with Raw→Burnt and a wooden-spoon pointer;
  kneading tokens slide along a floured board; the roll strips sit on a plank. **Result**: a
  pinned recipe card with the dish in a wooden frame (rays behind), a grade **rosette** (gold /
  green / blue / brown / charcoal) that stamps on, a stamp per step, paper tags for energy / buff /
  quality, and wooden plank buttons. Layouts: right column on desktop, a bottom sheet in portrait
  (`max-aspect-ratio: 4/5`), and in short windows (`max-height: 520px`) the pot counter steps out
  beside the cupboard and the result card goes two-column.
- **Talk menus** (`src/ui/choices.js` + `choices.css`, `openTalkMenu(game, { name, face, line,
  sub, options, onClose })`): a wooden board under a hanging name sign, the speaker's portrait in a
  wooden frame with a speech bubble, the choices as pinned paper notes (primary note yellow, a
  pointing paw on hover/focus, number keys 1–n and ↑ ↓). Used by Old Star's lesson menu at home
  (`home/lessons.js lessonTalk`) and in the mine (`deep/Prologue.js openTalk`).
- **Planter** (`openSeedTray` in the same module, used by `home/living.js usePlanter`): a seed box
  of paper seed packets (crimped top, picture window, coloured band) with count tags; picking one
  "sows" it.
- **Settings** (`ui/PauseMenu.js openSettings`, shared with the title screen): the same wooden
  board and sign, brass name plates, wooden option tabs (gold when on), slider values on paper tags.
- Already decorated and kept: shops / assay / ticket window, the Miners' Board, the lift
  cross-section, the book (quests, map, skills, index), Old Star's notes, the tutor card, pause
  signs, confirm stamps, toasts, the backpack. The title's Credits stays a pinned parchment sheet.

## As built: coop parts at the forge, and the forge's decorated UI (forge part)

**Files**: `src/forge/parts.js` (`partStatus`, `PartRun`), `src/forge/partModel.js` (`PartView`, the
voxel shapes), `src/forge/partArt.js` (the `{ k: 'cooppart' }` icons, one line in
`gfx/PixelArt.js drawIconArt`), `src/forge/menus.js` (rewritten, same API + `partsList`, `startPart`,
`partRows`), `src/forge/ui.js` (same widget API, redrawn), `src/forge/forgeArt.js` (the forge UI's
pixel art, published on the forge layer as `--fa-*`), `src/forge/forge.css` (replaces the old CSS
string; still injected only while the forge runs), `src/scenes/ForgeScene.js` (key 3, a "Coop parts"
spot at the workbench, `endActivity('parts')`, `open: 'parts'`, debug hooks), `forging.js` (result
card → certificate).

**Flow.** Hub → **Coop parts** (key `3`, also `3` while walking, or E at the workbench) opens Nugget's
coop schematic: per track (numbered callouts on a blue-ink drawing of the coop) the parts as taped
cards with icon, level pips (installed / this one), ingots and extras with `need× name (have)`, the
metal's working range (red when the hearth can't reach it), quench note, desc, and a **Forge** stamp.
A part is forgeable when it is the next level (`level === installed + 1`; earlier ones show
"Installed", later ones "Install the X first"), you have the inputs and the hearth reaches the metal's
work range; carried parts show "You're carrying N". The first time the list opens Old Star explains
where parts go (flag `forge.partsTip`; not during his lesson).
**PartRun** (`step`: `heat` ⇄ `hammer` → `quench` (when `part.quench`) → `result`): the ingots (best
first) and extras are taken (Esc → "Leave this part?" refunds them; so does leaving mid-run). Heat
the bar in the coals with the bellows into its work band (brass thermometer; tin barely wants the fire:
pumping burns it), E carries it to the anvil. Each blow: hold mouse / Space / the touch button to raise
the hammer, the **rune ring** fills, let go in the green zone (gold = perfect; zone width by part
level × Smithing skill, it moves every blow). perfect/good = one blow of shaping, too soft 0.4, too hard
0.6 (and a dent); blows on metal below its work range don't move it, ring, flake and may **crack** it
(dark voxels stay on the part). The bar cools ~5%/s of its heat above the room, so 1–3 reheats per
part (E). `part.strikes` blows shape it; quench parts then cool/heat into the blue band (E in/out of
the fire) and **Q** plunges them in the barrel (`quenchResult`). Result: the part held up in the
tongs in a grade halo + the **guild certificate**. Score: craft = shape·0.55 + heat·0.25 + quench·0.2
(no quench: shape·0.65 + heat·0.35), shape = mean blow quality (perfect 1, good .86, soft .6, hard
.42), heat = 1 − 0.06/cold blow − 0.1/crack − burn; **q = craft × (0.85 + 0.15 × ingot quality)**.
Output: `state.addItem(id, { q, spill: true })`, `act { type: 'part', part, track, level, grade,
score }`, a toast, Enter → back to the schematic. About 30 s (tin) to 2 min (mithril, 14 blows).
**The model** (`PartView`): every part is 300–800 voxels (7.5 mm) with three poses: a stubby hot
**bar** (the ingots), the **flat blanks** (straps straightened and cut to anvil length, sheets
flattened: a disk for bells and pans, a net for the nest box) and the **finished part**. Blows morph
bar → blanks (drawing out from the tongs' end) then blanks → part (bending, raising, folding), with a
squash, a dent where the hammer lands and a gold ring on the next spot. Shapes per track: shelves
(L bracket with brace and lip; scrolled bracket; iron rack with side brackets; steel cargo rack with
raised rails), legs (two banded rings with clasps; three hooked talon caps on a heel band; bars
with bowed leaf springs and cuffs; U heel band with a star rowel), nest (tin box with a hen-sized dip,
straw set in at the end; domed pierced warming pan with a handle; bell with a hanging loop),
chute (funnel + sloped U trough), lamp (tin lantern with a candle; caged dome with lumite crystals set
in when shaped). Hot metal glows by temperature (blackbody, mottled per voxel), with heat haze.

**The forge's UI, redrawn as things in the smithy** (all keys kept; touch: the big hold button):
- **Hub**: a chalkboard hanging on chains (oak frame, chalk title and doodles, chalk tray), three
  pinned paper cards with coloured tacks (Smelt ore 1, Forge a weapon 2, Coop parts 3; wobble on
  hover), chalk links "Look around" / "Leave forge", the hearth level on a painted sign below it.
- **Smelting**: the smith's ledger (stitched leather covers, ruled pages, a ribbon): left page coal,
  hearth, the last pour as a margin note; right page one inked entry per recipe (ores + coal → ingot
  icons, have/need, a flame chip with the pour band), **Smelt** / **Quick ×N** as rubber stamps.
- **Weapon plan**: a blueprint taped up (blue grid, white margin rule): plans as chalk boxes, metals /
  infusions / gems as round tokens, the weapon traced big in white chalk in the middle with its
  numbers, a red **Forge it** stamp.
- **Activities**: a leather clipboard work order (title, rune medallions for the steps, brass gauges
  for the stats), the brass thermometer (glass tube on an enamel scale, gold work / blue quench bands
  painted on and lit when the needle is in them, burn and max lines, a glass bulb glowing with the
  metal's colour, a burner flame that grows with the heat), the rune-ring strike gauge (also used by
  weapon forging), wooden plates for the actions, results on a framed **guild certificate** with a
  wax seal for the grade (ribbons, stamp-in), brass gauges, stamp buttons.
- Phones: the panels fill the width below the HUD; ledger and schematic stack to one column.

**Test hooks** (`scene.debug`): `part(id, { give, score, q, blow, run })` (gives missing inputs
when `give`, starts the part and plays it to the result headless; `score` forces the final quality,
`blow: 'perfect' | 'good' | 'soft' | 'hard' | 0..1`, `run: false` only starts it) → `{ id, step,
score, grade, blows, cracks, carrying, toStash }`; `partsList()` (opens it, returns rows `{ id, name,
track, level, status: 'installed' | 'ready' | 'locked', why, need, have, carrying, works, hot }`);
`partStrike(kind)`; and the forge's own `heatTo(T)`, `toAnvil()`, `toFire()`, `quench(T)`, `until(step)`,
`state()` work on a part run too (`state().shape` = shaping progress). On the run: `debugStrike(_, v)`,
`debugCharge(_, v)`, `release()`, `sim` (`T`, `workRange`, `quenchRange`, `progress`, `blows`,
`cracks`), `zoneR`/`perfR`, `forceScore`. Also `menus.partRows()`, `partStatus(state, id)`,
`partStats(id)` (voxel counts) from `partModel.js`. URL: `?scene=forge&open=parts`.
Screenshots: `shots/parts/` (`ui-*` desktop menus, `phone-*` portrait, `run-*` copper bands,
`iron-*` talons with the quench, `models-*` every part in each pose, `art-sheet.png`).

## Wave 3: polish (the user's ask, and who owns what)

The user's words: "For the dialogue make the box look 100x better and use the 3D model instead of
2D, never use character 2D art. Also add a lot more side quests from the village and lore, and caves
look 100x better. Also have new shaders and make all caves have better vegetation, custom 2D plant /
grass textured. Add water physics and better visuals, and props like lanterns or plants a lot more high
resolution and realistic, like a lantern has a support. Also remake the QTE for plants / gathering in
3D, very polished. The environment needs to look 100x better. Game quests and missions need to be
clear. Make you drop in a home, a full home, not whatever this is. Make the level bar better too, more
grand, wooden, detailed. The wake-up scene: you just woke up, no splash, an eyelid effect."

| Part | Owns |
|---|---|
| **Dialogue & 3D portraits** | `src/ui/Tutor.js` + css, a new live 3D portrait renderer (`src/gfx/portrait3d.js`), every character portrait in the UI (tutor, `src/ui/choices.js`, `src/ui/ShopUI.js`, `src/deep/traders/shop.js`, the coop hen in `src/ui/Backpack.js` / `invArt.js`), the XP / level chip (`src/ui/SkillTree.js` chip, the skill toasts) |
| **Cave look: shaders & atmosphere** | `src/deep/TerrainMaterial.js`, `src/deep/Mesher.js` (normals/AO data only, same layout or coordinated), `src/core/Engine.js` post (grades, bloom, god rays, fog), `src/deep/Particles.js` (dust motes etc.), the lighting in `DigScene.lights()` (tell the lead) |
| **Vegetation & props** | new `src/deep/Vegetation.js` (loaded by DigScene: `new Vegetation(ctx)`, `update(dt, o)` → events, `lights(eye)`, `dispose()`), `src/deep/Props.js` visuals (keep the harvest hooks working), `Generator.js` `decorate()` and new materials in `materials.js` (ids coordinated in this doc) |
| **Water** | `src/deep/Fluids.js` and its shaders: flow, splashes, swimming feel, waterfalls, drips, puddles |
| **3D gathering** | the foraging / gathering minigames (`src/ui/Forage.js` and the cooking part's forage code) remade as in-world 3D close-ups; Props.js only at the harvest call site |
| **Quests & lore** | `src/data/quests.js`, `src/core/quests.js`, `src/ui/Tracker.js` + quest markers (world, radar, map), village side quests and NPC lines (`src/town/*` talk hooks), lore (`src/data/notes.js`, new lore data, ruin inscriptions via `src/deep/Ruins.js` hooks) |
| **Home & waking up** | `src/home/*`, `src/scenes/HomeScene.js`: Old Star's place becomes a full, furnished home you wake up in (eyelids opening, no splash); the lessons, forge, kitchen, lift, bed, trunk and Nugget keep working |
| **Lead** | `DigScene.js`, `World.js`, `Terrain.js`, `scripts/e2e.mjs`, integration |

Rules for every part: no git (the lead commits); `npx vite build` must pass; keep every `scene.debug`
hook and the e2e flow (`scripts/e2e.mjs`: read it, don't edit it; `E2E_UNTIL="label"` stops after a
step); work in phones' portrait and landscape too; performance matters (the mine must stay smooth:
measure); screenshot before/after into `shots/<part>/` and look at them; write an "As built" section
here when done. Headless testing: `node scripts/shot.mjs` (see its header), drive scenes with
`scene.update(1/30)` loops. Don't edit another part's files: if you need a hook there, say so in your
report.

### As built: cave look — shaders, light and air (wave 3)

The rock, its light and the air between were redone in the files this part owns; the API details
are in `docs/DEEP.md` › "Cave look". Shots: `shots/caves/<spot>-after.png` next to
`<spot>-orig.png` (the same moment with the old terrain shader, no atmosphere, the old grades) and
`<spot>-before.png` (the start of wave 3); spots: rootsoil, moss, sandstone, clayworks, fungus,
crystal, dino, magma, frost, core, lantern, lava, hall.

- **Rock** (`TerrainMaterial.js`): plates are rounded stones (a lit and a shaded side under the
  lamp) instead of per-texel speckle; convex voxel edges get a one-pixel chamfer (mesher flags,
  +4.5% quads), so every ledge and step reads; strata (alternating layers, tone and tint per layer,
  a hairline between) on limestone, sandstone, mudstone, clay, dirt; big warm/cool patches, iron
  and lime streaks running down walls, damp patches with a sheen (zone mood), moss on upward faces
  (mossy grotto, dino caverns, a little in the topsoil), rime (frost vault), cracks that glow and
  breathe in volcanic rock (magma deep); round pebbles in soil; the moss / mycelium side faces drape
  in patches (the old per-voxel stripes are gone); crystal and ice: flat facets, an inner layer that
  parallaxes, glow in the stone's own colour, glints and sparkles; a soft highlight shoulder so pale
  stone under the lamp keeps its colour.
- **Light** (`LIGHT`): soft-windowed inverse-square lamp (a wide flood with a hot centre) and point
  lights, wrap diffuse, AO that darkens the ambient fully and direct light a little, a cool
  hemisphere ambient against the warm lamp, zone sky / bounce light (lava glow from below in the
  magma deep), Blinn-Phong glints quantized into pixel steps, a warm rim where the lamp grazes.
- **Air** (`AIR`, `src/deep/Atmosphere.js`): fog that reaches the dark at the edge of the streamed
  world (no silhouettes against a flat "sky"), a darker void overhead, the lamp's flood in the dust,
  ground mist pooling in pits, one dithered halo per light in the dusty air, motes round the eye
  that catch the lamp (dust, sand, glitter, spores, glowing spores, pollen, embers, snow, void
  sparks by zone and biome), light shafts toward a bright lantern ahead in tall halls (Engine post
  hook), a little extra bloom where things glow. Split-toned zone grades (`rootsoil`, `clay`,
  `grotto`), `SCENE_POST.deep` saturation 1.16 / contrast 1.06.
- **Particles**: lamp-lit motes (1–3 px specks, bright in the beam, gone outside it), round pixel
  discs for points of 3 px and more, big soft puffs that thin out in dithered steps, swirl, twinkle.
  The "big translucent squares" in `shots/e2e/02c-old-star.png` are not particles: they are the
  water beads on the lens of the old wake-up splash (`WakeFx` in `src/home/wake.js`, home part),
  which the eyelid wake-up replaces.
- **Other parts**: vegetation already uses `LIGHT` + `AIR`; props, creatures and traders use
  `LIGHT` but still their own fog line: switching it to `col = caveAir(col, vWorld, dist)` (with
  `${AIR}` after `${LIGHT}`) makes far objects melt into the same dark as the rock. Every light in
  `DigScene.lights()` gets a halo, so lights with a big `r` but no visible source should keep `r`
  modest.
- **Lead hooks** (optional, not applied): the deep `FOG` table could be a little darker now that
  the far fog is the scene's "sky"; DigScene's own beam motes (`ambient()`, `fx.mote`) can stay
  (they are lit now) or go (Atmosphere spawns motes).
- **Perf** (headless SwiftShader, 1280×720, the same view, new vs the original terrain shader
  alternated 3× each, measured as the GPU process's CPU time per frame because wall time was
  swamped by the other parts' tests): rootsoil +18%, magma deep +16%, crystal grotto +20–23%.
  What it costs and was cut: the lights' in-scatter per pixel (−33%, replaced by halo sprites),
  glints only on shiny stuff, crystal inner layer only within 9 m, texel relief only within 12 m.
  On a GPU the 3D noise fetches and the sky pass are cheap; no new render targets or contexts.

### As built: 3D gathering (wave 3)

E on a plant in the mine no longer opens a 2D sheet: the camera eases (0.6 s) into a close-up of
the plant **where it grows**, the mole's paws reach in (`vm.drive`) and the minigame plays on the
spot, then the plant pops, is held up in the paw with its quality tag, and the view eases back.

**Files** (all new, `src/deep/gather/`): `index.js` (the session: `openGather`, camera, paws, phases,
test hooks), `sims.js` (the rules, headless; moved from the old overlay and extended), `models.js`
(close-up voxel plants at ~1.4 cm, in parts), `stage.js` (shared: soil clods, the hole, particles,
floating words), `stagePull.js` · `stagePick.js` · `stagePeel.js` · `stageDig.js` · `stageLift.js`,
`gfx.js` (the close-up material: the mine's `LIGHT` + a soft key, rim and exposure; voxel → geometry),
`hud.js` (the decorated HUD), `input.js`, `sfx.js`. Specs stay in `src/cooking/forage.js` (new
fields: `roots`, `delicate`; `drake_egg`). `src/ui/Forage.js` is now a small compatibility shim
(`openForage` → the 3D gather, `simulate` re-exported); `src/cooking/forageArt.js` is gone.
The soil clods take the colours of the earth under the plant (under a moss or fern cover, the loam).
Touched elsewhere: `Props.js` harvest section only (`use()` → `gather(p)`, `hidePlant(p, on)`,
`debugGather`, `target()` warms the model, `harvest()` skips its own burst when `res.fx`), and
`fps/ViewModel.js` (`vm.drive.shoulder = { R, L }`: where a steered forearm comes from; a steered
forearm stretches up to 1.7× so its end never shows when the paw reaches far).

**How it hooks into the mine** (no DigScene change needed): a see-through `ui.openPanel` makes the
scene `busy` (no walking/looking/digging; Esc reaches the session first: in play it lets go of the
plant, after the pop it carries on); the session runs once per scene frame right after DigScene
placed its camera by wrapping `vm.update` for the close-up (it sets `owner.gather` while active).
It overrides camera position/rotation/fov (and the particles' pixel scale, the vignette), sets
`vm.drive`, hides the HUD chrome (`#ui.gathering`), hides the plant's prop (`props.hidePlant`) and
moves its light with the plant's head, and presses the vegetation aside and down (tips into the
soil, so big fronds don't lie across the close-up) round the plant, in front of the camera and,
after the pop, round where it's held up (`vegetation.U.uPush[1..2]` with `uPushK` 2–2.4, written
after `vegetation.update`). A "clear this sphere" uniform in the vegetation shader would do this
more cleanly (optional, for the vegetation owner).

**Techniques, in 3D** (5–15 s each; all from the cooking part's tuned sims, so scores are fair):
- **pull** (mushrooms, roots, herbs, flowers, bulbs; ceiling plants upside down): the fist closes
  round the stem (the other paw steadies the soil). Drag up = tension (W/S on keys): the stem
  **stretches thin and bends with the paw**, the soil **heaves** round it; sideways swings (A/D)
  **wiggle** (mushrooms and garlic **twist**): soil cracks open along the roots (dark cracks grow
  out from the stem, clods shift), dirt flicks. As it rises, **roots tear out one by one** (a zip of
  dirt along each, clods hop, a fibrous rip sound; if the soil isn't loose yet they rip shorter) and
  lie on the soil. Over the band the stem **flushes red**, shivers, creaks; past `snap` it **snaps**
  (the top jerks up in the paw, swinging, a stub stays in the soil; both torn ends ragged with white fibres). Delicate plants (caps, glass lily, lotus) also strain
  on **jerky** pulls: a slow steady hand. At the end it **pops** out (flash, POP!, sparkles, clods
  burst, the hole, roots dangling) and is held up turning slowly beside its result tag: the
  camera turns to it and leans back a little where there's room (fov widened only if it must, so
  head to root tips fit), it's held clear of the ground, and the grass round it leans aside. Small
  finds (berries, truffle, grub) rest on the open palm, the wrist below them, not in front.
- **pick** (cave berries): a **timing** game: a gold ring closes on one berry at a time; tap as it
  touches a **red** one (perfect / good; early or late squishes it); **green** ones get a green ring:
  leave them. The paw reaches and pinches; streaks raise the pitch; the handful is held up after.
- **peel** (glow moss, sparkmoss): the mat (tufts of moss on the rock) peels back over itself in a
  curl as you drag left, the other paw braced on the wall; too fast rips a strip off (it falls);
  sparkmoss crackles blue before it zaps.
- **dig** (truffle, grub): scrub the heap (the open paw rakes in from the side so the heap stays in
  view; clods fly off, the top first) until the find shows, then
  ease it out like a pull (the grub wriggles, its band sways).
- **lift** (dino egg, drake egg): both paws cup the egg; lift slowly, lean against the wobble;
  tipped too far it clunks back with a crack in its shell.

**HUD** (house style, drawn in code at `--px`): a hanging name sign with the item icon and the verb
(it turns into the verdict: GOT IT! / PERFECT! / SNAPPED), a gauge on an oak plate (pull: a brass
tension tube with the green band, the strain zone, the snap line, a needle, the progress slot and
the root-loosening pips with the target flag; peel: a speed tube; pick: a wicker basket with a
streak; lift: a height tube and a spirit level; dig: the soil left, then the tube), words popping
where things happen (Loose!, Rip!, POP!, Perfect ×3, Too soon!, Crack!), a paper hint (dims once you
have it), a Leave plaque, and the result tag (icon, %, stars, word, ×2, PRISTINE seal / TORN stamp).
Phones: gauge bottom-right, tag at the top, wider framing. Touch: hold and drag anywhere.

**After**: a harvest leaves the turned soil and the hole for 40 s; letting go puts the real prop
back a moment before the close-up model goes. While a plant is aimed at, `Props.target()` calls
`warmGather(p, props)`: its model is built and the close-up shaders compiled in idle time, so E
opens at once. Per frame the session costs ~0.3 ms (stem deformation, roots, clods, paws, HUD).

**Results** are unchanged: `{ id, q, p, n, burns, zaps, spores, ... }` → `props.harvest` → loot
events → DigScene `collect` → `act forage {id, q, pristine}`. Quality maths as before (sims.js).

**Test hooks**: `window.__gather` = `{ open(id, { standIn }), run(id, { score, script, real }),
sim(id, script), active, still, prof, specs, last }`; on a session: `drive(script, secs, { pause, until,
stopAtShow })`, `step(dt, input)`, `state()`, `go(phase)`, `holdShow`, `paused`. `__gather.run('glowcap',
{ score: 80 })` plays a stand-in to the end headless; `{ real: true }` uses the nearest real plant
(harvests it). `window.__forage.sim` still works. `props.debugGather(p)`. Screenshots: `shots/gather/`.

**Hooks wanted from the lead** (optional, it works without): in `DigScene.update`, after
`this.camera.updateMatrixWorld()`: `this.gather?.frame?.(dt)` (then the vm wrapper stands down) and
`busy ||= !!this.gather`; `this.debug.gather = (id, o) => window.__gather.run(id, o)`.
For nests in `Enemies.catch` (monsters part): open the lift close-up instead of taking the egg at
once: `openGather({ ctx: { owner } }, { item: egg.nest.item, x, y, z, mount: 'floor' }).then(r => …)`
(hide `egg.mesh` meanwhile; `takeEgg` + loot `{ q: r.q, p: r.p }` when not `r.cancel`).

### As built: dialogue & 3D portraits (wave 3)

No 2D character art is left in the interface: every face is the real 3D rig, live.

**Live portraits** (`src/gfx/portrait3d.js`). The game's own rigs (Old Star's `makeStarMole`, the
hero `makeHeroMole`, Rocco `makeRocco`, the keepers from `SHOPS[id].keeper` (town keepers with
TownScene's `KEEPER_LOOKS`), Deep Town's villagers from `src/data/villagers.js` by id or name, any
spec, Nugget `makeChicken`) are rendered head-and-shoulders on `game.engine.renderer` (no extra GL
context) into a small render target at 2× the UI's art grid (shaders precompiled with `compileAsync`
for a target like it), read back through a pixel buffer and a fence (no GPU stall; the very first
picture of a face at a size is read back at once, a one-off wait of about a frame, and a remount
shows the last picture of that face at once, so a portrait is never just a backdrop), folded down to
the art grid with a mode filter (crisp, no voxel-dirt noise) and composed on a 2D canvas: a painted
pixel backdrop per place (`forge` for Old Star: bricks and a forge glow with rising embers; `cave`,
`town`, `shop`, `assay`, `ticket`, `trader`, `herb`, `storage` (Rocco's crates and lantern), `outpost`
(bricks, banner, brazier), `coop` (Nugget's log wall and round window)), a lift of the darks, a warm
2D rim of light on the far edge, a dark outline. Key, cool fill and coloured rim lights per backdrop.
The rig breathes and blinks by itself; per line it gets the expression (`setExpression`, tutor moods
map straight on), a head tilt and pitch, a bob; the mouth flaps while words type (`rig.talk`); the eyes
look a little toward the words (3/4 faces), glance at you when a line starts. The hen bobs her head to
"talk", flaps when glad, droops when hungry. Rigs are cached per character (≤ 10 studios, LRU),
only visible portraits render (`checkVisibility`), 24 fps while talking, 12 while idle, at most two
a frame, driven by animation frames and by a timer when frames are throttled or starved (headless); a portrait whose element left the page disposes itself after 4 s. The dialogue box hands its
rig back when it hides, and stills borrow a live rig, so one Old Star serves the box, the talk board,
the tracker's face and the toasts.
```js
import { portrait3d } from '../gfx/portrait3d.js';
const h = portrait3d.mount(el, who, { mood, size | w, h, backdrop, fps, side }); // el: a canvas or a box
h.set(mood, { hold, tilt }); h.talk(true | false | secs); h.nudge(k); h.dispose(); // h.ready, h.canvas, h.studio
portrait3d.cast(who)          // { key, name, voice: { f, type, q, vib, cluck, mumble }, backdrop, mood } | null
portrait3d.warm(who)          // build a rig ahead of time (the Tutor warms Old Star at idle)
portrait3d.still(who, { mood, size }) → Promise<canvas>; portrait3d.stillURL(who, mood, size) // cached
portrait3d.stats(), .flush() (render every visible one now, sync: tests), .handles()
```
`who`: `'oldstar' | 'hero' | 'nugget' | 'rocco'`, a shop id (`tools grocer furniture blueprints
outfitter assay ticket lift trader herbalist outpost`), a villager id or a keeper's/villager's/Deep
Town folk's name, `{ spec, name, backdrop, voice }` or a spec. Cost (measured headless, under heavy
load): ~0.3 ms CPU per render plus ~0.4 ms to fold and compose a 48 px portrait, one ~15–25k-triangle
draw into a 96×96 target; the frame rate with a portrait up was the same as without.

**The dialogue box** (`src/ui/Tutor.js`, `tutor.css`, art in `src/ui/dialogArt.js` as `--dl-*`): a
carved oak board with a carved groove and brass corner brackets, the live portrait in an ornate brass
frame hanging over its left edge (a glass glint sweeps it), a red ribbon name plate (blue for you,
green for Nugget and the town folk), the words on a sunk parchment. Typewriter with a breath at the
end of sentences and clauses, the mouth shut in the pauses, voice blips per speaker (Old Star's
mumble, Rocco's drawl, Nugget's clucks, the keepers' pitches) and per mood; `<b>`, `<i>`,
`.gold-txt` kept. Typing (here and on the talk boards) follows the wall clock and is driven by frames
and a timer, so slow or throttled frames type more letters at once instead of stalling, and a line's
reading time runs out on time. A quill scratches while it writes; a waiting line shows the key cap / "tap" and a
bouncing brass arrow; a line that goes by itself shows its reading time as a brass wick burning down.
Lines that wait for you get the grand box (48 px portrait, 200 art px wide); passing tips (no `wait`)
get a compact board that fits its words (34 px portrait), so the mine's step tips stay out of the way.
Opening: the board springs up, the frame pops, the ribbon swings down, the parchment unrolls; a
following line turns the page; closing drops it away. A pixel emote bubble (♪ ! ? sweat, anger mark,
star, sparkles) pops by the frame when the face changes. Same API: `say(html, { mood, key, wait, dur,
name, place, sound, muffled })`, `hide(key?)`, `next()`, `active` (+ `who`), plus **`who`** (the
speaker's portrait; default from `name`, else Old Star; an unknown name gets a townsfolk of its own)
and `tutor.portrait` (the handle). Moods also take any rig expression (`surprised sad angry smug
thinking sleepy`). Keys E / Space / Enter, click, tap; bottom-centre on desktop, top on touch and
`place: 'top'`; phones get a 40 px portrait. `starPortrait(mood)` / `starPortraitURL(mood)` still
exist but return stills of the 3D Old Star. `src/ui/talkType.js`: `typeText(el, html, { voice, mood,
audio, face })`, `voiceBlip(audio, voice, mood)` (shared by the boards).

**The talk board** (`openTalkMenu` in `src/ui/choices.js` + `.tk-talk` in `choices.css`): the same
carved board, ribbon, brass-framed live portrait and parchment; the line types out in the speaker's
voice (a click finishes it); the choices stay pinned paper notes (number keys, ↑ ↓, Enter, tap).
New options `who`, `mood`; `face` is ignored (no 2D pictures). The handle has `.portrait` and `.typer`.

**Everywhere else**: town shops and the assay/ticket windows (`ShopUI.js`: a 32 px portrait in the
brass frame; talks and pulls a face from the line via `town/moods.js moodOf`), the burrow counters
and Rocco (`deep/traders/shop.js`: 40 px, `speak(text, expr)` sets the face for 2.2 s and talks; the
old offscreen studio/readPixels stills are gone), Nugget in her round window on the coop side of the
backpack (`Backpack.js`: a live hen, 30 px, her mood from `henMood`; the 2D `INV_ART.hen` sprite is
removed from `invArt.js`). The quest tracker's giver faces (`ui/npcFace.js`, quests part) already use
`portrait3d.stillURL` for Old Star and Rocco.

**The level plaque** (`SkillTree.js installSkillFeedback`, `skilltree.css`): the XP ribbon is now a
carved oak plaque with brass studs: the line's seal in a milled brass ring, the line's name and a
brass "Lv" badge, a brass-rimmed glass tube the XP fills like liquid in the line's own colours (rows
of highlight and shade, a flowing ripple, a shine rolling over it, a bright meniscus, the new part
glowing where it came in), and +N on a hanging paper tag. Levelling up: a "Level up!" ribbon swings
down over it, the seal stamps, sparks burst from the medal, the tube floods and flashes, then starts
over at the new level; a sparkle follows the jingle. The level-up card pinned to the toasts is a
plaque too: a ribbon ("Level up!", green "Level 5!" on every fifth), the big seal stamping into a
brass medallion with a burst of sparks, the text on parchment. Same events (`state.on('skill')`).

**Test hooks**: `ui.tutor.portrait` / `h.portrait` (talk board, shops, burrows) → the handle
(`.studio.rig`, `.canvas`), `portrait3d.stats()` / `.flush()` / `.handles()`, `ui.tutor.active.who`,
`ui.levelPlaque.show(line, n, levelUp)` / `.keep(true)` (hold the plaque up for a screenshot).
Also: the old `src/ui/Tutor.js` header in "Old Star's tutor" above still holds (same calls).
Screenshots: `shots/dialogue/` (`before-*` the old look, `after-*` desktop 1280×720 in Old Star's
place: `tutor talkboard xp levelup shop trader rocco coop nugget-line tip`, `after-mabel-board` a
villager's spec-based portrait, `after-portraits` the cast, `compare-tutor` old vs new; `phone-*`
390×844 and `land-*` 844×390 touch). For headless screenshots call `portrait3d.flush()` (and
`h.typer.finish()` / `ui.tutor.next()` to show all the words) so nothing waits on a starved frame.

### As built: vegetation & props (wave 3)

**Vegetation** (`src/deep/Vegetation.js` + `src/deep/veg/`, loaded by DigScene as an optional module):
painted 2D plants on alpha-tested cards, all of them in ONE instanced mesh (one draw call).

- **Sprites** (`veg/sprites.js`, painter in `veg/paint.js`): ~80 hand-painted pixel sprites made in
  code at 128 texels/m (the terrain's density), no anti-aliasing, hue-shifted 7-tone ramps, light from
  the upper left, a sel-out rim; glow is coded in the alpha (255 opaque, 255 − 48·level glowing).
  Grass tufts (meadow, mossy with glowing tips, pale clay, dry with oat heads, frost, glassy crystal,
  ash with embers, void, mycelium), fern fronds (alternate pinnae, fiddleheads), dino giant fronds
  (lobed pinnae, 1.7 m), horsetails, clover (chevrons, pompoms), lichen rosettes (frost, rust,
  crystal), leaf litter, star moss, glowing fungus clusters (6 cap colours, gills, spots, rings),
  puffballs, bioluminescent flowers (bell, orb, star, spike; cyan, violet, pink, ember, frost),
  thorn scrub, stone roses, ash weeds with ember pods, void tendrils, hanging roots (clods, hairs,
  forks), vines (alternate leaves, tendrils, glowing berries), moss and root drapes, mycelium threads,
  rime fringes. One 1024² atlas, painted once per session (~90 ms). `vegetation.debug.atlas()` shows it.
- **Layouts** (`veg/flora.js` `layPlant`): crosses of 2–3 cards, rosettes of fronds on cards bent in
  2–3 segments (they arch and droop), flat ground cover, hanging crosses, wall fans and tufts, wall
  decals. **What grows where** (`floraOf(zone, biome, depth)`): per biome (mossy grotto, sandstone,
  mushroom hollow, dino caverns) and per zone (rootsoil, clayworks, crystal grotto, magma, frost,
  core) weighted floor / ceiling / wall lists and densities; fertility by the material underfoot
  (`FERT`; moss creeps over bare rock in lush places, `ROCK` + `flora.rock`); meadows and bare
  patches from two noise octaves; kinds clump per 0.75 m cell; thin on trodden trail floors; never in
  the burrow, tunnel mouths, the shaft, stations, the town gate, lift rooms, NPC burrows or Old Star's
  dig, never on the player's own diggings (`world.edits`); hanging plants stop about eye height in
  low passages. Deterministic from the world seed (3-voxel floor grid, 4-voxel wall grid).
- **Shader** (`veg/material.js`): sway in the cave's breath (a slow wandering draught, gusts rolling
  through, per-plant flutter; bend weights per card so bent fronds stay joined), pushed aside and
  pressed down by the mole (and the trail of where it just was, so they spring back) and Nugget,
  small plants thin out with distance (per-plant rank, shrinking away, 9.5–17 m on Fancy, closer on
  Simple/Off shaders), AO at the root, glow that reaches a little further through the fog, a dithered
  fade for leaves within half a metre of the eye (no screen-filling texels). Light and
  air: TerrainMaterial's exported `LIGHT` (`lightAt`) + `AIR` (`caveAir`, `fogAmount`) chunks when
  present (same lamp, point lights, sky/bounce, fog, mist, dust as the rock), else a built-in copy of
  the same model; uniforms are the terrain's own objects (`{ ...U }`).
- **Streaming**: chunks within 15 m (nearest first, a ring walked over frames) are planted within a
  1.3 ms/frame budget (4 ms in the first 2.5 s; ~70 ms at scene load round the spawn), dropped past
  19 m; each chunk rents a range of the instance buffer (first fit, coalescing; ranges compact down).
  Planting costs ~0.1–0.25 ms per 2 m chunk (Node bench, warm). Typical counts: 500–1500 plants /
  2–5k cards in view in lush caves, a few hundred elsewhere.
- **Digging**: Vegetation chains itself into `world.onChange` (after DigScene's props/fluids handler);
  a plant goes (with a puff of leaves) when the voxel under it is dug or the space it grows in is
  filled. If the lead adds `this.vegetation?.onVoxel?.(...)` to DigScene's onChange lambda, the chain
  notices and stops calling it itself.
- `lights(eye)` → ≤ 2 faint glows from the nearest luminous patches (fungus, flowers, glowing vines).
  A soft rustle plays when walking through tall plants. `update()` returns `[]`.
- Debug: `scene.vegetation.debug.{ info(), kinds(), near(x, y, z, r), atlas(on), rebuild(), bench(n), budget(ms) }`.

**Generator `decorate()`**: the blocky voxel plants are gone (voxel vine strands in the grotto, root
strands in the topsoil, voxel ferns in the dino caverns, glowcap buttons in the mushroom hollow; the
cards replace them); dirt roofs in the topsoil and the dino caverns turn to `M.ROOTS` in patches where
the roots hang from. Giant mushrooms, dino ribs, spikes and moss floors are unchanged. No new
material ids (the `M.FERN` / `M.VINES` ids stay defined for old edits).

**Props at 1/32 m** (`src/deep/props/hires.js`, `props/hiresPlants.js`, registered over the old
builders in `props/models.js`; builders may now return `ao: false`):
- Lanterns with real supports and lit glass (the flame is painted on every pane, one pane catches
  a streak of reflection, candle inside, stepped roof with vents, bail ring): `lantern` on the wall
  (oak mounting block, riveted iron backplate, square arm ending in a scroll, knee brace with a
  curl, hook, chain), `lanternC` from the roof (riveted iron plate with an eye bolt, or an oak beam
  stub in an iron strap; chain length still `param` = L/16 m, the lantern's middle (L + 5.5)/16 m
  down), and the new `lanternP` lantern post (timber post on a stone cairn, crossbeam, knee brace,
  iron straps, hook and chain): in camps beside the track, as a fixture where a plan lantern has no
  roof or wall to hang from, and a little in the zone floor tables. All flicker (`lantern: true`).
- Glowing `mush` clusters (S-curved stems, skirts, domed caps with gills, rims and spots, mossy
  feet), `crate` (planks with gaps, frame, braces, nails, a painted mark; smashed open with ore),
  `barrel` (staves, riveted hoops, planked head or water), `coil` (braided hemp), `cart` (flared
  riveted tub, spoked wheels on the rails, ore load; tipped and spilt).
- Forage plants: `glowcap`, `cave_carrot`, `blindfern` / `ashfern`, `gloomshroom`, `pepperroot`,
  `emberbloom`, `frostbloom`, `crystal_lily`, `bubblebulb` (same sizes, lights and particles; the
  plant-record fields the 3D gathering part reads are unchanged).
- `props.showcase(list, x, y, z, ...)` / `props.clearShowcase()` (debug: models in a row).
- Vertex counts: lanterns 2.7–5.3k, mush 6.7–8k, crate 3–5k, barrel 6.5k, cart 6.2–6.5k, forage
  plants 1.4–8k (fern); the zone-1 mushroom weight went down (6 → 3.5) as the cards add fungus.

Screenshots: `shots/vegetation/` (`before-*` the old look at random spots; `after-<biome>.png` /
`after-<biome>-noveg.png` the same camera with and without the cards in all six zones and four
biomes; `close-*` close-ups; `room-*` the new props in a carved showroom; `atlas.png` the sprites).

### As built: water (wave 3)

The ask: "add water physics and better visuals". All in `src/deep/Fluids.js` (ties the parts
together; the mole and the things in the water) and `src/deep/fluids/` (`sim.js` the flow,
`water.js` the surface shader, `caustics.js` the water light on the rock, `fx.js` particles and
sounds, `lakes.js` lake levels and shells at plan time). The contract is in `docs/DEEP.md`
(Fluids, Fluids internals).

**Physics** (`fluids/sim.js`, `FlowSim`): a cellular automaton at voxel size (1/16 m) with levels in
eighths, typed arrays per chunk, 20 steps a second, time-budgeted (≈2 ms flow + 2.5 ms surface
rebuilds a frame, each chunk's fluid mesh at most every 0.15 s), only within 24 m of the mole (the
rest sleeps and wakes when you come back).
- Water falls two cells a step through open air (a continuous ribbon: the mesher stretches each
  falling cell one cell down), fills part-filled water below, spills over an edge into lower
  part-filled water (water levels across layers), keeps running the way a stream was going (it
  moves on even a step downhill until it hits a wall), and levels out sideways.
- Pools rest flat: a resting cell still a step off its neighbours seeds a levelling pass that
  shares the water of the whole connected surface evenly (no more mounds sloping 1/8 per cell).
  Everything settles and the queue empties (the old flow never settled: a 2.7 m³ pour on a ramp
  was still active after 60 s; now it's still after ~25–30 s, same CPU).
- Puddles: films ≤ 2/8 soak into porous floors (dirt, loam, sand, gravel, moss, mycelium, ash,
  snow, roots, rubble, clay) in 5–9 s, 1/8 films dry off stone in ~30–40 s, deeper water stays.
- Lakes are reservoirs (dig into one: it gushes out, up to 512 eighths a step, from the top layer,
  which sinks smoothly in the shader and is removed a few thousand cells a frame; it waits while
  part of the layer isn't loaded). After 48 000 voxels (12 m³) the rest above the hole drains away
  into the rock (the lake sinks below the opening at 5 layers a second), so a lake is never left
  as a wall of water facing air. Lava: every other step, thick, cools to rock; water + lava →
  obsidian/basalt and steam.
- Lakes at plan time (`fluids/lakes.js`, from the end of `makePlan`; **one 3-line hook in
  `Generator.js`**: the import, `settleLakes(plan, zoneAt)` before `return plan`, and in the lake
  stamp `ym < (f.wl ?? …)` plus the shell line): natural caves crossed most lakes below their
  waterline, leaving walls of water standing in tunnels and even floating blocks of water in
  caverns. Now each lake gets a watertight shell (`f.shell`: clay in strata 1–2, limestone in 3,
  ice in 5, obsidian for lava) laid where caves meet the pocket below the waterline (a tunnel ends
  in a wet clay wall: dig through and get flooded), and caves meeting the air dome above the water
  open onto the lake. Where a carved room, trail or burrow crosses the shell, the level drops to
  just under it (`f.wl`). A lake whose basin stands mostly in open cavern (one or two a world)
  holds no water and gets no shell (it would hang there as a floating bowl), and loses its danger
  marker and lava glow. Same in the workers. Existing saves: lakes look the same except for the
  new shells (and lower or no water where a trail or a cavern ran through one).
- Saved: air↔water goes into the world's edits as before; part-filled levels are saved under
  `moleforge.fluids.v1` (per seed, every 20 s and on exit) and come back on load (tested: a settled
  pool reloads cell for cell; films under 4/8 still save as air, by `World.saveEdits`).
- Springs (`fluids.debug.spring(x, y, z, rate)`): a cell that keeps pouring, for tests and set
  pieces.

**The mole in water** (`Fluids.swim`, `bodyFx`; **a small hook in `src/deep/Player.js`**, which no
part owns: `FPSPlayer.wade` and `.flow`, set by Fluids every frame): wading through shallow water
slows you (up to 45 % at knee depth) with a splash, a ring and a slosh every step; currents carry
you (added to the walking target, so you can swim against them; falling water pushes you under);
buoyancy springs you to ride the waves with a little overshoot; splash crown, rings, jelly wobble
and foam on the way in; wake rings and foam while swimming; bubbles from the snout; looking down
while swimming (or crouch) dives. Under water: murky blue-green fog, drifting specks catching the
lamp, and every sound muffled (a low-pass on the master bus, 18 kHz → 420 Hz with depth, restored
on surfacing). Rocks that fall in splash and sink trailing bubbles; finds whose item `cat` is light
(food, plants, ingredients, drops…) waiting on the floor bob on the surface and drift with the
current; bodies with `b.float` or a wooden `b.mat` float too (see hooks).

**Visuals** (`fluids/water.js`, `fluids/caustics.js`), still 64 texels per meter, stepped tones,
whole-pixel offsets:
- `WaterGrab` blits the engine's scene target (colour + depth) when the first water surface of the
  frame draws (one blit, nothing re-rendered). Water then refracts what's under it (whole-pixel
  offsets from the wave normals, never borrowing what's in front), tints and fogs it by the water
  the eye looks through (Beer-Lambert, red goes first, in six steps), and colours even shallow
  water a little; the surface writes depth now, so bubbles and droplets behind it hide properly.
- Animated normals: the swell, ripple rings and jelly wobble as before, plus two octaves of fine
  texel ripples drifting downstream (they break the lights' reflections into glitter).
- Reflections: Fresnel toward grazing angles with a 9-step screen-space march (lit walls, lanterns,
  glowing things show in the water; off on the 'low'/'off' fx settings, phones).
- Glints: the helmet lamp right below you and every nearby light across the water, sharp, in
  pixel clusters; short crest-line dashes riding the swell near the eye.
- Flow you can see: streaks and flecks carried downstream by a two-phase flow map, from the
  surface slope and from the sim's own running directions (a per-column flow texture, so a level
  stream still shows which way it runs).
- Foam: at shores (the mesher's shore flags, clumped and lapping), along the ragged edge of a
  spreading film, on ripple crests, and churning wherever falling water lands (`wImp[6]`, points
  that build up while a fall keeps hitting and fade after).
- Falling water: translucent blue-green with a few bright threads racing down, the world behind it
  bent; spray, mist, droplets and a ring where it lands. From below, the surface is a Snell's
  window onto the cave above with a bright rim, dark total reflection around it and a drifting
  light network.
- Caustics on the rock (`WaterMap` + `patchTerrain`): a 128² map (16 m, 1/8 m texels) of water
  tops/bottoms round the mole tells the terrain shader where water is; floors and walls under
  water get a dancing caustic network (stepped, fading with depth), walls just above a pool get
  the wavering light it throws back (up to 1.6 m), the waterline gets a dark wet band, and rock
  right beside water below its surface looks damp (a lake's clay shell seen from a tunnel: water
  behind this wall; the ceilings there drip). Added
  at runtime to the terrain material (onBeforeCompile; `col *= wc_light(vWorld)` just before the
  cave-look part's `col = caveAir(...)`, or before its last `gl_FragColor = vec4(col, …)`); if
  neither is found the terrain is left alone and the water shader draws the caustics on the floor
  it sees through instead.
- Lava keeps its own look (crust plates, glowing seams, heat pulses), unchanged.
- Drips from wet ceilings: over any water near the mole drops swell, fall and ring the surface;
  over the damp rock right round it they spatter on stone (`fx.dripAt`).

**Hooks for the lead** (not applied):
- `Terrain.js`: Fluids swaps its material in at start (`owner.terrain.fluidMat`), so nothing is
  needed; to build with it from the first frame, `this.fluidMat = makeWaterMaterial(U, grab)` from
  `./fluids/water.js` (and a `new WaterGrab()`).
- `DigScene.js`: `this.post.underwater = pl.headUnder ? 1 : 0` could be
  `this.fluids?.uwK ?? (pl.headUnder ? 1 : 0)` (Fluids eases it in and out over ~0.15 s). The
  `ev.splash` handler plays a splash and particles that Fluids also plays (two splash sounds on a
  high jump into water): it can go.
- Floating debris: `Bodies.spawn` could copy `opts.float` / `opts.mat` onto the body and DigScene
  pass the broken voxels' material, then timber, boards, ladders and roots float (Fluids already
  reads `b.float` / `b.mat`).
- `World.saveEdits` drops water films under 4/8 (saved as air); with the levels saved by Fluids it
  could keep them.

**Cave look part**: the terrain material gets `wc_light()` patched in at runtime (above); keep a
`vWorld` varying and either `col = caveAir(col, …)` or a final `gl_FragColor = vec4(col, …)` and
it keeps working. `makeFluidMaterial` / `FLUID_SURF` in `TerrainMaterial.js` are only the fallback
now (the live copy of `fsurf` is in `fluids/water.js`, mirrored by `Fluids.waveAt`).

Test hooks: `scene.fluids.debug.{ pour(x, y, z, r, m), spring(x, y, z, rate, m), look('old' |
'new'), stats(), sim }`.

**Performance** (headless, SwiftShader, while the machine ran at load 15–36 from other parts' tests,
so frame times are noisy; best-of-n):
- The flow, CPU (node, the same 2.7 m³ pour onto a ramp): old 1.0–1.2 ms a frame, new 0.8–1.6 ms;
  the new one is still after 25–29 s, the old one was still busy after 60 s. A lake breach (6 000
  cells moving for 90 s): 1.5–2.7 ms a frame, held by the budget.
- In game, a pool under a constant waterfall: `Fluids.update` 3.4–6 ms (flow + remesh ≈ 3.4,
  effects 0.1–0.2, water map 0.1–0.3) at load 25.
- Rendering: at a lake shore old 2.07–2.30 s vs new 2.16–2.23 s a frame (960×540); looking down
  into the shallows with water filling the screen old 0.81–1.02 s vs new 0.82–1.45 s (640×360:
  up to ~25 % more, the reflections and caustics; 'low' fx drops the reflections); with no water in
  sight there's nothing to pay (mine entrance A/B, same either way).
- `E2E_UNTIL="town gate" node scripts/e2e.mjs`: all 16 steps pass (an earlier run at load 30
  hit 30 s screenshot timeouts in three deep steps; no water in those views, and the A/B above
  shows no cost there).

Screenshots (`shots/water/`): `before-*` / `after-*` pairs at the same seed and camera (the old
surface material vs this part's, terrain caustics off vs on): `lake-shore`, `lake-shallows`,
`lake-under`, `lake-up` (Snell's window); `before-oldsim-*` the old flow and look (a pour on a ramp
that never settled, the old lake); `after-pool*` / `after-waterfall` (a pool room with a spring
pouring off a shelf and a lantern), `after-breach-0..3` (dig through to a full reservoir: the gush,
the waterfall from the hole, the flood), `after-lake-shell` (a cave tunnel ending in a lake's damp
clay shell); `e2e/` the last e2e run; `dev/` the iterations.

## Wave 4: Minecraft feel, cinematic tutorial, cutscene talk (the user's ask, and who owns what)

The user's words (three messages): "The house is a really bad cave, small cave with almost nothing;
[make it and the] tutorial better: forced, cinematic, don't show too much UI yet, have mobile and PC
tutorial, super polished interactive cutscenes, forced tutorial. Remove human infrastructure in the
cave, make it like Minecraft, and the elevator area can't be destroyed, make it more like Minecraft
too. Add building and destroying buildings, but it needs tools." · "Fix the UI blur issue: the UI gets
a weird blue effect. NPC dialogue: make it like a zoom-in interactive cutscene with floating text." ·
"Human infrastructure: make it 0 now, but have roguelike dungeons etc. Make the forest scene 100x
better, and caves have vines and no grass: mushrooms and dirt, not much grass."

| Part | Owns |
|---|---|
| **Cinematic tutorial** | the lessons flow: `src/home/lessons.js`, `src/home/wake.js`, `src/deep/Prologue.js` (mining lesson), `src/forge/tutorial.js`, `src/cooking/lesson.js`; new `src/ui/Onboard.js` (+css: control prompts drawn per device, PC keys vs touch gestures); a "tutorial UI level" (`ui.setTutorialLevel(n)`: which HUD pieces show) in `src/ui/Hud.js` / `UI.js` (small, additive) |
| **Cutscene talk** | new `src/ui/Convo.js` (+css) and a camera director (`src/fx/director.js` or similar): NPC talk zooms in on the speaker's real 3D model with letterbox bars and floating text beside the head, choices floating too; routes `ui/choices.js`, `ui/questTalk.js`, Old Star's talk, town folk, keepers, burrow traders and Rocco through it; `src/ui/Tutor.js` (tips only, no blur); the UI blur / blue-tint bug. May add one camera-hook line per scene (`HomeScene`, `TownScene`, `DigScene`) |
| **Natural caves & dungeons** | `Generator.js` `addPlaces`/stamps, `src/deep/gen/*`, `src/deep/ruins/*` + `Ruins.js` (ruins become Minecraft-like dungeons), `Props.js` placement tables, `src/deep/veg/flora.js` (vines, mushrooms, dirt; little grass), the lift stations' look and protection (unbreakable), `Traders.js` only for the trails that led to the burrows |
| **Building** | new `src/deep/Build.js` (Minecraft-like placing of blocks, torches/lanterns, ladders, doors…), the `build` tool section of `DigScene.js` (`build()`, `cycleBuild`, the build hotbar), `Dig.js` (which tool breaks what: built blocks need the right tool), block items in `data/items.js` (additive) |
| **Forest** | the journey / surface forest: `src/bookends/journey.js` and its art, `src/scenes/FallScene.js` visuals |
| **House → old cave camp** | the user clarified: "new house: old house in a cave, like a camp, super old, bad". Old Star's home becomes an old, run-down camp in a natural cave hollow (shack of warped planks and tarps against the rock, sagging cot, fire pit and kettle as the cooking spot, a crude stone forge, a rusty lift cage in a rock shaft, crates, an oil lantern), characterful, not empty. Owns `src/home/house.js`, `houseProps.js`, `surfaces.js`, `plan.js`, `vista.js`, `shell.js`, `walls.js`, `src/scenes/HomeScene.js` structure, `src/iso/homeLayout.js`; old saves and every entry path load the camp |
| **Lead** | `DigScene.js` (except the build section), `World.js`, `Terrain.js`, `scripts/e2e.mjs`, integration |

Rules as in wave 3 (no git, build passes, keep debug hooks and e2e working, `E2E_UNTIL`, phones portrait and
landscape, performance, screenshots in `shots/<part>/`, an "As built" section here, don't edit another
part's files except the small hooks named above; use unique file names in the shared scratchpad).

### As built: natural caves, dungeons, the lifts (wave 4)

The ask: "Human infrastructure: make it 0 now, but have roguelike dungeons etc." · "the elevator area
can't be destroyed, make it more like Minecraft too" · "caves have vines and no grass: mushrooms and
dirt, not much grass."

**No human works in the caves.** The generator makes no trails any more (no timber frames, sleepers,
rails, plank decks, ladder shafts, cave-ins, trail lanterns), the old passage from the burrow toward
Deep Town is a string of natural pockets without lanterns, and Props' tables only grow what grows or
lies there naturally (glowing mushroom clusters, shelf fungus, roots, vines, bones, fossils, crystals,
obsidian, vents, ice): no posts, crates, barrels, carts, rope, ladders, lanterns, lantern posts,
signposts, urns, charred timbers or miners' camps (`placeCamp` is gone). `src/deep/ruins/trailDress.js`
is deleted; `src/deep/gen/trails.js` is a stub keeping `TRAIL_W`, `trailCollapse()` (→ null) etc. for
old imports. Kept: the lift stations, the NPC burrows, Deep Town and its gate, Old Star's dig.

**Natural passages** (`src/deep/gen/passages.js`, feature kind `passage`, pure): every burrow's door
opens onto a winding cave tunnel (rounded, lumpy, a flat floor, 0.8–1 m radius) that `planPassage`
lays to the nearest open, floored cave within 26 m in front of the door; one more joins the mine
entrance's doorway (narrow past Old Star's loam plug, so his lesson keeps its plug) to the Trading
Post. They never cut bedrock, burrow walls, anything made (ids 43–127) or water.

**Dungeons** (`src/deep/ruins/dungeon.js`; `plan.ruins` and the `ruin` features are dungeons now; the
old hall/shrine/vault/well layouts are deleted). Built on a 0.5 m block grid (8 voxels; every block one
material, so walls read block by block), hidden in solid rock: the generator (`placeDungeon` in
`Generator.addPlaces`, its own rng stream) puts each one where its rooms are rock all through, far
from the places, lakes and lairs, and turns its front toward the nearest cave you can stand in; a short
natural crawl (part of the dungeon's stamp) joins them. Caves that run into a dungeon break through its
walls and ceiling (only floors, the door wall and water-holding walls are always laid).
- **Monster Room** (`cell`, zones 1, 2, 5 + two plain ones in every zone): a cobble / mossy cobble room
  (3–4 m, 2 m high), a monster spawner in the middle, two chests by the walls, cobwebs in the corners
  and one across the way in (a real, sticky web when the creatures part is loaded), a lost miner's
  remains. Behind the back wall a sealed strongroom: a hidden switch behind a cracked panel
  (`switch`, odd zones) or four levers in wall niches pulled in the lintel's order (`levers`).
- **Flooded Crypt** (`crypt`, zones 2, 3): a stone-brick hall (courses with mortar, mossy and cracked
  bricks) lined with two rows of tomb niches (skulls, bone dust), a spawner, a chest alcove, a dart
  trap by the way in; a stair of quarter-block steps goes down into a lower crypt full of black water;
  the sealed door is down there. The drain wheel at the top of the stair empties it layer by layer
  (`valve`; it waits for the chunks below to stream in, and a drained crypt stays dry on reload).
- **Starfolk Vault** (`vault`, zones 3, 5, 6): a tall antechamber of the Starfolk's fitted stone on four
  marble pillars with gold bands, a gold-edged mosaic path, a frieze, one corner fallen in (a heap of
  blocks under a broken chimney), braziers; three symbol drums on an altar under a jade mural
  (`dials`) or three pressure plates (`plates`). Stone guardians (golems; crystal golems from zone 3)
  wake when you walk in. Its strongroom is the old gilded treasure room.
- **Deep Fortress** (`fortress`, zones 4, 6): a long dark-brick hall on half pillars (nether-brick
  look: `XBRICK*`), two side rooms with fire-imp spawners and chests, a lava pit behind iron bars, a
  dart trap; a sun crystal and three mirrors (`beams`) or four levers open its door.
- Every puzzle kind still turns up (cell switch/levers, crypt valve, vault dials/plates, fortress
  beams/levers); the eleven dungeons with a strongroom keep the ids `R10 R20 R21 R30 R31 R40 R41 R50
  R51 R60 R61` and their relics (`ruin.relic`, the relics' `where` texts updated) in `plan.ruins` (so
  the quests, the map and the creatures part's wraiths see the same eleven places as before); the
  plain monster rooms are `plan.rooms` (`R12, R13, R22, …, R63`: no door, no relic, found only by
  exploring; same `ruin` features, run by Ruins.js too). Lore carvings still read (`LORE_KIND`: cell →
  hall texts, crypt → well, vault → vault, fortress → shrine).
- **Spawners** (`site.js`): an iron cage block (`M.SPAWNER`, a frame with bars, a flame turning inside)
  that breeds the dungeon's creatures through `enemies.spawnGroup` every 7–14 s while the mole is
  within 10 m (2–4 alive at once by zone; it respects `enemies.autoSpawn`, `peace` and safe places).
  Dig a quarter of its cage away and it breaks (`act { type: 'spawner', id, kind, zone }`). Kinds: slimes
  and spiders up top, kobolds in the clay, wraiths in the crypts and deep, fire imps in the fortresses.
- **Chests**: the strongroom's (gold, the zone's gems, the relic, as before) and the dungeon chests
  (plain wooden ones: some gold and 2–3 things for the depth: ingots, dynamite, torches, food, silk, a
  gem, now and then a weapon blueprint).
- **Traps**: a pressure plate in the floor; three darts fly out of holes in the wall (damage by zone,
  `{ damage, kind: 'dart', push }`), every 3 s while you stand on it.
- **Lost miners' remains** (one in every dungeon with a strongroom): bones, a snapped pick and a
  satchel; E: a purse of gold the first time and a page of Hobb's journal (`lore.readJournal`), `act
  look { at: 'cavein' }` (the quests' old cave-in steps are done here now).
- New voxel materials, ids 64–79 (`src/deep/ruins/mats.js`, `RM.*`, all `made: true`; names prefixed so
  they don't clash with the building part's `BM.*` in `M`): `DCOB DMOSSCOB DBRICKA DBRICKB DMOSSBRICK
  DCRACKBRICK DMORTAR XBRICKA XBRICKB XMORTAR SPAWNER BARS`, and the lifts' `LIFTBRICK LIFTPLANK
  LIFTRAIL LIFTCOB` (`unbreakable`, `clean`).

**The lift stations** (`src/deep/gen/lifts.js`, features `lift` / `stop` / `shaft`, stamped last):
Minecraft-plain cobblestone rooms (smooth stone at the corners and under the ceiling), a plank car
framed in iron in the middle, iron guide posts at its corners and rails up the 1.5 m shaft over it
(capped 6 m up), a doorway in the +z wall; the town shaft is lined with cobble (a smooth band every
2 m) with a rail each side, its stops are stone rooms opening onto it with a doorway east. Every voxel
of a station is unbreakable (`Dig.breakable` already refuses `MAT.unbreakable`, and blasts ask it too),
and the shell is laid even where a cave runs through. Nothing grows on them (`MAT.clean`, a one-line
hook in `TerrainMaterial.surfacePalette`). The fittings are models (`src/deep/ruins/liftKit.js`, run
by Ruins.js): a lever on a stone post beside the car (E: it clunks over and the lift map opens;
anywhere in the room still works too), a plank sign with the station's name and depth (E: reads it,
`act look { at: 'signpost' }`), two torches. Props no longer dresses lifts (`props/lifts.js` unused).

**Vegetation** (`src/deep/veg/flora.js`, new sprites in `veg/sprites.js`): floors grow mushrooms of
many kinds — brown caps, red toadstools, ink caps, tall glowing stalks (cyan, blue, violet), glowing
buttons, ember caps (magma), frost caps — and pebbles; vines (cave vines hung with glow berries
lower down) and roots hang from the roofs; mushrooms grow out of walls. Grass only in the first 6 m
and, thin, in the mossy grotto and the dino caverns (still lush: ferns, moss, flowers). Generator
`decorate()`: plain cave floors in zones 1–3 are packed dirt and gravel (a little moss only near the
top); the grotto keeps its moss. A little grows on the dungeons' mossy blocks (FERT).

**Test hooks** (`scene.ruins.debug`): `list()` / `dungeons()` (id, kind, name, puzzle, zone, plain,
open, spawners, chests, relic), `find(kind | 'plain')` (the nearest), `go(id, where, look)` (where:
`entry | mid | door | room | puzzle | [a, y, b]`; look: `door | chest | mid | spawner | lever | switch
| dials | beams | plates | valve | shaft | gallery`), `solve`, `reset`, `press(id, i | 'chest')`,
`loot(id, i)`, `spawner(id, i, 'info' | 'go' | 'break')`, `lift(id, 'go' | 'pull')`, `puzzle(id)`;
`trail()` / `sign()` return null. The e2e step "deep: a ruin puzzle opens to treasure" runs unchanged
(R10 is a monster room with the hidden switch).

**Small hooks done in other files** (no wave-4 owner; text and lookups only):
- `src/core/questWhere.js`: `caveIns(plan)` → `plan.remains` (`[{ x, y, z, ruin }]`, the lost miners'
  remains), the `signpost` sight → `plan.signs` (the lift stations' name signs, `[{ x, y, z, lift }]`);
  the ruin labels are the dungeon names; `SIGHT_NAMES.cavein / .signpost` say remains / lift sign.
- `src/data/sideQuests.js` (Hobb's journal, Tuck's signs and pick, Hollis's pages, the carvings, the
  idol, Talpa's "Star Shrine" step: now `where: { ruin: 'vault' }`, "wake the eyes of a Starfolk vault",
  still `on: puzzle dials | beams`), `src/data/quests.js` (zone hint: "follow the caves"),
  `src/ui/Journal.js` (sight labels, lore hints), `src/ui/Survey.js` (a ruin's map label: the dungeon
  name), `src/data/lore.js` and `src/core/lore.js` header comments. The quests' acts are unchanged
  (`look cavein` = search a lost miner's remains, `look signpost` = read a lift station's sign).
- `src/deep/TerrainMaterial.js`: one line, `!d.clean` in `surfacePalette`'s `natural` (no moss on the
  lift stations).

**Left for the lead**:
- The building part's block shader (`src/deep/build/shader.js`) could draw the dungeon cobble / stone
  bricks / deep bricks and the lift stone with its block patterns too (ids 64–79), if it takes a list
  of ids → patterns.
- The map still has an "Old trail" key entry and a trails layer (`Survey.js`; `plan.trails` is empty, so
  nothing draws); drop them when convenient.
- e2e: in this busy box (load 25–37) every full run hung in the first `go()` after "Old Star's forge
  lesson" (into the cooking lesson; into the mine when cooking is skipped), and "Old Star's mining
  lesson" fails on `d.interact is not a function` (home part). With those steps skipped (a copy of
  e2e.mjs that sets the flags `fallen nugget prologue`), every deep step through "reach the town gate →
  escape" passes with no errors; "a ruin puzzle opens to treasure" is unchanged.

Screenshots: `shots/natural/` at seed 4242: `before-*` (the old trails, timber, signposts, the lift
cage, the old ruins, grass) and `after-*` from the same cameras (`L0`, `L0-cage`, `trail`, `sign`,
`lift-L30`, `station-s2`, `cave-z1..z5`, `grotto`, `mushroom`), plus `after-dungeon-cell-R10`
(`-door`, `-entry`, `-open`), `after-dungeon-plain-R12`, `after-dungeon-crypt-R21` (`-stair`),
`after-dungeon-vault-R31` (`-dials`), `after-dungeon-fortress-R40` (`-beams`, `-side`),
`after-lift-L0-car`, `after-lift-L30-lever`; `e2e/` the deep e2e run; `dev/` the iterations.

### As built: building and breaking, with tools (wave 4, building part)

Minecraft-like building in the mine. **Placed things are plain voxels** of the building materials
(ids **80–95**, `src/deep/build/mats.js`, registered by `materials.js` as `M.B_*`; all `built` + `made`), so
they collide, light, save and load with the dug rock (`World.saveEdits`), and torches/lanterns come back
from the saved edits. A **block is 8×8×8 voxels = 0.5 m**: the mole (0.86 m, jumps 0.83 m) stands under
two and hops one, like a Minecraft player; doorways are 1 wide × 2 high.

- **Blocks** (`src/deep/build/blocks.js` `BLOCKS`, ladder first so the mining lesson's `buildMode 0` is still
  the ladder): cobble, stone bricks, clay bricks, planks, logs (axis = the face you click: `B_LOG_X/Y/Z`), dirt,
  glass; **shapes**: block, slab (top/bottom by where you aim), stairs (tall side away from you, upside down
  under a ceiling), post (a quarter-block pillar; logs/planks on a wall lie as beams), pane (glass, across your
  view). **Ladder**: a click puts up a run from the floor to the top of the wall (one ladder per block; it
  hugs rough rock; `M.LADDER`, climbable as before). **Torch** (wall or floor) and **lantern** (ceiling,
  floor, or a wall bracket): one marker voxel + a model (`build/models.js`) whose light goes into
  `plan.lights` (flicker + glow halo from DigScene.lights / Atmosphere, like glow stakes); a torch whose
  wall is dug away drops. **Door**: a 1-voxel leaf, hinge column just outside the doorway (an open door
  never narrows the 0.5 m opening; the mole is 0.44 m wide), `B_DOOR_CW/CCW` = which way it swings, open
  state in `data.build.doors`; E / click opens and shuts it. **Chest**: a voxel box, 18 slots kept in
  `state.data.build.chests["seed:cx,cy,cz"]` (the backpack's drag & drop; Store all / Take all); breaking
  it (or a blast) puts its things in your pack (spill to the trunk at home); a chest whose block is gone from
  the saved world gives its things back on load. **Workbench**: crafting station.
- **Placing** (slot 7): the face you aim at snaps the block to its cell (rough rock: the block fills the air
  round it when the cell is ≥45% open, else the next cell out); a **ghost** (shaded green, red when not
  allowed, with the cell outline) and the crosshair say what goes there or why not ("Too much rock in the
  way", "You're standing there", "Not here: the Mine entrance lift", "No Cobblestone left"). Click places,
  holding repeats (0.26 s). Clicking a door / chest / workbench uses it. During Old Star's lesson ladders
  are free (`!flag('prologue')`); after it a save gets 8 ladders + 6 torches once (`data.build.kit`).
- **Breaking with tools** (`src/deep/Dig.js`): `toolWant(m)` → `pick` (rock, ore, stone blocks) · `axe`
  (timber, boards, roots, mushroom stalks, planks, logs, ladders, doors, chests, benches) · `spade` (dirt,
  loam, clay, sand, gravel, snow, ash, moss, mycelium; dirt blocks) · `shears` (vines, ferns) · `any`
  (glass, torches, lanterns). `toolRule(m, kind)` → `{ mul, ok, keep }`: placed stone needs a pick
  (`ok: false` otherwise), placed wood with a pick ×0.3, dirt ×0.6; natural rock and soil dig as before
  with the pick (no change to the core loop), natural wood resists it (×0.35, roots ×0.6, stalks ×0.5),
  vines tear without shears (nothing kept). The **dig slot picks the best tool you own** for what's under
  the crosshair (Build.js → `digger.kit`, the paw shows the axe / spade / shears: the ViewModel hook
  below); the crosshair says "Planks · an axe would be quicker". A placed block takes damage per unit (cell,
  door, torch: `Digger.strikeBuilt`), shows **Minecraft crack stages** and a dark outline, then comes out
  whole and **pops back into your pack** (a mini block flying to you; trunk at home if it won't fit / too
  heavy). Blows (rusty pick / right tool): cobble 3, planks 5 / 1 (copper axe), log 6 / 2, dirt 2 / 1, glass 1.
  Pick bites, chisels and drills never chew placed blocks; dynamite does (a chewed block that kept <24
  voxels crumbles).
- **Where blocks come from.** **Gather** (on by default, a lever in the picker): digging natural rock keeps a
  block per 512 voxels dug (cobble from stone and crystal rock, dirt from soil, logs from timber / roots /
  stalks, clay, sand, half a cobble from gravel, vines with shears; dungeon cobble and stone bricks give
  cobble and stone bricks), never into your last free pocket and
  never past 95% of a comfortable load, only after the lesson. **Crafting** (`build/craft.js`, the picker's
  Craft tab): anywhere: log → 4 planks, plank → 4 sticks, stick + coal → 4 torches, 4 planks → workbench;
  at a workbench (within 3 m): sticks → ladders (or sticks + vines), 4 cobble → 4 stone bricks, 4 clay +
  coal → bricks, 4 sand + coal → glass, planks → door / chest, torch + iron ingot → 2 lanterns, stone
  hatchet / spade (sticks + cobble). **Shops**: Grubb's sells copper/iron/steel axes and spades and shears;
  the Trading Post sells torches, ladders, planks, logs, lanterns, axes, spades (glass, bricks, doors, chests
  from zone 2). Items (`src/data/buildItems.js`, merged by `items.js`): `blk_*` (cat `block`, stacks 32,
  2–8 for lanterns/doors/chests/benches; 0.02–2 kg), `stick sand_pile clay_lump vine_cut` (cat `craft`),
  `axe_* spade_* shears` (cat `tool`, slots `axe spade shears`, tiers 1–4, owned not slotted).
- **The picker** (R, or tapping the build slot again; `build/picker.js` + `build.css`): a wooden board under
  a hanging sign; Blocks (crates with counts, greyed when you have none, the chalk slate says where to get
  them; shape tokens with tiny isometric drawings; the Gather lever; "Build!") and Craft (pinned recipe
  cards, ingredient chips red when short, a workbench badge, Make). Phones: 4 columns, one card per row;
  landscape phones keep the slate, lever and Build! in one row so two shelves of crates show.
- **The look** (`build/shader.js`): the terrain material is patched at runtime (like `fluids/caustics.js`,
  anchored before `float ti = clamp(floor(tone + 0.5)…`): 32 "block pixels" per face with the same pattern
  on every block (cobble stones, brick courses, plank boards with staggered joints and nails, log bark and
  rings, crumbly dirt, door boards with braces and iron studs, chest bands and a brass lock, a workbench top
  with a vise), a hairline where blocks meet and bevelled outer edges from the mesher's convex flags; moss,
  strata and damp are off on them. The **dungeons' cobble** (`RM.DCOB`, `RM.DMOSSCOB`, ids 64–65) gets the
  same stones (no block hairline: dungeons sit on their own voxel origin, not on the world's 8-voxel grid;
  snapping `frame(f)`'s `CX/CY/CZ` to multiples of 8 would line their blocks up with placed ones, and the
  hairline could then go on them too). Lift stations' `unbreakable` stays unbreakable (`Dig.breakable`
  is checked before any tool rule). **Glass** discards its inner texels (frame + two glints stay) and
  Build.js draws the faces the mesher culled behind it (`rebuildGlass`). `?bklook=0` skips the patch (A/B).
- **No building** (placing; placed blocks can't exist there to break) near the home, Deep Town, lift rooms
  and NPC burrows (`Build.protectedZones`, like Explosives'); the lift stations' own rock is the
  natural-caves part's. Building is allowed in Old Star's dig (the ladder lesson).
- **Acts** (new types): `build {id, item, shape, n}` · `unbuild {id, item}` · `craft {id, n, recipe}`.
- **Test hooks**: `scene.builder.debug.{ select(id, shape), place(), plan(), aim(x,y,z), give(n, ids), tools(),
  free(on), kit(), hit(n), use(), fixtures(), glass(), gather(on), picker(tab), protectedAt(x,y,z), patched(),
  clearing(w,d,h) }`; `src/deep/build/demo.js` (`setup`, `hut`, `tunnel`, `breakTest`, `put`, `fix`,
  `clearCells`, `stand`): a hut and a lit tunnel through the real planner. Screenshots: `shots/build/`.

**Files**: new `src/deep/Build.js`, `src/deep/build/{mats,blocks,shader,models,art,craft,picker,demo}.js`,
`build.css`, `src/data/buildItems.js`. Small hooks: `materials.js` (register `BUILD_MATS`), `items.js`
(merge `BUILD_ITEMS`, two `CAT_LABEL`s), `gfx/PixelArt.js` (`drawBuildIcon`: `{ k: 'block' | 'btool' }`),
`fps/ViewModel.js` (`setTool(kind, { item, geo })`: custom held geometry in that kind's pose — axes,
spades, shears, the block in the paw), `data/shops.js` (stock lines), `Dig.js` (tool rules, placed units),
DigScene's build section (`BUILD` table gone; `toolItem('build')`, the hotbar label/count and paw tool,
hold-to-place, `cycleBuild` → picker, `updateGhost` drives `this.builder`, `build()` → `builder.place()`).

**Hooks wanted from the lead** (it works without them): in `DigScene.interact()` add `this.builder` to
`[this.nugget, this.traders, this.ruins]` (its `use(eye, f, reach)` returns `[]` when it opened a door /
chest / bench, else null; until then Build answers E itself when nothing else did); optionally
`this.builder?.target?.(eye, f, reach)` in `updateTarget()`'s use chain (Build already sets the crosshair);
`this.builder?.dispose?.()` in `exit()` (it also stands down by itself on the next act after the scene is
gone). For the **tutorial part**: the belt's slot 7 now shows the selected block (a ladder), not a beam, and
R / tapping it again opens the block picker (the "R switches" / "tap the beam" lines still hold in spirit);
in Old Star's dig the overhang above the ledge ladder leaves 0.86 m only once you're on the ledge, so
climbing off the top needs a crouch (it did with the old ladder too). For **TouchControls**: the big dig
button could show the selected block's icon while slot 7 is up (`scene.builder.item()`).

### As built: the cinematic tutorial (wave 4)

A new game is now a forced, cinematic onboarding: cutscenes with letterbox bars between the lessons,
and in between one control at a time, each with a prompt card drawn for the device, the world held
to the lesson, and the HUD coming in piece by piece. Quest / act / flag outcomes are unchanged
(`lesson` steps, `talk oldstar`, `reach`, `flag('fallen' | 'nugget' | 'prologue')`, `quests.start('lessons')`).

**The layer: `src/ui/Onboard.js` + `onboard.css` (`game.ui.onboard`, made by `UI` before the tutor).**
- `TUT` levels: `CINEMA 0 · LOOK 1 · WALK 2 · USE 3 · QUEST 4 · DIG 5 · TOOLS 6 · PACK 7 · MAP 8 · GUARD 9 · FULL 10`.
  `ui.setTutorialLevel(n, { force, reveal })` (UI.js) raises it (never lowers unless `force`). Each HUD
  piece is hidden by `#ui.obh-<piece>` until its level: `xh` crosshair (LOOK) · `stick` (WALK) · touch `use`
  (USE) · `quest` strip + waymarks (QUEST) · `belt`, touch `dig`, jump/crouch (DIG) · touch `tool` (TOOLS) ·
  `pack` backpack + load gauge (PACK) · `book`, `radar` (MAP) · touch `guard` (GUARD) · touch `snack`,
  `purse` (gold, lantern, buffs, skill chip, calendar) and the home's build button (FULL). A piece that
  comes in pops in (scale + glint), with a ring of sparkles and a name tag ("Backpack · I", "Your task · B",
  "Radar · M map"…), once the player can see it (first person, no panel, no cutscene). The scenes' own key
  hints (`.hint-keys`) stay. Saved in `state.data.onboard = { level, seen: [control ids], home, done }`,
  created by the wake-up (`onboard.begin()`); **a save without it is at FULL** (old saves, `?fresh=1&scene=…`
  tests: the whole HUD as before). `lesson cook_done` or `lesson skip` → FULL.
- `cinema(on, { skip, hold })`: letterbox (ours; the cutscene talk's own bars slide in over them when he
  talks, the same height and colour), the HUD tucked away, and a **hold-to-skip** ring at the bottom
  left: hold Space / Enter / E (a tap only carries a line on), or hold the ring on a touch screen;
  `skip()` runs once when the ring is full (~1.1 s; it drains when let go).
- `teach(id, opts)` → `{ promise, settled, done, complete(), close(), id }`: the prompt card ("Learn" ribbon,
  or "Tip" for `optional`): a glyph, a title, a line, a brass meter fed by `opts.progress()` (0..1), done by
  `progress ≥ 1` or `opts.done()`; then a green check stamps on, sparkles, `success` + `sparkle` sounds, it
  flies off. Per device (`CONTROLS`): PC key caps that light while held (WASD cluster, Shift, Space, C, E, F,
  Q, I, B, M, 1–8) and a pixel mouse whose button lights; touch: the real control's art in the card, and on
  the real control a pulsing ring and a pointing mole paw (`spot`), a ghost paw dragging across the right
  half for "look". Options: `title`, `subPc` / `subT`, `spot`, `min`, `optional`, `place: 'low' | 'left'`.
  A desktop prompt that needs the mouse says "Click the view first" while the pointer isn't caught.
  Where: top centre on a PC, the middle of a phone held upright, low between the stick and the buttons
  on a phone held sideways (his card has the top there).
- `spot(target, { label })`: ring + paw on a DOM element, a touch control name (`stick use dig jump crouch
  block snack tool`), a HUD piece (`pack book radar belt quest menu`) or a selector. `mark(pos, { label })`:
  a bobbing gold chevron (and a label) over a world point, an arrow at the screen edge when it's off screen.
  `talk(html, { who, mood, wait, camera }, fallback)`: a line that waits goes through `game.convo.say`.
- Hooks in shared files: `UI.js` (import, `this.onboard = new Onboard(this)` before the tutor,
  `setTutorialLevel`, `onboard.update(rdt)` in `update`, `onboard.clear()` in `clearWorld`, and the
  closed-handle guard in `closePanel`);
  `TouchControls.js` (`ui.touchEl(name)` → the real control, `ui.touchHi(el, on)` → `.tc-hi`).

**Home (`src/home/wake.js`, `src/home/lessons.js`).** Written against the home's stations, not its rooms
(the home is becoming Old Star's old cave camp): `questSpot('lift' | 'forge' | 'hearth')`, his spots
(`star.goTo('lift')`, `placeStarForLesson`), the cage / forge / cooking functions, your bed (`findKind('bed')`).
- The wake-up is a cutscene (letterbox, hold to skip): the eyelids as before (only the canvas is blurred,
  never the interface; no muffled card), Old Star crouched at the fire nearest your cot (the room's own
  hearth if there is one, else `questSpot('hearth')`), the view settles on him and pushes in while he
  talks (cutscene talk, close shot): five short lines, then you get up. A skip dips to black and cuts to
  its end.
- Then, one control at a time (`scene.homeTutor()` → `{ step, … }`): **look** (crosshair comes in; the
  meter fills as you look round) → **walk** over to him (he stops a couple of steps off toward the fire;
  the stick comes in; a marker over him) → **talk** (E / the hand; the use button comes in; near him E
  works without aiming) → a short cutscene: his first task → the **quest strip** unrolls → **follow** him
  to the cage (he waits and beckons when you fall behind, not when you've run ahead; a "Shift runs" tip
  on a PC) → **ride down** (E).
- Held to the lesson by a soft funnel (`SLACK`): per step, a few steps further from its goal (him, the
  cage, the forge, the fire) than your closest approach so far puts you back where you were, he calls
  you back, and the view swings round to the goal; when you haven't looked for a while the view eases
  toward what matters. Only what the step needs can be used (`ALLOW`, by label); during the forge / cook
  stages the cage, the way out, the build bench and the bed wait (`LOCKED`). `debug.interact()` still
  reaches anything (the e2e's "Ride down to the dig" works from any step).
- Back with the copper / the blade / the meal: cutscenes (he walks over, sniffs, talks), then a marker and
  a "Forge with Old Star" / "Cook with Old Star" prompt at the forge / the fire pit. The graduation
  cutscene ends with the whole HUD coming in and a "Q: snack" tip. His lines are worded for a cave camp
  (the cage, the forge, the fire pit and its kettle; no house, hall or kitchen).
- A game picked up mid-tutorial (reload, sleep) resumes the step (`state.data.onboard.home`).

**The dig (`src/deep/Prologue.js`).** Cutscene beats (`beat(keys, { look })`: bars, held in place, the
view eased to what he shows you, his lines one by one through the cutscene talk; a hold skips): stepping
out of the cage, the plug, the welcome, the copper, the geode, the ledge, the scratching. Prompts and levels:
**Dig** (the belt and the pick button come in) → **Crouch** tip in his crawl → **Pick it up** → the chisel
(TOOLS: the tool button) → **Chip it clean** (meter = how clean) → **Bag it** → **Your backpack** (PACK:
press I / tap it) → **Take the amethyst** → **The build tool** → **Build a ladder** (meter = rungs) →
**Take Old Star's map** → **Open your map** (MAP: radar + book; M / tap the radar) → **Hop down** (Space) →
**Guard up!** (GUARD: the shield button; meter = blocks) → **Bonk it!** → **Ring the bell**. The L0 cage
is locked until that last step ("The cage: after the lesson"; he calls you back). A lesson picked
up half way gets its level (`LEVEL_AT`); skipping goes to GUARD. Test hooks: `prologue.debug.tut()`
(`{ beat, prompt, level }`), `debug.cut()` (skip the beat), `debug.run(sec, carry = true)` (carries waiting
lines on, so step-by-step tests still move).

**The forge (`src/forge/tutorial.js`)** opens with a cutscene (two lines; it ends as soon as work starts, so
nothing waits behind it) and prompts at the bottom of the screen: smelt your copper (click / tap), pump the
bellows (hold the button or Space / the big button; meter = time in the band), forge a dagger, heat it,
to the anvil (E), hammer (hold, let go), grind, balance (drag). `scene.lesson.debug.prompt()`.
**The kitchen (`src/cooking/lesson.js`)**: a cutscene opening (it ends when cooking starts), a prompt for the
pantry and one per step (chop / simmer / season… each with its own control), top left.

**Test hooks**: `ui.onboard.debug.{ state(), level(n), complete(), skip(), cinema(on), hidden(), history(),
teach(id), spot(t), clear() }`; `scene.homeTutor()`, `scene.startHomeTutor(step)` at home.
Screenshots: `shots/tutorial/` (`pc-*` 1280×720, `ph-*` 390×844 touch, `phL-*` 844×390 touch;
`before/` the old wake-up).

**With cutscene talk.** Lines Old Star waits on go through `ui.onboard.talk()` → `game.convo.say('oldstar',
html, { mood, wait: true, camera })` (the wake-up asks for `camera: 'close'`); passing tips stay on his card
(`star.say(html, { convo: false })` at home, `ui.tutor` in the dig / forge / kitchen) so they never hold the
player. The letterbox is ours, with the convo's sliding in over it at the same height while he talks (we don't
call `game.convo.bars(true)`: with no line up it shows an empty name label); the skip ring sits above
both (z 6). The forge and the kitchen end their opening talk as soon as work starts
(the forge's bellows and the kitchen's steps pause while a talk holds the player). e2e drivers carry lines
on with `ui.tutor.next()` (it forwards to `game.convo.next()`).
**Open with cutscene talk (seen 10:15–11:30):** `Convo.endSession` sets `s.hold.closed = true` before
`ui.closePanel(s.hold)`, which then returns early, so a closed `convo` handle stays on `ui.panelStack` after
every talk: `isPanelOpen()` stays true, `#ui.panel-open` hides the touch controls and the tutor card, and the
first-person scenes treat the player as busy (no walking, no E). The tutorial's own layer ignores closed
handles (`onboard.panelUp()`), and since `ui.closeAllPanels()` looped forever on such a handle (a hang on the
next scene change), `UI.closePanel` now takes an already-closed handle off the stack (and clears `panel-open`
and re-enables input when it was the last): a marked 6-line guard. Please still close the hold the usual
way. Also: with `bars(true)` and no line, the empty floating label shows at the top left.
**For the home part (what the tutorial and the e2e lean on in `HomeScene`; please keep these names when
rebuilding the camp).** The e2e: `scene.debug.finishWake()`, `debug.interact('Ride down to the dig')`
(the cage's item label at stage `mine`; `debug.useLift('L0')` is its fallback), `debug.run(frames, dt,
until)`, `scene.lessonStage()`. If `enter()` throws before `this.debug = this.makeDebug()`, every lesson step
of the e2e fails with "d.interact is not a function" (seen 11:30 while the camp was half rebuilt:
`addHouseInteractions` reading `skylight` of undefined; fine again by 11:35). The tutorial: `tickWakeFx(dt)` called every frame from `update` (it drives
`tickHomeTutor`); `wakeFromFall()` on `from === 'fall' | 'newgame'`; `questSpot('lift' | 'forge' |
'hearth')`, `shell.hearth` (optional), `findKind('bed')`, `lieDown`, `floorY`, `unstick`; the script camera
(`beginScript` / `endScript` / `cam` / `tween` / `later` / `sleepFor` / `tickers` / `scripted`); `rig.items`
(each `{ label, enabled, action }`, `label` a string or a function: the tutorial wraps `enabled` and reads the
label as it is at the moment); `riding` (the cage ride); `star` (`say`,
`goTo`, `walkTo`, `placeAt`, `faceTo`, `gesture`, `sniff`, `pos`); and the calls into lessons.js from the
scene: `talkStar` → `lessonTalk()`, `onLessonRide()`, `onLessonArrival(from)`, `placeStarForLesson()`,
`prepForgeLesson()`, `prepCookLesson()`.

### As built: cutscene talk, and the UI blur / blue bug (wave 4)

`game.convo` (also `ui.convo`; `src/ui/Convo.js`, `convo.css`), the camera director `game.convo.director`
(`src/fx/director.js`), speakers `src/fx/speakers.js`. Talking to someone zooms in on their real 3D
model (close-up / over the shoulder / two-shot, by the room there is), letterbox bars, you're held
(the talk sits on `ui.panelStack` with no backdrop: `isPanelOpen()` is true, Esc leaves), the words
float beside their head (typed, their voice), answers float in on your side; then the camera eases back.
```js
const r = await game.convo.play({ who, name, lines: ['Hi!', { text, mood, who, camera, gesture, wait, dur, sub, key }],
                                   camera: 'auto', choices: [{ label, sub, value, primary }], keep, hold });
// r = { choice (value or index) | null, index, skipped }
game.convo.say(who, html, opts) → Promise<r>          // or the tutor's shape: say(html, { who, mood, wait, dur, key, rig, head })
game.convo.ask(who, html, choices, opts) → Promise<value | null>
game.convo.bars(on)        // the letterbox alone, for your own scripted scenes (a talk keeps its own)
game.convo.end()  .next()  .pick(i)  .active → { who, html, mood, wait, typed, held, choices, camera } | null
game.convo.speaker(who)    // the 3D speaker here, or null
```
- `who`: `'oldstar'` (home: the house's Old Star; the dig: `scene.prologue.star`), `'rocco' | 'trader' |
  'herbalist' | 'outpost'`, a Deep Town shop id, a villager id or a name, or an object: an Actor, a town
  folk record, a burrow Folk, Old Star, anything with `rig` (+ `head(out)`). In the tutor's shape,
  `rig` / `head()` are used when there is no model of `who` in this scene.
- `camera`: `'auto'` (a two-shot to open, close-ups for their lines, over your shoulder for answers),
  `'close' | 'ots' | 'two' | 'wide' | 'hero' | 'face'` (first person, turned to them) | `'none'`.
  Only scenes with the director hook move the camera (home, town, the mine); elsewhere (forge, kitchen)
  the words float by the speaker's head on the scene's own camera.
- `wait` (default true): the player carries the line on (click, tap, E, Space, Enter); `wait: false`
  goes after `dur` seconds (a wick burns down). `hold` (default true): the cutscene proper. In the
  tutor's shape (`say(html, {...})`) `hold` defaults to `wait`: a tip that doesn't wait floats by
  Old Star without stopping you or moving the camera. `key`: the same key again while it's up only
  updates the words. Lines said within 0.4 s of each other stay one cutscene (no zoom out and in).
- Markup: `<b> <i> <small> .gold-txt`, `<em>` (shaky), `<big>` (loud), `<w>wavy</w>`.
- Drivers and tests: `ui.tutor.active` / `ui.tutor.next()` report and carry on a convo line too
  (`active.convo: true`), so the e2e loops `if (t.active?.wait) t.next()` keep working.
- Routed through it already: `openTalkMenu` (when the speaker is here in 3D; `convo: false` keeps the
  board), `questTalk` (offers, hand-ins, choices, tales, reminders), Old Star's `star.say` at home
  (`convo: true`, or `wait: true` while he isn't scripted, or while a talk with him is up; `convo:
  false` keeps the card), E on him, town folk chat, keepers (a word at the window, then the shop),
  burrow keepers and Rocco (`src/deep/traders/talk.js`: their news, then the counter on the tab asked).
- Hooks (one line each, marked `[convo hook]`): `HomeScene.update`, `TownScene.update`,
  `DigScene.update`: `this.game.convo?.director?.apply(camera, dt)` right after the camera is set.
- **For the cinematic tutorial** (answers to your notes above): your call shape `game.convo.say(html,
  { who: 'oldstar', mood, wait, key, dur, rig, head })` works as is (a promise; `wait: true` waits for
  the player and is a held cutscene; a line that doesn't wait floats by Old Star without holding you).
  `game.convo.active` → `{ wait, … }` and `game.convo.next()` are there (and `ui.tutor.active/next()`
  forward to them). The letterbox is `game.convo.bars(on)`. **A bug to fix on your side:**
  `Onboard.js` toggles the class `panel` on `.ob-layer` while a window is open, and the generic `.panel`
  style (styles.css: parchment background, border, shadow) paints the whole screen as paper under
  every panel and every talk; please rename that class (`convo.css` guards it during a talk meanwhile).
  **And the waking (`wake.js`, yours):** the user's "UI blur" complaint is partly the wake: a CSS
  `filter: blur()` on the whole game canvas, plus the `.wake-lids` canvas (`filter: blur(13px)`, a full
  screen layer above the HUD) that is never removed after the wake (it stays, transparent but filtered,
  for the whole visit home). Please drop the CSS blur (pixel art blurred reads as a broken screen; do
  the daze with the lids, the vignette and `post.fade` / `brightness`) and remove the lids canvas when
  the eyes are open (`wakeFx.dispose()`).

**How a talk plays** (`Convo.js`): a talk is a *session* on the window stack (a hold handle `{ kind:
'convo' }` with no backdrop): the scenes stop moving you, menus and keys wait, `#ui.cv-on` steps the
HUD out (the toasts stay), the pointer stays locked (a click anywhere carries on; it comes free only
while answers are up, and is taken back on the pick). Each line is a *beat*: the speaker is found
(`findSpeaker`), the director frames them, they turn to you (`turnTo`), look at your eyes, hold still
(town folk pause, Old Star stops his chores, burrow keepers go `busy`), pull the line's face
(`setExpression` from the mood) and a gesture (nod / wave / shake / hop / cheer by mood, or `gesture`),
and their mouth flaps while the words type (`typeText`, their voice blips from the portrait cast or
the actor's own pitch; a breath at sentence ends). The words: a scrap of parchment with the name on a
ribbon (red for Old Star, green for folk and keepers, blue for you), a sub-title (the quest), the text,
a key cap / "tap" and a bobbing brass arrow when it waits, a wick when it goes by itself; it floats
beside the head on screen (the side with room in front of their face, below it on a phone held
upright, never under the bars or the answers), eased after the camera, a tail pointing at the mouth.
Answers: paper notes with brass number discs floating in on your side of the frame (over your
shoulder), a brass pointer on the one in focus. Your own lines (`who: 'hero'`) cut to a close-up of
you. No 3D model of the speaker in this scene: the label carries their live portrait instead.

**The director** (`src/fx/director.js`): every shot is planned once against the scene's ray test
(the mine's voxels, the home's and town's boxes, skipping Old Star's own box and boxes the ray starts
inside): the camera keeps 12 cm off walls along the line and 24 cm all round (`roomy`), must see the
face (over the shoulder: the line to their eyes must clear your body, a capsule from knee to crown;
the camera comes down for a short speaker), a two-shot must fit both heads in the frame (the lens
widens 44–62°), and nothing is shot from behind them (the shot goes round to the side their face
is turning to). All the shots of one talk stay on one side of the line between you. Then
the pose is recomputed each frame (they breathe and turn): fixed camera, the look smoothed, a slow
push in, the head on a third with room toward where they look. Shot to shot eases 0.75 s; in 0.85 s,
out 0.7 s (cubic). The paws are hidden while the camera is away; your mole (`makeHeroMole`, built at
idle time and reused, pack and hammer off) stands where you stand facing them, looking at their face,
nodding when you answer; it's added to the scene with a `scene.own` detach so it's never disposed
with a scene. FOV is restored when the camera is home.

**Passing lines** (`hold: false`; the tutor shape's default for a line that doesn't wait; Old Star's
`star.say` for any remark that doesn't wait, so his tips in the tutorial too): no bars, no camera
move, nothing held, the HUD stays; the words float by his head with a wick burning down, and when
he's off screen the label carries his live face (top of the screen on touch, low on desktop). A
passing line after a held talk has finished ends that talk and floats on its own. `game.convo.hide
(key)` (and `ui.tutor.hide(key)`, which forwards to it when the card is empty) takes one down. The
talk's clock runs on the wall clock (frames and a 100 ms timer) or the scene's time, whichever is
ahead, so lines time out even when frames starve. The label stays hidden until a line is shown
(`bars(true)` alone shows only the bars). A talk ends through `ui.closePanel(hold)` (its handle off
the window stack, input back), so a scene change mid-talk (`closeAllPanels`) is clean.

**Routing** (small edits, marked): `ui/choices.js` (`openTalkMenu` → `convoTalkMenu` first),
`ui/questTalk.js` (asides as cutscene lines; a reminder then the shop), `home/oldstar.js` (`say`),
`home/workshop.js` (E on Old Star: `convo: true`), `town/quests.js` (`greet(k)`: a word at the window
before the shop, once per 90 s per keeper; Bramble's lift goes straight to the panel), `town/folk.js`
(chat), `deep/Traders.js` (E on a keeper → `burrowTalk`, `openShop(b, tab, extra)`),
`deep/traders/shop.js` (`o.talked`: no second talk act), new `deep/traders/talk.js`, `ui/UI.js`
(makes `ui.convo`, ticks it), `ui/Tutor.js` (`active` / `next()` forward to a convo line).

**The UI blur / blue bug**, root causes and fixes:
- *Blue*: the live 3D portraits (`gfx/portrait3d.js`) were lit with saturated blue fill lights
  (`0x8090ff`, `0x60a0ff`) and cyan rims (`0x60f0e0`, the ticket window `0x90f0e0`), over a teal-glow
  cave backdrop with cyan motes: every face in the dialogue box, the talk boards, the shops and the
  strip had a blue cast, and "You" (the hero's lines) came out blue-grey all over. Fills are now a
  soft near-neutral lavender at lower strength, rims are lamplight, the cave backdrop glows amber.
- *Blur*: those portraits were drawn at the art grid (40–48 px) and blown up 3× with a mode filter
  (smeared blobs: Old Star's star nose a pink smudge). Live portraits now draw one canvas pixel per
  CSS pixel (`--px`: 2–4, so a whole-number scale on every screen, crisp at any DPR), the backdrop
  still on the art grid; stills (toasts, the strip) stay small.
- *Blur*: the tutor's "muffled" card blurred the face and the words (`filter: blur`); now the face is
  dimmed and the words swim, nothing blurred. The waking's CSS blur on the game canvas and its
  leftover blurred full-screen lids layer belong to `wake.js` (see the note above).
- Checked and not at fault: the game canvas (drawn at CSS pixels, shown `image-rendering: pixelated`:
  crisp at dpr 1, 2 and 3; phones with a fractional dpr (2.625…) get uneven but sharp pixels, and the
  Tiny5 text there is antialiased by the browser, which only a UI-wide snap of `--px` to device
  pixels would fix), the post grades and the underwater tint (only with the head under water).

**Test hooks**: `game.convo.debug.settle()` (the camera all the way in, the words typed, entrances
skipped: for screenshots), `game.convo.debug.state()` → `{ active, weight, shot, live, hero, held,
queue }`, `game.convo.director.{ weight, shot, live(), settle(), frame(o), release(), reset(),
toScreen(v) }`, `game.convo.next() / pick(i) / end()`, `game.convo.speaker(who)`.
**Screenshots** (`shots/convo/`): before: `before-portraits` (the blue cast: "You" blue-grey all
over), `before-home-tutor-dpr3` / `before-home-talk-dpr3` / `before-deep-tutor` / `before-deep-rocco`
(phone, dpr 3: smeared faces), `before-wake-blur-desktop` / `-phone` (the waking's canvas blur).
After, 1280×720: `after-portraits` (the cast now), `after-tutor-card`, `after-tutor-muffled`;
`after-oldstar-1-opening` (a scripted `play()`: two-shot), `-2-you` (your line: your close-up),
`-3-answers` (over your shoulder, answers on your side), `-4-tip` (E on him at home);
`after-dig-oldstar` (his talk in the dig); `after-mabel-1/2` (a village quest offer, then her thanks
with the quest toast); `after-grubb-1` (a keeper's offer through his window); `after-hazel-1/2` (a
keeper's word at the window, then the shop); `after-rocco-1/2`, `after-trader-1/2` (burrow talk, then
the counter); `after-folk-1` (a passing chat); `after-fallback` (no model here: the portrait rides in
the label). `tut-ph-home-05-walk` (the phone tutorial's walk step: Old Star's passing line as a
floating label, his face in it while he's off screen). Phones: `phone-*` (390×844 touch, dpr 2; `phone-mabel` at dpr 3, `after-phone3-tutor-*`)
and `land-*` (844×390).

### As built: the forest (wave 4)

The user: "Make the forest scene 100x better." The journey (`src/scenes/FallScene.js`, ~42 s) now
plays in an old forest at golden hour, built by `src/bookends/forest.js` from `src/bookends/forest/*`:

- **Air and light** (`forest/atmos.js`): layered exponential height fog with aerial perspective
  (golden toward the low sun, blue-green away from it, thick in the hollows, thin in the crowns),
  quantized and dithered; every forest material ends in `faApply`. A painted sky (banded gradient,
  drifting clouds lit peach and rose from below, a crisp sun with a halo) whose horizon is the fog's
  own colour. `setAir(k)` blends it all to the dark of the shaft. A golden-hour grade object (warm
  highlights, cool shade), bloom, post god rays toward the sun, ~20 camera-facing light shafts that
  breathe with the canopy (motes drift in them). The canopy-openness map is splatted from the real
  crowns, so the sun dapples fall where the leaves open.
- **Material** (`forestfx.js` `forestToon`): dappled sun, dimmer and greener sky light under the
  canopy, the fog, crown sway (by world height) or plant sway (by each plant's own height), leaf
  shimmer (its cell size is a uniform: one program for every leaf LOD), backlit translucent leaves.
  The stream ribbon had been back-face culled (invisible) since it was made; it is double-sided now.
- **Trees** (`forest/trees.js`): `makeBroadleaf` (oak, beech, maple, birch: a branch skeleton,
  lumpy sun-lit leaf clumps, moss on the shady side) and `kind: 'giant'`: six ancient giants (a gate
  over the trail, one by the stream, three round the clearing) with buttress roots, a hollow at the
  foot, a coat of moss, ivy and shelf fungi; `makeConifer` (spruce, pine), `makeSnag`. Instanced per
  variant and chunked; near trees detailed, the rest of the box low-res, and beyond it ~3,000 pixel-art
  billboards in one draw (`forest/far.js`) out to 100 m over a coarse 1 m ground ring.
- **Floor** (`forest/flora.js`, `forest/grass.js`): voxel ferns, moss cushions, six kinds of
  mushroom (and a fairy ring round the chest), foxgloves, bilberry and holly, mossy boulders, great
  fallen logs, roots arching out by the giants, trail litter (pebbles, twigs, fallen leaves); a 20-cell
  woodland pixel atlas (grass with golden seed heads, bluebell drifts, anemone carpets, campion,
  forget-me-nots, wild strawberries, sorrel, moss, bracken, reeds). Ground voxels 1/7 m (fine steps
  on the trail, terraces off it; phones 1/6 m round the trail only).
- **Animals** (`forest/critters.js`): a squirrel (on a log, bounds to a giant and spirals up it), a
  rabbit (hops off into the ferns), a roe doe in the clearing (grazes, looks up at the glint, bolts at
  the first crack), robins (fly off as he nears), a woodpecker drumming on a giant, a frog on a
  stepping stone (leaps in when the coop splashes); swallows, butterflies (one flutters past Nugget's
  window), dragonflies over the stream, fireflies, pollen, drifting leaves, a flock bursting out.
- **Sound** (`forest/sound.js`, presets `forest_*`): leaves rustling in gusts, a babbling brook, an
  evening chorus (trills, robin, wren, cuckoo, wood pigeon), squirrel chatter, wing flutters, a
  woodpecker's drum, frog croaks, a deer's snort, roots snapping, trees groaning, the lid's creak and
  a magical chord for the gold.
- **Shots** (`T` in FallScene.js): a crane down the trail into the light, tracking from his left,
  Nugget at her window, low front tracking (boots and chicken feet, dust), the stream (bridge, wading,
  the frog), into the clearing (the doe, the chest glinting in its beam), the chest (the lid creaks
  wider, gold light pours out, sparks rise), his face lit gold from below, Nugget's alarm (trees
  shake, birds burst into the sky), cracks racing and roots snapping, the break from above, the fall,
  black. Every shot has portrait framing (`minH`, narrower look offsets).
- **Ground contact**: a blob shadow under him, dust and kicked leaves at every footfall, hollow knocks
  on the bridge, the coop's stomps (dust, leaves) and splashes.
- **Tiers and cost** (`buildForest({ lite, soft })`): full (desktop with 'High' shaders); lite
  (phones, 'Simple'/'Off', `&lite=1`); software (auto when the GL renderer is SwiftShader/llvmpipe:
  thinner, a 32 m draw distance, no outline pass; `&lite=0` forces full). Measured per frame with
  the outline pass: full 1.5–3.9 M triangles, 230–590 draw calls (the opening crane is the heaviest);
  lite 1.0–1.9 M, 150–400. Instanced chunks past 68 m (lite 44, software 32) are hidden; every
  shader is compiled up front (hidden objects and the outline-mask variants too), so nothing compiles
  mid-sequence. On this shared box (load average 25–40 on 4 cores) `update()` measured ~10 ms and the
  build 7–33 s full / 6–14 s lite depending on the load; both should be several times faster on an
  idle machine. A Skip
  pressed while it builds cancels the build.
- **Engine** (additive): `post.outlineFar` (metres; outlines fade out toward it, default 0 = never);
  `engine.gpuName` and `engine.softwareGL` (read once at start-up: asking later stalls until the GPU's
  queue drains, which cost the journey 5 s on SwiftShader).
- **Loading**: the scene draws black until it is built (no stale frame of the title), yields often
  while building and compiles its shaders a few at a time, so the page stays responsive; it frames
  the opening shot before the fade-in.
- **Hooks**: `scene.debug.{ at, time, shot, state, skip }` as before, plus `perf()` (draw calls,
  triangles, update and render ms), `tris()` (visible triangles by part), `cam(pos, look, fov)` (pin
  the camera; `cam()` releases it), `hold(on)` (keep the next frame: screenshots on a software
  renderer). `?scene=fall&at=secs&freeze=1&lite=0|1`.
- Gone: `bookends/landscape.js` and the old pine generator (nothing used them any more).
- Screenshots: `shots/forest/before-desk-*` / `before-phone-*` (the old forest),
  `after-desk-*` (1280×720) and `after-phone-*` (390×844 touch), named by the second they show.

### As built: Old Star's camp, an old house in a cave (wave 4, house part)

The ask: "The house is a really bad cave, small cave with almost nothing." then "I said new house: old
house in a cave, like a camp, super old, bad." The wave-3 house is gone (and so is the bigger house
this part first built in wave 4: garden, terrace, workshop, larder; its prop files are removed,
its screenshots kept in `shots/house/discarded-house/`). Old Star now lives in an old, run-down camp in a natural
cave hollow, smaller than the house was, with every station where the lessons expect it.

**Why someone could still see the old bare cave** (found, and fixed):
- **Old saves kept their own floors.** The wave-3 boards (`flag('boards')`) were laid only on a floor
  nobody had painted; saves from the first iso build (a tile or two painted) or the v2 burrow (explicit
  `floor_dirt` tiles), with stone walls and a level-2/3 room lit for a level-0 one, woke in a big dark
  earth room. Now every save gets the camp (it is built by code, nothing of it is in the save), your
  nook is a corner of the same cave whatever the save holds (`wall_dirt` = the cave's rock, propped by
  grey timbers), a bigger room gets more lights (`shellSurf.js planLights`), and `[camp5]` in
  `HomeScene.enter` turns a floor that is still only the wave-3 auto-boards back to earth, once.
- **The artifact keeps your save across republishes** (`window.claude.hot` hands the last snapshot back),
  so the published page kept loading an old save.
- The house used to build on the main thread with only the transition's black over it.

**The camp** (`src/home/plan.js`: `hollowSD` (the hollow's rough outline, m), `lean`, `ceilAt`,
`walkable`, `ROOMS` = zones `kitchen` / `smithy` / `living` / `hall` (the lessons' soft walls and the
quest texts keep their names), `HOLE_SHAFT`; `src/home/caveShell.js`: the rock as one 1/16 m voxel
volume (the mine's block size) with strata, soot over the forge, damp moss under the drips and round
the spring, roots, dripstones, rubble along the foot of the walls, a packed-earth floor worn pale on
the paths, straw by the shack, the hole up through the roof to a speck of grey daylight; `caveBoxes()`
its collision; `src/home/campProps.js`; `src/home/house.js` places it all):
- **his shack** (middle, against the north rock): warped grey planks, battens, newer boards nailed
  over gaps, a sagging patched tarp roof hanging over the front, a sacking curtain for a door, a
  shutter hanging off one hinge, a lantern on a hook; inside his sagging cot and its darned quilt,
  his old armchair (sit), a crate with the gramophone (wind it), books, candle stubs, cobwebs; his
  notes board on the shack's east wall; outside a drying line of socks, straw, the alarm clock on a
  crate (the camp's clock), a log basket;
- **the kitchen corner** (south-west): the fire pit in its ring of stones with the tripod, the pot and
  the soot-black kettle (**the cooking spot**: "Cook at the range" / "Cook with Old Star"), two logs
  to sit on, a plank table with one wobbly stool and a crate, herbs drying from the roof, crates,
  sacks and a water barrel along the rock (the food crate: a snack once a day), a shelf on pegs;
  **the side nook**: the spring seeping out of a crack into a basin of stones ("Drink from the spring",
  +energy once a day), glowing mushrooms (pick some, once a day), a crystal cluster;
- **the forge corner** (north-west): his old stone forge with its pipe up a crack in the roof
  (**the forge station**), the bellows (pump them), the anvil on its stump, the quench trough and
  bucket, coal, scrap, a grindstone, tools leaning on the rock, horseshoes, a lantern;
- **the east end**: the rusty cage lift in its rock shaft (`lift.js`: brass gone brown and green, iron
  flaking; it still runs), the old door to Deep Town in a tunnel mouth (rubble until `escaped`), his
  chest, the coal cart, the Miners' Board on two posts, the packed suitcase, boots, his slate of the
  million propped on a crate against the rock;
- **the hole you fell through** over the middle, roots round it, a thin shaft of grey light (god rays
  when you're under it), what came down with you on the floor (coins and a gem to pick up);
- light: dim and warm, the fire pit and the forge the brightest, a few lanterns and candle stubs,
  glowing mushrooms in the damp corners; deep shadow up under the rock (baked per vertex);
- life: fires, embers, smoke, the kettle singing, drips from the roof into puddles (rings), the spring,
  spores in the hole's light, dirt trickling down the hole, the alarm clock ticking, the gramophone.
- **your nook** (the save's tile room, up the steps): the same rock walls and roof between grey
  timbers (bought wall styles keep their own look), earth floor, roots, cobwebs, glowing fungi, the
  crystal crack, the hearth where Old Star sits when you wake, the build bench, your trunk.
- Old Star's places (`STAR_SPOTS`): `anvil`, `bellows`, `fire`, `board`, `lift`, `ruins` (his slate),
  `pool` (the spring), `books`, `hearth` (by the fire), `armchair` (sit), `cot` (sleep).
  `questSpot(name)`: `lift`, `passage`, `hole`, `hearth`/`fire`, `forge`/`anvil` as before.

**Building it fast, never half-built** (`src/home/houseLoad.js`, `houseJobs.js`, `houseWorker.js`,
`pack.js`, `loading.js`): four camp jobs (`rock`, `west`, `east`, `ways`) and your nook's walls
(`shell`) run in parallel in inline build workers (`?worker&inline`: works in the single-file build;
`?houseWorkers=N`, `0` = main thread), packed small (16-bit positions in each mesh's box, 8-bit normals,
16-bit colours and indices) and sent back as transferables; the main thread takes jobs too while the
scene waits; a failed job leaves its part bare rather than no camp. Finished jobs are kept for coming
back (dropped on leaving on phones / ≤ 4 GB devices); `prebuildHouse(game)` can start early (**lead**:
call it from the journey or the title, e.g. `import('../home/houseLoad.js').then((m) =>
m.prebuildHouse(game))`). A loading screen (a swinging lantern, a burning wick bar, "Patching the
tarp…") covers it; nothing renders until it's all in (`scene.entered`). The mesher's shaded quads are
merged along their runs (`pack.js mergeQuads`, exact). `src/home/rooms.js` draws the camp and your nook
only when seen (through the arch).

**Numbers** (Node CPU on the shared, heavily loaded test box, `node shots/tmp/house-node.mjs`): the
rock 1.1 s, west 0.9 s, east 0.65 s, ways 0.25 s, your nook's walls 1.1 s: ~4 s of CPU in all, split
over the workers (the wave-4 house was 12 s, the wave-3 house ~6 s on the main thread). ~310 k triangles
(rock 79 k, west 106 k, east 109 k, ways 18 k) plus your nook's walls 89 k; ~20 MB of packed buffers
(the house was ~85 MB). Headless (SwiftShader, 3 workers, load average ~25) the camp is ready ~20 s
after the scene starts (most of it waiting for CPU); drawn per view 0.35–1.3 M triangles including the
outline pass, 30–110 draw calls (desktop), less on a phone.

**Test hooks**: as before (`debug.interact(label)`, `debug.star(spot)`, `stand`, `step`, `run`, `stats`…);
`scene.cave.holeTop`, `scene.cave.buildMs`, `scene.cave.workers`, `scene.buildMarks`, `scene.cull.key`.
Scripts (house part, `shots/tmp/`): `house-view.mjs` (named viewpoints, `--touch`, `--size`),
`house-paths.mjs` (every way in, old saves from each earlier version, `--single`), `house-node.mjs`
(job timings), `house-rock.mjs` (the rock's cost), `house-star.mjs` (Old Star's paths to every spot),
`house-grid.mjs` (his walk grid as text).

**Screenshots** (`shots/house/`): the camp from each viewpoint at 1280×720 (`camp-*`, `forge-corner`,
`fire-pit`, `spring-nook`, `shack-*`, `east-lift`, `door-deeptown`, `hole-up`, `bedroom*`), `phone-*`
390×844, `phoneL-*` 844×390, `star-*` (Old Star at his places); `paths/` (each way in and each old save:
arrive / woke / behind), `paths-single/` (the single-file build from file://); `e2e/` (the full run);
the discarded wave-4 house in `discarded-house/`.

**Also seen** (not mine): the lift panel's map (`src/fps/liftPanel.js`) still draws the old house's rooms.

## Wave 5: grid inventory, voxel scale, lift diorama (the user's ask, and who owns what)

The user's words: "Make the chicken hut more open, have no head, and look old and small. The inventory system:
make it a realistic grid space you need to put and rotate ores in. Remake the house, make it even better, more
ruined and old; add real cloth physics at the door (there is something I think is supposed to be a cloth). Make
the tutorial better, cooler. Make the voxels based on size: I hate that big monsters have a low voxel count and
small things are detailed. All props have collision. Enemies harder to fight, really dangerous. Show an
inventory bar like Minecraft, 5 slots. Make you forge your pickaxe first in the tutorial. The elevator: when
clicked, show a full 3D mini cave scene with fog in locked areas; you need to unlock a checkpoint for the
elevator first; make the mini cave super good, polished and detailed like the minimap. Make the cave more
realistic and cool too."

| Part | Owns |
|---|---|
| **Grid inventory + hotbar** | `src/core/inventory.js` (+ weight.js as needed), `src/ui/Backpack.js`, `invGrid.js`, `invArt.js`, backpack css, the hotbar (`src/ui/Belt.js`, the hotbar in `DigScene.js`: `SLOTS`, `selectSlot`, `updateHotbar` only), coop shelves and the home trunk as grids too |
| **Coop model** | `src/gfx/char/coop.js`, `coopGear.js` (+ the journey's use of it) |
| **Camp + cloth** | `src/home/*` (camp content), `src/scenes/HomeScene.js` structure, a reusable cloth sim `src/gfx/cloth.js`, collision for every camp prop |
| **Tutorial** | `src/home/lessons.js`, `wake.js`, `src/deep/Prologue.js`, `src/forge/tutorial.js`, `src/cooking/lesson.js`, `src/ui/Onboard.js`; forging your first pickaxe (a pickaxe run in `src/forge/*`) |
| **Creatures: voxel scale + danger** | `src/deep/Enemies.js`, `src/deep/enemies/*` (models at one voxel size for all creatures, bigger = more voxels), combat difficulty |
| **Lift diorama + checkpoints** | `src/fps/lifts.js`, `src/fps/liftPanel.js` (replaced by a 3D mini-cave diorama), lift unlocking (checkpoints) in `src/deep/gen/lifts.js` + `ruins/liftKit.js` |
| **Realistic caves + prop collision** | `src/deep/Generator.js` cave shapes/decorate, `TerrainMaterial.js` tweaks, `src/deep/Props.js` + `props/*` (collision for every prop), town props' collision (`src/town/*`) |
| **Lead** | `DigScene.js` (except the hotbar bits), `World.js`, `Terrain.js`, `scripts/e2e.mjs`, integration |

Rules as in wave 4 (no git; build passes; keep debug hooks and the e2e flow working, `E2E_UNTIL`; phones;
performance; screenshots in `shots/<part>/`; an "As built" section here; unique scratchpad file names; don't
edit another part's files except small marked hooks).

### As built (wave 5)

Done by the lead alone, one item at a time (the user asked for no helpers).

- **Intro + coop.** The fall intro can't be skipped and the forest has no wildlife (no birds, butterflies,
  dragonflies, birdsong, hen flights, fireflies). Nugget's coop (`src/gfx/char/coop.js`) is small, grey and
  weathered, open at the front, logs missing, holes in the roof, no rooster head; `COOP_H` 0.62.
- **Hotbar.** Five Minecraft slots (`src/core/hotbar.js`: `HOTBAR_N`, `hotbarOf`, `hotbarSet`), keys 1–5, always
  shown; the backpack has a hotbar row to choose what goes in each slot.
- **Forge your pickaxe first.** A new game starts with no pick (`takeStartPick`). Lesson stage `'pick'` (between
  `'wake'` and `'mine'`, `starData.LESSONS`): after his first talk Old Star takes you to his forge
  (`forge { tutorial, pick }`); `ForgeLesson` in pick mode gives two copper ingots and runs the forge piece
  `pick_first` (`FORGE_PIECES` in `src/data/coopParts.js`, `SHAPES.pick_first` in `partModel.js`; heat, hammer,
  quench with his prompts on each step). The piece goes on your belt and its quality (`data.toolQ`) scales its
  digging power (`DigScene.strike`). Then lesson `'mine'`, act `lesson { step: 'pick_done' }` (new quest step
  "Forge your own pickaxe"), and at home he admires it and walks you to the lift. Skipping hands you one.
- **Grid inventory** (`src/core/inventory.js`). The backpack and the coop are grids (`slots.grid = { cols, rows }`,
  two cells per bag pocket, 6 wide up to 24 cells, then 9). Every stack has a footprint (`footprint()`: heavy ore
  2×2, ore and ingots 2×1, swords 1×3, gems 1×1, beams 3×1; items may set `fp`) at `stack.g = { x, y, r }`.
  Capacity is "does its footprint fit anywhere, either way round" (`roomFor`, `putIn`); `transferAt` /
  `previewAt` / `rotateStack` / `pack` (tidy). Moves that can't be laid out are undone. The UI (`gridBox` in
  `invGrid.js`) draws tiles over cells with a drop shadow (green fits, gold merges, blue swaps, red blocked); R,
  the wheel or the Turn button turns what you hold. The trunk and chests stay slot lists. Stacks: ore 8, ingots 4.
- **Camp.** Real cloth (`src/gfx/cloth.js`: Verlet sheet, pinned top row, draught, cylinder colliders) over the
  shack's doorway and window (`src/home/campCloth.js`); you, Old Star and Nugget push it aside. The shack is more
  broken (gaps, snapped boards, missing roof planks, a torn tarp), and there are heaps of fallen planks, a
  collapsed lean-to and rock fall round the camp (`brokenPlanks`, `leanToRuin`). Every camp prop has a box.
- **Creatures.** Every model is refined at mesh time to about one voxel size (`FINE` in `enemies/vox.js`, at most
  2×): a coarse model's silhouette is resampled and smoothed, thin bits chamfered; `userData.cvox/cpivot/ck` keep
  the coarse voxels for code that picks them by model coordinates (golem shard chips, bestiary icons).
  `DANGER` in `Enemies.js`: 1.7× damage, 1.4× toughness, 1.18× speed while hunting, 0.35 s grace after a hit.
- **Lifts.** The lift panel is a 3D diorama (`src/fps/liftDiorama.js`): explored cells as blocks tinted by
  stratum, glass strata slabs, lifts as cages on light beams, a stop list, orbit/zoom, its own small WebGL
  renderer at half resolution. Mine lifts are checkpoints (`on: false` when found; ring the bell to
  `unlockLift`); only unlocked ones are stops; strata with no unlocked lift are under fog. Old saves' lifts count
  as unlocked.
- **Caves.** Stalactites and stalagmites (`stalactite` / `stalagmite` in `Props.js` + `props/models.js`: banded
  limestone, clay, grey and dark stone, wet tips, drips, rimstone pools) in the upper four zones, a little denser
  decoration; every cave prop is solid (`Props.collide`, called after the player moves).
