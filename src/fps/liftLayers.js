// The lift's panel (and the M key's map): the underground drawn side-on as one deep cave
// cross-section, layer by layer, in pixel art that reads as voxels. Home and Deep Town sit at the
// top under the meadow; below them the six layers (Rootsoil, Clayworks, Crystal Grotto, Magma Deep,
// Frost Vault, the Core), each a slab of blocks with lit top faces and shaded fronts, a big cave
// hollow running through it, a far back wall seen through the hollow and dark rock lips in front
// (the three move at different speeds as you scroll: parallax). Each layer is alive with what's
// down there: drips and a pool in the Rootsoil, red clay seams, twinkling crystals, a lava river and
// embers, drifting snow, void sparks; the creatures and plants you've recorded in the Index walk,
// fly and sway in it (the ones you haven't are "?" shapes with eyes in the dark).
//
// Every layer has a plaque: its name and depths, how much of it you've explored (cells walked vs a
// per-layer target), what you've found there, and a Dive button that rides to the nearest unlocked
// lift in it. A layer with no unlocked lift is locked: dim, chained and fogged, with how to unlock
// it. Each lift stands in its layer at its real x, a tag over it (tap to ride); the fog lifts where
// you've actually walked (explored cells projected onto x and depth).
//
// One art pixel = one --px. The slabs are painted once (lazily, as they scroll into view) into
// offscreen canvases; a small rAF loop composites the visible ones into one pixelated canvas with
// sprites and particles on top, and the DOM labels ride on a track moved in step. Scroll with the
// wheel, drag (mouse or touch, with inertia), the keys or the rail on the right.
//
//   openLiftLayers(game, here, opts, dests, ride, locked) → panel handle   (lifts.js openLiftPanel)
//   openLayers(game) → panel handle   (view-only unless you're standing at an unlocked lift)
import { el, clamp, makeNoise2D, makeRng } from '../core/util.js';
import { PixelCanvas, iconURL, drawIconSmall } from '../gfx/PixelArt.js';
import { ZONES } from '../data/zones.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { ORE_SPAWN } from '../data/ores.js';
import { creatureIconURL } from '../ui/UI.js';
import { liftDestinations, lockedLifts, liftUnlocked, rideTo } from './lifts.js';
import './liftLayers.css';

/** Zone n spans [n-1]..[n] metres down. Mirrors ZONE_DEPTHS in deep/Generator.js (where the lifts are). */
export const LIFT_ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210];
const X0 = -96, X1 = 96; // the mine's x extent (Generator BOUNDS), mapped across the scene
/**
 * Explored cells (1 m, open space you've walked near) that count as 100% of a layer: about a fifth
 * of its open cave (sampled from Generator.caveDensity: ~44k, 128k, 228k, 212k, 161k, 131k cells).
 * The radar inks 3 m slices around you, so the rest is out of reach without walking every hall.
 */
export const EXPLORE_TARGET = [0, 9000, 25000, 45000, 42000, 32000, 26000];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

// plants by layer (as in the Index Book, src/ui/IndexBook.js)
const PLANT_ZONES = {
  cave_carrot: [1, 2], glowcap: [1, 2, 3, 5], blindfern: [1, 2], whisperweed: [1, 2, 3, 5, 6], rubber_sap: [2, 3], pepperroot: [2, 4],
  sparkmoss: [3], bubblebulb: [3], crystal_lily: [3, 6], gloomshroom: [3, 4, 5], ashfern: [4], emberbloom: [4, 6], truffle: [1, 2, 4],
  frostbloom: [5, 6], core_lotus: [6],
};
const EXTRA_ORES = { 3: ['amethyst'], 4: ['obsidian_shard'] };
const ORE_COL = {
  coal: [0x2a2628, 0x5a5458], copper_ore: [0xd8804a, 0xffc090], tin_ore: [0xb8c0c8, 0xf0f4f8], salt_crystal: [0xe8e0d8, 0xffffff], fossil: [0xe0d0a8, 0xfff4d8],
  quartz: [0xe8e4f8, 0xffffff], iron_ore: [0xb0603a, 0xe8a070], amber: [0xf0a020, 0xffe080], lumite: [0x7ae08a, 0xd0ffd0], silver_ore: [0xc8d0dc, 0xffffff],
  echo_crystal: [0x8ac8ff, 0xe0f4ff], gravium: [0x8a70d0, 0xd0c0ff], bioxide: [0x6ad8f0, 0xe0ffff], amethyst: [0xa860e0, 0xf0d0ff], gold_ore: [0xf0c030, 0xfff0a0],
  ruby: [0xe0304a, 0xff9aa8], magmaite: [0xff6a1a, 0xffd070], emerald: [0x30c070, 0xb0ffd0], frostite: [0x9aeaff, 0xffffff], sapphire: [0x3a5ae0, 0xa8c0ff],
  mithril_ore: [0x8ad8d8, 0xe8ffff], moonsilver_ore: [0xc8ccf0, 0xffffff], diamond: [0xd8f8ff, 0xffffff], voidstone: [0x6a3ab0, 0xd0a0ff], adamant_ore: [0x5a9a7a, 0xc0f0d8],
  starmetal_ore: [0xf0d890, 0xffffff], sunstone: [0xffc030, 0xfff8c0], obsidian_shard: [0x3a2a4a, 0x9a7ac8],
};
const GLOW_ORES = new Set(['lumite', 'bioxide', 'magmaite', 'frostite', 'moonsilver_ore', 'starmetal_ore', 'sunstone', 'echo_crystal', 'voidstone']);

// ------------------------------------------------------------------ small helpers
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const mul = (c, f) => {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return ((r << 16) | (g << 8) | b) >>> 0;
};
const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t, g = ag + (((b >> 8) & 255) - ag) * t, bl = ab + ((b & 255) - ab) * t;
  return ((r << 16) | (g << 8) | bl) >>> 0;
};
const css = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const zoneOfDepth = (d) => { for (let z = 1; z <= 6; z++) if (d < LIFT_ZONE_DEPTHS[z]) return z; return 6; };
const cssPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;

/** A canvas you can paint pixels into (PixelCanvas) with a few extra shapes. */
class Art extends PixelCanvas {
  /** Opaque write, no blending (fast path). */
  p(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
  }
  /** Alpha (0..255) at a pixel. */
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[((y | 0) * this.w + (x | 0)) * 4 + 3]; }
  /** Colour at a pixel (assumes inside). */
  c(x, y) { const i = ((y | 0) * this.w + (x | 0)) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  /** Multiply-tint an existing pixel toward c by t (keeps alpha). */
  tint(x, y, c, t) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (!d[i + 3]) return;
    d[i] += (((c >> 16) & 255) - d[i]) * t; d[i + 1] += (((c >> 8) & 255) - d[i + 1]) * t; d[i + 2] += ((c & 255) - d[i + 2]) * t;
  }
  stamp(x, y, rows, pal) {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c != null) this.p(x + i, y + j, c);
    }
  }
}
const art = (w, h) => new Art(w, h);

// ------------------------------------------------------------------ what's where (state)
/** The ores, creatures and plants of a layer, with what you've recorded of them. */
export function layerFinds(st, z) {
  const idx = st.data.index || {};
  const ores = [];
  for (const [id] of ORE_SPAWN[z] || []) if (ITEMS[id] && (ITEMS[id].cat === 'mineral' || ITEMS[id].cat === 'gem')) ores.push(id);
  for (const id of EXTRA_ORES[z] || []) if (ITEMS[id] && !ores.includes(id)) ores.push(id);
  const crit = Object.keys(CREATURES).filter((id) => (CREATURES[id].zones || []).includes(z));
  const plants = Object.keys(PLANT_ZONES).filter((id) => ITEMS[id] && PLANT_ZONES[id].includes(z));
  const rec = (cat, id) => ({ id, cat, e: idx[cat + ':' + id] || null });
  return {
    ores: ores.map((id) => rec(ITEMS[id].cat, id)),
    crit: crit.map((id) => rec('critter', id)),
    plants: plants.map((id) => rec('plant', id)),
  };
}

/** Explored cells per layer: counts and the (x, depth) of each (for the fog). */
export function exploredByLayer(st) {
  const ex = st.data.deep?.explored || {};
  const n = [0, 0, 0, 0, 0, 0, 0];
  const pts = [null, [], [], [], [], [], []];
  for (const k in ex) {
    const a = k.indexOf(','), b = k.indexOf(',', a + 1);
    const x = +k.slice(0, a), d = -(+k.slice(a + 1, b));
    const z = zoneOfDepth(Math.max(0, d));
    n[z]++;
    pts[z].push(x, d);
  }
  return { n, pts, pct: n.map((c, z) => (z ? clamp(Math.floor((c / EXPLORE_TARGET[z]) * 100), 0, 100) : 0)) };
}

/** Where a stop is in the world: { x (m), d (depth m), zone, top: true for home / Deep Town }. */
function stopWhere(s, seed) {
  if (s.id === 'home') return { x: 5, d: 0, zone: 0, top: true };
  if (s.id === 'town') return { x: 30, d: 15, zone: 1, top: true };
  let d = s.depth || 0;
  if (d <= 0 && s.zone >= 1) d = s.id === 's0' ? 16 : LIFT_ZONE_DEPTHS[s.zone - 1] + 2; // stations from old saves
  let x = typeof s.x === 'number' ? s.x : null;
  if (x == null) x = /^s\d/.test(s.id) ? 41.1 : s.id === 'L0' ? 5 : -60 + hash(hashStrLite(s.id), seed, 5) * 120;
  return { x, d, zone: s.zone || zoneOfDepth(d), top: false };
}
function hashStrLite(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// ------------------------------------------------------------------ palettes
const ZP = [
  null,
  { // Rootsoil: loam and dirt, roots, moss
    rock: [0x6b4a32, 0x5e4029, 0x7a5638, 0x4e3624], band: [0x86603e, 0x3e2a1c], top: [0x6a8a3a, 0x8aa84a, 0x4e6e2c], back: [0x3a281a, 0x2c1e12, 0x46301e],
    light: 0xffc078, rim: 0xd89a5a, deep: 0x1a100a, fog: 0x120c08, seam: null,
  },
  { // Clayworks: red clay, grey mudstone, wet sheen
    rock: [0xb0663a, 0x9a5630, 0xc47848, 0x86482a], band: [0x7a6250, 0xd8402a], top: [0xd88a58, 0xf0a878, 0xb06a40], back: [0x55281a, 0x441e14, 0x63301e],
    light: 0xffb070, rim: 0xf09060, deep: 0x2a100a, fog: 0x1a0c08, seam: [0x8a8480, 0x6a6460, 0xa8a4a0],
  },
  { // Crystal Grotto: blue granite, crystal rock
    rock: [0x5c6488, 0x4e5476, 0x6a7296, 0x444a68], band: [0x5a5a7a, 0x7a6aa8], top: [0x9aa2c8, 0xb8c0e8, 0x7a82a8], back: [0x23263e, 0x1b1d32, 0x2c3050],
    light: 0x9ad8ff, rim: 0x9ad8ff, deep: 0x0e0e1e, fog: 0x0c0c18, seam: [0x4a4650, 0x5e5a66, 0x76727e],
  },
  { // Magma Deep: basalt columns, magma rock, ash
    rock: [0x3c383e, 0x2e2a30, 0x4a4248, 0x262226], band: [0x4a1e16, 0x6a2a1a], top: [0x6a5e5a, 0x8a7a70, 0x4a4240], back: [0x26161a, 0x1c1014, 0x321c1e],
    light: 0xff7a2a, rim: 0xff8a3a, deep: 0x0e0606, fog: 0x140806, seam: [0x1e1622, 0x2e2234, 0x8a5ac8],
  },
  { // Frost Vault: permafrost, ice, snow
    rock: [0x8eb0c4, 0x7c9eb4, 0xa6c4d8, 0x6a8ca4], band: [0xb8e4f4, 0x5a7a94], top: [0xf0f8ff, 0xd8ecf8, 0xc0dcf0], back: [0x2a3e58, 0x22344c, 0x34486a],
    light: 0xd8f0ff, rim: 0xe0f4ff, deep: 0x0e1626, fog: 0x0e1420, seam: [0x4a2a26, 0x5e3630, 0xc85a2a],
  },
  { // The Core: coreite, star rock, void rock
    rock: [0x3a2652, 0x2e1c44, 0x4a3066, 0x24163a], band: [0x1a1a3a, 0x100818], top: [0x7a58b0, 0x9a78d0, 0x5a3a8a], back: [0x160c24, 0x10081a, 0x1e1030],
    light: 0xc89aff, rim: 0xd8b0ff, deep: 0x08040e, fog: 0x0c0614, seam: [0x2a2244, 0x3a2e5a, 0xd8c8ff],
  },
];

// ------------------------------------------------------------------ layout (art px)
const B = 6; // a voxel block's front face
const SEAM = 7; // the band of other rock between two layers
const TOP_H = 134; // the meadow, home and Deep Town
const CORE_H = 70; // the glowing heart under everything
const GROUND = 40; // the grass line in the top section

/** World x (m) → art x. */
const ax = (W, x) => clamp(Math.round(((x - X0) / (X1 - X0)) * (W - 8) + 4), 3, W - 4);

// ------------------------------------------------------------------ the cave geometry of a layer
function layerGeo(z, W, LH, plq, seed) {
  const n1 = makeNoise2D(seed * 13 + z * 101), n2 = makeNoise2D(seed * 7 + z * 59);
  const ceil = new Float32Array(W), floor = new Float32Array(W);
  const hi = Math.max(SEAM + 30, plq.bottom - 14), lo = Math.max(hi, plq.bottom + 8);
  const fb = LH - 30;
  for (let x = 0; x < W; x++) {
    const under = 1 - smoothstep(plq.right - 2, plq.right + 22, x);
    let c = hi + (lo - hi) * under + n1(x * 0.045, 1.3) * 18 + n2(x * 0.16, 2.1) * 4;
    c = clamp(c, SEAM + 14, fb - 46);
    ceil[x] = c;
    floor[x] = fb + n1(x * 0.035 + 9, 4.2) * 14 + n2(x * 0.14 + 3, 1.7) * 3;
  }
  return { z, W, H: LH, ceil, floor, n1, n2 };
}

/** The block grid of a layer: 0 air, 1 rock, 2 water, 3 lava, 4 ore. */
function layerCells(G, rng, extras) {
  const { W, H } = G;
  const cols = Math.ceil(W / B), rows = Math.ceil(H / B);
  const cell = new Uint8Array(cols * rows).fill(1);
  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 1 : cell[j * cols + i]);
  const set = (i, j, v) => { if (i >= 0 && j >= 0 && i < cols && j < rows && j * B > SEAM) cell[j * cols + i] = v; };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = Math.min(W - 1, i * B + 3), y = j * B + 3;
    if (y > G.ceil[x] && y < G.floor[x]) cell[j * cols + i] = 0;
  }
  // side pockets and crawls in the rock above and below
  for (const p of extras.pockets) {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const dx = (i * B + 3 - p.x) / p.rx, dy = (j * B + 3 - p.y) / p.ry;
      if (dx * dx + dy * dy < 1 && j * B > SEAM + 2) cell[j * cols + i] = 0;
    }
  }
  // the hollow's ceiling and floor row in every column
  const cl = new Int16Array(cols), fl = new Int16Array(cols);
  for (let i = 0; i < cols; i++) {
    const x = Math.min(W - 1, i * B + 3);
    const jm = Math.round((G.ceil[x] + G.floor[x]) / 2 / B);
    let a = jm; while (a > 0 && at(i, a - 1) === 0) a--;
    let b = jm; while (b < rows - 1 && at(i, b) === 0) b++;
    cl[i] = a; fl[i] = b; // first air row, first rock row below
  }
  const keep = (i) => extras.keep.some(([a, b]) => i * B + B > a && i * B < b);
  // mounds and steps on the floor
  for (let k = 0; k < Math.max(3, cols / 6); k++) {
    const i0 = rng.int(0, cols - 1), len = rng.int(2, 6), hh = rng.int(1, 2);
    for (let i = i0; i < Math.min(cols, i0 + len); i++) {
      if (keep(i) || fl[i] - cl[i] < 7) continue;
      const end = i === i0 || i === i0 + len - 1;
      for (let d = 1; d <= (end ? 1 : hh); d++) set(i, fl[i] - d, 1);
    }
  }
  // drip-stone clusters hanging from the ceiling
  for (let k = 0; k < Math.max(3, cols / 5); k++) {
    const i0 = rng.int(0, cols - 1), len = rng.int(1, 4);
    for (let i = i0; i < Math.min(cols, i0 + len); i++) {
      if (fl[i] - cl[i] < 7 || keep(i)) continue;
      const mid = Math.abs(i - (i0 + (len - 1) / 2));
      const hang = Math.max(1, Math.round(rng.int(1, 3) - mid));
      for (let d = 0; d < hang; d++) set(i, cl[i] + d, 1);
    }
  }
  // pillars: from the ceiling to the floor, pinched at the waist
  const nPil = Math.max(1, Math.round(cols / 22));
  for (let k = 0, tries = 0; k < nPil && tries < 40; tries++) {
    const w = rng.int(2, 3), i0 = rng.int(3, cols - w - 4);
    let ok = true;
    for (let i = i0 - 2; i < i0 + w + 2; i++) if (keep(i)) ok = false;
    if (!ok) continue;
    const a = Math.max(...Array.from({ length: w }, (_, q) => cl[i0 + q])), b = Math.min(...Array.from({ length: w }, (_, q) => fl[i0 + q]));
    if (b - a < 6) continue;
    for (let j = a - 1; j < b; j++) {
      const waist = j > a + 1 && j < b - 2;
      for (let q = 0; q < w; q++) if (!(waist && w === 3 && q === 2 && (j - a) % 3 !== 0)) set(i0 + q, j, 1);
    }
    // a ledge out from the pillar
    if (rng() < 0.75) {
      const jj = rng.int(a + 2, b - 4), dir = rng() < 0.5 ? -1 : 1, len = rng.int(2, 5);
      for (let q = 1; q <= len; q++) { const i = dir < 0 ? i0 - q : i0 + w - 1 + q; if (!keep(i)) set(i, jj, 1); }
    }
    k++;
  }
  // pools: a dip in the floor full of water (or lava), with a level surface
  for (const pl of extras.pools) {
    const i0 = Math.max(0, Math.floor(pl.x0 / B)), i1 = Math.min(cols - 1, Math.ceil(pl.x1 / B));
    const j0 = fl[Math.round((i0 + i1) / 2)];
    for (let i = i0; i <= i1; i++) {
      const x = clamp(i * B + 3, 0, W - 1);
      const depth = pl.deep * Math.pow(Math.sin(Math.PI * clamp((x - pl.x0) / (pl.x1 - pl.x0), 0, 1)), 0.6);
      const dj = Math.max(1, Math.round(depth / B));
      for (let j = cl[i] + 1; j < j0; j++) if (j > 0) cell[j * cols + i] = 0;
      for (let j = j0; j < Math.min(rows - 1, j0 + dj); j++) cell[j * cols + i] = pl.kind;
    }
  }
  return { cols, rows, cell, at };
}

