// Voxel models (1/32 m; sign boards 1/64 m) for the ruins and the old trails: levers with their
// symbol plaques, symbol drums, crystal mirrors, the light socket, pressure plates, the drain
// wheel, the treasure chest and its lid, braziers, goblets; signposts with hand-painted names,
// ore carts, broken tools, a winch rope and bucket. Each builder returns a BufferGeometry in
// metres (origin as documented), coloured per voxel, lit by makeObjectMaterial.
import * as THREE from 'three';
import { Vox, mix, dk, lt, h3 } from '../../gfx/char/vox.js';
import { glyphAt, G } from './glyphs.js';
import { textWidth, textPixel } from './font.js';

export const S = 1 / 32;
const STONE = 0x8a8070, STONE_D = 0x625a4c, BASALT = 0x3a3842, BASALT_L = 0x56545e;
const GOLD = 0xe2ae3a, GOLD_L = 0xffe08a, GOLD_D = 0x9a6a18;
const BRONZE = 0x3e7a5e, BRONZE_L = 0x6eaa80, BRONZE_D = 0x2a5444, COPPER = 0xc08a4a;
const WOOD = 0x7a5232, WOOD_D = 0x553820, WOOD_L = 0x9a6c42, WOOD_G = 0x6a5a48;
const IRON = 0x4a4c52, IRON_L = 0x7a7e86, IRON_D = 0x2e3036, RUST = 0x8a4a2a, RUST_L = 0xb0603a;
const ROPE = 0xc4a46a, ROPE_D = 0x96784a;
const PAINT = 0xeee0bc, PAINT_R = 0xc8483a;
export const COL = { STONE, BASALT, GOLD, BRONZE, WOOD, IRON, ROPE };

/** Mesh a Vox: scale s, origin at model point pivot (voxel units). */
export function geo(v, pivot = [0, 0, 0], s = S) {
  const g = v.geometry(false, pivot);
  g.scale(s, s, s);
  return g;
}

const grain = (c, x, y, z, k = 0.06, s = 1) => (h3(x, y, z, s) < 0.3 ? dk(c, k) : h3(x, y, z, s + 7) < 0.15 ? lt(c, k) : c);
const verd = (x, y, z) => (h3(x >> 1, y >> 1, z >> 1, 3) < 0.22 ? COPPER : h3(x, y, z, 4) < 0.2 ? BRONZE_L : BRONZE);

/** A glyph raised on a plane: calls put(px, py) for each set pixel (scale k voxels per pixel). */
function glyphPixels(g, k, put) {
  for (let py = 0; py < 7 * k; py++) for (let px = 0; px < 7 * k; px++) if (glyphAt(g, Math.floor(px / k), Math.floor(py / k))) put(px, py);
}

// ------------------------------------------------------------------ levers
/** The wall plate of a lever (origin: wall surface, plate centre bottom; +z out of the wall). */
export function leverBase(glyph) {
  const v = new Vox(-8, 8, 0, 26, 0, 4);
  v.box(-7, 0, 0, 7, 25, 2, (x, y, z) => (x === -7 || x === 6 || y === 0 || y === 24 ? verd(x, y, z) : grain(BASALT, x, y, z)));
  // the slot the handle runs in
  v.box(-1, 3, 1, 1, 12, 2, -1);
  v.box(-1, 3, 0, 1, 12, 1, 0x141216);
  // pivot boss
  v.box(-3, 8, 2, 3, 13, 4, (x, y) => (x === -3 || x === 2 || y === 8 || y === 12 ? BRONZE_D : BRONZE));
  // the symbol plaque
  v.box(-5, 14, 2, 5, 24, 3, BASALT_L);
  glyphPixels(glyph, 1, (px, py) => v.set(-4 + px, 16 + py, 3, GOLD));
  return geo(v, [0, 0, 0]);
}
/** The handle: pivot at the origin, pointing up (+y) with a knob; rotate about x to pull. */
export function leverHandle(kind = 'lever') {
  const v = new Vox(-3, 3, -2, 20, -3, 3);
  v.box(-1, -2, -1, 1, 15, 1, (x, y) => (y % 5 === 0 ? BRONZE_D : BRONZE_L));
  if (kind === 'switch') v.box(-3, 14, -1, 3, 17, 1, (x, y) => (y === 14 ? IRON_D : IRON_L));
  else v.ell(0, 16.5, 0, 2.6, 2.6, 2.6, (x, y) => (y > 16 ? GOLD_L : GOLD));
  return geo(v, [0, 0, 0]);
}

