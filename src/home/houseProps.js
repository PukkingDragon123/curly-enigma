// The furnishings of Old Star's house at 1/64 m voxels (1/32 tile), each one lived in: round
// windows with deep oak frames on the cavern, door frames, the kitchen range in its brick
// inglenook, the sink and pump, pantry shelves crowded with jars, the dining table, bookcases full
// of books, the grandfather clock, his trinket shelf and the dream wall (the million-gold tally, the
// packed suitcase by the door), the wardrobe, the bedside table, a box bed, side tables and lamps,
// potted cave plants, big woven rugs, paintings and a pair of boots by the door.
// Conventions (as tavernProps.js): wall pieces have x along the wall (centred), y up, z out of the
// wall into the room, origin on the wall face at floor level; floor pieces are centred with their
// front toward +z. Tile units throughout (the room group is scaled to meters).
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P, blocks, sepia } from './tavernProps.js';

const vm = (m) => Math.round(m * 64);
/** Voxels → tiles (the room group's units). */
const T = (v) => v * S32;

export const H = {
  oak: 0x5e3c24, oakD: 0x3e2618, oakM: 0x6e4a2c, oakL: 0x8a6040, walnut: 0x4a2c1a, pine: 0xa8784a, pineD: 0x7a5434,
  cream: 0xe8dcc0, linen: 0xd8ccb0, sage: 0x6e7e54, rust: 0xa8482a, teal: 0x2a6a6a, plum: 0x6a3a5a, mustard: 0xc89a3a,
  glass: 0xa8d8d0, glassD: 0x6a9a98, copper: 0xc87a4a, copperD: 0x8a4a2a, copperL: 0xe8a070,
};

// ---------------------------------------------------------------- small helpers
/** A glass jar (radius r, height h) with contents colour c filled to `fill`, a lid. */
function jar(g, x, y, z, r, h, c, lid = 0x8a6a3a, fill = 0.75) {
  for (let yy = 0; yy < h; yy++) ring(g, x, z, 0, r, y + yy, y + yy + 1, (xx, yyy, zz) => {
    const inside = yy < h * fill;
    const edge = Math.hypot(xx + 0.5 - x, zz + 0.5 - z) > r - 1;
    if (!inside) return edge ? mixc(H.glass, 0xffffff, 0.2) : -1;
    return edge ? mixc(c, H.glass, 0.35) : c;
  });
  ring(g, x, z, 0, r + 0.3, y + h, y + h + 2, lid);
  if (r > 2) g.box(Math.round(x - 1), y + Math.round(h * 0.45), Math.round(z + r - 0.5), 3, 3, 1, 0xeadcbe); // a paper label
}

/** A bottle (r, h) with a neck and a cork. */
function bottle(g, x, y, z, r, h, c) {
  ring(g, x, z, 0, r, y, y + h, (xx, yy, zz) => (h3(xx, yy, zz, 3) < 0.1 ? mixc(c, 0xffffff, 0.3) : c));
  ring(g, x, z, 0, Math.max(0.8, r * 0.45), y + h, y + h + Math.round(r * 1.6), c);
  g.set(Math.floor(x), y + h + Math.round(r * 1.6), Math.floor(z), 0xb08a5a);
}

/** A row of book spines standing on a shelf from x0 to x1 at y, depth d, max height h. Returns where it stopped. */
function books(g, x0, x1, y, z0, d, h, seed) {
  const pal = [0x7a2a24, 0x2a4a6a, 0x3a5a3a, 0x8a6a2a, 0x5a3a5a, 0x6a3a1e, 0x2e2e3a, 0xa86a3a, 0x4a6a6a, 0x8a3a3a, 0x3a3a5a, 0x6a5a3a];
  let x = x0, k = 0;
  while (x < x1 - 1) {
    const r = hash2(k, 1, seed);
    if (r < 0.07 && x < x1 - 10) { // a gap with a leaning book
      const bw = 3, bh = Math.round(h * 0.8);
      line(g, [[x + 1, y, z0 + d / 2], [x + 5, y + bh - 1, z0 + d / 2]], 1.3, pal[k % pal.length]);
      x += 7; k++; continue;
    }
    if (r > 0.93 && x < x1 - 12) { // a little stack lying flat
      for (let j = 0; j < 3; j++) g.box(x, y + j * 2, z0 + 1, 10 - j, 2, d - 2, (xx, yy) => (yy === y + j * 2 + 1 && xx === x ? 0xe8dcc0 : pal[(k + j * 5) % pal.length]));
      x += 11; k++; continue;
    }
    const bw = 2 + Math.floor(hash2(k, 2, seed) * 3), bh = Math.round(h * (0.68 + hash2(k, 3, seed) * 0.32));
    const c = pal[Math.floor(hash2(k, 4, seed) * pal.length)];
    const dd = d - Math.floor(hash2(k, 5, seed) * 3);
    for (let xx = x; xx < Math.min(x1, x + bw); xx++) for (let yy = y; yy < y + bh; yy++) {
      let cc = c;
      if (yy === y + bh - 2 || yy === y + 3) cc = hash2(k, 6, seed) < 0.5 ? 0xd8b050 : mulc(c, 0.7); // gilt bands
      if (xx === x) cc = mulc(cc, 0.82);
      g.box(xx, yy, z0, 1, 1, dd, cc);
      g.set(xx, yy, z0 + dd - 1, yy === y + bh - 1 ? 0xe8dcc0 : cc);
    }
    x += bw; k++;
  }
}

/** A candle (2×2, h tall) with its flame in the glow grid. */
function candle(g, gl, x, y, z, h = 6, col = P.wax) {
  g.box(x, y, z, 2, h, 2, (xx, yy) => (yy === y + h - 1 ? mulc(col, 0.92) : col));
  g.set(x - 1, y + h - 2, z, col); g.set(x + 2, y + h - 3, z + 1, col);
  g.set(x, y + h, z, 0x2a2018);
  gl.set(x, y + h + 1, z, 0xff9a3a); gl.set(x, y + h + 2, z, 0xffd870); gl.set(x, y + h + 3, z, 0xfff4c8);
}

/** Pixel painting fill for a picture (x, y inside the canvas, w × h), by kind. */
export function picture(kind, x, y, w, h) {
  const u = x / w, v = y / h; // v = 0 at the bottom
  if (kind === 'sea') { // the sun over the sea, as somebody told him it looks
    const sun = Math.hypot(u - 0.62, (v - 0.62) * h / w);
    if (sun < 0.12) return sun < 0.08 ? 0xfff0a0 : 0xffc860;
    if (v > 0.42) return mixc(0x9ad0f0, 0xf0c8a0, Math.max(0, 0.9 - v) * 1.6 + (sun < 0.25 ? 0.25 : 0));
    if (v > 0.38) return 0x3a6a9a;
    const wave = (Math.floor(x + Math.sin(y * 1.7) * 2) % 5 === 0);
    if (v < 0.14) return wave ? 0xf0e0b0 : 0xe0c890; // sand
    return wave ? 0x8ac0e0 : mixc(0x2a5a8a, 0x4a8ac0, v * 2);
  }
  if (kind === 'hills') { // green hills and a little house with a red roof
    if (v > 0.55) return mixc(0xa8d8f0, 0xe0f0f8, (v - 0.55) * 2);
    const hill1 = 0.45 + Math.sin(u * 6) * 0.08, hill2 = 0.3 + Math.sin(u * 9 + 2) * 0.06;
    if (Math.abs(u - 0.7) < 0.08 && v < hill1 + 0.12 && v > hill1 - 0.02) return v > hill1 + 0.06 ? 0xb83a2a : 0xe8dcc0;
    if (v < hill2) return (x + y) % 3 ? 0x4a8a3a : 0x5a9a42;
    if (v < hill1) return (x * 2 + y) % 4 ? 0x6aa84a : 0x7ab858;
    return 0x9ad0e8;
  }
  if (kind === 'portrait') { // a lady mole in a lace collar: Old Star's Marigold
    const dx = u - 0.5, head = Math.hypot(dx * 1.1, v - 0.58);
    if (head < 0.2) {
      if (Math.abs(dx) < 0.05 && Math.abs(v - 0.52) < 0.04) return 0xe890a0; // her nose
      if (Math.abs(Math.abs(dx) - 0.08) < 0.025 && Math.abs(v - 0.62) < 0.025) return 0x1a1418; // eyes
      return head < 0.18 ? 0x6a5a52 : 0x4a3e38;
    }
    if (v < 0.4 && Math.abs(dx) < 0.32 - v * 0.2) return Math.abs(v - 0.36) < 0.03 ? 0xf0ece0 : 0x6a2a4a; // dress, lace collar
    return mixc(0x3a4a3a, 0x5a6a4a, v);
  }
  if (kind === 'train') { // the Surface Express climbing to the sun
    if (v > 0.7 && Math.hypot(u - 0.8, v - 0.85) < 0.1) return 0xffe080;
    const track = Math.abs(v - (0.15 + u * 0.55)) < 0.03;
    if (track) return 0x4a3a2a;
    const tr = u > 0.32 && u < 0.62 && v > 0.15 + u * 0.55 && v < 0.27 + u * 0.55;
    if (tr) return (Math.floor(u * 30) % 3 === 0) ? 0xffd060 : 0xb83a2a;
    return mixc(0x2a2a4a, 0xd0a070, v);
  }
  // 'mountains'
  if (v > 0.5 + Math.abs(Math.sin(u * 7)) * 0.25) return mixc(0x8ac0e0, 0xe8f0f8, v);
  return v > 0.62 ? 0xf0f4f8 : mixc(0x4a5a6a, 0x6a7a8a, u);
}

// ---------------------------------------------------------------- windows and doors
/**
 * A round window on the cavern (wall piece, origin at its centre on the wall face): a deep oak
 * frame with a sill, leaded glass in a cross, a reveal of stone going back through the thick wall
 * and a little outside ledge of rock, a pot or a candle on the sill. r: radius (m). The window
 * itself is built once per radius and cloned (it's the same joinery every time).
 * Returns { obj, sill: local point (tiles), glassZ }.
 */
export function roundWindow(r = 0.3, seed = 3, sill = 'plant') {
  const W = windowParts(r);
  const { S, c, cy, zf, top, RO } = W.dims;
  // what stands on the sill (its own little grid, same frame)
  const g = new VoxelGrid(S, S + 16, W.dims.D), gl = new VoxelGrid(S, S + 16, W.dims.D);
  if (sill === 'plant') {
    ring(g, c - RO + 9, zf + 5, 0, 3.2, top, top + 6, (x, y) => (y === top + 5 ? 0x9a4a2a : 0xb85a34));
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + seed; line(g, [[c - RO + 9, top + 6, zf + 5], [c - RO + 9 + Math.cos(a) * 5, top + 9 + (k % 3) * 2, zf + 5 + Math.sin(a) * 4]], 0.6, k % 2 ? 0x4a8a3a : 0x6aa84a); }
  } else if (sill === 'candle') {
    ring(g, c + RO - 10, zf + 5, 0, 3, top, top + 1, 0x8a8a92);
    candle(g, gl, c + RO - 11, top + 1, zf + 4, 7);
  } else if (sill === 'jar') {
    jar(g, c + RO - 10, top, zf + 5, 3.4, 9, 0x5ad0b0, 0x8a6a3a, 0.6);
    gl.box(c + RO - 11, top + 1, zf + 4, 2, 4, 2, 0x8affe0); // a glow-worm in a jar
  }
  const obj = group(W.frame.clone(), W.glints.clone(), W.ledge.clone(true), M32(g, [c, cy, zf]), G32(gl, [c, cy, zf]));
  return { obj, sill: { x: 0, y: T(top - cy), z: T(5) }, glassZ: T(W.dims.zl - zf) };
}

