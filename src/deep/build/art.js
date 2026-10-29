// Item icons for the building part (32×32 pixel art, drawn into gfx/PixelArt's PixelCanvas):
//   { k: 'block', b }       blocks as little isometric cubes with the same patterns as in the
//                           mine (cobble, bricks, planks, logs, glass, dirt…), and the odd ones
//                           drawn as themselves (ladder, torch, lantern, door, chest, workbench,
//                           sticks, sand, clay, vine)
//   { k: 'btool', t, c }    axes, spades and shears (c: the metal)
// PixelArt.drawIconArt calls drawBuildIcon(pc, spec) → true when it drew something.
import { selout } from '../../gfx/px/shade.js';
import { MAT } from '../materials.js';
import { BM } from './mats.js';

const hh = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const dk = (c, k) => mix(c, 0x000000, k), lt = (c, k) => mix(c, 0xffffff, k);

// ------------------------------------------------------------------ face patterns (u, v in 0..1, v up)
// each returns a tone 0..3 or 'a' (accent) or null (see-through)
const PAT = {
  cobble(u, v) {
    // jittered cells 4×4
    const p = [u * 4, v * 4], g = [Math.floor(p[0]), Math.floor(p[1])];
    let f1 = 9, f2 = 9, id = 0, oy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = g[0] + i, cy = g[1] + j, h = hh((cx + 8) % 4, (cy + 8) % 4, 3);
      const fx = cx + 0.5 + (h - 0.5) * 0.7, fy = cy + 0.5 + (hh(cx, cy, 9) - 0.5) * 0.7;
      const d = Math.hypot(p[0] - fx, p[1] - fy);
      if (d < f1) { f2 = f1; f1 = d; id = h; oy = p[1] - fy; } else if (d < f2) f2 = d;
    }
    if (f2 - f1 < 0.16) return 'a';
    return Math.max(0, Math.min(3, Math.round(0.8 + id * 1.8 + oy * 1.2)));
  },
  stonebrick(u, v) {
    const y = v * 16, row = Math.floor(y / 8), x = u * 16 + (row % 2) * 4;
    const bx = x % 8, by = y % 8;
    if (bx < 0.9 || by < 0.9) return 'a';
    if (by > 7) return 1;
    if (by < 1.9 || bx < 1.9) return 3;
    return 2 - (hh(Math.floor(x / 8), row, 4) > 0.6 ? 1 : 0);
  },
  bricks(u, v) {
    const y = v * 16, row = Math.floor(y / 4), x = u * 16 + (row % 2) * 4;
    const bx = x % 8, by = y % 4;
    if (bx < 0.9 || by < 0.9) return 'a';
    const h = hh(Math.floor(x / 8), row, 7);
    return by > 3 ? 1 : h < 0.15 ? 0 : h > 0.7 ? 3 : 2;
  },
  planks(u, v) {
    const y = v * 16, b = Math.floor(y / 4), by = y % 4, x = u * 16 + b * 5;
    if (by < 0.9 || x % 16 < 0.9) return 'a';
    return by > 3 ? 1 : Math.max(1, Math.min(3, 2 + Math.round(Math.sin(x * 0.9 + b * 7) * 0.6)));
  },
  logSide(u, v) {
    const g = Math.floor(u * 16 / 3), gx = (u * 16) % 3;
    if (gx < 0.9) return 0;
    return hh(g, Math.floor(v * 4 + hh(g, 1) * 2), 5) > 0.5 ? 2 : 1;
  },
  logEnd(u, v) {
    const r = Math.hypot(u - 0.5, v - 0.5) * 16;
    if (r > 6.8) return 1;
    if (r > 6.1) return 2;
    return Math.floor(r / 1.6) % 2 ? 2 : 3;
  },
  glass(u, v) {
    const e = Math.min(u, v, 1 - u, 1 - v) * 16;
    if (e < 1) return 3;
    if (Math.abs(u + v - 1.25) < 0.06 && u > 0.3 && u < 0.85) return 3;
    if (Math.abs(u + v - 0.7) < 0.05 && u > 0.15 && u < 0.45) return 3;
    return null;
  },
  dirt(u, v) {
    const h = hh(Math.floor(u * 16), Math.floor(v * 16), 2);
    return h > 0.93 ? 'a' : h < 0.12 ? 0 : h < 0.5 ? 1 : h < 0.85 ? 2 : 3;
  },
  bench(u, v) { // the top
    if (u > 0.1 && u < 0.36 && v > 0.62 && v < 0.88) return 'a';
    if (v > 0.18 && v < 0.24 && u > 0.2 && u < 0.85) return 3;
    return PAT.planks(u, v);
  },
};

