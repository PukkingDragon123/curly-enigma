// What a raptor will eat out of your paw, and the food itself once it's tossed: a little voxel
// steak, fish, grub or worm that arcs out of the paw, bounces on the rock and lies there until the
// raptor noses it and eats it, bite by bite.
//
//   RAPTOR_FOOD[id] = { trust, look }   trust: what a meal adds (0..100 scale); look: the model
//   bestFood(state) → item id | null     the best liked food in the backpack
//   class Tossed                         one piece of food in flight / on the floor
import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { VB, mul } from '../enemies/vox.js';
import { solidAt } from '../enemies/physics.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { rand } from '../../core/util.js';

/** Raptors are hunters: meat first, then fish, then grubs and worms. No plants, ever. */
export const RAPTOR_FOOD = {
  dino_meat: { trust: 40, look: 'steak', fav: true },
  drake_meat: { trust: 34, look: 'drake' },
  drake_jerky: { trust: 30, look: 'jerky' },
  blind_fish: { trust: 28, look: 'fish' },
  frost_shrimp: { trust: 28, look: 'shrimp' },
  fried_fish: { trust: 26, look: 'fried' },
  salted_fish: { trust: 24, look: 'fish' },
  fried_grubs: { trust: 24, look: 'friedgrub' },
  grub: { trust: 20, look: 'grub' },
  worm: { trust: 16, look: 'worm' },
};

/** The best food for a raptor in the backpack (the one it likes most), or null. */
export function bestFood(state) {
  let best = null, bt = -1;
  for (const [id, f] of Object.entries(RAPTOR_FOOD)) {
    if (!ITEMS[id] || !(state?.count?.(id) > 0)) continue;
    if (f.trust > bt) { bt = f.trust; best = id; }
  }
  return best;
}

// ------------------------------------------------------------------ models (1/48 m voxels)
const FV = 1 / 48;
const MODELS = {
  steak: () => meat([0xa02a24, 0xc8463a, 0xe06a52], 0xf4d8c8),
  drake: () => meat([0x5a1a14, 0x7a2a20, 0x9a4232], 0xd8a890),
  jerky: () => {
    const v = new VB(61), C = [0x4a1a10, 0x6a2a1a, 0x8a3a24];
    for (let s = 0; s < 3; s++) v.box(-5 + s, s, -1 + s * 2 - 2, 5 - s, s, 0 + s * 2 - 2, (x, y, z) => C[(Math.abs(x * 3 + z) + s) % 3]);
    v.box(-1, 0, -3, 0, 2, 3, 0xc8b070); // the twine
    return v;
  },
  fish: () => fish([0xb8b0b0, 0xe0dada, 0xf4f0f0], 0xd8c0c0),
  fried: () => fish([0xa86a20, 0xd09a3a, 0xf0c060], 0x8a5418),
  shrimp: () => {
    const v = new VB(62), C = [0xd85a3a, 0xff8a6a, 0xffc0a8];
    for (let i = 0; i < 7; i++) { const a = i * 0.42, x = Math.round(Math.cos(a) * 4), z = Math.round(Math.sin(a) * 4); v.ell(x, 1, z, 1.6 - i * 0.12, 1.4 - i * 0.1, 1.6 - i * 0.12, (xx, yy, zz, nx, ny) => C[ny > 0.4 ? 2 : (i % 2)]); }
    v.set(4, 2, -1, 0x201010);
    return v;
  },
  grub: () => grub([0xd8c8a0, 0xf0e4c4, 0xfff6e0]),
  friedgrub: () => grub([0xb07a2a, 0xd8a040, 0xf8d070]),
  worm: () => {
    const v = new VB(63), C = [0xc06a72, 0xe0909a, 0xf4b8c0];
    for (let i = 0; i < 10; i++) { const a = i * 0.55, x = Math.round(Math.cos(a) * (2 + i * 0.35)), z = Math.round(Math.sin(a) * (2 + i * 0.35)); v.ell(x, 1, z, 1.2, 1.2, 1.2, (xx, yy, zz, nx, ny) => C[ny > 0.4 ? 2 : i % 2]); }
    return v;
  },
};
function meat(C, fat) {
  // a thick marbled cut with a bone through it
  const v = new VB(64);
  v.ell(0, 1.5, 0, 6, 2.2, 4.4, (x, y, z, nx, ny) => {
    const n = v.n(x, y, z);
    if (n > 0.86) return fat; // marbling
    return ny > 0.45 ? C[2] : ny < -0.3 ? C[0] : C[1];
  });
  v.cap(-8, 1.5, 0, 4, 1.5, 0, 0.9, 0xf0e4cc);
  v.ell(-8, 1.5, 0, 1.5, 1.4, 1.6, 0xfaf2e0);
  return v;
}
function fish(C, fin) {
  const v = new VB(65);
  v.ell(0, 1.4, 0, 6, 1.6, 2.2, (x, y, z, nx, ny) => (ny > 0.5 ? C[2] : ny < -0.4 ? mul(C[0], 0.9) : C[(Math.abs(x) % 3 === 0) ? 0 : 1]));
  for (let i = 0; i < 4; i++) v.box(-7 - i, 1, -1 - i, -7 - i, 2, 1 + i, fin); // the tail fan
  v.set(4, 2, 2, 0x201818); v.set(4, 2, -3, 0x201818);
  return v;
}
function grub(C) {
  const v = new VB(66);
  for (let i = 0; i < 6; i++) { const a = -0.4 + i * 0.6, x = Math.round(Math.cos(a) * 3), z = Math.round(Math.sin(a) * 3); v.ell(x, 1.5, z, 1.9 - i * 0.15, 1.7 - i * 0.1, 1.9 - i * 0.15, (xx, yy, zz, nx, ny) => C[ny > 0.45 ? 2 : (i % 2)]); }
  v.set(3, 2, -1, 0x4a3020);
  return v;
}

