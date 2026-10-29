// Old Star's camp, the pieces that aren't in caveProps.js: his shack of warped grey planks and a
// patched tarp, nailed together against the rock decades ago and mended ever since; a sacking
// curtain for a door, a shutter hanging off its hinge; candle stubs in puddles of old wax, cobwebs,
// tools leaning on the rock, a heap of straw, the spring dripping out of a crack into a stone basin,
// a drying line of socks, a log to sit on by the fire, a battered alarm clock, mushrooms gone glowing
// in a damp corner. Mostly at 1/32 m (old wood doesn't need finer), the small things at 1/64 m.
// Conventions as caveProps.js: tile units; floor pieces centred at their foot, front toward +z;
// wall pieces have x along the wall, origin on the wall at the floor, +z out of it.
import { VoxelGrid, C, line, ring, sag, M32, G32, group, mulc, mixc, h3, S32, S16 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P } from './tavernProps.js';
import { makeRng } from '../core/util.js';

const T = (v) => v * S32; // 1/64 m voxels → tiles
const T2 = (v) => v * S16; // 1/32 m voxels → tiles
/** Old wood gone grey: board colours. */
const GREY = [0x7a7468, 0x6e695f, 0x857c6c, 0x625d55, 0x8a8272, 0x706658];
const NEWER = [0x8a6a48, 0x7a5a3a]; // a board or two put in since
const CANVAS = [0x6e6f58, 0x646550, 0x787860];
const PATCH = [0x8a6a48, 0x5a5e6a, 0x9a5a3a, 0x6a7a5a, 0x8a8068];

/**
 * The shack (1/32 m voxels): plank walls round a floor plan W × D m (front at z 0 facing +z, back at
 * -D), Hf m high at the front and Hb at the back (the roof slopes down to the front), a roof of
 * planks under a sagging, patched tarp that hangs over the front, a doorway (centre dc, width dw m)
 * with a sacking curtain half drawn, a window hole (centre wc, wide ww) with its shutter hanging
 * off one hinge, corner posts of rough logs, battens, nails, newer boards nailed over the gaps.
 * Returns { obj, walls: [[x0, z0, x1, z1] local m], hook (local tiles: over the door, for a lantern) }.
 */
