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
- **Chibi characters** come from `gfx/characters.js` (`makeCharacter`, `randomSpec`, `playerSpec`, `makeChicken`, `makePaw`).
- **Warm, cozy, dirty underground.** Use reds, browns, moss greens, lantern oranges, glowing blue mushrooms and gold accents. The reference mood is a cozy pixel cabin with wooden beams, vines, a fireplace, dried herbs and a chalkboard.
- **Almost no UI.** The interface is diegetic: the mole's backpack is the inventory, the Index Book is a real book with turning pages, gold is a coin pouch and energy is a little lantern. Nothing sits on screen permanently: those pieces slide in when they change, when they matter (low energy) or when the player reaches for them. Prompts are small glyphs next to the thing you can use.
- **UI is DOM** over the canvas. Use the classes in `src/ui/styles.css` (`.panel`, `.btn`, `.btn.alt`, `.li`, `.grid`, `.slot`, `.tabs/.tab`, `.chip`, `.big-title`, `kbd`, `.muted`, `.gold-txt`, `.detail`, `.row`, `.spacer`). Fonts: `var(--font)` (Tiny5) and `var(--font-display)` (Jersey 10). Size things with `calc(var(--px) * N)`, where `--px` is 2–3 CSS px.
- **No tutorials, no forced dialogue.** Players learn by experimenting. Useful feedback is fine: sounds, float texts, a short toast. Record discoveries with `state.learn('<mechanic id>')` or `state.discover(cat, id)`. The index book pops a card automatically.

## Core APIs

### Game (`src/core/Game.js`), available as `this.game` in scenes
- `game.engine`, `game.input`, `game.audio`, `game.state`, `game.ui`
- `game.goto(name, params?, {transition:'iris'|'fade'|'none', dur, color, center:[u,v]})` switches scene. Scene names: `title town home mine forge cooking ending`.
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
- `this.hud`: `'none' | 'town' | 'home' | 'mine' | 'mini'`. Any value except `'none'` shows the gold, energy and book buttons.
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
- Story flags: `state.escaped` (`flag('escaped')`) is false on a new game. The mole starts trapped in collapsed tunnels (`game.goto('mine', {intro: '1'})`) and must dig out; town, home and the lift unlock when they reach Deep Town (`game.goto('town', {from: 'escape'})`). `flag('nugget')` is set when the mole breaks out with Nugget the hen; if the player never went to her, she comes flapping out of the dark at the last moment, so she always ends up at home. v1 saves are migrated as already escaped.
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
- `setBag(n, cap)` (call on every pickup: the backpack bulges, shows `n/cap`, wiggles FULL; `setBag(null)` clears), `setFocusMode(on, {onBack})` (mine face close-up: hides the corner HUD and shrinks the belt to the held tool; on touch, Back calls `onBack`), `setTouchControls(on)` (hide the on-screen controls, e.g. in cutscenes), `pressKey(code, ms)` (simulated key tap).
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
- `gfx/characters.js`: `makeCharacter(spec, {kind, scale})` returns a rig with `.root .height .update(dt) .play(state) .face(yaw) .talk(sec) .doEmote('nod'|'shake'|'hop'|'wave') .holdItem(obj,'R'|'L') .handR .handL .lamp`. Rig states: `idle walk run jump fall climb swim swing hammer dig chisel brush drill wave cheer sit sleep laugh sad carry peck hurt sneeze`. For a swing animation, set `rig.swingPhase` (0..1) yourself. Also `randomSpec(seed, overrides)`, `playerSpec()`, `makeChicken({hat:'straw', scale})` (rig with `.play('idle'|'walk'|'run'|'sit') .peck() .flap()`), `makePaw(side, {scale, fur, sleeve})`, `renderPortrait(renderer, spec, size)`, `FUR`, `SPECIES`.
  - Characters are assembled from cached parts in `gfx/char/` (`spec`, `vox`, `mesher`, `head`, `face`, `body`, `limbs`, `hats`, `rig`, `chicken`, `paw`). Identical parts share geometry (LRU, `CACHE_VERTS` in `char/vox.js`), but every character gets its own meshes so `setTint` and `uniqueMaterial` still work.
  - `rig.s` is still the old 1/16 unit (code uses it for offsets); `rig.vs` is the real voxel size (1/32). `rig.anchors` gives `eyes`, `mouth`, `nose` and `headTop` in neck space plus `headW`, `headH`, `headD`, for props such as sunglasses. `rig.eyeDrop` is true for the new heads.
  - Face-only emotes: `doEmote('happy' | 'sad' | 'surprise' | 'angry')`; the `talk` state moves the mouth. `rig.eyes` and `rig.mouth` are groups, `rig.tail` is always a group (empty for tailless species).
  - Optional spec fields (random by default): `patches` (0–3), `freckles`, `earring`, `tuft`, `fabric` (`plain`/`stripe`/`dots`/`plaid`), `eyeColor`. `buildStats` reports build timing.
  - `?scene=showroom&mode=…` lines characters up for review: `species ages bodies hats outfits eyes faces states hero hen paw kids portraits`, plus camera parameters and `set=key:val` spec overrides (see the top of `ShowroomScene.js`).
