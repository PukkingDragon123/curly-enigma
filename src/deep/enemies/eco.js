// The ecosystem around the mole (kept cheap: only what is near it, with caps):
//
//   carcasses  a flesh creature that dies keeps its body: it keels over where it fell, scavengers
//              and hungry hunters come and eat it (it darkens and sinks as the meat goes), then a
//              heap of bones is left that crumbles away. The mole can harvest a fresh one once (E):
//              meat and hide (info.harvest).
//   nests      a ring of twigs, bones or silk with eggs (raptors, shellbacks, drakes, spiders),
//              guarded by its makers. Eggs wobble; take one with E (the guards won't like it).
//   food       grazers look for moss, mycelium, glowcaps, vines and cave plants (Props) nearby.
//   prey       hunters look for smaller flesh creatures (and critters for the small hunters).
//   noise      Enemies.noise(x, y, z, r, kind): running, digging, fights, roars, blasts. Every Beast
//              in range hears it (sleepers may wake, hostiles come and look, the timid run).
import * as THREE from 'three';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { sparkle, puff, pebbles } from './fx.js';
import { M } from '../materials.js';
import { ITEMS } from '../../data/items.js';
import { clamp, rand } from '../../core/util.js';
import { groundAt } from './rig.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';

const FOOD = new Set([M.MOSS, M.MYCEL, M.GLOWCAP, M.VINES, M.ROOTS]);
const GRAZE_PLANTS = new Set(['glowcap', 'cave_carrot', 'blindfern', 'ashfern', 'pepperroot', 'gloomshroom', 'crystal_lily', 'frostbloom', 'core_lotus', 'bubblebulb', 'emberbloom']);
const MAX_CARCASSES = 5;
const _v = new THREE.Vector3(), _q = new THREE.Vector3();
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ models
/** A heap of bones (ribs, a skull, long bones), r voxels across. */
export function buildBones(r = 8, seed = 3) {
  const v = new VB(seed);
  const B = [0xe8dcc0, 0xd4c4a0, 0xb8a47e, 0x8a7a5a];
  const bone = (x0, y0, z0, x1, y1, z1, rad = 0.9) => v.cap(x0, y0, z0, x1, y1, z1, rad, (x, y, z, t) => (t < 0.08 || t > 0.92 ? B[0] : v.n(x, y, z) < 0.3 ? B[2] : B[1]));
  // spine and ribs arching up from it
  bone(-r * 0.9, 1, 0, r * 0.9, 1.5, 0.5, 1.1);
  for (let i = -3; i <= 3; i++) {
    const x = i * r * 0.22;
    for (const sd of [1, -1]) {
      let px = x, py = 1.5, pz = 0;
      for (let k = 1; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 0.85;
        const nx = x + Math.sin(i) * 0.3, ny = 1.5 + Math.sin(a) * r * 0.55, nz = sd * (1 - Math.cos(a)) * r * 0.32;
        bone(px, py, pz, nx, ny, nz, 0.6);
        px = nx; py = ny; pz = nz;
      }
    }
  }
  // skull
  const sx = r * 1.15;
  v.ell(sx, 2.4, 0, 2.6, 2.2, 2.3, (x, y, z, nx, ny) => (ny > 0.4 ? B[0] : B[1]));
  v.ell(sx + 2.4, 1.6, 0, 1.6, 1.2, 1.5, B[1]);
  for (const sd of [1, -1]) { v.set(Math.round(sx + 1), 3, sd * 2, 0x2a2018); v.set(Math.round(sx + 1), 2, sd * 2, 0x3a2e22); }
  for (let i = 0; i < 4; i++) v.set(Math.round(sx + 2 + i * 0.6), 0, i % 2 ? 1 : -1, 0xfff4dc);
  // a couple of scattered long bones
  bone(-r * 0.3, 0.6, r * 0.6, r * 0.5, 0.6, r * 0.9, 0.8);
  bone(-r, 0.6, -r * 0.5, -r * 0.2, 0.7, -r * 0.8, 0.8);
  return v;
}