/**
 * An isometric cube: top (lit), left (mid), right (shaded). pal: 4 tones + accent. pats: [top, left, right].
 * x0, y0: top corner; w: half width (px). see-through pixels (null) show the far faces behind.
 */
function isoCube(pc, pal, acc, pats, o = {}) {
  const cx = o.cx ?? 16, top = o.top ?? 3, w = o.w ?? 13, hgt = o.h ?? 14, q = w / 2;
  const tone = (t, shade) => (t === 'a' ? (shade ? dk(acc, shade * 0.5) : acc) : dk(pal[Math.max(0, Math.min(3, t))], shade));
  const glass = o.glass;
  // left and right faces
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - cx;
    let face = -1, u = 0, v = 0;
    // top rhombus: centre at (cx, top + q)
    const ty = y + 0.5 - (top + q);
    if (Math.abs(dx) / w + Math.abs(ty) / q <= 1) {
      face = 0;
      // diamond → square (u along the right-down edge, v along the left-down edge)
      const a = (dx / w + ty / q) * 0.5 + 0.5, b = (-dx / w + ty / q) * 0.5 + 0.5;
      u = a; v = 1 - b;
    } else {
      const yy = y + 0.5 - top - q; // below the top's middle line
      if (dx < 0 && dx > -w) {
        const yTop = q * (1 + dx / w); // the top rhombus' lower-left edge at this x (relative to its middle line)
        const yy2 = yy - yTop;
        if (yy2 >= 0 && yy2 <= hgt) { face = 1; u = (dx + w) / w; v = 1 - yy2 / hgt; }
      } else if (dx >= 0 && dx < w) {
        const yTop = q * (1 - dx / w);
        const yy2 = yy - yTop;
        if (yy2 >= 0 && yy2 <= hgt) { face = 2; u = dx / w; v = 1 - yy2 / hgt; }
      }
    }
    if (face < 0) continue;
    const t = pats[face](Math.min(0.999, Math.max(0, u)), Math.min(0.999, Math.max(0, v)));
    if (t === null) {
      if (glass) pc.set(x, y, face === 0 ? 0xdff2f4 : face === 1 ? 0xa8ccd4 : 0x86aab4, face === 0 ? 70 : 95);
      continue;
    }
    pc.set(x, y, tone(t, face === 0 ? 0 : face === 1 ? 0.18 : 0.38));
  }
}

function blockCube(pc, m, pats, o) {
  const d = MAT[m];
  isoCube(pc, d.tones, d.accent, pats, o);
}

