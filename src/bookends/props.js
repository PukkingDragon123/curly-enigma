// Small voxel props shared by the title and ending dioramas. All at character scale
// (1 voxel = 1/16 unit) unless noted. Glowing parts use the unlit 'basic' material so they
// stay bright in the dark.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, jitf, voxLine, hash3 } from './vox.js';
import { makeRng, shade, mixHex } from '../core/util.js';

const S16 = 1 / 16;

function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

// ------------------------------------------------------------------ campfire
/** Stones + crossed logs + glowing coals. Origin at ground centre. */
export function makeCampfire(seed = 5) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(26, 10, 26);
  const c = 13;
  // ash bed
  g.ellipsoid(c, 0, c, 7.5, 1.2, 7.5, (x, y, z) => jitf(0x3a302c, x, y, z, 2, 0.12));
  // stone ring
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = 9.2;
    const base = rng.pick([0x8a8278, 0x7a7068, 0x9a9088, 0x6e6660]);
    g.ellipsoid(c + Math.cos(a) * r, 1.4, c + Math.sin(a) * r, rng.range(2.0, 2.6), rng.range(1.6, 2.2), rng.range(1.8, 2.4), (x, y, z) => jitf(y > 2 ? shade(base, 1.12) : base, x, y, z, 3, 0.1));
  }
  // logs: a little teepee of three, plus one lying across
  const bark = (x, y, z, t) => (t < 0.06 || t > 0.94 ? 0xd8b080 : jitf(hash3(x | 0, y | 0, z | 0, 4) < 0.3 ? 0x4a2e1a : 0x6a4426, x, y, z, 5, 0.1));
  voxLine(g, [6, 1.5, 9], [20, 2.5, 16], bark, 1.3);
  voxLine(g, [7, 1.5, 17], [19, 3, 8], bark, 1.3);
  voxLine(g, [13, 1.5, 5], [13, 2.5, 21], bark, 1.2);
  const mesh = voxMesh(g, { pivot: [c, 0, c], scale: S16 });
  // glowing coals in the middle
  const k = new VoxelGrid(26, 6, 26);
  for (let i = 0; i < 26; i++) {
    const x = c + rng.range(-4, 4), z = c + rng.range(-4, 4);
    const y = rng.int(1, 3);
    k.set(x, y, z, rng.pick([0xffb040, 0xff7a1a, 0xffe080, 0xd9401a]));
  }
  k.ellipsoid(c, 1, c, 3.2, 1.4, 3.2, (x, y, z) => (hash3(x, y, z, 9) < 0.5 ? 0xff8a2a : 0xc9401a));
  const coals = voxMesh(k, { pivot: [c, 0, c], scale: S16, kind: 'basic', outline: false });
  return group(mesh, coals);
}

// ------------------------------------------------------------------ rocks & logs
export function makeRock(seed = 1, { w = 14, h = 10, d = 12, color = 0x7a7068, moss = 0 } = {}) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(w + 4, h + 3, d + 4);
  const cx = (w + 4) / 2, cz = (d + 4) / 2;
  const blobs = 3 + rng.int(0, 2);
  for (let i = 0; i < blobs; i++) {
    const rx = rng.range(w * 0.3, w * 0.5), ry = rng.range(h * 0.45, h * 0.75), rz = rng.range(d * 0.3, d * 0.5);
    g.ellipsoid(cx + rng.range(-w * 0.18, w * 0.18), ry * 0.55, cz + rng.range(-d * 0.15, d * 0.15), rx, ry, rz, (x, y, z) => {
      let col = jitf(color, x, y, z, seed, 0.1);
      if (moss && y > h * 0.55 && hash3(x, y, z, seed) < moss) col = jitf(0x5a7a3a, x, y, z, seed + 1, 0.12);
      return col;
    });
  }
  // flatten the bottom
  g.paint((x, y) => (y < 1 ? -1 : undefined));
  return voxMesh(g, { pivot: [cx, 1, cz], scale: S16 });
}

