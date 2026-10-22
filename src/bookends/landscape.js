// The wide world around the meadow: rolling voxel hills (1/4 m) quilted with fields and
// hedgerows, a dirt road winding up to a little village (smoking chimneys, a chapel), a windmill
// on the ridge, copses of trees, and three hazy pixel-art bands of hills and mountains beyond.
// Built only toward where the opening's camera looks (north, -z); the near meadow is meadow.js.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, meshRelief, hash3, fshade, fmix } from './vox.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeNoise2D, makeRng, clamp, lerp } from '../core/util.js';
import { meadowToon } from './meadowfx.js';

const VQ = 1 / 4; // hill voxel
export const NEAR = 9; // the near meadow covers |x|, |z| < NEAR
/** The wedge the opening's cameras can see (north, from about (1.5, 5.6)), with a margin. */
export const inView = (x, z) => x > 1.7 - 1.3 * (7.5 - z) - 4 && x < 1.7 + 0.62 * (7.5 - z) + 4;
const BOX = { x0: -72, x1: 44, z0: -66, z1: 12 };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const h1 = makeNoise2D(301), h2 = makeNoise2D(302), h3 = makeNoise2D(303), h4 = makeNoise2D(304);

/** Where the road runs (x at a given z), from the meadow path up to the village. */
export function roadX(z) {
  const near = 0.35 + Math.sin(z * 0.55) * 0.5;
  const far = 11 + Math.sin(z * 0.11) * 3.2;
  return lerp(near, far, sm(-11, -36, z));
}
export const VILLAGE = { x: 13, z: -42 };
export const WINDMILL = { x: -3, z: -50 };

/** Height of the land (m) at x, z (0 at the meadow). */
export function landH(x, z) {
  const dq = Math.hypot(Math.max(0, Math.abs(x) - NEAR), Math.max(0, Math.abs(z) - NEAR));
  const r = Math.hypot(x, z);
  const roll = (h1(x * 0.022, z * 0.022) * 0.5 + 0.5) * 6.5 + h2(x * 0.06, z * 0.06) * 1.3;
  let H = roll * sm(10, 42, r) + h3(x * 0.12, z * 0.12) * 0.6 * sm(0, 8, dq);
  H += 3.5 * sm(42, 62, -z); // the ridge that closes the valley to the north
  H += 4 * sm(-40, -66, x) + 3 * sm(26, 42, x); // and its arms to the sides
  // a shelf for the village and the windmill hill
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  H = lerp(H, 3.4 + h2(x * 0.2, z * 0.2) * 0.3, sm(13, 6, dv));
  const dw = Math.hypot(x - WINDMILL.x, z - WINDMILL.z);
  H += 2.8 * sm(9, 0, dw);
  // the road cuts a gentle groove
  const dr = Math.abs(x - roadX(z));
  if (z < -NEAR) H -= 0.35 * sm(2.2, 0.6, dr);
  return Math.max(0, H * sm(0, 3, dq));
}

function fieldAt(x, z) {
  const a = 0.32;
  const u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
  const cu = Math.floor(u / 9.5), cv = Math.floor(v / 7.5);
  const fu = u / 9.5 - cu, fv = v / 7.5 - cv;
  const edge = Math.min(fu, 1 - fu) * 9.5 < 0.35 || Math.min(fv, 1 - fv) * 7.5 < 0.35;
  const k = hash3(cu, cv, 0, 17);
  const type = k < 0.34 ? 0 : k < 0.5 ? 1 : k < 0.63 ? 2 : k < 0.76 ? 3 : k < 0.86 ? 4 : 5;
  return { type, edge, u, v, cu, cv };
}

const GRASS = [0x5ea83a, 0x68b03e, 0x56a036, 0x72b844];

