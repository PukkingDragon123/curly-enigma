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
  // (ui3: material variety) a trader's ledger paper, Rocco's kraft, linen, veg-tan leather, cork, newsprint, timber
  ledger: [0x9c9070, 0xb2a684, 0xc6bb98, 0xd6ccaa, 0xe2d9ba, 0xebe3c8, 0xf2ecd8, 0xf9f5e8],
  kraft: [0x5e4026, 0x74522f, 0x8a6339, 0x9c7343, 0xac824e, 0xba9058, 0xc79d64, 0xd3aa72],
  linen: [0x6e5e44, 0x86765a, 0x9c8c6e, 0xb2a282, 0xc6b896, 0xd6caaa, 0xe4dabe, 0xf0e8d2],
  veg: [0x4a2a14, 0x683c1c, 0x865026, 0xa26432, 0xb87840, 0xcc8c50, 0xdaa064, 0xe6b47c, 0xf0c896],
  cork: [0x4a2e14, 0x5e3c1c, 0x744c26, 0x8a5e32, 0x9e703e, 0xb0824a, 0xc29458, 0xd2a66a],
  news: [0x8e8676, 0xa49c8a, 0xb8b09c, 0xc8c0aa, 0xd6cfb8, 0xe0dac4, 0xe9e4d0, 0xf2eedf],
  timber: [0x1c1008, 0x2a180c, 0x3a2212, 0x4a2c18, 0x5a361e, 0x6a4024, 0x7a4c2c, 0x8a5834, 0x9a663e, 0xac7648],
};
const INK = 0x24150d;

// ---------------------------------------------------------------- texture fields
/** A paper brightness field (periodic W×H): mottling, cloudy pulp, fibres, foxing haloes, stains, rules. */
export function paperField(W, H, o = {}) {
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
    for (let x = 0; x < W; x++) if (hash(x >> 2, y, s + 21) > 0.1) K[y * W + x] -= hash(x, y, s + 22) < 0.85 ? 0.17 : 0.08;
  return { K, fox, W, H };
}
/** Paint a paper field into a Px (with an offset), foxing cores on top. */
export function paintPaper(p, F, pal, ox = 0, oy = 0, mask = null) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (mask && !mask(x, y)) continue;
      const fx = wrap(x - ox, F.W), fy = wrap(y - oy, F.H);
      p.set(x, y, quant(pal, F.K[fy * F.W + fx], fx, fy, 0.6));
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
            p.set(X, Y, mix(p.get(X, Y), d < r * 0.5 ? 0xb07a46 : 0xc89a64, d < r * 0.5 ? 0.55 : 0.35));
          }
      }
}

/** A plank-wood brightness field (periodic): flowing grain, rings, pores, knots, butt joints, nails. */
export function woodField(W, H, o = {}) {
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
      if (hash(x, y, s + 9) < (o.pores ?? 0.035)) k -= 0.12; // pores
      k += (hash(x, y, s + 10) - 0.5) * (o.noise ?? 0.05);
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
export function paintWood(p, F, pal, ox = 0, oy = 0, mask = null, nail = [0x3a2a1e, 0x9a8a76]) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (mask && !mask(x, y)) continue;
      const fx = wrap(x - ox, F.W), fy = wrap(y - oy, F.H), i = fy * F.W + fx;
      p.set(x, y, F.C[i] === 0 ? pal[0] : F.C[i] === 1 ? (hash(fx, fy, 3) < 0.5 ? nail[1] : nail[0]) : quant(pal, F.K[i], fx, fy, 0.35));
    }
}

