// Home furniture rebuilt at 1/32 voxels (32 per tile): beds with patchwork quilts, the brick
// forge with its anvil and bellows, the iron stove, Nugget's coop, seats, tables, lamps,
// woven rugs, plants, shelves and more. Same contract as furniture.js: centered on the
// footprint, front facing +z, returns { obj, lights, update, seats, lie, nap, ... }.
import * as THREE from 'three';
import { FURNITURE } from '../data/furniture.js';
import { VoxelGrid, C, wood, beam, iron, stone, cloth, straw, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32 } from './kit.js';
import { hash2 } from './surface.js';

const T = 32;
/** Grid for a footprint, h voxels tall. */
function fg(id, h) {
  const [w, d] = FURNITURE[id]?.size || [1, 1];
  return new VoxelGrid(w * T, h, d * T);
}
const M = (g, pivot) => M32(g, pivot ?? [g.w / 2, 0, g.d / 2]);
const GL = (g, pivot, outline = false) => G32(g, pivot ?? [g.w / 2, 0, g.d / 2], { outline });
/** Place a mesh by voxel coords of a footprint grid (gw × gd voxels). */
function at(mesh, gw, gd, x, y, z) { mesh.position.set((x - gw / 2) * S32, y * S32, (z - gd / 2) * S32); return mesh; }
function legs(g, x0, z0, x1, z1, h, c, t = 3) {
  for (const [x, z] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) g.box(x, 0, z, t, h, t, c);
}
const QUILT = [0xd96a6a, 0xe0b040, 0x5a8ad0, 0x6ab84a, 0xc87ab0, 0xe8e0d0, 0xd9884a, 0x4aa8a8];
/** Patchwork quilt fill: squares of patterned fabric with stitched seams. */
function quilt(seed, cell = 8) {
  return (x, y, z) => {
    const px = Math.floor(x / cell), pz = Math.floor(z / cell);
    const lx = x % cell, lz = z % cell;
    if (lx === 0 || lz === 0) return ((x + z) % 2) ? 0xf6f0e0 : 0xd8d0c0; // stitched seam
    const c = QUILT[Math.floor(hash2(px, pz, seed) * QUILT.length)];
    const pat = Math.floor(hash2(pz, px, seed + 1) * 4);
    if (pat === 1 && (lx + lz) % 4 === 0) return mulc(c, 0.78); // diagonal stripes
    if (pat === 2 && lx % 3 === 1 && lz % 3 === 1) return 0xf6f0e0; // polka dots
    if (pat === 3 && (lx === cell >> 1 || lz === cell >> 1)) return mulc(c, 1.15); // cross
    return c;
  };
}

// ---------------------------------------------------------------- beds
function bedStraw(id) {
  const g = fg(id, 26);
  const fr = wood(0x7a5030, { axis: 'z', across: 'x', pw: 99, seed: 2 });
  legs(g, 2, 2, 30, 62, 6, beam(C.woodD, 'y', 3), 4);
  g.box(2, 5, 3, 28, 3, 58, fr); // frame rails
  // headboard: three planks with pegs and a rope lashing
  g.box(1, 4, 0, 30, 16, 4, wood(0x6a4428, { axis: 'y', across: 'x', pw: 10, seed: 4 }));
  for (const x of [5, 15, 25]) g.box(x, 20, 0, 3, 2, 4, 0x8a5a32);
  for (let x = 2; x < 30; x++) if (x % 2) g.set(x, 13, 4, C.rope);
  // straw mattress, lumpy, with stray straws
  g.box(3, 8, 3, 26, 5, 57, straw(3));
  for (let z = 3; z < 60; z++) for (let x = 3; x < 29; x++) if (hash2(x >> 1, z >> 1, 9) < 0.3) g.set(x, 13, z, hash2(x, z, 2) < 0.5 ? 0xe8c870 : C.straw);
  for (let i = 0; i < 16; i++) { const z = 6 + i * 3.4, s = i % 2 ? 1 : -1; line(g, [[s > 0 ? 29 : 2, 10, z], [s > 0 ? 31 : 0, 9 + (i % 3), z + 1]], 0.5, 0xe8c870); }
  // burlap pillow with a stitched edge
  g.ellipsoid(16, 14, 9, 10, 2.6, 5, cloth(0xc8b08a, { seed: 6 }));
  for (let x = 7; x < 26; x += 2) g.set(x, 14, 14, 0x9a8060);
  // patchwork wool blanket folded down, hanging over the sides
  const q = quilt(11, 8);
  g.box(2, 13, 24, 28, 2, 36, q);
  g.box(2, 7, 24, 1, 6, 36, q); g.box(29, 7, 24, 1, 6, 36, q); g.box(2, 7, 59, 28, 6, 1, q);
  g.box(2, 15, 24, 28, 1, 4, (x, y, z) => mulc(q(x, y, z), 1.08)); // folded edge
  return { obj: M(g), lie: { y: 0.5, head: -0.6, foot: 0.78 } };
}

function bedCozy(id) {
  const g = fg(id, 34);
  const wl = wood(0xb07a4a, { axis: 'z', across: 'x', pw: 99, seed: 2 });
  legs(g, 2, 2, 30, 62, 8, beam(0x6a4428, 'y', 3), 4);
  g.box(2, 7, 3, 28, 3, 58, wl);
  // carved headboard with a heart, rounded top and posts with knobs
  g.box(0, 4, 0, 32, 24, 4, wood(0x8a5a32, { axis: 'y', across: 'x', pw: 8, seed: 4 }));
  g.ellipsoid(16, 27, 2, 14, 5, 2, wood(0x8a5a32, { axis: 'x', across: 'y', pw: 99, seed: 5 }));
  for (const x of [0, 28]) { g.box(x, 4, 0, 4, 28, 4, 0x6a4428); g.ellipsoid(x + 2, 33, 2, 2.6, 2, 2.6, 0xc8a050); }
  for (const [x, y] of [[13, 19], [14, 18], [15, 18], [16, 18], [17, 18], [18, 19], [12, 20], [19, 20], [12, 21], [19, 21], [13, 22], [18, 22], [14, 23], [17, 23], [15, 24], [16, 24], [13, 20], [14, 21], [15, 22], [16, 23], [17, 22], [18, 21], [16, 21], [15, 21], [14, 20], [17, 20], [16, 20], [15, 20], [16, 19], [15, 19], [14, 19], [17, 19], [16, 22], [15, 23]]) g.set(x, y, 4, 0xd94a4a);
  g.box(0, 6, 60, 32, 12, 4, wood(0x8a5a32, { axis: 'y', across: 'x', pw: 8, seed: 6 })); // footboard
  // sheet + plump pillows
  g.box(3, 10, 4, 26, 4, 56, cloth(0xf2eee2, { seed: 3 }));
  g.ellipsoid(9.5, 15, 10, 6, 3, 5, cloth(0xfaf6ee, { seed: 4 })); g.ellipsoid(22.5, 15, 10, 6, 3, 5, cloth(0xfaf6ee, { seed: 5 }));
  // patchwork quilt with a scalloped hem
  const q = quilt(23, 8);
  g.box(2, 14, 20, 28, 2, 40, q);
  g.box(2, 9, 20, 1, 5, 40, q); g.box(29, 9, 20, 1, 5, 40, q);
  for (let z = 20; z < 60; z++) if (z % 4 < 2) { g.set(2, 8, z, q(2, 8, z)); g.set(29, 8, z, q(29, 8, z)); }
  return { obj: M(g), lie: { y: 0.6, head: -0.6, foot: 0.76 } };
}

