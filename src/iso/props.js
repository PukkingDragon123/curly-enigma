// Deep Town's street furniture at 1/32 voxels: barrels, crates, sacks, carts, benches,
// lamp posts, hanging lanterns, notice boards, mailboxes, a well, market stalls, mushrooms,
// crystals, stalagmites, rubble, ladders, ropes and the rest. Every builder returns
// { obj, lights?: [{x,y,z,...}] (local), shadow?: {rx, rz, k}, r?: collision radius }.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, cloth, straw, line, sag, ring, M32, G32, M16, G16, group, at, mulc, mixc, h3, sp3, S32 } from './kit.js';
import { hash2 } from './surface.js';
import { makeRng } from '../core/util.js';

// ---------------------------------------------------------------- barrels, crates, sacks
const FILL = {
  water: (g, cx, cz, r, y) => ring(g, cx, cz, 0, r, y, y + 1, (x, yy, z) => (h3(x, yy, z, 4) < 0.12 ? 0x9fd6ff : 0x3a7ab0)),
  apples: (g, cx, cz, r, y) => { for (let k = 0; k < 9; k++) { const a = k * 2.4, d = (k % 3) * r * 0.32; g.ellipsoid(cx + Math.cos(a) * d, y + 1.5, cz + Math.sin(a) * d, 2.4, 2.2, 2.4, (x, yy, z) => (yy > y + 2.2 && x < cx + Math.cos(a) * d ? 0xf06a5a : k % 4 ? 0xc8343a : 0x8ac04a)); } },
  shrooms: (g, cx, cz, r, y) => { for (let k = 0; k < 8; k++) { const a = k * 2.1, d = (k % 3) * r * 0.3; g.ellipsoid(cx + Math.cos(a) * d, y + 1, cz + Math.sin(a) * d, 2.6, 1.6, 2.6, k % 3 ? 0xe0c8a0 : 0xc8805a); } },
  coal: (g, cx, cz, r, y) => ring(g, cx, cz, 0, r, y, y + 2, (x, yy, z) => (h3(x >> 1, yy, z >> 1, 6) < 0.15 ? 0x5a5a66 : 0x1e1c22)),
  ore: (g, cx, cz, r, y) => ring(g, cx, cz, 0, r, y, y + 2, (x, yy, z) => [0xd9773f, 0x6e645a, 0x8a8078, 0xc4876c, 0xf2c23a][Math.floor(h3(x >> 1, yy, z >> 1, 6) * 5)]),
};

/** Wooden barrel. o: {color, fill: 'water'|'apples'|'shrooms'|'coal'|'ore'|null, lid, h} */
export function barrel(seed = 0, o = {}) {
  const H = o.h ?? 28, R = 10.5;
  const g = new VoxelGrid(26, H + 4, 26);
  const base = o.color ?? C.wood;
  const cx = 13, cz = 13;
  for (let y = 0; y < H; y++) {
    const r = R - 1.2 + Math.sin((y / (H - 1)) * Math.PI) * 1.4;
    ring(g, cx, cz, r - 2.2, r, y, y + 1, (x, yy, z, a) => {
      const hoop = yy === 3 || yy === 4 || yy === H - 5 || yy === H - 4 || (H > 22 && (yy === Math.floor(H / 2) || yy === Math.floor(H / 2) + 1) && seed % 2);
      if (hoop) {
        const st = Math.floor((a + Math.PI) / (Math.PI / 4));
        return (Math.abs(((a + Math.PI) / (Math.PI / 4)) - st - 0.5) < 0.12) ? C.ironL : mulc(C.iron, 0.975 * sp3(x, yy, z, 2));
      }
      const stave = Math.floor((a + Math.PI) / (Math.PI / 7) + 0.5);
      const sf = (a + Math.PI) / (Math.PI / 7) + 0.5 - stave;
      let c = mulc(base, 0.86 + hash2(stave, seed, 3) * 0.24);
      if (sf < 0.09) c = mulc(base, 0.66);
      return c;
    });
  }
  // bottom + lid
  ring(g, cx, cz, 0, R - 1.6, 0, 1, mulc(base, 0.7));
  if (o.lid !== false && !o.fill) {
    ring(g, cx, cz, 0, R - 2.4, H - 2, H - 1, wood(mulc(base, 1.08), { axis: 'z', across: 'x', pw: 5, seed: seed + 7 }));
    g.box(cx + 3, H - 1, cz - 2, 2, 1, 2, mulc(base, 0.6)); // bung
    g.box(cx - 6, H - 1, cz - 1, 9, 1, 1, mulc(base, 0.75)); // batten
  } else if (o.fill) FILL[o.fill]?.(g, cx, cz, R - 2.6, H - 4);
  return { obj: M32(g, [cx, 0, cz]), shadow: { rx: 0.4, rz: 0.36, k: 0.6 }, r: 0.34 };
}