/** Pebbled leather (periodic W×H): a dome per grain cell lit from the top-left, valleys, wear, creases. */
export function leatherField(W, H, o = {}) {
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
      let k = (o.base ?? 0.52) - ((x + 0.5 - bx) + (y + 0.5 - by)) * (o.dome ?? 0.045);
      if (Math.sqrt(d2) - Math.sqrt(d1) < 0.8) k -= o.valley ?? 0.11;
      k += (fbm(x, y, W, H, Math.max(8, W / 3), 2, s + 4) - 0.5) * (o.wear ?? 0.3);
      const cr = Math.abs(fbm(x + y * 0.4, y, W, H, Math.max(6, W / 4), 1, s + 7) - 0.5);
      if (cr < 0.018) k -= 0.12;
      k += (hash(x, y, s + 9) - 0.5) * 0.03;
      K[y * W + x] = k;
    }
  // a few scratches: pale lines with a dark lip
  for (let i = 0; i < Math.round((W * H) / 900); i++) {
    let x = hash(i, 1, s + 11) * W, y = hash(i, 2, s + 11) * H;
    const a = hash(i, 3, s + 11) * Math.PI, L = 3 + hash(i, 4, s + 11) * 8;
    for (let t = 0; t < L; t++) { K[wrap(Math.round(y), H) * W + wrap(Math.round(x), W)] += 0.16; K[wrap(Math.round(y) + 1, H) * W + wrap(Math.round(x), W)] -= 0.07; x += Math.cos(a); y += Math.sin(a) * 0.6; }
  }
  return { K, W, H };
}
export const paintField = (p, F, pal, ox = 0, oy = 0, dither = 0.5, mask = null) => {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (mask && !mask(x, y)) continue;
      const fx = wrap(x - ox, F.W), fy = wrap(y - oy, F.H);
      p.set(x, y, quant(pal, F.K[fy * F.W + fx], fx, fy, dither));
    }
};

