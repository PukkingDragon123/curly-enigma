// The few things in Old Star's small cave that aren't in the other prop files: your bedroll on the
// floor (straw under a rough wool blanket and a sack pillow), his old fleece by the forge where he
// sleeps, the stump he sits on by the fire, old timber shoring propping the rock, a flat stone by
// your bedroll with the notebook (your Index Book) and a stub of candle, your little trunk, his
// notes nailed straight to the rock, a peg board of tools, the slate on a crate that is his
// Miners' Board, and the loose earth heaped under a chalk-marked soft wall. Conventions as
// caveProps.js: tile units; floor pieces centred at their foot, front toward +z; wall pieces have x
// along the wall, origin on the wall at the floor, +z out of it. Size-based voxels: the bedroll, the
// fleece, the stump and the timbers at 1/32 m, the small things (notebook, quill, tools, papers) at 1/64 m.
import * as THREE from 'three';
import { VoxelGrid, line, M32, G32, group, mulc, mixc, h3, S32, S16, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P, notesPins } from './tavernProps.js';
import { crate } from '../iso/props.js';

const T = (v) => v * S32; // 1/64 m voxels → tiles
const T2 = (v) => v * S16; // 1/32 m voxels → tiles
const STRAW = [0xb8984e, 0xa8883e, 0x9a7a36, 0xc8a85a, 0x8a7038];
const WOOL = [0x6e6252, 0x625646, 0x7a6c5a, 0x584c40];
const SACK = [0x9a8a64, 0x8a7a58, 0xa89a72];
const GREYWOOD = [0x7a7468, 0x6e695f, 0x857c6c, 0x625d55];

/**
 * Your bedroll (1/32 m): a long low heap of straw on the floor, a rough wool blanket thrown over it
 * (rumpled, darned, a red patch, turned back at the head), and a sack stuffed with straw for a
 * pillow. Along z, the head at -z. Returns { obj, lie { x, y, z } (the pillow's top, local tiles),
 * head, foot (local z, tiles), hw, hd (half sizes, m) }.
 */
export function bedroll(seed = 301) {
  const W = 15, L = 46;
  const g = new VoxelGrid(W + 4, 12, L + 4);
  const ox = 2, oz = 2;
  // straw: a mattress-shaped heap, spilling out at the edges
  for (let z = -1; z <= L; z++) for (let x = -1; x <= W; x++) {
    const ex = Math.abs(x + 0.5 - W / 2) / (W / 2), ez = Math.abs(z + 0.5 - L / 2) / (L / 2);
    const e = Math.max(ex ** 3, ez ** 4);
    const spill = h3(x >> 1, 0, z >> 1, seed) < 0.35 ? 0.25 : 0;
    if (e > 1 + spill) continue;
    const h = Math.max(1, Math.round((1 - Math.min(1, e) * 0.7) * 3.4 + h3(x >> 1, 1, z >> 1, seed) * 1.2));
    for (let y = 0; y < h; y++) g.set(x + ox, y, z + oz, STRAW[Math.floor(hash2(x * 3 + y, z, seed) * STRAW.length)]);
  }
  // the blanket: rumpled wool over most of it, the top quarter turned back
  const fold = 12;
  for (let z = fold; z < L - 1; z++) for (let x = 1; x < W - 1; x++) {
    const rump = Math.round(1.2 * Math.sin(z * 0.45 + x * 0.12) * Math.sin(x * 0.6 + seed) + (h3(x >> 2, 2, z >> 2, seed) < 0.3 ? 1 : 0));
    const edge = x <= 1 || x >= W - 2 || z >= L - 2;
    const y0 = 3 + Math.max(0, rump) - (edge ? 1 : 0);
    let c = WOOL[Math.floor(h3(x >> 1, 3, z >> 1, seed) * WOOL.length)];
    if ((z - fold) % 9 === 0) c = mulc(c, 0.82); // woven stripes
    if (x > 8 && x < 13 && z > 26 && z < 33) c = (x + z) % 4 === 0 ? 0x6a2a22 : 0x8a3a2e; // a red patch, stitched on
    if (x === 5 && z > 18 && z < 30 && z % 2) c = 0x3e3a34; // a darn
    if (edge && h3(x, 4, z, seed) < 0.3) continue; // frayed
    g.set(x + ox, y0, z + oz, c);
    if (edge) g.set(x + ox, y0 - 1, z + oz, mulc(c, 0.8));
  }
  // the turned-back fold
  for (let x = 1; x < W - 1; x++) for (const [z, y] of [[fold, 5], [fold - 1, 5], [fold - 2, 4]]) g.set(x + ox, y, z + oz, mulc(WOOL[(x >> 2) % 4], z === fold - 2 ? 0.85 : 1.06));
  // the sack pillow: a lumpy bolster at the head, tied at one end
  for (let z = 1; z < 9; z++) for (let x = 2; x < W - 2; x++) for (let y = 3; y < 8; y++) {
    const e = ((x + 0.5 - W / 2) / (W / 2 - 1.5)) ** 2 + ((y - 4.6) / 2.6) ** 2 + ((z - 4.8) / 4.2) ** 4;
    if (e > 1) continue;
    let c = SACK[Math.floor(h3(x >> 1, y, z >> 1, seed + 5) * 3)];
    if ((x + y) % 7 === 0) c = mulc(c, 0.86); // the weave
    if (y >= 6 && x > 4 && x < 10 && z > 3 && z < 7) c = mulc(c, 0.84); // the dent of a head
    g.set(x + ox, y, z + oz, c);
  }
  for (let y = 4; y < 7; y++) g.set(ox + 2, y, oz + 5, 0x5a4a34); // the tie
  // a few straws poking out from under it all
  for (let k = 0; k < 14; k++) {
    const x = Math.floor(h3(k, 1, 9, seed) * (W + 2)) - 1, z = Math.floor(h3(k, 2, 9, seed) * L);
    const dx = x < W / 2 ? -1 : 1;
    for (let s = 0; s < 3; s++) g.set(Math.max(0, Math.min(W + 3, x + ox + dx * s)), 0, z + oz + (k % 2), STRAW[k % 5]);
  }
  const obj = M32(g, [W / 2 + ox, 0, L / 2 + oz], { scale: S16 });
  return { obj, lie: { x: 0, y: T2(8), z: T2(5 - L / 2) }, head: T2(5 - L / 2), foot: T2(L / 2 - 4), hw: W / 64, hd: L / 64 };
}

