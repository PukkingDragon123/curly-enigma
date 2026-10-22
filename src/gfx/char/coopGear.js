// What's built onto Nugget's coop, and what it's carrying. The parts forged at home and installed
// on the coop (data/coopParts.js) show on the model: shelf brackets and racks on its walls and
// roof, metal bands, shoes, braces and spurs on its legs, a nest box under the round window, an ore
// chute down its side and a lantern under the ridge. Cargo (crates, sacks, lumps of ore) piles up
// on the racks as the shelves fill, so you can see at a glance how loaded she is.
//
//   const gear = new CoopGear(coop);                 // coop: a makeCoop() rig
//   gear.set({ shelves, legs, nest, chute, lamp }, load);   // load: kg / what her legs carry
//   gear.dispose();
// Static voxel meshes parented to the rig's hut and leg groups (they ride the animation).
import * as THREE from 'three';
import { Vox, mix, dk, lt, cached, PY, NY } from './vox.js';
import { voxelMaterial } from '../Voxel.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { COOP_DIMS } from './coop.js';
import { METALS } from '../../data/weapons.js';

const { S, HX, HZ, RIDGE, RZ } = COOP_DIMS;
const WALL_Y0 = 5;
const TIMBER = [0x5e3e24, 0x7a5232, 0x9c7048, 0xb8834c];
const BURLAP = [0x8a6a3a, 0xa8864e, 0xc8a868];
const ROCK = [0x4a4440, 0x6a625a, 0x8a8078];
const metalCol = (m) => METALS[m]?.color ?? 0x8a8f96;
const LEG_METAL = [null, 'copper', 'iron', 'steel', 'mithril'];

