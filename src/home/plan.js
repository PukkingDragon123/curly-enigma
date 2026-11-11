// Old Star's cave: the floor plan (meters, pure data and shape functions). One small, old hollow in
// the rock (his forge and anvil in the north-west, the fire pit and its tripod in the south-east,
// his trunk, your bedroll on the floor along the south rock, the cage lift in the east rock, the
// old door to Deep Town in the north rock, the hole you fell through overhead), and the alcoves you
// dig out later (nooks.js): rectangles of floor on the tile grid with rock standing straight on
// their edges and vaulting over, each joined by a short neck to the hollow or another alcove. The
// zones keep the old house's names for the quests and the lessons ("the smithy", "the kitchen").
// The rock (caveShell.js) is carved from these shapes (hollowSD / alcoveSD, the lean of the walls,
// ceilAt), and so is the collision. Which alcoves are open is module state (setOpenNooks: the
// build jobs set it from their options, the scene from the save).
import { HALL, SHAFT, FRONT, HOLE, T } from './units.js';
import { NOOKS } from './nooks.js';

/** The cave's floor (m). */
export const FY = HALL.y;
/** (Old: interior wall thickness, m. The cave has none; kept for the old surfaces module.) */
export const WALL = 0.2;
/** Voxels per meter for the props (1/64 m). */
export const VPM = 64;

// ---------------------------------------------------------------- the alcoves that are dug
let OPEN = new Set();
/** Which alcoves are dug out (a Set of nook ids): the rock, the collision and the floor follow it. */
export function setOpenNooks(set) { OPEN = new Set(set || []); }
export function openNookSet() { return OPEN; }

/** Zones of the hollow (the lessons' and quests' names, Old Star's places), bounds in m. */
export const ROOMS = [
  { id: 'smithy', name: 'the forge corner', x0: 2.0, x1: 4.9, z0: -4.6, z1: -2.2, h: 1.9 },
  { id: 'living', name: 'your corner', x0: 2.0, x1: 5.8, z0: -2.2, z1: -0.4, h: 1.9 },
  { id: 'kitchen', name: 'the fire pit', x0: 5.8, x1: 7.6, z0: -2.4, z1: -0.4, h: 1.9 },
  { id: 'hall', name: 'the lift and the way out', x0: 4.9, x1: SHAFT.x0 + 0.02, z0: -4.6, z1: -2.2, h: 1.9 },
  { id: 'hall', name: 'the lift and the way out', x0: 7.6, x1: SHAFT.x0 + 0.02, z0: -2.4, z1: -0.4, h: 1.9 },
];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/** No doors inside a cave. (Kept for the code that walks the old house's lists.) */
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

// ---------------------------------------------------------------- the shapes (meters)
/** Rounded box signed distance in the floor plan. */
function sdBox(x, z, x0, x1, z0, z1, r) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 - r, hz = (z1 - z0) / 2 - r;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
/** The hollow: [x0, x1, z0, z1, corner radius, rough (the wall wanders)]. */
export const CAVE = [2.65, 7.75, -3.95, -0.95];
const SHAPES = [
  [...CAVE, 1.0, 1], // the hollow
  [7.3, SHAFT.x0, SHAFT.z0 - 0.3, SHAFT.z1 + 0.3, 0, 0], // the lift bay: a flat face for its portal
  [FRONT.x - 0.52, FRONT.x + 0.52, FRONT.z, -3.6, 0, 0], // the door to Deep Town, in a flat face
];
/** How far the rough walls wander out (m). */
export function wob(x, z) { return 0.2 + 0.15 * n2(x * 1.15 + 3.1, z * 1.15 - 1.7, 11) + 0.07 * n2(x * 3.3, z * 3.3, 12); }

/** Signed distance to the hollow's own rock at floor level (m): < 0 inside. Never past the lift shaft's face. */
export function caveSD(x, z) {
  let d = Infinity;
  const w = wob(x, z);
  for (const [x0, x1, z0, z1, r, rough] of SHAPES) d = Math.min(d, sdBox(x, z, x0, x1, z0, z1, r) - (rough ? w : 0));
  d = Math.max(d, x - SHAFT.x0);
  if (Math.abs(x - FRONT.x) < 0.95) d = Math.max(d, FRONT.z - z); // the door's face stays flat
  return d;
}