// ------------------------------------------------------------------ symbol drums
/**
 * A hexagonal drum on an axle along x, face k's normal at angle k·60° from +z toward +y; the
 * symbols are raised in gold. Rotating it by +k·60° about x brings face k to the front (+z).
 */
export function drum(symbols) {
  const R = 9, ap = R * Math.cos(Math.PI / 6), HL = 6;
  const v = new Vox(-HL - 2, HL + 2, -R - 2, R + 2, -R - 2, R + 2);
  const n = symbols.length;
  for (let x = -HL; x < HL; x++) for (let y = -R - 1; y <= R; y++) for (let z = -R - 1; z <= R; z++) {
    const cy = y + 0.5, cz = z + 0.5;
    let best = -1e9, k = 0;
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3, dn = cy * Math.sin(a) + cz * Math.cos(a); if (dn > best) { best = dn; k = i; } }
    if (best >= ap + 1) continue;
    const a = (k * Math.PI) / 3, t = cy * Math.cos(a) - cz * Math.sin(a);
    if (best >= ap) {
      // the raised symbol (only the gold pixels stand out)
      const gx = Math.floor(x + 3.5), gy = Math.floor(t + 3.5);
      if (gx >= 0 && gx < 7 && gy >= 0 && gy < 7 && glyphAt(symbols[k % n], gx, gy)) v.set(x, y, z, GOLD);
      continue;
    }
    const edge = Math.abs(t) > 3.8;
    v.set(x, y, z, best > ap - 1 ? (edge ? BASALT_L : grain(BASALT, x, y, z, 0.08)) : STONE_D);
  }
  // bronze rims and the axle
  for (const xx of [-HL - 1, HL]) for (let y = -R - 1; y <= R; y++) for (let z = -R - 1; z <= R; z++) {
    const r = Math.hypot(y + 0.5, z + 0.5);
    if (r < R + 0.6 && r > R - 2.5) v.set(xx, y, z, verd(xx, y, z));
    else if (r < 2) v.set(xx, y, z, BRONZE_D);
  }
  return geo(v, [0, 0, 0]);
}
/** The drum's cradle: two basalt cheeks and a gilt pointer above the front face (origin: altar top, centre). */
export function drumStand() {
  const v = new Vox(-10, 10, 0, 22, -6, 6);
  for (const x of [-9, 8]) v.box(x, 0, -4, x + 1, 13, 4, (xx, y, z) => (y > 11 ? BRONZE : grain(BASALT, xx, y, z)));
  v.box(-9, 0, -5, 9, 2, 5, (x, y, z) => grain(BASALT_L, x, y, z));
  // the pointer: a little gold arrowhead over the front
  for (let i = 0; i < 3; i++) v.box(-2 + i, 21 - i, 3, 3 - i, 22 - i, 4, GOLD);
  v.box(-1, 19, 3, 1, 22, 4, GOLD_D);
  return geo(v, [0, 0, 0]);
}