/** Brushed brass (periodic): horizontal streaks, tarnish clouds, a glint or two. */
export function brassField(W, H, o = {}) {
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
  paintField(p, leatherField(W, H, o), pal, 0, 0, 0.25);
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
      if (w > 0.7 && n < 0.35) p.set(x, y, 0xfff4e0, 34);
      else if (n < 0.07) p.set(x, y, 0x000000, 50);
      else if (n > 0.96) p.set(x, y, 0xfff4e0, 36);
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
export function edgeOf(x, y, W, H) {
  const dl = x, dr = W - 1 - x, dt = y, db = H - 1 - y, m = Math.min(dl, dr, dt, db);
  if (m === dt) return { e: 0, u: x, d: dt, tl: true };
  if (m === dl) return { e: 3, u: y, d: dl, tl: true };
  if (m === db) return { e: 2, u: x, d: db, tl: false };
  return { e: 1, u: y, d: dr, tl: false };
}
export function rivet(p, x, y, pal = TONES.brass, r = 1.6) {
  p.disk(x, y, r + 0.7, pal[0]);
  p.disk(x, y, r, pal[4]);
  p.disk(x - 0.4, y - 0.4, r * 0.65, pal[6]);
  p.set(Math.floor(x - 0.6), Math.floor(y - 0.6), pal[9]);
  p.set(Math.floor(x + 0.6), Math.floor(y + 0.6), pal[2]);
}
export function nailHead(p, x, y) { // a hand-forged iron nail: a squarish dome, a rust stain under it
  p.set(x, y, 0x8a7a68); p.set(x + 1, y, 0x4a4038); p.set(x, y + 1, 0x4a4038); p.set(x + 1, y + 1, 0x241c16);
  p.set(x - 1, y, 0x1a120c, 140); p.set(x, y - 1, 0x1a120c, 140); p.set(x + 2, y + 1, 0x140c08, 150); p.set(x + 1, y + 2, 0x5a2e14, 150);
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
  const bite = (e, u) => { const uu = wrap(u - s, M), b = Math.floor(hash(e, 9, sd) * (M - 6)); return uu >= b && uu < b + 4 ? [1, 2, 2, 1][uu - b] : 0; };
  const ta = o.tear ?? 1;
  const tear = (e, u) => 0.7 + (pnoise(((u - s) * 5) / M, e * 3.1, 5, 64, sd) - 0.3) * 2.6 * ta + (hash(wrap(u - s, M), e, sd) < 0.14 * ta ? 1 : 0) + (o.bites === false ? 0 : bite(e, u));
  const burn = (e, u) => 1.4 + pnoise(((u - s) * 4) / M, e * 2.3 + 9, 4, 64, sd + 1) * (o.burn ?? 2.6);
  const inside = (x, y) => {
    if (x < tear(3, y) || W - 1 - x < tear(1, y) || y < tear(0, x) || W - 1 - y < tear(2, x)) return false;
    // round the four corners a little
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, W - 1 - y);
    return !(cx + cy < 3);
  };
  const F = paperField(M, M, { seed: sd + 3, fox: o.fox ?? 2.4, stains: 0, fibres: o.fibres });
  paintPaper(p, F, o.pal || TONES.paper, s, s, inside);
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
      let k = 0.55 + (pnoise((uu * 8) / M, d * 0.3, 8, 16, sd + 1) - 0.5) * 0.24;
      if (ring < 0.26) k -= 0.2; else if (ring > 0.8) k += 0.06;
      if (hash(uu >> 1, d * 7 + (tl ? 0 : 3), sd + 2) < 0.07) k -= 0.14; // long pores
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
      // a rope moulding on the band (d 3..5): twisted strands, each lit on its upper side
      if (d >= 3 && d <= 5) {
        const t = wrap(uu + (tl ? d : -d), 4);
        k = t === 0 ? 0.2 : t === 1 ? 0.86 : t === 2 ? 0.66 : 0.48;
        if (d === 3) k += 0.06 * lit; else if (d === 5) k -= 0.06 * lit;
        if (F.V[fy * M + fx] > 0.64 && t === 0) { p.set(x, y, 0x3a3a1e); continue; } // grime in the twist
      }
      // tarnish on the lower/right rails
      if (!tl && F.V[fy * M + fx] > 0.6) k -= 0.1;
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
  const F = leatherField(M, M, { seed: sd, cell: 3.4, dome: 0.04, valley: 0.1, wear: 0.28 });
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
      p.set(x, y, quant(pal, k, x, y, 0.25));
    }
  // a gilt fleuron where the fillet turns
  for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = fx > 0 ? 8 : W - 9, cy = fy > 0 ? 8 : W - 9;
    for (const [dx, dy, c] of [[1, 1, 7], [2, 2, 6], [1, 2, 5], [2, 1, 5], [3, 3, 8]]) p.set(cx + dx * fx, cy + dy * fy, B[c]);
  }
  // brass corner guards
  const guard = (fx, fy) => {
    const X = (x) => (fx ? W - 1 - x : x), Y = (y) => (fy ? W - 1 - y : y);
    const L = 13; // the guard's diagonal edge: x + y = L (it must stay inside the 12-px corner slice)
    for (let y = 1; y <= 11; y++)
      for (let x = 1; x <= 11; x++) {
        if (x + y > L || x + y < 3) continue;
        let k = 0.64 + (hash(x, y, 27) - 0.5) * 0.06 - (x + y) * 0.01;
        if (x === 1 || y === 1) k = 0.92; // the folded lip over the board's edge
        else if (x === 2 || y === 2) k = 0.5;
        if (x + y === L) k = 0.06;
        else if (x + y === L - 1) k = 0.28;
        else if (x + y === L - 4) k = 0.3; // engraved line parallel to the edge
        else if (x + y === L - 3) k = 0.82;
        if (!fx && !fy) k += 0.04; else if (fx && fy) k -= 0.08;
        p.set(X(x), Y(y), quant(B, k, x, y, 0.25));
      }
    // an engraved trefoil in the corner
    for (const [x, y, c] of [[4, 3, 2], [3, 4, 2], [4, 4, 8], [5, 4, 3], [4, 5, 3]]) p.set(X(x), Y(y), B[c]);
    rivet(p, X(7) + 0.5, Y(2) + 0.5, B, 0.9);
    rivet(p, X(2) + 0.5, Y(7) + 0.5, B, 0.9);
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
  // the ribbon tails (behind): two flat bands splaying out, a V cut in each end, a fold shade
  const RB = [0x1a2638, 0x2a3c56, 0x3a5272, 0x5a76a0, 0x8eaad2];
  for (const side of [-1, 1]) {
    const ang = side * 0.62, dx = Math.sin(ang), dy = Math.cos(ang);
    for (let t = 0; t <= 16; t++)
      for (let w = -2.5; w <= 2.5; w += 0.5) {
        const x = Math.round(cx + dx * t + dy * w), y = Math.round(cy + 4 + dy * t - dx * w);
        const cut = t > 13 && Math.abs(w) < (t - 13) * 0.9; // the swallowtail notch
        if (cut) continue;
        const edge = Math.abs(w) > 2;
        p.set(x, y, edge ? RB[0] : RB[(w * side < -0.5 ? 3 : w * side > 1 ? 1 : 2) + (t < 3 ? -1 : 0)]);
      }
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
      else k = 0.4 + (fbm(x, y, 32, 32, 6, 2, 95) - 0.5) * 0.1;
      p.set(x, y, quant(R, k, x, y, 0.3));
    }
  // the sigil: Old Star's eight-point star, raised off a sunken field (lit from the top-left)
  const S = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 2.4 : 5.6; S.push([cx + 0.5 + Math.cos(a) * r, cy + 0.5 + Math.sin(a) * r]); }
  const star = new Px(W, H);
  star.poly(S, 0xffffff);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!star.a(x, y)) continue;
      const up = !star.a(x, y - 1) || !star.a(x - 1, y), dn = !star.a(x, y + 1) || !star.a(x + 1, y);
      p.set(x, y, up ? R[7] : dn ? R[2] : R[6]);
      if (!star.a(x + 1, y + 1) && p.a(x + 1, y + 1) && !star.a(x + 1, y + 1)) p.set(x + 1, y + 1, R[1]); // its shadow on the field
    }
  p.set(cx, cy, R[8]);
  // drips and a highlight
  p.set(cx + 8, cy + 8, R[4]); p.set(cx + 8, cy + 9, R[3]); p.set(cx - 9, cy + 6, R[4]);
  p.set(cx - 6, cy - 7, R[8]); p.set(cx - 5, cy - 8, R[7]); p.set(cx - 7, cy - 5, R[7]);
  p.outline(0x1a0604);
  return p;
}