/** Plank crate with corner posts, a brace and a stencil. o: {open, goods: color[], w, h} */
export function crate(seed = 0, o = {}) {
  const W = o.w ?? 22, H = o.h ?? 20;
  const g = new VoxelGrid(W, H + 4, W);
  const base = o.color ?? C.woodL;
  const wf = wood(base, { axis: 'x', across: 'y', pw: 5, seed });
  const wf2 = wood(base, { axis: 'z', across: 'y', pw: 5, seed: seed + 3 });
  g.box(1, 0, 1, W - 2, H - 1, W - 2, (x, y, z) => (x === 1 || x === W - 2 ? wf2(x, y, z) : wf(x, y, z)));
  if (o.open) {
    g.box(3, 3, 3, W - 6, H - 3, W - 6, -1);
    for (let x = 3; x < W - 3; x++) for (let z = 3; z < W - 3; z++) g.set(x, H - 4, z, straw(seed)(x, H, z));
    for (let k = 0; k < 7; k++) {
      const gx = 6 + (k * 5) % (W - 11), gz = 6 + (k * 7) % (W - 11);
      g.ellipsoid(gx, H - 2.5, gz, 2.6, 2.2, 2.6, (o.goods || [0xf0a050, 0xe8904a, 0x8ac04a])[k % 3]);
    }
  } else {
    g.box(1, H - 1, 1, W - 2, 1, W - 2, wood(mulc(base, 1.06), { axis: 'x', across: 'z', pw: 5, seed: seed + 9 }));
  }
  // corner posts
  for (const [x, z] of [[0, 0], [W - 3, 0], [0, W - 3], [W - 3, W - 3]]) g.box(x, 0, z, 3, H, 3, beam(C.wood, 'y', seed + x));
  // braces on the front (+z) and right (+x) faces
  for (let k = 0; k < H - 4; k++) {
    const t = k / (H - 5);
    g.set(3 + Math.round(t * (W - 7)), 2 + k, W - 1, mulc(C.wood, 0.92));
    g.set(4 + Math.round(t * (W - 7)), 2 + k, W - 1, mulc(C.wood, 0.92));
    g.set(W - 1, 2 + k, W - 4 - Math.round(t * (W - 7)), mulc(C.wood, 0.85));
  }
  // nail heads + a red stencil
  for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) g.set(x, y, W - 1, C.ironL);
  if (seed % 3 === 0) for (let k = -2; k <= 2; k++) { g.set(W - 1, Math.round(H / 2) + k, Math.round(W / 2) + (k < 0 ? -k : k) - 2, 0xa8322a); }
  return { obj: M32(g, [W / 2, 0, W / 2]), shadow: { rx: 0.4, rz: 0.4, k: 0.6 }, r: 0.36 };
}

/** Burlap sack, slumped, tied at the neck. o: {color, open, spill} */
export function sack(o = {}) {
  const col = o.color ?? C.burlap;
  const g = new VoxelGrid(20, 24, 18);
  const fab = cloth(col, { seed: 11 });
  g.ellipsoid(10, 6.5, 9, 8.2, 6.8, 7.2, fab);
  g.ellipsoid(10, 12, 9, 6.4, 6, 5.6, fab);
  g.box(0, 0, 0, 20, 1, 18, -1);
  if (o.open) {
    g.ellipsoid(10, 16.5, 9, 5, 2, 4.4, o.fillColor ?? 0xe8dcc0);
  } else {
    g.ellipsoid(10, 17.5, 9, 2.6, 2, 2.4, mulc(col, 0.85));
    ring(g, 10, 9, 0, 2.8, 16, 17, C.ropeD);
    g.ellipsoid(10, 20.5, 9, 2.4, 2.4, 2.2, fab); // the tuft above the tie
  }
  // stitched seam + a stamp
  for (let y = 2; y < 15; y += 2) g.set(10, y, 16, mulc(col, 0.72));
  if (o.stamp !== false) for (const [x, y] of [[6, 8], [7, 9], [6, 10], [8, 8], [8, 10]]) g.set(x, y, 16, o.stampColor ?? 0x8a3a2a);
  if (o.spill) for (let k = 0; k < 18; k++) g.set(13 + (k % 6), 0, 14 + (k % 4), o.fillColor ?? 0xe8dcc0);
  return { obj: M32(g, [10, 0, 9]), shadow: { rx: 0.32, rz: 0.3, k: 0.65 }, r: 0.28 };
}

// ---------------------------------------------------------------- benches & lamps
/** Park bench: cast-iron scroll ends, five seat slats, two back slats. */
export function bench() {
  const g = new VoxelGrid(64, 32, 22);
  const ir = iron(C.ironD);
  for (const x of [4, 57]) {
    // legs + armrest scroll
    g.box(x, 0, 3, 3, 12, 2, ir); g.box(x, 0, 15, 3, 12, 2, ir);
    g.box(x, 11, 3, 3, 2, 14, ir);
    line(g, [[x + 1.5, 12, 4], [x + 1.5, 20, 2.5], [x + 1.5, 29, 2.5]], 1.1, ir);
    line(g, [[x + 1.5, 13, 16], [x + 1.5, 18, 17], [x + 1.5, 19.5, 14.5], [x + 1.5, 17.5, 12.5]], 1, ir);
  }
  const slat = wood(C.wood, { axis: 'x', across: 'z', pw: 4, seed: 3 });
  for (let k = 0; k < 4; k++) g.box(2, 13, 4 + k * 4, 60, 2, 3, slat);
  g.box(2, 18, 2, 60, 3, 2, wood(C.wood, { axis: 'x', across: 'y', pw: 99, seed: 5 }));
  g.box(2, 24, 2, 60, 3, 2, wood(C.wood, { axis: 'x', across: 'y', pw: 99, seed: 6 }));
  for (const x of [6, 58]) for (const y of [19, 25]) g.set(x, y, 4, C.ironL);
  return { obj: M32(g, [32, 0, 11]), shadow: { rx: 0.95, rz: 0.32, k: 0.66 } };
}

