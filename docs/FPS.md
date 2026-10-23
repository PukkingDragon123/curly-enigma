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

## As built

- **Burrow** (`src/scenes/HomeScene.js`, `src/home/*`): 1 tile = 0.5 m (`src/home/units.js`), the
  room group is built in tile units and scaled to meters. Wall pieces hang on all four walls
  (`r`: 0 north, 1 west, 2 south, 3 east); the lift (2×2 + the row in front), the build bench, the
  door and each tunnel mouth's front tile are reserved (`homeLayout.js`); older saves are fixed up
  on load (`src/home/layoutfix.js`). Test hooks: `scene.debug.{ digOut(wall?), useLift(id),
  toggleBuild(on?), placeAt(id, x, z, r), interact(label), labels(), stand(x, z, yaw, pitch),
  aim(x, y, z), step(n), stats() }`.
- **Forge** (`src/scenes/ForgeScene.js`, `src/forge/*`): a walkable smithy; ViewModel kinds
  `hammer`, `tongs`, `smith`, paw steering `vm.drive`, `vm.toView`, `vm.jaw`. Test hooks:
  `scene.debug.{ step, until, state, pump, smelt, forge, toAnvil, toFire, charge, release, strike,
  finishShaping, balance, quench, tap, heatTo, place, dock, part, partStrike, partsList }`
  (coop parts: see REMAKE.md › "As built: coop parts at the forge").
- **Mine**: see DEEP.md (lifts, build tool, clumps).

## Next: Old Star, the tavern, progression (in progress)

- **Story flow (new):** `fall` → `deep { from: 'fall' }`: the mole tumbles into **Old Star's dig**, a
  cave chamber near the mine entrance lift (`plan.prologue` in the world plan; its shape is stamped
  by `src/deep/gen/prologue.js`). Old Star — an old star-nosed mole who has almost dug his way out —
  is pinned by a rockfall; the mole digs him free and he teaches the basics (mining, clumps,
  ladders, lifts) through `src/deep/Prologue.js`, then they ride the old lift up to **the tavern**:
  `home { from: 'lift', first: true }`. Flag `prologue` marks it done.
- **The tavern & house** (`home`): an old, cozy miners' tavern that is now your home: Old Star lives
  there (his model: `src/gfx/char/starmole.js` → `makeStarMole(opts)`), his notes are pinned on a
  board (`src/data/notes.js`), his old loot chest, the bar, the hearth, your room; the cage lift
  down to the mine. **No digging outside the mine**: the burrow's walls can't be dug any more (the
  lift is the way down; old tunnel mouths still work).
- **Progression** (`src/data/upgrades.js`, `ui.openUpgrades()`): tool tiers, dynamite
  (`src/deep/Explosives.js`), upgrades with rising costs, milestones; the tavern earns a little
  each day (`state.tavernIncome()`).

## Progression (as built)

- **The Miners' Board** (`ui.openUpgrades(tab?)` → Promise of the panel handle; `src/ui/Upgrades.js`,
  data in `src/data/upgrades.js`): 15 upgrades with levels and rising costs (Digging, Hauling,
  Blasting, Tavern), a Tools tab with the pick ladder up to the Starmetal Pickaxe, and 26 milestones
  that pay out. State: `upgrade(id)`, `upEffect(id)`, `buyUpgrade(id)`, `mineBonus()`,
  `tavernIncome()` (paid each night in `nextDay()`, last night in `data.progress.tavern`),
  `checkMilestones()` / `takeMilestones()`. The mine applies `mineBonus()` `power`, `rate`,
  `glint`, `clean` (DigScene `bonus(k)`); the rest work inside Explosives and `sellPrice`.
- **Dynamite** (`src/deep/Explosives.js`, slot `dynamite`): stick, bundle and blasting charge
  (Grubb's sells them), thrown in an arc on a burning fuse; the blast goes through
  `owner.blast(x, y, z, r, power)`. No blasting in the burrow, Deep Town, lift rooms or Old Star's
  dig before the prologue. Test hooks: `scene.explosives.debug.{ list, boom, zones, protectedAt }`.
- Hard rock needs a better pick by zone (`HARD_ROCK_TIER`, `pickForTier()` in `items.js`).