// ------------------------------------------------------------------ mirrors and the light
/** Mirror pedestal (origin: top of the stone foot, centre): a bronze column up to the yoke. */
export function mirrorPost() {
  const v = new Vox(-7, 7, 0, 18, -7, 7);
  v.cylY(0, 0, 2.2, 0, 14, (x, y, z) => (y % 4 === 0 ? BRONZE_D : verd(x, y, z)));
  v.cylY(0, 0, 4.5, 0, 2, BASALT_L);
  // the yoke: a U holding the pane's pivots
  v.box(-7, 13, -1, 7, 15, 1, BRONZE_D);
  for (const x of [-7, 6]) v.box(x, 13, -1, x + 1, 17, 1, BRONZE);
  return geo(v, [0, 0, 0]);
}
/** The pane (origin: its centre; the bright face toward +z, a dark back). */
export function mirrorHead() {
  const v = new Vox(-7, 7, -7, 7, -2, 2);
  for (let x = -6; x < 6; x++) for (let y = -6; y < 6; y++) {
    const rim = x === -6 || x === 5 || y === -6 || y === 5;
    v.set(x, y, -1, rim ? BRONZE_D : grain(BASALT, x, y, 0, 0.1));
    v.set(x, y, 0, rim ? verd(x, y, 0) : (x + y) % 5 === 0 ? 0xe8f8ff : y > 1 - x * 0.3 ? 0xbfe4f4 : 0x9cc8e0);
    if (rim) v.set(x, y, 1, BRONZE);
  }
  return geo(v, [0, 0, 0]);
}
/** The light socket: a gilt cup on a short stem holding a crystal (crystal returned apart, to glow). */
export function socket() {
  const v = new Vox(-6, 6, 0, 14, -6, 6);
  v.cylY(0, 0, 2, 0, 6, verd);
  v.cylY(0, 0, 4.6, 6, 9, (x, y) => (y === 8 ? GOLD_L : GOLD));
  v.cylY(0, 0, 3.2, 8, 9, -1);
  const c = new Vox(-3, 3, 0, 12, -3, 3);
  for (let y = 0; y < 11; y++) { const r = y < 4 ? 1.2 + y * 0.5 : 2.8 - (y - 4) * 0.38; c.cylY(0, 0, r, y, y + 1, y > 7 ? 0xf4fcff : (y & 1) ? 0xbfeaff : 0x8ad0f4); }
  return { base: geo(v), crystal: geo(c, [0, -7, 0]) };
}
/** The sun crystal's bright core (glows), set in its wall socket. */
export function sunCore() {
  const v = new Vox(-4, 4, -4, 4, -4, 4);
  v.ell(0, 0, 0, 3.6, 3.6, 3.6, (x, y, z) => (y > 0 ? 0xfffbe0 : 0xffe8a0));
  return geo(v, [0, 0, 0]);
}

// ------------------------------------------------------------------ plates, valve
/** A pressure plate slab (origin: top centre; 0.75 m square, 3 voxels thick), the weight glyph inlaid. */
export function plateSlab() {
  const v = new Vox(-12, 12, -3, 0, -12, 12);
  v.box(-12, -3, -12, 12, 0, 12, (x, y, z) => {
    const e = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5));
    if (e > 10.5) return y === -1 ? verd(x, y, z) : BRONZE_D;
    return grain(e > 9 ? STONE_D : STONE, x >> 1, y, z >> 1, 0.07);
  });
  glyphPixels(G.weight, 2, (px, py) => v.set(-7 + px, -1, 7 - py, GOLD));
  return geo(v, [0, 0, 0]);
}
/** The drain wheel's wall mount (origin: wall face centre; +z out of the wall). */
export function valveMount() {
  const v = new Vox(-8, 8, -8, 8, 0, 6);
  v.box(-7, -7, 0, 7, 7, 2, (x, y, z) => grain(BASALT, x, y, z));
  for (let z = 2; z < 6; z++) for (let y = -2; y < 2; y++) for (let x = -2; x < 2; x++) v.set(x, y, z, z === 5 ? BRONZE_D : BRONZE);
  // bolts
  for (const [x, y] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) v.set(x, y, 2, IRON_L);
  return geo(v, [0, 0, 0]);
}
/** The wheel (origin: its hub; in the x-y plane, turning about z). */
export function valveWheel() {
  const R = 8;
  const v = new Vox(-R - 2, R + 2, -R - 2, R + 2, -1, 2);
  for (let y = -R - 1; y <= R; y++) for (let x = -R - 1; x <= R; x++) {
    const r = Math.hypot(x + 0.5, y + 0.5), a = Math.atan2(y + 0.5, x + 0.5);
    if (r > R - 1.6 && r < R + 0.5) { v.set(x, y, 0, verd(x, y, 0)); v.set(x, y, 1, BRONZE); }
    else if (r < 2.2) { v.set(x, y, 0, BRONZE_D); v.set(x, y, 1, GOLD); }
    else if (Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1 - 0.5) > 0.4 && r < R - 1) v.set(x, y, 0, BRONZE);
  }
  // grips on the rim
  for (let k = 0; k < 6; k++) { const a = (k + 0.5) * Math.PI / 3; v.set(Math.round(Math.cos(a) * (R + 0.6)), Math.round(Math.sin(a) * (R + 0.6)), 0, GOLD_D); }
  return geo(v, [0, 0, 0]);
}

