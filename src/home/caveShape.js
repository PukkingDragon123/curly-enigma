// The shape of Old Star's cave (pure functions, meters): its lobes, how far a point is inside its
// footprint, the floor and the roof over it, the dripstones, the drip basin, the rubble mound and
// the forge's smoke crack. caveRock.js turns it into voxels; the workshop places things by it.
import { HALL, SHAFT, HOLE } from './units.js';

const BASE = HALL.y;

// ---------------------------------------------------------------- noise
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
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the shape (meters)
/** The cave's lobes: centre x, z and radii (m). */
const LOBES = [
  [3.0, -5.45, 4.35, 3.55], // the main chamber
  [2.6, -1.75, 1.55, 1.6], // by the arch up to your room
  [-2.35, -3.85, 2.05, 1.85], // the hearth nook (west)
  [-1.95, -6.55, 1.55, 1.35], // the notes nook (west wall)
  [-1.25, -9.1, 2.35, 1.75], // the forge alcove (north-west)
  [6.95, -8.95, 2.25, 1.75], // the ruins (north-east)
  [8.4, -4.4, 1.95, 1.55], // the lift bay (east)
  [3.25, -9.2, 1.25, 1.3], // the old passage's mouth
]
/** Stalactites (x, z, length, base radius) and stalagmites (x, z, height, radius), meters. */
export const DRIPSTONES = [
  { x: 0.55, z: -6.7, len: 0.95, r: 0.2, drip: true }, // over the drip basin
  { x: 1.2, z: -5.3, len: 0.55, r: 0.14 },
  { x: 2.3, z: -7.4, len: 0.8, r: 0.18, drip: true },
  { x: 3.6, z: -6.0, len: 0.45, r: 0.13 },
  { x: 5.4, z: -6.9, len: 0.7, r: 0.17, drip: true },
  { x: 6.3, z: -5.0, len: 0.4, r: 0.12 },
  { x: 4.9, z: -8.3, len: 0.6, r: 0.15 },
  { x: 1.7, z: -3.3, len: 0.35, r: 0.11 },
  { x: -0.4, z: -4.8, len: 0.5, r: 0.13 },
  { x: 7.6, z: -7.6, len: 0.5, r: 0.14, drip: true },
  { x: -0.9, z: -7.0, len: 0.45, r: 0.12 },
  { x: 3.1, z: -8.6, len: 0.38, r: 0.11 },
  { x: 2.0, z: -4.4, len: 0.28, r: 0.09 },
  { x: 5.9, z: -3.2, len: 0.33, r: 0.1 },
];
export const MITES = [
  { x: 8.95, z: -9.75, h: 0.75, r: 0.2 },
  { x: 5.05, z: -10.05, h: 0.45, r: 0.15 },
  { x: -3.9, z: -1.95, h: 0.5, r: 0.17 },
  { x: 0.25, z: -1.25, h: 0.42, r: 0.15 },
  { x: 5.05, z: -1.15, h: 0.55, r: 0.17 },
  { x: -4.3, z: -10.3, h: 0.32, r: 0.13 },
];
/** The drip basin in the floor (m) and the rubble mound under the hole. */
export const POOL = { x: 0.55, z: -6.7, r: 0.62, depth: 0.14 };
export const MOUND = { x: HOLE.x, z: HOLE.z + 0.15, r: 1.35, h: 0.3 };
/** The forge's smoke crack in the roof (m). */
export const FLUE = { x: -1.6, z: -10.45 };

/** How far inside the cave's footprint (m, + inside), lumpy. */
export function planD(x, z) {
  let s = 0;
  const k = 0.42;
  for (const [cx, cz, rx, rz] of LOBES) {
    const e = Math.hypot((x - cx) / rx, (z - cz) / rz);
    s += Math.exp(((1 - e) * Math.min(rx, rz)) / k);
  }
  let d = k * Math.log(s);
  d += n2(x * 0.85, z * 0.85, 11) * 0.3 + n2(x * 2.2 + 7, z * 2.2, 12) * 0.13 - 0.08;
  // the cut face round the arch up to your room, and the one the lift's portal is set into
  d = Math.min(d, (HALL.z1 - z) * 4);
  if (z > SHAFT.z0 - 0.5 && z < SHAFT.z1 + 0.5) d = Math.min(d, (SHAFT.x0 - x) * 4 + 0.02);
  return d;
}

/** The floor's height (m) at (x, z) given planD d. */
export function floorH(x, z, d = planD(x, z)) {
  let f = BASE;
  if (d < 0.55) f += (0.55 - d) * (0.55 - d) * 1.2;
  // a few bumps where nobody walks (by the walls)
  if (d < 1.4) f += Math.max(0, n2(x * 3.1, z * 3.1, 21)) * 0.06 * (1.4 - Math.max(0, d)) / 1.4;
  // the fresh heap of earth and rock you came down with
  const md = Math.hypot((x - MOUND.x) / MOUND.r, (z - MOUND.z) / (MOUND.r * 0.85));
  if (md < 1) f += MOUND.h * (1 - md * md) * (0.85 + n2(x * 4, z * 4, 23) * 0.25);
  // the drip basin
  const pd = Math.hypot(x - POOL.x, z - POOL.z) / POOL.r;
  if (pd < 1) f -= POOL.depth * (1 - pd * pd);
  return f;
}

/** The roof's height (m) at (x, z) given planD d. */
export function ceilH(x, z, d = planD(x, z)) {
  let c = BASE + 1.6 + 1.3 * smoothstep(0, 3.6, d);
  c += n2(x * 0.62, z * 0.62, 31) * 0.24 + n2(x * 1.8, z * 1.8, 32) * 0.1;
  return c;
}

export { hash };