// ------------------------------------------------------------------ painting: one block
function paintBlock(pc, x0, y0, c, isOre, ore, z) {
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const x = x0 + i, y = y0 + j;
    const h = hash(x, y, 3 + z);
    let k = c;
    if (j === 0 || i === 0) k = mul(c, 1.13);
    else if (j === B - 1 || i === B - 1) k = mul(c, 0.8);
    else if (h < 0.1) k = mul(c, 0.9);
    else if (h > 0.93) k = mul(c, 1.07);
    pc.p(x, y, k);
  }
  // zone motifs on the face
  const h = hash(x0, y0, 9 + z);
  if (z === 4 && h < 0.18) { // a glowing crack
    for (let k = 1; k < B - 1; k++) pc.p(x0 + k, y0 + ((k * 3 + (h * 99 | 0)) % 3) + 1, k % 2 ? 0xc84a1a : 0xff7a2a);
  } else if (z === 5 && h < 0.2) { // frost bloom
    pc.p(x0 + 2, y0 + 2, 0xffffff); pc.p(x0 + 3, y0 + 2, 0xe8f8ff); pc.p(x0 + 2, y0 + 3, 0xe8f8ff);
  } else if (z === 6 && h < 0.12) { // a star fleck
    pc.p(x0 + 2 + (h * 30 | 0) % 2, y0 + 2, 0xfff0b0);
  } else if (z === 1 && h < 0.1) { // a pebble
    pc.p(x0 + 2, y0 + 3, 0x9a9284); pc.p(x0 + 3, y0 + 3, 0x8a8278); pc.p(x0 + 2, y0 + 4, 0x6a6258);
  } else if (z === 2 && h < 0.08) { // amber fleck
    pc.p(x0 + 3, y0 + 2, 0xffb030); pc.p(x0 + 3, y0 + 3, 0xd07a18);
  }
  if (isOre && ore) {
    const [oc, hi] = ore.col;
    const pts = ore.known ? [[1, 1], [2, 1], [1, 2], [3, 3], [4, 3], [3, 4], [4, 4], [2, 4]] : [[2, 2], [3, 2], [2, 3], [4, 4]];
    for (const [i, j] of pts) if ((hash(x0 + i, y0 + j, 11) < 0.85)) pc.p(x0 + i, y0 + j, ore.known ? oc : mul(c, 0.72));
    if (ore.known) { pc.p(x0 + 1, y0 + 1, hi); pc.p(x0 + 3, y0 + 3, hi); }
    else pc.p(x0 + 2, y0 + 2, mul(c, 1.25));
  }
}

// ------------------------------------------------------------------ the layers
/**
 * Paint a layer: { back, mid, front, veil, lock } canvases plus its animation hooks.
 * L: { z, W, H, plaque, seed, locked, finds, stops, explored pts, pct, you }
 */
function paintLayer(L) {
  const { z, W, H, seed } = L;
  const P = ZP[z];
  const rng = makeRng(seed * 31 + z * 977);
  const G = layerGeo(z, W, H, L.plaque, seed);
  const anim = { drips: [], pools: [], sparkles: [], glows: [], critters: [], plants: [], lava: null, falls: [], cages: [] };

  // ---- extras: pockets, pools
  const pockets = [];
  const nP = 2 + Math.floor(W / 160);
  for (let k = 0; k < nP; k++) {
    const x = rng.range(L.plaque.right + 10, W - 20), up = rng() < 0.5;
    const y = up ? rng.range(SEAM + 10, Math.max(SEAM + 11, G.ceil[clamp(x | 0, 0, W - 1)] - 10)) : rng.range(G.floor[clamp(x | 0, 0, W - 1)] + 8, H - 6);
    pockets.push({ x, y, rx: rng.range(7, 14), ry: rng.range(3, 6) });
  }
  const pools = [];
  if (z === 4) {
    // the lava river along most of the floor, with a rock bridge
    pools.push({ x0: W * 0.08, x1: W * 0.47, deep: 13, kind: 3 }, { x0: W * 0.53, x1: W * 0.95, deep: 13, kind: 3 });
  } else if (z !== 6) {
    const w = clamp(W * 0.22, 34, 90);
    const x0 = z === 5 ? W * 0.12 : rng.range(W * 0.3, W - w - 12);
    pools.push({ x0, x1: x0 + w, deep: z === 5 ? 12 : 10, kind: 2 });
  }
  const keep = L.stops.map((st) => [st.ax - 12, st.ax + 12]);
  const shx0 = ax(W, 38.5);
  keep.push([shx0 - 7, shx0 + 7]);
  for (const pl of pools) keep.push([pl.x0 - 4, pl.x1 + 4]);
  const C = layerCells(G, rng, { pockets, pools, keep });
  const { cols, rows, cell, at } = C;

  // ---- ore blocks: clusters of the layer's ores (known ones coloured), in the rock near the hollow
  const oreList = L.finds.ores.filter((o) => ORE_COL[o.id]).map((o) => ({ id: o.id, col: ORE_COL[o.id], known: !!o.e }));
  const oreAt = new Map();
  if (oreList.length) {
    const nOre = Math.round((W * H) / 900);
    for (let k = 0, tries = 0; k < nOre && tries < nOre * 8; tries++) {
      const i = rng.int(0, cols - 1), j = rng.int(2, rows - 1);
      if (at(i, j) !== 1) continue;
      // near some air (you can see where you'd dig)
      let near = false;
      for (let dj = -3; dj <= 3 && !near; dj++) for (let di = -3; di <= 3; di++) if (at(i + di, j + dj) === 0) { near = true; break; }
      if (!near && rng() < 0.7) continue;
      if (i * B < L.plaque.right + 4 && j * B < L.plaque.bottom + 4) continue; // not under the plaque
      const o = oreList[rng.int(0, oreList.length - 1)];
      oreAt.set(j * cols + i, o);
      if (rng() < 0.6) { const ii = i + (rng() < 0.5 ? 1 : 0), jj = j + (rng() < 0.5 ? 0 : 1); if (at(ii, jj) === 1) oreAt.set(jj * cols + ii, o); }
      k++;
    }
  }

  // ---- distance of each rock block from the nearest air (depth shading)
  const dist = new Uint8Array(cols * rows).fill(9);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (cell[j * cols + i] !== 1) dist[j * cols + i] = 0;
  for (let pass = 0; pass < 6; pass++) {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (!dist[k]) continue;
      let m = dist[k];
      if (i > 0) m = Math.min(m, dist[k - 1] + 1);
      if (i < cols - 1) m = Math.min(m, dist[k + 1] + 1);
      if (j > 0) m = Math.min(m, dist[k - cols] + 1);
      if (j < rows - 1) m = Math.min(m, dist[k + cols] + 1);
      dist[k] = m;
    }
  }

  // ---- MID: the rock slab
  const mid = art(W, H);
  const n3 = makeNoise2D(seed * 3 + z * 7);
  const cx = W / 2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, v = cell[k];
    if (v !== 1) continue;
    const x0 = i * B, y0 = j * B;
    // strata bands: the layer's four tones in wavy bands, a contrasting band now and then
    const bw = (y0 + n3(x0 * 0.02, z) * 14) / 13;
    const band = Math.floor(bw);
    let c = P.rock[((band % 4) + 4) % 4];
    const bh = hash(band, z, 41);
    if (bh < 0.22) c = P.band[0];
    else if (bh > 0.9 && z === 2) c = mix(P.band[1], c, 0.35); // the red clay seams
    c = mul(c, 0.94 + hash(i, j, z) * 0.12);
    // depth shading: the further from the cave, the darker
    const dd = dist[k];
    c = mix(c, P.deep, clamp((dd - 1) * 0.13, 0, 0.62));
    paintBlock(mid, x0, y0, c, oreAt.has(k), oreAt.get(k), z);
    // a hint of the light on faces right by the hollow
    if (dd === 1) for (let jj = 0; jj < B; jj++) for (let ii = 0; ii < B; ii++) mid.tint(x0 + ii, y0 + jj, P.light, 0.06);
  }
  // the seam of other rock along the top (the layer above's floor meets this one)
  if (P.seam) {
    const sb = 3;
    for (let y = 0; y < SEAM; y++) for (let x = 0; x < W; x++) {
      const wav = Math.round(n3(x * 0.06, 7.7) * 2.2);
      if (y > SEAM - 2 + wav) continue;
      const bx = Math.floor(x / sb), by = Math.floor((y + 9) / sb);
      let c = P.seam[(bx + by) % 2];
      if (hash(bx, by, 77) > 0.86) c = P.seam[2];
      if ((x % sb) === 0 || (y + 9) % sb === 0) c = mul(c, 1.12);
      if ((x % sb) === sb - 1 || (y + 9) % sb === sb - 1) c = mul(c, 0.78);
      mid.p(x, y, c);
    }
  }
  // liquids: water (translucent blue) and lava (painted once here; the shimmer is animated)
  const liquid = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const v = cell[j * cols + i];
    if (v !== 2 && v !== 3) continue;
    const surf = at(i, j - 1) === 0;
    for (let jj = 0; jj < B; jj++) for (let ii = 0; ii < B; ii++) {
      const x = i * B + ii, y = j * B + jj;
      if (v === 2) {
        const c = z === 5 ? (surf && jj === 0 ? 0xf0fcff : jj < 2 && surf ? 0xb8e8f8 : 0x5aa8d0) : surf && jj === 0 ? 0x9ad8f0 : mix(0x2a6aa0, 0x163a64, (jj + (surf ? 0 : B)) / (B * 2.5));
        mid.p(x, y, c);
      } else {
        const t = (jj + (surf ? 0 : B)) / (B * 2);
        mid.p(x, y, surf && jj === 0 ? 0xffe070 : mix(0xffa030, 0xd8401a, t));
      }
      if (surf && jj === 0) liquid.push(x, y, v);
    }
  }
  // the floor's top faces (lit), side faces toward the middle, ceilings with their drips
  const D = 3;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (cell[j * cols + i] !== 1) continue;
    const x0 = i * B, y0 = j * B;
    const left = x0 + B / 2 < cx;
    const skew = (cx - (x0 + B / 2)) / W * 1.7; // the far edge leans toward the middle
    if (at(i, j - 1) === 0) {
      for (let r = 0; r < D; r++) {
        const sh = Math.round((r + 1) * skew);
        const col = r === 0 ? P.top[0] : r === 1 ? P.top[1] : mix(P.top[1], 0xffffff, z === 5 ? 0.3 : 0.12);
        for (let ii = 0; ii < B; ii++) {
          const x = x0 + ii + sh, y = y0 - 1 - r;
          if (mid.a(x, y) && r > 0) continue;
          mid.p(x, y, hash(x, y, 5) < 0.12 ? mul(col, 0.88) : col);
        }
      }
      // the front edge catches the light
      for (let ii = 0; ii < B; ii++) mid.p(x0 + ii, y0, mix(mid.c(x0 + ii, y0), P.top[1], 0.55));
      // tufts: moss, clay sheen, crystal sand, ash, snow, glow
      if (hash(i, j, 61) < 0.35) {
        const tx = x0 + 1 + (hash(i, j, 62) * 4 | 0), ty = y0 - D;
        const tc = z === 1 ? 0x8ac04a : z === 2 ? 0xffd0a0 : z === 3 ? 0xd0e8ff : z === 4 ? 0x9a8a80 : z === 5 ? 0xffffff : 0xd8b8ff;
        mid.p(tx, ty - 1, tc); if (z === 1) { mid.p(tx + 1, ty - 2, 0x6aa03a); mid.p(tx - 1, ty - 1, 0x6aa03a); }
      }
    }
    // a side face where the rock turns toward the middle
    const side = left ? 1 : -1;
    if (at(i + side, j) === 0) {
      const sx = left ? x0 + B : x0 - 2;
      for (let jj = -1; jj < B; jj++) for (let s = 0; s < 2; s++) {
        const x = sx + s, y = y0 + jj;
        if (mid.a(x, y)) continue;
        mid.p(x, y, mul(mid.c(left ? x0 + B - 1 : x0, y0 + Math.max(0, jj)), jj < 0 ? 0.9 : 0.62 - s * 0.06));
      }
    }
    // ceiling: a shadowed underside, now and then a drip-stone
    if (at(i, j + 1) === 0) {
      for (let ii = 0; ii < B; ii++) mid.p(x0 + ii, y0 + B - 1, mul(mid.c(x0 + ii, y0 + B - 1), 0.66));
      const hh = hash(i, j, 71);
      if (hh < 0.45) {
        const sx = x0 + 1 + (hash(i, j, 72) * 4 | 0), len = 2 + (hash(i, j, 73) * (z === 5 ? 9 : 6) | 0);
        const sc = z === 5 ? 0xe0f6ff : z === 3 ? 0x8a92c8 : z === 6 ? 0x6a48a0 : mul(P.rock[0], 0.9);
        for (let k = 0; k < len; k++) { mid.p(sx, y0 + B + k, k === len - 1 && z === 5 ? 0xffffff : sc); if (k < len / 2) mid.p(sx + 1, y0 + B + k, mul(sc, 0.75)); }
        if (z === 1 || z === 2 || z === 5) anim.drips.push({ x: sx, y: y0 + B + len, ph: hash(i, j, 74), sp: 0.6 + hash(i, j, 75) * 0.8 });
        if (z === 4 && hh < 0.12) { mid.p(sx, y0 + B + len, 0xffb040); anim.glows.push({ x: sx, y: y0 + B + len, r: 4, c: 0xff8a3a, f: 0.5 }); }
      }
    }
  }
  // where things stand: the floor's top at each x (from the hollow's floor line, up over mounds,
  // not up a pillar), and the ceiling's underside
  const floorTop = new Int16Array(W).fill(H), ceilBot = new Int16Array(W).fill(0);
  for (let x = 0; x < W; x++) {
    const i = Math.min(cols - 1, Math.floor(x / B));
    let j = clamp(Math.floor(G.floor[x] / B), 1, rows - 1);
    while (j < rows - 1 && at(i, j) === 0) j++; // down through air (a pool's dip)
    while (j < rows - 1 && (at(i, j) === 2 || at(i, j) === 3)) j++;
    let k = 0;
    while (k < 3 && j > 1 && at(i, j - 1) !== 0) { j--; k++; } // up a mound
    if (k === 3) j += 3; // that was a pillar: stand at its foot
    floorTop[x] = j * B - D;
    let c = clamp(Math.floor((G.ceil[x] + G.floor[x]) / 2 / B), 1, rows - 1);
    if (at(i, c) !== 0) c = clamp(Math.floor(G.ceil[x] / B) + 1, 1, rows - 1);
    while (c > 0 && at(i, c - 1) === 0) c--;
    ceilBot[x] = c * B;
  }

  // ---- zone features painted into the slab
  zoneFeatures(L, mid, G, C, { floorTop, ceilBot, rng, anim, cx });
  // contact shadows: the air right under a ceiling and beside a wall is darker
  {
    const ao = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (mid.a(x, y)) continue;
      let k = 0;
      for (let d = 1; d <= 4; d++) if (mid.a(x, y - d) > 200) { k = Math.max(k, [0, 0.62, 0.44, 0.28, 0.14][d]); break; }
      for (let d = 1; d <= 3; d++) if (mid.a(x - d, y) > 200 || mid.a(x + d, y) > 200) { k = Math.max(k, [0, 0.5, 0.3, 0.14][d]); break; }
      ao[y * W + x] = Math.round(k * 255);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = ao[y * W + x];
      if (!a || (a < 60 && dith(x, y) > a / 60)) continue;
      mid.put(x, y, P.deep, Math.max(a, 60));
    }
  }
  // known ores glint now and then
  for (const [k, o] of oreAt) if (o.known && rng() < 0.5) anim.sparkles.push({ x: (k % cols) * B + 2, y: Math.floor(k / cols) * B + 2, c: o.col[1], ph: rng(), small: true });

  // ---- the town shaft runs down through every layer
  const shx = ax(W, 38.5);
  paintShaft(mid, shx, H, L.locked);

  // ---- lifts: a cage on the floor at its x, a cable up into the rock, a lantern
  for (const s of L.stops) {
    const x = clamp(s.ax, 8, W - 9);
    const fy = floorTop[clamp(x, 0, W - 1)];
    s.fy = fy; s.x = x;
    paintCage(mid, x, fy, s.open, s.id === L.here);
    anim.cages.push(s);
  }

  // ---- lighting: lanterns, lava, crystals and glow plants light the rock around them
  const lights = [];
  for (const s of L.stops) if (s.open) lights.push({ x: s.x + 5, y: s.fy - 9, r: 24, c: 0xffc070, k: 0.5 });
  for (const g of anim.glows) lights.push({ x: g.x, y: g.y, r: g.r * 4, c: g.c, k: g.f * 0.7 });
  if (z === 4) for (let x = 6; x < W; x += 18) lights.push({ x, y: G.floor[x] + 4, r: 34, c: 0xff6a20, k: 0.45 });
  applyLights(mid, lights, 1);

  // ---- BACK: the far wall through the hollow (moves slower)
  const M = L.margin;
  const back = paintBack(L, G, M, lights);
  // ---- FRONT: dark rock lips in front (moves faster)
  const front = paintFront(L, G, M, floorTop);

  // ---- liquids animate; critters, plants, the "?" eyes
  anim.liquid = liquid;
  placeLife(L, G, anim, floorTop, ceilBot, pools, rng);

  // ---- VEIL: the fog over what you haven't walked
  if (L.youX != null) L.you = { x: L.youX, fy: floorTop[clamp(L.youX, 0, W - 1)] };
  const veil = paintVeil(L, G);
  // ---- LOCK: chains across a layer you haven't unlocked a lift in
  const lock = L.locked ? paintChains(W, H, L.plaque) : null;
  if (L.locked) { dimArt(mid, P.fog, 0.32); dimArt(back, P.fog, 0.4); }
  return { back: back.commit(), mid: mid.commit(), front: front.commit(), veil: veil ? veil.commit() : null, lock: lock ? lock.commit() : null, anim, G, floorTop, ceilBot };
}

function dimArt(pc, c, t) {
  const d = pc.d, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
    d[i] += (r + l * 0.35 - d[i]) * t; d[i + 1] += (g + l * 0.35 - d[i + 1]) * t; d[i + 2] += (b + l * 0.4 - d[i + 2]) * t;
  }
}

/** Banded (posterized) light pools on everything painted. */
function applyLights(pc, lights, strength) {
  if (!lights.length) return;
  const { w, h } = pc;
  for (const L of lights) {
    const x0 = Math.max(0, Math.floor(L.x - L.r)), x1 = Math.min(w - 1, Math.ceil(L.x + L.r));
    const y0 = Math.max(0, Math.floor(L.y - L.r)), y1 = Math.min(h - 1, Math.ceil(L.y + L.r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - L.x, (y - L.y) * 1.15) / L.r;
      if (d >= 1) continue;
      let f = 1 - d;
      f = Math.floor(f * 4 + dith(x, y) * 0.9) / 4;
      if (f <= 0) continue;
      pc.tint(x, y, L.c, f * L.k * 0.55 * strength);
    }
  }
}

