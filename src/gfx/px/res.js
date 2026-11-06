// Icon resolution. Item icons are authored in a 32-unit "design" space (hand-placed outline
// points, plane fills, part sizes) and rasterised natively at S× (64×64 at S = 2): silhouettes,
// planes and textures are computed per real pixel, the ink outline, seams, rims and fine
// texture stay 1 real pixel wide, and the extra resolution goes into detail.
//
// Conventions for the kits (gearKit, lifeKit, facets) and the icon drawers:
//   - shape builders take design coordinates (DMask: disk/ellipse/oval/poly/capsule/path/rect/
//     line/shift, fn(f) with f(x, y) in design space so that `x + 0.5` is the pixel's centre);
//   - painting is native: PixelCanvas / Mask get/set/each, erode/dilate, outlines (1 px);
//   - dc(X) turns a native pixel into its design coordinate, nc(x) a design coordinate into
//     a native pixel, dot() paints a whole design pixel (an S×S block).
import { Mask, hash2 } from './shade.js';
import { mix, lum } from './color.js';

/** Icon pixels per design unit. */
export let S = 2;
/** Icon canvas size in pixels. */
export let SZ = 32 * S;

/** Run fn at another scale (1 = the old 32-px grid), then restore. */
export function withScale(s, fn) {
  const s0 = S;
  S = s; SZ = 32 * s;
  try { return fn(); } finally { S = s0; SZ = 32 * s0; }
}

/** Design coordinate of native pixel X (x + 0.5 is its centre in design units). */
export const dc = (X) => (X + 0.5) / S - 0.5;
/** Native pixel for a design coordinate (a design pixel index maps to its block's centre-ish pixel). */
export const nc = (x) => Math.floor(x * S + (S - 1) / 2 + 1e-6);
/** Native pixel containing a continuous design point. */
export const np = (x) => Math.floor(x * S + 1e-6);

/** A mask whose shape builders take design coordinates (everything else is native). */
export class DMask extends Mask {
  constructor(w = SZ, h = w) { super(w, h); }
  static of(m) { const k = new DMask(m.w, m.h); k.m.set(m.m); return k; }
  clone() { return DMask.of(this); }
  edge() { return DMask.of(super.edge()); }
  ellipse(cx, cy, rx, ry, v = 1) { return super.ellipse(cx * S, cy * S, rx * S, ry * S, v); }
  oval(cx, cy, rx, ry, a, v = 1) { return super.oval(cx * S, cy * S, rx * S, ry * S, a, v); }
  poly(pts, v = 1) { return super.poly(pts.map((p) => [p[0] * S, p[1] * S]), v); }
  capsule(x0, y0, x1, y1, r, v = 1) {
    const rr = Array.isArray(r) ? [r[0] * S, r[1] * S] : r * S;
    return super.capsule(x0 * S, y0 * S, x1 * S, y1 * S, rr, v);
  }
  rect(x, y, w, h, v = 1) { return super.rect(Math.round(x * S), Math.round(y * S), Math.round(w * S), Math.round(h * S), v); }
  line(x0, y0, x1, y1, v = 1) { return super.line(nc(x0), nc(y0), nc(x1), nc(y1), v); }
  shift(dx, dy) { return super.shift(Math.round(dx * S), Math.round(dy * S)); }
  /** Native-pixel shift (1 = one real pixel). */
  nshift(dx, dy) { return super.shift(dx, dy); }
  fn(f, v = 1) {
    for (let y = 0; y < this.h; y++) {
      const yd = dc(y);
      for (let x = 0; x < this.w; x++) if (f(dc(x), yd)) this.set(x, y, v);
    }
    return this;
  }
  /** Bounds in design pixels (integer, like the 32-grid mask would have): {x0, y0, x1, y1, w, h} or null. */
  bounds() {
    const b = super.bounds();
    if (!b || S === 1) return b;
    const x0 = Math.floor(b.x0 / S), y0 = Math.floor(b.y0 / S), x1 = Math.floor(b.x1 / S), y1 = Math.floor(b.y1 / S);
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  /** Bounds in native pixels. */
  nbounds() { return super.bounds(); }
  /** Design-space point test (a design coordinate may fall anywhere inside a native pixel). */
  at(x, y) { return this.get(np(x), np(y)); }
  /** each() with design coordinates too: f(X, Y, x, y). */
  eachD(f) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) f(x, y, dc(x), dc(y)); }
}

// plain Masks (maskOf(), edge() of a shade.js Mask, ...) can be walked the same way
Mask.prototype.eachD = DMask.prototype.eachD;
Mask.prototype.at = DMask.prototype.at;

/** A fresh icon-sized design mask. */
export const DM = () => new DMask(SZ, SZ);

/**
 * Paint the S×S block of design pixel (x, y) (a: alpha as in pc.set). On an icon canvas at S = 2
 * the dot is also noted, so refineDots() can redraw it at real-pixel scale once the icon is done.
 */
export function dot(pc, x, y, c, a = 255) {
  const X = Math.floor(x) * S, Y = Math.floor(y) * S;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) pc.set(X + i, Y + j, c, a);
  if (S === 2 && pc.w === SZ && pc.h === SZ && X >= 0 && Y >= 0 && X < SZ && Y < SZ) {
    const D = pc._dots || (pc._dots = new Int32Array(32 * 32).fill(-1));
    D[(Y >> 1) * 32 + (X >> 1)] = a >= 255 ? c & 0xffffff : -2; // (see-through dots stay as they are)
  }
}

