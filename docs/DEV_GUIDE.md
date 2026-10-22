# Moleforge developer guide

Moleforge is a browser game built with **Three.js 0.185 + Vite 7**, plain ES modules (no TypeScript).
All art, models and audio are generated in code. There are no asset files.

Run `npm run dev` for development or `npm run build` for production. Screenshot a scene with:

```bash
node scripts/shot.mjs "scene=forge&fresh=1&gold=5000&give=iron_ingot,copper_ingot" shots/forge.png --wait 3000 --size 1280x720 [--steps steps.json]
```

`steps.json` is an array of `{wait}`, `{key, hold}`, `{press}`, `{click:[x,y], hold}`, `{move:[x,y]}`, `{type}`, `{eval}`, `{shot}` actions (see the header of `scripts/shot.mjs`). Headless Chromium runs WebGL through SwiftShader, so it is slow (around 5–15 fps). Judge the visuals, not the frame rate.

URL params understood by `Game.start()`:
`scene=<name>` jumps straight into a scene. `fresh=1` ignores the saved game. `gold=N` sets gold. `zone=N` unlocks lift zones. `give=id1,id2` adds 5 of each item. Every param is also passed to `scene.enter(params)` as strings.

## Look & feel (match this everywhere)

- **Pixel-art voxel world, high detail.** The canvas renders at roughly 540–720 internal lines (1× on phones and small windows, 2× upscaled on 1080p) with nearest-neighbour filtering (`Engine`). That is enough resolution for fine voxel detail, so build models with lots of small, deliberate detail rather than big flat blocks. A post pass adds 1px dark outlines around any mesh on camera layer 1 (`LAYER_OUTLINE`), plus ordered dithering, a vignette and a light grade.
- **Mix voxel 3D with flat 2D pixel art.** Build models with `VoxelGrid`. Characters use 1/32-unit voxels (twice the old 1/16 detail); props use 1/32 for anything the camera sees up close and 1/16 for big background pieces. Mesh hi-res grids with `voxelMesh(grid, {greedy: true})` (or `meshGridGreedy`) so flat-colored regions collapse into a few quads. Keep per-voxel color noise subtle and structured (bands, grain, patches) so it reads as material, not static. Draw flat pixel sprites with `PixelCanvas` / `drawTemplate` and turn them into textures with `pixelTexture(canvas)` (NearestFilter).
- **Characters** come from `gfx/characters.js` (`makeCharacter`, `randomSpec`, `playerSpec`, `makeChicken`, `makePaw`): grown-up townsfolk (the tall build, about 2.8 heads tall, with elbows and knees; babies and kids stay round) with expressive faces (`rig.setExpression`, `talk`, `lookAt`; see `docs/REMAKE.md`).
- **Warm, cozy, dirty underground.** Use reds, browns, moss greens, lantern oranges, glowing blue mushrooms and gold accents. The reference mood is a cozy pixel cabin with wooden beams, vines, a fireplace, dried herbs and a chalkboard.
- **Almost no UI.** The interface is diegetic: the mole's backpack is the inventory, the Index Book is a real book with turning pages, gold is a coin pouch and energy is a little lantern. Nothing sits on screen permanently: those pieces slide in when they change, when they matter (low energy) or when the player reaches for them. Prompts are small glyphs next to the thing you can use.
- **UI is DOM** over the canvas. Use the classes in `src/ui/styles.css` (`.panel`, `.btn`, `.btn.alt`, `.li`, `.grid`, `.slot`, `.tabs/.tab`, `.chip`, `.big-title`, `kbd`, `.muted`, `.gold-txt`, `.detail`, `.row`, `.spacer`). Fonts: `var(--font)` (Tiny5) and `var(--font-display)` (Jersey 10). Size things with `calc(var(--px) * N)`, where `--px` is 2–3 CSS px.
- **No tutorials, no forced dialogue.** Players learn by experimenting. Useful feedback is fine: sounds, float texts, a short toast. Record discoveries with `state.learn('<mechanic id>')` or `state.discover(cat, id)`. The index book pops a card automatically.

## Core APIs