/** The far wall: smaller blocks, darker, with recesses, distant drip-stones and the layer's glow. */
function paintBack(L, G, M, lights) {
  const { z, W, H, seed } = L;
  const P = ZP[z];
  const h = H + M * 2;
  const pc = art(W, h);
  const n = makeNoise2D(seed * 5 + z * 13);
  // the hollow's lines, smoothed: where the far wall meets the receding ceiling and floor
  const smooth = (src, r) => { const out = new Float32Array(W); for (let x = 0; x < W; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { s += src[clamp(x + k, 0, W - 1)]; c++; } out[x] = s / c; } return out; };
  const cs = smooth(G.ceil, 18), fs = smooth(G.floor, 18);
  const cl = new Float32Array(W), fl = new Float32Array(W);
  for (let x = 0; x < W; x++) { const gap = fs[x] - cs[x]; cl[x] = M + cs[x] + gap * 0.2; fl[x] = M + fs[x] - gap * 0.16; }
  const vx = W / 2;
  const span = M + 14;
  const rowOf = (d) => Math.floor(Math.sqrt(d * 2.2)); // rows get taller toward you
  const wallTop = P.back[0], wallFog = mix(P.back[0], P.deep, 0.5);
  for (let x = 0; x < W; x++) {
    const c0 = Math.round(cl[x]), f0 = Math.round(fl[x]);
    for (let y = 0; y < h; y++) {
      let c;
      if (y >= f0) { // the floor, receding to the far wall
        const d = y - f0, u = clamp(d / span, 0, 1);
        const sc = 0.55 + 0.45 * u;
        const wx = vx + (x - vx) / sc;
        const ci = Math.floor(wx / B), r = rowOf(d);
        const edgeR = rowOf(d + 1) !== r, edgeC = Math.floor((vx + (x + 1 - vx) / sc) / B) !== ci;
        c = mix(P.top[2], P.top[0], (ci + r) & 1 ? 0.25 : 0);
        if (edgeR || edgeC) c = mul(c, 0.82);
        if (hash(ci, r, 5 + z) < 0.12) c = mul(c, 0.9);
        c = mix(c, P.deep, 0.62 - u * 0.36);
      } else if (y < c0) { // the ceiling, receding (its underside: dark)
        const d = c0 - 1 - y, u = clamp(d / span, 0, 1);
        const sc = 0.55 + 0.45 * u;
        const wx = vx + (x - vx) / sc;
        const ci = Math.floor(wx / B), r = rowOf(d);
        const edgeR = rowOf(d + 1) !== r, edgeC = Math.floor((vx + (x + 1 - vx) / sc) / B) !== ci;
        c = P.rock[(ci + r) & 3];
        if (edgeR || edgeC) c = mul(c, 0.78);
        c = mix(c, P.deep, 0.72 - u * 0.3);
      } else { // the far wall: small blocks, recesses, lit in the middle
        const b = 4;
        const bx = Math.floor(x / b), by = Math.floor((y + (bx & 1) * 2) / b);
        c = P.back[(hash(bx, by, z) * 3) | 0];
        const lx = x % b, ly = (y + (bx & 1) * 2) % b;
        if (lx === 0 || ly === 0) c = mul(c, 1.14); else if (lx === b - 1 || ly === b - 1) c = mul(c, 0.8);
        const r2 = n(x * 0.035, y * 0.06) + n(x * 0.1, y * 0.13) * 0.45;
        if (r2 > 0.16) c = mix(c, P.deep, clamp((r2 - 0.16) * 3, 0, 0.8));
        // shadowed where the ceiling and the floor meet it
        const v = Math.min(y - c0, f0 - y);
        if (v < 4) c = mix(c, P.deep, (4 - v) * 0.12);
        c = mix(c, wallFog, 0.25);
      }
      pc.p(x, y, c);
    }
  }
  void wallTop;
  const rng = makeRng(seed * 17 + z);
  // far drip-stones hanging from the receding ceiling and standing on the floor
  const sil = mix(P.back[2], P.deep, 0.25);
  for (let k = 0; k < W / 10; k++) {
    const x = rng.int(0, W - 1), up = rng() < 0.55, len = rng.int(3, 12), wd = rng.int(1, 3);
    const y0 = up ? Math.round(cl[x]) : Math.round(fl[x]);
    for (let j = 0; j < len; j++) {
      const ww = Math.max(0, Math.round(wd * (1 - j / len)));
      for (let i = -ww; i <= ww; i++) pc.p(x + i, up ? y0 + j : y0 - 1 - j, i === -ww ? mul(sil, 1.2) : i === ww ? mul(sil, 0.8) : sil);
    }
  }
  // the layer's sights in the distance
  const wallY = (x) => [Math.round(cl[x]) + 2, Math.round(fl[x]) - 2];
  if (z === 1) for (let k = 0; k < W / 12; k++) { // root threads through the ceiling
    let x = rng.int(0, W - 1);
    const [a] = wallY(clamp(x, 0, W - 1));
    for (let y = 0; y < a + rng.int(0, 14); y++) { x += rng() < 0.2 ? rng.int(-1, 1) : 0; pc.p(x, y, 0x3e2a1a); }
  }
  if (z === 2) for (let k = 0; k < Math.max(1, W / 220); k++) { // a far trickle of water down the clay
    const x = rng.int(W * 0.5, W - 12), [a, b] = wallY(x);
    for (let y = a - 6; y < b + 2; y++) for (let i = 0; i < 3; i++) pc.p(x + i, y, (y + i * 2) % 5 === 0 ? 0x8ab8d8 : i === 2 ? 0x2a4a6a : 0x3a6a8a);
    for (let i = -2; i < 5; i++) pc.p(x + i, b + 2, 0x9ac8e8);
  }
  if (z === 3) for (let k = 0; k < W / 9; k++) { // far crystals
    const x = rng.int(0, W - 1), [a, b] = wallY(x), up = rng() < 0.6;
    const c = rng.pick([0x6a8ad8, 0xa86ad0, 0x5ab0b0]), len = rng.int(3, 8);
    for (let j = 0; j < len; j++) { const y = up ? b - j : a + j; pc.p(x, y, j >= len - 1 ? mix(c, 0xffffff, 0.5) : c); if (j < len - 2) pc.p(x + 1, y, mul(c, 0.65)); }
  }
  if (z === 4) { // far lava falls and the glow from below
    for (let k = 0; k < Math.max(2, W / 100); k++) {
      const x = rng.int(10, W - 10), [a] = wallY(x);
      for (let y = a - 6; y < h; y++) { pc.p(x, y, y % 3 ? 0xd8501a : 0xffa040); pc.p(x + 1, y, 0xa83a14); }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const t = clamp((y - h * 0.45) / (h * 0.55), 0, 1); if (t > dith(x, y) * 0.7) pc.tint(x, y, 0xff4a10, t * 0.32); }
  }
  if (z === 5) { // ice columns and a cold light from above
    for (let k = 0; k < W / 24; k++) {
      const x = rng.int(0, W - 1), [a, b] = wallY(x);
      for (let y = a - 6; y < b + 4; y++) { pc.p(x, y, 0x7a9ac0); pc.p(x + 1, y, 0xa8c8e8); pc.p(x + 2, y, 0x5a7aa0); }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const t = clamp(1 - y / (h * 0.6), 0, 1); if (t > dith(x, y)) pc.tint(x, y, 0xd8f0ff, t * 0.18); }
  }
  if (z === 6) { // nebula and stars where the wall should be
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
      const q = n(x * 0.02 + 5, y * 0.03) + n(x * 0.07, y * 0.06) * 0.4;
      if (q > 0.08) pc.tint(x, y, q > 0.28 ? 0xb070f0 : 0x5a2a9a, clamp((q - 0.08) * 2.4, 0, 0.65) * (dith(x, y) < 0.7 ? 1 : 0.6));
      if (hash(x, y, 66) > 0.995) pc.p(x, y, 0xfff4d0);
    }
  }
  // the hollow's lights reach back here too, and a soft glow in its middle
  applyLights(pc, lights.map((l) => ({ ...l, y: l.y + M, r: l.r * 1.4 })), 0.9);
  for (let x = 0; x < W; x++) {
    const a = Math.round(cl[x]), b = Math.round(fl[x]);
    for (let y = a; y < b + span; y++) {
      const t = 1 - Math.abs(y - (a + b) / 2) / ((b - a) / 2 + span);
      if (t > 0 && t * 0.9 > dith(x, y)) pc.tint(x, y, P.light, 0.05 + t * 0.07);
    }
  }
  return pc;
}

/** The near rock: dark lips over the hollow's top and bottom edges, rimmed by the cave's light. */
function paintFront(L, G, M, floorTop) {
  const { z, W, H, seed } = L;
  const P = ZP[z];
  const h = H + M * 2;
  const pc = art(W, h);
  const rng = makeRng(seed * 23 + z * 5);
  const sil = mix(P.deep, 0x000000, 0.3), sil2 = mix(P.deep, P.rock[3], 0.22), rim = mix(P.rim, sil, 0.4), rim2 = mix(P.rim, sil, 0.75);
  const nn = makeNoise2D(seed * 41 + z);
  // the ridge along the bottom: a low bank of near rock, rising in lumps, stepped like blocks
  const prof = new Float32Array(W);
  for (let x = 0; x < W; x++) prof[x] = M + H - 4 - Math.max(0, nn(x * 0.025, 1) * 26 + nn(x * 0.09, 2) * 6);
  for (let k = 0; k < Math.max(2, W / 120); k++) {
    const x0 = rng.int(0, W - 1), w = rng.int(12, 34), hh = rng.int(7, 16);
    for (let x = Math.max(0, x0 - w); x < Math.min(W, x0 + w); x++) prof[x] = Math.min(prof[x], M + H - 4 - hh * Math.cos(((x - x0) / w) * Math.PI / 2));
  }
  const bank = (x) => Math.round(prof[Math.floor(x / 4) * 4] / 2) * 2;
  for (let x = 0; x < W; x++) {
    const top = bank(x), l = bank(x - 1), r = bank(x + 1);
    for (let y = top; y < h; y++) {
      let c = hash(x >> 2, y >> 2, 7) < 0.15 ? sil2 : sil;
      if (y === top) c = rim;
      else if (y === top + 1) c = rim2;
      else if ((y < l && x < W / 2) || (y < r && x > W / 2)) c = rim2; // a step's side catches a little light
      pc.p(x, y, c);
    }
  }
  // foreground things: dangling roots, crystal shards, icicles, a void shard
  for (let k = 0; k < Math.max(2, W / 60); k++) {
    const x = rng.int(4, W - 5);
    if (z === 1 || z === 2) { const y = bank(x); for (const [i, j] of [[0, 1], [0, 2], [1, 3], [-1, 3], [0, 4], [2, 5], [-2, 4]]) pc.p(x + i, y - j, j > 3 ? rim2 : sil); }
    if (z === 3 || z === 6) { const y = bank(x), n = rng.int(6, 13); for (let j = 0; j < n; j++) { const ww = j > n - 3 ? 0 : 1; for (let i = -ww; i <= ww; i++) pc.p(x + i, y - j, i < 0 ? rim : sil); } pc.p(x, y - n, mix(P.rim, 0xffffff, 0.3)); }
    if (z === 5) { const y = bank(x), n = rng.int(3, 8); for (let j = 0; j < n; j++) { pc.p(x, y - j, j === n - 1 ? 0xffffff : rim2); if (j < n - 2) pc.p(x + 1, y - j, sil); } }
    if (z === 4 && k % 2 === 0) { const y = bank(x); pc.p(x, y - 1, 0xff7a2a); pc.p(x + 1, y - 1, 0xc84a1a); }
  }
  void floorTop; void G;
  return pc;
}

/** Fog over the parts of the layer you haven't walked (explored cells blurred into a mask). */
function paintVeil(L, G) {
  const { W, H, z } = L;
  const P = ZP[z];
  const grid = new Float32Array(W * H);
  const pts = L.pts || [];
  const d0 = LIFT_ZONE_DEPTHS[z - 1], d1 = LIFT_ZONE_DEPTHS[z];
  for (let i = 0; i < pts.length; i += 2) {
    const x = ax(W, pts[i]), t = clamp((pts[i + 1] - d0) / (d1 - d0), 0, 1);
    const y = Math.round(SEAM + 4 + t * (H - SEAM - 10));
    grid[y * W + x] += 1;
  }
  // blur (box, separable, twice): x wide, y tall
  const tmp = new Float32Array(W * H);
  const blur = (src, dst, rx, ry) => {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = -rx; x <= rx; x++) s += src[y * W + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        dst[y * W + x] = s;
        s += src[y * W + clamp(x + rx + 1, 0, W - 1)] - src[y * W + clamp(x - rx, 0, W - 1)];
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -ry; y <= ry; y++) s += dst[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        src[y * W + x] = s;
        s += dst[clamp(y + ry + 1, 0, H - 1) * W + x] - dst[clamp(y - ry, 0, H - 1) * W + x];
      }
    }
  };
  const rx = Math.max(4, Math.round(W / 40)), ry = 12;
  blur(grid, tmp, rx, ry);
  blur(grid, tmp, rx, ry);
  // normalize: a handful of cells reveals a little, a well-walked patch all of it
  const norm = 1 / ((2 * rx + 1) * (2 * ry + 1) * 0.35);
  const pc = art(W, H);
  const base = L.locked ? 0.5 : 0.36;
  const lamps = L.stops.filter((s) => s.open && s.fy != null).map((s) => [s.x, s.fy - 8]);
  if (L.you) lamps.push([L.you.x, L.you.fy - 6]);
  let any = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = clamp(grid[y * W + x] * norm, 0, 1);
    for (const [lx, ly] of lamps) { const d = Math.hypot(x - lx, (y - ly) * 1.3); if (d < 34) r = Math.max(r, clamp((34 - d) / 14, 0, 1)); }
    // the plaque's corner and around your lifts are always clear enough to read
    const veil = base * (1 - r);
    if (veil <= 0.02) continue;
    if (veil < 0.25 && dith(x, y) > veil * 4) continue;
    const a = Math.round(veil * 255);
    pc.put(x, y, P.fog, a);
    any = true;
  }
  return any ? pc : null;
}

/** Two sagging chains crossing the layer and a padlock where they meet. */
function paintChains(W, H, plq) {
  const pc = art(W, H);
  // a chain: rings seen flat and links seen edge-on, alternating
  const chain = (xa, ya, xb, yb, sag) => {
    const n = Math.floor(Math.hypot(xb - xa, yb - ya) / 4);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = Math.round(xa + (xb - xa) * t), y = Math.round(ya + (yb - ya) * t + Math.sin(t * Math.PI) * sag);
      if (k % 2 === 0) {
        for (const [i, j] of [[-1, 1], [0, 2], [1, 2], [2, 2], [3, 1]]) pc.p(x + i, y + j, 0x1a1a20);
        for (const [i, j, c] of [[-1, 0, 0x8a8e98], [0, -1, 0xe0e4ee], [1, -1, 0xf4f6ff], [2, -1, 0xe0e4ee], [3, 0, 0x8a8e98], [0, 1, 0x6a6e78], [1, 1, 0x5a5e68], [2, 1, 0x6a6e78]]) pc.p(x + i, y + j, c);
      } else {
        for (let i = -1; i <= 1; i++) { pc.p(x + i, y + 1, 0x1a1a20); pc.p(x + i, y, i ? 0x9a9ea8 : 0xc8ccd8); }
      }
    }
  };
  const x0 = 2, x1 = W - 3;
  const ya = Math.round(Math.max(plq.bottom + 6, H * 0.36)), yb = Math.round(H * 0.6);
  chain(x0, ya - 4, x1, ya, 9);
  chain(x0, yb, x1, yb - 3, 12);
  // the padlock hangs where the lower chain sags most
  const lx = Math.round(W * 0.58) - 6, ly = yb + 12;
  const body = 0xc89a3a, dk = 0x6a4a1a, hi = 0xffe08a;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 2; i++) { pc.p(lx + 2 + i, ly - 6 + j, 0x9aa0aa); pc.p(lx + 9 + i, ly - 6 + j, 0x9aa0aa); }
  for (let i = 2; i < 11; i++) { pc.p(i + lx, ly - 7, 0xb8bcc8); pc.p(i + lx, ly - 8, i > 3 && i < 9 ? 0xb8bcc8 : 0); }
  for (let j = 0; j < 10; j++) for (let i = 0; i < 13; i++) {
    const edge = i === 0 || j === 0 || i === 12 || j === 9;
    pc.p(lx + i, ly + j, edge ? dk : j < 2 ? hi : i > 9 ? mul(body, 0.8) : body);
  }
  pc.p(lx + 6, ly + 4, 0x1a1008); pc.p(lx + 6, ly + 5, 0x1a1008); pc.p(lx + 6, ly + 6, 0x1a1008); pc.p(lx + 5, ly + 4, 0x1a1008); pc.p(lx + 7, ly + 4, 0x1a1008);
  return pc;
}

/** A dark shaft cut down through the slab: timber cribs, and the cable. */
function paintShaft(pc, x, H, dim) {
  for (let y = 0; y < H; y++) {
    const rockL = pc.a(x - 4, y), rockR = pc.a(x + 4, y);
    for (let i = -3; i <= 3; i++) {
      const inRock = pc.a(x + i, y) && (rockL || rockR);
      if (inRock) pc.p(x + i, y, i === -3 || i === 3 ? 0x2a1a10 : 0x120a08);
    }
    // the timber posts either side, a crossbar every 12 px
    pc.p(x - 4, y, y % 12 === 0 ? 0x9a6a3a : 0x6a4428); pc.p(x + 4, y, y % 12 === 0 ? 0x9a6a3a : 0x5a3a20);
    if (y % 12 === 0) for (let i = -3; i <= 3; i++) pc.p(x + i, y, 0x7a5232);
    if (y % 12 === 6) { pc.p(x - 3, y, 0x5a3a20); pc.p(x + 3, y - 1, 0x5a3a20); }
    pc.p(x, y, y % 3 === 0 ? (dim ? 0x8a7a5a : 0xf0d080) : dim ? 0x6a5a40 : 0xc8a050);
  }
}

/** A lift cage standing on the floor (lit or chained). */
function paintCage(pc, x, fy, open, here) {
  const B0 = open ? 0xd8a840 : 0x6a6470, D0 = open ? 0x7a5218 : 0x3a363e, F = open ? 0x2a1a10 : 0x1e1a22;
  // the cable up into the rock
  for (let y = fy - 12; y > Math.max(0, fy - 60); y--) { if (pc.a(x, y) > 0) { pc.p(x, y, open ? 0xc8a050 : 0x5a5460); } else pc.p(x, y, open ? 0xd8b058 : 0x4a4450); }
  // platform
  for (let i = -6; i <= 6; i++) { pc.p(x + i, fy, 0x7a5232); pc.p(x + i, fy + 1, 0x4a2e1a); }
  // cage: posts, bars, roof
  for (let j = 1; j <= 11; j++) for (let i = -4; i <= 4; i++) {
    const y = fy - j;
    const edge = Math.abs(i) === 4 || j === 11 || j === 1;
    if (edge) pc.p(x + i, y, Math.abs(i) === 4 && i > 0 ? D0 : B0);
    else if (i % 2 === 0) pc.p(x + i, y, D0);
    else pc.p(x + i, y, F);
  }
  for (let i = -5; i <= 5; i++) pc.p(x + i, fy - 12, i < 0 ? mix(B0, 0xffffff, 0.3) : B0);
  // the bell on its bracket and a lantern hook
  pc.p(x + 5, fy - 9, 0x5a3a20); pc.p(x + 6, fy - 9, 0x5a3a20);
  if (!open) { // chained gate
    for (let k = -3; k <= 3; k++) pc.p(x + k, fy - 6 + (k & 1), 0xa8acb8);
    pc.p(x - 1, fy - 4, 0xc89a3a); pc.p(x, fy - 4, 0xc89a3a); pc.p(x + 1, fy - 4, 0xc89a3a); pc.p(x, fy - 3, 0x6a4a1a);
  }
  void here;
}

