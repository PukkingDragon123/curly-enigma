// Deep Town's bigger set pieces, rebuilt finer for first person (town units, 1/16 and 1/32):
// the giant glowing mushroom trees, the back-lane mound houses (round door, windows, chimney,
// lamp, a fence and flower pots) and the plaza fountain with the mole statue holding up its
// crystal.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, stone, line, ring, M32, G32, M16, G16, group, mulc, mixc, h3, sp3, half } from '../iso/kit.js';
import { fastMesh } from '../iso/mesher.js';
import { hash2 } from '../iso/surface.js';
import { burrowDoor, roundWindow } from '../iso/props2.js';
import { waterMaterial } from '../iso/water.js';
import { makeRng } from '../core/util.js';

const CAPS = [[0x5ad0e0, 0xd8faff, 0x2a7a9a], [0x8a7af0, 0xe8e0ff, 0x4a3aa0], [0x6ae0a0, 0xe0ffe8, 0x2a8a5a]];

// ---------------------------------------------------------------- mushroom trees
/** t: {h, r, hue}. Returns {obj, light: {y, color}} (origin at the foot). */
export function mushroomTree(t) {
  const [c, hi, lo] = CAPS[t.hue % CAPS.length];
  const R = 16;
  const hV = Math.round(t.h * R), rV = t.r * R;
  const rng = makeRng(t.hue * 31 + Math.round(t.x * 7));
  // stem: a slightly bent trunk with ring scars and a root flare
  const stem = new VoxelGrid(36, hV + 4, 36);
  const bend = rng.range(-0.8, 0.8), bend2 = rng.range(-0.8, 0.8);
  for (let y = 0; y < hV; y++) {
    const k = y / hV;
    const r = 3.4 + Math.max(0, 5 - y) * 0.9 + Math.sin(y * 0.3) * 0.25 - k * 0.6;
    const ox = 18 + Math.sin(k * 2.2) * bend * 3, oz = 18 + Math.sin(k * 1.7) * bend2 * 3;
    for (let z = Math.floor(oz - r - 1); z <= Math.ceil(oz + r + 1); z++) for (let x = Math.floor(ox - r - 1); x <= Math.ceil(ox + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - ox, z + 0.5 - oz);
      if (d > r) continue;
      const a = Math.atan2(z - oz, x - ox);
      const fib = Math.floor((a + Math.PI) / (Math.PI / 6));
      let col = (fib % 2 ? 0xe4dad0 : 0xece4dc);
      if (y % 9 === 0) col = 0xd0c4b8;
      if (h3(x, y, z, 7) < 0.04) col = 0xc8bcb0;
      stem.set(x, y, z, col);
    }
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rng.range(-0.3, 0.3);
    line(stem, [[18 + Math.cos(a) * 3, 3, 18 + Math.sin(a) * 3], [18 + Math.cos(a) * 9, 0.5, 18 + Math.sin(a) * 9], [18 + Math.cos(a) * 14, 0.5, 18 + Math.sin(a) * 14]], (tt) => 2.2 - tt * 1.6, (x, y, z) => (h3(x, y, z, 3) < 0.2 ? 0xc8bcb0 : 0xd8ccc0));
  }
  // cap: a glowing dome with spots, gills underneath, drips at the rim
  const cw = Math.ceil(rV * 2 + 4), cc = cw / 2;
  const cap = new VoxelGrid(cw, 22, cw);
  const gill = new VoxelGrid(cw, 22, cw);
  for (let y = 0; y < 22; y++) for (let z = 0; z < cw; z++) for (let x = 0; x < cw; x++) {
    const dx = (x + 0.5 - cc) / rV, dz = (z + 0.5 - cc) / rV;
    const d = Math.hypot(dx, dz);
    if (d > 1) continue;
    const top = 4 + Math.sqrt(Math.max(0, 1 - d * d)) * 14;
    const bot = 3 + (1 - d) * 5;
    if (y > top || y < bot) continue;
    if (y < bot + 1.2 && d < 0.94) { gill.set(x, y, z, Math.floor(Math.atan2(dz, dx) * 9) % 2 ? lo : mulc(lo, 0.8)); continue; }
    const spot = hash2(Math.floor(x / 4), Math.floor(z / 4), Math.floor(y / 4) + t.hue) < 0.16 && y > top - 2;
    cap.set(x, y, z, spot ? hi : y > top - 1.5 ? mixc(c, hi, 0.25) : c);
  }
  for (let k = 0; k < 40; k++) {
    const a = k * 0.63 + rng.range(0, 0.3), r = rV - 1 - rng.range(0, 1);
    const x = Math.round(cc + Math.cos(a) * r), z = Math.round(cc + Math.sin(a) * r);
    const n = rng.int(1, 4);
    for (let j = 0; j < n; j++) cap.set(x, 3 - j, z, j === n - 1 ? hi : c);
  }
  const grp = new THREE.Group();
  grp.add(M16(stem, [18, 0, 18]));
  const cm = G16(cap, [cc, 0, cc]);
  cm.position.y = (hV - 6) / R;
  const gm = M16(gill, [cc, 0, cc]);
  gm.position.y = cm.position.y;
  grp.add(cm, gm);
  // little glowing mushrooms at the foot (1/32)
  const small = new VoxelGrid(64, 14, 64);
  for (let k = 0; k < 7; k++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(12, 26);
    const x = Math.round(32 + Math.cos(a) * d), z = Math.round(32 + Math.sin(a) * d), h = rng.int(3, 8);
    small.box(x, 0, z, 2, h, 2, 0xe8dcd0);
    small.ellipsoid(x + 1, h, z + 1, 3 + h * 0.2, 2.2, 3 + h * 0.2, (xx, y) => (y < h ? -1 : (xx + z) % 4 === 0 ? hi : c));
  }
  grp.add(G32(small, [32, 0, 32]));
  return { obj: grp, light: { y: t.h - 0.3, color: c } };
}