/** Lamp post with an ornate lantern on a scrolled arm. Returns light at the lantern (local). */
export function lampPost(seed = 0) {
  const g = new VoxelGrid(40, 92, 24);
  const ir = iron(C.iron, seed);
  // stone plinth
  g.box(13, 0, 5, 14, 4, 14, stone(C.stone, { seed }));
  g.box(14, 4, 6, 12, 2, 12, stone(C.stoneD, { seed: seed + 1 }));
  // post with rings
  g.box(17, 6, 10, 5, 4, 5, ir);
  g.box(18, 10, 11, 3, 66, 3, (x, y, z) => (y % 14 === 0 ? C.ironL : ir(x, y, z)));
  g.box(17, 74, 10, 5, 3, 5, ir);
  g.box(18, 77, 11, 3, 6, 3, ir);
  g.box(19, 83, 12, 1, 3, 1, C.brass);
  // arm with a scroll
  line(g, [[21, 76, 12.5], [28, 76, 12.5], [32, 74, 12.5]], 0.9, ir);
  line(g, [[21, 71, 12.5], [24, 74, 12.5], [27, 75.5, 12.5]], 0.7, ir);
  line(g, [[26, 72, 12.5], [25, 70, 12.5], [23.5, 70.5, 12.5]], 0.6, ir);
  // the lantern hanging from the arm
  const lx = 31, lz = 12;
  g.box(lx, 70, lz, 1, 4, 1, ir);
  g.box(lx - 4, 68, lz - 4, 9, 2, 9, ir); // roof
  g.box(lx - 3, 70, lz - 3, 7, 1, 7, ir);
  g.box(lx - 1, 71, lz - 1, 3, 1, 3, C.brass);
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) g.box(lx + dx, 56, lz + dz, 1, 12, 1, ir);
  g.box(lx - 4, 55, lz - 4, 9, 1, 9, ir);
  g.box(lx - 2, 53, lz - 2, 5, 2, 5, ir);
  g.set(lx, 52, lz, C.brass);
  // a little hanging street sign on some posts
  if (seed % 3 === 0) {
    g.box(9, 64, 12, 9, 1, 1, ir);
    g.box(9, 61, 12, 1, 3, 1, ir); g.box(16, 61, 12, 1, 3, 1, ir);
    g.box(7, 54, 11, 12, 7, 2, wood(C.woodD, { axis: 'x', across: 'y', pw: 99, seed }));
    for (let x = 9; x < 17; x += 2) g.set(x, 57, 13, 0xe8d8b0);
  }
  const glass = new VoxelGrid(40, 92, 24);
  glass.box(lx - 3, 56, lz - 3, 7, 12, 7, (x, y, z) => (y > 63 ? C.glowW : (x === lx && z === lz) || y < 58 ? C.glowO : 0xffc870));
  glass.box(lx - 1, 59, lz - 1, 3, 5, 3, C.glowY);
  const obj = group(M32(g, [20, 0, 12]), G32(glass, [20, 0, 12]));
  return { obj, lights: [{ x: (lx - 20 + 0.5) * S32, y: 62 * S32, z: (lz - 12 + 0.5) * S32 }], shadow: { rx: 0.3, rz: 0.3, k: 0.6 }, r: 0.17 };
}

/** A lantern hanging on a chain of `len` units (origin at the top of the chain). */
export function hangingLantern(len = 0.8, seed = 0) {
  const n = Math.round(len * 32);
  const g = new VoxelGrid(14, n + 20, 14);
  const ir = iron(C.iron, seed);
  // chain links: alternating flat / edge-on
  for (let y = 0; y < n; y++) {
    const k = Math.floor(y / 3) % 2, m = y % 3;
    if (k) { if (m !== 1) g.set(7, 19 + y, 7, C.ironL); else { g.set(6, 19 + y, 7, ir(6, y, 7)); g.set(8, 19 + y, 7, ir(8, y, 7)); } }
    else if (m !== 1) g.set(7, 19 + y, 7, ir(7, y, 7)); else { g.set(7, 19 + y, 6, ir(7, y, 6)); g.set(7, 19 + y, 8, ir(7, y, 8)); }
  }
  // cap + ring
  g.box(3, 15, 3, 9, 2, 9, ir); g.box(4, 17, 4, 7, 1, 7, ir); g.box(6, 18, 6, 3, 1, 3, C.brass);
  for (const [x, z] of [[3, 3], [11, 3], [3, 11], [11, 11]]) g.box(x, 3, z, 1, 12, 1, ir);
  g.box(3, 2, 3, 9, 1, 9, ir); g.box(5, 0, 5, 5, 2, 5, ir);
  const glass = new VoxelGrid(14, n + 20, 14);
  glass.box(4, 3, 4, 7, 12, 7, (x, y, z) => (y > 10 ? C.glowW : C.glowO));
  glass.box(6, 6, 6, 3, 5, 3, C.glowY);
  const obj = group(M32(g, [7, n + 19, 7]), G32(glass, [7, n + 19, 7]));
  return { obj, lights: [{ x: 0, y: -(n + 10) * S32, z: 0 }] };
}

// ---------------------------------------------------------------- civic bits
/** Notice board with a little shingled roof and pinned voxel notes. */
export function noticeBoard() {
  const g = new VoxelGrid(56, 70, 14);
  const post = beam(C.woodD, 'y', 3);
  g.box(2, 0, 5, 4, 66, 4, post); g.box(50, 0, 5, 4, 66, 4, post);
  // board frame + cork
  g.box(0, 24, 4, 56, 34, 3, wood(C.wood, { axis: 'x', across: 'y', pw: 99, seed: 4 }));
  g.box(3, 27, 6, 50, 28, 2, (x, y, z) => (h3(x >> 1, y >> 1, z, 5) < 0.3 ? 0x9a6a3a : h3(x >> 1, y >> 1, z, 6) < 0.5 ? 0xb07a48 : 0xa8743e));
  // roof
  for (let k = 0; k < 6; k++) g.box(-1 + k, 58 + k, 1, 58 - k * 2, 1, 12 - k, (x, y, z) => (((x >> 2) + k) % 2 ? 0x6a3a28 : 0x7a4430));
  // pinned notes
  const notes = [[6, 30, 10, 12, 0xf6eccc], [18, 38, 9, 14, 0xf0d0d8], [30, 29, 11, 10, 0xd8ecf8], [42, 35, 8, 13, 0xf6f0a0], [8, 44, 12, 9, 0xe8f0d8], [29, 41, 10, 11, 0xf6eccc]];
  notes.forEach(([x, y, w, h, c], i) => {
    g.box(x, y, 8, w, h, 1, (xx, yy) => (yy % 2 === 0 && yy < y + h - 2 && xx > x && xx < x + w - 1 - ((yy * 3 + i) % 4) ? 0x7a6a5a : c));
    g.set(x + Math.floor(w / 2), y + h - 1, 9, [0xc0402a, 0x3a6ac9, 0xe0b040][i % 3]);
  });
  return { obj: M32(g, [28, 0, 7]), shadow: { rx: 0.9, rz: 0.25, k: 0.7 } };
}

