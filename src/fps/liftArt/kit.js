// The lift panel's cross-section art kit ("Lamplight Woodcut", docs/DEV_GUIDE.md): a raster canvas
// with a structure map (for the pencil sketch of the layers you haven't reached), colour helpers, the
// per-layer palettes (flat 4-tone ramps, shadows to plum/indigo, lights to warm cream), a tiny pixel
// font for depth numbers, and the small drawing tools everything else shares.
import { clamp } from '../../core/util.js';

// ------------------------------------------------------------------ numbers
export const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dith = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t, g = ag + (((b >> 8) & 255) - ag) * t, bl = ab + ((b & 255) - ab) * t;
  return ((r << 16) | (g << 8) | bl) >>> 0;
};
export const mul = (c, f) => {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return ((r << 16) | (g << 8) | b) >>> 0;
};
export const css = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
export const lum = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
export function hashStrLite(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// ------------------------------------------------------------------ the canvas
/**
 * An RGBA raster plus a structure id per pixel (what the pixel belongs to: air, a band of rock, a
 * prop...). The sketch traces the outlines between ids, so it draws shapes, not texture noise.
 * Set `cur` to tag what you paint next with that id.
 */
export class Art {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); this.id = new Uint8Array(w * h); this.cur = 0; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** Opaque write (tags the id when `cur` is set). */
  p(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = y * this.w + x, i = k * 4, d = this.d;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
    if (this.cur) this.id[k] = this.cur;
  }
  /** Alpha-blend c over what's there (t 0..1). */
  b(x, y, c, t) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (!d[i + 3]) { this.p(x, y, c); d[i + 3] = Math.round(t * 255); return; }
    d[i] += (((c >> 16) & 255) - d[i]) * t; d[i + 1] += (((c >> 8) & 255) - d[i + 1]) * t; d[i + 2] += ((c & 255) - d[i + 2]) * t;
  }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[((y | 0) * this.w + (x | 0)) * 4 + 3]; }
  c(x, y) { x = clamp(x | 0, 0, this.w - 1); y = clamp(y | 0, 0, this.h - 1); const i = (y * this.w + x) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  getId(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.id[(y | 0) * this.w + (x | 0)]; }
  clear(x, y) { if (this.in(x, y)) this.d[((y | 0) * this.w + (x | 0)) * 4 + 3] = 0; }
  /** Rows of characters → pixels (pal maps a character to a colour; '.' and ' ' are skipped). */
  stamp(x, y, rows, pal, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j], n = r.length;
      for (let i = 0; i < n; i++) {
        const ch = r[i];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c != null) this.p(flip ? x + n - 1 - i : x + i, y + j, c);
      }
    }
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c); }
  /** A 1px line (Bresenham). */
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.p(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** Copy another Art (same size) in. */
  copy(src) { this.d.set(src.d); this.id.set(src.id); }
  commit() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d');
    ctx.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return cv;
  }
}

// ------------------------------------------------------------------ the house inks
export const INK = 0x2a1626; // deep plum: outlines and the darkest darks (never black)
export const INK2 = 0x3c2234;
export const CREAM = 0xf6e6c2; // the brightest light (never white)
export const LAMP = [0x8a4a1c, 0xd88a32, 0xf6c25a, 0xfde8a8]; // the panel's one accent: lamplight
export const WOOD = [0x3a2026, 0x6a3e2a, 0x9a643a, 0xc89458]; // timber
export const IRON = [0x2a2232, 0x4a4250, 0x75707a, 0xb0a8a4];
export const WATER = [0x1c2a4a, 0x2a4a6a, 0x3c6e8a, 0x86b4b8, 0xd8e6d0];
export const LAVA = [0x6e1a1e, 0xb83a1e, 0xec7c2a, 0xfcc25e, 0xfde8b0];
// the paper of the sketch
export const PAPER = 0xe8d6ae, PAPER2 = 0xdcc69c, PAPER3 = 0xceb68c, PENCIL = 0x9c8a74, PENCIL2 = 0xb8a68a, SEPIA = 0x5a3a2e, SEPIA2 = 0x7a5640;

/**
 * Per layer: rock materials (each a [dark, mid, light, highlight] ramp), the band plan (which
 * material comes in which order, thin "seam" bands of another rock between), the back wall seen
 * through the caves (4 tones), the outline ink, the wash hue for the sketch, and small extras.
 */
