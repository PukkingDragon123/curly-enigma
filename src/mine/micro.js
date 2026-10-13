// The mine's "micro" layer: every grid cell is M×M pixels of material that you chip
// away bit by bit. This module holds the per-pixel material table, the 16-color
// palettes, the procedural rock textures and the fracture-piece math.
import { B, BLOCKS, ORES } from './blocks.js';
import { mixHex, shade } from '../core/util.js';

export const M = 32; // micro pixels per cell
export const CPX = 256; // pixels per render chunk side (8 cells)
export const CCELLS = CPX / M;
export const APRON = 2; // extra pixels copied around each chunk texture (for edge shading)
export const ORE_BASE = 128; // ore pixels: ORE_BASE + ORES index
export const STAIN_BASE = 192; // tarnished host rock around a deposit: STAIN_BASE + ORES index (digs like rock)
export const isOre = (m) => m >= ORE_BASE && m < STAIN_BASE;
export const isStain = (m) => m >= STAIN_BASE && m < 255;

// det byte: low 4 bits = palette shade, high bits = surface flags
export const D_SHADE = 15;
export const D_CRUST = 16; // weathered surface: dusty, darker (the brush cleans it)
export const D_CRACK = 32; // fracture line of a damaged piece
export const D_GROWTH = 64; // moss / frost / ash / lichen on exposed surfaces
export const D_SCORCH = 128; // blackened by fire or blasts

// ---------------------------------------------------------------- hashing & noise
export function ih(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const INV = 1 / 4294967296;
export const hf = (x, y, s) => ih(x, y, s) * INV;

/** Smooth value noise in [0,1) with lattice spacing `sc` pixels. */
export function vn(x, y, sc, s) {
  const fx = x / sc, fy = y / sc;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hf(ix, iy, s), b = hf(ix + 1, iy, s), c = hf(ix, iy + 1, s), d = hf(ix + 1, iy + 1, s);
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}
// Tileable 256×256 value-noise tables: a texture lookup per sample instead of 4 hashes.
const TABLE_SCALES = [2, 4, 8, 16, 32, 64];
const TABLES = {};
for (const sc of TABLE_SCALES) {
  const L = 256 / sc;
  const lat = new Float32Array(L * L);
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) lat[j * L + i] = hf(i, j, sc * 977 + 13);
  const t = new Float32Array(65536);
  for (let y = 0; y < 256; y++) {
    const fy = y / sc, iy = Math.floor(fy);
    let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    const j0 = iy % L, j1 = (iy + 1) % L;
    for (let x = 0; x < 256; x++) {
      const fx = x / sc, ix = Math.floor(fx);
      let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
      const i0 = ix % L, i1 = (ix + 1) % L;
      const a = lat[j0 * L + i0], b = lat[j0 * L + i1], c = lat[j1 * L + i0], d = lat[j1 * L + i1];
      const top = a + (b - a) * tx, bot = c + (d - c) * tx;
      t[(y << 8) | x] = top + (bot - top) * ty;
    }
  }
  TABLES[sc] = t;
}
const SCALE_FOR = [];
for (let sc = 0; sc <= 80; sc++) SCALE_FOR[sc] = TABLES[sc <= 2 ? 2 : sc <= 5 ? 4 : sc <= 11 ? 8 : sc <= 20 ? 16 : sc <= 44 ? 32 : 64];
/** Fast tileable value noise in [0,1): nearest table scale to `sc`, offset by seed. */
export function tn(x, y, sc, s) {
  const t = SCALE_FOR[sc] || TABLES[64];
  return t[((((y | 0) + Math.imul(s, 151) + 37) & 255) << 8) | (((x | 0) + Math.imul(s, 73)) & 255)];
}
/** Thin wandering lines: true near the ridge of a noise field. */
const ridge = (x, y, sc, s, w) => Math.abs(tn(x, y, sc, s) - 0.5) < w;

