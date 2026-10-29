// Woodwork for the forest trail: a mossy stump with a shelf fungus, a fallen-log footbridge with a
// rope rail, a little wooden signpost, and the chunked instancing every forest part is drawn with.
// (The trees themselves are in forest/trees.js.)
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, hash3, fshade } from './vox.js';
import { makeRng } from '../core/util.js';

const BARK = [0x7a5638, 0x6a4a30, 0x5a3e28, 0x4a3020, 0x3a2418];
const MOSS = [0x6a8a3a, 0x587a34, 0x4a6a2e];

/** A mossy stump with a shelf fungus (1/16 m). Returns a geometry. */
export function makeStumpGeo(seed = 1) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(20, 12, 20);
  const r = rng.range(4.2, 5.4), h = rng.int(5, 8);
  for (let y = 0; y < h; y++) {
    g.cylinderY(10, 10, r + (y < 2 ? 1.2 - y * 0.5 : 0), y, y + 1, (x, yy, z) => {
      const a = Math.atan2(z - 10, x - 10);
      if (yy === h - 1) { // the cut: rings
        const d = Math.hypot(x + 0.5 - 10, z + 0.5 - 10);
        return d > r - 1 ? BARK[3] : Math.round(d) % 2 ? 0xc89a68 : 0xb08050;
      }
      let col = Math.round(a * 4) % 2 ? BARK[1] : BARK[2];
      if (Math.sin(a) > 0 && hash3(x, yy, z, seed) < 0.6) col = MOSS[(x + z) % 3];
      return col;
    });
  }
  g.ellipsoid(10 + r, h * 0.5, 10, 1.6, 0.7, 2.4, (x, y) => (y >= Math.floor(h * 0.5) ? 0xe8c890 : 0xb8945a));
  return meshVoxGreedy(g, { scale: 1 / 16, pivot: [10, 0, 10] });
}

/**
 * The footbridge: two split logs side by side spanning `len` metres along +z, a rope rail on
 * posts on one side. Built at 1/16 m, origin at the middle of the span on the ground line.
 */
export function makeBridgeGeo(len = 3.2) {
  const L = Math.round(len * 16);
  const g = new VoxelGrid(30, 26, L + 4);
  const z0 = 2;
  // the logs (flat side up), a little sag in the middle
  for (const [cx, r] of [[10, 4.2], [19, 4.4]]) {
    for (let z = z0; z < z0 + L; z++) {
      const t = (z - z0) / L;
      const sag = Math.sin(t * Math.PI) * 1.2;
      const cy = 5 - sag;
      for (let dy = -r; dy <= 0; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.round(cx + dx), y = Math.round(cy + dy);
        const end = z < z0 + 1 || z > z0 + L - 2;
        let col = dy > -0.5 ? (Math.abs(dx) < r - 1 ? ((z + (dx > 0 ? 1 : 0)) % 7 === 0 ? 0x8a6040 : 0xb08454) : 0x8a6040) : Math.abs(dx) > r - 1.2 ? 0x5a3e28 : 0x6e4a30;
        if (end) col = Math.round(Math.hypot(dx, dy)) % 2 ? 0xc89a68 : 0xa87a4a;
        if (dy < -1 && hash3(x, y, z, 3) < 0.25) col = MOSS[(x + z) % 3];
        g.set(x, y, z, col);
      }
    }
  }
  // the rail: posts at the ends and the middle, a sagging rope between them
  const posts = [z0 + 2, z0 + Math.round(L / 2), z0 + L - 3];
  for (const pz of posts) {
    for (let y = 2; y < 22; y++) { g.set(25, y, pz, y > 20 ? 0x8a6040 : 0x6a4a30); g.set(26, y, pz, 0x5a3e28); }
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i], b = posts[i + 1];
    for (let z = a; z <= b; z++) {
      const t = (z - a) / (b - a);
      const y = 20 - Math.sin(t * Math.PI) * 3;
      g.set(25, y, z, (z % 2) ? 0xd8c090 : 0xb89a68);
    }
  }
  return meshVoxGreedy(g, { scale: 1 / 16, pivot: [15, 5, z0 + L / 2] });
}

/** A weathered signpost with two arrows (1/16 m). */
export function makeSignGeo() {
  const g = new VoxelGrid(30, 30, 6);
  for (let y = 0; y < 26; y++) for (let x = 14; x < 16; x++) for (let z = 2; z < 4; z++) g.set(x, y, z, x === 14 ? 0x7a5636 : 0x5a3e28);
  const board = (y0, dir, col) => {
    for (let x = 0; x < 13; x++) for (let y = 0; y < 4; y++) {
      const tip = dir > 0 ? 12 - x : x;
      if (tip < 2 && (y === 0 || y === 3) && tip < 1) continue;
      const xx = dir > 0 ? 15 + x : 14 - x;
      g.set(xx, y0 + y, 4, y === 3 ? fshade(col, 1.12) : (x + y) % 5 === 0 ? fshade(col, 0.85) : col);
      if (y === 1 && x > 2 && x < 10 && x % 2 === 0) g.set(xx, y0 + y, 5, 0x3a2418); // carved letters
    }
  };
  board(20, 1, 0xa87a4a);
  board(14, -1, 0x9a6e44);
  return meshVoxGreedy(g, { scale: 1 / 16, pivot: [15, 0, 3] });
}

/**
 * Instanced copies split into spatial chunks (cell × cell metres) so the ones off screen are culled.
 * Returns a Group of InstancedMeshes.
 */
export function instanceChunked(geo, material, items, { cell = 14, outline = true, name = '' } = {}) {
  const g = new THREE.Group();
  const bins = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(it);
  }
  for (const list of bins.values()) g.add(instance(geo, material, list, { outline, name }));
  g.userData.noBatch = true;
  return g;
}

/** Instanced copies of a geometry with a material: items [{x, y, z, ry, s}]. */
export function instance(geo, material, items, { outline = true, name = '' } = {}) {
  const m = new THREE.InstancedMesh(geo, material, items.length);
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const M = new THREE.Matrix4();
  items.forEach((it, i) => {
    q.setFromAxisAngle(Y, it.ry || 0);
    p.set(it.x, it.y || 0, it.z);
    const s = it.s || 1;
    sc.set(s, it.sy || s, s);
    M.compose(p, q, sc);
    m.setMatrixAt(i, M);
  });
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  m.name = name;
  if (outline) m.layers.enable(1);
  m.userData.noBatch = true;
  return m;
}
