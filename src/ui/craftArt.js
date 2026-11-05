// Hand-crafted, high-detail pixel art for the interface's panels and frames (the parchment, the
// carved wood, the brass, the tooled leather of the books, buttons, wax seals). Same contract as
// uiArt.js: 1 art pixel = 1 canvas pixel = one --px on screen, light from the top-left, drawn once
// and cached as data URLs.
//
// Two tricks make the big frames work as CSS 9-slices (`border-image ... repeat`):
//  - every texture is *periodic*: a frame of slice s and middle M samples its textures at
//    (x - s) mod M, so its edges and its middle tile without a seam;
//  - edge decorations (deckled tears, grain, stitches, engraving) run on the same period M.
// Tiles (textures for backgrounds) are periodic in both directions at their own size.
import { Px } from './px.js';

// ---------------------------------------------------------------- noise & colour
export const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (v, n) => ((v % n) + n) % n;
/** Value noise, periodic with nx × ny cells (x, y in cell units). */
export function pnoise(x, y, nx, ny, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi);
  const g = (i, j) => hash(wrap(i, nx), wrap(j, ny), s);
  return lerp(lerp(g(xi, yi), g(xi + 1, yi), u), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), u), v);
}
/** Fractal noise periodic over a W×H tile: features of about `size` px, `oct` octaves; 0..1. */
export function fbm(x, y, W, H, size, oct = 3, s = 0) {
  let sum = 0, amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const nx = Math.max(1, Math.round(W / size)), ny = Math.max(1, Math.round(H / size));
    sum += amp * pnoise((x * nx) / W, (y * ny) / H, nx, ny, s + o * 101);
    tot += amp; amp *= 0.5; size /= 2;
  }
  return sum / tot;
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
/** A brightness 0..1 → one of a palette's tones (dark → light), ordered-dithered between steps. */
export function quant(pal, k, x, y, dither = 1) {
  const f = k * (pal.length - 1) + (dither ? (bay(x, y) - 0.5) * dither + 0.5 : 0.5);
  return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(f)))];
}
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r, g, b) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
export const shadeC = (c, k) => { const [r, g, b] = rgb(c); return hex(r * k, g * k, b * k); };

// ---------------------------------------------------------------- palettes (dark → light)
export const TONES = {
  paper: [0xb8935e, 0xcaa874, 0xd6b986, 0xe0c897, 0xe9d5a8, 0xf2e1b9, 0xf6e8c6, 0xfbf1d8],
  note: [0xcfb07e, 0xdcc292, 0xe6d2a6, 0xefdfb8, 0xf5e8c8, 0xf8ecd2, 0xfbf2de, 0xfdf7ea],
  wood: [0x26160c, 0x36200f, 0x482b15, 0x56341b, 0x643e20, 0x744a28, 0x83552e, 0x93623a, 0xa06c3c, 0xb07a46, 0xc08a52],
  woodDk: [0x1a0e07, 0x241409, 0x2e1a0d, 0x3a2111, 0x442815, 0x4e2f19, 0x58361d, 0x643f22, 0x704828, 0x80532e, 0x8e5e34],
  oak: [0x1e0f06, 0x2e1a0c, 0x3c2210, 0x4a2c16, 0x56341a, 0x643e20, 0x744826, 0x82522c, 0x8e5c32, 0xa06a3c, 0xb07a46],
  oxblood: [0x1c0806, 0x2e0e0a, 0x3e140e, 0x4e1a12, 0x5e2016, 0x6c261a, 0x7a2e1e, 0x8a3624, 0x9a422c, 0xac5034],
  moss: [0x0e1a0c, 0x162814, 0x1e341a, 0x26401f, 0x2e4c26, 0x36582c, 0x3e6232, 0x486e3a, 0x547c44, 0x628c50],
  brass: [0x3a2410, 0x5a3a14, 0x7a5418, 0xa0721e, 0xc08e30, 0xdcae4e, 0xeac466, 0xf7d97c, 0xffeaa8, 0xfff6d8],
  slate: [0x161c1a, 0x1d2422, 0x242c29, 0x2a3330, 0x313b37, 0x38443f, 0x404c47, 0x48554f, 0x58665f],
  silver: [0x1e1c1c, 0x34302e, 0x4c4642, 0x645c56, 0x7e756e, 0x9a9088, 0xb6ada4, 0xd2cac0, 0xeee8e0],
};
const INK = 0x24150d;

