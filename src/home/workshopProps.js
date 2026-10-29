// Old Star's workshop and his larder, at 1/64 m voxels (1/32 tile): the little railway on its
// table of felt hills (the train runs when wound), the drafting table with the Surface Express
// drawn on it, the workbench and its pegboard, the clockwork hen, the loft of crates up its ladder,
// a tool chest; the cheese rack, barrels on their cradle, the hanging rack of hams, sausages and
// garlic, the root bins, the ice chest, logs growing mushrooms, and a mouse hole with a trap and a
// note. Conventions as houseProps.js (tile units; wall pieces centred on x, z out of the wall).
import { VoxelGrid, C, wood, beam, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P } from './tavernProps.js';
import { H, jar, bottle, books, candle } from './houseProps.js';
import { makeRng } from '../core/util.js';

const vm = (m) => Math.round(m * 64);
const T = (v) => v * S32;

// ---------------------------------------------------------------- the workshop
/**
 * The little railway on its table (floor piece, L × D m): felt hills, a tunnel, a station and a lift
 * tower with a sign to the SURFACE, an oval of track; the train (an engine and two cars) is separate.
 * Returns { obj, train: [engine, car, car] (groups, local tiles), track: { cx, cz, rx, rz, y } (local tiles) }.
 */
export function modelRailway(len = 1.5, dep = 0.85, seed = 51) {
  const L = vm(len), D = vm(dep), Ht = 30;
  const g = new VoxelGrid(L, Ht + 40, D), gl = new VoxelGrid(L, Ht + 40, D);
  const tw = wood(H.oakM, { axis: 'x', across: 'z', pw: 99, seed });
  for (const [x, z] of [[2, 2], [L - 5, 2], [2, D - 5], [L - 5, D - 5]]) g.box(x, 0, z, 3, Ht - 3, 3, H.oakD);
  g.box(0, Ht - 3, 0, L, 3, D, (x, y, z) => (x === 0 || z === 0 || x === L - 1 || z === D - 1 ? H.oakD : tw(x, y, z)));
  // felt ground, a hill with a tunnel through it at the back left, a pond
  const cx = L / 2, cz = D / 2, rx = L / 2 - 12, rz = D / 2 - 10;
  for (let z = 2; z < D - 2; z++) for (let x = 2; x < L - 2; x++) {
    const hill = Math.max(0, 16 - Math.hypot((x - L * 0.24) / 1.2, (z - D * 0.3) * 1.1) * 0.7);
    const hill2 = Math.max(0, 10 - Math.hypot(x - L * 0.78, z - D * 0.62) * 0.6);
    const h = Math.round(Math.max(hill, hill2));
    for (let y = 0; y <= h; y++) g.set(x, Ht + y, z, y === h ? (hash2(x >> 1, z >> 1, seed) < 0.1 ? 0x6a9a4a : 0x4a7a3a) : 0x6a5a3a);
    if (Math.hypot((x - L * 0.6) / 1.4, z - D * 0.3) < 5) g.set(x, Ht, z, 0x3a6a9a);
  }
  // the track: an oval of ties and two rails; carve the tunnel where it crosses the hill
  const track = (t) => [cx + Math.cos(t) * rx, cz + Math.sin(t) * rz];
  for (let k = 0; k < 360; k++) {
    const t = (k / 360) * Math.PI * 2, [x, z] = track(t), nx = Math.cos(t) / rx, nz = Math.sin(t) / rz, nl = Math.hypot(nx, nz);
    for (let y = Ht + 1; y < Ht + 12; y++) for (let w = -4; w <= 4; w++) g.clear(Math.round(x + (nx / nl) * w), y, Math.round(z + (nz / nl) * w));
    if (k % 3 === 0) for (let w = -3; w <= 3; w++) g.set(Math.round(x + (nx / nl) * w), Ht + 1, Math.round(z + (nz / nl) * w), 0x5a3a22);
    for (const w of [-2, 2]) g.set(Math.round(x + (nx / nl) * w), Ht + 2, Math.round(z + (nz / nl) * w), 0x9a9aa4);
  }
  // the tunnel mouths (stone arches) on the hill
  for (const t of [Math.PI * 1.08, Math.PI * 1.62]) { const [x, z] = track(t); for (let a = 0; a < 7; a++) { const ang = (a / 6) * Math.PI; g.set(Math.round(x + Math.cos(ang) * 5), Ht + 2 + Math.round(Math.sin(ang) * 6), Math.round(z), 0x8a8274); } }
  // the station and its lamp, the lift tower with its SURFACE sign, little trees
  g.box(Math.round(cx - 12), Ht + 1, D - 9, 24, 3, 6, 0x9a9284); g.box(Math.round(cx - 8), Ht + 4, D - 7, 16, 7, 4, 0xc8a870); g.box(Math.round(cx - 9), Ht + 11, D - 8, 18, 2, 6, 0x8a3a2a);
  gl.set(Math.round(cx + 10), Ht + 9, D - 6, 0xffd070);
  const tx = L - 16, tz = 10;
  for (const [ox, oz] of [[0, 0], [6, 0], [0, 6], [6, 6]]) g.box(tx + ox, Ht + 1, tz + oz, 1, 34, 1, 0x3a3a44);
  for (let y = Ht + 4; y < Ht + 34; y += 6) { g.box(tx, y, tz, 7, 1, 1, 0x3a3a44); g.box(tx, y, tz + 6, 7, 1, 1, 0x3a3a44); }
  g.box(tx - 2, Ht + 35, tz - 1, 11, 4, 2, 0xe8dcc0); for (let k = 0; k < 4; k++) g.set(tx - 1 + k * 2, Ht + 37, tz - 2, 0x2a2a2a); // SURFACE (in very small letters)
  gl.box(tx + 3, Ht + 39, tz + 3, 1, 1, 1, 0xffe080);
  for (let k = 0; k < 9; k++) {
    const x = 6 + hash2(k, 1, seed) * (L - 12), z = 4 + hash2(k, 2, seed) * (D - 8);
    const [txx, tzz] = [x, z];
    if (Math.abs(Math.hypot((txx - cx) / rx, (tzz - cz) / rz) - 1) < 0.18) continue;
    let base = Ht; while (g.filled(Math.round(x), base + 1, Math.round(z))) base++;
    g.box(Math.round(x), base + 1, Math.round(z), 1, 3, 1, 0x5a3a22);
    g.ellipsoid(x + 0.5, base + 6, z + 0.5, 2.4, 3.4, 2.4, k % 3 ? 0x2e6a3a : 0x5aa04a);
  }
  // the train: an engine (red, a brass dome, a lamp) and two cars, built round their own centres
  const car = (kind) => {
    const cg = new VoxelGrid(14, 12, 8), cgl = new VoxelGrid(14, 12, 8);
    cg.box(1, 1, 1, 12, 2, 6, 0x2a2a30);
    for (const x of [3, 10]) for (const z of [0, 7]) cg.box(x - 1, 0, z, 2, 2, 1, 0x1a1a1e);
    if (kind === 'engine') {
      cg.box(1, 3, 1, 8, 5, 6, 0xb83a2a); ring(cg, 5, 4, 0, 2.6, 3, 9, 0xb83a2a); cg.box(9, 3, 1, 4, 8, 6, 0x3a3a44); cg.box(9, 10, 0, 5, 1, 8, 0x2a2a30);
      cg.box(3, 9, 3, 2, 3, 2, 0x2a2a30); cg.box(6, 9, 3, 2, 2, 2, P.brass); cgl.set(0, 5, 4, 0xfff0a0);
    } else {
      cg.box(1, 3, 1, 12, 6, 6, kind === 'car' ? 0x3a6a4a : 0x6a4a8a); cg.box(1, 9, 0, 12, 1, 8, 0x2a2a30);
      for (let x = 3; x < 12; x += 3) cgl.set(x, 6, 0, 0xffe0a0), cgl.set(x, 6, 7, 0xffe0a0);
    }
    return group(M32(cg, [7, 0, 4]), G32(cgl, [7, 0, 4]));
  };
  const train = [car('engine'), car('car'), car('car2')];
  return { obj: group(M32(g, [L / 2, 0, D / 2]), G32(gl, [L / 2, 0, D / 2])), train, track: { cx: 0, cz: 0, rx: T(rx), rz: T(rz), y: T(Ht + 2) } };
}