/**
 * Old Star's sleeping place by the forge (1/32 m): a grey fleece gone flat and yellow at the edges
 * over a thin layer of straw, a cushion with a patch for his head. Along x, the head at -x. Returns
 * { obj, lie { x, y, z } (local tiles: his head), foot { x, z } }.
 */
export function pelt(seed = 303) {
  const L = 42, W = 22;
  const g = new VoxelGrid(L + 4, 8, W + 4);
  for (let z = 0; z < W; z++) for (let x = 0; x < L; x++) {
    const ex = (x + 0.5 - L / 2) / (L / 2), ez = (z + 0.5 - W / 2) / (W / 2);
    const lobe = 0.85 + 0.15 * Math.sin(Math.atan2(ez, ex) * 4 + seed);
    const e = Math.hypot(ex, ez) / lobe;
    if (e > 1) continue;
    g.set(x + 2, 0, z + 2, STRAW[Math.floor(hash2(x, z, seed) * 5)]);
    const tuft = h3(x >> 1, 1, z >> 1, seed) < 0.4 ? 1 : 0;
    let c = e > 0.82 ? (h3(x, 2, z, seed) < 0.5 ? 0x9a9078 : 0x8a8068) : (h3(x >> 1, 3, z >> 1, seed) < 0.5 ? 0xb8b0a0 : 0xa8a090);
    if (e < 0.82 && h3(x, 4, z, seed) < 0.12) c = 0xc8c0b0;
    g.set(x + 2, 1, z + 2, c);
    if (tuft && e < 0.9) g.set(x + 2, 2, z + 2, mulc(c, 1.05));
  }
  // the cushion at the head (-x)
  for (let x = 3; x < 12; x++) for (let z = 5; z < W - 3; z++) for (let y = 2; y < 6; y++) {
    const e = ((x - 7.5) / 4.5) ** 2 + ((z + 0.5 - W / 2) / ((W - 8) / 2)) ** 2 + ((y - 3) / 2.6) ** 2;
    if (e > 1) continue;
    g.set(x + 2, y, z + 2, x > 6 && x < 10 && z > W / 2 && z < W / 2 + 4 ? 0x6a5a8a : (x + z) % 5 === 0 ? 0x7a3a2a : 0x8a4434);
  }
  const obj = M32(g, [L / 2 + 2, 0, W / 2 + 2], { scale: S16 });
  return { obj, lie: { x: T2(7.5 - L / 2), y: T2(4), z: 0 }, foot: { x: T2(L / 2 - 5), z: 0 } };
}