// ---------------------------------------------------------------- texture fields
/** A paper brightness field (periodic W×H): mottling, cloudy pulp, fibres, foxing haloes, stains, rules. */
function paperField(W, H, o = {}) {
  const s = o.seed ?? 1, K = new Float32Array(W * H), fox = [];
  const base = o.base ?? 0.7, at = (x, y) => wrap(y, H) * W + wrap(x, W);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let k = base;
      k += (fbm(x, y, W, H, Math.max(8, Math.min(W, H) / 2), 3, s) - 0.5) * (o.mottle ?? 0.3);
      k += (fbm(x, y, W, H, 5, 2, s + 7) - 0.5) * 0.12;
      k += (hash(x, y, s + 3) - 0.5) * (o.grain ?? 0.07);
      K[y * W + x] = k;
    }
  // fibres: short curling strands, some paler (pulp) and some darker (flax)
  const nf = Math.round(((W * H) / 70) * (o.fibres ?? 1));
  for (let i = 0; i < nf; i++) {
    let x = hash(i, 1, s + 11) * W, y = hash(i, 2, s + 11) * H, a = hash(i, 3, s + 11) * Math.PI * 2;
    const len = 3 + Math.floor(hash(i, 4, s + 11) * 7), bend = (hash(i, 5, s + 11) - 0.5) * 0.5;
    const d = hash(i, 6, s + 11) < 0.62 ? 0.085 : -0.075;
    for (let t = 0; t < len; t++) { K[at(Math.round(x), Math.round(y))] += d; x += Math.cos(a); y += Math.sin(a); a += bend; }
  }
  // stains: a faint ring of an old mug, a damp patch
  for (let i = 0; i < (o.stains ?? 0); i++) {
    const cx = hash(i, 7, s) * W, cy = hash(i, 8, s) * H, R = 5 + hash(i, 9, s) * Math.min(W, H) * 0.18;
    for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++)
      for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
        const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), wob = (pnoise(Math.atan2(y - cy, x - cx) * 2, i, 13, 4, s) - 0.5) * 1.6;
        if (Math.abs(dd - R - wob) < 0.75) K[at(x, y)] -= 0.07;
        else if (dd < R + wob) K[at(x, y)] -= 0.022;
      }
  }
  // foxing: rusty age spots with a pale halo; the cores are painted later
  for (let i = 0; i < Math.round(((W * H) / 900) * (o.fox ?? 1)); i++) {
    const cx = hash(i, 12, s) * W, cy = hash(i, 13, s) * H, r = 0.4 + hash(i, 14, s) * (o.foxSize ?? 1.3);
    fox.push([cx, cy, r]);
    for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++)
      for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
        const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (dd < r + 2.4) K[at(x, y)] -= 0.045 * (1 - dd / (r + 2.4));
      }
  }
  // ruled lines (notebook pages): a faint, slightly broken line every `rule` rows
  if (o.rule) for (let y = o.rule - 1; y < H; y += o.rule)
    for (let x = 0; x < W; x++) if (hash(x >> 2, y, s + 21) > 0.1) K[y * W + x] -= hash(x, y, s + 22) < 0.8 ? 0.11 : 0.06;
  return { K, fox, W, H };
}
/** Paint a paper field into a Px (with an offset), foxing cores on top. */
function paintPaper(p, F, pal, ox = 0, oy = 0, mask = null) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (mask && !mask(x, y)) continue;
      const fx = wrap(x - ox, F.W), fy = wrap(y - oy, F.H);
      p.set(x, y, quant(pal, F.K[fy * F.W + fx], fx, fy, 0.9));
    }
  for (const [cx, cy, r] of F.fox)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const fx = Math.floor(cx) + dx, fy = Math.floor(cy) + dy, d = Math.hypot(fx + 0.5 - cx, fy + 0.5 - cy);
        if (d > r) continue;
        // every place this field pixel lands in the raster
        for (let Y = wrap(fy + oy, F.H); Y < p.h; Y += F.H)
          for (let X = wrap(fx + ox, F.W); X < p.w; X += F.W) {
            if (!p.a(X, Y) || (mask && !mask(X, Y))) continue;
            p.set(X, Y, mix(p.get(X, Y), d < r * 0.5 ? 0xa86e3a : 0xc4925a, d < r * 0.5 ? 0.7 : 0.45));
          }
      }
}

/** A plank-wood brightness field (periodic): flowing grain, rings, pores, knots, butt joints, nails. */
function woodField(W, H, o = {}) {
  const s = o.seed ?? 3, ph = o.plank ?? H, K = new Float32Array(W * H), C = new Int32Array(W * H).fill(-1);
  const planks = Math.round(H / ph);
  const knots = [];
  for (let j = 0; j < planks; j++) if (o.knots !== 0 && hash(j, 31, s) < (o.knots ?? 0.55)) knots.push([hash(j, 32, s) * W, j * ph + ph * (0.35 + hash(j, 33, s) * 0.3), 1.2 + hash(j, 34, s) * 1.1, j]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const j = Math.floor(y / ph), v = y - j * ph;
      // grain coordinate: rows bent by long waves (periodic along the plank) and by knots
      let g = v * (o.ring ? 1 : 0.85) + (fbm(x, j * 7, W, 64, W / 2, 2, s + j * 13) - 0.5) * (o.wave ?? 5) + hash(j, 35, s) * 9;
      for (const [kx, ky, kr, kj] of knots) {
        if (kj !== j) continue;
        const dx = Math.min(Math.abs(x - kx), W - Math.abs(x - kx)), dy = y - ky, r = Math.hypot(dx * 0.7, dy);
        if (r < kr * 4) g += (dy >= 0 ? 1 : -1) * (kr * 4 - r) * 0.55;
      }
      const ring = wrap(g / (o.spacing ?? 2.7), 1);
      let k = (o.base ?? 0.55) + (hash(j, 36, s) - 0.5) * 0.14;
      k += (fbm(x, y, W, H, Math.max(4, W / 4), 2, s + 5) - 0.5) * 0.22;
      if (ring < 0.2) k -= 0.17; else if (ring < 0.36) k -= 0.07; else if (ring > 0.82) k += 0.05;
      if (hash(x, y, s + 9) < 0.035) k -= 0.12; // pores
      k += (hash(x, y, s + 10) - 0.5) * 0.05;
      // plank edges: a lit arris on top, a dark gap below
      if (planks > 1 || o.edges) { if (v === 0) k += 0.16; else if (v === 1) k += 0.05; else if (v === ph - 1) { C[y * W + x] = 0; } else if (v === ph - 2) k -= 0.14; }
      K[y * W + x] = k;
    }
  // knots: dark heart, a ring round it
  for (const [kx, ky, kr] of knots)
    for (let y = Math.floor(ky - kr - 2); y <= ky + kr + 2; y++)
      for (let x = Math.floor(kx - kr * 1.6 - 2); x <= kx + kr * 1.6 + 2; x++) {
        const d = Math.hypot((x + 0.5 - kx) / 1.5, y + 0.5 - ky);
        const i = wrap(y, H) * W + wrap(x, W);
        if (d < kr * 0.55) K[i] -= 0.38; else if (d < kr) K[i] -= 0.2; else if (d < kr + 0.9) K[i] += 0.08;
      }
  // butt joints with a pair of nails either side
  if (o.joints !== false && planks >= 1 && o.plank)
    for (let j = 0; j < planks; j++) {
      const jx = Math.floor(hash(j, 37, s) * W);
      for (let v = 0; v < ph - 1; v++) { C[(j * ph + v) * W + jx] = 0; K[(j * ph + v) * W + wrap(jx + 1, W)] += 0.12; }
      for (const nx of [jx - 2, jx + 3]) for (const nv of ph > 7 ? [2, ph - 3] : [Math.floor(ph / 2)]) {
        const X = wrap(nx, W), Y = j * ph + nv;
        C[Y * W + X] = 1; if (nv < ph - 2) K[(Y + 1) * W + X] -= 0.1;
      }
    }
  return { K, C, W, H };
}
function paintWood(p, F, pal, ox = 0, oy = 0, mask = null, nail = [0x3a2a1e, 0x9a8a76]) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (mask && !mask(x, y)) continue;
      const fx = wrap(x - ox, F.W), fy = wrap(y - oy, F.H), i = fy * F.W + fx;
      p.set(x, y, F.C[i] === 0 ? pal[0] : F.C[i] === 1 ? (hash(fx, fy, 3) < 0.5 ? nail[1] : nail[0]) : quant(pal, F.K[i], fx, fy, 0.35));
    }
}