/** A brass eyelet (5×5) punched through a price tag. */
export function eyelet() {
  const p = new Px(5, 5), B = TONES.brass;
  p.disk(2.5, 2.5, 2.5, B[2]);
  p.set(1, 0, B[7]); p.set(0, 1, B[7]); p.set(1, 1, B[8]); p.set(2, 0, B[6]); p.set(0, 2, B[6]);
  p.set(3, 4, B[1]); p.set(4, 3, B[1]); p.set(3, 3, B[3]);
  p.set(2, 2, 0x1a0c06); p.set(2, 1, B[3]); p.set(1, 2, B[3]);
  return p;
}

/**
 * Stitched leather (slice 10 on 52): pebbled hide with a rolled, rubbed edge, a pressed groove and a
 * saddle stitch in pale waxed thread (on the middle's period), a brass rivet in each corner.
 */
export function leatherFrame(pal = TONES.oxblood, thread = 0xe6c690) {
  const s = 10, M = 32, W = s * 2 + M, B = TONES.brass;
  const p = new Px(W, W);
  const F = leatherField(M, M, { seed: 43, cell: 3.4, dome: 0.04, valley: 0.1, wear: 0.3 });
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const { u, d, tl } = edgeOf(x, y, W, W);
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y, W - 1 - y);
      if (cx + cy < 4 || d >= s) continue; // rounded corners
      let k = F.K[wrap(y - s, M) * M + wrap(x - s, M)];
      const uu = wrap(u - s, M), lit = tl ? 1 : -1;
      if (d === 0) { p.set(x, y, pal[0]); continue; }
      if (d === 1) k += 0.2 * lit + 0.08;
      else if (d === 2) k += 0.08 * lit;
      else if (d === 4) k -= 0.2; // the pressed groove the stitches sit in
      if (d === 5) {
        const st = wrap(uu, 4);
        if (st < 2) { p.set(x, y, st === 0 ? mix(thread, 0xffffff, tl ? 0.3 : 0.1) : thread); continue; }
        if (st === 2) k -= 0.22; // the stitch hole
      } else if (d === 6 && wrap(uu, 4) < 2) k -= 0.16; // the thread's shadow
      if (d === 7) k += 0.05 * lit;
      p.set(x, y, quant(pal, k, x, y, 0.25));
    }
  for (const [x, y] of [[4.5, 4.5], [W - 4.5, 4.5], [4.5, W - 4.5], [W - 4.5, W - 4.5]]) rivet(p, x, y, B, 1.6);
  p.outline(pal[0]);
  return p;
}