/** The drafting table: a tilted board with the Surface Express drawn in white on blue, rulers, ink, a lamp. Returns { obj, lamp }. */
export function draftingTable(seed = 53) {
  const g = new VoxelGrid(64, 90, 50), gl = new VoxelGrid(64, 90, 50);
  const lw = beam(0x6a4a30, 'y', seed);
  for (const [x, z] of [[4, 8], [58, 8], [4, 40], [58, 40]]) g.box(x, 0, z, 3, z > 20 ? 34 : 44, 3, lw);
  g.box(4, 8, 10, 57, 2, 32, lw);
  // the board: tilted toward +z (the stool side)
  for (let z = 0; z < 36; z++) {
    const y = 46 - Math.round(z * 0.33);
    for (let x = 2; x < 62; x++) {
      const bx = x - 4, bz = z - 3;
      let c = 0x2a4a8a; // blueprint
      if (x < 4 || x > 59 || z < 3 || z > 33) c = 0x8a6a48;
      else {
        // the Surface Express in white lines: a long body, wheels, a funnel; a lift cage on the right
        if ((bz === 8 || bz === 18) && bx > 6 && bx < 36) c = 0xd8e8ff;
        if ((bx === 6 || bx === 36) && bz > 8 && bz < 18) c = 0xd8e8ff;
        for (const wx of [12, 22, 32]) if (Math.abs(Math.hypot(bx - wx, bz - 21) - 3) < 0.6) c = 0xd8e8ff;
        if (bx > 9 && bx < 13 && bz > 2 && bz < 8 && (bx === 10 || bx === 12)) c = 0xd8e8ff;
        if (bx > 42 && bx < 54 && (bz === 4 || bz === 26 || bx === 43 || bx === 53)) c = 0xb8d0f0;
        if (bx > 42 && bx < 54 && bz > 4 && bz < 26 && (bx - 43) % 3 === 0) c = 0x8aa8e0;
        if (bz === 30 && bx > 8 && bx < 50 && bx % 3) c = 0xa8c0f0; // writing
      }
      g.set(x, y, z, c);
      g.set(x, y - 1, z, 0x6a4a30);
    }
  }
  // a ruler, a set square, an ink pot and a pen, a little lamp clamped on
  for (let z = 10; z < 30; z++) g.set(48, 46 - Math.round(z * 0.33) + 1, z, 0xe8c060);
  g.box(16, 42, 20, 6, 2, 6, 0x1a1a2a); line(g, [[19, 44, 22], [24, 50, 18]], 0.4, 0xc8382a);
  line(g, [[60, 46, 2], [60, 70, 2], [52, 74, 8]], 0.8, 0x3a6a4a); ring(g, 52, 8, 0, 4, 70, 74, 0x3a6a4a); gl.box(50, 69, 6, 4, 1, 4, 0xfff0b0);
  // the stool
  ring(g, 32, 46, 0, 6, 26, 28, 0x8a5a32); for (const a of [0, 2.1, 4.2]) line(g, [[32 + Math.cos(a) * 7, 0, 46 + Math.sin(a) * 3], [32, 26, 46]], 0.7, 0x6a4a30);
  return { obj: group(M32(g, [32, 0, 25]), G32(gl, [32, 0, 25])), lamp: { x: T(20), y: T(68), z: T(-17) } };
}