/** A nest: a ring of twigs / bones / silk. style: 'twigs' | 'silk' | 'hoard'. r in voxels. */
function buildNest(style, r, seed) {
  const v = new VB(seed);
  const T = style === 'silk' ? [0xc8d4dc, 0xe8f0f4, 0xa4b0b8, 0xffffff] : style === 'hoard' ? [0x4a3a2a, 0x6a523a, 0x2e241a, 0x8a6a48] : [0x5a3e22, 0x7a5630, 0x3e2a16, 0x9a7044];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU + v.n(i, 0, 0) * 0.4, a2 = a + rand(0.5, 1.1);
    const rr = r * (0.8 + v.n(i, 1, 0) * 0.35), h = 1 + v.n(i, 2, 0) * 2.2;
    v.cap(Math.cos(a) * rr, h, Math.sin(a) * rr, Math.cos(a2) * rr * 0.92, h + rand(-1, 1.2), Math.sin(a2) * rr * 0.92, 0.6, T[i % 4]);
  }
  // soft lining
  v.ell(0, 0.6, 0, r * 0.8, 1.2, r * 0.8, (x, y, z) => (style === 'silk' ? T[1] : v.n(x, y, z, 3) < 0.5 ? 0x8a7a52 : 0x6e5e3c));
  if (style === 'hoard') {
    // glints of gold and gems in the bed
    for (let i = 0; i < 26; i++) { const a = v.n(i, 5, 0) * TAU, d = v.n(i, 6, 0) * r * 0.75; v.set(Math.round(Math.cos(a) * d), 2, Math.round(Math.sin(a) * d), i % 5 === 0 ? 0xff5a6a : i % 3 === 0 ? 0xfff0a0 : 0xf2c23a); }
  }
  if (style === 'twigs') {
    // fern fronds and a few feathers
    for (let i = 0; i < 6; i++) { const a = i * 1.1, d = r * 0.9; for (let k = 0; k < 4; k++) v.set(Math.round(Math.cos(a) * (d + k)), 2 + (k > 2 ? 1 : 0), Math.round(Math.sin(a) * (d + k)), k % 2 ? 0x5a8a3a : 0x4a7a2a); }
  }
  return v;
}

/** One egg: speckled, color ramp [dark, base, light], r voxels. */
export function buildEgg(cols, r = 3, seed = 9) {
  const v = new VB(seed);
  v.ell(0, r * 1.25, 0, r, r * 1.3, r, (x, y, z, nx, ny) => {
    const k = v.n(x, y, z);
    if (k > 0.86) return cols[0];
    return ny > 0.45 ? cols[2] : ny < -0.4 ? mul(cols[1], 0.85) : cols[1];
  });
  return v;
}

// ------------------------------------------------------------------ carcass
class Carcass {
  constructor(eco, e) {
    this.eco = eco;
    const m = eco.mgr;
    this.kind = e.kind; this.name = e.info.name;
    this.harvest = e.info.harvest || [];
    this.pos = e.pos.clone();
    this.r = Math.max(0.25, e.hitR * e.size);
    this.size = e.size * (e.hitR / 0.3);
    this.meat = 1;
    this.t = 0;
    this.harvested = false;
    this.gone = false;
    this.root = e.root;
    this.mats = e.mats;
    e.root = new THREE.Group(); // the creature lets go of its body
    e.mats = [];
    this.y0 = this.root.position.y;
    this.roll = (Math.random() < 0.5 ? 1 : -1);
    this.fallT = 0;
    this.lie = e.info.lie ?? 1; // how far it keels over (1 = onto its side)
    this.dark = new THREE.Color(0.12, 0.06, 0.05);
    this.center = new THREE.Vector3(this.pos.x, this.pos.y + this.r * 0.5, this.pos.z);
    for (const mm of this.mats) {
      const u = mm.uniforms;
      if (u.rim) u.rim.value = 0;
      if (u.emissive) u.emissive.value = Math.min(u.emissive.value, 0.05);
    }
    this.bones = null;
    this.eatT = 0;
    m.root.add(this.root);
  }
  update(dt) {
    this.t += dt;
    const m = this.eco.mgr;
    if (this.fallT < 1) {
      // keel over with a bump
      this.fallT = Math.min(1, this.fallT + dt / 0.5);
      const k = this.fallT < 0.75 ? Math.pow(this.fallT / 0.75, 2) : 1 - Math.sin((this.fallT - 0.75) / 0.25 * Math.PI) * 0.08;
      this.root.rotation.z = this.roll * (Math.PI / 2) * k * this.lie;
      if (this.fallT >= 1) { m.fx.dust(this.pos.x, this.pos.y + 0.05, this.pos.z, 6, m.dustCol(this.pos), this.r * 0.6); m.sound('thud', { vol: clamp(this.size * 0.4, 0.2, 1) }, Math.hypot(this.pos.x - m.pc.x, this.pos.z - m.pc.z)); }
    }
    // eaten: darker, lower, smaller
    const eaten = 1 - this.meat;
    for (const mm of this.mats) {
      const u = mm.uniforms;
      if (u.flash) { u.flash.value = 0.15 + eaten * 0.5; if (u.flashCol) u.flashCol.value.copy(this.dark); }
    }
    this.root.position.y = this.y0 - eaten * this.r * 0.9 - Math.max(0, this.t - 120) * 0.02;
    const s = this.root.userData.s0 ?? (this.root.userData.s0 = this.root.scale.x);
    this.root.scale.setScalar(s * (1 - eaten * 0.35));
    if (this.meat <= 0.25 && !this.bones) this.showBones();
    if (this.meat <= 0 && this.root.visible) {
      this.root.visible = false;
      m.chunkRoot?.(this.root, this.center);
    }
    if (this.bones) {
      this.bones.position.y = this.pos.y - Math.max(0, this.t - (this.meat <= 0 ? this.boneT + 25 : 150)) * 0.05;
      if (this.meat <= 0 && this.boneT === undefined) this.boneT = this.t;
    }
    if (this.t > 160 || (this.boneT !== undefined && this.t - this.boneT > 30)) this.dispose();
  }
  showBones() {
    const m = this.eco.mgr;
    const sz = clamp(Math.round(this.r / VS * 0.55), 5, 22);
    const g = m.geo('bones|' + sz, () => buildBones(sz, sz).geo(0, 0, 0));
    this.bones = new THREE.Mesh(g, m.eco.boneMat);
    this.bones.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.bones.rotation.y = Math.random() * TAU;
    this.bones.layers.enable(LAYER_OUTLINE);
    m.root.add(this.bones);
  }
  dispose() {
    if (this.gone) return;
    this.gone = true;
    this.root.removeFromParent();
    for (const mm of this.mats) mm.dispose();
    this.bones?.removeFromParent();
  }
}