// ---------------------------------------------------------------- material table
// piece: fracture lattice spacing in px (sx, sy); style: procedural texture.
const STYLE = {
  [B.DIRT]: ['soil', 7, 7], [B.LOAM]: ['loam', 7, 7], [B.CLAY]: ['clay', 10, 8], [B.SAND]: ['sand', 2, 2],
  [B.GRAVEL]: ['gravel', 4, 4], [B.STONE]: ['stone', 10, 9], [B.MUDSTONE]: ['mudstone', 16, 6], [B.GRANITE]: ['granite', 12, 11],
  [B.CRYSTALROCK]: ['crystal', 9, 11], [B.BASALT]: ['basalt', 9, 17], [B.OBSIDIAN]: ['obsidian', 8, 8], [B.MAGMAROCK]: ['magma', 10, 10],
  [B.ASH]: ['ash', 2, 2], [B.PERMAFROST]: ['permafrost', 10, 10], [B.ICE]: ['ice', 9, 9], [B.SNOW]: ['snow', 3, 3],
  [B.CORE]: ['core', 11, 11], [B.STARROCK]: ['star', 11, 11], [B.VOIDROCK]: ['void', 12, 12], [B.BEDROCK]: ['bedrock', 14, 14],
  [B.ROOTS]: ['roots', 6, 8], [B.QUAKE]: ['quake', 8, 8], [B.RUBBLE]: ['rubble', 5, 5], [B.TIMBER]: ['timber', 12, 10],
  [B.GEODE]: ['geode', 8, 8], [B.LIMESTONE]: ['limestone', 14, 8], [B.BOARDS]: ['boards', 10, 40],
};
// palette accents 10..15 per material (0..9 is a ramp built from the base color)
const ACC = {
  [B.DIRT]: [0x8a8078, 0xa89a8a, 0x3e2a1c, 0x8a5a32, 0xa8743e, 0xc8a070],
  [B.LOAM]: [0x6a5040, 0x7a6a5a, 0x2a1c12, 0x7a5030, 0x9a6a3a, 0xa88050],
  [B.CLAY]: [0xc88050, 0x9a5a2a, 0x8a4a28, 0xd8a070, 0x7a3a20, 0xe8b888],
  [B.SAND]: [0xb89858, 0xe8d098, 0x9a8a6a, 0xf0e0b0, 0xc8a060, 0xfff0c8],
  [B.GRAVEL]: [0x6a6460, 0xa8a4a0, 0x5a4a3a, 0xb8b0a8, 0x3a3634, 0xd0ccc8],
  [B.STONE]: [0x625c58, 0xa09a96, 0x524c48, 0xb4aea8, 0x7a8088, 0xd0ccc8],
  [B.LIMESTONE]: [0xb0a488, 0xe0d4b8, 0x9a8e74, 0xf0e8d0, 0x8a7a60, 0xfff8e8],
  [B.MUDSTONE]: [0x5a4838, 0x8a7260, 0x4a3a2c, 0x9a8270, 0x6a5242, 0xb09a88],
  [B.GRANITE]: [0xc89a8a, 0xe0b0a0, 0x2a2428, 0xe8e0e0, 0x5a4a4a, 0xffffff],
  [B.CRYSTALROCK]: [0x8a8ac8, 0xc8c8ff, 0xe8e8ff, 0x3a3a5a, 0x6a6aa0, 0xffffff],
  [B.BASALT]: [0x24242a, 0x5a5a60, 0x16161c, 0x6a6a72, 0x4a4048, 0x8a8a92],
  [B.OBSIDIAN]: [0x3a2a4a, 0x6a5a8a, 0x0e0a14, 0x9a8ac0, 0x2a1e38, 0xd0c8f0],
  [B.MAGMAROCK]: [0xd9582a, 0xff8a3a, 0xffc060, 0x2a100c, 0x5a2a1a, 0x7a3a2a],
  [B.ASH]: [0x5a5450, 0x8a8480, 0x3a3430, 0xff7a2a, 0x9a948e, 0xb0aaa4],
  [B.PERMAFROST]: [0xd8f0ff, 0x6a8a9a, 0x4a6a7a, 0xffffff, 0x7aa0b8, 0xe8f8ff],
  [B.ICE]: [0xe0f8ff, 0x6ac0e0, 0x4aa0c8, 0xffffff, 0xb8eaf8, 0xffffff],
  [B.SNOW]: [0xc8d8f0, 0xffffff, 0xb0c4e0, 0xd8e8ff, 0xa0b4d0, 0xffffff],
  [B.CORE]: [0x5a3a7a, 0xc89aff, 0xe8d0ff, 0x1a0e28, 0x3a2a50, 0x7a5aa0],
  [B.STARROCK]: [0x3a3a6a, 0xffe08a, 0xffffff, 0x0e0e24, 0x2a2a50, 0x6a6aa0],
  [B.VOIDROCK]: [0x2a1440, 0x6a3ab0, 0x080410, 0x3a2060, 0x1a0c28, 0x9a6ae0],
  [B.BEDROCK]: [0x2a2428, 0x0e0a0c, 0x3a3438, 0x241e22, 0x120e10, 0x4a4448],
  [B.ROOTS]: [0x5a3820, 0x9a6a40, 0x3a2414, 0xb8844a, 0x4a3020, 0xd0a060],
  [B.QUAKE]: [0x6a3a2a, 0xb06a5a, 0x3a1a14, 0xc88a7a, 0x9a5a48, 0xe0a898],
  [B.RUBBLE]: [0x5a524c, 0x9a908a, 0x3a3430, 0xb0a8a0, 0x6a5a48, 0xc8c0b8],
  [B.TIMBER]: [0x6a4224, 0xa87240, 0x4a2c18, 0x8a8f96, 0xc8c8d0, 0xc89a5a],
  [B.GEODE]: [0xc89aff, 0xe8d8ff, 0x5a4a6a, 0x9a8aaa, 0x4a3a5a, 0xffffff],
  [B.BOARDS]: [0x7a4e2a, 0xb88450, 0x5a3a1e, 0x6a6e74, 0xb0b4b8, 0xd8aa6a],
};
const GLOWS = {
  [B.CRYSTALROCK]: { 11: 0.3, 12: 0.5, 15: 0.6 },
  [B.MAGMAROCK]: { 10: 0.75, 11: 1, 12: 1 },
  [B.ASH]: { 13: 0.9 },
  [B.SNOW]: { 15: 0.25 },
  [B.CORE]: { 11: 0.7, 12: 0.9 },
  [B.STARROCK]: { 11: 0.9, 12: 1 },
  [B.VOIDROCK]: { 11: 0.4, 15: 0.6 },
  [B.GEODE]: { 10: 0.35, 11: 0.5, 15: 0.6 },
};

