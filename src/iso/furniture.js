// Voxel furniture models for the home burrow (part 1: beds, workstations, lights,
// seats, tables, rugs). Every model is built at 1/16 scale (16 voxels per tile),
// centered on its footprint with its front facing +z. buildFurniture() returns
//   { obj, lights:[local light specs], update(dt,t), seats:[{x,z,y,yaw}], lie, nap }
import * as THREE from 'three';
import { FURNITURE } from '../data/furniture.js';
import { VoxelGrid, vmesh, gmesh, jit, hash3, V16, shade, mixHex, carve } from './vox.js';
import { buildDecor } from './furniture2.js';

export const WOOD = 0x8a5a32, WOOD_D = 0x5a3a22, WOOD_L = 0xb07a4a, IRON = 0x34343c, IRON_L = 0x55555f;
export const STONE = 0x7a7470, STRAW = 0xd9b45a, BRASS = 0xc8a050, GOLD = 0xf2c23a;

export const wd = (c = WOOD, s = 1, amt = 0.08) => (x, y, z) => jit(c, x >> 1, y, z >> 1, s, amt);
export const mottled = (c, s = 1, amt = 0.1) => (x, y, z) => jit(c, x, y, z, s, amt);

/** Grid for a footprint with height h. */
export function fg(id, h) {
  const [w, d] = FURNITURE[id]?.size || [1, 1];
  return new VoxelGrid(w * 16, h, d * 16);
}
export const M = (g, pivot) => vmesh(g, { scale: V16, pivot: pivot ?? [g.w / 2, 0, g.d / 2] });
export const GL = (g, pivot, outline = true) => gmesh(g, { scale: V16, pivot: pivot ?? [g.w / 2, 0, g.d / 2], outline });

/** Place a mesh in grid-voxel coordinates of a parent footprint grid (gw x gd). */
export function at(mesh, gw, gd, x, y, z) {
  mesh.position.set((x - gw / 2) * V16, y * V16, (z - gd / 2) * V16);
  return mesh;
}

function legs(g, x0, z0, x1, z1, h, c, t = 2) {
  for (const [x, z] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) g.box(x, 0, z, t, h, t, c);
}

// ---------------------------------------------------------------- beds
function bedStraw(id) {
  const g = fg(id, 12);
  legs(g, 1, 1, 15, 31, 3, WOOD_D);
  g.box(1, 2, 2, 14, 2, 29, wd(WOOD, 2));
  g.box(1, 2, 0, 14, 8, 2, wd(WOOD_D, 3)); // headboard
  for (let x = 1; x < 15; x += 4) g.box(x, 9, 0, 2, 1, 2, WOOD); // notches
  // lumpy straw mattress
  g.box(2, 4, 2, 12, 2, 28, (x, y, z) => (hash3(x, y, z, 4) < 0.25 ? 0xb8913a : jit(STRAW, x, y, z, 5, 0.12)));
  for (let z = 2; z < 30; z++) for (let x = 2; x < 14; x++) if (hash3(x, 0, z, 9) < 0.3) g.set(x, 6, z, jit(STRAW, x, 6, z, 2, 0.15));
  for (let i = 0; i < 10; i++) g.set(1 + (i % 2) * 13, 5, 3 + i * 3, 0xe8c870); // stray straws
  // burlap pillow
  g.box(3, 6, 3, 10, 2, 5, mottled(0xc8b08a, 6, 0.08));
  // wool blanket
  g.box(1, 6, 14, 14, 2, 17, (x, y, z) => ((z >> 2) % 2 ? jit(0x7a5a3a, x, y, z, 7, 0.06) : jit(0x8a6a4a, x, y, z, 7, 0.06)));
  g.box(1, 4, 14, 1, 2, 17, 0x6a4a2a); g.box(14, 4, 14, 1, 2, 17, 0x6a4a2a);
  return { obj: M(g), lie: { y: 0.5, head: -0.55, foot: 0.78 } };
}

function bedCozy(id) {
  const g = fg(id, 16);
  legs(g, 1, 1, 15, 31, 4, WOOD_D);
  g.box(1, 3, 2, 14, 2, 29, wd(WOOD_L, 2));
  // headboard with a heart
  g.box(0, 2, 0, 16, 13, 2, wd(WOOD, 3));
  g.box(1, 15, 0, 14, 1, 2, WOOD_L);
  for (const [x, y] of [[6, 10], [7, 9], [8, 9], [9, 10], [6, 11], [9, 11], [7, 12], [8, 12], [7, 11], [8, 11], [7, 10], [8, 10]]) g.set(x, y, 2, 0xd94a4a);
  g.box(0, 2, 30, 16, 6, 2, wd(WOOD, 4)); // footboard
  g.box(2, 5, 2, 12, 2, 28, mottled(0xf0ece0, 3, 0.04)); // sheet
  g.box(3, 7, 3, 10, 2, 5, mottled(0xfaf6ee, 4, 0.03)); // pillow
  const patches = [0xd96a6a, 0xe0b040, 0x5a8ad0, 0x6ab84a, 0xc87ab0, 0xe8e0d0];
  g.box(1, 7, 11, 14, 1, 19, (x, y, z) => {
    if (x % 4 === 0 || z % 4 === 3) return 0xf6f0e0;
    return jit(patches[(Math.floor(x / 4) + Math.floor(z / 4) * 3) % patches.length], x, y, z, 8, 0.05);
  });
  g.box(1, 5, 11, 1, 2, 19, 0xd96a6a); g.box(14, 5, 11, 1, 2, 19, 0xd96a6a);
  return { obj: M(g), lie: { y: 0.58, head: -0.55, foot: 0.75 } };
}

