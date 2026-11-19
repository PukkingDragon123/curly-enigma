// The lift panel's art kit: a small raster canvas, the panel's named palette (every colour picked by
// hand; about forty in all), the per-layer ramps that the hand-made tiles are recoloured with, and a
// 3x5 pixel font for depth numbers. Nothing here invents pixels: tiles and sprites are authored as
// string grids in tiles.js and only placed, recoloured and animated by code.

export const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const css = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
export const lum = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
export function hashStrLite(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/** An RGBA raster with a role per pixel (0 empty, 1 back wall, 2 liquid, 3 rock, 4 thing) for the sketch recolour. */
export class Art {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); this.role = new Uint8Array(w * h); }
  p(x, y, c, role = 4) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = y * this.w + x, i = k * 4, d = this.d;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
    this.role[k] = role;
  }
  clear(x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) { const k = y * this.w + x; this.d[k * 4 + 3] = 0; this.role[k] = 0; } }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[((y | 0) * this.w + (x | 0)) * 4 + 3]; }
  /**
   * Stamp a pixel map: rows of characters, pal maps a character to a colour ('.' is see-through).
   * role tags what was drawn (see the class note); flip mirrors it.
   */
  stamp(x, y, rows, pal, role = 4, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j], n = r.length;
      for (let i = 0; i < n; i++) {
        const ch = r[i];
        if (ch === '.') continue;
        const c = pal[ch];
        if (c != null) this.p(flip ? x + n - 1 - i : x + i, y + j, c, role);
      }
    }
  }
  commit() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return cv;
  }
}

// ------------------------------------------------------------------ the palette
/** Named colours for the hand-made sprites (letters). Digits are the layer's own ramps (see RAMPS). */
export const PAL = {
  k: 0x2a1626, K: 0x3c2234, c: 0xf6e6c2, C: 0xe6d6b4,
  w: 0xc89458, W: 0x9a643a, d: 0x6a3e2a,
  i: 0xb0a8a4, I: 0x75707a, j: 0x4a4250,
  s: 0xb4a89c, S: 0x847a7a, t: 0x5a5258,
  y: 0xfde8a8, Y: 0xf6c25a, o: 0xd88a32, O: 0x8a4a1c,
  r: 0xc8503a, R: 0x8e2a2a,
  g: 0xa8b45a, G: 0x76943a, h: 0x4a6a2c, H: 0x2e4632,
  b: 0x9cc8d0, B: 0x4a82a0, n: 0x2c5070, N: 0x1c2a4a,
  v: 0xd8c4ec, V: 0x8e66b8, u: 0x5e3a8a,
  e: 0xe8d8b0, E: 0xb09878,
  a: 0xcaa474, A: 0x9c7450, m: 0x6e4a32,
  p: 0xec7c2a, P: 0xb83a1e, q: 0x6e1a1e,
  f: 0xe8a0a0, F: 0xc87a7a,
  z: 0xf0d488, Z: 0xb88a3a,
  x: 0x6ec8c0, X: 0x2e7a8a,
  // the sky and hills over the meadow
  T: 0x46507e, U: 0x5e6a92, L: 0x8a90a8, M: 0xb8b0a8, Q: 0xdcc49c, J: 0xeed29c, D: 0x7c8494, l: 0x5e7058,
};
export const INK = PAL.k;
export const CREAM = PAL.c;

/**
 * Per layer, recolouring the digits of the tiles: rock A and rock B ('0' ink, '1' dark, '2' mid,
 * '3' light, '4' highlight), the back wall seen through the caves ('5' dark, '6' mid, '7' light),
 * the crystal ramp for that layer's crystals, its sketch wash, and its name colour on the rail.
 */