// ------------------------------------------------------------------ nest
class Nest {
  constructor(eco, o) {
    const m = eco.mgr;
    this.eco = eco;
    Object.assign(this, { x: o.x, y: o.y, z: o.z, kind: o.kind, r: o.r ?? 0.7, item: o.item, style: o.style || 'twigs' });
    this.root = new THREE.Group();
    this.root.position.set(o.x, o.y, o.z);
    const rv = Math.round(this.r / VS);
    const g = m.geo(`nest|${this.style}|${rv}`, () => buildNest(this.style, rv, 5).geo(0, 0, 0));
    const ring = new THREE.Mesh(g, eco.boneMat);
    ring.layers.enable(LAYER_OUTLINE);
    this.root.add(ring);
    const cols = o.eggCols || [0x6a5a3a, 0xd8c8a0, 0xf4ecd8];
    const er = o.eggR ?? 3;
    const eg = m.geo(`egg|${cols.join(',')}|${er}`, () => buildEgg(cols, er, 9).geo(0, 0, 0));
    this.eggs = [];
    const n = o.eggs ?? 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3), d = n > 1 ? this.r * 0.32 : 0;
      const mesh = new THREE.Mesh(eg, eco.eggMat);
      mesh.layers.enable(LAYER_OUTLINE);
      mesh.position.set(Math.cos(a) * d, 2 * VS, Math.sin(a) * d);
      mesh.rotation.set(rand(-0.25, 0.25), rand(0, TAU), rand(-0.25, 0.25));
      this.root.add(mesh);
      this.eggs.push({ mesh, wob: 0, wobT: rand(2, 8), taken: false, r: er * VS * 1.3 });
    }
    m.root.add(this.root);
    this.gone = false;
    this.guards = [];
  }
  get left() { return this.eggs.filter((e) => !e.taken).length; }
  update(dt) {
    for (const e of this.eggs) {
      if (e.taken) continue;
      e.wobT -= dt;
      if (e.wobT <= 0) { e.wobT = rand(3, 9); e.wob = 1; }
      e.wob = Math.max(0, e.wob - dt * 1.5);
      e.mesh.rotation.z = Math.sin(e.wob * 22) * 0.18 * e.wob;
    }
  }
  /** World position of an egg. */
  eggPos(e, out = _v) { return e.mesh.getWorldPosition(out).add(_q.set(0, e.r, 0)); }
  dispose() { this.gone = true; this.root.removeFromParent(); }
}

// ------------------------------------------------------------------ the ecosystem
export class Eco {
  constructor(mgr) {
    this.mgr = mgr;
    this.carcasses = [];
    this.nests = [];
    this.noises = [];
    this.groups = new Set();
    this.boneMat = mgr.material({});
    this.eggMat = mgr.material({});
    this.stats = { eaten: 0, grazed: 0, kills: 0, hatched: 0 };
  }