function bedRoyal(id) {
  const g = fg(id, 46);
  const post = (x, z) => { g.box(x, 0, z, 3, 44, 3, wd(0x4a2a1a, 2)); g.box(x, 44, z, 3, 2, 3, GOLD); };
  post(0, 0); post(29, 0); post(0, 29); post(29, 29);
  // canopy frame + velvet roof
  g.box(0, 42, 0, 32, 2, 3, wd(0x4a2a1a)); g.box(0, 42, 29, 32, 2, 3, wd(0x4a2a1a));
  g.box(0, 42, 0, 3, 2, 32, wd(0x4a2a1a)); g.box(29, 42, 0, 3, 2, 32, wd(0x4a2a1a));
  const vel = 0x5a3ab0;
  g.box(1, 44, 1, 30, 1, 30, (x, y, z) => ((x + z) % 6 === 0 ? 0x4a2a90 : jit(vel, x, y, z, 2, 0.05)));
  // valance
  for (let x = 3; x < 29; x++) { g.set(x, 41, 30, x % 3 ? vel : GOLD); g.set(x, 41, 1, vel); }
  for (let z = 3; z < 29; z++) { g.set(1, 41, z, vel); g.set(30, 41, z, vel); }
  // curtains tied at the posts
  for (const [x, z] of [[3, 3], [26, 3], [3, 26], [26, 26]]) {
    g.box(x, 22, z, 3, 20, 3, (xx, y, zz) => jit(vel, xx, y, zz, 5, 0.1));
    g.box(x + (x < 10 ? 0 : 1), 12, z + (z < 10 ? 0 : 1), 2, 10, 2, (xx, y, zz) => jit(shade(vel, 0.9), xx, y, zz, 6, 0.1));
    g.box(x, 22, z, 3, 1, 3, GOLD);
  }
  // bed
  g.box(2, 3, 2, 28, 5, 28, wd(0x5a3020, 3));
  g.box(0, 3, 0, 32, 18, 3, wd(0x4a2a1a, 4)); // headboard
  for (let x = 8; x < 24; x++) for (let y = 12; y < 19; y++) if (Math.abs(x - 15.5) + Math.abs(y - 15.5) < 4) g.set(x, y, 3, GOLD);
  g.box(3, 8, 3, 26, 3, 26, mottled(0xf4f0e8, 3, 0.03));
  g.box(5, 11, 4, 9, 2, 5, 0xfaf6f0); g.box(18, 11, 4, 9, 2, 5, 0xfaf6f0);
  g.box(2, 11, 12, 28, 1, 18, (x, y, z) => (x === 2 || x === 29 || z === 29 ? GOLD : jit(0x7a3ac0, x, y, z, 6, 0.06)));
  g.box(2, 8, 12, 1, 3, 18, 0x7a3ac0); g.box(29, 8, 12, 1, 3, 18, 0x7a3ac0); g.box(2, 8, 29, 28, 3, 1, 0x7a3ac0);
  return { obj: M(g), lie: { y: 0.78, head: -0.6, foot: 0.85, x: 0 } };
}

// ---------------------------------------------------------------- forge & stove
function forge(id) {
  const grp = new THREE.Group();
  const g = fg(id, 50);
  const brick = (x, y, z) => {
    const row = y >> 1;
    const off = row % 2 ? 2 : 0;
    if (y % 2 === 1 && (x + z + off) % 4 === 0) return 0x4a3a34;
    return jit(row % 3 ? 0x8a4a3a : 0x7a4234, (x + z + off) >> 2, row, 0, 3, 0.12);
  };
  // hearth block
  g.box(1, 0, 0, 22, 14, 20, brick);
  g.box(0, 13, 0, 24, 2, 21, mottled(0x6a625c, 2, 0.1)); // hearth lip
  // fire pit opening
  carve(g, 5, 5, 12, 14, 8, 9);
  g.box(5, 4, 12, 14, 1, 8, 0x1a1214);
  // hood + chimney
  for (let y = 15; y < 27; y++) {
    const inset = Math.floor((y - 15) / 2);
    g.box(2 + inset, y, 1, 20 - inset * 2, 1, 18 - inset * 2, (x, yy, z) => (yy % 4 === 0 ? 0x3a3a40 : jit(0x4a4a52, x, yy, z, 4, 0.06)));
  }
  g.box(7, 27, 4, 10, 23, 10, brick);
  g.box(6, 48, 3, 12, 2, 12, mottled(0x5a524c, 5));
  // stump + anvil
  g.cylinderY(26, 22, 4.2, 0, 7, (x, y, z) => (y === 6 ? (Math.round(Math.hypot(x - 25.5, z - 21.5)) % 2 ? 0xc8a070 : 0xa8804a) : jit(0x6a4a2a, x, y, z, 6, 0.1)));
  g.box(23, 7, 20, 6, 2, 5, IRON);
  g.box(24, 9, 21, 4, 2, 3, IRON);
  g.box(21, 11, 19, 10, 2, 7, (x, y) => (y === 12 ? IRON_L : IRON));
  g.box(19, 11, 21, 2, 1, 3, IRON); g.set(18, 11, 22, IRON);
  // hammer resting on the anvil
  g.box(24, 13, 23, 6, 1, 1, 0x8a5a32); g.box(28, 13, 22, 2, 2, 3, 0x5a5a64);
  // bellows on the left
  g.box(0, 6, 22, 7, 1, 9, wd(WOOD_D));
  g.box(1, 7, 23, 5, 2, 7, mottled(0x7a4a2a, 7));
  g.box(0, 9, 22, 7, 1, 9, wd(WOOD_D));
  g.box(2, 6, 18, 2, 2, 4, IRON_L); // nozzle
  g.box(3, 9, 30, 1, 3, 1, WOOD_D); g.box(2, 12, 30, 3, 1, 1, WOOD_D);
  legs(g, 1, 23, 7, 30, 6, WOOD_D, 1);
  // quench bucket
  g.cylinderY(28.5, 6.5, 3.4, 0, 8, (x, y) => (y === 2 || y === 6 ? IRON : jit(WOOD, x, y, 0, 3, 0.08)));
  g.cylinderY(28.5, 6.5, 2.4, 7, 8, 0x3a6a9a);
  // tongs leaning
  for (let y = 0; y < 12; y++) g.set(24 + (y >> 2), y, 12, IRON_L);
  grp.add(M(g));
  // glowing coals + flames
  const coals = new VoxelGrid(14, 3, 8);
  coals.box(0, 0, 0, 14, 2, 8, (x, y, z) => (hash3(x, y, z, 3) < 0.4 ? 0xffd27a : hash3(x, z, y, 5) < 0.5 ? 0xff7a2a : 0xd9401a));
  for (let x = 1; x < 13; x += 2) coals.set(x, 2, 2 + (x % 3), 0xffb040);
  grp.add(at(GL(coals, [0, 0, 0], false), 32, 32, 5, 5, 12));
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const fl = new VoxelGrid(3, 6, 3);
    fl.box(0, 0, 0, 3, 2, 3, 0xff7a2a); fl.box(0, 2, 0, 3, 2, 3, 0xffb040); fl.box(1, 4, 1, 1, 2, 1, 0xfff0a0);
    const m = at(GL(fl, [1.5, 0, 1.5], false), 32, 32, 8 + i * 4, 7, 16);
    grp.add(m);
    flames.push(m);
  }
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.75, z: 0.15, color: 0xff7a2a, intensity: 9, distance: 6.5, flicker: 0.35, pool: 2.3, poolZ: 0.6, poolOpacity: 0.42, halo: 1.1, hz: 0.25, hy: 0.6, haloOpacity: 0.5 }],
    embers: { x: 0, y: 0.75, z: 0.25 },
    update(dt, t) {
      flames.forEach((m, i) => { m.scale.y = 0.65 + 0.45 * Math.abs(Math.sin(t * (5 + i * 1.7) + i * 2)); m.scale.x = 0.9 + 0.15 * Math.sin(t * 7 + i); });
    },
  };
}