/** Ramp of 10 shades with hue-shifted shadows (cool) and highlights (warm). */
function ramp10(base) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const f = 0.52 + i * 0.083;
    let c = shade(base, f);
    if (f < 1) c = mixHex(c, 0x241830, (1 - f) * 0.34);
    else c = mixHex(c, 0xfff0c8, (f - 1) * 0.42);
    out.push(c);
  }
  return out;
}

/** MAT[m]: per pixel-material info for every id 0..255. */
export const MAT = [];
for (let m = 0; m < 256; m++) MAT.push({ id: m, solid: false, gran: false, ore: false, hp: 0, tier: 0, snd: 'stone', sx: 8, sy: 8, style: null, pal: new Array(16).fill(0xff00ff), glow: new Array(16).fill(0) });
for (const b of BLOCKS) {
  if (!b || !b.id) continue;
  const st = STYLE[b.id] || ['stone', 9, 9];
  const mt = MAT[b.id];
  Object.assign(mt, { solid: b.phys !== 'none', gran: b.phys === 'granular', hp: b.hp, tier: b.tier, snd: b.snd, style: st[0], sx: st[1], sy: st[2], name: b.name, dust: b.dust, block: b });
  mt.pal = [...ramp10(b.color), ...(ACC[b.id] || [0x888888, 0xaaaaaa, 0x444444, 0xcccccc, 0x666666, 0xffffff])];
  mt.glow = new Array(16).fill(0);
  for (const [k, v] of Object.entries(GLOWS[b.id] || {})) mt.glow[+k] = v;
}
export const isSolidPx = (m) => m !== 0;
export const GRAN = new Uint8Array(256);
for (let m = 0; m < 256; m++) GRAN[m] = MAT[m].gran ? 1 : 0;
const STYLES = ['soil', 'loam', 'clay', 'sand', 'gravel', 'rubble', 'stone', 'limestone', 'mudstone', 'granite', 'crystal', 'basalt', 'obsidian', 'magma', 'ash', 'permafrost', 'ice', 'snow', 'core', 'star', 'void', 'bedrock', 'roots', 'quake', 'timber', 'boards', 'geode'];
const SID = new Uint8Array(256);
for (let m = 0; m < 256; m++) SID[m] = STYLES.indexOf(MAT[m].style) + 1;

