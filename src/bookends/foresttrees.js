// Trees and woodwork for the forest trail: tall pines (tiers of drooping needles over a long
// grooved trunk with flared roots, moss on the shady side, dead twigs low down) at two levels of
// detail, a mossy stump with a shelf fungus, a fallen-log footbridge with a rope rail, and a
// little wooden signpost. Pines return geometries (wood + needles) so the forest can draw every
// copy of a variant as one instanced mesh.
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, hash3, fshade, fmix } from './vox.js';
import { makeRng, makeNoise2D } from '../core/util.js';

const NEEDLE = [0x6e9e56, 0x4f8046, 0x3a6640, 0x2a4c32, 0x1e3a28]; // lit → deep shade
const BARK = [0x7a5638, 0x6a4a30, 0x5a3e28, 0x4a3020, 0x3a2418];
const MOSS = [0x6a8a3a, 0x587a34, 0x4a6a2e];

/**
 * A tall pine. height in metres, k voxels per metre (10 near, 5 far).
 * Returns { wood, leaves, k, height, crownY } (geometries in metres, origin at the trunk's foot).
 */
export function makePineGeo(seed, { height = 13, k = 10, crown = 0.38, spread = 2.6 } = {}) {
  const rng = makeRng(seed);
  const n1 = makeNoise2D(seed * 7 + 1);
  const H = Math.round(height * k);
  const R = Math.round(spread * k);
  const W = 2 * R + 8;
  const c = W / 2;
  const wood = new VoxelGrid(W, H + 6, W), leaves = new VoxelGrid(W, H + 6, W);
  const lx = rng.range(-0.012, 0.012), lz = rng.range(-0.012, 0.012);
  const tr0 = 0.4 * k, flare = 0.7 * k;
  const cxAt = (y) => c + lx * y, czAt = (y) => c + lz * y;
  // trunk with vertical bark plates and grooves; moss low on the shady (south, +z) side
  for (let y = 0; y < H - 2; y++) {
    const t = y / H;
    let r = tr0 * (1 - t * 0.85) + 0.6;
    if (y < flare) r += ((flare - y) / flare) ** 2 * 0.35 * k;
    const cx = cxAt(y), cz = czAt(y);
    wood.cylinderY(cx, cz, r, y, y + 1, (x, yy, z) => {
      const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
      const plates = Math.max(6, Math.round(r * 1.6));
      const u = (a / (Math.PI * 2) + 0.5) * plates + n1(yy * 0.05, 3) * 0.6;
      const groove = Math.abs(u - Math.round(u)) < 0.16;
      const lit = -Math.cos(a) * 0.5 - Math.sin(a) * 0.5; // the sun comes from -x, -z
      let col = groove ? BARK[4] : lit > 0.35 ? BARK[0] : lit > -0.2 ? BARK[1] : BARK[2];
      if (!groove && (yy + Math.round(u * 3)) % 9 === 0) col = BARK[3]; // plate edges
      if (hash3(x, yy >> 1, z, seed) < 0.05) col = fshade(col, 0.85);
      // moss
      if (yy < 1.6 * k && Math.sin(a) > 0.1 && hash3(x >> 1, yy >> 1, z >> 1, seed + 4) < 0.55 + (1.6 * k - yy) / (1.6 * k) * 0.4) col = MOSS[(x + yy + z) % 3];
      return col;
    });
  }
  // roots spreading over the ground
  const nr = 5 + rng.int(0, 2);
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const len = rng.range(0.9, 1.5) * k;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const rr = (1 - t) * 0.16 * k + 0.6;
      const x = c + Math.cos(a) * (tr0 + s), z = c + Math.sin(a) * (tr0 + s);
      const y = (1 - t) * 0.25 * k;
      wood.ellipsoid(x, y, z, rr, rr, rr, (xx, yy, zz) => (hash3(xx, yy, zz, seed + 9) < 0.3 ? BARK[3] : yy > y ? BARK[1] : BARK[2]));
    }
  }
  // dead twigs on the bare lower trunk
  const y0 = Math.round(H * crown);
  for (let i = 0; i < 7; i++) {
    const y = rng.range(H * 0.12, y0 - 0.3 * k);
    const a = rng.range(0, Math.PI * 2), len = rng.range(0.3, 0.8) * k;
    for (let s = 0; s < len; s++) wood.set(cxAt(y) + Math.cos(a) * (tr0 * 0.7 + s), y - s * 0.35, czAt(y) + Math.sin(a) * (tr0 * 0.7 + s), BARK[3]);
  }
  // the crown: tiers of drooping needle skirts, branches under them
  const tierH = 0.82 * k;
  const nT = Math.max(3, Math.floor((H - y0) / tierH));
  for (let ti = 0; ti < nT; ti++) {
    const ty = y0 + ti * tierH + rng.range(-0.1, 0.1) * k;
    const tt = (ty - y0) / (H - y0);
    const tr = R * Math.pow(1 - tt, 0.85) * (0.82 + rng.range(0, 0.18)) + 0.25 * k;
    const droop = 0.55 * k * (0.6 + 0.4 * (1 - tt));
    const thick = Math.max(2, 0.32 * k * (1 - tt * 0.5));
    const ph = rng.range(0, 6.28);
    const cx = cxAt(ty), cz = czAt(ty);
    // a few branches out to the skirt
    for (let b = 0; b < 5; b++) {
      const a = ph + b * 1.26;
      for (let s = tr0 * 0.5; s < tr * 0.75; s += 0.7) wood.set(cx + Math.cos(a) * s, ty - (s / tr) ** 2 * droop - 1, cz + Math.sin(a) * s, BARK[2]);
    }
    const lo = Math.floor(-tr - 1), hi = Math.ceil(tr + 1);
    for (let dz = lo; dz <= hi; dz++) for (let dx = lo; dx <= hi; dx++) {
      const d = Math.hypot(dx + 0.5, dz + 0.5);
      const a = Math.atan2(dz + 0.5, dx + 0.5);
      // a ragged rim: lobes and notches so the skirt reads as branch tips, not a disc
      const rim = tr * (0.86 + 0.14 * Math.sin(a * 7 + ph) + 0.08 * Math.sin(a * 13 + ph * 2));
      if (d > rim) continue;
      const e = d / rim;
      const top = ty - e * e * droop;
      const th = thick * (1 - e * 0.6) + 1;
      for (let s = 0; s < th; s++) {
        const y = Math.round(top - s);
        const x = Math.round(cx + dx), z = Math.round(cz + dz);
        if (e > 0.78 && hash3(x, y, z, seed + 1) < 0.22) continue; // ragged gaps at the rim only (holes inside cost faces)
        // light: the top of each skirt catches the sun on the -x/-z side; undersides are deep
        const under = s >= th - 1.5;
        const lit = -Math.cos(a) * 0.45 - Math.sin(a) * 0.35 + (1 - e) * 0.2;
        let col = under ? NEEDLE[4] : s === 0 ? (lit > 0.35 ? NEEDLE[0] : lit > -0.05 ? NEEDLE[1] : NEEDLE[2]) : NEEDLE[3];
        if (s === 0 && e > 0.8 && hash3(x, y, z, seed + 2) < 0.35) col = fmix(col, 0x9ab868, 0.35); // fresh tips
        leaves.set(x, y, z, col);
      }
    }
  }
  // the spire
  const tx = cxAt(H), tz = czAt(H);
  for (let y = H - 3; y < H + 4; y++) leaves.set(tx, y, tz, y > H + 1 ? NEEDLE[0] : NEEDLE[1]);
  const s = 1 / k;
  const opts = { scale: s, pivot: [c, 0, c] };
  return { wood: meshVoxGreedy(wood, opts), leaves: meshVoxGreedy(leaves, opts), k, height, crownY: y0 / k, radius: R / k };
}

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
