// Prop models for the burrows (part 1): lamps, rugs, barrels, sacks and the goods on the shelves,
// the Trading Post's counter things, the herbalist's cauldron, herbs, mushroom beds and jars.
// Builders return { grid: PGrid, pivot, s (voxels per metre: 32 for close-up detail, 16 for big
// pieces), light?, sway?, swayAmt? }. Fronts face +z; floor props pivot at the base, wall props at
// the back (z = 0 is the wall), ceiling props at the top.
import { PGrid, hv, shade, mixc } from '../props/grid.js';
import { addModels, paintText } from './kit.js';

// ---------------------------------------------------------------- palettes
export const W = [0x3a2212, 0x56361c, 0x744a2a, 0x926036, 0xb07a44, 0xcc9a5e]; // wood, dark → light
export const IR = [0x202226, 0x30333a, 0x464a52, 0x646a74, 0x8c929c, 0xb8bec6]; // iron
export const BR = [0x5a3410, 0x86561a, 0xa8742a, 0xc8963e, 0xe2c070, 0xf4e2b0]; // brass
export const BURLAP = [0x5e4628, 0x7c6038, 0x9a7c4c, 0xb89a64, 0xd2b884];
export const CLOTH = { red: [0x6a1a16, 0x8e2a20, 0xb23c2a, 0xd65a3e], green: [0x1e3a22, 0x2c5430, 0x3e7040, 0x5a8e54], blue: [0x1e2a4a, 0x2a3c66, 0x3a5288, 0x5a74a8], cream: [0x8a7c5e, 0xb0a07a, 0xd2c49c, 0xece0bc], purple: [0x2e1a3a, 0x442a54, 0x5e3c70, 0x7e5a92] };
const GLASS = [0x5a8a9a, 0x7aacbc, 0xa8d4e0, 0xe0f6ff];

/** Wood with planks along an axis (0 x, 1 y, 2 z) of width pw, darker grain streaks. */
export function wood(x, y, z, axis = 0, pw = 3, base = 2, s = 0) {
  const across = axis === 0 ? y + z * 7 : axis === 1 ? x + z * 7 : x + y * 7;
  const along = axis === 0 ? x : axis === 1 ? y : z;
  const plank = Math.floor(across / pw);
  let k = base + (hv(plank, s, 3, 11) < 0.33 ? -1 : hv(plank, s, 3, 11) > 0.8 ? 1 : 0);
  if (across % pw === 0) k -= 1; // the seam between planks
  if (hv(plank, Math.floor(along / 3), s, 13) < 0.12) k -= 1; // grain
  return W[Math.max(0, Math.min(5, k))];
}
const pick = (arr, t) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(t * arr.length)))];
/** A light for a model: c linear-ish RGB, r metres, at local metres. */
const L = (c, r, at, o = {}) => ({ c, r, at, ...o });

// ---------------------------------------------------------------- lamps
function lampBody(g, cx, y0, cz, v) {
  // v 0 brass lantern, 1 green glass jar lamp, 2 caged miner's lamp, 3 dented tin lantern
  if (v === 1) {
    g.ell(cx, y0 + 6, cz, 5, 6, 5, (x, y, z, dx, dy, dz) => (dx + dz > 0.9 ? 0xf2ffd0 : dx * dx + dz * dz > 0.8 ? 0x8ac87a : 0xd8f6a0), 3);
    g.box(cx - 2, y0 + 11, cz - 2, 5, 2, 5, W[2]);
    g.box(cx - 3, y0 + 12, cz - 3, 7, 1, 7, CLOTH.red[2]);
    for (let i = 0; i < 4; i++) g.set(cx - 3 + i * 2, y0 + 11, cz - 3, CLOTH.red[1]);
    return;
  }
  const metal = v === 2 || v === 3 ? IR : BR;
  const glassC = v === 3 ? 0xffc870 : 0xffd890;
  // base and cap
  g.box(cx - 4, y0, cz - 4, 9, 1, 9, metal[1]);
  g.box(cx - 3, y0 + 1, cz - 3, 7, 1, 7, metal[2]);
  g.box(cx - 3, y0 + 10, cz - 3, 7, 1, 7, metal[2]);
  g.box(cx - 4, y0 + 11, cz - 4, 9, 1, 9, metal[1]);
  g.box(cx - 2, y0 + 12, cz - 2, 5, 1, 5, metal[2]);
  g.box(cx - 1, y0 + 13, cz - 1, 3, 1, 3, metal[3]);
  if (v === 3) { g.set(cx + 3, y0 + 11, cz - 4, -1); g.set(cx + 4, y0 + 11, cz - 3, -1); g.set(cx + 2, y0 + 12, cz - 2, metal[0]); } // a dent
  // glass between corner posts, the flame inside
  g.box(cx - 3, y0 + 2, cz - 3, 7, 8, 7, (x, y, z) => ((x + y) % 5 === 0 ? 0xfff2c0 : glassC), 3);
  for (const [x, z] of [[cx - 3, cz - 3], [cx + 3, cz - 3], [cx - 3, cz + 3], [cx + 3, cz + 3]]) g.box(x, y0 + 2, z, 1, 8, 1, metal[v === 0 ? 1 : 0]);
  if (v === 2) for (let y = y0 + 3; y < y0 + 10; y += 3) { g.box(cx - 4, y, cz - 4, 9, 1, 1, IR[2]); g.box(cx - 4, y, cz + 4, 9, 1, 1, IR[2]); g.box(cx - 4, y, cz - 4, 1, 1, 9, IR[2]); g.box(cx + 4, y, cz - 4, 1, 1, 9, IR[2]); }
  g.box(cx - 1, y0 + 4, cz - 1, 3, 4, 3, 0xffffff, 3);
}
function chain(g, cx, y0, y1, cz, c0 = IR[2], c1 = IR[4]) {
  for (let y = y0; y < y1; y++) {
    const ring = y % 3;
    if (ring === 0) g.set(cx, y, cz, c1);
    else { g.set(cx - (y % 6 < 3 ? 1 : 0), y, cz - (y % 6 < 3 ? 0 : 1), c0); g.set(cx + (y % 6 < 3 ? 1 : 0), y, cz + (y % 6 < 3 ? 0 : 1), c0); }
  }
}