function stove(id) {
  const grp = new THREE.Group();
  const g = fg(id, 48);
  const iron = (x, y, z) => jit(0x2e2e36, x, y, z, 2, 0.06);
  legs(g, 2, 3, 14, 14, 3, IRON, 2);
  g.box(2, 3, 3, 12, 11, 11, iron);
  g.box(1, 14, 2, 14, 2, 13, (x, y) => (y === 15 ? 0x4a4a54 : 0x3a3a44));
  // door with grate
  g.box(4, 5, 14, 8, 7, 1, 0x3e3e48);
  carve(g, 5, 6, 14, 6, 4, 1);
  g.box(5, 6, 13, 6, 4, 1, 0x1a1214);
  for (const x of [6, 8, 10]) g.box(x, 6, 14, 1, 4, 1, 0x4a4a54);
  g.box(11, 8, 15, 2, 1, 1, BRASS);
  for (const [x, y] of [[3, 4], [12, 4], [3, 12], [12, 12]]) g.set(x, y, 14, 0x6a6a74);
  // pot on top
  g.cylinderY(6.5, 8.5, 3.2, 16, 21, (x, y) => (y === 20 ? 0xd98a5a : jit(0xb86a3a, x, y, 0, 3, 0.08)));
  g.box(3, 19, 8, 1, 1, 1, 0xb86a3a); g.box(9, 19, 8, 1, 1, 1, 0xb86a3a);
  g.box(6, 21, 8, 1, 1, 1, 0x3a2a20);
  // stovepipe
  g.box(10, 16, 4, 3, 32, 3, (x, y, z) => (y % 8 === 0 ? 0x4a4a54 : jit(0x2a2a32, x, y, z, 6, 0.05)));
  g.box(9, 30, 3, 5, 1, 5, 0x3a3a44);
  grp.add(M(g));
  const fire = new VoxelGrid(6, 4, 1);
  fire.box(0, 0, 0, 6, 4, 1, (x, y) => (y === 0 ? 0xffd27a : hash3(x, y, 0, 2) < 0.5 ? 0xff8a3a : 0xffb040));
  const fm = at(GL(fire, [0, 0, 0], false), 16, 16, 5, 6, 13.6);
  grp.add(fm);
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.5, z: 0.45, color: 0xff9a4a, intensity: 5, distance: 5, flicker: 0.4, pool: 1.5, poolZ: 0.7, poolOpacity: 0.38, halo: 0.6, hy: 0.5, hz: 0.5, haloOpacity: 0.45 }],
    steam: { x: -0.1, y: 1.35, z: 0 },
    update(dt, t) { fm.scale.y = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.3); },
  };
}

function coop(id, ctx) {
  const grp = new THREE.Group();
  const g = fg(id, 24);
  g.box(0, 0, 0, 16, 2, 16, wd(WOOD_D, 2));
  g.box(1, 2, 1, 14, 12, 2, wd(WOOD, 3, 0.1));
  g.box(1, 2, 1, 2, 12, 14, wd(WOOD, 4, 0.1));
  g.box(13, 2, 1, 2, 12, 14, wd(WOOD, 5, 0.1));
  for (const x of [1, 13]) for (let y = 2; y < 14; y += 4) g.box(x, y, 3, 2, 1, 12, shade(WOOD, 0.8));
  g.box(3, 2, 13, 10, 2, 2, wd(WOOD_L)); // lip
  // gable roof
  for (let k = 0; k < 9; k++) {
    const y = 14 + k;
    g.box(k, y, 0, 16 - k * 2, 1, 17, (x, yy, z) => ((z + (x > 7 ? 1 : 0)) % 3 === 0 ? 0x9a2a24 : jit(0xc0443a, x, yy, z, 3, 0.08)));
    if (k < 8) carve(g, k + 1, y, 1, 14 - k * 2, 1, 14);
  }
  for (let k = 0; k < 8; k++) { g.box(k + 1, 14 + k, 2, 14 - k * 2, 1, 1, WOOD); }
  // straw bedding
  g.box(3, 2, 3, 10, 2, 11, (x, y, z) => (hash3(x, y, z, 5) < 0.3 ? 0xb8913a : jit(STRAW, x, y, z, 6, 0.12)));
  for (let i = 0; i < 6; i++) g.set(3 + i * 2, 4, 4 + (i % 3) * 3, 0xe8c870);
  // name plank
  g.box(5, 11, 15, 6, 2, 1, WOOD_L);
  g.set(6, 12, 16, 0x3a2a1a); g.set(8, 12, 16, 0x3a2a1a); g.set(10, 12, 16, 0x3a2a1a);
  grp.add(M(g));
  const eggs = new THREE.Group();
  grp.add(eggs);
  const setEggs = (n) => {
    while (eggs.children.length) { const c = eggs.children.pop(); c.geometry.dispose(); }
    const pos = [[5, 9], [9, 10], [7, 6], [10, 7], [4, 6], [8, 12]];
    for (let i = 0; i < Math.min(6, n); i++) {
      const e = new VoxelGrid(3, 4, 3);
      e.box(0, 0, 0, 3, 3, 3, 0xf6ecd8); e.set(1, 3, 1, 0xfaf4e8); e.set(0, 2, 0, -1); e.set(2, 2, 2, -1); e.set(1, 1, 2, 0xe8d8b8);
      eggs.add(at(M(e, [1.5, 0, 1.5]), 16, 16, pos[i][0], 4, pos[i][1]));
    }
  };
  setEggs(ctx.eggs || 0);
  return { obj: grp, nap: { x: 0, z: 0.05, y: 0.16, yaw: 0 }, setEggs };
}

