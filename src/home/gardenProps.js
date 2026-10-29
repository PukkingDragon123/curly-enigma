// The glow garden under its skylight, the bath in its corner and the terrace out on the cliff, at
// 1/64 m voxels (1/32 tile): raised beds of glowing mushrooms and giant glowcaps, the stone face
// spouting into a round pool, Marigold's bench, the potting table, hanging baskets, a trellis of
// glow vine, the scarecrow in a miner's helmet, the light well up through the rock; the copper bath
// on claw feet with its screen, towels, shelf and the hot spring pipe; the balustrade, the brass
// telescope, a little table for tea, lantern posts and a crystal wind chime.
// Conventions as houseProps.js: tile units; wall pieces centred on x along the wall, z out of the
// wall, origin on the wall face at the floor; floor pieces centred, front toward +z.
import { VoxelGrid, C, wood, beam, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32, S16, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P } from './tavernProps.js';
import { H, jar, bottle, candle } from './houseProps.js';
import { makeRng } from '../core/util.js';

const vm = (m) => Math.round(m * 64);
const T = (v) => v * S32;
/** Glow colours of the garden's mushrooms: [cap, light spots, gills]. */
export const HUES = {
  teal: [0x5ad0e0, 0xd8faff, 0x2a8aa0], violet: [0xa070f0, 0xe8d0ff, 0x6a3aa8], amber: [0xffa850, 0xfff0c0, 0xb86a2a],
  pink: [0xff78c0, 0xffe0f0, 0xb03a80], green: [0x7af08a, 0xe0ffe0, 0x3aa04a],
};
const HUE_LIST = Object.keys(HUES);

/** A mushroom (stalk, skirt, cap, gills) into g (stalk) and gl (glowing cap) at (x, y, z), h tall, cap radius r. */
function shroom(g, gl, x, y, z, h, r, hue, seed = 0, lean = [0, 0]) {
  const [cap, spot, gill] = HUES[hue] || HUES.teal;
  const sr = Math.max(0.8, r * 0.22);
  line(g, [[x, y, z], [x + lean[0] * h * 0.5, y + h * 0.55, z + lean[1] * h * 0.5], [x + lean[0] * h, y + h, z + lean[1] * h]], (t) => sr * (1.2 - t * 0.35), (xx, yy, zz) => (h3(xx >> 1, yy >> 2, zz >> 1, seed) < 0.12 ? 0xd0c8b8 : 0xeee6d6));
  const cx = x + lean[0] * h, cz = z + lean[1] * h, cy = y + h;
  if (r > 4) ring(g, cx, cz, sr, sr + 1.6, Math.round(cy - h * 0.3), Math.round(cy - h * 0.3) + 1, 0xf6f0e4); // the skirt
  const capH = Math.max(2, r * 0.62);
  for (let j = 0; j < capH; j++) {
    const rr = r * Math.sqrt(Math.max(0, 1 - (j / capH) ** 2));
    ring(gl, cx, cz, j === 0 ? Math.max(0, rr - 1.2) : 0, rr, Math.round(cy + j), Math.round(cy + j) + 1, (xx, yy, zz) => (j === 0 ? gill : h3(xx >> 1, yy, zz >> 1, seed + 5) < 0.1 && j > 0 ? spot : (j === Math.floor(capH) - 1 ? mixc(cap, spot, 0.25) : cap)));
  }
  if (r > 3) ring(gl, cx, cz, 0, Math.max(1, r - 1.6), Math.round(cy - 1), Math.round(cy), gill); // gills under the cap
  return { x: cx, y: cy + capH * 0.5, z: cz };
}

/**
 * A raised bed of fieldstones, dark soil and moss, crowded with glowing mushrooms (w × d m).
 * Returns { obj, glows: [{ x, y, z, color }] (local tiles) }.
 */
export function mushroomBed(w = 1.4, d = 0.7, seed = 1, hues = null) {
  const W = vm(w), D = vm(d), Hb = 18;
  const g = new VoxelGrid(W + 2, 70, D + 2), gl = new VoxelGrid(W + 2, 70, D + 2);
  const rng = makeRng(seed);
  // the wall of fieldstones round the bed
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const e = Math.min(x, z, W - 1 - x, D - 1 - z);
    if (e < 5) {
      const top = Hb - (e === 0 ? 2 : 0) - (hash2(x >> 2, z >> 2, seed) < 0.3 ? 1 : 0);
      for (let y = 0; y < top; y++) {
        const st = hash2(Math.floor((x + (y >> 2) * 3) / 6), Math.floor(z / 6) + (y >> 2) * 7, seed + 1);
        const mortar = (y % 6 === 0) || ((x + z + (y >> 2) * 3) % 7 === 0);
        g.set(x + 1, y, z + 1, mortar ? 0x4a443e : [0x8a8274, 0x7a7266, 0x948a7c, 0x6e665a][Math.floor(st * 4)]);
      }
      if (hash2(x, z, seed + 2) < 0.18) g.set(x + 1, top, z + 1, hash2(x, z, seed + 3) < 0.5 ? C.moss : C.mossL); // moss on the coping
    } else {
      for (let y = 0; y < Hb - 4; y++) g.set(x + 1, y, z + 1, 0x2a1e16);
      const m = hash2(x >> 2, z >> 2, seed + 4);
      g.set(x + 1, Hb - 4, z + 1, m < 0.3 ? C.mossD : m < 0.5 ? C.moss : m < 0.53 ? 0x6a5a3a : 0x3a2a1e);
    }
  }
  // mushrooms: clusters of little ones, a few medium ones; glowing caps
  const glows = [];
  const pal = hues || [HUE_LIST[seed % HUE_LIST.length], HUE_LIST[(seed + 2) % HUE_LIST.length]];
  const n = Math.round((W * D) / 260);
  for (let k = 0; k < n; k++) {
    const x = 8 + rng() * (W - 14), z = 8 + rng() * (D - 14);
    const big = rng() < 0.22, hue = pal[k % pal.length];
    const h = big ? 14 + rng() * 18 : 4 + rng() * 7, r = big ? 5 + rng() * 4 : 2 + rng() * 2;
    const p = shroom(g, gl, x + 1, Hb - 3, z + 1, h, r, hue, seed + k, [(rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3]);
    if (big) glows.push({ x: T(p.x - (W + 2) / 2), y: T(p.y), z: T(p.z - (D + 2) / 2), color: HUES[hue][0] });
    // a few tiny buttons round each
    for (let j = 0; j < 3; j++) { const bx = Math.round(x + (rng() - 0.5) * 8), bz = Math.round(z + (rng() - 0.5) * 8); if (bx > 6 && bz > 6 && bx < W - 6 && bz < D - 6) { gl.set(bx + 1, Hb - 3, bz + 1, HUES[hue][0]); gl.set(bx + 1, Hb - 2, bz + 1, HUES[hue][1]); } }
  }
  const pv = [(W + 2) / 2, 0, (D + 2) / 2];
  return { obj: group(M32(g, pv), G32(gl, pv)), glows };
}

