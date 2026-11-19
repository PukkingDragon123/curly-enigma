// Voxel models for the items the game never needed in 3D before (./itemModels.js uses them for the
// item stills): ingots, rolled plans, critters, monster drops, kitchen ingredients, crafting bits,
// gear, keepsakes, floor and wall samples. Carved-toy style ("Lamplight Woodcut"): chunky readable
// forms, 3-4 tones a material in bands and patches (no speckle), the detail where the eye goes
// (a stamp on an ingot, a buckle on a bag, the eye of a fish). The renderer lights them.
//
//   BUILD[id](id) → { grid: PGrid, pivot?, orient?: 'stand' | 'lay' | 'flat', lay? }
//                   | { parts: [{ grid, pivot, matrix? }], orient? }
import { PGrid } from '../deep/props/grid.js';
import { ITEMS } from '../data/items.js';
import { METALS } from '../data/weapons.js';
import { drawIconSmall, ICON } from '../gfx/PixelArt.js';
import { hashStr } from '../core/util.js';

// ------------------------------------------------------------------ colour and noise helpers
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t); };
const PLUM = 0x2e1c32, CREAM = 0xfff0d4;
/** A tone of c: k < 0 toward plum shadow, k > 0 toward warm cream (house palette: no black, no white). */
const T = (c, k) => (k < 0 ? mix(c, PLUM, -k) : mix(c, CREAM, k));
const hh = (x, y, z, s = 0) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Coarse patches (blocks of 3³ share a value): material variation without speckle. */
const patch = (x, y, z, s, n = 3) => hh(Math.floor(x / n), Math.floor(y / n), Math.floor(z / n), s);
const G = (w, h, d) => new PGrid(w, h, d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** An ellipsoid with a colour per voxel (fn(x, y, z, nx, ny, nz) → colour | -1). */
const ell = (g, cx, cy, cz, rx, ry, rz, fn, glow = 0) => g.ell(cx, cy, cz, rx, ry, rz, (x, y, z, dx, dy, dz) => (typeof fn === 'function' ? fn(x, y, z, dx, dy, dz) : fn), glow);
/** A tube along a polyline of [x, y, z, r] points (colour fn(t, x, y, z) or a hex). */
function tube(g, pts, c, glow = 0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0, r0] = pts[i], [x1, y1, z1, r1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t, r = r0 + (r1 - r0) * t;
      const tt = (i + t) / (pts.length - 1);
      const R = Math.ceil(r);
      for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy + dz * dz > r * r + 0.3) continue;
        const col = typeof c === 'function' ? c(tt, x + dx, y + dy, z + dz, dx, dy, dz) : c;
        if (col >= 0) g.set(x + dx, y + dy, z + dz, col, glow);
      }
    }
  }
}

// ------------------------------------------------------------------ metal: ingots
/** A cast ingot: a tapered bar, a lip from the mould, a stamped mark on top, hammer-flat ends. */
function ingot(id) {
  const it = ITEMS[id];
  const m = Object.values(METALS).find((mm) => mm.ingot === id);
  const ic = it?.icon?.c;
  const base = Array.isArray(ic) ? ic[0] : m?.color ?? 0xa0a0a8;
  const hi = Array.isArray(ic) ? ic[1] ?? T(base, 0.4) : T(base, 0.4), lo = Array.isArray(ic) ? ic[2] ?? T(base, -0.4) : T(base, -0.4);
  const W = 34, H = 12, D = 18;
  const g = G(W + 2, H + 2, D + 2);
  const seed = hashStr(id);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const ix = Math.round(t * 4), iz = Math.round(t * 3); // the mould's draft: narrower at the top
    for (let z = 1 + iz; z < D + 1 - iz; z++) for (let x = 1 + ix; x < W + 1 - ix; x++) {
      const top = y === H - 1, edgeX = x === 1 + ix || x === W - ix, edgeZ = z === 1 + iz || z === D - iz;
      let c = base;
      if (top) c = mix(base, hi, 0.35);
      if ((edgeX || edgeZ) && y >= H - 2) c = hi; // the polished arris
      if (y === 0) c = lo;
      // a pour-skin of soft waves on the top, set in bands (cast metal, not noise)
      if (top && ((x + Math.round(Math.sin(z * 0.6) * 2)) % 9 === 0)) c = mix(base, lo, 0.25);
      if (!top && !edgeX && !edgeZ && patch(x, y, z, seed, 4) < 0.18) c = mix(base, lo, 0.3);
      g.set(x, y, z, c);
    }
  }
  // the stamp: a little sunken mark (a mole's star for the town's mint) in the middle of the top
  const cx = (W + 2) / 2, cz = (D + 2) / 2, y = H - 1;
  const star = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dx, dz] of star) g.set(Math.round(cx + dx), y, Math.round(cz + dz), -1);
  for (const [dx, dz] of star) g.set(Math.round(cx + dx), y - 1, Math.round(cz + dz), lo);
  // a rim of the stamp (raised ring of 1 voxel)
  for (let a = 0; a < 16; a++) { const x = Math.round(cx + Math.cos(a / 16 * Math.PI * 2) * 4), z = Math.round(cz + Math.sin(a / 16 * Math.PI * 2) * 3.2); g.set(x, y + 1, z, hi); }
  return { grid: g, orient: 'stand' };
}

// ------------------------------------------------------------------ paper: plans, letters, tickets
/** A sheet with the icon's art printed on it, one corner curling up, the far edge rolled. */
function sheet(id, o = {}) {
  const it = ITEMS[id];
  const pc = drawIconSmall(it?.icon || { k: '?' }, hashStr(id), ICON, id);
  const S = 40, R = o.roll ? 4 : 0;
  const g = G(S + 4, R * 2 + 6, S + R * 2 + 6);
  const paper = o.paper ?? 0xe8d8b0, ink = o.ink;
  // sample the art (64 px) onto the sheet (40 cells): nearest, centred
  const art = (u, v) => {
    const X = Math.floor(u * pc.w), Y = Math.floor(v * pc.h);
    const k = (Y * pc.w + X) * 4;
    return pc.d[k + 3] > 100 ? (pc.d[k] << 16) | (pc.d[k + 1] << 8) | pc.d[k + 2] : -1;
  };
  const z0 = R * 2 + 2;
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    // a curled near corner: it lifts off the table
    const cu = x + (S - 1 - z) - (S * 1.55);
    const lift = cu > 0 ? Math.round(cu * 0.55) : 0;
    let c = paper;
    if ((x + z * 3) % 11 === 0) c = T(paper, -0.06); // laid lines
    if (x === 0 || z === S - 1 || x === S - 1) c = T(paper, -0.14); // the deckle edge
    const a = art((x + 0.5) / S, (z + 0.5) / S);
    if (a >= 0) c = ink ? (rgb(a).reduce((p, q) => p + q, 0) / 765 < 0.55 ? ink : T(paper, -0.05)) : a;
    g.set(x + 2, 1 + lift, z + z0, c);
    if (lift) g.set(x + 2, lift, z + z0, T(paper, -0.25)); // the back of the curl
  }
  if (R) {
    // the far edge rolled up in a scroll, a twine tie round it
    for (let x = 0; x < S + 2; x++) for (let a = 0; a < 28; a++) {
      const yy = R + 1 + Math.round(Math.sin(a / 28 * Math.PI * 2) * R), zz = R + 1 + Math.round(Math.cos(a / 28 * Math.PI * 2) * R);
      const tie = Math.abs(x - (S + 2) * 0.62) < 1.5;
      g.set(x + 1, yy, zz, tie ? (a % 4 < 2 ? 0x9a3a28 : 0xc8583a) : a < 14 ? T(paper, -0.08) : paper);
    }
    for (let x = 0; x < S + 2; x++) g.set(x + 1, R + 1, R + 1, T(paper, -0.4)); // the hollow
  }
  return { grid: g, orient: 'flat', lay: { up: 1, along: 0 } };
}
const plan = (id) => sheet(id, { roll: true, paper: 0x3e6aa8, ink: 0xe8f0ff });

// ------------------------------------------------------------------ shells and eggs
function egg(c, spot, size = 1, seed = 1) {
  const rx = 9 * size, ry = 12 * size;
  const g = G(Math.ceil(rx * 2 + 4), Math.ceil(ry * 2 + 3), Math.ceil(rx * 2 + 4));
  const cx = g.w / 2, cz = g.d / 2, cy = ry + 0.5;
  for (let y = 0; y < g.h; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    // an egg's profile: fuller below the middle, a narrower crown
    const r = rx * Math.sqrt(1 - dy * dy) * (1 - 0.16 * dy);
    for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > r) continue;
      let col = dy > 0.5 ? T(c, 0.14) : dy < -0.55 ? T(c, -0.1) : c;
      if (spot && patch(x, y, z, seed, 2) < 0.17) col = spot;
      g.set(x, y, z, col);
    }
  }
  return g;
}

