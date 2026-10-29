// Voxel models (1/32 m; the lift signs 1/64 m) for the dungeons and the lift stations: levers with
// their symbol plaques, symbol drums, crystal mirrors, the light socket, pressure plates, the drain
// wheel, the strongroom's chest and its lid, braziers, goblets; plain wooden chests, cobwebs, darts,
// a trap's plate, a lost miner's remains, skulls, wall torches, the lift lever and plank sign. Each
// builder returns a BufferGeometry in metres (origin as documented), coloured per voxel, lit by
// makeObjectMaterial.
import { Vox, dk, lt, h3 } from '../../gfx/char/vox.js';
import { glyphAt, G } from './glyphs.js';
import { textWidth, textPixel } from './font.js';

export const S = 1 / 32;
const STONE = 0x8a8070, STONE_D = 0x625a4c, BASALT = 0x3a3842, BASALT_L = 0x56545e;
const GOLD = 0xe2ae3a, GOLD_L = 0xffe08a, GOLD_D = 0x9a6a18;
const BRONZE = 0x3e7a5e, BRONZE_L = 0x6eaa80, BRONZE_D = 0x2a5444, COPPER = 0xc08a4a;
const WOOD = 0x7a5232, WOOD_D = 0x553820;
const IRON = 0x4a4c52, IRON_L = 0x7a7e86, IRON_D = 0x2e3036, RUST = 0x8a4a2a;
const ROPE = 0xc4a46a;
const PAINT = 0xeee0bc;
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

// ------------------------------------------------------------------ the dungeons (wave 4)
const OAK = 0x8a6236, OAK_D = 0x5a3c1e, OAK_L = 0xa47a46, LATCH = 0x9aa0aa, COBW = 0x6e6e70;

/** A plain wooden chest, Minecraft-like (origin: floor, centre; front toward +z): 0.44 m a side. */
export function woodChest() {
  const v = new Vox(-7, 7, 0, 10, -7, 7);
  v.box(-7, 0, -7, 7, 10, 7, (x, y, z) => {
    const ex = x === -7 || x === 6, ez = z === -7 || z === 6, ey = y === 0 || y === 9;
    if ((ex && ez) || (ex && ey) || (ez && ey)) return OAK_D;
    return y % 4 === 1 ? dk(OAK, 0.12) : grain(OAK, x, y, z, 0.07);
  });
  v.box(-6, 1, -6, 6, 10, 6, -1);
  v.box(-6, 1, -6, 6, 3, 6, (x, y, z) => (h3(x, y, z, 5) < 0.3 ? 0xd8a83a : 0x4a3a2a)); // what's at the bottom
  v.box(-1, 6, 7, 1, 10, 8, LATCH); // the latch (the lid's half is on the lid)
  return geo(v, [0, 0, 0]);
}
/** Its lid (origin: the back hinge line at the top of the body; opens rotating about x). */
export function woodChestLid() {
  const v = new Vox(-7, 7, 0, 5, 0, 15);
  v.box(-7, 0, 0, 7, 4, 14, (x, y, z) => {
    const ex = x === -7 || x === 6, ez = z === 0 || z === 13, ey = y === 3;
    if ((ex && ez) || (ex && ey) || (ez && ey)) return OAK_D;
    return grain(OAK_L, x, y, z, 0.07);
  });
  v.box(-1, 0, 14, 1, 3, 15, LATCH);
  return geo(v, [0, 0, 0]);
}

/**
 * A cobweb (1/32 m): spokes and a sagging spiral in the x-y plane, r voxels across, lopsided like
 * one strung into a corner (origin: its middle).
 */