/** One giant glowcap, h m tall, cap radius r m. Returns { obj, glow (local tiles), color }. */
export function giantGlowcap(h = 1.0, r = 0.3, hue = 'teal', seed = 3) {
  const Hh = vm(h), R = vm(r);
  const S = R * 2 + 8;
  const g = new VoxelGrid(S, Hh + R + 6, S), gl = new VoxelGrid(S, Hh + R + 6, S);
  const c = S / 2;
  const lean = [(hash2(seed, 1, 3) - 0.5) * 0.18, (hash2(seed, 2, 3) - 0.5) * 0.18];
  // a bulb of a foot with roots into the soil
  g.ellipsoid(c, 2, c, R * 0.35, 3, R * 0.35, 0xd8d0c0);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + seed; line(g, [[c, 2, c], [c + Math.cos(a) * R * 0.5, 0, c + Math.sin(a) * R * 0.5]], 0.8, 0xb8ae9c); }
  const p = shroom(g, gl, c, 2, c, Hh - 2, R, hue, seed, lean);
  // drips of light hanging off the rim
  const [cap, spot] = HUES[hue] || HUES.teal;
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + seed; const x = p.x + Math.cos(a) * (R - 1), z = p.z + Math.sin(a) * (R - 1); for (let j = 0; j < 2 + (k % 3); j++) gl.set(Math.round(x), Math.round(p.y - R * 0.31 - 1 - j), Math.round(z), j ? cap : spot); }
  return { obj: group(M32(g, [c, 0, c]), G32(gl, [c, 0, c])), glow: { x: T(p.x - c), y: T(p.y), z: T(p.z - c) }, color: cap };
}

/** A carved stone face on the wall (a mole with its mouth open) spouting water. Returns { obj, mouth (local tiles) }. */
export function spoutFace(seed = 5) {
  const g = new VoxelGrid(40, 60, 16);
  const cx = 20, cy = 36;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 40; x++) {
    const d = Math.hypot((x + 0.5 - cx) / 17, (y + 0.5 - cy) / 19);
    if (d > 1) continue;
    const depth = Math.round(4 + (1 - d) * 7);
    for (let z = 0; z < depth; z++) g.set(x, y, z, mulc(0x8a8274, (z === depth - 1 ? 1.08 : 0.95) * (hash2(x >> 2, y >> 2, seed) < 0.2 ? 0.92 : 1)));
  }
  // brow, eyes, the snout and the open mouth
  for (const ex of [cx - 7, cx + 6]) { g.box(ex - 1, cy + 6, 9, 3, 2, 3, 0x5a5248); g.box(ex - 2, cy + 9, 9, 5, 1, 3, 0x9a9284); }
  g.ellipsoid(cx, cy - 1, 12, 5, 4, 5, 0x9a9084);
  g.box(cx - 1, cy - 1, 15, 2, 2, 1, 0x3a3430); // nostrils
  for (let y = cy - 12; y < cy - 6; y++) for (let x = cx - 4; x <= cx + 4; x++) for (let z = 6; z < 13; z++) if (Math.hypot(x + 0.5 - cx, (y + 0.5 - (cy - 9)) * 1.3) < 4) g.clear(x, y, z);
  g.box(cx - 2, cy - 10, 10, 4, 1, 6, 0x6a8a92); // its lip, wet
  // moss in the cracks, a bronze pipe in its mouth
  for (let k = 0; k < 40; k++) { const x = Math.floor(hash2(k, 1, seed) * 40), y = Math.floor(hash2(k, 2, seed) * 30) + 20; if (g.filled(x, y, 4)) g.set(x, y, 5, k % 3 ? C.moss : C.mossL); }
  line(g, [[cx, cy - 9, 8], [cx, cy - 9, 17]], 1.2, 0x8a6a3a);
  return { obj: M32(g, [cx, 0, 0]), mouth: { x: 0, y: T(cy - 9), z: T(17) } };
}

/** A round pool rimmed with stones (r m). Returns { obj, water: { y (local tiles), r (m) } }. */
export function pondBasin(r = 0.4, seed = 7) {
  const R = vm(r), S = R * 2 + 14, c = S / 2;
  const g = new VoxelGrid(S, 16, S), gl = new VoxelGrid(S, 16, S);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    if (d > R + 6) continue;
    if (d > R) {
      const a = Math.atan2(z + 0.5 - c, x + 0.5 - c), seg = Math.floor((a + Math.PI) / (Math.PI / 7));
      const top = 9 + Math.floor(hash2(seg, 1, seed) * 3);
      for (let y = 0; y < top; y++) g.set(x, y, z, mulc([0x8a8274, 0x7a7268, 0x948a7e][seg % 3], y === top - 1 ? 1.1 : 0.95));
      if (hash2(x, z, seed + 1) < 0.15) g.set(x, top, z, C.moss);
    } else {
      g.set(x, 0, z, 0x1a2a2e); g.set(x, 1, z, 0x22363a);
      if (hash2(x >> 1, z >> 1, seed + 2) < 0.06) gl.set(x, 2, z, 0x6ae0d0); // glowing pebbles on the bottom
    }
  }
  // lily pads with a glowing bud or two
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + seed, rr = R * 0.5; const px = c + Math.cos(a) * rr, pz = c + Math.sin(a) * rr; ring(g, px, pz, 0, 4, 7, 8, (x, y, z) => ((Math.atan2(z - pz, x - px) + 6.4) % 6.28 < 0.5 ? -1 : 0x3a8a3a)); if (k !== 1) gl.set(Math.round(px), 8, Math.round(pz), 0xffa0d0); }
  return { obj: group(M32(g, [c, 0, c]), G32(gl, [c, 0, c])), water: { y: T(7.4), r } };
}