// ------------------------------------------------------------------ critters
function worm() {
  const g = G(44, 12, 30);
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([4 + t * 36, 4 + Math.sin(t * 3.2) * 1.2, 15 + Math.sin(t * 6.3) * 8, 3.2 - Math.abs(t - 0.45) * 2.4]); }
  tube(g, pts, (t, x, y, z) => {
    const ring = Math.floor(t * 34) % 3 === 0;
    if (t > 0.38 && t < 0.48) return 0xd8707a; // the saddle
    return ring ? 0xb85a68 : y > 5 ? 0xe89aa0 : 0xd07884;
  });
  return { grid: g, orient: 'stand' };
}
function beetle(id) {
  const g = G(26, 16, 34);
  const glow = 0x9cff8a;
  // abdomen (glowing tail end), wing cases, head, legs, feelers
  ell(g, 13, 6, 9, 7, 5, 7, (x, y, z) => (y < 4 ? 0x3a5a2a : patch(x, y, z, 3, 2) < 0.3 ? T(glow, 0.2) : glow), 2);
  ell(g, 13, 7, 17, 9, 6.5, 9, (x, y, z, dx) => (Math.abs(x - 13) < 1 ? 0x1a2a20 : y > 10 ? 0x4a7a6a : dx < 0 ? 0x2e5a4a : 0x264a3e));
  ell(g, 13, 6, 27, 4.5, 4, 4, 0x1e2a24);
  for (const s of [-1, 1]) {
    g.set(13 + s * 2, 7, 30, 0xe8f0d0); // eyes
    tube(g, [[13 + s * 2, 8, 30, 0.5], [13 + s * 4, 12, 33, 0.5]], 0x3a4a3a);
    for (const z of [11, 17, 23]) tube(g, [[13 + s * 7, 3, z, 0.6], [13 + s * 11, 1, z + 2, 0.6], [13 + s * 12, 0, z + 1, 0.5]], 0x1e2a24);
  }
  return { grid: g, orient: 'stand' };
}
function fish() {
  const g = G(46, 22, 14);
  const body = 0xc8d0d8, belly = 0xece8e0, back = 0x8a98a8;
  for (let x = 0; x < 36; x++) {
    const t = x / 35, h = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 7 + 1.5, w = h * 0.45;
    for (let y = -Math.ceil(h); y <= Math.ceil(h); y++) for (let z = -Math.ceil(w); z <= Math.ceil(w); z++) {
      if ((y / h) ** 2 + (z / w) ** 2 > 1) continue;
      const scale = (x + (y & 1) * 2) % 4 === 0 && Math.abs(z) >= w - 1;
      g.set(x + 8, 10 + y, 7 + z, y > h * 0.4 ? back : y < -h * 0.3 ? belly : scale ? T(body, -0.12) : body);
    }
  }
  // the tail fin and the back fin, pale and see-through looking
  for (let y = -7; y <= 7; y++) for (let x = 0; x < 9 - Math.abs(y) * 0.6; x++) if (Math.abs(y) > x * 0.5 - 1) g.set(8 - x, 10 + y, 7, x % 3 === 0 ? 0xb8c0d0 : 0xd8dce8);
  for (let x = 16; x < 28; x++) for (let y = 0; y < 4 - Math.abs(x - 21) * 0.4; y++) g.set(x, 18 + y, 7, 0xb8c0d0);
  // a blind fish: milky eyes
  for (const z of [5, 9]) { g.set(39, 12, z, 0xf4f0f0); g.set(40, 12, z, 0xd8e0e8); }
  g.set(43, 9, 7, 0x8a5a6a); g.set(43, 10, 7, 0x8a5a6a); // the mouth
  return { grid: g, orient: 'stand' };
}
function shrimp() {
  const g = G(30, 20, 16);
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.15 + (i / 10) * Math.PI * 1.2; pts.push([15 + Math.cos(a) * 9, 9 + Math.sin(a) * 7, 8, 4.2 - i * 0.28]); }
  tube(g, pts, (t) => (Math.floor(t * 16) % 2 ? 0x9ad8f0 : 0xc8f0ff), 1);
  tube(g, [[24, 13, 8, 0.6], [30, 18, 12, 0.5]], 0xd8f4ff); tube(g, [[24, 13, 8, 0.6], [29, 19, 4, 0.5]], 0xd8f4ff);
  g.set(24, 14, 6, 0x1e2a3a); g.set(24, 14, 10, 0x1e2a3a);
  for (let k = 0; k < 5; k++) tube(g, [[12 + k * 2, 4, 8, 0.6], [12 + k * 2, 1, 5 + (k & 1) * 6, 0.5]], 0x7ac0e0);
  return { grid: g, orient: 'stand' };
}
function grub() {
  const g = G(34, 14, 18);
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.1 + i / 10 * 0.75); pts.push([17 - Math.cos(a) * 12, 4.5, 9 - Math.sin(a) * 5, 4.8 - Math.abs(i - 5) * 0.25]); }
  tube(g, pts, (t, x, y) => (Math.floor(t * 22) % 2 ? 0xf0e0c0 : y > 6 ? 0xfff0d8 : 0xe0ccaa));
  ell(g, pts[10][0] + 1, 5, pts[10][2] - 1, 3, 3, 3, 0xc8782a);
  return { grid: g, orient: 'stand' };
}