// ---------------------------------------------------------------- forge
function forge(id) {
  const grp = new THREE.Group();
  const g = fg(id, 100);
  const brick = (x, y, z) => {
    const row = y >> 2, off = row % 2 ? 4 : 0;
    if (y % 4 === 3 || (x + z + off) % 8 === 0) return 0x4a3a34;
    return mulc(row % 3 ? 0x8a4a3a : 0x7a4234, 0.9 + Math.floor(hash2((x + z + off) >> 3, row, 3) * 4) * 0.05);
  };
  // hearth block with an arched fire mouth
  g.box(2, 0, 0, 44, 28, 40, brick);
  g.box(0, 26, 0, 48, 4, 42, (x, y, z) => mulc(0x6a625c, sp3(x, y, z, 2, 0.1, 0.12))); // stone hearth lip
  for (let y = 8; y < 26; y++) for (let x = 10; x < 38; x++) {
    const dx = x + 0.5 - 24, a = y < 18 ? Math.abs(dx) < 14 : Math.hypot(dx, (y - 18) * 1.6) < 14;
    if (a) for (let z = 22; z < 41; z++) g.clear(x, y, z);
  }
  g.box(10, 7, 22, 28, 1, 19, 0x1a1214);
  g.box(10, 8, 20, 28, 18, 2, 0x140e10);
  // hood + chimney with iron bands
  for (let y = 30; y < 54; y++) {
    const inset = Math.floor((y - 30) / 2.4);
    g.box(4 + inset, y, 2, 40 - inset * 2, 1, 36 - inset * 2, (x, yy, z) => ((yy - 30) % 6 === 0 ? 0x2e2e36 : mulc(0x4a4a54, sp3(x, yy, z, 4, 0.05, 0.1))));
  }
  g.box(14, 54, 8, 20, 46, 20, brick);
  for (const y of [62, 84]) g.box(13, y, 7, 22, 2, 22, C.iron);
  g.box(12, 96, 6, 24, 4, 24, (x, y, z) => mulc(0x5a524c, sp3(x, y, z, 5, 0.08, 0.1)));
  // tree stump with rings + the anvil
  ring(g, 52, 44, 0, 8.5, 0, 14, (x, y, z) => (y === 13 ? (Math.round(Math.hypot(x - 51.5, z - 43.5)) % 2 ? 0xc8a070 : 0xa8804a) : mulc(0x6a4a2a, 0.92 + (Math.floor(Math.atan2(z - 43.5, x - 51.5) * 3) % 2) * 0.08)));
  g.box(46, 14, 40, 12, 4, 10, C.ironD);
  g.box(48, 18, 42, 8, 4, 6, C.iron);
  g.box(42, 22, 38, 20, 4, 14, (x, y) => (y === 25 ? C.ironL : C.iron));
  line(g, [[42, 23.5, 45], [36, 23, 45]], 1.6, C.iron); // horn
  g.box(56, 24, 44, 1, 2, 1, 0x1a1a20); // hardy hole
  // hammer on the anvil, tongs leaning on the hearth
  line(g, [[47, 27, 47], [59, 27, 43]], 0.8, 0x8a5a32); g.box(57, 26, 41, 4, 4, 5, 0x5a5a64);
  line(g, [[38, 0, 24], [43, 22, 24]], 0.6, C.ironL); line(g, [[40, 0, 24], [43, 22, 25]], 0.6, C.ironL);
  // bellows on the left with a leather bag and nozzle
  g.box(0, 12, 44, 14, 2, 18, wood(C.woodD, { axis: 'z', across: 'x', pw: 99, seed: 6 }));
  for (let y = 14; y < 18; y++) g.box(1 + (y - 14), y, 45, 12 - (y - 14) * 2, 1, 16, (x, yy, z) => ((z + yy) % 3 ? 0x7a4a2a : 0x6a3e22));
  g.box(0, 18, 44, 14, 2, 18, wood(C.woodD, { axis: 'z', across: 'x', pw: 99, seed: 7 }));
  g.box(5, 13, 36, 4, 3, 9, C.ironL);
  line(g, [[7, 20, 60], [7, 26, 62]], 0.7, C.woodD);
  legs(g, 1, 46, 13, 61, 12, C.woodD, 2);
  // quench barrel
  ring(g, 56, 13, 6.5, 8, 0, 18, (x, y, z, a) => (y === 3 || y === 14 ? C.iron : mulc(C.wood, 0.88 + (Math.floor((a + Math.PI) / 0.45) % 3) * 0.06)));
  ring(g, 56, 13, 0, 6.5, 0, 16, (x, y, z) => (y === 15 ? (h3(x, y, z, 2) < 0.15 ? 0x9fd6ff : 0x2a5a8a) : -1));
  grp.add(M(g));
  // glowing coals + flames
  const coals = new VoxelGrid(26, 4, 16);
  coals.box(0, 0, 0, 26, 3, 16, (x, y, z) => (hash2(x >> 1, z, y) < 0.35 ? 0xffd27a : hash2(z, x >> 1, y + 5) < 0.5 ? 0xff7a2a : 0xd9401a));
  grp.add(at(GL(coals, [0, 0, 0]), 64, 64, 11, 8, 23));
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const fl = new VoxelGrid(6, 12, 4);
    fl.ellipsoid(3, 2, 2, 3, 3, 2, 0xff6a1a); fl.ellipsoid(3, 6, 2, 2.2, 3, 1.6, 0xffa030); fl.box(2, 8, 1, 2, 3, 2, 0xffd060); fl.set(3, 11, 2, 0xfff0a0);
    const m = at(GL(fl, [3, 0, 2]), 64, 64, 15 + i * 6, 10, 30 + (i % 2) * 3);
    grp.add(m);
    flames.push(m);
  }
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.6, z: 0.2, color: 0xff7a2a, intensity: 9, distance: 6.5, flicker: 0.35, pool: 2.3, poolZ: 0.6, poolOpacity: 0.42, halo: 1.1, hz: 0.25, hy: 0.55, haloOpacity: 0.5 }],
    embers: { x: 0, y: 0.7, z: 0.25 },
    update(dt, t) {
      flames.forEach((m, i) => { m.scale.y = 0.6 + 0.5 * Math.abs(Math.sin(t * (5 + i * 1.7) + i * 2)); m.scale.x = 0.85 + 0.2 * Math.sin(t * 7 + i); });
    },
  };
}

