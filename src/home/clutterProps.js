// The small things that make Old Star's rooms lived in, at 1/64 m voxels (1/32 tile): in the living
// room a gramophone, his knitting basket, piles of books, a basket of logs, slippers by the fire, a
// standing globe of the surface; in the kitchen the bread bin, the butter churn, a basket of eggs,
// plaits of garlic, the spice rack, the mop and bucket; in the smithy a rack of finished blades,
// the grindstone, the scrap pile, his apron on its hook, horseshoes on a nail; in the hall a bench
// for boots, a stand of sticks and a parasol, a mirror, the key board, miners' helmets on pegs and
// a doormat. Conventions as houseProps.js (tile units; wall pieces centred on x, z out of the wall).
import { VoxelGrid, C, wood, beam, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P } from './tavernProps.js';
import { H, jar, bottle, books } from './houseProps.js';
import { makeRng } from '../core/util.js';

const T = (v) => v * S32;

// ---------------------------------------------------------------- the living room
/** A gramophone on a little cabinet: a brass horn like a flower, a crank, a record. Returns { obj, horn }. */
export function gramophone(seed = 201) {
  const g = new VoxelGrid(44, 80, 40);
  const cw = wood(H.walnut, { axis: 'y', pw: 99, seed });
  g.box(6, 0, 6, 32, 30, 28, (x, y, z) => (y === 29 ? mulc(H.walnut, 1.15) : z === 33 && (x === 21 || x === 22) ? P.brass : cw(x, y, z)));
  g.box(8, 30, 8, 28, 8, 24, (x, y, z) => (y === 37 ? mulc(H.walnut, 1.2) : H.walnut));
  ring(g, 22, 20, 0, 10, 38, 39, 0x1a1a1e); ring(g, 22, 20, 0, 3, 38, 40, 0xc8382a); // the record
  line(g, [[34, 38, 30], [34, 42, 30], [26, 42, 20]], 0.6, P.brassD); // the tone arm
  line(g, [[36, 32, 22], [41, 32, 22], [41, 28, 22]], 0.6, P.brassD); g.box(40, 26, 21, 2, 2, 3, 0x2a1a12); // the crank
  // the horn: a brass trumpet flaring up and out, petals at the mouth
  const pts = [[30, 42, 20], [28, 52, 18], [24, 60, 14], [20, 66, 10]];
  line(g, pts, (t) => 1.4 + t * t * 9, (x, y, z, t) => (t > 0.85 ? (h3(x, y, z, seed) < 0.5 ? P.brassL : P.brass) : (Math.floor(t * 14) % 3 ? P.brass : P.brassD)));
  for (let y = 60; y < 80; y++) for (let x = 6; x < 36; x++) for (let z = 0; z < 26; z++) { const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 68, z + 0.5 - 9); if (d < 6.5 && g.filled(x, y, z)) g.clear(x, y, z); } // hollow the mouth
  return { obj: M32(g, [22, 0, 20]), horn: { x: T(-2), y: T(68), z: T(-11) } };
}

/** A basket of wool with needles stuck in, a half-knitted scarf trailing out. */
export function knittingBasket(seed = 203) {
  const g = new VoxelGrid(30, 22, 30);
  for (let y = 0; y < 10; y++) ring(g, 15, 15, y < 1 ? 0 : 9 + y * 0.25, 10.4 + y * 0.25, y, y + 1, (x, yy, z) => ((x + yy + z) % 3 ? 0xb8904a : 0x9a7038));
  for (const [x, z, c] of [[12, 12, 0xc8382a], [18, 14, 0x3a6aa8], [14, 19, 0xe8c050], [19, 19, 0x6a9a4a]]) g.ellipsoid(x, 10, z, 4, 4, 4, (xx, y, zz) => ((xx + y) % 2 ? c : mulc(c, 0.85)));
  line(g, [[13, 10, 12], [9, 21, 6]], 0.4, 0xc8c8d0); line(g, [[15, 10, 13], [12, 21, 4]], 0.4, 0xc8c8d0);
  for (let k = 0; k < 18; k++) g.box(24 + Math.round(Math.sin(k * 0.4) * 2), Math.max(0, 9 - k), 12 + Math.round(k * 0.6), 4, 1, 1, k % 4 < 2 ? 0xc8382a : 0xf0e8d0);
  return M32(g, [15, 0, 15]);
}

