// Old Star's camp, the pieces that aren't in caveProps.js: his shack of warped grey planks and a
// patched tarp, nailed together against the rock decades ago and mended ever since; a sacking
// curtain for a door (real cloth: campCloth.js), a shutter hanging off its hinge; candle stubs in puddles of old wax, cobwebs,
// tools leaning on the rock, a heap of straw, the spring dripping out of a crack into a stone basin,
// a drying line of socks, a log to sit on by the fire, a battered alarm clock, mushrooms gone glowing
// in a damp corner. Mostly at 1/32 m (old wood doesn't need finer), the small things at 1/64 m.
// Conventions as caveProps.js: tile units; floor pieces centred at their foot, front toward +z;
// wall pieces have x along the wall, origin on the wall at the floor, +z out of it.
import { VoxelGrid, C, line, ring, sag, wood, M32, G32, group, mulc, mixc, h3, S32, S16 } from '../iso/kit.js';
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
      const short = rng() < 0.24 ? 2 + Math.floor(rng() * 9) : 0; // a broken top (lots, these days)
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
      if (rng() < 0.3) i += rng() < 0.25 ? 2 : 1; // a gap between boards (a wide one where a board fell off)
    }
  };
  // front wall (z = VD), the doorway and the window cut out
  const d0 = v(W / 2 + dc - dw / 2), d1 = v(W / 2 + dc + dw / 2), DH = v(dh);
  const w0 = v(W / 2 + wc - ww / 2), w1 = v(W / 2 + wc + ww / 2), wy0 = v(0.72), wy1 = v(1.08);
  boards(VW, (i) => [i, VD, 0, 1], () => HF, (i) => i >= d0 && i < d1);
  for (let x = 0; x < VW; x++) {
    if (x >= d0 && x < d1) for (let y = 0; y < HF; y++) g.clear(X(x), y, Z(VD));
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
  // (the sacking over the doorway is real cloth, hung from this rod by the scene: src/home/campCloth.js)
  for (let x = d0 - 2; x <= d1 + 1; x++) g.set(X(x), DH - 1, Z(VD) + 2, 0x3a3630); // the rod
  // side walls: boards along z, up to the sloping roof; the back wall
  boards(VD, (i) => [0, i, -1, 0], (i) => roofY(i));
  boards(VD, (i) => [VW - 1, i, 1, 0], (i) => roofY(i));
  boards(VW, (i) => [i, 0, 0, -1], () => HB);
  // a floor of old boards inside, worn and gapped
  for (let z = 1; z < VD; z++) {
    if (z % 6 === 5) continue;
    const col = mulc(GREY[Math.floor(hash2(z >> 1, 2, seed) * GREY.length)], 0.86);
    for (let x = 1; x < VW - 1; x++) g.set(X(x), 0, Z(z), (x + z * 13) % 31 === 0 ? mulc(col, 0.7) : col);
  }
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
    if ((x + 2) % 5 === 4 || hash2(x >> 2, 77, seed) < 0.16) continue; // gaps, and planks gone altogether
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
    if (Math.hypot(x - t1 * 0.62, z - VD * 0.35) < 2.6 || Math.hypot(x - t1 * 0.2, z - VD * 0.8) < 1.8) continue; // torn through
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

/**
 * A drying line (1/64 m): a rope sagging len m along x with socks pegged on, and pegs ready for the
 * washing that hangs as real cloth (a shirt, long johns, a towel: campCloth.js). Origin at its middle,
 * at the rope's ends' height. Returns { obj, hang: [{ x0, x1, y, kind }] (local tiles: where each
 * piece of washing is pegged) }.
 */
export function dryingLine(len = 1.6, seed = 83) {
  const L = Math.round(len * 64);
  const g = new VoxelGrid(L + 4, 50, 6);
  const pts = sag([2, 46, 3], [L + 1, 46, 3], 10, 5);
  line(g, pts, 0.5, C.rope);
  const ropeY = (x) => 46 - Math.sin(((x - 2) / (L - 1)) * Math.PI) * 5;
  const rng = makeRng(seed);
  let x = 8;
  const hang = [];
  const things = [['sock', 0x8a3a3a], ['shirt', 22], ['sock', 0x5a6a8a], ['johns', 18], ['sock', 0x6a7a4a], ['towel', 16]];
  const peg = (px) => { const y = Math.round(ropeY(px)); g.box(px - 1, y - 1, 2, 2, 4, 3, 0x9a7a52); g.set(px - 1, y + 3, 3, 0x6a5038); };
  for (const [k, v] of things) {
    if (x > L - 12) break;
    const y = Math.round(ropeY(x));
    if (k === 'sock') {
      const col = v;
      // a darned sock: leg, heel, foot, a toe gone through
      g.box(x, y - 13, 2, 4, 13, 2, (xx, yy) => ((yy - y) % 4 === 0 ? mulc(col, 0.8) : col));
      g.box(x, y - 16, 2, 8, 3, 2, col); g.box(x - 1, y - 15, 2, 1, 2, 2, mulc(col, 0.85)); g.box(x + 7, y - 16, 2, 1, 2, 2, 0xd8c8a8);
      g.box(x + 1, y - 7, 2, 2, 2, 1, 0xc8b890); // the darn
      peg(x + 2);
      x += 12;
    } else {
      const w = v;
      peg(x); peg(x + w - 1);
      const T0 = (vx) => T(vx - (L / 2 + 2));
      hang.push({ x0: T0(x), x1: T0(x + w), y: T((ropeY(x) + ropeY(x + w)) / 2 - 46 - 0.5), kind: k });
      x += w + 6;
    }
    x += Math.floor(rng() * 3);
  }
  return { obj: M32(g, [L / 2 + 2, 46, 3], { outline: false }), hang };
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

/** Two rough posts and a crossbar to hang a board on (floor piece, 1/32 m): w m apart, h m tall, the board's face toward +z. */
export function boardPosts(w = 1.05, h = 1.4, seed = 91) {
  const W = Math.round(w * 32), H = Math.round(h * 32);
  const g = new VoxelGrid(W + 6, H + 2, 6);
  for (const x of [1, W + 2]) for (let y = 0; y < H; y++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a !== 1 && b !== 1 && (y + x) % 3) continue;
    g.set(x + a, y, b, hash2(y >> 2, a + b * 3 + x, seed) < 0.35 ? 0x4a3a2a : 0x5e5244);
  }
  for (const y of [Math.round(H * 0.3), H - 4]) for (let x = 0; x < W + 6; x++) g.set(x, y, 0, x % 7 === 0 ? 0x2a2a2e : GREY[(x >> 3) % GREY.length]);
  return M32(g, [W / 2 + 3, 0, 2], { scale: S16 });
}

/**
 * A heap of fallen planks (1/32 m): grey boards gone over, split, some snapped in two with their
 * splinters showing, rusty nails sticking up, dust and grit in the cracks. Floor piece, ~w × d m.
 */
export function brokenPlanks(w = 1.1, d = 0.7, seed = 93) {
  const VW = Math.round(w * 32), VD = Math.round(d * 32);
  const g = new VoxelGrid(VW + 8, 14, VD + 8);
  const rng = makeRng(seed);
  const n = 6 + Math.floor(rng() * 4);
  const hgt = new Int8Array((VW + 8) * (VD + 8));
  for (let k = 0; k < n; k++) {
    const len = Math.round((0.45 + rng() * 0.55) * Math.max(VW, VD)), bw = 3 + (rng() < 0.4 ? 1 : 0);
    const a = rng() * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const cx = 4 + rng() * VW, cz = 4 + rng() * VD;
    const col = GREY[Math.floor(rng() * GREY.length)];
    const snap = rng() < 0.45 ? Math.floor(len * (0.3 + rng() * 0.4)) : -1; // snapped: a gap and a kink
    for (let t = -len / 2; t < len / 2; t++) {
      const ti = Math.round(t + len / 2);
      if (snap >= 0 && Math.abs(ti - snap) < 1) continue;
      for (let b = 0; b < bw; b++) {
        const x = Math.round(cx + ca * t - sa * (b - bw / 2)), z = Math.round(cz + sa * t + ca * (b - bw / 2));
        if (x < 0 || z < 0 || x >= VW + 8 || z >= VD + 8) continue;
        const i = z * (VW + 8) + x;
        const y = Math.min(12, hgt[i] + (snap >= 0 && ti > snap ? 1 : 0));
        let c = b === 0 ? mulc(col, 0.8) : col;
        if ((ti + b * 5) % 23 === 0) c = mulc(col, 0.6); // knots, rot
        const end = ti === 0 || ti === len - 1 || (snap >= 0 && Math.abs(ti - snap) === 1);
        if (end && rng() < 0.5) c = 0xb8a888; // the raw wood of a split end
        g.set(x, y, z, c);
        hgt[i] = Math.max(hgt[i], y + 1);
        if (ti % 9 === 4 && b === 1 && rng() < 0.5) { g.set(x, y + 1, z, 0x5a3a2a); if (rng() < 0.5) g.set(x, y + 2, z, 0x6a4a3a); } // a rusty nail
      }
    }
  }
  // grit and dust round it
  for (let i = 0; i < 40; i++) { const x = Math.floor(rng() * (VW + 8)), z = Math.floor(rng() * (VD + 8)); if (!hgt[z * (VW + 8) + x]) g.set(x, 0, z, rng() < 0.5 ? 0x5a5048 : 0x6a6056); }
  return { obj: M32(g, [(VW + 8) / 2, 0, (VD + 8) / 2], { scale: S16 }), hw: w / 2, hd: d / 2, h: 0.18 };
}

/**
 * What's left of a lean-to against the rock (1/32 m): two posts, one fallen, the cross-beam down at
 * one end, a few roof boards still hanging off it at angles, the rest in a heap; a rag of old canvas
 * snagged on a nail. Floor piece, x along the rock, its back at z 0, ~w m wide, h m high.
 */
export function leanToRuin(w = 1.4, h = 1.3, seed = 95) {
  const VW = Math.round(w * 32), VH = Math.round(h * 32), VD = 26;
  const g = new VoxelGrid(VW + 10, VH + 6, VD + 10);
  const rng = makeRng(seed);
  const post = (x, z, top, lean) => { for (let y = 0; y < top; y++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) g.set(x + a + Math.round(lean * y), y, z + b, hash2(y >> 2, a + b, seed) < 0.35 ? 0x4a3a2a : 0x5e5244); };
  // the standing post (leaning out) and the fallen one along the floor
  post(4, VD, VH, 0.06);
  for (let t = 0; t < VH - 4; t++) for (let a = 0; a < 2; a++) g.set(VW + 2 - Math.round(t * 0.35), a, VD - 2 + Math.round(t * 0.55) % 3 + a, 0x5e5244);
  // the cross-beam: from the standing post's top down to the floor at the far end
  line(g, [[5 + Math.round(VH * 0.06), VH - 1, VD], [VW + 3, 1, VD - 4]], 1.2, 0x6a5a48);
  // roof boards: a few still on the beam, hanging at angles back to the rock; the rest slid off
  for (let k = 0; k < 6; k++) {
    const x = 6 + Math.floor((k / 6) * (VW - 6)) + Math.floor(rng() * 3);
    const yb = Math.round(VH - 1 - ((x - 5) / (VW - 2)) * (VH - 2));
    const col = GREY[Math.floor(rng() * GREY.length)];
    if (rng() < 0.6) line(g, [[x, yb + 1, VD], [x + Math.round(rng() * 4 - 2), Math.max(1, yb - 6 - Math.floor(rng() * 10)), 2]], 1.0, col);
    else line(g, [[x, 1, VD + 2], [x + 6, 1, VD - 8 - Math.floor(rng() * 8)]], 1.0, col);
  }
  // the rag of canvas, snagged
  for (let y = VH - 10; y < VH - 2; y++) for (let x = 5; x < 5 + Math.max(2, 7 - (VH - y) % 5); x++) g.set(x + 1, y, VD + 2, CANVAS[(x + y) % 3]);
  // splinters and grit
  for (let i = 0; i < 30; i++) g.set(Math.floor(rng() * (VW + 8)), 0, VD - 6 + Math.floor(rng() * 14), rng() < 0.5 ? 0x5a5048 : GREY[Math.floor(rng() * 3)]);
  return { obj: M32(g, [(VW + 10) / 2, 0, 0], { scale: S16 }), hw: w / 2, hd: 0.45, h: h };
}

// ---------------------------------------------------------------- polish: the camp's small things, closer up
const SHROOM_HUES = [[0x3ec8b8, 0xb8fff0, 0x1a5a54], [0x4aa8e8, 0xd0f0ff, 0x1a3e6a], [0x9a6ae8, 0xe8d0ff, 0x3e2478]];

/**
 * Glowing cave mushrooms (floor piece, 1/64 m): a clutch of thin pale stems on a hump of dark wet
 * earth and moss, small caps dark on top and lit from beneath by their glowing gills, freckled with
 * glowing spots; a few buttons just coming up. hue 0 teal, 1 blue, 2 violet. Returns { obj }.
 */
export function glowCaps(seed = 3, hue = 0, size = 1) {
  const [c, hi, lo] = SHROOM_HUES[hue % SHROOM_HUES.length];
  const rng = makeRng(seed);
  const R = Math.round(13 * size), N = R * 2 + 12, Hh = Math.round(26 * size) + 8;
  const g = new VoxelGrid(N, Hh, N), gl = new VoxelGrid(N, Hh, N);
  const cx = N / 2, cz = N / 2;
  // the hump of earth and moss they grow from
  g.ellipsoid(cx, 0, cz, R + 2, 3, R, (x, y, z) => (y < 1 ? 0x2a2420 : h3(x, y, z, seed) < 0.45 ? (h3(x, 1, z, seed) < 0.5 ? 0x3e5228 : 0x34461f) : 0x3a302a));
  const n = 4 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, d = k ? (0.3 + rng() * 0.7) * R * 0.8 : rng() * 2;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const h = Math.round((k ? 5 + rng() * 11 : 15 + rng() * 6) * size);
    const r = Math.max(2.2, (k ? 2 + rng() * 2.4 : 4.4) * size);
    const lx = Math.cos(a) * (k ? 0.16 : 0.05), lz = Math.sin(a) * (k ? 0.16 : 0.05); // leaning out of the clutch
    line(g, [[x, 2, z], [x + lx * h * 0.5, h * 0.6, z + lz * h * 0.5], [x + lx * h, h, z + lz * h]], Math.max(0.7, r * 0.26), (xx, y) => (y < 4 ? 0xa89c88 : y > h - 2 ? 0xe8e0d0 : 0xd8d0c0));
    const tx = x + lx * h, tz = z + lz * h;
    // the cap: dark on top, its rim catching the gills' glow; glowing freckles; the gills under it glow
    g.ellipsoid(tx, h + 0.5, tz, r, r * 0.55, r, (xx, y, zz, dx, dy) => {
      if (dy < 0) return -1;
      const rim = Math.hypot(dx, (zz + 0.5 - tz) / r) > 0.72;
      return rim ? mixc(c, 0x101418, 0.45) : mixc(c, 0x101418, 0.68);
    });
    for (let j = 0; j < 3 + r; j++) { const sa = rng() * Math.PI * 2, sr = rng() * r * 0.7; gl.set(Math.round(tx + Math.cos(sa) * sr), Math.round(h + 0.5 + r * 0.5 * (1 - sr / r)), Math.round(tz + Math.sin(sa) * sr), hi); }
    ring(gl, tx, tz, 0, r - 0.4, Math.round(h), Math.round(h) + 1, (xx, y, zz) => (Math.hypot(xx + 0.5 - tx, zz + 0.5 - tz) > r * 0.45 ? c : lo));
  }
  for (let k = 0; k < 4; k++) { const a = rng() * Math.PI * 2, d = R * (0.5 + rng() * 0.5); gl.ellipsoid(cx + Math.cos(a) * d, 2.5, cz + Math.sin(a) * d, 1.4, 1.2, 1.4, k % 2 ? c : hi); }
  return { obj: group(M32(g, [cx, 0, cz]), G32(gl, [cx, 0, cz])), color: c };
}

