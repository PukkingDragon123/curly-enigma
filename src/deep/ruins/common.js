// Shared pieces of the ruin layouts (pure; runs in the chunk workers too).
//
// Every ruin is laid out on its own voxel grid: a = forward (the way it faces, snapped to a
// quarter turn so walls stay voxel-straight), b = to the right, y = up from the floor (y = 0 is
// the first voxel of air, the floor surface is at y = 0, the floor voxel is y = -1). Local voxel
// (a, b) has its centre at (a + 0.5, b + 0.5).
import { VOX, M } from '../materials.js';
import { h3 } from '../noise.js';
import { G, SYMBOLS, glyphAt } from './glyphs.js';

export { h3, G, SYMBOLS, glyphAt };

/** sqrt(x² + y² + z²): Math.hypot is slow in V8 and this runs per voxel. */
export const hyp = (x, y, z = 0) => Math.sqrt(x * x + y * y + z * z);

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** The ruin's grid: rotation q, forward F and right Rv (world x, z), voxel origin. */
export function frame(f) {
  const q = ((Math.round((f.yaw || 0) / (Math.PI / 2)) % 4) + 4) % 4;
  const F = DIRS[q], Rv = [-F[1], F[0]];
  return { q, F, Rv, CX: Math.round(f.x * VOX), CY: Math.round(f.y * VOX), CZ: Math.round(f.z * VOX) };
}

/** World voxel → local (a, y, b) (written into out). */
export function toLocal(L, vx, vy, vz, out) {
  const dx = vx - L.CX + 0.5, dz = vz - L.CZ + 0.5;
  out[0] = Math.floor(dx * L.F[0] + dz * L.F[1]);
  out[1] = vy - L.CY;
  out[2] = Math.floor(dx * L.Rv[0] + dz * L.Rv[1]);
  return out;
}

/** Local voxel → world voxel [vx, vy, vz]. */
export function toWorldVox(L, a, y, b) {
  const u = a + 0.5, v = b + 0.5;
  return [Math.round(L.CX + u * L.F[0] + v * L.Rv[0] - 0.5), L.CY + y, Math.round(L.CZ + u * L.F[1] + v * L.Rv[1] - 0.5)];
}

/** Local point (continuous voxel units) → world metres {x, y, z}. */
export function toWorld(L, u, y, v) {
  return { x: (L.CX + u * L.F[0] + v * L.Rv[0]) / VOX, y: (L.CY + y) / VOX, z: (L.CZ + u * L.F[1] + v * L.Rv[1]) / VOX };
}

/** three.js rotation.y that turns a model's +z toward the local direction (da, db). */
export function yawOf(L, da, db) {
  const wx = da * L.F[0] + db * L.Rv[0], wz = da * L.F[1] + db * L.Rv[1];
  return Math.atan2(wx, wz);
}

/** Zone from a ruin id ('R31' → 3). */
export const zoneOf = (f) => (f.id && /^R(\d)/.test(f.id) ? +f.id[1] : 1);

/** Which puzzle guards a dungeon of this kind in this zone (the generator names one; this is the fallback). */
export function puzzleFor(kind, zone) {
  if (kind === 'cell') return zone % 2 ? 'switch' : 'levers';
  if (kind === 'vault') return zone % 2 ? 'dials' : 'plates';
  if (kind === 'fortress') return zone % 2 ? 'levers' : 'beams';
  return 'valve';
}

/** A small seeded random stream (for layouts). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (a0, a1) => a0 + Math.floor(r() * (a1 - a0 + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

/** n distinct symbols (glyph ids) from the dial set, shuffled by the stream. */
export function pickSymbols(r, n) {
  const s = SYMBOLS.slice();
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return s.slice(0, n);
}

/**
 * The treasure room shell: interior box [a0, a1) × [y0, y1) × [b0, b1). Returns the outside
 * Chebyshev distance in voxels (0 inside).
 */
export function boxDist(B, a, y, b) {
  const da = a < B.a0 ? B.a0 - a : a >= B.a1 ? a - B.a1 + 1 : 0;
  const dy = y < B.y0 ? B.y0 - y : y >= B.y1 ? y - B.y1 + 1 : 0;
  const db = b < B.b0 ? B.b0 - b : b >= B.b1 ? b - B.b1 + 1 : 0;
  return Math.max(da, dy, db);
}

/**
 * The inside of a treasure room: gold-leafed walls with a mosaic band, a mosaic floor, the hoard
 * heaps, niches. d = boxDist; returns a material or -1 (not this region).
 * (protected: the lining is backed by bedrock, so the only way in is the sealed door)
 */
export function treasureVox(L, B, a, y, b, d, vx, vy, vz) {
  if (d > 4) return -1;
  if (d >= 2) return M.BEDROCK;
  const s = L.seed;
  if (d === 1) {
    if (y < B.y0) {
      // floor: a gold-bordered mosaic
      const ea = Math.min(a - B.a0, B.a1 - 1 - a), eb = Math.min(b - B.b0, B.b1 - 1 - b), e = Math.min(ea, eb);
      if (e < 0) return M.GILT;
      if (e < 2) return M.MOS_G;
      if (e < 3) return M.MOS_K;
      return ((a + b) & 3) === 0 || ((a - b) & 3) === 0 ? M.MOS_R : M.MOS_W;
    }
    if (y >= B.y1) return (a + b) % 9 === 0 ? M.MOS_G : M.GILT;
    // walls: dark plinth, gold leaf, a band of red-and-blue tesserae
    const yy = y - B.y0;
    if (yy < 3) return M.RDARK;
    if (yy > 15 && yy < 19) return yy === 17 ? (((a + b) >> 1) & 1 ? M.MOS_R : M.MOS_B) : M.MOS_G;
    return h3(vx >> 1, vy >> 1, vz >> 1, s + 3) < 0.08 ? M.RSTONE : M.GILT;
  }
  // inside: the hoard heaps (gold you can dig out)
  const hs = L.P.hoards;
  for (let i = 0; i < hs.length; i++) {
    const hd = hs[i];
    const dd = hyp((a + 0.5 - hd.a) / hd.r, (b + 0.5 - hd.b) / hd.r);
    const top = hd.h * (1 - dd * dd) + (h3(vx, 0, vz, s + 5) - 0.5) * 2;
    if (dd < 1 && y - B.y0 < top) return M.HOARD;
  }
  return 0;
}

/** Natural rock (what was there before the ruin): not air, not water/lava, not someone's build. */
export const natural = (m) => m > 0 && m < 40 && m !== M.BEDROCK && m !== M.TIMBER && m !== M.BOARDS && m !== M.BURROW && m !== M.LANTERN && m !== M.BRICK && m !== M.DOOR && m !== M.LADDER;

/**
 * Growth breaking into the ruins, by zone: roots up top, crystal in the grotto, icicles in the
 * frost, nothing in the magma (it dries everything). Hanging strand material, or 0.
 */
export function strandMat(zone) {
  return zone <= 2 ? M.ROOTS : zone === 3 || zone === 6 ? M.CRYSTAL : zone === 5 ? M.ICE : 0;
}

/** A hanging strand from a ceiling at height top over column (a, b): length or 0. */
export function strandLen(L, a, b, rate = 0.012) {
  const h = h3(a, b, 7, L.seed + 11);
  if (h > rate) return 0;
  return 6 + Math.floor((h / rate) * 22);
}

/** Glyph pixel lookups at scale k (k voxels per glyph pixel) inside a panel. */
export function glyphPix(g, px, py, k = 1) {
  return glyphAt(g, Math.floor(px / k), Math.floor(py / k));
}

export const ROOT = M.ROOTS;