// ------------------------------------------------------------------ treasure
/** The chest's body (origin: floor, centre; front toward +z). */
export function chestBody() {
  const v = new Vox(-12, 12, 0, 13, -8, 8);
  v.box(-11, 0, -7, 11, 12, 7, (x, y, z) => {
    const band = x === -11 || x === 10 || x === -4 || x === 3 || y === 0 || y === 11;
    if (band) return (x + y + z) % 7 === 0 ? GOLD_L : GOLD_D;
    return grain(y % 3 === 0 ? WOOD_D : 0x4a2c1e, x, y, z, 0.08);
  });
  v.box(-10, 1, -6, 10, 12, 6, -1); // hollow
  v.box(-10, 1, -6, 10, 4, 6, (x, y, z) => (h3(x, y, z, 9) < 0.2 ? GOLD_L : GOLD)); // coins inside
  // the lock plate with an eye
  v.box(-3, 5, 7, 3, 11, 8, BASALT_L);
  v.set(-1, 8, 8, GOLD); v.set(0, 8, 8, GOLD); v.set(-1, 7, 8, BASALT); v.set(0, 7, 8, 0x141216);
  return geo(v, [0, 0, 0]);
}
/** The chest's lid (origin: the back hinge line at the top of the body; opens by rotating about x). */
export function chestLid() {
  const v = new Vox(-12, 12, 0, 7, 0, 16);
  for (let z = 0; z < 15; z++) for (let x = -11; x < 11; x++) {
    const h = Math.round(Math.sqrt(Math.max(0, 1 - ((z - 7) / 7.5) ** 2)) * 5) + 1;
    for (let y = 0; y < h; y++) {
      const band = x === -11 || x === 10 || x === -4 || x === 3 || z === 0 || z === 14;
      v.set(x, y, z, band ? (y === h - 1 && (x + z) % 4 === 0 ? GOLD_L : GOLD_D) : grain(0x4a2c1e, x, y, z, 0.08));
    }
  }
  return geo(v, [0, 0, 0]);
}
/** A gold goblet, a crown or a small idol for the treasure floor (origin: floor). */
export function trinket(kind) {
  const v = new Vox(-6, 6, 0, 14, -6, 6);
  if (kind === 'goblet') {
    v.cylY(0, 0, 2.8, 0, 1, GOLD_D); v.cylY(0, 0, 0.9, 1, 6, GOLD);
    for (let y = 6; y < 12; y++) v.cylY(0, 0, 1.6 + (y - 6) * 0.42, y, y + 1, (x, yy) => (yy === 11 ? GOLD_L : GOLD));
    v.cylY(0, 0, 1.8, 8, 12, -1); v.set(2, 9, 0, 0xc83a4a); v.set(-2, 9, 0, 0x3a6ac8);
  } else if (kind === 'crown') {
    for (let y = 0; y < 4; y++) v.cylY(0, 0, 4.4, y, y + 1, y === 0 ? GOLD_D : GOLD);
    v.cylY(0, 0, 3.2, 0, 4, -1);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const x = Math.round(Math.cos(a) * 3.8), z = Math.round(Math.sin(a) * 3.8); v.box(x, 4, z, x + 1, 7, z + 1, GOLD); v.set(x, 7, z, k % 2 ? 0xc83a4a : 0x58c8e0); }
  } else {
    // a little gold mole idol
    v.box(-3, 0, -3, 3, 2, 3, GOLD_D);
    v.ell(0, 5, 0, 2.6, 3.4, 2.4, GOLD); v.ell(0, 9.5, 0, 2.2, 2.2, 2.2, GOLD_L);
    v.set(0, 9, 2, 0xff7a9a); v.set(-1, 10, 2, 0x141216); v.set(1, 10, 2, 0x141216);
  }
  return geo(v, [0, 0, 0]);
}
/** A brazier: bronze tripod and bowl (origin: floor). Its fire is particles + a glow mesh. */
export function brazier() {
  const v = new Vox(-8, 8, 0, 22, -8, 8);
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    v.line(Math.cos(a) * 6, 0, Math.sin(a) * 6, Math.cos(a) * 2.5, 15, Math.sin(a) * 2.5, (x, y, z) => verd(x, y, z), 0.7);
    v.set(Math.round(Math.cos(a) * 6), 0, Math.round(Math.sin(a) * 6), BRONZE_D);
  }
  for (let y = 15; y < 21; y++) v.cylY(0, 0, 3 + (y - 15) * 0.75, y, y + 1, (x, yy, z) => (yy === 20 ? GOLD : verd(x, yy, z)));
  v.cylY(0, 0, 5.4, 18, 21, -1);
  v.cylY(0, 0, 5.4, 18, 19, (x, y, z) => (h3(x, y, z, 5) < 0.5 ? 0x2a1e1a : 0x3a2a20)); // ash and coals
  return geo(v, [0, 0, 0]);
}
export function flameGeo() {
  const v = new Vox(-5, 5, 0, 12, -5, 5);
  for (let y = 0; y < 11; y++) {
    const r = (1 - y / 11) * 4.2 + 0.4;
    v.cylY(0, 0, r, y, y + 1, (x, yy, z) => (yy < 3 ? 0xffd070 : yy < 7 ? 0xffa040 : 0xff6a20));
  }
  return geo(v, [0, 0, 0]);
}