/** The stump Old Star sits on by the fire, an old sack folded on top (1/32 m). Returns { obj, seats }. */
export function stumpSeat(seed = 305) {
  const R = 8, H = 13;
  const g = new VoxelGrid(R * 2 + 6, H + 3, R * 2 + 6);
  const c0 = R + 3;
  for (let y = 0; y < H; y++) for (let z = 0; z < R * 2 + 6; z++) for (let x = 0; x < R * 2 + 6; x++) {
    const a = Math.atan2(z - c0, x - c0), d = Math.hypot(x + 0.5 - c0, z + 0.5 - c0);
    const rr = R + (y < 3 ? 1.6 * Math.max(0, Math.cos(a * 3 + seed)) * (3 - y) / 3 : 0) + 0.5 * Math.sin(a * 7 + y * 0.3);
    if (d > rr) continue;
    let c = d > rr - 1.4 ? (h3(Math.floor(a * 4), y >> 1, 0, seed) < 0.3 ? 0x4a3a2a : 0x5a4632) : 0x8a6a48;
    if (y === H - 1) c = Math.round(d) % 3 === 0 ? 0x7a5a3a : 0x9a7a52; // the rings, worn smooth
    g.set(x, y, z, c);
  }
  // a sack folded on top, a corner hanging over
  for (let z = c0 - 6; z < c0 + 5; z++) for (let x = c0 - 6; x < c0 + 6; x++) g.set(x, H, z, SACK[(x + z) % 3]);
  for (let y = H - 4; y <= H; y++) g.set(c0 + 6, y, c0 - 1 + (H - y > 2 ? 1 : 0), SACK[1]);
  const obj = M32(g, [c0, 0, c0], { scale: S16 });
  return { obj, seats: [{ x: 0, z: 0, y: T2(H + 1), yaw: 0 }] };
}

/**
 * Old timber shoring against the rock (1/32 m): two squared posts gone grey and split, adze marks,
 * iron dogs, a cap beam across their heads wedged up against the roof. A wall piece: x along the
 * wall (span w m), h m tall. Returns a mesh.
 */
export function shoring(w = 1.2, h = 1.5, seed = 307) {
  const W = Math.round(w * 32), H = Math.round(h * 32), PW = 5;
  const g = new VoxelGrid(W + 6, H + 4, 9);
  const wood = (x, y, z, k) => { let c = GREYWOOD[Math.floor(h3(x >> 1, y >> 2, z, seed + k) * 4)]; if ((y + k * 3) % 11 === 0) c = mulc(c, 0.84); if (h3(x, y, z, seed + 9) < 0.03) c = 0x4a443c; return c; };
  for (const [px, k] of [[2, 1], [W - PW + 1, 2]]) {
    for (let y = 0; y < H - 4; y++) for (let x = 0; x < PW; x++) for (let z = 1; z < 7; z++) {
      if ((x === 0 || x === PW - 1) && (z === 1 || z === 6) && h3(x, y >> 2, z, seed) < 0.6) continue; // the arrises, rounded off by years
      if (x === 2 && z === 6 && (y + k * 5) % 17 < 6) { g.set(px + x, y, z, 0x3a342c); continue; } // a split down the face
      g.set(px + x, y, z, wood(x, y, z, k));
    }
    for (let x = -1; x <= PW; x++) for (let z = 0; z < 8; z++) g.set(px + x, 0, z, mulc(0x5a5048, 0.9)); // its sill, rotting
  }
  // the cap beam across, and the wedges driven in over it
  for (let y = H - 4; y < H; y++) for (let x = 0; x < W + 6; x++) for (let z = 1; z < 8; z++) {
    if ((x === 0 || x === W + 5) && h3(y, z, x, seed) < 0.5) continue;
    g.set(x, y, z, wood(x, y, z, 3));
  }
  for (const wx of [Math.round(W * 0.3), Math.round(W * 0.7)]) for (let k = 0; k < 4; k++) g.set(wx + k, H, 3, 0x8a6a42), g.set(wx + k, H + (k < 2 ? 1 : 0), 4, 0x7a5a38);
  // iron dogs over the joints, nail heads
  for (const px of [2, W - PW + 1]) for (let y = H - 7; y < H - 1; y++) g.set(px + 2, y, 7, y === H - 7 || y === H - 2 ? 0x3a3a42 : 0x5a4a44);
  return M32(g, [W / 2 + 3, 0, 0], { scale: S16 });
}