/** The workbench against the wall: a vise, scattered tools, a pegboard of tools above, jars of screws, a clock in pieces. Returns { obj, lamp }. */
export function workbench(w = 1.5, seed = 55) {
  const W = vm(w), Ht = 38, D = 28;
  const g = new VoxelGrid(W + 4, 130, D + 4), gl = new VoxelGrid(W + 4, 130, D + 4);
  const x0 = 2;
  const tw = wood(0x7a5a3a, { axis: 'x', across: 'z', pw: 9, seed });
  g.box(x0, Ht - 4, 0, W, 4, D, (x, y, z) => (h3(x >> 1, y, z, seed) < 0.06 ? 0x3a2a1e : tw(x, y, z)));
  for (const x of [x0 + 1, x0 + W - 5]) for (const z of [1, D - 5]) g.box(x, 0, z, 4, Ht - 4, 4, beam(0x5a3a22, 'y', seed));
  g.box(x0 + 3, 8, 2, W - 6, 2, D - 4, tw);
  // drawers of odds on the low shelf: tins, a coil of wire, a box of springs
  for (let x = x0 + 6; x < x0 + W - 12; x += 14) { g.box(x, 10, 6, 10, 7, 14, (xx, y) => (y === 16 ? 0x8a8a92 : 0x5a5a64)); }
  // the vise at the left end
  g.box(x0 + 4, Ht, D - 10, 10, 6, 8, 0x3a5a7a); g.box(x0 + 2, Ht + 6, D - 10, 14, 3, 8, 0x3a5a7a); line(g, [[x0 + 9, Ht + 3, D - 2], [x0 + 9, Ht + 3, D + 2]], 0.6, 0x8a8a92);
  // tools on the bench: a hammer, a file, pliers, a clock in pieces with its gears
  line(g, [[x0 + 30, Ht, 10], [x0 + 44, Ht, 16]], 0.7, 0x8a5a32); g.box(x0 + 42, Ht, 14, 4, 2, 5, 0x5a5a64);
  line(g, [[x0 + 52, Ht, 8], [x0 + 64, Ht, 8]], 0.5, 0x7a7a84);
  const ck = x0 + W - 34;
  ring(g, ck, 14, 0, 7, Ht, Ht + 2, 0xe8dcc0); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.set(Math.round(ck + Math.cos(a) * 6), Ht + 2, Math.round(14 + Math.sin(a) * 6), 0x2a2a2a); }
  for (const [gx, gz, r] of [[ck + 14, 10, 3.4], [ck + 18, 18, 2.4], [ck + 10, 22, 2]]) ring(g, gx, gz, 0, r, Ht, Ht + 1, (x, y, z, a) => (Math.round(a * 3) % 2 ? P.brass : P.brassL));
  // jars of screws and nails
  for (let k = 0; k < 4; k++) jar(g, x0 + W - 12 - k * 7, Ht, 4, 2.6, 7, [0x8a8a92, 0xb87a3a, 0x6a6a72, 0xc8a050][k], 0x5a5a64, 0.6);
  // the pegboard above, with tools hanging on it
  const PB = 46;
  g.box(x0 + 6, Ht + 22, 0, W - 12, PB, 2, (x, y) => ((x + y) % 4 === 0 ? 0x8a6a48 : 0xa8865a));
  const tools = [[0, 'saw'], [1, 'hammer'], [2, 'pliers'], [3, 'square'], [4, 'wrench'], [5, 'file'], [6, 'brace'], [7, 'tongs']];
  const step = (W - 24) / tools.length;
  for (const [i, kind] of tools) {
    const tx = Math.round(x0 + 12 + i * step + step / 2), ty = Ht + 22 + PB - 8;
    g.box(tx, ty + 3, 2, 1, 1, 2, 0x5a5a64); // the peg
    if (kind === 'saw') g.box(tx - 3, ty - 24, 2, 7, 24, 1, (x, y) => (x === tx - 3 && y % 2 ? 0x6a6a72 : 0x9a9aa4));
    else if (kind === 'hammer') { line(g, [[tx, ty - 22, 3], [tx, ty, 3]], 0.6, 0x8a5a32); g.box(tx - 4, ty - 24, 2, 9, 3, 2, 0x4a4a54); }
    else if (kind === 'square') { g.box(tx - 6, ty - 16, 2, 2, 16, 1, 0x9a9aa4); g.box(tx - 6, ty - 16, 2, 12, 2, 1, 0x9a9aa4); }
    else line(g, [[tx, ty - 16 - (i % 3) * 3, 3], [tx, ty, 3]], 0.7, kind === 'wrench' ? 0x7a7a84 : kind === 'file' ? 0x5a5a64 : 0x6a6a72);
  }
  // a little brass lamp on an arm
  line(g, [[x0 + W - 8, Ht, 4], [x0 + W - 8, Ht + 30, 6], [x0 + W - 16, Ht + 34, 14]], 0.7, P.brassD);
  ring(g, x0 + W - 16, 14, 0, 4, Ht + 30, Ht + 34, P.brass); gl.box(x0 + W - 18, Ht + 29, 12, 4, 1, 4, 0xfff0b0);
  return { obj: group(M32(g, [(W + 4) / 2, 0, 0]), G32(gl, [(W + 4) / 2, 0, 0])), lamp: { x: T(x0 + W - 16 - (W + 4) / 2), y: T(Ht + 28), z: T(14) } };
}