/** Colour of the land surface at a column. */
function landColor(x, z, i, k, H, slope) {
  const r = Math.hypot(x, z);
  const hh = hash3(i, k, 0, 9);
  let c = GRASS[(hash3(i >> 1, k >> 1, 0, 3) * 4) | 0];
  if (h4(x * 0.15, z * 0.15) > 0.25) c = fmix(c, 0x8ac04c, 0.35); // sunny patches
  if (h3(x * 0.1 + 4, z * 0.1) < -0.3) c = fshade(c, 0.9);
  // patchwork fields on the far slopes
  if (r > 20 && z < -10) {
    const f = fieldAt(x, z);
    const stripe = (Math.floor(f.v * 2.2) & 1) === 0;
    if (f.edge) c = hh < 0.5 ? 0x2e5a24 : 0x36662a; // hedgerow
    else if (f.type === 1) c = stripe ? 0xe0b84a : 0xd2a63e; // wheat
    else if (f.type === 2) c = stripe ? 0x8a5a34 : 0x744a2a; // ploughed
    else if (f.type === 3) c = stripe ? 0x4e8a2c : 0x7ab448; // crop rows
    else if (f.type === 4) c = stripe ? 0x9a7ad0 : 0x5a8a44; // lavender
    else if (f.type === 5) c = stripe ? 0xb8c866 : 0xa8bc58; // hay
  }
  // the road: packed dirt with ruts and a grassy crown
  if (z < -NEAR + 0.5) {
    const dr = Math.abs(x - roadX(z));
    if (dr < 1.0) c = dr < 0.18 ? 0x7a9a44 : dr > 0.55 && dr < 0.8 ? 0x8a6a46 : hh < 0.1 ? 0x9a9284 : 0xa88a5e;
  }
  if (H > 0.2 && slope > 0.6 && hh < 0.6) c = fshade(c, 0.92);
  if (hh > 0.993) c = [0xfff6e8, 0xffe066, 0xff8ad0][(hh * 9000) % 3 | 0];
  return c;
}

/** The hills relief (one mesh per band of rows, so the camera culls what it can't see). */
export function buildHills() {
  const W = Math.round((BOX.x1 - BOX.x0) / VQ), D = Math.round((BOX.z1 - BOX.z0) / VQ);
  const h = new Uint16Array(W * D), top = new Uint32Array(W * D);
  const Hs = new Float32Array(W * D);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const x = BOX.x0 + (i + 0.5) * VQ, z = BOX.z0 + (k + 0.5) * VQ;
    Hs[i + W * k] = inView(x, z) ? landH(x, z) : 0;
  }
  const BASE = 6; // levels below 0
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const q = i + W * k;
    const x = BOX.x0 + (i + 0.5) * VQ, z = BOX.z0 + (k + 0.5) * VQ;
    if ((Math.abs(x) < NEAR && Math.abs(z) < NEAR) || !inView(x, z)) continue; // the near meadow / out of sight
    const H = Hs[q];
    const sx = (Hs[Math.min(W - 1, i + 1) + W * k] - Hs[Math.max(0, i - 1) + W * k]) / (2 * VQ);
    const sz = (Hs[i + W * Math.min(D - 1, k + 1)] - Hs[i + W * Math.max(0, k - 1)]) / (2 * VQ);
    let lv = BASE + Math.round(H / VQ);
    const c = landColor(x, z, i, k, H, Math.hypot(sx, sz));
    const f = Math.hypot(x, z) > 20 && z < -10 ? fieldAt(x, z) : null;
    if (f && f.edge && hash3(i, k, 1, 4) < 0.85) lv += 1; // hedgerows stand proud
    h[q] = lv;
    top[q] = c;
  }
  const side = (q, y) => (y >= h[q] - 1 ? fshade(top[q], 0.8) : y > h[q] - 3 ? 0x5a4028 : 0x4e3622);
  const mat = meadowToon();
  const meshes = [];
  const RB = 40; // rows per chunk
  for (let k0 = 0; k0 < D; k0 += RB) {
    const geo = meshRelief({ W, D, h, top, side, U: [VQ, 0, 0], V: [0, 0, VQ], N: [0, VQ, 0], origin: [BOX.x0, -BASE * VQ, BOX.z0], rows: [k0, Math.min(D, k0 + RB)] });
    if (!geo.attributes.position.count) continue;
    const m = new THREE.Mesh(geo, mat);
    m.userData.noBatch = true;
    meshes.push(m);
  }
  return { meshes, heightAt: (x, z) => landH(x, z), topAt: (x, z) => {
    const i = Math.floor((x - BOX.x0) / VQ), k = Math.floor((z - BOX.z0) / VQ);
    if (i < 0 || k < 0 || i >= W || k >= D) return landH(x, z);
    return (h[i + W * k] - BASE) * VQ;
  } };
}