// ------------------------------------------------------------------ meat, kitchen things
function meat(red) {
  const g = G(36, 18, 22);
  // the joint: a fat haunch on a bone
  ell(g, 16, 8, 11, 11, 7.5, 9, (x, y, z, dx, dy) => (dy > 0.6 ? T(red, 0.18) : Math.abs(dx) > 0.88 ? 0xf0dcc0 : patch(x, y, z, 4, 3) < 0.25 ? T(red, -0.15) : red));
  tube(g, [[26, 8, 11, 2.2], [33, 9, 11, 2]], 0xf0e6d0);
  ell(g, 33.5, 9, 9.5, 2, 2, 2, 0xf4ecd8); ell(g, 33.5, 9, 12.5, 2, 2, 2, 0xf4ecd8);
  return { grid: g, orient: 'stand' };
}
function pie() {
  const g = G(32, 14, 32), m = 16;
  // a tin, the crimped crust round its rim, a domed lid with steam slits
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x + 0.5 - m, z + 0.5 - m);
    if (d > 15) continue;
    if (d > 13.5) { for (let y = 0; y < 4; y++) g.set(x, y, z, y === 3 ? 0xb0a8a0 : 0x7a726c); continue; } // the tin's rim
    const a = Math.atan2(z + 0.5 - m, x + 0.5 - m);
    if (d > 11.2) { const crimp = Math.floor((a + Math.PI) / (Math.PI * 2) * 22) % 2; for (let y = 0; y < 6 + crimp; y++) g.set(x, y, z, y >= 5 ? 0xe8b060 : 0xc88a44); continue; }
    const h = Math.round(6 + 3 * (1 - (d / 11.2) ** 2));
    const slit = Math.abs(Math.sin(a * 2)) < 0.12 && d > 3 && d < 8;
    for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? (slit ? 0x6a2a1a : 0xd89a50) : 0xc07a3a);
  }
  return { grid: g, orient: 'stand' };
}
function jar(fill, lid, o = {}) {
  const g = G(24, 32, 24), c = 12;
  const glass = 0xd8e4dc;
  g.cylY(c, c, 9, 0, 22, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    const wall = r > 7.9;
    const full = y < 18;
    if (!wall) return full ? (o.band && y % 5 === 0 ? T(fill, -0.2) : fill) : -1;
    // the glass: what's behind it tints it; a lit streak down the near-left side
    if (y === 0) return T(glass, -0.35);
    const streak = Math.abs(Math.atan2(z + 0.5 - c, x + 0.5 - c) - 2.1) < 0.28;
    if (streak && y > 2 && y < 20) return T(glass, 0.3);
    return full ? mix(fill, glass, 0.3) : glass;
  });
  g.cylY(c, c, 7.5, 22, 24, T(glass, -0.1)); // the neck
  g.cylY(c, c, 9.5, 24, 28, (x, y) => (y === 27 ? T(lid, 0.15) : lid)); // a cloth cap
  for (let a = 0; a < 32; a++) { const x = Math.round(c - 0.5 + Math.cos(a / 32 * Math.PI * 2) * 9.6), z = Math.round(c - 0.5 + Math.sin(a / 32 * Math.PI * 2) * 9.6); g.set(x, 25, z, 0x7a4a2a); } // its string
  if (o.label) for (let y = 7; y < 15; y++) for (let x = c - 5; x <= c + 4; x++) g.set(x, y, c + 8, y === 7 || y === 14 ? T(o.label, -0.2) : o.label);
  if (o.dipper) { tube(g, [[c + 2, 14, c - 1, 1], [c + 5, 31, c - 3, 1]], 0xa87040); ell(g, c + 2, 13, c - 1, 2.2, 2.6, 2.2, 0xc88a44); }
  return { grid: g, orient: 'stand' };
}
function sack(c, mouth) {
  const g = G(28, 32, 26);
  ell(g, 14, 12, 13, 12, 12, 11, (x, y, z, dx, dy) => (y % 4 === 0 ? T(c, -0.1) : dy > 0.5 ? T(c, 0.1) : c));
  // gathered neck, a tie, the flour heaped in the open mouth
  g.cylY(14, 13, 5, 22, 27, (x, y) => ((x + y) % 3 === 0 ? T(c, -0.18) : c));
  g.cylY(14, 13, 5.6, 22, 24, 0x8a5a2a);
  if (mouth) ell(g, 14, 28, 13, 4.5, 2.4, 4.5, mouth);
  for (let a = 0; a < 6; a++) g.set(14 + Math.round(Math.cos(a) * 6), 27 + (a & 1), 13 + Math.round(Math.sin(a) * 6), T(c, 0.15)); // the frill
  return { grid: g, orient: 'stand' };
}
function butter() {
  const g = G(30, 14, 26);
  // a waxed paper square with the corners folded up, a block of butter on it with a knife's swipe
  g.box(2, 0, 2, 26, 1, 22, (x, y, z) => ((x + z) % 7 === 0 ? 0xe0d4b8 : 0xf0e6cc));
  for (const [x, z] of [[2, 2], [27, 2], [2, 23], [27, 23]]) g.box(x - (x > 15 ? 2 : 0), 1, z - (z > 15 ? 2 : 0), 3, 2, 3, 0xe8dcc0);
  g.box(7, 1, 6, 16, 9, 13, (x, y, z) => (y === 9 ? (x > 14 && x < 21 && z > 8 ? 0xf8e080 : 0xfff0a0) : y < 3 ? 0xe8c860 : 0xf8dc78));
  for (let x = 15; x < 22; x++) g.set(x, 9, 10 + ((x - 15) >> 2), 0xe8c858);
  return { grid: g, orient: 'stand' };
}
function bottle(c, cork = 0xa8784a, o = {}) {
  const g = G(18, 36, 18), m = 9;
  g.cylY(m, m, 6.5, 0, 18, (x, y, z) => (Math.hypot(x - m, z - m) > 5.6 ? (y === 0 ? T(c, -0.3) : T(c, -0.1)) : c));
  for (let y = 18; y < 24; y++) g.cylY(m, m, 6.5 - (y - 18) * 0.75, y, y + 1, T(c, -0.05));
  g.cylY(m, m, 2.6, 24, 30, T(c, 0.08));
  g.cylY(m, m, 2.2, 30, 34, (x, y) => (y === 33 ? T(cork, 0.15) : cork));
  if (o.label) g.box(m - 4, 6, m + 5, 9, 8, 2, (x, y) => (y === 6 || y === 13 ? T(o.label, -0.25) : o.label));
  return { grid: g, orient: 'stand' };
}
function vial(c, glowC) {
  const g = G(16, 30, 16), m = 8;
  g.cylY(m, m, 5.5, 0, 16, (x, y, z) => (Math.hypot(x - m, z - m) > 4.6 ? 0xc8d8e0 : glowC), 0);
  g.cylY(m, m, 4.5, 1, 14, glowC, 3);
  g.cylY(m, m, 2.4, 16, 23, 0xc8d8e0);
  g.cylY(m, m, 2.2, 23, 27, 0x8a5a3a);
  g.cylY(m, m, 3, 27, 28, 0x6a4024);
  return { grid: g, orient: 'stand' };
}