/** The clockwork hen on her stand: brass feathers, gears showing, a big wind-up key. */
export function clockworkHen(seed = 57) {
  const g = new VoxelGrid(30, 48, 24), gl = new VoxelGrid(30, 48, 24);
  g.box(4, 0, 4, 22, 14, 16, (x, y, z) => (y === 13 ? 0x6a4a30 : 0x4a3020)); // the stand
  const br = (x, y, z) => (h3(x, y, z, seed) < 0.08 ? 0x6a9a82 : (y + x) % 5 === 0 ? P.brassL : P.brass);
  g.ellipsoid(15, 24, 12, 8, 7, 6, br);
  g.ellipsoid(21, 32, 12, 4, 4, 3.5, br); g.box(25, 31, 11, 3, 2, 2, 0xe8a030); g.box(20, 36, 11, 3, 3, 2, 0xc8382a);
  gl.set(23, 33, 9, 0x8af0ff); gl.set(23, 33, 14, 0x8af0ff); // its glass eyes
  for (let k = 0; k < 5; k++) line(g, [[9, 26 + k, 12], [3 - k * 0.3, 32 + k * 1.5, 12]], 0.6, br); // tail
  // an open panel on its side with the gears showing
  for (let y = 20; y < 28; y++) for (let x = 11; x < 19; x++) g.set(x, y, 18, 0x2a2a30);
  for (const [gx, gy, r] of [[13, 22, 2.2], [16, 25, 1.8]]) for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; g.set(Math.round(gx + Math.cos(an) * r), Math.round(gy + Math.sin(an) * r), 19, a % 2 ? P.brassL : P.brassD); }
  line(g, [[15, 24, 6], [15, 24, 0]], 0.6, P.brassD); g.box(13, 22, 0, 5, 5, 1, P.brass); // the key
  for (const x of [12, 17]) line(g, [[x, 14, 12], [x, 18, 12]], 0.5, P.brassD);
  return { obj: group(M32(g, [15, 0, 12]), G32(gl, [15, 0, 12])) };
}