// ---------------------------------------------------------------- planter
const PLANT_LOOK = {
  carrot: ['carrot', 0xf0a050, 0x6ab84a], glowcap: ['shroom', 0x6ac8ff, 0xd8f6ff, true], fern: ['fern', 0xc8d8b0], whisper: ['tendril', 0xa080c0],
  sap: ['vine', 0x6a9a4a, 0xf0e0b0], pepper: ['carrot', 0xe0402a, 0x5a9a3a], sparkmoss: ['moss', 0x4a9ae0, 0xfff07a, true], bubble: ['bulb', 0xd0b8ff, 0xffffff],
  lily: ['flower', 0xd8f0ff, 0x9fd6ff, true], gloom: ['shroom', 0x7a4a9a, 0xb090d0], ashfern: ['fern', 0x9a948e], ember: ['flower', 0xff7a2a, 0xffe066, true],
  truffle: ['lump', 0x5a3a2a, 0x8a6a4a], frost: ['flower', 0xbff6ff, 0xffffff, true], lotus: ['flower', 0xff9ad0, 0xffe066, true],
};

/** A small voxel plant for the planter. stage: 'sprout' | 'grown'. */
export function plantModel(plantId, stage, itemsTable) {
  const it = itemsTable?.[plantId];
  const look = PLANT_LOOK[it?.icon?.t] || ['fern', 0x6ab84a];
  const [kind, c, acc, glow] = look;
  const g = new VoxelGrid(12, 14, 12);
  const gg = glow ? new VoxelGrid(12, 14, 12) : null;
  const put = (x, y, z, col, lit = false) => (lit && gg ? gg : g).set(x, y, z, col);
  const leaf = 0x5aa84a;
  if (stage === 'sprout') {
    put(6, 0, 6, leaf); put(6, 1, 6, leaf); put(5, 2, 6, 0x7ac85a); put(7, 2, 6, 0x7ac85a); put(6, 2, 5, 0x6ab84a);
  } else if (kind === 'carrot') {
    for (const [x, z] of [[3, 4], [7, 6], [5, 9], [9, 3]]) {
      g.box(x, 0, z, 2, 1, 2, c);
      put(x, 1, z, leaf); put(x + 1, 2, z, 0x6ac85a); put(x, 3, z, leaf); put(x + 1, 4, z + 1, 0x7ad86a); put(x - 1, 3, z, acc || leaf);
    }
  } else if (kind === 'shroom') {
    for (const [x, z, h, r] of [[4, 4, 4, 2.2], [8, 7, 6, 2.8], [4, 9, 3, 1.8]]) {
      g.box(x, 0, z, 1, h, 1, 0xe8dcc0);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        put(x + dx, h, z + dz, (dx + dz) % 3 === 0 ? acc : c, true);
        if (dx * dx + dz * dz < (r - 1) ** 2) put(x + dx, h + 1, z + dz, c, true);
      }
    }
  } else if (kind === 'fern' || kind === 'tendril' || kind === 'vine') {
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      for (let k = 0; k < 6; k++) {
        const x = Math.round(6 + Math.cos(ang) * k * 0.8), z = Math.round(6 + Math.sin(ang) * k * 0.8);
        const y = Math.round(k * 1.6 - k * k * 0.12);
        put(x, Math.max(0, y), z, k % 2 ? c : shade(c, 0.85), kind === 'tendril');
      }
    }
    if (kind === 'vine' && acc) put(8, 4, 8, acc, true);
  } else if (kind === 'moss') {
    for (let z = 2; z < 10; z++) for (let x = 2; x < 10; x++) if (Math.hypot(x - 6, z - 6) < 4) { put(x, 0, z, jit(c, x, 0, z, 3, 0.15)); if (hash3(x, 1, z, 4) < 0.4) put(x, 1, z, shade(c, 1.1)); }
    for (let i = 0; i < 4; i++) put(3 + i * 2, 2, 4 + (i % 2) * 4, acc, true);
  } else if (kind === 'bulb') {
    for (const [x, z] of [[4, 5], [8, 7]]) { g.box(x, 0, z, 1, 3, 1, leaf); for (let dy = 0; dy < 3; dy++) for (let d = -1; d <= 1; d++) { put(x + d, 3 + dy, z, c); put(x, 3 + dy, z + d, c); } put(x, 4, z + 1, acc); }
  } else if (kind === 'flower') {
    for (const [x, z, h] of [[4, 5, 5], [8, 7, 7], [5, 9, 4]]) {
      g.box(x, 0, z, 1, h, 1, leaf);
      put(x - 1, 2, z, leaf);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, h, z + dz, c, true);
      put(x, h, z, acc, true);
      put(x, h + 1, z, c, true);
    }
  } else {
    for (const [x, z] of [[4, 5], [7, 7], [5, 8]]) g.box(x, 0, z, 2, 2, 2, mottled(c, 3, 0.1));
  }
  const grp = new THREE.Group();
  grp.add(M(g, [6, 0, 6]));
  if (gg) grp.add(GL(gg, [6, 0, 6]));
  grp.userData.glow = !!glow;
  grp.userData.color = c;
  return grp;
}