// ------------------------------------------------------------------ trees
/** Split a tree into wood (still) and leaves (sway + shimmer) meshes under one group. */
function treeGroup(wood, leaves, S, pivot, leafSway = 1) {
  const g = new THREE.Group();
  const wm = voxMesh(wood, { scale: S, pivot, material: meadowToon() });
  const lm = voxMesh(leaves, { scale: S, pivot, material: meadowToon({ sway: leafSway, shimmer: 1, cell: 1 / S }) });
  g.add(wm, lm);
  g.userData.parts = { wood: wm, leaves: lm };
  return g;
}

const LEAF = (lit, a = 0) => {
  const pal = [[0x9ad468, 0x7cc050, 0x5aa83c, 0x3e8030], [0xb8d870, 0x98c858, 0x78b048, 0x5a9038], [0x6aa850, 0x548c40, 0x3e7034, 0x2e5a2a]][a];
  return lit > 0.55 ? pal[0] : lit > 0.1 ? pal[1] : lit > -0.4 ? pal[2] : pal[3];
};

/** A broad oak (1/12): flared roots, a split trunk, clumped canopy lit from the sun's side. */
export function makeOak(seed = 5, { apples = true } = {}) {
  const rng = makeRng(seed);
  const S = 1 / 12;
  const wood = new VoxelGrid(60, 76, 60), leaves = new VoxelGrid(60, 76, 60);
  const cx = 30, cz = 30;
  for (let y = 0; y < 34; y++) {
    const r = y < 4 ? 4.6 - y * 0.5 : 3.0 - y * 0.02;
    const ox = Math.sin(y * 0.09) * 1.2;
    wood.cylinderY(cx + ox, cz, r, y, y + 1, (x, yy, z) => ((x + z + (yy >> 2)) % 5 === 0 ? 0x4a3020 : (x < cx ? 0x7a5636 : 0x5a3e28)));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
    for (let r = 3; r < 8; r++) wood.set(cx + Math.cos(a) * r, r > 6 ? 0 : 1, cz + Math.sin(a) * r, 0x5a3e28);
  }
  for (const [bx, bz, by] of [[-8, -2, 30], [7, 3, 32], [1, -7, 34]]) {
    for (let t = 0; t <= 10; t++) wood.ellipsoid(cx + (bx * t) / 10, 26 + ((by - 26) * t) / 10, cz + (bz * t) / 10, 1.6, 1.6, 1.6, 0x5a3e28);
  }
  const clumps = [[0, 46, 0, 15, 11, 15], [-11, 40, -3, 10, 8, 10], [11, 42, 4, 11, 8, 10], [2, 41, -11, 10, 8, 9], [-3, 40, 11, 10, 7, 9], [3, 56, 2, 10, 7, 10]];
  for (const [ox, oy, oz, rx, ry, rz] of clumps) {
    leaves.ellipsoid(cx + ox, oy, cz + oz, rx, ry, rz, (x, y, z, dx, dy, dz) => {
      const nz = hash3(x >> 1, y >> 1, z >> 1, 3 + seed);
      if (nz < 0.14 && dx * dx + dy * dy + dz * dz > 0.55) return -1; // ragged edges, gaps for the light
      const lit = -dx * 0.55 + dy * 0.8 - dz * 0.35;
      if (apples && hash3(x, y, z, 4) > 0.985) return 0xd04a3a;
      return LEAF(lit);
    });
  }
  return treeGroup(wood, leaves, S, [cx, 0, cz]);
}