export function cobweb(r = 14, seed = 1) {
  const v = new Vox(-r - 2, r + 2, -r - 2, r + 2, -1, 1);
  const n = 9;
  const line = (ax, ay, bx, by, c) => { const L = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let i = 0; i <= L; i++) v.set(Math.round(ax + (bx - ax) * i / L), Math.round(ay + (by - ay) * i / L), 0, c); };
  const ends = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (h3(i, 1, 0, seed) - 0.5) * 0.4;
    const rr = r * (0.75 + h3(i, 2, 0, seed) * 0.25);
    ends.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    line(0, 0, Math.cos(a) * rr, Math.sin(a) * rr, 0xe8ecf2);
  }
  for (let k = 1; k < 6; k++) for (let i = 0; i < n; i++) {
    if (h3(i, k, 3, seed) < 0.12) continue; // torn
    const f0 = (k + h3(i, k, 4, seed) * 0.3) / 6, f1 = (k + h3(i + 1, k, 4, seed) * 0.3) / 6;
    const a = ends[i], b = ends[(i + 1) % n];
    line(a[0] * f0, a[1] * f0 - 0.6, b[0] * f1, b[1] * f1 - 0.6, k & 1 ? 0xd4dae4 : 0xf2f4f8);
  }
  return geo(v, [0, 0, 0]);
}

/** A dart (origin: its tip; flying toward +z). */
export function dart() {
  const v = new Vox(-2, 2, -2, 2, -12, 1);
  v.box(0, 0, -11, 1, 1, 0, 0x6a5038);
  v.set(0, 0, 0, IRON_L);
  for (const [x, y] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) { v.set(x, y, -10, 0xc8483a); v.set(x, y, -11, 0xe8e0d0); }
  return geo(v, [0.5, 0.5, 0]);
}
/** A trap's pressure plate: a thin stone slab (origin: top centre), 0.375 m square. */
export function trapPlate(c = COBW) {
  const v = new Vox(-6, 6, -2, 0, -6, 6);
  v.box(-6, -2, -6, 6, 0, 6, (x, y, z) => (x === -6 || x === 5 || z === -6 || z === 5 ? dk(c, 0.2) : grain(c, x >> 1, y, z >> 1, 0.08)));
  return geo(v, [0, 0, 0]);
}

/** What's left of a miner who came looking: bones, a skull, a pick, a satchel with papers (origin: floor). */
export function remains(seed = 1) {
  const BONE = 0xd8ceb4, BONE_D = 0xa89e86;
  const v = new Vox(-16, 16, 0, 10, -16, 16);
  // skull
  v.ell(-8, 3, -4, 3, 3, 3.2, (x, y, z) => (y < 2 ? BONE_D : BONE));
  v.set(-6, 4, -2, 0x1a1414); v.set(-9, 4, -2, 0x1a1414); v.set(-7, 2, -1, 0x2a2420);
  // ribs and a spine
  v.line(-4, 1, -2, 8, 1, 1, BONE_D, 0.7);
  for (let k = 0; k < 5; k++) { const x = -2 + k * 2.4; v.line(x, 1, 1.5, x + 1, 2.5, -3.5, BONE, 0.6); v.line(x, 1, 1.5, x + 1, 2.5, 6, BONE, 0.6); }
  // a leg bone, an arm bone
  v.line(9, 1, 0, 15, 1, -5, BONE, 0.8); v.line(-3, 1, 7, 3, 1, 12, BONE, 0.7);
  // the pick
  v.line(-14, 1, 8, 0, 1, 14, (x, y, z) => grain(WOOD, x, y, z), 0.9);
  v.line(-15, 1, 4, -13, 2, 13, (x, y, z) => (h3(x, y, z, seed) < 0.35 ? RUST : IRON), 0.9);
  // the satchel, a page sticking out
  v.box(4, 0, -12, 12, 5, -6, (x, y, z) => (y === 4 || x === 4 ? 0x5a3a20 : 0x7a5230));
  v.box(6, 5, -10, 11, 6, -7, PAINT);
  return geo(v, [0, 0, 0]);
}