/** Marigold's bench: oak slats on curly iron ends, a cushion, a brass plaque. Returns { obj, seats }. */
export function gardenBench(seed = 9) {
  const L = 60, Dp = 22;
  const g = new VoxelGrid(L + 4, 40, Dp + 4);
  const ir = iron(0x2e2e36, seed);
  for (const x of [2, L]) {
    line(g, [[x, 0, 3], [x, 16, 4], [x, 22, 10], [x, 17, 16], [x + (x === 2 ? 1 : -1), 13, 14]], 1, ir); // the scroll arm
    line(g, [[x, 0, Dp], [x, 15, Dp - 1]], 1, ir);
    line(g, [[x, 15, 2], [x, 34, 0]], 1, ir); // the back post
  }
  const sw = wood(H.oakL, { axis: 'x', across: 'z', pw: 4, seed });
  g.box(3, 15, 3, L - 2, 2, Dp - 2, (x, y, z) => (z % 4 === 0 ? -1 : sw(x, y, z))); // the seat slats
  for (let k = 0; k < 3; k++) g.box(3, 20 + k * 5, 1, L - 2, 3, 2, sw); // the back slats
  g.box(L / 2 - 6, 21, 3, 12, 4, 1, (x, y) => (y === 21 || y === 24 ? P.brassD : P.brass)); // the plaque
  g.ellipsoid(L / 2 - 8, 18.5, Dp / 2 + 1, 10, 2.2, 8, (x, y, z) => ((x + z) % 6 === 0 ? 0xe8c060 : 0x7a3a5a)); // a cushion
  return { obj: M32(g, [(L + 4) / 2, 0, Dp / 2 + 2]), seats: [{ x: T(-10), z: T(1), y: T(18), yaw: 0 }, { x: T(12), z: T(1), y: T(18), yaw: 0 }] };
}

/** The potting table against a wall: pots, seedlings, a trowel, seed packets, a can, a shelf of pots above, soil underneath. */
export function pottingTable(w = 1.2, seed = 11) {
  const W = vm(w), Ht = 40, D = 30;
  const g = new VoxelGrid(W + 4, 110, D + 2), gl = new VoxelGrid(W + 4, 110, D + 2);
  const x0 = 2;
  const tw = wood(0x8a6a48, { axis: 'x', across: 'z', pw: 6, seed });
  g.box(x0, Ht - 3, 0, W, 3, D, (x, y, z) => (h3(x >> 1, y, z >> 1, seed) < 0.12 ? 0x4a3a2a : tw(x, y, z))); // dirty top
  for (const x of [x0 + 1, x0 + W - 4]) for (const z of [1, D - 4]) g.box(x, 0, z, 3, Ht - 3, 3, 0x6a4a30);
  g.box(x0 + 2, 10, 2, W - 4, 2, D - 4, tw); // the low shelf
  // a sack of soil and a bag of grit on the low shelf
  g.ellipsoid(x0 + 16, 18, D / 2, 11, 7, 9, (x, y, z) => (y > 22 ? 0x5a4030 : 0xa88a5a));
  g.ellipsoid(x0 + W - 16, 16, D / 2, 8, 5, 7, 0x9a9890);
  // pots on the top: some empty, some with seedlings or little glowcaps
  const rng = makeRng(seed);
  for (let x = x0 + 6; x < x0 + W - 10; x += 11 + Math.floor(rng() * 4)) {
    const r = 3 + rng() * 2, h = 5 + rng() * 4, z = 8 + rng() * (D - 16);
    for (let y = 0; y < h; y++) ring(g, x, z, y < h - 1 ? 0 : r - 1, r - (h - y) * 0.1, Ht + y, Ht + y + 1, y >= h - 1 ? 0x9a4a2a : 0xb85a34);
    const k = rng();
    if (k < 0.35) for (let j = 0; j < 4; j++) line(g, [[x, Ht + h, z], [x + (rng() - 0.5) * 4, Ht + h + 3 + rng() * 3, z + (rng() - 0.5) * 4]], 0.5, 0x6ab84a);
    else if (k < 0.7) { const hue = HUE_LIST[Math.floor(rng() * HUE_LIST.length)]; shroom(g, gl, x, Ht + h - 1, z, 3 + rng() * 3, 1.5 + rng(), hue, seed); }
  }
  // a trowel, seed packets, a little hand rake
  line(g, [[x0 + W - 22, Ht, D - 6], [x0 + W - 14, Ht, D - 10]], 0.6, 0x7a7a84); g.box(x0 + W - 26, Ht, D - 6, 5, 1, 2, 0x8a5a32);
  for (let k = 0; k < 3; k++) g.box(x0 + 14 + k * 7, Ht, D - 5, 5, 1, 4, [0xe8c060, 0x8ac06a, 0xc86a8a][k]);
  // the shelf above with more pots and a jar of seeds
  g.box(x0 + 4, 80, 0, W - 8, 2, 14, tw);
  for (const bx of [x0 + 8, x0 + W - 10]) line(g, [[bx, 80, 1], [bx, 72, 1], [bx, 80, 12]], 0.8, C.iron);
  for (let x = x0 + 10; x < x0 + W - 14; x += 10) ring(g, x, 7, 0, 3.4, 82, 89, (xx, y) => (y === 88 ? 0x9a4a2a : 0xc06a40));
  jar(g, x0 + W - 12, 82, 7, 3, 8, 0xd8b060);
  return { obj: group(M32(g, [(W + 4) / 2, 0, 0]), G32(gl, [(W + 4) / 2, 0, 0])) };
}

/** A green tin watering can. */
export function wateringCan(seed = 13) {
  const g = new VoxelGrid(30, 22, 16);
  for (let y = 0; y < 12; y++) ring(g, 13, 8, 0, 6 - (y > 9 ? (y - 9) * 0.8 : 0), y, y + 1, (x, yy, z) => (yy === 0 || yy === 11 ? 0x3a6a4a : h3(x, yy, z, seed) < 0.06 ? 0x8a6a4a : 0x4a8a5a));
  line(g, [[18, 3, 8], [27, 12, 8]], 1, 0x4a8a5a); ring(g, 27, 8, 0, 2, 12, 14, 0x3a6a4a);
  line(g, [[9, 12, 8], [13, 19, 8], [17, 12, 8]], 0.7, 0x3a6a4a);
  return M32(g, [13, 0, 8]);
}