// ------------------------------------------------------------------ drops
function curved(c, tip, len = 30, bend = 0.9, r0 = 4, o = {}) {
  const g = G(len + 8, len * 0.7 + 8, 14);
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * bend; pts.push([4 + Math.sin(a) * len * 0.8 / bend, 4 + (1 - Math.cos(a)) * len * 0.7 / bend, 7, Math.max(0.5, r0 * (1 - t * 0.9))]); }
  tube(g, pts, (t, x, y, z, dx, dy) => (t > 0.8 ? tip : t < 0.12 && o.root ? o.root : dy > 1 ? T(c, 0.15) : (Math.floor(t * 20) % 5 === 0 ? T(c, -0.1) : c)));
  return { grid: g, orient: 'lay' };
}
function heap(cols, o = {}) {
  const R = o.r ?? 13, H = o.h ?? 9;
  const g = G(R * 2 + 4, H + 4, R * 2 + 4), c = R + 2;
  for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
    const d = Math.hypot(x - c, z - c) / R;
    if (d > 1) continue;
    const top = Math.round(H * (1 - d * d) * (0.85 + 0.15 * patch(x, 0, z, o.seed ?? 3, 3)));
    for (let y = 0; y <= top; y++) g.set(x, y, z, y === top ? cols[0] : cols[Math.min(cols.length - 1, 1 + Math.floor(patch(x, y, z, 7, 2) * (cols.length - 1)))]);
  }
  if (o.lumps) for (let i = 0; i < o.lumps; i++) { const a = i * 2.4, d = 3 + (i % 4) * 2.4; ell(g, c + Math.cos(a) * d, H * 0.6 + (i % 3), c + Math.sin(a) * d, 2.2, 1.8, 2.2, cols[i % cols.length]); }
  return { grid: g, orient: 'stand' };
}
function blob(c, glow = 0) {
  const g = G(28, 20, 28);
  ell(g, 14, 7, 14, 12, 7.5, 12, (x, y, z, dx, dy) => (dy > 0.55 ? T(c, 0.3) : dy < -0.5 ? T(c, -0.25) : c), glow);
  ell(g, 18, 13, 11, 3, 3, 3, T(c, 0.2), glow); // a wobble on top
  g.set(9, 12, 7, CREAM); g.set(10, 12, 7, T(c, 0.6)); // a wet glint
  return { grid: g, orient: 'stand' };
}
function scale(c, edge, glow = 0) {
  const g = G(30, 8, 32);
  for (let z = 0; z < 30; z++) for (let x = 0; x < 28; x++) {
    const t = z / 29, hw = Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * 13 * (1 - Math.max(0, t - 0.7) * 2.2);
    if (Math.abs(x - 14) > hw) continue;
    const ridge = Math.abs(x - 14) < 1.5;
    const h = Math.round(2 + (1 - Math.abs(x - 14) / Math.max(1, hw)) * 2.5);
    const rim = Math.abs(x - 14) > hw - 1.6 || z < 1;
    for (let y = 0; y < h; y++) g.set(x + 1, y, z + 1, rim ? edge : ridge ? T(c, 0.2) : (z % 6 === 0 ? T(c, -0.15) : c), rim ? glow : 0);
  }
  return { grid: g, orient: 'flat', lay: { up: 1, along: 2 } };
}
function skein(c) {
  const g = G(26, 30, 26), m = 13;
  // a wooden spool wound fat with silk, the loose end trailing off it
  g.cylY(m, m, 11, 0, 3, (x, y) => (y === 2 ? 0xa87444 : 0x7a5030));
  g.cylY(m, m, 11, 25, 28, (x, y) => (y === 27 ? 0xb88050 : 0x8a5a34));
  g.cylY(m, m, 4, 3, 25, 0x8a5a34);
  g.cylY(m, m, 9.2, 4, 24, (x, y, z) => {
    const a = Math.atan2(z + 0.5 - m, x + 0.5 - m);
    const band = (y + Math.round(a * 3)) % 4;
    return band === 0 ? T(c, -0.14) : band === 2 ? T(c, 0.12) : c;
  });
  tube(g, [[m + 8, 12, m + 5, 0.5], [m + 11, 6, m + 9, 0.5], [m + 12, 0, m + 11, 0.5]], c);
  return { grid: g, orient: 'stand' };
}
function feather(c, tip) {
  const g = G(14, 6, 44);
  for (let z = 0; z < 42; z++) {
    const t = z / 41, hw = t < 0.1 ? 0 : Math.sin((t - 0.1) / 0.9 * Math.PI) ** 0.7 * 6;
    g.set(7, 1, z + 1, 0xe8dcc0); // the quill
    for (let x = 1; x <= hw; x++) for (const s of [-1, 1]) {
      if ((z + x * 2) % 9 === 0 && x > 2) continue; // a split in the vane
      g.set(7 + s * x, 1 + (x > 4 ? 1 : 0), z + 1, t > 0.82 ? tip : (x + z) % 5 === 0 ? T(c, -0.12) : c);
    }
  }
  return { grid: g, orient: 'flat', lay: { up: 1, along: 2 } };
}
function hide() {
  const g = G(36, 12, 28);
  // a rolled hide tied with a thong: fur outside, pale skin on the cut ends
  for (let x = 4; x < 32; x++) for (let a = 0; a < 40; a++) {
    const r = 4 + (a / 40) * 5;
    const ang = (a / 40) * Math.PI * 2 * 1.6;
    const y = 6 + Math.sin(ang) * r * 0.75, z = 14 + Math.cos(ang) * r;
    const end = x === 4 || x === 31;
    g.set(x, y, z, end ? 0xe0c8a0 : (x + a) % 5 === 0 ? 0x5a3a24 : (a & 3) === 0 ? 0x8a6040 : 0x74502e);
  }
  for (const x of [11, 24]) for (let a = 0; a < 30; a++) { const ang = a / 30 * Math.PI * 2; g.set(x, 6 + Math.sin(ang) * 7, 14 + Math.cos(ang) * 9.4, 0x3a2414); }
  return { grid: g, orient: 'stand' };
}
function plate(c) {
  const g = G(32, 12, 30);
  for (let z = 0; z < 26; z++) for (let x = 0; x < 28; x++) {
    const u = (x - 14) / 14, v = (z - 13) / 13;
    if (u * u * 0.9 + v * v > 1) continue;
    const h = Math.round(5 - (u * u + v * v) * 3);
    const rim = u * u * 0.9 + v * v > 0.78;
    for (let y = h - 2; y <= h; y++) g.set(x + 2, y, z + 2, rim ? T(c, 0.25) : y === h ? (z % 8 === 0 ? T(c, -0.12) : c) : T(c, -0.3));
  }
  for (const [x, z] of [[7, 8], [23, 8], [7, 20], [23, 20]]) g.set(x, 6, z, 0xd8b048); // rivets
  return { grid: g, orient: 'stand' };
}
function trinket() {
  const g = G(30, 10, 30);
  // a string of beads and teeth round a carved wooden disc
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, x = 15 + Math.cos(a) * 11, z = 15 + Math.sin(a) * 11;
    if (i % 2) g.set(x, 1, z, 0x7a5a3a);
    else ell(g, x, 1.5, z, 1.4, 1.4, 1.4, [0xd8483a, 0x4a9ad0, 0xe8c050, 0xf0e8d0][(i / 2) % 4]);
  }
  ell(g, 15, 3, 15, 6, 1.5, 6, (x, y, z) => (Math.abs(x - 15) + Math.abs(z - 15) === 3 ? 0x5a3a20 : 0xa87444));
  return { grid: g, orient: 'stand' };
}
function fluff(c) {
  const g = G(26, 22, 26);
  for (let i = 0; i < 14; i++) { const a = i * 2.39, h = i / 14; ell(g, 13 + Math.cos(a) * 6 * Math.sin(h * Math.PI), 4 + h * 12, 13 + Math.sin(a) * 6 * Math.sin(h * Math.PI), 4.2, 3.6, 4.2, i % 3 ? c : T(c, 0.2)); }
  return { grid: g, orient: 'stand' };
}
function pouch(c, spill, glow = 0) {
  const g = G(28, 26, 26);
  ell(g, 13, 9, 13, 10, 9, 10, (x, y, z, dx, dy) => (y % 5 === 0 ? T(c, -0.12) : dy > 0.4 ? T(c, 0.12) : c));
  g.cylY(13, 13, 4.5, 16, 21, (x, y) => (y === 18 ? 0xc8a050 : T(c, -0.05)));
  for (let a = 0; a < 7; a++) g.set(13 + Math.round(Math.cos(a) * 5.5), 21 + (a & 1), 13 + Math.round(Math.sin(a) * 5.5), T(c, 0.12));
  if (spill) heapInto(g, 22, 0, 20, 5, 3, spill, glow);
  return { grid: g, orient: 'stand' };
}
function heapInto(g, cx, y0, cz, r, h, c, glow = 0) {
  for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, z) / r; if (d > 1) continue; const top = Math.round(h * (1 - d)); for (let y = 0; y <= top; y++) g.set(cx + x, y0 + y, cz + z, (x + z + y) % 3 ? c : T(c, 0.25), glow); }
}

// ------------------------------------------------------------------ crafting bits and plants
function stick() {
  const g = G(44, 10, 14);
  tube(g, [[3, 4, 7, 2.2], [20, 5, 7, 2], [40, 4, 8, 1.6]], (t, x) => ((x % 7) === 0 ? 0x5a3a20 : t > 0.97 || t < 0.02 ? 0xc8a070 : 0x7a5230));
  tube(g, [[22, 5, 7, 1.2], [29, 6, 2, 0.8]], 0x6a4428); // a twig off it
  g.set(30, 6, 2, 0x5a8a3a); g.set(30, 7, 1, 0x6a9a44); // and its last leaf
  return { grid: g, orient: 'lay' };
}
function clay() {
  const g = G(26, 18, 26);
  ell(g, 13, 7, 13, 11, 7, 10, (x, y, z, dx, dy) => (dy > 0.55 ? 0xd88a58 : patch(x, y, z, 2, 3) < 0.25 ? 0xa85a32 : 0xc0703e));
  // thumb prints pressed into the top
  for (const [x, z] of [[10, 11], [16, 15]]) { ell(g, x, 13.5, z, 2.2, 1.2, 2.2, -1); g.set(x, 12, z, 0xa05a34); }
  return { grid: g, orient: 'stand' };
}
function vine() {
  const g = G(30, 14, 30);
  // a coil of cut vine with leaves along it
  for (let i = 0; i < 140; i++) {
    const a = (i / 140) * Math.PI * 2 * 2.2, r = 10 - i / 140 * 4;
    const x = 15 + Math.cos(a) * r, z = 15 + Math.sin(a) * r, y = 2 + (i / 140) * 4;
    g.set(x, y, z, 0x4a7a2a); g.set(x, y + 1, z, 0x5a8a34);
    if (i % 9 === 0) ell(g, x + Math.cos(a) * 2, y + 1.5, z + Math.sin(a) * 2, 2, 0.8, 1.3, i % 2 ? 0x6aaa3a : 0x4e8a30);
  }
  g.box(14, 1, 3, 3, 3, 3, 0xc8e09a); // the cut end
  return { grid: g, orient: 'stand' };
}
function berries() {
  const g = G(30, 26, 26);
  // a sprig: a woody stem, three leaves, a hanging cluster of red berries (one still green)
  tube(g, [[15, 24, 13, 0.9], [14, 16, 13, 0.9], [12, 8, 12, 0.8]], 0x6a4a2a);
  for (const [x, y, z, a] of [[18, 21, 13, 0.4], [10, 19, 11, 2.6], [17, 15, 16, 5.6]]) {
    for (let k = 0; k < 7; k++) ell(g, x + Math.cos(a) * k * 0.9, y - k * 0.2, z + Math.sin(a) * k * 0.9, 1.4, 0.6, 1.4, k > 4 ? 0x4e8a3a : 0x3e7230);
  }
  const pos = [[12, 7, 12], [16, 6, 14], [9, 5, 15], [14, 3, 10], [18, 9, 10], [11, 10, 9], [15, 10, 17]];
  pos.forEach(([x, y, z], i) => ell(g, x, y, z, 2.6, 2.6, 2.6, (X, Y, Z, dx, dy) => (i === 6 ? 0x9ac85a : dx < -0.4 && dy > 0.3 ? 0xff8a8a : dy < -0.5 ? 0x8a1628 : 0xd02a40)));
  return { grid: g, orient: 'stand' };
}
function nut() {
  const g = G(24, 24, 24);
  ell(g, 12, 9, 12, 9, 9, 9, (x, y, z) => ((x + z) % 4 === 0 ? 0x6a5a48 : y > 13 ? 0x9a8a72 : 0x84745e));
  ell(g, 12, 16, 12, 7, 4, 7, (x, y, z) => ((x + z + y) % 3 === 0 ? 0x5a4a30 : 0x6e5a3e)); // the cap
  g.box(11, 19, 11, 2, 3, 2, 0x4a3a28);
  return { grid: g, orient: 'stand' };
}
function puff() {
  const g = G(26, 24, 26);
  ell(g, 13, 10, 13, 10, 9, 10, (x, y, z, dx, dy) => (dy > 0.6 ? 0xf0e8d0 : (x * 3 + z + y * 2) % 11 === 0 ? 0xc8b890 : dy < -0.5 ? 0xb8a880 : 0xe0d4b4));
  ell(g, 13, 19.5, 13, 2, 1, 2, 0x8a7a5a); // the pore on top
  heapInto(g, 13, 0, 13, 4, 1, 0xa8986a);
  return { grid: g, orient: 'stand' };
}
function mossMat(a, b, spark, glow) {
  const g = G(34, 10, 28);
  // a peeled mat of moss, curling at one end, roots dangling off the back
  for (let z = 0; z < 24; z++) for (let x = 0; x < 30; x++) {
    const curl = x > 22 ? Math.round((x - 22) * 0.8) : 0;
    const h = 2 + Math.round(patch(x, 0, z, 9, 3) * 2);
    for (let y = 0; y < h; y++) g.set(x + 2, y + curl, z + 2, y === h - 1 ? (patch(x, y, z, 4, 2) < 0.4 ? b : a) : 0x4a3a24);
    if ((x * 7 + z * 3) % 23 === 0) g.set(x + 2, h + curl, z + 2, spark, glow);
  }
  return { grid: g, orient: 'stand' };
}
function sand() { return heap([0xe8cc90, 0xd8b878, 0xc8a868], { r: 13, h: 9 }); }

