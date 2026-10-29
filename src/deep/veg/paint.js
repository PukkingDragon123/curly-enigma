// A tiny pixel painter for the vegetation atlas: sprites are painted pixel by pixel (no
// anti-aliasing, so they stay crisp pixel art), then packed into one RGBA atlas texture.
//
// Glow is carried in the alpha channel: 0 = empty (cut out), 255 = opaque, and 255 - 48·g for a
// glowing pixel of level g (1..4). The shader decodes it, so one nearest-filtered texture holds
// colour, the cut-out mask and the emissive mask.
import * as THREE from 'three';

export const PXM = 128; // texels per metre (the terrain draws 128 texels per metre too)
export const GLOW_STEP = 48;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Deterministic hash of a pixel → [0, 1). */
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

/** One sprite: RGBA pixels, y = 0 at the top, the plant's root on the bottom row (or the top row for hanging ones). */
export class Spr {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  has(x, y) { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0; }
  get(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const o = (y * this.w + x) * 4;
    return this.d[o + 3] ? (this.d[o] << 16) | (this.d[o + 1] << 8) | this.d[o + 2] : -1;
  }
  glowAt(x, y) { const o = (Math.round(y) * this.w + Math.round(x)) * 4; return this.d[o + 3] ? Math.round((255 - this.d[o + 3]) / GLOW_STEP) : 0; }
  /** c: 0xRRGGBB (or < 0 to erase); g: glow level 0..4. */
  set(x, y, c, g = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4, d = this.d;
    if (c < 0) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; return; }
    d[o] = (c >> 16) & 255; d[o + 1] = (c >> 8) & 255; d[o + 2] = c & 255;
    d[o + 3] = 255 - GLOW_STEP * clamp(g | 0, 0, 4);
  }
  /** Only where empty. */
  add(x, y, c, g = 0) { if (!this.has(x, y)) this.set(x, y, c, g); }
  /** A one-pixel line; c may be fn(t, x, y) → colour. */
  line(x0, y0, x1, y1, c, g = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const col = typeof c === 'function' ? c(t, x, y) : c;
      if (col >= 0) this.set(x, y, col, typeof g === 'function' ? g(t) : g);
    }
  }
  /** Filled ellipse; c may be fn(dx, dy, x, y) with dx, dy in -1..1. */
  ell(cx, cy, rx, ry, c, g = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const col = typeof c === 'function' ? c(dx, dy, x, y) : c;
      if (col >= 0) this.set(x, y, col, typeof g === 'function' ? g(dx, dy) : g);
    }
  }
  /**
   * A tapered, curved strand (grass blade, frond stem, root, vine): from (x0, y0) along the
   * quadratic curve through the control point (cx, cy) to (x1, y1), width w0 → w1 (pixels).
   * col(t, side) → colour, side -1 (left edge) .. 1 (right edge); glow(t) → level.
   */
  strand(x0, y0, cx, cy, x1, y1, w0, w1, col, glow = 0) {
    const len = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
    const n = Math.max(2, Math.ceil(len * 2.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      // tangent → the normal across the strand
      const tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
      const tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const w = w0 + (w1 - w0) * t;
      const g = typeof glow === 'function' ? glow(t) : glow;
      if (w <= 1.05) { this.set(x, y, col(t, 0), g); continue; }
      const hw = (w - 1) / 2, k = Math.ceil(hw);
      for (let s = -k; s <= k; s++) {
        const o = Math.max(-hw, Math.min(hw, s));
        this.set(x + nx * o, y + ny * o, col(t, hw ? o / hw : 0), g);
      }
    }
  }
  /** A leaf: a pointed oval from (x, y) along angle a (radians, 0 = right, y down), length L, width W. */
  leaf(x, y, a, L, W, R, base = 1, glow = 0, rib = true) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const n = Math.ceil(Math.max(L, W) + 1);
    for (let v = -n; v <= n; v++) for (let u = -1; u <= n; u++) {
      const t = u / L;
      if (t < 0 || t > 1) continue;
      const half = (W / 2) * Math.sin(Math.PI * Math.pow(t, 0.75));
      if (Math.abs(v) > half + 0.3) continue;
      const px = x + ca * u - sa * v, py = y + sa * u + ca * v;
      // lit along one edge, a dark midrib, lighter toward the tip
      let ti = base + t * 1.4 + (v < 0 ? 0.9 : -0.6);
      if (rib && Math.abs(v) < 0.5 && t < 0.85) ti = base - 0.3 + t;
      this.set(px, py, tone(R, ti), glow);
    }
  }
  /** Darken opaque pixels that touch empty ones below / right (a soft pixel-art sel-out). */
  rim(k = 0.72, sides = 'br') {
    const { w, h, d } = this, src = d.slice();
    const empty = (x, y) => x < 0 || y < 0 || x >= w || y >= h || src[(y * w + x) * 4 + 3] === 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (!src[o + 3] || src[o + 3] < 255) continue; // glowing pixels keep their colour
      const e = (sides.includes('b') && empty(x, y + 1)) || (sides.includes('r') && empty(x + 1, y)) || (sides.includes('l') && empty(x - 1, y)) || (sides.includes('t') && empty(x, y - 1));
      if (!e) continue;
      d[o] = Math.round(d[o] * k); d[o + 1] = Math.round(d[o + 1] * k); d[o + 2] = Math.round(d[o + 2] * k);
    }
    return this;
  }
  /** Mirror left ↔ right. */
  flip() {
    const { w, h, d } = this, s = d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) d[(y * w + x) * 4 + k] = s[(y * w + (w - 1 - x)) * 4 + k];
    return this;
  }
  /** Mirror top ↔ bottom (a standing plant made to hang). */
  vflip() {
    const { w, h, d } = this, s = d.slice();
    for (let y = 0; y < h; y++) d.set(s.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return this;
  }
  /** Opaque bounds {x0, y0, x1, y1} (inclusive) or null. */
  bounds() {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[(y * this.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  /** Average colour of the opaque pixels as linear-ish [r, g, b] 0..1 (for particles), and how much of it glows. */
  stats() {
    let r = 0, g = 0, b = 0, n = 0, gl = 0;
    for (let i = 0; i < this.d.length; i += 4) if (this.d[i + 3]) { r += this.d[i]; g += this.d[i + 1]; b += this.d[i + 2]; n++; if (this.d[i + 3] < 255) gl++; }
    return n ? { col: [r / n / 255, g / n / 255, b / n / 255], glow: gl / n } : { col: [0.4, 0.5, 0.3], glow: 0 };
  }
}

/** Shelf-packs sprites into one RGBA atlas (1 px gutters) and makes the texture. */
export class Atlas {
  constructor(w = 1024, h = 1024) {
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h * 4);
    this.x = 1; this.y = 1; this.row = 0;
    this.list = new Map(); // name → [{ u0, v0, u1, v1, w, h, col, glow }]
  }
  /** Add a sprite under a name (several per name = variants). Returns the entry. */
  put(name, s) {
    if (this.x + s.w + 1 > this.w) { this.x = 1; this.y += this.row + 1; this.row = 0; }
    if (this.y + s.h + 1 > this.h) throw new Error('vegetation atlas is full');
    const X = this.x, Y = this.y;
    for (let y = 0; y < s.h; y++) this.data.set(s.d.subarray(y * s.w * 4, (y + 1) * s.w * 4), ((Y + y) * this.w + X) * 4);
    this.x += s.w + 1;
    this.row = Math.max(this.row, s.h);
    const st = s.stats();
    // u0/u1 left → right; vb = the sprite's bottom row, vt = its top row (texture rows run top → down)
    const e = { name, u0: X / this.w, u1: (X + s.w) / this.w, vt: Y / this.h, vb: (Y + s.h) / this.h, w: s.w, h: s.h, col: st.col, glow: st.glow };
    let a = this.list.get(name);
    if (!a) this.list.set(name, (a = []));
    a.push(e);
    return e;
  }
  get(name) { return this.list.get(name) || null; }
  texture() {
    const t = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    return t;
  }
  /** A data: URL of the atlas (debug: look at the paint). */
  dataURL(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const x = c.getContext('2d');
    const img = new ImageData(this.w, this.h);
    for (let i = 0; i < this.data.length; i += 4) {
      img.data[i] = this.data[i]; img.data[i + 1] = this.data[i + 1]; img.data[i + 2] = this.data[i + 2];
      img.data[i + 3] = this.data[i + 3] ? 255 : 0;
    }
    const tmp = document.createElement('canvas');
    tmp.width = this.w; tmp.height = this.h;
    tmp.getContext('2d').putImageData(img, 0, 0);
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#1a1418';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(tmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
}
