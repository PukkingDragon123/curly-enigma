// Hand-pixeled building blocks for the gear / weapon icons (gear.js, gearTools.js,
// gearWear.js, gearWeapons.js). Everything is lit from the top-left like the rest of the
// icon set, but painted the way a pixel artist would: a crisp dark ink outline with a
// selective tint, dark seams where parts overlap, faceted planes instead of smooth
// gradients, 45° "stripe" shading for diagonal handles and blades, wood grain, leather
// wraps, hammer marks, rivets, stitching and small glints.
import { mat, mix, toHsl, fromHsl, towardHue, lum } from './color.js';
import { Mask, hash2, vnoise, bayer, LIGHT, toneOf, sparkle } from './shade.js';

export const SZ = 32;
export const M = () => new Mask(SZ, SZ);
export { mat, mix, hash2, vnoise, bayer, lum };

const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Light reaching a surface with normal (nx, ny, nz). */
export const lightOf = (nx, ny, nz) => { const n = nrm(nx, ny, nz); return n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]; };
/** Ramp index (1..5) a surface with this normal gets; bias adds light. */
export const toneN = (nx, ny, nz, bias = 0) => clamp(Math.floor(toneOf(lightOf(nx, ny, nz) + bias)), 1, 5);
/** Ramp color by index, clamped to 0..6. */
export const T = (R, k) => R[clamp(Math.round(k), 0, 6)];

/** Mask of opaque pixels. */
export function solid(pc, minA = 160) {
  const k = M();
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) if (pc.alpha(x, y) >= minA) k.set(x, y);
  return k;
}

/** Step an R-colored pixel's tone by dk (clamped to lo..hi). Returns false when the pixel is not from R. */
export function step(pc, R, x, y, dk, lo = 1, hi = 5) {
  const k = R.indexOf(pc.get(x, y));
  if (k < 0) return false;
  pc.set(x, y, R[clamp(k + dk, lo, hi)]);
  return true;
}

/** Paint every pixel of mask with color c (or c(x, y)). */
export function paint(pc, mask, c, emit = 0) {
  mask.each((x, y) => { pc.set(x, y, typeof c === 'function' ? c(x, y) : c); if (emit) pc.emit(x, y, emit); });
}

// ---------------------------------------------------------------- outlines & seams
/** Dark ink tinted toward the fill it borders (lit = a touch lighter for the top-left rim). */
export function inkOf(c, lit = false) {
  let [h, s, l] = toHsl(c);
  if (s < 0.1) { h = 235; s = 0.22; }
  return fromHsl(towardHue(h, 262, 16), Math.min(0.72, s * 0.65 + 0.2), lit ? 0.12 + l * 0.1 : 0.075 + l * 0.06);
}

/**
 * The silhouette's ink outline: every empty pixel touching an opaque one (4-neighbourhood)
 * becomes a dark, hue-tinted ink. o: color (fixed), minA, skip(x, y) → true to leave a gap.
 */
export function ink(pc, o = {}) {
  const minA = o.minA ?? 160;
  const A = (x, y) => pc.alpha(x, y) >= minA;
  const add = [];
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    if (A(x, y)) continue;
    const r = A(x + 1, y), b = A(x, y + 1), l = A(x - 1, y), t = A(x, y - 1);
    if (!(r || b || l || t)) continue;
    if (o.skip && o.skip(x, y)) continue;
    // sample the darkest neighbour so the ink reads as that material's shadow
    let src = -1, sl = 9;
    for (const [nx, ny, ok] of [[x + 1, y, r], [x, y + 1, b], [x - 1, y, l], [x, y - 1, t]]) {
      if (!ok) continue;
      const c = pc.getHex(nx, ny), cl = lum(c);
      if (cl < sl) { sl = cl; src = c; }
    }
    const lit = (r || b) && !(l || t);
    add.push(x, y, o.color ?? inkOf(src, lit));
  }
  for (let i = 0; i < add.length; i += 3) pc.set(add[i], add[i + 1], add[i + 2]);
}

/**
 * A 1px seam just outside `mask` over pixels that are already painted, so a part laid over
 * another reads as separate. c: color, a function (x, y, under) → color, or 'shadow'
 * (darkens what is underneath, strongest on the part's bottom-right).
 */