/** A wheelbarrow of soil with a spade in it. */
export function wheelbarrow(seed = 15) {
  const g = new VoxelGrid(64, 36, 34);
  const ir = iron(0x4a4a52, seed);
  // the wheel at the front (+x), legs at the back, handles out to the back
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) if (Math.hypot(x - 6.5, y - 6.5) < 7 && Math.hypot(x - 6.5, y - 6.5) > 4.6 || Math.hypot(x - 6.5, y - 6.5) < 1.6) for (let z = 15; z < 19; z++) g.set(x + 48, y, z, Math.hypot(x - 6.5, y - 6.5) > 6 ? 0x2a2a30 : 0x6a4a30);
  for (const z of [6, 27]) { line(g, [[16, 0, z], [16, 10, z]], 1, ir); line(g, [[2, 22, z], [54, 10, z + (z < 16 ? 9 : -9)]], 1, 0x6a4a30); }
  // the tray
  for (let y = 0; y < 12; y++) {
    const w = 10 + y, x0 = 14 - y * 0.4, x1 = 46 + y * 0.6;
    for (let x = Math.round(x0); x < x1; x++) for (let z = 17 - w; z <= 16 + w; z++) {
      const edge = x === Math.round(x0) || x === Math.ceil(x1) - 1 || z === 17 - w || z === 16 + w || y === 0;
      if (edge) g.set(x, 10 + y, z, h3(x, y, z, seed) < 0.06 ? C.rust : 0x5a7a8a);
    }
  }
  g.ellipsoid(30, 21, 16.5, 15, 4, 12, (x, y, z) => (h3(x >> 1, y, z >> 1, seed) < 0.1 ? 0x5ad0e0 : 0x3a2a1e)); // soil with spawn glinting
  line(g, [[22, 22, 14], [8, 34, 10]], 0.9, 0x8a5a32); g.box(20, 18, 12, 6, 6, 4, 0x7a7a84);
  return M32(g, [32, 0, 17]);
}

/** A moss basket on a chain from the ceiling with glow vine trailing over (origin at the hook). Returns { obj, glow }. */
export function hangingBasket(drop = 0.6, seed = 17) {
  const D = vm(drop);
  const g = new VoxelGrid(32, D + 40, 32), gl = new VoxelGrid(32, D + 40, 32);
  const c = 16, by = 14;
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; line(g, [[c + Math.cos(a) * 8, by + 8, c + Math.sin(a) * 8], [c, by + 22, c]], 0.4, P.iron); }
  for (let y = by + 22; y < D + 40; y++) g.set(c, y, c, y % 3 ? P.iron : P.ironL);
  for (let y = 0; y < 9; y++) ring(g, c, c, 0, 3 + y * 0.6, by + y, by + y + 1, (x, yy, z) => (h3(x, yy, z, seed) < 0.4 ? C.mossD : 0x6a4a2a));
  ring(g, c, c, 0, 8, by + 9, by + 10, C.moss);
  const rng = makeRng(seed);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, len = 10 + rng() * 16;
    const pts = [[c + Math.cos(a) * 7, by + 9, c + Math.sin(a) * 7]];
    for (let i = 1; i <= 5; i++) { const t = i / 5; pts.push([c + Math.cos(a) * (8 + t * 3), by + 9 - t * len, c + Math.sin(a) * (8 + t * 3)]); }
    line(g, pts, 0.5, 0x3a7a3a);
    for (let i = 2; i < pts.length; i += 2) gl.set(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i][2]), k % 2 ? 0x8af0d0 : 0xffd0f0);
  }
  for (let k = 0; k < 5; k++) { const a = k * 1.3; gl.set(Math.round(c + Math.cos(a) * 4), by + 11, Math.round(c + Math.sin(a) * 4), 0x6ae0f0); gl.set(Math.round(c + Math.cos(a) * 4), by + 12, Math.round(c + Math.sin(a) * 4), 0xd8faff); }
  return { obj: group(M32(g, [c, D + 40, c]), G32(gl, [c, D + 40, c])), glow: { x: 0, y: T(by + 6 - D - 40), z: 0 } };
}

/** A trellis on the wall (w × h m) with a glowing vine climbing it. */
export function trellis(w = 0.9, h = 1.7, seed = 19) {
  const W = vm(w), Hh = vm(h);
  const g = new VoxelGrid(W + 4, Hh + 4, 10), gl = new VoxelGrid(W + 4, Hh + 4, 10);
  for (let k = -Hh; k < W + Hh; k += 14) {
    line(g, [[k, 0, 2], [k + Hh, Hh, 2]], 0.6, 0x8a6a48);
    line(g, [[k + Hh, 0, 3], [k, Hh, 3]], 0.6, 0x7a5a3a);
  }
  // clip to the frame
  for (let y = 0; y < Hh + 4; y++) for (let x = 0; x < W + 4; x++) for (let z = 0; z < 10; z++) if (x < 2 || x >= W + 2 || y >= Hh) g.clear(x, y, z);
  g.box(2, 0, 1, 3, Hh, 4, 0x6a4a30); g.box(W - 1, 0, 1, 3, Hh, 4, 0x6a4a30); g.box(2, Hh - 3, 1, W, 3, 4, 0x6a4a30);
  const rng = makeRng(seed);
  for (let s = 0; s < 3; s++) {
    let x = 6 + s * (W / 3), y = 0;
    const pts = [];
    while (y < Hh - 6) { pts.push([x, y, 5]); x += (rng() - 0.5) * 10; x = Math.max(4, Math.min(W, x)); y += 5 + rng() * 4; }
    line(g, pts, 0.7, 0x3a6a2a);
    for (const p of pts) {
      g.set(Math.round(p[0]) + 1, Math.round(p[1]), 6, 0x5aa04a); g.set(Math.round(p[0]) - 1, Math.round(p[1]) + 1, 6, 0x6ab85a);
      if (rng() < 0.45) { gl.set(Math.round(p[0]), Math.round(p[1]) - 1, 7, s === 1 ? 0xffb0e0 : 0x9af0d8); gl.set(Math.round(p[0]) + 1, Math.round(p[1]) - 1, 7, 0xffffff); }
    }
  }
  return { obj: lowRes(() => group(M32(g, [(W + 4) / 2, 0, 0]), G32(gl, [(W + 4) / 2, 0, 0]))) };
}