// ------------------------------------------------------------------ gear
function helmet(c, lampC) {
  const g = G(36, 26, 38), m = 18, mz = 18;
  // the shell: a dome with a raised ridge front to back and a darker band round the rim
  for (let y = 0; y < 19; y++) for (let z = 0; z < 38; z++) for (let x = 0; x < 36; x++) {
    const dx = (x + 0.5 - m) / 14, dz = (z + 0.5 - mz) / 15, dy = (y + 0.5) / 18;
    const r = dx * dx + dz * dz + dy * dy;
    const ridge = Math.abs(x + 0.5 - m) < 1.6 && r <= 1.12 && dy > 0.25;
    if (r > 1 && !ridge) continue;
    if (r < 0.62 && y > 1) continue; // hollow
    g.set(x, y, z, ridge ? T(c, 0.2) : y < 4 ? T(c, -0.28) : y > 14 ? T(c, 0.1) : c);
  }
  // the brim: all round, wider over the eyes
  for (let z = 0; z < 38; z++) for (let x = 0; x < 36; x++) {
    const dx = (x + 0.5 - m) / 16.5, dz = (z + 0.5 - mz) / (z > mz ? 19 : 16.5);
    const r = dx * dx + dz * dz;
    if (r <= 1 && r > 0.66) g.set(x, 1, z, r > 0.92 ? T(c, -0.35) : T(c, -0.15));
  }
  // the lamp on the brow: a brass can, a lit lens, a bracket
  for (let z = mz + 12; z < mz + 18; z++) for (let y = 7; y < 15; y++) for (let x = m - 4; x <= m + 4; x++) {
    const d = Math.hypot(x - m, y - 11);
    if (d > 4.2) continue;
    const lens = z === mz + 17 && d < 3.2;
    g.set(x, y, z, lens ? lampC : z === mz + 17 ? 0x9a6a1e : d > 3.5 ? 0xc8902e : 0xe6b44a, lens ? 2 : 0);
  }
  g.box(m - 1, 3, mz + 12, 3, 5, 2, 0x6a4612);
  for (const s of [-1, 1]) for (const zz of [mz - 4, mz + 4]) g.set(m + s * 13, 6, zz, 0xe6b44a); // rivets
  return { grid: g, orient: 'stand' };
}
function glove(c, cuff) {
  const g = G(30, 14, 40);
  // a work glove lying palm down: the hand, four fingers, the thumb out to the side, the cuff
  ell(g, 15, 5, 22, 10, 4.5, 9, (x, y, z) => ((x + z) % 9 === 0 ? T(c, -0.15) : c));
  for (let f = 0; f < 4; f++) tube(g, [[8.5 + f * 4.3, 4.5, 28, 2.1], [8 + f * 4.4, 4.2, 35 - Math.abs(f - 1.5) * 1.5, 1.9]], (t) => (t > 0.85 ? T(c, -0.2) : c));
  tube(g, [[24, 4.5, 20, 2.3], [28, 4, 27, 2]], c);
  g.box(6, 1, 6, 19, 8, 8, (x, y, z) => (z === 13 ? T(cuff, -0.3) : y === 8 ? T(cuff, 0.15) : cuff)); // the cuff
  for (let x = 7; x < 24; x += 3) g.set(x, 9, 9, T(cuff, -0.35)); // stitching
  return { grid: g, orient: 'stand' };
}
function boot(c) {
  const g = G(22, 30, 36);
  g.box(4, 0, 2, 14, 3, 32, (x, y, z) => (y === 0 ? 0x2a1c18 : (z % 4 === 0 ? 0x3a2a22 : 0x4a3428))); // the sole, cleated
  ell(g, 11, 6, 24, 7, 5.5, 9, (x, y, z, dx, dy) => (dy > 0.6 ? T(c, 0.15) : c)); // the toe
  g.box(4, 3, 4, 14, 24, 14, (x, y, z) => (y > 23 ? T(c, 0.2) : (z === 17 && y % 3 === 0 ? 0xd8b048 : (y % 6 === 0 ? T(c, -0.1) : c))));
  for (let y = 8; y < 24; y += 4) for (let x = 7; x < 15; x++) g.set(x, y, 18, (x + y) % 2 ? 0xe8d8b0 : 0xc8b890); // laces
  return { grid: g, orient: 'stand' };
}
function suit(c, trim) {
  const g = G(36, 36, 16);
  // a folded suit: the body with its collar, sleeves folded in front, a brass clasp, padded quilting
  g.box(6, 0, 3, 24, 26, 10, (x, y, z) => (y % 5 === 0 || x % 6 === 0 ? T(c, -0.12) : c));
  g.box(10, 26, 3, 16, 5, 9, (x, y) => (y > 28 ? T(trim, 0.1) : trim)); // the hood folded down
  for (const s of [0, 1]) g.box(s ? 21 : 2, 6, 11, 13, 7, 4, (x, y) => (y === 6 ? T(c, -0.2) : T(c, 0.08))); // sleeves across the front
  g.box(16, 16, 12, 4, 4, 2, 0xd8b048);
  return { grid: g, orient: 'stand' };
}
function bag(c, big = 1) {
  const W = Math.round(28 * big), H = Math.round(22 * big), D = Math.round(14 * big);
  const g = G(W + 4, H + 14, D + 6), x0 = 2, z0 = 2;
  // the body: a soft box with rounded corners, stitched seams down the sides
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const ex = Math.max(0, Math.abs(x + 0.5 - W / 2) - (W / 2 - 4)), ez = Math.max(0, Math.abs(z + 0.5 - D / 2) - (D / 2 - 4)), ey = Math.max(0, y + 0.5 - (H - 4));
    if (ex * ex + ez * ez + ey * ey > 16) continue;
    const seam = (x === 2 || x === W - 3) && y % 3 === 1;
    g.set(x0 + x, y, z0 + z, seam ? T(c, 0.3) : y < 2 ? T(c, -0.3) : c);
  }
  // the flap over the front, a strap down it and a brass buckle
  for (let y = Math.round(H * 0.3); y < H; y++) for (let x = 3; x < W - 3; x++) g.set(x0 + x, y, z0 + D, y === Math.round(H * 0.3) ? T(c, -0.35) : T(c, -0.1));
  for (let x = 3; x < W - 3; x++) g.set(x0 + x, H, z0 + D - 1, T(c, -0.15));
  const bx = x0 + Math.round(W / 2) - 2;
  for (let y = Math.round(H * 0.12); y < H; y++) for (let x = bx; x < bx + 4; x++) g.set(x, y, z0 + D + 1, y % 4 === 0 ? T(c, -0.45) : T(c, -0.3));
  for (let y = Math.round(H * 0.3) - 2; y < Math.round(H * 0.3) + 3; y++) for (let x = bx - 1; x < bx + 5; x++) if (x === bx - 1 || x === bx + 4 || y === Math.round(H * 0.3) - 2 || y === Math.round(H * 0.3) + 2) g.set(x, y, z0 + D + 2, y === Math.round(H * 0.3) - 2 ? 0xf8dc86 : 0xc8902e);
  // the shoulder strap, arched over the top
  for (let a = 0; a <= 40; a++) {
    const t = a / 40 * Math.PI, X = x0 + W / 2 + Math.cos(t) * (W / 2 - 3), Y = H - 1 + Math.sin(t) * 12;
    for (let z = Math.round(D / 2) - 1; z <= Math.round(D / 2) + 1; z++) g.set(X, Y, z0 + z, z === Math.round(D / 2) ? T(c, -0.2) : T(c, -0.32));
  }
  return { grid: g, orient: 'stand' };
}