/** One prop post with a head board pressed to the roof (1/32 m), h m tall: a floor piece. */
export function propPost(h = 1.5, seed = 309) {
  const H = Math.round(h * 32);
  const g = new VoxelGrid(14, H + 2, 14);
  for (let y = 0; y < H - 3; y++) for (let x = 4; x < 10; x++) for (let z = 4; z < 10; z++) {
    if ((x === 4 || x === 9) && (z === 4 || z === 9)) continue;
    let c = GREYWOOD[Math.floor(h3(x, y >> 2, z, seed) * 4)];
    if (y % 13 === 0) c = mulc(c, 0.85);
    g.set(x, y, z, c);
  }
  for (let y = H - 3; y < H; y++) for (let x = 0; x < 14; x++) for (let z = 3; z < 11; z++) g.set(x, y, z, GREYWOOD[(x + y) % 4]);
  g.box(3, 0, 3, 8, 2, 8, 0x5a5048);
  return M32(g, [7, 0, 7], { scale: S16 });
}

/**
 * A flat stone by your bedroll (1/64 m): a slab propped on two rocks, your notebook open on it (the
 * Index Book), a quill in a pot of ink, a stub of candle in a puddle of wax. Returns { obj, flame (local tiles) }.
 */
export function stoneLedge(seed = 311) {
  const W = 30, D = 22, H = 22;
  const g = new VoxelGrid(W, H + 14, D), gl = new VoxelGrid(W, H + 14, D);
  // the two rocks and the slab
  for (const [cx, r] of [[6, 5.5], [W - 7, 6]]) for (let y = 0; y < H - 5; y++) for (let z = 3; z < D - 3; z++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x + 0.5 - cx) / r, (z + 0.5 - D / 2) / 7, (y - (H - 6) / 2) / ((H - 4) / 2));
    if (d < 1) g.set(x, y, z, mulc([0x5a5650, 0x4e4a44, 0x66625a][Math.floor(h3(x >> 1, y >> 1, z >> 1, seed) * 3)], 0.9 + 0.1 * (y / H)));
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if ((x === 0 || x === W - 1) && (z === 0 || z === D - 1)) continue;
    const top = H - 5 + (h3(x >> 2, 0, z >> 2, seed) < 0.3 ? 1 : 0);
    for (let y = H - 6; y < top; y++) g.set(x, y, z, y === top - 1 ? (h3(x, y, z, seed) < 0.5 ? 0x77736a : 0x6c685f) : 0x56524a);
  }
  const Y = H - 4;
  // the notebook, open: two pages of writing, a leather spine and cover showing at the edges
  for (let z = 6; z < 17; z++) for (let x = 3; x < 19; x++) {
    const cover = x === 3 || x === 18 || z === 6 || z === 16;
    const spine = x === 10 || x === 11;
    let c = cover ? 0x5a3424 : spine ? 0x7a5a3a : 0xe8dcc0;
    if (!cover && !spine && z % 2 === 0 && z > 7 && z < 15 && h3(x, 0, z, seed + 3) < 0.65) c = 0x4a4a5a; // lines of writing
    if (x === 15 && z > 8 && z < 12) c = 0x8a3a2e; // something underlined in red
    g.set(x, Y + (spine ? 0 : 1), z, c);
    if (cover) g.set(x, Y, z, 0x4a2a1c);
  }
  // the ink pot and the quill
  for (let y = 0; y < 4; y++) for (let z = 13; z < 18; z++) for (let x = 21; x < 26; x++) if (Math.hypot(x - 23, z - 15.5) < 2.4) g.set(x, Y + y, z, y === 3 ? 0x1a1a2a : 0x2a3a4a);
  line(g, [[23, Y + 3, 15], [20, Y + 12, 11]], 0.5, 0xd8d0c0);
  line(g, [[21, Y + 9, 12], [19, Y + 13, 10]], 0.9, (x, y) => (y % 2 ? 0xe8e0d0 : 0xc8c0b0));
  // the candle stub in its wax
  for (let z = 3; z < 9; z++) for (let x = 21; x < 28; x++) if (Math.hypot(x - 24.5, z - 6) < 3.2) g.set(x, Y, z, 0xe8dcb8);
  g.box(23, Y + 1, 5, 3, 5, 2, 0xf0e4c4);
  g.set(24, Y + 6, 5, 0x2a2a2a);
  gl.set(24, Y + 7, 5, 0xffd070); gl.set(24, Y + 8, 5, 0xffb040);
  const obj = group(M32(g, [W / 2, 0, D / 2]), G32(gl, [W / 2, 0, D / 2]));
  return { obj, flame: { x: T(24.5 - W / 2), y: T(Y + 8), z: T(5.5 - D / 2) }, top: T(Y + 1) };
}

