// Hand-pixeled building blocks for the gear / weapon icons (gear.js, gearTools.js,
// gearWear.js, gearWeapons.js). Everything is lit from the top-left like the rest of the
// icon set, but painted the way a pixel artist would: a crisp dark ink outline with a
// selective tint, dark seams where parts overlap, faceted planes instead of smooth
// gradients, 45° "stripe" shading for diagonal handles and blades, wood grain, leather
// wraps, hammer marks, rivets, stitching and small glints.
//
// Resolution: every builder takes design coordinates (the 32-unit grid, see res.js) and paints
// natively at S×, so outlines, seams, rims, stitches and texture stay one real pixel wide.
import { mat, mix, toHsl, fromHsl, towardHue, lum } from './color.js';
import { hash2, vnoise, bayer, LIGHT, toneOf } from './shade.js';
import { S, SZ, DM, dc, nc, np, dot, dotE, grain, alphaD, getD } from './res.js';

export const M = DM;
export { mat, mix, hash2, vnoise, bayer, lum, S, SZ, dc, nc, np, dot, dotE, grain, alphaD, getD };

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
 * (darkens what is underneath, strongest on the part's bottom-right; at S > 1 the shadow
 * gets a second, softer pixel on the bottom-right so the part sits proud of what's behind).
 */
export function seam(pc, mask, c = 'shadow', o = {}) {
  const out = mask.clone().dilate(1, !!o.diag).sub(mask);
  let soft = null;
  if (c === 'shadow' && S > 1 && o.soft !== false) {
    soft = [];
    mask.clone().dilate(2, true).sub(mask.clone().dilate(1, true)).each((x, y) => {
      if (pc.alpha(x, y) < 160 || (o.only && !o.only(x, y))) return;
      // only below-right of the part (a cast shadow, not a halo)
      if (!(mask.get(x - 2, y) || mask.get(x, y - 2) || mask.get(x - 1, y - 1) || mask.get(x - 2, y - 1) || mask.get(x - 1, y - 2))) return;
      if (mask.get(x + 1, y) || mask.get(x, y + 1) || mask.get(x + 2, y) || mask.get(x, y + 2)) return;
      soft.push(x, y, shadowOf(pc.getHex(x, y), 0.8));
    });
  }
  out.each((x, y) => {
    if (pc.alpha(x, y) < 160) return;
    if (o.only && !o.only(x, y)) return;
    const under = pc.getHex(x, y);
    if (c === 'shadow') {
      const br = mask.get(x - 1, y) || mask.get(x, y - 1); // pixel lies bottom-right of the part
      pc.set(x, y, shadowOf(under, br ? 0.42 : 0.6));
    } else pc.set(x, y, typeof c === 'function' ? c(x, y, under) : c);
  });
  if (soft) for (let i = 0; i < soft.length; i += 3) pc.set(soft[i], soft[i + 1], soft[i + 2]);
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

/**
 * Cast a contact shadow of `mask` (dx, dy) design px down-right onto what is painted there
 * (at S > 1 the band's outer pixel is softer).
 */
export function cast(pc, mask, dx = 1, dy = 1, f = 0.62) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) * S));
  const sx = dx / Math.max(Math.abs(dx), Math.abs(dy), 1e-6), sy = dy / Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
  const done = new Uint8Array(pc.w * pc.h), pts = [];
  for (let k = 1; k <= n; k++) {
    const ff = k === n && n > 1 ? (1 + f) / 2 : f;
    mask.each((x, y) => {
      const X = x + Math.round(sx * k), Y = y + Math.round(sy * k);
      if (!pc.inb(X, Y) || done[Y * pc.w + X] || mask.get(X, Y) || pc.alpha(X, Y) < 160) return;
      done[Y * pc.w + X] = 1;
      pts.push(X, Y, ff);
    });
  }
  for (let i = 0; i < pts.length; i += 3) pc.set(pts[i], pts[i + 1], shadowOf(pc.getHex(pts[i], pts[i + 1]), pts[i + 2]));
}

// ---------------------------------------------------------------- shading
/**
 * Bevel shading: a flat face with a lit rim on its top-left edges and a shaded rim on its
 * bottom-right edges (hi/lo = rim widths in real px). o: base, hiK, loK (ramp indices),
 * hi2 (second ring), tex(x, y, k) → tone offset (native x, y).
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
 * A spine with a width profile (design units), rasterised natively, with per-pixel
 * coordinates: s (0..1 along), v (signed distance across in design px; + = left of the
 * direction of travel), w (half width), (tx, ty) tangent. Arrays are indexed y * SZ + x.
 * Returns { mask, S, V, Wd, TX, TY }.
 */