/** A row of little mailboxes on a post. */
export function mailboxes(n = 3, seed = 1) {
  const W = n * 12 + 4;
  const g = new VoxelGrid(W, 44, 16);
  g.box(W / 2 - 2, 0, 6, 4, 30, 4, beam(C.woodD, 'y', seed));
  g.box(1, 28, 3, W - 2, 2, 11, wood(C.wood, { axis: 'x', across: 'z', pw: 4, seed }));
  const cols = [0xc0402a, 0x3a6ac9, 0x5a8a3a, 0xe0b040, 0x8a3a8a];
  for (let i = 0; i < n; i++) {
    const x0 = 2 + i * 12, c = cols[(i + seed) % cols.length];
    g.box(x0, 30, 3, 10, 7, 11, (x, y, z) => (z === 13 && y < 36 && y > 30 && x > x0 + 1 && x < x0 + 8 ? mulc(c, 0.7) : c));
    g.ellipsoid(x0 + 5, 37, 8.5, 5, 3, 5.5, (x, y) => (y < 37 ? -1 : c));
    g.box(x0 + 3, 33, 14, 4, 1, 1, 0x1a1214); // slot
    if ((i + seed) % 2) { g.box(x0 + 10, 32, 6, 1, 8, 1, C.iron); g.box(x0 + 10, 38, 6, 1, 3, 3, 0xe03a2a); } // raised flag
  }
  return { obj: M32(g, [W / 2, 0, 8]), shadow: { rx: W / 64, rz: 0.25, k: 0.7 }, r: 0.25 };
}

/** Stone well with a shingled roof, crank, rope and bucket. */
export function well() {
  const g = new VoxelGrid(48, 92, 48);
  const st = stone(C.stone, { seed: 21, block: 5, mortar: 0x4a4038 });
  ring(g, 24, 24, 15, 21, 0, 22, st);
  ring(g, 24, 24, 14, 22, 22, 25, stone(C.stoneL, { seed: 22 }));
  ring(g, 24, 24, 0, 15, 0, 18, (x, y, z) => (y === 17 ? (h3(x, y, z, 3) < 0.1 ? 0x9fd6ff : 0x10303e) : 0x0a0a0c));
  // posts + crossbar
  const post = beam(C.woodD, 'y', 4);
  g.box(3, 22, 22, 4, 52, 4, post); g.box(41, 22, 22, 4, 52, 4, post);
  g.box(3, 66, 23, 42, 3, 3, beam(C.wood, 'x', 5));
  // roof (two slopes)
  for (let k = 0; k < 12; k++) {
    g.box(0, 72 + k, 9 + k, 48, 1, 2, (x, y, z) => ((x >> 2) % 2 ? 0x6a3a28 : 0x7e4632));
    g.box(0, 72 + k, 37 - k, 48, 1, 2, (x, y, z) => ((x >> 2) % 2 ? 0x5e3424 : 0x70402c));
  }
  g.box(0, 84, 21, 48, 2, 6, C.woodD);
  // crank + rope + bucket
  g.box(45, 66, 23, 1, 1, 3, C.ironL); g.box(46, 62, 25, 1, 5, 1, C.iron); g.box(46, 61, 23, 1, 1, 3, C.woodL);
  for (let x = 14; x < 34; x++) g.set(x, 65, 24, (x % 3) ? C.rope : C.ropeD);
  line(g, [[24, 65, 24.5], [24, 44, 24.5]], 0.5, C.rope);
  ring(g, 24.5, 24.5, 0, 4, 36, 44, (x, y, z) => (y === 38 || y === 42 ? C.iron : mulc(C.wood, sp3(x, y, z, 2))));
  line(g, [[20.5, 44, 24.5], [24.5, 47, 24.5], [28.5, 44, 24.5]], 0.5, C.iron);
  // a little moss on the rim
  for (let k = 0; k < 30; k++) { const a = k * 0.83, r = 18 + (k % 3); g.set(Math.round(24 + Math.cos(a) * r), 25, Math.round(24 + Math.sin(a) * r), k % 4 ? C.moss : C.mossL); }
  return { obj: M32(g, [24, 0, 24]), shadow: { rx: 0.78, rz: 0.75, k: 0.6 }, r: 0.72 };
}