/**
 * The loft: a timber gallery along the wall (w × d m, its deck h m up) with a railing, a ladder up
 * to it, crates, a rolled map, a hammock slung under the eaves and a lamp. Wall piece (deck out
 * toward +z). Returns { obj, lamp, posts: [{ x, z }] (local tiles, for collision) }.
 */
export function loftGallery(w = 2.2, d = 0.9, h = 1.95, seed = 59) {
  const W = vm(w), D = vm(d), Hh = vm(h);
  const g = new VoxelGrid(W + 4, Hh + 70, D + 30), gl = new VoxelGrid(W + 4, Hh + 70, D + 30);
  const pw = beam(0x5a3a22, 'y', seed);
  const posts = [];
  for (const x of [2, W - 2]) { g.box(x - 2, 0, D - 4, 5, Hh + 30, 5, pw); posts.push({ x: T(x - (W + 4) / 2), z: T(D - 1.5) }); }
  // the deck: joists and boards
  g.box(0, Hh - 6, 0, W + 4, 6, D, (x, y, z) => (y === Hh - 6 ? mulc(0x5a3a22, 0.8) : wood(0x7a5a38, { axis: 'z', across: 'x', pw: 8, seed })(x, y, z)));
  g.box(0, Hh - 10, D - 4, W + 4, 4, 4, pw); // the beam under its edge
  // the railing
  g.box(0, Hh + 26, D - 3, W + 4, 3, 3, pw);
  for (let x = 2; x < W + 2; x += 8) g.box(x, Hh, D - 2, 2, 26, 2, mulc(0x6a4a2a, 1));
  // the ladder up, leaning at the right end, in front of the deck
  const lx = W - 18;
  for (const ox of [0, 14]) line(g, [[lx + ox, 0, D + 22], [lx + ox, Hh + 8, D - 2]], 1, 0x7a5a38);
  for (let k = 1; k < 9; k++) { const t = k / 9; const y = t * (Hh + 8), z = D + 22 - t * 24; g.box(lx, Math.round(y), Math.round(z), 15, 2, 2, 0x8a6a48); }
  // crates, a chest and a rolled map up there, a hammock under the eaves
  for (const [x, s, c] of [[10, 22, 0x8a6a48], [34, 18, 0x7a5a3a], [56, 16, 0x9a7a52]]) if (x + s < W - 20) {
    g.box(x, Hh, 6, s, s, s, (xx, y, z) => (xx === x || y === Hh || xx === x + s - 1 || y === Hh + s - 1 || z === 6 || z === 5 + s ? mulc(c, 0.75) : c));
    g.box(x + 3, Hh + 4, 5 + s, s - 6, 3, 1, 0xe8dcc0); // a stencilled label
  }
  line(g, [[W - 40, Hh + 4, 10], [W - 22, Hh + 4, 14]], 2, 0xe8dcc0);
  const hs = sag([4, Hh + 60, 3], [W, Hh + 60, 3], 16, 18);
  for (let i = 0; i < hs.length; i++) for (let dz = 0; dz < 14; dz++) g.set(Math.round(hs[i][0]), Math.round(hs[i][1]), 3 + dz, (i + dz) % 4 ? 0xd8c090 : 0xb84a3a);
  candle(g, gl, W - 8, Hh, 6, 7);
  return { obj: group(M32(g, [(W + 4) / 2, 0, 0]), G32(gl, [(W + 4) / 2, 0, 0])), lamp: { x: T(W - 8 - (W + 4) / 2), y: T(Hh + 10), z: T(6) }, posts, deckH: T(Hh), depth: T(D) };
}