/** Register the palette of an ore type (called by the generator once per ore). */
export function setOrePalette(oreId, pal, glow) {
  const o = ORES[oreId];
  const mt = MAT[ORE_BASE + oreId];
  Object.assign(mt, { solid: true, gran: false, ore: true, oreId, hp: 3, tier: o.tier || 0, snd: 'crystal', sx: 6, sy: 6, style: 'ore', name: o.item });
  // stained rock shares the palette but behaves like ordinary rock
  const st = MAT[STAIN_BASE + oreId];
  Object.assign(st, { solid: true, gran: false, ore: false, oreId, hp: 2.4, tier: 0, snd: 'stone', sx: 6, sy: 6, style: 'stain', name: 'Stained Rock', dust: 0x9a9088 });
  for (let i = 0; i < 16; i++) {
    mt.pal[i] = st.pal[i] = pal[i] ?? pal[pal.length - 1] ?? 0xaaaaaa;
    mt.glow[i] = st.glow[i] = glow ? glow[i] || 0 : 0;
  }
}

/** CPU color of a pixel (for debris chunks). */
export function pixelColor(m, d) {
  const mt = MAT[m];
  let c = mt.pal[d & D_SHADE];
  if (d & D_CRACK) c = shade(c, 0.55);
  else if (d & D_CRUST) c = shade(c, 0.86);
  return c;
}

// ---------------------------------------------------------------- procedural rock textures
// Rock is drawn as shaded plates: every plate is one fracture piece (pieceId uses the same
// lattice), lit from the upper left, separated by dark seams. Soils are clumpy with shaded
// pebbles and fine roots. Returns a palette shade 0..15 for material m at pixel (x, y).

// Voronoi over a material's lattice, cached per lattice cell (neighboring pixels share it).
const VC = new Array(256).fill(null);
function voro(m, x, y) {
  const mt = MAT[m];
  const sx = mt.sx, sy = mt.sy;
  const fx = x / sx, fy = y / sy;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let c = VC[m];
  if (!c) VC[m] = c = { ix: 1e9, iy: 1e9, px: new Float64Array(9), py: new Float64Array(9), cx: new Int32Array(9), cy: new Int32Array(9) };
  if (c.ix !== ix || c.iy !== iy) {
    c.ix = ix; c.iy = iy;
    let k = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++, k++) {
      const gx = ix + ox, gy = iy + oy;
      const h = ih(gx, gy, m * 31 + 7);
      c.px[k] = gx + 0.15 + (h & 1023) / 1023 * 0.7;
      c.py[k] = gy + 0.15 + ((h >>> 10) & 1023) / 1023 * 0.7;
      c.cx[k] = gx; c.cy[k] = gy;
    }
  }
  let d1 = 1e9, d2 = 1e9, b = 0;
  for (let k = 0; k < 9; k++) {
    const dx = (fx - c.px[k]) * sx, dy = (fy - c.py[k]) * sy;
    const d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; b = k; } else if (d < d2) d2 = d;
  }
  R.edge = (Math.sqrt(d2) - Math.sqrt(d1)) * 0.5; // ≈ pixels to the seam
  R.ox = (fx - c.px[b]) * sx; R.oy = (fy - c.py[b]) * sy; // pixel offset from the plate's center
  R.id = ih(c.cx[b], c.cy[b], m * 31 + 7);
  return R;
}
const R = { edge: 0, ox: 0, oy: 0, id: 0 };

