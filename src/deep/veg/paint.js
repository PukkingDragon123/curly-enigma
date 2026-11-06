// Small deterministic helpers for the cave plants' voxel models (./plants.js, ./vox.js): a pixel
// hash, a seeded random, colour ramps and mixing.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Deterministic hash of a cell → [0, 1). */
export function ph(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Seeded random: r() → [0, 1), r.range(a, b), r.int(a, b), r.pick(arr). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (x, y) => x + r() * (y - x);
  r.int = (x, y) => x + Math.floor(r() * (y - x + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}
/** A colour ramp (dark → light) indexed by a fractional tone, clamped. */
export const tone = (R, t) => R[clamp(Math.round(t), 0, R.length - 1)];
export function shade(hex, k) {
  const r = clamp(Math.round(((hex >> 16) & 255) * k), 0, 255), g = clamp(Math.round(((hex >> 8) & 255) * k), 0, 255), b = clamp(Math.round((hex & 255) * k), 0, 255);
  return (r << 16) | (g << 8) | b;
}
export function mix(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