/**
 * A crystal cluster growing out of a lump of rock (floor piece, 1/64 m): slender six-sided prisms
 * leaning out at angles, cold facets lit and shaded, their tips glowing. hue 0 green, 1 blue, 2 violet.
 */
export function crystalCluster(seed = 17, hue = 1, size = 1) {
  const PAL = [[0x5ac88a, 0xb8f8c8, 0x2a6a4a], [0x5aa8d8, 0xc8ecff, 0x24507a], [0x9a7ad8, 0xe0d0ff, 0x4a3478]];
  const [c, hi, lo] = PAL[hue % PAL.length];
  const rng = makeRng(seed);
  const N = Math.round(44 * size), H = Math.round(52 * size);
  const g = new VoxelGrid(N, H, N), gl = new VoxelGrid(N, H, N);
  const cx = N / 2, cz = N / 2;
  g.ellipsoid(cx, 1, cz, N * 0.34, 6 * size, N * 0.3, (x, y, z) => (h3(x >> 1, y >> 1, z >> 1, seed) < 0.3 ? 0x3e4044 : y < 2 ? 0x2a2a2e : 0x4c4e52));
  const n = 5 + Math.floor(rng() * 4);
  for (let s = 0; s < n; s++) {
    const a = rng() * Math.PI * 2, tilt = s ? 0.25 + rng() * 0.55 : rng() * 0.15;
    const dir = [Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)];
    const len = (s ? 12 + rng() * 22 : 34 + rng() * 10) * size, r = (s ? 1.6 + rng() * 1.8 : 3.4) * size;
    const bx = cx + Math.cos(a) * rng() * N * 0.12, bz = cz + Math.sin(a) * rng() * N * 0.12, by = 3 * size;
    const tipL = r * 1.9;
    for (let t = 0; t < len; t += 0.5) {
      const rr = t > len - tipL ? r * (len - t) / tipL : r;
      const px = bx + dir[0] * t, py = by + dir[1] * t, pz = bz + dir[2] * t;
      for (let z = Math.floor(pz - rr - 1); z <= pz + rr + 1; z++) for (let y = Math.floor(py - rr - 1); y <= py + rr + 1; y++) for (let x = Math.floor(px - rr - 1); x <= px + rr + 1; x++) {
        const vx = x + 0.5 - px, vy = y + 0.5 - py, vz = z + 0.5 - pz;
        const along = vx * dir[0] + vy * dir[1] + vz * dir[2];
        if (Math.abs(along) > 0.5) continue;
        const ox = vx - dir[0] * along, oy = vy - dir[1] * along, oz = vz - dir[2] * along;
        if (Math.hypot(ox, oy, oz) > rr) continue;
        const tip = t > len - tipL * 1.3;
        // a facet facing the light up-left, one in shade, the rest the crystal's own colour
        const f = (ox * -0.7 + oy * 0.6 + oz * 0.4) / (rr || 1);
        const col = f > 0.35 ? hi : f < -0.3 ? lo : (Math.floor(t / 4) % 3 === 0 ? mixc(c, hi, 0.2) : c);
        if (tip) gl.set(x, y, z, t > len - 2 ? 0xffffff : mixc(hi, c, f > 0 ? 0 : 0.4));
        else g.set(x, y, z, col);
      }
    }
  }
  return { obj: group(M32(g, [cx, 0, cz]), G32(gl, [cx, 0, cz])), color: c };
}