// ---------------------------------------------------------------- mound houses
/**
 * A cosy mound house: an earth dome with moss and grass whose front is cut into a dry-stone face
 * with a big round door (+z), two round windows, a stone chimney out the back of the roof, a lamp
 * by the door, a little picket fence and flower pots. Returns {obj, chimney, windows:[], lamp,
 * door, r} (local points, TU).
 */
export function moundHouse(seed) {
  const rng = makeRng(seed);
  const R = 32;
  // the earth dome at 1/16 (clods and moss in patches so faces merge), the stone face at 1/32
  const cx = 84, cz = 60, rx = 76, ry = 68, rz = 52; // in 1/32 units
  const zc = Math.round(cz + rz * 0.5); // the front face
  const H16 = 40, W16 = 86, D16 = 60;
  const d16 = new VoxelGrid(W16, H16, D16);
  for (let y = 0; y < H16; y++) for (let z = 0; z < D16; z++) for (let x = 0; x < W16; x++) {
    const X = x * 2 + 1, Y = y * 2 + 1, Z = z * 2 + 1;
    if (Z > zc - 4) continue;
    const dx = (X - cx) / rx, dy = Y / ry, dz = (Z - cz) / rz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > 1 || d < 0.78) continue;
    const up = dy > 0.5 || (dy > 0.36 && hash2(x >> 1, z >> 1, seed) < 0.6);
    let col;
    if (up) col = hash2(x >> 1, z >> 1, seed + 1) < 0.25 ? C.mossL : hash2(x >> 2, y >> 1, seed + 2) < 0.2 ? C.mossD : C.moss;
    else col = mulc(0x6a4a34, 0.88 + Math.floor(hash2(Math.floor(x / 3), Math.floor(y / 2), Math.floor(z / 3) + seed) * 3) * 0.07);
    d16.set(x, y, z, col);
  }
  // grass tufts and tiny flowers on top
  for (let k = 0; k < 60; k++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng()) * 0.85;
    const x = Math.round((cx + Math.cos(a) * r * rx) / 2), z = Math.round((cz + Math.sin(a) * r * rz) / 2);
    if (z * 2 >= zc - 6) continue;
    let top = -1;
    for (let y = H16 - 1; y >= 0; y--) if (d16.get(x, y, z) >= 0) { top = y; break; }
    if (top < 10) continue;
    const n = rng.int(1, 3);
    for (let j = 1; j <= n; j++) d16.set(x, top + j, z, j === n && rng.chance(0.2) ? [0xf0a0c0, 0xfff070, 0xffffff][rng.int(0, 2)] : j % 2 ? 0x6aa84a : 0x5a9a3a);
  }
  // chimney out the back of the roof
  const chx = 55, chz = 22;
  for (let y = 22; y < H16; y++) for (let z = chz - 3; z < chz + 3; z++) for (let x = chx - 3; x < chx + 3; x++) {
    const edge = x === chx - 3 || x === chx + 2 || z === chz - 3 || z === chz + 2;
    if (y > H16 - 3 && !edge) continue;
    d16.set(x, y, z, (Math.floor(y / 2) + Math.floor((x + z) / 3)) % 2 ? 0x8a7e74 : 0x7a7068);
  }
  // the stone face at 1/32, with a mossy brow, a door recess and two window recesses
  const F0 = zc - 6;
  const g = new VoxelGrid(168, 76, 12);
  const st = stone(0x8a7e72, { seed: seed + 5, block: 6, mortar: 0x4a4038 });
  for (let y = 0; y < 76; y++) for (let z = 0; z < 12; z++) for (let x = 0; x < 168; x++) {
    const Z = F0 + z;
    if (Z > zc) continue;
    const dx = (x + 0.5 - cx) / rx, dy = y / ry, dz = (Z - cz) / rz;
    if (dx * dx + dy * dy + dz * dz > 1) continue;
    g.set(x, y, z, Z === zc ? st(x, y, Z) : mulc(st(x, y, Z), 0.8));
  }
  for (let x = 0; x < 168; x++) {
    let top = -1;
    for (let y = 75; y >= 0; y--) if (g.get(x, y, 6) >= 0) { top = y; break; }
    if (top < 4) continue;
    for (let y = top - 2; y <= top + 1; y++) for (let z = 4; z <= 9; z++) if (y >= 0 && y < 76) g.set(x, y, z, hash2(x >> 1, z, seed + 9) < 0.3 ? C.mossL : C.moss);
    if (hash2(x >> 1, 0, seed + 10) < 0.3) for (let k = 1; k < 1 + Math.floor(hash2(x >> 1, 1, seed) * 5); k++) g.set(x, top - 2 - k, 9, C.mossD);
  }
  const zl = zc - F0;
  for (let y = 0; y < 54; y++) for (let x = cx - 27; x < cx + 27; x++) { for (let z = zl - 4; z <= zl; z++) g.clear(x, y, z); g.set(x, y, zl - 5, 0x3a2a1c); }
  const wins = [];
  for (const s2 of [-1, 1]) {
    const wx = cx + s2 * 44, wy = 9;
    for (let y = wy; y < wy + 26; y++) for (let x = wx - 13; x < wx + 13; x++) for (let z = zl - 3; z <= zl; z++) g.clear(x, y, z);
    wins.push({ x: wx, y: wy, z: zc - 3 });
  }
  const grp = new THREE.Group();
  // the earth dome is meshed at 1/8 (big and soft: clods, not bricks), the stone face at 1/16
  grp.add(fastMesh(half(d16, 3), { scale: 1 / 8, pivot: [cx / 4, 0, cz / 4], kind: 'toon' }));
  const face = fastMesh(half(g, 3), { scale: 1 / 16, pivot: [cx / 2, 0, (cz - F0) / 2], kind: 'toon' });
  grp.add(face);
  // door + windows (the burrow-door and round-window props, set into the recesses)
  const DS = 1.7;
  const dr = burrowDoor(seed % 6 + 2);
  dr.obj.position.set(0, 0, (zc - 5 - cz) / R);
  dr.obj.scale.setScalar(DS);
  grp.add(dr.obj);
  const windows = [];
  for (const w of wins) {
    const rw = roundWindow(seed + w.x);
    rw.obj.position.set((w.x - cx) / R, (w.y - 2) / R, (w.z - cz) / R);
    grp.add(rw.obj);
    windows.push({ x: (w.x - cx) / R, y: (w.y + 13) / R, z: (w.z - cz) / R + 0.12 });
  }
  // a little picket fence either side of the path and two flower pots
  const f = new VoxelGrid(168, 16, 30);
  for (const s2 of [-1, 1]) {
    for (let x = s2 < 0 ? 8 : cx + 24; x < (s2 < 0 ? cx - 24 : 160); x++) {
      if (x % 5 === 0) for (let y = 0; y < 14; y++) f.set(x, y, 20, y === 13 ? C.woodL : C.wood);
      f.set(x, 10, 20, C.woodD); f.set(x, 4, 20, C.woodD);
    }
    const px = cx + s2 * 28;
    ring(f, px, 26, 0, 4, 0, 7, (x, y) => (y === 6 ? 0xc8704a : 0xb8603a));
    for (let k = 0; k < 6; k++) f.set(Math.round(px + Math.cos(k) * 2.5), 7 + (k % 2), Math.round(26 + Math.sin(k) * 2.5), k % 2 ? 0xf0a0c0 : 0x5a9a3a);
  }
  const fm = M32(f, [cx, 0, 0]);
  fm.position.z = (zc - cz) / R - 0.3;
  grp.add(fm);
  const L = dr.lights[0];
  return {
    obj: grp,
    chimney: { x: (chx * 2 - cx) / R, y: H16 / 16 + 0.05, z: (chz * 2 - cz) / R },
    windows,
    lamp: { x: L.x * DS, y: L.y * DS, z: (zc - 5 - cz) / R + L.z * DS },
    door: { x: 0, y: 0.8, z: (zc - cz) / R + 0.1 },
    foot: { z: ((cz - rz + zc) / 2 - cz) / R, w: (rx * 2) / R * 0.92, d: (zc - (cz - rz)) / R },
    r: 2.2,
  };
}