/** A pile of books on the floor, n deep, a teacup on top. */
export function bookStack(n = 5, seed = 205) {
  const g = new VoxelGrid(30, n * 5 + 10, 26);
  const pal = [0x7a2a24, 0x2a4a6a, 0x3a5a3a, 0x8a6a2a, 0x5a3a5a, 0x6a3a1e];
  let y = 0;
  for (let k = 0; k < n; k++) {
    const w = 18 + Math.floor(hash2(k, 1, seed) * 6), d = 14 + Math.floor(hash2(k, 2, seed) * 4), h = 3 + Math.floor(hash2(k, 3, seed) * 3);
    const ox = 4 + Math.floor(hash2(k, 4, seed) * 4), oz = 4 + Math.floor(hash2(k, 5, seed) * 4);
    const c = pal[Math.floor(hash2(k, 6, seed) * pal.length)];
    g.box(ox, y, oz, w, h, d, (x, yy, z) => (z === oz + d - 1 && yy > y && yy < y + h - 1 ? 0xe8dcc0 : (x === ox + 2 ? 0xd8b050 : c)));
    y += h;
  }
  ring(g, 14, 12, 0, 2.6, y, y + 4, (x, yy) => (yy === y + 3 ? 0x6a3a1a : 0xf0ecdc));
  return M32(g, [15, 0, 13]);
}

/** A wicker basket of split logs and kindling by the fire. */
export function logBasket(seed = 207) {
  const g = new VoxelGrid(34, 30, 26);
  for (let y = 0; y < 14; y++) for (let x = 2; x < 32; x++) for (let z = 2; z < 24; z++) {
    const e = Math.min(x - 2, 31 - x, z - 2, 23 - z);
    if (e > 1 && y > 1) continue;
    g.set(x, y, z, (x + y + z) % 3 ? 0xa8804a : 0x8a6038);
  }
  const rng = makeRng(seed);
  for (let k = 0; k < 7; k++) { const z = 6 + (k % 3) * 6, y = 12 + Math.floor(k / 3) * 5; line(g, [[4 + rng() * 2, y, z], [28 + rng() * 2, y + rng() * 2, z + rng() * 2]], 2.4, (x, yy, zz) => (x < 6 || x > 27 ? 0xc8a070 : h3(x, yy, zz, seed) < 0.3 ? 0x5a4030 : 0x6a4a32)); }
  return M32(g, [17, 0, 13]);
}

/** A pair of slippers, toes to the fire. */
export function slippers(seed = 209) {
  const g = new VoxelGrid(24, 6, 22);
  for (const x of [6, 17]) { g.ellipsoid(x, 1.5, 11, 4, 2, 9, 0x7a2a3a); g.ellipsoid(x, 3, 14, 3.4, 2, 5, 0x8a3a4a); g.box(x - 3, 0, 4, 6, 1, 15, 0x5a3a2a); }
  return M32(g, [12, 0, 11], { outline: false });
}

/** A standing globe of the surface on a turned wooden stand, the continents painted by guesswork. */
export function standingGlobe(seed = 211) {
  const g = new VoxelGrid(34, 64, 34);
  for (const a of [0, 2.1, 4.2]) line(g, [[17 + Math.cos(a) * 12, 0, 17 + Math.sin(a) * 12], [17, 22, 17]], 0.9, H.oakM);
  line(g, [[17, 22, 17], [17, 30, 17]], 1.4, H.oakM);
  for (let k = 0; k < 28; k++) { const a = -Math.PI * 0.8 + (k / 27) * Math.PI * 1.6; g.set(Math.round(17 + Math.sin(a) * 15), Math.round(46 - Math.cos(a) * 15), 17, P.brass); }
  g.ellipsoid(17, 46, 17, 12, 12, 12, (x, y, z) => {
    const lon = Math.atan2(z - 17, x - 17), lat = (y - 46) / 12;
    const land = Math.sin(lon * 3 + lat * 4) + Math.sin(lon * 5 - lat * 2) * 0.6 > 0.7;
    if (Math.abs(lat) > 0.86) return 0xf0f0f0;
    return land ? (h3(x, y, z, seed) < 0.3 ? 0x6a8a3a : 0x8aa04a) : 0x4a7ab8;
  });
  return M32(g, [17, 0, 17]);
}