/**
 * The small hanging sign used with `stretch` (slice 6 on 20×18): everything along an edge is constant
 * along it (so stretching does not smear it): a rounded lit lip, a chamfer, grain rows top and
 * bottom, a dark underside, an iron nail in each corner; the middle is plain board.
 */
export function stretchSign(pal = TONES.wood) {
  const W = 20, H = 18, p = new Px(W, H);
  const rowK = [0, 0.92, 0.74, 0.56, 0.44, 0.56, /* middle */ 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, /* bottom */ 0.5, 0.4, 0.5, 0.34, 0.2, 0];
  const colK = [0, 0.8, 0.66, 0.56, 0.5, 0.56];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
      if (cx + cy < 2) continue;
      let k;
      const inX = x >= 6 && x < W - 6, inY = y >= 6 && y < H - 6;
      if (inX || (!inY && cy < cx)) k = rowK[y]; // top / bottom bands (and their corners, outer part)
      else if (inY || cx <= cy) k = x < 6 ? colK[x] : colK[W - 1 - x] - (W - 1 - x > 0 && W - 1 - x < 3 ? 0.3 : 0.06);
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) { p.set(x, y, pal[0]); continue; }
      p.set(x, y, quant(pal, k, x, y, 0));
    }
  for (const [x, y] of [[2, 2], [W - 4, 2], [2, H - 5], [W - 4, H - 5]]) nailHead(p, x, y);
  return p;
}

// ---------------------------------------------------------------- ui3: more materials
/**
 * A torn poster pasted to a board (slice 7 on 40): newsprint torn ragged all round (deeper bites than
 * the parchment), the top-right corner ripped away, paste stains where it was glued, a letterpress
 * double rule in `ink` worn through in places, and a crease where it was folded in a pocket.
 */
export function tornPoster(ink = 0xa8321e, o = {}) {
  const s = 7, M = 26, W = s * 2 + M, sd = o.seed ?? 131;
  const p = new Px(W, W);
  const rag = (e, u) => {
    const uu = wrap(u - s, M);
    let t = 0.6 + pnoise((uu * 6) / M, e * 2.3, 6, 16, sd) * 2.4;
    if (hash(uu, e, sd + 1) < 0.18) t += 1; // a fibre torn short
    if (wrap(uu - Math.floor(hash(e, 3, sd) * M), M) < 3) t += [2, 3, 1][wrap(uu - Math.floor(hash(e, 3, sd) * M), M)]; // a bite
    return t;
  };
  const inside = (x, y) => {
    if (x < rag(3, y) || W - 1 - x < rag(1, y) || y < rag(0, x) || W - 1 - y < rag(2, x)) return false;
    if (x > W - 1 - s && y < s && (W - 1 - x) + y < s + 1 + (hash(x, y, sd + 2) < 0.4 ? 1 : 0)) return false; // the ripped corner
    return Math.min(x, W - 1 - x) + Math.min(y, W - 1 - y) >= 3;
  };
  const F = paperField(M, M, { seed: sd + 3, base: 0.66, fibres: 1.3, fox: 1.2, mottle: 0.36 });
  paintPaper(p, F, o.pal || TONES.news, s, s, inside);
  const D = p.dist(4);
  p.each((x, y, c) => {
    const d = D(x, y), { e, u, d: dd } = edgeOf(x, y, W, W), uu = wrap(u - s, M);
    // the torn rim shows the paper's grey pulp, a shade darker, one pixel in
    if (d === 1) return mix(c, hash(x, y, sd + 4) < 0.5 ? 0x8a8070 : 0xa49a86, 0.6);
    // the letterpress rule (d 4 and 6 from the edge), the ink worn off where the paper rubbed
    const paste = pnoise((uu * 3) / M, e * 1.9 + 5, 3, 8, sd + 5);
    if ((dd === 4 || dd === 6) && d >= 2 && hash(uu, dd * 4 + e, sd + 6) > 0.08) return mix(c, ink, (dd === 4 ? 0.9 : 0.75) - (paste > 0.62 ? 0.25 : 0));
    // paste stains: yellowed, translucent blooms along the rim
    if (dd <= s && paste > 0.62) return mix(c, 0xc8a050, (paste - 0.62) * 0.9);
    return undefined;
  });
  p.outline(0x4a3a2a);
  return p;
}
/** The poster's newsprint, as a tile: grey fibres, a ghost of print bleeding through from the back. */
export function newsTile(W = 64, H = W) {
  const p = new Px(W, H);
  paintPaper(p, paperField(W, H, { seed: 141, base: 0.68, fibres: 1.4, fox: 0.8, mottle: 0.3 }), TONES.news);
  // show-through: faint rows of letters printed on the other side
  for (let y = 3; y < H; y += 6)
    for (let x = 0; x < W; x++) if (hash(x >> 1, y, 142) < 0.55 && hash(x, y, 143) < 0.7 && wrap(x + (y >> 1), 9) < 7) p.set(x, y, mix(p.get(x, y), 0x6e6658, 0.12));
  return p;
}