/** A red tool chest on castors with its drawers half open. */
export function toolChest(seed = 61) {
  const g = new VoxelGrid(36, 40, 24);
  g.box(2, 3, 2, 32, 34, 20, (x, y, z) => (z === 21 && y % 8 === 0 ? 0x5a1a14 : (x === 2 || x === 33) ? 0x7a2a1e : 0xa83a2a));
  for (let k = 0; k < 4; k++) { const y = 6 + k * 8; g.box(4, y, 21 + (k === 1 ? 4 : 0), 28, 6, k === 1 ? 4 : 1, 0xb84a3a); g.box(14, y + 2, 22 + (k === 1 ? 4 : 0), 8, 2, 1, 0xc8c8d0); }
  for (let x = 6; x < 30; x += 4) g.set(x, 13, 25, 0x8a8a92); // spanners in the open drawer
  for (const [x, z] of [[4, 4], [30, 4], [4, 18], [30, 18]]) g.box(x, 0, z, 2, 3, 2, 0x2a2a30);
  g.box(10, 37, 10, 16, 2, 4, 0x2a2a30);
  return M32(g, [18, 0, 12]);
}

// ---------------------------------------------------------------- the larder
/** A rack of cheese wheels on slatted shelves (wall piece): one cut open, a wire and a knife. */
export function cheeseRack(w = 0.9, h = 1.5, seed = 71) {
  const W = vm(w), Hh = vm(h), D = 22;
  const g = new VoxelGrid(W + 4, Hh + 4, D + 2);
  const x0 = 2;
  for (const x of [x0, x0 + W - 3]) g.box(x, 0, 0, 3, Hh, D, beam(0x7a5a3a, 'y', seed));
  const ys = [8, Math.round(Hh * 0.38), Math.round(Hh * 0.66), Hh - 6];
  const rng = makeRng(seed);
  for (const [i, y] of ys.entries()) {
    for (let z = 0; z < D; z += 4) g.box(x0 + 3, y, z, W - 6, 2, 3, 0x9a7a52);
    if (i === ys.length - 1) continue;
    let x = x0 + 5;
    while (x < x0 + W - 22) {
      const r = 7 + rng() * 3, hh = 6 + rng() * 3, kind = Math.floor(rng() * 4);
      const col = [0xe8c050, 0xd8a03a, 0xe0d8b8, 0xc8682a][kind], rind = [0xc8a038, 0xb8802a, 0xb8b090, 0x9a4a1e][kind];
      const cx = x + r, cz = D / 2;
      for (let yy = 0; yy < hh; yy++) ring(g, cx, cz, 0, r, y + 2 + yy, y + 3 + yy, (xx, y2, zz) => {
        const d = Math.hypot(xx + 0.5 - cx, zz + 0.5 - cz);
        if (kind === 2 && d < r - 1 && h3(xx, y2, zz, seed) < 0.15) return 0x3a5a7a; // blue veins
        return d > r - 1.2 || yy === 0 || yy === Math.floor(hh) - 1 ? rind : col;
      });
      if (rng() < 0.3) for (let yy = 0; yy < hh; yy++) for (let xx = Math.round(cx); xx < cx + r; xx++) for (let zz = Math.round(cz); zz < cz + r; zz++) g.clear(xx, y + 2 + yy, zz); // a wedge gone
      x += r * 2 + 2;
    }
  }
  line(g, [[x0 + W - 18, ys[0] + 2, D - 4], [x0 + W - 6, ys[0] + 2, D - 6]], 0.5, 0xb8b8c0); g.box(x0 + W - 22, ys[0] + 2, D - 5, 5, 1, 2, 0x5a3a22);
  return M32(g, [(W + 4) / 2, 0, 0]);
}