// ---------------------------------------------------------------- the kitchen
/** A bread bin with a loaf and the heel of another, a knife and crumbs (on a counter or the floor). */
export function breadBin(seed = 221) {
  const g = new VoxelGrid(34, 22, 24);
  g.box(2, 0, 2, 22, 14, 20, (x, y, z) => (y === 13 || x === 2 || x === 23 ? 0x6a8a6a : 0x7a9a7a));
  g.box(4, 13, 2, 18, 2, 4, 0xd8ccb0); for (let x = 6; x < 20; x++) g.set(x, 9, 21, x % 2 ? 0xe8dcc0 : 0x7a9a7a); // BREAD
  g.ellipsoid(28, 4, 12, 5, 4, 8, (x, y) => (y > 5 ? 0xc8883a : 0xa8682a));
  line(g, [[25, 1, 4], [33, 1, 2]], 0.5, 0xb8b8c0);
  return M32(g, [17, 0, 12]);
}

/** A wooden butter churn with its dasher. */
export function butterChurn(seed = 223) {
  const g = new VoxelGrid(22, 60, 22);
  for (let y = 0; y < 34; y++) ring(g, 11, 11, y < 1 ? 0 : 6.5 - y * 0.05, 8 - y * 0.06, y, y + 1, (x, yy, z) => (yy % 11 === 0 ? 0x3a3a44 : (Math.floor(Math.atan2(z - 11, x - 11) * 3) % 2 ? 0xa8804a : 0x9a7040)));
  ring(g, 11, 11, 0, 6.4, 34, 36, 0x8a6038);
  line(g, [[11, 30, 11], [11, 58, 11]], 0.7, 0xb08a5a);
  return M32(g, [11, 0, 11]);
}

/** A basket of eggs (brown and speckled) on a cloth. */
export function eggBasket(seed = 225) {
  const g = new VoxelGrid(30, 22, 26);
  for (let y = 0; y < 8; y++) ring(g, 15, 13, y < 1 ? 0 : 8 + y * 0.3, 9.4 + y * 0.3, y, y + 1, (x, yy, z) => ((x + yy + z) % 3 ? 0xb8904a : 0x9a7038));
  line(g, [[5, 8, 13], [15, 20, 13], [25, 8, 13]], 0.7, 0x9a7038);
  for (let k = 0; k < 7; k++) { const a = k * 0.9, r = k ? 4.6 : 0; g.ellipsoid(15 + Math.cos(a) * r, 8.5, 13 + Math.sin(a) * r, 2.3, 3, 2.3, (x, y, z) => (h3(x, y, z, seed) < 0.12 ? 0x8a6a4a : k % 3 ? 0xe8c8a0 : 0xf0ece0)); }
  return M32(g, [15, 0, 13]);
}

/** A plait of garlic (or onions) hanging from a nail (origin at the nail). */
export function garlicString(len = 0.5, onion = false, seed = 227) {
  const L = Math.round(len * 64);
  const g = new VoxelGrid(16, L + 4, 12);
  line(g, [[8, L + 2, 6], [8, 2, 6]], 0.5, 0xc8a878);
  for (let j = 0; j * 6 < L - 6; j++) {
    const y = L - 4 - j * 6, x = 8 + (j % 2 ? 2.4 : -2.4);
    g.ellipsoid(x, y, 6, 3.2, 3, 3.2, onion ? (j % 3 ? 0xb8702a : 0xa85a2a) : (h3(x, y, j, seed) < 0.3 ? 0xd8c8b0 : 0xf0e8dc));
    g.set(Math.round(x), y + 3, 6, onion ? 0x8a5a2a : 0xc8b8a0);
  }
  return M32(g, [8, L + 2, 6]);
}

/** A little spice rack on the wall: two rows of labelled tins and jars. */
export function spiceRack(seed = 229) {
  const W = 46;
  const g = new VoxelGrid(W, 34, 10);
  g.box(0, 0, 0, W, 34, 1, 0x6a4a2a);
  for (const y of [2, 17]) { g.box(0, y, 0, W, 2, 9, 0x8a6038); g.box(0, y + 2, 7, W, 3, 1, 0x8a6038); }
  const cols = [0xc84a2a, 0xe8a030, 0x6a8a3a, 0x8a5a3a, 0xd8c8a0, 0x3a6a8a, 0xb83a5a];
  for (const y of [4, 19]) for (let x = 3; x < W - 4; x += 6) {
    const c = cols[(x + y) % cols.length];
    if ((x + y) % 3) jar(g, x + 2, y, 4, 2.2, 8, c, 0xb8b8c0, 0.7); else g.box(x, y, 2, 5, 9, 5, (xx, yy) => (yy > y + 6 ? 0x8a8a92 : c));
  }
  return M32(g, [W / 2, 0, 0]);
}