// ------------------------------------------------------------------ the odd ones
function ladder(pc) {
  const W = [0x5e3a1c, 0x74482a, 0x8a5a34, 0xa06c40];
  for (let y = 3; y < 30; y++) { pc.set(9, y, W[1]); pc.set(10, y, W[2]); pc.set(21, y, W[1]); pc.set(22, y, W[2]); }
  for (let r = 0; r < 5; r++) { const y = 6 + r * 5; for (let x = 11; x < 21; x++) { pc.set(x, y, W[2]); pc.set(x, y + 1, W[0]); } }
  pc.set(10, 3, W[3]); pc.set(22, 3, W[3]);
}
function torch(pc) {
  for (let y = 12; y < 29; y++) { pc.set(15, y, 0x74482a); pc.set(16, y, 0x8a5a34); }
  for (let y = 10; y < 13; y++) for (let x = 14; x < 18; x++) pc.set(x, y, 0x2a1c14);
  const fl = [[15, 9, 0xffb030], [16, 9, 0xffd060], [14, 8, 0xff8a20], [15, 8, 0xffe080], [16, 8, 0xffd060], [17, 8, 0xff9a30], [15, 7, 0xfff0b0], [16, 7, 0xffe080], [15, 6, 0xffd060], [16, 5, 0xffe8a0], [15, 4, 0xfff4d0]];
  for (const [x, y, c] of fl) pc.lit(x, y, c, 1);
}
function lantern(pc) {
  const I = [0x1e1a1a, 0x2e2a2a, 0x46403e, 0x6a625e];
  for (let y = 2; y < 6; y++) pc.set(16, y, y & 1 ? I[1] : I[3]);
  for (let x = 13; x < 20; x++) pc.set(x, 6, I[2]);
  for (let x = 10; x < 23; x++) { pc.set(x, 8, I[2]); pc.set(x, 9, I[1]); pc.set(x, 25, I[1]); pc.set(x, 26, I[0]); }
  for (let y = 10; y < 25; y++) {
    pc.set(10, y, I[2]); pc.set(11, y, I[1]); pc.set(21, y, I[1]); pc.set(22, y, I[0]); pc.set(16, y, I[1]);
    for (let x = 12; x < 21; x++) if (x !== 16) pc.lit(x, y, y < 14 ? 0xffe8a0 : y < 20 ? 0xffc860 : 0xffa840, 0.9);
  }
  for (let y = 14; y < 21; y++) for (let x = 14; x < 19; x++) if (x !== 16) pc.lit(x, y, 0xfff4d0, 1);
}
function door(pc) {
  const W = [0x5e3a1e, 0x744828, 0x8a5832, 0x9e6a3e];
  for (let y = 2; y < 30; y++) for (let x = 9; x < 23; x++) {
    const bw = (x - 9) % 4;
    let c = bw === 0 ? W[0] : W[1 + ((x >> 2) + (y >> 3)) % 3];
    if ((y >= 6 && y < 9) || (y >= 22 && y < 25)) c = y === 6 || y === 22 ? W[3] : W[2];
    pc.set(x, y, c);
  }
  for (let y = 5; y < 10; y++) pc.set(9, y, 0x2a2220);
  for (let y = 21; y < 26; y++) pc.set(9, y, 0x2a2220);
  pc.set(20, 16, 0xd8b050); pc.set(20, 17, 0x8a6a20);
}
function sticks(pc) {
  const W = [0x5a3a1e, 0x8a5a34, 0xa87444];
  for (let k = 0; k < 18; k++) { pc.set(7 + k, 24 - k, W[1]); pc.set(8 + k, 24 - k, W[2]); pc.set(7 + k, 25 - k, W[0]); }
  for (let k = 0; k < 16; k++) { pc.set(9 + k, 9 + k * 0.7, W[1]); pc.set(9 + k, 10 + k * 0.7, W[0]); }
}
function pile(pc, tones, acc) {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = (x + 0.5 - 16) / 12, dy = (y + 0.5 - 24) / 9;
    if (dy > 0.55 || dx * dx + dy * dy > 1) continue;
    const h = hh(x, y, 4), t = Math.max(0, Math.min(3, Math.round(2.2 - dy * 1.6 + (h - 0.5) * 1.4)));
    pc.set(x, y, h > 0.95 ? acc : tones[t]);
  }
}
function vine(pc) {
  const G = [0x1e4224, 0x2a5a30, 0x367240, 0x8ae09a];
  for (let y = 2; y < 30; y++) { const x = 16 + Math.round(Math.sin(y * 0.45) * 3); pc.set(x, y, G[1]); pc.set(x + 1, y, G[0]); if (y % 5 === 2) { pc.set(x - 2, y, G[2]); pc.set(x - 1, y, G[2]); pc.set(x - 2, y - 1, G[3]); pc.set(x + 3, y + 2, G[2]); pc.set(x + 2, y + 2, G[2]); } }
}
function chest(pc) {
  const d = MAT[BM.B_CHEST];
  const P = (u, v) => { const t = PAT.planks(u, v); return t === 'a' ? 0 : t; };
  const band = (f) => (u, v) => (u < 0.1 || u > 0.9 || v > 0.92 ? 'i' : f === 1 && Math.abs(v - 0.62) < 0.05 ? 0 : f === 1 && Math.abs(u - 0.5) < 0.08 && v > 0.42 && v < 0.62 ? 'a' : P(u, v));
  const pal = d.tones;
  isoCube(pc, pal, d.accent, [(u, v) => (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92 ? 'i' : P(u, v)), band(1), band(2)].map((f) => (u, v) => { const t = f(u, v); return t === 'i' ? 0 : t; }), { top: 6, w: 12, h: 13 });
}
function bench(pc) {
  const d = MAT[BM.B_BENCH];
  // the top slab and four legs
  isoCube(pc, d.tones, d.accent, [PAT.bench, (u, v) => (v > 0.7 ? PAT.planks(u, v * 2) : u < 0.16 || u > 0.84 ? 1 : null), (u, v) => (v > 0.7 ? PAT.planks(u, v * 2) : u < 0.16 || u > 0.84 ? 0 : null)], { top: 3, w: 13, h: 14 });
}