// ---------------------------------------------------------------- the plaza fountain
/** F: {r}. Returns {obj, crystal:{y}, bowlY, bowlR, basinY}; origin at the fountain's centre. */
export function fountain(F) {
  const grp = new THREE.Group();
  // basin at 1/16: a ring of dressed stone blocks with a bevelled coping and moss in the joints
  const R16 = 16;
  const R = Math.round(F.r * R16), S = R * 2 + 4, c0 = S / 2;
  const g = new VoxelGrid(S, 12, S);
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    const d = Math.hypot(x + 0.5 - c0, z + 0.5 - c0);
    if (d > R) continue;
    const a = Math.atan2(z + 0.5 - c0, x + 0.5 - c0);
    const blk = Math.floor((a + Math.PI) / (Math.PI / 12));
    const seam = Math.abs(((a + Math.PI) / (Math.PI / 12)) % 1) < 0.06;
    if (d > R - 4) {
      for (let y = 0; y < 10; y++) {
        let col = mulc(0x8a7e74, 0.9 + hash2(blk, y >> 2, 3) * 0.14);
        if (y === 9) col = d > R - 1 ? 0x9a8e82 : 0xaca092;
        if (y === 4) col = 0x6e645c;
        if (seam) col = y === 9 ? 0x7a6e64 : 0x5a5048;
        if (seam && y < 3 && hash2(x, z, 4) < 0.6) col = C.moss;
        g.set(x, y, z, col);
      }
    } else g.set(x, 0, z, (x + z) % 7 === 0 ? 0x24343e : 0x1e2a34);
  }
  grp.add(M16(g, [c0, 0, c0]));
  const basinY = 7.5 / R16;
  const water = new THREE.Mesh(new THREE.PlaneGeometry((R - 4) * 2 / R16, (R - 4) * 2 / R16).rotateX(-Math.PI / 2), waterMaterial({ res: [(R - 4) * 4, (R - 4) * 4], round: true, deep: 0x1a4a6a, mid: 0x2a6a98, light: 0x5aa8d8 }));
  water.position.y = basinY;
  grp.add(water);
  // pedestal, upper bowl and the statue at 1/32
  const V = 32;
  const p = new VoxelGrid(72, 150, 72);
  const st = (x, y, z) => mulc(y % 8 === 0 ? 0x9a8e82 : 0x8a7e74, 0.95 + hash2((x + z) >> 2, y >> 2, 4) * 0.1);
  ring(p, 36, 36, 0, 9, 0, 26, st);
  ring(p, 36, 36, 0, 11, 0, 4, st);
  // bowl: a shallow dish with a lip, fluted underside
  for (let y = 26; y < 34; y++) {
    const r = 9 + (y - 26) * 2.4;
    ring(p, 36, 36, y < 31 ? 0 : r - 3, r, y, y + 1, (x, yy, z, a) => (Math.floor((a + Math.PI) / (Math.PI / 10)) % 2 ? 0x968a7e : 0x8a7e74));
  }
  ring(p, 36, 36, 26, 29, 34, 35, 0xa89c90);
  ring(p, 36, 36, 0, 26, 30, 31, 0x24343e);
  // the statue: a mole on a little plinth, arms raised, holding up the crystal
  const marble = (x, y, z) => mulc(0xc8beb4, 0.94 + h3(x >> 1, y >> 1, z >> 1, 6) * 0.1);
  ring(p, 36, 36, 0, 6, 31, 40, st);
  p.ellipsoid(36, 54, 36, 9, 12, 8, marble); // body
  p.ellipsoid(36, 72, 37, 8.5, 8, 8, marble); // head
  p.ellipsoid(36, 70, 45, 3, 2.5, 3, 0xd8d0c8); // snout
  p.box(35, 71, 47, 2, 2, 1, 0xe8b0b0); // nose
  p.box(31, 74, 43, 2, 2, 1, 0x5a524a); p.box(39, 74, 43, 2, 2, 1, 0x5a524a); // eyes
  p.ellipsoid(36, 54, 43, 6, 8, 2, 0xd8d0c8); // belly
  for (const s of [-1, 1]) {
    line(p, [[36 + s * 7, 60, 36], [36 + s * 11, 72, 37], [36 + s * 7, 86, 37]], 2.4, marble); // arms up
    p.ellipsoid(36 + s * 6, 88, 37, 3, 2.4, 3, 0xd8d0c8); // paws
    p.ellipsoid(36 + s * 5, 42, 39, 3.5, 2.5, 5, marble); // feet
  }
  grp.add(M32(p, [36, 0, 36]));
  // the crystal it holds up (glowing)
  const cr = new VoxelGrid(24, 40, 24);
  for (let y = 0; y < 36; y++) {
    const rr = y < 6 ? 2 + y * 0.9 : 7 * (1 - Math.pow((y - 6) / 30, 1.3));
    for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) {
      const dx = Math.abs(x + 0.5 - 12), dz = Math.abs(z + 0.5 - 12);
      if (dx * 0.87 + dz * 0.5 > rr || dz > rr) continue;
      cr.set(x, y, z, x < 10 ? 0xd8f6ff : x > 14 ? 0x3a8ad0 : y % 6 === 0 ? 0xbfeaff : 0x7fd0ff);
    }
  }
  const crm = G32(cr, [12, 0, 12], { outline: true });
  crm.position.y = 89 / V;
  grp.add(crm);
  const bowl = new THREE.Mesh(new THREE.PlaneGeometry(50 / V, 50 / V).rotateX(-Math.PI / 2), waterMaterial({ res: [50, 50], round: true }));
  bowl.position.y = 31.2 / V;
  grp.add(bowl);
  return { obj: grp, crystal: { y: 110 / V }, bowlY: 34 / V, bowlR: 26 / V, basinY };
}

export { CAPS, beam, wood, stone, sp3 };