/**
 * Redraw the hand-placed accents (dot()s) of a finished icon at real-pixel scale: a 2×2 block reads
 * as a blob at 64 px, so each becomes what a pixel artist would put there at this size. A run of
 * dots (a seam, a stitch line, a stroke of a letter or an emblem) keeps one crisp row (or column,
 * or diagonal) with a half-tone beside it; a lone light accent (a glint, a speck of sugar) a bright
 * core fading into what is around it; a lone dark one (a nail hole, a pore, a seed) a sharp pit with
 * a lit lip below-right. Blocks of dots (filled shapes) and accents on the silhouette's edge stay
 * whole, and so does any dot something else has since painted over.
 */
export function refineDots(pc) {
  const D = pc._dots;
  pc._dots = null;
  if (!D || pc.w !== 64 || pc.h !== 64) return pc;
  const at = (x, y) => (x < 0 || y < 0 || x >= 32 || y >= 32 ? -1 : D[y * 32 + x]);
  const on = (x, y) => at(x, y) >= 0;
  const out = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = D[y * 32 + x];
    if (c < 0) continue;
    const X = x * 2, Y = y * 2;
    let intact = true;
    for (let j = 0; j < 2 && intact; j++) for (let i = 0; i < 2; i++) if (pc.alpha(X + i, Y + j) < 255 || pc.getHex(X + i, Y + j) !== c) { intact = false; break; }
    if (!intact) continue;
    const L = on(x - 1, y), R = on(x + 1, y), U = on(x, y - 1), B = on(x, y + 1);
    if ((L || R) && (U || B)) continue; // inside a filled patch
    // what the accent sits on: the ring round it, leaving out other accents
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) {
      if (i >= 0 && i <= 1 && j >= 0 && j <= 1) continue;
      const xx = X + i, yy = Y + j;
      if (xx < 0 || yy < 0 || xx >= 64 || yy >= 64 || pc.alpha(xx, yy) < 160 || D[(yy >> 1) * 32 + (xx >> 1)] >= 0) continue;
      const h = pc.getHex(xx, yy);
      r += (h >> 16) & 255; g += (h >> 8) & 255; b += h & 255; n++;
    }
    if (n < 5) continue; // on the edge, or on nothing: keep the block
    const sur = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
    if (Math.abs(lum(sur) - lum(c)) < 0.035) continue; // a tint of what is there: nothing to sharpen
    const m = (t) => mix(c, sur, t);
    let q;
    if (L || R) q = [c, c, m(0.5), m(0.5)]; // a horizontal run: a crisp top row
    else if (U || B) q = [c, m(0.5), c, m(0.5)]; // a vertical run: a crisp left column
    else if (on(x - 1, y - 1) || on(x + 1, y + 1)) q = [c, m(0.55), m(0.55), c]; // a \ diagonal
    else if (on(x + 1, y - 1) || on(x - 1, y + 1)) q = [m(0.55), c, c, m(0.55)]; // a / diagonal
    else if (lum(c) >= lum(sur)) q = [c, m(0.4), m(0.4), m(0.8)]; // a lone light accent
    else q = [c, m(0.3), m(0.3), mix(sur, 0xfff4dc, 0.16)]; // a lone dark one, with its lit lip
    out.push(X, Y, q);
  }
  for (let k = 0; k < out.length; k += 3) {
    const X = out[k], Y = out[k + 1], q = out[k + 2];
    pc.set(X, Y, q[0]); pc.set(X + 1, Y, q[1]); pc.set(X, Y + 1, q[2]); pc.set(X + 1, Y + 1, q[3]);
  }
  return pc;
}
/** Flag the S×S block of design pixel (x, y) emissive. */
export function dotE(pc, x, y, g = 1) {
  const X = Math.floor(x) * S, Y = Math.floor(y) * S;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) pc.emit(X + i, Y + j, g);
}

/**
 * Clustered texture grain at native pixel (X, Y): true on tiny 2-pixel grains (a pixel and a
 * neighbour right, below or diagonal) scattered with `dens` grains per design pixel, instead of
 * single-pixel salt-and-pepper. At S = 1 it is a plain per-pixel hash test.
 */
export function grain(X, Y, seed, dens) {
  if (S === 1) return hash2(X, Y, seed) < dens;
  const cx = Math.floor(X / S), cy = Math.floor(Y / S);
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
    const gx = cx - i, gy = cy - j;
    if (hash2(gx, gy, seed) >= dens) continue;
    const ox = gx * S + Math.floor(hash2(gx, gy, seed + 1) * S), oy = gy * S + Math.floor(hash2(gx, gy, seed + 2) * S);
    const d = Math.floor(hash2(gx, gy, seed + 3) * 3), dx = d === 1 ? 0 : 1, dy = d === 0 ? 0 : 1;
    if ((X === ox && Y === oy) || (X === ox + dx && Y === oy + dy)) return true;
  }
  return false;
}

/** Alpha / colour of the native pixel under a design point (for hand-placed tests). */
export const alphaD = (pc, x, y) => pc.alpha(np(x), np(y));
export const getD = (pc, x, y) => pc.get(np(x), np(y));
