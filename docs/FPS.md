# The whole game in first person: shared contract

Every place the mole walks is first person now: the burrow, Deep Town, the forge, the mine.
Cutscenes (title, the fall, the ending) stay cinematic. This file is the contract between the
scenes; `docs/DEEP.md` covers the mine.

## Units and the mole

- Meters, y up. The mole is **0.86 m** tall, eyes at **0.72 m**, half-width 0.22 m, steps up
  0.32 m ledges, jumps ~0.8 m, walks 2.7 m/s (runs 3.9). Doors want ≥ 1.0 m height and ≥ 0.6 m
  width; counters ~0.5 m high; a comfortable room for this mole is 4–7 m across with a 1.8–2.4 m
  ceiling. Characters (`makeCharacter` rigs) should be scaled so moles stand ~0.8–0.9 m.
- Old iso scenes were built in tile units: scale their models into meters (a root group with a
  uniform scale), and turn off any "skip faces the iso camera can't see" optimisation, because a
  first-person camera sees every side. Every space needs a ceiling and all four walls.

## `src/fps/FPSKit.js`

```js
import { FPSRig, BoxWorld } from '../fps/FPSKit.js';
const world = new BoxWorld();                 // collision: world.add(x0,y0,z0,x1,y1,z1, tag), remove(tag)
const rig = await new FPSRig(this, { world, fov: 74, reach: 2.2, stepMat: 'wood', lamp: 0.8 }).init();
rig.place(x, y, z, yaw);                      // yaw 0 looks toward −z
rig.add({ x, y, z, r, label: 'Sleep', action: () => … });          // or box: [x0,y0,z0,x1,y1,z1]
rig.add({ box, label, kind: 'use', enabled: () => bool, reach });   // E / the touch "use" button
// each frame:
const ev = rig.update(dt, { busy, frozen, speedMul });  // look, move, crosshair, E; rig.target, rig.primaryDown/primaryPressed
rig.render(this.post);                         // in render(): draws the scene + the paws overlay
rig.onResize(w, h); rig.dispose();             // in onResize / exit
rig.setTool(kind, itemId);                     // what the paws hold ('none' = bare paws), see ViewModel TOOL_KINDS
rig.shake(a); rig.kick (Vector3 camera kick); rig.vm (the ViewModel, may be null)
```

- Scenes set `this.hud = 'deep'` (the first-person HUD: crosshair, look-catch card, touch stick +
  look layer + big action button + jump/use/snack/tool buttons). Call `ui.setRadar(null)`,
  `ui.setDepth(null)`, `ui.setBag(null)` when they don't apply. The big touch button is mouse
  button 0 (`rig.primaryDown`), "use" is `E`.
- Lighting: the paws overlay has its own lights (`rig.lampCol`, `rig.ambient`, `rig.lampK` feed
  it); scenes light themselves however they like (three.js lights for toon/standard materials).
- Keep the pixel look: `engine.render` post (outline, dither, levels) is applied by `rig.render`.

## Elevators (`src/fps/lifts.js`)

- `openLiftPanel(game, here, { title, sub })`: the panel listing destinations (`home`, `town`
  once `flag('escaped')`, and every mine lift found), `rideTo(game, id)` goes there:
  `home` → `goto('home', { from: 'lift' })`, `town` → `goto('town', { from: 'lift' })`, a mine lift →
  `goto('deep', { from: 'lift', lift: id })`.
- `discoverLift(state, { id, name, depth, zone })`, `liftDestinations(state)`, `liftState(state)`.
- The burrow has its own lift (a cage in the room) that goes down to the mine; the first mine lift
  (`'L0'`, "Mine entrance", right under the burrow) is always known.

## Scene flow and arrival params

- `fall` → `home { from: 'fall' }` (first-person landing through the roof; sets `fallen`, `nugget`).
- `home`: arrivals `fall | lift | tunnel { wall, t } | town | forge | cooking | continue`.
  Lift → panel; wall dig → `deep { from: 'home', wall, t }` (tunnel mouths from
  `state.data.deep.tunnels`); door → `town { from: 'home' }` once `flag('escaped')`, otherwise
  caved in; bed → `game.sleep()`; stove → `cooking`; forge → `forge { from: 'home' }`; build mode.
- `town`: arrivals `escape | lift | home | mine | continue`. Shops, assay, ticket office (→ ending),
  the lift (panel), the path home → `home { from: 'town' }`.
- `forge { from }` → back to `from` when done. `cooking` → `home { from: 'cooking' }`.
- `deep`: see DEEP.md; mine lifts → panel; tunnel doors → `home { from: 'tunnel', wall, t }`;
  the town gate → `town { from: 'escape' }`.

## Testing

Headless SwiftShader renders ~1 frame/s, so drive simulations with `scene.update(1/30)` loops in
`node scripts/shot.mjs` evals, and look at the screenshots. `node scripts/e2e.mjs` plays the whole
game; tell the lead which test hooks your scene offers (e.g. `scene.debug.*`).