// ------------------------------------------------------------------ keepsakes and samples
function coin(c) {
  const g = G(28, 8, 28), m = 14;
  for (let z = 0; z < 28; z++) for (let x = 0; x < 28; x++) {
    const d = Math.hypot(x + 0.5 - m, z + 0.5 - m);
    if (d > 12) continue;
    const rim = d > 10.2, star = Math.abs(x - m) + Math.abs(z - m) < 5 && ((x - m) * (z - m) === 0 || Math.abs(x - m) === Math.abs(z - m));
    for (let y = 0; y < (rim ? 4 : 3); y++) g.set(x, y, z, y === 0 ? T(c, -0.3) : rim ? T(c, 0.2) : star && y === 2 ? T(c, 0.35) : c);
  }
  return { grid: g, orient: 'stand' };
}
function weights() {
  const g = G(40, 20, 24);
  // three brass bell weights in a row, small to big, on a wooden tray
  g.box(1, 0, 3, 38, 2, 18, (x, y, z) => (y === 1 ? (z % 5 === 0 ? 0x6a4428 : 0x8a5a34) : 0x5a3a20));
  [[8, 4], [19, 5.5], [32, 7]].forEach(([x, r]) => {
    g.cylY(x, 12, r, 2, 2 + r * 1.6, (X, Y) => (Y === Math.floor(2 + r * 1.6) - 1 ? 0xf8dc86 : X < x ? 0xe6b44a : 0xc8902e));
    g.cylY(x, 12, 1.4, 2 + r * 1.6, 4 + r * 1.6, 0xc8902e);
  });
  return { grid: g, orient: 'stand' };
}
function tile(id) {
  const it = ITEMS[id];
  const pc = drawIconSmall(it?.icon || { k: '?' }, hashStr(id), ICON, id);
  // two square samples stacked, slightly askew, the top one patterned from the art
  const g = G(36, 10, 36);
  const art = (u, v) => { const k = (Math.floor(v * pc.h) * pc.w + Math.floor(u * pc.w)) * 4; return pc.d[k + 3] > 100 ? (pc.d[k] << 16) | (pc.d[k + 1] << 8) | pc.d[k + 2] : -1; };
  const base = it?.icon?.c ?? 0x8a6a4a;
  for (let z = 0; z < 26; z++) for (let x = 0; x < 26; x++) for (let y = 0; y < 3; y++) g.set(x + 4, y, z + 6, y === 2 ? T(base, -0.1) : T(base, -0.35));
  for (let z = 0; z < 26; z++) for (let x = 0; x < 26; x++) {
    const a = art(0.2 + x / 26 * 0.6, 0.2 + z / 26 * 0.6);
    for (let y = 3; y < 6; y++) g.set(x + 7, y, z + 3, y === 5 ? (a >= 0 ? a : base) : T(base, -0.3));
  }
  return { grid: g, orient: 'stand' };
}


// ------------------------------------------------------------------ gems and crystals
/** A cut gem (its cut as the ore core's: brilliant, oval, square, round cabochon, amber blob). */
function gem(id) {
  const ic = ITEMS[id]?.icon || {};
  const [main, light, dark] = ic.c || [0xd84a4a, 0xffa0a0, 0x8a1818];
  const cut = ic.cut || 'oval', glow = ic.glow ? 2 : 0;
  const S = 34, g = G(S, 26, S), m = S / 2;
  const R = 13, rz = cut === 'oval' ? 9.5 : cut === 'square' ? 10 : 13;
  const crownH = cut === 'round' ? 10 : cut === 'blob' ? 9 : 5, pavH = cut === 'round' ? 2 : cut === 'blob' ? 7 : 11;
  const y0 = pavH; // the girdle
  for (let y = 0; y < y0 + crownH + 1; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const ux = (x + 0.5 - m) / R, uz = (z + 0.5 - m) / rz;
    const a = Math.atan2(uz, ux);
    let k; // the girdle shape's "radius" in units
    if (cut === 'square') k = Math.max(Math.abs(ux), Math.abs(uz)) * 0.86 + (Math.abs(ux) + Math.abs(uz)) * 0.14;
    else if (cut === 'blob') k = Math.hypot(ux, uz) * (1 + 0.12 * Math.sin(a * 3 + 1));
    else k = Math.hypot(ux, uz);
    let lim;
    if (y < y0) lim = (y + 0.5) / y0; // the pavilion: to a point (a keel) below
    else { const t = (y - y0 + 0.5) / crownH; lim = cut === 'round' || cut === 'blob' ? Math.sqrt(Math.max(0, 1 - t * t)) : 1 - t * (1 - (cut === 'square' ? 0.6 : 0.5)); }
    if (cut === 'round' && y < y0) lim = 0.92 + 0.08 * (y / y0);
    if (k > lim) continue;
    const sector = Math.floor(((a + Math.PI) / (Math.PI * 2)) * (cut === 'square' ? 4 : 8) + (y < y0 ? 0.5 : 0)) & 1;
    let col;
    if (y >= y0 + crownH - 1 && cut !== 'round' && cut !== 'blob') col = T(light, 0.15); // the table
    else if (y === y0 && k > lim - 0.12) col = T(main, 0.25); // the girdle line
    else if (y < y0) col = sector ? dark : main;
    else col = sector ? main : light;
    if (cut === 'square' && y >= y0 && Math.round(k * 10) % 3 === 0) col = T(col, -0.12); // the step cut's steps
    if (cut === 'round' || cut === 'blob') col = y > y0 + crownH * 0.55 ? light : y < y0 + 2 ? dark : main;
    if (ic.bug && Math.abs(x - m) < 3 && Math.abs(z - m) < 2 && y > y0 && y < y0 + 4) col = 0x3a2412; // the bug in the amber
    g.set(x, y, z, col, glow && y >= y0 ? 1 : 0);
  }
  return { grid: g, orient: 'stand' };
}