const WINDOWS = new Map();
function windowParts(r) {
  const key = r.toFixed(3);
  if (WINDOWS.has(key)) return WINDOWS.get(key);
  const seed = 3;
  const R = vm(r), RO = R + 6, BACK = 26, S = RO * 2 + 4, D = BACK + 10;
  const g = new VoxelGrid(S, S + 16, D), gl = new VoxelGrid(S, S + 16, D);
  const c = S / 2, cy = c + 10, zf = BACK; // grid z of the wall face
  const ok = wood(H.oakM, { axis: 'y', pw: 99, seed });
  for (let y = 0; y < S + 16; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - cy);
    if (d > RO + 0.5) continue;
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - c);
    if (d > R) { // the frame ring, proud of the wall; segmented like a cartwheel rim
      const seam = Math.abs(((a / Math.PI) * 4 + 8) % 1) < 0.08;
      const col = seam ? H.oakD : d > RO - 1 ? mulc(H.oakM, 0.8) : d < R + 1.2 ? mulc(H.oakM, 1.15) : Math.floor(d - R) % 3 === 0 ? mulc(H.oakM, 0.94) : H.oakM; // (banded, not grained: it merges)
      for (let z = zf - 2; z < zf + 4; z++) g.set(x, y, z, z === zf + 3 && !seam ? mulc(col, 1.06) : col);
      continue;
    }
    if (d < R - 2) continue;
    // the reveal: a ring of stone blocks going back through the wall, paler near the room
    const blk = Math.floor((a / Math.PI) * 6 + 12);
    const seamA = Math.abs(((a / Math.PI) * 6 + 12) % 1) < 0.08;
    for (let z = 0; z < zf - 2; z++) {
      const course = Math.floor(z / 9);
      g.set(x, y, z, seamA || z % 9 === 8 ? P.mortar : mulc([0x7a7068, 0x6e665e, 0x86796c][(blk + course * 3) % 3], 0.75 + course * 0.12));
    }
  }
  // leaded lights: a cross and a ring of lead cames, set back a little in the reveal
  const zl = zf - 8;
  for (let y = 0; y < S + 16; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > R - 1.5) continue;
    const bar = Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2;
    const came = Math.abs(d - R * 0.55) < 0.7;
    if (bar) g.box(x, y, zl, 1, 1, 2, Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 ? H.oakD : H.oakM);
    else if (came) g.set(x, y, zl, 0x3a3a40);
    else if (h3(x, y, 1, seed) < 0.012 && dy > R * 0.3) gl.set(x, y, zl, 0x9ad8d0); // a glint on the glass
  }
  // the latch
  g.box(c + R - 7, cy - 1, zl + 1, 4, 3, 2, P.iron); g.box(c + R - 6, cy - 4, zl + 2, 2, 4, 1, P.iron);
  // the sill: a thick board on two brackets
  const sy = cy - RO - 1;
  g.box(c - RO, sy - 2, zf - 2, RO * 2, 3, 14, (x, y, z) => (y === sy ? H.oakL : z === zf + 11 ? mulc(H.oakM, 0.85) : H.oakM));
  for (const bx of [c - RO + 4, c + RO - 6]) for (let y = sy - 9; y < sy - 2; y++) g.box(bx, y, zf, 2, 1, Math.max(1, Math.round((y - sy + 10) * 1.3)), H.oakD);
  // outside: a lip of dark rock under the window and a tuft of glowing moss (coarse: only ever seen through the glass)
  const ledge = new VoxelGrid(S + 30, 20, 30), lgl = new VoxelGrid(S + 30, 20, 30);
  for (let x = 0; x < S + 30; x++) for (let z = 0; z < 30; z++) {
    const hh = Math.round(8 + Math.sin(x * 0.3 + seed) * 3 + hash2(x >> 2, z >> 2, seed) * 4 - z * 0.25);
    for (let y = 0; y < hh; y++) ledge.set(x, y, z, y === hh - 1 ? (h3(x >> 1, y, z >> 1, seed) < 0.3 ? 0x2a4a3a : 0x2a2632) : 0x1a1620);
    if (hash2(x, z, seed + 3) < 0.03) lgl.set(x, hh, z, hash2(x, z, seed + 4) < 0.5 ? 0x5ad8e8 : 0x9affc8);
  }
  const lg = lowRes(() => group(M32(ledge, [(S + 30) / 2, 20, 0]), G32(lgl, [(S + 30) / 2, 20, 0])));
  lg.position.set(0, T(-R - 3), T(-BACK - 2)); // (the mesh's origin is the window's centre)
  lg.rotation.y = Math.PI; // (its z runs away from the house)
  const out = { frame: M32(g, [c, cy, zf]), glints: G32(gl, [c, cy, zf]), ledge: lg, dims: { S, c, cy, zf, top: sy + 1, RO, D, zl } };
  WINDOWS.set(key, out);
  return out;
}

/**
 * A doorway's frame through a wall of thickness `thick` (m): oak jambs and a head lining the gap,
 * casings proud of both faces, a worn threshold board. Origin at the doorway's centre at floor
 * level, x along the wall, z across it (centred in the wall). w, h in m. opts: { roundTop, step (m,
 * the floor on the far side is that much higher), stone }.
 */
const DOORS = new Map();
export function doorFrame(w, h, thick = 0.2, seed = 5, opts = {}) {
  const key = [w, h, thick, !!opts.roundTop, opts.step ?? 0, !!opts.stone].join('|');
  if (!DOORS.has(key)) DOORS.set(key, buildDoorFrame(w, h, thick, seed, opts));
  return DOORS.get(key).clone();
}
function buildDoorFrame(w, h, thick, seed, opts) {
  const W = vm(w), Hh = vm(h), D = vm(thick) + 10, CAS = 7;
  const GW = W + CAS * 2 + 2, GH = Hh + CAS + 2;
  const g = new VoxelGrid(GW, GH, D);
  const cx = GW / 2;
  const top = opts.roundTop ? Hh - W / 2 : Hh;
  const inside = (x, y) => {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) > W / 2) return false;
    if (y < top) return true;
    return opts.roundTop && dx * dx + (y - top) ** 2 <= (W / 2) ** 2;
  };
  const jw = opts.stone ? blocks(14, 10, seed) : wood(H.oakM, { axis: 'y', pw: 99, seed });
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (inside(x, y)) continue;
    const dx = Math.abs(x + 0.5 - cx);
    const r = opts.roundTop && y >= top ? Math.hypot(x + 0.5 - cx, y - top) : 0;
    const lining = opts.roundTop && y >= top ? r <= W / 2 + 4 : dx <= W / 2 + 4 && y <= top + 4;
    const casing = opts.roundTop && y >= top ? r <= W / 2 + CAS : dx <= W / 2 + CAS && y <= top + CAS;
    if (!casing) continue;
    if (lining) for (let z = 0; z < D; z++) g.set(x, y, z, z === 0 || z === D - 1 ? mulc(jw(x, y, z), 0.85) : jw(x, y, z));
    else for (const z of [0, 1, D - 2, D - 1]) g.set(x, y, z, (z === 0 || z === D - 1) ? mulc(H.oakD, 1.1) : H.oakD);
  }
  // the threshold: a worn oak board (or the step up into your room)
  const sh = opts.step ? vm(opts.step) : 1;
  g.box(Math.round(cx - W / 2), 0, 5, W, sh, D - 10, (x, y, z) => (y === sh - 1 ? mixc(0x8a6a48, 0xb0906a, Math.max(0, 1 - Math.abs(x + 0.5 - cx) / (W / 2)) * 0.5) : opts.step && z === 5 ? mulc(H.oakM, 0.8) : H.oakM));
  return M32(g, [cx, 0, D / 2]);
}

// ---------------------------------------------------------------- the kitchen
/**
 * The cooking range in its brick inglenook (wall piece): a black iron range with a firebox (its
 * glowing grate is `embers`), an oven door with a brass handle, a hot plate carrying the stew pot
 * and a copper kettle, the stovepipe up the chimney breast; a mantel of jars and a clock; a rail
 * of copper pans and ladles; a tiled hearth in front. Returns { obj, embers, flames, fire, pot,
 * kettle, pans } (local tiles), hh = the room's height in voxels.
 */
export function kitchenRange(hh = 140, seed = 61) {
  const W = 96, D = 40, IH = 80; // the inglenook: width, depth, height of its opening
  const g = new VoxelGrid(W + 16, hh, D + 24), gl = new VoxelGrid(W + 16, hh, D + 24);
  const x0 = 8, cx = x0 + W / 2;
  const brick = (x, y, z) => {
    const row = Math.floor(y / 6), off = (row % 2) * 6;
    if (y % 6 === 0 || (x + z + off) % 12 === 0) return 0x5a4a40;
    const h = hash2(Math.floor((x + z + off) / 12), row, seed);
    const c = [0x9a4a32, 0x8a4230, 0xa8563a, 0x7a3c2a][Math.floor(h * 4)];
    const soot = y > 50 && Math.abs(x + 0.5 - cx) < 26 ? Math.min(0.6, (y - 50) / 70) : 0;
    return mixc(mulc(c, sp3(x, y, z, seed, 0.06, 0.1)), 0x1e1612, soot);
  };
  // the breast: brick from the floor to the ceiling, with an opening for the range
  for (let y = 0; y < hh; y++) for (let x = x0; x < x0 + W; x++) for (let z = 0; z < D; z++) {
    const open = y < IH && Math.abs(x + 0.5 - cx) < W / 2 - 10 && z > 3;
    const arch = y >= IH - 8 && y < IH && Math.abs(x + 0.5 - cx) < W / 2 - 10 && z > 3 && ((x + 0.5 - cx) / (W / 2 - 10)) ** 2 + ((y - IH + 8) / 8) ** 2 > 1;
    if (open && !arch) continue;
    // the breast steps in above the mantel, then rises narrow and shallow to the ceiling
    if (y > IH + 10 && (z > D - 14 || Math.abs(x + 0.5 - cx) > W / 2 - 6)) continue;
    if (y > IH + 34 && (z > D - 22 || Math.abs(x + 0.5 - cx) > W / 2 - 14)) continue;
    g.set(x, y, z, brick(x, y, z));
  }
  // the mantel beam
  const MY = IH + 2;
  const mw = wood(H.walnut, { axis: 'x', across: 'z', pw: 99, seed: seed + 2 });
  g.box(x0 - 4, MY, 0, W + 8, 8, D + 3, (x, y, z) => (y === MY ? mulc(mw(x, y, z), 0.8) : mw(x, y, z)));
  // mantel things: jars of spices, a tin clock, a pair of candlesticks, a teapot
  const T0 = MY + 8;
  let jx = x0 + 6;
  for (let k = 0; k < 6; k++) { const r = 2.2 + (k % 2) * 0.6; jar(g, jx + r, T0, D - 6, r, 7 + (k % 3) * 2, [0xb85a3a, 0x8a7a3a, 0x4a6a3a, 0xd8c890, 0x6a3a2a, 0xc89a3a][k], 0xb08a5a); jx += r * 2 + 2; }
  g.box(cx - 5, T0, D - 9, 10, 12, 6, (x, y) => (y > T0 + 10 ? P.brass : 0x3a5a4a));
  ring(g, cx, D - 3, 0, 3.6, T0 + 3, T0 + 4, 0xf0e8d0); g.set(cx, T0 + 6, D - 3, 0x1a1a1a); g.set(cx + 1, T0 + 5, D - 3, 0x1a1a1a);
  for (const x of [x0 + W - 22, x0 + W - 12]) { g.box(x - 1, T0, D - 6, 4, 1, 4, P.brass); g.box(x, T0 + 1, D - 5, 2, 6, 2, P.brass); candle(g, gl, x, T0 + 7, D - 5, 5); }
  // the range: a black iron box with rails, a firebox on the left, the oven on the right
  const RX0 = Math.round(cx - 34), RX1 = Math.round(cx + 34), RH = 46, RZ0 = 6, RZ1 = D + 6;
  const ir = (x, y, z) => (h3(x, y, z, 7) < 0.03 ? 0x4a4048 : (y === RH - 1 ? 0x3a3a42 : 0x232328));
  g.box(RX0, 4, RZ0, RX1 - RX0, RH - 4, RZ1 - RZ0, ir);
  for (const x of [RX0 + 2, RX1 - 5]) for (const z of [RZ1 - 4]) g.box(x, 0, z, 3, 4, 3, 0x1a1a1e); // feet
  // the hot plate: polished steel rings
  for (const [px, pz] of [[RX0 + 16, RZ0 + 22], [RX0 + 40, RZ0 + 22]]) ring(g, px, pz, 5, 8, RH - 1, RH, 0x6a6a74);
  // a brass towel rail along the front
  g.box(RX0 - 1, RH - 8, RZ1 + 1, RX1 - RX0 + 2, 2, 2, P.brass);
  for (const x of [RX0, RX1 - 1]) g.box(x, RH - 8, RZ1 - 1, 1, 2, 3, P.brassD);
  // a tea towel hung on the rail
  g.box(RX0 + 30, RH - 20, RZ1 + 2, 9, 13, 1, (x, y) => ((x + y) % 4 < 2 ? 0xe8dcc0 : 0xb8402a));
  // the firebox door with its glowing grate, the ash pan
  g.box(RX0 + 4, 16, RZ1, 22, 20, 1, (x, y) => (x === RX0 + 4 || x === RX0 + 25 || y === 16 || y === 35 ? 0x3a3a42 : 0x2a2a30));
  const emb = new VoxelGrid(W + 16, hh, D + 24);
  for (let x = RX0 + 7; x < RX0 + 23; x++) for (let y = 20; y < 31; y++) {
    if ((x - RX0) % 3 === 0) g.set(x, y, RZ1 + 1, 0x1a1a1e); // the bars
    else emb.set(x, y, RZ1, hash2(x, y, seed) < 0.3 ? 0xffd070 : y < 24 ? 0xff7a2a : 0xffa040);
  }
  g.box(RX0 + 6, 6, RZ1, 18, 7, 2, 0x3a3a42); g.box(RX0 + 13, 8, RZ1 + 2, 4, 2, 1, P.brass);
  // the oven door: a raised panel with a brass handle and a little thermometer
  g.box(RX0 + 32, 8, RZ1, 32, 28, 1, (x, y) => (x === RX0 + 32 || x === RX0 + 63 || y === 8 || y === 35 ? 0x3a3a42 : 0x2c2c32));
  g.box(RX0 + 35, 11, RZ1 + 1, 26, 22, 1, 0x26262c);
  g.box(RX0 + 40, 30, RZ1 + 1, 16, 2, 2, P.brass);
  ring(g, RX0 + 48, RZ1 + 1, 0, 3, 18, 19, 0xf0e8d0);
  // the stovepipe up from the back into the breast
  for (let y = RH; y < IH - 4; y++) ring(g, RX0 + 56, RZ0 + 6, 0, 4.5, y, y + 1, (x, yy) => ((yy - RH) % 12 === 0 ? 0x4a4a52 : 0x26262c));
  // the stew pot (black, a lid, a wooden spoon) and the copper kettle
  const potX = RX0 + 16, potZ = RZ0 + 22;
  for (let y = 0; y < 14; y++) ring(g, potX, potZ, 0, 8.5 - Math.abs(y - 6) * 0.18, RH + y, RH + y + 1, y === 13 ? 0x3a3a42 : 0x26262c);
  ring(g, potX, potZ, 0, 7, RH + 14, RH + 15, 0x34343c); g.box(potX - 1, RH + 15, potZ - 1, 3, 2, 3, 0x4a4a52);
  g.box(potX - 10, RH + 9, potZ - 1, 2, 2, 2, 0x26262c); g.box(potX + 9, RH + 9, potZ - 1, 2, 2, 2, 0x26262c);
  line(g, [[potX + 3, RH + 14, potZ + 2], [potX + 9, RH + 26, potZ + 6]], 0.8, 0xa87a48);
  const ktX = RX0 + 40, ktZ = RZ0 + 22;
  for (let y = 0; y < 11; y++) ring(g, ktX, ktZ, 0, 6.5 - Math.max(0, y - 5) * 0.55, RH + y, RH + y + 1, (x, yy, z) => (h3(x, yy, z, 2) < 0.15 ? H.copperL : H.copper));
  line(g, [[ktX + 5, RH + 4, ktZ], [ktX + 11, RH + 9, ktZ]], 1.0, H.copper); // the spout
  line(g, [[ktX - 4, RH + 10, ktZ], [ktX, RH + 16, ktZ], [ktX + 4, RH + 10, ktZ]], 0.6, 0x2a2a30); // the handle
  // copper pans and ladles on a rail across the opening
  const RY = IH - 14;
  g.box(x0 + 12, RY, D + 2, W - 24, 1, 1, P.iron);
  for (let k = 0; k < 6; k++) {
    const px = x0 + 18 + k * 12;
    g.set(px, RY - 1, D + 2, P.iron); g.set(px, RY - 2, D + 2, P.iron);
    if (k % 3 === 2) { line(g, [[px, RY - 3, D + 2], [px, RY - 18, D + 2]], 0.6, 0x9a9aa2); ring(g, px, D + 4, 0, 3, RY - 21, RY - 18, 0x9a9aa2); continue; }
    const r = 4 + (k % 2) * 1.5;
    line(g, [[px, RY - 3, D + 2], [px, RY - 10, D + 2]], 0.8, H.copperD);
    for (let y = 0; y < r * 2; y++) for (let x = -r; x <= r; x++) { if (Math.hypot(x, y - r) <= r) g.box(px + x, RY - 10 - r * 2 + y, D + 2, 1, 1, 2, Math.hypot(x, y - r) > r - 1 ? H.copperD : (x + y) % 5 === 0 ? H.copperL : H.copper); }
  }
  // the tiled hearth in front
  for (let x = x0 - 4; x < x0 + W + 4; x++) for (let z = D; z < D + 22; z++) {
    const tu = Math.floor((x - x0) / 8), tz = Math.floor((z - D) / 8);
    const grout = (x - x0) % 8 === 0 || (z - D) % 8 === 0;
    g.set(x, 0, z, grout ? 0x6a5a4a : (tu + tz) % 2 ? 0x8a3a28 : 0x2a2a30);
  }
  // the flames inside the firebox are hidden: the glow through the grate is the fire
  const embM = G32(emb, [cx, 0, 0], { outline: false });
  embM.material = embM.material.clone();
  embM.userData.noBatch = true;
  const obj = group(M32(g, [cx, 0, 0]), G32(gl, [cx, 0, 0]), embM);
  const L = (x, y, z) => ({ x: T(x - cx), y: T(y), z: T(z) });
  return {
    obj, embers: embM, flames: [],
    fire: L(RX0 + 15, 26, RZ1 + 3), pot: L(potX, RH + 16, potZ), kettle: L(ktX + 11, RH + 9, ktZ),
    candles: [L(x0 + W - 21, T0 + 15, D - 4), L(x0 + W - 11, T0 + 15, D - 4)],
    front: T(D + 22),
  };
}