// ---------------------------------------------------------------- stove
function stove(id) {
  const grp = new THREE.Group();
  const g = fg(id, 98);
  const ir = iron(0x2e2e36, 2);
  legs(g, 4, 6, 28, 28, 6, ir, 3);
  for (const [x, z] of [[4, 6], [25, 6], [4, 25], [25, 25]]) g.box(x - 1, 0, z - 1, 5, 2, 5, ir); // claw feet
  g.box(4, 6, 6, 24, 22, 22, (x, y, z) => (y % 7 === 0 ? 0x3a3a44 : ir(x, y, z)));
  g.box(2, 28, 4, 28, 3, 26, (x, y) => (y === 30 ? 0x4a4a54 : 0x3a3a44));
  // door with a grate, hinges, brass handle and rivets
  g.box(8, 9, 28, 16, 15, 2, 0x3e3e48);
  for (let x = 10; x < 22; x++) for (let y = 12; y < 20; y++) { g.clear(x, y, 28); g.clear(x, y, 29); }
  g.box(10, 12, 27, 12, 8, 1, 0x140e10);
  for (const x of [12, 15, 18, 21]) g.box(x, 12, 29, 1, 8, 1, 0x4a4a54);
  g.box(22, 15, 30, 3, 2, 1, C.brass);
  for (const [x, y] of [[9, 10], [23, 10], [9, 22], [23, 22]]) g.set(x, y, 30, 0x6a6a74);
  g.box(6, 24, 28, 20, 2, 1, 0x4a4a54);
  // a copper pot with a lid on top and a kettle
  ring(g, 12, 16, 0, 6.5, 31, 41, (x, y, z) => (y === 40 ? 0xe09a6a : mulc(0xc87a4a, sp3(x, y, z, 3, 0.08, 0.1))));
  ring(g, 12, 16, 0, 6, 41, 42, 0xd98a5a); g.box(11, 42, 15, 2, 2, 2, 0x3a2a20);
  g.box(4, 38, 15, 2, 2, 2, 0xc87a4a); g.box(18, 38, 15, 2, 2, 2, 0xc87a4a);
  // stovepipe with elbow and damper
  g.box(21, 31, 8, 6, 67, 6, (x, y, z) => (y % 16 === 0 ? 0x4a4a54 : mulc(0x2a2a32, sp3(x, y, z, 6, 0.06, 0.12))));
  g.box(19, 60, 6, 10, 2, 10, 0x3a3a44);
  line(g, [[18, 64, 11], [21, 64, 11]], 0.8, C.brass);
  // spice shelf on the side with tiny jars
  g.box(0, 44, 10, 3, 2, 14, C.woodD);
  for (const [z, c] of [[11, 0xd94a3a], [15, 0xe0b040], [19, 0x6ab84a]]) g.box(0, 46, z, 3, 4, 3, c);
  grp.add(M(g));
  const fire = new VoxelGrid(12, 8, 2);
  fire.box(0, 0, 0, 12, 8, 1, (x, y) => (y < 2 ? 0xffd27a : hash2(x, y, 2) < 0.5 ? 0xff8a3a : 0xffb040));
  const fm = at(GL(fire, [0, 0, 0]), 32, 32, 10, 12, 27.6);
  grp.add(fm);
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.5, z: 0.45, color: 0xff9a4a, intensity: 5, distance: 5, flicker: 0.4, pool: 1.5, poolZ: 0.7, poolOpacity: 0.38, halo: 0.6, hy: 0.5, hz: 0.5, haloOpacity: 0.45 }],
    steam: { x: -0.12, y: 1.35, z: 0 },
    update(dt, t) { fm.scale.y = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.3); },
  };
}