const _v = new THREE.Vector3();

/** A piece of food in flight, then on the floor (meters). */
export class Tossed {
  constructor(mgr, id, from, to, T = 0.55) {
    this.mgr = mgr;
    this.id = id;
    const look = RAPTOR_FOOD[id]?.look || 'steak';
    const geo = mgr.geo('tamefood|' + look, () => (MODELS[look] || MODELS.steak)().geo(0, 0, 0, FV));
    this.mat = mgr.material({});
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.layers.enable(LAYER_OUTLINE);
    this.mesh.position.copy(from);
    this.mesh.rotation.y = Math.random() * 6.28;
    mgr.root.add(this.mesh);
    this.pos = this.mesh.position;
    // an arc that lands at `to` in T s
    this.vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * 9.8 * T, (to.z - from.z) / T);
    this.spin = new THREE.Vector3(rand(-9, 9), rand(-6, 6), rand(-9, 9));
    this.landed = false;
    this.left = 1; // how much is left (bites)
    this.t = 0;
    this.gone = false;
  }
  update(dt) {
    this.t += dt;
    const p = this.pos, v = this.vel, w = this.mgr.world;
    if (!this.landed) {
      v.y -= 9.8 * dt;
      const nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;
      if (solidAt(w, nx, p.y, p.z)) v.x *= -0.3; else p.x = nx;
      if (solidAt(w, p.x, p.y, nz)) v.z *= -0.3; else p.z = nz;
      if (solidAt(w, p.x, ny - 0.02, p.z)) {
        if (v.y < -1.6) { v.y = -v.y * 0.3; v.x *= 0.5; v.z *= 0.5; this.mgr.sound('splat', { vol: 0.25 }, this.dist()); this.mgr.fx.dust(p.x, p.y, p.z, 2, this.mgr.dustCol(p), 0.04); }
        else { this.landed = true; v.set(0, 0, 0); p.y = (Math.floor((ny - 0.02) * 16) + 1) / 16 + FV; this.mesh.rotation.x = 0; this.mesh.rotation.z = 0; }
      } else p.y = ny;
      if (!this.landed) { this.mesh.rotation.x += this.spin.x * dt; this.mesh.rotation.y += this.spin.y * dt; this.mesh.rotation.z += this.spin.z * dt; }
      if (this.t > 4 && !this.landed) this.landed = true;
    }
    const s = Math.max(0.05, this.left);
    this.mesh.scale.set(s, Math.max(0.3, s), s);
  }
  dist() { return this.pos.distanceTo(this.mgr.eye); }
  /** A bite (k of the whole): crumbs fly. */
  bite(k) {
    this.left = Math.max(0, this.left - k);
    const p = this.pos, c = this.id === 'blind_fish' || this.id === 'salted_fish' ? [0.85, 0.82, 0.8] : this.id === 'grub' || this.id === 'worm' ? [0.9, 0.8, 0.65] : [0.75, 0.25, 0.2];
    for (let i = 0; i < 3; i++) this.mgr.fx.spawn({ x: p.x + rand(-0.04, 0.04), y: p.y + 0.04, z: p.z + rand(-0.04, 0.04), vx: rand(-0.6, 0.6), vy: rand(0.6, 1.4), vz: rand(-0.6, 0.6), life: rand(0.4, 0.7), size: rand(0.008, 0.014), color: c, drag: 0.6, grav: 9, bounce: 0.3, fade: false });
    if (this.left <= 0) this.dispose();
  }
  /** Where its middle is (world). */
  center(out = _v) { return out.set(this.pos.x, this.pos.y + 0.03, this.pos.z); }
  dispose() {
    if (this.gone) return;
    this.gone = true;
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}