/**
 * Pans and things hung on pegs along a rail screwed to the rock (wall piece, 1/64 m), len m long:
 * a black frying pan, a ladle, a tin mug, a sieve, a pot lid, a bunch of wooden spoons.
 */
export function potHooks(len = 0.8, seed = 101) {
  const L = Math.round(len * 64);
  const g = new VoxelGrid(L + 4, 56, 16);
  const rail = wood(0x5a4030, { axis: 'x', across: 'y', pw: 99, seed });
  g.box(0, 46, 0, L, 5, 3, (x, y, z) => (x === 3 || x === L - 4 ? 0x2a2a2e : rail(x, y, z)));
  const iron = (x, y, z) => (h3(x, y, z, seed) < 0.06 ? 0x6a4a3a : 0x26262c);
  const kinds = ['pan', 'ladle', 'mug', 'sieve', 'lid', 'spoons'];
  let x = 7;
  for (const k of kinds) {
    if (x > L - 6) break;
    g.box(x, 46, 3, 2, 2, 4, 0x3a2a1e); // the peg
    if (k === 'pan') { line(g, [[x, 46, 6], [x, 30, 6]], 0.8, 0x2a2a30); for (let y = 6; y < 30; y++) for (let xx = x - 11; xx <= x + 11; xx++) { const d = Math.hypot(xx + 0.5 - x, y + 0.5 - 18); if (d < 11) { g.set(xx, y, 5, d > 9.6 ? 0x3a3a42 : iron(xx, y, 5)); if (d > 9.6) g.set(xx, y, 6, 0x3a3a42); } } x += 24; }
    else if (k === 'ladle') { line(g, [[x, 46, 6], [x, 18, 6]], 0.6, 0x8a8a92); g.ellipsoid(x, 15, 7, 3.5, 3.2, 3, (xx, y, z, dx, dy, dz) => (dz > 0.2 && dy > -0.2 ? -1 : 0x7a7a84)); x += 9; }
    else if (k === 'mug') { line(g, [[x, 46, 6], [x, 40, 6]], 0.4, 0x3a3a42); ring(g, x, 8, 0, 3.2, 31, 39, (xx, y) => (y === 38 ? 0xa8aab0 : 0x8a8e94)); g.box(x + 3, 33, 7, 2, 4, 2, 0x8a8e94); x += 10; }
    else if (k === 'sieve') { for (let y = 22; y < 42; y++) for (let xx = x - 9; xx <= x + 9; xx++) { const d = Math.hypot(xx + 0.5 - x, y + 0.5 - 32); if (d < 9) g.set(xx, y, 6, d > 7.8 ? 0x9a9aa2 : (xx + y) % 2 ? 0x6a6a72 : -1); } line(g, [[x, 46, 6], [x, 41, 6]], 0.5, 0x6a6a72); x += 20; }
    else if (k === 'lid') { for (let y = 24; y < 44; y++) for (let xx = x - 9; xx <= x + 9; xx++) { const d = Math.hypot(xx + 0.5 - x, y + 0.5 - 34); if (d < 9) g.set(xx, y, 5, d < 1.5 ? 0x4a3a2a : d > 8 ? 0x4a4a52 : iron(xx, y, 5)); } x += 20; }
    else { for (let j = 0; j < 4; j++) line(g, [[x + j - 1, 45, 6], [x - 3 + j * 2, 22, 6 + (j % 2)]], 0.5, j % 2 ? 0xb88a5a : 0xa07a4a); g.ellipsoid(x - 3, 21, 7, 2, 3, 1.5, 0xb88a5a); g.box(x - 2, 40, 5, 4, 2, 3, C.ropeD); x += 10; }
  }
  return M32(g, [L / 2, 0, 0]);
}