/** Your little trunk (1/64 m): a battered box with tin corners, a rope handle, "MINE" chalked on the lid. */
export function tinTrunk(seed = 313) {
  const W = 30, D = 20, H = 18;
  const g = new VoxelGrid(W, H + 3, D);
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const shell = x === 0 || x === W - 1 || z === 0 || z === D - 1 || y === 0 || y === H - 1;
    if (!shell) continue;
    let c = [0x6a4a2e, 0x5e4228, 0x765236][Math.floor(h3(x >> 3, y >> 1, z, seed) * 3)];
    if (y === 11) c = 0x3e2a1a; // the lid's seam
    const corner = (x < 3 || x > W - 4) && (z < 3 || z > D - 4);
    if (corner || ((y < 3 || y > H - 4) && (x < 3 || x > W - 4))) c = h3(x, y, z, seed) < 0.3 ? 0x7a6a5a : 0x9a948a; // tin corners
    if (z === D - 1 && x > 12 && x < 17 && y > 7 && y < 12) c = 0x8a7a5a; // the hasp
    g.set(x, y, z, c);
  }
  // the lid bows up a little; MINE chalked on it
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) g.set(x, H, z, (x > 3 && x < W - 4 && z > 2 && z < D - 3) ? 0x6e4c30 : 0x5e4228);
  const MINE = ['1.1.1.1..1.111', '111.1.11.1.1..', '1.1.1.1.11.11.', '1.1.1.1..1.111'];
  MINE.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') g.set(8 + i, H, 6 + r * 2, 0xd8d8cc); });
  // rope handles on the ends
  for (let z = 6; z < 14; z++) { g.set(0, 13 + (z > 7 && z < 12 ? 1 : 0), z, 0x9a8458); g.set(W - 1, 13 + (z > 7 && z < 12 ? 1 : 0), z, 0x9a8458); }
  return M32(g, [W / 2, 0, D / 2]);
}

/**
 * Old Star's notes nailed straight to the rock (1/64 m, no board): curling papers, nails, a few
 * sketches, a strand of red yarn between some. The same shape as tavernProps notesBoard (so the
 * pins follow read and unread). Returns { obj, notes, pins, pinData, w, h }.
 */