export const ZP = [
  null,
  { // I Rootsoil: loam, sandy loam, humus, a gravel bed
    mats: [[0x4a2a26, 0x7a4c34, 0x9c6a44, 0xc8945e], [0x5e3a2c, 0x8e6444, 0xb28656, 0xdab27a], [0x3e2428, 0x5e3a30, 0x7c523a, 0xa4724e], [0x4a3c40, 0x726058, 0x98826e, 0xc4ac8c]],
    seam: [0x3a2830, 0x5c4a4a, 0x84705e, 0xb09a7c],
    order: [0, 1, 0, 2, 0, 1], seamEvery: 3,
    back: [0x22121e, 0x381e26, 0x50302c, 0x6e4632], ink: INK, wash: 0x9c6a44,
    moss: [0x2e3e22, 0x4e6a2c, 0x7a943c, 0xb4c060],
  },
  { // II Clayworks: red, ochre and pink clays, grey mudstone seams
    mats: [[0x501e24, 0x8a3a2c, 0xb45a3c, 0xda8a5c], [0x5a3022, 0x96582e, 0xc0823e, 0xe2b06c], [0x582830, 0x8e4c4a, 0xb67462, 0xdaa286], [0x2e2634, 0x504654, 0x746874, 0x9c9096]],
    seam: [0x2e2634, 0x504654, 0x746874, 0x9c9096],
    order: [0, 1, 0, 2, 3, 0], seamEvery: 2,
    back: [0x200c18, 0x36141e, 0x4e2222, 0x6c3428], ink: INK, wash: 0xb45a3c,
    moss: [0x2a3a1e, 0x4a5e26, 0x6e8432, 0xa0a84c],
  },
  { // III Crystal Grotto: blue and grey granite, slate
    mats: [[0x1e1a36, 0x363a60, 0x525a84, 0x7882a8], [0x281e34, 0x463e58, 0x665e78, 0x8e86a0], [0x1a1a2e, 0x2e3450, 0x48506e, 0x6a7290]],
    seam: [0x3a2e4a, 0x5e5274, 0x8a80a0, 0xbab0c8],
    order: [0, 1, 0, 2, 0], seamEvery: 3,
    back: [0x120e24, 0x1e1a34, 0x2c2846, 0x403c5e], ink: 0x1a1430, wash: 0x5a6a9a,
    xtal: [[0x1c3a52, 0x2c7088, 0x52aab0, 0xb8e8dc], [0x341c52, 0x5e3a8a, 0x8e66b8, 0xd8c4ec]],
  },
  { // IV Magma Deep: basalt, red ash, obsidian
    mats: [[0x1c1220, 0x322434, 0x4c3a46, 0x6c5660], [0x2c1218, 0x4e2022, 0x72342a, 0x9a5638], [0x160e1c, 0x261a30, 0x3a2a48, 0x5e4a74]],
    seam: [0x2c1218, 0x4e2022, 0x72342a, 0x9a5638],
    order: [0, 1, 0, 0, 2, 0], seamEvery: 2,
    back: [0x180a14, 0x28101a, 0x3a181e, 0x542222], ink: 0x1a0c18, wash: 0x8a3a2a,
  },
  { // V Frost Vault: permafrost, blue ice, frozen gravel
    mats: [[0x262a46, 0x48587a, 0x6e88a6, 0x9eb6ca], [0x1e3656, 0x386690, 0x649ec2, 0xaed6e4], [0x2c283e, 0x504a62, 0x787288, 0xa8a2b0]],
    seam: [0x1e3656, 0x386690, 0x649ec2, 0xaed6e4],
    order: [0, 2, 0, 1, 0], seamEvery: 2,
    back: [0x141a32, 0x1e2a46, 0x2c3c5c, 0x42587a], ink: 0x161830, wash: 0x6e98b8,
  },
  { // VI The Core: void rock, coreite, star rock
    mats: [[0x160c24, 0x28163e, 0x3e2658, 0x5c3e7a], [0x200e2c, 0x3e1c4c, 0x5e306e, 0x885290], [0x1c1628, 0x302842, 0x4a4260, 0x706886]],
    seam: [0x2a1a10, 0x6a4a1e, 0xb88a3a, 0xf0d488],
    order: [0, 1, 0, 2, 0], seamEvery: 3,
    back: [0x0e0818, 0x180e28, 0x26163a, 0x382250], ink: 0x120a1c, wash: 0x6a4a9a,
  },
];

// ------------------------------------------------------------------ a tiny pixel font for numbers
const GLYPH = {
  0: ['.1.', '1.1', '1.1', '1.1', '.1.'], 1: ['.1.', '11.', '.1.', '.1.', '111'], 2: ['11.', '..1', '.1.', '1..', '111'],
  3: ['11.', '..1', '.1.', '..1', '11.'], 4: ['1.1', '1.1', '111', '..1', '..1'], 5: ['111', '1..', '11.', '..1', '11.'],
  6: ['.11', '1..', '11.', '1.1', '.1.'], 7: ['111', '..1', '.1.', '.1.', '.1.'], 8: ['.1.', '1.1', '.1.', '1.1', '.1.'],
  9: ['.1.', '1.1', '.11', '..1', '11.'], m: ['.....', '11.1.', '1.1.1', '1.1.1', '1.1.1'],
};
/** Draw digits (and 'm') with a 1px shadow down-right. Returns the width. */
export function digits(pc, x, y, str, c, sh) {
  let cx = x;
  for (const ch of String(str)) {
    const g = GLYPH[ch];
    if (!g) { cx += 2; continue; }
    if (sh != null) pc.stamp(cx + 1, y + 1, g, { 1: sh });
    pc.stamp(cx, y, g, { 1: c });
    cx += g[0].length + 1;
  }
  return cx - x - 1;
}
export const digitsW = (str) => { let w = 0; for (const ch of String(str)) w += (GLYPH[ch] ? GLYPH[ch][0].length : 1) + 1; return w - 1; };