// ------------------------------------------------------------------ zone features
function zoneFeatures(L, pc, G, C, o) {
  const { z, W, H } = L;
  const { floorTop, ceilBot, rng, anim } = o;
  const free = (x) => x > L.plaque.right + 2 || true;
  if (z === 1) {
    // roots hanging from the ceiling, tangled
    for (let k = 0; k < W / 9; k++) {
      let x = rng.int(2, W - 3);
      const top = ceilBot[x] - 1, len = rng.int(5, 20);
      for (let j = 0; j < len; j++) {
        x += rng() < 0.3 ? rng.int(-1, 1) : 0;
        if (pc.a(x, top + j) && j > 1) break;
        pc.p(x, top + j, j < len * 0.5 ? 0x9a7650 : 0x7a5a3a);
        if (j < 3) pc.p(x + 1, top + j, 0x6a4a30);
      }
      if (rng() < 0.4) anim.drips.push({ x, y: top + len, ph: rng(), sp: 0.5 + rng() });
    }
    // bones and a buried pot in the rock
    for (let k = 0; k < 2; k++) {
      const x = rng.int(L.plaque.right + 8, W - 12), y = rng.int(Math.min(H - 8, floorTop[x] + 8), H - 5);
      const C2 = 0xf2ead6;
      for (const [i, j] of [[0, 0], [0, 2], [1, 1], [2, 1], [3, 1], [4, 1], [5, 0], [5, 2]]) pc.p(x + i, y + j, C2);
    }
    // mushrooms by the floor
    for (let k = 0; k < W / 40; k++) {
      const x = rng.int(4, W - 5), y = floorTop[x];
      pc.p(x, y - 1, 0xe8e0d0); pc.p(x, y - 2, 0xd84a3a); pc.p(x - 1, y - 2, 0xd84a3a); pc.p(x + 1, y - 2, 0xb83a2a); pc.p(x, y - 3, 0xe85a4a);
    }
  }
  if (z === 2) {
    // ammonites and fish bones in the clay
    for (let k = 0; k < Math.max(2, W / 80); k++) {
      const x = rng.int(4, W - 8), up = rng() < 0.5;
      const y = up ? rng.int(SEAM + 4, Math.max(SEAM + 5, ceilBot[x] - 12)) : rng.int(Math.min(H - 8, floorTop[x] + 8), H - 6);
      if (x < L.plaque.right + 6 && y < L.plaque.bottom + 6) continue;
      const Cc = 0xeadcb4, Dd = 0xb8a47a;
      for (const [i, j, c] of [[1, 0, Cc], [2, 0, Cc], [3, 0, Cc], [0, 1, Cc], [4, 1, Cc], [0, 2, Cc], [2, 2, Dd], [3, 2, Cc], [4, 2, Cc], [0, 3, Cc], [4, 3, Dd], [1, 4, Cc], [2, 4, Cc], [3, 4, Dd]]) pc.p(x + i, y + j, c);
    }
    // lumite veins glowing in the walls
    for (let k = 0; k < Math.max(2, W / 70); k++) {
      let x = rng.int(4, W - 4), y = rng.int(SEAM + 3, H - 4);
      if (x < L.plaque.right + 6 && y < L.plaque.bottom + 6) continue;
      if (!pc.a(x, y)) continue;
      for (let j = 0; j < 7; j++) { x += rng.int(-1, 1); y += 1; if (!pc.a(x, y)) break; pc.p(x, y, j % 3 ? 0x7ae08a : 0xd0ffd0); }
      anim.glows.push({ x, y: y - 3, r: 4, c: 0x9dff9a, f: 0.6, pulse: rng() });
    }
    // dripping mud from the ceiling: long stalactites
    for (let k = 0; k < W / 30; k++) {
      const x = rng.int(3, W - 3), top = ceilBot[x];
      for (let j = 0; j < rng.int(3, 9); j++) { pc.p(x, top + j, 0x8a4a28); }
    }
  }
  if (z === 3) {
    // crystal clusters on the floor and the ceiling, faceted
    const cols = [[0xd06ad8, 0xffd0ff, 0x8a3a9a], [0x5ac8f0, 0xe0f8ff, 0x2a7aa8], [0x7ae0c0, 0xe8fff4, 0x3a9a7a]];
    for (let k = 0; k < Math.max(4, W / 34); k++) {
      const x = rng.int(6, W - 7), up = rng() < 0.62;
      const [c, hi, dk] = cols[k % 3];
      const n = rng.int(2, 4);
      for (let m = 0; m < n; m++) {
        const xx = x + m * 3 - n, hgt = rng.int(5, 15) * (m === 1 ? 1.3 : 1) | 0;
        const base = up ? floorTop[clamp(xx, 0, W - 1)] : ceilBot[clamp(xx, 0, W - 1)];
        const lean = rng.int(-1, 1);
        for (let j = 0; j < hgt; j++) {
          const yy = up ? base - j : base + j;
          const wd = j > hgt - 3 ? 0 : 1;
          const ox = Math.round(lean * j / hgt * 2);
          pc.p(xx + ox, yy, j > hgt - 2 ? hi : c);
          if (wd) { pc.p(xx + ox + 1, yy, dk); pc.p(xx + ox - 1, yy, mix(c, hi, 0.4)); }
        }
        anim.sparkles.push({ x: xx, y: up ? base - hgt + 1 : base + hgt - 1, c: hi, ph: rng() });
      }
      anim.glows.push({ x, y: up ? floorTop[x] - 6 : ceilBot[x] + 6, r: 6, c, f: 0.8, pulse: rng() });
    }
    // a geode in the rock
    const gx = rng.int(L.plaque.right + 6, W - 14), gy = rng.int(Math.min(H - 12, floorTop[clamp(gx + 5, 0, W - 1)] + 6), H - 10);
    for (let j = 0; j < 9; j++) for (let i = 0; i < 11; i++) {
      const e = ((i - 5) / 5.5) ** 2 + ((j - 4) / 4.5) ** 2;
      if (e < 1) pc.p(gx + i, gy + j, e > 0.62 ? 0x8a8296 : e > 0.38 ? (hash(i, j, 3) < 0.5 ? 0xc8a0ff : 0x9a6ae0) : 0x1a1426);
    }
    anim.sparkles.push({ x: gx + 4, y: gy + 3, c: 0xffffff, ph: 0.3 });
  }
  if (z === 4) {
    // basalt columns: vertical dark lines in the rock; glowing cracks near the lava
    for (let x = 2; x < W; x += 5 + (hash(x, 1, 44) * 4 | 0)) for (let y = SEAM; y < H; y++) {
      if (!pc.a(x, y)) continue;
      if (y > ceilBot[x] - 1 && y < floorTop[x] + 2) continue;
      if (hash(x, y >> 3, 45) < 0.7) pc.tint(x, y, 0x000000, 0.28);
    }
    // the lava fall from a crack in the ceiling
    const fx = clamp(Math.round(W * 0.66), 10, W - 10);
    anim.falls.push({ x: fx, y0: ceilBot[fx], y1: floorTop[fx] + 6 });
    for (let j = -2; j <= 2; j++) pc.p(fx + j, ceilBot[fx] - 1, 0xffa040);
    anim.glows.push({ x: fx, y: ceilBot[fx] + 4, r: 8, c: 0xff7a2a, f: 0.8 });
    // magmaite chunks glowing
    for (let k = 0; k < W / 40; k++) {
      const x = rng.int(4, W - 4), y = rng.int(SEAM + 4, H - 4);
      if (!pc.a(x, y) || (x < L.plaque.right + 6 && y < L.plaque.bottom + 6)) continue;
      pc.p(x, y, 0xff6a1a); pc.p(x + 1, y, 0xffd070); pc.p(x, y + 1, 0xc84a1a);
      anim.glows.push({ x, y, r: 3, c: 0xff6a1a, f: 0.5, pulse: rng() });
    }
  }
  if (z === 5) {
    // icicles hang long from the ceiling; snow drifts on the floor
    for (let k = 0; k < W / 6; k++) {
      const x = rng.int(2, W - 3), top = ceilBot[x], len = rng.int(3, 14);
      for (let j = 0; j < len; j++) { pc.p(x, top + j, j > len - 3 ? 0xffffff : 0xc8ecfa); if (j < len * 0.4) pc.p(x + 1, top + j, 0x9ad0ea); }
      if (rng() < 0.3) anim.drips.push({ x, y: top + len, ph: rng(), sp: 0.4 + rng() * 0.5, ice: true });
    }
    for (let x = 0; x < W; x++) {
      const y = floorTop[x];
      const hh = Math.max(0, Math.round(2 + Math.sin(x * 0.11) * 1.6 + hash(x, 0, 51)));
      for (let j = 0; j < hh; j++) if (!pc.a(x, y - j - 1) || j === 0) pc.p(x, y - j, j === hh - 1 ? 0xffffff : 0xe8f4ff);
    }
    // ice crystals and a frozen fish in the rock
    for (let k = 0; k < W / 30; k++) anim.sparkles.push({ x: rng.int(2, W - 3), y: rng.int(SEAM + 2, H - 3), c: 0xffffff, ph: rng() });
  }
  if (z === 6) {
    // star ore stars in the rock, floating chunks in the hollow, void rifts
    for (let k = 0; k < W / 22; k++) {
      const x = rng.int(4, W - 6), y = rng.int(SEAM + 3, H - 6);
      if (!pc.a(x, y) || (x < L.plaque.right + 6 && y < L.plaque.bottom + 6)) continue;
      const c = k % 2 ? 0xffd040 : 0xb070ff, hi = k % 2 ? 0xfff4b0 : 0xf0d0ff;
      for (const [i, j, cc] of [[2, 0, hi], [1, 1, c], [2, 1, hi], [3, 1, c], [0, 2, c], [1, 2, hi], [2, 2, 0xffffff], [3, 2, hi], [4, 2, c], [1, 3, c], [2, 3, hi], [3, 3, c], [2, 4, c]]) pc.p(x + i, y + j, cc);
      anim.sparkles.push({ x: x + 2, y: y + 2, c: 0xffffff, ph: rng() });
    }
    for (let k = 0; k < Math.max(2, W / 90); k++) {
      const x = rng.int(L.plaque.right + 10, W - 16);
      const cy = Math.round((ceilBot[x] + floorTop[x]) / 2) - 4;
      if (floorTop[x] - ceilBot[x] < 30) continue;
      anim.floaters = anim.floaters || [];
      anim.floaters.push({ x, y: cy + rng.int(-6, 6), w: rng.int(2, 3), ph: rng() });
    }
  }
  void free; void G; void C;
}

// ------------------------------------------------------------------ life: creatures, plants, "?"
const MOVE = {
  earthworm: 'worm', dust_bunny: 'hop', mole_cricket: 'walk', cave_bat: 'fly', rock_crab: 'walk', ore_slug: 'slug', glow_beetle: 'fly',
  spark_mite: 'swarm', crystal_spider: 'hang', blind_fish: 'swim', lava_newt: 'lava', ember_moth: 'fly', frost_shrimp: 'swim', gem_tortoise: 'walk',
  void_wisp: 'float', pebble_mimic: 'still', spore_puffer: 'hop', shade_bat: 'fly', rubble_golem: 'walk', gloom_wisp: 'float', crystal_wyrm: 'walk',
  ember_imp: 'walk', crystal_golem: 'walk', kobold: 'walk', cave_troll: 'walk', cave_spider: 'hang', cave_slime: 'hop', ruin_wraith: 'float',
  cave_drake: 'walk', raptor: 'walk', tyrant: 'walk', shellback: 'walk', pterosaur: 'fly',
};
// tiny sprites (facing right); 1 body, 2 light, 3 dark, e eye, k bright eye, g glow, w white, r red, y yellow, b bone
const SPR = {
  bat: [[
    '3.......3',
    '33.1.1.33',
    '.3311133.',
    '...1k1...',
    '....1....'], [
    '...1.1...',
    '..31113..',
    '.3311133.',
    '33.1k1.33',
    '3.......3']],
  crab: [[
    '2.......2',
    '13.....31',
    '.1.e.e.1.',
    '.3222223.',
    '3.3.3.3.3'], [
    '.2.....2.',
    '.13...31.',
    '.1.e.e.1.',
    '.3222223.',
    '.3.3.3.3.']],
  cricket: [[
    '.....33.',
    '..1111e.',
    '.122221.',
    '3.3..3.3'], [
    '....3..3',
    '..1111e.',
    '.122221.',
    '.3.3.3..']],
  bunny: [[
    '..2.2.',
    '..1.1.',
    '.2222e',
    '211111',
    '.1111.'], [
    '...2.2',
    '..1.1.',
    '.2222e',
    '211111',
    '1....1']],
  spider: [[
    '3.....3',
    '.3.1.3.',
    '3.111.3',
    '.3k1k3.',
    '3.....3']],
  spiderBig: [[
    '3.......3',
    '.3..1..3.',
    '3.31113.3',
    '.3111113.',
    '3.1k1k1.3',
    '.3.....3.']],
  tortoise: [[
    '..22222...',
    '.2211122..',
    '2211111221',
    '.33333331e',
    '.1.1..1.1.']],
  golem: [[
    '..2222..',
    '.21e1e1.',
    '.211111.',
    '22333322',
    '21.11.12',
    '2..11..2',
    '..1..1..',
    '.22..22.']],
  troll: [[
    '...222...',
    '..21e12..',
    '..2111w..',
    '.2211122.',
    '21.111.12',
    '1..111..1',
    '...1.1...',
    '..33.33..']],
  humanoid: [[
    '.y..',
    '222.',
    '1e1.',
    '111.',
    '3113',
    '.11.',
    '1..1']],
  imp: [[
    '3..3',
    '2222',
    '1k1k',
    '1111',
    '.11.',
    '1..1']],
  wraith: [[
    '.222.',
    '22222',
    '2k2k2',
    '22222',
    '12121',
    '1.1.1',
    '.1..1']],
  raptor: [[
    '........222',
    '.......2e22',
    '.......11..',
    '3.....111..',
    '.31111111..',
    '..33111.1..',
    '....1..1...',
    '....3..33..'], [
    '........222',
    '.......2e22',
    '.......11..',
    '......111..',
    '331111111..',
    '..33111.1..',
    '....1.1....',
    '...33.3....']],
  tyrant: [[
    '.........2222.',
    '........22e222',
    '........2wwww.',
    '.......1112...',
    '3.....11111...',
    '.3311111111...',
    '...3311111.1..',
    '.....11..1....',
    '.....1...1....',
    '....33..33....']],
  shellback: [[
    '...2.2.2.2..',
    '..22222222..',
    '.2233333322.',
    '3.11111111e1',
    '..1.1..1.1..']],
  drake: [[
    '....2.......',
    '...22.....22',
    '..2221...2e2',
    '.3211111111.',
    '3..11111.1..',
    '...1.1..1...',
    '..33.3..33..']],
  ptero: [[
    '2...........2',
    '22.........22',
    '.222.111.222.',
    '...221e122...',
    '.......2.....'], [
    '.............',
    '.....111.....',
    '..222.1e2222.',
    '.22.......22.',
    '2...........2']],
  newt: [[
    '......2.',
    '31111e1.',
    '.1..1...']],
  moth: [[
    '2...2',
    '22122',
    '.2k2.',
    '2.1.2'], [
    '.....',
    '22122',
    '22k22',
    '..1..']],
  shrimp: [[
    '.1...',
    '..122e',
    '3.1111',
    '.3.3.3']],
  mimic: [[
    '..2222.',
    '.21e1e2',
    '3111111']],
  puffer: [[
    '.2.2.',
    '21112',
    '1e1e1',
    '21112',
    '.2.2.']],
  beetle: [[
    '.33.',
    '1e11',
    'gggg',
    '.gg.']],
};
const SPRITE_OF = {
  cave_bat: 'bat', shade_bat: 'bat', rock_crab: 'crab', mole_cricket: 'cricket', dust_bunny: 'bunny', crystal_spider: 'spider', cave_spider: 'spiderBig',
  gem_tortoise: 'tortoise', rubble_golem: 'golem', crystal_golem: 'golem', cave_troll: 'troll', kobold: 'humanoid', ember_imp: 'imp', ruin_wraith: 'wraith',
  raptor: 'raptor', tyrant: 'tyrant', shellback: 'shellback', cave_drake: 'drake', pterosaur: 'ptero', lava_newt: 'newt', ember_moth: 'moth',
  frost_shrimp: 'shrimp', pebble_mimic: 'mimic', spore_puffer: 'puffer', glow_beetle: 'beetle',
};

/** Pre-render a creature's frames (facing right and left) into little canvases. */
function critterFrames(id) {
  const c0 = CREATURES[id]?.color ?? 0xa0a0a0;
  const pal = {
    1: c0, 2: mix(c0, 0xffffff, 0.35), 3: mul(c0, 0.55), e: 0xfff8e0, k: id.includes('bat') ? 0xffe070 : 0xfff8e0, g: mix(c0, 0xffffff, 0.5),
    w: 0xf8f0e0, r: 0xe04a3a, y: 0xffe070, b: 0xf2ead6,
  };
  const key = SPRITE_OF[id];
  const frames = [];
  const make = (rows, flip) => {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const pc = art(w + 2, h + 2);
    // a dark outline first, then the sprite
    for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
      if (rows[j][i] === '.') continue;
      const x = flip ? w - 1 - i : i;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pc.p(x + 1 + dx, j + 1 + dy, 0x0c0608);
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      const x = flip ? w - 1 - i : i;
      pc.p(x + 1, j + 1, pal[ch] ?? c0);
    }
    return pc.commit();
  };
  if (key) for (const rows of SPR[key]) frames.push([make(rows, false), make(rows, true)]);
  return frames;
}

