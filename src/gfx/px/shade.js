// Shape masks and lighting for hand-pixeled looking art: distance-field "dome" volumes,
// cylinders, flat facets, selective (material-tinted) outlines, ordered dithering,
// cast shadows and sparkles. Light always comes from the top-left, toward the viewer.
import { toHsl, fromHsl, towardHue, mix, rgbOf, hexOf } from './color.js';

// ---------------------------------------------------------------- masks
export class Mask {
  constructor(w, h = w) { this.w = w; this.h = h; this.m = new Uint8Array(w * h); }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); return this.inb(x, y) ? this.m[y * this.w + x] : 0; }
  set(x, y, v = 1) { x = Math.floor(x); y = Math.floor(y); if (this.inb(x, y)) this.m[y * this.w + x] = v; return this; }
  rect(x, y, w, h, v = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v); return this; }
  ellipse(cx, cy, rx, ry, v = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, v);
    return this;
  }
  disk(cx, cy, r, v = 1) { return this.ellipse(cx, cy, r, r, v); }
  /** Rotated ellipse (angle a in radians). */
  oval(cx, cy, rx, ry, a, v = 1) {
    const c = Math.cos(a), s = Math.sin(a), R = Math.max(rx, ry);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = dx * c + dy * s, w = -dx * s + dy * c;
        if ((u / rx) ** 2 + (w / ry) ** 2 <= 1) this.set(x, y, v);
      }
    return this;
  }
  poly(pts, v = 1) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, v);
    }
    return this;
  }
  line(x0, y0, x1, y1, v = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /** Capsule: every pixel whose center lies within r of segment (x0,y0)-(x1,y1). r may be [r0, r1] (tapered). */
  capsule(x0, y0, x1, y1, r, v = 1) {
    const r0 = Array.isArray(r) ? r[0] : r, r1 = Array.isArray(r) ? r[1] : r;
    const R = Math.max(r0, r1);
    const vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1e-6;
    for (let y = Math.floor(Math.min(y0, y1) - R - 1); y <= Math.ceil(Math.max(y0, y1) + R + 1); y++)
      for (let x = Math.floor(Math.min(x0, x1) - R - 1); x <= Math.ceil(Math.max(x0, x1) + R + 1); x++) {
        const px = x + 0.5 - x0, py = y + 0.5 - y0;
        const t = Math.max(0, Math.min(1, (px * vx + py * vy) / L2));
        const dx = px - vx * t, dy = py - vy * t;
        const rr = r0 + (r1 - r0) * t;
        if (dx * dx + dy * dy <= rr * rr) this.set(x, y, v);
      }
    return this;
  }
  /** Thick polyline through points with radius r (number or per-point array). */
  path(pts, r, v = 1) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const ra = Array.isArray(r) ? r[i] : r, rb = Array.isArray(r) ? r[i + 1] : r;
      this.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [ra, rb], v);
    }
    return this;
  }
  fn(f, v = 1) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (f(x, y)) this.set(x, y, v); return this; }
  union(o) { for (let i = 0; i < this.m.length; i++) if (o.m[i]) this.m[i] = o.m[i]; return this; }
  sub(o) { for (let i = 0; i < this.m.length; i++) if (o.m[i]) this.m[i] = 0; return this; }
  and(o) { for (let i = 0; i < this.m.length; i++) if (!o.m[i]) this.m[i] = 0; return this; }
  clone() { const k = new Mask(this.w, this.h); k.m.set(this.m); return k; }
  count() { let n = 0; for (const v of this.m) if (v) n++; return n; }
  shift(dx, dy) {
    const k = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) k.set(x + dx, y + dy, this.m[y * this.w + x]);
    this.m = k.m;
    return this;
  }
  dilate(n = 1, diag = false) {
    for (let k = 0; k < n; k++) {
      const src = this.m.slice();
      const g = (x, y) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : 0);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        if (g(x - 1, y) || g(x + 1, y) || g(x, y - 1) || g(x, y + 1) || (diag && (g(x - 1, y - 1) || g(x + 1, y - 1) || g(x - 1, y + 1) || g(x + 1, y + 1)))) this.m[y * this.w + x] = 1;
      }
    }
    return this;
  }
  erode(n = 1) {
    for (let k = 0; k < n; k++) {
      const src = this.m.slice();
      const g = (x, y) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : 0);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
        if (src[y * this.w + x] && !(g(x - 1, y) && g(x + 1, y) && g(x, y - 1) && g(x, y + 1))) this.m[y * this.w + x] = 0;
    }
    return this;
  }
  /** Mask of the pixels of this mask that touch the outside (4-neighbourhood). */
  edge() {
    const k = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (this.get(x, y) && (!this.get(x - 1, y) || !this.get(x + 1, y) || !this.get(x, y - 1) || !this.get(x, y + 1))) k.set(x, y);
    return k;
  }
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  each(f) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) f(x, y); }
}

