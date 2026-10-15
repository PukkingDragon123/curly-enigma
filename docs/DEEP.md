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

Units are meters; one voxel is 1/8 m (`VOX = 8`), y is up, depth = −y. Use `world.solidAt(x,y,z)`
(meters), `world.voxelAt(vx,vy,vz)` (voxels; unloaded = stone), `world.raycast(...)` and
`world.setVoxel(vx,vy,vz,m)`. Meshes that should get the pixel outline enable `LAYER_OUTLINE`;
lighting should come from `makeObjectMaterial(U, {emissive})` (terrain lights, the mole's lamp, fog).

**Enemies** (`new Enemies(ctx)`):
- `update(dt, { player, eye, forward, time, busy, lamp })` → array of events:
  `{ damage: n, kind, push: [x,y,z] }` (energy lost + knockback), `{ say: html, key, tone, cd }` (a toast),
  `{ loot: { id, q, p } }` (an item for the backpack — goes through the same path as ore pickups).
- `hitTest(eye, dir, reach)` → an enemy the pick would hit before `reach` meters, or null.
- `damage(enemy, power, dir)`: a pick blow (knockback, flash, maybe defeat).
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

Harvesting and catching (all optional, called by DigScene when present):
- `props.target(eye, dir, reach)` → `null | { label, kind: 'use' }`; `props.use(eye, dir, reach)` →
  `null | { loot: { id }, say? }` (E / the use button). Picked spots regrow the next day
  (`state.data.deep.picked`).
- `enemies.catchTest(eye, dir, reach)` → `null | { label, kind: 'use' }`; `enemies.catch(eye, dir,
  reach, tool)`, `enemies.brushAt(eye, dir, reach)` (while brushing), `enemies.xrayAt(eye, dir,
  reach)` (while the x-ray lamp is on) → event arrays like `update()`'s.
- `reach` is already clipped to the rock the crosshair hits.