/** Barrels lying on a cradle (floor piece along a wall, n barrels), taps in their ends, chalk on their bellies. */
export function barrelCradle(n = 3, seed = 73) {
  const R = 13, L = 30, gap = 4;
  const W = n * (R * 2 + gap) + 6;
  const g = new VoxelGrid(W, R * 2 + 12, L + 12);
  for (const z of [5, L + 3]) g.box(0, 0, z, W, 7, 4, beam(0x5a3a22, 'x', seed));
  for (let k = 0; k < n; k++) {
    const cx = 3 + R + k * (R * 2 + gap), cy = 6 + R;
    for (let z = 0; z < L; z++) {
      const bulge = R * (1 - ((z - L / 2) / (L / 2)) ** 2 * 0.12);
      for (let y = Math.floor(cy - bulge); y <= cy + bulge; y++) for (let x = Math.floor(cx - bulge); x <= cx + bulge; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > bulge) continue;
        if (d < bulge - 1.5 && z > 1 && z < L - 2) continue;
        let c = mulc(0x8a5a32, 0.85 + Math.floor(hash2(Math.floor(Math.atan2(y - cy, x - cx) * 4), k, seed) * 4) * 0.06);
        if (z === 5 || z === L - 6 || z === 1 || z === L - 2) c = 0x3a3a44; // hoops
        if (z === 0 || z === L - 1) c = mulc(0x7a4a2a, 0.9);
        g.set(x, y, z + 6, c);
      }
    }
    g.box(cx - 1, cy - 4, L + 6, 3, 3, 4, P.brass); g.set(cx, cy - 6, L + 8, P.brassD); // the tap
    for (let j = 0; j < 5; j++) g.set(cx - 2 + j, cy + R - 1, 6 + L / 2, 0xe8e4dc); // chalk: CIDER
  }
  return M32(g, [W / 2, 0, (L + 12) / 2]);
}

/** A pole hung from the beams with hams, strings of sausages, garlic and onion plaits, herbs (origin at the pole's middle). */
export function hangingRack(len = 1.6, seed = 75) {
  const L = vm(len);
  const g = new VoxelGrid(L + 4, 60, 20);
  const rng = makeRng(seed);
  g.box(0, 52, 8, L + 4, 3, 3, 0x6a4a2a);
  for (const x of [6, L - 2]) line(g, [[x, 55, 9], [x, 60, 9]], 0.4, 0x8a7a5a);
  let x = 6;
  while (x < L - 4) {
    const k = rng();
    if (k < 0.25) { line(g, [[x, 52, 9], [x, 44, 9]], 0.3, 0xc8a878); g.ellipsoid(x, 34, 9, 5, 10, 5, (xx, y) => (y > 40 ? 0xc87a5a : y < 26 ? 0xe8d0b0 : 0xa8503a)); x += 13; }
    else if (k < 0.5) { const s = sag([x, 52, 9], [x + 10, 52, 9], 8, 14); for (const p of s) g.ellipsoid(p[0], p[1] - 2, 9, 1.6, 2.4, 1.6, 0x8a2a1e); x += 13; }
    else if (k < 0.75) { for (let j = 0; j < 7; j++) g.ellipsoid(x + (j % 2), 50 - j * 3.2, 9 + (j % 2), 2.4, 1.8, 2.4, rng() < 0.5 ? 0xf0e8d8 : 0xe8dcc8); x += 7; }
    else { for (let j = 0; j < 6; j++) g.ellipsoid(x + (j % 2) * 2, 49 - j * 3.4, 9, 2.6, 2.2, 2.6, j % 2 ? 0xb8702a : 0xc8883a); line(g, [[x + 1, 52, 9], [x + 1, 30, 9]], 0.4, 0x6a8a3a); x += 8; }
  }
  return M32(g, [(L + 4) / 2, 60, 10]);
}

/** Bins of roots along a wall: carrots, tubers, and turnips that glow a little (wall piece). */
export function rootBins(w = 1.2, seed = 77) {
  const W = vm(w), Ht = 26, D = 26;
  const g = new VoxelGrid(W + 4, Ht + 10, D + 2), gl = new VoxelGrid(W + 4, Ht + 10, D + 2);
  const n = 3, bw = Math.floor((W - 4) / n);
  const rng = makeRng(seed);
  for (let b = 0; b < n; b++) {
    const x0 = 2 + b * bw;
    g.box(x0, 0, 0, bw - 1, Ht, D, (x, y, z) => {
      const e = Math.min(x - x0, bw - 2 - (x - x0), z, D - 1 - z);
      if (e > 1 && y > 2) return -1;
      return (y % 6 === 0 ? 0x5a3a22 : 0x7a5232);
    });
    for (let k = 0; k < 26; k++) {
      const x = x0 + 4 + rng() * (bw - 8), z = 4 + rng() * (D - 8), y = Ht - 6 + rng() * 6;
      if (b === 0) { line(g, [[x, y, z], [x + 4, y - 2, z + 1]], 1.2, 0xe8702a); g.set(Math.round(x) - 1, Math.round(y) + 1, Math.round(z), 0x5aa04a); }
      else if (b === 1) g.ellipsoid(x, y, z, 2.6, 2, 2.2, rng() < 0.5 ? 0x9a7a52 : 0x8a6a4a);
      else { gl.ellipsoid(x, y, z, 2.4, 2.4, 2.4, rng() < 0.5 ? 0xd8a0ff : 0xe8c8ff); g.set(Math.round(x), Math.round(y) + 3, Math.round(z), 0x5aa04a); }
    }
  }
  return { obj: group(M32(g, [(W + 4) / 2, 0, 0]), G32(gl, [(W + 4) / 2, 0, 0])) };
}