### Game (`src/core/Game.js`), available as `this.game` in scenes
- `game.engine`, `game.input`, `game.audio`, `game.state`, `game.ui`
- `game.goto(name, params?, {transition:'iris'|'fade'|'none', dur, color, center:[u,v]})` switches scene. Scene names: `title fall home deep town forge cooking ending showroom` (`mine` is an alias of `deep` for old links).
- `game.eat(itemId)` eats food (handles energy, buffs, toasts). `game.sleep()` advances the day: restores energy, collects eggs and grows planters.
- `game.showLoading(text)` returns a remover function.

### Scene (`src/core/Scene.js`)
```js
import { Scene } from '../core/Scene.js';
export default class ForgeScene extends Scene {
  async enter(params) { this.hud = 'mini'; this.music = 'forge'; /* build into this.scene, set this.camera */ }
  update(dt) { super.update(dt); /* ... */ }
  // render() defaults to this.game.engine.render(this.scene, this.camera, this.post)
  onResize(w, h) { super.onResize(w, h); }
  exit() { super.exit(); /* own cleanup; super disposes geometries/materials */ }
}
```
- `this.hud`: `'none' | 'town' | 'home' | 'deep' | 'mini'`. Any value except `'none'` shows the gold, energy and book buttons.
- `this.allowMenus`: set it to false to disable the B / I / Esc global panels, for example in a minigame that uses those keys.
- `this.music`: a track name that starts on enter. Tracks: `title town home mine forge cooking beach ascent`.
- `this.post`: overrides for the post pass. Keys: `outline, outlineColor, outlineAlpha, innerThresh` (depth gap for outlines between overlapping outlined objects), `vignette, saturation, contrast, brightness, tint, levels (posterize, 0 = off), dither, grain, fade, fadeColor, flash, flashColor, iris, irisCenter`.
- `this.own(fn)` registers cleanup to run on exit.
- `this.toScreen(vec3)` returns `{x, y, visible}` in page CSS px, for bubbles and float texts.
- The renderer is shared. Don't create a new `WebGLRenderer`. The post pass needs depth, so keep `camera.near` and `camera.far` reasonable (0.1–200).

### Input (`game.input`)
`isDown(...codes)`, `pressed(...codes)` (just pressed this frame), `released(...)`, `axisX()`, `axisY()` (WASD and arrows),
`mouse.{x,y}` (CSS px on canvas), `mouse.{px,py}` (internal pixels), `mouse.{nx,ny}` (NDC), `mouseDown(b)`, `mousePressed(b)`, `mouseReleased(b)`, `mouse.wheel`.
Input is disabled automatically while a UI panel is open.

### Audio (`game.audio`)
- `audio.play(name, opts)` plays a one-shot preset. Presets include: `ui_click ui_open ui_close ui_error ui_buy coins discover page toast levelup step{mat} jump land hit{snd} break{snd} chisel brush debris ore_damage ore_free pristine pickup pickup_gem creak trickle collapse thud explode zap sizzle steam bubble drip bloop freeze ignite glow hurt faint eat gulp squeak chirp click slurp buzz hiss wisp cluck bawk babble{pitch,n} laugh sneeze yawn snore emote{kind} clang{pitch,vol} clunk bellows quench crack sparkle whoosh success fail chop crack_egg stir pour ding perfect good oops plate shake flip door bell gate place remove seagull firework fanfare rumble_hit`.
- `const h = audio.loop(name, {vol})` starts a continuous sound. Control it with `h.set({vol, load, intensity})` and stop it with `h.stop()`. Loops: `drill fire forge_fire rumble xray water lava sizzle boil wind waves elevator grind hum`. Loops still running at a scene switch are stopped automatically.
- Synthesize custom one-shots with `audio.tone({f, f2, type, dur, vol, a, release, filter, ff, q, vib, delay, pan, reverb})` and `audio.noise({color, filter, f, f2, q, dur, vol, a, delay})`.