export function shack({ W = 2.6, D = 1.6, Hf = 1.5, Hb = 1.95, dc = -0.25, dw = 0.82, dh = 1.22, wc = 0.75, ww = 0.42, seed = 71 } = {}) {
  const v = (m) => Math.round(m * 32);
  const M = 4, VW = v(W), VD = v(D), HF = v(Hf), HB = v(Hb), OH = v(0.24);
  const g = new VoxelGrid(VW + M * 2 + 2, HB + 12, VD + M * 2 + OH + 2);
  const X = (x) => x + M, Z = (z) => z + M; // wall coords (0..VW, 0..VD; front at VD)
  const rng = makeRng(seed);
  const roofY = (z) => Math.round(HB + (HF - HB) * (z / VD)); // the roof's underside over z (0 back .. VD front)
  // a run of vertical boards along one wall: `at(i)` → [x, z] of each column, n columns, top(i) the height
  const boards = (n, at, top, skip = () => false) => {
    let i = 0;
    while (i < n) {
      const bw = 3 + (rng() < 0.4 ? 1 : 0);
      const col = rng() < 0.08 ? NEWER[Math.floor(rng() * 2)] : GREY[Math.floor(rng() * GREY.length)];
      const short = rng() < 0.12 ? 2 + Math.floor(rng() * 5) : 0; // a broken top
      const lean = rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0; // warped: bowed out a voxel in the middle
      for (let k = 0; k < bw && i < n; k++, i++) {
        if (skip(i)) continue;
        const [x, z, nx, nz] = at(i);
        const h = top(i) - short;
        for (let y = 0; y < h; y++) {
          const bow = lean && y > h * 0.3 && y < h * 0.75 ? lean : 0;
          let c = col;
          if (k === 0) c = mulc(col, 0.82); // the board's edge
          if ((y + i * 7) % 29 === 0 && k === 1) c = mulc(col, 0.6); // a knot
          if (y < 4) c = mixc(c, 0x4a3a2a, 0.45); // damp at the foot
          g.set(X(x + nx * bow), y, Z(z + nz * bow), c);
        }
      }
      if (rng() < 0.22) i++; // a gap between boards
    }
  };
  // front wall (z = VD), the doorway and the window cut out
  const d0 = v(W / 2 + dc - dw / 2), d1 = v(W / 2 + dc + dw / 2), DH = v(dh);
  const w0 = v(W / 2 + wc - ww / 2), w1 = v(W / 2 + wc + ww / 2), wy0 = v(0.72), wy1 = v(1.08);
  boards(VW, (i) => [i, VD, 0, 1], () => HF, (i) => i >= d0 && i < d1);
  for (let x = 0; x < VW; x++) {
    if (x >= d0 && x < d1) for (let y = 0; y < HF; y++) g.clear(X(x), y, Z(VD));
    if (x >= d0 && x < d1 && false) continue;
  }
  for (let x = d0; x < d1; x++) for (let y = DH; y < HF; y++) g.set(X(x), y, Z(VD), GREY[(x >> 2) % GREY.length]); // the boards over the door
  for (let x = w0; x < w1; x++) for (let y = wy0; y < wy1; y++) g.clear(X(x), y, Z(VD));
  // the door posts and lintel, the window's frame
  for (const x of [d0 - 1, d1]) for (let y = 0; y < DH + 2; y++) { g.set(X(x), y, Z(VD), 0x4e463c); g.set(X(x), y, Z(VD) + 1, 0x4e463c); }
  for (let x = d0 - 1; x <= d1; x++) { g.set(X(x), DH, Z(VD) + 1, 0x4e463c); g.set(X(x), DH + 1, Z(VD) + 1, 0x5a5044); }
  for (let x = w0 - 1; x <= w1; x++) { g.set(X(x), wy0 - 1, Z(VD) + 1, 0x5a5044); g.set(X(x), wy1, Z(VD) + 1, 0x5a5044); }
  // the shutter, hanging off its lower hinge, askew
  for (let k = 0; k < v(0.36); k++) for (let j = 0; j < v(0.2); j++) {
    const ax = w1 + 1 + Math.round(j * 0.35), ay = wy0 - 2 - Math.round(k * 0.92 - j * 0.5);
    if (ay < 1) continue;
    g.set(X(ax + Math.round(k * 0.38)), ay, Z(VD) + 2, (j + (k >> 3)) % 4 === 0 ? 0x5a544a : GREY[(j >> 2) % 3 + 1]);
  }
  // the sacking curtain over the left half of the doorway, from a rod, a gap at the foot
  const cw = Math.round((d1 - d0) * 0.45);
  for (let x = d0; x < d0 + cw; x++) for (let y = 7; y < DH; y++) {
    const fold = Math.round(Math.sin(x * 0.9) * 0.8 + (x - d0 > cw - 3 ? 1 : 0));
    const c = (y + x * 3) % 11 === 0 ? 0x7a6448 : (x * 5 + y) % 17 === 0 ? 0x6a5438 : 0x9a8058;
    g.set(X(x), y, Z(VD) + 1 + Math.max(0, fold), y < 9 ? mulc(c, 0.75) : c);
  }
  for (let x = d0 - 2; x <= d1 + 1; x++) g.set(X(x), DH - 1, Z(VD) + 2, 0x3a3630); // the rod
  // side walls: boards along z, up to the sloping roof; the back wall
  boards(VD, (i) => [0, i, -1, 0], (i) => roofY(i));
  boards(VD, (i) => [VW - 1, i, 1, 0], (i) => roofY(i));
  boards(VW, (i) => [i, 0, 0, -1], () => HB);
  // battens across the outside, nails at their crossings
  for (const by of [v(0.3), HF - 5]) {
    for (let x = -1; x <= VW; x++) if (x < d0 - 1 || x > d1) g.set(X(x), by, Z(VD) + 1, (x % 9 === 0) ? 0x2a2a2e : 0x5e564a);
    for (let z = 0; z < VD; z++) { g.set(X(-2), by, Z(z), z % 9 === 0 ? 0x2a2a2e : 0x5e564a); g.set(X(VW + 1), by, Z(z), z % 9 === 0 ? 0x2a2a2e : 0x5e564a); }
  }
  // corner posts: rough logs, bark in patches
  for (const [x, z] of [[-1, -1], [VW, -1], [-1, VD], [VW, VD]]) for (let y = 0; y < (z < 0 ? HB : HF) + 3; y++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    if (a && b && (y + x) % 3) continue;
    g.set(X(x + a), y, Z(z + b), hash2(y >> 2, a + b * 3, seed) < 0.4 ? 0x4a3a2a : 0x5e5244);
  }
  // the roof: planks front to back on the slope, gaps between them, sagging under the tarp
  for (let x = -2; x < VW + 2; x++) {
    if ((x + 2) % 5 === 4) continue; // gaps
    const col = GREY[Math.floor(hash2(x >> 2, 9, seed) * GREY.length)];
    for (let z = -1; z < VD + OH; z++) {
      const y = roofY(Math.min(z, VD)) + 1 - (z > VD ? Math.round((z - VD) * 0.5) : 0);
      g.set(X(x), y, Z(z), (z + x) % 23 === 0 ? mulc(col, 0.7) : col);
    }
  }
  // the tarp: over the middle of the roof, sagging between the rafters, patched, its edge hanging over the front
  const t0 = -1, t1 = VW - 3;
  for (let x = t0; x < t1; x++) for (let z = 2; z < VD + OH + 1; z++) {
    const sagz = Math.round(Math.sin(((x - t0) / (t1 - t0)) * Math.PI * 3) * 0.6 + Math.sin((z / (VD + OH)) * Math.PI) * 1.2);
    const y = roofY(Math.min(z, VD)) + 2 + Math.max(0, 1 - sagz) - (z > VD ? Math.round((z - VD) * 0.5) : 0);
    const pi = Math.floor(hash2(Math.floor(x / 9), Math.floor(z / 8), seed + 4) * 9);
    let c = pi < PATCH.length && hash2(Math.floor(x / 9), Math.floor(z / 8), seed + 5) < 0.35 ? PATCH[pi] : CANVAS[(x >> 3) % 3];
    if ((x % 9 === 0 || z % 8 === 0) && c !== CANVAS[(x >> 3) % 3]) c = 0x3a3630; // stitches round a patch
    g.set(X(x), y, Z(z), c);
  }
  for (let x = t0; x < t1; x++) { // the edge hanging down over the front, ragged
    const drop = 3 + Math.floor(hash2(x >> 1, 3, seed) * 5);
    const z = VD + OH, ytop = roofY(VD) + 2 - Math.round(OH * 0.5);
    for (let j = 1; j < drop; j++) g.set(X(x), ytop - j, Z(z), CANVAS[(x >> 3) % 3]);
  }
  // ropes tying it down to pegs
  for (const x of [t0 + 3, t1 - 3]) line(g, [[X(x), roofY(VD) - 1, Z(VD + OH)], [X(x) + 2, 3, Z(VD + OH + 5)]], 0.5, C.ropeD);
  const obj = M32(g, [VW / 2 + M, 0, VD + M], { scale: S16 });
  const wm = (a) => a / 32;
  const walls = [
    [-W / 2 - 0.06, -D - 0.06, W / 2 + 0.06, -D + 0.04], // back
    [-W / 2 - 0.06, -D, -W / 2 + 0.04, 0.06], // west
    [W / 2 - 0.04, -D, W / 2 + 0.06, 0.06], // east
    [-W / 2 - 0.06, -0.04, wm(d0) - W / 2 - 0.02, 0.06], // front, left of the door
    [wm(d1) - W / 2 + 0.02, -0.04, W / 2 + 0.06, 0.06], // front, right of the door
  ];
  return { obj, walls, hook: { x: T2(d1 - VW / 2 + 3), y: T2(DH + 4), z: T2(5) }, door: { x0: wm(d0) - W / 2, x1: wm(d1) - W / 2 } };
}