// ---------------------------------------------------------------- market stall
const STALL = {
  shrooms: { cloth: [0x4a8a3a, 0xf0e8d0], goods: [0xe0c8a0, 0xc8805a, 0x5ad0e0, 0xf0d0a0] },
  fish: { cloth: [0x3a6ac9, 0xf0e8d0], goods: [0xd8e0e8, 0xf0b8a8, 0x9ab0c8, 0xe8d0c0] },
  gems: { cloth: [0x8a3a8a, 0xf2c23a], goods: [0xb07ae0, 0x6ac8ff, 0x7bf08a, 0xff9ad0] },
};
/** A market stall (front faces +z): posts, striped awning, counter with goods, hanging wares. */
export function marketStall(kind = 'shrooms', seed = 1) {
  const S = STALL[kind] || STALL.shrooms;
  const W = 52, D = 34, H = 72;
  const g = new VoxelGrid(W, H, D);
  const post = beam(C.woodD, 'y', seed);
  for (const [x, z] of [[1, 2], [W - 4, 2], [1, D - 6], [W - 4, D - 6]]) g.box(x, 0, z, 3, x < 4 && z > 4 ? 60 : 64, 3, post);
  // counter
  g.box(0, 18, D - 9, W, 3, 8, wood(C.woodL, { axis: 'x', across: 'z', pw: 4, seed: seed + 2 }));
  g.box(1, 0, D - 7, W - 2, 18, 3, wood(C.wood, { axis: 'y', across: 'x', pw: 6, seed: seed + 3 }));
  g.box(1, 2, D - 8, W - 2, 1, 1, C.woodD);
  // back table with crates
  g.box(4, 12, 4, W - 8, 2, 8, wood(C.woodD, { axis: 'x', across: 'z', pw: 4, seed: seed + 4 }));
  // goods on the counter: little heaps / baskets
  for (let k = 0; k < 4; k++) {
    const bx = 5 + k * 11, bz = D - 5;
    ring(g, bx + 4, bz, 2.5, 4.4, 21, 24, (x, y, z) => ((x + y + z) % 2 ? 0xb08048 : 0x9a6a3a));
    const gc = S.goods[k % S.goods.length];
    for (let j = 0; j < 7; j++) {
      const ox = Math.cos(j * 2.4) * (j % 3) * 1.2, oz = Math.sin(j * 2.4) * (j % 3) * 1.2;
      if (kind === 'fish') line(g, [[bx + 1.5 + ox, 24 + (j % 2), bz + oz], [bx + 6 + ox, 24 + (j % 2), bz + oz]], 1.1, (x) => (x > bx + 5 + ox ? 0x6a8aa8 : gc));
      else if (kind === 'gems') g.ellipsoid(bx + 4 + ox, 24.5 + (j % 2), bz + oz, 1.4, 2, 1.4, gc);
      else g.ellipsoid(bx + 4 + ox, 24 + (j % 2), bz + oz, 2.2, 1.5, 2.2, gc);
    }
  }
  // awning: striped cloth sloping forward with a scalloped edge
  for (let z = 0; z < D + 4; z++) {
    const y = 66 - Math.round(z * 0.32);
    for (let x = -1; x < W + 1; x++) {
      const stripe = Math.floor((x + 1) / 6) % 2;
      const c = S.cloth[stripe];
      g.set(x, y, z - 2, mulc(c, 0.99 * sp3(x, y, z, 9)));
      if (z === D + 3) { const sc = (x + 1) % 6; if (sc > 0 && sc < 5) { g.set(x, y - 1, z - 2, c); if (sc > 1 && sc < 4) g.set(x, y - 2, z - 2, c); } }
    }
  }
  // hanging wares + a little price slate
  for (let k = 0; k < 4; k++) {
    const x = 9 + k * 11;
    line(g, [[x, 56, D - 6], [x, 46, D - 6]], 0.5, C.rope);
    if (kind === 'fish') g.box(x - 1, 39, D - 7, 3, 7, 2, (xx, y) => (y < 41 ? 0x6a8aa8 : 0xc8d0d8));
    else if (kind === 'gems') g.ellipsoid(x + 0.5, 43, D - 5.5, 1.6, 2.4, 1.6, S.goods[k % 4]);
    else g.box(x - 1, 41, D - 7, 3, 5, 2, k % 2 ? 0xc8a050 : 0x9a5a3a);
  }
  g.box(W / 2 - 6, 22, D - 2, 12, 7, 1, 0x2a3a30);
  for (let x = W / 2 - 4; x < W / 2 + 4; x += 2) g.set(x, 25, D - 1, 0xe8e8e0);
  // a lantern hook at the corner
  const glass = new VoxelGrid(W, H, D);
  if (kind === 'gems') for (let k = 0; k < 4; k++) glass.ellipsoid(9 + k * 11 + 0.5, 25.5, D - 5, 1.2, 1.5, 1.2, S.goods[k]);
  return { obj: group(M32(g, [W / 2, 0, D / 2]), G32(glass, [W / 2, 0, D / 2])), shadow: { rx: 0.85, rz: 0.55, k: 0.62 }, r: 0.62 };
}

// ---------------------------------------------------------------- carts
function wheel(g, cx, cy, z, r, spokes = 6, col = C.woodD) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r + 0.5) continue;
    const a = Math.atan2(dy, dx);
    const sp = Math.abs(((a / (Math.PI * 2 / spokes)) % 1 + 1) % 1 - 0.5) > 0.4;
    if (d > r - 1.5) { g.set(x, y, z, d > r - 0.5 ? C.iron : col); g.set(x, y, z + 1, d > r - 0.5 ? C.iron : col); }
    else if (d < 2 || sp) g.set(x, y, z, d < 2 ? C.ironL : col);
  }
}

/** Mine cart full of ore (local x across the rails, z along). */
export function oreCart(seed = 2) {
  const g = new VoxelGrid(30, 34, 40);
  const ir = iron(0x4a4a54, seed);
  // body with flared sides
  for (let y = 6; y < 24; y++) {
    const f = Math.floor((y - 6) / 6);
    g.box(3 - f, y, 3 - f, 24 + f * 2, 1, 34 + f * 2, (x, yy, z) => {
      const edge = x === 3 - f || x === 26 + f || z === 3 - f || z === 36 + f;
      if (!edge) return -1;
      if (yy === 6 || yy === 23 || yy % 6 === 0) return C.ironL;
      if ((z % 8 === 3 || x % 8 === 3) && yy % 3 === 1) return 0x6a6a74; // rivets
      return ir(x, yy, z);
    });
  }
  g.box(3, 6, 3, 24, 1, 34, ir);
  // ore heap
  for (let x = 4; x < 26; x++) for (let z = 4; z < 36; z++) {
    const h = 23 + Math.round(3.2 * Math.sin(x * 0.28) * Math.sin(z * 0.2) + hash2(x >> 1, z >> 1, 3) * 2.5);
    for (let y = 18; y < h; y++) g.set(x, y, z, h3(x >> 1, y >> 1, z >> 1, 9) < 0.28 ? [0xd9773f, 0xf2c23a, 0x9a6450, 0xc4876c, 0x6ac8ff][Math.floor(h3(z, x, y, 4) * 5)] : mulc(0x6a5e54, sp3(x, y, z, 2)));
  }
  // axles + wheels
  for (const z of [9, 30]) {
    g.box(1, 4, z, 28, 2, 2, C.ironD);
    for (const x of [0, 28]) {
      for (let y = 0; y < 10; y++) for (let zz = z - 5; zz < z + 7; zz++) {
        const d = Math.hypot(y + 0.5 - 5, zz + 0.5 - (z + 1));
        if (d < 5.2) g.set(x, y, zz, d > 4 ? C.ironD : d < 1.5 ? C.ironL : 0x2e2e36);
      }
    }
  }
  return { obj: M32(g, [15, 0, 20]), shadow: { rx: 0.55, rz: 0.75, k: 0.55 } };
}