/** Pebbled leather (periodic W×H): a dome per grain cell lit from the top-left, valleys, wear, creases. */
function leatherField(W, H, o = {}) {
  const s = o.seed ?? 5, cell = o.cell ?? 3.6, nx = Math.max(2, Math.round(W / cell)), ny = Math.max(2, Math.round(H / cell));
  const cw = W / nx, ch = H / ny, K = new Float32Array(W * H);
  const pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([(i + 0.2 + hash(i, j, s) * 0.6) * cw, (j + 0.2 + hash(i, j, s + 1) * 0.6) * ch]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let d1 = 1e9, d2 = 1e9, bx = 0, by = 0;
      const ci = Math.floor((x + 0.5) / cw), cj = Math.floor((y + 0.5) / ch);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = wrap(ci + di, nx), jj = wrap(cj + dj, ny), [px, py] = pts[jj * nx + ii];
          const qx = px + (ci + di - ii) * cw, qy = py + (cj + dj - jj) * ch;
          const d = (x + 0.5 - qx) ** 2 + (y + 0.5 - qy) ** 2;
          if (d < d1) { d2 = d1; d1 = d; bx = qx; by = qy; } else if (d < d2) d2 = d;
        }
      let k = 0.55 - ((x + 0.5 - bx) + (y + 0.5 - by)) * 0.075;
      if (Math.sqrt(d2) - Math.sqrt(d1) < 0.8) k -= 0.2;
      k += (fbm(x, y, W, H, Math.max(8, W / 3), 2, s + 4) - 0.5) * (o.wear ?? 0.45);
      const cr = Math.abs(fbm(x + y * 0.4, y, W, H, Math.max(6, W / 4), 1, s + 7) - 0.5);
      if (cr < 0.02) k -= 0.16;
      k += (hash(x, y, s + 9) - 0.5) * 0.06;
      K[y * W + x] = k;
    }
  // a few scratches: pale lines with a dark lip
  for (let i = 0; i < Math.round((W * H) / 900); i++) {
    let x = hash(i, 1, s + 11) * W, y = hash(i, 2, s + 11) * H;
    const a = hash(i, 3, s + 11) * Math.PI, L = 3 + hash(i, 4, s + 11) * 8;
    for (let t = 0; t < L; t++) { K[wrap(Math.round(y), H) * W + wrap(Math.round(x), W)] += 0.22; K[wrap(Math.round(y) + 1, H) * W + wrap(Math.round(x), W)] -= 0.1; x += Math.cos(a); y += Math.sin(a) * 0.6; }
  }
  return { K, W, H };
}
const paintField = (p, F, pal, ox = 0, oy = 0, dither = 0.5, mask = null) => {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (mask && !mask(x, y)) continue;
      const fx = wrap(x - ox, F.W), fy = wrap(y - oy, F.H);
      p.set(x, y, quant(pal, F.K[fy * F.W + fx], fx, fy, dither));
    }
};

/** Brushed brass (periodic): horizontal streaks, tarnish clouds, a glint or two. */
function brassField(W, H, o = {}) {
  const s = o.seed ?? 9, K = new Float32Array(W * H), V = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let k = o.base ?? 0.62;
      const bx = Math.max(1, Math.round(W / 12)), by = Math.max(1, Math.round(H * 1.7));
      k += (pnoise((x * bx) / W, (y * by) / H, bx, by, s) - 0.5) * 0.22; // brushing
      k += (fbm(x, y, W, H, Math.max(6, W / 3), 2, s + 3) - 0.5) * 0.18;
      k += (hash(x, y, s + 5) - 0.5) * 0.05;
      K[y * W + x] = k;
      V[y * W + x] = fbm(x, y, W, H, Math.max(5, W / 4), 2, s + 7); // patina
    }
  return { K, V, W, H };
}

