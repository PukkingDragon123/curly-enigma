// Voxel models for thrown explosives, at 1/72 m per voxel: a red paper stick with wax caps, a
// seam spiral and a cream label band; three sticks tied with twine; the blasting charge, an iron
// drum with red bands, hazard stripes, a brass cap and a red lamp. The fuse is its own geometry
// at every remaining length so it can burn down; tips[n] is the end of an n-voxel fuse.
import * as THREE from 'three';
import { VoxelGrid, meshGridGreedy } from '../../gfx/Voxel.js';
import { h3 } from '../noise.js';

export const MS = 1 / 72; // metres per model voxel

const RED = 0xc8342a, RED_HI = 0xdc5038, RED_DK = 0x9a2418, WAX = 0x6e1812;
const LABEL = 0xeee0b8, INK = 0x3a1a12, CORD = [0xd8ceb0, 0x9a8e74], TWINE = [0xc8a46a, 0x9a7a44];
const IRON = 0x4c4e58, IRON_HI = 0x6a6c78, BAND = 0xb8302a, HAZ_Y = 0xf2c23a, HAZ_K = 0x2a2420, BRASS = 0xdcae4e;

const jitter = (c, x, y, z, k = 0.06) => {
  const f = 1 + (h3(x, y, z, 7) - 0.5) * k * 2;
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
};

/** Paint one stick (vertical, centre cx, cz, radius r, from y0, length len) into grid g. */
function paintStick(g, cx, cz, r, y0, len, label = true) {
  for (let y = y0; y < y0 + len; y++) for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    if (dx * dx + dz * dz > r * r) continue;
    const t = y - y0;
    const ang = Math.atan2(dz, dx);
    let c = RED;
    if (t === 0 || t === len - 1) c = WAX;
    else if (t === 1 || t === len - 2) c = RED_DK;
    else if (label && t >= len * 0.4 && t < len * 0.6) {
      c = LABEL;
      // a stencilled mark on the label's front
      if (dz > r * 0.35 && Math.abs(dx) < r * 0.6 && t >= len * 0.45 && t < len * 0.55) c = INK;
    } else if ((((t + ang * 1.4) % 5) + 5) % 5 < 0.8) c = RED_HI; // the paper seam spirals round
    g.set(x, y, z, jitter(c, x, y, z));
  }
}

/** Grid voxels for a fuse path (each with its colour). */
function fuseCells(path) {
  return path.map(([x, y, z], i) => [x, y, z, CORD[i % 2]]);
}

function stickModel() {
  const W = 7, D = 7, LEN = 20, H = 28;
  const g = new VoxelGrid(W, H, D);
  paintStick(g, 3.5, 3.5, 2.7, 0, LEN);
  const fuse = fuseCells([[3, 20, 3], [3, 21, 3], [4, 22, 3], [4, 23, 3], [5, 24, 3], [5, 25, 4], [5, 26, 4]]);
  return { g, W, H, D, fuse, pivot: [3.5, LEN / 2, 3.5], radius: 0.04, len: LEN * MS };
}

function bundleModel() {
  const W = 13, D = 12, LEN = 20, H = 30;
  const g = new VoxelGrid(W, H, D);
  const C = [[3.5, 3.5], [9.5, 3.5], [6.5, 8.5]];
  for (const [cx, cz] of C) paintStick(g, cx, cz, 2.7, 0, LEN, cx === 6.5);
  // twine: two bands of rope wrapped round the three
  for (const y0 of [4, 14]) for (let y = y0; y < y0 + 2; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (g.filled(x, y, z)) continue;
    const near = C.some(([cx, cz]) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= 3.7);
    if (near) g.set(x, y, z, (x + y + z) % 3 ? TWINE[0] : TWINE[1]);
  }
  const fuse = fuseCells([[6, 20, 6], [6, 21, 6], [7, 22, 6], [7, 23, 6], [7, 24, 7], [8, 25, 7], [8, 26, 7], [8, 27, 8]]);
  return { g, W, H, D, fuse, pivot: [6.5, LEN / 2, 6], radius: 0.066, len: LEN * MS };
}