### State (`game.state`, persistent save)
- Gold: `gold`, `addGold(n, reason)`, `spend(n)` (returns bool), `canAfford(n)`.
- Energy: `energy`, `maxEnergy`, `useEnergy(n)`, `restoreEnergy(n)`. Buffs: `addBuff(id, secs)`, `hasBuff(id)`.
- Items: `addItem(id, {q, p, n})`, `count(id)`, `owns(id)`, `removeItem(id, n, {lowFirst})` (returns the removed lots for quality items, or a count), `lotsOf(id)` (`[{uid,id,q,p}]`), `inventory(filterFn)` (grouped `[{id,n,avgQ?,lots?}]`).
- Weapons: `addWeapon({type, metal, matQ, score, infusion?, gem?, gemQ?})` computes the grade, name and value and records the index entry. Also `removeWeapon(uid)` and `data.weapons`.
- Equipment: `equip(id)`, `equipped(slot)`, `protects('zap'|'heat'|'cold')`, `bagCapacity()`, `lightRadius()`.
- Index: `discover(cat, id)` with cat one of `mineral gem plant critter weapon recipe mechanic`, `learn(mechanicId)` (ids in `data/mechanics.js`), `known(cat, id)`.
- `data.*` fields: `day, recipes{dishId:bestScore}, home{level, wall, floor{"x,y":floorId}, placed[{uid,id,x,y,r}], planters{uid:{id,day,ready}}}, furniture{id:count}` (unplaced), `forgeLevel, zoneMax, chicken{name,eggs,pets,lastPetDay}, flags, stats`.
- Story flags: `flag('fallen')` is set when the opening fall lands in the burrow, `flag('nugget')` with it (Nugget fell too). `state.escaped` (`flag('escaped')`) is false on a new game: the burrow door is caved in until the mole tunnels from a house wall (`goto('deep', {from: 'home', wall, t})`) to the Deep Town gate underground, which sets it and goes to `town` with `{from: 'escape'}`. v1 saves are migrated as already escaped.
- `flag(k, v?)` gets or sets a misc flag. `save()` writes the save (autosave runs every 30 s and on scene switch).
- Events: `state.on('gold'|'energy'|'items'|'discover'|'weapon'|'day'|'buffs'|'load', fn)` returns an unsubscribe function. Pass it to `this.own(...)`.

### UI (`game.ui`)
- `toast(html, {icon, kind:'good'|'warn'|'bad', dur})`, `floatText(text, sx, sy, color, size)`
- `bubble(key, html, sx, sy, {emote, life, name})`, `moveBubble(key, sx, sy, visible)`, `hideBubble(key)` (speech bubbles at screen coords)
- `setPrompt(html | null)` shows a bottom-center prompt, e.g. `'<kbd>E</kbd> Talk'`.
- `setHotbar(slots | null, selectedIndex, onPick)` and `setHints(html | null)` (small key hints at bottom-left)
- `openPanel({title, sub, body: HTMLElement, width, onClose, closable})` returns a handle with `.close()`. Also `closePanel()`, `closeAllPanels()`, `isPanelOpen()`, and `confirm(html, yes, no)`, which returns `Promise<boolean>`.
- `openShop(shopId)` with shopId one of `tools grocer furniture blueprints outfitter assay ticket`, `openInventory()`, `openIndex()`, `openMenu()`
- `ui.world` is a DOM layer for anything anchored to world positions. It is cleared on scene change. Also `ui.root`, `ui.overlay`, `ui.hud`, and the corner clusters `ui.tl` / `ui.tr` plus `ui.bubbles`.
- `setBag(n, cap)` (call on every pickup: the backpack bulges, shows `n/cap`, wiggles FULL; `setBag(null)` clears), `setFocusMode(on, {onBack})` (hides the corner HUD and shrinks the belt to the held tool; on touch, Back calls `onBack`), `setRadar(provider, opts)`, `setCrosshair(o)`, `openSurvey()` (first person, see `docs/DEEP.md`), `setTouchControls(on)` (hide the on-screen controls, e.g. in cutscenes), `pressKey(code, ms)` (simulated key tap).
- The HUD lives in `ui/Hud.js` (coin pouch, lantern, charms, calendar, backpack + book, depth plumb-bob), `ui/Belt.js` (tool belt), `ui/Backpack.js`, `ui/IndexBook.js`, `ui/ShopUI.js`, `ui/Journal.js` (pause menu) and `ui/TouchControls.js`. Pixel chrome is generated in `ui/uiArt.js` (9-slice frames and tiles as `--a-*` CSS custom properties) and `ui/uiSprites.js`; styles are split into `hud.css`, `backpack.css`, `book.css`, `shop.css`, `touch.css` next to `styles.css`. Fonts: Tiny5, Jersey 10/15 and Jacquarda Bastarda 9, used only at sizes where they render crisp.
- Tests: `node scripts/e2e.mjs` (desktop playthrough) and `node scripts/e2e-touch.mjs [outDir] [--portrait]` (phone viewport with real touch events: stick, tap-to-dig, face mode, backpack, book).
- Use the `el(tag, attrs, children)` helper from `core/util.js` to build DOM.