// ------------------------------------------------------------------ the trails
/** A signpost's post (origin: floor). Boards: signBoard(), each turned its own way. */
export function signPost() {
  const v = new Vox(-3, 3, 0, 44, -3, 3);
  v.box(-2, 0, -2, 2, 42, 2, (x, y, z) => ((x + z + (y >> 2)) % 5 === 0 ? WOOD_D : grain(WOOD_G, x, y >> 1, z, 0.1)));
  v.box(-3, 42, -3, 3, 44, 3, WOOD_D); // cap
  v.box(-3, 0, -3, 3, 2, 3, (x, y, z) => grain(0x5a4a3a, x, y, z)); // a stone wedged at its foot
  return geo(v, [0, 0, 0]);
}
/**
 * An arrow board (1/64 m voxels) pointing +x from the post axis, its middle at y = 0. The text
 * (\n for two lines) is painted on both faces, mirrored on the back so it reads from either side.
 */
export function signBoard(text, color) {
  const lines = String(text).toUpperCase().split('\n');
  const W = Math.max(...lines.map(textWidth)) + 8, H = lines.length * 7 + 4;
  const s = 1 / 64, tip = 6;
  const v = new Vox(-1, W + tip + 2, 0, H + 1, -1, 4);
  for (let yy = 0; yy < H; yy++) for (let x = 0; x < W + tip; x++) {
    if (x >= W) { const k = x - W; if (Math.abs(yy - (H - 1) / 2) > (H / 2) * (1 - k / tip)) continue; } // the point
    if (x < 2 && (yy === 0 || yy === H - 1)) continue; // a chipped corner
    const wc = yy % 5 === 0 ? WOOD_D : grain(color || WOOD_L, x >> 2, yy, 0, 0.12, 31);
    for (let z = 0; z < 3; z++) v.set(x, yy, z, wc);
  }
  v.set(2, H - 3, 3, IRON_L); v.set(2, 2, 3, IRON_L); v.set(2, H - 3, -1, IRON_L); v.set(2, 2, -1, IRON_L); // nails
  lines.forEach((ln, i) => {
    const w = textWidth(ln), x0 = 4 + Math.floor((W - 8 - w) / 2), y0 = H - 3 - (i + 1) * 7 + 1;
    for (let py = 0; py < 5; py++) for (let px = 0; px < w; px++) {
      if (!textPixel(ln, px, 4 - py)) continue;
      v.set(x0 + px, y0 + py, 2, PAINT);
      v.set(x0 + w - 1 - px, y0 + py, 0, PAINT); // the back reads the right way round too
      if (py === 0 && h3(px, py, i, 41) < 0.06) v.set(x0 + px, y0 - 1, 2, PAINT); // a drip
    }
  });
  const mid = Math.floor((H - 1) / 2);
  for (let x = W - 3; x < W + tip - 2; x++) { v.set(x, mid, 2, PAINT_R); v.set(x, mid, 0, PAINT_R); }
  const g = v.geometry(false, [-4.5, H / 2, 1.5]); // the board starts just clear of the post
  g.scale(s, s, s);
  return g;
}

