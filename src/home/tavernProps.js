// The old miners' tavern, prop by prop, at 1/32-tile voxels (1/64 m): the long bar with its brass
// taps and foot rail, the back bar of dusty bottles, the big stone hearth with a kettle on its crane,
// Old Star's cork board of notes, his iron-banded loot chest, the cuckoo clock, the creaky steps up
// to your room and the archway, a wagon-wheel chandelier, a stuffed old sofa, kegs, a slate tally
// board and the mining keepsakes on the walls (crossed picks, the first nugget, faded photos, a map).
// Everything is a little worn: chipped paint, polished edges, soot, dust, patina.
// Conventions (as src/home/props.js): wall pieces have x along the wall, y up, z out of the wall,
// origin on the wall face at floor level; floor pieces are centred with the front toward +z.
// Tile units throughout (the room group is scaled to meters); 64 voxels make a meter.
import * as THREE from 'three';
import { VoxelGrid, C, wood, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';

export const VPM = 64; // voxels per meter
const vm = (m) => Math.round(m * VPM);

// ---------------------------------------------------------------- palette
export const P = {
  oakD: 0x3e2618, oak: 0x5e3c24, oakM: 0x6e4a2c, oakL: 0x8a6040, pine: 0xa8784a,
  stone: 0x7a7068, stoneD: 0x5a524c, stoneW: 0x8a7a68, mortar: 0x463c34,
  brass: 0xb8923e, brassL: 0xe6c672, brassD: 0x7a5a24, patina: 0x6a9a82,
  iron: 0x33333b, ironL: 0x55555f, rust: 0x8a4a2a,
  paper: 0xeadcbe, paperO: 0xd6c094, ink: 0x3a2a22,
  wax: 0xf2e8d2, waxD: 0xd8ccb2, red: 0xc8382a, velvet: 0x7a2a2a,
  flameO: 0xff9a3a, flameY: 0xffd870, flameW: 0xfff4c8,
};

/** Dressed stone blocks (bw × bh voxels) with recessed mortar, a few chipped and darker ones. */
export function blocks(bw = 16, bh = 10, seed = 4, base = P.stone) {
  return (x, y, z) => {
    const row = Math.floor(y / bh), off = (row % 2) * Math.floor(bw / 2);
    const bx = Math.floor((x + z + off) / bw);
    if (y % bh === 0 || (x + z + off) % bw === 0) return P.mortar;
    const h = hash2(bx, row, seed);
    const pal = [base, mulc(base, 0.86), mixc(base, P.stoneW, 0.5), mulc(base, 1.08), mixc(base, 0x6a5a4e, 0.4)];
    let c = pal[Math.floor(h * pal.length)];
    const ly = y % bh, lx = (x + z + off) % bw;
    if (ly === bh - 1 || lx === 1) c = mulc(c, 1.1); // lit top / left edge
    else if (ly === 1 || lx === bw - 1) c = mulc(c, 0.84);
    return mulc(c, sp3(x, y, z, seed + 1, 0.035, 0.1));
  };
}

/** Darken toward black where soot(x, y, z) → 0..1. */
const sooty = (fill, soot) => (x, y, z) => { const c = fill(x, y, z); if (c < 0) return c; const k = Math.round(soot(x, y, z) * 6) / 6; return k > 0 ? mixc(c, 0x1a1412, Math.min(0.85, k)) : c; };

/** A little flame (glow grid) of height h at (x, y, z) in grid gl. */
function flame(gl, x, y, z, h = 4) {
  gl.set(x, y, z, P.flameO);
  for (let k = 1; k < h; k++) gl.set(x, y + k, z, k >= h - 1 ? P.flameW : k > h / 2 ? P.flameY : P.flameO);
}

/** A candle with drips standing at (x, y, z) (base), height h, flame in gl. */
function candleAt(g, gl, x, y, z, h = 6, col = P.wax) {
  g.box(x, y, z, 2, h, 2, (xx, yy) => (yy === y + h - 1 ? mulc(col, 0.92) : col));
  // drips down the sides
  g.set(x - 1, y + h - 2, z, col); g.set(x + 2, y + h - 3, z + 1, col); g.set(x - 1, y + h - 3, z, mulc(col, 0.95));
  g.set(x, y + h, z, 0x2a2018); // the wick
  flame(gl, x, y + h + 1, z, 3);
}

/** A glass bottle at (x, y, z) base: body radius r, height h, neck; colour c, label colour lc. */
function bottle(g, x, y, z, r, h, c, lc = null, seed = 1) {
  ring(g, x, z, 0, r, y, y + h, (xx, yy, zz) => (h3(xx, yy, zz, seed) < 0.08 ? mulc(c, 1.25) : yy === y + h - 1 ? mulc(c, 1.1) : c));
  ring(g, x, z, 0, Math.max(1, r * 0.45), y + h, y + h + Math.round(h * 0.45), mulc(c, 1.05));
  g.set(Math.round(x - 0.5), y + h + Math.round(h * 0.45), Math.round(z - 0.5), hash2(seed, 2, 3) < 0.5 ? 0xa8804a : 0x8a2a2a); // cork / wax seal
  if (lc !== null) for (let yy = y + 2; yy < y + h - 2; yy++) for (const [dx, dz] of [[0, 1], [1, 1], [-1, 1]]) g.set(Math.round(x - 0.5 + dx), yy, Math.round(z - 0.5 + r - 0.2 + dz * 0), yy === y + 2 || yy === y + h - 3 ? mulc(lc, 0.8) : lc);
  // dust on the shoulders
  if (r >= 2) for (let k = 0; k < 3; k++) g.set(Math.round(x - 1 + k), y + h, Math.round(z - 1 + (k % 2)), 0xc8beb0);
}

/** A mug (wood staves with iron hoops, or pewter) at (x, y, z), handle toward +x. */
function mug(g, x, y, z, kind = 0, foam = false) {
  const c = kind ? 0x8a8a94 : 0x8a5a32;
  ring(g, x, z, 0, 2.6, y, y + 6, (xx, yy, zz) => (kind ? (yy === y + 5 ? 0xb0b0b8 : c) : yy === y + 1 || yy === y + 4 ? P.iron : (xx + zz) % 2 ? c : mulc(c, 0.86)));
  if (foam) ring(g, x, z, 0, 2.2, y + 6, y + 7, 0xf4ecd8);
  g.box(Math.round(x + 2), y + 1, Math.round(z - 0.5), 2, 1, 1, c); g.box(Math.round(x + 3), y + 1, Math.round(z - 0.5), 1, 4, 1, c); g.box(Math.round(x + 2), y + 4, Math.round(z - 0.5), 2, 1, 1, c);
}

// ---------------------------------------------------------------- the bar
/**
 * The long bar counter: a thick oak top polished pale where paws rest, panelled front with scuffs
 * and a carved heart, a brass foot rail gone green in spots, and on top the tap tower, mugs, a jar
 * of pickled eggs, the service bell, a candle in a bottle and an open ledger. Floor piece; the
 * customers' side faces +z. len in meters. Returns { obj, lights } (lights local, tiles).
 */
export function barCounter(len = 2.6, seed = 3) {
  const L = vm(len), D = 28, TOP = 36;
  const g = new VoxelGrid(L, 60, D + 6);
  const gl = new VoxelGrid(L, 60, D + 6);
  const fr = D - 3; // front panel's back plane
  // kick plate, recessed
  g.box(1, 0, 2, L - 2, 4, fr, (x) => (x % 23 === 0 ? 0x221610 : 0x2e1e14));
  // front: stiles every 33 voxels, recessed board panels between, top and bottom rails
  for (let x = 0; x < L; x++) {
    const sx = x % 33;
    const stile = sx < 4 || x >= L - 4;
    for (let y = 4; y < 32; y++) {
      const rail = y < 8 || y >= 28;
      if (stile || rail) {
        let c = mulc(P.oakM, 0.92 + Math.floor(hash2(Math.floor(x / 33), y >> 3, seed) * 3) * 0.05);
        if ((stile && (sx === 0 || sx === 3)) || y === 8 || y === 27) c = mulc(c, 0.8);
        g.box(x, y, fr, 1, 1, 3, c);
      } else {
        const bd = Math.floor((x - 4) / 6);
        let c = mulc(P.oak, 0.88 + Math.floor(hash2(bd, 1, seed) * 4) * 0.05);
        if ((x - 4) % 6 === 0) c = mulc(P.oak, 0.62); // V-groove between boards
        // scuffs low down from countless boots
        if (y < 15 && hash2(x >> 1, y, seed + 7) < 0.1) c = mixc(c, 0xa88a6a, 0.45);
        g.box(x, y, fr, 1, 1, 2, c);
      }
    }
  }
  // a carved heart with two initials on one panel
  const hx = Math.round(L * 0.62) - (Math.round(L * 0.62) % 33) + 18;
  for (const [dx, dy] of [[-2, 2], [-1, 3], [1, 3], [2, 2], [-3, 1], [3, 1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, -2], [0, 2]]) g.set(hx + dx, 19 + dy, D - 2, 0x2a1a10);
  // back: posts, two shelves (mugs and plates on them)
  for (let x = 0; x < L; x += 33) g.box(Math.min(x, L - 3), 0, 0, 3, 32, 3, P.oakD);
  g.box(0, 12, 1, L, 2, fr - 1, wood(P.oak, { axis: 'x', across: 'z', pw: 9, seed: seed + 2 }));
  g.box(0, 0, 1, L, 2, fr - 1, P.oakD);
  for (let x = 6; x < L - 6; x += 9) mug(g, x, 14, 6 + (x % 2) * 3, (x >> 3) % 2);
  for (let k = 0; k < 3; k++) { const px = Math.round(L * 0.25) + k * 40; for (let s = 0; s < 4; s++) ring(g, px, 14, 0, 6, 2 + s, 3 + s, s % 2 ? 0xe8e0cc : 0xd8ccb4); }
  // the top: boards along the bar, a rounded front lip, a pale worn strip, old mug rings
  const topW = wood(P.oak, { axis: 'x', across: 'z', pw: 9, seed: seed + 1 });
  for (let x = 0; x < L; x++) for (let z = 0; z < D + 2; z++) for (let y = 32; y < TOP; y++) {
    if (z === D + 1 && (y === 32 || y === TOP - 1)) continue; // bullnose
    let c = topW(x, y, z);
    if (y === TOP - 1) {
      if (z >= D - 3) c = mixc(c, 0x9a7048, 0.55 + 0.25 * hash2(x >> 2, z, seed)); // polished by paws
      for (const [rx, rz] of [[0.12, 12], [0.4, 18], [0.47, 9], [0.74, 15], [0.9, 20]]) {
        const d = Math.hypot(x + 0.5 - L * rx, z + 0.5 - rz);
        if (d > 2.2 && d < 3.1) c = mulc(c, 0.8);
      }
      if (z < 6 && h3(x, y, z, seed + 3) < 0.07) c = 0xb8ae9e; // dust at the back edge
    }
    g.set(x, y, z, c);
  }
  // brass foot rail on brackets
  const brassRail = (x, y, z) => (h3(x, y, z, seed + 4) < 0.12 ? P.patina : (x + y) % 9 === 0 ? P.brassL : P.brass);
  for (let x = 3; x < L - 3; x++) { g.set(x, 6, D + 3, brassRail(x, 6, D + 3)); g.set(x, 7, D + 3, brassRail(x, 7, D + 3)); }
  for (let x = 6; x < L - 4; x += 38) { g.box(x, 5, D, 2, 2, 3, P.brassD); g.box(x, 7, D, 2, 1, 3, P.brassD); }
  // a red-and-white rag hanging over the front edge
  const rx = Math.round(L * 0.1);
  for (let x = rx; x < rx + 9; x++) for (let y = 24; y < TOP + 1; y++) g.set(x, y, y >= TOP ? D - 1 : D + 2, ((x >> 1) + (y >> 1)) % 2 ? 0xe8e0d0 : 0xb83a2a);
  // the tap tower: a block with three brass taps, tall handles and a drip tray
  const tx = Math.round(L * 0.28);
  g.box(tx, TOP, 7, 16, 7, 8, (x, y) => (y === TOP + 6 ? P.brassD : P.oakD));
  g.box(tx - 1, TOP, 2, 18, 1, 5, (x, y, z) => ((x + z) % 2 ? P.brass : P.brassD));
  for (let k = 0; k < 3; k++) {
    const x = tx + 3 + k * 5;
    g.box(x, TOP + 4, 4, 2, 2, 3, P.brassL); g.set(x, TOP + 3, 4, P.brass);
    line(g, [[x + 0.5, TOP + 7, 9], [x + 0.5 + (k - 1) * 0.6, TOP + 15, 9 + (k % 2 ? 1 : -1)]], 0.6, [0x6a3a1a, 0x2a2a30, 0x6a3a1a][k]);
    g.box(x, TOP + 15, 9 + (k % 2 ? 1 : -1), 2, 3, 2, [0xe8dcc0, 0xc84a3a, 0xe8dcc0][k]);
  }
  // mugs upside down on a towel, one full of foam
  g.box(Math.round(L * 0.4) - 2, TOP, 10, 22, 1, 10, (x, z) => (x % 4 === 0 ? 0xc8d0d8 : 0xe8ecf0));
  for (let k = 0; k < 3; k++) mug(g, Math.round(L * 0.4) + 2 + k * 6, TOP + 1, 14, k % 2);
  mug(g, Math.round(L * 0.5) + 2, TOP, D - 5, 0, true);
  // a jar of pickled eggs
  const jx = Math.round(L * 0.6);
  ring(g, jx, 12, 0, 4.6, TOP, TOP + 11, (x, y, z) => (y === TOP ? 0xb8c8b0 : (h3(x, y, z, 7) < 0.3 ? 0xf0e4b8 : 0xd8e0c8)));
  ring(g, jx, 12, 0, 5, TOP + 11, TOP + 13, P.brassD);
  // the service bell
  const bx = Math.round(L * 0.5);
  g.box(bx - 3, TOP, D - 9, 6, 1, 5, P.oakD);
  g.ellipsoid(bx, TOP + 1, D - 6.5, 2.6, 2.6, 2.6, (x, y) => (y < TOP + 1 ? -1 : y === TOP + 3 ? P.brassL : P.brass));
  g.set(bx, TOP + 4, D - 7, P.ironL);
  // an open ledger with a pencil
  const lx = Math.round(L * 0.7);
  g.box(lx, TOP, 6, 18, 1, 13, 0x5a2a1a);
  g.box(lx + 1, TOP + 1, 7, 8, 1, 11, (x, y, z) => (z % 2 === 0 && x > lx + 1 && x < lx + 8 ? 0x8a7a6a : P.paper));
  g.box(lx + 9, TOP + 1, 7, 8, 1, 11, (x, y, z) => (z % 2 === 0 && x > lx + 9 && x < lx + 16 && z < 15 ? 0x8a7a6a : P.paper));
  line(g, [[lx + 5, TOP + 2, 17], [lx + 13, TOP + 2, 20]], 0.5, 0xe0b040);
  // a candle in a green bottle, wax run all down its neck
  const cx = Math.round(L * 0.86);
  bottle(g, cx, TOP, 13, 3, 9, 0x3a6a3a, null, seed);
  for (let y = TOP + 6; y < TOP + 14; y++) if (hash2(y, 1, 9) < 0.6) g.set(cx + (y % 3) - 1, y, 13 + (y % 2), P.wax);
  candleAt(g, gl, cx - 1, TOP + 14, 12, 4);
  // the old brass till at the near end, its drawer a little open, a bell on top
  const ux = Math.round(L * 0.12);
  g.box(ux, TOP, 6, 14, 11, 12, (x, y, z) => (y === TOP + 10 ? P.brassL : (x + y) % 7 === 0 ? P.brassD : P.brass));
  g.box(ux + 1, TOP + 1, 18, 12, 3, 2, P.oakD); g.box(ux + 5, TOP + 2, 20, 4, 1, 1, P.brassL); // the drawer
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) g.box(ux + 2 + j * 3, TOP + 5 + k * 2, 18, 2, 1, 1, (k + j) % 3 ? 0xe8dcc0 : 0x2a1a12); // keys
  g.box(ux + 2, TOP + 11, 8, 10, 4, 3, 0x2a2a30); g.box(ux + 3, TOP + 12, 11, 8, 2, 1, 0xd8b048); // the little window of numbers
  g.ellipsoid(ux + 11, TOP + 11, 10, 1.6, 1.6, 1.6, (x, y) => (y < TOP + 11 ? -1 : P.brassL));
  // a few coins left on the top
  for (const [x, z] of [[0.32, 20], [0.33, 21], [0.55, 6]]) g.set(Math.round(L * x), TOP, z, C.gold);
  const obj = group(M32(g, [L / 2, 0, D / 2]), G32(gl, [L / 2, 0, D / 2]));
  return { obj, lights: [{ x: (cx - 1 - L / 2) * S32, y: (TOP + 17) * S32, z: (12 - D / 2) * S32 }], top: TOP * S32, till: { x: (ux + 7 - L / 2) * S32, z: (12 - D / 2) * S32 } };
}