export function seam(pc, mask, c = 'shadow', o = {}) {
  const out = mask.clone().dilate(1, !!o.diag).sub(mask);
  out.each((x, y) => {
    if (pc.alpha(x, y) < 160) return;
    if (o.only && !o.only(x, y)) return;
    const under = pc.getHex(x, y);
    if (c === 'shadow') {
      const br = mask.get(x - 1, y) || mask.get(x, y - 1); // pixel lies bottom-right of the part
      pc.set(x, y, shadowOf(under, br ? 0.42 : 0.6));
    } else pc.set(x, y, typeof c === 'function' ? c(x, y, under) : c);
  });
}

/** A darker, cooler version of a color (cast shadow / seam). */
export function shadowOf(c, f = 0.55) {
  const [h, s, l] = toHsl(c);
  return fromHsl(towardHue(h, 258, 22), Math.min(1, s * 1.05 + 0.06), l * f);
}

/** Lighter, warmer version of a color. */
export function liftOf(c, t = 0.3) {
  let [h, s, l] = toHsl(c);
  if (s < 0.06) { h = 48; s = 0.08; }
  return fromHsl(towardHue(h, 50, 10), s * 0.92, l + (0.97 - l) * t);
}

/** Cast a contact shadow of `mask` one pixel down-right onto what is painted there. */
export function cast(pc, mask, dx = 1, dy = 1, f = 0.62) {
  const pts = [];
  mask.each((x, y) => { const X = x + dx, Y = y + dy; if (!mask.get(X, Y) && pc.alpha(X, Y) >= 160) pts.push(X, Y); });
  for (let i = 0; i < pts.length; i += 2) pc.set(pts[i], pts[i + 1], shadowOf(pc.getHex(pts[i], pts[i + 1]), f));
}

// ---------------------------------------------------------------- shading
/**
 * Bevel shading: a flat face with a lit rim on its top-left edges and a shaded rim on its
 * bottom-right edges (hi/lo = rim widths). o: base, hiK, loK (ramp indices), hi2 (second ring).
 */
export function bevel(pc, mask, R, o = {}) {
  const base = o.base ?? 3, hiK = o.hiK ?? base - 1, loK = o.loK ?? base + 1;
  const hw = o.hi ?? 1, lw = o.lo ?? 1;
  const out = (x, y) => !mask.get(x, y);
  mask.each((x, y) => {
    let dtl = 99, dbr = 99;
    for (let k = 1; k <= 3; k++) {
      if (dtl === 99 && (out(x - k, y) || out(x, y - k) || (o.diag !== false && out(x - k, y - k)))) dtl = k;
      if (dbr === 99 && (out(x + k, y) || out(x, y + k) || (o.diag !== false && out(x + k, y + k)))) dbr = k;
    }
    let k = base;
    if (dtl <= hw && dtl <= dbr) k = hiK;
    else if (dbr <= lw) k = loK;
    else if (o.hi2 && dtl <= hw + 1) k = base - 0.5 > hiK ? Math.ceil(base - 0.5) : hiK + 1;
    if (o.tex) k += o.tex(x, y, k) || 0;
    pc.set(x, y, T(R, clamp(k, o.min ?? 1, o.max ?? 5)));
  });
}

/**
 * A spine with a width profile, with per-pixel coordinates: s (0..1 along), v (signed
 * distance across; + = left of the direction of travel), w (half width), (tx, ty) tangent.
 * Returns { mask, S, V, Wd, TX, TY }.
 */
