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
- Story flags: `state.escaped` (`flag('escaped')`) is false on a new game. The mole starts trapped in collapsed tunnels (`game.goto('mine', {intro: '1'})`) and must dig out; town, home and the lift unlock when they reach Deep Town (`game.goto('town', {from: 'escape'})`). `flag('nugget')` is set once Nugget the hen has been found on the way out. v1 saves are migrated as already escaped.
- `flag(k, v?)` gets or sets a misc flag. `save()` writes the save (autosave runs every 30 s and on scene switch).
- Events: `state.on('gold'|'energy'|'items'|'discover'|'weapon'|'day'|'buffs'|'load', fn)` returns an unsubscribe function. Pass it to `this.own(...)`.

### UI (`game.ui`)
- `toast(html, {icon, kind:'good'|'warn'|'bad', dur})`, `floatText(text, sx, sy, color, size)`
- `bubble(key, html, sx, sy, {emote, life, name})`, `moveBubble(key, sx, sy, visible)`, `hideBubble(key)` (speech bubbles at screen coords)
- `setPrompt(html | null)` shows a bottom-center prompt, e.g. `'<kbd>E</kbd> Talk'`.
- `setHotbar(slots | null, selectedIndex, onPick)` and `setHints(html | null)` (small key hints at bottom-left)
- `openPanel({title, sub, body: HTMLElement, width, onClose, closable})` returns a handle with `.close()`. Also `closePanel()`, `closeAllPanels()`, `isPanelOpen()`, and `confirm(html, yes, no)`, which returns `Promise<boolean>`.
- `openShop(shopId)` with shopId one of `tools grocer furniture blueprints outfitter assay ticket`, `openInventory()`, `openIndex()`, `openMenu()`
- `ui.world` is a DOM layer for anything anchored to world positions. It is cleared on scene change.
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
- `gfx/PixelArt.js`: `PixelCanvas`, `drawTemplate`, `ramp(color)`, `iconURL(itemId)`, `weaponIconURL(type, metal, infusion)`, `drawWeapon(pc, type, color)`, `pixelTexture(canvas)`.
- `core/util.js`: `clamp lerp damp rand randInt pick chance makeRng hashStr makeNoise2D mixHex shade hexCss formatGold formatGoldFull el wait uid`.

## Conventions
- One default-exported Scene class per file in `src/scenes/`. Put helpers in a sub-folder (for example `src/forge/`).
- Keep each file under about 1500 lines. Split it if it grows larger.
- Never touch files you don't own. If a shared file needs a change, describe it in your final report instead.
- Don't run `git` commands. The lead developer commits.
- Use the shared renderer and the post pass. Keep the frame cheap: avoid hundreds of lights, and prefer emissive materials or baked vertex colors.

## The mine (`src/mine/`, `src/scenes/MineScene.js`)

- `blocks.js` defines block materials (`BLOCKS`, `B`) and embedded ores (`ORES`, `ORE_SPAWN`): hardness, pick tier, sound family, physics, span and tags such as `explosive`, `float` and `tarnish`.
- `MineWorld.js` holds the grid storage (typed arrays): block, back wall, hp, ore, ore quality, flags (`F.REVEALED/STABLE/MINED/BEAM/STAKE/WEB/ELECTRIC/SEEN`), fluids, fire and stress. Grid y grows downward; three.js y is `-gridY`.
- `MineGen.js` generates a zone: layered noise materials, worm tunnels and caverns, geodes, ore veins, sealed water and lava pockets (pre-settled), lift stations every 12 rows, plants and creatures.
- `Lighting.js` is a per-cell RGB light grid with Bresenham ray occlusion, uploaded as a linear-filtered `DataTexture`. Every mine shader samples it, so lighting is smooth, colored and shadowed.
- `Render.js` holds the chunked voxel meshes (16×16 cells) with back-wall AO, ore overlays, crack overlays and the selection box. It also holds the sprite batch (plants, creatures, items), pixel point particles, instanced debris and falling-block cubes, and the fluid mesh. Texture alpha in [0.55, 0.97) encodes emissive glow.
- `Physics.js` covers flying debris, falling blocks, and `Stability`: ceiling span checks (arch bonus for low tunnels), island detection, loose ground and quakes.
- `Fluids.js` is the water and lava automaton (lava + water → obsidian or steam).
- `Entities.js` covers pickups (gravium floats, starmetal magnetism, hazards), plants (whisperweed points at hidden ore, sparkmoss zaps) and creature AI.
- `Player.js` covers AABB physics in grid space (climbing, swimming, lava, ice, webs) and the voxel character with held tool models.
- `MineScene.js` handles tools (pick swing timing, chisel, brush, drill heat, X-ray cone), ore damage and vibration, explosions, fire, ore behaviors, discovery scans, the lift bells, fainting and the HUD.