/** Signed distance to the dug necks (the passages to the alcoves). */
export function neckSD(x, z, set = OPEN) {
  let d = Infinity;
  for (const n of NOOKS) {
    if (!set.has(n.id)) continue;
    const [x0, z0, x1, z1] = n.neck;
    d = Math.min(d, sdBox(x, z, x0, x1, z0, z1, 0.12) - 0.04 * (1 + n2(x * 3.1, z * 3.1, 14)));
  }
  return d;
}

/** Signed distance to the dug alcoves' floors (m): exact on their tile edges (the rock only ever recedes). */
export function alcoveSD(x, z, set = OPEN) {
  let d = Infinity;
  for (const n of NOOKS) {
    if (!set.has(n.id)) continue;
    const [x0, z0, x1, z1] = n.rect;
    d = Math.min(d, sdBox(x, z, x0 * T, x1 * T, z0 * T, z1 * T, 0.06));
  }
  return d;
}

/** Signed distance to any open floor at floor level (m): < 0 inside the hollow, a neck or an alcove. */
export function hollowSD(x, z) { return Math.min(caveSD(x, z), neckSD(x, z), alcoveSD(x, z)); }

/** Can you stand at (x, z) (m): on open floor, a hand's width off the rock. */
export function walkable(x, z) { return hollowSD(x, z) < -0.14; }

/** How far the hollow's walls lean in at h m over the floor (m added to the distance). */
export function lean(h) { return h < 0.7 ? 0 : (h - 0.7) * (h - 0.7) * 0.5; }
/** The alcoves' walls: straight up to where wall pieces stop, then vaulting over. */
export function leanAlcove(h) { return h < 1.55 ? 0 : (h - 1.55) * (h - 1.55) * 1.4; }
/** The necks: a low, rounded passage. */
export function leanNeck(h) { return h < 0.95 ? 0 : ((h - 0.95) / 0.42) ** 2 * 0.32; }

/** The roof over (x, z) (m, absolute y): low and uneven in the hollow, a little vault in each alcove. */
export function ceilAt(x, z) {
  const da = alcoveSD(x, z);
  if (da < 0) return FY + 1.78 + 0.26 * sm(Math.min(1, -da / 0.9)) + 0.05 * n2(x * 1.3, z * 1.3, 15);
  const dn = neckSD(x, z), dc = caveSD(x, z);
  if (dn < 0 && dn < dc) return FY + 1.42 + 0.06 * n2(x * 2, z * 2, 16);
  const inner = Math.max(0, Math.min(1, -dc / 1.5));
  return FY + 1.42 + 0.62 * sm(inner) + 0.1 * n2(x * 0.9 + 5, z * 0.9, 13);
}

/** The hole you fell through: a ragged shaft up through the roof (m). */
export const HOLE_SHAFT = { x: HOLE.x, z: HOLE.z, r: 0.46, top: FY + 3.3 };

/** The zone of the hollow at (x, z) (an alcove: its nook record), or null in the rock. */
export function roomAt(x, z) {
  if (hollowSD(x, z) >= 0) return null;
  if (alcoveSD(x, z) < 0 || neckSD(x, z) < 0) return NOOK_ROOM;
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return ROOMS[1];
}
const NOOK_ROOM = { id: 'nook', name: 'your alcoves', x0: 0, x1: 9, z0: 0, z1: 5, h: 2 };

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

/** The whole cave's bounds (m, every alcove dug), and the hollow's middle. */
export const BOUNDS = { x0: 0.3, x1: SHAFT.x1 + 0.4, z0: FRONT.z - 0.9, z1: 5.2 };
export const MID = { x: (CAVE[0] + CAVE[1]) / 2, z: (CAVE[2] + CAVE[3]) / 2 };

/** (No terrace in a cave.) */
export function onTerrace() { return false; }

/** (One cave: nothing to see through. Kept for rooms.js.) */
export function portals() { return []; }