// ---------------------------------------------------------------- tiles
export function paperTile(W = 32, H = W, o = {}) {
  const p = new Px(W, H);
  paintPaper(p, paperField(W, H, o), o.pal || TONES.paper);
  return p;
}
export function noteTile(W = 32, H = W) {
  // the pinned notes: lighter, fewer fibres, a whisper of texture (it sits beside flat fills)
  const p = new Px(W, H);
  paintPaper(p, paperField(W, H, { seed: 41, base: 0.71, mottle: 0.1, grain: 0.04, fibres: 0.5, fox: 0.3, foxSize: 0.7 }), TONES.note);
  return p;
}
export function woodTile(W = 32, H = 16, o = {}) {
  const p = new Px(W, H);
  paintWood(p, woodField(W, H, { plank: o.plank ?? 8, seed: o.seed ?? 3, base: o.base, knots: o.knots }), o.pal || TONES.wood);
  return p;
}
export function leatherTile(W = 24, H = W, pal = TONES.oxblood, o = {}) {
  const p = new Px(W, H);
  paintField(p, leatherField(W, H, o), pal, 0, 0, 0.4);
  return p;
}
export function slateTile(W = 24, H = W) {
  const p = new Px(W, H), pal = TONES.slate;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let k = 0.62 + (fbm(x, y, W, H, 12, 2, 61) - 0.5) * 0.25 + (hash(x, y, 62) - 0.5) * 0.12;
      // the stone's cleavage: faint streaks running slightly downhill
      if (wrap(y + Math.floor(x / 6), 7) === 0 && hash(x >> 1, y, 63) < 0.5) k -= 0.12;
      // chalk dust where it was wiped
      const dust = fbm(x * 0.7 + y * 0.3, y, W, H, 8, 2, 64);
      if (dust > 0.62) k += (dust - 0.62) * 1.6;
      p.set(x, y, quant(pal, k, x, y, 0.8));
    }
  for (let i = 0; i < 5; i++) { const x = Math.floor(hash(i, 1, 65) * W), y = Math.floor(hash(i, 2, 65) * H); p.set(x, y, 0x8a968e); }
  return p;
}
/** Semi-transparent grain to lay over a flat colour (leather tabs, rubber stamps): dark pits, pale rubs. */
export function grainOverlay(W = 16, H = W, seed = 71, strength = 1) {
  const p = new Px(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = hash(x, y, seed), w = fbm(x, y, W, H, 6, 2, seed + 1);
      if (n < 0.14) p.set(x, y, 0x1a0806, Math.round(70 * strength));
      else if (n > 0.93 || w > 0.7) p.set(x, y, 0xffffff, Math.round((n > 0.93 ? 46 : 22) * strength));
    }
  return p;
}
/** Worn rubber of a stamp (alpha speckle: ink worn off, pits). */
export function rubberOverlay(W = 16, H = W) {
  const p = new Px(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = hash(x, y, 81), w = fbm(x, y, W, H, 8, 2, 82);
      if (w > 0.66 && n < 0.6) p.set(x, y, 0xfff4e0, 60);
      else if (n < 0.08) p.set(x, y, 0x000000, 60);
      else if (n > 0.95) p.set(x, y, 0xfff4e0, 40);
    }
  return p;
}
/** A silk bookmark ribbon (6 wide, repeats down): twill weave, a satin sheen, dark selvedges. */
export function silkRibbon(R = [0x3a0c08, 0x5a140c, 0x7a1e14, 0x9a2a1c, 0xb23626, 0xc84a34, 0xe0705a]) {
  const p = new Px(6, 12);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 6; x++) {
      let k = [0.05, 0.75, 0.62, 0.5, 0.42, 0.08][x];
      if (x > 0 && x < 5 && wrap(x + y, 3) === 0) k -= 0.12; // the twill diagonal
      if (x === 1 && wrap(y, 4) === 1) k += 0.15; // sheen
      p.set(x, y, R[Math.max(0, Math.min(R.length - 1, Math.round(k * (R.length - 1))))]);
    }
  return p;
}

// ---------------------------------------------------------------- frame helpers
/** Depth of (x, y) into a W×H rectangle (0 on the outer ring). */
const depth = (x, y, W, H) => Math.min(x, y, W - 1 - x, H - 1 - y);
/** For a 9-slice: which edge is nearest, and the coordinate along it. */
function edgeOf(x, y, W, H) {
  const dl = x, dr = W - 1 - x, dt = y, db = H - 1 - y, m = Math.min(dl, dr, dt, db);
  if (m === dt) return { e: 0, u: x, d: dt, tl: true };
  if (m === dl) return { e: 3, u: y, d: dl, tl: true };
  if (m === db) return { e: 2, u: x, d: db, tl: false };
  return { e: 1, u: y, d: dr, tl: false };
}
function rivet(p, x, y, pal = TONES.brass, r = 1.6) {
  p.disk(x, y, r + 0.7, pal[0]);
  p.disk(x, y, r, pal[4]);
  p.disk(x - 0.4, y - 0.4, r * 0.65, pal[6]);
  p.set(Math.floor(x - 0.6), Math.floor(y - 0.6), pal[9]);
  p.set(Math.floor(x + 0.6), Math.floor(y + 0.6), pal[2]);
}
function nailHead(p, x, y) { // a hand-forged iron nail: square-ish dome
  p.set(x, y, 0x8a8278); p.set(x + 1, y, 0x5a524c); p.set(x, y + 1, 0x5a524c); p.set(x + 1, y + 1, 0x2a2420);
  p.set(x - 1, y, 0x2a2420, 120); p.set(x, y - 1, 0xbab2a6, 90); p.set(x + 2, y + 1, 0x140c08, 110); p.set(x + 1, y + 2, 0x140c08, 110);
}

// ---------------------------------------------------------------- frames
/**
 * Parchment with a deckled, scorched rim (slice 8 on 56). The tear line wanders along each edge on
 * the middle's period, the burn is thicker in places, fibres poke out of the tear, foxing gathers
 * near the rim. dog: the bottom-right corner folded over (dog-eared).
 */