/**
 * Shaded plate. gap: seam half-width (px); base: [lo, hi] ramp range for plate tones;
 * seam: shade for seams.
 */
function plate(m, x, y, s, gap, lo, hi, seam) {
  const v = voro(m, x, y);
  if (v.edge < gap) return seam;
  let t = lo + (v.id % (hi - lo + 1));
  // rim light on the upper-left edge of each plate, shadow on the lower right
  if (v.edge < gap + 2.2) {
    const dir = v.ox + v.oy;
    if (dir < -0.8) t += v.edge < gap + 1.1 ? 2 : 1;
    else if (dir > 0.8) t -= v.edge < gap + 1.1 ? 2 : 1;
  }
  // soft grain inside the plate
  const n = tn(x, y, 4, s);
  if (n > 0.74) t += 1; else if (n < 0.2) t -= 1;
  return t < 0 ? 0 : t > 9 ? 9 : t;
}

export function texel(m, x, y, s) {
  switch (SID[m]) {
    case 1: /* soil */ return soil(x, y, s, 46, 0.3);
    case 2: /* loam */ return soil(x, y, s, 30, 0.75);
    case 3: /* clay */ {
      const n = tn(x, y, 32, s);
      let sh = 3 + Math.floor((Math.sin(y * 0.15 + n * 6) * 0.5 + 0.5) * 2.6 + tn(x, y, 8, s + 1) * 1.6);
      if (Math.abs(Math.sin(y * 0.15 + n * 6) - 0.95) < 0.02) sh = 13;
      const h = ih(x, y, s) & 127;
      if (h < 2) sh = 11; else if (h < 4) sh = 12;
      return pebble(x, y, s, 11, 22, sh, 10, 13, 12);
    }
    case 4: /* sand */ {
      let sh = 5 + ((ih(x, y, s) & 7) < 3 ? 1 : 0) - ((ih(x, y, s + 3) & 15) < 2 ? 1 : 0);
      if (Math.sin(x * 0.31 + y * 0.66 + tn(x, y, 32, s) * 5) > 0.72) sh += 1;
      const h = ih(x, y, s + 9) & 255;
      if (h < 3) sh = 10; else if (h < 5) sh = 13; else if (h < 6) sh = 12;
      return sh;
    }
    case 5: /* gravel */ return plate(m, x, y, s, 0.7, 3, 8, 14) === 14 ? 14 : pebbleTone(m, x, y);
    case 6: /* rubble */ return plate(m, x, y, s, 0.75, 2, 7, 12);
    case 7: /* stone */ {
      const t = plate(m, x, y, s, 0.62, 3, 6, 10);
      if (t === 10) return 10;
      const h = ih(x, y, s) & 255;
      return h < 4 ? 12 : h < 8 ? 13 : t;
    }
    case 8: /* limestone */ {
      const t = plate(m, x, y, s, 0.6, 4, 7, 10);
      if (t === 10) return 10;
      const gx = Math.floor(x / 26), gy = Math.floor(y / 26), h = ih(gx, gy, s + 4);
      if ((h & 255) < 34) {
        const cx = gx * 26 + 6 + ((h >>> 8) & 15), cy = gy * 26 + 6 + ((h >>> 12) & 15);
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 < 11.6 && d2 > 2.9) return dx + dy < 0 ? 15 : 13;
        if (d2 <= 2.9 && d2 > 0.4) return 12;
      }
      return t;
    }
    case 9: /* mudstone */ {
      const t = plate(m, x, y, s, 0.55, 3, 6, 12);
      if (t === 12) return 12;
      return ((y + Math.floor(tn(x, y, 32, s) * 5)) % 4 === 0) ? Math.max(0, t - 1) : t;
    }
    case 10: /* granite */ {
      const t = plate(m, x, y, s, 0.6, 3, 6, 14);
      if (t === 14) return 14;
      const h = ih(x >> 1, y >> 1, s) & 255;
      if (h < 22) return 12;
      if (h < 40) return (h & 1) ? 10 : 11;
      if (h < 52) return 13;
      return t;
    }
    case 11: /* crystal */ {
      const t = plate(m, x, y, s, 0.6, 2, 5, 13);
      if (t === 13) return 13;
      const gx = Math.floor(x / 11), gy = Math.floor(y / 11), h = ih(gx, gy, s + 3);
      if ((h & 255) < 60) {
        const cx = gx * 11 + 3 + ((h >>> 8) & 3) + 0.5, cy = gy * 11 + 3 + ((h >>> 11) & 3) + 0.5;
        const dx = x - cx, dy = y - cy, r = 1.6 + ((h >>> 14) & 3) * 0.5;
        if (Math.abs(dx) * 1.3 + Math.abs(dy) * 0.8 < r) return dy < -r * 0.5 && Math.abs(dx) < 0.6 ? 15 : dy < -r * 0.3 ? 12 : dx < 0 ? 11 : 10;
      }
      return t;
    }
    case 12: /* basalt */ {
      const t = plate(m, x, y, s, 0.7, 2, 5, 10);
      return t !== 10 && (ih(x, y, s) & 255) < 5 ? 12 : t;
    }
    case 13: /* obsidian */ {
      const v = voro(m, x, y);
      if (v.edge < 0.5) return 12;
      let t = 2 + (v.id % 3);
      const st = v.ox - v.oy * 0.6;
      if (st > -1.2 && st < 0.2 && v.oy < 0) t = 11;
      if (st > -0.6 && st < -0.2 && v.oy < -1) t = 13;
      if (v.edge < 1.6 && v.ox + v.oy < 0) t = Math.max(t, 4);
      return t;
    }
    case 14: /* magma */ {
      const v = voro(m, x, y);
      if (v.edge < 0.55) return 12;
      if (v.edge < 1.2) return 11;
      if (v.edge < 1.8) return (ih(x, y, s) & 1) ? 10 : 13;
      let t = 2 + (v.id % 3);
      if (v.edge < 3 && v.ox + v.oy < 0) t += 2;
      return t;
    }
    case 15: /* ash */ {
      let sh = 4 + ((ih(x, y, s) & 3) === 0 ? 1 : 0) + Math.floor(tn(x, y, 8, s + 1) * 2.4) - 1;
      if ((ih(x, y, s + 4) & 511) === 0) sh = 13;
      return pebble(x, y, s, 13, 14, sh, 10, 14, 12);
    }
    case 16: /* permafrost */ {
      const t = plate(m, x, y, s, 0.55, 3, 6, 11);
      if (t === 11) return 11;
      const gx = x >> 3, gy = y >> 3, h = ih(gx, gy, s + 3);
      if ((h & 255) < 70) { const dx = x - (gx * 8 + 2 + (h >>> 8 & 3)), dy = y - (gy * 8 + 2 + (h >>> 10 & 3)); if (dx * dx + dy * dy < 1.6) return dx + dy < 0 ? 13 : 10; }
      return t;
    }
    case 17: /* ice */ {
      const v = voro(m, x, y);
      if (v.edge < 0.5) return 10;
      let t = 4 + (v.id % 3);
      if (v.edge < 2 && v.ox + v.oy < 0) t += 2;
      if (v.edge < 2 && v.ox + v.oy > 0) t -= 1;
      if ((ih(x, y, s) & 255) < 3) t = 13;
      return t;
    }
    case 18: /* snow */ {
      let sh = 5 + ((ih(x, y, s) & 7) < 2 ? 1 : 0) + ((ih(x, y, s + 2) & 7) < 1 ? -1 : 0) + Math.floor(tn(x, y, 16, s + 3) * 2);
      if ((ih(x, y, s + 1) & 255) < 2) sh = 15;
      return sh;
    }
    case 19: /* core */ {
      const v = voro(m, x, y);
      const hot = (v.id & 7) < 2; // only some seams carry the core's glow
      if (v.edge < 0.55) return hot ? 12 : 13;
      if (v.edge < 1.1 && hot) return 11;
      let t = 2 + (v.id % 3);
      if (v.edge < 2.6 && v.ox + v.oy < 0) t += 2;
      else if (v.edge < 1.8 && v.ox + v.oy > 0) t -= 1;
      return t;
    }
    case 20: /* star */ {
      const t = plate(m, x, y, s, 0.6, 2, 4, 13);
      const h = ih(x, y, s + 1) % 900;
      return h < 2 ? 12 : h < 9 ? 11 : t;
    }
    case 21: /* void */ {
      const v = voro(m, x, y);
      if (v.edge < 0.55) return (ih(v.id, 3, s) & 3) === 0 ? 11 : 12;
      let t = 1 + (v.id % 2);
      if (v.edge < 2 && v.ox + v.oy < 0) t += 2;
      if ((ih(x, y, s + 1) % 1400) === 0) t = 15;
      return t;
    }
    case 22: /* bedrock */ return plate(m, x, y, s, 0.8, 1, 4, 11);
    case 23: /* roots */ {
      const st = strands(x, y, s, 6, 0.12);
      if (st) return st;
      const st2 = strands(y, x, s + 9, 9, 0.07);
      if (st2) return st2 === 13 ? 11 : 10;
      return 1 + Math.floor(tn(x, y, 4, s + 3) * 3);
    }
    case 24: /* quake */ {
      const t = plate(m, x, y, s, 0.95, 3, 6, 12);
      if (t === 12) return 12;
      const r = Math.abs(tn(x, y, 16, s + 1) - 0.5);
      return r < 0.02 ? 12 : r < 0.035 ? 10 : t;
    }
    case 25: /* timber */ {
      const plank = Math.floor(y / 10);
      if (y % 10 === 0) return 12;
      const g = Math.sin(x * 0.45 + plank * 3.1 + tn(x, y, 16, s) * 3);
      let sh = g > 0.8 ? 10 : g < -0.85 ? 11 : 5 + (ih(plank, 0, s) & 1);
      if (y % 10 === 1) sh = 7;
      const nx = x % 48;
      if ((nx === 3 || nx === 44) && (y % 10 === 4 || y % 10 === 6)) sh = 13;
      return sh;
    }
    case 26: /* boards */ {
      const plank = Math.floor(x / 10);
      if (x % 10 === 0) return 12;
      const g = Math.sin(y * 0.4 + plank * 2.3 + tn(x, y, 16, s) * 3);
      let sh = g > 0.82 ? 10 : g < -0.88 ? 11 : 5 + (ih(plank, 1, s) & 1) * 2;
      if (x % 10 === 1) sh = Math.min(9, sh + 2);
      const ny = y % 64;
      if ((ny === 6 || ny === 7) && x % 10 === 5) sh = 14;
      if ((ih(plank, Math.floor(y / 30), s + 3) & 7) === 0 && Math.hypot((x % 10) - 5, (y % 30) - 15) < 2) sh = 12;
      return sh;
    }
    case 27: /* geode */ return plate(m, x, y, s, 0.6, 3, 6, 12);
    default: return 4 + (ih(x, y, s) & 3);
  }
}