/** Where the life of a layer goes, and how it moves. */
function placeLife(L, G, anim, floorTop, ceilBot, pools, rng) {
  const { W, z } = L;
  const known = L.finds.crit.filter((c) => c.e);
  const unknown = L.finds.crit.filter((c) => !c.e);
  const x0 = 8, x1 = W - 10;
  const slots = [];
  const n = known.length;
  for (let k = 0; k < n; k++) slots.push(x0 + ((k + 0.5) / n) * (x1 - x0) + rng.range(-8, 8));
  rng.pick(slots); // (shuffle a little)
  const waterPool = pools.find((p) => p.kind === 2), lavaPool = pools.find((p) => p.kind === 3);
  known.forEach((c, k) => {
    const mv = MOVE[c.id] || 'walk';
    const x = clamp(Math.round(slots[k]), 6, W - 8);
    const o = { id: c.id, mv, x, frames: critterFrames(c.id), ph: rng(), sp: 0.5 + rng() * 0.8, range: rng.range(10, 26) };
    if ((mv === 'swim') && waterPool) { o.x = (waterPool.x0 + waterPool.x1) / 2; o.range = (waterPool.x1 - waterPool.x0) / 2 - 5; o.y = floorTop[clamp(o.x | 0, 0, W - 1)] + 7; }
    if (mv === 'lava' && lavaPool) { o.x = (lavaPool.x0 + lavaPool.x1) / 2; o.range = (lavaPool.x1 - lavaPool.x0) / 2 - 6; }
    anim.critters.push(o);
  });
  // unknown ones: eyes in the dark with a "?" (up to three)
  for (let k = 0; k < Math.min(3, unknown.length); k++) {
    const x = clamp(Math.round(x0 + rng() * (x1 - x0)), 10, W - 12);
    anim.critters.push({ id: null, mv: 'unknown', x, ph: rng(), sp: 1, range: 0 });
  }
  // plants: known ones on the floor (rubber sap hangs), unknown as "?" sprouts
  const kp = L.finds.plants.filter((p) => p.e), up = L.finds.plants.filter((p) => !p.e);
  const all = kp.map((p) => ({ id: p.id, known: true })).concat(up.slice(0, 2).map((p) => ({ id: p.id, known: false })));
  all.forEach((p, k) => {
    const x = clamp(Math.round(14 + ((k + 0.5) / all.length) * (W - 28) + rng.range(-10, 10)), 6, W - 8);
    anim.plants.push({ ...p, x, ph: rng() });
  });
  void ceilBot; void z;
}

// ------------------------------------------------------------------ the top: the meadow, home, Deep Town
function paintTop(T) {
  const { W, seed, town, M } = T;
  const H = TOP_H;
  const anim = { smoke: [], windows: [], fires: [], clouds: [], lights: [], sparkles: [] };
  // BACK: sky, sun, far hills, the forest
  const back = art(W, H + M * 2);
  const SKY = [0x2a4a9a, 0x3a5cb0, 0x4a74c8, 0x5e8cdc, 0x78a4e6, 0x96bcec, 0xb8d0ee, 0xe0d8d8, 0xf8d0a8, 0xffc890];
  const gy = M + GROUND;
  for (let y = 0; y < H + M * 2; y++) for (let x = 0; x < W; x++) {
    const t = clamp(y / gy, 0, 1) * (SKY.length - 1);
    const k = Math.min(SKY.length - 1, Math.floor(t + dith(x, y) * 0.95));
    back.p(x, y, SKY[k]);
  }
  // the sun low on the right
  const sx = Math.round(W * 0.8), sy = M + 20;
  for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
    const d = Math.hypot(x, y);
    if (d < 4) back.p(sx + x, sy + y, 0xfffbe8);
    else if (d < 6 && (x + y) % 2 === 0) back.p(sx + x, sy + y, 0xffe8b0);
    else if (d < 9 && (x + y * 3) % 4 === 0) back.p(sx + x, sy + y, 0xffdca0);
  }
  // far mountains, two hazy rows
  for (let x = 0; x < W; x++) {
    const h1 = Math.round(16 + Math.sin(x * 0.04 + seed) * 6 + Math.sin(x * 0.13 + 2) * 2);
    for (let k = 0; k < h1; k++) back.p(x, gy - 4 - k, k === h1 - 1 ? 0xb8ccd8 : k > h1 - 4 && (x + k) % 5 === 0 ? 0xd0dde6 : 0x9ab0c0);
    const h2 = Math.round(9 + Math.sin(x * 0.07 + 1) * 4 + Math.sin(x * 0.21) * 1.5);
    for (let k = 0; k < h2; k++) back.p(x, gy - 2 - k, k === h2 - 1 ? 0x8aa0a8 : 0x6e8a90);
  }
  // pines: a hazy back row and a darker front row
  const pine = (pc, x, base, h, Pp) => {
    for (let y = base - 3; y < base; y++) pc.p(x, y, Pp[3]);
    for (let r = 0; r < h; r++) {
      const y = base - h - 2 + r, half = Math.floor(r * 0.34 + (r % 4) * 0.35);
      for (let i = -half; i <= half; i++) pc.p(x + i, y, (r % 4 === 3 && Math.abs(i) === half) ? Pp[0] : i < -half * 0.3 ? Pp[0] : i > half * 0.45 ? Pp[2] : Pp[1]);
    }
  };
  for (let x = 2; x < W; x += 6) pine(back, x + (hash(x, 1, 21) * 3 | 0), gy, 9 + (hash(x, 2, 21) * 7 | 0), [0x4a7a72, 0x5a8a80, 0x76a090, 0x3a5a4a]);
  // clouds drift in the animation
  for (let k = 0; k < Math.max(2, W / 120); k++) anim.clouds.push({ x: hash(k, 3, seed) * W, y: 4 + hash(k, 4, seed) * 16, w: 5 + hash(k, 5, seed) * 7, sp: 1.5 + hash(k, 6, seed) * 2 });

  // MID: the ground and the two caves
  const mid = art(W, H);
  const n = makeNoise2D(seed * 11 + 3);
  // the earth from the grass line down, blocky
  const P = ZP[1];
  for (let y = GROUND; y < H; y++) for (let x = 0; x < W; x++) {
    const bx = Math.floor(x / B), by = Math.floor(y / B);
    const t = (y - GROUND) / (H - GROUND);
    let c = mix(0x5a3c24, P.rock[(bx + by + (hash(bx, by, 81) * 2 | 0)) % 4], clamp(t * 2, 0, 1));
    c = mul(c, 0.94 + hash(bx, by, 82) * 0.12);
    const lx = x % B, ly = y % B;
    if (lx === 0 || ly === 0) c = mul(c, 1.1); else if (lx === B - 1 || ly === B - 1) c = mul(c, 0.82);
    mid.p(x, y, c);
  }
  // grass, flowers, the topsoil
  for (let x = 0; x < W; x++) {
    mid.p(x, GROUND, 0x4a9030); mid.p(x, GROUND + 1, 0x3a7a28); mid.p(x, GROUND - 1, 0x5aa83c);
    if (hash(x, 1, 5) < 0.5) mid.p(x, GROUND - 2, 0x6ab84a);
    if (hash(x, 2, 5) < 0.14) mid.p(x, GROUND - 3, 0x7ac458);
    if (hash(x, 3, 5) < 0.06) mid.p(x, GROUND - 3, [0xfff6e8, 0xffe066, 0xff8ad0, 0xe84a3a][(x * 7) % 4]);
    for (let y = GROUND + 2; y < GROUND + 4; y++) mid.p(x, y, hash(x, y, 6) < 0.5 ? 0x4a3220 : 0x3e2a1a);
  }
  // front row of pines on the meadow
  for (let x = 3; x < W; x += 11) { const xx = x + (hash(x, 3, 22) * 4 | 0); if (hash(x, 4, 22) < 0.55) pine(mid, xx, GROUND - 1, 14 + (hash(x, 5, 22) * 8 | 0), [0x1e4a2c, 0x2e6236, 0x4e8a3e, 0x3e2a1c]); }
  // roots
  for (let k = 0; k < W / 14; k++) {
    let x = hash(k, 7, seed) * W;
    const len = 6 + hash(k, 8, seed) * 22;
    for (let j = 0; j < len; j++) { x += (hash(k, j, 9) - 0.5) * 1.2; mid.p(x, GROUND + 4 + j, j < len / 2 ? 0x9a7650 : 0x7a5a3a); }
  }
  // the two caves (voxel hollows)
  const homeR = { x0: Math.round(W * 0.04), x1: Math.round(W * 0.56), y0: 62, y1: 124 };
  const townR = { x0: Math.round(W * 0.6), x1: Math.round(W * 0.97), y0: 60, y1: 126 };
  const carve = (R, k) => {
    const cxr = (R.x0 + R.x1) / 2, cyr = (R.y0 + R.y1) / 2, rx = (R.x1 - R.x0) / 2, ry = (R.y1 - R.y0) / 2;
    for (let j = Math.floor(R.y0 / B) - 1; j <= Math.ceil(R.y1 / B); j++) for (let i = Math.floor(R.x0 / B) - 1; i <= Math.ceil(R.x1 / B); i++) {
      const x = i * B + 3, y = j * B + 3;
      const e = ((x - cxr) / rx) ** 2 + ((y - cyr) / ry) ** 6 + n(x * 0.08, y * 0.08 + k) * 0.3;
      if (e < 1 && y < R.y1 - 2) for (let jj = 0; jj < B; jj++) for (let ii = 0; ii < B; ii++) mid.clear(i * B + ii, j * B + jj);
    }
  };
  carve(homeR, 1);
  carve(townR, 2);
  // top faces of the cave floors, shadowed ceilings
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    if (!mid.a(x, y)) continue;
    if (!mid.a(x, y - 1) && y > GROUND + 4) { mid.p(x, y - 1, 0x8a6a48); mid.p(x, y - 2, 0x9a7a52); if (!mid.a(x, y - 3)) mid.p(x, y - 3, 0xa8885e); }
    if (!mid.a(x, y + 1) && y > GROUND + 4) mid.p(x, y, mul(mid.c(x, y), 0.6));
  }
  const floorAt = (x) => { let y = 92; while (y < H && !mid.a(x, y)) y++; return y; };
  // the back of the caves: warm firelit (home), lantern-lit (town)
  const caveBack = art(W, H);
  for (const [R, warm, lit] of [[homeR, 0x7a4018, true], [townR, 0x8a5a20, !!town]]) {
    for (let y = R.y0 - 6; y < R.y1 + 4; y++) for (let x = R.x0 - 4; x < R.x1 + 4; x++) {
      if (mid.a(x, y)) continue;
      const bx = Math.floor(x / 4), by = Math.floor(y / 4);
      let c = [0x2e1d10, 0x261810, 0x34221a][(hash(bx, by, 83) * 3) | 0];
      if (x % 4 === 0 || y % 4 === 0) c = mul(c, 1.15);
      const cxw = (R.x0 + R.x1) / 2;
      const glow = clamp(1 - Math.hypot((x - cxw) / ((R.x1 - R.x0) * 0.6), (y - R.y1) / ((R.y1 - R.y0) * 1.1)), 0, 1);
      if (lit) c = mix(c, warm, Math.floor(glow * 4 + dith(x, y)) / 4 * 0.6);
      caveBack.p(x, y, lit ? c : mul(c, 0.55));
    }
  }
  // HOME: Old Star's workshop: the stone forge and chimney, anvil, workbench, hearth, bed, shelves
  const hx0 = homeR.x0, hw = homeR.x1 - homeR.x0;
  const at = (f) => Math.round(hx0 + hw * f);
  const fx = at(0.2), fy = floorAt(fx);
  // forge
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) mid.p(fx - 4 + i, fy - 1 - j, (i + j) % 3 ? 0x6a625e : 0x5a524e);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) mid.p(fx - 2 + i, fy - 4 - j, j === 0 ? 0xffd070 : j === 1 ? 0xff8a20 : 0xc84a14);
  for (let y = homeR.y0 - 6; y < fy - 10; y++) { mid.p(fx - 1, y, 0x5a524e); mid.p(fx, y, 0x4a4240); mid.p(fx + 1, y, 0x5a524e); }
  anim.fires.push({ x: fx, y: fy - 5, w: 5, kind: 'forge' });
  anim.smoke.push({ x: fx, y: homeR.y0 - 2 });
  // anvil on a stump
  const avx = at(0.36), avy = floorAt(avx);
  mid.stamp(avx - 3, avy - 6, ['.2222221', '..1111..', '...33...', '..4444..', '.444444.', '.444444.'], { 1: 0x6a6e76, 2: 0x9a9ea6, 3: 0x4a4e56, 4: 0x6a4a2a });
  // hearth with a kettle
  const hhx = at(0.52), hhy = floorAt(hhx);
  mid.stamp(hhx - 4, hhy - 3, ['.3.3.3.3.', '333333333', '.2.2.2.2.'], { 2: 0x6a6460, 3: 0x8a827a });
  anim.fires.push({ x: hhx, y: hhy - 4, w: 3, kind: 'hearth' });
  mid.stamp(hhx - 2, hhy - 10, ['.11.', '1111', '1111', '.11.'], { 1: 0x3a3434 });
  // bed with a patched quilt
  const bx = at(0.72), by = floorAt(bx);
  mid.stamp(bx - 6, by - 5, ['4...........', '42222rr22224', '422rr22rr224', '444444444444', '4..........4'], { 2: 0xd8c8a0, r: 0xb84a3a, 4: 0x7a5232 });
  // shelves with jars
  for (let i = 0; i < 12; i++) { mid.p(at(0.66) + i, by - 16, 0x7a5232); mid.p(at(0.66) + i, by - 24, 0x7a5232); }
  for (let k = 0; k < 4; k++) { mid.p(at(0.66) + 1 + k * 3, by - 17, [0x5ac8f0, 0xffb030, 0x7ae08a, 0xd06ad8][k]); mid.p(at(0.66) + 1 + k * 3, by - 18, 0xe8e0d0); mid.p(at(0.66) + 2 + k * 3, by - 25, 0xc8a070); }
  // a hanging lantern
  const lnx = at(0.44);
  for (let y = homeR.y0 + 2; y < homeR.y0 + 10; y++) mid.p(lnx, y, 0x3a2a20);
  mid.p(lnx, homeR.y0 + 10, 0xffe8a0); mid.p(lnx, homeR.y0 + 11, 0xffc040);
  anim.lights.push({ x: lnx, y: homeR.y0 + 11, r: 5, c: 0xffc860 });
  // the lift down to the mine: a shaft from the cave floor, a cage on it
  const lx = clamp(ax(W, 5), homeR.x0 + 8, homeR.x1 - 8);
  const lfy = floorAt(lx);
  for (let y = lfy; y < H; y++) for (let i = -3; i <= 3; i++) mid.p(lx + i, y, i === -3 || i === 3 ? 0x2a1a10 : 0x120a08);
  for (let y = lfy; y < H; y++) { mid.p(lx - 4, y, 0x6a4428); mid.p(lx + 4, y, 0x5a3a20); mid.p(lx, y, y % 3 ? 0xc8a050 : 0xf0d080); }
  paintCage(mid, lx, lfy, true, false);
  T.homeStop = { x: lx, fy: lfy };
  // DEEP TOWN: houses with lit windows, string lights, the shaft's head-frame
  const tx0 = townR.x0, tw = townR.x1 - townR.x0;
  const shx = ax(W, 38.5);
  if (town) {
    for (let k = 0; k < Math.max(3, Math.round(tw / 14)); k++) {
      const hx = Math.round(tx0 + 4 + k * (tw - 8) / Math.max(3, Math.round(tw / 14)));
      if (Math.abs(hx + 4 - shx) < 9) continue;
      const hy = floorAt(hx + 4), hh = 9 + (k % 3) * 3, wdt = 9;
      for (let j = 0; j < hh; j++) for (let i = 0; i < wdt; i++) mid.p(hx + i, hy - 1 - j, (i + (j >> 1)) % 4 ? 0x8a5a3a : 0x7a4a2e);
      for (let r = 0; r < 4; r++) for (let i = -1 + r; i <= wdt - r; i++) mid.p(hx + i, hy - hh - 1 - r, r === 0 ? 0x6a2a20 : (i % 2 ? 0xa83a2a : 0x8a2e22));
      const wx = hx + 2, wy = hy - hh + 3;
      mid.p(wx, wy, 0xffd070); mid.p(wx + 1, wy, 0xffc050); mid.p(wx, wy + 1, 0xffb040); mid.p(wx + 1, wy + 1, 0xffd070);
      mid.p(hx + 6, hy - 1, 0x3a2010); mid.p(hx + 6, hy - 2, 0x3a2010); mid.p(hx + 6, hy - 3, 0x3a2010);
      anim.windows.push({ x: wx, y: wy, ph: hash(k, 9, seed) });
      if (k % 2 === 0) anim.smoke.push({ x: hx + 7, y: hy - hh - 4 });
    }
    // string lights across the cave
    for (let x = tx0 + 4; x < townR.x1 - 4; x += 3) {
      const t = (x - tx0) / tw, y = Math.round(townR.y0 + 6 + Math.sin(t * Math.PI * 3) * 2 + Math.sin(t * Math.PI) * 4);
      mid.p(x, y, 0x3a2a20);
      anim.lights.push({ x, y: y + 1, r: 1, c: [0xffe080, 0xff8a6a, 0x8ae0ff][(x / 3 | 0) % 3], blink: hash(x, 3, 7) });
    }
  }
  // the shaft down from the town (always there: the Surface Express' old well, Bramble's lift)
  const sfy = floorAt(shx);
  for (let y = sfy; y < H; y++) for (let i = -3; i <= 3; i++) if (mid.a(shx + i, y)) mid.p(shx + i, y, i === -3 || i === 3 ? 0x2a1a10 : 0x120a08);
  for (let y = sfy - 18; y < H; y++) { mid.p(shx - 4, y, 0x6a4428); mid.p(shx + 4, y, 0x5a3a20); if (y >= sfy) mid.p(shx, y, y % 3 ? 0xc8a050 : 0xf0d080); }
  for (let i = -5; i <= 5; i++) mid.p(shx + i, sfy - 18, 0x7a5232);
  mid.p(shx, sfy - 17, 0x9a9aa0); mid.p(shx, sfy - 16, 0x6a6a70);
  T.townStop = { x: Math.round(tx0 + tw * 0.45), fy: floorAt(Math.round(tx0 + tw * 0.45)) };
  if (!town) {
    // the way in is boarded up: a dark gate and a "?"
    const gx = Math.round(tx0 + tw * 0.3), gyy = floorAt(gx);
    for (let j = 0; j < 14; j++) for (let i = 0; i < 12; i++) mid.p(gx + i, gyy - 1 - j, (j % 4 === 0) ? 0x5a3a20 : (i % 4 === 0 ? 0x3a2414 : 0x4a2e1a));
    mid.stamp(gx + 4, gyy - 26, ['111', '..1', '.11', '...', '.1.'], { 1: 0xc8a050 });
  }
  // the light of the forge, the fires and the lanterns on the rock
  const lights = [{ x: fx, y: fy - 6, r: 30, c: 0xff9a40, k: 0.6 }, { x: hhx, y: hhy - 4, r: 22, c: 0xffa040, k: 0.5 }, { x: lnx, y: homeR.y0 + 11, r: 18, c: 0xffd080, k: 0.4 }];
  if (town) for (let x = tx0 + 10; x < townR.x1 - 6; x += 22) lights.push({ x, y: townR.y0 + 18, r: 26, c: 0xffc060, k: 0.45 });
  applyLights(caveBack, lights, 1);
  applyLights(mid, lights, 0.8);
  // FRONT: a few grass blades and hanging roots
  const front = art(W, H + M * 2);
  for (let x = 0; x < W; x++) if (hash(x, 11, 5) < 0.3) for (let j = 0; j < 2 + (hash(x, 12, 5) * 4 | 0); j++) front.p(x, M + GROUND + 2 - j, j ? 0x2e5a22 : 0x1e3a18);
  // compose back: sky + cave backs under the mid
  return { back: back.commit(), mid: mid.commit(), caveBack: caveBack.commit(), front: front.commit(), anim, homeR, townR };
}