/** The scarecrow: a mop head on a cross of poles, an apron, a miner's helmet with its lamp lit, a little rake. Returns { obj, lamp }. */
export function scarecrow(seed = 21) {
  const g = new VoxelGrid(44, 96, 24), gl = new VoxelGrid(44, 96, 24);
  const c = 22;
  line(g, [[c, 0, 12], [c, 78, 12]], 1.4, 0x7a5a3a);
  line(g, [[c - 18, 58, 12], [c + 18, 58, 12]], 1.1, 0x7a5a3a);
  // the coat: a sack with arms
  for (let y = 34; y < 60; y++) for (let x = c - 8 + (y - 34) * 0.1; x < c + 8 - (y - 34) * 0.1; x++) for (let z = 8; z < 16; z++) g.set(Math.round(x), y, z, (x + y) % 9 === 0 ? 0x8a6a3a : 0xa88a5a);
  for (const s of [-1, 1]) for (let x = 0; x < 14; x++) g.box(c + s * (8 + x) - (s < 0 ? 1 : 0), 55, 10, 1, 6, 4, 0xa88a5a);
  g.box(c - 6, 34, 15, 12, 18, 1, (x, y) => (y === 51 ? 0xc8382a : 0x3a5a8a)); // the apron
  // the head: a stringy mop, button eyes, a stitched smile, a star nose
  for (let k = 0; k < 60; k++) { const a = hash2(k, 1, seed) * Math.PI * 2, r = 4 + hash2(k, 2, seed) * 3; line(g, [[c + Math.cos(a) * 2, 72, 12 + Math.sin(a) * 2], [c + Math.cos(a) * r, 64 - hash2(k, 3, seed) * 4, 12 + Math.sin(a) * r]], 0.5, k % 4 ? 0xd8ccb0 : 0xb8ac90); }
  g.ellipsoid(c, 70, 12, 6, 6, 5, 0xc8bca0);
  g.set(c - 2, 71, 17, 0x1a1a1a); g.set(c + 2, 71, 17, 0x1a1a1a);
  for (let x = -2; x <= 2; x++) g.set(c + x, 67 + (Math.abs(x) === 2 ? 1 : 0), 17, 0x6a3a2a);
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1]]) g.set(c + dx, 69 + dy, 18, 0xf08aa0);
  // the miner's helmet with its lamp
  for (let y = 0; y < 6; y++) ring(g, c, 12, 0, 7.5 - y * 0.6, 75 + y, 76 + y, y ? 0xd8a838 : 0xb8882a);
  ring(g, c, 12, 0, 9, 75, 76, 0xb8882a);
  g.box(c - 2, 77, 18, 4, 3, 2, 0x5a5a62); gl.box(c - 1, 78, 20, 2, 2, 1, 0xfff0a0);
  // a little rake in one hand
  line(g, [[c + 26, 40, 14], [c + 20, 74, 14]], 0.6, 0x8a5a32);
  for (let k = 0; k < 4; k++) g.box(c + 18 + k * 2, 74, 14, 1, 3, 1, 0x7a7a84);
  return { obj: group(M32(g, [c, 0, 12]), G32(gl, [c, 0, 12])), lamp: { x: 0, y: T(78), z: T(9) } };
}

// ---------------------------------------------------------------- the bath
/** A copper bath on claw feet, water in it, a brush hung on the rim. Returns { obj, water: { y, w, d } (tiles/m), steam (local tiles) }. */
export function bathTub(seed = 23) {
  const L = 76, Wd = 40, Ht = 34;
  const g = new VoxelGrid(L + 4, Ht + 10, Wd + 4);
  const cu = (x, y, z) => (h3(x, y, z, seed) < 0.05 ? 0x6a9a82 : y % 7 === 0 ? H.copperL : H.copper);
  for (let y = 6; y < Ht; y++) {
    const k = (y - 6) / (Ht - 6), sh = 1 - Math.pow(1 - k, 2) * 0.25;
    const rx = (L / 2) * sh, rz = (Wd / 2) * sh;
    for (let z = 0; z < Wd + 4; z++) for (let x = 0; x < L + 4; x++) {
      const d = Math.hypot((x + 0.5 - (L + 4) / 2) / rx, (z + 0.5 - (Wd + 4) / 2) / rz);
      if (d > 1) continue;
      if (d > 0.9 || y < 8) g.set(x, y, z, y >= Ht - 2 ? H.copperL : cu(x, y, z));
    }
  }
  // the rolled rim
  for (let z = 0; z < Wd + 4; z++) for (let x = 0; x < L + 4; x++) { const d = Math.hypot((x + 0.5 - (L + 4) / 2) / (L / 2 + 1), (z + 0.5 - (Wd + 4) / 2) / (Wd / 2 + 1)); if (d <= 1 && d > 0.88) g.set(x, Ht, z, 0xe8a070); }
  // claw feet
  for (const [x, z] of [[12, 8], [L - 10, 8], [12, Wd - 4], [L - 10, Wd - 4]]) { g.ellipsoid(x, 4, z, 4, 4, 4, 0x7a5a2a); for (let k = -1; k <= 1; k++) g.box(x + k * 2, 0, z + 2, 1, 2, 2, 0x5a3a1a); }
  // a brush and a sponge on the rim
  g.box(L - 14, Ht + 1, 2, 10, 2, 3, 0x8a5a32); for (let x = L - 13; x < L - 6; x++) g.set(x, Ht + 3, 3, 0xd8ccb0);
  g.ellipsoid(16, Ht + 2, Wd / 2 + 2, 4, 2, 3, 0xe8c86a);
  return { obj: M32(g, [(L + 4) / 2, 0, (Wd + 4) / 2]), water: { y: T(Ht - 6), w: (L - 8) / 64, d: (Wd - 6) / 64 }, steam: { x: 0, y: T(Ht), z: 0 } };
}

/** A three-panel folding screen of woven reed with painted glowcaps, standing in a zigzag (each panel flat, turned on its hinges). */
export function foldingScreen(seed = 25) {
  const PW = 30, PH = 86, th = 0.55; // panel width, height (1/64 m), fold angle
  const out = group();
  const cx = Math.cos(th) * PW, cz = Math.sin(th) * PW;
  for (let p = 0; p < 3; p++) {
    const g = new VoxelGrid(PW, PH, 2);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      let c = ((x >> 2) + (y >> 2)) % 2 ? 0xc8a870 : 0xb8985e; // woven reed
      if (x < 2 || x > PW - 3 || y < 5 || y > PH - 4) c = 0x5a3a22;
      const mx = PW / 2, my = 42 + p * 6; // a painted glowcap on each panel
      if (Math.hypot(x - mx, (y - my) * 1.3) < 8 && y > my) c = [0x5aa0b0, 0x9a70d0, 0xe0905a][p];
      if (Math.abs(x - mx) < 2 && y > my - 18 && y <= my) c = 0xe8e0d0;
      g.set(x, y, 0, c); if (x < 2 || x > PW - 3 || y < 5 || y > PH - 4) g.set(x, y, 1, c);
    }
    const m = M32(g, [0, 0, 1]);
    // hinges zigzag: panel p from (x0, z0) to (x0 + cx, z0 ± cz)
    const x0 = (p - 1.5) * cx, z0 = p % 2 ? cz / 2 : -cz / 2;
    m.position.set(T(x0), 0, T(z0));
    m.rotation.y = p % 2 ? th : -th;
    out.add(m);
  }
  return out;
}