/**
 * The sink and pump under the kitchen window (wall piece): a stone basin on a cupboard, a cast iron
 * hand pump with a long handle and a spout over the basin, a drying rack of plates, a scrubbing
 * brush, a bucket under it. The water in the basin is the scene's (returned as `water`).
 */
export function sinkPump(seed = 63) {
  const W = 62, D = 30, CH = 34;
  const g = new VoxelGrid(W + 4, 90, D + 6);
  const x0 = 2, cx = x0 + W / 2;
  const cup = wood(H.sage, { axis: 'y', pw: 99, seed });
  // the cupboard: two doors, painted like the panelling
  g.box(x0, 0, 0, W, CH, D, (x, y, z) => {
    if (z < D - 1) return mulc(H.sage, 0.8);
    const lx = x - x0;
    if (y < 3 || y > CH - 4 || lx < 3 || lx > W - 4 || Math.abs(lx - W / 2) < 1.5) return mulc(cup(x, y, z), 1.06);
    return mulc(H.sage, 0.94);
  });
  for (const kx of [cx - 4, cx + 3]) g.box(kx, CH - 12, D, 1, 3, 1, P.brass);
  // the stone basin on top, hollowed out
  const BY = CH;
  for (let y = BY; y < BY + 12; y++) for (let x = x0 - 1; x < x0 + W + 1; x++) for (let z = 0; z < D + 2; z++) {
    const inner = x > x0 + 4 && x < x0 + W - 5 && z > 3 && z < D - 3 && y > BY + 2;
    if (inner) continue;
    g.set(x, y, z, mulc(mixc(0x8a8278, 0x9a9084, hash2(x >> 2, z >> 2, seed)), y === BY + 11 ? 1.1 : 1));
  }
  // the pump: a fluted iron barrel on the back, the spout over the basin, the handle up
  const px = cx - 26, pz = 6; // (to the side of the window above)
  for (let y = BY + 10; y < BY + 44; y++) ring(g, px, pz, 0, y > BY + 40 ? 4 : 3.2, y, y + 1, (x, yy, z) => ((yy % 6 === 0) ? 0x3e3e46 : 0x2c2c34));
  ring(g, px, pz, 0, 4.4, BY + 44, BY + 46, 0x3e3e46);
  line(g, [[px, BY + 36, pz + 2], [px, BY + 34, pz + 10], [px, BY + 30, pz + 12]], 1.5, 0x2c2c34);
  line(g, [[px, BY + 45, pz], [px + 6, BY + 52, pz + 6], [px + 16, BY + 50, pz + 12]], 0.9, 0x34343c);
  g.box(px + 15, BY + 48, pz + 11, 4, 3, 3, 0x6a4428);
  // a drying rack with plates on the right
  const rx = x0 + W - 18;
  for (let k = 0; k < 4; k++) {
    const zz = 6 + k * 5;
    for (let y = 0; y < 14; y++) for (let x = -7; x <= 7; x++) if (Math.hypot(x, y - 7) < 7.2) g.set(rx + x, BY + 12 + y, zz, Math.hypot(x, y - 7) > 6.2 ? 0x4a6aa0 : 0xf0ece0);
  }
  g.box(rx - 9, BY + 12, 3, 1, 10, D - 6, H.oakD); g.box(rx + 9, BY + 12, 3, 1, 10, D - 6, H.oakD);
  // a scrubbing brush and a cake of soap on the rim
  g.box(x0 + 4, BY + 12, D - 4, 7, 2, 3, 0xa87a48); for (let x = x0 + 4; x < x0 + 11; x++) g.set(x, BY + 11, D - 3, 0xd8c8a0);
  g.box(x0 + 14, BY + 12, D - 3, 4, 2, 3, 0xe8e0d0);
  // a bucket on the floor by the cupboard
  for (let y = 0; y < 14; y++) ring(g, x0 + W + 0, D + 1, 0, 4.5 - (14 - y) * 0.06, y, y + 1, (x, yy) => (yy % 6 === 0 ? 0x5a5a62 : 0x8a6a48));
  return { obj: M32(g, [cx, 0, 0]), water: { x: 0, y: T(BY + 8), z: T(D / 2), w: T(W - 10), d: T(D - 8) }, spout: { x: T(px - cx), y: T(BY + 29), z: T(pz + 12) } };
}

/**
 * The pantry shelves (wall piece, len m): four plank shelves on uprights, crowded: jars of pickled
 * mushrooms, honey and jam, crocks, bottles, a cheese wheel and loaves, strings of onions down the
 * side, sacks of flour on the floor shelf. h: height (m).
 */
export function pantryShelf(len = 2.2, h = 1.45, seed = 65) {
  const L = vm(len), Hh = vm(h), D = 16;
  const g = new VoxelGrid(L + 4, Hh + 4, D + 4), gl = new VoxelGrid(L + 4, Hh + 4, D + 4);
  const pl = wood(H.pineD, { axis: 'x', across: 'z', pw: 99, seed });
  const ys = [4, Math.round(Hh * 0.3), Math.round(Hh * 0.55), Math.round(Hh * 0.8), Hh - 2];
  for (const y of ys) g.box(2, y, 0, L, 2, D, (x, yy, z) => (z === D - 1 ? mulc(H.pineD, 0.8) : pl(x, yy, z)));
  const up = Math.max(2, Math.round(L / 64));
  for (let k = 0; k <= up; k++) { const x = 2 + Math.round((k * (L - 3)) / up); g.box(x, 0, 0, 3, Hh, D, beam(H.pineD, 'y', seed + k)); }
  // a scalloped trim along each shelf's edge
  for (const y of ys.slice(1)) for (let x = 2; x < L + 2; x++) if (x % 6 < 4) g.set(x, y - 1, D - 1, mulc(H.pineD, 0.9));
  const rnd = (k) => hash2(k, 7, seed);
  // fill each bay
  for (let s = 0; s < ys.length - 1; s++) {
    const y = ys[s] + 2, room = ys[s + 1] - y - 2;
    let x = 6, k = s * 50;
    while (x < L - 6) {
      const r = rnd(k);
      if (s === 0) { // sacks and a crock on the bottom
        if (r < 0.5) {
          const w = 16;
          g.ellipsoid(x + w / 2, y + 7, D / 2, w / 2, 8, D / 2 - 1, (xx, yy, zz) => (yy > y + 12 ? 0xb89a6a : h3(xx, yy, zz, 3) < 0.1 ? 0xa88a5a : 0xc8aa78));
          g.box(x + w / 2 - 3, y + 12, D / 2 - 3, 6, 3, 6, 0x9a7a4a);
          if (r < 0.25) for (let j = 0; j < 4; j++) g.set(x + 4 + j * 3, y + 15, D / 2, 0xf0ece0); // flour dust
          x += w + 2;
        } else {
          for (let yy = 0; yy < 14; yy++) ring(g, x + 6, D / 2, 0, 6 - Math.abs(yy - 7) * 0.2, y + yy, y + yy + 1, (xx, yyy) => (yyy > y + 11 ? 0xe8dcc0 : 0x9a6a4a));
          x += 14;
        }
      } else if (r < 0.55) { // jars
        const jr = 2.6 + rnd(k + 1) * 1.6, jh = Math.min(room - 4, 8 + Math.floor(rnd(k + 2) * 8));
        const fill = [0x8a5a2a, 0xd89a2a, 0x8a2a3a, 0x6a8a3a, 0xc8a87a, 0xb85a3a, 0x5a3a5a, 0xe8d8a0][Math.floor(rnd(k + 3) * 8)];
        jar(g, x + jr, y, D / 2, jr, jh, fill, [0x8a6a3a, 0xc8a050, 0xb83a2a, 0xe8dcc0][k % 4], 0.6 + rnd(k + 4) * 0.35);
        x += Math.ceil(jr * 2) + 2;
      } else if (r < 0.72) { // bottles
        const br = 2 + rnd(k + 1) * 0.8, bh = Math.min(room - 7, 9 + Math.floor(rnd(k + 2) * 6));
        bottle(g, x + br, y, D / 2 + (k % 2) * 2 - 1, br, bh, [0x2a5a3a, 0x6a2a2a, 0x3a3a6a, 0x8a6a2a][k % 4]);
        x += Math.ceil(br * 2) + 2;
      } else if (r < 0.82) { // a cheese wheel or a loaf
        if (rnd(k + 5) < 0.5) { ring(g, x + 6, D / 2, 0, 6, y, y + 5, (xx, yy) => (yy === y + 4 ? 0xf0d070 : 0xe8b840)); g.box(x + 6, y, D / 2, 6, 5, 6, -1); x += 14; }
        else { g.ellipsoid(x + 6, y + 3, D / 2, 6, 4, 4, (xx, yy) => (yy > y + 4 ? 0xc8883a : 0xa86a2a)); for (let j = 0; j < 3; j++) g.set(x + 3 + j * 3, y + 7, D / 2, 0xe0b070); x += 14; }
      } else { // a stack of bowls or a jug
        for (let j = 0; j < 3; j++) ring(g, x + 5, D / 2, 3, 5, y + j * 2, y + j * 2 + 2, [0xe8e0d0, 0x4a6aa0, 0xd8c8a8][j]);
        x += 12;
      }
      k++;
    }
  }
  // strings of onions and a garlic plait hanging down the ends
  for (const ex of [1, L + 2]) for (let j = 0; j < 6; j++) {
    const yy = Hh - 10 - j * 7;
    g.ellipsoid(ex, yy, D - 3, 2.4, 2.6, 2.4, j % 2 ? 0xc89a4a : 0xb87a3a);
  }
  return { obj: group(M32(g, [(L + 4) / 2, 0, 0]), G32(gl, [(L + 4) / 2, 0, 0])) };
}

/**
 * The dining table (floor piece, long side along x): thick oak top on turned legs with a stretcher,
 * a linen runner, a candle in a brass holder, a bread board and loaf, a teapot, two mugs and a bowl
 * of glowcaps. Returns { obj, candle }.
 */
