// Organic building blocks for the living / homely icons (flora.js, fauna.js, food.js, home.js
// and the UI glyphs). Same rules as gearKit (light from the top-left, a crisp hue-tinted ink
// outline, a few flat planes instead of gradients, seams where parts overlap) but tuned for
// things that grow, ooze and get baked: lumpy "blob" silhouettes, forms painted in clean
// planes with a lit lip and reflected rim light, leaves split into a lit and a shaded half
// with veins and serrations, tapered tubes for stems and worms, fur fringes, crumbs, warts,
// creases, glossy glaze streaks and steam.
import {
  M, mat, mix, hash2, vnoise, bayer, lum, step, ink, inkOf, seam, shadowOf, liftOf, cast, toneN, T, glint, line, lightOf, sweep, facetSweep, stitch, pits, rivet, RAMPS,
} from './gearKit.js';
import { lightField, toneOf, sparkle, LIGHT } from './shade.js';

export {
  M, mat, mix, hash2, vnoise, bayer, lum, step, ink, inkOf, seam, shadowOf, liftOf, cast, toneN, T, glint, line, lightOf, sweep, facetSweep, stitch, pits, rivet, RAMPS, sparkle,
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Set a pixel and flag it emissive. */
export const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
/** Pixel lies on the top/left (lit) or bottom/right edge of a mask. */
export const isTop = (m, x, y) => !m.get(x - 1, y) || !m.get(x, y - 1);
export const isBot = (m, x, y) => !m.get(x + 1, y) || !m.get(x, y + 1);
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/** Small seeded RNG (0..1). */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Catmull-Rom spline through points → s (0..1) → [x, y]. */
export function spline(pts) {
  const n = pts.length - 1;
  return (s) => {
    const f = clamp(s, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
    return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
  };
}

// ---------------------------------------------------------------- silhouettes
/**
 * Hand-built silhouette: a closed Catmull-Rom outline through hand-placed control points.
 * A point [x, y, 1] is a sharp corner (no rounding through it). o.seg: samples per span,
 * o.jit: deterministic wobble (px) applied to the points, o.seed. Returns the filled mask
 * (with .pts = the sampled outline).
 */
export function loop(pts, o = {}) {
  const P = o.jit ? pts.map(([x, y, c], i) => [x + (hash2(i, 1, o.seed ?? 3) - 0.5) * o.jit * 2, y + (hash2(i, 2, o.seed ?? 3) - 0.5) * o.jit * 2, c]) : pts;
  const n = P.length, seg = o.seg ?? 8, out = [];
  for (let i = 0; i < n; i++) {
    const p1 = P[i], p2 = P[(i + 1) % n];
    const p0 = p1[2] ? p1 : P[(i - 1 + n) % n], p3 = p2[2] ? p2 : P[(i + 2) % n];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const m = M().poly(out);
  m.pts = out;
  return m;
}

/** Translate / scale a list of control points: [[x, y, c]...] → moved by (dx, dy), scaled about (ox, oy). */
export function movePts(pts, dx = 0, dy = 0, k = 1, ox = 16, oy = 16) {
  return pts.map(([x, y, c]) => [ox + (x - ox) * k + dx, oy + (y - oy) * k + dy, c]);
}

/**
 * Lumpy organic ellipse: the radius wobbles with a few seeded harmonics so no two are alike.
 * o: seed, lump (0..0.3 wobble), rot (radians), taper (+ = wider at the bottom, pear/egg),
 * flat (cut everything below v/ry > flat: a resting bottom), freq (harmonics).
 */
export function blob(cx, cy, rx, ry, o = {}) {
  const sd = o.seed ?? 1, lump = o.lump ?? 0.1, rot = o.rot ?? 0, taper = o.taper ?? 0;
  const fr = o.freq || [2, 3, 5, 7];
  const amp = [0.55, 0.38, 0.24, 0.15, 0.1];
  const ph = fr.map((_, i) => hash2(sd, i + 1, 91) * Math.PI * 2);
  const rad = (a) => { let r = 0; for (let i = 0; i < fr.length; i++) r += amp[i] * Math.sin(fr[i] * a + ph[i]); return 1 + lump * r; };
  const c = Math.cos(rot), s = Math.sin(rot);
  return M().fn((x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const vv = v / ry;
    if (o.flat !== undefined && vv > o.flat) return false;
    const uu = u / (rx * Math.max(0.2, 1 + taper * vv));
    return Math.hypot(uu, vv) <= rad(Math.atan2(vv, uu));
  });
}

/** Fur / fluff fringe: little tufts poking out of a mask's edge, away from (cx, cy). */
export function fringe(mask, cx, cy, o = {}) {
  const dens = o.dens ?? 0.35, seed = o.seed ?? 4, len = o.len ?? 1.6;
  const out = mask.clone();
  const edge = mask.edge();
  edge.each((x, y) => {
    if (hash2(x, y, seed) > dens) return;
    if (o.only && !o.only(x, y)) return;
    let dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    // tufts lean a little (combed), like real fur
    const lean = o.lean ?? 0.35;
    const ax = dx - dy * lean, ay = dy + dx * lean;
    const n = 1 + Math.floor(hash2(x, y, seed + 1) * len);
    for (let k = 1; k <= n; k++) out.set(Math.round(x + ax * k), Math.round(y + ay * k));
  });
  return out;
}

// ---------------------------------------------------------------- shading
/** Majority filter on a tone map: lone pixels take the tone around them (clean planes). */
export function tidy(K, mask, keep = null) {
  const src = K.slice();
  mask.each((x, y) => {
    const i = y * 32 + x, k = src[i];
    if (keep && keep(x, y, k)) return;
    const cnt = new Map();
    let same = 0, n = 0;
    for (const [dx, dy] of N8) {
      const X = x + dx, Y = y + dy;
      if (!mask.get(X, Y)) continue;
      const kk = src[Y * 32 + X];
      n++;
      if (kk === k) same++;
      cnt.set(kk, (cnt.get(kk) || 0) + 1);
    }
    if (same > 1 || n < 5) return;
    let best = k, bn = 0;
    for (const [kk, c] of cnt) if (c > bn) { bn = c; best = kk; }
    if (bn >= 4) K[i] = best;
  });
  return K;
}

/**
 * Paint a rounded form in a few flat planes: light from an ellipsoid (cx, cy, rx, ry, defaults
 * to the mask bounds) blended with a dome that follows the silhouette (dome 0..1), banded into
 * ramp tones, cleaned of stray pixels, then a lit lip on the top-left edge and a reflected rim
 * light on the bottom-right edge. o: bias, tex(x, y) → light offset, lo/hi tone clamp,
 * flatten (<1 = flatter face), round (dome bevel px), lip, rim, emit, keep (tidy guard).
 * Returns the tone map (Int8Array 32×32, -1 outside) with .mask.
 */
export function form(pc, mask, R, o = {}) {
  const b = mask.bounds();
  const K = new Int8Array(1024).fill(-1);
  K.mask = mask;
  if (!b) return K;
  const cx = o.cx ?? (b.x0 + b.x1 + 1) / 2, cy = o.cy ?? (b.y0 + b.y1 + 1) / 2;
  const rx = o.rx ?? b.w / 2 + 0.4, ry = o.ry ?? b.h / 2 + 0.4;
  const dome = o.dome ?? 0.45;
  const I = dome > 0 ? lightField(mask, { round: o.round ?? Math.max(1.5, Math.min(rx, ry) * 0.6) }).I : null;
  const lo = o.lo ?? 1, hi = o.hi ?? 5;
  mask.each((x, y) => {
    const i = y * 32 + x;
    let nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const q = nx * nx + ny * ny;
    if (q > 0.96) { const s = Math.sqrt(0.96 / q); nx *= s; ny *= s; }
    const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny)) * (o.flatten ?? 1);
    let v = lightOf(nx, ny, nz);
    if (I) v = v * (1 - dome) + I[i] * dome;
    v += (o.bias || 0) + (o.tex ? o.tex(x, y) : 0);
    K[i] = clamp(Math.floor(toneOf(v)), lo, hi);
  });
  if (o.tidy !== false) tidy(K, mask, o.keep);
  mask.each((x, y) => {
    const i = y * 32 + x;
    let k = K[i];
    const top = isTop(mask, x, y), bot = isBot(mask, x, y);
    if (o.lip !== false && top && !bot && k > lo && (x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry < 0.3) k -= 1;
    if (o.rim !== false && bot && !top && (x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry > 0.55 && k >= hi) k = hi - 1;
    K[i] = k;
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, typeof o.emit === 'function' ? o.emit(x, y, k) : o.emit);
  });
  return K;
}

/** Re-tone a tone map onto pc (after editing K). */
export function paintK(pc, K, R) { K.mask.each((x, y) => pc.set(x, y, R[K[y * 32 + x]])); }

/**
 * Highlight arc just inside the top-left contour (a wet / glazed / glassy sheen):
 * pixels at distance inset..inset+width from the edge whose direction from (cx, cy) lies
 * between angles a0..a1 (radians, screen space; -2.4 ≈ top-left). gap: break every n px.
 */
export function sheen(pc, mask, c, o = {}) {
  const b = mask.bounds();
  if (!b) return;
  const cx = o.cx ?? (b.x0 + b.x1 + 1) / 2, cy = o.cy ?? (b.y0 + b.y1 + 1) / 2;
  const inset = o.inset ?? 1, width = o.width ?? 1, a0 = o.a0 ?? -2.7, a1 = o.a1 ?? -1.6;
  const inner = mask.clone().erode(inset), core = inner.clone().erode(width);
  let n = 0;
  inner.each((x, y) => {
    if (core.get(x, y)) return;
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    if (a < a0 || a > a1) return;
    n++;
    if (o.gap && n % o.gap === 0) return;
    pc.set(x, y, typeof c === 'function' ? c(x, y) : c);
  });
}

// ---------------------------------------------------------------- surface texture
/**
 * Short strokes stepped one tone darker (creases, grain, crumb holes), each with a lit pixel
 * on its lower side so it reads as a groove. o: dens, seed, len (max px), dir ([dx, dy] or
 * (x, y) → [dx, dy]), lit (true), dk (+1 darker), only(x, y), lo/hi.
 */
export function marks(pc, mask, R, o = {}) {
  const dens = o.dens ?? 0.05, seed = o.seed ?? 3, len = o.len ?? 2;
  const used = M();
  const inner = o.edge ? mask : mask.clone().erode(1);
  inner.each((x, y) => {
    if (hash2(x, y, seed) > dens) return;
    if (o.only && !o.only(x, y)) return;
    for (const [dx, dy] of N8) if (used.get(x + dx, y + dy)) return;
    const d = typeof o.dir === 'function' ? o.dir(x, y) : (o.dir || [1, 0]);
    const L = 1 + Math.floor(hash2(x, y, seed + 1) * len);
    const pts = [];
    for (let k = 0; k < L; k++) { const X = Math.round(x + d[0] * k), Y = Math.round(y + d[1] * k); if (!mask.get(X, Y)) break; pts.push([X, Y]); }
    for (const [X, Y] of pts) { step(pc, R, X, Y, o.dk ?? 1, o.lo ?? 1, o.hi ?? 5); used.set(X, Y); }
    if (o.lit !== false && pts.length) {
      // lit lip on the side away from the light
      const lx = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1, ly = 1 - lx;
      const [X, Y] = pts[0];
      if (mask.get(X + lx, Y + ly) && !used.get(X + lx, Y + ly)) step(pc, R, X + lx, Y + ly, -1, o.lo ?? 1, o.hi ?? 5);
    }
  });
}

/** Raised warts / grains: a lit pixel with a shadow pixel below-right. */
export function bumps(pc, mask, R, o = {}) {
  const dens = o.dens ?? 0.06, seed = o.seed ?? 9;
  const used = M();
  mask.clone().erode(1).each((x, y) => {
    if (hash2(x, y, seed) > dens) return;
    if (o.only && !o.only(x, y)) return;
    if (used.get(x - 1, y) || used.get(x, y - 1) || used.get(x - 1, y - 1) || used.get(x + 1, y - 1)) return;
    step(pc, R, x, y, -(o.up ?? 1), 1, 5);
    if (mask.get(x + 1, y + 1)) step(pc, R, x + 1, y + 1, o.down ?? 1, 1, 5);
    if (o.big && mask.get(x + 1, y)) step(pc, R, x + 1, y, -1, 1, 5);
    used.set(x, y);
  });
}

/** Scatter single pixels of the given colors (or ramp offsets) over a mask. */
export function speckle(pc, mask, cols, dens = 0.05, seed = 5, only = null) {
  mask.each((x, y) => {
    const h = hash2(x, y, seed);
    if (h > dens || (only && !only(x, y))) return;
    const c = cols[Math.floor(hash2(x, y, seed + 7) * cols.length)];
    pc.set(x, y, c);
  });
}

// ---------------------------------------------------------------- leaves, petals, stems
/**
 * An organic leaf / petal blade from the base (x0, y0) to the tip (x1, y1), half width w.
 * Shaded as two planes either side of a raised midrib (the half facing the light is lit),
 * with a lit lip, darker tip/base, side veins, optional serrated edge.
 * o: bend (sideways bow, px), curl (tip hooks sideways, px), asym (-0.5..0.5: one half wider),
 * serr (0..0.6 tooth depth) + teeth, prof(t) → 0..1 width profile, pow (tip sharpness),
 * fold (plane tilt), veins (count per side, 0 = none), rib (color | false), bias, lo/hi,
 * seam (dark separation from what is behind, default true), emit, clip (mask to cut away),
 * tex(x, y, t, v) → light offset. Returns the mask (with .K tone map, .spine).
 */
export function blade(pc, x0, y0, x1, y1, w, R, o = {}) {
  const bend = o.bend ?? 0, asym = o.asym ?? 0, serr = o.serr ?? 0, teeth = o.teeth ?? 5, curl = o.curl ?? 0;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  const spine = (t) => { const b = Math.sin(t * Math.PI) * bend + t * t * t * curl; return [x0 + dx * t + px * b, y0 + dy * t + py * b]; };
  const prof = o.prof || ((t) => Math.sin(Math.pow(clamp(t, 0, 1), o.pow ?? 0.75) * Math.PI));
  const wid = (t) => {
    let f = prof(t);
    if (serr) f *= 1 - serr * ((t * teeth + (o.toothPhase ?? 0.3)) % 1);
    return Math.max(0.3, w * f);
  };
  const big = 1 + Math.abs(asym);
  const sw = sweep(spine, (t) => wid(t) * big, { n: Math.max(40, Math.ceil(L * 4)), capStart: o.capStart ?? 0.25, capEnd: o.capEnd ?? 0.15 });
  const m = M();
  sw.mask.each((x, y) => {
    const i = y * 32 + x, v = sw.V[i];
    if (Math.abs(v) <= wid(sw.S[i]) * (v >= 0 ? 1 + asym : 1 - asym)) m.set(x, y);
  });
  if (o.clip) m.sub(o.clip);
  m.spine = spine;
  if (!m.count()) return m;
  if (o.seam !== false) seam(pc, m, o.seamColor ?? 'shadow');
  const fold = o.fold ?? 0.85, lo = o.lo ?? 1, hi = o.hi ?? 5;
  const K = new Int8Array(1024).fill(-1);
  m.each((x, y) => {
    const i = y * 32 + x, v = sw.V[i], t = sw.S[i];
    const s = v >= 0 ? 1 : -1;
    const ox = sw.TY[i] * s, oy = -sw.TX[i] * s;
    const ww = wid(t) * (v >= 0 ? 1 + asym : 1 - asym);
    const e = Math.abs(v) / Math.max(0.7, ww);
    const kk = fold * (0.55 + e * 0.75);
    let bias = (o.bias ?? 0) - (t < 0.12 ? 0.12 : 0) - (t > 0.9 ? 0.06 : 0);
    if (o.tex) bias += o.tex(x, y, t, v);
    K[i] = clamp(toneN(ox * kk, oy * kk, 1, bias), lo, hi);
  });
  tidy(K, m);
  // lit lip on the top-left edge, darker on the bottom-right
  m.each((x, y) => {
    const i = y * 32 + x;
    if (isTop(m, x, y) && !isBot(m, x, y) && K[i] > lo) K[i]--;
    else if (isBot(m, x, y) && !isTop(m, x, y) && K[i] < hi && o.edgeDark !== false) K[i]++;
  });
  m.each((x, y) => { pc.set(x, y, R[K[y * 32 + x]]); if (o.emit) pc.emit(x, y, o.emit); });
  // side veins: short grooves angled toward the tip
  const nv = o.veins ?? Math.max(0, Math.floor(L / 4.5));
  if (nv > 0 && w >= 1.6) {
    for (let j = 1; j <= nv; j++) {
      const t0 = 0.12 + (j / (nv + 1)) * 0.72;
      for (const s of [-1, 1]) {
        const [sx, sy] = spine(t0);
        const [ex, ey] = spine(Math.min(0.98, t0 + 0.16));
        const ww = wid(t0) * (s > 0 ? 1 + asym : 1 - asym) * 0.8;
        // outward direction at t0
        const tx = ex - sx, ty = ey - sy, tl = Math.hypot(tx, ty) || 1;
        const ox = (ty / tl) * s, oy = (-tx / tl) * s;
        const vx = ex + ox * ww, vy = ey + oy * ww;
        line(pc, sx, sy, vx, vy, (n, X, Y) => {
          if (n === 0 || !m.get(X, Y) || isTop(m, X, Y) || isBot(m, X, Y)) return null;
          const k = K[Y * 32 + X];
          return R[clamp(k + 1, lo, hi)];
        });
      }
    }
  }
  // midrib: a lighter line down the middle (stops short of the tip)
  if (o.rib !== false) {
    let last = null;
    for (let i = 1; i < 60; i++) {
      const t = 0.04 + (i / 60) * (o.ribEnd ?? 0.8);
      const [x, y] = spine(t);
      const X = Math.floor(x), Y = Math.floor(y);
      if (last && last[0] === X && last[1] === Y) continue;
      last = [X, Y];
      if (!m.get(X, Y)) continue;
      const k = K[Y * 32 + X];
      pc.set(X, Y, o.rib ?? R[clamp(Math.min(k, 3) - 1, lo, hi)]);
    }
  }
  m.K = K;
  return m;
}

/**
 * A tapered round tube along a spline (stems, roots, worms, tendrils). r: number or s → radius.
 * Shaded as a cylinder in crisp bands (gearKit.facetSweep). o: seam, bias, tex(x, y, s, v),
 * lo/hi, emit, clip, capStart/capEnd. Returns the sweep ({ mask, S, V, ... , K, at }).
 */
export function tube(pc, pts, r, R, o = {}) {
  const at = Array.isArray(pts) ? spline(pts) : pts;
  const wid = typeof r === 'function' ? r : () => r;
  const sw = sweep(at, wid, { n: o.n ?? 140, capStart: o.capStart ?? 0.3, capEnd: o.capEnd ?? 0.3 });
  if (o.clip) sw.mask.sub(o.clip);
  if (o.seam !== false) seam(pc, sw.mask, 'shadow');
  sw.K = facetSweep(pc, sw, R, { round: o.round ?? true, bias: o.bias ?? 0.05, tex: o.tex, min: o.lo ?? 1, max: o.hi ?? 5, emit: o.emit });
  sw.at = at;
  return sw;
}

// ---------------------------------------------------------------- liquids, glass, steam
/** Rising steam: a soft S-curve of translucent pixels from (x, y) upward, h px tall. */
export function steam(pc, x0, y0, h, o = {}) {
  const ph = o.phase ?? x0 * 1.7, c = o.c ?? 0xffffff, a = o.a ?? 190;
  for (let i = 0; i < h; i++) {
    const x = x0 + Math.round(Math.sin(i * 0.7 + ph) * (o.amp ?? 1.3));
    const al = Math.round(a * Math.pow(1 - i / h, 0.8));
    if (al < 18) continue;
    pc.set(x, y0 - i, c, al);
    if (i % 3 === 1 && i < h - 2) pc.set(x + (Math.sin(i * 0.7 + ph) > 0 ? -1 : 1), y0 - i, c, Math.round(al * 0.45));
    if (o.emit) pc.emit(x, y0 - i, o.emit);
  }
}

/** A tiny round droplet / bead (2–3 px) with a glint and a dark belly. */
export function bead(pc, x, y, R, big = false) {
  if (big) {
    pc.set(x, y, R[1]); pc.set(x + 1, y, R[2]); pc.set(x, y + 1, R[3]); pc.set(x + 1, y + 1, R[4]);
    pc.set(x, y, R[0]);
  } else { pc.set(x, y, R[1]); pc.set(x, y + 1, R[4]); }
}

/** A tiny 4-point twinkle with a soft emissive core (magic / frost / glow). */
export function twinkle(pc, x, y, c = 0xffffff, mid = 0xfff0b0, r = 1, emit = 0.8) {
  sparkle(pc, x, y, r, c, mid, emit);
}

/** Small hue-shift helpers re-used by the drawers. */
export const darker = (c, f = 0.6) => shadowOf(c, f);
export const lighter = (c, t = 0.3) => liftOf(c, t);
export { LIGHT };