export function sweep(spine, wid, o = {}) {
  const n = o.n ?? 120;
  const P = [];
  for (let i = 0; i <= n; i++) { const s = i / n; const [x, y] = spine(s); P.push([x, y, s]); }
  const tan = P.map((_, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const res = { mask: M(), S: new Float32Array(SZ * SZ).fill(NaN), V: new Float32Array(SZ * SZ), Wd: new Float32Array(SZ * SZ), TX: new Float32Array(SZ * SZ), TY: new Float32Array(SZ * SZ) };
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const px = x + 0.5, py = y + 0.5;
    let bi = -1, bd = 1e9;
    for (let i = 0; i <= n; i++) { const d = (P[i][0] - px) ** 2 + (P[i][1] - py) ** 2; if (d < bd) { bd = d; bi = i; } }
    const [sx, sy, s] = P[bi], [tx, ty] = tan[bi];
    const along = (px - sx) * tx + (py - sy) * ty;
    if ((bi === 0 && along < -(o.capStart ?? 0.3)) || (bi === n && along > (o.capEnd ?? 0.3))) continue;
    const v = (px - sx) * ty - (py - sy) * tx; // + = right-hand normal (screen coords: y down)
    const w = wid(s);
    if (Math.abs(v) > w) continue;
    const i = y * SZ + x;
    res.mask.set(x, y); res.S[i] = s; res.V[i] = v; res.Wd[i] = w; res.TX[i] = tx; res.TY[i] = ty;
  }
  return res;
}

/**
 * Facet shading of a sweep: two planes meeting at a ridge along the spine (tilt = slope),
 * steeper bevels within `edge` px of each rim, optional rounded profile (round: true).
 * Returns per-pixel tone indices (Int8Array).
 */
export function facetSweep(pc, sw, R, o = {}) {
  const slope = o.slope ?? 0.75, edge = o.edge ?? 0, edgeK = o.edgeK ?? 2.2, bias = o.bias ?? 0;
  const K = new Int8Array(SZ * SZ);
  sw.mask.each((x, y) => {
    const i = y * SZ + x;
    const v = sw.V[i], w = Math.max(0.6, sw.Wd[i]), tx = sw.TX[i], ty = sw.TY[i];
    const side = v >= 0 ? 1 : -1;
    const ox = ty * side, oy = -tx * side; // outward across direction on this side
    let nx, ny, nz;
    if (o.round) {
      const u = clamp(v / w, -0.97, 0.97) * (o.round === true ? 1 : o.round);
      nx = ty * u; ny = -tx * u; nz = Math.sqrt(Math.max(0.05, 1 - u * u));
    } else {
      const k = Math.abs(v) > w - edge ? slope * edgeK : (Math.abs(v) < (o.flat ?? 0) ? 0 : slope);
      nx = ox * k; ny = oy * k; nz = 1;
    }
    let k = toneN(nx, ny, nz, bias + (o.tex ? o.tex(x, y, sw.S[i], v) : 0));
    k = clamp(k, o.min ?? 1, o.max ?? 5);
    K[i] = k;
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, o.emit);
  });
  return K;
}

// ---------------------------------------------------------------- sticks (handles, hafts)
/**
 * A straight round stick from (x0, y0) to (x1, y1) with radius r (or [r0, r1]), shaded in
 * crisp stripes across its width. o.tones: ramp indices from the lit side to the shaded side
 * (default [1, 2, 3, 3, 4, 5]); o.grain: wood streaks; o.knots: [u 0..1, ...];
 * o.clip: mask to cut away. Returns the mask with .uv(x, y) → [u (px along), v (px across)].
 */
export function stick(pc, x0, y0, x1, y1, r, R, o = {}) {
  const r0 = Array.isArray(r) ? r[0] : r, r1 = Array.isArray(r) ? r[1] : r;
  const m = M().capsule(x0, y0, x1, y1, [r0, r1]);
  if (o.flatEnds) {
    // trim the round caps flat
    m.fn(() => false);
    const ax0 = x1 - x0, ay0 = y1 - y0, L0 = Math.hypot(ax0, ay0) || 1;
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const u = (px * ax0 + py * ay0) / L0, v = (-px * ay0 + py * ax0) / L0;
      if (u < -0.2 || u > L0 + 0.2) continue;
      const rr = r0 + (r1 - r0) * clamp(u / L0, 0, 1);
      if (Math.abs(v) <= rr) m.set(x, y);
    }
  }
  if (o.clip) m.sub(o.clip);
  const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay) || 1;
  const ux = ax / L, uy = ay / L;
  // perpendicular pointing away from the light
  let px = -uy, py = ux;
  if (px * LIGHT[0] + py * LIGHT[1] > 0) { px = -px; py = -py; }
  const tones = o.tones || [1, 2, 3, 3, 4, 5];
  const uv = (x, y) => { const qx = x + 0.5 - x0, qy = y + 0.5 - y0; return [qx * ux + qy * uy, qx * px + qy * py]; };
  m.uv = uv;
  m.each((x, y) => {
    const [u, v] = uv(x, y);
    const rr = r0 + (r1 - r0) * clamp(u / L, 0, 1);
    const q = clamp((v / Math.max(0.5, rr) + 1) / 2, 0, 0.999);
    let k = tones[Math.floor(q * tones.length)];
    if (o.grain) {
      const g = vnoise(u * 0.32 + 3.1, v * 1.25 + (o.seed || 1) * 7.3, o.seed || 1);
      if (g > 0.7 && k >= 2 && k <= 4) k++;
      else if (g < 0.12 && k >= 3 && k <= 4) k--;
    }
    if (o.knots) for (const ku of o.knots) {
      const dk = Math.hypot((u - ku * L) * 0.8, v + 0.2);
      if (dk < 0.75) k = Math.min(5, k + 2);
      else if (dk < 1.5 && u > ku * L) k = Math.max(1, k - 1);
    }
    if (o.tex) k += o.tex(x, y, u, v, k) || 0;
    k = clamp(k, o.min ?? 1, o.max ?? 5);
    pc.set(x, y, R[k]);
  });
  return m;
}