/** A silver birch (1/16): slim white trunk with dark marks, airy pale canopy. */
export function makeBirch(seed = 3) {
  const rng = makeRng(seed);
  const S = 1 / 16;
  const wood = new VoxelGrid(40, 90, 40), leaves = new VoxelGrid(40, 90, 40);
  const cx = 20, cz = 20;
  let x = cx, z = cz;
  const lx = rng.range(-0.08, 0.08), lz = rng.range(-0.08, 0.08);
  for (let y = 0; y < 70; y++) {
    x += lx; z += lz;
    const r = y < 3 ? 2.4 : 1.6;
    wood.cylinderY(x, z, r, y, y + 1, (xx, yy, zz) => (hash3(xx, yy >> 1, zz, 5) < 0.18 || (yy % 9 === 0 && hash3(xx, yy, zz, 6) < 0.7) ? 0x2a2420 : xx < x ? 0xf4f0e6 : 0xd8d2c4));
  }
  for (let b = 0; b < 5; b++) {
    const y0 = 38 + b * 7, a = rng.range(0, 6.28);
    for (let t = 0; t < 8; t++) wood.set(cx + lx * y0 + Math.cos(a) * t, y0 + t * 0.6, cz + lz * y0 + Math.sin(a) * t, 0x3a3230);
  }
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, 6.28), r = rng.range(0, 7);
    const oy = rng.range(48, 80);
    leaves.ellipsoid(cx + lx * oy + Math.cos(a) * r, oy, cz + lz * oy + Math.sin(a) * r, rng.range(6, 9), rng.range(6, 9), rng.range(6, 9), (xx, y, zz, dx, dy, dz) => {
      if (hash3(xx >> 1, y >> 1, zz >> 1, 7 + i) < 0.3) return -1;
      return LEAF(-dx * 0.5 + dy * 0.8 - dz * 0.3, 1);
    });
  }
  return treeGroup(wood, leaves, S, [cx, 0, cz], 1.3);
}

/** A fir (1/10): tiers of dark needles. */
export function makeFir(seed = 1, hgt = 46) {
  const rng = makeRng(seed);
  const S = 1 / 10;
  const W = 34;
  const wood = new VoxelGrid(W, hgt + 6, W), leaves = new VoxelGrid(W, hgt + 6, W);
  const c = W / 2;
  wood.cylinderY(c, c, 1.6, 0, hgt - 6, (x) => (x < c ? 0x6a4a30 : 0x4a3220));
  for (let y = 8; y < hgt; y++) {
    const t = (y - 8) / (hgt - 8);
    const tier = ((y - 8) % 7) / 7;
    const r = (1 - t) * 13 * (0.55 + 0.45 * (1 - tier)) + 1;
    leaves.cylinderY(c, c, r, y, y + 1, (x, yy, z) => {
      const dx = (x - c) / r, dz = (z - c) / r;
      if (hash3(x, yy, z, seed) < 0.08) return -1;
      const lit = -dx * 0.6 - dz * 0.3 + tier * 0.6;
      return lit > 0.5 ? 0x5a8a4a : lit > 0 ? 0x3e6e3a : lit > -0.5 ? 0x2e5a30 : 0x234a28;
    });
  }
  return treeGroup(wood, leaves, S, [c, 0, c], 0.6);
}

/** A round bush (1/16), optionally with berries or blossom. */
export function makeBush(seed = 1, { r = 9, berry = 0 } = {}) {
  const W = Math.ceil(r * 2 + 4);
  const g = new VoxelGrid(W, Math.ceil(r * 1.6 + 3), W);
  const c = W / 2;
  for (let i = 0; i < 3; i++) {
    const ox = (hash3(seed, i, 1, 2) - 0.5) * r * 0.8, oz = (hash3(seed, i, 2, 2) - 0.5) * r * 0.8;
    g.ellipsoid(c + ox, r * 0.7, c + oz, r * 0.75, r * 0.7, r * 0.75, (x, y, z, dx, dy, dz) => {
      if (hash3(x >> 1, y >> 1, z >> 1, seed) < 0.12 && dy > 0.2) return -1;
      if (berry && hash3(x, y, z, seed + 9) > 0.975) return berry;
      return LEAF(-dx * 0.5 + dy * 0.8 - dz * 0.3, 2);
    });
  }
  const m = voxMesh(g, { scale: 1 / 16, pivot: [c, 0, c], material: meadowToon({ sway: 0.35, swayBase: -2, shimmer: 1, cell: 16 }) });
  return m;
}