/** A cobweb across a corner (wall piece, 1/64 m): spokes from the corner, rings of thread. s: size (m). */
export function cobweb(s = 0.3, seed = 73) {
  const R = Math.round(s * 64);
  const g = new VoxelGrid(R + 2, R + 2, 3);
  const col = 0xc8c4b8;
  for (let k = 0; k <= 5; k++) {
    const a = (k / 5) * Math.PI / 2;
    line(g, [[0.5, R + 0.5, 1], [0.5 + Math.cos(a) * R, R + 0.5 - Math.sin(a) * R, 1]], 0.35, col);
  }
  for (let r = 5; r < R; r += 4 + (r >> 3)) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI / 2, rr = r - Math.sin(k * 0.7 + seed) * 0.8;
      g.set(Math.round(0.5 + Math.cos(a) * rr), Math.round(R + 0.5 - Math.sin(a) * rr - Math.sin(a * 2) * 1.2), 1, col);
    }
  }
  return M32(g, [0, 0, 1], { outline: false });
}

/** Candle stubs in a puddle of old wax (floor piece, 1/64 m). Returns { obj, flames: [local tiles] }. */
export function candleStubs(n = 3, seed = 75) {
  const g = new VoxelGrid(28, 24, 28), gl = new VoxelGrid(28, 24, 28);
  const rng = makeRng(seed);
  ring(g, 14, 14, 0, 9 + rng() * 2, 0, 1, (x, y, z) => (h3(x, y, z, seed) < 0.3 ? 0xd8ccb0 : 0xe8dcc0));
  const flames = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng(), r = k ? 5 : 0, cx = 14 + Math.cos(a) * r, cz = 14 + Math.sin(a) * r;
    const h = 4 + Math.floor(rng() * (k ? 6 : 11));
    ring(g, cx, cz, 0, 1.8, 1, 1 + h, (x, y) => (y === h ? 0xd8ccb0 : 0xece2c8));
    for (let j = 0; j < 3; j++) g.set(Math.round(cx + (j - 1) * 2), 1 + Math.floor(rng() * h), Math.round(cz + 2), 0xf4ecd8); // drips
    g.set(Math.round(cx), 1 + h, Math.round(cz), 0x2a2018);
    if (k < 2 || rng() < 0.5) { gl.set(Math.round(cx), 2 + h, Math.round(cz), P.flameO); gl.set(Math.round(cx), 3 + h, Math.round(cz), P.flameY); flames.push({ x: T(cx - 14 + 0.5), y: T(3 + h), z: T(cz - 14 + 0.5) }); }
  }
  return { obj: group(M32(g, [14, 0, 14]), G32(gl, [14, 0, 14])), flames };
}