export function rockNotes(n = 6, seed = 315) {
  const BW = 56, BH = 44;
  const papers = new VoxelGrid(BW + 2, BH + 14, 8);
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n * 1.4)))), rows = Math.max(1, Math.ceil(n / cols));
  const spots = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const pw = 10 + Math.floor(hash2(i, 1, seed) * 3), ph = 12 + Math.floor(hash2(i, 2, seed) * 4);
    const px = Math.round(2 + (c + 0.5) * ((BW - 4) / cols) - pw / 2 + (hash2(i, 3, seed) - 0.5) * 5);
    const py = Math.round(BH - 3 - (r + 0.5) * ((BH - 4) / rows) - ph / 2 + (hash2(i, 4, seed) - 0.5) * 5);
    const tint = [P.paper, P.paperO, 0xe8e0c8, 0xd8c8a0][Math.floor(hash2(i, 5, seed) * 4)];
    const sketch = Math.floor(hash2(i, 6, seed) * 5);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      if (y === 0 && x > pw - 4 && x - (pw - 4) > y) continue; // a torn corner
      let c2 = tint;
      if (x === 0 || y === 0 || x === pw - 1 || y === ph - 1) c2 = mulc(tint, 0.86);
      if (y < 4 && hash2(i, 8, seed) < 0.5) c2 = mulc(c2, 0.9); // gone brown at the bottom with damp
      const lineRow = y < ph - 3 && y > 1 && (ph - 1 - y) % 2 === 0;
      if (lineRow && x > 1 && x < pw - 2 && hash2(x >> 1, y, i + seed) < 0.72) c2 = mixc(tint, P.ink, 0.55);
      if (sketch === 1 && Math.hypot(x - pw / 2, y - 4) < 2.6 && Math.hypot(x - pw / 2, y - 4) > 1.4) c2 = 0x8a3a2a;
      if (sketch === 2 && y === 3 + Math.round(Math.sin(x * 0.9) * 1.2)) c2 = 0x3a5a8a;
      if (sketch === 3 && x > 2 && x < 6 && y > 2 && y < 7) c2 = (x + y) % 2 ? 0x6a5040 : tint;
      // the bottom edge curls away from the rock
      const curl = y < 2 ? 1 : 0;
      papers.set(1 + px + x, py + y, 2 + curl, c2);
    }
    spots.push({ gx: 1 + px + Math.floor(pw / 2), gy: py + ph - 2 });
  }
  if (n >= 4) for (const [a, b] of [[0, cols + 1], [1, Math.min(n - 1, cols)]]) {
    if (a >= n || b >= n || a === b) continue;
    line(papers, [[spots[a].gx, spots[a].gy, 3], [spots[b].gx, spots[b].gy, 3]], 0.4, 0xb8302a);
  }
  const obj = group(M32(papers, [BW / 2 + 1, 0, 0], { outline: false }));
  const notes = spots.map((s) => ({ x: (s.gx - BW / 2 - 1 + 0.5) * S32, y: (s.gy + 0.5) * S32 }));
  const pinData = { BW, BH, spots: spots.map((s) => ({ gx: s.gx, gy: s.gy })) };
  return { obj, notes, pins: (read) => notesPins(pinData, read), pinData, w: BW * S32, h: BH * S32 };
}

/**
 * A peg board of tools on the rock (wall piece, 1/64 m): a split plank spiked to the rock with four
 * pegs, tongs, a cross-peen hammer, a rasp and a coil of wire hung on them.
 */
export function toolPegs(seed = 317) {
  const W = 52, H = 46;
  const g = new VoxelGrid(W, H, 12);
  // the plank, grey and split, two spikes through it
  for (let y = 30; y < 38; y++) for (let x = 0; x < W; x++) {
    if ((x < 2 || x > W - 3) && (y === 30 || y === 37)) continue;
    g.set(x, y, 0, mulc(GREYWOOD[Math.floor(h3(x >> 2, y, 0, seed) * 4)], y === 33 && x > 20 && x < 31 ? 0.6 : 1));
    g.set(x, y, 1, GREYWOOD[(x >> 3) % 4]);
  }
  for (const x of [3, W - 4]) g.box(x, 33, 2, 2, 2, 1, 0x3a3a42);
  const pegs = [9, 21, 33, 45];
  for (const x of pegs) for (let z = 2; z < 6; z++) g.set(x, 34 - (z > 4 ? 1 : 0), z, 0x7a5a38);
  // tongs: two long iron arms crossing at the rivet
  line(g, [[pegs[0] - 2, 33, 5], [pegs[0] - 4, 6, 6]], 0.6, 0x3a3a42);
  line(g, [[pegs[0] + 2, 33, 5], [pegs[0] + 1, 6, 6]], 0.6, 0x34343c);
  g.set(pegs[0] - 1, 27, 6, 0x6a6a74);
  // the hammer, hung by its head
  line(g, [[pegs[1], 31, 5], [pegs[1], 8, 5]], 0.7, (x, y) => (y % 6 === 0 ? 0x6a4428 : 0x8a5a32));
  g.box(pegs[1] - 4, 30, 4, 9, 4, 3, (x) => (x === pegs[1] + 4 ? 0x8a8a96 : 0x4a4a54));
  // the rasp
  for (let y = 10; y < 32; y++) for (let x = pegs[2] - 1; x < pegs[2] + 2; x++) g.set(x, y, 5, y > 24 ? 0x6a4428 : (x + y) % 2 ? 0x5a5a64 : 0x4a4a54);
  // a coil of wire
  for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; g.set(Math.round(pegs[3] + Math.cos(a) * 4.5), Math.round(28 + Math.sin(a) * 5.5), 5 + (k % 3 === 0 ? 1 : 0), k % 5 === 0 ? 0x8a6a4a : 0x9a7a52); }
  return M32(g, [W / 2, 0, 0]);
}