export function diningTable(seed = 67) {
  const L = 72, Wd = 40, Ht = 27;
  const g = new VoxelGrid(L, Ht + 22, Wd), gl = new VoxelGrid(L, Ht + 22, Wd);
  const top = wood(H.oakL, { axis: 'x', across: 'z', pw: 8, seed });
  g.box(0, Ht - 3, 0, L, 3, Wd, (x, y, z) => {
    if (y === Ht - 3) return mulc(H.oakM, 0.85);
    let c = top(x, y, z);
    if (y === Ht - 1 && h3(x >> 1, y, z >> 1, seed) < 0.05) c = mulc(c, 0.85); // rings from mugs
    return c;
  });
  for (const [x, z] of [[3, 3], [L - 6, 3], [3, Wd - 6], [L - 6, Wd - 6]]) for (let y = 0; y < Ht - 3; y++) {
    const r = 1.6 + (Math.abs(y - 6) < 2 || Math.abs(y - 18) < 2 ? 0.8 : 0); // turned
    ring(g, x + 1.5, z + 1.5, 0, r, y, y + 1, H.oakM);
  }
  g.box(5, 5, Wd / 2 - 1, L - 10, 2, 2, H.oakM);
  // the runner
  g.box(4, Ht, 12, L - 8, 1, Wd - 24, (x, y, z) => (z === 12 || z === Wd - 13 ? 0xb8402a : (x + z) % 6 === 0 ? 0xd8ccb0 : 0xece4d0));
  // candle in a holder in the middle
  const cx = L / 2;
  ring(g, cx, Wd / 2, 0, 3.4, Ht + 1, Ht + 2, P.brass); g.box(cx - 1, Ht + 2, Wd / 2 - 1, 2, 3, 2, P.brass);
  candle(g, gl, cx - 1, Ht + 5, Wd / 2 - 1, 8);
  // bread board and loaf
  g.box(10, Ht + 1, 14, 16, 1, 12, 0xa87a48);
  g.ellipsoid(18, Ht + 4, 20, 6, 3.6, 4, (x, y) => (y > Ht + 5 ? 0xc8883a : 0xa86a2a));
  // a teapot (brown betty) and two mugs
  const tx = L - 18, tz = 20;
  for (let y = 0; y < 9; y++) ring(g, tx, tz, 0, 4.6 - Math.abs(y - 4) * 0.3, Ht + 1 + y, Ht + 2 + y, 0x6a3a22);
  g.box(tx - 1, Ht + 10, tz - 1, 2, 2, 2, 0x6a3a22); line(g, [[tx + 4, Ht + 4, tz], [tx + 8, Ht + 8, tz]], 0.8, 0x6a3a22);
  line(g, [[tx - 4, Ht + 8, tz], [tx - 7, Ht + 6, tz], [tx - 4, Ht + 3, tz]], 0.6, 0x6a3a22);
  for (const [mx, mz] of [[L - 10, 8], [12, Wd - 8]]) { ring(g, mx, mz, 0, 2.6, Ht + 1, Ht + 6, (x, y) => (y === Ht + 5 ? 0xe8dcc0 : 0x4a6aa0)); }
  // a bowl of glowcaps
  ring(g, 36, 10, 2, 4.4, Ht + 1, Ht + 4, 0x9a6a3e);
  for (let k = 0; k < 4; k++) { gl.set(34 + (k % 2) * 3, Ht + 4 + (k >> 1), 9 + (k % 2), 0x7ae0f0); }
  const L2 = (x, y, z) => ({ x: T(x - L / 2), y: T(y), z: T(z - Wd / 2) });
  return { obj: group(M32(g, [L / 2, 0, Wd / 2]), G32(gl, [L / 2, 0, Wd / 2])), candle: L2(cx - 0.5, Ht + 15, Wd / 2 - 0.5), bowl: L2(36, Ht + 5, 10) };
}

// ---------------------------------------------------------------- the living room
/**
 * A tall bookcase full of books (wall piece, w × h m): five shelves of spines, a few lying in stacks
 * or leaning, a carved cornice, odds on the top shelf (a candle, a globe of the surface, a fossil).
 */
export function bookcase(w = 1.2, h = 1.6, seed = 71) {
  const W = vm(w), Hh = vm(h), D = 20;
  const g = new VoxelGrid(W + 4, Hh + 10, D + 4), gl = new VoxelGrid(W + 4, Hh + 10, D + 4);
  const x0 = 2;
  const cw = wood(H.walnut, { axis: 'y', pw: 99, seed });
  // carcass: sides, back, plinth, cornice
  g.box(x0, 0, 0, W, Hh, 2, (x, y) => mulc(0x3a2414, (Math.floor(x / 9) % 2 ? 0.95 : 1.05))); // the back boards
  for (const sx of [x0, x0 + W - 4]) g.box(sx, 0, 0, 4, Hh, D, cw);
  g.box(x0, 0, 0, W, 8, D + 1, (x, y, z) => (y === 7 ? mulc(H.walnut, 1.15) : mulc(H.walnut, 0.85)));
  for (let k = 0; k < 4; k++) g.box(x0 - k + 1, Hh - 4 + k * 2, 0, W + k * 2 - 2, 2, D + 1 + k, (x, y, z) => mulc(H.walnut, 0.9 + k * 0.07));
  g.box(x0 + 6, Hh + 4, 0, W - 12, 4, D - 4, (x) => (x % 5 === 0 ? mulc(H.walnut, 1.2) : H.walnut)); // the crest
  const n = Math.max(3, Math.round((Hh - 14) / 28));
  const ys = [];
  for (let k = 0; k <= n; k++) ys.push(8 + Math.round((k * (Hh - 12 - 8)) / n));
  for (const y of ys.slice(1, -1)) g.box(x0 + 4, y, 0, W - 8, 2, D, (x, y2, z) => (z === D - 1 ? mulc(H.walnut, 1.18) : H.walnut));
  for (let s = 0; s < ys.length - 1; s++) {
    const y = ys[s] + (s === 0 ? 0 : 2), room = ys[s + 1] - y;
    if (s === ys.length - 2) {
      // the top shelf: odds and ends
      books(g, x0 + 4, x0 + W / 2, y, 3, D - 6, room - 4, seed + s);
      const gx = x0 + W / 2 + 10;
      g.ellipsoid(gx, y + 9, D / 2, 6, 6, 6, (x, yy, z) => (n2h(x, yy, z) ? 0x3a8a4a : 0x3a6ab0)); // a globe of the surface
      g.box(gx - 1, y, D / 2 - 1, 3, 3, 3, P.brass);
      g.box(x0 + W - 18, y, 6, 8, 3, 8, 0x8a8076); for (let j = 0; j < 4; j++) g.set(x0 + W - 17 + j * 2, y + 3, 9, 0xd8ccb0); // a fossil
      candle(g, gl, x0 + W - 9, y, D - 7, 6);
      continue;
    }
    books(g, x0 + 4, x0 + W - 4, y, 3, D - 6, room - 3, seed + s * 7);
  }
  return { obj: group(M32(g, [(W + 4) / 2, 0, 0]), G32(gl, [(W + 4) / 2, 0, 0])), candle: { x: T(x0 + W - 8 - (W + 4) / 2), y: T(ys[ys.length - 2] + 12), z: T(D - 6) } };
}
const n2h = (x, y, z) => ((x * 3 + y * 5 + z * 7) % 11) < 4;

/**
 * The grandfather clock (floor piece against a wall, front +z): a walnut case with a hood, a white
 * dial with hands, brass finials, a glass door onto the pendulum (`pendulum`: a group to swing,
 * pivot at its top). Returns { obj, pendulum, dial (local tiles) }.
 */
export function grandfatherClock(seed = 73) {
  const W = 30, D = 18, Hh = 104;
  const g = new VoxelGrid(W + 4, Hh + 10, D + 2), gl = new VoxelGrid(W + 4, Hh + 10, D + 2);
  const cw = wood(H.walnut, { axis: 'y', pw: 99, seed });
  const x0 = 2;
  g.box(x0, 0, 0, W, 14, D, (x, y, z) => (y === 13 ? mulc(H.walnut, 1.15) : mulc(H.walnut, 0.9))); // plinth
  g.box(x0 + 3, 14, 1, W - 6, 58, D - 3, cw); // the trunk
  // the trunk door: a glass window onto the pendulum
  for (let y = 22; y < 66; y++) for (let x = x0 + 8; x < x0 + W - 8; x++) {
    const edge = y === 22 || y === 65 || x === x0 + 8 || x === x0 + W - 9;
    if (edge) g.set(x, y, D - 2, mulc(H.walnut, 1.2));
    else g.clear(x, y, D - 2), g.set(x, y, 3, 0x2a1a10);
  }
  g.box(x0 + W - 10, 42, D - 1, 1, 3, 1, P.brass); // keyhole
  g.box(x0, 72, 0, W, 4, D, (x, y) => mulc(H.walnut, 1.1)); // waist moulding
  // the hood with the dial
  g.box(x0 + 1, 76, 0, W - 2, 26, D, cw);
  const dc = x0 + W / 2, dy = 89;
  for (let y = 78; y < 101; y++) for (let x = x0 + 3; x < x0 + W - 3; x++) {
    const d = Math.hypot(x + 0.5 - dc, y + 0.5 - dy);
    if (d < 10.5) g.set(x, y, D, d > 9.5 ? P.brass : 0xf2ead8);
  }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.set(Math.round(dc - 0.5 + Math.cos(a) * 8), Math.round(dy - 0.5 + Math.sin(a) * 8), D + 1, 0x2a2018); }
  line(g, [[dc, dy, D + 1], [dc + 4, dy + 4, D + 1]], 0.5, 0x1a1410);
  line(g, [[dc, dy, D + 1], [dc - 1, dy + 7, D + 1]], 0.5, 0x1a1410);
  // the moon phase arch: a little painted moon over the dial
  g.box(dc - 3, 99, D, 6, 2, 1, 0x2a3a6a); g.set(dc, 100, D + 1, 0xf0e8b0);
  // the pediment and finials
  for (let k = 0; k < 5; k++) g.box(x0 + k, 102 + k, 0, W - k * 2, 1, D, mulc(H.walnut, 1.05));
  for (const fx of [x0 + 2, dc - 1, x0 + W - 4]) { g.box(fx, 102 + (fx === dc - 1 ? 5 : 0), D / 2 - 1, 2, 3, 2, P.brass); g.set(fx, 105 + (fx === dc - 1 ? 5 : 0), D / 2 - 1, P.brassL); }
  // the pendulum: a rod and a brass bob (its own mesh, pivot at the top)
  const pg = new VoxelGrid(10, 40, 4);
  pg.box(4, 10, 1, 2, 30, 1, 0x8a8a92);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.hypot(x + 0.5 - 5, y + 0.5 - 5) < 4.6) pg.box(x, y, 0, 1, 1, 2, Math.hypot(x + 0.5 - 4, y + 0.5 - 6) < 2 ? P.brassL : P.brass);
  const pm = M32(pg, [5, 40, 1]);
  const pendulum = new THREE.Group();
  pendulum.add(pm);
  pendulum.position.set(0, T(64), T(5 - (D + 2) / 2));
  pendulum.userData.noBatch = true;
  pm.userData.noBatch = true;
  const obj = group(M32(g, [(W + 4) / 2, 0, (D + 2) / 2]), G32(gl, [(W + 4) / 2, 0, (D + 2) / 2]), pendulum);
  return { obj, pendulum, dial: { x: 0, y: T(dy), z: T(D - (D + 2) / 2) } };
}

/**
 * Old Star's trinket shelf (wall piece, two shelves): his life in odds and ends. The torn Surface
 * Express ticket framed, a jar of coins with "THE WAY UP" on it, a tin model of the train, a seashell
 * from the surface, his first pick head, a medal on a ribbon, a dried flower in a bottle, photos.
 */