- `gfx/PixelArt.js`: `PixelCanvas`, `drawTemplate`, `ramp(color)`, `iconURL(itemId)`, `weaponIconURL(type, metal, infusion)`, `drawWeapon(pc, type, color)`, `pixelTexture(canvas)`. All icons are **32×32** (`ICON = 32`): show them at 32 or 64 CSS px so pixels stay even. Also `drawIconArt(spec, seed, id)` (no UI halo; emissive pixels flagged on `pc.glow`) and `drawIconSmall(spec, seed, 16)` for tiny spots. The drawing toolkit lives in `gfx/px/` (palettes, volume shading, parts). `gfx/critters32.js` has `drawCritter(id, frame)` and `critterIconURL(id)`. `mine/MineSprites.js` builds the mine's 32px sprite atlas (`buildSpriteAtlas32`) and the in-rock ore art (`oreBlob(itemId, seed)` → `{w, h, pal, idx, glow, stain}`).
- `core/util.js`: `clamp lerp damp rand randInt pick chance makeRng hashStr makeNoise2D mixHex shade hexCss formatGold formatGoldFull el wait uid`.

## Conventions
- One default-exported Scene class per file in `src/scenes/`. Put helpers in a sub-folder (for example `src/forge/`).
- Keep each file under about 1500 lines. Split it if it grows larger.
- Never touch files you don't own. If a shared file needs a change, describe it in your final report instead.
- Don't run `git` commands. The lead developer commits.
- Use the shared renderer and the post pass. Keep the frame cheap: avoid hundreds of lights, and prefer emissive materials or baked vertex colors.

## Town and home (`src/iso/`, `TownScene.js`, `HomeScene.js`)

- Built at 1/32 voxels where the camera looks closely (shop fronts, the Surface Express booth, the burrow entrance, all 40 furniture pieces in `furniture32.js`) and at 1/16 or coarser for background decor (`kit.js` `lowRes()`).
- `kit.js` is the modelling kit: structured material fills (wood grain, riveted iron, stone, cloth, straw, moss) and `sp3` sparse speckle, so plain runs still merge. `mesher.js` (`fastMesh`, `meshDefaults({ao})`) is a fast greedy mesher that can skip faces the fixed iso camera never sees. `bake.js` merges statics, and `atlas.js` / `surface.js` / `townFloor.js` / `homeFloor.js` paint the floors at 32 texels per tile.
- Town pieces: `townCave.js` (strata walls, ledges, stalactites, waterfall in `waterfall.js`), `shopFront.js`, `booth.js`, `props.js` / `props2.js`, `tunnel.js`, `townLife.js` (vendors, fireflies, spores, smoke) and `townArrival.js` (the escape arrival: boards burst, the mole tumbles out, townsfolk react, Nugget trots to the new home). Scenes log `[town] built in … ms` with a step breakdown.
- Budget: the town environment is about 400k triangles. Cave walls and rims skip the outline pass. Nugget, the coop and eggs only appear once `flag('nugget')` is set.

## Title, forge, cooking and ending

- **Flow:** New Game resets the save and starts the escape opening (`goto('mine', {intro: '1'})`). Continue does the same until `state.escaped` is set, then resumes the last scene or home.
- **Dioramas** (`src/bookends/`): `vox.js` has `meshVoxGreedy` and `meshRelief(o)`, a heightfield mesher for big terrain (columns of voxels along any axis: beach sand, shaft and cave walls) with greedy caps, merged wall runs, row chunking and baked AO. `batch.js` `batchStatic(root)` merges static props per material/outline layer/render order, because every outlined mesh is drawn twice. `logo.js` draws the pixel MOLEFORGE letters for the title and credits.
- **Ending:** the shaft walls (~600k triangles) build in small time slices (about 2 ms per frame) while the farewell plays, and a zone is only built in one go if the ride reaches it first. The farewell crowd uses `simplifyRig()` (landing.js) to merge each townsfolk rig into a few meshes. Sunglasses are sized from `rig.anchors.headW`.
- **Forge and cooking** keep their game logic; icons show at `var(--icon)` / `var(--icon-s)` (64/32 px, 32/32 on small screens).