export function sweep(spine, wid, o = {}) {
  const n = o.n ?? 160;
  const P = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, wm = 0;
  for (let i = 0; i <= n; i++) {
    const s = i / n; const [x, y] = spine(s);
    P.push([x * S, y * S, s]);
    const w = wid(s) * S;
    if (w > wm) wm = w;
    if (x * S < x0) x0 = x * S; if (x * S > x1) x1 = x * S; if (y * S < y0) y0 = y * S; if (y * S > y1) y1 = y * S;
  }
  const tan = P.map((_, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const N = SZ * SZ;
  const res = { mask: M(), S: new Float32Array(N).fill(NaN), V: new Float32Array(N), Wd: new Float32Array(N), TX: new Float32Array(N), TY: new Float32Array(N) };
  const pad = wm + S;
  const ya = Math.max(0, Math.floor(y0 - pad)), yb = Math.min(SZ - 1, Math.ceil(y1 + pad));
  const xa = Math.max(0, Math.floor(x0 - pad)), xb = Math.min(SZ - 1, Math.ceil(x1 + pad));
  const cs = (o.capStart ?? 0.3) * S, ce = (o.capEnd ?? 0.3) * S;
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const px = x + 0.5, py = y + 0.5;
    let bi = -1, bd = 1e9;
    for (let i = 0; i <= n; i++) { const d = (P[i][0] - px) ** 2 + (P[i][1] - py) ** 2; if (d < bd) { bd = d; bi = i; } }
    if (bd > pad * pad) continue;
    const [sx, sy, s] = P[bi], [tx, ty] = tan[bi];
    const along = (px - sx) * tx + (py - sy) * ty;
    if ((bi === 0 && along < -cs) || (bi === n && along > ce)) continue;
    const v = ((px - sx) * ty - (py - sy) * tx) / S; // + = right-hand normal (screen coords: y down), design px
    const w = wid(s);
    if (Math.abs(v) > w) continue;
    const i = y * SZ + x;
    res.mask.set(x, y); res.S[i] = s; res.V[i] = v; res.Wd[i] = w; res.TX[i] = tx; res.TY[i] = ty;
  }
  return res;
}

/**
 * Facet shading of a sweep: two planes meeting at a ridge along the spine (tilt = slope),
 * steeper bevels within `edge` design px of each rim, optional rounded profile (round: true).
 * o.tex(x, y, s, v) → light offset (native x, y; v in design px).
 * Returns per-pixel tone indices (Int8Array, y * SZ + x).
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
 * A straight round stick from (x0, y0) to (x1, y1) (design px) with radius r (or [r0, r1]),
 * shaded in crisp stripes across its width. o.tones: ramp indices from the lit side to the
 * shaded side (default [1, 2, 3, 3, 4, 5]); o.grain: wood streaks (long ones plus fine 1px
 * fibres at S > 1); o.knots: [u 0..1, ...]; o.clip: mask to cut away. o.tex(x, y, u, v, k)
 * (native x, y). Returns the mask with .uv(x, y) → [u (design px along), v (across)] for a
 * native pixel.
 */
export function stick(pc, x0, y0, x1, y1, r, R, o = {}) {
  const r0 = Array.isArray(r) ? r[0] : r, r1 = Array.isArray(r) ? r[1] : r;
  const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay) || 1;
  const ux = ax / L, uy = ay / L;
  // perpendicular pointing away from the light
  let px = -uy, py = ux;
  if (px * LIGHT[0] + py * LIGHT[1] > 0) { px = -px; py = -py; }
  const uv = (x, y) => { const qx = (x + 0.5) / S - x0, qy = (y + 0.5) / S - y0; return [qx * ux + qy * uy, qx * px + qy * py]; };
  let m = M().capsule(x0, y0, x1, y1, [r0, r1]);
  if (o.flatEnds) {
    // trim the round caps flat
    m = M();
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
      const [u, v] = uv(x, y);
      if (u < -0.2 || u > L + 0.2) continue;
      const rr = r0 + (r1 - r0) * clamp(u / L, 0, 1);
      if (Math.abs(v) <= rr) m.set(x, y);
    }
  }
  if (o.clip) m.sub(o.clip);
  const tones = o.tones || [1, 2, 3, 3, 4, 5];
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
      else if (S > 1 && k >= 2 && k <= 4) {
        // fine fibres: thin broken streaks running along the grain
        const f = vnoise(u * 0.9 + 11.3, v * S * 1.6 + (o.seed || 1) * 3.1, (o.seed || 1) + 17);
        if (f > 0.8 && hash2(Math.round(u * S * 0.5), Math.round(v * S), (o.seed || 1) + 5) < 0.8) k++;
      }
    }
    if (o.knots) for (const ku of o.knots) {
      const dk = Math.hypot((u - ku * L) * 0.8, v + 0.2);
      if (dk < 0.75) k = Math.min(5, k + 2);
      else if (dk < 1.5 && u > ku * L) k = Math.max(1, k - 1);
      else if (S > 1 && dk < 2.1 && Math.abs(dk - 1.8) < 0.5 / S) k = Math.min(5, k + 1); // the knot's grain ring
    }
    if (o.tex) k += o.tex(x, y, u, v, k) || 0;
    k = clamp(k, o.min ?? 1, o.max ?? 5);
    pc.set(x, y, R[k]);
  });
  return m;
}