export function parchFrame(dog = false, o = {}) {
  const s = o.slice ?? 8, M = o.mid ?? 40, W = s * 2 + M, sd = o.seed ?? 17;
  const p = new Px(W, W);
  const tear = (e, u) => 0.6 + (pnoise(((u - s) * 5) / M, e * 3.1, 5, 64, sd) - 0.25) * 2.2 + (hash(wrap(u - s, M), e, sd) < 0.12 ? 1 : 0);
  const burn = (e, u) => 1.4 + pnoise(((u - s) * 4) / M, e * 2.3 + 9, 4, 64, sd + 1) * (o.burn ?? 2.6);
  const inside = (x, y) => {
    if (x < tear(3, y) || W - 1 - x < tear(1, y) || y < tear(0, x) || W - 1 - y < tear(2, x)) return false;
    // round the four corners a little
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, W - 1 - y);
    return !(cx + cy < 3);
  };
  const F = paperField(M, M, { seed: sd + 3, fox: 2.4, stains: 0 });
  paintPaper(p, F, TONES.paper, s, s, inside);
  // dog-ear: everything stays inside the corner slice (W - s .. W - 1) so the edges still tile
  const c0 = W - s, fold = 2 * (W - 1) - (s - 2) - 1;
  if (dog) for (let y = c0; y < W; y++) for (let x = c0; x < W; x++) if (x + y > fold) p.clear(x, y);
  // scorched rim: darker the closer to the tear, depth wandering along the edge
  const D = p.dist(6);
  p.each((x, y, c) => {
    const d = D(x, y), { e, u } = edgeOf(x, y, W, W), b = burn(e, u);
    if (d === 1) return hash(x, y, sd + 5) < 0.2 ? 0x4e301a : 0x6a4424;
    if (d - 1 < b) { const t = (d - 1) / b; return mix(c, t < 0.4 ? 0x9a6a3c : t < 0.75 ? 0xb88c58 : 0xd4b47e, t < 0.4 ? 0.85 : t < 0.75 ? 0.6 : 0.4); }
    if (d - 1 < b + 1.5 && hash(x, y, sd + 6) < 0.35) return mix(c, 0xd4b47e, 0.5);
    return undefined;
  });
  // loose fibres sticking out of the tear
  for (let i = 0; i < 14; i++) {
    const e = i % 4, u = s + Math.floor(hash(i, 1, sd + 7) * M), t = Math.floor(tear(e, u)) - 1;
    if (t < 0) continue;
    const [x, y] = e === 0 ? [u, t] : e === 2 ? [u, W - 1 - t] : e === 3 ? [t, u] : [W - 1 - t, u];
    if (!p.a(x, y)) p.set(x, y, 0xa07a4c);
  }
  if (dog) {
    // the folded flap (the mirror of the torn-off triangle): the paper's paler back, lit near the
    // crease and shaded toward its free edges, the crease itself
    for (let y = c0; y < W; y++)
      for (let x = c0; x < W; x++) {
        const t = x + y;
        if (t === fold) p.set(x, y, 0x8a6038);
        else if (t < fold && x >= c0 && y >= c0 && fold - t <= s - 2) {
          const edge = x === c0 || y === c0;
          p.set(x, y, edge ? 0xa07a4c : mix(0xfbf1d8, 0xd6b986, ((fold - t) / (s - 1)) * 0.7 + (hash(x, y, sd + 8) < 0.15 ? 0.12 : 0)));
        }
      }
  }
  p.outline(0x3a2210);
  return p;
}

/** A pinned paper slip (slice 5 on 30): clean top, torn bottom, a curl at the foot, sparse grain. */
export function noteFrame() {
  const s = 5, M = 20, W = 30;
  const p = new Px(W, W);
  const torn = (x) => 1 + Math.round(pnoise(((x - s) * 6) / M, 0, 6, 8, 33) * 1.6) + (wrap(x - s, 4) === 1 ? 1 : 0);
  const F = paperField(M, M, { seed: 41, base: 0.71, mottle: 0.1, grain: 0.04, fibres: 0.5, fox: 0.3, foxSize: 0.7 });
  paintPaper(p, F, TONES.note, s, s, (x, y) => x >= 1 && x <= W - 2 && y >= 1 && y <= W - 1 - torn(x) && !((x === 1 || x === W - 2) && (y === 1)));
  const D = p.dist(3);
  p.each((x, y, c) => {
    const d = D(x, y);
    const bottom = y > W - 6;
    if (d === 1) return bottom ? mix(c, 0xcfb07e, 0.75) : y < 3 ? mix(c, 0xfdf7ea, 0.6) : x > W / 2 ? mix(c, 0xdcc292, 0.6) : mix(c, 0xe6d2a6, 0.4);
    if (d === 2 && bottom) return mix(c, 0xe6d2a6, 0.5);
    return undefined;
  });
  p.outline(0x6e4a2a);
  return p;
}

/**
 * A moulded wooden frame (slice 7 on 46): a rounded outer lip, a carved cove, a bead, grain running
 * along each rail, mitred corners, a nail in each corner.
 */
export function woodFrame(pal = TONES.wood, o = {}) {
  const s = o.slice ?? 7, M = o.mid ?? 32, W = s * 2 + M, sd = o.seed ?? 13;
  const p = new Px(W, W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const { u, d, tl } = edgeOf(x, y, W, W);
      if (d >= s) continue;
      const uu = wrap(u - s, M);
      // grain along the rail: streaks of constant depth that wave a little
      const wave = (pnoise((uu * 4) / M, d * 0.6 + (tl ? 0 : 5), 4, 32, sd) - 0.5) * 3.2;
      const ring = wrap((d + wave + (tl ? 0 : 1.3)) / 2.2, 1);
      let k = 0.55 + (pnoise((uu * 8) / M, d * 0.3, 8, 16, sd + 1) - 0.5) * 0.2;
      if (ring < 0.22) k -= 0.15;
      if (hash(uu, d * 7 + (tl ? 0 : 3), sd + 2) < 0.05) k -= 0.12;
      // the moulding profile
      const lit = tl ? 1 : -1;
      if (d === 0) { p.set(x, y, pal[0]); continue; }
      if (d === 1) k += 0.28 * lit;
      else if (d === 2) k += 0.12 * lit;
      else if (d === 3) k -= 0.05 * lit; // cove
      else if (d === 4) k -= 0.22 * lit;
      else if (d === 5) k += 0.14 * lit + 0.05; // bead
      else if (d === 6) { p.set(x, y, pal[1]); continue; } // lip into the panel
      p.set(x, y, quant(pal, k, x, y, 0.3));
    }
  // mitres: a dark joint line where the rails meet, a lit edge on its lower side
  for (let i = 1; i < s; i++)
    for (const [x, y, lx, ly] of [[i, i, i + 1, i], [W - 1 - i, i, W - 2 - i, i], [i, W - 1 - i, i, W - 2 - i], [W - 1 - i, W - 1 - i, W - 2 - i, W - 1 - i]]) {
      p.set(x, y, pal[1]);
      if (i < s - 1) p.set(lx, ly, mix(p.get(lx, ly), pal[pal.length - 1], 0.25));
    }
  if (o.nails !== false) for (const [x, y] of [[2, 3], [W - 4, 3], [2, W - 5], [W - 4, W - 5]]) nailHead(p, x, y);
  return p;
}