/** A towel rail with two striped towels (floor piece). */
export function towelRail(seed = 27) {
  const g = new VoxelGrid(40, 52, 12);
  for (const x of [2, 36]) { g.box(x, 0, 4, 2, 50, 2, 0x8a5a32); g.box(x - 2, 0, 1, 6, 2, 9, 0x6a4a2a); }
  for (const y of [30, 48]) g.box(2, y, 4, 36, 2, 2, 0x9a6a3e);
  for (const [x0, w, c1, c2] of [[5, 14, 0xe8e0d0, 0xc8504a], [21, 13, 0x8ac0d8, 0xf0ecdc]]) for (let y = 14; y < 50; y++) for (let x = x0; x < x0 + w; x++) {
    const z = y > 47 ? 3 : y < 31 ? 6 : 7;
    g.set(x, y, z, Math.floor((y - 14) / 5) % 2 ? c1 : c2);
    if (y > 30 && y < 47) g.set(x, y, 3, Math.floor((y - 14) / 5) % 2 ? c1 : c2);
  }
  return M32(g, [20, 0, 6]);
}

/** A little wall shelf for the bath: soaps, bottles, a scrubbing brush, a rubber duck, a candle. Returns { obj, candle }. */
export function bathShelf(seed = 29) {
  const W = 50;
  const g = new VoxelGrid(W, 30, 14), gl = new VoxelGrid(W, 30, 14);
  g.box(0, 6, 0, W, 2, 12, wood(0x9a7048, { axis: 'x', across: 'z', pw: 99, seed }));
  for (const x of [6, W - 7]) line(g, [[x, 6, 1], [x, 0, 1], [x, 6, 9]], 0.7, P.brassD);
  g.box(4, 8, 4, 6, 3, 5, 0xf0d8e8); g.box(11, 8, 5, 5, 2, 4, 0xd8f0d8); // soaps
  bottle(g, 21, 8, 6, 2.2, 7, 0x6a3a8a); bottle(g, 27, 8, 6, 1.8, 5, 0x3a8a6a);
  g.ellipsoid(37, 11, 6, 3.5, 3, 3, 0xf8d040); g.ellipsoid(39, 15, 6, 2.2, 2.2, 2.2, 0xf8d040); g.box(41, 14, 6, 2, 1, 1, 0xf08a2a); g.set(39, 16, 8, 0x1a1a1a); // the rubber duck
  candle(g, gl, 45, 8, 6, 6);
  return { obj: group(M32(g, [W / 2, 0, 0]), G32(gl, [W / 2, 0, 0])), candle: { x: T(45 - W / 2), y: T(16), z: T(6) } };
}

/** The hot spring's pipe out of the rock: a copper pipe and a brass tap, a ledge of mossy stones under it. Returns { obj, spout }. */
export function springPipe(seed = 31) {
  const g = new VoxelGrid(30, 70, 24);
  for (let y = 0; y < 26; y++) for (let x = 2; x < 28; x++) for (let z = 0; z < 6 + Math.floor(hash2(x >> 2, y >> 2, seed) * 5); z++) g.set(x, y, z, mulc([0x6a6458, 0x7a7266, 0x5e584e][Math.floor(hash2(x >> 2, y >> 2, seed + 1) * 3)], sp3(x, y, z, seed, 0.1, 0.1)));
  line(g, [[15, 70, 1], [15, 46, 1], [15, 44, 6], [15, 44, 16]], 1.6, (x, y, z) => (y % 9 === 0 ? H.copperD : H.copper));
  g.box(13, 47, 13, 5, 3, 3, P.brass); g.box(14, 50, 14, 3, 2, 1, P.brassL); // the tap
  for (let k = 0; k < 20; k++) { const x = 3 + Math.floor(hash2(k, 1, seed) * 24), y = 20 + Math.floor(hash2(k, 2, seed) * 8); g.set(x, y, 8, k % 3 ? C.moss : C.mossL); }
  return { obj: M32(g, [15, 0, 0]), spout: { x: 0, y: T(42), z: T(17) } };
}

// ---------------------------------------------------------------- the light well over the garden
/**
 * The skylight's well up through the rock (origin at the centre of the hole in the ceiling, floor
 * level of the well's foot): a ring of rough rock going up `deep` m, ferns and glow vine hanging,
 * an iron-framed glass dome at the top, and above it the cavern's own glowing roof (a disc of light
 * with glow-worms). Returns { obj, sky (local tiles: the light high up) }.
 */
export function lightWell(r = 0.95, deep = 2.2, seed = 33) {
  // the rock and the sky at 1/16 m (seen from below, far up), the dome and the ferns at 1/32 m
  const q = (m) => Math.round(m * 16), R = q(r), Dp = q(deep), S = R * 2 + 6, c = S / 2;
  const g = new VoxelGrid(S, Dp + 10, S), gl = new VoxelGrid(S, Dp + 10, S);
  for (let y = 0; y < Dp; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    const wob = R + 0.5 + Math.sin(Math.atan2(z - c, x - c) * 5 + y * 0.2) * 0.45 + (y / Dp) * 0.8;
    if (d < wob || d > wob + 1.7) continue;
    if (hash2(x, y, z + seed) < 0.05) { gl.set(x, y, z, hash2(x, z, y) < 0.5 ? 0x6ae0c0 : 0xb090ff); continue; } // glow-moss in the rock
    const k = Math.min(1, 0.45 + Math.floor((y / Dp) * 6) / 6 * 0.8);
    g.set(x, y, z, mulc(hash2(x, y, seed + z) < 0.3 ? 0x4a4458 : 0x3a3448, k));
  }
  // the cavern's roof far above: a disc of teal light with glow-worms (seen through the glass)
  const sky = Dp + 8;
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    if (d > R + 1.5) continue;
    gl.set(x, sky, z, hash2(x, z, seed + 7) < 0.08 ? 0xe8fff0 : mixc(0x1a4a5a, 0x3a8a9a, Math.max(0, 1 - d / (R + 1.5))));
  }
  // ferns and vines hanging down the well, the dome on top (1/32 m)
  const R2 = R * 2, D2 = Dp * 2, S2 = S * 2, c2 = S2 / 2;
  const f = new VoxelGrid(S2, D2 + 12, S2), fl = new VoxelGrid(S2, D2 + 12, S2);
  const rng = makeRng(seed);
  for (let k = 0; k < 16; k++) {
    const a = rng() * Math.PI * 2, y0 = 6 + rng() * (D2 - 10), len = 6 + rng() * 14;
    const x0 = c2 + Math.cos(a) * (R2 + 0.5), z0 = c2 + Math.sin(a) * (R2 + 0.5);
    const pts = [[x0, y0, z0]];
    for (let i = 1; i <= 4; i++) pts.push([x0 - Math.cos(a) * i * 0.5, y0 - (i / 4) * len, z0 - Math.sin(a) * i * 0.5]);
    line(f, pts, 0.5, k % 3 ? 0x3a7a3a : 0x4a8a3e);
    if (k % 2) fl.set(Math.round(pts[4][0]), Math.round(pts[4][1]), Math.round(pts[4][2]), 0x9af0d8);
  }
  for (let j = 0; j < 7; j++) {
    const rr = (R2 + 2) * Math.sqrt(1 - (j / 7) ** 2);
    ring(f, c2, c2, Math.max(0, rr - 1), rr, D2 + j, D2 + j + 1, (x, y, z, a) => (Math.abs(((a / Math.PI) * 4 + 8) % 1 - 0.5) > 0.42 || j === 0 ? 0x2e2e36 : -1));
  }
  const S8 = 1 / 8;
  return {
    obj: group(M32(g, [c, 0, c], { scale: S8 }), G32(gl, [c, 0, c], { scale: S8 }), M32(f, [c2, 0, c2], { scale: S16 }), G32(fl, [c2, 0, c2], { scale: S16 })),
    sky: { x: 0, y: T(Dp * 4 + 20), z: 0 },
  };
}

