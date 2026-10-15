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

## HUD (`hud = 'deep'`)

- `ui.setRadar(provider | null)`: `provider()` returns
  `{ x, y, z, heading, range, explored: { size, cell, data }, markers: [{ kind, x, y, z, label, color }] }`.
  `heading` is the camera yaw: forward = (-sin h, 0, -cos h). `explored` is a size×size grid of
  cells (`cell` m each) centered on the player: 0 unknown, 1 open, 2 water, 3 lava, 4 known rock.
  Marker kinds: `home`, `town`, `ore`, `danger`, `enemy`, `station`, `stake`.
- `ui.setCrosshair({ visible, kind, label, progress })`: kind `none` | `rock` | `ore` | `enemy` | `use`.
- Touch in `deep`: stick (move, up = forward), drag on the right half to look (adds to
  `input.look`), buttons dig (holds mouse button 0), jump (Space), use (E), snack (Q), next tool (wheel).