/** Cork board (periodic): pressed granules, each lit on its upper left, dark pits, old pin holes. */
export function corkTile(W = 48, H = W) {
  const p = new Px(W, H), pal = TONES.cork;
  const cell = 2.6, nx = Math.round(W / cell), ny = Math.round(H / cell), cw = W / nx, ch = H / ny;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ci = Math.floor(x / cw), cj = Math.floor(y / ch);
      let best = 1e9, bi = 0, bj = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di, jj = cj + dj;
          const px = (ii + 0.2 + hash(wrap(ii, nx), wrap(jj, ny), 151) * 0.6) * cw, py = (jj + 0.2 + hash(wrap(ii, nx), wrap(jj, ny), 152) * 0.6) * ch;
          const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
          if (d < best) { best = d; bi = px - x - 0.5; bj = py - y - 0.5; }
        }
      const g = hash(wrap(Math.floor((x + bi + 0.5) / cw), nx), wrap(Math.floor((y + bj + 0.5) / ch), ny), 153);
      let k = 0.38 + g * 0.42 + (bi + bj) * 0.06;
      if (Math.sqrt(best) > 1.35) k -= 0.2;
      if (hash(x, y, 154) < 0.04) k -= 0.3;
      p.set(x, y, quant(pal, k, x, y, 0.3));
    }
  for (let i = 0; i < 6; i++) { const x = Math.floor(hash(i, 1, 155) * W), y = Math.floor(hash(i, 2, 155) * H); p.set(x, y, pal[0]); p.set(wrap(x + 1, W), wrap(y + 1, H), pal[5]); }
  return p;
}

/**
 * A heavy timber frame (slice 8 on 48): rough-sawn beams with grain along each rail, the saw's
 * kerf marks across it, adze facets, a dark gap where the slate sits, iron corner brackets nailed on.
 */
