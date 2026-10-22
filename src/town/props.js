// Things the townsfolk carry, at 1/32 detail: a straw broom bound with twine, a lute with a carved
// rosette and a bent pegbox, a fishing rod with a cork grip, a brass reel, line and a red bobber,
// and a plank crate of ore (coal, copper, iron and a gem). Town units; each pivots at its grip.
import * as THREE from 'three';
import { VoxelGrid } from '../gfx/Voxel.js';
import { vmesh } from '../iso/vox.js';

const V32 = 1 / 32;
const h = (x, y, z, s = 0) => {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440670441) + Math.imul(s, 977)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const mul = (c, f) => (Math.min(255, ((c >> 16) & 255) * f) << 16) | (Math.min(255, ((c >> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f);
const mesh = (g, pivot) => vmesh(g, { scale: V32, pivot });

/** A broom: the grip at the origin, the head below (the rig holds it in its paw). */
export function broom() {
  const L = 34;
  const g = new VoxelGrid(11, L + 12, 6);
  // the handle: a turned pole with grain and a worn grip
  for (let y = 12; y < L + 12; y++) for (const [x, z] of [[5, 2], [5, 3], [6, 2], [6, 3]]) {
    const grain = (y + x * 3) % 7 === 0;
    g.set(x, y, z, y > L + 4 ? 0x6a4a2e : grain ? 0x7a5432 : x === 5 ? 0x9a6a3e : 0x8a5e36);
  }
  // the binding and the straw head, splaying out toward the tips
  for (let y = 0; y < 13; y++) {
    const half = 2 + Math.floor((12 - y) * 0.32);
    for (let x = 5 - half; x <= 6 + half; x++) for (let z = 1; z < 5; z++) {
      if (y < 2 && h(x, y, z, 3) < 0.35) continue; // ragged tips
      const band = y === 9 || y === 10;
      g.set(x, y, z, band ? (x % 2 ? 0xb8463a : 0x9a3a32) : mul(h(x, y >> 2, z, 7) < 0.3 ? 0xc8a050 : 0xd8b860, 0.92 + h(x, 0, z, 1) * 0.15));
    }
  }
  return mesh(g, [5.5, L + 6, 2.5]);
}

/** A lute, held at the neck; the body hangs low against the belly. */
export function lute() {
  const g = new VoxelGrid(17, 34, 6);
  // the pear-shaped body: staves of two woods, the face of pale spruce with a rosette
  for (let y = 0; y < 18; y++) for (let x = 0; x < 17; x++) for (let z = 0; z < 6; z++) {
    const cy = 8, r = y < cy ? 8.2 : 8.2 * (1 - ((y - cy) / 10.5) ** 1.6);
    const dx = x - 8, dy = y - cy;
    if (dx * dx / (r * r) + (dy < 0 ? dy * dy / 64 : 0) > 1) continue;
    const back = z < 3 && (dx * dx + dy * dy * 0.6) / (r * r) + ((2.6 - z) / 3) ** 2 > 1.05;
    if (back) continue;
    let c = z >= 4 ? 0xd8a860 : x % 3 === 0 ? 0x7a3e1e : 0x9a5228;
    if (z >= 4) {
      const rr = Math.hypot(dx, y - 10);
      if (rr < 2.2) c = 0x2a1810; // the sound hole
      else if (rr < 3.2) c = (Math.atan2(dx, y - 10) * 3 | 0) % 2 ? 0x8a5a2a : 0xe8c890; // the rosette
      if (y === 3 && Math.abs(dx) < 4) c = 0x4a2a16; // the bridge
    }
    g.set(x, y, z, c);
  }
  // the neck with frets, a bent pegbox with pegs, four strings
  for (let y = 17; y < 30; y++) for (let x = 6; x <= 10; x++) for (let z = 3; z < 5; z++) g.set(x, y, z, (y % 3 === 0 && z === 4) ? 0xd8d0b8 : 0x5a3a20);
  for (let y = 29; y < 34; y++) for (let x = 6; x <= 10; x++) g.set(x, y, 2 - Math.floor((y - 29) / 2), 0x4a2a16);
  for (const [px, py] of [[5, 31], [11, 31], [5, 33], [11, 33]]) g.set(px, py, 2, 0xe8d8b0);
  for (const sx of [7, 8, 9, 10]) for (let y = 3; y < 30; y++) if (Math.hypot(sx - 8, y - 10) >= 2.2 || y > 13) g.set(sx, y, 5, 0xe8e4d8);
  const m = mesh(g, [8.5, 24, 3]);
  m.rotation.set(0.25, 0, 0.95);
  return m;
}

/** A fishing rod: cork grip at the paw, a brass reel, the rod, the line and a red-and-white bobber. */
export function fishingRod() {
  const grp = new THREE.Group();
  const L = 64;
  const g = new VoxelGrid(7, L, 5);
  for (let y = 0; y < L; y++) {
    const thick = y < 12 ? 2 : y < 40 ? 2 : 1;
    for (let x = 3; x < 3 + thick; x++) for (let z = 2; z < 2 + thick; z++) {
      const c = y < 10 ? (h(x, y, z, 5) < 0.4 ? 0xb8905a : 0xc8a06a) : y % 9 === 0 ? 0xc8a048 : 0x6a4a2e;
      g.set(x, y, z, c);
    }
  }
  // the reel
  for (let y = 10; y < 15; y++) for (let x = 0; x < 3; x++) for (let z = 1; z < 4; z++) if (Math.hypot(y - 12.5, z - 2) < 2.4) g.set(x, y, z, x === 0 ? 0x8a6a28 : 0xd8b048);
  const rod = mesh(g, [3.5, 4, 2.5]);
  rod.rotation.x = 1.15;
  grp.add(rod);
  const ln = new VoxelGrid(3, 40, 3);
  for (let y = 4; y < 40; y++) ln.set(1, y, 1, 0xe8e8e0);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) if (Math.hypot(x - 1, y - 2, z - 1) < 1.9) ln.set(x, y, z, y > 2 ? 0xf4f0e8 : 0xd8402a);
  const lm = mesh(ln, [1.5, 40, 1.5]);
  lm.position.set(0, Math.cos(1.15) * (L - 4) * V32, Math.sin(1.15) * (L - 4) * V32);
  grp.add(lm);
  return grp;
}

/** A crate of ore for the miners to haul: planks, corner posts, nails, lumps heaped over the top. */
export function oreCrate() {
  const W = 20, H = 15, D = 16;
  const g = new VoxelGrid(W, H, D);
  for (let x = 0; x < W; x++) for (let y = 0; y < 10; y++) for (let z = 0; z < D; z++) {
    const wall = x === 0 || x === W - 1 || z === 0 || z === D - 1 || y === 0;
    if (!wall) continue;
    const post = (x < 2 || x > W - 3) && (z < 2 || z > D - 3);
    const seam = y % 3 === 2;
    let c = post ? 0x5a3a22 : seam ? 0x6a4428 : (h(x >> 2, y, z >> 2, 9) < 0.5 ? 0x9a6a3a : 0x8a5a32);
    if (!post && !seam && (x === 2 || x === W - 3 || z === 2 || z === D - 3) && y % 3 === 1) c = 0x3a3a40; // nails
    g.set(x, y, z, c);
  }
  const ores = [0x2a2628, 0x2a2628, 0x2a2628, 0xd9773f, 0x9a6450, 0xbfc3c4, 0x2a2628];
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < D - 1; z++) {
    const top = 9 + Math.round(2.6 * Math.sin((x / W) * Math.PI) * Math.sin((z / D) * Math.PI) + h(x >> 1, 0, z >> 1, 2) * 2);
    for (let y = 8; y <= top; y++) {
      const k = Math.floor(h(x >> 1, y >> 1, z >> 1, 4) * ores.length);
      g.set(x, y, z, mul(ores[k], 0.85 + h(x, y, z, 6) * 0.3));
    }
  }
  g.set(10, 13, 8, 0x8af0e0); g.set(11, 13, 8, 0x5ad0c8); g.set(10, 12, 9, 0x5ad0c8); // a gem catching the light
  return mesh(g, [W / 2, 6, D / 2]);
}