/** A short log lying along x (seat). length/radius in voxels. */
export function makeLog(len = 22, r = 3.2) {
  const g = new VoxelGrid(len + 2, Math.ceil(r * 2) + 2, Math.ceil(r * 2) + 2);
  const cy = r + 0.5, cz = r + 1;
  for (let x = 1; x <= len; x++) {
    for (let y = 0; y < g.h; y++) for (let z = 0; z < g.d; z++) {
      const dy = y + 0.5 - cy, dz = z + 0.5 - cz;
      const d = Math.sqrt(dy * dy + dz * dz);
      if (d > r) continue;
      const end = x === 1 || x === len;
      let col;
      if (end) col = d < r * 0.35 ? 0xb88a5a : d < r * 0.7 ? 0xd8b080 : 0x5a3a20;
      else col = hash3(x, y, z, 7) < 0.25 ? 0x4a2e1a : (x % 5 === 0 ? 0x5e3c22 : 0x6e4628);
      g.set(x, y, z, jitf(col, x, y, z, 8, 0.06));
    }
  }
  // a little moss on top
  for (let x = 3; x < len - 2; x++) if (hash3(x, 0, 0, 11) < 0.4) g.set(x, Math.ceil(cy + r - 0.5), Math.round(cz - 0.5), 0x6a8a3a);
  return voxMesh(g, { pivot: [(len + 2) / 2, 0, cz], scale: S16 });
}

// ------------------------------------------------------------------ mushrooms
/**
 * A cluster of glowing mushrooms. Returns {group, glows:[{pos:Vector3, size}]} where glow
 * positions are local to the group (for halo billboards).
 */
export function makeMushrooms(seed = 1, { n = 4, spread = 7, cap = [0x4ac8ff, 0x8ae8ff, 0x2a8ad0], stem = 0xd8dce4, scale = 1, glow = true } = {}) {
  const rng = makeRng(seed);
  const W = spread * 2 + 12;
  const stems = new VoxelGrid(W, 22, W);
  const caps = new VoxelGrid(W, 22, W);
  const c = W / 2;
  const glows = [];
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const hgt = big ? rng.int(9, 12) : rng.int(4, 8);
    const r = big ? rng.range(4, 5) : rng.range(2.2, 3.4);
    const x = c + (big ? 0 : rng.range(-spread, spread)), z = c + (big ? 0 : rng.range(-spread * 0.7, spread * 0.7));
    stems.cylinderY(x, z, big ? 1.5 : 1, 0, hgt, (xx, yy, zz) => jitf(yy < 2 ? shade(stem, 0.8) : stem, xx, yy, zz, seed, 0.05));
    caps.ellipsoid(x, hgt, z, r, r * 0.62, r, (xx, yy, zz, dx, dy) => {
      if (dy < -0.15) return -1;
      const top = dy > 0.5;
      let col = top ? cap[1] : cap[0];
      if (dy < 0.12) col = cap[2];
      if (hash3(xx, yy, zz, seed + i) < 0.12 && dy > 0.2) col = 0xf0fbff;
      return col;
    });
    glows.push({ pos: new THREE.Vector3((x - c) * S16 * scale, (hgt + 1) * S16 * scale, (z - c) * S16 * scale), size: r * 0.42 * scale });
  }
  const sm = voxMesh(stems, { pivot: [c, 0, c], scale: S16 * scale });
  const cm = voxMesh(caps, { pivot: [c, 0, c], scale: S16 * scale, kind: glow ? 'basic' : 'toon' });
  return { group: group(sm, cm), glows };
}

/** A tiny sprout with a yellow flower (grows in the sunbeam). */
export function makeFlower() {
  const g = new VoxelGrid(9, 12, 9);
  voxLine(g, [4, 0, 4], [4, 7, 4], 0x5aa83a);
  g.set(3, 3, 4, 0x6ac04a); g.set(2, 4, 4, 0x6ac04a); g.set(5, 5, 4, 0x6ac04a); g.set(6, 6, 4, 0x6ac04a);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(4 + dx, 8, 4 + dz, 0xffe066);
  g.set(4, 8, 4, 0xe08a1a);
  g.set(4, 9, 4, 0xfff2a0);
  return voxMesh(g, { pivot: [4.5, 0, 4.5], scale: S16 });
}