/** Mask of the opaque pixels of a PixelCanvas. */
export function maskOf(pc, minA = 1) {
  const k = new Mask(pc.w, pc.h);
  for (let i = 0; i < pc.w * pc.h; i++) if (pc.d[i * 4 + 3] >= minA) k.m[i] = 1;
  return k;
}

// ---------------------------------------------------------------- dithering & noise
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in [0, 1). */
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
/** Checkerboard parity. */
export const checker = (x, y) => ((x + y) & 1) === 0;

/** Hash noise in [0,1) for integer coords. */
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0,1). */
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- lighting
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
export const LIGHT = nrm(-0.52, -0.68, 0.62);
const HALF = nrm(LIGHT[0], LIGHT[1], LIGHT[2] + 1);

/** Exact Euclidean distance (px) from each inside pixel center to the nearest outside pixel center. */
export function distField(mask) {
  const { w, h } = mask;
  const D = new Float32Array(w * h);
  const out = [];
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (mask.get(x, y)) continue;
    if (mask.get(x - 1, y) || mask.get(x + 1, y) || mask.get(x, y - 1) || mask.get(x, y + 1) ||
      mask.get(x - 1, y - 1) || mask.get(x + 1, y + 1) || mask.get(x + 1, y - 1) || mask.get(x - 1, y + 1)) out.push(x, y);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask.m[y * w + x]) continue;
    let best = 1e9;
    for (let k = 0; k < out.length; k += 2) {
      const dx = out[k] - x, dy = out[k + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    D[y * w + x] = Math.sqrt(best);
  }
  return D;
}

/**
 * Light intensity per pixel of a mask (Float32Array, NaN outside) + specular.
 * mode 'dome': height from the distance field (round = bevel radius in px, default: fully round).
 * mode 'cyl':  cylinder along direction `axis` (radians; 0 = horizontal, PI/2 = vertical).
 * mode 'flat': constant normal `normal` [nx, ny, nz].
 */