/**
 * The back bar against the wall: a cabinet with panelled doors, three shelves of dusty bottles and
 * jars, mugs on hooks, a little keg on a cradle and a carved crest with a lantern and a pick.
 * Wall piece (x along the wall, z out). len in meters.
 */
export function backBar(len = 2.6, seed = 5) {
  const L = vm(len), H = 120, Dp = 16;
  const g = new VoxelGrid(L, H + 26, Dp + 4);
  const gl = new VoxelGrid(L, H + 26, Dp + 4);
  const ow = wood(P.oakM, { axis: 'x', across: 'y', pw: 99, seed });
  // back boards (darker), the cabinet, its top
  g.box(0, 36, 0, L, H - 36, 1, (x) => mulc(P.oakD, x % 11 === 0 ? 0.7 : 0.95));
  for (let x = 0; x < L; x++) for (let y = 0; y < 34; y++) {
    const dw = Math.floor(x / 26), lx = x % 26;
    const frame = lx < 3 || lx > 22 || y < 4 || y > 29;
    const c = frame ? mulc(P.oakM, 0.95) : mulc(P.oak, 0.9 + hash2(dw, 2, seed) * 0.1);
    g.box(x, y, 0, 1, 1, frame ? Dp : Dp - 1, (lx === 0 || y === 4 || y === 29) ? mulc(c, 0.75) : c);
    if (!frame && lx === 20 && y >= 14 && y <= 18) g.set(x, y, Dp, P.iron); // door pulls
  }
  g.box(0, 34, 0, L, 3, Dp + 2, wood(P.oak, { axis: 'x', across: 'z', pw: 7, seed: seed + 1 }));
  // uprights and shelves
  for (const x of [0, Math.round(L / 2) - 2, L - 4]) g.box(x, 37, 0, 4, H - 37, Dp - 2, ow);
  const shelves = [60, 82, 104];
  for (const y of shelves) { g.box(0, y, 0, L, 2, Dp - 2, ow); g.box(0, y - 1, Dp - 3, L, 1, 1, mulc(P.oakM, 0.8)); }
  g.box(0, H, 0, L, 4, Dp, ow); g.box(0, H + 4, 0, L, 2, Dp + 1, mulc(P.oakM, 1.1)); // crown
  // shelves of bottles, jars and stacked cups
  const cols = [0x8a4a1a, 0x3a6a3a, 0x5a2a12, 0x9ac0c8, 0x6a3a6a, 0xc88a3a, 0x2a4a3a, 0xa83a2a];
  const levels = [37, 62, 84, 106];
  levels.forEach((y0, li) => {
    let x = 5;
    let k = li * 7;
    while (x < L - 8) {
      if (Math.abs(x - L / 2) < 6) { x += 8; continue; }
      const kind = Math.floor(hash2(k, li, seed) * 6);
      const room = li === 3 ? 12 : 18;
      if (kind <= 2) {
        const r = 2 + Math.floor(hash2(k, 3, seed) * 2), h = Math.min(room - 6, 7 + Math.floor(hash2(k, 4, seed) * 6));
        bottle(g, x + r, y0, 7, r, h, cols[(k + li) % cols.length], hash2(k, 5, seed) < 0.6 ? (hash2(k, 6, seed) < 0.5 ? 0xe8dcc0 : 0xd8b860) : null, k);
        x += r * 2 + 2;
      } else if (kind === 3) {
        ring(g, x + 4, 7, 0, 3.6, y0, y0 + Math.min(10, room - 4), (xx, yy, zz) => (yy % 3 === 0 ? 0xd8e8e0 : [0xc8a040, 0x8ab84a, 0xc86a4a][k % 3]));
        ring(g, x + 4, 7, 0, 3.8, y0 + Math.min(10, room - 4), y0 + Math.min(11, room - 3), 0x8a6a3a);
        x += 10;
      } else if (kind === 4) {
        for (let s = 0; s < 3; s++) mug(g, x + 3, y0 + s * 6, 7, 1);
        x += 9;
      } else {
        // a little stack of old books on its side
        for (let b = 0; b < 3; b++) g.box(x, y0 + b * 2, 3 + b, 10, 2, 9, [0x6a2a1a, 0x2a4a6a, 0x5a5a2a][b]);
        x += 12;
      }
      x += 1 + Math.floor(hash2(k, 8, seed) * 3);
      k++;
    }
  });
  // mugs hanging from hooks under the first shelf
  for (let x = 8; x < L - 8; x += 11) {
    if (Math.abs(x - L / 2) < 8) continue;
    g.set(x, 59, 9, P.iron); g.set(x, 58, 9, P.iron);
    mug(g, x, 51, 9, (x >> 2) % 2);
  }
  // a little keg on a cradle in the middle of the counter
  const kx = Math.round(L / 2);
  g.box(kx - 8, 37, 3, 3, 4, 10, P.oakD); g.box(kx + 5, 37, 3, 3, 4, 10, P.oakD);
  for (let x = kx - 8; x < kx + 8; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) {
    const d = Math.hypot(y + 0.5 - 8, z + 0.5 - 8);
    const bulge = 7 + Math.sin(((x - kx + 8) / 16) * Math.PI) * 0.8;
    if (d > bulge) continue;
    const hoop = Math.abs(x - kx) === 5 || Math.abs(x - kx) === 7;
    g.set(x, 41 + y, z, hoop ? P.iron : (Math.floor(Math.atan2(y - 8, z - 8) * 3.2) % 2 ? P.oakL : mulc(P.oakL, 0.85)));
  }
  g.box(kx - 1, 46, 15, 2, 2, 4, P.brass); g.set(kx, 45, 18, P.brassL);
  // the crest above: a lantern and a crossed pick carved on a board
  const cw = 40, cx0 = kx - cw / 2;
  g.box(cx0, H + 6, 1, cw, 18, 2, (x, y) => (x === cx0 || x === cx0 + cw - 1 || y === H + 6 || y === H + 23 ? P.oakD : mulc(P.oakM, 1.05)));
  line(g, [[kx - 10, H + 9, 3], [kx + 9, H + 21, 3]], 0.7, 0xb8b8c0); // the pick's handle
  line(g, [[kx + 4, H + 22, 3], [kx + 12, H + 17, 3], [kx + 14, H + 13, 3]], 0.8, 0x8a8a94); // its head
  g.box(kx - 3, H + 9, 3, 6, 8, 1, P.brassD); g.box(kx - 2, H + 10, 3, 4, 6, 1, 0xffc060); g.box(kx - 1, H + 17, 3, 2, 2, 1, P.brassD);
  // cobwebs and dust on the crown
  for (let x = 0; x < L; x++) if (hash2(x, 1, seed + 9) < 0.15) g.set(x, H + 6, Dp, 0xb8b0a4);
  // a candle on the top shelf, its glow
  candleAt(g, gl, L - 14, shelves[2] + 2, 8, 5);
  const obj = group(M32(g, [L / 2, 0, 0]), G32(gl, [L / 2, 0, 0]));
  return { obj, lights: [{ x: (L - 14 - L / 2) * S32, y: (shelves[2] + 10) * S32, z: 9 * S32 }] };
}