### Data (`src/data/*`)
- `items.js`: `ITEMS[id]` with `name, cat, value, price, q, icon, desc, ...`, plus `sellPrice(id, q, pristine)`.
- `weapons.js`: `METALS` (work/burn/quench temperatures, heat, flow), `SMELTING`, `FORGE_MAX_TEMP[forgeLevel]`, `WEAPON_TYPES` (ingots, mult, balance, profile), `GRADES`, `gradeFor(score)`, `INFUSIONS`, `SOCKET_GEMS`, `weaponValue`, `weaponName`, `BLUEPRINTS`, `ROOM_SIZES`.
- `recipes.js`: `DISHES`, `RECIPES` (ingredient multiset → dish + `steps`), `findRecipe(ings)`, `BUFFS`.
- `furniture.js`: `FURNITURE` (kind, size `[w,d]`, light, onWall), `FLOORS`, `WALLS`.
- `shops.js`: `SHOPS` (keeper character spec, stock, lines), `TOWN_CHATTER`.
- `creatures.js`, `mechanics.js`, `zones.js` (`ZONES[1..6]`).

### Graphics helpers
- `gfx/Voxel.js`: `new VoxelGrid(w,h,d)` with `.set .box .rbox .ellipsoid .cylinderY .paint`; `voxelMesh(grid, {pivot:[x,y,z], scale, kind:'toon'|'lambert'|'basic', shade, outline, greedy})`; `meshGrid` / `meshGridGreedy` (geometry only); `voxelMaterial(kind)`; `setOutline(obj, on)`.
- `gfx/characters.js`: `makeCharacter(spec, {kind, scale, lod, build})` returns a rig with `.root .height .update(dt) .play(state) .face(yaw) .talk(sec | true | false) .setExpression(name, {hold, body}) .setMood(name) .lookAt(vec3 | obj | null) .blink() .doEmote('nod'|'shake'|'hop'|'wave') .holdItem(obj,'R'|'L') .handR .handL .lamp`. Rig states: `idle walk run jump fall climb swim swing hammer dig chisel brush drill wave cheer sit sleep laugh sad carry peck hurt sneeze`. For a swing animation, set `rig.swingPhase` (0..1) yourself. Also `randomSpec(seed, overrides)`, `playerSpec()`, `makeChicken({hat:'straw', scale})` (rig with `.play('idle'|'walk'|'run'|'sit') .peck() .flap()`), `makePaw(side, {scale, fur, sleeve})`, `renderPortrait(renderer, spec, size)`, `FUR`, `SPECIES`.
  - Characters are assembled from cached parts in `gfx/char/` (`spec`, `vox`, `mesher`, `head`, `face`, `body`, `limbs`, `hats`, `rig`, `chicken`, `paw`). Identical parts share geometry (LRU, `CACHE_VERTS` in `char/vox.js`), but every character gets its own meshes so `setTint` and `uniqueMaterial` still work.
  - Each character is **one skinned mesh** (`char/skin.js`): every part has its own bone under the usual rig groups (`hip`, `neck`, arms, legs, `tail`, ears, brows, eyes, mouth, `handR`), so posing code is unchanged, and a cheap one-bone skinning shader draws it. Only the whiskers (kept out of the outline pass) and a miner's glowing lamp lens are separate meshes, so a character costs 2–4 draw calls instead of ~30. Face variants switch with `.visible`, which scales the part's bone to zero. `makeCharacter(spec, {lod: 'crowd'})` or `rig.simplify()` folds everything into a single mesh for crowds (blinking, expressions and emotes still work). Also `rig.meshes`, `rig.skeleton`, `rig.dispose()`; the hen is skinned the same way.
  - `rig.s` is still the old 1/16 unit (code uses it for offsets); `rig.vs` is the real voxel size (1/32). `rig.anchors` gives `eyes`, `mouth`, `nose` and `headTop` in neck space plus `headW`, `headH`, `headD`, for props such as sunglasses. `rig.eyeDrop` is true for the new heads.
  - Face-only emotes: `doEmote('happy' | 'sad' | 'surprise' | 'angry')`; the `talk` state moves the mouth. `rig.eyes` and `rig.mouth` are groups, `rig.tail` is always a group (empty for tailless species).
  - Optional spec fields (random by default): `patches` (0–3), `freckles`, `earring`, `tuft`, `fabric` (`plain`/`stripe`/`dots`/`plaid`), `eyeColor`. `buildStats` reports build timing.
  - `?scene=showroom&mode=…` lines characters up for review: `species ages bodies hats outfits eyes faces states hero hen paw kids portraits`, plus camera parameters and `set=key:val` spec overrides (see the top of `ShowroomScene.js`).