/** Tools leaning on the rock (wall piece, 1/64 m): a shovel, a pick with a cracked haft, a broom, a rake. */
export function toolsLeaning(seed = 77) {
  const g = new VoxelGrid(72, 80, 24);
  const haft = (x, y) => ((x + y) % 11 === 0 ? 0x5a4630 : 0x7a6044);
  // the shovel, blade down
  line(g, [[8, 14, 14], [14, 76, 2]], 1.0, haft);
  g.box(4, 0, 12, 9, 15, 3, (x, y) => (y < 3 ? 0x8a5a3a : 0x5a5a62)); g.box(12, 76, 1, 5, 2, 2, 0x5a4630);
  // the pick, head up against the rock
  line(g, [[24, 0, 14], [28, 64, 3]], 1.1, haft);
  line(g, [[18, 62, 3], [28, 66, 3], [38, 61, 3]], 1.2, 0x4a4a52); g.set(18, 61, 3, 0x8a8a92); g.set(38, 60, 3, 0x8a8a92);
  g.box(25, 30, 12, 3, 2, 3, 0x9a8a6a); // twine round the crack
  // the broom, bristles splayed and worn short
  line(g, [[44, 10, 14], [47, 72, 3]], 0.9, haft);
  for (let k = 0; k < 9; k++) line(g, [[44, 10, 14], [40 + k, 0, 16 + (k % 3)]], 0.5, k % 2 ? 0xb8984e : 0x9a7e40);
  g.box(41, 9, 13, 7, 3, 3, 0x5a3a22);
  // the rake, two teeth gone
  line(g, [[60, 12, 14], [62, 78, 3]], 0.9, haft);
  g.box(52, 10, 14, 17, 2, 2, 0x4a4a52);
  for (let k = 0; k < 6; k++) if (k !== 2 && k !== 4) g.box(53 + k * 3, 4, 15, 1, 6, 1, 0x4a4a52);
  return M32(g, [36, 0, 0]);
}

/** A heap of old straw (floor piece, 1/32 m), w × d m. */
export function strawPile(w = 0.7, d = 0.5, seed = 79) {
  const W = Math.round(w * 32), D = Math.round(d * 32);
  const g = new VoxelGrid(W + 2, 10, D + 2);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const e = Math.hypot((x - W / 2) / (W / 2), (z - D / 2) / (D / 2));
    if (e > 1) continue;
    const h = Math.round((1 - e * e) * 5 + hash2(x >> 1, z >> 1, seed) * 2);
    for (let y = 0; y < h; y++) g.set(x + 1, y, z + 1, (x + z + y) % 5 === 0 ? 0x8a7038 : hash2(x, z + y, seed) < 0.5 ? 0xb8984e : 0xa8883e);
  }
  return M32(g, [W / 2 + 1, 0, D / 2 + 1], { scale: S16 });
}

