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
import { Mask } from './shade.js';

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
  /** Design-space point test (a design coordinate may fall anywhere inside a native pixel). */
  at(x, y) { return this.get(np(x), np(y)); }
  /** each() with design coordinates too: f(X, Y, x, y). */
  eachD(f) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) f(x, y, dc(x), dc(y)); }
}

/** A fresh icon-sized design mask. */
export const DM = () => new DMask(SZ, SZ);

/** Paint the S×S block of design pixel (x, y). */
export function dot(pc, x, y, c, emit = 0) {
  const X = Math.floor(x) * S, Y = Math.floor(y) * S;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { pc.set(X + i, Y + j, c); if (emit) pc.emit(X + i, Y + j, emit); }
}