// ---------------------------------------------------------------- the hearth
/**
 * The great hearth on the north wall: a stone chimney breast to the ceiling, an arched firebox
 * with firebrick and soot, iron firedogs and logs, a kettle on a swinging crane, a flagstone apron,
 * an adze-cut oak mantel with brackets (candlesticks, the framed first nugget, a photo, a pipe, a
 * tin) and a pair of crossed picks on a shield above. Wall piece; hh = height to the ceiling (vox).
 * Returns { obj, flames (animated glow meshes), lights, fire (local point, tiles) }.
 */
export function hearth(hh = 180, seed = 11) {
  const W = 104, Dp = 30, FW = 54, FH = 40, FZ = 22;
  const grp = new THREE.Group();
  // ---- lower part: breast, firebox, mantel
  const g = new VoxelGrid(W + 12, 92, Dp + 30);
  const gl = new VoxelGrid(W + 12, 92, Dp + 30);
  const x0 = 6, cx = x0 + W / 2;
  const inFire = (x, y) => {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) > FW / 2 || y < 4) return false;
    if (y < FH - 10) return true;
    return (dx / (FW / 2)) ** 2 + ((y - (FH - 10)) / 12) ** 2 < 1;
  };
  const soot = (x, y, z) => {
    const dx = Math.abs(x + 0.5 - cx);
    let k = 0;
    if (z >= Dp - 2 && y >= FH - 14 && y < 78) k = Math.max(0, 1 - Math.hypot(dx / (FW * 0.62), (y - FH) / 22)) * 0.9;
    return k * (0.75 + 0.25 * hash2(x >> 1, y >> 1, seed));
  };
  const st = sooty(blocks(17, 11, seed), soot);
  for (let y = 0; y < 72; y++) for (let x = x0; x < x0 + W; x++) for (let z = 0; z < Dp; z++) {
    if (inFire(x, y) && z >= Dp - FZ) continue;
    g.set(x, y, z, st(x, y, z));
  }
  // the arch: voussoirs round the opening and a keystone
  for (let y = FH - 14; y < FH + 6; y++) for (let x = Math.round(cx - FW / 2 - 6); x < cx + FW / 2 + 6; x++) {
    if (inFire(x, y)) continue;
    const dx = x + 0.5 - cx, a = Math.atan2(y - (FH - 10), dx);
    const r = Math.hypot(dx / (FW / 2 + 5), (y - (FH - 10)) / 17);
    if (r > 1 || y < FH - 10) continue;
    const seam = Math.abs(((a / Math.PI) * 9) % 1) < 0.1;
    const key = Math.abs(dx) < 3.5 && y > FH;
    const c = seam ? P.mortar : key ? mulc(P.stoneW, 1.12) : mixc(blocks(17, 11, seed + 2)(x, y, Dp), 0x2a2220, Math.min(0.6, soot(x, y, Dp)));
    g.box(x, y, Dp - 1, 1, 1, key ? 3 : 2, c);
  }
  // firebrick back and sides in herringbone, black with soot
  for (let y = 4; y < FH + 2; y++) for (let x = x0; x < x0 + W; x++) {
    if (!inFire(x, y)) continue;
    const hb = ((x + y) >> 2) % 2 ? (x + y * 2) % 8 === 0 : (x * 2 + y) % 8 === 0;
    const c = hb ? 0x1a1210 : mixc(0x6a2a1a, 0x1a1210, 0.45 + 0.4 * (y / FH) + 0.15 * hash2(x >> 1, y >> 1, seed));
    g.set(x, y, Dp - FZ - 1, c);
    if (Math.abs(x + 0.5 - cx) > FW / 2 - 2) for (let z = Dp - FZ; z < Dp; z++) g.set(x, y, z, mixc(c, 0x2a2220, 0.3));
  }
  g.box(Math.round(cx - FW / 2), 3, Dp - FZ, FW, 1, FZ, 0x2a2420); // the fire bed
  // ash and embers on the bed (glowing), firedogs and logs
  for (let x = Math.round(cx - FW / 2 + 3); x < cx + FW / 2 - 3; x++) for (let z = Dp - FZ + 2; z < Dp - 2; z++) {
    const h = hash2(x, z, seed + 5);
    if (h < 0.35) gl.set(x, 4, z, h < 0.12 ? 0xffb050 : 0xc84a1a); else if (h < 0.7) g.set(x, 4, z, h < 0.5 ? 0x8a8078 : 0x4a4440);
  }
  for (const s of [-1, 1]) {
    const fx = Math.round(cx + s * 17);
    g.box(fx, 4, Dp - 14, 2, 8, 2, P.iron); g.box(fx, 4, Dp - 14, 2, 1, 12, P.iron); g.box(fx - 1, 12, Dp - 14, 4, 2, 2, P.brassD);
  }
  for (const [lz, ly, len, off] of [[Dp - 12, 7, 38, 0], [Dp - 8, 7, 34, 3], [Dp - 10, 11, 30, -2]]) {
    for (let x = Math.round(cx - len / 2 + off); x < cx + len / 2 + off; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 5; z++) {
      const d = Math.hypot(y - 2, z - 2);
      if (d > 2.6) continue;
      const end = x === Math.round(cx - len / 2 + off) || x === Math.round(cx + len / 2 + off) - 1;
      const charred = y < 2 && hash2(x, z, seed + 6) < 0.6;
      if (charred) gl.set(x, ly + y, lz + z, hash2(x, y, seed) < 0.5 ? 0xff7a2a : 0xc8481a);
      else g.set(x, ly + y, lz + z, end ? (Math.round(d) % 2 ? 0xc8a070 : 0x9a7048) : (x + y) % 5 === 0 ? 0x3a2416 : 0x4a3020);
    }
  }
  // the kettle crane: a post on the left, an arm swung in, a black kettle on a hook
  const kx = Math.round(cx - FW / 2 + 4);
  g.box(kx, 6, Dp - 6, 2, FH - 12, 2, P.iron);
  line(g, [[kx + 1, FH - 8, Dp - 5], [kx + 16, FH - 8, Dp - 9]], 0.6, P.iron);
  line(g, [[kx + 1, FH - 18, Dp - 5], [kx + 12, FH - 9, Dp - 8]], 0.5, P.iron);
  line(g, [[kx + 15, FH - 8, Dp - 9], [kx + 15, FH - 14, Dp - 9]], 0.5, P.ironL);
  g.ellipsoid(kx + 15, FH - 19, Dp - 9, 5, 4.4, 5, (x, y) => (y === FH - 17 ? 0x4a4a52 : 0x26262c));
  line(g, [[kx + 19, FH - 18, Dp - 9], [kx + 23, FH - 15, Dp - 9]], 0.6, 0x26262c); // spout
  g.box(kx + 14, FH - 15, Dp - 10, 3, 1, 3, 0x3a3a42);
  // the flagstone apron
  for (let x = x0 - 6; x < x0 + W + 6; x++) for (let z = Dp; z < Dp + 26; z++) {
    const bx = Math.floor((x + (Math.floor(z / 13) % 2) * 9) / 18), bz = Math.floor(z / 13);
    const seam = (x + (Math.floor(z / 13) % 2) * 9) % 18 === 0 || z % 13 === 0;
    const scorch = Math.max(0, 1 - Math.hypot((x + 0.5 - cx) / (FW * 0.55), (z - Dp) / 12));
    let c = seam ? P.mortar : mulc([0x7a7470, 0x6a645e, 0x8a8078, 0x5e5852][Math.floor(hash2(bx, bz, seed + 8) * 4)], sp3(x, 0, z, seed, 0.12, 0.1));
    if (scorch > 0) c = mixc(c, 0x2a2220, scorch * 0.6);
    g.box(x, 0, z, 1, z === Dp + 25 ? 2 : 3, 1, c);
  }
  // the mantel: an adze-cut beam on two carved brackets
  const MY = 72;
  const mw = wood(0x4a2c1a, { axis: 'x', across: 'z', pw: 99, seed: seed + 3 });
  for (let x = x0 - 4; x < x0 + W + 4; x++) for (let y = MY; y < MY + 8; y++) for (let z = 0; z < Dp + 7; z++) {
    let c = mw(x, y, z);
    if (y === MY + 7 && (x % 7 === 0 || hash2(x, z, seed) < 0.06)) c = mulc(c, 1.15); // adze marks catch the light
    if (y === MY) c = mulc(c, 0.8);
    g.set(x, y, z, c);
  }
  for (const bxp of [x0 + 2, x0 + W - 8]) for (let y = MY - 14; y < MY; y++) {
    const t = (MY - y) / 14;
    g.box(bxp, y, Dp, 6, 1, Math.max(1, Math.round(7 * (1 - t * t))), mulc(0x4a2c1a, 0.95));
  }
  // mantel things: candlesticks, the framed first nugget, a photo, a pipe on its stand, a tin, a jar of spills
  const T0 = MY + 8;
  for (const x of [x0 + 6, x0 + W - 8]) {
    g.box(x - 1, T0, Dp - 6, 4, 1, 4, P.brass); g.box(x, T0 + 1, Dp - 5, 2, 6, 2, P.brass); g.box(x - 1, T0 + 7, Dp - 6, 4, 1, 4, P.brassL);
    candleAt(g, gl, x, T0 + 8, Dp - 5, 7);
  }
  // the first nugget in a shadow box
  const nx = Math.round(cx - 10);
  g.box(nx, T0, 3, 20, 16, 4, (x, y) => (x === nx || x === nx + 19 || y === T0 || y === T0 + 15 ? P.oakD : 0x4a1a22));
  g.box(nx + 1, T0 + 1, 7, 18, 1, 1, P.oakD); g.box(nx + 1, T0 + 14, 7, 18, 1, 1, P.oakD);
  g.ellipsoid(nx + 10, T0 + 8, 6, 4.2, 3.2, 1.6, (x, y) => (h3(x, y, 1, 3) < 0.25 ? 0xfff0a0 : y > T0 + 8 ? 0xf2c23a : 0xc89a2a));
  g.ellipsoid(nx + 13, T0 + 6, 6, 2, 1.8, 1.4, 0xe0b030);
  g.box(nx + 7, T0 + 2, 7, 6, 2, 1, P.brassL);
  gl.set(nx + 9, T0 + 10, 8, 0xfff8d0); // its glint
  // a faded photo in a little frame, leaning
  const px = Math.round(cx + 14);
  g.box(px, T0, 6, 12, 14, 1, P.brassD);
  g.box(px + 1, T0 + 1, 7, 10, 12, 1, (x, y) => sepia(x - px, y - T0, 1));
  // a pipe on a stand and a tin of tobacco
  g.box(x0 + 20, T0, Dp - 8, 6, 3, 4, 0x6a3a2a); g.box(x0 + 21, T0 + 3, Dp - 7, 4, 2, 2, 0x8a5a3a);
  line(g, [[x0 + 14, T0 + 1, Dp - 4], [x0 + 19, T0 + 2, Dp - 5]], 0.5, 0x2a1a12); g.box(x0 + 12, T0 + 1, Dp - 5, 3, 3, 3, 0x5a2a1a);
  g.box(x0 + W - 26, T0, Dp - 9, 8, 5, 6, (x, y) => (y === T0 + 4 ? 0xc8a050 : 0x2a5a4a));
  ring(g, x0 + W - 32, Dp - 5, 0, 2.4, T0, T0 + 7, 0x9a8a7a); for (let k = 0; k < 4; k++) g.set(x0 + W - 33 + k, T0 + 7 + (k % 2), Dp - 5, 0xd8b878);
  grp.add(M32(g, [x0 + W / 2, 0, 0]), G32(gl, [x0 + W / 2, 0, 0]));
  // ---- the chimney breast up to the ceiling, stepping in, with the crossed picks on their shield
  const CH = hh - 92, CW = 84, CD = 22;
  const u = new VoxelGrid(CW, CH, CD + 8);
  const stU = sooty(blocks(17, 11, seed + 4), (x, y) => (y < 30 ? Math.max(0, 0.5 - Math.abs(x + 0.5 - CW / 2) / 60 - y / 80) : 0) + (y > CH - 30 ? (y - CH + 30) / 90 : 0));
  u.box(0, 0, 0, CW, CH, CD, stU);
  u.box(0, 0, 0, CW, 3, CD + 2, mulc(P.stone, 0.95)); // a stepped course where it narrows
  // the shield and the picks
  const sx = CW / 2, sy = 34;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 26; x++) {
    const dx = x + 0.5 - 13, t = y / 30;
    const half = y > 10 ? 13 : 13 * Math.sqrt(Math.max(0, 1 - ((10 - y) / 11) ** 2.4));
    if (Math.abs(dx) > half) continue;
    const edge = Math.abs(dx) > half - 1.5 || y > 28;
    u.box(sx - 13 + x, sy + y - 6, CD, 1, 1, 2, edge ? P.oakD : (Math.floor(x / 9) % 2 ? 0x6a2a22 : 0x3a4a6a));
    void t;
  }
  const pick = (a, b, head0, head1) => { line(u, [a, b], 0.9, (x, y, z) => (h3(x, y, z, 2) < 0.2 ? 0x8a5a32 : 0xa06a3a)); line(u, [head0, b, head1], 1.1, (x, y, z) => (y > b[1] ? 0xb8b8c4 : 0x8a8a94)); };
  pick([sx - 18, sy - 12, CD + 3], [sx + 14, sy + 22, CD + 3], [sx + 4, sy + 27, CD + 3], [sx + 24, sy + 15, CD + 3]);
  pick([sx + 18, sy - 12, CD + 4], [sx - 14, sy + 22, CD + 4], [sx - 4, sy + 27, CD + 4], [sx - 24, sy + 15, CD + 4]);
  const um = M32(u, [CW / 2, 0, 0]);
  um.position.y = 92 * S32;
  grp.add(um);
  // ---- flames (animated): tongues of fire as crossed sheets, deep orange at the root to pale tips
  const flames = [];
  const tongue = (W, Hh, sd) => {
    const fl = new VoxelGrid(W, Hh, W);
    const c = W / 2;
    for (let x = 0; x < W; x++) {
      const t = Math.abs(x + 0.5 - c) / c;
      const h = Math.round(Hh * (1 - t * t) * (0.75 + 0.25 * hash2(x, 1, sd)));
      for (let y = 0; y < h; y++) {
        const k = y / Math.max(1, h);
        const col = k < 0.28 ? 0xff5a14 : k < 0.58 ? 0xff9430 : k < 0.86 ? 0xffd060 : 0xfff2c0;
        fl.set(x, y, Math.floor(c), col);
        fl.set(Math.floor(c), y, x, col);
      }
    }
    return G32(fl, [c, 0, c]);
  };
  for (let i = 0; i < 7; i++) {
    const m = tongue(9 + (i % 3) * 2, 16 + Math.round(hash2(i, 3, seed) * 10), seed + i);
    m.position.set((cx - 18 + i * 6 - (x0 + W / 2)) * S32, 8 * S32, (Dp - 12 + (i % 2) * 3) * S32);
    m.userData.noBatch = true;
    grp.add(m);
    flames.push(m);
  }
  const fire = { x: 0, y: 16 * S32, z: (Dp - 10) * S32 };
  return {
    obj: grp, flames, fire,
    lights: [{ x: (nx + 10 - (x0 + W / 2)) * S32, y: (T0 + 10) * S32, z: 8 * S32, kind: 'mantel' }, ...[x0 + 6, x0 + W - 8].map((x) => ({ x: (x + 1 - (x0 + W / 2)) * S32, y: (T0 + 18) * S32, z: (Dp - 5) * S32, kind: 'candle' }))],
    update(t) {
      flames.forEach((m, i) => {
        const s0 = (m.userData.s0 ||= m.scale.clone()); // (the merge may have moved them into a scaled frame)
        m.scale.set(s0.x * (0.8 + 0.25 * Math.sin(t * 6 + i * 2)), s0.y * (0.5 + 0.55 * Math.abs(Math.sin(t * (4.1 + i * 1.3) + i * 1.7)) + 0.1 * Math.sin(t * 11 + i)), s0.z);
      });
    },
  };
}