/** A little photo in a wooden frame, on a string from a nail, hung askew (wall piece, 1/64 m): two moles, faded to brown. */
export function framedPhoto(seed = 103) {
  const W = 20, H = 16;
  const g = new VoxelGrid(W + 6, H + 14, 5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x + 3 + Math.round((y - H / 2) * 0.12), sy = y + 2; // askew
    const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
    let c;
    if (edge) c = (x + y) % 7 === 0 ? 0x4a3020 : 0x6a4428;
    else {
      // sepia: a dark ground, two round figures, one taller with a hat, a crack across the glass
      c = y < 6 ? 0x6e5a42 : 0x8a7454;
      const f1 = Math.hypot((x - 7) / 2.6, (y - 7) / 3.6) < 1 || Math.hypot(x - 7, y - 11.5) < 2.2;
      const f2 = Math.hypot((x - 13) / 2.4, (y - 6.5) / 3.2) < 1 || Math.hypot(x - 13, y - 10.5) < 2;
      if (f1 || f2) c = 0x4a3a2a;
      if (x >= 5 && x <= 9 && y === 14) c = 0x2a2018; // his hat
      if (Math.abs(x - 4 - (y - 2) * 0.9) < 0.6) c = 0xc8bca0; // the crack
      if (hash2(x, y, seed) < 0.06) c = mulc(c, 1.18);
    }
    g.set(sx, sy, 1, c);
  }
  line(g, [[5, H + 1, 2], [W / 2 + 3, H + 10, 2], [W - 1, H + 2, 2]], 0.4, 0x8a7a5a);
  g.box(W / 2 + 2, H + 10, 0, 2, 2, 4, 0x3a3a42); // the nail
  return M32(g, [W / 2 + 3, 0, 0]);
}