/** An old ore cart (origin: rail top, centre; along x). tipped: on its side, the load spilt. */
export function cart(tipped = false, seed = 1) {
  const W = 26, H = 20, D = 18;
  const v = new Vox(-W / 2 - 1, W / 2 + 1, 0, H + 2, -D / 2 - 1, D / 2 + 1);
  const body = (x, y, z) => {
    if (y >= H - 1 || ((x === -W / 2 + 1 || x === W / 2 - 2) && (z === -D / 2 + 1 || z === D / 2 - 2))) return IRON_D;
    if (y === 10) return IRON_D;
    return h3(x >> 1, y >> 1, z >> 1, seed) < 0.25 ? RUST : h3(x, y, z, seed + 1) < 0.07 ? RUST_L : 0x6a5a52;
  };
  for (let y = 6; y < H; y++) for (let z = -D / 2 + 1; z < D / 2 - 1; z++) for (let x = -W / 2 + 1; x < W / 2 - 1; x++) {
    const wall = x === -W / 2 + 1 || x === W / 2 - 2 || z === -D / 2 + 1 || z === D / 2 - 2 || y === 6;
    if (wall) v.set(x, y, z, body(x, y, z));
  }
  // the load (rock with glints of ore)
  if (!tipped) for (let z = -D / 2 + 2; z < D / 2 - 2; z++) for (let x = -W / 2 + 2; x < W / 2 - 2; x++) {
    const top = 15 + Math.round(3 * (1 - Math.hypot(x / (W / 2), z / (D / 2))) + h3(x >> 1, 0, z >> 1, seed + 2) * 2);
    for (let y = 7; y < Math.min(H + 1, top); y++) v.set(x, y, z, h3(x, y, z, seed + 3) < 0.06 ? [0xf0c040, 0xd8743a, 0xb8c4d0][(h3(x, y, z, seed + 4) * 3) | 0] : h3(x >> 1, y >> 1, z >> 1, seed + 5) < 0.5 ? 0x6a6260 : 0x84807a);
  }
  // wheels and axles
  for (const wx of [-W / 2 + 6, W / 2 - 7]) {
    for (const wz of [-D / 2 + 1, D / 2 - 2]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const r = Math.hypot(dx, dy);
      if (r > 4.4) continue;
      v.set(wx + dx, 4 + dy, wz, r < 1.5 ? IRON_L : r > 3.2 ? IRON_D : (dx === 0 || dy === 0) ? IRON : -1);
    }
    for (let z = -D / 2 + 1; z < D / 2 - 1; z++) v.set(wx, 4, z, IRON_D);
  }
  const g = geo(v, [0, 0, 0]);
  if (tipped) { g.rotateX(Math.PI / 2 * 0.98); g.translate(0, D / 2 * S, 0); }
  return g;
}

/** Iron rails along a straight run (origin: start; along +x for len metres), on their sleepers. */
export function rails(len) {
  const n = Math.max(1, Math.round(len * 32));
  const v = new Vox(0, n, 0, 3, -9, 9);
  for (let x = 0; x < n; x++) for (const z of [-8, 7]) {
    v.set(x, 0, z, IRON_D); v.set(x, 1, z, x % 11 === 0 ? RUST : IRON); v.set(x, 2, z, h3(x, 0, z, 61) < 0.15 ? RUST_L : IRON_L);
    v.set(x, 0, z + (z < 0 ? 1 : -1), IRON_D);
  }
  return geo(v, [0, 0, 0]);
}