// ---------------------------------------------------------------- the terrace
/** A stone balustrade len m long (along local x, its face toward +z): plinth, turned balusters, a coping rail, moss. */
export function balustrade(len = 4.2, seed = 35) {
  const L = vm(len), Hh = 36;
  const g = new VoxelGrid(L + 2, Hh + 4, 16), gl = new VoxelGrid(L + 2, Hh + 4, 16);
  const st = (x, y, z) => [0xaaa49a, 0x9e988e, 0xb4aea2][Math.floor(h3(x >> 3, y >> 2, z >> 3, seed) * 3)];
  g.box(0, 0, 2, L + 2, 5, 12, st); // the plinth
  g.box(0, Hh - 5, 1, L + 2, 5, 14, (x, y, z) => (y === Hh - 1 ? mulc(st(x, y, z), 1.1) : st(x, y, z))); // the coping
  for (let x = 6; x < L - 3; x += 11) {
    if ((x - 6) % 66 === 0) { g.box(x - 3, 5, 3, 8, Hh - 10, 10, st); continue; } // a pier every so often
    for (let y = 5; y < Hh - 5; y++) {
      const t = (y - 5) / (Hh - 10);
      const r = 2.2 + Math.sin(t * Math.PI) * 1.6 - (Math.abs(t - 0.82) < 0.06 ? 1 : 0);
      ring(g, x + 1, 8, 0, r, y, y + 1, st);
    }
  }
  for (let x = 0; x < L + 2; x++) for (let z = 1; z < 15; z++) {
    if (hash2(x >> 2, z >> 2, seed + 3) < 0.2) g.set(x, Hh, z, C.moss);
    if (hash2(x, z, seed + 4) < 0.01) { gl.set(x, Hh, z, 0x8af0d0); }
  }
  return { obj: group(M32(g, [(L + 2) / 2, 0, 8]), G32(gl, [(L + 2) / 2, 0, 8])), h: T(Hh) };
}

/** Old Star's brass telescope on a wooden tripod, pointing out (+z) and a little up. Returns { obj, eye (local tiles) }. */
export function telescope(seed = 37) {
  const g = new VoxelGrid(40, 70, 70);
  const c = 20, top = 40;
  for (const a of [0, 2.1, 4.2]) line(g, [[c + Math.cos(a) * 14, 0, 30 + Math.sin(a) * 14], [c, top, 30]], 0.9, beam(0x6a4a30, 'y', seed));
  g.box(c - 2, top - 2, 28, 5, 4, 5, P.brassD);
  // the tube: three draws, brass bands, an eyepiece at the back
  const pts = [[c, top + 2, 12], [c, top + 13, 64]];
  line(g, pts, (t) => 2.4 + t * 1.6, (x, y, z, t) => (Math.floor(t * 12) % 4 === 0 ? P.brassL : t < 0.3 ? P.brassD : P.brass));
  ring(g, c, 64, 0, 4.4, top + 13, top + 14, P.brassD);
  line(g, [[c, top + 1, 12], [c, top, 6]], 1.1, 0x2a2a30);
  return { obj: M32(g, [c, 0, 30]), eye: { x: 0, y: T(top), z: T(6 - 30) } };
}

/** A little iron table for tea and two chairs (floor piece). Returns { obj, seats, cup }. */
export function teaTable(seed = 39) {
  const g = new VoxelGrid(90, 50, 40);
  const ir = iron(0x2e2e36, seed);
  const tx = 45, tz = 20;
  ring(g, tx, tz, 0, 13, 27, 29, (x, y, z) => (y === 28 ? 0x4a4a54 : 0x3a3a44));
  line(g, [[tx, 0, tz], [tx, 27, tz]], 1.2, ir);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; line(g, [[tx, 3, tz], [tx + Math.cos(a) * 9, 0, tz + Math.sin(a) * 9]], 0.8, ir); }
  // a teapot and two cups, a plate of biscuits
  for (let y = 0; y < 8; y++) ring(g, tx - 3, tz, 0, 4 - Math.abs(y - 3) * 0.35, 29 + y, 30 + y, 0x3a6a9a);
  line(g, [[tx + 1, 32, tz], [tx + 5, 36, tz]], 0.7, 0x3a6a9a); g.box(tx - 4, 37, tz - 1, 2, 2, 2, 0xe8e0d0);
  for (const [cx, cz] of [[tx + 6, tz - 6], [tx - 8, tz + 7]]) ring(g, cx, cz, 0, 2.2, 29, 33, (x, y) => (y === 32 ? 0x6a3a1a : 0xf0ecdc));
  ring(g, tx + 5, tz + 6, 0, 3.6, 29, 30, 0xf0ecdc); for (let k = 0; k < 4; k++) g.box(tx + 3 + (k % 2) * 3, 30, tz + 4 + (k >> 1) * 3, 2, 1, 2, 0xd8a050);
  // the chairs, either side, turned to the view
  for (const [cx, dir] of [[12, 1], [78, -1]]) {
    for (const [lx, lz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) line(g, [[cx + lx, 0, tz + lz], [cx + lx * 0.8, 18, tz + lz * 0.8]], 0.7, ir);
    ring(g, cx, tz, 0, 9, 18, 20, (x, y, z) => ((x + z) % 3 === 0 ? 0x2a2a30 : 0x3a3a44));
    for (let y = 20; y < 44; y++) for (let k = -7; k <= 7; k++) { const x = cx - dir * 8, z = tz + k; if (Math.abs(k) === 7 || y === 43 || (y - 20) % 6 === 0 || (k + y) % 5 === 0) g.set(x, y, z, 0x3a3a44); }
    g.ellipsoid(cx, 21, tz, 7, 1.6, 7, dir > 0 ? 0xc8604a : 0x5a8a6a); // a cushion
  }
  return { obj: M32(g, [45, 0, 20]), seats: [{ x: T(12 - 45), z: T(0), y: T(21), yaw: -Math.PI / 2 }, { x: T(78 - 45), z: T(0), y: T(21), yaw: Math.PI / 2 }], cup: { x: T(6), y: T(33), z: T(-6) } };
}