/**
 * Leather / cord wrap around a stick between u0..u1 (px along from (x0, y0)), slightly
 * proud of it (grow), in bands of `period` px that lean by `slant`. Each band: lit lip,
 * body, dark overlap seam. Returns the mask.
 */
export function wrapStick(pc, x0, y0, x1, y1, r, u0, u1, R, o = {}) {
  const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay) || 1;
  const ux = ax / L, uy = ay / L;
  const grow = o.grow ?? 0.45, period = o.period ?? 2.4, slant = o.slant ?? 0.7;
  const m = M().capsule(x0 + ux * u0, y0 + uy * u0, x0 + ux * u1, y0 + uy * u1, r + grow);
  if (o.clip) m.sub(o.clip);
  let px = -uy, py = ux;
  if (px * LIGHT[0] + py * LIGHT[1] > 0) { px = -px; py = -py; }
  const tones = o.tones || [2, 2, 3, 3, 4, 5];
  m.each((x, y) => {
    const qx = x + 0.5 - x0, qy = y + 0.5 - y0;
    const u = qx * ux + qy * uy, v = qx * px + qy * py;
    const q = clamp((v / (r + grow) + 1) / 2, 0, 0.999);
    let k = tones[Math.floor(q * tones.length)];
    const w = u + v * slant;
    const f = (((w - u0) % period) + period) % period / period;
    if (f < 0.3) k += 2;            // the overlap: deep crease
    else if (f < 0.55) k -= 1;      // the next band's raised, lit lip
    if (o.tex) k += o.tex(x, y, u, v, k) || 0;
    pc.set(x, y, R[clamp(k, 1, 5)]);
  });
  return m;
}

// ---------------------------------------------------------------- surface detail
/**
 * Hammer marks: small dimples (a darker pixel with a lit lower-right lip) scattered over the
 * interior of a metal part. o: dens, seed, only (x, y) → bool.
 */
export function dents(pc, mask, R, o = {}) {
  const dens = o.dens ?? 0.07, seed = o.seed ?? 5;
  const used = M();
  mask.each((x, y) => {
    if (!(mask.get(x - 1, y) && mask.get(x + 1, y) && mask.get(x, y - 1) && mask.get(x, y + 1) && mask.get(x + 1, y + 1))) return;
    if (hash2(x, y, seed) > dens) return;
    if (used.get(x - 1, y) || used.get(x, y - 1) || used.get(x - 1, y - 1) || used.get(x + 1, y - 1)) return;
    if (o.only && !o.only(x, y)) return;
    const k = R.indexOf(pc.get(x, y));
    if (k < 1 || k > 4) return;
    pc.set(x, y, R[Math.min(5, k + 1)]);
    const k2 = R.indexOf(pc.get(x + 1, y + 1));
    if (k2 >= 2 && hash2(x, y, seed + 1) < 0.75) pc.set(x + 1, y + 1, R[k2 - 1]);
    used.set(x, y);
  });
}

