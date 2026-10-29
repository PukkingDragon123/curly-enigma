// Old Star's camp: the floor plan (meters, pure data and shape functions). His home is an old,
// run-down camp in a natural cave hollow, three worn steps down a rock passage from your nook (the
// save's tile room, south of here). One rough hollow plus a side nook, its parts still named as the
// old house's rooms were (the lessons and the quests say "the smithy", "the kitchen", "the hall"):
//   the kitchen (south-west)  the fire pit with its tripod and kettle (the cooking spot), the plank
//                             table and the wobbly stool, crates of stores; in the side nook the
//                             spring dripping out of the rock into a stone basin
//   the smithy (north-west)   his old stone forge with its pipe up a crack in the rock, the bellows,
//                             the anvil on its stump, the quench trough, coal, tools against the rock
//   the living (middle)       his shack of warped grey planks and patched tarps built against the
//                             north rock (his cot, his armchair, his notes), the hole you fell through
//                             overhead with a thin shaft of light
//   the hall (east)           the rusty cage lift in its rock shaft, the old door to Deep Town in a
//                             tunnel mouth, his chest, the coal cart, the Miners' Board
// The rock (caveShell.js) is carved from hollowSD (a rough signed distance over the floor plan: the
// walls wander, lean in overhead and meet a low domed roof, ceilAt) and so is the collision.
import { HALL, ARCH, SHAFT, FRONT, HOLE } from './units.js';

/** The camp's floor (m): the cave's floor height, three steps below your nook. */
export const FY = HALL.y;
/** (Old: interior wall thickness, m. The camp has none; kept for the old surfaces module.) */
export const WALL = 0.2;
/** Voxels per meter for the props (1/64 m). */
export const VPM = 64;

/** The parts of the hollow (zones: the lessons' soft walls, Old Star's places), bounds in m, a rough roof height. */
export const ROOMS = [
  { id: 'kitchen', name: 'the camp kitchen', x0: -5.3, x1: 0.6, z0: -3.0, z1: HALL.z1, h: 2.1 },
  { id: 'smithy', name: 'the forge corner', x0: -5.3, x1: 0.6, z0: -6.7, z1: -3.0, h: 2.1 },
  { id: 'living', name: 'the shack', x0: 0.6, x1: 4.9, z0: -6.7, z1: HALL.z1, h: 2.3 },
  { id: 'hall', name: 'the lift and the way out', x0: 4.9, x1: SHAFT.x0 + 0.02, z0: -6.7, z1: HALL.z1, h: 2.0 },
];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/** No doors inside a cave: one open hollow. (Kept for the code that walks the old house's lists.) */
export const DOORS = [];
/** The way to Deep Town: an old door in a tunnel mouth in the north rock (m). */
export const FRONT_DOOR = { room: 'hall', side: 'n', c: FRONT.x, w: 0.74, h: 1.2 };
/** No windows in a cave. */
export const WINDOWS = [];

// ---------------------------------------------------------------- noise (pure, the same everywhere)
function hash(x, y, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
/** Smooth value noise in 2D, -1..1. */
export function n2(x, z, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi);
  const a = hash(xi, 0, zi, s), b = hash(xi + 1, 0, zi, s), c = hash(xi, 0, zi + 1, s), d = hash(xi + 1, 0, zi + 1, s);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}
/** Smooth value noise in 3D, -1..1. */
export function n3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const l = (dy, dz) => { const a = hash(xi, yi + dy, zi + dz, s), b = hash(xi + 1, yi + dy, zi + dz, s); return a + (b - a) * fx; };
  const p = l(0, 0) + (l(1, 0) - l(0, 0)) * fy;
  const q = l(0, 1) + (l(1, 1) - l(0, 1)) * fy;
  return (p + (q - p) * fz) * 2 - 1;
}
export { hash as hash3 };