/** Faded sepia photograph pixels (x, y inside the print): miners in a row under a headframe. */
export function sepia(x, y, kind = 0) {
  const base = mixc(0xc8a878, 0xe8d8b8, ((x + y) % 3) / 6);
  if (kind === 1) {
    // two moles: a big one and a little one, helmets
    const fig = (cx, top, w) => Math.abs(x - cx) <= w && y <= top && y > 1 ? (y > top - 2 ? 0x5a4a32 : 0x7a6448) : 0;
    const f = fig(3, 8, 1.6) || fig(7, 6, 1.2);
    return f || (y < 2 ? 0x9a8462 : base);
  }
  if (kind === 2) {
    // a headframe against a pale sky
    if ((x === 2 || x === 7) && y > 1) return 0x6a5640;
    if (y === 9 && x > 1 && x < 8) return 0x6a5640;
    if (Math.abs(x - 4.5) + Math.abs(y - 10.5) < 1.2) return 0x5a4a32;
    return y < 2 ? 0x8a7656 : base;
  }
  // a row of miners
  if (y > 1 && y < 7 && x % 3 !== 0) return y > 5 ? 0x5a4a32 : 0x7a6448;
  return y < 2 ? 0x9a8462 : base;
}

// ---------------------------------------------------------------- Old Star's notes board
/**
 * A cork board in an oak frame with a carved little star on its header. Notes are pinned in a loose
 * grid; returns { obj (board + papers, static), notes: [{ x, y } local tiles of each pin], pins(read) }
 * where pins(readFlags) builds the mesh of pin heads (red = unread, brass = read).
 */
export function notesBoard(n = 8, seed = 13) {
  const big = n > 8, BW = big ? 82 : 66, BH = big ? 56 : 46;
  const g = new VoxelGrid(BW + 2, BH + 14, 8);
  const cork = (x, y) => { const h = hash2(x, y, seed); return h < 0.18 ? 0x9a7448 : h < 0.5 ? 0xb88a58 : h < 0.92 ? 0xc89a64 : 0x7a5838; };
  g.box(1, 0, 0, BW, BH, 2, (x, y) => (x < 4 || x >= BW - 3 || y < 3 || y >= BH - 3 ? mulc(P.oakM, (x + y) % 7 === 0 ? 0.85 : 1) : cork(x, y)));
  for (let x = 1; x < BW + 1; x++) for (const y of [0, 1, 2, BH - 3, BH - 2, BH - 1]) g.box(x, y, 2, 1, 1, 1, mulc(P.oakM, y === 0 || y === BH - 1 ? 0.8 : 1.05));
  for (let y = 0; y < BH; y++) for (const x of [1, 2, 3, BW - 2, BW - 1, BW]) g.box(x, y, 2, 1, 1, 1, mulc(P.oakM, x === 1 || x === BW ? 0.8 : 1.05));
  // the header plank with a carved pink star (Old Star's mark)
  g.box(14, BH, 0, BW - 26, 11, 3, (x, y) => (y === BH || y === BH + 10 ? P.oakD : P.oakM));
  const scx = BW / 2 + 1, scy = BH + 5.5;
  for (let y = BH + 1; y < BH + 10; y++) for (let x = scx - 6; x < scx + 6; x++) {
    const dx = x + 0.5 - scx, dy = y + 0.5 - scy, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    const rr = 2.2 + 2.4 * Math.max(0, Math.cos(a * 5 / 2) ** 6);
    if (r < rr) g.set(x, y, 3, r < 1.4 ? 0xf8b0b8 : 0xe86a84);
  }
  // papers: a loose grid with jitter, a few with sketches; returns where each pin goes
  const papers = new VoxelGrid(BW + 2, BH + 14, 8);
  const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(n * 1.6)))), rows = Math.max(1, Math.ceil(n / cols));
  const spots = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const pw = (big ? 10 : 11) + Math.floor(hash2(i, 1, seed) * 3), ph = (big ? 12 : 13) + Math.floor(hash2(i, 2, seed) * 3);
    const px = Math.round(5 + (c + 0.5) * ((BW - 8) / cols) - pw / 2 + (hash2(i, 3, seed) - 0.5) * 4);
    const py = Math.round(BH - 5 - (r + 0.5) * ((BH - 8) / rows) - ph / 2 + (hash2(i, 4, seed) - 0.5) * 3);
    const tint = [P.paper, P.paperO, 0xe8e0c8, 0xf0dcb0][Math.floor(hash2(i, 5, seed) * 4)];
    const sketch = Math.floor(hash2(i, 6, seed) * 5);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      if (y === 0 && x > pw - 4 && x - (pw - 4) > y) { if (x === pw - 1) continue; } // a torn corner
      if (x === pw - 1 && y === ph - 1) continue;
      let c2 = tint;
      if (x === 0 || y === 0 || x === pw - 1 || y === ph - 1) c2 = mulc(tint, 0.88);
      const lineRow = y < ph - 3 && y > 1 && (ph - 1 - y) % 2 === 0;
      if (lineRow && x > 1 && x < pw - 2 && hash2(x >> 1, y, i + seed) < 0.72) c2 = mixc(tint, P.ink, 0.55);
      if (sketch === 1 && Math.hypot(x - pw / 2, y - 4) < 2.6 && Math.hypot(x - pw / 2, y - 4) > 1.4) c2 = 0x8a3a2a; // a circled spot
      if (sketch === 2 && y === 3 + Math.round(Math.sin(x * 0.9) * 1.2)) c2 = 0x3a5a8a; // a wavy tunnel
      if (sketch === 3 && x > 2 && x < 6 && y > 2 && y < 7) c2 = (x + y) % 2 ? 0x6a5040 : tint; // a lift cage
      papers.set(1 + px + x, py + y, 2, c2);
      if (hash2(x, y, i + 40) < 0.04) papers.set(1 + px + x, py + y, 2, mulc(c2, 0.92));
    }
    // a coffee ring on one or two
    if (hash2(i, 7, seed) < 0.25) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; papers.set(Math.round(1 + px + pw * 0.6 + Math.cos(a) * 2.6), Math.round(py + 4 + Math.sin(a) * 2.6), 2, 0x9a7048); }
    spots.push({ gx: 1 + px + Math.floor(pw / 2), gy: py + ph - 2 });
  }
  // red yarn between a few notes, like an old detective's board
  if (n >= 4) for (const [a, b] of [[0, cols + 1], [1, Math.min(n - 1, cols + 2)], [cols, Math.min(n - 1, cols * 2)]]) {
    if (a >= n || b >= n || a === b) continue;
    const A = spots[a], B = spots[b];
    line(papers, [[A.gx, A.gy, 3], [B.gx, B.gy, 3]], 0.4, 0xb8302a);
  }
  const obj = group(M32(g, [BW / 2 + 1, 0, 0]), M32(papers, [BW / 2 + 1, 0, 0], { outline: false }));
  const notes = spots.map((s) => ({ x: (s.gx - BW / 2 - 1 + 0.5) * S32, y: (s.gy + 0.5) * S32 }));
  const pins = (read) => {
    const pg = new VoxelGrid(BW + 2, BH + 14, 8);
    spots.forEach((s, i) => {
      const c = read[i] ? P.brass : P.red;
      pg.box(s.gx, s.gy, 3, 2, 2, 2, (x, y, z) => (y === s.gy + 1 && z === 4 ? (read[i] ? P.brassL : 0xff7a6a) : c));
    });
    return M32(pg, [BW / 2 + 1, 0, 0]);
  };
  return { obj, notes, pins, w: BW * S32, h: (BH + 11) * S32 };
}

// ---------------------------------------------------------------- the loot chest
/**
 * Old Star's chest: weathered planks under three iron bands, corner brackets, ring handles, a brass
 * lock plate with its hasp, a barrel-top lid on hinges (opens), red velvet inside and a heap of
 * treasure that glows while there's loot in it. Floor piece, front +z.
 * Returns { obj (body, static), lid (Group: rotate .rotation.x negative to open), loot (glow mesh), dims }.
 */