/** A small far tree (1/6): a lollipop of leaves, cheap. */
function makeFarTree(seed, kind = 0) {
  const S = 1 / 6;
  const wood = new VoxelGrid(10, 22, 10), leaves = new VoxelGrid(10, 22, 10);
  wood.box(4, 0, 4, 2, 8, 2, 0x5a3e28);
  if (kind === 1) {
    for (let y = 4; y < 21; y++) {
      const r = (1 - (y - 4) / 17) * 4.4 + 0.4;
      leaves.cylinderY(5, 5, r, y, y + 1, (x, yy, z) => ((x - 5) * 0.6 + (z - 5) * 0.3 < 0 ? 0x3e6e3a : 0x2a5430));
    }
  } else {
    leaves.ellipsoid(5, 12, 5, 4.4, 5.5, 4.4, (x, y, z, dx, dy, dz) => LEAF(-dx * 0.55 + dy * 0.8 - dz * 0.35, seed % 2 ? 0 : 2));
  }
  return treeGroup(wood, leaves, S, [5, 0, 5], 0.5);
}

// ------------------------------------------------------------------ village
const ROOFS = [0xb84a32, 0x9a3a2a, 0xc86a3a, 0x7a5a4a];
/** A cottage (1/8): whitewashed walls, timber frame, pitched roof, a chimney. Returns {mesh, chimney}. */
function makeCottage(seed, { w = 24, d = 18, h = 16 } = {}) {
  const rng = makeRng(seed);
  const roof = ROOFS[seed % ROOFS.length];
  const R = Math.ceil(d / 2) + 2;
  const g = new VoxelGrid(w + 4, h + R + 10, d + 4);
  const ox = 2, oz = 2;
  const wall = seed % 3 === 2 ? 0xe8d8b8 : 0xf2ece0;
  g.box(ox, 0, oz, w, h, d, (x, y, z) => {
    const fx = x - ox, fz = z - oz;
    const frame = fx === 0 || fx === w - 1 || fz === 0 || fz === d - 1 || y === h - 1 || y === 0 || (y === 8 && hash3(x, 0, z, seed) < 2);
    if (y < 2) return 0x8a8278; // stone footing
    if (frame && (fx === 0 || fx === w - 1) && (fz === 0 || fz === d - 1)) return 0x4a3020;
    if (y === h - 1 || y === 8) return 0x5a3a24;
    return (x + y + z) % 11 === 0 ? fshade(wall, 0.95) : wall;
  });
  // windows (warm inside), a door
  for (let i = 0; i < 2; i++) {
    const wx = ox + 4 + i * (w - 12);
    g.box(wx, 10, oz + d - 1, 4, 4, 1, (x, y) => (y === 10 || y === 13 ? 0x5a3a24 : 0xf0c870));
    g.box(wx, 10, oz, 4, 4, 1, 0x3a3a48);
  }
  g.box(ox + Math.floor(w / 2) - 2, 2, oz + d - 1, 4, 7, 1, 0x6a4428);
  // roof (gable along x)
  for (let k = 0; k <= R; k++) {
    const y = h + k;
    const z0 = oz - 1 + k, z1 = oz + d - k;
    if (z0 > z1) break;
    g.box(ox - 1, y, z0, w + 2, 1, 1, (x) => (x % 3 === 0 ? fshade(roof, 0.85) : roof));
    g.box(ox - 1, y, z1, w + 2, 1, 1, (x) => (x % 3 === 0 ? fshade(roof, 0.75) : fshade(roof, 0.88)));
    if (z1 - z0 > 1) g.box(ox, y, z0 + 1, w, 1, z1 - z0 - 1, wall);
  }
  // chimney
  const chx = ox + (rng.chance(0.5) ? 3 : w - 6);
  const chTop = h + R + 4;
  g.box(chx, h - 2, oz + Math.floor(d / 2) - 1, 3, chTop - h + 2, 3, (x, y) => (y % 3 === 0 ? 0x7a5048 : 0x9a6050));
  const mesh = voxMesh(g, { scale: 1 / 8, pivot: [(w + 4) / 2, 0, (d + 4) / 2], material: meadowToon() });
  return { mesh, chimney: new THREE.Vector3((chx + 1.5 - (w + 4) / 2) / 8, (chTop + 0.5) / 8, (oz + d / 2 - (d + 4) / 2 + 0.5) / 8) };
}