/**
 * Leather / cord wrap around a stick between u0..u1 (design px along from (x0, y0)), slightly
 * proud of it (grow), in bands of `period` design px that lean by `slant`. Each band: lit lip,
 * body, dark overlap seam (1 real px each). o.rows: bands of rows design px stacked down the
 * screen (a spiral on 45° handles). Returns the mask.
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
  const rows = o.rows ? o.rows * S : 0, ph = (o.phase || 0) * S;
  m.each((x, y) => {
    const qx = (x + 0.5) / S - x0, qy = (y + 0.5) / S - y0;
    const u = qx * ux + qy * uy, v = qx * px + qy * py;
    const q = clamp((v / (r + grow) + 1) / 2, 0, 0.999);
    let k = tones[Math.floor(q * tones.length)];
    if (rows) {
      const f = (((y + ph) % rows) + rows) % rows;
      if (f === 0) k += 2;                       // the overlap: deep crease
      else if (f === 1) k -= 1;                  // the next band's raised, lit lip
      else if (S > 1 && f === rows - 1) k += 1;  // the band rolls under into the crease
    } else {
      const f = (((u + v * slant - u0) % period) + period) % period / period;
      if (f < 0.3) k += 2;
      else if (f < 0.55) k -= 1;
    }
    if (o.tex) k += o.tex(x, y, u, v, k) || 0;
    pc.set(x, y, R[clamp(k, 1, 5)]);
  });
  return m;
}

// ---------------------------------------------------------------- surface detail
/**
 * Hammer marks: small dimples (a darker dent with a lit lower-right lip) scattered over the
 * interior of a metal part. o: dens (per design px), seed, only (x, y) → bool (native).
 */