export function lootChest(seed = 17) {
  const W = 40, D = 24, H = 22, LH = 10;
  const g = new VoxelGrid(W, H, D);
  const plank = (x, y, z) => {
    const row = Math.floor(y / 5);
    const c = mulc(0x6a4428, 0.84 + Math.floor(hash2(row, Math.floor(x / 13), seed) * 4) * 0.06);
    if (y % 5 === 0) return mulc(c, 0.7);
    return mulc(c, sp3(x, y, z, seed, 0.12, 0.1));
  };
  // walls (hollow) with a floor
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) {
    const wall = x < 2 || x >= W - 2 || z < 2 || z >= D - 2 || y < 2;
    if (!wall) continue;
    g.set(x, y, z, plank(x, y, z));
  }
  g.box(2, 2, 2, W - 4, 1, D - 4, P.velvet);
  for (let x = 2; x < W - 2; x++) for (let y = 3; y < H; y++) { g.set(x, y, 2, P.velvet); g.set(x, y, D - 3, P.velvet); }
  for (let z = 2; z < D - 2; z++) for (let y = 3; y < H; y++) { g.set(2, y, z, P.velvet); g.set(W - 3, y, z, P.velvet); }
  const band = (x, y, z) => (h3(x, y, z, seed) < 0.1 ? P.rust : (y + z) % 6 === 0 ? P.ironL : P.iron);
  // iron bands round the body, brackets on the corners, rivets
  for (const bx of [5, W / 2 - 1, W - 7]) { g.box(bx, 0, 0, 2, H, 1, band); g.box(bx, 0, D - 1, 2, H, 1, band); g.box(bx, 0, 0, 2, 1, D, band); }
  for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) { g.box(x, 0, z, 1, H, 1, P.iron); }
  for (let y = 3; y < H; y += 6) for (const bx of [5, W - 7]) { g.set(bx, y, -0, P.ironL); g.set(bx + 1, y, D - 1, P.ironL); }
  // ring handles on the ends
  for (const x of [-1, W]) { ring(g, x, D / 2, 1.6, 2.6, 12, 13, P.ironL); }
  // the lock plate
  g.box(W / 2 - 4, H - 9, D - 1, 8, 8, 1, (x, y) => (y === H - 2 || x === W / 2 - 4 ? P.brassD : P.brass));
  g.set(W / 2 - 1, H - 6, D - 1, 0x0a0806); g.set(W / 2 - 1, H - 7, D - 1, 0x0a0806);
  const body = M32(g, [W / 2, 0, D / 2]);
  // the lid: a barrel top, hinged at the back (pivot at the hinge line)
  const lg = new VoxelGrid(W, LH + 1, D + 1);
  for (let x = 0; x < W; x++) for (let z = 0; z <= D; z++) {
    const t = (z + 0.5) / (D + 1);
    const top = Math.round(3 + Math.sin(t * Math.PI) * (LH - 3));
    for (let y = 0; y < top; y++) {
      const shell = y >= top - 2 || x < 2 || x >= W - 2 || z < 1 || z >= D;
      if (!shell) continue;
      const slat = Math.floor(t * 6);
      let c = mulc(0x6e4a2a, 0.85 + Math.floor(hash2(slat, x >> 4, seed + 1) * 3) * 0.07);
      if (Math.floor((t * 6) % 1 * 10) === 0) c = mulc(c, 0.72);
      if (y < top - 2) c = mulc(0x4a2e1a, 1); // inside of the lid
      lg.set(x, y, z, c);
    }
  }
  for (const bx of [5, W / 2 - 1, W - 7]) for (let z = 0; z <= D; z++) {
    const t = (z + 0.5) / (D + 1), top = Math.round(3 + Math.sin(t * Math.PI) * (LH - 3));
    lg.box(bx, top - 1, z, 2, 1, 1, band(bx, top, z));
    if (z === 0 || z === D) lg.box(bx, 0, z, 2, top, 1, band(bx, 1, z));
  }
  // the hasp hanging down the front
  lg.box(W / 2 - 2, -0, D, 4, 4, 1, P.brassD); lg.set(W / 2 - 1, 0, D, P.brassL);
  const lidMesh = M32(lg, [W / 2, 0, 0]);
  lidMesh.position.z = -0.5 * S32;
  const lid = new THREE.Group();
  lid.position.set(0, H * S32, -D / 2 * S32 + 0.5 * S32);
  lid.add(lidMesh);
  // the treasure heap inside (glows while there's loot)
  const tg = new VoxelGrid(W, 20, D);
  for (let x = 3; x < W - 3; x++) for (let z = 3; z < D - 3; z++) {
    const r = Math.hypot((x - W / 2) / (W / 2 - 3), (z - D / 2 + 1) / (D / 2 - 3));
    const h = Math.round(4 + 11 * Math.max(0, 1 - r * r) + hash2(x, z, seed) * 2);
    for (let y = 0; y < h; y++) tg.set(x, 3 + y, z, y === h - 1 ? (hash2(x, z, seed + 2) < 0.2 ? 0xfff4b0 : (x + z) % 3 ? 0xf2c23a : 0xe0aa2a) : 0xc8962a);
  }
  tg.box(9, 12, 9, 3, 4, 3, 0x7ad0ff); tg.box(27, 11, 13, 3, 3, 3, 0xe06a8a); tg.box(18, 16, 10, 2, 3, 2, 0x9aff7a); tg.box(14, 13, 6, 6, 2, 3, 0xd8d8e0);
  const loot = G32(tg, [W / 2, 0, D / 2]);
  loot.userData.noBatch = true;
  return { obj: body, lid, loot, dims: { w: W * S32, d: D * S32, h: (H + LH) * S32, body: H * S32 } };
}

// ---------------------------------------------------------------- the cuckoo clock
/**
 * A carved cuckoo clock: a little walnut house with leaves on its roof and a bird on the ridge, a
 * cream dial, pinecone weights on chains, a swinging pendulum and a door for the cuckoo. Wall piece.
 * Returns { obj (static), hour, minute, pendulum, bird, door (pivots), dial (local centre, tiles) }.
 */
export function cuckooClock(seed = 19) {
  const W = 24, H = 32, Dp = 9;
  const g = new VoxelGrid(W + 10, H + 14, Dp + 6);
  const ox = 5;
  const walnut = (x, y, z) => mulc(0x4a2a18, (y % 4 === 0 ? 0.88 : 1) * sp3(x, y, z, seed, 0.1, 0.12));
  g.box(ox, 0, 0, W, H, Dp, walnut);
  // the roof: two slopes with carved leaves along the eaves
  for (let y = 0; y < 13; y++) {
    const half = W / 2 + 4 - y;
    for (let x = Math.round(ox + W / 2 - half); x < ox + W / 2 + half; x++) {
      const eave = Math.abs(x + 0.5 - (ox + W / 2)) > half - 2.5;
      g.box(x, H + y, 0, 1, 1, Dp + 2, eave ? (hash2(x, y, seed) < 0.5 ? 0x4a6a2a : 0x3a5a22) : mulc(0x3a2012, 1));
    }
  }
  // a carved bird on the ridge
  g.ellipsoid(ox + W / 2, H + 13, Dp / 2 + 1, 2.2, 1.6, 1.6, 0x6a4a2a); g.set(ox + W / 2 + 2, H + 14, Dp / 2 + 1, 0x6a4a2a); g.set(ox + W / 2 - 3, H + 14, Dp / 2 + 1, 0x5a3a1a);
  // carved leaf garlands down the sides
  for (let y = 2; y < H - 2; y += 3) for (const x of [ox - 1, ox + W]) g.set(x, y, Dp - 1, (y >> 1) % 2 ? 0x4a6a2a : 0x6a4a2a);
  // the dial
  const dcx = ox + W / 2, dcy = 13;
  for (let y = dcy - 8; y <= dcy + 8; y++) for (let x = dcx - 8; x <= dcx + 8; x++) {
    const r = Math.hypot(x + 0.5 - dcx, y + 0.5 - dcy);
    if (r > 8.2) continue;
    g.set(x, y, Dp, r > 7.2 ? P.brassD : mixc(0xf0e6cc, 0xd8c8a0, r / 9));
  }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.set(Math.round(dcx - 0.5 + Math.sin(a) * 6), Math.round(dcy - 0.5 + Math.cos(a) * 6), Dp + 1, k % 3 === 0 ? 0x2a1a12 : 0x6a5a4a); }
  // the bird's door frame above the dial
  g.box(dcx - 3, H - 9, Dp, 6, 7, 1, 0x2a1a10);
  const Y0 = 30; // the case stands this high above the weights' feet
  const grid = M32(g, [ox + W / 2, 0, 0]);
  grid.position.y = Y0 * S32;
  // chains and pinecone weights hanging under the case
  const wg = new VoxelGrid(W, Y0, Dp);
  for (const [x, y0] of [[W / 2 - 4, 2], [W / 2 + 4, 10]]) {
    for (let y = y0 + 7; y < Y0; y++) wg.set(x, y, Dp / 2, y % 2 ? P.brassD : P.brass);
    wg.ellipsoid(x, y0 + 3, Dp / 2, 2.2, 4, 2.2, (xx, yy) => ((yy + xx) % 2 ? 0x6a4a22 : 0x4a3018));
  }
  const weights = M32(wg, [W / 2, 0, 0]);
  const obj = group(grid, weights);
  // moving parts
  const hand = (len, w, c) => { const hg = new VoxelGrid(w, len + 2, 1); hg.box(0, 0, 0, w, len, 1, c); hg.set(Math.floor(w / 2), len, 0, c); return M32(hg, [w / 2, 1, 0], { outline: false }); };
  const hour = hand(5, 2, 0x1a1210), minute = hand(7, 1, 0x2a1a12);
  const dialPos = new THREE.Vector3(0, (Y0 + dcy + 0.5) * S32, (Dp + 1.6) * S32);
  hour.position.copy(dialPos); minute.position.copy(dialPos).add(new THREE.Vector3(0, 0, 0.6 * S32));
  const pg = new VoxelGrid(5, 22, 2);
  pg.box(2, 6, 0, 1, 16, 1, P.brassD); pg.ellipsoid(2.5, 3, 1, 2.6, 2.6, 1, (x, y) => (x + y) % 3 === 0 ? P.brassL : P.brass);
  const pendulum = new THREE.Group();
  const pm = M32(pg, [2.5, 22, 1]);
  pendulum.add(pm);
  pendulum.position.set(0, (Y0 + 1) * S32, (Dp / 2) * S32);
  const bg = new VoxelGrid(6, 6, 8);
  bg.ellipsoid(3, 3, 3, 2.4, 2, 3, 0x8a5a3a); bg.set(3, 4, 6, 0x6a3a2a); bg.box(2, 3, 6, 2, 1, 2, 0xe0a030); bg.set(2, 4, 5, 0x0a0a0a); bg.set(4, 4, 5, 0x0a0a0a);
  const bird = M32(bg, [3, 0, 0]);
  bird.position.set(0, (Y0 + H - 8) * S32, (Dp - 6) * S32);
  bird.userData.home = bird.position.z;
  const dg = new VoxelGrid(6, 7, 1);
  dg.box(0, 0, 0, 6, 7, 1, (x, y) => (x === 0 || y === 6 ? 0x5a3a22 : 0x7a5032));
  const doorM = M32(dg, [0, 0, 0]);
  const door = new THREE.Group();
  door.add(doorM);
  door.position.set(-3 * S32, (Y0 + H - 9) * S32, (Dp + 0.5) * S32);
  return { obj, hour, minute, pendulum, bird, door, dial: dialPos };
}

// ---------------------------------------------------------------- keepsakes on the walls
/** Two old picks crossed on a little oak plaque (wall piece). */
export function crossedPicks(seed = 21) {
  const g = new VoxelGrid(48, 44, 6);
  g.box(14, 10, 0, 20, 22, 2, (x, y) => (x === 14 || x === 33 || y === 10 || y === 31 ? P.oakD : mulc(P.oakM, sp3(x, y, 0, seed, 0.1, 0.1))));
  const pick = (a, b, h0, h1, z) => { line(g, [a, b], 1, (x, y, zz) => (h3(x, y, zz, seed) < 0.25 ? 0x7a4a2a : 0x9a6a3a)); line(g, [h0, b, h1], 1.2, (x, y) => (y > b[1] - 1 ? 0xa8a8b4 : 0x7a7a84)); g.set(Math.round(h0[0]), Math.round(h0[1]), z, P.rust); };
  pick([6, 4, 3], [38, 34, 3], [28, 41, 3], [46, 26, 3], 3);
  pick([42, 4, 4], [10, 34, 4], [20, 41, 4], [2, 26, 4], 4);
  return M32(g, [24, 0, 0]);
}