/** Pebble tones for gravel plates: varied stones. */
function pebbleTone(m, x, y) {
  const v = R;
  const pick = v.id % 6;
  let t = [3, 5, 7, 10, 11, 13][pick];
  if (v.edge < 1.4 && v.ox + v.oy < 0) t = t >= 10 ? 15 : Math.min(9, t + 2);
  else if (v.edge < 1.4 && v.ox + v.oy > 0) t = t >= 10 ? 12 : Math.max(0, t - 2);
  return t;
}

/** Clumpy soil with shaded pebbles and fine roots. */
function soil(x, y, s, pebbleP, rootAmt) {
  const n = tn(x, y, 16, s) * 0.55 + tn(x, y, 4, s + 1) * 0.45;
  let sh = 2 + Math.floor(n * 5.2);
  const h = ih(x, y, s + 2) & 63;
  if (h < 3) sh = Math.max(0, sh - 2); else if (h < 5) sh = Math.min(9, sh + 1);
  sh = pebble(x, y, s, 9, pebbleP, sh, 10, 11, 12);
  if (sh < 10) {
    const st = strands(x, y, s + 5, 17, 0.06 * rootAmt);
    if (st) return st;
  }
  return sh;
}

/** A shaded pebble on a jittered grid: lit rim top-left, shadow bottom-right. */
function pebble(x, y, s, G, p, base, c1, c2, dark) {
  const gx = Math.floor(x / G), gy = Math.floor(y / G), h = ih(gx, gy, s + 7);
  if ((h & 255) >= p) return base;
  const r = 1.3 + ((h >>> 12) & 3) * 0.5;
  const cx = gx * G + 2 + r + ((h >>> 8) & 3) * ((G - 4 - 2 * r) / 3), cy = gy * G + 2 + r + ((h >>> 10) & 3) * ((G - 4 - 2 * r) / 3);
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
  const d = dx * dx + dy * dy * 1.35;
  if (d > r * r) {
    // contact shadow under the pebble
    return dy > 0 && d < (r + 1) * (r + 1) && dx > -r * 0.4 ? Math.max(0, base - 1) : base;
  }
  if (dx + dy < -r * 0.75) return 15;
  if (dx + dy > r * 0.55) return dark;
  return (h >>> 16) & 1 ? c1 : c2;
}