## The mine (`src/mine/`, `src/scenes/MineScene.js`)

The mine is a side-view cross-section made of **pixels of rock**: every grid cell is `M = 32` × 32 pixels (`micro.js`). Cells still exist as a coarse summary (a cell is solid while at least half its pixels are) for lighting, fluids, creatures and cave-in logic.

- `micro.js`: pixel material table `MAT[0..255]` (rock materials use the `B` ids from `blocks.js`; ore pixels are `ORE_BASE + ORES index`), 16-color palettes per material, the detail byte layout (`D_SHADE` low 4 bits, `D_CRUST`, `D_CRACK`, `D_GROWTH`, `D_SCORCH`), fast hashing/tileable noise (`ih`, `tn`), the procedural rock textures (`texel`: rock is drawn as shaded plates whose seams are the fracture pieces; soils are clumpy with shaded pebbles and roots) and `pieceId` (the Voronoi fracture piece a pixel belongs to).
- `MineWorld.js`: cell arrays plus pixel arrays `pm` (material, 0 = air, 255 = not generated yet), `pd` (detail), `pb` (original material for the back wall), `cover` (solid pixels per cell). Pixel API: `pmat/psolid/solidPt/matPt`, `clearPx/fillPx/movePx` (keep cell cover and render dirtiness in sync), `ensureCells`, ore `deposits` with `depositAt/depositsNear`.
- `MineGen.js` builds a cheap **plan** per zone (cell materials, smooth cave/warp noise sampled every 8 px, features: geodes, fluid pockets, stalactites, roots, crystals, stations, deposits) and `MicroGen.js` (`ChunkGen`) turns a 256×256-pixel chunk of that plan into pixels the first time something needs it (`pump` generates just ahead of the camera). `oreBlob` in `MineSprites.js` draws each ore's in-rock pixel pattern. A `fill` feature's `det(x, y, m)` may return -1 to use the material's own texture.
- `Terrain.js` renders each chunk as one mesh with three draw groups: the textured front face (bevel/emboss lighting, crust, moss, cracks), extruded 3D side walls along every pixel edge between rock and air, and the recessed back wall (the rock that used to be there, contact shadows, twinkles).
- `Dig.js` (`Digger`): `strike` (pickaxe: damages fracture pieces in a radius, cracks them, pops broken pieces out whole), `chisel` (chips a few pixels), `brush` (cleans crust, sweeps loose soil), `drill`, `blast`, plus deposit helpers `chipOre/exposure/extract`.
- `Tools.js`: targeting (first solid pixel along the paw→pointer ray), tool effects, ore deposits (reveal as you uncover them, chip on hits, loosen with brush/chisel, pop out as pickups once ~3/4 of their rim is free, pristine if brushed free), vibration, explosions, island detection (rock cut loose falls as one chunk and smashes into a rubble mound) and cell cave-ins.
- `Bodies.js`: broken pieces become little voxel models built from the exact pixels and tumble physically. `Sand.js`: falling-sand simulation for loose materials (sand, gravel, ash, snow, rubble), only in disturbed cells.
- `FaceMode.js`: push into a wall (or rest against it) and the camera drops into a flat first-person close-up with pixel-art paws holding the tool; strikes land where you aim and chunks fly at the screen. Step away, jump or get hurt to leave.
- `Intro.js`: the opening level (collapsed tunnels below Deep Town, Nugget the hen, the boarded exit) and its `IntroController`. New games start with `game.goto('mine', {intro: '1'})`; breaking the boards sets `flag('escaped')` and goes to `town` with `{from: 'escape'}`.
- `Lighting.js` (per-cell light grid), `Fluids.js` (cell water/lava), `Physics.js` (tiny chips + ceiling-span cave-ins), `Entities.js` (pickups, plants anchored to the real pixel surface, creatures), `Player.js` (pixel collision with step-up and slope snapping), `FX.js`, `Render.js` (sprites, particles, chips, target reticle, fluids) work on top of that. Fluids are simulated per cell, so `Render.updateFluids` smooths the water line across neighbouring cells, cuts it pixel-exact in the shader, and lets the water reach 12 px into solid neighbours so it fills their ragged edge pixels (the rock in front hides the rest).