export function lightField(mask, o = {}) {
  const { w, h } = mask;
  const I = new Float32Array(w * h).fill(NaN);
  const S = new Float32Array(w * h);
  const N = new Float32Array(w * h * 3);
  const mode = o.mode || 'dome';
  const shine = o.shine ?? 18;
  const L = o.light || LIGHT;
  const Hh = o.light ? nrm(L[0], L[1], L[2] + 1) : HALF;
  const setN = (i, nx, ny, nz) => {
    const n = nrm(nx, ny, nz);
    N[i * 3] = n[0]; N[i * 3 + 1] = n[1]; N[i * 3 + 2] = n[2];
  };
  if (mode === 'flat') {
    const n = o.normal || [0, 0, 1];
    mask.each((x, y) => setN(y * w + x, n[0], n[1], n[2]));
  } else if (mode === 'cyl') {
    const a = o.axis ?? Math.PI / 2;
    const px = -Math.sin(a), py = Math.cos(a); // perpendicular (across the cylinder)
    const flat = o.flat ?? 0; // 0 = round, 1 = flat-faced
    mask.each((x, y) => {
      let d1 = 0, d2 = 0;
      while (d1 < 64 && mask.get(x + 0.5 + px * (d1 + 1) - 0.5, y + 0.5 + py * (d1 + 1) - 0.5)) d1++;
      while (d2 < 64 && mask.get(x + 0.5 - px * (d2 + 1) - 0.5, y + 0.5 - py * (d2 + 1) - 0.5)) d2++;
      const span = d1 + d2 + 1;
      let u = span <= 1 ? 0 : (d2 - d1) / (span - 1 || 1); // -1..1 across
      u = Math.max(-0.96, Math.min(0.96, u * (1 - flat * 0.6)));
      const nz = Math.sqrt(1 - u * u);
      setN(y * w + x, px * u, py * u, nz + (o.lift ?? 0));
    });
  } else {
    const D = distField(mask);
    let maxD = 0;
    for (let i = 0; i < D.length; i++) if (D[i] > maxD) maxD = D[i];
    const rad = Math.max(0.6, o.round ?? maxD);
    const amp = o.height ?? 1;
    const H = new Float32Array(w * h);
    for (let i = 0; i < D.length; i++) {
      if (!mask.m[i]) continue;
      const t = Math.min(D[i] - 0.5, rad) / rad;
      H[i] = rad * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) * amp;
    }
    if (o.hmod) mask.each((x, y) => { H[y * w + x] = o.hmod(x, y, H[y * w + x]); });
    const hg = (x, y) => (x < 0 || y < 0 || x >= w || y >= h || !mask.m[y * w + x] ? -0.35 * amp : H[y * w + x]);
    mask.each((x, y) => {
      const gx = (hg(x + 1, y) - hg(x - 1, y)) / 2, gy = (hg(x, y + 1) - hg(x, y - 1)) / 2;
      setN(y * w + x, -gx, -gy, 1);
    });
  }
  mask.each((x, y) => {
    const i = y * w + x;
    const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    let v = nx * L[0] + ny * L[1] + nz * L[2];
    if (o.wrap) v = (v + o.wrap) / (1 + o.wrap);
    I[i] = v;
    S[i] = Math.pow(Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]), shine);
  });
  return { I, S, N };
}

/** Default intensity → tone (1..5) band edges. */
const BANDS = [0.95, 0.8, 0.62, 0.36, 0.1];

/** Continuous tone value (1..5.99) for an intensity. */
export function toneOf(v, bands = BANDS) {
  const [b1, b2, b3, b4] = bands;
  const b5 = bands[4] ?? b4 - 0.3;
  if (v >= b1) return 1;
  if (v >= b2) return 1 + (b1 - v) / (b1 - b2);
  if (v >= b3) return 2 + (b2 - v) / (b2 - b3);
  if (v >= b4) return 3 + (b3 - v) / (b3 - b4);
  if (v >= b5) return 4 + (b4 - v) / (b4 - b5);
  return 5;
}

/**
 * Paint a lit volume: every pixel of `mask` gets a tone from ramp R (see color.mat).
 * o: lightField options + bias (added light), spec (threshold 0..1, false = none),
 *    dither (0..0.5 ordered-dither amplitude between bands), tex(x, y) → light offset,
 *    min/max tone index clamp, bounce (lighten the very darkest rim on the bottom-right),
 *    bands (custom band edges), emit (glow strength for the mine).
 */