/** A wall torch (origin: where it meets the wall; leaning out toward +z). The flame is apart. */
export function torch() {
  const v = new Vox(-2, 2, -2, 14, -1, 8);
  v.line(0, 0, 0, 0, 10, 5, (x, y, z) => (y > 8 ? 0x2a1e18 : grain(0x7a5232, x, y, z)), 0.8);
  v.box(-1, -1, -1, 1, 2, 1, IRON_D); // the bracket
  return geo(v, [0.5, 0, 0.5]);
}
export function torchFlame() {
  const v = new Vox(-2, 2, 0, 6, -2, 2);
  for (let y = 0; y < 5; y++) v.cylY(0, 0, y < 2 ? 1.6 : 1.1 - (y - 2) * 0.3, y, y + 1, y < 2 ? 0xffd070 : 0xff9a3a);
  return geo(v, [0, 0, 0]);
}

/** A lever on a cobble block (origin: floor, centre; the handle pivot is returned apart). */
export function liftLeverBase() {
  const v = new Vox(-6, 6, 0, 26, -6, 6);
  v.box(-5, 0, -5, 5, 18, 5, (x, y, z) => grain(h3(x >> 2, y >> 2, z >> 2, 7) < 0.5 ? 0x6a6a6c : 0x7c7c7e, x, y, z, 0.1)); // a post of stone
  v.box(-3, 18, -3, 3, 20, 3, IRON_D); // the plate
  return geo(v, [0, 0, 0]);
}
export function liftLeverHandle() {
  const v = new Vox(-2, 2, -1, 16, -2, 2);
  v.box(-1, 0, -1, 1, 13, 1, (x, y) => (y > 10 ? 0x3a3a3c : 0x8a6236));
  v.box(-2, 12, -2, 2, 16, 2, 0x2c2c30);
  return geo(v, [0, 0, 0]);
}

/**
 * A plank sign for a lift station (1/64 m voxels): the name in dark letters (two lines when long),
 * the depth under it (origin: the back of the board, its middle; the face toward +z).
 */
export function plankSign(lines) {
  const s = 1 / 64;
  const L = lines.map((t) => String(t).toUpperCase());
  const W = Math.max(40, ...L.map(textWidth)) + 10, H = L.length * 7 + 7;
  const v = new Vox(-1, W + 1, -1, H + 1, 0, 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const plank = Math.floor(y / 6);
    const c = y % 6 === 0 ? OAK_D : grain(plank & 1 ? OAK : OAK_L, x >> 2, y, plank, 0.08, 17);
    for (let z = 0; z < 3; z++) v.set(x, y, z, c);
  }
  L.forEach((ln, i) => {
    const w = textWidth(ln), x0 = Math.floor((W - w) / 2), y0 = H - 4 - (i + 1) * 7 + 2;
    for (let py = 0; py < 5; py++) for (let px = 0; px < w; px++) if (textPixel(ln, px, 4 - py)) v.set(x0 + px, y0 + py, 3, 0x1e140c);
  });
  const g = v.geometry(false, [W / 2, H / 2, 0]);
  g.scale(s, s, s);
  return g;
}

/** A skull and a couple of bones in a tomb niche (origin: floor; looking toward +z). */
export function skull(seed = 1) {
  const BONE = 0xd8ceb4, BONE_D = 0xa89e86, HOLE = 0x1a1414;
  const v = new Vox(-7, 7, 0, 8, -6, 6);
  v.ell(0, 3.2, 0, 2.6, 2.6, 2.8, (x, y) => (y < 2 ? BONE_D : BONE));
  v.box(-2, 0, 1, 2, 2, 3, BONE_D); // the jaw
  v.set(-1, 3, 3, HOLE); v.set(1, 3, 3, HOLE); v.set(0, 2, 3, HOLE);
  v.line(-6, 0, -4, 5, 0, -2, BONE, 0.6);
  if (h3(seed, 1, 2, 3) < 0.6) v.line(-5, 0, 4, 6, 0, -4, BONE_D, 0.6);
  return geo(v, [0, 0, 0]);
}