/** An ice chest, its lid propped open: blocks of ice glowing faintly blue, two fish on top. */
export function iceChest(seed = 79) {
  const g = new VoxelGrid(50, 50, 32), gl = new VoxelGrid(50, 50, 32);
  g.box(2, 0, 4, 46, 24, 26, (x, y, z) => (x === 2 || x === 47 || z === 4 || z === 29 || y === 0 ? 0x6a8a9a : -1));
  g.box(2, 22, 4, 46, 2, 26, (x, y, z) => (x === 2 || x === 47 || z === 4 || z === 29 ? 0x8aa8b8 : -1));
  for (const x of [3, 45]) for (const z of [5, 27]) g.box(x, 0, z, 2, 24, 2, 0x4a6a7a);
  // the lid, propped up against the wall behind
  for (let k = 0; k < 26; k++) g.box(2, 24 + k, 4 - Math.round(k * 0.15), 46, 1, 2, 0x6a8a9a);
  for (let x = 6; x < 44; x += 9) for (let z = 8; z < 26; z += 8) gl.box(x, 14, z, 7, 8, 6, (xx, y, zz) => (h3(xx, y, zz, seed) < 0.2 ? 0xe8f8ff : 0x9ad8f0));
  for (const fx of [14, 30]) { g.ellipsoid(fx, 23, 16, 7, 2, 3, 0x8a9aaa); g.box(fx + 7, 23, 15, 3, 1, 3, 0x7a8a9a); }
  return { obj: group(M32(g, [25, 0, 16]), G32(gl, [25, 0, 16])) };
}

/** Logs stacked with shelf mushrooms growing out of them (some glowing). */
export function mushroomLogs(seed = 81) {
  const g = new VoxelGrid(70, 34, 30), gl = new VoxelGrid(70, 34, 30);
  const rng = makeRng(seed);
  for (const [cy, cz, r] of [[7, 8, 7], [7, 22, 7], [19, 15, 7]]) {
    for (let x = 4; x < 66; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
      const d = Math.hypot(y + 0.5 - cy, z + 0.5 - cz);
      if (d > r) continue;
      g.set(x, y, z, x === 4 || x === 65 ? (Math.floor(d) % 2 ? 0xc8a070 : 0xa8804a) : d > r - 1.2 ? (h3(x, y, z, seed) < 0.2 ? 0x4a3a2a : 0x5a4030) : 0x8a6a40);
    }
    for (let k = 0; k < 6; k++) {
      const x = 8 + rng() * 54, a = rng() * Math.PI, y = cy + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const glow = rng() < 0.5;
      for (let j = 0; j < 3; j++) (glow ? gl : g).box(Math.round(x - 3 + j), Math.round(y - j * 0.5), Math.round(z + Math.cos(a) * 2), 6 - j * 2, 1, 3, glow ? (j ? 0x8af0d0 : 0x3ab0a0) : (j ? 0xe8c890 : 0xb8885a));
    }
  }
  return { obj: group(M32(g, [35, 0, 15]), G32(gl, [35, 0, 15])) };
}

/** A mouse hole low in the wall (wall piece) and a trap before it with a note on it: NUGGET, NO. */
export function mouseHole(seed = 83) {
  const g = new VoxelGrid(30, 16, 22);
  for (let y = 0; y < 9; y++) for (let x = 6; x < 18; x++) if (Math.hypot(x + 0.5 - 12, y * 1.2) < 6) g.set(x, y, 0, 0x0a0806);
  g.box(10, 0, 12, 10, 1, 6, 0x9a7a52); line(g, [[11, 1, 13], [19, 1, 13]], 0.3, 0x9a9aa4); g.box(14, 1, 15, 2, 1, 2, 0xe8c050);
  g.box(20, 0, 8, 7, 1, 6, 0xf0e8d0); for (let x = 21; x < 26; x++) g.set(x, 1, 10, 0x3a2a22);
  return M32(g, [15, 0, 0]);
}