function planter(id, ctx) {
  const grp = new THREE.Group();
  const g = fg(id, 8);
  g.box(1, 0, 1, 14, 7, 14, wd(WOOD, 2));
  for (const [x, z] of [[1, 1], [13, 1], [1, 13], [13, 13]]) g.box(x, 0, z, 2, 8, 2, WOOD_D);
  for (let y = 0; y < 7; y += 3) { g.box(1, y, 1, 14, 1, 1, WOOD_D); g.box(1, y, 14, 14, 1, 1, WOOD_D); }
  g.box(3, 5, 3, 10, 2, 10, (x, y, z) => (y === 6 && hash3(x, y, z, 2) < 0.35 ? 0x4a3422 : jit(0x3a2a1a, x, y, z, 3, 0.1)));
  grp.add(M(g));
  const slot = new THREE.Group();
  slot.position.y = 7 / 16;
  grp.add(slot);
  const setPlant = (pl, items) => {
    while (slot.children.length) {
      const c = slot.children.pop();
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    if (!pl || !pl.id) return;
    slot.add(plantModel(pl.id, pl.ready ? 'grown' : 'sprout', items));
  };
  setPlant(ctx.planter, ctx.items);
  return { obj: grp, setPlant };
}

// ---------------------------------------------------------------- desk
function desk(id) {
  const grp = new THREE.Group();
  const g = fg(id, 26);
  const top = wd(WOOD_L, 2);
  g.box(0, 10, 2, 16, 2, 13, top);
  legs(g, 1, 3, 15, 14, 10, WOOD_D);
  g.box(10, 2, 4, 5, 8, 10, wd(WOOD, 3));
  for (const y of [3, 6]) { g.box(10, y, 14, 5, 2, 1, WOOD_L); g.set(12, y + 1, 15, BRASS); }
  // hutch with cubbies
  g.box(1, 12, 2, 14, 10, 3, wd(WOOD, 4));
  carve(g, 2, 13, 4, 3, 3, 1); carve(g, 6, 13, 4, 4, 3, 1); carve(g, 11, 13, 4, 3, 3, 1);
  carve(g, 2, 17, 4, 12, 4, 1);
  g.box(2, 13, 3, 3, 3, 1, 0xf0e8d0); g.box(6, 13, 3, 4, 2, 1, 0xc94a3a); g.box(11, 13, 3, 3, 2, 1, 0x3a6ac9);
  for (let x = 2; x < 14; x++) g.set(x, 17, 3, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a, 0xe0b040][x % 4]);
  for (let x = 2; x < 14; x += 1) if (x % 2) g.set(x, 18, 3, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a][x % 3]);
  // open book
  g.box(3, 12, 7, 7, 1, 5, 0x8a2a2a);
  g.box(3, 13, 7, 3, 1, 5, 0xf6f0e0); g.box(6, 13, 7, 3, 1, 5, 0xeee6d4);
  for (let z = 8; z < 11; z++) { g.set(4, 13, z, 0x9a9080); g.set(7, 13, z, 0x9a9080); }
  // inkwell + quill
  g.box(11, 12, 9, 2, 2, 2, 0x1a1a2a);
  g.set(12, 14, 10, 0xf6f6f0); g.set(12, 15, 9, 0xf6f6f0); g.set(13, 16, 9, 0xe8e8e0); g.set(13, 17, 8, 0xe8e8e0);
  // candle
  g.box(13, 12, 5, 1, 3, 1, 0xf0e8d0);
  grp.add(M(g));
  const fl = new VoxelGrid(1, 2, 1);
  fl.set(0, 0, 0, 0xffb040); fl.set(0, 1, 0, 0xfff0a0);
  const fm = at(GL(fl, [0.5, 0, 0.5], false), 16, 16, 13.5, 15, 5.5);
  grp.add(fm);
  return {
    obj: grp,
    lights: [{ x: 0.35, y: 1.0, z: -0.15, color: 0xffc070, intensity: 0, real: false, halo: 0.35, hx: 0.34, hy: 1.0, hz: -0.16, haloOpacity: 0.55, flicker: 0.3 }],
    update(dt, t) { fm.scale.y = 0.8 + 0.25 * Math.sin(t * 11) * Math.sin(t * 4.1); },
  };
}

// ---------------------------------------------------------------- lights
function lampGlowcap(id) {
  const grp = new THREE.Group();
  const g = fg(id, 24);
  g.cylinderY(8, 8, 3.6, 0, 3, (x, y, z) => jit(0x6a4a2a, x, y, z, 2, 0.1));
  g.cylinderY(8, 8, 1.4, 3, 14, (x, y, z) => jit(0xe8dcc0, x, y, z, 3, 0.05));
  g.cylinderY(11.5, 10.5, 0.8, 3, 7, 0xe8dcc0);
  grp.add(M(g));
  const cap = new VoxelGrid(16, 24, 16);
  cap.ellipsoid(8, 14, 8, 6.2, 5.5, 6.2, (x, y, z) => (y < 14 ? -1 : (x * 3 + z) % 7 === 0 && y > 15 ? 0xd8f6ff : jit(0x6ac8ff, x, y, z, 4, 0.08)));
  cap.ellipsoid(8, 14, 8, 5.8, 1.2, 5.8, (x, y) => (y === 13 ? 0x3a7ac0 : -1));
  cap.ellipsoid(11.5, 7, 10.5, 2.4, 2.4, 2.4, (x, y) => (y < 7 ? -1 : 0x7fd8ff));
  grp.add(GL(cap));
  return { obj: grp, lights: [{ x: 0, y: 1.1, z: 0, color: 0x7fd0ff, intensity: 4.5, distance: 5, flicker: 0.05, speed: 0.3, pool: 1.6, poolOpacity: 0.32, halo: 1.0, hy: 1.0, haloOpacity: 0.35 }] };
}