/** A small chapel with a steeple. */
function makeChapel() {
  const g = new VoxelGrid(26, 64, 34);
  g.box(3, 0, 6, 20, 18, 26, (x, y, z) => (y < 2 ? 0x8a8278 : (x + y * 2 + z) % 9 === 0 ? 0xd8d0c0 : 0xe8e0d0));
  for (let k = 0; k <= 11; k++) g.box(2, 18 + k, 5 + k, 22, 1, 28 - 2 * k, (x) => (x % 2 ? 0x5a5a6a : 0x4a4a5a));
  g.box(8, 0, 0, 10, 36, 9, (x, y) => (y < 2 ? 0x8a8278 : y > 28 && y < 32 && x > 10 && x < 15 ? 0x2a2a30 : 0xece4d4));
  for (let k = 0; k < 18; k++) {
    const r = 5.5 * (1 - k / 18);
    g.box(Math.round(13 - r), 36 + k, Math.round(4.5 - r), Math.max(1, Math.round(2 * r)), 1, Math.max(1, Math.round(2 * r)), 0x4a4a5a);
  }
  g.box(12, 54, 4, 2, 4, 1, 0xd8b040);
  g.box(11, 56, 4, 4, 1, 1, 0xd8b040);
  g.box(10, 6, 27, 6, 8, 5, 0x6a4428);
  return voxMesh(g, { scale: 1 / 8, pivot: [13, 0, 17], material: meadowToon() });
}

/** A windmill: a stone tower with a cap, and sails that turn. Returns {group, sails}. */
function makeWindmill() {
  const g = new VoxelGrid(34, 70, 34);
  const c = 17;
  for (let y = 0; y < 52; y++) {
    const r = 11 - y * 0.09;
    g.cylinderY(c, c, r, y, y + 1, (x, yy, z) => {
      if (yy % 6 === 0) return 0xb8b0a0;
      const lit = (x - c) * -0.6 + (z - c) * -0.4;
      return hash3(x >> 1, yy >> 1, z >> 1, 4) < 0.2 ? 0xc8c0b0 : lit > 0 ? 0xe8e0d0 : 0xd0c8b8;
    });
  }
  for (let k = 0; k < 12; k++) g.cylinderY(c, c, 9 - k * 0.7, 52 + k, 53 + k, (x) => (x % 2 ? 0x6a3a2a : 0x7a4a32));
  g.box(c - 2, 2, c + 8, 4, 7, 4, 0x5a3a24);
  g.box(c - 2, 30, c + 8, 4, 4, 3, 0x3a3a48);
  const tower = voxMesh(g, { scale: 1 / 8, pivot: [c, 0, c], material: meadowToon() });
  // sails: a cross of lattice blades
  const s = new VoxelGrid(80, 80, 3);
  for (let b = 0; b < 4; b++) {
    const a = b * Math.PI / 2;
    for (let t = 3; t < 39; t++) {
      const x = 40 + Math.cos(a) * t, y = 40 + Math.sin(a) * t;
      s.set(x, y, 1, 0x5a3a24);
      if (t > 8) for (let w = 1; w < 7; w++) {
        const px = x - Math.sin(a) * w, py = y + Math.cos(a) * w;
        s.set(px, py, 1, (t + w) % 3 === 0 ? 0x5a3a24 : 0xf0e6d0);
      }
    }
  }
  s.box(38, 38, 0, 4, 4, 3, 0x3a2a20);
  const sails = voxMesh(s, { scale: 1 / 8, pivot: [40, 40, 1.5], material: meadowToon() });
  const grp = new THREE.Group();
  grp.add(tower);
  const hub = new THREE.Group();
  hub.position.set(0, 58 / 8, (c + 10 - c) / 8 + 0.2);
  hub.add(sails);
  grp.add(hub);
  return { group: grp, sails: hub };
}

