# First-person mining: shared contract

Mining is now full first person in a 3D voxel underground (scene `deep`). The house and town stay
3D isometric. This file is the contract between the parts; keep it up to date when an API changes.

## The story flow

1. **New Game** (TitleScene): `state.reset()`, then `game.goto('fall')`.
2. **`fall`** (FallScene): the mole and Nugget fall from the surface down a long shaft and crash
   through the ceiling of an old abandoned burrow. Ends with `game.goto('home', { from: 'fall' })`.
3. **`home`, from `fall`**: the landing (hole in the ceiling stays). Sets `flag('fallen', true)` and
   `flag('nugget', true)`. The door to Deep Town is caved in until `flag('escaped')`.
4. Walk up to any wall of the burrow and press E / tap: `game.goto('deep', { from: 'home', wall, t })`.
5. **`deep`**: first-person digging. The radar shows where the town is. Breaking into the town's
   gate cavern sets `flag('escaped', true)` and goes `game.goto('town', { from: 'escape' })`.
6. Walking back into the burrow through a tunnel mouth: `game.goto('home', { from: 'tunnel', wall, t })`.
7. Town lift: `game.goto('deep', { from: 'town', station })`; ringing a station bell in `deep`:
   `game.goto('town', { from: 'mine' })`.

## Coordinates (meters)

- x east, y up, z south (three.js). 1 iso tile = 1 m.
- The burrow is the box x ∈ [0, W], z ∈ [0, D], y ∈ [0, 3] with `[W, D] = roomSize(level)`
  (`src/iso/homeLayout.js`). Floor at y = 0. The fall shaft comes down through the ceiling.
- Walls: `n` is z = 0, `s` is z = D, `w` is x = 0, `e` is x = W. `t` = position along the wall in
  tiles (x for n/s, z for e/w), measured from the low end.
- Depth = -y. Zones by depth: Rootsoil 0–25 m, Clayworks 25–55, Crystal Grotto 55–90, Magma Deep
  90–130, Frost Vault 130–170, The Core 170–210.

## Save data (`state.data.deep`, owned by the deep scene)

- `tunnels: [{ wall, t }]`: tunnel mouths dug from the burrow walls (home draws them as openings).
- `stations: [n]`: lift stations found (town lift stops).
- Dug voxels are stored separately (`moleforge.world.v1` in localStorage).

## Engine and input

- `engine.render(scene, camera, { ...post, overlay: { scene, camera } })` draws a first-person layer
  (hands and tools) on top with its own outlines; it never clips into walls.
- `input.lockPointer()`, `input.unlockPointer()`, `input.pointerLocked`, `input.takeLook()` →
  `{dx, dy}` in CSS px (pointer-lock mouse movement plus touch look-drags written to `input.look`).

## First-person view model (`src/fps/ViewModel.js`)

```js
const vm = new ViewModel();              // owns vm.scene and vm.camera (own THREE.Scene + PerspectiveCamera)
vm.resize(aspect);
vm.setTool(kind, { item });              // 'pick' | 'chisel' | 'brush' | 'drill' | 'xray' | 'stake' | 'beam' | 'food' | 'none'
vm.update(dt, { speed, grounded, climbing, swimming, look: { dx, dy }, lamp: { color, intensity }, ambient });
vm.swing(kind, dur);                     // wind-up; the strike lands after `dur` seconds
vm.impact(kind, strength);               // contact recoil and shake (the game spawns particles)
vm.use(kind, on);                        // continuous use: brush / drill / x-ray
vm.eat(itemId); vm.hurt(); vm.dispose();
```