// ---------------------------------------------------------------- Nugget's coop
function coop(id, ctx) {
  const grp = new THREE.Group();
  const g = fg(id, 52);
  const wf = wood(0x9a6a3a, { axis: 'y', across: 'x', pw: 5, seed: 3 });
  const wz = wood(0x9a6a3a, { axis: 'y', across: 'z', pw: 5, seed: 4 });
  g.box(0, 0, 0, 32, 4, 32, wood(C.woodD, { axis: 'x', across: 'z', pw: 6, seed: 2 })); // floor
  g.box(2, 4, 2, 28, 24, 3, wf); // back
  g.box(2, 4, 2, 3, 24, 28, wz); g.box(27, 4, 2, 3, 24, 28, wz); // sides
  for (const [x, z] of [[1, 1], [27, 1], [1, 27], [27, 27]]) g.box(x, 0, z, 4, 28, 4, beam(C.woodD, 'y', x + z));
  // a little round window in the side
  for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) if (Math.hypot(y - 3.5, z - 3.5) < 3.2) g.clear(29, 14 + y, 12 + z);
  for (let a = 0; a < 16; a++) g.set(30, Math.round(17.5 + Math.sin(a / 16 * 6.28) * 4), Math.round(15.5 + Math.cos(a / 16 * 6.28) * 4), 0xe8dcc0);
  // gable roof with red shingles and a ridge cap
  for (let k = 0; k < 17; k++) {
    const y = 28 + k;
    g.box(k - 1, y, -1, 34 - k * 2, 1, 34, (x, yy, z) => ((z + (x > 15 ? 2 : 0) + k) % 5 === 0 ? 0x8a2a24 : mulc(0xc0443a, 0.92 + (Math.floor((z + k * 3) / 5) % 2) * 0.08)));
    if (k < 16) for (let x = k + 1; x < 31 - k; x++) for (let z = 1; z < 31; z++) g.clear(x, y, z);
  }
  g.box(14, 44, -1, 4, 2, 34, 0x5a3a22);
  for (let k = 0; k < 15; k++) g.box(k + 1, 28 + k, 4, 30 - k * 2, 1, 2, C.wood); // inner rafters seen through the front
  // straw nest
  g.box(5, 4, 5, 22, 4, 22, straw(5));
  for (let i = 0; i < 18; i++) g.set(5 + (i * 7) % 22, 8, 5 + (i * 11) % 22, 0xe8c870);
  // the front: low lip, a ramp and a nameplate
  g.box(5, 4, 27, 22, 4, 3, wood(0xb07a4a, { axis: 'x', across: 'y', pw: 99, seed: 7 }));
  for (let k = 0; k < 8; k++) g.box(10, 4 - Math.floor(k / 2), 30 + k, 12, 1, 1, k % 2 ? C.woodL : C.wood); // ramp with cleats
  g.box(8, 22, 30, 16, 5, 1, 0xe8dcc0);
  const name = (ctx?.state?.data?.chicken?.name || 'NUGGET').toUpperCase().slice(0, 6);
  // tiny painted letters (2 px dashes per letter, a hint of a name)
  for (let i = 0; i < name.length; i++) { g.set(10 + i * 2, 24, 31, 0x8a3a2a); g.set(10 + i * 2, 25, 31, 0x8a3a2a); }
  g.box(15, 27, 31, 2, 2, 1, 0xf2c23a); // a little gold star
  // a feeder dish and a water cup outside
  ring(g, 4, 30, 0, 2.6, 0, 2, 0xb8603a); for (let k = 0; k < 4; k++) g.set(3 + (k % 2), 2, 29 + (k >> 1), 0xe0c070);
  // Nugget's corner: a water cup, loose straw and a few dropped feathers on the boards
  ring(g, 27.5, 29.5, 0, 2.4, 4, 6, 0x8a8a94); ring(g, 27.5, 29.5, 0, 1.6, 5, 6, 0x4aa8e0);
  for (let k = 0; k < 14; k++) {
    const x = 1 + Math.floor(hash2(k, 1, 31) * 30), z = 26 + Math.floor(hash2(k, 2, 31) * 6);
    if (g.get(x, 4, z) < 0) g.set(x, 4, z, k % 3 ? 0xe8c870 : 0xd9b45a);
  }
  for (const [x, z] of [[7, 28], [23, 31], [13, 29]]) { g.set(x, 4, z, 0xfff6ea); g.set(x + 1, 4, z, 0xe8dcc8); }
  grp.add(M(g));
  const eggs = new THREE.Group();
  grp.add(eggs);
  const setEggs = (n) => {
    while (eggs.children.length) { const c = eggs.children.pop(); c.geometry.dispose(); }
    const pos = [[10, 18], [18, 20], [14, 12], [21, 14], [8, 12], [16, 24]];
    for (let i = 0; i < Math.min(6, n); i++) {
      const e = new VoxelGrid(6, 8, 6);
      e.ellipsoid(3, 3.2, 3, 2.6, 3.6, 2.6, (x, y, z) => (y > 4 && x < 3 ? 0xfffbf0 : (x + y) % 5 === 0 ? 0xe8d8b8 : 0xf6ecd8));
      eggs.add(at(M(e, [3, 0, 3]), 32, 32, pos[i][0], 8, pos[i][1]));
    }
  };
  setEggs(ctx.eggs || 0);
  return { obj: grp, nap: { x: 0, z: 0.05, y: 0.24, yaw: 0 }, setEggs };
}

// ---------------------------------------------------------------- seats
function stool(id) {
  const g = fg(id, 18);
  ring(g, 16, 16, 0, 10.5, 0, 16, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 16, z + 0.5 - 16);
    if (y === 15) return Math.round(r) % 2 ? 0xd8b080 : 0xb88a58;
    return r > 9 ? mulc(0x5a3a22, (Math.floor(Math.atan2(z - 16, x - 16) * 4) % 2) ? 0.9 : 1) : 0x7a5030;
  });
  for (const [x, z] of [[5, 15], [25, 18], [14, 4]]) g.box(x, 0, z, 4, 3, 4, 0x4a2e1a); // roots
  g.set(21, 16, 16, 0x6ab84a); g.set(22, 17, 16, 0x7ac85a);
  return { obj: M(g), seats: [{ x: 0, z: 0.05, y: 0.32, yaw: 0 }] };
}

function chair(id) {
  const g = fg(id, 48);
  legs(g, 6, 6, 26, 26, 14, beam(C.woodD, 'y', 2), 3);
  g.box(6, 5, 7, 20, 1, 1, C.woodD); g.box(6, 5, 24, 20, 1, 1, C.woodD); // stretchers
  g.box(5, 14, 5, 22, 3, 22, wood(0xb07a4a, { axis: 'z', across: 'x', pw: 5, seed: 3 }));
  g.box(6, 17, 5, 3, 29, 3, C.woodD); g.box(23, 17, 5, 3, 29, 3, C.woodD);
  g.box(5, 42, 5, 22, 4, 3, wood(C.wood, { axis: 'x', across: 'y', pw: 99, seed: 4 }));
  g.box(5, 32, 5, 22, 3, 3, wood(C.wood, { axis: 'x', across: 'y', pw: 99, seed: 5 }));
  for (const x of [11, 15, 19]) g.box(x, 17, 6, 2, 25, 1, C.wood);
  // a little cushion
  g.box(8, 17, 8, 16, 2, 15, cloth(0xc94a3a, { stripe: 3, alt: 0xe8dcc0, seed: 2 }));
  return { obj: M(g), seats: [{ x: 0, z: 0.08, y: 0.42, yaw: 0 }] };
}

function armchair(id) {
  const g = fg(id, 40);
  const moss = (x, y, z) => { const h = hash2(x >> 1, y * 13 + (z >> 1), 6); return h < 0.15 ? 0x3a6a2a : h > 0.9 ? 0x8ac86a : 0x4a7a3a; };
  g.box(2, 4, 4, 28, 12, 26, moss);
  g.box(2, 16, 2, 28, 22, 8, moss);
  g.ellipsoid(16, 37, 6, 14, 3, 4, moss);
  g.box(2, 16, 8, 6, 10, 22, moss); g.box(24, 16, 8, 6, 10, 22, moss);
  g.ellipsoid(5, 26, 18, 3, 2, 11, moss); g.ellipsoid(27, 26, 18, 3, 2, 11, moss);
  g.box(8, 16, 10, 16, 4, 18, (x, y, z) => mulc(0x6a9a4a, sp3(x, y, z, 2, 0.08, 0.1)));
  for (const [x, z] of [[4, 6], [26, 6], [4, 27], [26, 27]]) g.box(x, 0, z, 2, 4, 2, C.woodD);
  for (const [x, y, z, c] of [[6, 37, 4, 0xf0e070], [24, 27, 22, 0xf0a0c0], [4, 27, 26, 0xe8e8ff], [20, 38, 5, 0xf0e070]]) g.set(x, y, z, c);
  return { obj: M(g), seats: [{ x: 0, z: 0.12, y: 0.42, yaw: 0 }] };
}