/** The village on its shelf + the windmill + copses; trees and buildings sit on the land. */
export function buildVillage(hills) {
  const group = new THREE.Group();
  const chimneys = [];
  const at = (o, x, z, ry = 0, s = 1) => { o.position.set(x, hills.topAt(x, z), z); o.rotation.y = ry; o.scale.setScalar(s); group.add(o); return o; };
  const V = VILLAGE;
  const spots = [[-5, 1, 0.3], [-1, -4, -0.2], [4, 0, 0.15], [8, -3, -0.35], [-7, -6, 0.5], [2, 5, 0.05], [10, 3, -0.1]];
  spots.forEach(([dx, dz, ry], i) => {
    const c = makeCottage(11 + i, { w: 20 + (i % 3) * 4, d: 16 + (i % 2) * 4, h: 14 + (i % 2) * 2 });
    at(c.mesh, V.x + dx, V.z + dz, ry + (i % 2 ? Math.PI : 0));
    c.mesh.updateMatrixWorld(true);
    chimneys.push(c.chimney.clone().applyMatrix4(c.mesh.matrixWorld));
  });
  at(makeChapel(), V.x + 4, V.z - 9, -0.25);
  const wm = makeWindmill();
  at(wm.group, WINDMILL.x, WINDMILL.z, 0.55, 0.7);
  // copses and lone trees on the hills (none on the road or in the village)
  const rng = makeRng(808);
  // copses: a wood on the left flank, clumps on the hills, a few lone trees
  const copses = [[-30, -18, 8, 12, 1], [-44, -38, 10, 16, 1], [24, -22, 4, 5, 0], [-16, -36, 3, 3, 0], [30, -46, 6, 8, 1], [8, -58, 6, 6, 0]];
  for (const [cx, cz, r, n, fir] of copses) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, 6.28), d = Math.sqrt(rng()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.7;
      if (Math.abs(x - roadX(z)) < 3 || Math.hypot(x - V.x, z - V.z) < 12 || Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 6) continue;
      at(makeFarTree(i + cx, fir && rng.chance(0.6) ? 1 : 0), x, z, rng.range(0, 6), rng.range(0.8, 1.35));
    }
  }
  // a few trees along the road up to the village
  for (const z of [-21, -33]) at(makeFarTree(z, 0), roadX(z) + (z === -21 ? 2.6 : -2.8), z, 0, 0.85);
  return { group, chimneys, sails: wm.sails };
}