// ------------------------------------------------------------------ tools
/** A pickaxe; origin at the bottom of the handle, handle along +y. */
export function makePickaxe() {
  const g = new VoxelGrid(16, 24, 3);
  // handle
  for (let y = 0; y < 20; y++) g.set(8, y, 1, jitf(y < 5 ? 0x5a3a22 : 0x9a6a3a, 8, y, 1, 3, 0.06));
  g.set(8, 3, 1, 0xc94a3a); g.set(8, 4, 1, 0xc94a3a); // wrap
  // head: curved steel
  const head = [[2, 17], [3, 18], [4, 19], [5, 20], [6, 20], [7, 20], [8, 20], [9, 20], [10, 20], [11, 19], [12, 18], [13, 17], [14, 16]];
  for (const [x, y] of head) {
    for (let z = 0; z < 3; z++) {
      g.set(x, y, z, z === 1 ? 0xa8b0b8 : 0x8a929a);
      g.set(x, y + 1, z, z === 1 ? 0xd8e0e8 : 0xb8c0c8);
    }
  }
  g.set(1, 16, 1, 0xd8e0e8); g.set(15, 15, 1, 0xd8e0e8);
  g.box(7, 19, 0, 3, 3, 3, 0x5a6068);
  return voxMesh(g, { pivot: [8.5, 0, 1.5], scale: S16 });
}

/** A hanging root strand from the ceiling. Origin at the top, hangs down along -y. */
export function makeRoot(seed = 1, len = 40) {
  const rng = makeRng(seed);
  const W = 15;
  const g = new VoxelGrid(W, len + 2, W);
  let x = W / 2, z = W / 2;
  let dx = rng.range(-0.25, 0.25), dz = rng.range(-0.2, 0.2);
  const col = rng.pick([0xa8845a, 0x9a7650, 0xb89466]);
  for (let i = 0; i < len; i++) {
    const y = len - i;
    dx += rng.range(-0.08, 0.08); dz += rng.range(-0.06, 0.06);
    dx = Math.max(-0.35, Math.min(0.35, dx)); dz = Math.max(-0.3, Math.min(0.3, dz));
    x = Math.max(2, Math.min(W - 3, x + dx)); z = Math.max(2, Math.min(W - 3, z + dz));
    const thick = i < len * 0.45 ? 2 : 1;
    for (let a = 0; a < thick; a++) for (let b = 0; b < thick; b++) g.set(x + a, y, z + b, jitf(col, x | 0, y, z | 0, seed, 0.1));
    if (rng.chance(0.07) && i > 4) {
      // little rootlet
      const sx = rng.chance(0.5) ? 1 : -1;
      for (let k = 1; k < rng.int(2, 4); k++) g.set(x + sx * k, y - k, z, shade(col, 0.9));
    }
  }
  // fluffy tip
  g.set(x, 1, z, shade(col, 1.15));
  const mesh = voxMesh(g, { pivot: [W / 2, len + 1, W / 2], scale: S16 });
  return mesh;
}

// ------------------------------------------------------------------ sunglasses
/**
 * Black voxel sunglasses sized for a chibi head at character scale. Origin between the
 * lenses at the lens centre height, lenses facing +z.
 */
export function makeSunglasses(s = S16) {
  // 14 voxels wide: lenses at x 1..5 and 8..12, arms at x 0 and 13 hug a 12-voxel head
  const g = new VoxelGrid(14, 4, 9);
  const lens = 0x141018, frame = 0x2a2230, shine = 0xf4f0ff, tint = 0x3a2a5a;
  const z = 8;
  for (const x0 of [1, 8]) {
    g.box(x0, 0, z, 5, 3, 1, lens);
    g.set(x0, 0, z, -1); g.set(x0 + 4, 0, z, -1); // rounded bottom corners
    g.box(x0, 3, z, 5, 1, 1, frame);
    g.set(x0 + 1, 2, z, shine); g.set(x0 + 2, 2, z, shine); g.set(x0 + 1, 1, z, tint);
    g.set(x0 + 3, 1, z, tint);
  }
  g.box(6, 2, z, 2, 2, 1, frame); // bridge
  // arms run back along the sides of the head
  for (let k = 1; k < 9; k++) { g.set(0, 3, z - k + 1, frame); g.set(13, 3, z - k + 1, frame); }
  return voxMesh(g, { pivot: [7, 2, 8.5], scale: s });
}