/** A mop in a bucket, leaning. */
export function mopBucket(seed = 231) {
  const g = new VoxelGrid(30, 78, 26);
  for (let y = 0; y < 16; y++) ring(g, 12, 13, y < 1 ? 0 : 7 - y * 0.02, 8.4 + y * 0.08, y, y + 1, (x, yy) => (yy % 7 === 0 ? 0x5a5a64 : 0x8a8a94));
  ring(g, 12, 13, 0, 7, 12, 13, 0x5a7a8a);
  line(g, [[12, 0, 13], [22, 76, 20]], 0.8, 0xb08a5a);
  for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; line(g, [[13, 4, 13], [13 + Math.cos(a) * 5, 1 + (k % 3), 13 + Math.sin(a) * 5]], 0.5, 0xd8ccb0); }
  return M32(g, [13, 0, 13]);
}

// ---------------------------------------------------------------- the smithy
/** A rack of finished blades on the wall: daggers, a short sword, an axe, a spear head, each with its tag. */
export function bladeRack(w = 0.9, seed = 241) {
  const W = Math.round(w * 64);
  const g = new VoxelGrid(W, 70, 12);
  g.box(0, 6, 0, W, 4, 6, beam(0x4a2e1c, 'x', seed)); g.box(0, 50, 0, W, 4, 6, beam(0x4a2e1c, 'x', seed));
  const kinds = ['dagger', 'sword', 'axe', 'dagger', 'spear', 'dagger'];
  const n = Math.min(kinds.length, Math.floor((W - 6) / 9));
  for (let i = 0; i < n; i++) {
    const x = 6 + Math.round(i * ((W - 12) / Math.max(1, n - 1))), k = kinds[i];
    const steel = (xx, y) => (y % 7 === 0 ? 0xe8eef4 : 0xb8c0c8), bronze = [0xd8a050, 0xc87a4a][i % 2];
    const metal = i % 3 === 1 ? bronze : null;
    if (k === 'axe') { line(g, [[x, 8, 6], [x, 54, 6]], 0.7, 0x8a5a32); g.box(x - 6, 44, 5, 6, 8, 2, metal || 0xa8b0b8); }
    else if (k === 'spear') { line(g, [[x, 8, 6], [x, 46, 6]], 0.6, 0x8a5a32); g.box(x - 1, 46, 5, 3, 10, 2, metal || 0xc0c8d0); }
    else {
      const len = k === 'sword' ? 40 : 24;
      g.box(x - 1, 12, 5, 3, len, 2, metal ? () => metal : steel); g.box(x - 4, 12 + len, 5, 9, 2, 2, P.brass); g.box(x - 1, 14 + len, 5, 3, 7, 2, 0x5a3a22); g.box(x - 1, 21 + len, 5, 3, 2, 2, P.brass);
    }
    g.box(x + 2, 30, 7, 3, 4, 1, 0xeadcbe); // a paper tag
  }
  return M32(g, [W / 2, 0, 0]);
}

/** A grindstone on its frame with a treadle and a trough of water under it. */
export function grindstone(seed = 243) {
  const g = new VoxelGrid(50, 52, 34);
  const fw = beam(0x5a3a22, 'y', seed);
  for (const z of [6, 26]) { line(g, [[8, 0, z], [16, 30, z]], 1.4, fw); line(g, [[36, 0, z], [26, 30, z]], 1.4, fw); }
  g.box(4, 2, 6, 40, 3, 22, fw);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) { const d = Math.hypot(x + 0.5 - 15, y + 0.5 - 15); if (d < 14) for (let z = 13; z < 20; z++) g.set(x + 6, y + 18, z, d < 2 ? 0x3a3a44 : mulc(0x9a9282, (d > 12.5 ? 0.85 : 1) * sp3(x, y, z, seed, 0.1, 0.08))); }
  line(g, [[21, 33, 6], [21, 33, 30], [24, 38, 31]], 0.7, 0x3a3a44); // the axle and its handle
  g.box(8, 5, 10, 30, 8, 14, (x, y, z) => (y === 12 ? 0x2a4a5a : 0x6a4a2a)); // the trough
  return M32(g, [25, 0, 17]);
}