// ---------------------------------------------------------------- the hollow's shape (meters)
/** Rounded box signed distance in the floor plan. */
function sdBox(x, z, x0, x1, z0, z1, r) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 - r, hz = (z1 - z0) / 2 - r;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
/** The hollow's parts: [x0, x1, z0, z1, corner radius, rough (the wall wanders)]. */
const SHAPES = [
  [-3.85, 7.7, -5.72, -0.38, 1.15, 1], // the hollow
  [-5.15, -3.3, -3.1, -1.25, 0.7, 1], // the spring nook (west)
  [6.7, SHAFT.x0, SHAFT.z0 - 0.3, SHAFT.z1 + 0.3, 0, 0], // the lift bay: a flat face for its portal
  [FRONT.x - 0.52, FRONT.x + 0.52, FRONT.z, -5.25, 0, 0], // the door to Deep Town, in a flat face
  [ARCH.x - 0.44, ARCH.x + 0.44, -1.1, 0.02, 0, 0], // the passage up to your nook
];
/** How far the rough walls wander out (m). */
export function wob(x, z) { return 0.2 + 0.15 * n2(x * 1.15 + 3.1, z * 1.15 - 1.7, 11) + 0.07 * n2(x * 3.3, z * 3.3, 12); }

/**
 * Signed distance to the hollow's wall at floor level (m): < 0 inside. Never past the lift shaft's
 * face (x 7.8) nor into the rock between the hollow and your nook (z -0.31) except up the passage.
 */
export function hollowSD(x, z) {
  let d = Infinity;
  const w = wob(x, z);
  for (const [x0, x1, z0, z1, r, rough] of SHAPES) d = Math.min(d, sdBox(x, z, x0, x1, z0, z1, r) - (rough ? w : 0));
  d = Math.max(d, x - SHAFT.x0);
  if (Math.abs(x - ARCH.x) > 0.44) d = Math.max(d, z - (HALL.z1 - 0.02));
  if (Math.abs(x - FRONT.x) < 0.95) d = Math.max(d, FRONT.z - z); // the door's face stays flat
  return d;
}

/** Can you stand at (x, z) (m): inside the hollow, a hand's width off the rock. */
export function walkable(x, z) { return hollowSD(x, z) < -0.14; }

/** How far the walls lean in at h m over the floor (m added to the distance). */
export function lean(h) { return h < 0.75 ? 0 : (h - 0.75) * (h - 0.75) * 0.42; }

/** The roof over (x, z) (m, absolute y): a low dome, highest in the middle, the passage at the arch's height. */
export function ceilAt(x, z) {
  if (Math.abs(x - ARCH.x) <= 0.44 && z > -1.1) return Math.min(ARCH.h + 0.02, FY + 1.75 + (z + 1.1) * 0.6);
  const inner = Math.max(0, Math.min(1, -hollowSD(x, z) / 2.1));
  return FY + 1.5 + 0.95 * sm(inner) + 0.12 * n2(x * 0.8 + 5, z * 0.8, 13);
}

/** The hole you fell through: a ragged shaft up through the roof (m). */
export const HOLE_SHAFT = { x: HOLE.x, z: HOLE.z, r: 0.48, top: FY + 3.4 };

/** The part of the hollow (zone) at (x, z), or null in the rock. */
export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return hollowSD(x, z) < 0 ? r : null;
  return null;
}

/** (No doorways in a cave.) */
export function doorAt() { return null; }

/** (Old house: a room's wall line. Kept for the old surfaces module.) */
export function sideInfo(r, side) {
  if (side === 'n') return { fixed: 'z', at: r.z0, a0: r.x0, a1: r.x1, nx: 0, nz: 1 };
  if (side === 's') return { fixed: 'z', at: r.z1, a0: r.x0, a1: r.x1, nx: 0, nz: -1 };
  if (side === 'w') return { fixed: 'x', at: r.x0, a0: r.z0, a1: r.z1, nx: 1, nz: 0 };
  return { fixed: 'x', at: r.x1, a0: r.z0, a1: r.z1, nx: -1, nz: 0 };
}
/** (Old house: the openings in a wall. None in a cave.) */
export function openingsOf() { return []; }

/** The camp's bounds (m), and the middle. */
export const BOUNDS = { x0: -5.4, x1: SHAFT.x1 + 0.4, z0: FRONT.z - 0.9, z1: HALL.z1 };
export const MID = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, z: (BOUNDS.z0 + BOUNDS.z1) / 2 };

/** (No terrace in a cave.) */
export function onTerrace() { return false; }

/**
 * The openings you can see one part of the home from another through (for drawing only what's in
 * view): the camp is one open hollow; your nook looks into it through the arch.
 */
export function portals() {
  return [{ a: 'camp', b: 'bedroom', box: [ARCH.x - ARCH.hw, FY, HALL.z1 - 0.7, ARCH.x + ARCH.hw, ARCH.h, 0.05] }];
}