export function timberFrame(o = {}) {
  const s = 8, M = 32, W = s * 2 + M, T = TONES.timber, I = TONES.silver, sd = o.seed ?? 161;
  const p = new Px(W, W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const { u, d, tl } = edgeOf(x, y, W, W);
      if (d >= s) continue;
      const uu = wrap(u - s, M), lit = tl ? 1 : -1;
      const wave = (pnoise((uu * 3) / M, d * 0.5 + (tl ? 0 : 9), 3, 32, sd) - 0.5) * 4;
      const ring = wrap((d + wave) / 2.6, 1);
      let k = 0.5 + (pnoise((uu * 6) / M, d * 0.4, 6, 16, sd + 1) - 0.5) * 0.26;
      if (ring < 0.22) k -= 0.18; else if (ring > 0.84) k += 0.06;
      if (wrap(uu * 2 + d, 7) === 0 && hash(uu, d, sd + 2) < 0.5) k -= 0.08; // kerf marks
      if (hash(uu >> 2, tl ? 1 : 2, sd + 3) < 0.25 && d >= 2 && d <= 5) k += 0.07; // an adze facet
      if (d === 0) { p.set(x, y, T[0]); continue; }
      if (d === 1) k += 0.26 * lit;
      else if (d === 2) k += 0.1 * lit;
      else if (d === 5) k -= 0.06;
      else if (d === 6) k -= 0.24; // the rebate the slate sits in
      else if (d === 7) { p.set(x, y, T[0]); continue; }
      p.set(x, y, quant(T, k, x, y, 0.3));
    }
  // mitres
  for (let i = 1; i < s - 1; i++) for (const [x, y] of [[i, i], [W - 1 - i, i], [i, W - 1 - i], [W - 1 - i, W - 1 - i]]) p.set(x, y, T[1]);
  // iron corner brackets: an L of strap iron, three nails each, rust in the seams
  const strap = (fx, fy) => {
    const X = (v) => (fx ? W - 1 - v : v), Y = (v) => (fy ? W - 1 - v : v);
    const on = (a, b) => (a >= 1 && a <= 6 && b >= 1 && b <= 3) || (b >= 1 && b <= 6 && a >= 1 && a <= 3);
    for (let b = 0; b <= 7; b++)
      for (let a = 0; a <= 7; a++) {
        if (!on(a, b)) { if (on(a - 1, b) || on(a, b - 1) || on(a + 1, b) || on(a, b + 1)) p.set(X(a), Y(b), T[0]); continue; }
        const up = !on(a, b - 1) || !on(a - 1, b), dn = !on(a, b + 1) || !on(a + 1, b);
        let k = 0.45 + (hash(a, b, sd + 4 + fx * 2 + fy) - 0.5) * 0.16;
        if (up) k += fy ? -0.2 : 0.25; if (dn) k += fy ? 0.2 : -0.25;
        const c = quant(I, k, a, b, 0.4);
        p.set(X(a), Y(b), hash(a, b, sd + 6) < 0.18 ? mix(c, 0x8a4a22, 0.5) : c);
      }
    for (const [a, b] of [[2, 2], [5, 2], [2, 5]]) { p.set(X(a), Y(b), I[7]); p.set(X(a) + (fx ? -1 : 1), Y(b) + (fy ? -1 : 1), I[1]); }
  };
  strap(false, false); strap(true, false); strap(false, true); strap(true, true);
  return p;
}

/**
 * A chalk slate, as a big tile (periodic W×H): the stone's cleavage, eraser swirls of chalk dust,
 * ghost tallies and sums that never quite rubbed off, a few bright specks of chalk.
 */
