// The far forest: hundreds of distant trees in coarse voxels (0.8 m), instanced, one draw per kind
// (spruces, pines, round broadleaf crowns, a birch, a dead snag), lit by the low sun and sunk into
// the forest's fog like everything else. Past the last detailed trees they keep the forest going
// in 3D all the way to the hazy horizon; at that distance a coarse voxel is about a pixel or two.
//   makeFarTrees(items) items: [{x, y, z, h, frame, tint}] → Group (frame: 0-1 spruce, 2-3 pine,
//   4-5 broadleaf, 6 birch, 7 snag; h: height in metres). group.userData.hide(pred) drops the
//   trees pred({x, z, frame, tint}) picks and returns them (someone else stands there now).
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, fshade, fmix, hash3 } from '../vox.js';
import { makeRng } from '../../core/util.js';
import { forestToon } from '../forestfx.js';

export const FAR_FRAMES = 8;
const K = 1.25; // voxels per metre
const MODEL_H = 16; // every model is built 16 m tall, then scaled to its tree's height

const NEEDLE = [0x30583e, 0x22442e, 0x426e4a, 0x163222];
const PINE = [0x426c3e, 0x2e5432, 0x5a8648, 0x1e3a26];
const BROAD = [[0x74983e, 0x507834, 0x9cb44c, 0x34562a], [0x66903c, 0x456c30, 0x8eac4a, 0x2c4c28]];
const BIRCH = [0x80a444, 0x5c8236, 0xa8c454, 0x3c602a];
const TRUNK = 0x4a3a2c;

/** One far tree in coarse voxels: f = the kind (as the frames above). */
function farModel(f) {
  const rng = makeRng(404 + f * 31);
  const H = Math.round(MODEL_H * K), W = 11;
  const g = new VoxelGrid(W, H + 2, W);
  const c = (W - 1) / 2;
  const lit = (x, z, y, pal) => {
    // the sun is low in the north-west (-x, -z): that side lit, the far side deep
    const s = -(x - c) * 0.36 - (z - c) * 0.82;
    return s > 0.8 ? pal[2] : s > -0.4 ? pal[0] : pal[1];
  };
  if (f < 4) {
    const pine = f >= 2;
    const pal = pine ? PINE : NEEDLE;
    const crown0 = Math.round(H * (pine ? 0.5 : 0.08));
    for (let y = 0; y < H - 1; y++) g.set(c, y, c, pine && y > H * 0.3 ? fmix(TRUNK, 0xc87848, 0.3) : TRUNK);
    const tiers = pine ? 4 : 6 + (f % 2);
    for (let t = 0; t < tiers; t++) {
      const y0 = crown0 + Math.round(((H - crown0) * t) / tiers), y1 = crown0 + Math.round(((H - crown0) * (t + 1)) / tiers) + 1;
      const k = t / tiers;
      const r = pine ? 1.6 + Math.sin(k * 3) * 1.2 : (1 - k) * 4.2 + 0.6;
      for (let y = y0; y < y1; y++) {
        const rr = r * (1 - ((y - y0) / Math.max(1, y1 - y0)) * 0.55);
        for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
          if (Math.hypot(x - c, z - c) > rr + 0.2) continue;
          g.set(x, y, z, y === y0 ? pal[3] : lit(x, z, y, pal));
        }
      }
    }
    g.set(c, H, c, pal[0]);
  } else if (f < 7) {
    const pal = f === 6 ? BIRCH : BROAD[f - 4];
    const cy = Math.round(H * (f === 6 ? 0.66 : 0.58));
    for (let y = 0; y < cy; y++) g.set(c, y, c, f === 6 ? (y % 3 ? 0xd8d4c8 : 0x48443c) : TRUNK);
    const n = f === 6 ? 3 : 5;
    for (let b = 0; b < n; b++) {
      const a = (b / n) * 6.28 + rng.range(-0.4, 0.4), d = b ? rng.range(1.2, 2.2) : 0;
      const bx = c + Math.cos(a) * d, bz = c + Math.sin(a) * d, by = cy + (b ? rng.range(-1, 2) : 2);
      const r = (f === 6 ? 2 : 3) * (b ? rng.range(0.75, 0.95) : 1);
      for (let z = 0; z < W; z++) for (let y = Math.floor(by - r); y <= by + r; y++) for (let x = 0; x < W; x++) {
        const e = ((x - bx) / r) ** 2 + ((y - by) / (r * 0.85)) ** 2 + ((z - bz) / r) ** 2;
        if (e > 1 || (e > 0.7 && hash3(x, y, z, f) < 0.3)) continue;
        g.set(x, y, z, y < by - r * 0.5 ? pal[3] : y > by + r * 0.4 ? pal[2] : lit(x, z, y, pal));
      }
    }
  } else {
    for (let y = 0; y < H * 0.62; y++) g.set(c, y, c, 0x6a5e50);
    for (let i = 0; i < 4; i++) { const y = Math.round(H * (0.3 + i * 0.08)), a = i * 2.1; for (let s = 1; s < 3; s++) g.set(c + Math.cos(a) * s, y + s, c + Math.sin(a) * s, fshade(0x5a5044, 1)); }
  }
  return meshVoxGreedy(g, { scale: 1 / K, pivot: [c + 0.5, 0, c + 0.5] });
}

/** The far trees, instanced per kind. items: [{x, y, z, h, frame, tint}]. */
export function makeFarTrees(items) {
  const group = new THREE.Group();
  group.name = 'far-trees';
  const mat = forestToon({ dapple: false });
  const byKind = Array.from({ length: FAR_FRAMES }, () => []);
  for (const it of items) byKind[Math.max(0, Math.min(FAR_FRAMES - 1, it.frame | 0))].push(it);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const meshes = [];
  byKind.forEach((list, f) => {
    if (!list.length) return;
    const geo = farModel(f);
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      const k = it.h / MODEL_H;
      q.setFromAxisAngle(Y, hash3(Math.round(it.x * 3), 0, Math.round(it.z * 3), 7) * 6.28);
      m.setMatrixAt(i, M.compose(p.set(it.x, it.y, it.z), q, s.set(k * (0.9 + (it.tint ?? 1) * 0.1), k, k * (0.9 + (it.tint ?? 1) * 0.1))));
      m.setColorAt(i, col.setScalar(Math.min(1.15, it.tint ?? 1)));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.userData = { items: list, noBatch: true };
    m.name = 'far-trees';
    group.add(m);
    meshes.push(m);
  });
  group.userData.noBatch = true;
  group.userData.hide = (pred) => {
    const out = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of meshes) {
      m.userData.items.forEach((it, i) => { if (pred(it)) { m.setMatrixAt(i, zero); out.push(it); } });
      m.instanceMatrix.needsUpdate = true;
    }
    return out;
  };
  return group;
}