/** A bench of one old plank on two sawn stumps (floor piece, 1/64 m), len m along x. Returns { obj, seat (local tiles) }. */
export function plankBench(len = 0.85, seed = 105) {
  const L = Math.round(len * 64), H = 24;
  const g = new VoxelGrid(L + 4, H + 4, 24);
  for (const x of [10, L - 10]) for (let y = 0; y < H - 3; y++) ring(g, x + 2, 12, 0, 7 - (y < 2 ? -1 : 0), y, y + 1, (xx, yy, zz, a) => (Math.round(a * 4) % 3 === 0 ? 0x4a3a2a : yy === H - 4 ? 0xa8885e : 0x5e4a36));
  const top = (x, y, z) => (x < 3 || x > L ? 0xb8a888 : (z === 4 || z === 19) ? mulc(GREY[1], 0.8) : GREY[(x >> 4) % GREY.length]);
  g.box(1, H - 3, 4, L + 2, 3, 16, (x, y, z) => (y === H - 1 && h3(x, y, z, seed) < 0.05 ? 0x4a4038 : top(x, y, z)));
  g.box(Math.round(L * 0.45), H - 4, 2, 2, 4, 20, 0x5a3a2a); // a batten under it, the plank was splitting
  return { obj: M32(g, [L / 2 + 2, 0, 12]), seat: { x: 0, y: T(H), z: 0 } };
}