export function chalkSlate(W = 96, H = 64) {
  const p = new Px(W, H), S = TONES.slate;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let k = 0.5 + (fbm(x, y, W, H, 24, 3, 171) - 0.5) * 0.3 + (hash(x, y, 172) - 0.5) * 0.1;
      if (wrap(y + Math.floor(x / 7), 9) === 0 && hash(x >> 1, y, 173) < 0.45) k -= 0.1;
      p.set(x, y, quant(S, k, x, y, 0.7));
    }
  // eraser swirls: arcs of dust, densest along their middle
  for (let i = 0; i < 5; i++) {
    const cx = hash(i, 1, 174) * W, cy = hash(i, 2, 174) * H, R = 9 + hash(i, 3, 174) * 14, a0 = hash(i, 4, 174) * 6.28, a1 = a0 + 1.6 + hash(i, 5, 174) * 2.2;
    for (let a = a0; a < a1; a += 0.02)
      for (let w = -3; w <= 3; w++) {
        const x = Math.round(cx + Math.cos(a) * (R + w)), y = Math.round(cy + Math.sin(a) * (R + w) * 0.6);
        const X = wrap(x, W), Y = wrap(y, H), t = (1 - Math.abs(w) / 4) * 0.22;
        if (hash(X, Y, 175 + i) < 0.5 + t) p.set(X, Y, mix(p.get(X, Y), 0xc8d0c8, t * (hash(X, Y, 176) < 0.6 ? 1 : 0.5)));
      }
  }
  // ghost tallies (four strokes and a slash) and a half-wiped sum line
  const ghost = 0x8a968e;
  for (let g = 0; g < 3; g++) {
    const gx = Math.floor(hash(g, 7, 177) * W), gy = Math.floor(hash(g, 8, 177) * H);
    for (let t = 0; t < 4; t++) for (let j = 0; j < 5; j++) if (hash(t, j + g * 9, 178) < 0.8) p.set(wrap(gx + t * 2, W), wrap(gy + j, H), mix(p.get(wrap(gx + t * 2, W), wrap(gy + j, H)), ghost, 0.45));
    for (let t = 0; t < 8; t++) p.set(wrap(gx - 1 + t, W), wrap(gy + 4 - Math.floor(t * 0.6), H), mix(p.get(wrap(gx - 1 + t, W), wrap(gy + 4 - Math.floor(t * 0.6), H)), ghost, 0.4));
  }
  for (let x = 0; x < 30; x++) if (hash(x, 9, 179) < 0.7) { const X = wrap(40 + x, W), Y = wrap(44, H); p.set(X, Y, mix(p.get(X, Y), ghost, 0.3)); }
  for (let i = 0; i < 14; i++) { const x = Math.floor(hash(i, 10, 180) * W), y = Math.floor(hash(i, 11, 180) * H); p.set(x, y, hash(i, 12, 180) < 0.5 ? 0xdfe6dc : 0xb0bab2); }
  return p;
}

/** The chalk ledge under the slate (a strip, 32 wide, 9 tall, tiles across): a planed rail, dust on it. */
export function chalkLedge() {
  const W = 32, H = 9, T = TONES.timber, p = new Px(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let k = [0.05, 0.86, 0.7, 0.62, 0.56, 0.5, 0.42, 0.28, 0.05][y] + (pnoise(x / 4, y * 0.7, 8, 16, 181) - 0.5) * 0.14;
      if (y === 2 && hash(x, y, 182) < 0.45) { p.set(x, y, hash(x, 1, 183) < 0.5 ? 0xd8ded4 : 0xa8b0a8); continue; } // chalk dust
      p.set(x, y, quant(T, k, x, y, 0.35));
    }
  return p;
}
/** A stub of chalk (13×5) and a felt eraser on a wooden back (22×9), lying on the ledge. */
export function chalkStub() {
  const p = new Px(13, 5);
  for (let x = 1; x < 12; x++) for (let y = 1; y < 4; y++) p.set(x, y, y === 1 ? 0xffffff : y === 2 ? 0xe8ece4 : 0xb8c0b6);
  p.set(1, 1, 0xd8ded4); p.set(11, 3, 0x9aa298); p.set(12, 2, 0xd0d6cc);
  p.outline(0x2a3330);
  return p;
}
export function feltEraser() {
  const p = new Px(22, 9), T = TONES.timber;
  for (let x = 1; x < 21; x++) {
    for (let y = 1; y < 5; y++) p.set(x, y, quant(T, [0, 0.82, 0.62, 0.5, 0.36][y] + (hash(x, y, 191) - 0.5) * 0.12, x, y, 0.4));
    for (let y = 5; y < 8; y++) p.set(x, y, y === 5 ? 0x5a5a62 : hash(x, y, 192) < 0.5 ? 0xd8dcd4 : 0xb8bcb4); // the felt, white with chalk
  }
  p.outline(0x1c1008);
  return p;
}
/** A bent-wire paper clip (7×16): two loops of steel, lit on the left. */
export function paperClip() {
  const p = new Px(7, 16), I = TONES.silver;
  const path = [[1, 13], [1, 3], [2, 1], [4, 1], [5, 3], [5, 12], [4, 14], [3, 14], [3, 5]];
  for (let i = 0; i + 1 < path.length; i++) p.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], I[7]);
  p.each((x, y) => (x >= 4 ? I[4] : y < 3 ? I[8] : undefined));
  p.outline(0x1e1c1c);
  return p;
}