function sofa(id) {
  const g = fg(id, 40);
  const root = (x, y, z) => mulc(0x6a4a2a, 0.88 + (Math.floor((x + y * 2) / 7) % 3) * 0.06);
  g.box(0, 0, 4, 64, 14, 26, root);
  g.box(0, 14, 2, 64, 22, 8, root);
  g.box(0, 14, 8, 6, 12, 22, root); g.box(58, 14, 8, 6, 12, 22, root);
  for (let x = 0; x < 64; x += 9) line(g, [[x, 36, 3], [x + 4, 39, 5]], 1.1, 0x7a5a3a); // gnarled top
  const cush = (x, y, z) => mulc(x % 26 === 0 ? 0x8a4a2a : 0xa85a3a, sp3(x, y, z, 2, 0.06, 0.1));
  g.box(6, 14, 10, 26, 6, 18, cush); g.box(32, 14, 10, 26, 6, 18, cush);
  g.box(8, 20, 6, 22, 12, 4, cush); g.box(34, 20, 6, 22, 12, 4, cush);
  for (const [x, z] of [[18, 18], [46, 18]]) g.set(x, 20, z, 0x6a3a22); // buttons
  g.set(2, 28, 4, 0x5aa84a); g.set(60, 24, 6, 0x5aa84a); g.set(62, 26, 6, 0x6ab84a);
  return { obj: M(g), seats: [{ x: -0.42, z: 0.1, y: 0.45, yaw: 0 }, { x: 0.42, z: 0.1, y: 0.45, yaw: 0 }] };
}

// ---------------------------------------------------------------- tables
function tableSmall(id) {
  const g = fg(id, 32);
  ring(g, 16, 16, 0, 14.5, 20, 24, (x, y, z) => (y === 23 ? mulc(0xb07a4a, 0.92 + (Math.round(Math.hypot(x - 15.5, z - 15.5)) % 3) * 0.04) : C.wood));
  g.box(14, 0, 14, 4, 20, 4, beam(C.woodD, 'y', 2));
  g.box(8, 0, 14, 16, 2, 4, C.woodD); g.box(14, 0, 8, 4, 2, 16, C.woodD);
  // lace doily, teapot, cup and a slice of mushroom pie
  ring(g, 16, 16, 0, 7, 24, 25, (x, y, z) => ((x + z) % 3 ? 0xf6f0e4 : -1));
  g.ellipsoid(13, 28, 13, 4, 4, 4, (x, y) => (y > 30 ? 0x7aa0e0 : 0x5a8ad0)); g.box(12, 31, 12, 2, 2, 2, 0x5a8ad0);
  line(g, [[17, 28, 13], [20, 31, 13]], 0.6, 0x5a8ad0); line(g, [[9, 29, 13], [9, 27, 13]], 0.7, 0x5a8ad0);
  ring(g, 22, 20, 0, 2.2, 25, 28, 0xf6f0e8); ring(g, 22, 20, 0, 1.6, 27, 28, 0x8a5a3a);
  g.box(18, 25, 22, 5, 2, 4, (x, y) => (y === 26 ? 0xe8c070 : 0xc89050));
  return { obj: M(g) };
}

function tableLong(id) {
  const g = fg(id, 36);
  g.box(0, 20, 2, 64, 4, 28, wood(0xb07a4a, { axis: 'x', across: 'z', pw: 7, seed: 2 }));
  legs(g, 3, 4, 61, 28, 20, beam(C.woodD, 'y', 3), 4);
  g.box(4, 8, 14, 56, 2, 3, C.woodD);
  // table runner, plates, bread loaf, cheese, a candle
  g.box(0, 24, 12, 64, 1, 8, cloth(0xc94a3a, { stripe: 0, seed: 3 }));
  for (const x of [10, 46]) { ring(g, x, 9, 0, 4.5, 24, 25, 0xf0ece4); g.ellipsoid(x, 25.5, 9, 2.4, 1, 2.4, 0xc8743a); }
  g.ellipsoid(28, 26.5, 16, 6, 3, 3.6, (x, y) => (y > 27 ? 0xe0a050 : 0xc8843a));
  for (let k = -2; k <= 2; k++) g.set(28 + k * 2, 29, 16, 0xa86a2a);
  g.box(37, 24, 21, 5, 3, 4, 0xf0d060);
  g.box(40, 24, 17, 2, 6, 2, 0xf0e8d0);
  const grp = new THREE.Group();
  grp.add(M(g));
  const fl = new VoxelGrid(2, 4, 2);
  fl.box(0, 0, 0, 2, 2, 2, 0xffb040); fl.box(0, 2, 0, 2, 2, 2, 0xfff0a0);
  const fm = at(GL(fl, [1, 0, 1]), 64, 32, 41, 30, 18);
  grp.add(fm);
  return {
    obj: grp,
    lights: [{ x: 0.28, y: 1.0, z: 0.06, color: 0xffc070, intensity: 0, real: false, halo: 0.35, hx: 0.28, hy: 1.0, hz: 0.06, haloOpacity: 0.5, flicker: 0.3 }],
    update(dt, t) { fm.scale.y = 0.8 + 0.25 * Math.sin(t * 10) * Math.sin(t * 3.7); },
  };
}

// ---------------------------------------------------------------- lights
function lanternPost(id) {
  const grp = new THREE.Group();
  const g = fg(id, 72);
  const ir = iron(C.iron, 3);
  g.box(8, 0, 8, 16, 3, 16, stone(0x6a625c, { seed: 2 }));
  g.box(10, 3, 10, 12, 2, 12, ir);
  g.box(14, 5, 14, 4, 46, 4, (x, y, z) => (y % 12 === 0 ? 0x4a4a54 : ir(x, y, z)));
  g.box(12, 50, 12, 8, 2, 8, ir);
  // lantern cage
  g.box(10, 52, 10, 12, 2, 12, ir); g.box(10, 66, 10, 12, 2, 12, ir); g.box(12, 68, 12, 8, 2, 8, ir); g.box(15, 70, 15, 2, 2, 2, C.brass);
  for (const [x, z] of [[10, 10], [21, 10], [10, 21], [21, 21]]) g.box(x, 54, z, 1, 12, 1, ir);
  grp.add(M(g));
  const gl = new VoxelGrid(10, 12, 10);
  gl.box(0, 0, 0, 10, 12, 10, (x, y) => (y > 7 ? 0xffd890 : 0xffb24a));
  gl.box(3, 3, 3, 4, 6, 4, 0xfff2c0);
  grp.add(at(GL(gl, [5, 0, 5]), 32, 32, 16, 54, 16));
  return { obj: grp, lights: [{ x: 0, y: 1.85, z: 0, color: 0xffc070, intensity: 6, distance: 6, flicker: 0.12, pool: 1.8, poolOpacity: 0.3, halo: 0.9, hy: 1.85, haloOpacity: 0.55 }] };
}