// ------------------------------------------------------------------ shapes
/**
 * A lopsided carved lump (pebble, boulder, clay ball): flat tones lit from the top left, a plum
 * outline on the shadow side only, a cream nick of light. r: [dk, md, lt, hi].
 */
export function lump(pc, x, y, w, h, r, seed, ink = INK) {
  const cx = x + w / 2 - 0.5, cy = y + h / 2 - 0.5;
  const sk = (hash(seed, 1, 7) - 0.5) * 0.5; // lean
  const inside = (i, j) => {
    const u = (i - cx) / (w / 2), v = (j - cy) / (h / 2);
    const lop = 1 + (hash(seed, (Math.atan2(v, u) * 2.5) | 0, 9) - 0.5) * 0.35;
    return (u + v * sk) ** 2 + v * v < lop * 0.98;
  };
  for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) {
    if (!inside(i, j)) continue;
    const u = (i - cx) / (w / 2), v = (j - cy) / (h / 2);
    const k = -u * 0.6 - v; // facing the light (top left)
    let c = k > 0.75 ? r[3] : k > 0.15 ? r[2] : k > -0.55 ? r[1] : r[0];
    const edgeBR = !inside(i + 1, j) || !inside(i, j + 1);
    if (edgeBR && k < 0.2) c = ink;
    pc.p(i, j, c);
  }
}

/** A tapered spike (stalactite down, stalagmite up): lit left side, plum right edge, cream tip. */
export function spike(pc, x, y, len, w, dir, r, lean = 0, ink = INK) {
  for (let j = 0; j < len; j++) {
    const t = j / len;
    const half = Math.max(0, (w / 2) * (1 - t) ** 0.8);
    const ox = Math.round(lean * t * t * 3);
    const yy = y + dir * j;
    const a = Math.round(x - half + ox), b = Math.round(x + half + ox);
    for (let i = a; i <= b; i++) {
      let c = i === a ? r[2] : i === b ? ink : i - a < (b - a) * 0.45 ? r[1] : r[0];
      if (b === a) c = j === len - 1 ? r[3] : r[1];
      pc.p(i, yy, c);
    }
  }
}

/** Banded lamp light: flat steps of colour over painted pixels (no soft gradients). */
export function lightPool(pc, lx, ly, rad, c, k, only) {
  const x0 = Math.max(0, Math.floor(lx - rad)), x1 = Math.min(pc.w - 1, Math.ceil(lx + rad));
  const y0 = Math.max(0, Math.floor(ly - rad)), y1 = Math.min(pc.h - 1, Math.ceil(ly + rad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (only && !only(x, y)) continue;
    const wob = (hash(x >> 2, y >> 2, 17) - 0.5) * 0.08;
    const d = Math.hypot(x - lx, (y - ly) * 1.2) / rad + wob;
    if (d >= 1) continue;
    const band = d < 0.45 ? 2 : 1;
    if (!pc.a(x, y)) continue;
    const i = (y * pc.w + x) * 4, D = pc.d, t = k * band * 0.5;
    D[i] += (((c >> 16) & 255) - D[i]) * t * (D[i] < ((c >> 16) & 255) ? 1 : 0.2);
    D[i + 1] += (((c >> 8) & 255) - D[i + 1]) * t * (D[i + 1] < ((c >> 8) & 255) ? 1 : 0.2);
    D[i + 2] += ((c & 255) - D[i + 2]) * t * 0.6;
  }
}

/** Chamfer distance to the nearest pixel where isSrc is true (capped at 255). */
export function distField(W, H, isSrc) {
  const D = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isSrc(y * W + x)) D[y * W + x] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; let m = D[k];
    if (x > 0) m = Math.min(m, D[k - 1] + 2);
    if (y > 0) { m = Math.min(m, D[k - W] + 2); if (x > 0) m = Math.min(m, D[k - W - 1] + 3); if (x < W - 1) m = Math.min(m, D[k - W + 1] + 3); }
    D[k] = m;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x; let m = D[k];
    if (x < W - 1) m = Math.min(m, D[k + 1] + 2);
    if (y < H - 1) { m = Math.min(m, D[k + W] + 2); if (x < W - 1) m = Math.min(m, D[k + W + 1] + 3); if (x > 0) m = Math.min(m, D[k + W - 1] + 3); }
    D[k] = m;
  }
  for (let k = 0; k < W * H; k++) D[k] = D[k] >> 1; // ~pixels
  return D;
}