/** A dented zinc wash tub with a washboard leaning in it and a cake of soap on the rim (floor piece, 1/64 m). */
export function washTub(seed = 107) {
  const g = new VoxelGrid(44, 50, 44);
  const zinc = (x, y, z) => (h3(x, y, z, seed) < 0.08 ? 0x6a7076 : y % 6 === 0 ? 0x8a9096 : 0x9aa0a4);
  for (let y = 0; y < 16; y++) ring(g, 22, 22, y < 1 ? 0 : 14 + y * 0.18, 15.4 + y * 0.18, y, y + 1, (x, yy, z, a) => (Math.abs(a - 1.1) < 0.2 && yy > 6 && yy < 12 ? 0x7a8086 : zinc(x, yy, z)));
  ring(g, 22, 22, 0, 14.5, 9, 10, (x, y, z) => (h3(x, y, z, 2) < 0.3 ? 0x8a9488 : 0x6a7a78)); // grey water
  g.box(5, 15, 21, 4, 2, 4, 0x2a2a30); g.box(35, 15, 21, 4, 2, 4, 0x2a2a30); // handles
  // the washboard: a wooden frame round a ribbed zinc panel, leaning on the rim
  for (let t = 0; t < 44; t++) for (let x = 12; x < 32; x++) {
    const y = 4 + t, z = 26 - Math.round(t * 0.38);
    const frame = x < 14 || x > 29 || t < 4 || t > 38;
    g.set(x, y, z, frame ? (x + t) % 9 === 0 ? 0x5a3a22 : 0x8a6040 : t % 3 ? 0xa8aeb2 : 0x7a8086);
  }
  g.box(30, 16, 8, 6, 3, 4, 0xe8dcb0); // soap
  return M32(g, [22, 0, 22]);
}