- `gfx/PixelArt.js`: `PixelCanvas`, `drawTemplate`, `ramp(color)`, `iconURL(itemId)`, `weaponIconURL(type, metal, infusion)`, `drawWeapon(pc, type, color)`, `pixelTexture(canvas)`. All icons are **32×32** (`ICON = 32`): show them at 32 or 64 CSS px so pixels stay even. Also `drawIconArt(spec, seed, id)` (no UI halo; emissive pixels flagged on `pc.glow`) and `drawIconSmall(spec, seed, 16)` for tiny spots. The drawing toolkit lives in `gfx/px/` (palettes, volume shading, parts). `gfx/critters32.js` has `drawCritter(id, frame)` and `critterIconURL(id)`.
- `core/util.js`: `clamp lerp damp rand randInt pick chance makeRng hashStr makeNoise2D mixHex shade hexCss formatGold formatGoldFull el wait uid`.

## Conventions
- One default-exported Scene class per file in `src/scenes/`. Put helpers in a sub-folder (for example `src/forge/`).
- Keep each file under about 1500 lines. Split it if it grows larger.
- Never touch files you don't own. If a shared file needs a change, describe it in your final report instead.
- Don't run `git` commands. The lead developer commits.
- Use the shared renderer and the post pass. Keep the frame cheap: avoid hundreds of lights, and prefer emissive materials or baked vertex colors.

## Everything is first person (`docs/FPS.md`)

The burrow, Deep Town, the forge and the mine are walked in first person with `src/fps/FPSKit.js`
(`FPSRig` + `BoxWorld`) or the mine's own controller; the paws are `src/fps/ViewModel.js`; the lift
network is `src/fps/lifts.js`. Scenes are in meters at mole scale (0.86 m tall, eyes at 0.72 m).

- **Burrow** (`HomeScene.js`, `src/home/*`): the room is built in tile units (0.5 m per tile) from the
  iso furniture models (`src/iso/furniture32.js` etc.) inside a group scaled to meters; walls, shell,
  lift, build mode (`src/home/build.js`), landing, Nugget. Placement rules in `src/iso/homeLayout.js`.
- **Deep Town** (`TownScene.js`, `src/town/*`): cave, statics, shops, lift, folk, life, arrival, fx;
  layout in `src/iso/townLayout.js`, floors in `townFloor.js`, shop fronts `shopFront.js`, booth
  `booth.js`. Townsfolk switch to crowd LOD when far; shopkeepers always render in full.
- **Forge** (`ForgeScene.js`, `src/forge/*`): a walkable smithy; the smelting/forging simulations are
  unchanged, the paws work through `vm.drive`.
- Shared iso tools still in use: `kit.js` (modelling kit), `mesher.js` (`fastMesh`), `bake.js`,
  `atlas.js` / `surface.js`, `LightPool.js`, `glow.js`, `pixel.js`, `Actor.js` / `TileMap.js`.