// ------------------------------------------------------------------ coconut drink
/** Coconut with a straw and a tiny umbrella; origin at its bottom. */
export function makeCoconut() {
  const g = new VoxelGrid(12, 16, 12);
  g.ellipsoid(6, 3.4, 6, 3.6, 3.4, 3.6, (x, y, z, dx, dy) => {
    if (dy > 0.55) return -1;
    if (dy > 0.35) return 0xf6efe0;
    return hash3(x, y, z, 2) < 0.3 ? 0x5a3418 : 0x7a4a24;
  });
  g.ellipsoid(6, 5.4, 6, 2.2, 0.6, 2.2, 0xf0d8a0); // the drink
  // straw
  voxLine(g, [6, 5, 6], [8, 11, 7], (x, y) => ((Math.round(y) % 2) ? 0xf03a4a : 0xffffff));
  voxLine(g, [8, 11, 7], [9, 12, 7], 0xffffff);
  // umbrella
  voxLine(g, [4, 5, 5], [3, 11, 5], 0xd8b080);
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]) g.set(3 + dx, 12 - (Math.abs(dx) + Math.abs(dz) > 1 ? 1 : 0), 5 + dz, (dx + dz) % 2 ? 0xff7ab0 : 0xfff0a0);
  return voxMesh(g, { pivot: [6, 0, 6], scale: S16 });
}

// ------------------------------------------------------------------ lantern
/** A hanging/standing lantern; glass is unlit-bright. Returns {group, glowPos}. */
export function makeLantern({ post = 0, color = 0xffd060, frame = 0x3a2a22 } = {}) {
  const H = post + 12;
  const f = new VoxelGrid(9, H + 2, 9);
  const gl = new VoxelGrid(9, H + 2, 9);
  if (post) {
    for (let y = 0; y < post; y++) f.box(3, y, 3, 3, 1, 3, (x, yy, z) => jitf(0x5a3a22, x, yy, z, 4, 0.08));
    f.box(2, 0, 2, 5, 1, 5, 0x4a3020);
  }
  const b = post;
  f.box(1, b, 1, 7, 1, 7, frame);
  f.box(1, b + 7, 1, 7, 1, 7, frame);
  f.box(2, b + 8, 2, 5, 1, 5, frame);
  f.box(4, b + 9, 4, 1, 2, 1, frame);
  for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) f.box(x, b + 1, z, 1, 6, 1, frame);
  gl.box(2, b + 1, 2, 5, 6, 5, (x, y, z) => (y === b + 3 && x === 4 && z === 4 ? 0xffffff : mixHex(color, 0xffffff, (y - b) / 14)));
  const fm = voxMesh(f, { pivot: [4.5, 0, 4.5], scale: S16 });
  const gm = voxMesh(gl, { pivot: [4.5, 0, 4.5], scale: S16, kind: 'basic', outline: false });
  return { group: group(fm, gm), glowPos: new THREE.Vector3(0, (b + 4) * S16, 0) };
}

// ------------------------------------------------------------------ sack / bedroll
export function makeSack(seed = 2, color = 0xc8a070) {
  const g = new VoxelGrid(12, 14, 12);
  g.ellipsoid(6, 5, 6, 5, 5, 4.6, (x, y, z) => jitf(color, x, y, z, seed, 0.08));
  g.box(5, 10, 5, 2, 2, 2, shade(color, 0.85));
  g.box(4, 9, 4, 4, 1, 4, 0x8a5a2a);
  g.paint((x, y) => (y < 1 ? -1 : undefined));
  return voxMesh(g, { pivot: [6, 1, 6], scale: S16 });
}

/** A rolled straw bed / nest. */
export function makeNest(seed = 3) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(30, 7, 22);
  g.ellipsoid(15, 1, 11, 14, 4, 10, (x, y, z, dx, dy, dz) => {
    const rim = dx * dx + dz * dz > 0.55;
    if (!rim && y > 2) return -1;
    const c = rng.pick([0xe0c060, 0xd8b050, 0xc89a40, 0xe8d080]);
    return jitf(c, x, y, z, seed, 0.06);
  });
  // a little patchwork blanket
  g.box(9, 2, 6, 12, 1, 10, (x, y, z) => (((x >> 2) + (z >> 2)) % 2 ? 0xb84a3a : 0xe8d2a2));
  g.paint((x, y) => (y < 1 ? -1 : undefined));
  return voxMesh(g, { pivot: [15, 1, 11], scale: S16 });
}

export { group, S16 };