/**
 * Engraved brass (slice 8 on 48): bevelled rim, a band engraved with a running vine on the middle's
 * period, verdigris in the cut lines, glints on the bevel, a domed rivet in each corner.
 */
export function brassFrame(o = {}) {
  const s = o.slice ?? 8, M = o.mid ?? 32, W = s * 2 + M, B = TONES.brass;
  const p = new Px(W, W);
  const F = brassField(M, M, { seed: 19 });
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const { u, d, tl } = edgeOf(x, y, W, W);
      if (d >= s) continue;
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y, W - 1 - y);
      if (cx + cy < 2) continue; // chamfered corners
      const fx = wrap(x - s, M), fy = wrap(y - s, M);
      let k = F.K[fy * M + fx];
      const lit = tl ? 1 : -1, uu = wrap(u - s, M);
      if (d === 0) { p.set(x, y, B[0]); continue; }
      if (d === 1) k += 0.3 * lit;
      else if (d === 2) k += 0.12 * lit;
      else if (d === 6) k -= 0.2 * lit;
      else if (d === 7) { p.set(x, y, B[1]); continue; }
      // the engraved vine on the flat band (d 3..5)
      if (d >= 3 && d <= 5) {
        const vine = 4 + Math.sin((uu / M) * Math.PI * 4) * 1.1;
        if (Math.abs(d - vine) < 0.55) { k = 0.22; if (F.V[fy * M + fx] > 0.55) { p.set(x, y, 0x4e6a50); continue; } }
        else if (Math.abs(d - 1 - vine) < 0.55) k += 0.18; // the cut catches light on its lower lip
        const leaf = wrap(uu, 8);
        if ((leaf === 3 || leaf === 4) && d === (Math.sin((uu / M) * Math.PI * 4) > 0 ? 3 : 5)) k = 0.3;
      }
      // tarnish on the lower/right rails
      if (!tl && F.V[fy * M + fx] > 0.6) k -= 0.12;
      p.set(x, y, quant(B, k, x, y, 0.35));
    }
  // glints on the lit bevel
  for (const [x, y] of [[12, 1], [1, 15], [30, 1], [1, 34]]) { p.set(x, y, B[9]); p.set(x + 1, y, B[8]); }
  for (const [x, y] of [[4, 4], [W - 5, 4], [4, W - 5], [W - 5, W - 5]]) rivet(p, x + 0.5, y + 0.5, B, 1.7);
  p.outline(0x24140a);
  return p;
}

/** Hand-inked double rule (slice 4 on 32) whose lines wobble like a quick pen, with a wash inside. */
export function sketchFrame() {
  const s = 4, M = 24, W = 32, ink = 0x5a3a20, wash = 0x6e4a2a;
  const p = new Px(W, W);
  const wob = (e, u) => (pnoise(((u - s) * 3) / M, e * 2.7, 3, 16, 51) > 0.62 ? 1 : 0);
  for (let i = 1; i < W - 1; i++) {
    for (const [e, x, y] of [[0, i, 1], [2, i, W - 2], [3, 1, i], [1, W - 2, i]]) {
      const w = wob(e, i), dx = e === 3 ? w : e === 1 ? -w : 0, dy = e === 0 ? w : e === 2 ? -w : 0;
      p.set(x + dx, y + dy, ink);
      if (hash(i, e, 52) < 0.18) p.set(x + dx + (dy ? 0 : 0), y + dy + (dx ? 0 : 0), 0x7a5a3a); // pen pressure
    }
    if (i >= 3 && i <= W - 4) for (const [x, y] of [[i, 3], [i, W - 4], [3, i], [W - 4, i]]) if (hash(i, x + y, 53) > 0.15) p.set(x, y, wash, 90);
  }
  // overshoots at the corners
  for (const [x, y] of [[0, 1], [1, 0], [W - 1, W - 2], [W - 2, W - 1], [W - 1, 1], [0, W - 2], [2, 0]]) p.set(x, y, ink, 200);
  p.set(2, 2, wash, 120); p.set(W - 3, W - 3, wash, 120);
  return p;
}

/**
 * A tooled leather book cover (slice 12 on 72): pebbled leather rubbed pale at the edges, a blind-
 * tooled double rule, a gilt fillet with a dotted roll and a fleuron at each corner, engraved brass
 * corner guards with two rivets each.
 */