Also: `vm.world` (a group the scene adds to its world scene once: the x-ray beam haze, which the
overlay pass can't blend; pass `camera` to `update()` so it lines up), `update()` options `camera`
and `heat` (0–1 drill glow), `vm.tipView(out)` (tool tip in view space), `vm.shake`, `vm.heat`,
`vm.busy`; `TOOL_KINDS` and `VMV` (voxel size) are exported. Showroom: `?scene=showroom&mode=fps`.

## HUD (`hud = 'deep'`)

- `ui.setRadar(provider | null, { heading: () => yaw })`: `provider(o)` returns
  `{ x, y, z, heading, range, explored: { size, cell, data, ox, oz }, markers: [{ kind, x, y, z, label, color, r }] }`.
  `heading` is the camera yaw: forward = (-sin h, 0, -cos h) (the optional `opts.heading` is read
  every frame for smooth turning). `explored` is a size×size grid, row-major `data[iz * size + ix]`,
  cell [0,0] at world (`ox`, `oz`): 0 unknown, 1 open, 2 water, 3 lava, 4 known rock. The survey map
  calls `provider({ survey: true, y })` for a bigger grid on another layer.
  Marker kinds: `home`, `town`, `ore`, `danger` (`r` = radius m), `enemy`, `station`, `stake`.
- `ui.openSurvey()` (also M or a tap on the radar): the full map; its "Head home" calls `game.scene.headHome()`.
- `ui.setCrosshair({ visible, kind, label, progress } | null)`: kind `none` | `rock` | `ore` | `enemy` | `use`.
- The scene clears both on exit: `ui.setRadar(null)`, `ui.setCrosshair(null)`.
- Touch in `deep`: stick (move, up = forward), drag on the right half to look (adds to
  `input.look`), buttons dig (holds mouse button 0), jump (Space), use (E), snack (Q), next tool (wheel).

## Optional systems: enemies and fluids

`src/deep/DigScene.js` (registered as scene `dig` while in development; it becomes `deep`) loads
`src/deep/Enemies.js` and `src/deep/Fluids.js` if they exist, and runs fine without them. Both
classes are constructed with one context object:

```js
ctx = { scene3, world, U, fx, bodies, audio, state, ui, player, plan, owner }
// scene3: THREE.Scene of the cave · world: DeepWorld (voxels, raycast, plan) · U: terrain uniforms
// fx: Particles (spawn/dust/chips/sparks/glints/ember/mote/firefly/splash) · bodies: Bodies (voxel debris)
// audio.play(name, opts) · state: game State · ui: game UI (toast, floatText) · player: FPSPlayer
// plan: world.plan (town, stations, areas, dangers [{kind:'water'|'lava'|'nest'|'gas', x,y,z,r,zone}], lights)
// owner: the DigScene (read-only use: owner.time, owner.toScreen(v3))
```

Units are meters; one voxel is 1/16 m (`VOX = 16`; `VK = VOX / 8` scales anything authored for the
old 1/8 m grid), y is up, depth = −y. Use `world.solidAt(x,y,z)` (meters),
`world.voxelAt(vx,vy,vz)` (voxels; unloaded, virtual or pending = stone), `world.raycast(...)` and
`world.setVoxel(vx,vy,vz,m)`. Chunks are 32³ voxels (2 m). A chunk that is rock all through is
**virtual** (`ch.virtual`, `ch.vox === null`) until something digs into it; a chunk still being
generated in a worker is **pending** (`ch.pending`, also `vox === null`). Code that walks
`world.chunks` must skip chunks without `vox`. Meshes that should get the pixel outline enable `LAYER_OUTLINE`;
lighting should come from `makeObjectMaterial(U, {emissive})` (terrain lights, the mole's lamp, fog).

**Enemies** (`new Enemies(ctx)`):
- `update(dt, { player, eye, forward, time, busy, lamp, blocking, blockT })` → array of events:
  `{ damage: n, kind, push: [x,y,z], blocked?, parried? }` (energy lost + knockback; a blocked blow is
  already reduced, a parried one is 0), `{ energy: n }` (the cost of holding / taking blows on the
  guard), `{ say: html, key, tone, cd }` (a toast), `{ loot: { id, q, p } }` (an item for the
  backpack — same path as ore pickups), `{ shake: k }` and `{ hitStop: s }` (optional feel).
  `blockT` = seconds since the guard went up (a perfect block is the first ~0.2 s).
- `hitTest(eye, dir, reach)` → an enemy (or a spider web) the pick would hit before `reach`, or null.
- `damage(enemy, power, dir)`: a pick blow (combos, crits after a parry, poise and stagger,
  knockback, hit-stop) → `{ hitStop, shake, kick, tag, combo }` for the scene to apply.
- `noise(x, y, z, r, kind)`: something loud happened there (digging, a fall): sleepers may wake,
  hunters come and look. `blast()` calls it itself. `threat()` → `{ kind, dist }` of the nearest
  hostile after the mole (or null).
- `debug`: test hooks (`src/deep/enemies/debug.js`: spawn, list, stage, portrait, sheet, block, …).
- `radarMarkers(pos)` → `[{ kind: 'enemy', x, y, z, label, color }]` for nearby awake enemies.
- `lights(eye)` → `[{ x, y, z, c: [r,g,b], r }]` glowing enemies (≤ 3).
- `dispose()`.

**Fluids** (`new Fluids(ctx)`):
- `onVoxel(vx, vy, vz, old, m)`: called on every voxel edit (digging next to a lake starts a flow).
- `update(dt, { player, eye, time })`: flow simulation, splashes, ripples.
- `lights(eye)` → as above (lava glow), `dispose()`.
- The fluid surface material is `makeFluidMaterial(U)` in `TerrainMaterial.js`; the mesher emits
  fluid faces into a separate geometry (`meshChunk(...).fluid`).

**Props** (`new Props(ctx)`, `src/deep/Props.js`): decoration placed in the caves near the player
(mushrooms, crystal clusters, roots, old mining gear, signposts).
- `update(dt, { player, eye, time })`, `onVoxel(vx, vy, vz, old, m)` (optional: a prop whose
  support was dug away should fall or go), `lights(eye)` (as above), `dispose()`.

**Vegetation** (`new Vegetation(ctx)`, `src/deep/Vegetation.js` + `veg/`): painted 2D plants on
alpha-tested cards in one instanced mesh (grass, ferns, fungus, flowers, roots, vines, … by zone,
biome and material), swaying, pushed aside by the mole and Nugget, lit like the rock.
- `update(dt, { player, eye, time, busy })` → `[]`, `lights(eye)` → ≤ 2 faint glows, `dispose()`.
- `onVoxel(vx, vy, vz, old, m)`: a plant goes when its ground is dug or its space filled. It chains
  itself into `world.onChange`; calling it from DigScene's handler as well is harmless (it notices).
- `debug.{ info(), kinds(), near(x, y, z, r), atlas(on), rebuild(), bench(n), budget(ms) }`.

Harvesting and catching (all optional, called by DigScene when present):
- `props.target(eye, dir, reach)` → `null | { label, kind: 'use' }`; `props.use(eye, dir, reach)` →
  `null | { loot: { id }, say? }` (E / the use button). Picked spots regrow the next day
  (`state.data.deep.picked`).
- `enemies.catchTest(eye, dir, reach)` → `null | { label, kind: 'use' }`; `enemies.catch(eye, dir,
  reach, tool)`, `enemies.brushAt(eye, dir, reach)` (while brushing), `enemies.xrayAt(eye, dir,
  reach)` (while the x-ray lamp is on) → event arrays like `update()`'s.
- `reach` is already clipped to the rock the crosshair hits.

Fluids internals: flowing levels live in `world.fluidChunks` (chunk key → Uint8Array, 1..8 eighths,
0 = untouched/full); the mesher reads them for sloped surfaces. Air↔fluid changes are written by
Fluids straight into `chunk.vox` and `world.edits` (they never change the rock mesh, so they skip
`setVoxel` and `onChange`); anything that makes rock goes through `setVoxel`. `fluidUniforms(U)`
adds `fRip`, `fRipK`, `fJig`, `fLake`, `fLakeDrop` (ripples, wobble, draining lakes) to the shared
uniforms.

## Lifts, building, granular digging (current)

- `plan.lifts`: `{ id, name, x, y, z, zone, depth }` — `L0` "Mine entrance" under the burrow, three
  `L{zone}{k}` per zone (timber room, plank floor, cage, shaft: feature kinds `box` + `cage`), and the
  town shaft stops `s0..s5`. Walking into a lift room calls `discoverLift`; E at the cage opens
  `openLiftPanel` (src/fps/lifts.js). `goto('deep', { from: 'lift', lift: id })` spawns in the cage.
- Build tool (slot 7, `R` / tapping the slot again switches): `M.LADDER` strips (climbable for free:
  `FPSPlayer.onLadder`), plank platforms (`M.BOARDS` 3×3), brick blocks (`M.BRICK` 2³).
- Digging: plates are ~2–3 voxels (`STYLE_OF` scale), each blow adds 30% damage to the neighbouring
  plates, broken plates crumble into quarter-meter lumps plus grit; a short hit-stop on breaks.
- Digging (now): a pick blow bites a ragged round crater of small voxels sized by power against
  hardness, sunk a little into the face; hard rock cracks over a few blows first (`Dig.strike`).
- The terrain shader draws `128 / VOX` texels per voxel face (`TEXN`, 8 at VOX 16) with per-texel
  relief; object materials use `texel: 128` to match. Hidden ore close under the surface glints (`ambient()`).
- Ore clumps: when `src/deep/Clumps.js` exists, freed deposits become clumps (`clumps.spawn`),
  `clumps.capture()` takes over the tools while one is held; see the module header.

## Engine at 1/16 m, caves and biomes

- Streaming: `TerrainView.update` walks chunks nearest first. With `world.pool` (a `ChunkPool` of
  2–3 workers running `src/deep/genWorker.js`, made by DigScene; `?workers=0` turns it off)
  generation (`world.request` → `world.arrive`) and greedy meshing (`fillPad` → worker
  `meshSolidRaw` → `rawToGeometry`) happen off the main thread. Dug chunks (`ch.urgent`) near the
  player remesh on the main thread the same frame. Without workers everything runs in the frame
  budget as before.
- Caves (`caveDensity(plan, x, y, z)`, also used by `ChunkGen.isSolid` so virtual chunks are exact):
  winding cave ways (two noises near zero, 1–2 m), tighter crawlways below 4 m (often crouch
  height), big caverns that grow with depth and stand on stone pillars, and rare deep ravines.
  Surfaces get smooth half-meter lumps; lone floating voxels are cleared.
- Biomes in zones 1–3 (`biomeAt(plan, x, y, z)`, `BIOMES`): 1 Mossy Grotto (moss everywhere,
  hanging vines), 2 Sandstone Hollows (`M.SANDSTONE` walls, sand floors that pour), 3 Mushroom
  Hollow (`M.MYCEL` floors, glowcap buttons, giant `M.STEM`/`M.GLOWCAP` mushrooms). Topsoil roots
  hang as thin tendrils. The light and fog lean toward the biome's tint; the first visit says so
  and the HUD shows the biome after the zone name.
- Player: `C` (touch: the crouch toggle) crouches (0.5 m tall, slower, won't walk off ledges); in
  water it dives, and swimming forward under water follows the look.
- Test hooks: `scene.debug.{ biomeAt(x,y,z), density(x,y,z), find(test(biome, depth, x, y, z),
  { r, d0, d1 }) → {x,y,z} | null, teleport(x, y, z, yaw, pitch) }`.

## Cave look: shaders, light and air (wave 3)

- **Terrain shader** (`TerrainMaterial.js`): on top of the palette texels and rock plates: rounded
  plates (each stone has a lit and a shaded side), strata (wobbly horizontal layers, tone + tint per
  layer, a thin line between; strength per material), big tint patches and mineral streaks from a
  32³ tiling 3D noise texture (`U.noise3`, two scales per pixel), convex-edge chamfers (see Mesher),
  damp sheen, moss on upward faces, rime, glowing cracks in volcanic rock, crystal / ice facets with
  an inner parallax layer, light soaking through and texel sparkles, Blinn-Phong glints quantized
  into pixel steps, a warm rim where the lamp grazes. Per-material extras live in palette column 7
  (spec, gloss, translucency, strata) and the alpha of columns 6 (hot) and 5 (moss / damp / rime may
  grow), filled in `surfacePalette()` (no change to `materials.js` needed for new materials: they
  get their style's defaults).
- **Uniforms** (`makeTerrainUniforms()`; all 0 = off, so other scenes look plain until they set
  them): `noise3`, `skyCol` (cool light from above), `bounce` (warm light from below), `haze` (lamp
  flood scattering in the dust), `mist` (x density, y metres below the eye where it thickens, z
  falloff) + `mistCol` (ground mist pooling in pits), `mood` (x moss on tops, y damp, z rime, w hot
  cracks). In the mine `src/deep/Atmosphere.js` sets them per frame from the zone and biome.
- **GLSL chunks** for any lit material of the mine (uniforms `{ ...U }`): `LIGHT` → `lightAt(p, n)`
  (unchanged meaning), `lightFull(p, n, V, wrap, ao, shin, out spec)`, `ambientAt(n)` (cool
  hemisphere + sky + bounce), `lampAtt(d)`, `lampCone(dl)`, `pointAtt(d, r)` (soft-windowed
  inverse-square-ish lights). `AIR` (after `LIGHT`, with `fogCol` / `fogDist` declared) →
  `caveAir(col, p, dist)`: mist, fog (reaching the dark at the edge of the streamed world), the
  darker void overhead and the lamp glow in the dust. **Props, creatures, vegetation, traders:**
  replace `mix(col, fogCol, 1.0 - exp(...))` with `col = caveAir(col, vWorld, dist)` so far objects
  melt into the same dark as the rock.
- **Mesher**: solid `vdata.w` = bit 0 the flipped diagonal, bits 1–4 the voxel's convex edges along
  the shader's face axes (−t1, +t1, −t2, +t2): the neighbour in the face's own layer is open. Part of
  the greedy key (+4.5% quads). `setEdgeFlags(false)` turns it off (test hook).
- **Atmosphere** (`src/deep/Atmosphere.js`, made by `Particles` when given a deep world: `fx.atmos`):
  zone / biome mood tables (`ZONE`, `BIOME`) blended as you walk; the far sky (a screen triangle
  drawn first: `voidCol + airGlow`, so far rock has no silhouette against it); one halo billboard
  per light slot (reads `lPos` / `lCol`, so every light from `DigScene.lights()` glows in the dusty
  air); ambient motes round the eye (dust, sand, glitter, spores, glowing spores, pollen, embers,
  snow, void sparks); light shafts toward the brightest lantern ahead when standing in a tall hall,
  and a little extra bloom where things glow, through the Engine post hook.
- **Particles**: `spawn({ ..., lit, swirl, twinkle })`: `lit` (0..1) takes light from the lamp's
  cone and the lights instead of being self-lit (lit motes stay 1–3 px specks), `swirl` a lazy
  wander, `twinkle` (Hz) flickers. Points of 3 px and more are round pixel discs; big soft puffs
  thin out to the rim in dithered steps.
- **Engine**: `scene.userData.postHook(p, camera, engine)` adjusts a scene's post settings every
  frame (after the scene's own keys). Grades `rootsoil`, `clay`, `grotto` (split-toned: warm
  lamplight, cool shade); `ZONE_GRADES = [null, 'rootsoil', 'clay', 'grotto', 'magma', 'frost', 'core']`.