export function vol(pc, mask, R, o = {}) {
  const { I, S } = lightField(mask, o);
  const bands = o.bands || BANDS;
  const dz = o.dither ?? 0;
  const lo = o.min ?? 1, hi = o.max ?? 5;
  const w = mask.w;
  mask.each((x, y) => {
    const i = y * w + x;
    let v = I[i] + (o.bias || 0);
    if (o.tex) v += o.tex(x, y, v);
    let t = toneOf(v, bands);
    if (dz) t += (bayer(x, y) - 0.5) * dz * 2;
    let k = Math.max(lo, Math.min(hi, Math.floor(t)));
    if (o.spec !== false && o.spec !== undefined && S[i] > o.spec) k = 0;
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, typeof o.emit === 'function' ? o.emit(x, y, k) : o.emit);
  });
  if (o.bounce) {
    // reflected light: rim pixels on the bottom-right step one tone up from the darkest
    mask.each((x, y) => {
      if (mask.get(x + 1, y) && mask.get(x, y + 1)) return;
      if (pc.get(x, y) === R[5] && (mask.get(x - 1, y) && mask.get(x, y - 1))) pc.set(x, y, R[4]);
    });
  }
  return { I, S };
}

/** Fill a mask with one color (optionally emissive). */
export function fill(pc, mask, c, emit = 0) {
  mask.each((x, y) => { pc.set(x, y, c); if (emit) pc.emit(x, y, emit); });
}

/** Flat facet: a single tone chosen from a normal (for crystals, boxes, gem facets). */
export function facet(pc, mask, R, normal, o = {}) {
  const n = nrm(normal[0], normal[1], normal[2]);
  const v = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] + (o.bias || 0);
  const k = Math.max(o.min ?? 1, Math.min(o.max ?? 5, Math.floor(toneOf(v, o.bands || BANDS))));
  fill(pc, mask, R[k], o.emit || 0);
  return k;
}

// ---------------------------------------------------------------- outlines & edges
/** Dark, cool, saturated version of a fill color for outlines. */
export function outlineOf(c, k = 0.32) {
  let [h, s, l] = toHsl(c);
  if (s < 0.08) { h = 260; s = 0.16; }
  return fromHsl(towardHue(h, 262, 22), Math.min(1, s * 0.85 + 0.14), Math.max(0.06, Math.min(0.3, l * k + 0.03)));
}

/**
 * Selective outline around everything opaque in pc: each outline pixel takes a dark tint of
 * the neighbouring fill (lighter on the lit top-left side, darker bottom-right).
 * o: color (fixed outline), k (darkness), litK, minA, mask (limit the outline to pixels adjacent to this mask)
 */
export function selout(pc, o = {}) {
  const k = o.k ?? 0.3, litK = o.litK ?? 0.48;
  const minA = o.minA ?? 128;
  const add = [];
  const A = (x, y) => pc.alpha(x, y) >= minA && (!o.mask || o.mask.get(x, y));
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (pc.alpha(x, y) >= minA) continue;
    const r = A(x + 1, y), b = A(x, y + 1), l = A(x - 1, y), t = A(x, y - 1);
    if (!(r || b || l || t)) continue;
    // neighbour to sample: prefer the one on the shape side
    const nx = r ? x + 1 : l ? x - 1 : x, ny = r || l ? y : b ? y + 1 : y - 1;
    const src = pc.getHex(nx, ny);
    const litSide = (r || b) && !(l || t);
    let c = o.color !== undefined ? (typeof o.color === 'function' ? o.color(src, litSide) : o.color) : outlineOf(src, litSide ? litK : k);
    add.push(x, y, c);
  }
  for (let i = 0; i < add.length; i += 3) pc.set(add[i], add[i + 1], add[i + 2]);
}