// ---------------------------------------------------------------- pieces (cached geometry)
/** A plank shelf on two brackets, sticking out of a wall: length along z, depth along +x. */
function shelfGeo(metal, len = 26, depth = 7) {
  return cached(`cg-shelf|${metal}|${len}|${depth}`, () => {
    const v = new Vox(-1, depth + 1, -6, 2, -len / 2 - 1, len / 2 + 1);
    v.box(0, 0, -len / 2, depth, 2, len / 2, 1, 1);
    const M = metalCol(metal);
    for (const z of [-len / 2 + 3, len / 2 - 3]) v.line(0, -5, z, depth - 1, -0.5, z, M, 0.7);
    v.resolve({ 1: (x, y, z, e) => ((z & 3) === 0 ? TIMBER[0] : e & PY ? TIMBER[3] : TIMBER[(x + z) & 1 ? 1 : 2]) });
    return v.geometry(false);
  });
}
/** A rack: two posts and two shelves (the back of the coop), facing -z. */
function rackGeo(metal, w = 34, h = 26, depth = 7) {
  return cached(`cg-rack|${metal}|${w}|${h}`, () => {
    const v = new Vox(-w / 2 - 1, w / 2 + 1, -1, h + 1, -depth - 1, 1);
    const M = metalCol(metal);
    for (const x of [-w / 2, w / 2 - 1]) v.box(x, 0, -depth, x + 1, h, -depth + 1, M);
    for (const y of [0, Math.round(h / 2)]) { v.box(-w / 2, y, -depth, w / 2, y + 2, 0, 1, 1); v.box(-w / 2, y + 2, -depth, w / 2, y + 3, -depth + 1, M); }
    v.resolve({ 1: (x, y, z, e) => ((x & 3) === 0 ? TIMBER[0] : e & PY ? TIMBER[3] : TIMBER[2]) });
    return v.geometry(false);
  });
}
/** A roof rack: rails on four short posts over the ridge. */
function roofRackGeo(metal) {
  return cached(`cg-roof|${metal}`, () => {
    const v = new Vox(-18, 18, -1, 9, -20, 20);
    const M = metalCol(metal), D = dk(M, 0.3);
    for (const x of [-16, 15]) for (const z of [-18, 17]) v.box(x, 0, z, x + 1, 6, z + 1, D);
    for (const x of [-16, 15]) v.box(x, 6, -18, x + 1, 7, 18, M);
    for (const z of [-18, 17]) v.box(-16, 6, z, 16, 7, z + 1, M);
    v.box(-15, 4, -17, 15, 5, 17, 1, 1);
    v.resolve({ 1: (x, y, z) => ((z & 3) === 0 ? TIMBER[0] : TIMBER[1]) });
    return v.geometry(false);
  });
}
/** Cargo: a crate, a sack or a lump of ore (k picks which, seed varies it). */
function cargoGeo(k, seed) {
  return cached(`cg-cargo|${k}|${seed}`, () => {
    const v = new Vox(-5, 5, 0, 10, -5, 5);
    if (k === 0) {
      v.box(-4, 0, -4, 4, 7, 4, 1, 1);
      v.resolve({ 1: (x, y, z) => (Math.abs(x) === 4 || Math.abs(z) === 4 || y === 0 || y === 6 ? ((Math.abs(x) === 4) + (Math.abs(z) === 4) + (y === 0 || y === 6) >= 2 ? TIMBER[0] : TIMBER[1]) : TIMBER[2]) });
    } else if (k === 1) {
      v.ell(0, 3.4, 0, 3.8, 3.6, 3.4, 1, 1);
      v.ell(0, 7.2, 0, 1.6, 1.2, 1.6, 1, 2);
      v.resolve({ 1: (x, y, z, e) => (e & NY ? BURLAP[0] : ((x + y * 2) % 5 === 0 ? BURLAP[0] : y > 4 ? BURLAP[2] : BURLAP[1])), 2: () => 0x6a3a1a });
    } else {
      const ore = [0xd9773f, 0x9a6450, 0xbfc3c4, 0xf2c23a, 0x7bf08a][seed % 5];
      v.ell(0, 2.6, 0, 3.6, 2.8, 3.2, 1, 1);
      v.ell(1.5, 4.2, -0.5, 2, 1.8, 2, 1, 1);
      v.resolve({ 1: (x, y, z) => (((x * 7 + y * 13 + z * 5 + seed) % 6) === 0 ? ore : ROCK[(x + y + z) & 1 ? 1 : 2]) });
    }
    return v.geometry(false);
  });
}
/** A band round the shin (r ≈ the shin's radius there). */
function bandGeo(metal, r) {
  return cached(`cg-band|${metal}|${r}`, () => {
    const R = Math.ceil(r + 1.5);
    const v = new Vox(-R, R, -1, 2, -R, R);
    const M = metalCol(metal);
    v.fill(-R, R, -1, 2, -R, R, (x, y, z) => { const d = Math.hypot(x + 0.5, z + 0.5); return d >= r && d < r + 1.3; }, 1, 1);
    v.resolve({ 1: (x, y) => (y === 1 ? lt(M, 0.3) : y === -1 ? dk(M, 0.3) : M) });
    return v.geometry(false);
  });
}
/** A brace: a rod down the front of the shin with a hinge at the hock. */
function braceGeo(metal) {
  return cached(`cg-brace|${metal}`, () => {
    const v = new Vox(-3, 3, -S - 1, 2, 2, 8);
    const M = metalCol(metal);
    v.line(0, 0, 4.2, 0, -S + 2, 4, M, 0.8);
    v.ell(0, 0, 4.5, 1.6, 1.6, 1.6, dk(M, 0.25));
    v.ell(0, -S + 2, 4.2, 1.3, 1.3, 1.3, dk(M, 0.25));
    return v.geometry(false);
  });
}
/** A shoe plate under the toes, and spurs (mithril) at the back. */
function shoeGeo(metal, spur) {
  return cached(`cg-shoe|${metal}|${spur}`, () => {
    const v = new Vox(-9, 9, -4, 2, -9, 16);
    const M = metalCol(metal);
    for (const a of [0, -0.52, 0.52]) {
      const dx = Math.sin(a), dz = Math.cos(a);
      v.line(dx * 2, -1.9, dz * 2, dx * 10, -1.9, dz * 10, M, 0.9);
    }
    if (spur) { v.line(0, -0.5, -2, 0, 0.5, -7.5, lt(M, 0.25), 0.9); v.set(0, 1, -8, 0xeaffff); }
    return v.geometry(false);
  });
}
/** The nest box under the round window (+ a warming pan, + a bell). */
function nestGeo(level) {
  return cached(`cg-nest|${level}`, () => {
    const v = new Vox(-10, 10, -6, 6, -1, 9);
    v.box(-8, 0, 0, 8, 4, 7, 1, 1);
    for (let i = 0; i < 26; i++) { const x = -7 + ((i * 7) % 15), z = 1 + ((i * 3) % 6); v.line(x, 4, z, x + ((i % 3) - 1) * 2, 5 + (i % 2), z + 1, 3, 0.5, 3); }
    if (level >= 2) v.box(-6, -2, 1, 6, 0, 6, metalCol('bronze'));
    if (level >= 3) { v.line(7, 0, 6, 7, -3, 6, 0x6a625c, 0.5); v.ell(7, -4.5, 6, 1.6, 1.6, 1.6, metalCol('silver')); }
    v.resolve({ 1: (x, y, z) => ((x & 3) === 0 ? TIMBER[0] : y === 3 ? TIMBER[3] : TIMBER[1]), 3: (x, y) => [0xe8c860, 0xd0a840, 0xf6dc80][(((x + y) % 3) + 3) % 3] });
    return v.geometry(false);
  });
}
/** The ore chute: a funnel by the ridge and a pipe down the left wall to the shelf. */
function chuteGeo() {
  return cached('cg-chute', () => {
    const v = new Vox(-8, 8, -44, 12, -8, 8);
    const M = metalCol('copper');
    for (let y = 0; y < 9; y++) { const r = 2.2 + y * 0.6; v.fill(-8, 8, y, y + 1, -8, 8, (x, yy, z) => { const d = Math.hypot(x + 0.5, z + 0.5); return d < r && d > r - 1.2; }, M); }
    v.line(0, 0, 0, 0, -42, 0, M, 1.4);
    v.line(0, -42, 0, 0, -43, 4, dk(M, 0.2), 1.2);
    for (const y of [-10, -24, -36]) v.ell(0, y, 0, 2.2, 0.8, 2.2, dk(M, 0.3));
    return v.geometry(false);
  });
}
/** The roof lantern: a little cage on a hook (the flame is a separate unlit mesh). */
function lanternGeo(level) {
  return cached(`cg-lamp|${level}`, () => {
    const v = new Vox(-4, 4, -12, 2, -4, 4);
    const M = level >= 2 ? metalCol('iron') : metalCol('tin');
    v.line(0, 1, 0, 0, -3, 0, 0x3a3634, 0.5);
    v.box(-3, -11, -3, 3, -10, 3, M); v.box(-3, -5, -3, 3, -4, 3, M);
    for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) v.box(x, -10, z, x + 1, -5, z + 1, dk(M, 0.25));
    v.box(-1, -4, -1, 1, -3, 1, dk(M, 0.3));
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- the gear on a coop
export class CoopGear {
  constructor(rig, kind = 'toon') {
    this.rig = rig;
    this.mat = voxelMaterial(kind);
    this.glowMats = {};
    this.meshes = [];
    this.key = '';
  }

  add(parent, geo, x, y, z, ry = 0, mat = this.mat) {
    const m = new THREE.Mesh(geo, mat);
    const vs = this.rig.vs;
    m.scale.setScalar(vs);
    m.position.set(x * vs, y * vs, z * vs);
    m.rotation.y = ry;
    if (mat === this.mat) m.layers.enable(LAYER_OUTLINE);
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  clear() {
    for (const m of this.meshes) { m.parent?.remove(m); for (const c of m.children) if (c.userData.own) c.geometry.dispose(); }
    this.meshes.length = 0;
  }

  /** Dress the coop: lv = { shelves, legs, nest, chute, lamp }, load = kg / what her legs carry. */
  set(lv, load = 0) {
    const cargo = Math.max(0, Math.min(8, Math.round(load * 6)));
    const key = `${lv.shelves}|${lv.legs}|${lv.nest}|${lv.chute}|${lv.lamp}|${cargo}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const hut = this.rig.hut;
    // racks and the spots where cargo sits on them
    const spots = [];
    const shelfY = 16;
    if (lv.shelves >= 1) { this.add(hut, shelfGeo(lv.shelves >= 2 ? 'bronze' : 'copper'), HX + 1, shelfY, 0); spots.push([HX + 5, shelfY + 2, -6], [HX + 5, shelfY + 2, 6]); }
    if (lv.shelves >= 2) { this.add(hut, shelfGeo('bronze'), -HX - 1, shelfY, 0, Math.PI); spots.push([-HX - 5, shelfY + 2, 6], [-HX - 5, shelfY + 2, -6]); }
    if (lv.shelves >= 3) { this.add(hut, rackGeo(lv.shelves >= 4 ? 'steel' : 'iron'), 0, WALL_Y0 + 4, -HZ - 1); spots.push([-9, WALL_Y0 + 6, -HZ - 5], [9, WALL_Y0 + 6, -HZ - 5], [0, WALL_Y0 + 19, -HZ - 5]); }
    if (lv.shelves >= 4) { this.add(hut, roofRackGeo('steel'), 0, RIDGE + 1, 0); spots.push([-8, RIDGE + 6, -8], [8, RIDGE + 6, 6], [0, RIDGE + 6, -2]); }
    if (!spots.length) spots.push([HX + 3, WALL_Y0 + 8, 8], [-HX - 3, WALL_Y0 + 8, -8]); // sacks lashed to the walls
    for (let i = 0; i < Math.min(cargo, spots.length); i++) {
      const [x, y, z] = spots[i];
      this.add(hut, cargoGeo(i % 3, i), x, y, z, (i * 0.7) % 1.2 - 0.6);
    }
    // legs: bands (copper on), shoes (iron on), braces (steel on), spurs (mithril)
    if (lv.legs >= 1) {
      const metal = LEG_METAL[lv.legs];
      for (const leg of this.rig.legs) {
        this.add(leg.knee, bandGeo(lv.legs >= 2 ? metal : 'copper', 3.5), 0, -5, 0);
        this.add(leg.knee, bandGeo(lv.legs >= 2 ? metal : 'copper', 3.1), 0, -15, 0);
        if (lv.legs >= 2) this.add(leg.toes, shoeGeo(metal, lv.legs >= 4), 0, 0, 0);
        if (lv.legs >= 3) this.add(leg.knee, braceGeo(metal), 0, 0, 0);
      }
    }
    if (lv.nest >= 1) this.add(hut, nestGeo(lv.nest), 0, 40, HZ + 1);
    if (lv.chute >= 1) this.add(hut, chuteGeo(), -HX + 6, RIDGE - 22, 6);
    if (lv.lamp >= 1) {
      const lamp = this.add(hut, lanternGeo(lv.lamp), 0, RIDGE + 1, RZ - 2);
      const col = lv.lamp >= 2 ? 0x8cff9a : 0xffd27a;
      const gm = this.glowMats[col] || (this.glowMats[col] = new THREE.MeshBasicMaterial({ color: col }));
      const flame = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), gm);
      flame.position.set(0, -7.5, 0);
      flame.userData.own = true;
      lamp.add(flame);
    }
  }

  dispose() { this.clear(); for (const m of Object.values(this.glowMats)) m.dispose(); }
}