export function trinketShelf(len = 1.1, seed = 75) {
  const L = vm(len), D = 14;
  const g = new VoxelGrid(L + 4, 70, D + 2), gl = new VoxelGrid(L + 4, 70, D + 2);
  const pl = wood(H.oakM, { axis: 'x', across: 'z', pw: 99, seed });
  for (const y of [0, 34]) {
    g.box(2, y, 0, L, 3, D, (x, yy, z) => (yy === y + 2 ? mulc(pl(x, yy, z), 1.08) : pl(x, yy, z)));
    for (const bx of [8, L - 6]) for (let yy = y - 8; y > 0 && yy < y; yy++) g.box(bx, yy, 0, 2, 1, Math.max(1, Math.round((yy - y + 9) * 1.4)), H.oakD);
  }
  const y1 = 3, y2 = 37;
  // the framed ticket: cream card, a red stripe, "ADMIT ONE", torn in half and glued
  const fx = 6;
  g.box(fx, y1, 2, 26, 18, 2, (x, y) => (x === fx || x === fx + 25 || y === y1 || y === y1 + 17 ? P.brassD : 0x3a2a24));
  for (let y = y1 + 3; y < y1 + 15; y++) for (let x = fx + 3; x < fx + 23; x++) {
    let c = y > y1 + 11 ? 0xb83a2a : 0xf0e4c4;
    if (x === fx + 13 + ((y >> 1) % 2)) c = 0x8a7a5a; // the tear
    if (y === y1 + 8 && x > fx + 5 && x < fx + 20 && x % 2) c = 0x3a2a22; // the print
    if (y === y1 + 5 && x > fx + 8 && x < fx + 17) c = 0x3a2a22;
    g.set(x, y, 4, c);
  }
  g.box(fx + 6, y1 - 1, 5, 14, 2, 3, mulc(H.oakM, 0.8)); // its little stand
  // the jar of coins
  const jx = fx + 36;
  for (let yy = 0; yy < 16; yy++) ring(g, jx, D / 2, 0, 5, y1 + yy, y1 + yy + 1, (x, y, z) => (yy < 10 ? (h3(x, y, z, 4) < 0.3 ? 0xf2c23a : 0xc89a2a) : Math.hypot(x + 0.5 - jx, z + 0.5 - D / 2) > 4 ? mixc(H.glass, 0xffffff, 0.3) : -1));
  ring(g, jx, D / 2, 0, 5.3, y1 + 16, y1 + 18, 0x8a6a3a);
  g.box(jx - 4, y1 + 5, D / 2 + 4, 8, 4, 1, 0xeadcbe); g.box(jx - 3, y1 + 6, D / 2 + 5, 6, 1, 1, 0x3a2a22);
  // the tin train: engine and a carriage
  const tx = jx + 12;
  g.box(tx, y1, 3, 14, 7, 8, (x, y) => (y === y1 + 6 ? 0x2a2a30 : 0xb83a2a)); g.box(tx + 10, y1 + 7, 4, 3, 5, 3, 0x2a2a30);
  g.box(tx + 2, y1 + 7, 3, 6, 5, 8, 0x3a5a8a); g.set(tx + 4, y1 + 9, 11, 0xffe080);
  for (const wx of [tx + 2, tx + 7, tx + 11]) ring(g, wx, 11, 0, 2, y1, y1 + 1, 0x1a1a1e);
  g.box(tx + 15, y1, 3, 12, 8, 8, (x, y) => (y > y1 + 2 && y < y1 + 6 && x % 3 === 0 ? 0xffe8a0 : 0x2a6a4a));
  // a seashell
  const sx = tx + 33;
  for (let k = 0; k < 7; k++) line(g, [[sx, y1 + 1, D / 2 + 2], [sx + Math.cos(k * 0.45 + 0.3) * 7, y1 + 1 + Math.sin(k * 0.45 + 0.3) * 7, D / 2]], 0.8, k % 2 ? 0xf0d8c8 : 0xe8b8a0);
  // second shelf: a medal on a ribbon, his first pick head, a dried flower in a bottle, two photos
  let x = 8;
  g.box(x, y2, 4, 4, 14, 1, (xx) => (xx % 2 ? 0x3a5aa8 : 0xc83a2a)); g.box(x - 1, y2, 5, 6, 5, 1, P.brass); g.set(x + 1, y2 + 2, 6, P.brassL);
  x += 10;
  line(g, [[x, y2 + 2, 6], [x + 14, y2 + 6, 6], [x + 18, y2 + 2, 6]], 1.4, (xx, y) => (y > y2 + 4 ? 0x8a8a96 : 0x6a6a74)); g.set(x + 3, y2 + 3, 7, P.rust);
  x += 24;
  bottle(g, x, y2 + 3, D / 2, 2.2, 8, 0x5a7a6a);
  for (let k = 0; k < 3; k++) { line(g, [[x, y2 + 14, D / 2], [x - 3 + k * 3, y2 + 22, D / 2]], 0.5, 0x6a7a3a); g.set(x - 3 + k * 3, y2 + 23, D / 2, [0xd8a0c0, 0xe8d070, 0xb0a0e0][k]); }
  x += 10;
  for (const [k, w2, h2] of [[1, 14, 18], [2, 12, 15]]) {
    g.box(x, y2 + 3, 3, w2, h2, 2, (xx, y) => (xx === x || xx === x + w2 - 1 || y === y2 + 3 || y === y2 + 2 + h2 ? P.brassD : sepia(xx - x, y - y2 - 3, k)));
    g.box(x + 3, y2 + 3, 5, w2 - 6, 1, 3, H.oakD);
    x += w2 + 4;
  }
  // a candle stub in a saucer at the end
  ring(g, L - 6, D / 2, 0, 3, y2 + 3, y2 + 4, 0xe8dcc0);
  candle(g, gl, L - 7, y2 + 4, D / 2 - 1, 4, P.waxD);
  return { obj: group(M32(g, [(L + 4) / 2, 0, 0]), G32(gl, [(L + 4) / 2, 0, 0])), candle: { x: T(L - 6.5 - (L + 4) / 2), y: T(y2 + 10), z: T(D / 2) } };
}

/** 3×5 chalk letters. */
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', W: '101101111111101', Y: '101101010010010',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110', ',': '000000000010100', ' ': '000000000000000', '!': '010010010000010', '?': '110001010000010', '.': '000000000000010',
};
/** Chalk a line of text at (x, y) (top-left) onto layer z of grid g. Returns its width. */
function chalk(g, text, x, y, z, col = 0xe8e4dc) {
  let cx = x;
  for (const ch of text) {
    const f = FONT[ch] || FONT[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (f[j * 3 + i] === '1') g.set(cx + i, y - j, z, col);
    cx += 4;
  }
  return cx - x;
}

/**
 * The dream wall: a big slate in an oak frame, chalked "THE WAY UP" over a thermometer to a million
 * gold, filled nearly halfway once and then rubbed out to the bottom ("LONG STORY"), with tally marks
 * of the years down the side and a sketch of the Surface Express. Wall piece. Returns { obj }.
 */
export function tallyBoard(seed = 77) {
  const W = 70, Hh = 56;
  const g = new VoxelGrid(W, Hh, 4);
  g.box(0, 0, 0, W, Hh, 2, (x, y) => (x < 3 || y < 3 || x >= W - 3 || y >= Hh - 3 ? mulc(H.oakM, (x + y) % 6 === 0 ? 0.85 : 1) : mixc(0x2a3230, 0x3a4240, hash2(x >> 2, y >> 2, seed) * 0.4)));
  const z = 2;
  chalk(g, 'THE WAY UP', 6, Hh - 6, z);
  // the thermometer: a long bulb-ended tube with notches to 1,000,000
  const tx = 12, ty0 = 8, ty1 = Hh - 14;
  for (let y = ty0; y < ty1; y++) { g.set(tx - 2, y, z, 0xd8d4cc); g.set(tx + 2, y, z, 0xd8d4cc); }
  for (let k = 0; k <= 10; k++) { const y = Math.round(ty0 + ((ty1 - ty0) * k) / 10); g.set(tx + 3, y, z, 0xd8d4cc); g.set(tx + 4, y, z, 0xd8d4cc); }
  for (let y = 4; y < 8; y++) for (let x = tx - 3; x <= tx + 3; x++) if (Math.hypot(x - tx, y - 6) < 3) g.set(x, y, z, 0xc84a3a);
  // the old high-water mark (near half), smudged out, and the little bit since
  const half = Math.round(ty0 + (ty1 - ty0) * 0.48);
  for (let y = ty0; y < half; y++) for (let x = tx - 1; x <= tx + 1; x++) g.set(x, y, z, hash2(x, y, seed) < 0.4 ? 0x5a6260 : 0x484e4c);
  for (let x = tx + 5; x < tx + 18; x++) g.set(x, half, z, 0xe8e4dc);
  chalk(g, '480000', tx + 6, half + 6, z, 0xd8d4cc);
  for (let y = ty0; y < ty0 + 4; y++) for (let x = tx - 1; x <= tx + 1; x++) g.set(x, y, z, 0xc84a3a);
  chalk(g, '1000000', tx + 6, ty1 + 2, z, 0xf0e070);
  // an arrow from the mark down to the bottom, and "LONG STORY"
  line(g, [[tx + 20, half - 2, z], [tx + 22, ty0 + 6, z]], 0.4, 0xe8e4dc);
  chalk(g, 'LONG', tx + 26, ty0 + 14, z); chalk(g, 'STORY', tx + 24, ty0 + 7, z);
  // tally marks of the years along the right
  for (let k = 0; k < 12; k++) {
    const bx = W - 22 + (k % 3) * 6, by = Hh - 12 - Math.floor(k / 3) * 8;
    for (let j = 0; j < 4; j++) for (let y = 0; y < 5; y++) g.set(bx + j, by - y, z, 0xd8d4cc);
    for (let j = 0; j < 5; j++) g.set(bx - 1 + j, by - 1 - j, z, 0xd8d4cc);
  }
  // a little sketch of the train going up a line to a sun
  line(g, [[W - 30, 8, z], [W - 6, 22, z]], 0.4, 0xd8d4cc);
  g.box(W - 22, 12, z, 6, 3, 1, 0xe8e4dc);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.set(Math.round(W - 7 + Math.cos(a) * 4), Math.round(27 + Math.sin(a) * 4), z, 0xf0e070); }
  // a stub of chalk and a rag on the frame's ledge
  g.box(8, 0, 2, W - 16, 2, 2, mulc(H.oakM, 1.1));
  g.box(20, 2, 2, 4, 1, 1, 0xf0ece0); g.box(30, 2, 2, 7, 2, 2, 0x9a8a7a);
  return { obj: M32(g, [W / 2, 0, 0]) };
}

/** The packed suitcase by the front door (the almost-escape): leather, straps, travel labels, his hat on it, dusty. */
export function suitcase(seed = 79) {
  const W = 40, Hh = 26, D = 14;
  const g = new VoxelGrid(W + 4, Hh + 14, D + 4);
  const dust = (c, x, y, z) => (y > Hh - 3 && h3(x, y, z, seed) < 0.5 ? mixc(c, 0xb8aa98, 0.45) : c);
  g.box(2, 0, 2, W, Hh, D, (x, y, z) => dust(y === Math.round(Hh / 2) ? 0x4a2a1a : h3(x, y, z, seed) < 0.06 ? 0x8a5a3a : 0x6a3e26, x, y, z));
  for (const sx of [10, W - 8]) g.box(sx, 0, 1, 3, Hh + 1, D + 2, (x, y) => (y === 18 ? P.brass : 0x3a2214)); // straps
  g.box(W / 2 - 4, Hh, D / 2, 10, 4, 3, 0x3a2214); g.box(W / 2 - 2, Hh + 1, D / 2, 6, 2, 3, -1); // the handle
  // travel labels: SURFACE EXPRESS (red), a sun, a round one
  g.box(5, 5, D + 2, 10, 7, 1, (x, y) => (y === 5 || y === 11 ? 0xf0e4c4 : 0xb83a2a));
  g.box(24, 12, D + 2, 8, 8, 1, (x, y) => (Math.hypot(x + 0.5 - 28, y + 0.5 - 16) < 3 ? 0xf0c040 : 0x3a6a9a));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x - 3.5, y - 3.5) < 4) g.set(16 + x, 15 + y, D + 2, Math.hypot(x - 3.5, y - 3.5) > 3 ? 0x2a4a2a : 0xe8dcc0);
  // his old travelling hat on top, dusty
  for (let y = 0; y < 8; y++) ring(g, W / 2 + 2, D / 2 + 2, 0, y === 0 ? 9 : 6, Hh + y, Hh + y + 1, (x, yy, z) => (yy === Hh + 2 ? 0x8a2a24 : dust(0x3a3430, x, yy + 3, z)));
  return { obj: M32(g, [(W + 4) / 2, 0, (D + 4) / 2]) };
}

/** A pair of boots on a rush mat and a walking stick with an old umbrella in a crock by the door. */
export function bootsAndStick(seed = 81) {
  const g = new VoxelGrid(50, 70, 24);
  g.box(0, 0, 2, 34, 1, 20, (x, z) => ((x + z) % 3 ? 0xb89a5a : 0x9a7a4a));
  for (const [bx, bz] of [[4, 5], [17, 7]]) {
    g.box(bx, 1, bz, 10, 4, 6, 0x3a2418); g.box(bx, 1, bz, 5, 14, 6, (x, y) => (y === 14 ? 0x2a1a10 : 0x4a2e1c)); g.box(bx + 1, 13, bz - 1, 3, 2, 1, 0x8a8a92);
    g.box(bx + 6, 5, bz + 1, 4, 1, 4, 0x6a4a2e);
  }
  // the crock with a stick and an umbrella
  for (let y = 0; y < 22; y++) ring(g, 42, 12, y < 20 ? 4 : 0, 6, y, y + 1, (x, yy) => (yy % 7 === 0 ? 0x4a6a9a : 0xd8ccb0));
  line(g, [[41, 2, 11], [40, 56, 13], [36, 60, 13]], 0.9, 0x6a4428);
  for (let y = 18; y < 52; y++) { const r = y < 46 ? 1.5 + (y - 18) * 0.06 : 3.4 - (y - 46) * 0.4; ring(g, 44, 12, 0, r, y, y + 1, y % 6 === 0 ? 0x1a2a3a : 0x2a3a5a); }
  line(g, [[44, 52, 12], [44, 62, 12], [41, 64, 12]], 0.6, 0x3a2418);
  return { obj: M32(g, [25, 0, 12]) };
}

// ---------------------------------------------------------------- bedrooms
/**
 * A wardrobe (floor piece against a wall, front +z): two panelled doors with brass knobs, a carved
 * cornice, a drawer below, a hatbox and a rolled blanket on top, a scarf caught in the door.
 */