export function coverFrame(pal = TONES.oxblood, o = {}) {
  const s = 12, M = 48, W = s * 2 + M, B = TONES.brass, sd = o.seed ?? 23;
  const p = new Px(W, W);
  const F = leatherField(M, M, { seed: sd, cell: 3.4 });
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const { u, d, tl } = edgeOf(x, y, W, W);
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y, W - 1 - y);
      if (cx + cy < 2 || d >= s) continue;
      let k = F.K[wrap(y - s, M) * M + wrap(x - s, M)];
      const lit = tl ? 1 : -1, uu = wrap(u - s, M);
      if (d === 0) { p.set(x, y, pal[0]); continue; }
      if (d === 1) k += 0.22 + (hash(uu, 1, sd) < 0.3 ? 0.12 : 0); // rubbed edge
      else if (d === 2) k += 0.1 * lit + 0.06;
      else if (d === 3) k -= 0.08;
      else if (d === 5) k -= 0.3; // blind-tooled rule
      else if (d === 6) k += 0.12;
      else if (d === 7) k -= 0.12;
      if (d === 9) { // the gilt fillet
        p.set(x, y, quant(B, 0.78 + (tl ? 0.12 : -0.1) + (hash(uu, d, sd + 1) - 0.5) * 0.2, x, y, 0.3));
        continue;
      }
      if (d === 10 && wrap(uu, 3) === 1) { p.set(x, y, B[6]); continue; } // dotted roll
      if (d === 10) k -= 0.12;
      p.set(x, y, quant(pal, k, x, y, 0.4));
    }
  // a gilt fleuron where the fillet turns
  for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = fx > 0 ? 9 : W - 10, cy = fy > 0 ? 9 : W - 10;
    for (const [dx, dy, c] of [[1, 1, 7], [2, 2, 6], [1, 2, 5], [2, 1, 5], [3, 3, 8]]) p.set(cx + dx * fx, cy + dy * fy, B[c]);
  }
  // brass corner guards
  const guard = (fx, fy) => {
    const X = (x) => (fx ? W - 1 - x : x), Y = (y) => (fy ? W - 1 - y : y);
    for (let y = 1; y <= 12; y++)
      for (let x = 1; x <= 12; x++) {
        if (x + y > 14 || x + y < 3) continue;
        let k = 0.62 + (hash(x, y, 27) - 0.5) * 0.08 - (x + y) * 0.012;
        if (x === 1 || y === 1) k += 0.25;
        if (x + y === 14) k = 0.08;
        else if (x + y === 13) k = 0.3;
        if (x + y === 10) k -= 0.28; // engraved line parallel to the edge
        if (x + y === 11) k += 0.12;
        if ((x === 2 || y === 2) && x + y > 4 && x + y < 13) k += 0.1;
        if (!fx && !fy) k += 0.04; else if (fx && fy) k -= 0.08;
        p.set(X(x), Y(y), quant(B, k, x, y, 0.3));
      }
    // engraved leaf
    for (const [x, y] of [[5, 4], [4, 5], [6, 4], [4, 6], [5, 5]]) p.set(X(x), Y(y), B[2]);
    p.set(X(4), Y(4), B[8]);
    rivet(p, X(8) + 0.5, Y(3) + 0.5, B, 1.1);
    rivet(p, X(3) + 0.5, Y(8) + 0.5, B, 1.1);
  };
  guard(false, false); guard(true, false); guard(false, true); guard(true, true);
  p.outline(pal[0]);
  return p;
}

/** A hanging signboard that tiles (slice 6 on 36×24): chamfered plank, grain, a groove, iron nails. */
export function signBoard(pal = TONES.wood) {
  const s = 6, Mx = 24, My = 12, W = s * 2 + Mx, H = s * 2 + My;
  const p = new Px(W, H);
  const F = woodField(Mx, My, { seed: 57, base: 0.52, knots: 0, wave: 3.5, spacing: 2.4 });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
      if (cx + cy < 2) continue;
      const d = Math.min(cx, cy), tl = (cx === x && cx <= cy) || (cy === y && cy <= cx);
      let k = F.K[wrap(y - s, My) * Mx + wrap(x - s, Mx)];
      if (d === 0) { p.set(x, y, pal[0]); continue; }
      if (d === 1) k += tl ? 0.26 : -0.2;
      else if (d === 2) k += tl ? 0.12 : -0.08;
      else if (d === 3) k += tl ? -0.24 : 0.14; // routed groove
      else if (d === 4) k += tl ? 0.1 : -0.06;
      p.set(x, y, quant(pal, k, x, y, 0.3));
    }
  for (const [x, y] of [[2, 2], [W - 4, 2], [2, H - 4], [W - 4, H - 4]]) nailHead(p, x, y);
  return p;
}

/** A gold ticket that tiles (slice 6 on 36×24): perforated edges, a guilloché band, an engraved rule. */
export function ticketFrame() {
  const s = 6, Mx = 24, My = 12, W = s * 2 + Mx, H = s * 2 + My, B = TONES.brass;
  const p = new Px(W, H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const ux = wrap(x - s, Mx), uy = wrap(y - s, My);
      // perforations along the left and right edges
      if ((x === 1 || x === W - 2) && wrap(uy, 3) === 0) continue;
      const d = Math.min(x - 1, y - 1, W - 2 - x, H - 2 - y);
      let k = 0.74 + (hash(x, y, 91) - 0.5) * 0.05;
      if (d === 0) k = y === 1 || x === 1 ? 0.95 : 0.4;
      else if (d === 2 || d === 4) k = 0.5; // engraved double rule
      else if (d === 3) k = 0.66 + (Math.sin((((y < 4 || y > H - 5) ? ux : uy) / 6) * Math.PI * 2) > 0 ? 0.08 : -0.08); // guilloché
      else if (d >= 5) k = 0.76 + Math.sin((ux + uy) * 0.7) * 0.03;
      p.set(x, y, quant(B, k, x, y, 0.4));
    }
  p.outline(B[2]);
  return p;
}

/**
 * Buttons as 9-slices (top 2, sides 3, bottom 3 on 22×13; the middle tiles across and stretches
 * down): an ink outline with cut corners, a lit bevel, a brushed / grained face and a dark front lip
 * that the button sinks into when pressed (down = true).
 */