/** Thin wavy strands (roots): 13 = root body, 14 = lit edge, 0 = none. */
function strands(x, y, s, spacing, density) {
  const wob = tn(x, y, 32, s) * spacing * 2.2 + tn(x, y, 8, s + 1) * 3;
  const f = (x + wob) / spacing;
  const fr = f - Math.floor(f);
  if (fr > 1 / spacing + 0.02) return 0;
  if (tn(x, y, 16, s + 2) > density * 4 + 0.08) return 0;
  return fr < 0.5 / spacing ? 14 : 13;
}

// ---------------------------------------------------------------- fracture pieces
/**
 * Voronoi fracture id of pixel (x, y) for material m: pixels sharing an id break off
 * together as one chunk. Returns [seedX, seedY] packed as a number.
 */
export function pieceId(m, x, y) {
  const mt = MAT[m];
  const sx = mt.sx, sy = mt.sy;
  const fx = x / sx, fy = y / sy;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let best = 1e9, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox, cy = iy + oy;
      const h = ih(cx, cy, m * 31 + 7);
      const px = cx + 0.15 + (h & 1023) / 1023 * 0.7, py = cy + 0.15 + ((h >>> 10) & 1023) / 1023 * 0.7;
      const dx = (fx - px) * sx, dy = (fy - py) * sy;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = cx; by = cy; }
    }
  return (bx + 32768) * 65536 + (by + 32768);
}