// ------------------------------------------------------------------ tools
function axe(pc, c) {
  const W = [0x5a3a1e, 0x74482a, 0x8a5a34];
  for (let k = 0; k < 22; k++) { const x = 6 + k, y = 28 - k; pc.set(x, y, W[1]); pc.set(x + 1, y, W[2]); if (k < 6) pc.set(x, y, 0x3a2414); }
  const lo = dk(c, 0.35), hi = lt(c, 0.4), edge = lt(c, 0.7);
  const blade = [[17, 4], [16, 5], [15, 6], [14, 7], [14, 8], [14, 9], [15, 10], [16, 11], [17, 12]];
  for (let x = 17; x < 26; x++) for (let y = 4; y < 14; y++) {
    const dx = x - 21, dy = y - 8.5;
    if (Math.abs(dy) > 2.5 + (21 - x) * -0.55 + 2 || x > 25) continue;
    if (Math.abs(dy) > 5) continue;
    pc.set(x, y, dy < -2 ? hi : dy > 2 ? lo : c);
  }
  for (const [x, y] of blade) pc.set(x, y, edge);
  for (let y = 5; y < 12; y++) pc.set(15, y, edge);
}
function spade(pc, c) {
  const W = [0x5a3a1e, 0x74482a, 0x8a5a34];
  for (let k = 0; k < 16; k++) { const x = 18 - Math.round(k * 0.55), y = 18 + k * 0.7; pc.set(x, y, W[1]); pc.set(x + 1, y, W[2]); }
  for (let x = 6; x < 13; x++) { pc.set(x, 29, W[1]); pc.set(x, 30, W[0]); }
  const lo = dk(c, 0.35), hi = lt(c, 0.45);
  for (let y = 3; y < 19; y++) for (let x = 16; x < 29; x++) {
    const u = (x - 22) / 6, v = (y - 11) / 8;
    if (u * u * 0.9 + (v > 0 ? v * v : v * v * 0.35) > 1) continue;
    pc.set(x, y, u < -0.5 ? hi : u > 0.55 ? lo : c);
  }
}
function shears(pc, c) {
  const hi = lt(c, 0.45), lo = dk(c, 0.3);
  for (let k = 0; k < 14; k++) { pc.set(15 + k * 0.6, 15 - k, hi); pc.set(17 - k * 0.6, 15 - k, c); pc.set(16 + k * 0.6, 15 - k, lo); }
  for (const [cx, cy] of [[10, 23], [21, 23]]) for (let a = 0; a < 20; a++) { const t = a / 20 * Math.PI * 2; pc.set(cx + Math.cos(t) * 4, cy + Math.sin(t) * 4, 0x9a2a1e); pc.set(cx + Math.cos(t) * 3.4, cy + Math.sin(t) * 3.4, 0x6a1a12); }
  pc.set(16, 15, 0x2a2220); pc.set(15, 16, 0x2a2220);
  for (let k = 0; k < 5; k++) { pc.set(13 - k * 0.5, 17 + k * 0.6, lo); pc.set(18 + k * 0.5, 17 + k * 0.6, lo); }
}

// ------------------------------------------------------------------ entry
export function drawBuildIcon(pc, spec) {
  if (!spec) return false;
  if (spec.k === 'btool') {
    const c = spec.c ?? 0x9aa0a8;
    if (spec.t === 'axe') axe(pc, c);
    else if (spec.t === 'spade') spade(pc, c);
    else shears(pc, c);
    selout(pc, { k: 0.3 });
    return true;
  }
  if (spec.k !== 'block') return false;
  const b = spec.b;
  if (b === 'cobble') blockCube(pc, BM.B_COBBLE, [PAT.cobble, PAT.cobble, PAT.cobble]);
  else if (b === 'stonebrick') blockCube(pc, BM.B_STONEBRICK, [PAT.stonebrick, PAT.stonebrick, PAT.stonebrick]);
  else if (b === 'bricks') blockCube(pc, BM.B_CLAYBRICK, [PAT.bricks, PAT.bricks, PAT.bricks]);
  else if (b === 'planks') blockCube(pc, BM.B_PLANKS, [PAT.planks, PAT.planks, PAT.planks]);
  else if (b === 'log') blockCube(pc, BM.B_LOG_Y, [PAT.logEnd, PAT.logSide, PAT.logSide]);
  else if (b === 'glass') blockCube(pc, BM.B_GLASS, [PAT.glass, PAT.glass, PAT.glass], { glass: true });
  else if (b === 'dirt') blockCube(pc, BM.B_DIRT, [PAT.dirt, PAT.dirt, PAT.dirt]);
  else if (b === 'ladder') ladder(pc);
  else if (b === 'torch') torch(pc);
  else if (b === 'lantern') lantern(pc);
  else if (b === 'door') door(pc);
  else if (b === 'chest') chest(pc);
  else if (b === 'workbench') bench(pc);
  else if (b === 'stick') sticks(pc);
  else if (b === 'sand') pile(pc, [0x9a7a4a, 0xae8c58, 0xc09e68, 0xd0b078], 0xe0c890);
  else if (b === 'clay') pile(pc, [0x7a3e24, 0x8e4a2c, 0xa05634, 0xb2643e], 0xc87a50);
  else if (b === 'vine') vine(pc);
  else return false;
  selout(pc, { k: 0.28 });
  return true;
}