/**
 * The spring (wall piece, 1/64 m): water seeping out of a crack in a slab of wet rock, running down
 * a slick of moss into a basin of stones. Returns { obj, water { r, y } (tiles, centred on the
 * basin), basin (local tiles), spout (local tiles: where the drops fall from) }.
 */
export function springBasin(seed = 81) {
  const g = new VoxelGrid(64, 70, 50);
  const bz = 26, bx = 32, R = 17;
  // the slab of rock behind, wet and mossy where the water runs, the crack it comes out of
  for (let y = 0; y < 68; y++) for (let x = 6; x < 58; x++) {
    const depth = 3 + Math.round(2 * Math.sin(x * 0.21 + seed) * Math.sin(y * 0.17)) + (y < 20 ? 3 : 0);
    const run = Math.abs(x - bx - Math.sin(y * 0.3) * 1.5) < 3 && y < 50;
    for (let z = 0; z < depth; z++) g.set(x, y, z, run ? (z === depth - 1 ? (y % 5 === 0 ? 0x5a8a6a : 0x3e6a4a) : 0x3a4a3a) : mulc((x >> 2) % 3 ? 0x564a40 : 0x4e443a, y > 50 ? 0.9 : 1));
  }
  for (let y = 48; y < 54; y++) for (let x = bx - 4; x < bx + 4; x++) for (let z = 0; z < 6; z++) g.clear(x, y, z); // the crack
  for (let x = bx - 2; x < bx + 2; x++) g.set(x, 47, 5, 0x2a3a3a);
  // the basin: a ring of stones round the water
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, sx = bx + Math.cos(a) * R, sz = bz + Math.sin(a) * R * 0.75, r = 4 + hash2(k, 1, seed) * 2;
    g.ellipsoid(sx, 3, sz, r, 3 + hash2(k, 2, seed) * 2, r, (x, y) => (y > 4 ? 0x7a7268 : 0x5e584e));
  }
  ring(g, bx, bz, 0, R - 2, 0, 1, 0x2a3a3a);
  return { obj: M32(g, [bx, 0, 0]), water: { r: (R - 3) / 32, y: T(4) }, basin: { x: 0, y: T(4), z: T(bz) }, spout: { x: 0, y: T(47), z: T(7) } };
}

/** A drying line (1/64 m): a rope sagging len m along x with socks, a rag and long johns pegged on. Origin at its middle, at the rope's ends' height. */
export function dryingLine(len = 1.6, seed = 83) {
  const L = Math.round(len * 64);
  const g = new VoxelGrid(L + 4, 50, 6);
  const pts = sag([2, 46, 3], [L + 1, 46, 3], 10, 5);
  line(g, pts, 0.5, C.rope);
  const ropeY = (x) => 46 - Math.sin(((x - 2) / (L - 1)) * Math.PI) * 5;
  const rng = makeRng(seed);
  let x = 10;
  const things = [['sock', 0x8a3a3a], ['sock', 0x5a6a8a], ['rag', 0xa89878], ['johns', 0xc8b8a0], ['sock', 0x6a7a4a], ['rag', 0x7a5a6a]];
  for (const [k, col] of things) {
    if (x > L - 14) break;
    const y = Math.round(ropeY(x));
    if (k === 'sock') { g.box(x, y - 14, 2, 4, 14, 2, (xx, yy) => ((yy - y) % 4 === 0 ? mulc(col, 0.8) : col)); g.box(x, y - 16, 2, 8, 3, 2, col); g.box(x + 6, y - 16, 2, 2, 2, 2, mulc(col, 0.7)); x += 14; }
    else if (k === 'rag') { g.box(x, y - 18, 2, 12, 18, 1, (xx, yy) => (hash2(xx >> 1, yy >> 1, seed) < 0.1 ? mulc(col, 0.7) : col)); x += 16; }
    else { g.box(x, y - 30, 2, 16, 12, 2, col); g.box(x, y - 34, 2, 6, 6, 2, col); g.box(x + 10, y - 34, 2, 6, 6, 2, col); g.box(x + 6, y - 30, 2, 2, 2, 2, mulc(col, 0.8)); x += 22; }
    g.box(x - 3, y, 2, 2, 3, 3, 0x9a7a52); // a peg
    x += Math.floor(rng() * 4);
  }
  return M32(g, [L / 2 + 2, 46, 3], { outline: false });
}