export function wardrobe(seed = 83) {
  const W = 58, D = 28, Hh = 92;
  const g = new VoxelGrid(W + 4, Hh + 18, D + 3);
  const x0 = 2;
  const cw = wood(H.oakM, { axis: 'y', pw: 99, seed });
  g.box(x0, 0, 0, W, 8, D, (x, y) => (y === 7 ? mulc(H.oakM, 1.15) : mulc(H.oakM, 0.8)));
  for (const fx of [x0, x0 + W - 3]) g.box(fx, 0, D - 3, 3, 4, 3, H.oakD); // feet
  g.box(x0, 8, 0, W, Hh - 8, D, cw);
  // the drawer
  g.box(x0 + 3, 10, D, W - 6, 12, 1, (x, y) => (y === 10 || y === 21 || x === x0 + 3 || x === x0 + W - 4 ? mulc(H.oakM, 1.12) : H.oakM));
  for (const kx of [x0 + 14, x0 + W - 16]) g.box(kx, 15, D + 1, 3, 2, 1, P.brass);
  // two doors with raised panels
  for (const [d0, d1] of [[x0 + 3, x0 + W / 2 - 1], [x0 + W / 2 + 1, x0 + W - 3]]) {
    for (let y = 25; y < Hh - 6; y++) for (let x = d0; x < d1; x++) {
      const edge = x < d0 + 4 || x >= d1 - 4 || y < 29 || y >= Hh - 10 || Math.abs(y - (Hh + 19) / 2) < 2;
      g.set(x, y, D, edge ? mulc(cw(x, y, D), 1.1) : mulc(cw(x, y, D), 0.92));
      if (!edge && (x === d0 + 4 || y === 29 || y === Math.round((Hh + 19) / 2) + 2)) g.set(x, y, D, mulc(H.oakM, 0.75));
    }
  }
  for (const kx of [x0 + W / 2 - 4, x0 + W / 2 + 2]) { g.box(kx, 52, D + 1, 2, 3, 1, P.brass); g.set(kx, 53, D + 2, P.brassL); }
  // a red scarf caught in the doors
  line(g, [[x0 + W / 2, 60, D + 1], [x0 + W / 2 + 2, 48, D + 2], [x0 + W / 2 + 1, 38, D + 2]], 1.0, 0xb8402a);
  // the cornice
  for (let k = 0; k < 4; k++) g.box(x0 - k + 1, Hh - 2 + k * 2, 0, W + k * 2 - 2, 2, D + k, mulc(H.oakM, 0.9 + k * 0.06));
  // on top: a striped hatbox and a rolled blanket
  for (let y = 0; y < 12; y++) ring(g, x0 + 16, D / 2, 0, 9, Hh + 6 + y, Hh + 7 + y, (x, yy) => (yy === Hh + 17 ? 0xd8c8a0 : (x >> 1) % 2 ? 0xe0d0b0 : 0x6a8aa0));
  for (let x = x0 + 32; x < x0 + W - 6; x++) for (let y = 0; y < 10; y++) for (let z = 4; z < D - 4; z++) if (Math.hypot(y - 5, z - D / 2) < 5) g.set(x, Hh + 6 + y, z, (x % 6 < 2) ? 0x8a3a2a : 0xb8803a);
  return { obj: M32(g, [(W + 4) / 2, 0, (D + 3) / 2]) };
}

/** The bedside table: a drawer, a candle in a brass chamberstick, a book with spectacles, a cup. Returns { obj, candle }. */
export function bedsideTable(seed = 85) {
  const W = 26, D = 24, Ht = 30;
  const g = new VoxelGrid(W + 2, Ht + 22, D + 2), gl = new VoxelGrid(W + 2, Ht + 22, D + 2);
  const cw = wood(H.oakM, { axis: 'y', pw: 99, seed });
  for (const [x, z] of [[1, 1], [W - 3, 1], [1, D - 3], [W - 3, D - 3]]) g.box(x, 0, z, 3, Ht, 3, cw);
  g.box(1, 8, 1, W - 1, 2, D - 1, H.oakM); // the lower shelf
  g.box(1, Ht - 10, 1, W - 1, 10, D - 1, cw);
  g.box(3, Ht - 8, D, W - 5, 6, 1, (x, y) => (y === Ht - 8 || y === Ht - 3 ? mulc(H.oakM, 1.15) : H.oakM)); g.box(W / 2, Ht - 6, D + 1, 2, 2, 1, P.brass);
  g.box(0, Ht, 0, W + 2, 2, D + 2, (x, y, z) => (y === Ht + 1 ? mulc(H.oakL, sp3(x, y, z, seed, 0.1, 0.1)) : H.oakM));
  // a stack of two books on the lower shelf, slippers below? (a book on top with spectacles)
  g.box(4, 10, 4, 12, 4, 14, (x, y) => (y === 12 ? 0xe8dcc0 : 0x3a5a3a));
  g.box(4, Ht + 2, 12, 11, 2, 8, (x, y) => (x === 4 ? 0xe8dcc0 : 0x7a2a24)); g.box(6, Ht + 4, 14, 6, 1, 2, 0xc8a048);
  // the chamberstick
  ring(g, 18, 8, 0, 4, Ht + 2, Ht + 3, P.brass); g.box(21, Ht + 3, 7, 3, 2, 1, P.brass);
  candle(g, gl, 17, Ht + 3, 7, 8);
  // a cup of tea gone cold
  ring(g, 20, 18, 0, 2.6, Ht + 2, Ht + 6, (x, y) => (y === Ht + 5 ? 0x6a4a2a : 0xe8e0d0));
  return { obj: group(M32(g, [(W + 2) / 2, 0, (D + 2) / 2]), G32(gl, [(W + 2) / 2, 0, (D + 2) / 2])), candle: { x: T(17.5 - (W + 2) / 2), y: T(Ht + 14), z: T(7.5 - (D + 2) / 2) } };
}

/** A side table with an oil lamp (glass chimney, glowing), a pipe rack and a tobacco tin. Returns { obj, lamp }. */
export function lampTable(seed = 87) {
  const R = 13, Ht = 30;
  const g = new VoxelGrid(R * 2 + 2, Ht + 34, R * 2 + 2), gl = new VoxelGrid(R * 2 + 2, Ht + 34, R * 2 + 2);
  const c = R + 1;
  ring(g, c, c, 0, R, Ht, Ht + 2, (x, y, z) => (y === Ht + 1 ? mulc(H.oakL, sp3(x, y, z, seed, 0.1, 0.1)) : H.oakM));
  for (let y = 4; y < Ht; y++) ring(g, c, c, 0, 1.8 + (Math.abs(y - 16) < 2 ? 0.8 : 0), y, y + 1, H.oakM);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; line(g, [[c, 5, c], [c + Math.cos(a) * 9, 0, c + Math.sin(a) * 9]], 1.0, H.oakM); }
  // the lamp: a brass font, a glass chimney with the flame, a green shade
  const ly = Ht + 2;
  for (let y = 0; y < 8; y++) ring(g, c - 2, c, 0, 4 - Math.abs(y - 3) * 0.4, ly + y, ly + y + 1, y === 0 ? P.brassD : P.brass);
  for (let y = 8; y < 20; y++) ring(g, c - 2, c, 0, y < 11 ? 2 : 2.6, ly + y, ly + y + 1, (x, yy, z) => (Math.hypot(x + 0.5 - c + 2, z + 0.5 - c) > 1.8 ? mixc(H.glass, 0xffffff, 0.4) : -1));
  gl.box(c - 3, ly + 9, c - 1, 2, 5, 2, 0xffd070); gl.set(c - 3, ly + 14, c - 1, 0xfff4c8);
  for (let y = 16; y < 22; y++) ring(g, c - 2, c, Math.max(0, 6.5 - (y - 16) * 0.7) - 1.2, 6.5 - (y - 16) * 0.7, ly + y, ly + y + 1, y === 16 ? 0x2a5a3a : 0x3a7a4a);
  // a pipe rack and a tin
  g.box(c + 4, Ht + 2, c - 6, 6, 2, 12, H.oakD); for (let k = 0; k < 3; k++) line(g, [[c + 6, Ht + 4, c - 4 + k * 4], [c + 6, Ht + 9, c - 4 + k * 4]], 0.5, 0x3a2414);
  ring(g, c + 4, c + 8, 0, 2.6, Ht + 2, Ht + 5, (x, y) => (y === Ht + 4 ? P.brass : 0x8a2a24));
  return { obj: group(M32(g, [c, 0, c]), G32(gl, [c, 0, c])), lamp: { x: T(-2.5), y: T(ly + 12), z: T(-0.5) } };
}

/**
 * Old Star's box bed (wall piece, along the wall, head at -x): a cupboard bed of dark oak built
 * into the wall with a canopy, a curtain drawn back on a rail, a patchwork quilt, a pillow with his
 * nightcap, a shelf inside with a candle and his spectacles. Returns { obj, lie, candle }.
 */
export function boxBed(seed = 89) {
  const L = 92, D = 46, Hh = 104, BH = 18;
  const g = new VoxelGrid(L + 4, Hh + 4, D + 4), gl = new VoxelGrid(L + 4, Hh + 4, D + 4);
  const x0 = 2;
  const cw = wood(H.walnut, { axis: 'y', pw: 99, seed });
  // the carcass: back is the wall; ends, a canopy, a front rail at the foot
  for (const ex of [x0, x0 + L - 5]) g.box(ex, 0, 0, 5, Hh, D, (x, y, z) => (z === D - 1 || y === Hh - 1 ? mulc(cw(x, y, z), 1.12) : cw(x, y, z)));
  g.box(x0, Hh - 14, 0, L, 14, D, (x, y, z) => (y === Hh - 14 ? mulc(H.walnut, 0.7) : z === D - 1 ? mulc(cw(x, y, z), 1.1) : cw(x, y, z)));
  for (let x = x0 + 8; x < x0 + L - 8; x += 6) g.box(x, Hh - 12, D, 3, 9, 1, mulc(H.walnut, 1.18)); // carved fluting
  g.box(x0, 0, D - 6, L, BH - 4, 6, cw); // the bed board in front
  g.box(x0 + 5, BH - 6, 2, L - 10, 3, D - 8, H.oakM); // the base
  // mattress, quilt, pillow
  g.box(x0 + 5, BH - 3, 2, L - 10, 5, D - 8, (x, y, z) => ((z >> 1) % 3 === 0 ? 0xc8b890 : 0xe0d4b0));
  const pal = [0x8a3a2a, 0x5a6a48, 0xb8923e, 0x4a5a7a, 0x9a6a4a, 0x6a4a5a, 0xc8a878];
  for (let x = x0 + 22; x < x0 + L - 5; x++) for (let z = 2; z < D - 5; z++) {
    const lump = Math.round(Math.sin(x * 0.15) * Math.sin(z * 0.28) * 1.4);
    const sq = pal[Math.floor(hash2(Math.floor(x / 9), Math.floor(z / 9), seed) * pal.length)];
    const seam = x % 9 === 0 || z % 9 === 0;
    for (let y = BH + 2; y < BH + 4 + lump; y++) g.set(x, y, z, seam ? mulc(sq, 0.72) : mulc(sq, sp3(x, y, z, seed, 0.08, 0.1)));
  }
  for (let z = 2; z < D - 5; z++) g.box(x0 + 20, BH + 2, z, 3, 3, 1, 0xe8dcc0);
  g.ellipsoid(x0 + 13, BH + 5, D / 2 - 3, 7, 3.4, 12, (x, y, z) => (h3(x, y, z, 3) < 0.15 ? 0xd8ccb0 : 0xeae0c8));
  line(g, [[x0 + 13, BH + 8, D / 2 - 8], [x0 + 16, BH + 9, D / 2 - 13], [x0 + 19, BH + 7, D / 2 - 16]], (t) => 2.4 * (1 - t) + 0.6, 0xa83a2a);
  g.ellipsoid(x0 + 19.5, BH + 7, D / 2 - 16.5, 1.6, 1.6, 1.6, 0xf0e8d8);
  // a shelf inside at the head with a candle and his spare spectacles
  g.box(x0 + 5, 58, 2, 18, 2, 10, H.oakM);
  candle(g, gl, x0 + 9, 60, 5, 5);
  g.box(x0 + 14, 60, 4, 6, 1, 3, 0xc8a048);
  // the curtain on a rail under the canopy, drawn back to the foot end
  g.box(x0 + 5, Hh - 16, D - 3, L - 10, 1, 1, P.brass);
  for (let x = x0 + L - 26; x < x0 + L - 5; x++) for (let y = BH + 8; y < Hh - 16; y++) {
    const fold = Math.sin(x * 0.9) * 1.2;
    const tie = Math.abs(y - 50) < 2;
    const w = tie ? 0.6 : 1;
    if ((x - (x0 + L - 26)) / 21 < 1 - w * 0.0) g.box(x, y, D - 4 + Math.round(fold), 1, 1, 2, tie ? 0xc8a048 : (Math.floor(x / 3) % 2 ? 0x7a2a3a : 0x8a3442));
  }
  const L2 = (x, y, z) => ({ x: T(x - (L + 4) / 2), y: T(y), z: T(z - (D + 4) / 2) });
  return { obj: group(M32(g, [(L + 4) / 2, 0, 0]), G32(gl, [(L + 4) / 2, 0, 0])), lie: { x: T(x0 + 14 - (L + 4) / 2), y: T(BH + 6), z: T(D / 2 - 3) }, foot: { x: T(x0 + L - 10 - (L + 4) / 2), z: T(D / 2 - 3) }, candle: L2(x0 + 9.5, 69, 5.5) };
}