function lampGlowcap(id) {
  const grp = new THREE.Group();
  const g = fg(id, 48);
  ring(g, 16, 16, 0, 7, 0, 6, (x, y, z) => (y === 5 ? 0x8a6a4a : 0x6a4a2a));
  line(g, [[16, 6, 16], [15, 18, 16], [16, 28, 16]], 2.6, (x, y, z) => (h3(x, y, z, 3) < 0.1 ? 0xd8ccbc : 0xece4d8));
  line(g, [[19, 6, 20], [21, 12, 21]], 1.4, 0xe8dcc0);
  grp.add(M(g));
  const cap = new VoxelGrid(32, 48, 32);
  cap.ellipsoid(16, 28, 16, 12.5, 11, 12.5, (x, y, z) => (y < 28 ? -1 : hash2(x >> 2, z >> 2, y >> 2) < 0.16 ? 0xd8f6ff : y > 34 ? 0x8ad8ff : 0x6ac8ff));
  ring(cap, 16, 16, 5, 11.5, 27, 28, 0x3a7ac0);
  cap.ellipsoid(21.5, 13, 21.5, 4.6, 4, 4.6, (x, y) => (y < 13 ? -1 : 0x7fd8ff));
  grp.add(GL(cap, undefined, true));
  return { obj: grp, lights: [{ x: 0, y: 1.1, z: 0, color: 0x7fd0ff, intensity: 4.5, distance: 5, flicker: 0.05, speed: 0.3, pool: 1.6, poolOpacity: 0.32, halo: 1.0, hy: 1.0, haloOpacity: 0.35 }] };
}

function fireplace(id) {
  const grp = new THREE.Group();
  const g = fg(id, 96);
  const st = (x, y, z) => {
    const row = Math.floor(y / 8), off = (row % 2) * 6;
    const bx = Math.floor((x + off) / 12);
    if (y % 8 === 0 || (x + off) % 12 === 0) return 0x4a443e;
    return mulc(C.stone, 0.84 + Math.floor(hash2(bx, row, 7) * 5) * 0.06);
  };
  g.box(0, 0, 0, 64, 52, 24, st);
  for (let y = 4; y < 38; y++) for (let x = 16; x < 48; x++) { const ok = y < 28 || Math.hypot(x + 0.5 - 32, (y - 28) * 2.2) < 16; if (ok) for (let z = 10; z < 24; z++) g.clear(x, y, z); }
  g.box(16, 3, 6, 32, 1, 18, 0x2a2224);
  g.box(16, 4, 4, 32, 34, 6, 0x1a1214);
  g.box(0, 0, 24, 64, 2, 8, (x, y, z) => mulc(0x6a625c, sp3(x, y, z, 3, 0.1, 0.12))); // hearth stone
  // mantel with carved brackets, chimney breast
  g.box(0, 52, 0, 64, 6, 30, wood(C.woodD, { axis: 'x', across: 'z', pw: 99, seed: 3 }));
  g.box(2, 58, 0, 60, 2, 24, wood(0x4a2a1a, { axis: 'x', across: 'z', pw: 99, seed: 4 }));
  for (const x of [4, 56]) g.box(x, 44, 24, 4, 8, 4, C.woodD);
  g.box(12, 60, 0, 40, 36, 16, st);
  // logs + andirons
  for (const [x0, y0, z0, len] of [[20, 4, 14, 24], [24, 8, 16, 16]]) { for (let x = x0; x < x0 + len; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) g.set(x, y0 + y, z0 + z, x === x0 || x === x0 + len - 1 ? (Math.round(Math.hypot(y - 1.5, z - 1.5)) % 2 ? 0xc8a070 : 0xa8804a) : 0x5a3a20); }
  for (const x of [18, 45]) { g.box(x, 4, 12, 2, 6, 2, C.iron); g.box(x - 1, 10, 12, 4, 2, 2, C.brass); }
  // mantel trinkets: candles, a clock, a pot plant, a framed sketch
  for (const x of [6, 56]) { g.box(x, 60, 18, 2, 8, 2, 0xf0e8d0); }
  ring(g, 32, 20, 0, 4, 60, 70, 0xb8603a); g.box(30, 70, 18, 4, 4, 4, 0x5aa84a); g.set(32, 74, 20, 0x6ac85a);
  g.box(42, 60, 16, 10, 12, 2, 0xc8a050); g.box(43, 61, 17, 8, 10, 2, 0xe8dcc0);
  grp.add(M(g));
  const glow = new VoxelGrid(64, 96, 32);
  for (const x of [6, 56]) { glow.set(x, 68, 18, 0xffd060); glow.set(x, 69, 18, 0xfff0a0); }
  grp.add(GL(glow));
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const fl = new VoxelGrid(8, 18, 4);
    fl.ellipsoid(4, 3, 2, 4, 4, 2, 0xff6a1a); fl.ellipsoid(4, 8, 2, 3, 4, 1.6, 0xffa030); fl.box(3, 11, 1, 2, 4, 2, 0xffd060); fl.set(4, 16, 2, 0xfff0a0);
    const m = at(GL(fl, [4, 0, 2]), 64, 32, 22 + i * 5, 10, 16 + (i % 2) * 2);
    grp.add(m);
    flames.push(m);
  }
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.55, z: 0.1, color: 0xff8a3a, intensity: 10, distance: 7, flicker: 0.38, pool: 2.4, poolZ: 0.9, poolOpacity: 0.45, halo: 1.2, hy: 0.5, hz: 0.25, haloOpacity: 0.45 }],
    update(dt, t) { flames.forEach((m, i) => { m.scale.y = 0.55 + 0.5 * Math.abs(Math.sin(t * (4.5 + i * 1.3) + i * 1.7)); m.scale.x = 0.85 + 0.2 * Math.sin(t * 6 + i * 2); }); },
  };
}