function lanternPost(id) {
  const grp = new THREE.Group();
  const g = fg(id, 36);
  g.box(4, 0, 4, 8, 2, 8, mottled(0x6a625c, 2, 0.12));
  g.box(7, 2, 7, 2, 24, 2, (x, y, z) => (y % 6 === 0 ? 0x4a4a54 : IRON));
  g.box(6, 25, 6, 4, 1, 4, IRON);
  // lantern cage
  g.box(5, 26, 5, 6, 1, 6, IRON); g.box(5, 33, 5, 6, 1, 6, IRON); g.box(6, 34, 6, 4, 1, 4, IRON); g.set(7, 35, 7, IRON); g.set(8, 35, 8, IRON);
  for (const [x, z] of [[5, 5], [10, 5], [5, 10], [10, 10]]) g.box(x, 27, z, 1, 6, 1, IRON);
  grp.add(M(g));
  const gl = new VoxelGrid(4, 6, 4);
  gl.box(0, 0, 0, 4, 6, 4, (x, y) => (y > 3 ? 0xffd890 : 0xffb24a));
  gl.box(1, 1, 1, 2, 3, 2, 0xfff2c0);
  grp.add(at(GL(gl, [2, 0, 2], false), 16, 16, 8, 27, 8));
  return { obj: grp, lights: [{ x: 0, y: 1.85, z: 0, color: 0xffc070, intensity: 6, distance: 6, flicker: 0.12, pool: 1.8, poolOpacity: 0.3, halo: 0.9, hy: 1.85, haloOpacity: 0.55 }] };
}

function beetleJar(id) {
  const grp = new THREE.Group();
  const g = fg(id, 20);
  g.cylinderY(8, 8, 4.5, 0, 6, (x, y, z) => (y === 5 ? (Math.round(Math.hypot(x - 7.5, z - 7.5)) % 2 ? 0xc8a070 : 0xa8804a) : jit(0x6a4a2a, x, y, z, 6, 0.1)));
  g.cylinderY(8, 8, 2.6, 16, 18, (x, y, z) => jit(0x9a7a5a, x, y, z, 3, 0.1));
  for (let y = 7; y < 14; y++) g.set(7 + (y > 10 ? 1 : 0), y, 8, 0x6a4a2a);
  g.set(9, 12, 8, 0x6ab84a); g.set(9, 13, 8, 0x7ac85a);
  grp.add(M(g));
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 10), new THREE.MeshBasicMaterial({ color: 0xd8f0f0, transparent: true, opacity: 0.22, depthWrite: false }));
  jar.position.y = 6 / 16 + 0.3;
  grp.add(jar);
  const bg = new VoxelGrid(3, 2, 4);
  bg.box(0, 0, 0, 3, 2, 3, 0xd8ff8a); bg.box(0, 0, 3, 3, 1, 1, 0x2a2a3a); bg.set(1, 1, 1, 0xf0ffc0);
  const beetle = GL(bg, [1.5, 0, 2], false);
  beetle.position.y = 0.6;
  grp.add(beetle);
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.65, z: 0, color: 0xc8ff7a, intensity: 3, distance: 4, flicker: 0.25, speed: 0.4, pool: 1.2, poolOpacity: 0.3, halo: 0.7, hy: 0.65, haloOpacity: 0.45 }],
    update(dt, t) {
      beetle.position.y = 0.55 + Math.sin(t * 2.3) * 0.12;
      beetle.position.x = Math.sin(t * 1.1) * 0.08;
      beetle.rotation.y = t * 0.9;
    },
  };
}

function crystalLamp(id) {
  const grp = new THREE.Group();
  const g = fg(id, 8);
  g.box(3, 0, 3, 10, 2, 10, mottled(0x3a3a48, 2, 0.08));
  g.box(4, 2, 4, 8, 3, 8, mottled(0x4a4a58, 3, 0.08));
  g.box(3, 4, 3, 10, 1, 10, (x, y, z) => ((x + z) % 2 ? 0xd8dde6 : 0xa8b0c0));
  grp.add(M(g));
  const c = new VoxelGrid(16, 30, 16);
  const spike = (cx, cz, h, r, lean) => {
    for (let y = 0; y < h; y++) {
      const rr = r * (1 - Math.pow(y / h, 1.6));
      const ox = cx + lean * y, oz = cz;
      for (let x = Math.floor(ox - rr); x <= Math.ceil(ox + rr); x++) for (let z = Math.floor(oz - rr); z <= Math.ceil(oz + rr); z++) {
        if ((x + 0.5 - ox) ** 2 + (z + 0.5 - oz) ** 2 > rr * rr) continue;
        const side = x + 0.5 < ox ? 0xe8c8ff : x + 0.5 > ox + 0.6 ? 0x7a3ab0 : 0xb07ae0;
        c.set(x, 5 + y, z, y > h - 3 ? 0xf6eaff : side);
      }
    }
  };
  spike(8, 8, 22, 3, 0); spike(5, 9, 12, 2, -0.15); spike(11, 7, 14, 2, 0.15); spike(8, 11, 9, 1.6, 0.05);
  grp.add(GL(c));
  return { obj: grp, lights: [{ x: 0, y: 1.2, z: 0, color: 0xe0a8ff, intensity: 6, distance: 6, flicker: 0.06, speed: 0.3, pool: 1.9, poolOpacity: 0.34, halo: 1.3, hy: 1.1, haloOpacity: 0.4 }] };
}