## Title, forge, cooking and ending

- **Flow:** New Game resets the save and plays the opening fall (`goto('fall')`: meadow, sinkhole, shaft, the crash through the burrow roof), which ends at `home` with `{from: 'fall'}`. Continue does the same until `flag('fallen')` is set, then resumes the last scene or home (a save left underground resumes at home).
- **Dioramas** (`src/bookends/`): `vox.js` has `meshVoxGreedy` and `meshRelief(o)`, a heightfield mesher for big terrain (columns of voxels along any axis: beach sand, shaft and cave walls) with greedy caps, merged wall runs, row chunking and baked AO. `batch.js` `batchStatic(root)` merges static props per material/outline layer/render order, because every outlined mesh is drawn twice. `logo.js` draws the pixel MOLEFORGE letters for the title and credits.
- **Ending:** the shaft walls (~600k triangles) build in small time slices (about 2 ms per frame) while the farewell plays, and a zone is only built in one go if the ride reaches it first. The farewell crowd is built with `{lod: 'crowd'}` (one mesh per townsfolk). Sunglasses are sized from `rig.anchors.headW`.
- **Forge and cooking** keep their game logic; icons show at `var(--icon)` / `var(--icon-s)` (64/32 px, 32/32 on small screens).

## The underground (`src/deep/`, scene `deep`)

First person in a seeded 3D voxel world. `docs/DEEP.md` is the contract (coordinates, save data,
the view model, HUD, and the optional enemies/fluids/props modules).

- `materials.js`: voxel materials (`M`, `MAT[]`, 1/16 m voxels: `VOX = 16`, `VK = VOX / 8`), ore materials at `ORE_BASE + ORES index` (ore data in `data/ores.js`), palette texture for the shader, styles (rock plates, soil, crystal, wood, brick, moss, ore, grain).
- `Generator.js`: `makePlan(seed)` (the burrow box, Deep Town and its gate, the lift shaft and stations, a guide path with plugs, ore areas with deposits, danger zones, lights) and `ChunkGen` (32³ chunks from coarse noise: cave ways, crawlways, pillared caverns, ravines (`caveDensity`), zone strata, biomes (`biomeAt`), features, decoration; `isSolid` spots rock-only chunks). `mouthBox/addMouth` cut the tunnel mouths behind the house walls (with a planked door).
- `World.js` (`DeepWorld`): lazy chunks (virtual while solid rock, pending while a worker builds them: `request/arrive`), `voxelAt/matAt/solidAt/setVoxel/raycast`, deposits, `onChange`, edits saved run-length encoded under `moleforge.world.v1`. `Mesher.js`: greedy meshing with per-vertex AO (solid + fluid). `Terrain.js`: builds meshes within a frame budget (in workers via `ChunkPool.js` + `genWorker.js` when available), culls by distance. `TerrainMaterial.js`: the pixel-art terrain shader (`128 / VOX` texels per voxel face, Voronoi rock plates with one-texel cracks), the shared lighting (`lightAt`: helmet lamp + 8 point lights + fog), fluid and object materials.
- `Player.js` (`FPSPlayer`): AABB vs voxels, step-up, climbing (hold jump against a wall), crouching, swimming and diving, fall damage. `Dig.js`: pick blows bite round craters of small voxels (hard rock cracks first); chisel, drill. `Ores.js`: exposure, quality chips, pop-out (pristine when chiselled or brushed free). `Bodies.js`: tumbling voxel debris and pickups. `Particles.js`: pixel-square particles.
- `DigScene.js` (re-exported by `scenes/DeepScene.js`): tools, targeting and crosshair, x-ray ghosts, progress (doors home, the town gate, lift stations, zones), radar provider, faint. `Nugget.js`: the hen companion. Optional modules: `Enemies.js` (+ `enemies/`), `Fluids.js`, `Props.js` (+ `props/`).
- Testing headless: frames are slow in SwiftShader, so drive the simulation in an eval (`for (let k = 0; k < 30; k++) __game.scene.update(1 / 30)`), teleport with `player.pos.set(...)` + `terrain.warm(x, y, z, 2)`. See the deep steps in `scripts/e2e.mjs`.