/** A heap of scrap: bent hoops, a broken pick head, offcuts, a rusty bucket. */
export function scrapPile(seed = 245) {
  const g = new VoxelGrid(44, 20, 34);
  const rng = makeRng(seed);
  for (let k = 0; k < 22; k++) {
    const x = 6 + rng() * 32, z = 6 + rng() * 22, y = rng() * 6;
    const c = rng() < 0.4 ? C.rust : rng() < 0.6 ? 0x5a5a64 : 0x7a7a84;
    if (k % 4 === 0) line(g, [[x, y, z], [x + (rng() - 0.5) * 18, y + rng() * 4, z + (rng() - 0.5) * 14]], 0.8, c);
    else g.box(Math.round(x), Math.round(y), Math.round(z), 3 + Math.floor(rng() * 5), 2, 3 + Math.floor(rng() * 4), c);
  }
  for (let y = 0; y < 8; y++) ring(g, 34, 26, y < 1 ? 0 : 4, 5 + y * 0.1, y, y + 1, C.rust);
  return M32(g, [22, 0, 17]);
}

/** His leather apron on a hook, a pair of goggles over it. */
export function apronHook(seed = 247) {
  const g = new VoxelGrid(30, 60, 8);
  g.box(13, 54, 0, 4, 3, 5, 0x3a3a44);
  for (let y = 6; y < 54; y++) { const w = y > 44 ? 6 : 11; for (let x = 15 - w; x < 15 + w; x++) g.set(x, y, 3, (x + y) % 9 === 0 ? 0x4a2a14 : y < 10 ? 0x5a3418 : 0x6a3e1e); }
  line(g, [[9, 54, 3], [15, 56, 4], [21, 54, 3]], 0.5, 0x4a2a14);
  for (const x of [11, 19]) { ring(g, x, 4, 0, 3, 46, 47, 0x3a3a44); g.set(x, 46, 5, 0x8ad0e0); }
  return M32(g, [15, 0, 0]);
}

/** Horseshoes for luck on a nail (wall piece), open end up. */
export function horseshoes(seed = 249) {
  const g = new VoxelGrid(36, 24, 6);
  g.box(17, 20, 0, 2, 2, 4, 0x3a3a44);
  for (const [ox, oy, r] of [[11, 4, 6], [25, 6, 5]]) for (let k = 0; k < 20; k++) { const a = Math.PI * 0.15 + (k / 19) * Math.PI * 1.7; g.set(Math.round(ox + Math.sin(a) * r), Math.round(oy + 6 - Math.cos(a) * r), 3, k % 4 ? 0x5a5a64 : 0x8a8a92); }
  line(g, [[18, 20, 3], [11, 12, 3]], 0.3, 0x6a5a4a); line(g, [[18, 20, 3], [25, 13, 3]], 0.3, 0x6a5a4a);
  return M32(g, [18, 0, 0]);
}

// ---------------------------------------------------------------- the hall
/** A bench for pulling boots on, with a pair under it and a scarf thrown over the end. */
export function bootBench(seed = 261) {
  const g = new VoxelGrid(64, 34, 24);
  const bw = wood(H.oakM, { axis: 'x', across: 'z', pw: 6, seed });
  g.box(2, 18, 3, 60, 3, 18, bw);
  for (const x of [5, 56]) g.box(x, 0, 4, 4, 18, 16, H.oakD);
  for (const x of [16, 30]) { g.box(x, 0, 8, 7, 9, 10, 0x3a2418); g.box(x, 0, 14, 7, 3, 7, 0x3a2418); }
  for (let k = 0; k < 14; k++) g.box(52 - k * 0.2, 21 - Math.min(k, 6), 4 + k, 8, 1, 1, k % 3 ? 0x3a6a5a : 0xe8c060);
  return M32(g, [32, 0, 12]);
}