/** The glowing heart under everything. */
function paintCore(C) {
  const { W, seed } = C;
  const H = CORE_H;
  const mid = art(W, H);
  const P = ZP[6];
  const n = makeNoise2D(seed * 19);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ed = n(x * 0.05, 3) * 8;
    const crust = y < 22 + ed;
    if (crust) {
      const bx = Math.floor(x / B), by = Math.floor(y / B);
      let c = mul(P.rock[(hash(bx, by, 61) * 4) | 0], 0.92 + hash(bx, by, 62) * 0.14);
      if (x % B === 0 || y % B === 0) c = mul(c, 1.12); else if (x % B === B - 1 || y % B === B - 1) c = mul(c, 0.8);
      const glow = clamp((y - 6) / 18, 0, 1);
      c = mix(c, 0xc890ff, Math.floor(glow * 4 + dith(x, y)) / 4 * 0.45);
      mid.p(x, y, c);
      continue;
    }
    const d = Math.hypot((x - W / 2) * 0.4, y - H - 20);
    const k = clamp(1 - (d - 16) / 50, 0, 1);
    const q = Math.floor(k * 6 + dith(x, y) * 0.95);
    mid.p(x, y, [0x2a1440, 0x4a2470, 0x6a3a9a, 0x9a5ad0, 0xc890ff, 0xf0d8ff, 0xffffff][Math.min(6, Math.max(0, q))]);
  }
  return { mid: mid.commit(), back: null, front: null };
}

// ------------------------------------------------------------------ animation drawing (viewport ctx)
const glowCache = new Map();
/** A round, dithered glow (pixel-art light) of colour c and radius r. */
function glowSprite(c, r) {
  const key = c + ':' + r;
  if (glowCache.has(key)) return glowCache.get(key);
  const n = r * 2 + 1;
  const pc = new PixelCanvas(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - r, y - r) / (r + 0.5);
    if (d >= 1) continue;
    const band = Math.floor((1 - d) * 4 + dith(x, y) * 0.9) / 4;
    if (band > 0) pc.put(x, y, c, Math.round(band * band * 200 + 20));
  }
  const cv = pc.commit();
  glowCache.set(key, cv);
  return cv;
}
function drawGlow(ctx, x, y, c, r, a) {
  r = Math.max(1, Math.round(r));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.drawImage(glowSprite(c, r), Math.round(x - r), Math.round(y - r));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawLayerAnim(ctx, S, t, oy, view) {
  const A = S.art.anim, W = S.W, z = S.z;
  const fs = (c) => { ctx.fillStyle = c; };
  const pxl = (x, y, c, w = 1, h = 1) => { fs(c); ctx.fillRect(x | 0, (y + oy) | 0, w, h); };
  // liquids: a shimmer running along the surface
  const liq = A.liquid;
  for (let i = 0; i < liq.length; i += 3) {
    const x = liq[i], y = liq[i + 1], v = liq[i + 2];
    const s = Math.sin(x * 0.45 - t * (v === 3 ? 3 : 2)) + Math.sin(x * 0.17 + t * 1.3);
    if (v === 3) pxl(x, y + (s > 1.2 ? -1 : 0), s > 0.6 ? '#fff2a0' : s > -0.4 ? '#ffc040' : '#ff8a20');
    else if (s > 1.1) pxl(x, y, z === 5 ? '#ffffff' : '#d8f4ff');
  }
  // lava: bright blobs drifting in the river
  if (z === 4) for (let i = 0; i < liq.length; i += 9) {
    const x = liq[i], y = liq[i + 1];
    const s = Math.sin(x * 0.21 + t * 1.7) * Math.sin(x * 0.07 - t * 0.9);
    if (s > 0.45) pxl(x, y + 2 + ((x * 7) % 3), '#ffe070', 2, 1);
  }
  // falls of lava
  for (const f of A.falls) {
    for (let y = f.y0; y < f.y1; y++) {
      const k = (y * 0.6 - t * 14) % 4;
      pxl(f.x - 1, y, k < 1 ? '#fff0a0' : '#ff9a30', 1, 1);
      pxl(f.x, y, k < 2 ? '#ffd060' : '#ff7a20', 1, 1);
      pxl(f.x + 1, y, '#d8501a', 1, 1);
    }
    for (let k = 0; k < 4; k++) { const a = t * 3 + k * 1.7; pxl(f.x + Math.sin(a) * 4, f.y1 - 2 - Math.abs(Math.cos(a)) * 3, '#ffd070'); }
  }
  // glows: round dithered halos that breathe
  for (const g of A.glows) drawGlow(ctx, g.x, g.y + oy, g.c, g.r * 2.2, 0.55 * g.f * (0.7 + 0.3 * Math.sin(t * 2 + (g.pulse || 0) * 6.28)));
  // twinkles on crystals, ice and star ore
  for (const s of A.sparkles) {
    const k = (t * 0.7 + s.ph * 3) % 3;
    if (k > 0.5) continue;
    const r = s.small ? (k < 0.25 ? 1 : 0) : k < 0.15 || k > 0.35 ? 1 : 2;
    const c = css(s.c);
    pxl(s.x, s.y, '#ffffff');
    for (let i = 1; i <= r; i++) { pxl(s.x - i, s.y, c); pxl(s.x + i, s.y, c); pxl(s.x, s.y - i, c); pxl(s.x, s.y + i, c); }
  }
  // drips: fall from the tip, splash on the floor
  for (const d of A.drips) {
    const per = 2.2 / d.sp, tt = (t + d.ph * per) % per;
    const fall = S.art.floorTop[clamp(d.x, 0, W - 1)] - d.y;
    const tf = Math.sqrt(Math.max(1, fall) / 60);
    if (tt < 0.5) pxl(d.x, d.y, d.ice ? '#ffffff' : '#9ad8f0'); // swelling
    else if (tt < 0.5 + tf) { const y = d.y + 60 * (tt - 0.5) * (tt - 0.5); pxl(d.x, y, d.ice ? '#e8f8ff' : '#8ac8f0', 1, 2); }
    else if (tt < 0.5 + tf + 0.25) { const y = d.y + fall; pxl(d.x - 2, y - 1, '#b8e8ff'); pxl(d.x + 2, y - 1, '#b8e8ff'); pxl(d.x - 1, y - 2, '#d8f4ff'); pxl(d.x + 1, y - 2, '#d8f4ff'); }
  }
  // embers rising (Magma), snow falling (Frost), void sparks (Core), motes elsewhere
  const top = S.art.G ? 0 : 0;
  const nP = Math.round(W / (z === 5 ? 6 : z === 4 ? 10 : z === 6 ? 9 : 16));
  for (let i = 0; i < nP; i++) {
    const h1 = hash(i, z, 91), h2 = hash(i, z, 92), h3 = hash(i, z, 93);
    if (z === 5) {
      const per = 9 + h2 * 6, k = ((t / per) + h1) % 1;
      const x = (h3 * W + Math.sin(t * 0.8 + i) * 4 + k * 10) % W;
      const y = top + k * S.H;
      pxl(x, y, h2 > 0.6 ? '#ffffff' : '#d8ecff', h2 > 0.85 ? 2 : 1, h2 > 0.85 ? 2 : 1);
    } else if (z === 4) {
      const per = 4 + h2 * 4, k = ((t / per) + h1) % 1;
      const x0 = h3 * W, x = x0 + Math.sin(t * 2 + i) * 3;
      const y = S.art.floorTop[clamp(x0 | 0, 0, W - 1)] - k * (S.H * 0.7);
      pxl(x, y, k < 0.5 ? '#ffd060' : k < 0.8 ? '#ff8a30' : '#a83a1a');
    } else if (z === 6) {
      const a = t * (0.4 + h2) + h1 * 6.28, r = 6 + h3 * 20;
      const cx = (h1 * W + t * 3 * (h2 - 0.5)) % W, cy = S.H * 0.55 + Math.sin(a * 1.3) * r * 0.4;
      pxl(cx + Math.cos(a) * r, cy, h2 > 0.5 ? '#f0d0ff' : '#ffe8a0');
    } else {
      const per = 7 + h2 * 5, k = ((t / per) + h1) % 1;
      const x = h3 * W + Math.sin(t * 0.7 + i * 2) * 5;
      const y = S.H * (0.3 + 0.55 * ((h2 + k * 0.3) % 1)) + Math.sin(t + i) * 3;
      if (Math.sin(t * 1.5 + i * 3) > 0.2) pxl(x, y, z === 3 ? '#c8e8ff' : z === 2 ? '#d0ffd0' : '#ffe8a0');
    }
  }
  // floating rocks of the Core
  for (const f of A.floaters || []) {
    const y = f.y + Math.round(Math.sin(t * 0.8 + f.ph * 6.28) * 2);
    for (let j = 0; j < f.w * 2; j++) for (let i = -f.w * 2 + j; i <= f.w * 2 - j; i++) pxl(f.x + i, y + j, j === 0 ? '#9a78d0' : j === 1 ? '#5a3a8a' : '#3a2652');
    pxl(f.x, y + f.w * 2 + 1 + ((t * 4) | 0) % 3, '#d8b0ff');
  }
  // lift lanterns: a warm flicker by each lit cage
  for (const s of A.cages) {
    if (!s.open) continue;
    const fl = 0.75 + 0.25 * Math.sin(t * 11 + s.x) * Math.sin(t * 7.3 + s.x * 2);
    drawGlow(ctx, s.x + 5, s.fy + oy - 12, 0xffb050, 12, 0.5 * fl);
    drawGlow(ctx, s.x + 5, s.fy + oy - 12, 0xffe0a0, 4, 0.6 * fl);
    pxl(s.x + 5, s.fy - 13, '#3a2a22'); pxl(s.x + 5, s.fy - 12, fl > 0.8 ? '#fff4c0' : '#ffe080'); pxl(s.x + 5, s.fy - 11, '#ffb040');
  }
  // plants
  for (const p of A.plants) drawPlant(ctx, p, S.art.floorTop[clamp(p.x, 0, W - 1)] + oy, S.art.ceilBot[clamp(p.x, 0, W - 1)] + oy, t);
  // critters
  for (const c of A.critters) drawCritter(ctx, c, S, t, oy);
  void view;
}

function drawPlant(ctx, p, fy, cy, t) {
  const P = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); };
  const sw = Math.round(Math.sin(t * 1.4 + p.ph * 6.28) * 0.9);
  const x = p.x;
  if (!p.known) { // a grey sprout with a "?"
    P(x, fy - 1, '#5a5a5a'); P(x, fy - 2, '#6a6a6a'); P(x + sw, fy - 3, '#7a7a7a'); P(x - 1 + sw, fy - 4, '#7a7a7a');
    const qy = fy - 10 + Math.round(Math.sin(t * 2 + p.ph * 5));
    for (const [i, j] of [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [1, 4]]) P(x - 1 + i, qy + j, '#c8b890');
    return;
  }
  const glow = (gx, gy, c, a) => drawGlow(ctx, gx, gy, parseInt(c.slice(1), 16), 6, a * 1.6);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + p.ph * 6.28);
  switch (p.id) {
    case 'cave_carrot': P(x, fy - 1, '#e8803a'); for (let i = -1; i <= 1; i++) P(x + i + sw, fy - 3 - Math.abs(i), '#5aa83c'); P(x + sw, fy - 2, '#4a9030'); P(x + sw, fy - 4, '#7ac458'); break;
    case 'glowcap': for (const [dx, h] of [[-2, 3], [0, 5], [2, 2]]) { for (let j = 1; j < h; j++) P(x + dx, fy - j, '#e8e0d0'); P(x + dx - 1, fy - h, '#7af0c0'); P(x + dx, fy - h, '#c8fff0'); P(x + dx + 1, fy - h, '#7af0c0'); glow(x + dx, fy - h, '#5ad8a0', 0.18 + pulse * 0.2); } break;
    case 'blindfern': for (let j = 1; j < 7; j++) { const xx = x + Math.round(sw * j / 6); P(xx, fy - j, '#c8d8b0'); if (j % 2) { P(xx - 1, fy - j + 1, '#a8b890'); P(xx + 1, fy - j + 1, '#a8b890'); } } break;
    case 'whisperweed': for (let k = -1; k <= 1; k++) for (let j = 1; j < 8; j++) P(x + k * 2 + Math.round(Math.sin(t * 2 + j * 0.6 + k) * j / 6), fy - j, j > 5 ? '#e8d0ff' : '#a890c8'); break;
    case 'rubber_sap': for (let j = 0; j < 12; j++) P(x + Math.round(Math.sin(t + j * 0.4) * j / 8), cy + j, j % 4 === 3 ? '#8ab04a' : '#4a6a2a'); P(x, cy + 12 + ((t * 2 | 0) % 3), '#f0e8c0'); break;
    case 'pepperroot': P(x, fy - 1, '#4a9030'); P(x + sw, fy - 2, '#5aa83c'); P(x - 1, fy - 3, '#e8402a'); P(x + 1, fy - 3, '#e8402a'); P(x - 1, fy - 4, '#ff6a4a'); break;
    case 'sparkmoss': for (let i = -3; i <= 3; i++) P(x + i, fy - 1 - (Math.abs(i) < 2 ? 1 : 0), '#4ab05a'); if (pulse > 0.7) P(x + ((t * 5 | 0) % 7) - 3, fy - 4, '#e0ffff'); break;
    case 'bubblebulb': P(x, fy - 1, '#4a8a6a'); P(x - 1, fy - 2, '#7ad0c0'); P(x, fy - 2, '#b8fff0'); P(x + 1, fy - 2, '#7ad0c0'); P(x, fy - 3, '#7ad0c0'); { const by = fy - 5 - ((t * 6 + p.ph * 10) % 10); P(x + Math.round(Math.sin(t * 3)), by, '#d8fff8'); } break;
    case 'crystal_lily': P(x, fy - 1, '#4a8a7a'); P(x, fy - 2, '#4a8a7a'); P(x - 1, fy - 4, '#c8e8ff'); P(x + 1, fy - 4, '#c8e8ff'); P(x, fy - 5, '#ffffff'); P(x, fy - 3, '#8ad8ff'); glow(x, fy - 4, '#8ad8ff', 0.15 + pulse * 0.2); break;
    case 'gloomshroom': for (let j = 1; j < 4; j++) P(x, fy - j, '#8a7a9a'); for (let i = -2; i <= 2; i++) P(x + i, fy - 4, '#4a2a6a'); for (let i = -1; i <= 1; i++) P(x + i, fy - 5, '#5a3a7a'); P(x - 1, fy - 4, pulse > 0.5 ? '#c8a0ff' : '#6a4a8a'); break;
    case 'ashfern': for (let j = 1; j < 7; j++) { const xx = x + Math.round(sw * j / 6); P(xx, fy - j, '#8a8480'); if (j % 2) { P(xx - 1, fy - j + 1, '#6a6460'); P(xx + 1, fy - j + 1, '#6a6460'); } } break;
    case 'emberbloom': P(x, fy - 1, '#5a3a2a'); P(x, fy - 2, '#6a4a2a'); P(x - 1 + sw, fy - 3, '#ff6a1a'); P(x + 1 + sw, fy - 3, '#ff6a1a'); P(x + sw, fy - 4, '#ffd070'); P(x + sw, fy - 3, '#ffb030'); glow(x + sw, fy - 3, '#ff7a2a', 0.2 + pulse * 0.25); break;
    case 'truffle': P(x - 1, fy, '#6a4a30'); P(x, fy - 1, '#7a5a3a'); P(x + 1, fy, '#5a3a20'); P(x, fy, '#4a2e1a'); break;
    case 'frostbloom': P(x, fy - 1, '#6a9ab0'); P(x, fy - 2, '#6a9ab0'); P(x - 1, fy - 3, '#c8f0ff'); P(x + 1, fy - 3, '#c8f0ff'); P(x, fy - 4, '#ffffff'); P(x, fy - 3, '#8ad8ff'); glow(x, fy - 3, '#aef4ff', 0.12 + pulse * 0.15); break;
    case 'core_lotus': for (let i = -2; i <= 2; i++) P(x + i, fy - 1, '#3a2a5a'); P(x - 2, fy - 3, '#c890ff'); P(x + 2, fy - 3, '#c890ff'); P(x - 1, fy - 3, '#ffe8a0'); P(x + 1, fy - 3, '#ffe8a0'); P(x, fy - 4, '#ffffff'); P(x, fy - 2, '#ffd040'); glow(x, fy - 3, '#ffd080', 0.25 + pulse * 0.25); break;
    default: P(x, fy - 1, '#5aa83c'); P(x, fy - 2, '#7ac458');
  }
}