// ---------------------------------------------------------------- plants, rugs, pictures
/** Potted cave plants: 'fern' (a big fern in a clay pot), 'glowcap' (glowing mushrooms, returns glow), 'spike' (a spiky blue cave succulent), 'trail' (a trailing vine on a stand). */
export function pottedPlant(kind = 'fern', seed = 91) {
  const g = new VoxelGrid(40, 70, 40), gl = new VoxelGrid(40, 70, 40);
  const c = 20;
  const potH = kind === 'trail' ? 10 : 14, potR = kind === 'fern' ? 8 : 7;
  const y0 = kind === 'trail' ? 26 : 0;
  if (kind === 'trail') { for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; line(g, [[c + Math.cos(a) * 3, y0, c + Math.sin(a) * 3], [c + Math.cos(a) * 8, 0, c + Math.sin(a) * 8]], 0.9, H.oakD); } ring(g, c, c, 0, 5, y0 - 1, y0, H.oakD); }
  for (let y = 0; y < potH; y++) ring(g, c, c, y < potH - 2 ? 0 : potR - 1.5, potR - (potH - y) * 0.12, y0 + y, y0 + y + 1, (x, yy, z) => (yy >= y0 + potH - 2 ? 0x9a4a2a : h3(x, yy, z, seed) < 0.08 ? 0xc87a52 : 0xb85a34));
  ring(g, c, c, 0, potR - 1.5, y0 + potH - 2, y0 + potH - 1, 0x3a2a1a);
  const top = y0 + potH - 1;
  if (kind === 'fern') {
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2 + hash2(k, 1, seed), len = 14 + hash2(k, 2, seed) * 12, up = 10 + hash2(k, 3, seed) * 16;
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([c + Math.cos(a) * len * t, top + up * Math.sin(t * Math.PI * 0.7) , c + Math.sin(a) * len * t]); }
      line(g, pts, 0.6, (x, y, z, t) => (t > 0.85 ? 0x8ac05a : 0x4a8a3a));
      for (let i = 1; i < 6; i++) { const p = pts[i]; g.set(Math.round(p[0] + Math.sin(a) * 1.5), Math.round(p[1] - 0.5), Math.round(p[2] - Math.cos(a) * 1.5), 0x5a9a42); g.set(Math.round(p[0] - Math.sin(a) * 1.5), Math.round(p[1] - 0.5), Math.round(p[2] + Math.cos(a) * 1.5), 0x6aaa4a); }
    }
  } else if (kind === 'glowcap') {
    for (let k = 0; k < 6; k++) {
      const a = k * 1.1 + seed, r = k ? 3 + hash2(k, 1, seed) * 3 : 0, h = 8 + hash2(k, 2, seed) * 14, cr = 3 + hash2(k, 3, seed) * 3;
      const x = c + Math.cos(a) * r, z = c + Math.sin(a) * r;
      line(g, [[x, top, z], [x + Math.cos(a), top + h, z + Math.sin(a)]], 0.8, 0xe8e0d0);
      for (let j = 0; j < cr * 0.7; j++) ring(gl, x + Math.cos(a), z + Math.sin(a), 0, cr * Math.sqrt(1 - (j / (cr * 0.7)) ** 2), top + h + j, top + h + j + 1, j === 0 ? 0x2a9ab0 : (xx, yy, zz) => (h3(xx, yy, zz, k) < 0.15 ? 0xd8faff : 0x5ad0e0));
    }
  } else if (kind === 'spike') {
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2, lean = 0.25 + hash2(k, 1, seed) * 0.45, h = 14 + hash2(k, 2, seed) * 16;
      line(g, [[c, top, c], [c + Math.cos(a) * h * lean, top + h, c + Math.sin(a) * h * lean]], (t) => 2.2 * (1 - t) + 0.4, (x, y, z, t) => (t > 0.85 ? 0xd8f0ff : t > 0.5 ? 0x5a9ab0 : 0x3a7a8a));
    }
    gl.set(c, top + 4, c + 2, 0xffa0d0); gl.set(c + 1, top + 5, c + 2, 0xffd0e8);
  } else {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, len = 20 + hash2(k, 1, seed) * 22;
      const pts = [[c, top + 1, c]];
      for (let i = 1; i <= 6; i++) { const t = i / 6; pts.push([c + Math.cos(a) * (6 + t * 4), top + 1 - t * len + Math.sin(t * 3) * 2, c + Math.sin(a) * (6 + t * 4)]); }
      line(g, pts, 0.6, 0x3a6a2a);
      for (let i = 1; i < pts.length; i++) g.set(Math.round(pts[i][0] + 1), Math.round(pts[i][1]), Math.round(pts[i][2]), i % 2 ? 0x6aaa4a : 0x5a9a3a);
    }
  }
  return { obj: group(M32(g, [c, 0, c]), G32(gl, [c, 0, c])), glow: kind === 'glowcap' ? { x: 0, y: T(top + 16), z: 0 } : null };
}

/** A big woven rug (w × d m): a border of bands, a field of diamonds, worn pale in the middle, fringes. */
export function bigRug(w = 2.4, d = 1.6, seed = 93, pal = [0x8a2a24, 0x2a3a5a, 0xc89a3a, 0xe0d0a8, 0x3a5a3a]) {
  const W = vm(w), D = vm(d);
  const g = new VoxelGrid(W + 8, 2, D);
  const [field, border, gold, cream, green] = pal;
  for (let z = 0; z < D; z++) for (let x = 0; x < W + 8; x++) {
    if (x < 4 || x >= W + 4) { if (z % 2 === 0 && hash2(x, z, seed) < 0.85) g.set(x, 0, z, 0xd8c8a0); continue; }
    const lx = x - 4;
    const e = Math.min(lx, z, W - 1 - lx, D - 1 - z);
    let c;
    if (e < 3) c = border;
    else if (e < 5) c = cream;
    else if (e < 9) c = (lx + z) % 4 < 2 ? gold : border;
    else if (e < 11) c = cream;
    else {
      const cx = W / 2, cz = D / 2;
      const dm = Math.abs(lx - cx) / (W / 2 - 11) + Math.abs(z - cz) / (D / 2 - 11);
      const tile = (Math.abs((lx % 24) - 12) + Math.abs((z % 24) - 12));
      c = dm < 0.32 ? (dm < 0.2 ? gold : green) : tile < 4 ? gold : tile === 7 ? cream : field;
    }
    // worn paler where feet go
    const wear = Math.max(0, 1 - Math.hypot((lx - W / 2) / (W * 0.4), (z - D / 2) / (D * 0.45)));
    if (hash2(lx >> 1, z >> 1, seed) < wear * 0.35) c = mixc(c, 0xb8a888, 0.35);
    g.set(x, 0, z, c);
    if (e < 3) g.set(x, 1, z, c); // the border bound a little thicker
  }
  return M32(g, [(W + 8) / 2, 0, D / 2], { outline: false });
}

/** A painting in a frame (wall piece): kind 'sea' | 'hills' | 'portrait' | 'train' | 'mountains'; w, h in m; frame 'gilt' | 'oak'. */
export function painting(kind = 'sea', w = 0.5, h = 0.36, frame = 'gilt', seed = 95) {
  const W = vm(w), Hh = vm(h), F = frame === 'gilt' ? 4 : 3;
  const g = new VoxelGrid(W + F * 2, Hh + F * 2, 4);
  const fc = frame === 'gilt' ? P.brass : H.oakD;
  for (let y = 0; y < Hh + F * 2; y++) for (let x = 0; x < W + F * 2; x++) {
    const e = Math.min(x, y, W + F * 2 - 1 - x, Hh + F * 2 - 1 - y);
    if (e < F) {
      let c = fc;
      if (frame === 'gilt') c = e === 0 ? P.brassD : e === F - 1 ? mulc(P.brass, 0.85) : (x + y) % 4 === 0 ? P.brassL : P.brass;
      else c = e === 0 ? mulc(H.oakD, 0.8) : H.oakD;
      g.box(x, y, 0, 1, 1, e === 1 || e === 2 ? 3 : 2, c);
    } else {
      const px = Math.floor((x - F) / 2), py = Math.floor((y - F) / 2);
      g.set(x, y, 1, picture(kind, px, py, Math.ceil(W / 2), Math.ceil(Hh / 2)));
    }
  }
  return M32(g, [(W + F * 2) / 2, 0, 0]);
}

/** A little oil lamp hanging from a beam on a chain (origin at the hook). Returns { obj, light }. */
export function hangingOilLamp(drop = 0.4, seed = 97) {
  const D = vm(drop);
  const g = new VoxelGrid(20, D + 30, 20), gl = new VoxelGrid(20, D + 30, 20);
  const c = 10;
  for (let y = 22; y < D + 30; y++) g.set(c, y, c, y % 3 ? P.iron : P.ironL);
  // brass font, glass chimney, a smoke bell and a little tin reflector shade
  for (let y = 0; y < 6; y++) ring(g, c, c, 0, 4 - Math.abs(y - 2) * 0.5, y, y + 1, P.brass);
  for (let y = 6; y < 17; y++) ring(g, c, c, 0, 3, y, y + 1, (x, yy, z) => (Math.hypot(x + 0.5 - c, z + 0.5 - c) > 2.2 ? mixc(H.glass, 0xffffff, 0.45) : -1));
  gl.box(c - 1, 7, c - 1, 2, 6, 2, 0xffd070); gl.set(c, 13, c, 0xfff4c8);
  for (let y = 17; y < 22; y++) ring(g, c, c, 0, 7 - (y - 17) * 1.2, y, y + 1, y === 17 ? 0x5a5a62 : 0x8a8a92);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; line(g, [[c + Math.cos(a) * 3.5, 4, c + Math.sin(a) * 3.5], [c, 22, c]], 0.4, P.brassD); }
  return { obj: group(M32(g, [c, D + 30, c]), G32(gl, [c, D + 30, c])), light: { x: 0, y: T(10 - D - 30), z: 0 } };
}

/** A wall sconce with a brass back plate and a candle under a glass chimney. Returns { obj, light }. */
export function brassSconce(seed = 99) {
  const g = new VoxelGrid(16, 30, 16), gl = new VoxelGrid(16, 30, 16);
  g.box(4, 6, 0, 8, 18, 1, (x, y) => (y === 6 || y === 23 || x === 4 || x === 11 ? P.brassD : P.brass));
  g.ellipsoid(8, 15, 0.5, 3, 3, 0.8, P.brassL);
  line(g, [[8, 8, 1], [8, 6, 6], [8, 6, 10]], 0.7, P.brassD);
  ring(g, 8, 10, 0, 3.4, 6, 7, P.brass);
  g.box(7, 7, 9, 2, 6, 2, P.wax); gl.set(7, 14, 9, 0xff9a3a); gl.set(7, 15, 9, 0xffd870); gl.set(7, 16, 9, 0xfff4c8);
  for (let y = 7; y < 20; y++) ring(g, 8, 10, 2.4, 3.2, y, y + 1, (x, yy, z) => (yy === 19 ? P.brass : h3(x, yy, z, seed) < 0.1 ? 0xffffff : mixc(H.glass, 0xffffff, 0.5)));
  return { obj: group(M32(g, [8, 0, 0]), G32(gl, [8, 0, 0])), light: { x: 0, y: T(14), z: T(10) } };
}

/** A footstool with a tapestry top. */
export function footstool(seed = 101) {
  const g = new VoxelGrid(26, 16, 18);
  for (const [x, z] of [[2, 2], [21, 2], [2, 13], [21, 13]]) g.box(x, 0, z, 3, 8, 3, H.oakM);
  g.box(1, 8, 1, 24, 2, 16, H.oakM);
  g.ellipsoid(13, 11, 9, 12, 3.6, 8, (x, y, z) => ((x + z) % 5 === 0 ? 0xc89a3a : (Math.abs(x - 13) + Math.abs(z - 9)) < 5 ? 0x3a5a3a : 0x7a2a3a));
  return { obj: M32(g, [13, 0, 9]), seat: { x: 0, y: T(14), z: 0 } };
}

/** A dresser of plates (wall piece): a cupboard below, open racks above with plates on edge, jugs on hooks. */
export function plateDresser(w = 0.95, seed = 103) {
  const W = vm(w), Hh = 100, D = 22;
  const g = new VoxelGrid(W + 4, Hh + 6, D + 2);
  const x0 = 2;
  const cw = wood(H.sage, { axis: 'y', pw: 99, seed });
  g.box(x0, 0, 0, W, 40, D, (x, y, z) => (z === D - 1 && (y < 3 || y > 36 || x < x0 + 3 || x > x0 + W - 4 || Math.abs(x - x0 - W / 2) < 1.5) ? mulc(cw(x, y, z), 1.1) : cw(x, y, z)));
  for (const kx of [x0 + W / 2 - 5, x0 + W / 2 + 4]) g.box(kx, 22, D, 1, 3, 1, P.brass);
  g.box(x0 - 1, 40, 0, W + 2, 3, D + 1, H.oakM); // the worktop
  // the rack: sides, back, two plate shelves with rails
  g.box(x0, 43, 0, W, Hh - 43, 2, mulc(H.sage, 0.85));
  for (const sx of [x0, x0 + W - 3]) g.box(sx, 43, 0, 3, Hh - 43, 12, cw);
  g.box(x0 - 1, Hh - 3, 0, W + 2, 3, 14, mulc(H.sage, 1.08));
  for (const sy of [62, 82]) {
    g.box(x0 + 3, sy, 0, W - 6, 2, 10, cw);
    g.box(x0 + 3, sy + 5, 9, W - 6, 1, 1, H.oakD);
    for (let x = x0 + 6; x < x0 + W - 8; x += 10) for (let y = 0; y < 16; y++) for (let xx = -8; xx <= 8; xx++) {
      const d = Math.hypot(xx, y - 8);
      if (d > 7.6) continue;
      g.set(x + 4 + xx * 0.6, sy + 2 + y * 0.9, 4, d > 6.8 ? 0x3a5a9a : d < 3 ? 0x5a7ab8 : (Math.round(d) % 3 === 0 ? 0x6a8ac8 : 0xf0ece0));
    }
  }
  // jugs hanging from hooks under the shelf
  for (let k = 0; k < 3; k++) {
    const jx = x0 + 10 + k * Math.round((W - 20) / 2);
    g.set(jx, 60, 8, P.brass);
    for (let y = 0; y < 8; y++) ring(g, jx, 8, 0, 2.8 - Math.abs(y - 3) * 0.2, 50 + y, 51 + y, [0xe8dcc0, 0x4a6aa0, 0xb85a3a][k]);
  }
  // a big bowl and a jug on the worktop
  ring(g, x0 + 14, 14, 3, 7, 43, 47, 0xf0ece0); ring(g, x0 + 14, 14, 0, 4, 43, 44, 0xf0ece0);
  for (let y = 0; y < 14; y++) ring(g, x0 + W - 14, 12, 0, 4 - Math.abs(y - 5) * 0.2 + (y > 11 ? -1 : 0), 43 + y, 44 + y, 0x4a6aa0);
  return { obj: M32(g, [(W + 4) / 2, 0, 0]) };
}