addModels({
  hanglamp(r, v) {
    const len = v === 1 ? 10 : 14, H = len + 15;
    const g = new PGrid(13, H, 13);
    g.box(4, H - 1, 4, 5, 1, 5, IR[1]);
    chain(g, 6, 14, H - 1, 6);
    g.set(6, 14, 6, IR[3]);
    lampBody(g, 6, 0, 6, v);
    return { grid: g, pivot: [6.5, H, 6.5], light: L([0.9, 0.6, 0.32], 6, [0, -(H - 6) / 32, 0], { lantern: true }) };
  },
  swinglamp(r, v) {
    const len = 22, H = len + 15;
    const g = new PGrid(13, H, 13);
    g.box(4, H - 1, 4, 5, 1, 5, IR[1]);
    g.set(6, H - 2, 6, IR[3]);
    chain(g, 6, 14, H - 2, 6, IR[1], IR[3]);
    lampBody(g, 6, 0, 6, 3);
    return { grid: g, pivot: [6.5, H, 6.5], ao: false };
  },
  lantern(r, v) {
    const g = new PGrid(11, 18, 11);
    lampBody(g, 5, 0, 5, v ? 0 : 3);
    // a wire handle
    for (let x = 2; x <= 8; x++) g.set(x, 15 + (x > 3 && x < 7 ? 1 : 0), 5, IR[3]);
    return { grid: g, pivot: [5.5, 0, 5.5], light: L([0.8, 0.52, 0.26], 2.8, [0, 0.2, 0], { lantern: true }) };
  },
  candle(r, v) {
    const g = new PGrid(9, 12, 9);
    g.cylY(4, 4, 3.6, 0, 1, BR[2]);
    g.cylY(4, 4, 3, 1, 2, BR[1]);
    g.box(7, 1, 4, 2, 1, 1, BR[2]); g.set(8, 2, 4, BR[3]); // the finger loop
    g.cylY(4, 4, 1.6, 2, 7, (x, y, z) => (y === 6 && (x + z) % 2 ? 0xfff6e0 : 0xf0e2c0));
    g.set(5, 5, 6, 0xfff6e0); g.set(5, 4, 6, 0xfff6e0); g.set(3, 4, 2, 0xfff6e0); // drips
    g.set(4, 7, 4, 0x2a2420);
    g.set(4, 8, 4, 0xffd060, 3); g.set(4, 9, 4, 0xfff4c0, 3); g.set(4, 10, 4, 0xffffff, 3);
    return { grid: g, pivot: [4.5, 0, 4.5], light: L([0.62, 0.38, 0.18], 2.0, [0, 0.3, 0], { lantern: true }) };
  },
  lanternpost(r, v) { // a little oil lamp with a glass chimney
    const g = new PGrid(9, 14, 9);
    g.cylY(4, 4, 3.4, 0, 1, BR[1]);
    g.ell(4, 2.5, 4, 3, 2, 3, BR[2]);
    g.box(3, 4, 3, 3, 1, 3, BR[3]);
    g.cylY(4, 4, 2, 5, 11, (x, y, z) => ((x + y) % 4 === 0 ? 0xffffff : 0xffe2a0), 3);
    g.set(4, 6, 4, 0xffffff, 3);
    g.set(7, 3, 4, BR[3]); g.set(8, 3, 4, BR[2]);
    return { grid: g, pivot: [4.5, 0, 4.5], light: L([0.62, 0.42, 0.2], 2.2, [0, 0.25, 0], { lantern: true }) };
  },

  // ---------------------------------------------------------------- floor coverings
  rug(r, v) {
    const [w, d] = v === 0 ? [51, 32] : v === 1 ? [44, 30] : [48, 34];
    const g = new PGrid(w + 4, 1, d);
    const pal = v === 0 ? [CLOTH.red[1], CLOTH.red[2], 0xd8a040, CLOTH.cream[2], CLOTH.red[0]]
      : v === 1 ? [CLOTH.green[1], CLOTH.green[2], CLOTH.cream[2], 0xc8783a, CLOTH.green[0]]
        : [CLOTH.purple[1], CLOTH.blue[2], 0xc89a40, CLOTH.cream[1], CLOTH.purple[0]];
    const cx = w / 2 - 0.5, cz = d / 2 - 0.5;
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const bx = Math.min(x, w - 1 - x), bz = Math.min(z, d - 1 - z), b = Math.min(bx, bz);
      let c;
      if (b === 0) c = pal[4];
      else if (b <= 2) c = (x + z) % 2 ? pal[2] : pal[0];
      else if (b === 3) c = pal[4];
      else {
        const dd = Math.abs(x - cx) / (w * 0.32) + Math.abs(z - cz) / (d * 0.32);
        const ring = Math.floor(dd * 5);
        c = ring >= 5 ? ((Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? pal[0] : shade(pal[0], 0.9)) : [pal[3], pal[2], pal[1], pal[2], pal[1]][ring];
        if (ring < 5 && (Math.round(dd * 25) % 5 === 0)) c = pal[4];
      }
      if (v === 2 && hv(x >> 1, 0, z >> 1, 41) < 0.12) c = shade(c, 0.78); // worn through
      g.set(x + 2, 0, z, c);
    }
    for (let z = 1; z < d - 1; z += 2) { g.set(0, 0, z, pal[3]); g.set(1, 0, z, pal[3]); g.set(w + 2, 0, z, pal[3]); g.set(w + 3, 0, z, pal[3]); }
    return { grid: g, pivot: [(w + 4) / 2, 0, d / 2], ao: false };
  },

  // ---------------------------------------------------------------- barrels, sacks, crates
  barrel(r, v) {
    const g = new PGrid(18, 24, 18);
    for (let y = 0; y < 22; y++) {
      const R = 6.4 + Math.sin((y / 21) * Math.PI) * 1.5;
      g.cylY(8.5, 8.5, R, y, y + 1, (x, yy, z) => {
        if (y === 2 || y === 3 || y === 18 || y === 19 || y === 10) return (x + z) % 7 === 0 ? IR[4] : IR[2];
        const a = Math.atan2(z - 8.5, x - 8.5);
        const stave = Math.floor((a + Math.PI) * 3.2);
        return stave % 2 ? W[3] : (hv(stave, y >> 2, 1, 5) < 0.25 ? W[1] : W[2]);
      });
    }
    if (v === 1) {
      g.cylY(8.5, 8.5, 6.6, 21, 22, W[1]);
      for (let i = 0; i < 14; i++) { const a = r() * 6.28, rr = r() * 4.5; g.ell(8.5 + Math.cos(a) * rr, 22.5 + r() * 0.8, 8.5 + Math.sin(a) * rr, 1.6, 1.3, 1.6, r() < 0.5 ? 0xf08a3a : 0xc8402a); }
    } else {
      g.cylY(8.5, 8.5, 6.6, 21, 22, (x, y, z) => wood(x, y, z, 2, 3, 2, 7));
      g.box(4, 22, 8, 9, 1, 1, IR[2]);
    }
    return { grid: g, pivot: [8.5, 0, 8.5] };
  },
  sacks(r, v) {
    const g = new PGrid(30, 20, 20);
    const sack = (cx, cz, h, lean) => {
      for (let y = 0; y < h; y++) {
        const t = y / h, R = (t < 0.75 ? 4.6 + Math.sin(t * Math.PI * 1.1) * 1.4 : 3.5 - (t - 0.75) * 9) * (1 - 0.1 * (y === 0));
        g.cylY(cx + lean * t * 2, cz, Math.max(1, R), y, y + 1, (x, yy, z) => ((x + yy * 2 + z) % 6 === 0 ? BURLAP[1] : hv(x, yy, z, 3) < 0.2 ? BURLAP[3] : BURLAP[2]));
      }
      g.cylY(cx + lean * 2, cz, 1.6, h - 3, h - 1, BURLAP[0]); // the tied neck
      g.cylY(cx + lean * 2, cz, 2.6, h - 1, h + 1, BURLAP[2]);
      for (let a = 0; a < 6.28; a += 0.5) g.set(cx + lean * 2 + Math.cos(a) * 2, h - 2, cz + Math.sin(a) * 2, 0xc4a46a);
    };
    sack(9, 9, 15, -0.3);
    sack(19, 10, 13, 0.4);
    // one lying on its side in front, flour spilling
    g.ell(14, 3, 15, 8, 3.2, 3.6, (x, y, z) => ((x + y + z) % 6 === 0 ? BURLAP[1] : BURLAP[3]));
    g.ell(23, 2, 15, 2, 1.6, 2, BURLAP[1]);
    for (let i = 0; i < 9; i++) g.set(24 + (i % 3), 0, 13 + Math.floor(i / 3), 0xf0ead8);
    return { grid: g, pivot: [14, 0, 10] };
  },

  // ---------------------------------------------------------------- the counter
  ledger(r, v) {
    const cover = v === 1 ? 0x1a1618 : v === 2 ? CLOTH.green[1] : CLOTH.red[1];
    const g = new PGrid(18, 6, 12);
    g.box(0, 0, 1, 15, 1, 10, cover);
    for (let x = 1; x < 14; x++) {
      const bow = x === 7 ? 0 : Math.abs(x - 7) < 3 ? 2 : 1;
      for (let z = 2; z < 10; z++) g.set(x, bow, z, x === 7 ? 0xc8bca0 : (z % 2 === 0 && x % 7 > 1 && x % 7 < 6 && hv(x, z, v, 3) < 0.7 ? 0x8a8070 : 0xf0e8d4));
    }
    if (v === 1) for (let z = 10; z < 12; z++) g.set(7, 0, z, 0xc8202a); // the ribbon
    // inkpot and quill
    g.box(15, 0, 2, 3, 3, 3, 0x1a1a2a);
    g.set(16, 3, 3, 0x3a3a5a);
    g.line(16, 3, 3, 13, 5, 1, 0xf2f0ea);
    g.set(14, 5, 1, 0xd8d4c8); g.set(15, 5, 2, 0xd8d4c8);
    return { grid: g, pivot: [8, 0, 6] };
  },
  coins(r, v) {
    const g = new PGrid(14, 8, 12);
    const stack = (x, z, n) => { for (let i = 0; i < n; i++) g.cylY(x, z, 1.6, i, i + 1, i % 2 ? BR[3] : BR[2]); };
    stack(3, 3, 5); stack(7, 4, 3); stack(5, 8, 7);
    for (let i = 0; i < 6; i++) g.set(8 + r.int(0, 4), 0, 6 + r.int(0, 4), BR[3]);
    if (v === 1) { g.ell(10, 2, 9, 3, 2, 2.5, BR[2]); g.set(10, 4, 9, 0xff3a4a, 2); g.set(11, 4, 9, 0xff8a9a, 3); }
    return { grid: g, pivot: [7, 0, 6] };
  },
  bell(r, v) {
    const g = new PGrid(9, 7, 9);
    g.cylY(4, 4, 3.8, 0, 1, W[1]);
    g.ell(4, 1.5, 4, 3.2, 3.2, 3.2, (x, y, z, dx, dy, dz) => (dx - dz > 0.5 ? BR[4] : dy < 0 ? BR[1] : BR[2]));
    g.set(4, 5, 4, BR[3]);
    for (let y = 0; y < 2; y++) for (let z = 0; z < 9; z++) for (let x = 0; x < 9; x++) if (y > 0 && g.has(x, 0, z) && Math.hypot(x - 4, z - 4) < 2.8) g.set(x, y, z, BR[1]);
    return { grid: g, pivot: [4.5, 0, 4.5] };
  },
  scale(r, v) { // the base and post; the beam and pans move (scalebeam, scalepan)
    const g = new PGrid(13, 18, 9);
    g.box(1, 0, 1, 11, 1, 7, W[1]);
    g.box(2, 1, 2, 9, 1, 5, W[2]);
    g.box(5, 2, 4, 3, 1, 1, BR[1]);
    g.box(6, 2, 3, 1, 13, 3, (x, y) => (y % 4 === 0 ? BR[3] : BR[2]));
    g.box(5, 14, 3, 3, 2, 3, BR[1]);
    g.set(6, 16, 4, BR[4]);
    return { grid: g, pivot: [6.5, 0, 4.5], info: { beamY: 15 / 32 } };
  },
  scalebeam(r, v) {
    const g = new PGrid(23, 3, 3);
    g.box(0, 1, 1, 23, 1, 1, BR[2]);
    g.box(9, 0, 0, 5, 3, 3, BR[1]);
    g.set(11, 2, 1, BR[4]);
    g.set(0, 0, 1, BR[3]); g.set(22, 0, 1, BR[3]);
    return { grid: g, pivot: [11.5, 1.5, 1.5], info: { arm: 11 / 32 } };
  },
  scalepan(r, v) {
    const g = new PGrid(11, 11, 11);
    for (let y = 2; y < 11; y++) { const k = (y - 2) / 8; g.set(5 + Math.round((1 - k) * 4), y, 5, BR[3]); g.set(5 - Math.round((1 - k) * 4), y, 5, BR[3]); g.set(5, y, 5 + Math.round((1 - k) * 4), BR[3]); }
    g.cylY(5, 5, 5, 0, 1, BR[1]);
    g.cylY(5, 5, 4.4, 1, 2, (x, y, z) => (Math.hypot(x - 5, z - 5) > 3.5 ? BR[2] : BR[3]));
    if (v === 1) { g.ell(5, 2.5, 5, 2, 1.4, 2, 0xd07a3a); g.set(5, 3, 5, 0x6ac08a); }
    if (v === 2) { g.cylY(5, 5, 1.4, 2, 4, IR[3]); }
    return { grid: g, pivot: [5.5, 10.5, 5.5] };
  },
  chalkboard(r, v) {
    const g = new PGrid(38, 30, 3);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 38; x++) {
      const fr = x < 2 || x > 35 || y < 2 || y > 27;
      g.set(x, y, 0, fr ? wood(x, y, 0, x < 2 || x > 35 ? 1 : 0, 2, 3, 4) : (hv(x >> 2, y >> 2, 0, 81) < 0.25 ? 0x2c3a34 : 0x24302c));
      if (fr) g.set(x, y, 1, W[(x + y) % 5 === 0 ? 2 : 3]);
    }
    const chalk = (x, y) => (hv(x, y, 4, 7) < 0.15 ? 0xa8b0a8 : 0xe8ece0);
    paintText(g, 'WE BUY', 7, 24, 1, chalk, { jitter: true });
    paintText(g, 'ORE&GEMS', 3, 17, 1, chalk, { jitter: true });
    // a chalk coin doodle and some scribbled sums
    for (let a = 0; a < 6.28; a += 0.4) g.set(30 + Math.cos(a) * 3, 7 + Math.sin(a) * 3, 1, 0xe8d880);
    g.set(30, 7, 1, 0xe8d880); g.set(30, 8, 1, 0xe8d880); g.set(30, 6, 1, 0xe8d880);
    for (let x = 4; x < 22; x++) if (hv(x, 1, 2, 9) < 0.6) g.set(x, 9, 1, 0xd0d4c8);
    for (let x = 4; x < 18; x++) if (hv(x, 2, 2, 9) < 0.6) g.set(x, 6, 1, 0xd0d4c8);
    g.box(6, 1, 1, 26, 1, 2, W[2]); g.box(10, 2, 2, 3, 1, 1, 0xf4f4ec);
    return { grid: g, pivot: [19, 0, 0] };
  },
  pickrack(r, v) {
    const g = new PGrid(24, 18, 5);
    g.box(0, 13, 0, 24, 2, 2, (x, y, z) => wood(x, y, z, 0, 2, 3, 2));
    for (const x of [4, 12, 20]) { g.set(x, 14, 2, IR[3]); g.set(x, 14, 3, IR[3]); }
    // two picks and a shovel hanging from the pegs
    const pickA = (x) => { g.line(x, 13, 3, x, 1, 3, W[3]); g.line(x - 4, 3, 3, x, 1, 3, IR[3]); g.line(x, 1, 3, x + 4, 3, 3, IR[3]); g.set(x - 4, 3, 3, IR[4]); g.set(x + 4, 3, 3, IR[4]); g.set(x, 12, 4, IR[1]); };
    pickA(4); pickA(20);
    g.line(12, 13, 3, 12, 6, 3, W[3]);
    g.box(10, 0, 3, 5, 6, 1, (x, y) => (y === 0 ? IR[2] : IR[3]));
    g.box(11, 12, 3, 3, 1, 1, W[1]);
    return { grid: g, pivot: [12, 0, 0], s: 16 };
  },
  gembox(r, v) {
    const g = new PGrid(16, 6, 12);
    g.box(0, 0, 0, 16, 3, 12, W[1]);
    g.box(1, 1, 1, 14, 2, 10, 0x5a1420);
    const gems = [0xff3a4a, 0x3ad86a, 0x4a8aff, 0xc87aff, 0xffd84a, 0xffffff];
    for (let i = 0; i < 12; i++) { const x = 2 + (i % 4) * 3.4, z = 2 + Math.floor(i / 4) * 3.3; const c = gems[(i * 7 + v) % gems.length]; g.set(x, 2, z, c, 2); g.set(x + 1, 2, z, shade(c, 0.75), 1); g.set(x, 3, z, mixc(c, 0xffffff, 0.5), 3); }
    // the lid propped open behind
    g.box(0, 3, 0, 16, 6, 1, W[2]);
    g.box(1, 4, 1, 14, 4, 1, 0x7a1e2c);
    return { grid: g, pivot: [8, 0, 6] };
  },
  oreb(r, v) {
    const g = new PGrid(16, 10, 14);
    for (let y = 0; y < 6; y++) {
      const R = 5.6 + y * 0.35;
      for (let z = 0; z < 14; z++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot((x - 7.5) / 1.1, z - 6.5);
        if (d > R || (d < R - 1.2 && y > 0)) continue;
        g.set(x, y, z, (x + y + z) % 3 === 0 ? 0x8a6a3a : (x + z + y * 2) % 4 === 0 ? 0x5a4222 : 0xa8844a);
      }
    }
    const pal = v === 1 ? [0x6a5a50, 0x8a7064, 0xa8564a, 0xc8b8a8] : v === 2 ? [0x16141a, 0x262428, 0x3a383e, 0xd8d8f0] : v === 3 ? [0xff3a4a, 0x3ad86a, 0x4a8aff, 0xffd84a] : [0x8a4a2a, 0xb8642e, 0xd8884a, 0x5ab88a];
    for (let i = 0; i < 18; i++) {
      const x = 3 + r() * 10, z = 2.5 + r() * 8, y = 5 + r() * 2.5;
      const c = pal[Math.floor(r() * 3)];
      g.ell(x, y, z, 1.6, 1.2, 1.6, (xx, yy, zz) => (hv(xx, yy, zz, 5) < 0.15 ? pal[3] : c), v === 3 ? 2 : 0);
    }
    return { grid: g, pivot: [8, 0, 7] };
  },

  // ---------------------------------------------------------------- shelf goods (1/32 m)
  jar(r, v) {
    const fill = [0xc84a2a, 0x7a9a3a, 0xd8a02a, 0x8a3a6a, 0xe8d8b8, 0x6a3a1a, 0x4a8a4a][v % 7];
    const g = new PGrid(8, 11, 8);
    g.cylY(3.5, 3.5, 3.2, 0, 8, (x, y, z) => (Math.hypot(x - 3.5, z - 3.5) > 2.6 && (x + y) % 5 === 0 ? 0xe8f4ff : y < 7 ? fill : mixc(fill, 0xffffff, 0.35)));
    g.cylY(3.5, 3.5, 2.4, 8, 9, IR[3]);
    g.cylY(3.5, 3.5, 3.4, 9, 10, (x, y, z) => ((x + z) % 2 ? 0xd83a2a : 0xf0e8e0));
    g.set(3, 4, 7, 0xf0e4c8); g.set(4, 4, 7, 0xf0e4c8); g.set(3, 3, 7, 0xf0e4c8); g.set(4, 3, 7, 0xe0d4b8);
    return { grid: g, pivot: [3.5, 0, 3.5] };
  },
  tin(r, v) {
    const band = [0xc83a2a, 0x2a6ac8, 0x3a9a4a, 0xe8b02a, 0x8a3ab0][v % 5];
    const g = new PGrid(14, 8, 7);
    for (const [cx, h] of [[3, 7], [10, 5]]) {
      g.cylY(cx, 3, 2.7, 0, h, (x, y) => (y === 0 || y === h - 1 ? IR[4] : y > 1 && y < h - 2 ? (x % 3 === 0 ? shade(band, 1.2) : band) : IR[3]));
    }
    g.set(3, 4, 6, 0xf4f0e0); g.set(10, 3, 6, 0xf4f0e0);
    return { grid: g, pivot: [6.5, 0, 3.5] };
  },
  sack(r, v) {
    const g = new PGrid(10, 10, 8);
    for (let y = 0; y < 8; y++) g.cylY(4.5, 3.5, Math.max(1.4, 3.6 - Math.max(0, y - 5) * 0.8 + (y === 0 ? -0.4 : 0)), y, y + 1, (x, yy, z) => ((x + yy + z) % 5 === 0 ? BURLAP[1] : BURLAP[3]));
    g.ell(4.5, 8, 3.5, 2.6, 1.2, 2.2, v % 2 ? 0xf2ead6 : 0xd8b860);
    g.set(4, 6, 7, 0xc8a46a); g.set(5, 6, 7, 0xc8a46a);
    return { grid: g, pivot: [4.5, 0, 3.5] };
  },
  bottles(r, v) {
    const g = new PGrid(14, 14, 6);
    const cols = [[0x2a6a3a, 0x4a9a5a], [0x6a3a1a, 0x9a5a2a], [0x2a4a8a, 0x4a7ac8], [0x8a1a2a, 0xc83a4a]];
    let x = 2;
    for (let i = 0; i < 3; i++) {
      const [c0, c1] = cols[(v + i) % 4], h = 7 + ((i * 3 + v) % 4);
      g.cylY(x, 3, 1.7, 0, h - 3, (xx, y) => (xx === x - 1 && y > 1 ? c1 : c0));
      g.box(x, h - 3, 3, 1, 2, 1, c0);
      g.set(x, h - 1, 3, 0xb08858);
      g.set(x, 3, 5, 0xf0e4c0); g.set(x, 2, 5, 0xf0e4c0);
      x += 4 + (i === 0 ? 1 : 0);
    }
    return { grid: g, pivot: [7, 0, 3] };
  },
  candles(r, v) {
    const g = new PGrid(12, 9, 7);
    g.box(0, 0, 0, 12, 3, 7, W[2]);
    g.box(1, 1, 1, 10, 2, 5, W[1]);
    for (let i = 0; i < 5; i++) { g.box(1 + i * 2, 2, 2 + (i % 2) * 2, 2, 1, 1, 0xf0e2c0); g.set(2 + i * 2, 3, 2 + (i % 2) * 2, 0xf0e2c0); }
    g.box(2, 3, 3, 1, 5, 1, 0xf6ead0); g.set(2, 8, 3, 0x2a2420);
    return { grid: g, pivot: [6, 0, 3.5] };
  },
  lamp(r, v) {
    const g = new PGrid(10, 12, 9);
    g.box(1, 0, 1, 7, 1, 7, IR[2]);
    g.box(2, 1, 2, 5, 6, 5, (x, y, z) => ((x + z) % 4 === 0 ? IR[3] : 0xa8b8c0));
    g.box(1, 7, 1, 7, 1, 7, IR[2]);
    g.box(3, 8, 3, 3, 1, 3, IR[3]);
    for (let x = 1; x <= 7; x++) g.set(x, 9 + (x > 2 && x < 6 ? 1 : 0), 4, IR[4]);
    return { grid: g, pivot: [4.5, 0, 4.5] };
  },
  pickhead(r, v) {
    const g = new PGrid(16, 6, 8);
    for (const z of [2, 5]) { g.line(0, 1 + (z === 5 ? 1 : 0), z, 7, 3, z, IR[3]); g.line(7, 3, z, 15, 1, z, IR[3]); g.box(6, 2, z - 1, 3, 3, 3, IR[2]); g.set(0, 1 + (z === 5 ? 1 : 0), z, IR[5]); g.set(15, 1, z, IR[5]); }
    return { grid: g, pivot: [8, 0, 4] };
  },
  rope(r, v) {
    const g = new PGrid(14, 6, 14);
    for (let k = 0; k < 3; k++) {
      const R = 5 - k * 0.8, y0 = k * 1.5;
      for (let a = 0; a < 6.28; a += 0.12) for (let t = -1; t <= 1; t++) {
        const x = 6.5 + Math.cos(a) * (R + t * 0.6), z = 6.5 + Math.sin(a) * (R + t * 0.6);
        g.set(x, y0 + Math.abs(t) * 0.4, z, Math.floor(a * 4 + t) % 2 ? 0xc4a46a : 0x9a7a44);
        g.set(x, y0 + 1, z, Math.floor(a * 4 + t + 1) % 2 ? 0xd4b47a : 0xa88a54);
      }
    }
    g.line(11, 0, 9, 14, 0, 13, 0xc4a46a);
    return { grid: g, pivot: [6.5, 0, 6.5] };
  },
  oilcan(r, v) {
    const g = new PGrid(10, 12, 8);
    g.box(1, 0, 1, 7, 9, 6, (x, y, z) => (y === 0 || y === 8 ? 0x7a1a14 : (x === 1 || x === 7) ? 0x9a2a1e : 0xb8382a));
    g.box(3, 9, 3, 2, 1, 2, IR[3]);
    g.line(6, 9, 3, 9, 11, 3, IR[3]);
    g.box(2, 10, 2, 1, 1, 3, IR[2]); g.box(6, 10, 2, 1, 1, 3, IR[2]);
    g.box(3, 3, 7, 3, 3, 1, 0xe8d8a0);
    return { grid: g, pivot: [4.5, 0, 4] };
  },
  stakes(r, v) {
    const g = new PGrid(10, 16, 8);
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 1.5, lean = (i - 2) * 0.25;
      g.line(x, 0, 4, x + lean * 4, 11, 4 + (i % 2), W[3]);
      g.ell(x + lean * 4, 13, 4 + (i % 2), 1.1, 1.8, 1.1, 0x7af0ff, 3);
    }
    g.box(1, 4, 3, 8, 2, 3, 0xc4a46a);
    return { grid: g, pivot: [5, 0, 4], light: L([0.35, 0.8, 1.0], 2.2, [0, 0.4, 0], { glow: true }) };
  },
  helmet(r, v) {
    const g = new PGrid(12, 8, 12);
    g.ell(6, 1, 6, 5, 6, 5.4, (x, y, z, dx, dy, dz) => (y < 1 ? -1 : dx + dz > 0.8 ? 0xffe070 : 0xe8b030));
    g.cylY(6, 6, 6, 0, 1, 0xc89020);
    g.box(5, 3, 10, 3, 3, 2, IR[2]); g.set(6, 4, 11, 0xfff2c0, 2);
    return { grid: g, pivot: [6, 0, 6] };
  },
  dyncrate(r, v) {
    const g = new PGrid(16, 11, 12);
    g.box(0, 0, 0, 16, 8, 11, (x, y, z) => (x === 0 || x === 15 || y === 0 || y === 7 || z === 0 || z === 10 ? W[1] : wood(x, y, z, 0, 3, 3, 5)));
    paintText(g, 'TNT', 3, 6, 11, 0xc8241a);
    // sticks poking out the top
    for (let i = 0; i < 6; i++) { const x = 2 + i * 2, z = 3 + (i % 2) * 3; g.box(x, 8, z, 2, 2, 2, i % 2 ? 0xc8302a : 0xa8241e); g.set(x, 10, z, 0xe8e0d0); }
    return { grid: g, pivot: [8, 0, 5.5] };
  },
  dynamite(r, v) {
    const g = new PGrid(12, 6, 10);
    for (let i = 0; i < 3; i++) g.box(1, 0 + (i === 1 ? 1.5 : 0), 2 + i * 2, 9, 2, 2, i % 2 ? 0xc8302a : 0xa8241e);
    g.box(4, 0, 1, 1, 4, 8, 0x3a2a1a);
    g.line(10, 2, 5, 12, 4, 3, 0xe8e0d0);
    return { grid: g, pivot: [6, 0, 5] };
  },

  // ---------------------------------------------------------------- the herbalist
  cauldron(r, v) {
    const g = new PGrid(24, 20, 24);
    const cx = 11.5, cz = 11.5;
    // three stubby legs, the belly, a thick rim, two lug handles
    for (const a of [0.3, 2.4, 4.5]) g.box(cx + Math.cos(a) * 6 - 1, 0, cz + Math.sin(a) * 6 - 1, 2, 4, 2, IR[1]);
    g.ell(cx, 9, cz, 9.5, 7.5, 9.5, (x, y, z, dx, dy, dz) => (y > 14 ? -1 : (dx - dz > 0.6 && dy > 0) ? IR[3] : dy < -0.5 ? IR[0] : (hv(x, y, z, 3) < 0.08 ? 0x5a3a2a : IR[1])));
    for (let a = 0; a < 6.283; a += 0.05) { g.set(cx + Math.cos(a) * 8.6, 14, cz + Math.sin(a) * 8.6, IR[3]); g.set(cx + Math.cos(a) * 8, 15, cz + Math.sin(a) * 8, IR[2]); g.set(cx + Math.cos(a) * 9, 15, cz + Math.sin(a) * 9, IR[2]); }
    g.box(1, 12, cz - 1, 2, 3, 3, IR[2]); g.box(21, 12, cz - 1, 2, 3, 3, IR[2]);
    // the brew: glowing green, paler where it bubbles
    for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > 7.6) continue;
      const b = hv(x >> 1, 0, z >> 1, 31);
      g.set(x, 14, z, b < 0.18 ? 0xd8ffb0 : b < 0.5 ? 0x6ae05a : 0x3ab84a, b < 0.18 ? 3 : 2);
    }
    // a ladle leaning on the rim
    g.line(cx + 3, 13, cz + 2, cx + 9, 19, cz + 4, W[4]);
    return { grid: g, pivot: [cx + 0.5, 0, cz + 0.5], light: L([0.4, 1.0, 0.35], 2.4, [0, 0.5, 0], { glow: true }) };
  },
  embers(r, v) { // the fire under the cauldron
    const g = new PGrid(18, 5, 18);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; g.line(9 + Math.cos(a) * 7, 1, 9 + Math.sin(a) * 7, 9 + Math.cos(a) * 2, 2, 9 + Math.sin(a) * 2, W[1], 0, 0.8); }
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, rr = r() * 5; g.set(9 + Math.cos(a) * rr, r() < 0.3 ? 1 : 0, 9 + Math.sin(a) * rr, pick([0xff4a10, 0xff8a20, 0xffc040, 0x3a2a24], r()), 3); }
    return { grid: g, pivot: [9, 0, 9] };
  },
  flame(r, v) {
    const g = new PGrid(9, 12, 9);
    for (let y = 0; y < 11; y++) { const R = 3.6 * Math.sin(Math.min(1, (y + 1) / 11) * Math.PI * 0.95) * (1 - y / 14); g.cylY(4, 4, Math.max(0.5, R), y, y + 1, (x, yy, z) => (Math.hypot(x - 4, z - 4) < R - 1.2 && y < 5 ? 0xffc860 : y < 4 ? 0xf08a28 : y < 7 ? 0xd8581a : 0xb8381a), 2); }
    g.set(4, 0, 4, 0xffe8a0, 2); g.set(4, 1, 4, 0xffd070, 2);
    return { grid: g, pivot: [4.5, 0, 4.5], ao: false };
  },
  herbs(r, v) {
    const len = 6 + (v % 3) * 2, H = len + 24;
    const g = new PGrid(13, H, 13);
    for (let y = H - 1; y >= H - len; y--) g.set(6, y, 6, 0xd8c8a0);
    const top = H - len;
    if (v === 2) {
      // a string of red peppers
      for (let i = 0; i < 6; i++) { const y = top - 2 - i * 3.5, s = i % 2 ? 1 : -1; g.ell(6 + s * 1.2, y, 6, 1.1, 2.2, 1.1, i % 3 === 2 ? 0xe85a20 : 0xc8241a); g.set(6 + s * 1.2, y + 2, 6, 0x3a7a2a); }
      for (let y = top; y > top - 22; y--) g.set(6, y, 6, 0xd8c8a0);
    } else if (v === 3) {
      // a braid of garlic
      for (let i = 0; i < 5; i++) { const y = top - 3 - i * 4, s = i % 2 ? 1.5 : -1.5; g.ell(6 + s, y, 6, 2.2, 2, 2.2, (x, yy, z) => ((x + z) % 3 === 0 ? 0xd8ccb8 : 0xf2ead8)); g.set(6 + s, y - 2, 6, 0xb8a888); }
      for (let y = top; y > top - 20; y--) g.set(6 + (y % 4 < 2 ? 0 : 1), y, 6, 0xc8b878);
    } else {
      // a bundle of stems tied twice, leaves and flower heads hanging down
      g.box(5, top - 3, 5, 3, 3, 3, 0xb8a070);
      g.box(5, top - 1, 5, 3, 1, 3, 0xd8483a);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + r() * 0.4, sp = 2 + r() * 3.5, ln = 12 + r() * 9;
        const ex = 6 + Math.cos(a) * sp, ez = 6 + Math.sin(a) * sp;
        g.line(6, top - 3, 6, ex, top - 3 - ln, ez, v === 0 ? 0x5a7a3a : 0x4a7a3a);
        for (let t = 0.3; t < 1; t += 0.14) {
          const x = 6 + (ex - 6) * t, y = top - 3 - ln * t, z = 6 + (ez - 6) * t;
          if (v === 0) { if (t > 0.6) { g.set(x, y, z, t > 0.85 ? 0xc8a0f0 : 0x9a6ad0, 1); g.set(x + 1, y, z, 0x8a5ac0); } else g.set(x + 1, y, z, 0x6a9a4a); }
          else { g.set(x + 1, y, z, hv(i, Math.round(t * 9), 3, 7) < 0.5 ? 0x7aaa5a : 0x9ac07a); g.set(x - 1, y + 1, z, 0x5a8a4a); }
        }
      }
    }
    return { grid: g, pivot: [6.5, H, 6.5], sway: 'down', swayAmt: 0.025 };
  },
  glowbed(r, v) {
    const g = new PGrid(16, 14, 14);
    const caps = [[8, 7, 5, 9], [4, 4, 3, 5], [12, 9, 3.4, 6], [6, 11, 2.6, 4], [11, 3, 2.2, 3]];
    for (const [x, z, R, h] of caps.slice(0, 3 + (v % 3))) {
      g.box(x - 0.5, 0, z - 0.5, 2, h, 2, (xx, y) => (y < 1 ? 0xa8b8c4 : 0xd8e8f0));
      g.ell(x + 0.5, h + 0.5, z + 0.5, R, R * 0.55, R, (xx, y, zz, dx, dy) => (dy < -0.3 ? 0x2050a0 : hv(xx, y, zz, 101 + v) < 0.16 ? 0xbce4ff : 0x3a8cff), 2);
    }
    return { grid: g, pivot: [8, 0, 7], light: L([0.25, 0.55, 1.1], 1.6, [0, 0.25, 0], { glow: true }) };
  },
  mushbed(r, v) {
    const g = new PGrid(16, 12, 14);
    for (const [x, z, R, h] of [[7, 7, 4.6, 6], [11, 4, 3, 4], [4, 10, 2.6, 3], [12, 10, 2, 2]]) {
      g.cylY(x, z, Math.max(1, R * 0.35), 0, h, 0xe8dcc4);
      g.ell(x, h + 0.5, z, R, R * 0.5, R, (xx, y, zz, dx, dy) => (dy < -0.2 ? 0xd8c8a8 : hv(xx, y, zz, 7) < 0.15 ? 0xa86a3a : 0x7a4a26));
    }
    for (let i = 0; i < 7; i++) { const x = 1 + r() * 14, z = 1 + r() * 12; g.set(x, 0, z, 0xf2ead8); g.set(x, 1, z, 0xffffff); }
    return { grid: g, pivot: [8, 0, 7] };
  },
  potion(r, v) {
    const col = [[0xd8283a, 0xff8a9a], [0x2a6aff, 0x9ad0ff], [0x3ac84a, 0xb0ffa0], [0xa83ad8, 0xe0a8ff], [0xffb020, 0xfff0a0]][v % 5];
    const g = new PGrid(9, 12, 9);
    g.ell(4, 3.5, 4, 3.6, 3.6, 3.6, (x, y, z, dx, dy, dz) => (dy > 0.5 ? 0xd8eef4 : dx - dz > 0.6 ? col[1] : col[0]), 2);
    g.box(3, 7, 3, 3, 2, 3, 0xc8e4ec);
    g.box(3, 9, 3, 3, 2, 3, 0xb08858);
    g.box(2, 3, 7, 5, 2, 1, 0xf2e8cc);
    return { grid: g, pivot: [4.5, 0, 4.5] };
  },
  herbjar(r, v) {
    const g = new PGrid(8, 14, 8);
    g.cylY(3.5, 3.5, 3.2, 0, 11, (x, y, z) => (Math.hypot(x - 3.5, z - 3.5) > 2.5 ? ((x + y) % 6 === 0 ? 0xeaf6ff : 0xa8c8c0) : 0x5a7a3a));
    for (let i = 0; i < 6; i++) g.line(2 + i % 3, 1, 3 + (i % 2), 2 + ((i + 1) % 4), 12, 3 + ((i + 1) % 2), [0x6a8a3a, 0x8a7a4a, 0x4a6a2a][i % 3]);
    g.cylY(3.5, 3.5, 2.4, 11, 13, 0xb08858);
    return { grid: g, pivot: [3.5, 0, 3.5] };
  },
  skull(r, v) {
    const g = new PGrid(10, 8, 12);
    g.ell(5, 4, 5, 4, 3.5, 4.5, 0xe8dcc0);
    g.box(3, 0, 8, 5, 3, 3, 0xd8ccb0);
    g.set(3, 4, 9, 0x2a2420); g.set(7, 4, 9, 0x2a2420); g.set(3, 5, 9, 0x2a2420); g.set(7, 5, 9, 0x2a2420);
    for (let x = 3; x < 8; x++) g.set(x, 1, 11, x % 2 ? 0xf6f0e0 : 0xb8ac90);
    return { grid: g, pivot: [5, 0, 6] };
  },
  mortar(r, v) {
    const g = new PGrid(12, 12, 12);
    for (let y = 0; y < 6; y++) g.cylY(6, 6, 3 + y * 0.45, y, y + 1, (x, yy, z) => (Math.hypot(x - 6, z - 6) < 2 + y * 0.45 && y > 1 ? -1 : hv(x, yy, z, 3) < 0.2 ? 0x8a8478 : 0xa8a294));
    g.cylY(6, 6, 2.6, 3, 4, 0x5aa84a, 1);
    g.line(6, 4, 6, 10, 11, 8, 0xc8c0b0, 0, 0.6);
    return { grid: g, pivot: [6, 0, 6] };
  },
  herbpile(r, v) {
    const g = new PGrid(18, 5, 12);
    g.box(0, 0, 0, 18, 1, 12, (x, y, z) => wood(x, y, z, 0, 3, 4, 9));
    for (let i = 0; i < 26; i++) g.set(3 + r() * 9, 1 + (r() < 0.3 ? 1 : 0), 3 + r() * 6, pick([0x5a9a3a, 0x7aba5a, 0x3a7a2a, 0xc8a0f0], r()));
    g.box(12, 1, 3, 5, 1, 1, IR[4]); g.box(11, 1, 2, 2, 1, 3, W[0]);
    return { grid: g, pivot: [9, 0, 6] };
  },
  book(r, v) {
    const g = new PGrid(18, 5, 13);
    g.box(0, 0, 0, 18, 1, 13, 0x3a1e3a);
    for (let x = 1; x < 17; x++) for (let z = 1; z < 12; z++) g.set(x, x === 8 || x === 9 ? 1 : 2, z, x === 8 || x === 9 ? 0xb0a080 : (z % 2 === 0 && hv(x, z, 1, 3) < 0.6 && x % 8 > 1 ? 0x7a6a5a : 0xeee2c4));
    // a pressed leaf and a little drawing of a mushroom
    for (const [x, z] of [[12, 4], [13, 5], [12, 6], [14, 6], [13, 7]]) g.set(x, 2, z, 0x5a9a3a);
    g.set(4, 2, 5, 0x3a8cff); g.set(5, 2, 5, 0x3a8cff); g.set(3, 2, 5, 0x3a8cff); g.set(4, 2, 6, 0xd8e8f0); g.set(4, 2, 7, 0xd8e8f0);
    for (let x = 6; x < 11; x++) g.set(x, 1, 12, 0xd8a020);
    return { grid: g, pivot: [9, 0, 6.5] };
  },
  basket(r, v) {
    const g = new PGrid(18, 18, 14);
    for (let y = 0; y < 8; y++) for (let z = 0; z < 14; z++) for (let x = 0; x < 18; x++) {
      const d = Math.hypot((x - 8.5) / 1.2, z - 6.5), R = 5.6 + y * 0.3;
      if (d > R || (d < R - 1.1 && y > 0)) continue;
      g.set(x, y, z, (x + y) % 2 ? 0xb8904a : 0x8a6a34);
    }
    for (let a = 0; a <= Math.PI; a += 0.08) g.set(8.5 + Math.cos(a) * 7.6, 8 + Math.sin(a) * 9, 6.5, (a * 10 | 0) % 2 ? 0xb8904a : 0x8a6a34);
    for (let i = 0; i < 10; i++) { const x = 4 + r() * 9, z = 3 + r() * 7; if (i % 2) g.ell(x, 8, z, 2, 1.3, 2, 0x3a8cff, 2); else g.ell(x, 7.5, z, 1.4, 1.4, 1.4, 0xf08a3a); }
    return { grid: g, pivot: [9, 0, 7] };
  },
  pot(r, v) {
    const g = new PGrid(16, 24, 16);
    for (let y = 0; y < 8; y++) g.cylY(7.5, 7.5, 3.6 + y * 0.32 + (y === 7 ? 0.6 : 0), y, y + 1, (x, yy) => (yy === 7 ? 0xb85a32 : yy % 3 === 0 ? 0x9a4a2a : 0xa8522e));
    g.cylY(7.5, 7.5, 5.2, 7, 8, 0x3a2a1a);
    if (v === 0) {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28, ln = 7 + r() * 6; for (let t = 0; t < 1; t += 0.08) { const x = 7.5 + Math.cos(a) * t * ln * 0.6, y = 8 + Math.sin(t * 2.6) * ln * 0.8, z = 7.5 + Math.sin(a) * t * ln * 0.6; g.set(x, y, z, 0x3a8a3a); if (t > 0.2) g.set(x + Math.cos(a + 1.57), y, z + Math.sin(a + 1.57), 0x5aaa4a); } }
    } else if (v === 1) {
      g.line(7.5, 8, 7.5, 7.5, 18, 7.5, 0x3a7a2a);
      g.ell(7.5, 19, 7.5, 2.6, 2, 2.6, 0xff7ab8, 2); g.ell(7.5, 19.5, 7.5, 1.2, 1.2, 1.2, 0xfff0a0, 3);
      g.ell(5, 12, 7.5, 2, 0.8, 1.2, 0x4a9a3a); g.ell(10, 14, 7.5, 2, 0.8, 1.2, 0x4a9a3a);
    } else {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; g.line(7.5, 8, 7.5, 7.5 + Math.cos(a) * 4, 15 + (i % 2) * 3, 7.5 + Math.sin(a) * 4, 0x6aa86a, 0, 0.6); g.set(7.5 + Math.cos(a) * 4, 16 + (i % 2) * 3, 7.5 + Math.sin(a) * 4, 0xc8e8a0); }
    }
    return { grid: g, pivot: [7.5, 0, 7.5], light: v === 1 ? L([1.0, 0.5, 0.75], 1.4, [0, 0.6, 0], { glow: true }) : null };
  },
  stool(r, v) {
    const g = new PGrid(14, 13, 14);
    g.cylY(7, 7, 6, 11, 13, (x, y, z) => wood(x, y, z, 0, 3, 3, 12));
    for (const a of [0.5, 2.6, 4.7]) g.line(7 + Math.cos(a) * 3, 11, 7 + Math.sin(a) * 3, 7 + Math.cos(a) * 6, 0, 7 + Math.sin(a) * 6, W[1], 0, 0.6);
    return { grid: g, pivot: [7, 0, 7] };
  },
  logs(r, v) {
    const g = new PGrid(26, 16, 14);
    const log = (y, z, x0, x1) => {
      for (let x = x0; x < x1; x++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
        const d = Math.hypot(dy, dz);
        if (d > 3.2) continue;
        const end = x === x0 || x === x1 - 1;
        g.set(x, y + dy, z + dz, end ? (Math.round(d) % 2 ? 0xc89a62 : 0xa87a46) : d > 2.4 ? (hv(x >> 1, dy, dz, 5) < 0.3 ? 0x3a2a1e : 0x5a3e28) : 0x8a6440);
      }
    };
    log(3, 3.5, 0, 24); log(3, 10, 1, 25); log(9, 6.8, 2, 23);
    return { grid: g, pivot: [12, 0, 7] };
  },
});