// ---------------------------------------------------------------- rugs (woven)
function rug(id) {
  const f = FURNITURE[id];
  const g = fg(id, 1);
  const c = f.icon?.c ?? 0xc9583a;
  const W = g.w, D = g.d;
  if (id === 'rug_round') {
    g.box(0, 0, 0, W, 1, D, (x, y, z) => {
      const r = Math.hypot(x + 0.5 - 16, z + 0.5 - 16);
      if (r > 15.4) return -1;
      const a = Math.atan2(z + 0.5 - 16, x + 0.5 - 16);
      const band = Math.floor(r / 2.6);
      const braid = (Math.floor(a * 9 + r) & 1) ? 1.06 : 0.94; // braided coils
      const base = band % 3 === 0 ? c : band % 3 === 1 ? 0xe8d8b0 : mixc(c, 0xf0c060, 0.4);
      return mulc(base, braid);
    });
  } else if (id === 'rug_long') {
    g.box(2, 0, 4, W - 4, 1, D - 8, (x, y, z) => {
      const lz = z - 4, lx = x - 2;
      if (lz < 2 || lz > D - 11) return 0xe8d8b0;
      if (lz === 4 || lz === D - 13) return 0xe0b040;
      const k = Math.abs(((lx % 16) - 7.5)) + Math.abs(lz - (D - 8) / 2);
      if (Math.round(k) % 6 === 0) return 0xe0b040; // diamonds
      return mulc((lx >> 3) % 2 ? c : mulc(c, 0.85), ((x + z) & 1) ? 1.04 : 0.96);
    });
    for (let z = 5; z < D - 5; z += 2) { g.set(0, 0, z, 0xe8d8b0); g.set(1, 0, z, 0xe8d8b0); g.set(W - 1, 0, z, 0xe8d8b0); g.set(W - 2, 0, z, 0xe8d8b0); } // fringe
  } else {
    g.box(2, 0, 2, W - 4, 1, D - 4, (x, y, z) => {
      const ex = Math.min(x - 2, W - 3 - x), ez = Math.min(z - 2, D - 3 - z);
      const e = Math.min(ex, ez);
      if (e === 0 || e === 5) return 0xe0b040;
      if (e < 5) return (x + z) % 4 < 2 ? 0x5a1a6a : 0x6a2a7a;
      const d = Math.abs(x - W / 2 + 0.5) + Math.abs(z - D / 2 + 0.5);
      if (Math.round(d) % 10 === 0) return 0xe0b040;
      if (Math.round(d) % 10 === 5) return 0xe8c8f0;
      return mulc(Math.round(d) % 10 < 5 ? c : mulc(c, 0.8), ((x + z) & 1) ? 1.04 : 0.96);
    });
    for (const [x, z] of [[0, 0], [W - 2, 0], [0, D - 2], [W - 2, D - 2]]) g.box(x, 0, z, 2, 1, 2, 0xffd34a); // tassels
  }
  const m = M(g);
  m.renderOrder = 1;
  return { obj: m, flat: true };
}

// ---------------------------------------------------------------- plants, storage
function plantFern(id) {
  const g = fg(id, 48);
  ring(g, 16, 16, 0, 8, 0, 12, (x, y, z) => (y === 11 ? 0xd88a5a : (y % 4 === 0 ? 0xa85a32 : 0xb8603a)));
  ring(g, 16, 16, 0, 9, 11, 13, 0xc8704a); ring(g, 16, 16, 0, 7, 12, 13, 0x3a2a1a);
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2 + 0.3, len = 12 + (a % 3) * 4;
    const pts = [];
    for (let k = 0; k <= len; k++) pts.push([16 + Math.cos(ang) * k * 0.72, 13 + k * 1.5 - k * k * 0.06, 16 + Math.sin(ang) * k * 0.72]);
    line(g, pts, 0.5, (x, y, z, t) => (t > 0.65 ? 0x7ac85a : 0x4a8a3a));
    for (let k = 3; k < len; k += 2) { const p = pts[k]; for (const s of [-1, 1]) g.set(Math.round(p[0] - Math.sin(ang) * s * 1.5), Math.round(p[1]), Math.round(p[2] + Math.cos(ang) * s * 1.5), k % 4 ? 0x5aa84a : 0x6ab84a); }
  }
  return { obj: M(g) };
}

function bookshelf(id) {
  const g = fg(id, 76);
  g.box(0, 0, 0, 32, 74, 20, wood(C.woodD, { axis: 'y', across: 'x', pw: 99, seed: 2 }));
  for (let x = 2; x < 30; x++) for (let y = 2; y < 72; y++) for (let z = 2; z < 20; z++) g.clear(x, y, z);
  g.box(2, 2, 1, 28, 70, 1, wood(0x4a2e1a, { axis: 'y', across: 'x', pw: 8, seed: 3 }));
  for (const y of [18, 36, 54]) g.box(2, y, 2, 28, 2, 18, wood(C.wood, { axis: 'x', across: 'z', pw: 99, seed: y }));
  const cols = [0xc94a3a, 0x3a6ac9, 0x5ab84a, 0xe0b040, 0x9a5ad9, 0x8a3a2a, 0x2a5a5a, 0xd9a06a];
  for (const y0 of [2, 20, 38, 56]) {
    let x = 2, i = Math.floor(hash2(y0, 0, 3) * 8);
    while (x < 30) {
      const bw = 2 + (hash2(x, y0, 1) < 0.35 ? 1 : 0), bh = 11 + Math.floor(hash2(x, y0, 2) * 5);
      if (hash2(x, y0, 6) < 0.1) { x += 2; continue; }
      if (y0 === 56 && x > 18) break;
      const c = cols[i++ % cols.length];
      g.box(x, y0, 4, Math.min(bw, 30 - x), bh, 14, (xx, yy, zz) => (zz === 17 && (yy === y0 + bh - 3 || yy === y0 + 2) ? 0xf0d890 : c));
      x += bw;
    }
  }
  // a little globe and a candle on the top shelf
  g.box(22, 56, 8, 4, 1, 4, C.brass); g.box(23, 57, 9, 2, 2, 2, C.brass);
  g.ellipsoid(24, 64, 10, 4.5, 4.5, 4.5, (x, y, z) => ((x + y * 2 + z) % 6 < 2 ? 0x5ab84a : 0x3a8ad0));
  return { obj: M(g, [16, 0, 16]) };
}

function barrel(id) {
  const g = fg(id, 34);
  for (let y = 0; y < 32; y++) {
    const r = 11 + Math.sin((y / 31) * Math.PI) * 2.2;
    ring(g, 16, 16, r - 2.5, r, y, y + 1, (x, yy, z, a) => {
      if (yy === 4 || yy === 5 || yy === 26 || yy === 27) return C.iron;
      const st = Math.floor((a + Math.PI) / (Math.PI / 8));
      const sf = (a + Math.PI) / (Math.PI / 8) - st;
      return sf < 0.1 ? mulc(C.wood, 0.7) : mulc(C.wood, 0.88 + hash2(st, 1, 3) * 0.2);
    });
  }
  ring(g, 16, 16, 0, 10.5, 31, 32, wood(C.woodL, { axis: 'z', across: 'x', pw: 6, seed: 4 }));
  g.box(19, 32, 12, 3, 1, 3, 0xc8a070);
  g.box(8, 32, 15, 16, 1, 2, mulc(C.wood, 0.8));
  return { obj: M(g) };
}