export const RAMPS = [
  { // the top: the burrow's soil
    A: [0x2a1626, 0x5e3a2c, 0x8a5a3a, 0xb07a4a, 0xd8a868], B: [0x2a1626, 0x4a2c28, 0x6e4632, 0x8e6040, 0xb08458], back: [0x24141c, 0x3a2224, 0x50302c],
  },
  { A: [0x2a1626, 0x5e3a2c, 0x8a5a3a, 0xb07a4a, 0xd8a868], B: [0x2a1626, 0x44282a, 0x664034, 0x865a40, 0xa87c56], back: [0x22121c, 0x382026, 0x4e3030], xtal: [0x1c3a52, 0x2c7088, 0x52aab0, 0xc8ecdc], wash: 0x9c6a44 },
  { A: [0x2a1626, 0x6a2a26, 0xa8483a, 0xcc7050, 0xeaa070], B: [0x2a1626, 0x3e3444, 0x605464, 0x857888, 0xaa9eaa], back: [0x200c18, 0x361620, 0x4c2226], xtal: [0x5a3022, 0x96582e, 0xe8981e, 0xfce08a], wash: 0xb45a3c },
  { A: [0x1a1430, 0x2e3052, 0x4a5078, 0x6e78a0, 0x9aa4c4], B: [0x1a1430, 0x3a3050, 0x5a5070, 0x7e7494, 0xa89cb8], back: [0x120e22, 0x1c1830, 0x282440], xtal: [0x1a1430, 0x2c7088, 0x52aab0, 0xc8ecdc], xtal2: [0x1a1430, 0x5e3a8a, 0x8e66b8, 0xd8c4ec], wash: 0x5a6a9a },
  { A: [0x1a0c18, 0x2e2230, 0x4a3644, 0x6a5460, 0x8e7884], B: [0x1a0c18, 0x4a1e20, 0x72302a, 0x9a4e36, 0xc07448], back: [0x180a14, 0x2a1018, 0x3c161c], xtal: [0x140c1a, 0x261a30, 0x3e2e54, 0x8a72b8], wash: 0x8a3a2a },
  { A: [0x161830, 0x3a4a6a, 0x5e7c9c, 0x8eacc4, 0xc4dce0], B: [0x161830, 0x2e5a82, 0x4e88b0, 0x84bcd8, 0xd8ece4], back: [0x141a30, 0x1e2a46, 0x2c3c5c], xtal: [0x161830, 0x4e88b0, 0x9cc8d0, 0xf6e6c2], wash: 0x6e98b8 },
  { A: [0x120a1c, 0x28163e, 0x3e2658, 0x5c3e7a, 0x8a6aa0], B: [0x120a1c, 0x3a1a48, 0x5a2e6a, 0x84508e, 0xb07ab4], back: [0x0e0818, 0x1a0e28, 0x261638], xtal: [0x120a1c, 0x3e2058, 0x6a44a0, 0xc8a8e8], wash: 0x6a4a9a },
];

/** The palette for a layer: the letters, plus its digits (rock A by default; ramp B, back, ore). */
export function palFor(z, ramp = 'A', ore = null) {
  const R = RAMPS[z], r = R[ramp] || R.A, b = R.back;
  const p = { ...PAL, 0: r[0], 1: r[1], 2: r[2], 3: r[3], 4: r[4], 5: b[0], 6: b[1], 7: b[2] };
  if (ore) { p[8] = ore[0]; p[9] = ore[1]; }
  return p;
}
/** A palette whose digits 0..4 are another ramp (crystals, floaters), the letters unchanged. */
export function rampPal(ramp) { return { ...PAL, 0: ramp[0], 1: ramp[0], 2: ramp[1], 3: ramp[2], 4: ramp[3] }; }

// ------------------------------------------------------------------ the sketch's paper and leads
export const PAPER = 0xe8d6ae, PAPER2 = 0xdcc69c, PENCIL = 0x9c8a74, PENCIL2 = 0xbcaa8c, SEPIA = 0x5a3a2e, SEPIA2 = 0x7a5640;

// ------------------------------------------------------------------ a 3x5 pixel font for numbers
const GLYPH = {
  0: ['.1.', '1.1', '1.1', '1.1', '.1.'], 1: ['.1.', '11.', '.1.', '.1.', '111'], 2: ['11.', '..1', '.1.', '1..', '111'],
  3: ['11.', '..1', '.1.', '..1', '11.'], 4: ['1.1', '1.1', '111', '..1', '..1'], 5: ['111', '1..', '11.', '..1', '11.'],
  6: ['.11', '1..', '11.', '1.1', '.1.'], 7: ['111', '..1', '.1.', '.1.', '.1.'], 8: ['.1.', '1.1', '.1.', '1.1', '.1.'],
  9: ['.1.', '1.1', '.11', '..1', '11.'],
};
/** Draw digits; returns the width. */
export function digits(pc, x, y, str, c) {
  let cx = x;
  for (const ch of String(str)) { const g = GLYPH[ch]; if (!g) { cx += 2; continue; } pc.stamp(cx, y, g, { 1: c }); cx += 4; }
  return cx - x - 1;
}