function fireplace(id) {
  const grp = new THREE.Group();
  const g = fg(id, 48);
  const stone = (x, y, z) => {
    const bx = Math.floor((x + (Math.floor(y / 4) % 2) * 3) / 6), by = Math.floor(y / 4);
    if (y % 4 === 0 || (x + (by % 2) * 3) % 6 === 0) return 0x4a443e;
    return jit(STONE, bx, by, z >> 2, 7, 0.16);
  };
  g.box(0, 0, 0, 32, 26, 12, stone);
  carve(g, 8, 2, 6, 16, 14, 6);
  carve(g, 8, 16, 6, 16, 3, 6, (x, y) => Math.hypot(x + 0.5 - 16, (y - 14) * 2.2) < 9);
  g.box(8, 1, 3, 16, 1, 9, 0x2a2224);
  g.box(8, 2, 3, 16, 14, 3, 0x1a1214);
  g.box(0, 0, 12, 32, 1, 4, mottled(0x6a625c, 3, 0.1)); // hearth stone
  // mantel
  g.box(0, 26, 0, 32, 3, 15, wd(WOOD_D, 3));
  g.box(1, 29, 0, 30, 1, 12, wd(0x4a2a1a, 3));
  // chimney breast
  g.box(6, 30, 0, 20, 18, 8, stone);
  // logs
  g.box(10, 2, 7, 12, 2, 2, (x) => (x === 10 || x === 21 ? 0xc8a070 : 0x6a4a2a));
  g.box(12, 4, 8, 8, 2, 2, (x) => (x === 12 || x === 19 ? 0xc8a070 : 0x5a3a20));
  // mantel trinkets
  g.box(4, 29, 9, 1, 4, 1, 0xf0e8d0); g.box(27, 29, 9, 1, 4, 1, 0xf0e8d0);
  g.box(13, 29, 8, 6, 5, 3, 0xb8603a); g.box(14, 34, 8, 4, 2, 3, 0x5aa84a); g.set(16, 36, 9, 0x6ac85a);
  grp.add(M(g));
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const fl = new VoxelGrid(4, 9, 2);
    fl.box(0, 0, 0, 4, 3, 2, 0xff6a1a); fl.box(0, 3, 0, 4, 3, 2, 0xffa030); fl.box(1, 6, 0, 2, 2, 2, 0xffd060); fl.set(1, 8, 0, 0xfff0a0);
    const m = at(GL(fl, [2, 0, 1], false), 32, 16, 11 + i * 3.4, 4, 8 + (i % 2));
    grp.add(m);
    flames.push(m);
  }
  return {
    obj: grp,
    lights: [{ x: 0, y: 0.55, z: 0.1, color: 0xff8a3a, intensity: 10, distance: 7, flicker: 0.38, pool: 2.4, poolZ: 0.9, poolOpacity: 0.45, halo: 1.2, hy: 0.5, hz: 0.25, haloOpacity: 0.45 }],
    update(dt, t) { flames.forEach((m, i) => { m.scale.y = 0.6 + 0.5 * Math.abs(Math.sin(t * (4.5 + i * 1.3) + i * 1.7)); m.scale.x = 0.85 + 0.2 * Math.sin(t * 6 + i * 2); }); },
  };
}

// ---------------------------------------------------------------- seats
function stool(id) {
  const g = fg(id, 9);
  g.cylinderY(8, 8, 5.2, 0, 8, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 8, z + 0.5 - 8);
    if (y === 7) return Math.round(r) % 2 ? 0xd8b080 : 0xb88a58;
    return jit(r > 4.4 ? 0x5a3a22 : 0x7a5030, x, y >> 1, z, 4, 0.12);
  });
  g.box(3, 0, 7, 2, 2, 2, 0x4a2e1a); g.box(11, 0, 9, 2, 2, 2, 0x4a2e1a);
  g.set(10, 8, 8, 0x6ab84a);
  return { obj: M(g), seats: [{ x: 0, z: 0.05, y: 0.32, yaw: 0 }] };
}

function chair(id) {
  const g = fg(id, 24);
  legs(g, 3, 3, 13, 13, 7, WOOD_D);
  g.box(3, 7, 3, 10, 2, 10, wd(WOOD_L, 2));
  g.box(3, 9, 3, 2, 14, 2, WOOD_D); g.box(11, 9, 3, 2, 14, 2, WOOD_D);
  g.box(3, 21, 3, 10, 2, 2, wd(WOOD, 3));
  g.box(3, 16, 3, 10, 2, 2, wd(WOOD, 4));
  for (const x of [6, 9]) g.box(x, 9, 3, 1, 12, 1, WOOD);
  return { obj: M(g), seats: [{ x: 0, z: 0.08, y: 0.42, yaw: 0 }] };
}

function armchair(id) {
  const g = fg(id, 20);
  const moss = (x, y, z) => { const h = hash3(x, y, z, 6); return h < 0.12 ? 0x3a6a2a : h > 0.93 ? 0x8ac86a : jit(0x4a7a3a, x, y, z, 6, 0.1); };
  g.box(1, 2, 2, 14, 6, 13, moss);
  g.box(1, 8, 1, 14, 11, 4, moss);
  g.box(1, 8, 4, 3, 5, 11, moss); g.box(12, 8, 4, 3, 5, 11, moss);
  g.box(4, 8, 5, 8, 2, 9, (x, y, z) => jit(0x6a9a4a, x, y, z, 2, 0.08));
  for (const [x, z] of [[2, 3], [13, 3], [2, 13], [13, 13]]) g.box(x, 0, z, 1, 2, 1, WOOD_D);
  g.set(3, 19, 2, 0xf0e070); g.set(12, 13, 10, 0xf0a0c0); g.set(2, 13, 12, 0xe8e8ff);
  return { obj: M(g), seats: [{ x: 0, z: 0.12, y: 0.42, yaw: 0 }] };
}

function sofa(id) {
  const g = fg(id, 20);
  const root = (x, y, z) => jit(0x6a4a2a, x >> 1, y, z, 4, 0.14);
  g.box(0, 0, 2, 32, 7, 13, root);
  g.box(0, 7, 1, 32, 11, 4, root);
  g.box(0, 7, 4, 3, 6, 11, root); g.box(29, 7, 4, 3, 6, 11, root);
  for (let x = 0; x < 32; x += 5) g.box(x, 17, 1, 2, 2, 2, 0x7a5a3a);
  const cush = (x, y, z) => jit((x % 13 === 0 ? 0x8a4a2a : 0xa85a3a), x, y, z, 2, 0.06);
  g.box(3, 7, 5, 13, 3, 9, cush); g.box(16, 7, 5, 13, 3, 9, cush);
  g.box(4, 10, 3, 11, 6, 2, cush); g.box(17, 10, 3, 11, 6, 2, cush);
  g.set(1, 14, 2, 0x5aa84a); g.set(30, 12, 3, 0x5aa84a); g.set(31, 13, 3, 0x6ab84a);
  return { obj: M(g), seats: [{ x: -0.42, z: 0.1, y: 0.45, yaw: 0 }, { x: 0.42, z: 0.1, y: 0.45, yaw: 0 }] };
}