function drawCritter(ctx, c, S, t, oy) {
  const W = S.W, A = S.art;
  const P = (x, y, col, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w, h); };
  const fT = (x) => A.floorTop[clamp(Math.round(x), 0, W - 1)] + oy;
  const cB = (x) => A.ceilBot[clamp(Math.round(x), 0, W - 1)] + oy;
  // pace back and forth
  const ph = t * c.sp * 0.25 + c.ph * 6.28;
  const sweep = Math.sin(ph);
  const dir = Math.cos(ph) >= 0 ? 0 : 1; // 0 right, 1 left
  const x = clamp(c.x + sweep * c.range, 4, W - 6);
  const fr = c.frames && c.frames.length ? c.frames[Math.floor(t * (c.mv === 'fly' ? 6 : 3) + c.ph * 10) % c.frames.length][dir] : null;
  if (c.mv === 'unknown') {
    // a dark lump in a recess with two eyes that blink, and a "?" above
    const fy = fT(c.x);
    const blink = ((t * 0.6 + c.ph * 5) % 3) < 0.12;
    P(c.x - 4, fy - 5, '#0a0608', 9, 5); P(c.x - 3, fy - 6, '#0a0608', 7, 1);
    if (!blink) { P(c.x - 2, fy - 4, '#ffe8a0'); P(c.x + 1, fy - 4, '#ffe8a0'); }
    const qy = fy - 14 + Math.round(Math.sin(t * 1.6 + c.ph * 6) * 1.2);
    for (const [i, j] of [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [1, 4]]) P(c.x - 1 + i, qy + j, '#e8d8b0');
    return;
  }
  if (c.mv === 'worm') {
    const fy = fT(x);
    for (let i = 0; i < 6; i++) { const y = fy - 1 - Math.max(0, Math.round(Math.sin(i * 0.9 - t * 4 + c.ph * 6) * 1.2)); P(x + (dir ? -i : i), y, i === 5 ? '#f0b8b8' : i % 2 ? '#e0a0a0' : '#c88080'); }
    return;
  }
  if (c.mv === 'slug') {
    const fy = fT(x), s = Math.round(Math.sin(t * 3 + c.ph * 6) * 0.6);
    P(x - 3, fy - 2, '#7ab080', 6 + s, 2); P(x - 2, fy - 3, '#9ad0a0', 4, 1); P(dir ? x - 4 : x + 3 + s, fy - 4, '#9ad0a0'); P(dir ? x - 4 : x + 3 + s, fy - 5, '#e8fff0');
    P(x - 4, fy - 1, '#cfeedd', 1, 1);
    return;
  }
  if (c.mv === 'swarm') {
    const fy = fT(c.x);
    for (let k = 0; k < 6; k++) { const a = t * 3 + k * 1.05; P(c.x + Math.cos(a) * 5, fy - 8 + Math.sin(a * 1.4) * 3, (t * 8 + k) % 2 < 1 ? '#e0ffff' : '#7fe7ff'); }
    return;
  }
  if (c.mv === 'swim' && !fr) { // fish
    const y = (c.y ?? fT(x) + 7) + oy * 0 + Math.round(Math.sin(t * 2 + c.ph * 6));
    const yy = c.y != null ? c.y + oy + Math.round(Math.sin(t * 2 + c.ph * 6)) : y;
    const s = dir ? -1 : 1;
    P(x - 2, yy, '#f0d8d8', 5, 2); P(x - 1, yy - 1, '#ffffff', 3, 1); P(x - 3 * s - (s < 0 ? 0 : 0), yy - 1, '#d8b8b8'); P(x - 3 * s, yy + 2, '#d8b8b8'); P(x + 2 * s, yy, '#2a1a1a');
    return;
  }
  if ((c.mv === 'float') && !fr) { // wisps
    const y = (fT(c.x) + cB(c.x)) / 2 + Math.sin(t * 1.3 + c.ph * 6) * 6;
    const xx = c.x + Math.sin(t * 0.5 + c.ph * 6) * 14;
    const col = css(CREATURES[c.id]?.color ?? 0x9a6ad9);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3; P(xx - 3, y - 3, col, 7, 7); ctx.globalAlpha = 0.5; P(xx - 2, y - 2, col, 5, 5); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    P(xx - 1, y - 1, '#ffffff', 3, 3); P(xx, y + 2 + ((t * 5) | 0) % 2, col);
    return;
  }
  if (c.mv === 'hop' && !fr) { // slime
    const fy = fT(x), b = Math.abs(Math.sin(t * 3 + c.ph * 6));
    const col = css(CREATURES[c.id]?.color ?? 0x6ad07a);
    const hh = 3 + Math.round((1 - b) * 1), ww = 6 - Math.round((1 - b) * 1);
    P(x - ww / 2, fy - hh - Math.round(b * 4), col, ww, hh); P(x - ww / 2 + 1, fy - hh - Math.round(b * 4), '#ffffff', 1, 1); P(x + (dir ? -1 : 1), fy - hh + 1 - Math.round(b * 4), '#1a1010');
    return;
  }
  if (!fr) return;
  const w = fr.width, h = fr.height;
  let X = x - w / 2, Y;
  if (c.mv === 'fly') {
    const top = cB(x) + 6, bot = fT(x) - 10;
    Y = top + (bot - top) * (0.3 + 0.25 * Math.sin(t * 0.9 + c.ph * 6)) + Math.sin(t * 5 + c.ph) * 1.5;
    if (c.id === 'glow_beetle') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4); P(X - 1, Y + 1, '#c8ff7a', w + 2, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  } else if (c.mv === 'hang') {
    const top = cB(c.x);
    const drop = 10 + Math.sin(t * 0.8 + c.ph * 6) * 6;
    X = c.x - w / 2;
    for (let y = top; y < top + drop; y++) P(c.x, y, 'rgba(230,230,240,0.55)');
    Y = top + drop;
  } else if (c.mv === 'swim') {
    Y = (c.y != null ? c.y + oy : fT(x) + 7) - h / 2 + Math.sin(t * 2 + c.ph * 6);
  } else if (c.mv === 'lava') {
    const dip = Math.sin(t * 0.9 + c.ph * 6) > 0.4;
    Y = fT(x) + (dip ? 4 : 1) - h + 2;
  } else if (c.mv === 'hop') {
    Y = fT(x) - h + 1 - Math.round(Math.abs(Math.sin(t * 3 + c.ph * 6)) * 4);
  } else if (c.mv === 'still') {
    X = c.x - w / 2; Y = fT(c.x) - h + 1;
  } else {
    Y = fT(x) - h + 1 - (Math.floor(t * 4 + c.ph * 9) % 2);
  }
  ctx.drawImage(fr, Math.round(X), Math.round(Y));
}