/** A broken tool or bit of gear lying on the floor (origin: floor). */
export function gear(kind, seed = 1) {
  const v = new Vox(-14, 14, 0, 30, -14, 14);
  if (kind === 'pick') {
    // a pick with a snapped handle, leaning
    v.line(-10, 0, 0, 6, 1, 3, (x, y, z) => grain(WOOD, x, y, z), 0.9);
    v.line(4, 1, -6, 8, 2, 9, (x, y, z) => (Math.abs(z) < 2 ? IRON_D : h3(x, y, z, seed) < 0.3 ? RUST : IRON), 0.9);
    v.line(-12, 0, 6, -7, 0, 8, (x, y, z) => grain(WOOD_L, x, y, z), 0.7); // the broken-off end
  } else if (kind === 'shovel') {
    v.line(-12, 1, -2, 6, 1, 2, (x, y, z) => grain(WOOD, x, y, z), 0.8);
    v.box(-15, 0, -3, -12, 1, 3, IRON_D);
    v.box(6, 0, -4, 14, 1, 5, (x, y, z) => (h3(x, y, z, seed) < 0.35 ? RUST : IRON));
  } else if (kind === 'bucket') {
    for (let y = 0; y < 10; y++) v.cylY(0, 0, 4.2 + y * 0.12, y, y + 1, (x, yy) => (yy === 2 || yy === 8 ? IRON_D : (x + yy) % 6 === 0 ? WOOD_D : WOOD));
    v.cylY(0, 0, 3.7, 1, 10, -1);
    for (let k = 0; k < 9; k++) { const a = Math.PI * k / 8; v.set(Math.round(Math.cos(a) * 5), 10 + Math.round(Math.sin(a) * 4), 0, IRON_L); }
  } else if (kind === 'crate') {
    v.box(-9, 0, -8, 9, 14, 8, (x, y, z) => {
      const ex = x === -9 || x === 8, ey = y === 0 || y === 13, ez = z === -8 || z === 7;
      if ((ex && ey) || (ey && ez) || (ex && ez)) return WOOD_D;
      return (y >> 2) % 2 ? WOOD : WOOD_L;
    });
    v.box(-8, 9, -7, 8, 14, 7, -1); // the lid's gone
    v.box(-7, 1, -6, 7, 8, 6, (x, y, z) => (h3(x, y, z, seed) < 0.1 ? 0xf0c040 : 0x6a6260));
    v.line(-14, 0, 10, 2, 0, 13, WOOD, 0.7); // the lid, lying beside it
  } else if (kind === 'lamp') {
    // an old miner's lamp on its side
    v.box(-3, 0, -3, 3, 2, 3, IRON_D); v.box(-2, 2, -2, 2, 7, 2, 0xc8a050); v.box(-3, 7, -3, 3, 8, 3, IRON_D);
    v.set(0, 9, 0, IRON); v.set(1, 10, 0, IRON); v.set(-1, 10, 0, IRON);
  } else {
    // barrel
    for (let y = 0; y < 18; y++) v.cylY(0, 0, 6 + Math.sin((y / 17) * Math.PI) * 1.4, y, y + 1, (x, yy, z) => (yy === 2 || yy === 9 || yy === 15 ? IRON_D : Math.floor((Math.atan2(z, x) + Math.PI) * 2.6) & 1 ? WOOD : WOOD_D));
    v.cylY(0, 0, 5.4, 17, 18, WOOD_D);
  }
  return geo(v, [0, 0, 0]);
}

/** A rope hanging straight down (origin: top), length metres. */
export function rope(len) {
  const n = Math.max(2, Math.round(len * 32));
  const v = new Vox(-1, 1, -n, 0, -1, 1);
  for (let y = -n; y < 0; y++) for (let x = -1; x < 1; x++) for (let z = -1; z < 1; z++) v.set(x, y, z, (y + x * 2 + z) & 2 ? ROPE : ROPE_D);
  return geo(v, [0, 0, 0]);
}
/** A rope sagging from a to b (metres, relative to a): a chain of short voxel bits. */
export function sagRope(dx, dy, dz, sag, n = 12) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const p0 = [dx * t0, dy * t0 - sag * 4 * t0 * (1 - t0), dz * t0], p1 = [dx * t1, dy * t1 - sag * 4 * t1 * (1 - t1), dz * t1];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const g = new THREE.BoxGeometry(0.035, 0.035, L + 0.01);
    g.lookAt(new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
    g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    colorize(g, i & 1 ? ROPE : ROPE_D);
    parts.push(g);
  }
  return parts;
}
/** Vertex colours (linear) for a plain geometry. */
export function colorize(g, hex) {
  const c = new THREE.Color().setHex(hex);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
export function bucket() { return gear('bucket'); }