/** A two-wheeled hand cart with sacks. */
export function handCart(seed = 3) {
  const g = new VoxelGrid(44, 34, 28);
  const bed = wood(C.wood, { axis: 'x', across: 'z', pw: 5, seed });
  g.box(4, 10, 3, 30, 2, 22, bed);
  g.box(4, 12, 3, 30, 6, 2, wood(C.woodD, { axis: 'x', across: 'y', pw: 3, seed: seed + 1 }));
  g.box(4, 12, 23, 30, 6, 2, wood(C.woodD, { axis: 'x', across: 'y', pw: 3, seed: seed + 2 }));
  g.box(4, 12, 3, 2, 6, 22, C.woodD);
  // handles
  line(g, [[34, 11, 5], [43, 14, 5]], 0.8, C.woodD); line(g, [[34, 11, 23], [43, 14, 23]], 0.8, C.woodD);
  g.box(42, 13, 5, 2, 2, 19, C.woodL);
  // wheel (one big one on each side)
  wheel(g, 18, 9, 0, 8.5, 8); wheel(g, 18, 9, 26, 8.5, 8);
  g.box(18, 8, 2, 1, 2, 24, C.ironD);
  // a stand
  g.box(5, 0, 6, 2, 10, 2, C.woodD); g.box(5, 0, 20, 2, 10, 2, C.woodD);
  // load: two sacks and a pick
  g.ellipsoid(14, 16, 9, 6, 4.6, 5, cloth(C.burlap, { seed: 3 }));
  g.ellipsoid(26, 16, 17, 6, 4.4, 5.4, cloth(0xa88a5a, { seed: 4 }));
  line(g, [[8, 13, 20], [30, 22, 12]], 0.6, C.wood);
  line(g, [[30, 20, 9], [31, 23, 12], [30, 26, 15]], 0.7, C.ironL);
  return { obj: M32(g, [22, 0, 14]), shadow: { rx: 0.7, rz: 0.48, k: 0.6 }, r: 0.5 };
}

// ---------------------------------------------------------------- nature
const SHROOM = [[0x5ad0e0, 0xd8faff, 0x2a7a9a], [0x8a7af0, 0xe8e0ff, 0x4a3aa0], [0x6ae0a0, 0xe0ffe8, 0x2a8a5a], [0xf0a050, 0xfff0c0, 0xa85a2a]];
/** A clump of glowing mushrooms (caps glow). Returns color for its light. */
export function glowShrooms(seed = 1, hue = 0, size = 1) {
  const [c, hi, lo] = SHROOM[hue % SHROOM.length];
  const rng = makeRng(seed);
  const N = Math.round(40 * size);
  const stems = new VoxelGrid(N, Math.round(30 * size), N);
  const caps = new VoxelGrid(N, Math.round(30 * size), N);
  const n = 3 + rng.int(0, 3);
  for (let k = 0; k < n; k++) {
    const x = N / 2 + rng.range(-N * 0.3, N * 0.3), z = N / 2 + rng.range(-N * 0.3, N * 0.3);
    const h = Math.round(rng.range(5, 18) * size * (k === 0 ? 1.3 : 1));
    const r = Math.max(2.2, h * 0.42 + rng.range(0, 1.5));
    const lean = rng.range(-0.12, 0.12);
    line(stems, [[x, 0, z], [x + lean * h, h, z]], Math.max(0.8, r * 0.28), (xx, y, zz) => (h3(xx, y, zz, k) < 0.15 ? 0xd8ccbc : 0xece4d8));
    const tx = x + lean * h;
    caps.ellipsoid(tx, h, z, r, r * 0.62, r, (xx, y, zz, dx, dy, dz) => {
      if (y < h) return -1;
      const spot = hash2(Math.floor(xx / 2), Math.floor(zz / 2), k + seed) < 0.16;
      return spot ? hi : (dy > 0.5 ? mixc(c, hi, 0.25) : c);
    });
    // gills ring under the cap
    ring(caps, tx, z, r * 0.4, r - 0.5, h - 1, h, lo);
  }
  return { obj: group(M32(stems), G32(caps)), color: c, shadow: { rx: 0.4 * size, rz: 0.4 * size, k: 0.75 } };
}