/**
 * The Miners' Board as Old Star keeps it (1/64 m): a slate in a split frame leant on a crate against
 * the rock, chalked with the jobs and what better gear costs (rows of chalk, a little pick, a bag, a
 * lamp, prices circled, ticks), a stub of chalk on the crate. Pure voxels (it builds in a worker).
 * Returns { obj, face (local tiles: the slate's middle) }.
 */
export function slateOnCrate(seed = 319) {
  const c = crate(seed, {});
  const W = 40, H = 30;
  const g = new VoxelGrid(W, H, 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const frame = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
    g.set(x, y, 0, frame ? mulc(P.oakM, (x + y) % 5 === 0 ? 0.8 : 1) : mulc(0x2e3634, h3(x >> 2, y >> 2, 0, seed) < 0.2 ? 1.12 : 1));
    if (frame) g.set(x, y, 1, mulc(P.oakM, 0.9));
  }
  const chalk = (x, y) => g.set(x, y, 1, h3(x, y, 1, seed) < 0.2 ? 0xb8bcb0 : 0xe6eae0);
  // the heading, scrawled
  for (let x = 5; x < W - 5; x++) if (h3(x >> 1, 0, 2, seed) < 0.8) chalk(x, H - 5);
  for (let x = 8; x < W - 8; x++) if (x % 3) chalk(x, H - 7);
  // three jobs: a little drawing, a line of writing, a price with a tick or a ring round it
  const rows = [H - 12, H - 18, H - 24];
  rows.forEach((y, r) => {
    if (r === 0) { for (let k = 0; k < 4; k++) chalk(5 + k, y + k); chalk(4, y + 3); chalk(9, y + 2); } // a pick
    if (r === 1) { for (let k = 0; k < 4; k++) { chalk(4 + k, y); chalk(4 + k, y + 3); chalk(4, y + k); chalk(7, y + k); } } // a bag
    if (r === 2) { chalk(6, y + 4); for (let k = 0; k < 4; k++) chalk(5 + (k % 2), y + k); } // a lamp
    for (let x = 12; x < 28; x++) if (h3(x >> 1, y, r, seed) < 0.7) chalk(x, y + 1 + (x % 5 === 0 ? 1 : 0));
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; chalk(Math.round(33 + Math.cos(a) * 3), Math.round(y + 1.5 + Math.sin(a) * 2)); }
    if (r !== 1) { chalk(31, y + 1); chalk(32, y); chalk(33, y + 1); chalk(34, y + 2); }
  });
  const slate = M32(g, [W / 2, 0, 0]);
  slate.position.set(0, T(20), T(-6));
  slate.rotation.x = -0.18;
  const sg = new VoxelGrid(6, 3, 4);
  sg.box(0, 0, 0, 5, 2, 2, 0xe8e8dc);
  const stub = M32(sg, [3, 0, 2]);
  stub.position.set(T(6), T(20), T(6));
  return { obj: group(c.obj, slate, stub), face: { x: 0, y: T(20 + H * 0.5), z: T(-4) } };
}

/** Loose earth heaped under a chalk-marked soft wall (1/32 m): crumbly lumps, a pebble or two. */
export function looseEarth(w = 0.7, seed = 321) {
  return lowRes(() => {
    const W = Math.round(w * 64), D = 22;
    const g = new VoxelGrid(W, 12, D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const e = Math.hypot((x + 0.5 - W / 2) / (W / 2), (z + 0.5) / D);
      if (e > 1) continue;
      const h = Math.round((1 - e) * 9 + h3(x >> 2, 0, z >> 2, seed) * 3);
      for (let y = 0; y < h; y++) g.set(x, y, z, h3(x >> 1, y, z >> 1, seed) < 0.06 ? 0x77746c : [0x6a5038, 0x5e4630, 0x7a5c40][Math.floor(h3(x >> 2, y >> 1, z >> 2, seed) * 3)]);
    }
    return M32(g, [W / 2, 0, 0]);
  });
}

void THREE;
