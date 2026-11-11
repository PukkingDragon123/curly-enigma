// Where things stand in Old Star's small cave (meters; pure data, shared by the build jobs, the rock
// and the scene). The hollow runs x 2.4..8.0, z -4.15..-0.75 (plan.js CAVE); north is -z.
import { FRONT, HOLE } from './units.js';

/** Where things are. */
export const SPOTS = {
  // the forge corner (north-west): the forge against the north rock, the bellows beside it, the anvil on its stump
  forge: { x: 4.05, z: -3.66, yaw: 0 },
  bellows: { x: 3.0, z: -3.6, yaw: Math.PI },
  anvil: { x: 4.45, z: -2.45, yaw: -0.35 },
  trough: { x: 5.02, z: -3.08, yaw: 0 }, // (his quench bucket)
  rack: { x: 2.55, z: -2.45 }, // the tool pegs on the west rock
  coal: { x: 4.98, z: -3.9, yaw: 0.4 },
  // his fleece along the west rock (he sleeps there, by the forge's warmth); his trunk in the south-west
  cot: { x: 2.92, z: -2.38, yaw: Math.PI / 2 },
  chest: { x: 3.74, z: -1.08, yaw: Math.PI },
  books: { x: 3.74, z: -1.08 },
  // your corner along the south rock: the flat stone (your Index Book), your bedroll, your trunk
  ledge: { x: 4.28, z: -1.08, yaw: 0 },
  bed: { x: 5.3, z: -1.16, yaw: Math.PI / 2 },
  mine: { x: 6.32, z: -1.08, yaw: 0.12 },
  // the fire pit (south-east), his stump by it, the sack of stores
  fire: { x: 6.3, z: -1.95 },
  hearth: { x: 6.3, z: -1.95 },
  armchair: { x: 6.98, z: -1.42 },
  larder: { x: 3.2, z: -1.45 },
  // the north rock: his notes nailed to it, the door to Deep Town, the slate on a crate (the Miners' Board) in the corner
  board: { x: 5.68, z: -4.12 },
  passage: { x: FRONT.x, z: FRONT.z },
  miners: { x: 7.28, z: -3.55, yaw: -0.72 },
  dream: { x: 7.2, z: -3.9 }, // (the chalk on the rock: THE WAY UP)
  cart: { x: 4.98, z: -3.9 }, // (the coal heap: a few lumps a day)
  rubble: { x: HOLE.x + 0.1, z: HOLE.z - 0.12 },
  // (old names kept for the scene and the tests)
  sink: { x: 5.02, z: -3.08 },
  pool: { x: 5.02, z: -3.08 },
  sofa: { x: 6.98, z: -1.42 },
  clock: null,
};

/** Old Star's places: where he stands (or sits / lies), which way he faces, his pose. */
export const STAR_SPOTS = {
  anvil: { x: 3.86, z: -2.58, face: { x: SPOTS.anvil.x, z: SPOTS.anvil.z }, pose: 'hammer' }, // (beside it, the forge's glow behind him: from your bedroll you see him side on)
  bellows: { x: 3.05, z: -3.0, face: { x: 3.05, z: -3.7 }, pose: 'pump' },
  fire: { x: 6.25, z: -2.6, face: { x: SPOTS.fire.x, z: SPOTS.fire.z }, pose: 'stir' },
  board: { x: 5.68, z: -3.45, face: { x: 5.68, z: -4.3 }, pose: 'read' },
  lift: { x: 7.38, z: -2.27, face: { x: 8.4, z: -2.27 }, pose: 'idle' },
  ruins: { x: 6.8, z: -3.1, face: { x: 7.25, z: -3.95 }, pose: 'ponder' }, // (THE WAY UP, chalked on the rock)
  pool: { x: 5.5, z: -2.72, face: { x: SPOTS.trough.x, z: SPOTS.trough.z }, pose: 'idle' }, // (a drink from the bucket)
  books: { x: 3.75, z: -1.7, face: { x: SPOTS.chest.x, z: SPOTS.chest.z }, pose: 'read' },
  hearth: { x: 5.62, z: -2.42, face: { x: SPOTS.fire.x, z: SPOTS.fire.z }, pose: 'idle' },
  armchair: { sit: true, pose: 'sit' },
  cot: { lie: true, pose: 'sleep' },
};

/** Where your things go once your sleeping alcove is dug (m): the bedroll along its east rock, the stone at its head, your trunk at its foot. */
export const NOOK_BED = {
  bed: { x: 5.75, z: 2.18, yaw: 0 },
  ledge: { x: 5.75, z: 1.2, yaw: 0 },
  mine: { x: 5.25, z: 2.75, yaw: -Math.PI / 2 },
};