/** A log to sit on (floor piece, 1/64 m), len m long along x. Returns { obj, seat (local tiles), r }. */
export function logSeat(len = 0.9, seed = 85) {
  const L = Math.round(len * 64), R = 9;
  const g = new VoxelGrid(L + 2, R * 2 + 2, R * 2 + 2);
  for (let x = 0; x < L; x++) for (let y = 0; y < R * 2; y++) for (let z = 0; z < R * 2; z++) {
    const d = Math.hypot(y + 0.5 - R + 1, z + 0.5 - R);
    if (d > R) continue;
    const end = x < 1 || x >= L - 1;
    const c = end ? (Math.round(d) % 3 === 0 ? 0x8a6a48 : 0xa8885e) : d > R - 1.5 ? (hash2(x >> 2, Math.floor(Math.atan2(y - R, z - R) * 3), seed) < 0.3 ? 0x5a4a38 : 0x4a3a2a) : 0x8a6a48;
    if (y + 0.5 - R + 1 > R - 2.5 && !end && d > R - 1.5) g.set(x + 1, y, z + 1, 0x6a5a48); // worn smooth on top
    else g.set(x + 1, y, z + 1, c);
  }
  return { obj: M32(g, [L / 2 + 1, 0, R + 1]), seat: { x: 0, y: T(R * 2 - 1), z: 0 }, r: L / 128 };
}

/** A battered alarm clock with one bell bent (floor piece, 1/64 m). */
export function alarmClock(seed = 87) {
  const g = new VoxelGrid(18, 20, 10);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7);
    if (d > 6.5) continue;
    for (let z = 2; z < 7; z++) g.set(x + 2, y + 2, z, z === 6 && d < 5.5 ? (d < 0.8 ? 0x2a2a2a : 0xe8e0c8) : d > 5.6 ? 0x8a6a3a : 0x6a5030);
  }
  g.box(9, 9, 7, 1, 4, 1, 0x2a2a2a); g.box(9, 9, 7, 3, 1, 1, 0x2a2a2a); // hands
  g.ellipsoid(4, 16, 4, 2.2, 1.6, 2, 0x8a6a3a); g.ellipsoid(14, 17, 4, 2.2, 1.6, 2, 0x8a6a3a); g.box(8, 15, 4, 2, 4, 1, 0x5a4a30);
  g.box(4, 0, 3, 2, 2, 2, 0x5a4a30); g.box(12, 0, 3, 2, 2, 2, 0x5a4a30);
  return M32(g, [9, 0, 4]);
}

/** A crate with a tin plate, a mug and a stub of candle on it (floor piece, 1/64 m). Returns { obj, flame }. */
export function crateTable(seed = 89) {
  const g = new VoxelGrid(30, 40, 30), gl = new VoxelGrid(30, 40, 30);
  const H = 22;
  for (let y = 0; y < H; y++) for (let x = 1; x < 29; x++) for (let z = 1; z < 29; z++) {
    const edge = x === 1 || x === 28 || z === 1 || z === 28;
    if (!edge && y < H - 2) continue;
    const plank = Math.floor(y / 5);
    g.set(x, y, z, y >= H - 2 ? GREY[(x >> 2) % 4] : (y % 5 === 0 ? 0x4a4038 : GREY[(plank + (x + z) / 9 | 0) % GREY.length]));
  }
  for (let y = 0; y < H; y += 7) for (const [x, z] of [[1, 1], [28, 1], [1, 28], [28, 28]]) g.set(x, y, z, 0x2a2a2e);
  ring(g, 10, 12, 0, 5, H, H + 1, 0x8a8a92); ring(g, 10, 12, 3.5, 5, H + 1, H + 2, 0x9a9aa2); // a tin plate
  ring(g, 20, 9, 0, 2.6, H, H + 5, (x, y) => (y === H + 4 ? 0x3a2a1a : 0x5a6a7a)); g.box(22, H + 2, 9, 2, 2, 1, 0x5a6a7a); // a mug
  ring(g, 20, 20, 0, 3, H, H + 1, 0xe8dcc0); ring(g, 20, 20, 0, 1.6, H + 1, H + 5, 0xece2c8); g.set(20, H + 5, 20, 0x2a2018);
  gl.set(20, H + 6, 20, P.flameO); gl.set(20, H + 7, 20, P.flameY);
  return { obj: group(M32(g, [15, 0, 15]), G32(gl, [15, 0, 15])), flame: { x: T(20 - 15 + 0.5), y: T(H + 7), z: T(20 - 15 + 0.5) } };
}