/** A stand of sticks, a parasol (from the surface, for the sun) and a miner's pick. */
export function caneStand(seed = 263) {
  const g = new VoxelGrid(30, 80, 30);
  for (let y = 0; y < 30; y++) ring(g, 15, 15, y < 1 ? 0 : 6.6, 8, y, y + 1, (x, yy) => (yy % 10 === 0 ? P.brassD : 0x3a5a7a));
  line(g, [[13, 2, 13], [10, 66, 10]], 0.8, 0x6a4a2a); line(g, [[10, 66, 10], [8, 70, 12], [11, 72, 13]], 0.8, 0x6a4a2a);
  line(g, [[17, 2, 16], [19, 70, 19]], 0.8, 0x2a2a30);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; line(g, [[19, 70, 19], [19 + Math.cos(a) * 4, 46, 19 + Math.sin(a) * 4]], 1.4, k % 2 ? 0xe86a8a : 0xf0e0e8); } // the parasol, furled
  line(g, [[15, 2, 18], [16, 58, 22]], 0.8, 0x8a5a32); g.box(9, 56, 20, 14, 3, 3, 0x6a6a72);
  return M32(g, [15, 0, 15]);
}

/** A round mirror in a carved frame (wall piece). */
export function wallMirror(seed = 265) {
  const g = new VoxelGrid(36, 46, 5);
  for (let y = 0; y < 46; y++) for (let x = 0; x < 36; x++) {
    const d = Math.hypot((x + 0.5 - 18) / 17, (y + 0.5 - 23) / 22);
    if (d > 1) continue;
    if (d > 0.84) g.box(x, y, 0, 1, 1, 3, (x + y) % 4 ? H.walnut : P.brass);
    else g.set(x, y, 1, mixc(0xa8c0c8, 0xe8f4f8, Math.min(1, Math.max(0, (y - 10) / 40) * 0.6 + ((x + y) % 9 === 0 ? 0.3 : 0))));
  }
  return M32(g, [18, 0, 0]);
}

/** A board of hooks with keys, a lantern key on a ring, labels in his hand. */
export function keyBoard(seed = 267) {
  const g = new VoxelGrid(36, 24, 6);
  g.box(0, 0, 0, 36, 24, 2, (x, y) => (x === 0 || y === 0 || x === 35 || y === 23 ? H.oakD : H.oakM));
  for (let k = 0; k < 5; k++) {
    const x = 4 + k * 7;
    g.box(x, 16, 2, 1, 1, 3, P.brassD);
    g.box(x, 8 + (k % 2) * 2, 3, 1, 7, 1, k === 2 ? 0xc0c0c8 : P.brass); ring(g, x, 3, 0, 1.6, 14 + (k % 2) * 2, 16 + (k % 2) * 2, P.brass);
    g.box(x - 1, 19, 2, 3, 2, 1, 0xeadcbe);
  }
  return M32(g, [18, 0, 0]);
}

/** Pegs on the wall with two miners' helmets, one with its lamp, and a coil of rope. */
export function helmetPegs(seed = 269) {
  const g = new VoxelGrid(60, 30, 18), gl = new VoxelGrid(60, 30, 18);
  g.box(0, 20, 0, 60, 4, 3, beam(0x4a2e1c, 'x', seed));
  for (const [x, c] of [[12, 0xd8a838], [30, 0x6a8a6a]]) {
    g.box(x, 18, 0, 2, 2, 6, 0x5a3a22);
    for (let y = 0; y < 8; y++) ring(g, x + 1, 9, 0, 8 - y * 0.75, 8 + y, 9 + y, y ? c : mulc(c, 0.8));
    ring(g, x + 1, 9, 0, 10, 8, 9, mulc(c, 0.8));
    g.box(x - 1, 11, 16, 4, 3, 2, 0x5a5a62); if (x === 12) gl.box(x, 12, 17, 2, 1, 1, 0xfff0a0);
  }
  for (let k = 0; k < 4; k++) ring(g, 48, 8, 4 + k * 0.5, 5 + k * 0.5, 4, 16, k % 2 ? C.rope : C.ropeD);
  return { obj: group(M32(g, [30, 0, 0]), G32(gl, [30, 0, 0])) };
}

/** A doormat: WIPE YOUR PAWS (or near enough). */
export function doormat(seed = 271) {
  const W = 52, D = 32;
  const g = new VoxelGrid(W, 1, D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, z, W - 1 - x, D - 1 - z);
    let c = e < 2 ? 0x6a3a1e : (x + z) % 3 ? 0xa87a3a : 0x9a6a30;
    if (z > 12 && z < 19 && x > 6 && x < W - 6 && (x % 6 < 4) && hash2(x, z, seed) < 0.7) c = 0x4a2a14;
    g.set(x, 0, z, c);
  }
  return M32(g, [W / 2, 0, D / 2], { outline: false });
}