  update(dt) {
    for (let i = this.carcasses.length - 1; i >= 0; i--) {
      const c = this.carcasses[i];
      c.update(dt);
      if (c.gone || Math.hypot(c.pos.x - this.mgr.pc.x, c.pos.z - this.mgr.pc.z) > 40) { c.dispose(); this.carcasses.splice(i, 1); }
    }
    for (let i = this.nests.length - 1; i >= 0; i--) {
      const n = this.nests[i];
      if (Math.hypot(n.x - this.mgr.pc.x, n.z - this.mgr.pc.z) > 45) { n.dispose(); this.nests.splice(i, 1); continue; }
      n.update(dt);
    }
    const now = this.mgr.time;
    while (this.noises.length && now - this.noises[0].t > 1) this.noises.shift();
    for (const g of this.groups) { if (!g.alive()) this.groups.delete(g); else g.tick(); }
  }

  // ---------------------------------------------------------------- carcasses
  /** A flesh creature died: its body stays as a carcass. */
  addCarcass(e) {
    while (this.carcasses.length >= MAX_CARCASSES) { const old = this.carcasses.shift(); old.dispose(); }
    const c = new Carcass(this, e);
    this.carcasses.push(c);
    e.carcass = c;
    return c;
  }
  carcassOf(e) { return e.carcass || null; }
  findCarcass(e) {
    let best = null, bd = (e.info.smell ?? 16);
    for (const c of this.carcasses) {
      if (c.gone || c.meat <= 0.02) continue;
      const d = Math.hypot(c.pos.x - e.pos.x, c.pos.z - e.pos.z) + Math.abs(c.pos.y - e.pos.y) * 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  /** A creature eats from a carcass for dt seconds. */
  bite(e, c, dt) {
    const m = this.mgr;
    const k = dt * 0.06 * clamp(e.size * (e.hitR / 0.3), 0.3, 3) / Math.max(0.4, c.size);
    c.meat = Math.max(0, c.meat - k);
    e.fed(dt * 0.12);
    e.eatT = (e.eatT || 0) - dt;
    if (e.eatT <= 0) {
      e.eatT = rand(0.35, 0.6);
      e.sqv -= 2;
      const p = e.headPos(_v);
      if (m.near(e, 14)) {
        for (let i = 0; i < 4; i++) m.fx.spawn({ x: p.x, y: p.y - 0.05, z: p.z, vx: rand(-0.8, 0.8), vy: rand(0.6, 1.6), vz: rand(-0.8, 0.8), life: rand(0.4, 0.8), size: rand(0.014, 0.026), color: i % 2 ? [0.55, 0.12, 0.1] : [0.85, 0.75, 0.6], drag: 0.8, grav: 8, bounce: 0.3, fade: false });
        e.sound(Math.random() < 0.3 ? 'crunch' : 'chomp', { vol: 0.6 });
      }
    }
    if (c.meat <= 0) this.stats.eaten++;
  }
  /** E on a carcass: harvest meat and hide once. */
  harvestAt(eye, dir, reach) {
    const c = this.pick(this.carcasses.filter((q) => !q.gone && !q.harvested && q.meat > 0.3 && q.harvest.length), eye, dir, reach, (q) => q.center, (q) => q.r);
    return c;
  }

  // ---------------------------------------------------------------- nests and eggs
  addNest(o) {
    if (this.nests.length > 6) { const old = this.nests.shift(); old.dispose(); }
    const n = new Nest(this, o);
    this.nests.push(n);
    return n;
  }
  /** The egg under the crosshair: { nest, egg } or null. */
  eggAt(eye, dir, reach) {
    let best = null, bt = reach + 0.25;
    for (const n of this.nests) for (const egg of n.eggs) {
      if (egg.taken) continue;
      const p = n.eggPos(egg);
      const ox = p.x - eye.x, oy = p.y - eye.y, oz = p.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bt) continue;
      const r = egg.r + 0.08;
      if (ox * ox + oy * oy + oz * oz - t * t > r * r) continue;
      bt = t; best = { nest: n, egg };
    }
    return best;
  }
  takeEgg(hit) {
    const { nest, egg } = hit, m = this.mgr;
    egg.taken = true;
    const p = nest.eggPos(egg, new THREE.Vector3());
    egg.mesh.removeFromParent();
    sparkle(m.fx, p.x, p.y, p.z, 8, [1, 0.95, 0.75], 1.2, 1, 0.02, 0.6);
    m.audio?.play('pickup');
    // the parents notice
    for (const c of m.list) if (c.alive && c.nest === nest) { c.lastHitT = m.time; c.lastHitBy = 'player'; if (c.asleep) c.wakeUp?.(true); c.alertGroup?.('player'); }
    m.noise(p.x, p.y, p.z, 8, 'egg');
    return nest.item;
  }

  // ---------------------------------------------------------------- food and prey
  /** Somewhere to graze near e: { x, y, z, col, plant } or null. */
  findFood(e) {
    const m = this.mgr;
    const plants = m.owner?.props?.plants;
    let best = null, bd = 9;
    if (plants) for (const p of plants) {
      if (p.gone || !GRAZE_PLANTS.has(p.item) || p.mount !== 'floor') continue;
      const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z) + Math.abs(p.y - e.pos.y) * 3;
      if (d < bd) { bd = d; best = { x: p.x, y: p.y, z: p.z, col: [0.45, 0.75, 0.4], plant: p.item }; }
    }
    if (best) return best;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * TAU, d = rand(1, 7);
      const f = m.floorAt(e.pos.x + Math.sin(a) * d, e.pos.y + 0.6, e.pos.z + Math.cos(a) * d, 0.5, 2.5, 1.2);
      if (!f) continue;
      if (FOOD.has(f.top)) return { x: f.x, y: f.y, z: f.z, col: f.top === M.MOSS || f.top === M.VINES ? [0.3, 0.7, 0.35] : f.top === M.GLOWCAP ? [0.5, 0.75, 1] : [0.55, 0.45, 0.6] };
      if (k === 7 || (e.info.anyFood && k > 3)) return { x: f.x, y: f.y, z: f.z, col: [0.45, 0.6, 0.3], bare: true };
    }
    return null;
  }
  graze(e, f, dt) {
    const m = this.mgr;
    e.fed(dt * 0.05);
    e.eatT = (e.eatT || 0) - dt;
    if (e.eatT <= 0) {
      e.eatT = rand(0.5, 0.9);
      this.stats.grazed++;
      if (m.near(e, 12)) {
        const p = e.headPos(_v);
        for (let i = 0; i < 3; i++) m.fx.spawn({ x: p.x, y: p.y - 0.04, z: p.z, vx: rand(-0.5, 0.5), vy: rand(0.4, 1), vz: rand(-0.5, 0.5), life: rand(0.4, 0.7), size: rand(0.012, 0.02), color: f.col, drag: 0.8, grav: 7, bounce: 0.3, fade: false });
        if (Math.random() < 0.4) e.sound('chomp', { vol: 0.35 });
      }
    }
  }
  findPrey(e) {
    const m = this.mgr, my = e.info.tier ?? 2;
    let best = null, bd = (e.info.sight ?? 12) * 0.9;
    for (const c of m.list) {
      if (!c.alive || c === e || c.kind === e.kind || c.group === e.group && c.group) continue;
      const t = c.passive ? 0 : c.info.flesh ? (c.info.tier ?? 1) : -1;
      if (t < 0 || t >= my || (t === 0 && my > 2) || c.info.inedible) continue;
      if (e.info.prey && !e.info.prey.includes(c.kind) && !(t === 0 && e.info.prey.includes('critter'))) continue;
      const d = Math.hypot(c.pos.x - e.pos.x, c.pos.z - e.pos.z) + Math.abs(c.pos.y - e.pos.y) * 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Nearest thing along a ray (generic sphere pick). */
  pick(list, eye, dir, reach, at, rad) {
    let best = null, bt = reach + 0.3;
    for (const q of list) {
      const p = at(q), r = rad(q);
      const ox = p.x - eye.x, oy = p.y - eye.y, oz = p.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < -r || t - r > bt) continue;
      if (ox * ox + oy * oy + oz * oz - t * t > r * r) continue;
      bt = t; best = q;
    }
    return best;
  }

  /** A group of creatures (pack, herd, flock, band). */
  addGroup(g) { this.groups.add(g); return g; }

  info() {
    return {
      carcasses: this.carcasses.map((c) => ({ kind: c.kind, meat: +c.meat.toFixed(2), harvested: c.harvested })),
      nests: this.nests.map((n) => ({ kind: n.kind, eggs: n.left, x: +n.x.toFixed(1), y: +n.y.toFixed(1), z: +n.z.toFixed(1) })),
      groups: [...this.groups].map((g) => ({ kind: g.kind, type: g.type, alive: g.alive(), size: g.size, foe: g.foe })),
      noises: this.noises.length, ...this.stats,
    };
  }

  dispose() {
    for (const c of this.carcasses) c.dispose();
    for (const n of this.nests) n.dispose();
    this.carcasses.length = 0; this.nests.length = 0;
    this.boneMat.dispose(); this.eggMat.dispose();
  }
}

export { ITEMS, mix, c01, pebbles, puff, groundAt };