// ------------------------------------------------------------------ far bands
/** A wrap-around strip of distance, H px tall (one px is about one metre at that range). */
function bandTexture(kind, seed, H, notch = null) {
  const W = 1024;
  const pc = new PixelCanvas(W, H);
  const n = makeNoise2D(seed), m = makeNoise2D(seed + 1);
  const ridge = (x) => {
    const u = (x / W) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    if (kind === 'mountains') {
      let r = 0, a = 1, f = 2.2;
      for (let o = 0; o < 4; o++) { r += (1 - Math.abs(n(cu * f + o * 7, su * f))) * a; a *= 0.45; f *= 2.3; }
      return H * (0.2 + Math.pow(clamp(r / 1.75, 0, 1), 1.6) * 0.78);
    }
    if (kind === 'ridges') return H * (0.35 + (n(cu * 3, su * 3) * 0.5 + 0.5) * 0.45 + m(cu * 11, su * 11) * 0.06);
    return H * (0.4 + (n(cu * 4, su * 4) * 0.5 + 0.5) * 0.4);
  };
  const tops = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    tops[x] = ridge(x);
    if (notch) { // a pass between the peaks for the sun to sink into
      let du = Math.abs(x / W - notch.u);
      du = Math.min(du, 1 - du);
      tops[x] *= 1 - notch.depth * Math.exp(-((du / notch.w) ** 2));
    }
  }
  const T = (x) => tops[((Math.round(x) % W) + W) % W];
  for (let x = 0; x < W; x++) {
    const top = Math.min(H, Math.round(tops[x]));
    for (let y = 0; y < top; y++) {
      const yy = H - 1 - y;
      const fromTop = top - y;
      // which way this bit of mountainside faces: compare the skyline to either side at a
      // reach that grows with depth, so light and shadow split along diagonal spurs
      const d = 1.5 + fromTop * 0.9;
      const lit = T(x + d) - T(x - d) > -0.5;
      let c;
      if (kind === 'mountains') {
        const snow = fromTop < 3 + H * 0.12 + n(x * 0.09, y * 0.2) * 2.5 && y > H * 0.42;
        c = snow ? (lit ? 0xf6e6dc : 0xc0c2dc) : lit ? 0xa49cc2 : 0x8284ae;
        if (fromTop <= 1) c = lit ? 0xfff2e4 : snow ? 0xd8d8ec : 0x9c98c4; // the ridgeline catches the sun
        c = fmix(c, 0xd2d6e4, clamp(1 - y / (H * 0.5), 0, 1) * 0.8); // haze at the foot
      } else if (kind === 'ridges') {
        c = lit ? 0x7c96a8 : 0x6882a0;
        if (fromTop > 2 && hash3(x >> 1, y, 3, seed) < 0.3) c = lit ? 0x6a86a0 : 0x5a7290; // forest texture
        if (fromTop <= 1) c = lit ? 0xa8bcc4 : 0x8aa0b4;
        c = fmix(c, 0xc8d4dc, clamp(1 - y / (H * 0.65), 0, 1) * 0.65);
      } else {
        c = lit ? 0x88aa74 : 0x749a6c;
        if (fromTop <= 1) c = 0x9cbc7c;
        else if (fromTop < 4 && m(x * 0.15, 1) > 0.2) c = 0x527a56; // tree lines
        c = fmix(c, 0xc8d4d0, 0.3 + clamp(1 - y / H, 0, 1) * 0.3);
      }
      pc.set(x, yy, c);
    }
  }
  const t = pixelTexture(pc.commit());
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Three cylinders of hazy distance: hills, forested ridges, snowy mountains (with a pass for the sun). */
export function buildFarBands(textures, sunDir = null) {
  const group = new THREE.Group();
  for (const [kind, r, hgt, px, seed] of [['mountains', 142, 27, 32, 41], ['ridges', 126, 17, 20, 42], ['hills', 110, 12, 14, 43]]) {
    // CylinderGeometry puts u at angle u*2pi measured from +z toward +x; the band is rotated by seed
    let notch = null;
    if (sunDir && kind !== 'hills') {
      const a = Math.atan2(sunDir.x, sunDir.z) - seed;
      notch = { u: ((a / (Math.PI * 2)) % 1 + 1) % 1, w: kind === 'mountains' ? 0.035 : 0.025, depth: kind === 'mountains' ? 0.7 : 0.5 };
    }
    const t = bandTexture(kind, seed, px, notch);
    textures.push(t);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 96, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, alphaTest: 0.5, fog: false }));
    band.position.y = -3 + hgt / 2;
    band.rotation.y = seed;
    band.renderOrder = -60;
    band.userData.noBatch = true;
    group.add(band);
  }
  return group;
}