function drawTopAnim(ctx, S, t, oy) {
  const A = S.art.anim, W = S.W;
  const P = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x | 0, (y + oy) | 0, w, h); };
  // fires flicker
  for (const f of A.fires) {
    for (let i = -f.w >> 1; i <= f.w >> 1; i++) {
      const hgt = 2 + Math.round((Math.sin(t * 9 + i * 1.7) + Math.sin(t * 13 + i)) * 0.8 + 1);
      for (let j = 0; j < hgt; j++) P(f.x + i, f.y - j, j === hgt - 1 ? '#ff6a1a' : j > hgt / 2 ? '#ffb030' : '#fff0a0');
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 10);
    ctx.fillStyle = '#ff9a40'; ctx.fillRect(f.x - 7, f.y + oy - 9, 15, 11);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // sparks from the forge
    if (f.kind === 'forge') for (let k = 0; k < 3; k++) { const tt = (t * 0.9 + k / 3) % 1; P(f.x + Math.sin(k * 3 + t) * 3, f.y - 3 - tt * 12, tt < 0.6 ? '#ffe070' : '#ff7a2a'); }
  }
  // chimney smoke
  for (const s of A.smoke) for (let k = 0; k < 4; k++) {
    const tt = (t * 0.25 + k / 4 + s.x * 0.01) % 1;
    const x = s.x + tt * 9 + Math.sin(tt * 6 + t) * 1.5, y = s.y - tt * 22;
    ctx.globalAlpha = 0.55 * (1 - tt);
    P(x, y, '#d8d4d8', 2 + (tt * 2 | 0), 2 + (tt * 2 | 0));
  }
  ctx.globalAlpha = 1;
  // windows glow, string lights twinkle, lanterns
  for (const w of A.windows) if (Math.sin(t * 0.7 + w.ph * 20) > -0.85) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2; P(w.x - 2, w.y - 2, '#ffb040', 6, 6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  for (const l of A.lights) {
    const on = l.blink == null || Math.sin(t * 2 + l.blink * 30) > -0.4;
    if (!on) continue;
    P(l.x, l.y, css(l.c));
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25; P(l.x - l.r, l.y - l.r, css(l.c), l.r * 2 + 1, l.r * 2 + 1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  void W;
}

function drawCloudsAnim(ctx, S, t, oyBack) {
  const W = S.W;
  for (const c of S.art.anim.clouds) {
    const x = ((c.x + t * c.sp) % (W + 40)) - 20, y = c.y + oyBack;
    const w = Math.round(c.w);
    for (let j = -3; j <= 1; j++) for (let i = -w; i <= w; i++) {
      const e = (i / w) ** 2 + ((j + 1) / (j < -1 ? 2.2 : 3)) ** 2 + Math.sin(i * 0.9) * 0.08;
      if (e < 1) { ctx.fillStyle = j >= 0 ? '#d8d8e8' : j === -3 ? '#ffffff' : '#f6f2f0'; ctx.fillRect(Math.round(x + i), Math.round(y + j), 1, 1); }
    }
  }
}

function drawCoreAnim(ctx, S, t, oy) {
  const W = S.W, H = S.H;
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
  ctx.globalAlpha = 0.08 + pulse * 0.08;
  ctx.fillStyle = '#c890ff';
  ctx.fillRect(Math.round(W * 0.3), oy + H - 30, Math.round(W * 0.4), 30);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < W / 10; i++) {
    const h1 = hash(i, 7, 1), h2 = hash(i, 8, 1);
    const k = ((t / (3 + h2 * 3)) + h1) % 1;
    const x = W / 2 + (h1 - 0.5) * W * 0.8 * (1 - k * 0.3) + Math.sin(t * 2 + i) * 2;
    const y = oy + H - k * (H + 20);
    ctx.fillStyle = k < 0.5 ? '#ffffff' : k < 0.8 ? '#f0d0ff' : '#9a5ad0';
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

/** The mole with his lamp: "you are here". */
function drawMole(ctx, x, fy, t) {
  const b = Math.round(Math.abs(Math.sin(t * 3)) * 1);
  const y = fy - 7 - b;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 + 0.06 * Math.sin(t * 9);
  ctx.fillStyle = '#ffe8a0'; ctx.fillRect(x + 1, y - 3, 11, 8);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const rows = ['..yy...', '.3333..', '311112.', '31e1pp.', '311112.', '.3..3..'];
  const pal = { y: '#fff4b0', 3: '#3a2a3a', 1: '#5a4a5a', 2: '#7a6a7a', e: '#fff8e0', p: '#ff9ab0' };
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const ch = rows[j][i]; if (ch === '.') continue; ctx.fillStyle = pal[ch]; ctx.fillRect(x - 3 + i, y + j, 1, 1); }
}

// ------------------------------------------------------------------ icons for the plaques (16 px)
const small = new Map();
function smallIcon(cat, id) {
  const key = cat + ':' + id;
  if (small.has(key)) return small.get(key);
  let url = '';
  try {
    if (cat === 'critter') url = creatureIconURL(id);
    else { const spec = ITEMS[id]?.icon; url = spec ? drawIconSmall(spec, hashStrLite(id) >>> 0, 16).commit().toDataURL() : iconURL(id); }
  } catch (e) { url = ''; }
  small.set(key, url);
  return url;
}

// ------------------------------------------------------------------ the panel
/**
 * Open the layers. here: the stop you're at ('home', 'town', a lift id) or null; dests: the stops
 * you can ride to (liftDestinations); ride(id) rides (null: view-only); locked: lifts found but
 * not unlocked yet. opts: { title, sub, you: { x, d } (the mole's spot when not at a stop) }.
 */
export function openLiftLayers(game, here, opts = {}, dests = [], ride = null, locked = []) {
  const st = game.state;
  const seed = ((st.data.deep && st.data.deep.seed) || 1) % 9973;
  const canRide = typeof ride === 'function';
  const town = dests.some((d) => d.id === 'town');
  const exp = exploredByLayer(st);
  const finds = [null, 1, 2, 3, 4, 5, 6].map((z) => (z ? layerFinds(st, z) : null));
  // the stops, where they are
  const stops = dests.map((d) => ({ ...d, open: true })).concat(locked.map((d) => ({ ...d, open: false })));
  for (const s of stops) s.where = stopWhere(s, seed);
  const layerStops = (z) => stops.filter((s) => !s.where.top && s.where.zone === z);
  const unlockedIn = (z) => layerStops(z).some((s) => s.open);
  // where you are
  let you = null;
  const hs = stops.find((s) => s.id === here);
  if (hs) you = { x: hs.where.x, d: hs.where.d, zone: hs.where.top ? 0 : hs.where.zone, top: hs.where.top, stop: hs };
  else if (opts.you) you = { x: opts.you.x, d: opts.you.d, zone: zoneOfDepth(Math.max(0, opts.you.d)), top: false };

  // ---- DOM
  const canvas = el('canvas', { class: 'll-canvas' });
  const ctx = canvas.getContext('2d');
  const track = el('div', { class: 'll-track' });
  const rail = el('nav', { class: 'll-rail', 'aria-label': 'Layers' });
  const thumb = el('i', { class: 'll-thumb' });
  const tip = el('div', { class: 'll-tip', hidden: true });
  const pick = el('button', { class: 'll-pick', type: 'button', hidden: true });
  const view = el('div', { class: 'll-view', tabindex: '0', role: 'region', 'aria-label': 'The layers of the underground, top to bottom' }, [canvas, track, rail, tip, pick]);
  const body = el('div', { class: 'll-body' }, [view]);

  // a plaque per layer
  const plaques = [];
  const dive = (s) => { if (!canRide || !s || s.id === here || !s.open) return; game.audio.play('click'); h?.close(); ride(s.id); };
  const nearestIn = (z, pt) => {
    const list = layerStops(z).filter((s) => s.open && s.id !== here);
    if (!list.length) return null;
    const p = pt || (you ? { x: you.x, d: you.d } : { x: 0, d: LIFT_ZONE_DEPTHS[z - 1] });
    return list.sort((a, b) => Math.hypot(a.where.x - p.x, (a.where.d - p.d) * 2) - Math.hypot(b.where.x - p.x, (b.where.d - p.d) * 2))[0];
  };
  for (let z = 1; z <= 6; z++) {
    const Z = ZONES[z], F = finds[z];
    const isLocked = !unlockedIn(z);
    const pct = exp.pct[z];
    const lifts = layerStops(z).filter((s) => /^L\d/.test(s.id));
    const found = lifts.length;
    const chips = (list, label, ico) => {
      const known = list.filter((o) => o.e);
      const g = el('span', { class: 'll-grp', title: `${label}: ${known.length} of ${list.length} found` }, [el('i', { class: 'll-gi ' + ico })]);
      for (const o of known.slice(0, 8)) {
        const url = smallIcon(o.cat, o.id);
        const name = o.cat === 'critter' ? CREATURES[o.id]?.name : ITEMS[o.id]?.name;
        g.append(el('span', { class: 'll-chip', title: `${name || o.id}${o.e?.n ? ` · ×${o.e.n}` : ''}` }, [url ? el('img', { src: url, alt: name || '', class: o.cat === 'critter' ? 'big' : '' }) : null, o.e?.n > 1 ? el('b', {}, o.e.n > 99 ? '99+' : String(o.e.n)) : null]));
      }
      if (known.length > 8) g.append(el('span', { class: 'll-more' }, `+${known.length - 8}`));
      const unk = list.length - known.length;
      if (unk) g.append(el('span', { class: 'll-unk', title: `${unk} not found yet` }, `?${unk > 1 ? '×' + unk : ''}`));
      return g;
    };
    const target = nearestIn(z, null);
    const youHere = you && !you.top && you.zone === z;
    const btn = isLocked ? null : canRide && target ? el('button', {
      class: 'll-dive btn', type: 'button',
      'aria-label': `Dive to the ${Z.name}: ride to ${target.name}, ${Math.round(target.where.d)} m`,
      onclick: () => dive(target),
    }, [el('span', {}, 'Dive'), el('small', {}, `to ${target.name}`)]) : el('span', { class: 'll-note' }, canRide ? 'You are here' : 'Ride from a lift to dive');
    const plq = el('section', { class: 'll-plaque' + (isLocked ? ' locked' : '') + (youHere ? ' here' : ''), 'data-z': z }, [
      el('header', {}, [el('i', { class: 'll-num' }, ROMAN[z]), el('b', { class: 'll-name' }, Z.name), el('span', { class: 'll-depth' }, `${LIFT_ZONE_DEPTHS[z - 1]}–${LIFT_ZONE_DEPTHS[z]} m`), youHere ? el('em', { class: 'll-yh' }, 'you') : null]),
      el('div', { class: 'll-gauge', title: `${exp.n[z].toLocaleString()} cells walked` }, [el('span', { class: 'll-bar' }, [el('i', { style: { width: pct + '%' } })]), el('span', { class: 'll-pct' }, `explored ${pct}%`)]),
      el('div', { class: 'll-finds' }, [chips(F.ores, 'Ores and gems', 'ore'), chips(F.crit, 'Creatures', 'crit'), chips(F.plants, 'Plants', 'plant')]),
      isLocked
        ? el('div', { class: 'll-lockmsg' }, [el('b', {}, 'Unlock a lift down there first'), el('small', {}, found ? `You've found ${found === 1 ? 'a lift' : found + ' lifts'} here: go back and ring ${found === 1 ? 'its' : 'a'} bell to unlock it.` : `Find one of the old lifts in the ${Z.name} and ring its bell.`)])
        : el('div', { class: 'll-act' }, [btn, el('small', { class: 'll-lifts' }, `${layerStops(z).filter((s) => s.open).length} stop${layerStops(z).filter((s) => s.open).length === 1 ? '' : 's'} · ${found}/3 old lifts found`)]),
    ]);
    plq.style.setProperty('--zc', Z.color);
    plaques[z] = plq;
    track.append(plq);
  }
  // stop tags (positions after painting)
  const tags = new Map();
  for (const s of stops) {
    const isHere = s.id === here;
    const rideable = canRide && s.open && !isHere;
    const tag = el(rideable ? 'button' : 'div', {
      class: 'll-stop' + (s.open ? '' : ' locked') + (isHere ? ' here' : '') + (s.where.top ? ' top' : ''), type: rideable ? 'button' : undefined,
      title: s.open ? (s.desc || '') : 'Locked: ring this lift\'s bell down there to unlock it as a checkpoint.',
      'aria-label': isHere ? `${s.name}: you are here` : s.open ? `Ride to ${s.name}${s.where.top ? '' : `, ${Math.round(s.where.d)} metres down`}` : `${s.name} (locked)`,
      onclick: rideable ? () => dive(s) : undefined,
    }, [s.open ? null : el('i', { class: 'll-lock' }), el('span', { class: 'll-sn' }, s.name), s.where.top ? null : el('small', {}, `${Math.round(s.where.d)} m`), isHere ? el('em', {}, 'you are here') : null]);
    tags.set(s.id, tag);
    track.append(tag);
  }
  const youTag = el('div', { class: 'll-stop here you' }, [el('span', { class: 'll-sn' }, 'You'), el('em', {}, 'you are here')]);
  if (you && !you.stop) track.append(youTag);

  // rail
  const rk = [];
  const railItems = [{ key: 'top', label: '⌂', title: town ? 'Home and Deep Town' : 'Home' }].concat([1, 2, 3, 4, 5, 6].map((z) => ({ key: z, label: ROMAN[z], title: ZONES[z].name })));
  for (const it of railItems) {
    const isLocked = it.key !== 'top' && !unlockedIn(it.key);
    const b = el('button', { class: 'll-rk' + (isLocked ? ' locked' : '') + ((you && (you.top ? it.key === 'top' : you.zone === it.key)) ? ' you' : ''), type: 'button', title: it.title + (isLocked ? ' (locked)' : ''), 'aria-label': `Scroll to ${it.title}`, onclick: () => goTo(it.key) }, it.label);
    if (it.key !== 'top') b.style.setProperty('--zc', ZONES[it.key].color);
    rk.push({ key: it.key, b });
    rail.append(b);
  }
  rail.append(thumb);

  // ---- open the panel; measure; build the scene
  game.audio.play('bell', { vol: 0.5 });
  let h = null;
  let alive = true, raf = 0;
  const S = { px: 3, W: 0, VH: 0, sections: [], scroll: 0, target: 0, vel: 0, total: 0, ready: false };
  h = game.ui.openPanel({
    title: opts.title || 'The Lift', sub: opts.sub || (canRide ? 'Where to?' : 'The layers you know.'), body, className: 'll-panel',
    onClose: () => { alive = false; cancelAnimationFrame(raf); clearTimeout(idleT); ro?.disconnect(); window.removeEventListener('keydown', onKey, true); },
  });

  let idleT = 0;
  const build = () => {
    const px = cssPx();
    const cw = view.clientWidth, ch = view.clientHeight;
    if (!cw || !ch) return false;
    S.px = px;
    S.W = Math.max(120, Math.ceil(cw / px));
    S.VH = Math.max(60, Math.ceil(ch / px));
    canvas.width = S.W; canvas.height = S.VH;
    canvas.style.width = S.W * px + 'px'; canvas.style.height = S.VH * px + 'px';
    ctx.imageSmoothingEnabled = false;
    // plaques' size in art px (they sit in the rock above each hollow)
    let pw = 0, ph = 0;
    for (let z = 1; z <= 6; z++) { const r = plaques[z]; pw = Math.max(pw, r.offsetWidth); ph = Math.max(ph, r.offsetHeight); }
    const plq = { right: Math.ceil(pw / px) + 6, bottom: SEAM + 3 + Math.ceil(ph / px) };
    const LH = Math.max(160, plq.bottom + 104);
    const M = Math.ceil(0.22 * (LH + S.VH) / 2) + 4;
    S.sections = [];
    let y = 0;
    S.sections.push({ kind: 'top', y, H: TOP_H, W: S.W, M, art: null });
    y += TOP_H;
    for (let z = 1; z <= 6; z++) {
      S.sections.push({ kind: 'layer', z, y, H: LH, W: S.W, M, art: null, plaque: plq, locked: !unlockedIn(z) });
      y += LH;
    }
    S.sections.push({ kind: 'core', y, H: CORE_H, W: S.W, M: 0, art: null });
    y += CORE_H;
    S.total = y;
    S.plq = plq;
    track.style.height = y * px + 'px';
    // place the DOM: plaques, stop tags
    for (const sec of S.sections) {
      if (sec.kind !== 'layer') continue;
      const p = plaques[sec.z];
      p.style.transform = `translate(${4 * px}px, ${(sec.y + SEAM + 3) * px}px)`;
    }
    // positions for the stops (x now; their floor height once their layer is painted)
    for (const s of stops) {
      if (s.where.top) continue;
      s.ax = ax(S.W, s.where.x);
    }
    for (const sec of S.sections) if (sec.kind === 'layer') sec.stops = layerStops(sec.z);
    return true;
  };

  const paintSection = (sec) => {
    if (sec.art) return;
    if (sec.kind === 'top') {
      sec.art = paintTop({ W: sec.W, seed, town, M: sec.M });
      placeTopTags(sec);
    } else if (sec.kind === 'layer') {
      const yx = you && !you.top && !you.stop && you.zone === sec.z ? clamp(ax(sec.W, you.x), 4, sec.W - 6) : null;
      sec.art = paintLayer({ z: sec.z, W: sec.W, H: sec.H, seed, plaque: sec.plaque, locked: sec.locked, finds: finds[sec.z], stops: sec.stops, pts: exp.pts[sec.z], here, margin: sec.M, youX: yx });
      placeLayerTags(sec);
    } else sec.art = paintCore({ W: sec.W, seed });
  };
  const placeTag = (tag, x, y) => {
    const px = S.px;
    tag.style.transform = `translate(${Math.round(x * px - tag.offsetWidth / 2)}px, ${Math.round(y * px - tag.offsetHeight)}px)`;
    tag.style.visibility = 'visible';
  };
  const placeTopTags = (sec) => {
    const A = sec.art;
    const ht = tags.get('home'), tt = tags.get('town');
    if (ht) placeTag(ht, A.homeR ? (A.homeR.x0 + A.homeR.x1) / 2 : sec.W * 0.3, sec.y + A.homeR.y0 + 4);
    if (tt) placeTag(tt, (A.townR.x0 + A.townR.x1) / 2, sec.y + A.townR.y0 + 4);
    if (you && you.top) youSpot = { sec, x: you.stop?.id === 'town' ? (A.townR.x0 + A.townR.x1) / 2 + 10 : clamp(ax(sec.W, 5) - 12, 8, sec.W - 8), fy: A.homeR.y1 - 1 };
    if (you && you.top) { const f = you.stop?.id === 'town' ? A.townStop : A.homeStop; youSpot = { sec, x: f.x - 11, fy: f.fy }; }
  };
  const placeLayerTags = (sec) => {
    // stack tags that would overlap
    const placed = [];
    const list = sec.stops.slice().sort((a, b) => a.x - b.x);
    for (const s of list) {
      const tag = tags.get(s.id);
      if (!tag) continue;
      const w = tag.offsetWidth / S.px, hgt = tag.offsetHeight / S.px;
      let y = sec.y + s.fy - 15;
      const x = clamp(s.x, w / 2 + 2, sec.W - w / 2 - 12);
      for (const p of placed) if (Math.abs(p.x - x) < (p.w + w) / 2 + 1 && Math.abs(p.y - y) < hgt + 1) y = p.y - hgt - 1;
      placed.push({ x, y, w });
      placeTag(tag, x, y);
    }
    if (you && !you.top && you.zone === sec.z) {
      const x = you.stop ? clamp(you.stop.x - 11, 4, sec.W - 6) : clamp(ax(sec.W, you.x), 4, sec.W - 6);
      youSpot = { sec, x, fy: sec.art.floorTop[clamp(x, 0, sec.W - 1)] };
      if (!you.stop) placeTag(youTag, x, sec.y + youSpot.fy - 10);
    }
  };
  let youSpot = null;

  // ---- scrolling
  const maxScroll = () => Math.max(0, S.total - S.VH);
  const secOf = (key) => S.sections.find((s) => (key === 'top' ? s.kind === 'top' : s.z === key));
  const goTo = (key) => {
    const sec = secOf(key);
    if (!sec) return;
    S.target = clamp(sec.y + sec.H / 2 - S.VH / 2, 0, maxScroll());
    S.vel = 0;
  };
  const centerOn = (y) => { S.scroll = S.target = clamp(y - S.VH * 0.45, 0, maxScroll()); };

  // ---- input: wheel, drag (with inertia), keys, taps
  const onWheel = (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? S.VH * S.px : 1;
    S.target = clamp(S.target + (e.deltaY * k) / S.px, 0, maxScroll());
    S.vel = 0;
  };
  let drag = null;
  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    drag = { id: e.pointerId, y: e.clientY, x: e.clientX, y0: e.clientY, x0: e.clientX, t: performance.now(), moved: false, type: e.pointerType, target: e.target };
    S.vel = 0;
    S.target = S.scroll;
  };
  const onMove = (e) => {
    if (drag && e.pointerId === drag.id) {
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
        drag.moved = true;
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        hideTip();
      }
      if (drag.moved) {
        const now = performance.now(), dt = Math.max(1, now - drag.t);
        S.scroll = S.target = clamp(S.scroll - dy / S.px, 0, maxScroll());
        S.vel = S.vel * 0.6 + (-dy / S.px / (dt / 1000)) * 0.4;
        drag.t = now;
      }
      drag.y = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse') hover(e);
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) { if (performance.now() - d.t > 90) S.vel = 0; suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); return; }
    S.vel = 0;
    if (d.target.closest('button, a, .ll-plaque')) return;
    tapScene(e, d.type);
  };
  let suppressClick = false;
  const onClickCapture = (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } };
  const onKey = (e) => {
    if (!alive || game.ui.panelStack?.[game.ui.panelStack.length - 1] !== h) return;
    const step = { ArrowDown: 24, ArrowUp: -24, PageDown: S.VH * 0.85, PageUp: -S.VH * 0.85, ' ': S.VH * 0.85 }[e.key];
    if (step != null) { S.target = clamp(S.target + step, 0, maxScroll()); e.preventDefault(); return; }
    if (e.key === 'Home') { S.target = 0; e.preventDefault(); }
    if (e.key === 'End') { S.target = maxScroll(); e.preventDefault(); }
  };
  view.addEventListener('wheel', onWheel, { passive: false });
  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp);
  view.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
  view.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
  view.addEventListener('click', onClickCapture, true);
  window.addEventListener('keydown', onKey, true);

  // what's under a point of the view: the section, the art x/y, the nearest stop
  const probe = (e) => {
    const r = view.getBoundingClientRect();
    const x = (e.clientX - r.left) / S.px, y = Math.round(S.scroll) + (e.clientY - r.top) / S.px;
    const sec = S.sections.find((s) => y >= s.y && y < s.y + s.H);
    if (!sec) return null;
    if (sec.kind === 'top') {
      const A = sec.art;
      if (!A) return { sec };
      const ly = y - sec.y;
      const inHome = x >= A.homeR.x0 && x <= A.homeR.x1 && ly > GROUND;
      const inTown = x >= A.townR.x0 && x <= A.townR.x1 && ly > GROUND;
      const s = inHome ? stops.find((q) => q.id === 'home') : inTown ? stops.find((q) => q.id === 'town') : null;
      return { sec, x, y, stop: s && s.id !== here ? s : null, label: s ? s.name : null, here: s && s.id === here };
    }
    if (sec.kind !== 'layer') return { sec };
    const d0 = LIFT_ZONE_DEPTHS[sec.z - 1], d1 = LIFT_ZONE_DEPTHS[sec.z];
    const wx = X0 + ((x - 4) / (S.W - 8)) * (X1 - X0), wd = d0 + clamp((y - sec.y - SEAM) / (sec.H - SEAM), 0, 1) * (d1 - d0);
    const s = nearestIn(sec.z, { x: wx, d: wd });
    return { sec, x, y, stop: s, locked: sec.locked, label: s ? s.name : null };
  };
  const showTip = (html, cx, cy, cls) => {
    const r = view.getBoundingClientRect();
    tip.hidden = false;
    tip.className = 'll-tip' + (cls ? ' ' + cls : '');
    tip.innerHTML = html;
    const tw = tip.offsetWidth;
    tip.style.transform = `translate(${Math.round(clamp(cx - r.left + 14, 4, r.width - tw - 40))}px, ${Math.round(clamp(cy - r.top + 16, 4, r.height - 40))}px)`;
  };
  const hideTip = () => { tip.hidden = true; view.classList.remove('hot'); setHot(null); };
  let hotZ = null;
  const setHot = (z) => { if (hotZ === z) return; if (hotZ) plaques[hotZ]?.classList.remove('hot'); hotZ = z; if (z) plaques[z]?.classList.add('hot'); };
  const hover = (e) => {
    if (e.target.closest('button, .ll-plaque, .ll-rail')) { hideTip(); return; }
    const p = probe(e);
    if (!p || !p.sec || (p.sec.kind !== 'layer' && p.sec.kind !== 'top')) { hideTip(); return; }
    if (p.sec.kind === 'top') {
      if (p.stop && canRide) { view.classList.add('hot'); showTip(`<b>Ride</b> to ${p.label}`, e.clientX, e.clientY); } else if (p.here) showTip(`${p.label}: <i>you are here</i>`, e.clientX, e.clientY, 'dim'); else hideTip();
      return;
    }
    setHot(p.sec.z);
    if (p.locked) { view.classList.remove('hot'); showTip(`<b>${ZONES[p.sec.z].name}</b> · locked<br><small>Unlock a lift down there first</small>`, e.clientX, e.clientY, 'dim'); return; }
    if (!canRide) { view.classList.remove('hot'); showTip(`<b>${ZONES[p.sec.z].name}</b><br><small>Ride from a lift to dive here</small>`, e.clientX, e.clientY, 'dim'); return; }
    if (!p.stop) { view.classList.remove('hot'); showTip(`<b>${ZONES[p.sec.z].name}</b>: you are here`, e.clientX, e.clientY, 'dim'); return; }
    view.classList.add('hot');
    showTip(`<b>Dive ▾</b> ${p.stop.name} <small>${Math.round(p.stop.where.d)} m</small>`, e.clientX, e.clientY);
  };
  let picked = null;
  const tapScene = (e, type) => {
    const p = probe(e);
    pick.hidden = true;
    if (!p || !p.sec) return;
    if (p.sec.kind === 'layer') setHot(p.sec.z);
    if (!canRide || !p.stop) {
      if (p.sec.kind === 'layer' && (p.locked || !canRide)) showTip(p.locked ? `<b>${ZONES[p.sec.z].name}</b> · locked<br><small>Unlock a lift down there first</small>` : `<b>${ZONES[p.sec.z].name}</b><br><small>Ride from a lift to dive here</small>`, e.clientX, e.clientY, 'dim');
      return;
    }
    if (type === 'mouse') { dive(p.stop); return; }
    // touch: the first tap picks, the button rides
    picked = p.stop;
    const r = view.getBoundingClientRect();
    pick.innerHTML = '';
    pick.append(el('b', {}, 'Dive ▾'), el('span', {}, `${p.stop.name} · ${p.stop.where.top ? '' : Math.round(p.stop.where.d) + ' m'}`));
    pick.hidden = false;
    const pw = pick.offsetWidth, ph = pick.offsetHeight;
    pick.style.transform = `translate(${Math.round(clamp(e.clientX - r.left - pw / 2, 6, r.width - pw - 36))}px, ${Math.round(clamp(e.clientY - r.top - ph - 18, 6, r.height - ph - 6))}px)`;
    tip.hidden = true;
  };
  pick.addEventListener('click', () => { if (picked) dive(picked); });

  // ---- the frame: physics, compose, labels
  const t0 = performance.now();
  let last = t0;
  const frame = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!S.ready) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (!drag) {
      if (Math.abs(S.vel) > 4) { S.scroll += S.vel * dt; S.vel *= Math.exp(-dt * 4.2); S.target = S.scroll; }
      else { S.vel = 0; S.scroll += (S.target - S.scroll) * (1 - Math.exp(-dt * 12)); }
      if (S.scroll < 0 || S.scroll > maxScroll()) { S.scroll = clamp(S.scroll, 0, maxScroll()); S.target = S.scroll; S.vel = 0; }
    }
    render(t);
  };
  const render = (t) => {
    const sy = Math.round(S.scroll), VH = S.VH, W = S.W;
    track.style.transform = `translateY(${-sy * S.px}px)`;
    ctx.fillStyle = '#0a0608';
    ctx.fillRect(0, 0, W, VH);
    for (const sec of S.sections) {
      const top = sec.y - sy;
      if (top >= VH || top + sec.H <= 0) continue;
      paintSection(sec);
      const A = sec.art;
      const c0 = Math.max(0, top), c1 = Math.min(VH, top + sec.H);
      const center = sec.y + sec.H / 2 - (sy + VH / 2);
      const blit = (cv, k, M) => {
        if (!cv) return;
        const off = Math.round(center * (k - 1));
        const py = top + off - M;
        const sy0 = clamp(c0 - py, 0, cv.height), sh = Math.min(c1 - c0, cv.height - sy0);
        if (sh > 0) ctx.drawImage(cv, 0, sy0, W, sh, 0, c0, W, sh);
        return off - M;
      };
      ctx.save();
      ctx.beginPath(); ctx.rect(0, c0, W, c1 - c0); ctx.clip();
      if (sec.kind === 'top') {
        const ob = blit(A.back, 0.78, sec.M);
        drawCloudsAnim(ctx, sec, t, top + ob + sec.M);
        blit(A.caveBack, 1, 0);
        blit(A.mid, 1, 0);
        drawTopAnim(ctx, sec, t, top);
        if (youSpot && youSpot.sec === sec) drawMole(ctx, youSpot.x, top + youSpot.fy, t);
        blit(A.front, 1.2, sec.M);
      } else if (sec.kind === 'layer') {
        blit(A.back, 0.8, sec.M);
        blit(A.mid, 1, 0);
        blit(A.veil, 1, 0);
        drawLayerAnim(ctx, sec, t, top, S);
        if (youSpot && youSpot.sec === sec) drawMole(ctx, youSpot.x, top + youSpot.fy, t);
        blit(A.front, 1.2, sec.M);
        if (A.lock) {
          blit(A.lock, 1, 0);
          // fog drifting over a locked layer
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = '#b8b0c8';
          for (let i = 0; i < W / 22; i++) {
            const h1 = hash(i, sec.z, 31), h2 = hash(i, sec.z, 32);
            const x = ((h1 * W + t * (3 + h2 * 4)) % (W + 40)) - 20, y = top + 14 + h2 * (sec.H - 28) + Math.sin(t * 0.5 + i) * 3;
            const w = 14 + h1 * 22;
            ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), 3);
            ctx.fillRect(Math.round(x - w / 3), Math.round(y - 2), Math.round(w * 0.66), 2);
          }
          ctx.globalAlpha = 1;
        }
      } else {
        blit(A.mid, 1, 0);
        drawCoreAnim(ctx, sec, t, top);
      }
      ctx.restore();
    }
    // the rail's thumb: where the view is
    if (railH) {
      const k = railH / S.total;
      thumb.style.transform = `translateY(${Math.round(sy * k)}px)`;
      thumb.style.height = Math.max(8, Math.round(VH * k)) + 'px';
    }
  };
  let railH = 0;
  const layoutRail = () => {
    railH = rail.clientHeight - 0;
    const k = railH / S.total;
    for (const r of rk) {
      const sec = secOf(r.key);
      r.b.style.top = Math.round(sec.y * k) + 'px';
      r.b.style.height = Math.max(14, Math.round(sec.H * k)) + 'px';
    }
  };
  const start = () => {
    if (!alive) return;
    if (!build()) { requestAnimationFrame(start); return; }
    // open on where you are
    let at = 0;
    if (you && you.top) at = TOP_H * 0.62;
    else if (you) { const sec = secOf(you.zone); at = sec ? sec.y + sec.H * 0.6 : 0; }
    centerOn(at);
    // paint what's in view now, the rest when the browser is idle
    S.ready = true;
    layoutRail();
    render(0);
    const queue = S.sections.slice().sort((a, b) => Math.abs(a.y - S.scroll) - Math.abs(b.y - S.scroll));
    const idle = () => { if (!alive) return; const s = queue.find((q) => !q.art); if (!s) return; paintSection(s); idleT = setTimeout(idle, 40); };
    idleT = setTimeout(idle, 120);
    raf = requestAnimationFrame(frame);
  };
  // rebuild on a real size change (rotating a phone, resizing the window)
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = 0, lastH = 0;
    ro = new ResizeObserver(() => {
      const w = view.clientWidth, hh = view.clientHeight;
      if (!S.ready || (Math.abs(w - lastW) < 2 && Math.abs(hh - lastH) < 2)) { lastW = w; lastH = hh; return; }
      lastW = w; lastH = hh;
      const frac = S.total ? (S.scroll + S.VH / 2) / S.total : 0;
      if (build()) { youSpot = null; S.scroll = S.target = clamp(frac * S.total - S.VH / 2, 0, maxScroll()); layoutRail(); }
    });
    ro.observe(view);
  }
  requestAnimationFrame(start);

  h.debug = {
    state: S, stops, exp, you: () => youSpot,
    scrollTo: (key) => { goTo(key); S.scroll = S.target; },
    dive: (z) => dive(nearestIn(z, null)),
    paintAll: () => { for (const s of S.sections) paintSection(s); },
  };
  return h;
}

/**
 * The layers from anywhere (the M key, the radar): view-only, unless you're standing at an
 * unlocked lift down in the mine (then its Dive buttons ride from it).
 */
export function openLayers(game) {
  const st = game.state;
  const sc = game.scene;
  let here = null, ride = null, you = null;
  if (game.sceneName === 'home') here = 'home';
  else if (game.sceneName === 'town') here = 'town';
  else if (game.sceneName === 'deep' && sc?.player?.pos) {
    const p = sc.player.pos;
    you = { x: p.x, d: -p.y };
    const L = sc.liftNear?.();
    if (L && liftUnlocked(st, L.id)) { here = L.id; ride = (id) => (sc.rideLift ? sc.rideLift(id) : rideTo(game, id)); }
  }
  return openLiftLayers(game, here, { title: 'The Layers', sub: ride ? 'Where to?' : 'Everything under the meadow, layer by layer.', you }, liftDestinations(st), ride, lockedLifts(st));
}
export default openLayers;