export function buttonFrame(kind = 'gold', down = false) {
  const W = 22, H = 13;
  const pal = kind === 'alt' ? [0x6a5236, 0x8a6e48, 0xb8986a, 0xd2b88a, 0xe2cca0, 0xecd9b0, 0xf4e6c6, 0xf8ecd2, 0xfdf6e6, 0xfffaf0]
    : kind === 'danger' ? [0x3a0a06, 0x5a140c, 0x7a1e12, 0x8a2418, 0xa62e20, 0xc23c2c, 0xd44c38, 0xe8604a, 0xf48066, 0xff9a7a]
      : kind === 'wood' ? TONES.wood.slice(1)
        : TONES.brass;
  const p = new Px(W, H);
  const F = kind === 'wood' ? woodField(16, 8, { seed: 77, base: 0.55, knots: 0, wave: 2 }) : null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ux = wrap(x - 3, 16);
      // brushed / grained face, lighter at the top
      let k = 0.66 - (y - 2) * 0.03;
      if (F) k = F.K[wrap(y - 2, 8) * 16 + ux] + 0.04 - (y - 2) * 0.02;
      else if (kind === 'gold') k += (pnoise(ux / 4, y * 1.3, 4, 64, 7) - 0.5) * 0.16 + (hash(ux, y, 8) - 0.5) * 0.04;
      else k += (hash(ux, y, kind === 'alt' ? 9 : 10) - 0.5) * 0.08 + (pnoise(ux / 4, y * 0.8, 4, 64, 11) - 0.5) * 0.1;
      if (down) k -= 0.08;
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) { p.set(x, y, INK); continue; }
      if (!down) {
        if (y === 1) k = 0.97;
        else if (x === 1) k = 0.86;
        else if (x === W - 2) k = 0.36;
        else if (y === H - 2) k = 0.12; // the front lip
        else if (y === H - 3) k = 0.3;
        else if (x === 2) k += 0.08;
        else if (x === W - 3) k -= 0.08;
      } else {
        if (y === 1) k = 0.2; // pressed in: the top in shadow, no lip
        else if (x === 1) k = 0.3;
        else if (y === 2) k -= 0.1;
        else if (x === W - 2 || y === H - 2) k += 0.06;
      }
      p.set(x, y, quant(pal, k, x, y, 0.4));
    }
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) p.clear(x, y);
  // stamped dots in the corners of the face (the maker's punch)
  if (!down && kind !== 'alt') for (const [x, y] of [[2, 2], [W - 3, 2]]) p.set(x, y, pal[Math.max(0, pal.length - 2)]);
  return p;
}

/**
 * A wax seal (26×30): a red blob with a pressed rim and drips, the mole-star sigil sunk into it,
 * two ribbon tails underneath.
 */
export function waxSeal(R = [0x2a0604, 0x4a0c08, 0x6a140c, 0x8a1e12, 0xa62a1a, 0xc23c2c, 0xd85a44, 0xf08a6a, 0xffc0a0]) {
  const W = 26, H = 30, p = new Px(W, H), cx = 13, cy = 12;
  // the ribbon tails (behind)
  for (const side of [-1, 1]) {
    for (let t = 0; t < 15; t++) {
      const x0 = cx + side * (2 + t * 0.45), y0 = cy + 6 + t;
      for (let w = -2; w <= 2; w++) {
        const x = Math.round(x0 + w), y = Math.round(y0 + w * 0.3 * side);
        const k = w === -2 || w === 2 ? 0x2a3a5a : w === -1 ? 0x5a76a0 : 0x3a5272;
        p.set(x, y, k);
      }
    }
    // a swallowtail cut at the end
    const ex = Math.round(cx + side * (2 + 14 * 0.45)), ey = cy + 20;
    p.clear(ex, ey + 1); p.clear(ex, ey); p.clear(ex + side, ey + 1);
  }
  // the blob: a wobbly disk
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx), d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const r = 10 + (pnoise((a / (Math.PI * 2)) * 11 + 11, 0, 11, 2, 93) - 0.5) * 2.6;
      if (d > r) continue;
      const lit = -Math.cos(a + 2.36);
      let k = 0.55 + (hash(x, y, 94) - 0.5) * 0.05;
      if (d > r - 1.2) k = 0.32 + lit * 0.25; // the edge of the blob rolls over
      else if (d > r - 3.2) k = 0.62 + lit * 0.22; // the pressed rim stands proud
      else if (d > r - 4.2) k = 0.4 - lit * 0.18; // the die's edge cut in
      else k = 0.5 + (fbm(x, y, 32, 32, 6, 2, 95) - 0.5) * 0.12;
      p.set(x, y, quant(R, k, x, y, 0.3));
    }
  // the sigil: an eight-point star, sunk in (lit from the top-left, so its upper edges are dark)
  const S = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 2.2 : 5.2; S.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const star = new Px(W, H);
  star.poly(S, 0xffffff);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!star.a(x, y)) continue;
      const up = !star.a(x, y - 1) || !star.a(x - 1, y), dn = !star.a(x, y + 1) || !star.a(x + 1, y);
      p.set(x, y, up ? R[2] : dn ? R[7] : R[4]);
    }
  p.set(cx, cy, R[3]); p.set(cx - 1, cy - 1, R[6]);
  // drips and a highlight
  p.set(cx + 8, cy + 8, R[4]); p.set(cx + 8, cy + 9, R[3]); p.set(cx - 9, cy + 6, R[4]);
  p.set(cx - 6, cy - 7, R[8]); p.set(cx - 5, cy - 8, R[7]); p.set(cx - 7, cy - 5, R[7]);
  p.outline(0x1a0604);
  return p;
}

/** A brass eyelet (7×7) for price tags. */
export function eyelet() {
  const p = new Px(7, 7), B = TONES.brass;
  p.disk(3.5, 3.5, 3.4, B[1]);
  p.disk(3.5, 3.5, 2.7, B[5]);
  p.disk(3.5, 3.5, 1.2, 0x2a1408);
  p.set(1, 2, B[8]); p.set(2, 1, B[8]); p.set(5, 4, B[3]); p.set(4, 5, B[3]);
  return p;
}