export function dents(pc, mask, R, o = {}) {
  const dens = (o.dens ?? 0.07) / (S * S) * (S > 1 ? 1.6 : 1), seed = o.seed ?? 5;
  const used = M();
  const w = S > 1 ? 2 : 1;
  mask.each((x, y) => {
    for (let i = -1; i <= w; i++) if (!mask.get(x + i, y) || !mask.get(x + i, y + 1) || !mask.get(x + i, y - 1)) return;
    if (hash2(x, y, seed) > dens) return;
    for (let j = -2; j <= 1; j++) for (let i = -2; i <= w + 1; i++) if (used.get(x + i, y + j)) return;
    if (o.only && !o.only(x, y)) return;
    const k = R.indexOf(pc.get(x, y));
    if (k < 1 || k > 4) return;
    for (let i = 0; i < w; i++) step(pc, R, x + i, y, 1);
    // the lit lip on the far side of the dimple
    if (hash2(x, y, seed + 1) < 0.8) for (let i = 1; i <= w; i++) { const k2 = R.indexOf(pc.get(x + i, y + 1)); if (k2 >= 2) pc.set(x + i, y + 1, R[k2 - 1]); }
    if (S > 1 && hash2(x, y, seed + 2) < 0.5) step(pc, R, x - 1, y, 1, 1, 4);
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

/**
 * Rivet / nail head at design pixel (x, y): a lit dome with a shadow below-right.
 * At S > 1: small = a 2×2 dome with a glint, big = a 4×4 domed head with a dark rim.
 */
export function rivet(pc, x, y, R, big = false) {
  if (S === 1) {
    if (big) { pc.set(x, y, R[1]); pc.set(x + 1, y, R[2]); pc.set(x, y + 1, R[3]); pc.set(x + 1, y + 1, R[5]); pc.set(x, y, R[0]); }
    else { pc.set(x, y, R[1]); pc.set(x + 1, y + 1, R[5]); }
    return;
  }
  const X = Math.floor(x) * S, Y = Math.floor(y) * S;
  const on = (i, j) => pc.alpha(X + i, Y + j) >= 160;
  const put = (i, j, c) => { if (on(i, j)) pc.set(X + i, Y + j, c); };
  if (big) {
    const D = [[-1, 1, 2, -1], [1, 0, 2, 3], [2, 2, 3, 4], [-1, 3, 4, -1]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (D[j][i] >= 0) put(i, j, R[D[j][i]]);
    put(4, 2, R[5]); put(4, 3, R[5]); put(2, 4, R[5]); put(3, 4, R[5]); put(4, 4, R[6] ?? R[5]);
  } else {
    put(0, 0, R[0]); put(1, 0, R[2]); put(0, 1, R[2]); put(1, 1, R[4]); put(2, 2, R[5]); put(2, 1, R[5]); put(1, 2, R[5]);
  }
}

/** Running stitch along a polyline (design pts): dashes S px long, one every `gap` design px. */
export function stitch(pc, pts, c, o = {}) {
  const gap = (o.gap ?? 2) * S, mask = o.mask, on = S > 1 ? Math.min(S, gap - 1) : 1;
  let n = (o.phase ?? 0) * S;
  let last = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0] * S, ay = pts[i][1] * S, bx = pts[i + 1][0] * S, by = pts[i + 1][1] * S;
    const L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let k = 0; k <= L; k++) {
      const x = Math.floor(ax + (bx - ax) * k / L), y = Math.floor(ay + (by - ay) * k / L);
      if (last && last[0] === x && last[1] === y) continue;
      last = [x, y];
      if (n++ % gap < on && (!mask || mask.get(x, y))) pc.set(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  }
}

/** Pixel line (Bresenham, 1 real px) between design points, optional mask clip; c may be a function (i, x, y) → color (native). */
export function line(pc, x0, y0, x1, y1, c, mask = null, emit = 0) {
  x0 = nc(x0); y0 = nc(y0); x1 = nc(x1); y1 = nc(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 400; i++) {
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

/** Native 4-point star: white core, arms of length r (real px) fading to mid; r ≥ 3 adds diagonals. */
export function star(pc, X, Y, r, c = 0xffffff, mid = 0xfff6dc, emit = 0) {
  const put = (x, y, col) => { if (!pc.inb(x, y)) return; pc.set(x, y, col); if (emit) pc.emit(x, y, emit); };
  put(X, Y, c);
  for (let k = 1; k <= r; k++) {
    const col = k <= Math.max(1, r >> 1) && r > 1 ? c : mid;
    put(X + k, Y, col); put(X - k, Y, col); put(X, Y + k, col); put(X, Y - k, col);
  }
  if (r >= 3) { put(X + 1, Y + 1, mid); put(X - 1, Y - 1, mid); put(X + 1, Y - 1, mid); put(X - 1, Y + 1, mid); }
}

/** Glint at design pixel (x, y): a white core with ramp-tinted arms (r 0 = the smallest twinkle). */
export function glint(pc, x, y, r = 1, mid = 0xfff6dc, emit = 0) {
  const X = nc(x), Y = nc(y);
  if (!mid) mid = 0xfff6dc; // (some callers pass 0 just to reach `emit`)
  if (r <= 0) {
    if (S === 1) { pc.set(X, Y, 0xffffff); if (emit) pc.emit(X, Y, emit); return; }
    star(pc, X, Y, 1, 0xffffff, mid, emit);
    return;
  }
  star(pc, X, Y, r * S, 0xffffff, mid, emit);
}

/** Scratch: a short light (or dark) 1px line, len design px long, across a metal face. */
export function scratch(pc, x, y, len, R, mask, dir = [1, 1], dk = -1) {
  const X = nc(x), Y = nc(y);
  for (let i = 0; i < len * S; i++) {
    const XX = X + dir[0] * i, YY = Y + dir[1] * i;
    if (mask && !mask.get(XX, YY)) continue;
    step(pc, R, XX, YY, dk);
  }
}

/** Pixels of mask within distance d (4-neighbourhood steps, real px) of its edge. */
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