/** Interior contour: darken the pixels of `mask` that border pixels outside it (but still opaque). */
export function innerLine(pc, mask, R, o = {}) {
  const sides = o.sides || 'br'; // which sides get the dark line: 'all' | 'br' (bottom/right) | 'tl'
  const dark = o.color ?? R[5];
  const lite = o.lite ?? null;
  mask.each((x, y) => {
    const outR = !mask.get(x + 1, y) && pc.alpha(x + 1, y), outB = !mask.get(x, y + 1) && pc.alpha(x, y + 1);
    const outL = !mask.get(x - 1, y) && pc.alpha(x - 1, y), outT = !mask.get(x, y - 1) && pc.alpha(x, y - 1);
    if (sides === 'all' && (outR || outB || outL || outT)) pc.set(x, y, dark);
    else if (sides === 'br' && (outR || outB)) pc.set(x, y, dark);
    else if (sides === 'tl' && (outL || outT)) pc.set(x, y, dark);
    if (lite !== null && (outL || outT) && !(outR || outB)) pc.set(x, y, lite);
  });
}

/** Cast a soft contact shadow of `mask` onto whatever is opaque below/right of it. */
export function castShadow(pc, mask, dx = 1, dy = 1, f = 0.72) {
  const pts = [];
  mask.each((x, y) => {
    const X = x + dx, Y = y + dy;
    if (mask.get(X, Y) || pc.alpha(X, Y) < 128) return;
    pts.push(X, Y);
  });
  for (let i = 0; i < pts.length; i += 2) {
    const c = pc.getHex(pts[i], pts[i + 1]);
    const [h, s, l] = toHsl(c);
    pc.set(pts[i], pts[i + 1], fromHsl(towardHue(h, 255, 12), Math.min(1, s * 1.05 + 0.04), l * f));
  }
}

/** Darken (f < 1) or lighten (f > 1) existing opaque pixels inside mask, hue-shifting like a ramp. */
export function tint(pc, mask, f) {
  mask.each((x, y) => {
    const c = pc.get(x, y);
    if (c < 0) return;
    const [h, s, l] = toHsl(c);
    if (f < 1) pc.set(x, y, fromHsl(towardHue(h, 255, (1 - f) * 30), Math.min(1, s * 1.05 + 0.03), l * f));
    else pc.set(x, y, fromHsl(towardHue(h, 50, (f - 1) * 25), s * 0.95, l + (0.97 - l) * (f - 1)));
  });
}

// ---------------------------------------------------------------- sparkles & glints
/** 4-point star glint. r = arm length (1..3). */
export function sparkle(pc, x, y, r = 2, c = 0xffffff, mid = null, emit = 0) {
  const m = mid ?? mix(c, 0xfff0b0, 0.5);
  const put = (X, Y, col) => { pc.set(X, Y, col); if (emit) pc.emit(X, Y, emit); };
  put(x, y, c);
  for (let k = 1; k <= r; k++) {
    const col = k === 1 && r > 1 ? c : m;
    put(x + k, y, col); put(x - k, y, col); put(x, y + k, col); put(x, y - k, col);
  }
  if (r >= 3) { put(x + 1, y + 1, m); put(x - 1, y - 1, m); put(x + 1, y - 1, m); put(x - 1, y + 1, m); }
}

/** Translucent halo: semi-transparent pixels around opaque ones (UI icons only). */
export function glowHalo(pc, c, a = 90, r = 2) {
  const add = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (pc.alpha(x, y)) continue;
    let best = 99;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (pc.glowAt(x + i, y + j) > 0.3 || (pc.glow === null && pc.alpha(x + i, y + j) > 200)) best = Math.min(best, Math.hypot(i, j));
    }
    if (best <= r) add.push(x, y, Math.round(a * (1 - (best - 1) / r) * (bayer(x, y) < 0.75 ? 1 : 0.6)));
  }
  for (let i = 0; i < add.length; i += 3) if (add[i + 2] > 8) pc.set(add[i], add[i + 1], c, add[i + 2]);
}

/** Paint a straight stroke of colors (array cycles) along a line. */
export function stroke(pc, x0, y0, x1, y1, cols, a = 255) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = Array.isArray(cols) ? cols[i % cols.length] : cols;
    pc.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c, a);
  }
}

export { mix, rgbOf, hexOf };