function chargeModel() {
  const W = 14, D = 14, H = 18;
  const g = new VoxelGrid(W, H, D);
  const cx = 7, cz = 7;
  for (let y = 0; y < 14; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz, d = Math.hypot(dx, dz);
    const r = y === 13 ? 6 : 6.6;
    if (d > r) continue;
    const ang = Math.atan2(dz, dx);
    let c = d > r - 1 ? IRON : IRON_HI;
    if (y === 1 || y === 2 || y === 11 || y === 12) c = BAND;
    else if (y >= 5 && y <= 7) c = (Math.floor((ang / Math.PI) * 8 + y * 0.5) & 1) ? HAZ_Y : HAZ_K;
    else if ((y === 4 || y === 9) && Math.floor((ang / Math.PI) * 6 + 6) % 2 === 0 && d > r - 1) c = 0x9aa0a8; // rivets
    if (y === 13) c = d > 5 ? 0x34363e : IRON;
    g.set(x, y, z, jitter(c, x, y, z, 0.04));
  }
  // the brass cap
  for (let y = 14; y < 16; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= 2.2) g.set(x, y, z, jitter(BRASS, x, y, z));
  // a short fuse coiled at the rim
  const fuse = fuseCells([[11, 14, 7], [11, 15, 8], [12, 15, 9], [12, 16, 9]]);
  return { g, W, H, D, fuse, pivot: [7, 8, 7], radius: 0.105, len: 14 * MS, lamp: [[6, 16, 6], [7, 16, 6], [6, 16, 7], [7, 16, 7]] };
}

const cache = new Map();

/**
 * Model for an explosive item: { body, fuses: [geo per remaining length], tips: [Vector3],
 * lamp?, lampPos?, radius (collision m), len (m), charge }. Geometries are shared: don't dispose.
 */
export function explosiveModel(item) {
  const kind = item?.icon?.charge ? 'charge' : (item?.icon?.n || 1) >= 3 ? 'bundle' : 'stick';
  if (cache.has(kind)) return cache.get(kind);
  const m = kind === 'charge' ? chargeModel() : kind === 'bundle' ? bundleModel() : stickModel();
  const opts = { scale: MS, pivot: m.pivot, shade: true };
  const body = meshGridGreedy(m.g, opts);
  const fuses = [], tips = [];
  for (let n = 0; n <= m.fuse.length; n++) {
    if (!n) { fuses.push(null); tips.push(new THREE.Vector3(0, (m.H - m.pivot[1]) * MS * 0.5, 0)); continue; }
    const fg = new VoxelGrid(m.W, m.H, m.D);
    for (let i = 0; i < n; i++) { const [x, y, z, c] = m.fuse[i]; fg.set(x, y, z, c); }
    fuses.push(meshGridGreedy(fg, opts));
    const [x, y, z] = m.fuse[n - 1];
    tips.push(new THREE.Vector3((x + 0.5 - m.pivot[0]) * MS, (y + 1 - m.pivot[1]) * MS, (z + 0.5 - m.pivot[2]) * MS));
  }
  // the first fuse voxel's base: where the fuse leaves the stick (tips[0])
  { const [x, y, z] = m.fuse[0]; tips[0] = new THREE.Vector3((x + 0.5 - m.pivot[0]) * MS, (y - m.pivot[1]) * MS, (z + 0.5 - m.pivot[2]) * MS); }
  const out = { kind, body, fuses, tips, radius: m.radius, len: m.len, charge: kind === 'charge' };
  if (m.lamp) {
    const lg = new VoxelGrid(m.W, m.H, m.D);
    for (const [x, y, z] of m.lamp) lg.set(x, y, z, 0xff4a32);
    out.lamp = meshGridGreedy(lg, opts);
    out.lampPos = new THREE.Vector3((6.5 + 0.5 - m.pivot[0]) * MS, (17 - m.pivot[1]) * MS, (6.5 + 0.5 - m.pivot[2]) * MS);
  }
  cache.set(kind, out);
  return out;
}