/** An iron lantern post (h m). Returns { obj, light }. */
export function lanternPost(h = 1.3, seed = 41) {
  const Hh = vm(h);
  const g = new VoxelGrid(24, Hh + 30, 24), gl = new VoxelGrid(24, Hh + 30, 24);
  const c = 12;
  ring(g, c, c, 0, 6, 0, 3, 0x2e2e36); ring(g, c, c, 0, 4, 3, 6, 0x3a3a44);
  line(g, [[c, 6, c], [c, Hh, c]], 1.3, (x, y) => (y % 24 === 0 ? 0x4a4a54 : 0x2e2e36));
  // the lantern: a cage of iron round warm glass, a little roof and a finial
  g.box(c - 6, Hh, c - 6, 13, 2, 13, 0x2e2e36);
  for (const [x, z] of [[c - 6, c - 6], [c + 6, c - 6], [c - 6, c + 6], [c + 6, c + 6]]) g.box(x, Hh + 2, z, 1, 16, 1, 0x2e2e36);
  gl.box(c - 5, Hh + 2, c - 5, 11, 16, 11, (x, y) => (y > Hh + 12 ? C.glowW : C.glowO)); gl.box(c - 2, Hh + 6, c - 2, 5, 6, 5, C.glowY);
  for (let j = 0; j < 6; j++) g.box(c - 7 + j, Hh + 18 + j, c - 7 + j, 15 - j * 2, 1, 15 - j * 2, 0x3a3a44);
  g.box(c - 1, Hh + 24, c - 1, 2, 4, 2, P.brass);
  return { obj: group(M32(g, [c, 0, c]), G32(gl, [c, 0, c])), light: { x: 0, y: T(Hh + 10), z: 0 } };
}

/** A wind chime of crystal shards on a bracket from the wall (wall piece). Returns { obj, glow }. */
export function windChime(seed = 43) {
  const g = new VoxelGrid(40, 70, 44), gl = new VoxelGrid(40, 70, 44);
  line(g, [[20, 66, 0], [20, 66, 30], [20, 60, 30]], 0.9, 0x2e2e36);
  ring(g, 20, 30, 7, 8, 58, 59, P.brass);
  const rng = makeRng(seed);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, x = 20 + Math.cos(a) * 7, z = 30 + Math.sin(a) * 7, len = 8 + rng() * 12;
    line(g, [[x, 58, z], [x, 50 - len * 0.2, z]], 0.3, 0x8a8a92);
    const top = 48 - len * 0.2;
    const hue = [0x8af0f0, 0xc0a0ff, 0xff9ad0][k % 3];
    for (let j = 0; j < len; j++) { const w = j > len - 3 ? 0.4 : 1.2; ring(gl, x, z, 0, w, Math.round(top - j), Math.round(top - j) + 1, j % 4 === 0 ? 0xffffff : hue); }
  }
  return { obj: group(M32(g, [20, 0, 0]), G32(gl, [20, 0, 0])), glow: { x: 0, y: T(40), z: T(30) } };
}

/** The cliff falling away under the terrace (w m wide, deep m down; its face toward +z, top at y 0). Built at 1/16 m: it's seen from above and far. */
export function cliffFace(w = 5.2, deep = 5, seed = 45) {
  const W = Math.round(w * 16), Dp = Math.round(deep * 16);
  const g = new VoxelGrid(W, Dp, 20), gl = new VoxelGrid(W, Dp, 20);
  for (let y = 0; y < Dp; y++) for (let x = 0; x < W; x++) {
    const bulge = Math.round((5 + 4 * Math.sin((x >> 1) * 0.28 + seed) * Math.sin((y >> 1) * 0.2) + 3 * hash2(x >> 2, y >> 2, seed) + (y / Dp) * 6) / 2) * 2; // (in steps of two: fewer faces)
    const k = Math.max(0.35, 1 - Math.floor((y / Dp) * 5) / 5 * 0.6);
    for (let z = 0; z < bulge; z++) g.set(x, Dp - 1 - y, z, mulc(hash2(x >> 2, y >> 2, seed + (z >> 2)) < 0.3 ? 0x4a4458 : 0x3a3448, k));
    const h = hash2(x, y, seed + 9);
    if (h < 0.03) gl.set(x, Dp - 1 - y, bulge, h < 0.015 ? 0x6ae0c0 : 0xb090ff);
    else if (h < 0.1 && y < Dp * 0.4) g.set(x, Dp - 1 - y, bulge, C.mossD);
  }
  // vines trailing down the face from the terrace's edge
  for (let k = 0; k < 18; k++) {
    const x = hash2(k, 1, seed) * W, len = 5 + hash2(k, 2, seed) * Dp * 0.5;
    for (let j = 0; j < len; j++) { const z = 9 + Math.round(Math.sin(j * 0.4 + k)) + Math.round(j * 0.08); g.set(Math.round(x + Math.sin(j * 0.6 + k) * 0.6), Dp - 1 - j, z, 0x3a6a2a); if (j % 4 === 2) gl.set(Math.round(x) + 1, Dp - 1 - j, z + 1, 0x9af0d8); }
  }
  const S8 = 1 / 8;
  return group(M32(g, [W / 2, Dp, 0], { scale: S8 }), G32(gl, [W / 2, Dp, 0], { scale: S8 }));
}