const CRYS = [[0xb07ae0, 0xe8c8ff, 0x6a3aa0], [0x6ac8ff, 0xd8f6ff, 0x2a7ab0], [0x7bf08a, 0xd9ffd6, 0x2f9a52], [0xff9ad0, 0xffe0f0, 0xb04a8a]];
/** Glowing crystal cluster on a rock base. Returns {obj, color}. */
export function crystals(seed = 1, size = 1, hue = null) {
  const rng = makeRng(seed);
  const [c, hi, lo] = CRYS[(hue ?? seed) % CRYS.length];
  const N = Math.round(34 * size), H = Math.round(44 * size);
  const g = new VoxelGrid(N, H, N);
  const base = new VoxelGrid(N, H, N);
  base.ellipsoid(N / 2, 0, N / 2, N * 0.4, N * 0.18, N * 0.36, stone(0x5e5258, { seed }));
  const n = 4 + rng.int(0, 3);
  for (let s = 0; s < n; s++) {
    const cx = N / 2 + rng.range(-N * 0.18, N * 0.18), cz = N / 2 + rng.range(-N * 0.18, N * 0.18);
    const h = (s === 0 ? H * 0.95 : rng.range(H * 0.35, H * 0.7));
    const r = (s === 0 ? 4.2 : rng.range(2, 3.4)) * size;
    const lx = rng.range(-0.35, 0.35), lz = rng.range(-0.35, 0.35);
    for (let y = 0; y < h; y++) {
      const tip = y > h - r * 1.6;
      const rr = tip ? r * (h - y) / (r * 1.6) : r;
      const ox = cx + lx * y, oz = cz + lz * y;
      for (let x = Math.floor(ox - rr); x <= Math.ceil(ox + rr); x++) for (let z = Math.floor(oz - rr); z <= Math.ceil(oz + rr); z++) {
        // hexagonal-ish section
        const dx = Math.abs(x + 0.5 - ox), dz = Math.abs(z + 0.5 - oz);
        if (dx * 0.87 + dz * 0.5 > rr || dz > rr) continue;
        const face = x + 0.5 < ox - rr * 0.3 ? hi : x + 0.5 > ox + rr * 0.35 ? lo : z + 0.5 > oz + rr * 0.4 ? mixc(c, hi, 0.3) : c;
        g.set(x, y + 3, z, tip && y > h - 2 ? 0xffffff : (y % 7 === 0 && !tip ? mixc(face, hi, 0.25) : face));
      }
    }
  }
  return { obj: group(M32(base), G32(g, undefined, { outline: true })), color: c, shadow: { rx: 0.45 * size, rz: 0.42 * size, k: 0.7 } };
}

/** Stalagmite with rings and a wet tip (1/16). */
export function stalagmite(seed = 1, h = 20, col = 0x6a5856) {
  const g = new VoxelGrid(14, h + 1, 14);
  const lean = (hash2(seed, 1, 2) - 0.5) * 2;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const r = 5.6 * Math.pow(1 - t, 0.85) + 0.5 + (y % 4 === 0 ? 0.35 : 0);
    const ox = 7 + lean * t * 2 + Math.sin(y * 0.5 + seed) * 0.4;
    for (let x = 0; x < 14; x++) for (let z = 0; z < 14; z++) if ((x + 0.5 - ox) ** 2 + (z + 0.5 - 7) ** 2 <= r * r) g.set(x, y, z, t > 0.86 ? 0xb8b0b0 : mulc(col, 0.98 * sp3(x, y >> 1, z, seed) + (y % 4 === 0 ? -0.08 : 0)));
  }
  return { obj: M16(g, [7, 0, 7]), shadow: { rx: 0.36, rz: 0.36, k: 0.65 }, r: 0.22 };
}

/** Stalactite hanging down from y=0 (1/16). */
export function stalactite(seed = 1, h = 16, col = 0x4e4448) {
  const g = new VoxelGrid(12, h + 1, 12);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const r = 4.6 * Math.pow(1 - t, 1.2) + 0.4;
    const ox = 6 + Math.sin(y * 0.4 + seed) * 0.4;
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) if ((x + 0.5 - ox) ** 2 + (z + 0.5 - 6) ** 2 <= r * r) g.set(x, h - y, z, t > 0.85 ? 0x9a9aa8 : mulc(col, 0.95 * sp3(x, y, z, seed) + (y % 3 === 0 ? -0.06 : 0)));
  }
  return { obj: M16(g, [6, h + 1, 6]) };
}

/** A pile of rubble and broken stone. */
export function rubble(seed = 1, w = 1.4, d = 0.9) {
  const rng = makeRng(seed);
  const W = Math.round(w * 32), D = Math.round(d * 32);
  const g = new VoxelGrid(W, 28, D);
  for (let k = 0; k < Math.round(w * d * 26); k++) {
    const x = rng.range(3, W - 3), z = rng.range(3, D - 3);
    const edge = Math.min(x, W - x, z, D - z) / Math.min(W, D) * 2;
    const r = rng.range(1.8, 4.4) * (0.5 + edge);
    const y = Math.max(0, edge * 10 - r * 0.3) + rng.range(0, 3);
    const c = [0x7a6e64, 0x6a5e54, 0x8a7e72, 0x5a4e46, 0x9a8a78][rng.int(0, 4)];
    g.ellipsoid(x, y, z, r, r * 0.75, r * 0.9, (xx, yy, zz) => mulc(c, 0.985 * sp3(xx, yy, zz, k)));
  }
  // splinters of old boards poking out
  for (let k = 0; k < 4; k++) {
    const x = rng.range(4, W - 6), z = rng.range(4, D - 4);
    line(g, [[x, 2, z], [x + rng.range(-6, 6), 9 + rng.range(0, 5), z + rng.range(-3, 3)]], 0.9, (xx, yy, zz) => mulc(C.woodD, sp3(xx, yy, zz, 1)));
  }
  return { obj: M32(g, [W / 2, 0, D / 2]), shadow: { rx: w * 0.5, rz: d * 0.5, k: 0.6 } };
}

/** Hanging vine with leaves and the odd flower (origin at its top). */
export function vine(seed = 1, len = 1.4) {
  const n = Math.round(len * 32);
  const g = new VoxelGrid(16, n + 2, 6);
  const rng = makeRng(seed);
  let x = 8;
  for (let y = n; y >= 0; y--) {
    g.set(x, y, 2, mulc(0x3a6a2a, 0.9 + rng() * 0.2));
    if (rng() < 0.32) {
      const s = rng() < 0.5 ? -1 : 1;
      const lc = rng() < 0.3 ? 0x8ad86a : rng() < 0.5 ? 0x5aa84a : 0x4a8a3a;
      g.set(x + s, y, 2, lc); g.set(x + s * 2, y - 1, 2, lc); g.set(x + s, y - 1, 3, mulc(lc, 0.85));
    }
    if (rng() < 0.05) { const fc = rng.pick([0xf0e070, 0xf0a0c0, 0x9fd6ff, 0xffffff]); g.set(x, y, 3, fc); g.set(x + 1, y, 3, fc); }
    if (rng() < 0.2) x = Math.max(2, Math.min(13, x + (rng() < 0.5 ? -1 : 1)));
  }
  return M32(g, [8, n + 1, 2]);
}