/** Sparse pits / pores: darken (and rarely lighten) single pixels inside mask. */
export function pits(pc, mask, R, dens = 0.05, seed = 3, light = 0.015) {
  mask.each((x, y) => {
    const h = hash2(x, y, seed);
    if (h < dens) step(pc, R, x, y, 1);
    else if (h > 1 - light) step(pc, R, x, y, -1);
  });
}

/** Rivet / nail head: lit pixel with a shadow below-right (big = 2×2 dome). */
export function rivet(pc, x, y, R, big = false) {
  if (big) {
    pc.set(x, y, R[1]); pc.set(x + 1, y, R[2]); pc.set(x, y + 1, R[3]); pc.set(x + 1, y + 1, R[5]);
    pc.set(x, y, R[0]);
  } else {
    pc.set(x, y, R[1]); pc.set(x + 1, y + 1, R[5]);
  }
}

/** Running stitch along a polyline: every `gap`-th pixel gets the thread color. */
export function stitch(pc, pts, c, o = {}) {
  const gap = o.gap ?? 2, mask = o.mask;
  let n = o.phase ?? 0;
  let last = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let k = 0; k <= L; k++) {
      const x = Math.floor(ax + (bx - ax) * k / L), y = Math.floor(ay + (by - ay) * k / L);
      if (last && last[0] === x && last[1] === y) continue;
      last = [x, y];
      if (n++ % gap === 0 && (!mask || mask.get(x, y))) pc.set(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  }
}

/** Pixel line (Bresenham) with optional mask clip; c may be a function (i, x, y) → color. */
export function line(pc, x0, y0, x1, y1, c, mask = null, emit = 0) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 200; i++) {
    if (!mask || mask.get(x0, y0)) {
      const col = typeof c === 'function' ? c(i, x0, y0) : c;
      if (col !== null && col !== undefined) { pc.set(x0, y0, col); if (emit) pc.emit(x0, y0, emit); }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Glint: a white core with ramp-tinted arms (r 0 = single pixel). */
export function glint(pc, x, y, r = 1, mid = 0xfff6dc, emit = 0) {
  if (r <= 0) { pc.set(x, y, 0xffffff); if (emit) pc.emit(x, y, emit); return; }
  sparkle(pc, x, y, r, 0xffffff, mid, emit);
}

/** Scratch: a short light (or dark) diagonal line across a metal face. */
export function scratch(pc, x, y, len, R, mask, dir = [1, 1], dk = -1) {
  for (let i = 0; i < len; i++) {
    const X = x + dir[0] * i, Y = y + dir[1] * i;
    if (mask && !mask.get(X, Y)) continue;
    step(pc, R, X, Y, dk);
  }
}

/** Pixels of mask within distance d (4-neighbourhood steps) of its edge. */
export function rim(mask, d = 1) {
  const inner = mask.clone().erode(d);
  return mask.clone().sub(inner);
}

/** Mask from a predicate over 45° "stripe" coordinates: A = (x − y) / 2 along the bottom-left → top-right diagonal, d = x + y − 31 across (− = top-left). */
export function diagMask(f) {
  return M().fn((x, y) => f((x - y) / 2, x + y - 31));
}
/** Continuous canvas point for stripe coordinates (A along, d across). */
export const diagAt = (A, d = 0) => [(2 * A + d + 32) / 2, (d + 32 - 2 * A) / 2];

/** Ramps shared by the gear icons. */
export const RAMPS = {
  wood: () => mat(0x9a6438, { cont: 1.08 }),
  ash: () => mat(0xb88a56, { cont: 1.02 }),
  darkWood: () => mat(0x6a3f24, { cont: 1.1 }),
  oldWood: () => mat(0x8a6a4a, { cont: 0.95, sat: 0.8 }),
  leather: () => mat(0x7a4426, { cont: 1.05 }),
  darkLeather: () => mat(0x4a2a1c, { cont: 1.1 }),
  brass: () => mat(0xcf9a3a, { cont: 1.2, warm: 52 }),
  gold: () => mat(0xe8b438, { cont: 1.2, warm: 54 }),
  iron: () => mat(0x6e7380, { cont: 1.15 }),
  steel: () => mat(0xa4b0bc, { cont: 1.25 }),
  twine: () => mat(0xc4a46a, { cont: 0.95 }),
};