/** A worn flagstone half sunk in the floor (floor piece, 1/32 m), ~w × d m. */
export function flagstone(w = 0.4, d = 0.32, seed = 109) {
  const W = Math.round(w * 32), D = Math.round(d * 32);
  const g = new VoxelGrid(W + 2, 2, D + 2);
  const base = [0x6a6660, 0x5e5a55, 0x726c62][Math.floor(hash2(seed, 1, 3) * 3)];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const ex = (x + 0.5 - W / 2) / (W / 2), ez = (z + 0.5 - D / 2) / (D / 2);
    const e = Math.max(Math.abs(ex), Math.abs(ez)) * 0.6 + Math.hypot(ex, ez) * 0.4 + (hash2(x >> 1, z >> 1, seed) - 0.5) * 0.18;
    if (e > 1) continue;
    let c = e > 0.82 ? mulc(base, 0.8) : hash2(x, z, seed + 1) < 0.1 ? mulc(base, 1.1) : base;
    if (e < 0.5 && hash2(x >> 1, z, seed + 2) < 0.25) c = mixc(c, 0x8a8478, 0.4); // worn pale in the middle
    if (e > 0.75 && hash2(x, z, seed + 3) < 0.3) c = 0x3e4a28; // moss in the cracks round it
    g.set(x + 1, 0, z + 1, c);
  }
  return M32(g, [W / 2 + 1, 0, D / 2 + 1], { scale: S16, outline: false });
}