/** A faded photograph in a frame (wall piece), kind 0..2; w, h in voxels. */
export function oldPhoto(kind = 0, w = 16, h = 13, frame = P.oakD) {
  const g = new VoxelGrid(w + 4, h + 4, 3);
  g.box(0, 0, 0, w + 4, h + 4, 2, (x, y) => ((x + y) % 5 === 0 ? mulc(frame, 1.2) : frame));
  g.box(2, 2, 2, w, h, 1, (x, y) => { const sx = Math.floor((x - 2) * 10 / w), sy = Math.floor((y - 2) * 12 / h); const c = sepia(sx, sy, kind); return x === 2 || y === h + 1 ? mulc(c, 0.9) : c; });
  return M32(g, [(w + 4) / 2, 0, 0]);
}

/** A yellowed map of the old workings pinned at its corners, curling (wall piece). */
export function mineMap(seed = 23) {
  const W = 52, H = 36;
  const g = new VoxelGrid(W, H, 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    let c = mixc(0xe0cc98, 0xc8a870, Math.min(1, (3 - Math.min(3, edge)) / 3 * 0.8 + hash2(x >> 2, y >> 2, seed) * 0.25));
    if (hash2(x, y, seed) < 0.05) c = mulc(c, 0.9);
    const z = (x < 3 && y > H - 4) || (x > W - 4 && y < 3) ? 1 : 0; // curled corners
    g.set(x, y, z, c);
  }
  // tunnels: a trunk shaft and galleries, a lift box, an X
  const ink = 0x6a3a22;
  line(g, [[10, H - 4, 1], [10, 6, 1]], 0.5, ink);
  for (const [y, x1] of [[28, 40], [20, 30], [12, 46]]) line(g, [[10, y, 1], [Math.round(x1 * 0.6), y + 2, 1], [x1, y - 1, 1]], 0.5, ink);
  line(g, [[30, 20, 1], [33, 12, 1]], 0.5, ink);
  g.box(8, H - 6, 1, 5, 4, 1, 0x3a5a8a);
  for (let k = -2; k <= 2; k++) { g.set(42 + k, 13 + k, 1, 0xb82a1a); g.set(42 + k, 13 - k, 1, 0xb82a1a); }
  // a little compass rose
  for (let k = -3; k <= 3; k++) { g.set(46, 28 + k, 1, ink); g.set(46 + k, 28, 1, ink); }
  g.set(46, 32, 1, 0xb82a1a);
  for (const [x, y] of [[1, 1], [W - 2, H - 2], [W - 2, 1], [1, H - 2]]) g.set(x, y, 2, P.red);
  return M32(g, [W / 2, 0, 0]);
}

/**
 * The Miners' Board by the bar: an oak-framed board of pinned notices (a ledger page, a wanted
 * poster with a red seal, a drawing of a pick with an arrow pointing up, a list of tools), under a
 * header plank carved with a pick and a lamp. Wall piece. Returns a mesh.
 */
export function minersBoard(seed = 49) {
  const W = 56, H = 40;
  const g = new VoxelGrid(W, H + 12, 6);
  g.box(0, 0, 0, W, H, 2, (x, y) => (x < 3 || y < 3 || x >= W - 3 || y >= H - 3 ? mulc(P.oakM, (x + y) % 6 === 0 ? 0.85 : 1) : (Math.floor(x / 9) % 2 ? 0x6a4a30 : 0x60442c)));
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) g.box(x, y, 2, 1, 1, 1, P.oakD);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) g.box(x, y, 2, 1, 1, 1, P.oakD);
  // header plank with a carved pick and a lamp
  g.box(8, H, 0, W - 16, 11, 3, (x, y) => (y === H || y === H + 10 ? P.oakD : P.oakM));
  line(g, [[18, H + 2, 3], [28, H + 9, 3]], 0.5, 0xd8c8a0); line(g, [[24, H + 9, 3], [29, H + 7, 3], [30, H + 4, 3]], 0.5, 0xb8b8c0);
  g.box(33, H + 2, 3, 4, 5, 1, P.brassD); g.box(34, H + 3, 3, 2, 3, 1, 0xffc060); g.set(35, H + 8, 3, P.brassD);
  // notices
  const note = (x0, y0, w, h, tint, fn) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? mulc(tint, 0.88) : tint;
      const f = fn?.(x, y, w, h);
      if (f) c = f;
      g.set(x0 + x, y0 + y, 2, c);
    }
    g.box(x0 + Math.floor(w / 2), y0 + h - 2, 3, 1, 1, 1, P.brass);
  };
  const lines = (x, y, w, h) => (y < h - 3 && y > 1 && (h - y) % 2 === 0 && x > 1 && x < w - 2 && hash2(x >> 1, y, seed) < 0.75 ? 0x5a4a3a : 0);
  note(5, 20, 14, 16, P.paper, (x, y, w, h) => (y === h - 3 && x > 2 && x < w - 3 ? 0x2a1a12 : lines(x, y, w, h))); // the ledger page
  note(21, 18, 13, 17, 0xf0dcb0, (x, y) => (Math.hypot(x - 6, y - 4) < 2.2 ? 0xb82a1a : Math.abs(x - 6) < 3 && y > 9 && y < 14 ? 0x5a4a3a : 0)); // wanted, with a seal
  note(36, 21, 15, 14, P.paperO, (x, y) => ((x === 7 && y > 2 && y < 11) || (y === 10 - Math.abs(x - 7) && y > 6) ? 0x2a4a8a : x > 3 && x < 11 && y === 3 ? 0x6a5a4a : 0)); // a pick, an arrow up
  note(8, 4, 18, 12, 0xe8e0c8, lines); // tools wanted
  note(30, 4, 20, 13, P.paper, (x, y, w, h) => (x === 4 && y > 2 && y < h - 2 && y % 2 ? 0x6a8a3a : lines(x, y, w, h))); // a checklist
  return M32(g, [W / 2, 0, 0]);
}

/** 3×5 chalk glyphs for the takings slate. */
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  '+': '000010111010000', '-': '000000111000000', ' ': '000000000000000', G: '111100101101111', A: '010101111101101', S: '111100111001111', T: '111010010010010', N: '101111111111101', I: '111010010010111', K: '101110100110101', L: '100100100100111', O: '111101101101111', Y: '101101010010010', E: '111100110100111', H: '101101111101101',
};

/**
 * A little chalk slate in a frame, propped up: write(lines) chalks up to two short lines of text
 * (digits, a few capitals, + and -). Wall piece (leaning back a touch). Returns { obj, write }.
 */