/** A cluster of hexagonal crystal points growing from a scrap of rock. */
function crystals(id) {
  const ic = ITEMS[id]?.icon || {};
  const [main, light, dark] = ic.c || [0xb4a0ff, 0xe8dcff, 0x6a4ab8];
  const glow = ic.glow || id === 'bioxide' || id === 'frostite' ? 2 : 0;
  const shard = ic.k === 'shard';
  const g = G(36, 40, 36), m = 18;
  const seed = hashStr(id);
  // the rock bed: a flat lumpy scrap
  const rock = ic.dark ? 0x3a3048 : 0x6a625a;
  for (let z = 0; z < 36; z++) for (let x = 0; x < 36; x++) {
    const d = Math.hypot((x - m) / 13, (z - m) / 11);
    if (d > 1) continue;
    const h = Math.round(4 * (1 - d * d) + patch(x, 0, z, seed, 3) * 2);
    for (let y = 0; y <= h; y++) g.set(x, y, z, y === h ? T(rock, 0.15) : y < 2 ? T(rock, -0.3) : rock);
  }
  // the points: a big one leaning, smaller ones round it
  const pts = shard ? [[m, 4, m, 30, 4.5, -0.25, 0.1, 0]] : [[m, 3, m, 30, 4.6, -0.12, 0.08, 0], [m - 6, 3, m + 2, 19, 3.2, -0.42, 0.18, 1], [m + 6, 3, m - 1, 17, 3, 0.4, -0.1, 2], [m + 2, 3, m + 6, 13, 2.4, 0.15, 0.45, 3], [m - 3, 3, m - 6, 11, 2.2, -0.2, -0.45, 4]];
  for (const [bx, by, bz, L, r, lx, lz, k] of pts) {
    const tw = k * 0.7;
    for (let t = 0; t < L; t++) {
      const cx = bx + lx * t, cz = bz + lz * t, y = by + t;
      const tip = L * 0.28, allow = t > L - tip ? r * (L - t) / tip : r;
      for (let dz = -Math.ceil(r) - 1; dz <= Math.ceil(r) + 1; dz++) for (let dx = -Math.ceil(r) - 1; dx <= Math.ceil(r) + 1; dx++) {
        const ang = Math.atan2(dz, dx) + tw;
        const sec = ((ang % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6;
        const radial = Math.hypot(dx, dz) * Math.cos(sec);
        if (radial > allow + 0.2) continue;
        const face = Math.floor((ang + 10 * Math.PI) / (Math.PI / 3)) % 3;
        let col = face === 0 ? light : face === 1 ? main : dark;
        if (t > L - tip) col = face === 2 ? main : T(light, 0.2);
        else if (t < 3) col = T(dark, -0.1);
        if (shard && face === 0 && t % 7 === 0) col = T(light, 0.3);
        g.set(cx + dx, y, cz + dz, col, glow && t > 2 ? (t > L - tip ? 2 : 1) : 0);
      }
    }
  }
  return { grid: g, orient: 'stand' };
}

// ------------------------------------------------------------------ the table
const B = {};
const each = (ids, fn) => { for (const id of ids) B[id] = fn; };
each(['copper_ingot', 'tin_ingot', 'bronze_ingot', 'iron_ingot', 'steel_ingot', 'silver_ingot', 'gold_ingot', 'mithril_ingot', 'moonsilver_ingot', 'adamant_ingot', 'starmetal_ingot'], ingot);
for (const id of Object.keys(ITEMS)) {
  const it = ITEMS[id];
  if (it.cat === 'ingot' && !B[id]) B[id] = ingot;
  if (it.cat === 'blueprint') B[id] = plan;
  if (it.cat === 'floor' || it.cat === 'wallpaper') B[id] = tile;
  if ((it.cat === 'gem' || it.cat === 'mineral') && it.icon?.k === 'gem') B[id] = gem;
  if ((it.cat === 'gem' || it.cat === 'mineral') && (it.icon?.k === 'crystal' || it.icon?.k === 'shard') && id !== 'salt_crystal') B[id] = crystals;
}
Object.assign(B, {
  // critters and kitchen
  worm, glow_beetle: beetle, blind_fish: fish, frost_shrimp: shrimp, grub,
  egg: () => ({ grid: egg(0xf4ead4, null, 0.8), orient: 'stand' }),
  dino_egg: () => ({ grid: egg(0xd8e0c0, 0x6a8a4a, 1.1, 5), orient: 'stand' }),
  drake_egg: () => ({ grid: egg(0xe0703a, 0x8a2e1a, 1.1, 9), orient: 'stand' }),
  dino_meat: () => meat(0xc84a3a), drake_meat: () => meat(0xa83a2e),
  honey: () => jar(0xe8a020, 0xd8c8a0, { dipper: true }),
  flour: () => sack(0xd8c49a, 0xfaf4e8),
  butter,
  rootbeer: () => bottle(0x6a3418, 0xa8784a, { label: 0xe8d8b0 }),
  tea_flask: () => bottle(0x5a7a8a, 0x8a5a3a, { label: 0xc8b890 }),
  hearty_pie: pie,
  grub_bar: () => ({ grid: (() => { const g = G(34, 10, 18); g.box(2, 0, 3, 30, 7, 12, (x, y, z) => (x < 6 || x > 27 ? ((x + y) % 2 ? 0xc8a050 : 0xa88038) : y === 6 ? (z % 3 === 0 ? 0x8a5a2a : 0xa86e34) : 0x9a6430)); return g; })(), orient: 'stand' }),
  // drops
  dust_fluff: () => fluff(0xa8a0a0), bat_guano: () => heap([0x5a4a3a, 0x3e3226, 0x4a3c2e], { r: 11, h: 7, lumps: 6 }),
  crab_shell: () => plate(0xc8583a), armor_plate: () => plate(0x8a929e),
  slug_slime: () => blob(0x9ac848), slime_gel: () => blob(0x6ad0a0, 1),
  spider_silk: () => skein(0xf0eef0), spark_dust: () => pouch(0x5a6a8a, 0xbff0ff, 2),
  ember_scale: () => scale(0x8a2a1a, 0xffa040, 2), drake_scale: () => scale(0x4a6a3a, 0x9ac868),
  wisp_essence: () => vial(0xc8d8e0, 0xbfe6ff),
  kobold_trinket: trinket, beast_hide: hide,
  troll_tusk: () => curved(0xe8dcc0, 0xf8f0e0, 34, 1.0, 4.2, { root: 0xb89a7a }),
  spider_fang: () => curved(0x2a2228, 0x8a3a5a, 24, 1.3, 3),
  raptor_claw: () => curved(0x3a3230, 0xe8e0d0, 26, 1.5, 3.4),
  tyrant_tooth: () => curved(0xf0e6cc, 0xfff8e8, 28, 0.6, 5, { root: 0xa87a5a }),
  wraith_ash: () => heap([0x9a96a0, 0x7a7680, 0x5a5664], { r: 12, h: 6 }),
  ptero_feather: () => feather(0x8a6a4a, 0x3a2a2a),
  // crafting and plants
  stick, sand_pile: sand, clay_lump: clay, vine_cut: vine,
  cave_berry: berries, stone_nut: nut, spore_puff: puff,
  sparkmoss: () => mossMat(0x2a6aa0, 0x3a8ad0, 0xc8f4ff, 3), glow_moss: () => mossMat(0x3a8a3a, 0x5ab84a, 0xb8ffb0, 2),
  // gear
  helmet_basic: () => helmet(0xc8a03a, 0xffe8a0), helmet_brass: () => helmet(0xd8b048, 0xfff0b0),
  helmet_lumite: () => helmet(0x4a8a5a, 0xb8ffb0), helmet_sun: () => helmet(0xe8b830, 0xfff4a0),
  rubber_gloves: () => glove(0xe0c03a, 0x8a6a2a), ember_mitts: () => glove(0xc8502a, 0x5a2a1a), frost_gauntlets: () => glove(0x8ab8d8, 0x4a6a8a),
  ember_mitten: () => glove(0xd86a3a, 0x7a3a1a),
  heat_suit: () => suit(0xb8a8a0, 0xd8b048), thermal_suit: () => suit(0x6a8ab0, 0xe0e8f0),
  grip_boots: () => boot(0x6a4a2a), spring_boots: () => boot(0x4a6a8a),
  bag_small: () => bag(0xb89a6a, 0.85), bag_medium: () => bag(0x8a5a32, 0.95), bag_large: () => bag(0x6a4428, 1.05), bag_huge: () => bag(0x5a3a22, 1.15), bag_bottomless: () => bag(0x4a2e4a, 1.15),
  rocco_purse: () => pouch(0x6a2a4a, 0xf2c23a),
  // keepsakes
  star_coin: () => coin(0xe8b840), brass_weights: weights,
  exit_ticket: (id) => sheet(id, { paper: 0xf0dca0 }), loam_letter: (id) => sheet(id, { paper: 0xe8dcc0 }), sun_hymn: (id) => sheet(id, { paper: 0xd8ccb0 }),
});

// ------------------------------------------------------------------ relics of the old ones
const STONE = 0x8a8478, GOLD = 0xe0b040, BRONZE = 0xa8743a, PATINA = 0x5aa08a;
const RELIC = {
  idol() {
    const g = G(24, 32, 22), m = 12;
    g.box(5, 0, 4, 14, 3, 14, T(STONE, -0.2)); // the plinth
    ell(g, m, 10, 11, 7, 8, 6.5, (x, y) => (y < 5 ? T(STONE, -0.1) : STONE)); // the seated body
    ell(g, m, 21, 11, 5.5, 5, 5, T(STONE, 0.1)); // the head
    for (let a = 0; a < 10; a++) { const t = a / 10 * Math.PI * 2; tube(g, [[m, 21, 16, 0.6], [m + Math.cos(t) * 3.2, 21 + Math.sin(t) * 3.2, 18, 0.6]], 0xd88a8a); } // the star nose
    for (const s of [-1, 1]) { g.set(m + s * 2.5, 23, 15, 0x2a2026); tube(g, [[m + s * 6, 12, 13, 1.6], [m + s * 3, 8, 16, 1.5]], STONE); } // eyes, paws
    return { grid: g, orient: 'stand' };
  },
  disc() {
    const g = G(30, 6, 30), m = 15;
    for (let z = 0; z < 30; z++) for (let x = 0; x < 30; x++) {
      const d = Math.hypot(x + 0.5 - m, z + 0.5 - m), a = Math.atan2(z + 0.5 - m, x + 0.5 - m);
      const ray = d > 9 && d < 14 && Math.floor((a + Math.PI) / (Math.PI * 2) * 16) % 2 === 0;
      if (d > 9 && !ray) continue;
      for (let y = 0; y < (d < 9 ? 3 : 2); y++) g.set(x, y, z, y === 0 ? T(GOLD, -0.3) : d < 4 ? T(GOLD, 0.25) : d > 7.5 && d < 9 ? T(GOLD, -0.12) : GOLD);
    }
    return { grid: g, orient: 'stand' };
  },
  ewer() {
    const g = G(30, 32, 24), m = 13;
    g.cylY(m, 12, 6, 0, 2, T(BRONZE, -0.2));
    for (let y = 2; y < 26; y++) { const r = y < 16 ? 4 + Math.sin((y - 2) / 14 * Math.PI) * 5 : 3.2; g.cylY(m, 12, r, y, y + 1, (x, yy, z) => (yy % 7 === 0 ? PATINA : (x + z) % 9 === 0 ? T(BRONZE, -0.15) : BRONZE)); }
    tube(g, [[m + 6, 16, 12, 1.8], [m + 11, 22, 12, 1.2], [m + 14, 25, 12, 0.9]], BRONZE); // the snout-spout
    tube(g, [[m - 6, 22, 12, 1], [m - 11, 18, 12, 1], [m - 8, 9, 12, 1]], T(BRONZE, -0.1)); // the handle
    return { grid: g, orient: 'stand' };
  },
  lens() {
    const g = G(36, 8, 24), m = 12;
    for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) { const d = Math.hypot(x + 0.5 - m, z + 0.5 - m); if (d > 11) continue; const ring = d > 8.5; for (let y = 0; y < (ring ? 4 : 3); y++) g.set(x, y, z, ring ? (y === 3 ? T(BRONZE, 0.2) : BRONZE) : y === 2 ? (x < m && z < m ? 0xd8f0f0 : 0x9ac8d0) : 0x7aa8b8); }
    g.box(22, 1, 10, 12, 2, 4, (x) => (x % 4 === 0 ? T(BRONZE, -0.2) : BRONZE)); // the handle
    return { grid: g, orient: 'stand' };
  },
  tablet() {
    const g = G(30, 34, 10);
    g.box(2, 0, 2, 26, 32, 6, (x, y, z) => (z === 7 && ((x % 6 === 2 && y % 5 !== 0 && y > 4 && y < 28) || (y % 8 === 4 && x > 4 && x < 25 && x % 6 !== 2)) ? T(STONE, -0.4) : y > 30 ? T(STONE, 0.12) : STONE));
    for (const [x, y] of [[27, 31], [2, 30], [27, 0]]) g.set(x, y, 4, -1); // chipped corners
    return { grid: g, orient: 'stand' };
  },
  crown() {
    const g = G(30, 22, 30), m = 15;
    for (let y = 0; y < 18; y++) for (let a = 0; a < 80; a++) {
      const t = a / 80 * Math.PI * 2, point = Math.abs(((a % 10) - 5)) / 5;
      if (y > 7 && y > 7 + (1 - point) * 10) continue;
      g.set(m + Math.cos(t) * 11, y, m + Math.sin(t) * 11, y < 2 ? T(GOLD, -0.25) : y < 7 ? GOLD : T(GOLD, 0.15));
    }
    for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; ell(g, m + Math.cos(t) * 11.6, 4.5, m + Math.sin(t) * 11.6, 1.4, 1.4, 1.4, 0xff7a2a, 2); }
    return { grid: g, orient: 'stand' };
  },
  mirror() {
    const g = G(26, 40, 8), m = 13;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 26; x++) {
      const d = Math.hypot(x + 0.5 - m, y + 0.5 - 26);
      if (d <= 12) for (let z = 1; z < 6; z++) g.set(x, y, z, d > 9.5 ? (z === 5 ? T(GOLD, 0.2) : GOLD) : z === 5 ? (x + y > 38 ? 0xfff0c0 : 0xe8d8a0) : T(GOLD, -0.3));
      else if (y < 15 && Math.abs(x + 0.5 - m) < 2) for (let z = 2; z < 5; z++) g.set(x, y, z, y % 4 === 0 ? T(GOLD, -0.2) : GOLD);
    }
    return { grid: g, orient: 'stand' };
  },
  mask() {
    const g = G(28, 32, 12), m = 14, ice = 0xb8e0f0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 28; x++) {
      const dx = (x + 0.5 - m) / 12, dy = (y + 0.5 - 15) / 15;
      if (dx * dx + dy * dy > 1) continue;
      const eye = Math.abs(Math.abs(x + 0.5 - m) - 5) < 2.5 && Math.abs(y + 0.5 - 19) < 2;
      if (eye) continue;
      const depth = Math.round(4 * (1 - dx * dx));
      for (let z = 1; z <= 1 + depth; z++) g.set(x, y, z, z === 1 + depth ? (Math.abs(x + 0.5 - m) < 1 && y > 8 && y < 18 ? T(ice, 0.25) : y < 8 && x % 4 === 0 ? 0x8ac0e0 : ice) : T(ice, -0.3));
    }
    return { grid: g, orient: 'stand' };
  },
  key() {
    const g = G(14, 6, 44), m = 7;
    g.box(m - 1, 1, 12, 2, 2, 28, (x, y, z) => (z % 6 === 0 ? T(0xc8d8f0, -0.2) : 0xc8d8f0)); // the shaft
    g.box(m - 1, 1, 38, 5, 2, 2, 0xc8d8f0); g.box(m + 2, 1, 35, 2, 2, 3, 0xc8d8f0); // the bit
    for (let a = 0; a < 5; a++) { const t = a / 5 * Math.PI * 2 - Math.PI / 2; tube(g, [[m, 2, 6, 1.4], [m + Math.cos(t) * 5.5, 2, 6 + Math.sin(t) * 5.5, 0.8]], 0xe8f0ff, 1); } // the star bow
    return { grid: g, orient: 'flat', lay: { up: 1, along: 2 } };
  },
  orb() {
    const g = G(26, 30, 26), m = 13;
    g.cylY(m, m, 6, 0, 3, (x, y) => (y === 2 ? T(BRONZE, 0.15) : BRONZE)); g.cylY(m, m, 3, 3, 6, T(BRONZE, -0.1));
    ell(g, m, 16, m, 10, 10, 10, (x, y, z, dx, dy) => (dy > 0.55 && dx < 0 ? 0xc8a0ff : Math.sin((x + y * 0.6) * 0.5) > 0.6 ? 0x9a5aff : dy < -0.4 ? 0x3a1a6a : 0x6a3ac0), 1);
    return { grid: g, orient: 'stand' };
  },
  amulet() {
    const g = G(30, 8, 36), m = 15;
    for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI; g.set(m + Math.cos(t) * 12, 1, 4 + (1 - Math.sin(t)) * 20, i % 2 ? GOLD : T(GOLD, -0.3)); } // the chain
    for (let z = 0; z < 16; z++) for (let x = 0; x < 18; x++) {
      const u = (x + 0.5 - 9) / 8, v = (z + 0.5 - 6) / 8;
      const heart = (u * u + v * v - 1) ** 3 - u * u * (-v) ** 3 < 0;
      if (!heart) continue;
      for (let y = 0; y < 4; y++) g.set(x + 6, y, z + 18, y === 3 ? (u < -0.2 && v < 0 ? 0xff8a8a : 0xd8303a) : y === 0 ? GOLD : 0xa8202a, y >= 2 ? 1 : 0);
    }
    return { grid: g, orient: 'stand' };
  },
};
for (const id of Object.keys(ITEMS)) if (ITEMS[id].cat === 'relic' && RELIC[ITEMS[id].icon?.t]) B[id] = RELIC[ITEMS[id].icon.t];
export const BUILD = B;