function crate(id) {
  const g = fg(id, 30);
  g.box(2, 0, 2, 28, 26, 28, (x, y, z) => wood(C.woodL, { axis: x === 2 || x === 29 ? 'z' : 'x', across: 'y', pw: 6, seed: 2 })(x, y, z));
  for (const [x, z] of [[1, 1], [26, 1], [1, 26], [26, 26]]) g.box(x, 0, z, 5, 27, 5, beam(C.wood, 'y', x + z));
  g.box(1, 26, 1, 30, 2, 30, wood(C.wood, { axis: 'x', across: 'z', pw: 6, seed: 5 }));
  for (let k = 0; k < 20; k++) { g.set(5 + k, 3 + k, 30, C.wood); g.set(6 + k, 3 + k, 30, C.wood); g.set(30, 3 + k, 5 + k, mulc(C.wood, 0.9)); }
  for (let x = 9; x < 23; x++) if (x % 3) g.set(x, 18, 30, 0xc0302a);
  g.box(9, 13, 30, 14, 1, 1, 0xc0302a);
  for (const [x, y] of [[3, 2], [28, 2], [3, 24], [28, 24]]) g.set(x, y, 31, C.ironL);
  return { obj: M(g) };
}

function desk(id) {
  const grp = new THREE.Group();
  const g = fg(id, 54);
  g.box(0, 20, 4, 32, 4, 26, wood(0xb07a4a, { axis: 'x', across: 'z', pw: 6, seed: 2 }));
  legs(g, 2, 6, 30, 28, 20, beam(C.woodD, 'y', 3), 3);
  g.box(20, 4, 8, 10, 16, 20, wood(C.wood, { axis: 'y', across: 'x', pw: 99, seed: 4 }));
  for (const y of [6, 12]) { g.box(20, y, 28, 10, 4, 1, C.woodL); g.box(24, y + 1, 29, 2, 2, 1, C.brass); }
  // hutch with cubbies, scrolls and a little lamp
  g.box(2, 24, 4, 28, 20, 6, wood(C.wood, { axis: 'y', across: 'x', pw: 99, seed: 5 }));
  for (const [x, y, w, h] of [[4, 26, 6, 6], [12, 26, 8, 6], [22, 26, 6, 6], [4, 34, 24, 8]]) for (let xx = x; xx < x + w; xx++) for (let yy = y; yy < y + h; yy++) g.clear(xx, yy, 9);
  g.box(4, 26, 8, 6, 6, 1, 0xf0e8d0); g.box(12, 26, 8, 8, 4, 1, 0xc94a3a); g.box(22, 26, 8, 6, 4, 1, 0x3a6ac9);
  for (let x = 4; x < 28; x++) g.set(x, 34, 8, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a, 0xe0b040][x % 4]);
  for (let x = 5; x < 27; x += 2) g.set(x, 35, 8, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a][x % 3]);
  // the open Index Book with tiny drawings, an inkwell and a quill
  g.box(5, 24, 14, 14, 2, 10, 0x8a2a2a);
  g.box(6, 26, 14, 6, 1, 10, 0xf6f0e0); g.box(12, 26, 14, 6, 1, 10, 0xeee6d4);
  for (let z = 16; z < 22; z += 2) { g.set(7, 27, z, 0x8a7a6a); g.set(8, 27, z, 0x8a7a6a); g.set(14, 27, z, 0x8a7a6a); }
  g.box(14, 27, 18, 3, 1, 3, 0x6ab84a);
  g.box(22, 24, 18, 4, 4, 4, 0x1a1a2a);
  line(g, [[24, 28, 19], [27, 36, 16]], 0.5, 0xf6f6f0);
  g.box(27, 24, 10, 2, 6, 2, 0xf0e8d0);
  grp.add(M(g));
  const fl = new VoxelGrid(2, 4, 2);
  fl.box(0, 0, 0, 2, 2, 2, 0xffb040); fl.box(0, 2, 0, 2, 2, 2, 0xfff0a0);
  const fm = at(GL(fl, [1, 0, 1]), 32, 32, 28, 30, 11);
  grp.add(fm);
  return {
    obj: grp,
    lights: [{ x: 0.37, y: 1.0, z: -0.16, color: 0xffc070, intensity: 0, real: false, halo: 0.35, hx: 0.37, hy: 1.0, hz: -0.16, haloOpacity: 0.55, flicker: 0.3 }],
    update(dt, t) { fm.scale.y = 0.8 + 0.25 * Math.sin(t * 11) * Math.sin(t * 4.1); },
  };
}

function planter(id, ctx, plantModel) {
  const grp = new THREE.Group();
  const g = fg(id, 16);
  g.box(2, 0, 2, 28, 14, 28, wood(C.wood, { axis: 'x', across: 'y', pw: 5, seed: 2 }));
  for (const [x, z] of [[1, 1], [27, 1], [1, 27], [27, 27]]) g.box(x, 0, z, 4, 16, 4, beam(C.woodD, 'y', x));
  for (let y = 0; y < 14; y += 5) { g.box(2, y, 1, 28, 1, 1, C.woodD); g.box(2, y, 30, 28, 1, 1, C.woodD); }
  g.box(5, 10, 5, 22, 4, 22, (x, y, z) => (y === 13 && hash2(x >> 1, z >> 1, 2) < 0.35 ? 0x4a3422 : 0x3a2a1a));
  for (let k = 0; k < 6; k++) g.set(7 + k * 3, 14, 8 + (k % 3) * 6, 0x6a5040);
  grp.add(M(g));
  const slot = new THREE.Group();
  slot.position.y = 14 / 32;
  grp.add(slot);
  const setPlant = (pl, items) => {
    while (slot.children.length) { const c = slot.children.pop(); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    if (!pl || !pl.id) return;
    slot.add(plantModel(pl.id, pl.ready ? 'grown' : 'sprout', items));
  };
  setPlant(ctx.planter, ctx.items);
  return { obj: grp, setPlant };
}

/** Builders that replace the 1/16 versions in furniture.js. */
export const BUILDERS32 = {
  bed_straw: bedStraw, bed_cozy: bedCozy, forge, stove, coop,
  stool, chair_wood: chair, armchair, sofa, table_small: tableSmall, table_long: tableLong,
  lantern_post: lanternPost, lamp_glowcap: lampGlowcap, fireplace,
  rug_round: rug, rug_long: rug, rug_fancy: rug,
  plant_fern: plantFern, bookshelf, barrel, crate, index_desk: desk, planter,
};