export function chalkSlate(seed = 51) {
  const W = 19, H = 13;
  const g = new VoxelGrid(W, H, 3);
  g.box(0, 0, 0, W, H, 2, (x, y) => (x < 2 || y < 2 || x >= W - 2 || y >= H - 2 ? mulc(P.oakM, (x + y) % 5 === 0 ? 0.85 : 1) : 0x2e3634));
  const frame = M32(g, [W / 2, 0, 0]);
  const cw = (W - 4) * 4, ch = (H - 4) * 4;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry((W - 4) * S32, (H - 4) * S32), new THREE.MeshBasicMaterial({ map: tex, color: 0xb8b0a0 }));
  face.position.set(0, (H / 2) * S32, 2.05 * S32);
  face.userData.noBatch = true;
  const write = (rows) => {
    const c = cv.getContext('2d');
    c.fillStyle = '#2e3634'; c.fillRect(0, 0, cw, ch);
    // smudges of old chalk
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(220,226,214,${0.04 + 0.05 * hash2(i, 1, seed)})`; c.fillRect(Math.floor(hash2(i, 2, seed) * cw), Math.floor(hash2(i, 3, seed) * ch), 6, 2); }
    rows.slice(0, 2).forEach((txt, r) => {
      const t = String(txt).toUpperCase().slice(0, 12);
      const s = Math.max(1, Math.min(r === 0 ? 2 : 3, Math.floor((cw - 4) / (t.length * 4)))), gw = 4 * s;
      let x = Math.round((cw - t.length * gw + s) / 2), y = r === 0 ? 4 : 18;
      for (const chr of t) {
        const gl = GLYPHS[chr] || GLYPHS[' '];
        for (let k = 0; k < 15; k++) if (gl[k] === '1') { c.fillStyle = hash2(x + k, y, r) < 0.18 ? '#c8ccc0' : '#eef2e6'; c.fillRect(x + (k % 3) * s, y + Math.floor(k / 3) * s, s, s); }
        x += gw;
      }
    });
    tex.needsUpdate = true;
  };
  const obj = new THREE.Group();
  obj.add(frame, face);
  obj.rotation.x = -0.12;
  return { obj, face, write };
}

/** A slatted duckboard on bearers (floor piece, len × depth × h voxels, centred). */
export function duckboard(len, depth, h, seed = 53) {
  const g = new VoxelGrid(len, h, depth);
  for (const z of [3, Math.floor(depth / 2) - 2, depth - 7]) g.box(0, 0, z, len, h - 3, 4, P.oakD);
  for (let x = 0; x < len; x += 9) g.box(x, h - 3, 0, 7, 3, depth, (xx, y, zz) => (y === h - 1 ? mixc(0x7a5232, 0xa08060, Math.max(0, 1 - Math.abs(zz - depth / 2) / (depth / 2)) * 0.4) : 0x5e3c24));
  return M32(g, [len / 2, 0, depth / 2]);
}

/** Coat hooks on a board with an old coat, a scarf and a miner's helmet (wall piece). */
export function coatRack(seed = 27) {
  const g = new VoxelGrid(44, 64, 12);
  g.box(0, 52, 0, 44, 6, 2, (x) => (x % 11 === 0 ? P.oakD : P.oakM));
  for (const x of [6, 18, 30, 40]) { g.box(x, 53, 2, 2, 2, 4, P.brassD); g.set(x, 55, 5, P.brass); }
  // the coat: a long brown coat hanging from the second hook, a patch on the elbow
  for (let y = 10; y < 54; y++) {
    const w = 6 + Math.round((54 - y) * 0.14);
    for (let x = 18 - w; x <= 18 + w; x++) for (let z = 2; z < 9; z++) {
      const r = Math.hypot((x - 18) / (w + 0.5), (z - 5) / 4);
      if (r > 1 || r < 0.6) continue;
      let c = (x + y) % 9 === 0 ? 0x4a3020 : 0x5e3c26;
      if (Math.abs(x - 18) < 1 && y < 50) c = 0x3a2416;
      if (x > 18 + w - 3 && y > 28 && y < 36) c = 0x8a6a3a;
      g.set(x, y, z, c);
    }
  }
  // a striped scarf on the first hook
  for (let y = 26; y < 54; y++) for (let x = 5; x < 9; x++) g.set(x + (y < 36 ? 1 : 0), y, 3, Math.floor(y / 3) % 2 ? 0xc84a3a : 0xe8dcc0);
  // a battered miner's helmet on the third hook, its lamp dark
  g.ellipsoid(30, 50, 6, 6, 4.5, 6, (x, y) => (y < 47 ? -1 : (x + y) % 7 === 0 ? 0xc89a2a : 0xd8a830));
  g.box(23, 46, 1, 14, 1, 11, 0xb8901e);
  g.box(28, 49, 11, 4, 4, 2, 0x5a5a62); g.box(29, 50, 12, 2, 2, 1, 0x9ab0b8);
  // a lantern on the last hook
  g.box(38, 38, 3, 6, 10, 6, (x, y) => (y === 38 || y === 47 ? P.iron : x === 38 || x === 43 ? P.iron : 0xc8b890));
  g.set(40, 50, 5, P.iron); g.set(40, 51, 5, P.iron); g.set(40, 52, 5, P.iron);
  return M32(g, [22, 0, 0]);
}

/** A small iron-and-glass sconce with a candle (wall piece). Returns { obj, light }. */
export function sconce(seed = 2) {
  const sg = new VoxelGrid(14, 26, 18);
  const sgl = new VoxelGrid(14, 26, 18);
  const ir = iron(0x2e2e36, seed);
  sg.box(4, 14, 0, 6, 8, 2, ir);
  line(sg, [[7, 18, 1], [7, 18, 11], [7, 16, 13]], 0.8, ir);
  sg.box(2, 0, 7, 11, 2, 11, ir); sg.box(2, 15, 7, 11, 2, 11, ir); sg.box(4, 17, 9, 7, 1, 7, ir);
  for (const [xx, z] of [[2, 7], [12, 7], [2, 17], [12, 17]]) sg.box(xx, 2, z, 1, 13, 1, ir);
  sgl.box(3, 2, 8, 9, 13, 9, (xx, y) => (y > 9 ? 0xffd890 : 0xffb24a));
  sgl.box(6, 5, 11, 3, 5, 3, 0xfff2c0);
  return { obj: group(M32(sg, [7, 0, 0]), G32(sgl, [7, 0, 0])), light: { x: 0, y: 9 * S32, z: 12 * S32 } };
}

/** A shelf with odds and ends: jars, a candle stub, a rolled map and a tin cup (wall piece). */
export function oddsShelf(len = 40, seed = 29) {
  const g = new VoxelGrid(len, 22, 12), gl = new VoxelGrid(len, 22, 12);
  g.box(0, 6, 0, len, 2, 10, wood(P.oakM, { axis: 'x', across: 'z', pw: 99, seed }));
  for (const x of [4, len - 6]) line(g, [[x, 6, 1], [x, 0, 1], [x, 6, 8]], 0.7, P.iron);
  ring(g, 6, 5, 0, 3, 8, 16, (x, y) => (y > 13 ? 0xd8e8f0 : 0x8ab84a)); ring(g, 6, 5, 0, 3.3, 16, 17, P.brassD);
  candleAt(g, gl, 14, 8, 5, 3, P.waxD);
  line(g, [[19, 9, 5], [31, 9, 3]], 1.2, (x, y, z) => (x % 4 === 0 ? 0xc8a870 : 0xe0cc98));
  mug(g, len - 8, 8, 5, 1);
  return { obj: group(M32(g, [len / 2, 0, 0]), G32(gl, [len / 2, 0, 0])), light: { x: (15 - len / 2) * S32, y: 14 * S32, z: 6 * S32 } };
}

// ---------------------------------------------------------------- furniture of the hall
/**
 * The stuffed old sofa: a camel-backed settee in faded bottle-green velvet on a carved oak frame
 * with bun feet, button tufting, rolled arms gone pale where elbows rest, two sagging cushions (one
 * patched), a crocheted doily on the back, a knitted throw and a little red cushion. Floor piece
 * 2 tiles wide, front +z. Returns { obj, seats } (seats local, tiles, like the furniture builders).
 */
export function stuffedSofa(seed = 31) {
  const W = 66, D = 30, H = 40;
  const g = new VoxelGrid(W, H, D);
  const VEL = 0x3e5e46, VEL_D = 0x2c4634, VEL_L = 0x587a5c, WORN = 0x8a9a7a, OAKF = 0x4a2e1c;
  const vel = (x, y, z) => ((x * 3 + y * 5 + z * 7) % 23 === 0 ? VEL_L : (x + y * 2) % 13 === 0 ? VEL_D : VEL);
  // bun feet and the carved skirt rail
  for (const [x, z] of [[3, 3], [W - 7, 3], [3, D - 7], [W - 7, D - 7]]) g.ellipsoid(x + 2, 2, z + 2, 2.6, 2.4, 2.6, (xx, y) => (y === 2 ? 0x6a4428 : OAKF));
  g.box(1, 4, 2, W - 2, 3, D - 3, (x, y, z) => (z === D - 2 && y === 5 && (x % 6 === 3) ? 0x6a4428 : y === 6 ? mulc(OAKF, 1.15) : OAKF));
  // the seat: two cushions sagging in the middle, piped edges, one patched
  for (let x = 7; x < W - 7; x++) {
    const ci = x < W / 2 ? 0 : 1, lx = ci ? x - W / 2 : x - 7, cw = W / 2 - 7;
    const sagK = Math.round(Math.sin((lx / cw) * Math.PI) * 1.6);
    for (let z = 6; z < D - 1; z++) for (let y = 7; y < 15 - sagK; y++) {
      const top = y === 14 - sagK, front = z === D - 2;
      let c = vel(x, y, z);
      if ((lx === 0 || lx === cw - 1) && top) c = VEL_D; // the gap between cushions
      else if (top && front) c = VEL_L; // piping
      else if (top && hash2(x >> 1, z >> 1, seed) < 0.12) c = mixc(c, WORN, 0.4);
      if (ci === 1 && top && lx > 8 && lx < 18 && z > 12 && z < 22) c = (x + z) % 3 ? 0x8a6a4a : 0x7a5a3a; // the patch
      if (ci === 1 && top && (lx === 8 || lx === 18) && z > 12 && z < 22 && z % 2) c = 0xe8dcc0; // its stitches
      g.set(x, y, z, c);
    }
  }
  // the camel back, button-tufted in front, its oak frame showing behind and along the top
  const backTop = (x) => 26 + Math.round(8 * Math.sin(((x - 5) / (W - 10)) * Math.PI) ** 1.4);
  for (let x = 5; x < W - 5; x++) {
    const top = backTop(x);
    for (let y = 7; y < top; y++) for (let z = 1; z < 8; z++) {
      let c = vel(x, y, z);
      if (z === 7) {
        const dx = (x - 5) % 10, dy = (y - 10) % 7;
        if (dx === 5 && dy === 3) c = 0x1e3424; // buttons, deep in the pile
        else if ((dx + dy) % 7 === 0 || (dx - dy + 70) % 7 === 0) c = mulc(VEL, 0.88); // the diamond folds
      }
      if (z === 1) c = (x === 5 || x === W - 6 || y === 7) ? OAKF : mulc(VEL_D, (x % 8 === 0 ? 0.85 : 1)); // the plain back
      if (y >= top - 2) c = y === top - 1 ? mulc(OAKF, 1.15) : OAKF; // the oak rail along the top
      g.set(x, y, z, c);
    }
  }
  // rolled arms with a scroll on their faces, worn pale on top
  for (const ax of [0, W - 7]) for (let z = 1; z < D - 1; z++) for (let x = ax; x < ax + 7; x++) for (let y = 7; y < 24; y++) {
    const r = y > 19 ? Math.hypot(x + 0.5 - (ax + 3.5), y - 19) : 0;
    if (r > 4.1) continue;
    let c = vel(x, y, z);
    if (y >= 21 && r < 4.1) c = mixc(c, WORN, 0.35 + hash2(x, z, seed) * 0.2);
    if (z === D - 2) { const sr = Math.hypot(x + 0.5 - (ax + 3.5), y - 19); if (Math.abs(sr - 2) < 0.6 || y < 10) c = VEL_D; } // the scroll
    g.set(x, y, z, c);
  }
  // the doily on the back, a little red cushion in the corner, a knitted throw over the left arm
  for (let x = W / 2 - 8; x < W / 2 + 8; x++) for (let z = 2; z < 6; z++) if (Math.abs(x + 0.5 - W / 2) + Math.abs(z - 3.5) < 9) g.set(x, backTop(x), z, (x + z) % 2 ? 0xf0e8d8 : 0xd8d0c0);
  g.rbox(W - 18, 14, 7, 9, 10, 5, (x, y) => ((x + y) % 4 === 0 ? 0xe8d8b0 : 0xa8443a), 2);
  for (let z = 4; z < D - 3; z++) for (let y = 9; y < 25; y++) {
    const over = y > 22;
    g.set(over ? 2 + (y - 22) : -0 + (y > 20 ? 1 : 0), over ? 24 : y, z, Math.floor(z / 3) % 2 ? 0xd8a848 : (y % 3 ? 0xe8dcc0 : 0xc8bca0));
  }
  return { obj: M32(g, [W / 2, 0, D / 2]), seats: [{ x: -0.42, z: 0.14, y: 0.28, yaw: 0 }, { x: 0.42, z: 0.14, y: 0.28, yaw: 0 }] };
}

/** A blanket folded over a chair arm and a cushion (dressing for Old Star's armchair). */
export function blanket(seed = 33) {
  const g = new VoxelGrid(30, 24, 30);
  for (let z = 2; z < 28; z++) for (let y = 0; y < 22; y++) {
    const x = y > 18 ? 2 + (y - 18) : 0;
    g.set(x, y, z, (Math.floor(z / 4) + Math.floor(y / 4)) % 2 ? 0xc8583a : 0xe8d0a0);
  }
  return M32(g, [0, 0, 15]);
}

/** A worn rectangular runner rug with a fringe (floor, centred; w × d in voxels). */
export function runnerRug(w = 120, d = 56, seed = 35) {
  const g = new VoxelGrid(w + 6, 1, d);
  for (let z = 0; z < d; z++) for (let x = 0; x < w + 6; x++) {
    if (x < 3 || x >= w + 3) { if (z % 2 === 0) g.set(x, 0, z, 0xd8c8a0); continue; }
    const lx = x - 3;
    const border = lx < 5 || lx >= w - 5 || z < 5 || z >= d - 5;
    const dia = (Math.abs((lx % 20) - 10) + Math.abs((z % 20) - 10)) < 5;
    let c = border ? 0x2a3a5a : dia ? 0xc89a3a : 0x8a2a24;
    if (!border && (Math.abs((lx % 20) - 10) + Math.abs((z % 20) - 10)) === 7) c = 0xe0d0a8;
    // worn through in the middle where everybody walks
    const wear = Math.max(0, 1 - Math.hypot((lx - w / 2) / (w * 0.35), (z - d / 2) / (d * 0.5)));
    if (hash2(lx >> 1, z >> 1, seed) < wear * 0.7) c = mixc(c, 0x9a8a74, 0.55);
    g.set(x, 0, z, c);
  }
  return M32(g, [(w + 6) / 2, 0, d / 2], { outline: false });
}

/** The wagon wheel chandelier: rim, spokes, hub, six candles with drips, three chains (origin at the hook). */
export function wagonChandelier(drop = 36, seed = 37) {
  const R = 26, N = R * 2 + 4;
  const g = new VoxelGrid(N, drop + 22, N), gl = new VoxelGrid(N, drop + 22, N);
  const c = N / 2, y0 = 4;
  const wd = (x, y, z) => mulc(0x5a3a22, sp3(x, y, z, seed, 0.15, 0.12));
  ring(g, c, c, R - 3, R, y0, y0 + 4, (x, y, z) => (y === y0 + 3 ? mulc(0x6a4428, 1.05) : wd(x, y, z)));
  ring(g, c, c, R - 0.2, R + 0.8, y0 + 1, y0 + 3, P.iron); // the tyre
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; line(g, [[c + Math.cos(a) * 3, y0 + 2, c + Math.sin(a) * 3], [c + Math.cos(a) * (R - 2), y0 + 2, c + Math.sin(a) * (R - 2)]], 1, wd); }
  g.ellipsoid(c, y0 + 2, c, 4, 3, 4, wd); ring(g, c, c, 0, 2, y0 + 4, y0 + 6, P.iron);
  const cand = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.26;
    const x = Math.round(c + Math.cos(a) * (R - 1.5)), z = Math.round(c + Math.sin(a) * (R - 1.5));
    g.box(x - 1, y0 + 4, z - 1, 3, 1, 3, P.iron);
    candleAt(g, gl, x - 1, y0 + 5, z - 1, 5 + (k % 3), k % 2 ? P.wax : P.waxD);
    for (let d = 0; d < 3; d++) g.set(x + (d % 2), y0 + 3 - d, z, P.wax); // wax drips off the rim
    cand.push({ x: (x - 0.5 - c) * S32, y: (y0 + 12) * S32, z: (z - 0.5 - c) * S32 });
  }
  // chains: three up from the rim to a ring, one up to the hook
  const top = y0 + drop;
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; line(g, [[c + Math.cos(a) * (R - 2), y0 + 4, c + Math.sin(a) * (R - 2)], [c, top - 8, c]], 0.5, (x, y) => (y % 3 ? P.iron : P.ironL)); }
  ring(g, c, c, 1, 2.4, top - 9, top - 7, P.ironL);
  for (let y = top - 7; y < top + 4; y++) g.set(c, y, c, y % 3 ? P.iron : P.ironL);
  const obj = group(M32(g, [c, top + 4, c]), G32(gl, [c, top + 4, c]));
  return { obj, candles: cand.map((p) => ({ ...p, y: p.y - (top + 4) * S32 })), r: R * S32 };
}

/** A sagging main beam along x (len voxels), with adze marks and an iron strap or two. Origin at its left end, top. */
export function sagBeam(len, sagV = 4, seed = 39) {
  const Hb = 15, Db = 14;
  const g = new VoxelGrid(len, Hb + sagV + 1, Db);
  const bw = wood(0x4a2e1c, { axis: 'x', across: 'y', pw: 99, seed });
  for (let x = 0; x < len; x++) {
    const s = Math.round(Math.sin((x / (len - 1)) * Math.PI) * sagV);
    for (let y = 0; y < Hb; y++) for (let z = 0; z < Db; z++) {
      const yy = sagV + y - s;
      let c = bw(x, y, z);
      if (y === 0 || z === 0 || z === Db - 1) c = mulc(c, 0.8);
      if (y === Hb - 1) c = mulc(c, 0.75);
      if ((x % 9 === 0 && (z === 0 || z === Db - 1)) || hash2(x, y + z * 17, seed) < 0.02) c = mulc(c, 1.18); // adze marks
      g.set(x, yy, z, c);
    }
    // a check (crack) along one side
    if (x > len * 0.3 && x < len * 0.55) g.set(x, sagV + 7 - s + Math.round(Math.sin(x * 0.2)), Db - 1, 0x1a100a);
  }
  for (const fx of [0.33, 0.67]) {
    const x0 = Math.round(len * fx), s = Math.round(Math.sin(fx * Math.PI) * sagV);
    for (let x = x0; x < x0 + 3; x++) for (let y = -1; y <= Hb; y++) { g.set(x, sagV + y - s, -0, P.iron); g.set(x, sagV + y - s, Db - 1, P.iron); }
  }
  return M32(g, [0, Hb + sagV, Db / 2]);
}

/** An old pit prop shoring up a beam: a rough post with a wedge and an iron band (height voxels). */
export function pitProp(h, seed = 41) {
  const g = new VoxelGrid(14, h, 14);
  for (let y = 0; y < h; y++) for (let x = 0; x < 14; x++) for (let z = 0; z < 14; z++) {
    const r = Math.hypot(x + 0.5 - 7, z + 0.5 - 7);
    if (r > 6.4) continue;
    let c = mulc(0x5a3a22, (Math.floor(Math.atan2(z - 7, x - 7) * 3 + y / 9) % 3 === 0 ? 0.86 : 1));
    if (r > 5.6 && hash2(x + y, z, seed) < 0.3) c = 0x6a5a48; // bark scraps
    if (y < 6) c = mulc(c, 0.7);
    g.set(x, y, z, c);
  }
  g.box(1, h - 6, 1, 12, 2, 12, P.iron);
  g.box(2, h - 4, 4, 10, 4, 6, 0x8a6a42); // the wedge
  return M32(g, [7, 0, 7]);
}

// ---------------------------------------------------------------- the steps and the archway
/**
 * The creaky steps from the archway down into the hall: worn oak treads with nosings, scuffed
 * risers, a stringer on the open side and a banister with a turned newel post on the other.
 * Grid z runs from the wall face (0) into the hall; y from the hall floor; built for treads of
 * td voxels and risers of rh voxels (n risers). Returns a mesh with its origin at the hall floor
 * under the top of the steps (rotate π to face north).
 */
export function creakySteps(wv = 64, n = 3, rh = 10, td = 20, seed = 43) {
  const Dz = (n - 1) * td + 6, Hy = n * rh + 40;
  const g = new VoxelGrid(wv + 8, Hy, Dz + 4);
  const tread = wood(0x7a5232, { axis: 'x', across: 'z', pw: 7, seed });
  for (let i = 0; i < n - 1; i++) {
    const top = (n - 1 - i) * rh; // top of tread i (from the hall floor), tread i nearest the wall
    const z0 = i * td, z1 = z0 + td;
    for (let x = 4; x < wv + 4; x++) for (let z = z0; z < z1 + (i === n - 2 ? 1 : 0); z++) for (let y = 0; y < top; y++) {
      const isTop = y >= top - 3;
      let c;
      if (isTop) {
        c = tread(x, y, z);
        const wear = Math.max(0, 1 - Math.abs(x - 4 - wv / 2) / (wv * 0.32));
        if (y === top - 1) c = mixc(c, 0xb08a60, wear * 0.55 + (h3(x, y, z, seed) < 0.1 ? 0.15 : 0));
        if (z === z1 - 1 || z === z1) c = mulc(c, y === top - 1 ? 1.12 : 0.85); // nosing
        if ((x === 8 || x === wv) && (z - z0) % 9 === 4 && y === top - 1) c = 0x8a8a90; // nails
      } else if (z >= z1 - 2) {
        c = mulc(0x5e3c24, (x % 9 === 0 ? 0.8 : 1) * (y < 3 ? 0.8 : 1)); // riser
        if (y > top - 8 && hash2(x >> 1, y, seed + 2) < 0.12) c = mixc(c, 0x9a8a74, 0.5); // kick scuffs
      } else c = 0x2a1a10; // inside (never seen)
      g.set(x, y, z, c);
    }
  }
  // the stringers: the open (west) side shows its sawn profile, the east side carries the banister
  for (const sx of [0, wv + 4]) for (let z = 0; z < Dz - 2; z++) {
    const top = Math.max(2, Math.round((n - 1) * rh - z * (rh / td)) + 4);
    for (let y = 0; y < top; y++) g.box(sx, y, z, 4, 1, 1, y >= top - 2 ? mulc(P.oakM, 1.08) : mulc(P.oak, sp3(sx, y, z, seed, 0.1, 0.1)));
  }
  // banister on the east side: a newel post at the bottom with a ball, balusters and a handrail
  const bx = wv + 5;
  const newelZ = Dz - 6;
  g.box(bx - 1, 0, newelZ, 4, 44, 4, (x, y) => (y % 12 === 0 ? mulc(P.oakM, 0.8) : P.oakM));
  g.ellipsoid(bx + 1, 46, newelZ + 2, 2.8, 2.8, 2.8, mulc(P.oakM, 1.15));
  for (let z = 2; z < newelZ; z += 6) {
    const base = Math.round((n - 1) * rh - z * (rh / td)) + 4;
    for (let y = base; y < base + 36; y++) g.set(bx, y, z, (y - base) % 10 < 2 ? mulc(P.oak, 1.1) : P.oak);
  }
  line(g, [[bx + 0.5, (n - 1) * rh + 44, 0], [bx + 0.5, 42, newelZ]], 1, mulc(P.oakM, 1.12));
  return M32(g, [(wv + 8) / 2, 0, 0]);
}

/**
 * The archway through the wall between the hall and your room: a stone arch on the hall side with
 * a keystone, timber reveals lining the passage, a worn threshold and a timber architrave on the
 * room side with a heavy curtain tied back. thick = wall thickness (voxels). Origin: the opening's
 * centre at the room's floor on the room-side wall face; grid z runs from the room side (0) into
 * the hall (thick). Returns { obj }.
 */
export function archway(hw = 24, top = 80, thick = 20, seed = 45) {
  const base = top - hw;
  const R = hw + 9, GW = R * 2 + 4, GH = top + 12;
  const cx = GW / 2;
  const g = new VoxelGrid(GW, GH, thick + 6);
  const inside = (dx, y) => Math.abs(dx) <= hw && (y < base || dx * dx + (y - base) ** 2 <= hw * hw);
  const st = blocks(14, 10, seed);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = x + 0.5 - cx;
    if (inside(dx, y)) continue;
    const outerA = y < base ? Math.abs(dx) <= hw + 7 : dx * dx + (y - base) ** 2 <= (hw + 7) ** 2;
    const outerT = y < base ? Math.abs(dx) <= hw + 4 : dx * dx + (y - base) ** 2 <= (hw + 4) ** 2;
    // the passage reveal (timber boards) through the wall
    if (outerT) for (let z = 2; z < thick + 2; z++) g.set(x, y, z, mulc(0x6a4428, ((z >> 2) % 2 ? 0.92 : 1) * sp3(x, y, z, seed, 0.1, 0.1)));
    // hall side: stone voussoirs and keystone
    if (outerA) {
      const a = Math.atan2(y - base, dx);
      const seam = y >= base ? Math.abs(((a / Math.PI) * 9) % 1) < 0.1 : y % 10 === 0;
      const key = y >= base && Math.abs(dx) < 3.5 && y > top - 2;
      for (let z = thick + 1; z < thick + (key ? 6 : 4); z++) g.set(x, y, z, seam ? P.mortar : st(x, y, z));
    }
    // room side: a timber architrave
    if (outerT) {
      const edge = (y < base ? Math.abs(dx) > hw + 3 : dx * dx + (y - base) ** 2 > (hw + 3) ** 2);
      for (let z = 0; z < 2; z++) g.set(x, y, z, edge ? 0x3e2616 : mulc(0x5a3a22, (x + y) % 6 === 0 ? 0.9 : 1));
    }
  }
  // the worn threshold board
  for (let x = Math.round(cx - hw - 2); x < cx + hw + 2; x++) for (let z = 0; z < thick + 4; z++) g.set(x, 0, z, mixc(0x6a4428, 0xa08060, Math.max(0, 1 - Math.abs(x + 0.5 - cx) / hw) * 0.5));
  const obj = new THREE.Group();
  obj.add(M32(g, [cx, 0, 0]));
  // the curtain on its rod, drawn back to the left and tied: gathered folds, a tasselled tie,
  // the hem pooling a little on the floor (on its own small grid, room side)
  const CH = top + 8;
  const cg = new VoxelGrid(22, CH + 4, 8);
  const tieY = Math.round(top * 0.42);
  for (let y = 0; y < CH; y++) {
    const w = y > tieY + 3 ? 7 + Math.round(((y - tieY) / (CH - tieY)) * 6) : y >= tieY - 2 ? 5 : 6 + Math.round(((tieY - y) / tieY) * 7);
    for (let x = 0; x < w; x++) for (let z = 0; z < 4; z++) {
      const fold = (x + (y > tieY ? 0 : 1)) % 3;
      if (z === 3 && fold !== 1) continue; // folds stand out in ridges
      let c = fold === 0 ? 0x5a2232 : fold === 1 ? 0x8a3646 : 0x74303e;
      if (y < 4 && (x + y) % 2) c = 0xc8a048; // the fringe at the hem
      if (y > tieY - 3 && y < tieY + 3) c = (x + y) % 2 ? 0xd8b048 : 0xb89038; // the tie
      cg.set(x, y, z, c);
    }
  }
  for (let y = tieY - 9; y < tieY - 2; y++) cg.set(5, y, 4, 0xd8b048); // the tassel
  cg.box(0, CH, 1, 22, 2, 2, P.brassD); cg.box(0, CH - 1, 1, 2, 4, 3, P.brass); // the rod and its finial
  const cm = M32(cg, [0, 0, 0]);
  cm.position.set((-hw - 6) * S32, 0, -5 * S32);
  obj.add(cm);
  return { obj };
}

// ---------------------------------------------------------------- the old dug tunnels (boarded)
/** A few boards nailed across an opening of half-width hw, height h (voxels) — unused openings. */
export function boardsAcross(hw, h, seed = 47) {
  const g = new VoxelGrid(hw * 2 + 8, h, 6);
  for (let k = 0; k < 4; k++) {
    const y = Math.round(h * (0.2 + k * 0.2));
    line(g, [[1, y + (k % 2 ? 3 : -2), 3], [hw * 2 + 6, y + (k % 2 ? -3 : 2), 3]], 2.4, (x, yy, z) => mulc(0x7a5232, (x % 13 === 0 ? 0.8 : 1) * sp3(x, yy, z, seed + k, 0.12, 0.1)));
  }
  return M32(g, [hw + 4, 0, 0]);
}

export { sag };