// ---------------------------------------------------------------- tables
function tableSmall(id) {
  const g = fg(id, 16);
  g.cylinderY(8, 8, 7.2, 10, 12, (x, y, z) => (y === 11 ? jit(WOOD_L, x >> 1, 0, z >> 1, 2, 0.06) : WOOD));
  g.box(7, 0, 7, 2, 10, 2, WOOD_D);
  g.box(4, 0, 7, 8, 1, 2, WOOD_D); g.box(7, 0, 4, 2, 1, 8, WOOD_D);
  // teapot & cup
  g.box(5, 12, 6, 4, 3, 4, 0x5a8ad0); g.box(6, 15, 7, 2, 1, 2, 0x5a8ad0); g.set(9, 13, 7, 0x5a8ad0); g.set(4, 14, 8, 0x5a8ad0);
  g.box(10, 12, 9, 2, 2, 2, 0xf6f0e8); g.set(10, 13, 9, 0x8a5a3a);
  return { obj: M(g) };
}

function tableLong(id) {
  const g = fg(id, 18);
  g.box(0, 10, 1, 32, 2, 14, wd(WOOD_L, 2));
  for (let x = 0; x < 32; x += 6) g.box(x, 11, 1, 1, 1, 14, shade(WOOD_L, 0.85));
  legs(g, 2, 2, 30, 14, 10, WOOD_D);
  g.box(2, 4, 7, 28, 1, 2, WOOD_D);
  // plates, bread, candle
  for (const x of [5, 23]) { g.box(x, 12, 6, 4, 1, 4, 0xf0ece4); g.set(x + 1, 13, 7, 0xc8743a); }
  g.box(12, 12, 6, 6, 2, 4, (x, y) => (y === 13 ? 0xe0a050 : 0xc8843a));
  g.box(19, 12, 9, 1, 3, 1, 0xf0e8d0);
  const grp = new THREE.Group();
  grp.add(M(g));
  const fl = new VoxelGrid(1, 2, 1);
  fl.set(0, 0, 0, 0xffb040); fl.set(0, 1, 0, 0xfff0a0);
  const fm = at(GL(fl, [0.5, 0, 0.5], false), 32, 16, 19.5, 15, 9.5);
  grp.add(fm);
  return {
    obj: grp,
    lights: [{ x: 0.22, y: 1.0, z: 0.1, color: 0xffc070, intensity: 0, real: false, halo: 0.35, hx: 0.22, hy: 1.0, hz: 0.1, haloOpacity: 0.5, flicker: 0.3 }],
    update(dt, t) { fm.scale.y = 0.8 + 0.25 * Math.sin(t * 10) * Math.sin(t * 3.7); },
  };
}

// ---------------------------------------------------------------- rugs
function rug(id) {
  const f = FURNITURE[id];
  const g = fg(id, 1);
  const c = f.icon?.c ?? 0xc9583a;
  if (id === 'rug_round') {
    g.box(0, 0, 0, 16, 1, 16, (x, y, z) => {
      const r = Math.hypot(x + 0.5 - 8, (z + 0.5 - 8));
      if (r > 7.6) return -1;
      const band = Math.floor(r / 1.5);
      return jit(band % 2 ? c : band === 2 ? 0xe8d8b0 : mixHex(c, 0xf0c060, 0.35), x, 0, z, 3, 0.05);
    });
  } else if (id === 'rug_long') {
    g.box(1, 0, 2, 30, 1, 12, (x, y, z) => {
      if (z === 2 || z === 13) return 0xe8d8b0;
      if (z === 4 || z === 11) return 0xe0b040;
      return jit((x >> 2) % 2 ? c : shade(c, 0.85), x, 0, z, 4, 0.05);
    });
    for (let z = 3; z < 13; z += 2) { g.set(0, 0, z, 0xe8d8b0); g.set(31, 0, z, 0xe8d8b0); }
  } else {
    g.box(1, 0, 1, 30, 1, 30, (x, y, z) => {
      const ex = Math.min(x - 1, 30 - x), ez = Math.min(z - 1, 30 - z);
      const e = Math.min(ex, ez);
      if (e === 0 || e === 3) return 0xe0b040;
      if (e < 3) return 0x5a1a6a;
      const d = Math.abs(x - 15.5) + Math.abs(z - 15.5);
      if (Math.round(d) % 6 === 0) return 0xe0b040;
      return jit(Math.round(d) % 6 < 3 ? c : shade(c, 0.8), x, 0, z, 6, 0.04);
    });
    for (const [x, z] of [[0, 0], [31, 0], [0, 31], [31, 31]]) g.set(x, 0, z, 0xffd34a);
  }
  const m = M(g);
  m.renderOrder = 1;
  return { obj: m, flat: true };
}

// ---------------------------------------------------------------- registry
const BUILDERS = {
  bed_straw: bedStraw, bed_cozy: bedCozy, bed_royal: bedRoyal,
  forge, stove, coop, planter, index_desk: desk,
  lamp_glowcap: lampGlowcap, lantern_post: lanternPost, beetle_jar: beetleJar, crystal_lamp: crystalLamp, fireplace,
  stool, chair_wood: chair, armchair, sofa, table_small: tableSmall, table_long: tableLong,
  rug_round: rug, rug_long: rug, rug_fancy: rug,
};

/**
 * Build a furniture model. ctx: {eggs, planter, items, weapons, gem}
 * Returns { obj, lights, update, seats, lie, nap, setEggs, setPlant, ... }
 */
export function buildFurniture(id, ctx = {}) {
  const fn = BUILDERS[id];
  let res = fn ? fn(id, ctx) : buildDecor(id, ctx);
  if (!res) {
    const g = fg(id, 10);
    g.box(1, 0, 1, g.w - 2, 10, g.d - 2, wd(WOOD));
    res = { obj: M(g) };
  }
  const holder = new THREE.Group();
  holder.add(res.obj);
  res.obj = holder;
  res.lights = res.lights || [];
  return res;
}