/** A wooden chair with a rush seat and a cushion (floor piece, front +z). Returns { obj, seat }. */
export function rushChair(seed = 105, cushion = 0x8a3a2a) {
  const W = 26, D = 24, SY = 17;
  const g = new VoxelGrid(W, 50, D);
  const cw = beam(H.oakM, 'y', seed);
  for (const [x, z] of [[1, D - 4], [W - 4, D - 4]]) g.box(x, 0, z, 3, SY, 3, cw);
  for (const x of [1, W - 4]) g.box(x, 0, 1, 3, 46, 3, cw); // the back legs go up as the back
  g.box(1, SY - 2, 1, W - 1, 2, D - 1, H.oakM);
  g.box(2, SY, 2, W - 3, 1, D - 3, (x, y, z) => ((x + z) % 3 ? 0xb89a5a : 0x9a7a4a)); // rush
  g.ellipsoid(W / 2, SY + 1.5, D / 2 + 1, W / 2 - 3, 1.8, D / 2 - 4, (x, y, z) => ((x + z) % 4 === 0 ? mulc(cushion, 1.2) : cushion));
  for (const y of [28, 36, 44]) g.box(1, y, 1, W - 1, 3, 2, (x) => mulc(H.oakM, x % 5 === 0 ? 1.15 : 1));
  for (const [x, z] of [[1, D - 4], [W - 4, D - 4], [1, 1], [W - 4, 1]]) g.box(x, 5, z, 1, 1, 1, H.oakM);
  g.box(2, 5, 2, 1, 1, D - 4, H.oakM); g.box(W - 3, 5, 2, 1, 1, D - 4, H.oakM);
  return { obj: M32(g, [W / 2, 0, D / 2]), seat: { x: 0, y: T(SY + 3), z: T(1) } };
}

export { jar, bottle, books, candle, chalk, lowRes, sag };

/**
 * The bedroom hearth (wall piece): a fieldstone fireplace with a round-arched firebox, an iron
 * basket of logs with live flames (`flames`, animated), a hearthstone, a timber mantel with
 * candlesticks, a little clock and a jar of spills, wool socks drying on a string under it, a stand
 * of fire irons at the side, and the chimney breast up to the ceiling (hh voxels).
 * Returns { obj, flames, fire, update(t), candles, irons (local tiles) }.
 */
export function bedroomHearth(hh = 144, seed = 107) {
  const W = 76, D = 22, FW = 34, FH = 32;
  const g = new VoxelGrid(W + 20, hh, D + 26), gl = new VoxelGrid(W + 20, hh, D + 26);
  const x0 = 10, cx = x0 + W / 2;
  const st = blocks(15, 10, seed, 0x857a70);
  const soot = (x, y) => Math.max(0, 1 - Math.hypot((x + 0.5 - cx) / (FW * 0.7), (y - FH) / 18)) * 0.8;
  const inFire = (x, y) => { const dx = x + 0.5 - cx; if (Math.abs(dx) > FW / 2 || y < 3) return false; if (y < FH - FW / 2) return true; return dx * dx + (y - (FH - FW / 2)) ** 2 <= (FW / 2) ** 2; };
  const MY = 50;
  for (let y = 0; y < MY; y++) for (let x = x0; x < x0 + W; x++) for (let z = 0; z < D; z++) {
    if (inFire(x, y) && z > 3) continue;
    const c = st(x, y, z);
    g.set(x, y, z, mixc(c, 0x1e1814, Math.min(0.7, soot(x, y) * (z > D - 3 ? 1 : 0.3))));
  }
  // the voussoirs round the arch and a keystone
  for (let y = FH - FW / 2; y < FH + 6; y++) for (let x = Math.round(cx - FW / 2 - 6); x < cx + FW / 2 + 6; x++) {
    if (inFire(x, y)) continue;
    const dx = x + 0.5 - cx, r = Math.hypot(dx, y - (FH - FW / 2));
    if (r > FW / 2 + 5 || y < FH - FW / 2) continue;
    const a = Math.atan2(y - (FH - FW / 2), dx);
    const seam = Math.abs(((a / Math.PI) * 7) % 1) < 0.12;
    const key = Math.abs(dx) < 3 && y > FH;
    g.box(x, y, D - 1, 1, 1, key ? 3 : 2, seam ? P.mortar : key ? mulc(0x9a8e80, 1.1) : mixc(0x8a8076, 0x2a2420, soot(x, y) * 0.5));
  }
  // the firebox: sooty brick back, a basket grate, logs, embers
  for (let y = 3; y < FH; y++) for (let x = x0; x < x0 + W; x++) {
    if (!inFire(x, y)) continue;
    g.set(x, y, 3, ((x + (y >> 2)) % 6 === 0 || y % 4 === 0) ? 0x1a1210 : mixc(0x6a2a1a, 0x1a1210, 0.5 + y / FH * 0.4));
  }
  g.box(Math.round(cx - FW / 2), 0, 4, FW, 3, D - 4, 0x2a2420);
  const bx0 = Math.round(cx - 12);
  for (let x = bx0; x < bx0 + 24; x++) for (const z of [8, D - 3]) { g.set(x, 6, z, P.iron); if (x % 4 === 0) for (let y = 3; y < 12; y++) g.set(x, y, z, P.iron); }
  for (let z = 8; z < D - 2; z += 3) g.box(bx0, 6, z, 24, 1, 1, P.iron);
  for (const [lz, ly, len, off] of [[11, 7, 22, 0], [15, 7, 20, 2], [13, 11, 18, -1]]) {
    for (let x = Math.round(cx - len / 2 + off); x < cx + len / 2 + off; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
      const d = Math.hypot(y - 1.5, z - 1.5);
      if (d > 2.1) continue;
      const end = x === Math.round(cx - len / 2 + off) || x === Math.round(cx + len / 2 + off) - 1;
      if (y < 2 && hash2(x, z, seed + 6) < 0.55) gl.set(x, ly + y, lz + z, hash2(x, y, seed) < 0.5 ? 0xff7a2a : 0xc8481a);
      else g.set(x, ly + y, lz + z, end ? 0xc8a070 : (x + y) % 5 === 0 ? 0x3a2416 : 0x4a3020);
    }
  }
  for (let x = bx0 + 1; x < bx0 + 23; x++) for (let z = 9; z < D - 3; z++) if (hash2(x, z, seed + 5) < 0.35) gl.set(x, 7, z, hash2(x, z, seed + 7) < 0.3 ? 0xffb050 : 0xc84a1a);
  // the hearthstone
  for (let x = x0 - 2; x < x0 + W + 2; x++) for (let z = D; z < D + 20; z++) {
    const slab = Math.floor((x - x0 + 2) / 26);
    g.box(x, 0, z, 1, z === D + 19 ? 2 : 3, 1, (x - x0 + 2) % 26 === 0 ? P.mortar : mulc([0x8a8078, 0x7a7068, 0x948a7e][slab % 3], sp3(x, 0, z, seed, 0.1, 0.1)));
  }
  // the mantel: an oak beam on corbels
  const mw = wood(H.oakM, { axis: 'x', across: 'z', pw: 99, seed: seed + 2 });
  g.box(x0 - 4, MY, 0, W + 8, 6, D + 6, (x, y, z) => (y === MY ? mulc(mw(x, y, z), 0.8) : y === MY + 5 ? mulc(mw(x, y, z), 1.1) : mw(x, y, z)));
  for (const kx of [x0 + 2, x0 + W - 8]) for (let y = MY - 10; y < MY; y++) g.box(kx, y, D, 6, 1, Math.max(1, Math.round(6 * (1 - ((MY - y) / 10) ** 2))), mulc(H.oakM, 0.9));
  const T0 = MY + 6;
  const cands = [];
  for (const x of [x0 + 5, x0 + W - 8]) { g.box(x - 1, T0, D - 4, 4, 1, 4, P.brass); g.box(x, T0 + 1, D - 3, 2, 5, 2, P.brass); candle(g, gl, x, T0 + 6, D - 3, 6); cands.push({ x: T(x + 1 - cx), y: T(T0 + 14), z: T(D - 2) }); }
  // a little carriage clock, a photo, a jar of spills
  g.box(cx - 5, T0, D - 6, 10, 10, 6, (x, y) => (y >= T0 + 8 ? P.brass : 0x4a2a1a)); ring(g, cx, D, 0, 3, T0 + 4, T0 + 5, 0xf0e8d0); g.set(cx, T0 + 6, D, 0x1a1a1a);
  g.box(cx + 10, T0, 6, 10, 12, 1, (x, y) => (x === cx + 10 || x === cx + 19 || y === T0 || y === T0 + 11 ? P.brassD : sepia(x - cx - 10, y - T0, 2)));
  ring(g, cx - 14, D - 4, 0, 2.6, T0, T0 + 7, 0x9a8a7a); for (let k = 0; k < 4; k++) g.set(cx - 15 + k, T0 + 7 + (k % 2), D - 4, 0xd8b878);
  // wool socks drying on a string under the mantel
  line(g, [[x0 + 4, MY - 2, D + 3], [cx, MY - 5, D + 3], [x0 + W - 4, MY - 2, D + 3]], 0.4, 0xc8b890);
  for (const [sx, col] of [[cx - 16, 0xb8402a], [cx - 8, 0xb8402a], [cx + 10, 0x3a6a9a]]) {
    const sy = MY - 5 + Math.round(Math.abs(sx - cx) / 12);
    g.box(sx, sy - 12, D + 2, 4, 12, 3, (x, y) => ((sy - y) % 4 === 0 ? 0xe8dcc0 : col));
    g.box(sx - 3, sy - 15, D + 2, 7, 3, 3, col);
  }
  // the chimney breast to the ceiling
  for (let y = MY + 6; y < hh; y++) for (let x = x0 + 10; x < x0 + W - 10; x++) for (let z = 0; z < D - 6; z++) g.set(x, y, z, mixc(st(x, y, z), 0x2a2420, y > hh - 30 ? (y - hh + 30) / 80 : 0));
  // the fire irons on a stand at the side
  const ix = x0 + W + 5, iz = D + 8;
  g.box(ix - 3, 0, iz - 3, 7, 2, 7, P.iron); g.box(ix, 2, iz, 1, 30, 1, P.iron); g.box(ix - 3, 30, iz, 7, 1, 1, P.iron);
  line(g, [[ix - 3, 30, iz], [ix - 4, 6, iz + 1]], 0.6, 0x2e2e36); line(g, [[ix + 3, 30, iz], [ix + 4, 8, iz - 1]], 0.6, 0x3a3a42); g.box(ix + 3, 4, iz - 2, 3, 5, 3, 0x6a4428);
  // flames
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const fg = new VoxelGrid(9, 18, 9);
    const c = 4.5;
    for (let x = 0; x < 9; x++) {
      const t = Math.abs(x + 0.5 - c) / c, h = Math.round((12 + (i % 3) * 2) * (1 - t * t) * (0.75 + 0.25 * hash2(x, i, seed)));
      for (let y = 0; y < h; y++) { const k = y / Math.max(1, h); const col = k < 0.3 ? 0xff5a14 : k < 0.6 ? 0xff9430 : k < 0.86 ? 0xffd060 : 0xfff2c0; fg.set(x, y, 4, col); fg.set(4, y, x, col); }
    }
    const m = G32(fg, [4.5, 0, 4.5]);
    m.position.set(T(cx - 9 + i * 4.5 - (x0 + W / 2)), T(10), T(13 + (i % 2) * 2));
    m.userData.noBatch = true;
    flames.push(m);
  }
  const obj = group(M32(g, [x0 + W / 2, 0, 0]), G32(gl, [x0 + W / 2, 0, 0]), ...flames);
  return {
    obj, flames, candles: cands.map((p) => ({ ...p, x: p.x + T(cx - (x0 + W / 2)) })),
    fire: { x: 0, y: T(14), z: T(14) }, irons: { x: T(ix - (x0 + W / 2)), y: T(20), z: T(iz) }, front: T(D + 20),
    update(t) {
      flames.forEach((m, i) => {
        const s0 = (m.userData.s0 ||= m.scale.clone());
        m.scale.set(s0.x * (0.8 + 0.25 * Math.sin(t * 6 + i * 2)), s0.y * (0.55 + 0.5 * Math.abs(Math.sin(t * (4.1 + i * 1.3) + i * 1.7))), s0.z);
      });
    },
  };
}

/** Nugget's corner: a nest of loose straw, a feed sack slumped open with grain spilling, a water dish. */
export function nestCorner(seed = 109) {
  const g = new VoxelGrid(56, 26, 56);
  for (let x = 0; x < 56; x++) for (let z = 0; z < 56; z++) {
    const r = Math.hypot((x - 26) / 27, (z - 26) / 26);
    if (r > 1 || hash2(x, z, seed) > 1.1 - r) continue;
    const h = 1 + Math.round((1 - r) * 2 * hash2(x >> 1, z >> 1, seed + 1));
    for (let y = 0; y < h; y++) g.set(x, y, z, [0xb8913a, 0xd9b45a, 0xe8c870, 0xc8a04a][Math.floor(hash2(x, y * 31 + z, seed + 2) * 4)]);
  }
  // the feed sack
  g.ellipsoid(42, 9, 40, 8, 9, 7, (x, y, z) => (y > 15 ? 0xb89a6a : h3(x, y, z, seed) < 0.1 ? 0xa88a5a : 0xc8aa78));
  g.ellipsoid(42, 16, 40, 5, 2, 4.4, 0xe0c060);
  for (let k = 0; k < 30; k++) g.set(34 + Math.floor(hash2(k, 1, seed) * 10), 0, 30 + Math.floor(hash2(k, 2, seed) * 12), 0xe8c860);
  g.box(38, 8, 47, 7, 3, 1, 0xd8c8a0); // a label: CHICKEN FEED
  // the water dish
  ring(g, 14, 42, 4, 6.5, 0, 3, 0x8a8a92); ring(g, 14, 42, 0, 4, 0, 1, 0x8a8a92); ring(g, 14, 42, 0, 4, 2, 3, 0x5a8aa8);
  return { obj: M32(g, [28, 0, 28], { outline: true }) };
}