/** Thick gnarled root dangling from above (origin at its top). */
export function hangingRoot(seed = 1, len = 1.2) {
  const n = Math.round(len * 32);
  const g = new VoxelGrid(20, n + 2, 8);
  const rng = makeRng(seed);
  let x = 10;
  const pts = [];
  for (let y = n; y >= 0; y -= 3) { pts.push([x, y, 4]); x += rng.range(-1.6, 1.6); x = Math.max(4, Math.min(16, x)); }
  line(g, pts, (t) => 2.2 * (1 - t) + 0.6, (xx, y, z, t) => mixc(0x6a4a2e, 0x3e2818, Math.round((1 - t) * 4) / 4));
  for (let k = 0; k < 4; k++) {
    const p = pts[Math.min(pts.length - 1, 2 + k * 2)];
    if (!p) continue;
    const s = rng() < 0.5 ? -1 : 1;
    line(g, [p, [p[0] + s * 4, p[1] - 6, 4], [p[0] + s * 5, p[1] - 12, 4]], 0.6, 0x5a3e24);
  }
  return M32(g, [10, n + 1, 4]);
}

/** A glow-worm thread: fine silk with glowing beads (origin at its top). */
export function glowThread(seed = 1, len = 1.2, col = 0x8affd8) {
  const n = Math.round(len * 32);
  const g = new VoxelGrid(3, n + 2, 3);
  const rng = makeRng(seed);
  for (let y = n; y >= 0; y--) {
    const bead = (y % 5 === 0 && rng() < 0.75) || y === 0;
    if (bead) g.set(1, y, 1, y === 0 ? 0xeaffff : col);
    else if (rng() < 0.55) g.set(1, y, 1, 0x3a5a5a);
  }
  return G32(g, [1, n + 1, 1]);
}

/** A wooden ladder (rails along y), h in units. */
export function ladder(h = 2, seed = 1) {
  const n = Math.round(h * 32);
  const g = new VoxelGrid(18, n, 4);
  const rail = beam(C.wood, 'y', seed);
  g.box(0, 0, 1, 3, n, 2, rail); g.box(15, 0, 1, 3, n, 2, rail);
  for (let y = 4; y < n - 2; y += 7) g.box(3, y, 1, 12, 2, 2, (x, yy, z) => mulc(C.woodL, sp3(x, yy, z, seed)));
  return M32(g, [9, 0, 2]);
}

/** Coil of rope. */
export function ropeCoil(seed = 1) {
  const g = new VoxelGrid(20, 8, 20);
  for (let k = 0; k < 3; k++) ring(g, 10, 10, 4 + k * 0.5, 8 - k * 0.6, k * 2, k * 2 + 2, (x, y, z, a) => (Math.floor(a * 6 + y) % 2 ? C.rope : C.ropeD));
  return { obj: M32(g, [10, 0, 10]), shadow: { rx: 0.3, rz: 0.3, k: 0.7 } };
}

/** Bucket. */
export function bucket(full = true) {
  const g = new VoxelGrid(14, 16, 14);
  ring(g, 7, 7, 4, 5.6, 0, 11, (x, y, z) => (y === 2 || y === 8 ? C.iron : mulc(C.wood, 0.975 * sp3(x, y, z, 3))));
  ring(g, 7, 7, 0, 4, 0, 1, C.woodD);
  if (full) ring(g, 7, 7, 0, 4, 9, 10, 0x3a7ab0);
  line(g, [[1.5, 10, 7], [7, 15, 7], [12.5, 10, 7]], 0.5, C.ironL);
  return { obj: M32(g, [7, 0, 7]), shadow: { rx: 0.2, rz: 0.2, k: 0.7 } };
}

/** Potted plant / fern in a clay pot. */
export function pottedFern(seed = 1) {
  const g = new VoxelGrid(24, 30, 24);
  ring(g, 12, 12, 0, 6, 0, 8, (x, y, z) => (y === 7 ? 0xd88a5a : mulc(0xb8603a, 0.975 * sp3(x, y, z, 2))));
  ring(g, 12, 12, 0, 5, 7, 8, 0x3a2a1a);
  for (let a = 0; a < 9; a++) {
    const ang = a / 9 * Math.PI * 2 + seed;
    const len = 8 + (a % 3) * 3;
    const pts = [];
    for (let k = 0; k <= len; k++) pts.push([12 + Math.cos(ang) * k * 0.75, 8 + k * 1.3 - k * k * 0.06, 12 + Math.sin(ang) * k * 0.75]);
    line(g, pts, 0.5, (x, y, z, t) => (t > 0.6 ? 0x7ac85a : h3(x, y, z, a) < 0.5 ? 0x5aa84a : 0x4a8a3a));
  }
  return { obj: M32(g, [12, 0, 12]), shadow: { rx: 0.22, rz: 0.22, k: 0.7 } };
}

/** Planks leaning / stacked lumber. */
export function woodpile(seed = 1) {
  const g = new VoxelGrid(40, 22, 18);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4 - r; k++) {
    const cx = 6 + k * 9 + r * 4.5, cy = 4 + r * 7.5;
    for (let x = 0; x < 40; x++) for (let y = Math.floor(cy - 4); y <= Math.ceil(cy + 4); y++) for (let z = 1; z < 17; z++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > 4.2) continue;
      g.set(x, y, z, z === 16 ? (Math.round(d) % 2 ? 0xc8a070 : 0xa87a48) : d > 3.4 ? 0x5a3a22 : mulc(C.wood, 0.975 * sp3(x, y, z, seed)));
    }
  }
  return { obj: M32(g, [20, 0, 9]), shadow: { rx: 0.7, rz: 0.36, k: 0.6 }, r: 0.4 };
}

export { SHROOM, CRYS };
