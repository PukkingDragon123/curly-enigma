// Cozy cave critters (never hostile) living alongside the creatures: earthworms poking out of dirt
// walls, dust bunnies hopping about, glow beetles drifting like lanterns, blind fish and frost
// shrimp in the lakes, plodding gem tortoises, rock crabs, ore slugs, crystal spiders and void
// wisps. Each is caught its own way (creatures.js `catch`): grab / net (E), brush, a tap of the
// pick, or the x-ray beam.
import * as THREE from 'three';
import { Enemy, TAU, smooth, easeBack, wrapA } from './base.js';
import { VB, VS, mix, mul, c01 } from './vox.js';
import { puff, sparkle, mote, pebbles } from './fx.js';
import { fluidAt, solidAt, airBelow } from './physics.js';
import { rockPalette } from './rock.js';
import { M } from '../materials.js';
import { rand, clamp } from '../../core/util.js';

const _z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();

/** Shared critter body: harmless, can't be "killed" by the pick, reacts to pokes. */
export class Critter extends Enemy {
  constructor(mgr, o) {
    super(mgr, o);
    this.passive = true;
    this.hp = this.maxHp = 1e9;
    this.home = this.pos.clone();
    this.target = this.pos.clone();
    this.cool = 0;
    this.scared = 0;
  }
  takeHit(power, dir) {
    if (!this.alive) return;
    this.flash = 1; this.shiver = 0.6; this.sqv -= 6;
    const kb = 1.6 / this.mass;
    this.vel.x += dir.x * kb; this.vel.z += dir.z * kb;
    if (this.info.flying) this.vel.y += dir.y * kb;
    this.onPoke(dir);
  }
  onPoke() { this.scared = 3; this.sound('squeak', { pitch: 1.2 }); }
  canGrab() { return false; }
  /** Wander target around home (flyers keep a height above the floor). */
  newTarget(r, fly = false) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * TAU, d = rand(r * 0.3, r);
      const x = this.home.x + Math.cos(a) * d, z = this.home.z + Math.sin(a) * d, y = this.home.y + (fly ? rand(-0.4, 0.5) : 0);
      if (!solidAt(this.w, x, y + 0.1, z)) { this.target.set(x, y, z); return; }
    }
  }
  /** Walk toward the target (or away from the mole when scared). */
  amble(dt, speed, flee = 2.4) {
    this.cool -= dt;
    this.scared -= dt;
    let tx = this.target.x, tz = this.target.z;
    const run = this.scared > 0 || (this.dist < flee && this.mgr.pl.speed > 2.6);
    if (run) { const [dx, dz] = this.dirToPlayer(); tx = this.pos.x - dx * 2; tz = this.pos.z - dz * 2; }
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (!run && (d < 0.25 || this.st > 6 || this.ev.bumped)) { this.st = 0; this.newTarget(2.5); this.pause = rand(0.5, 3); }
    this.pause = (this.pause || 0) - dt;
    const go = run || (this.pause <= 0 && d > 0.25);
    if (go) {
      const off = this.face(tx, tz, run ? 9 : 4, dt);
      const s = off < 0.8 ? speed * (run ? 2.2 : 1) : 0;
      this.push(Math.sin(this.yaw) * s, Math.cos(this.yaw) * s, 8, dt);
    } else this.push(0, 0, 8, dt);
    return go;
  }
}

// ------------------------------------------------------------------ Earthworm
function buildWorm() {
  const b = new VB(101);
  const L = 12;
  for (let z = 0; z <= L; z++) {
    const band = z === 8 || z === 9;
    const c = band ? 0xd88a86 : z % 3 === 0 ? 0xc87a7a : z % 2 ? 0xe8a8a0 : 0xf2bcb2;
    for (const [x, y] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) if (z < L || (x === 0 && y === 0)) b.set(x, y, z, c);
    if (band) { b.set(-1, 1, z, 0xd88a86); b.set(1, 1, z, 0xd88a86); }
  }
  b.set(-1, 0, L - 1, 0x2a1418); b.set(1, 0, L - 1, 0x2a1418); // beady eyes
  b.set(0, -1, L - 1, 0xb8606a);
  return { body: b.geo(0, 0, 0), len: L + 1 };
}

export class Earthworm extends Critter {
  static info = { id: 'earthworm', name: 'Earthworm', catch: 'grab', drop: 'worm', snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hitR = 0.12; this.cy = 0;
    this.normal = new THREE.Vector3(...(o.normal || [0, 1, 0]));
    const G = this.G = mgr.geo('worm', buildWorm);
    this.mat = this.material({ emissive: 0.08 });
    this.bend = this.group3();
    this.body = this.part(G.body, this.mat, this.bend);
    this.root.quaternion.setFromUnitVectors(_z, this.normal);
    this.k = 0; // how far out of the wall
    this.state = 'hidden';
    this.st = rand(-2, 0);
    this.look = Math.random() * TAU;
  }
  move() {}
  think(dt) {
    const fast = this.dist < 2.2 && this.mgr.pl.speed > 2.8;
    let want = 0;
    switch (this.state) {
      case 'hidden': if (this.st > 2.5 && this.dist > 1.2 && !fast) { this.setState('peek'); this.sound('squish', { vol: 0.2 }); } break;
      case 'peek':
        want = 0.45 + Math.sin(this.t * 0.8) * 0.12 + (this.dist > 3 ? 0.2 : 0);
        if (fast || this.st > rand(5, 9)) this.setState('hide');
        break;
      case 'hide': want = 0; if (this.st > 0.4) this.setState('hidden'); break;
    }
    this.k += (want - this.k) * Math.min(1, dt * (this.state === 'hide' ? 14 : 3));
  }
  onPoke() { this.setState('hide'); this.sound('squeak', { pitch: 1.4 }); }
  canGrab() { return this.k > 0.25; }
  place() {
    const r = this.root, s = easeBack(this.emerge);
    r.position.copy(this.pos);
    this.body.position.z = (this.k * this.G.len * 0.85 - this.G.len) * VS;
    // wiggle and look around at the tip
    this.bend.rotation.set(Math.sin(this.t * 3.1) * 0.25 * this.k, Math.sin(this.t * 2.3 + this.look) * 0.35 * this.k, 0);
    r.scale.setScalar(s);
    this.center.copy(this.normal).multiplyScalar(this.k * this.G.len * 0.6 * VS).add(this.pos);
  }
  updateSpheres() { const s = this.spheres[0]; s.x = this.center.x; s.y = this.center.y; s.z = this.center.z; s.r = this.k > 0.15 ? 0.13 : 0; }
}

// ------------------------------------------------------------------ Dust Bunny
function buildBunny() {
  const b = new VB(111);
  const fur = [0x9a8e7e, 0xb8ab98, 0xd2c6b2, 0xece2d0];
  const sh = (x, y, z, nx, ny, nz) => fur[clamp(Math.floor((0.5 + ny * 0.35 + nz * 0.1 + (b.n(x, y, z) - 0.5) * 0.55) * 4), 0, 3)];
  b.ell(0, 3.4, 0, 3.6, 3.4, 3.4, sh);
  for (const [x, y, z] of [[2.5, 6, -1], [-3, 5, 1], [3.3, 2.5, -2], [-3.2, 2, -1.5], [0, 6.4, 1.5], [0.5, 4, -3.4], [-2, 4.5, -2.8]]) b.ell(x, y, z, 1.3, 1.2, 1.3, sh);
  b.ell(0, 2.4, -3.6, 1.3, 1.3, 1.2, fur[3]); // tail puff
  const front = (x, y) => { for (let z = 6; z > -6; z--) if (b.has(x, y, z)) return z; return 0; };
  b.set(0, 3, front(0, 3) + 1, 0xff9aa8); b.set(-1, 3, front(-1, 3) + 1, 0xff9aa8); // pink nose
  const eyes = new VB();
  for (const x0 of [1, -3]) { eyes.set(x0, 4, 0, 0x1a1210); eyes.set(x0 + 1, 4, 0, 0x1a1210); eyes.set(x0, 5, 0, 0x1a1210); eyes.set(x0 + 1, 5, 0, x0 > 0 ? 0xffffff : 0x1a1210); }
  if (eyes.get(-3, 5, 0) >= 0) eyes.set(-3, 5, 0, 0xffffff);
  const ez = Math.max(front(1, 4), front(-2, 4)) + 1;
  const ear = new VB(112);
  ear.cap(0, 0, 0, 0, 4.5, -0.5, 1, (x, y, z) => (z >= 0 && y > 1 ? 0xffb8c0 : fur[2]));
  return { body: b.geo(0, 0, 0), eyes: eyes.geo(0, 4.5, 0), ez, ear: ear.geo(0, 0, 0), fluff: c01(fur[3]) };
}

export class DustBunny extends Critter {
  static info = { id: 'dust_bunny', name: 'Dust Bunny', catch: 'brush', drop: 'dust_fluff', snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.13; this.h = 0.28; this.cy = 0.15; this.hitR = 0.17;
    this.springK = 300; this.springC = 7;
    const G = this.G = mgr.geo('bunny', buildBunny);
    this.mat = this.material({ emissive: 0.1 });
    this.body = this.part(G.body, this.mat);
    this.eyes = this.part(G.eyes, this.material({ emissive: 0.5 }), this.root, 0, 4.5 * VS, G.ez * VS);
    this.ears = [1, -1].map((sd) => this.part(G.ear, this.mat, this.root, sd * 1.6 * VS, 6 * VS, 0));
    this.hopT = rand(0.5, 2);
    this.brushT = 0;
    this.purr = 0;
  }
  think(dt) {
    this.cool -= dt; this.scared -= dt; this.purr -= dt;
    this.sqT = this.grounded ? 0 : clamp(this.vel.y * 0.06, -0.1, 0.3);
    if (!this.grounded) return;
    this.hopT -= dt;
    if (this.hopT < 0.12) this.sqT = -0.3;
    if (this.hopT > 0) return;
    let dx = rand(-1, 1), dz = rand(-1, 1);
    const run = this.scared > 0 || (this.dist < 2.3 && this.mgr.pl.speed > 2.6);
    if (run) { const d = this.dirToPlayer(); dx = -d[0] + rand(-0.3, 0.3); dz = -d[1] + rand(-0.3, 0.3); }
    else { const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z; if (Math.hypot(hx, hz) > 2.5) { dx = hx; dz = hz; } }
    const l = Math.hypot(dx, dz) || 1, sp = run ? 2.4 : rand(0.6, 1.2);
    this.yaw = Math.atan2(dx, dz);
    this.vel.set(dx / l * sp, run ? 3.6 : rand(2.4, 3.2), dz / l * sp);
    this.sqv += 8;
    this.hopT = this.purr > 0 ? 1.5 : run ? rand(0.15, 0.3) : rand(0.6, 2.2);
  }
  animate() {
    const flop = this.grounded ? 0.15 + Math.sin(this.t * 2) * 0.05 : -0.5 - this.vel.y * 0.08;
    this.ears.forEach((e, i) => { e.rotation.x = -flop; e.rotation.z = (i ? -1 : 1) * (0.25 + (this.purr > 0 ? Math.sin(this.t * 12) * 0.15 : 0)); });
  }
  /** Startled by the pick: it bursts into a cloud of dust. */
  onPoke() {
    const c = this.center;
    puff(this.fx, c.x, c.y, c.z, 16, this.G.fluff.map((k) => k * 0.8), 0.18, 0.4, 0.09, 0.7);
    this.sound('whoosh', { vol: 0.4 });
    this.sound('sneeze', {});
    this.alive = false;
  }
  brush(dt) {
    this.purr = 1.2;
    this.brushT += dt;
    if (Math.random() < dt * 8) this.fx.spawn({ x: this.center.x + rand(-0.1, 0.1), y: this.center.y + 0.15, z: this.center.z + rand(-0.1, 0.1), vy: 0.6, life: 0.8, size: 0.03, color: [1, 0.55, 0.7], glow: true, drag: 1 });
    if (this.brushT > 0.7 && this.cool <= 0) {
      this.brushT = 0; this.cool = 25;
      this.sound('squeak', { pitch: 0.8 });
      sparkle(this.fx, this.center.x, this.center.y + 0.1, this.center.z, 8, [1, 0.6, 0.75], 1.2, -0.5, 0.025, 0.9);
      return this.mgr.gift(this, 'dust_fluff', 'The dust bunny purrs and leaves you some <b>fluff</b>.');
    }
    return [];
  }
}

// ------------------------------------------------------------------ Glow Beetle
function buildBeetle() {
  const b = new VB(121);
  b.ell(0, 0, 0, 2.3, 1.7, 3, (x, y, z, nx, ny) => (Math.abs(x + 0.5) < 0.6 && ny > 0.2 ? 0x1a3a1a : ny > 0.4 ? 0x3a7a3a : 0x2a5a2a));
  b.ell(0, -0.2, 3, 1.4, 1.1, 1.2, 0x1e2a1a); // head
  b.set(-1, 1, 4, 0x1e2a1a); b.set(-2, 2, 5, 0x1e2a1a); b.set(0, 1, 4, 0x1e2a1a); b.set(1, 2, 5, 0x1e2a1a); // antennae
  const glow = new VB(122);
  glow.ell(0, -0.6, -1.8, 1.9, 1.2, 1.7, (x, y) => (y < -1 ? 0xf0ffb0 : 0xc8ff7a));
  const wing = new VB(123);
  wing.box(0, 0, -2, 2, 0, 1, (x, y, z) => (z === 1 || x === 2 ? 0x9ac88a : 0xc8f0b8));
  return { body: b.geo(0, 0, 0), glow: glow.geo(0, 0, 0), wing: wing.geo(0, 0, 0) };
}

export class GlowBeetle extends Critter {
  static info = { id: 'glow_beetle', name: 'Glow Beetle', catch: 'grab', drop: 'glow_beetle', flying: true, snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.08; this.cy = 0; this.hitR = 0.14;
    const G = this.G = mgr.geo('beetle', buildBeetle);
    this.mat = this.material({ emissive: 0.15 });
    this.glowMat = this.material({ emissive: 1.3 });
    this.body = this.part(G.body, this.mat);
    this.glow = this.part(G.glow, this.glowMat);
    this.wings = [1, -1].map((sd) => { const w = this.part(G.wing, this.material({ emissive: 0.4 }), this.root, sd * 0.5 * VS, 1.6 * VS, 0); if (sd < 0) w.scale.x = -1; return w; });
    this.floorT = 0; this.floor = 1;
    this.pulse = Math.random() * TAU;
  }
  think(dt) {
    this.scared -= dt;
    this.floorT -= dt;
    if (this.floorT <= 0) { this.floorT = 0.3; this.floor = airBelow(this.w, this.pos.x, this.pos.y, this.pos.z, 3); }
    if (this.scared > 0) {
      const [dx, dz] = this.dirToPlayer();
      this.steer(this.pos.x - dx * 2, this.pos.y + 0.6, this.pos.z - dz * 2, 2.2, 3, dt);
    } else {
      if (this.pos.distanceTo(this.target) < 0.3 || this.st > 5) { this.st = 0; this.newTarget(2.2, true); }
      const ty = this.target.y + clamp(1.2 - this.floor, -0.5, 0.6);
      this.steer(this.target.x, ty + Math.sin(this.t * 1.7) * 0.1, this.target.z, 0.45, 1.2, dt);
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05) this.yaw += wrapA(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * Math.min(1, dt * 4);
  }
  animate(dt) {
    const f = Math.sin(this.t * 38) * 0.6;
    this.wings[0].rotation.z = 0.5 + f; this.wings[1].rotation.z = -0.5 - f;
    this.root.rotation.x = Math.sin(this.t * 2) * 0.1;
    this.glowMat.uniforms.emissive.value = 1.1 + Math.sin(this.t * 2.4 + this.pulse) * 0.4;
    if (Math.random() < dt * 3) this.fx.firefly(this.pos.x, this.pos.y - 0.04, this.pos.z, [0.75, 1, 0.4]);
  }
  canGrab() { return true; }
  light() { const k = 0.85 + Math.sin(this.t * 2.4 + this.pulse) * 0.25; return { x: this.pos.x, y: this.pos.y, z: this.pos.z, c: [0.45 * k, 0.75 * k, 0.2 * k], r: 2.6 }; }
}

// ------------------------------------------------------------------ Blind Cave Fish / Frost Shrimp
function buildFish() {
  const b = new VB(131);
  b.ell(0, 0, 0, 1.5, 2.2, 3.6, (x, y, z, nx, ny, nz) => (ny < -0.4 ? 0xfff0ec : nz > 0.6 && Math.abs(nx) > 0.5 ? 0xf8b8b8 : ny > 0.5 ? 0xe8c8c8 : 0xf4dcd8));
  b.set(0, 3, -1, 0xe8b8b8); b.set(0, 3, 0, 0xe8b8b8); b.set(0, 2, -2, 0xe8b8b8); // dorsal fin
  b.set(1, 0, 2, 0xd8d0d8); b.set(-2, 0, 2, 0xd8d0d8); // pale blind eyes
  const tail = new VB(132);
  tail.box(0, -2, -3, 0, 1, -1, (x, y, z) => (z === -3 ? 0xf8c8c8 : 0xf0d0d0));
  tail.set(0, -3, -3, 0xf8c8c8); tail.set(0, 2, -3, 0xf8c8c8);
  return { body: b.geo(0, 0, 0), tail: tail.geo(0, 0, -3) };
}
function buildShrimp() {
  const b = new VB(141);
  const C = [0xd85a4a, 0xff8a7a, 0xffb0a0];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.42, r = 1.8 - i * 0.15;
    b.ell(0, Math.sin(a) * -2.4, 3 - Math.cos(a) * 1.5 - i * 1.0, r * 0.9, r, 1.1, (x, y, z, nx, ny) => C[ny > 0.3 ? 2 : i % 2 ? 0 : 1]);
  }
  b.set(1, 1, 4, 0x1a0a0a); b.set(-2, 1, 4, 0x1a0a0a);
  for (let i = 0; i < 6; i++) { b.set(0 + (i > 3 ? 1 : 0), 1 + Math.floor(i * 0.3), 5 + i, C[0]); b.set(-1 - (i > 3 ? 1 : 0), 1 + Math.floor(i * 0.3), 5 + i, C[0]); }
  b.box(-2, -4, -5, 1, -4, -4, C[2]); // tail fan
  const tail = new VB(142); tail.set(0, 0, -1, C[1]);
  return { body: b.geo(0, 0, 0), tail: tail.geo(0, 0, 0) };
}

export class CaveFish extends Critter {
  static info = { id: 'blind_fish', name: 'Blind Cave Fish', catch: 'net', drop: 'blind_fish', flying: true, snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.shrimp = !!o.shrimp;
    if (this.shrimp) this.info = SHRIMP_INFO;
    this.kind = this.info.id;
    this.rad = 0.08; this.cy = 0; this.hitR = 0.15;
    const G = this.G = this.shrimp ? mgr.geo('shrimp', buildShrimp) : mgr.geo('fish', buildFish);
    this.mat = this.material({ emissive: 0.25 });
    this.body = this.part(G.body, this.mat);
    this.tail = this.part(G.tail, this.mat, this.root, 0, 0, -3 * VS);
    this.dartT = 0;
  }
  move(dt) {
    // swim, but only through water
    const p = this.pos, v = this.vel;
    const nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;
    if (fluidAt(this.w, nx, ny, nz) === 1 && !solidAt(this.w, nx, ny, nz)) p.set(nx, ny, nz);
    else { v.multiplyScalar(-0.5); this.st = 99; }
    if (!fluidAt(this.w, p.x, p.y, p.z)) { v.y -= 9 * dt; if (Math.random() < dt * 4) this.sound('squish', { vol: 0.2 }); }
  }
  think(dt) {
    this.scared -= dt;
    if (this.scared > 0 || (this.dist < 1.6 && this.mgr.pl.speed > 2)) {
      const [dx, dz] = this.dirToPlayer();
      this.steer(this.pos.x - dx * 2, this.pos.y, this.pos.z - dz * 2, 2.2, 4, dt);
    } else {
      if (this.pos.distanceTo(this.target) < 0.3 || this.st > 4) {
        this.st = 0;
        for (let k = 0; k < 8; k++) {
          const t = [this.home.x + rand(-2.5, 2.5), this.home.y + rand(-0.6, 0.5), this.home.z + rand(-2.5, 2.5)];
          if (fluidAt(this.w, t[0], t[1], t[2]) === 1 && fluidAt(this.w, t[0], t[1] + 0.12, t[2]) === 1) { this.target.set(...t); break; }
        }
      }
      this.steer(this.target.x, this.target.y, this.target.z, this.shrimp ? 0.8 : 0.55, 1.5, dt);
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05) this.yaw += wrapA(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * Math.min(1, dt * 5);
    if (Math.random() < dt * 0.6) this.fx.spawn({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z, vy: 0.4, life: 1.2, size: 0.016, color: [0.75, 0.9, 1], alpha: 0.7, drag: 0.5 }); // a bubble
  }
  animate() {
    const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    this.tail.rotation.y = Math.sin(this.t * (6 + sp * 10)) * (0.3 + sp * 0.4);
    this.root.rotation.z = Math.sin(this.t * 3) * 0.08;
  }
  canGrab() { return true; }
}
const SHRIMP_INFO = { id: 'frost_shrimp', name: 'Frost Shrimp', catch: 'net', drop: 'frost_shrimp', flying: true, snd: 'flesh' };

// ------------------------------------------------------------------ Gem Tortoise
function buildTortoise(mossy) {
  const b = new VB(151);
  const shell = (x, y, z) => {
    const u = Math.floor((x + 20 + (Math.floor((z + 20) / 3) % 2) * 1.5) / 3), w = Math.floor((z + 20) / 3);
    const seam = (x + 20 + (w % 2) * 1.5) % 3 < 0.6 || (z + 20) % 3 < 0.6;
    return seam ? 0x3e5a32 : (u + w) % 2 ? 0x6a8a5a : 0x7a9a64;
  };
  b.ell(0, 3, 0, 5.6, 3.8, 6.4, (x, y, z) => (y < 2 ? -1 : shell(x, y, z)));
  for (let z = -7; z <= 6; z++) for (let x = -6; x <= 5; x++) { const r = Math.hypot((x + 0.5) / 5.8, (z + 0.5) / 6.6); if (r < 1 && r > 0.7) b.set(x, 2, z, 0x4a6a3a); }
  b.box(-4, 2, -5, 3, 2, 4, 0xc8b888); // belly plate
  for (const [x, z] of [[3, 3], [-4, 3], [3, -4], [-4, -4]]) b.box(x, 0, z, x + 1, 2, z + 1, 0x8a9a6a); // legs
  b.set(0, 2, -7, 0x8a9a6a); // tail
  if (mossy) {
    for (const v of b.list()) if (v.y >= 5 && b.open(v.x, v.y, v.z, 0, 1, 0) && b.n(v.x, v.y, v.z, 4) < 0.75) {
      b.set(v.x, v.y + 1, v.z, b.n(v.x, v.y, v.z, 5) < 0.5 ? 0x3a7a32 : 0x5aa84a);
      if (b.n(v.x, v.y, v.z, 6) < 0.2) b.set(v.x, v.y + 2, v.z, 0x7ac85a);
    }
  } else {
    b.box(-1, 6, -1, 0, 7, 0, 0xe02a3a); b.set(-1, 7, -1, 0xff9aa2); // the gem on its back
  }
  const head = new VB(152);
  head.ell(0, 0, 1.5, 1.9, 1.7, 2.3, 0x8a9a6a);
  head.set(1, 1, 3, 0x1a1a10); head.set(-2, 1, 3, 0x1a1a10); head.set(1, 2, 3, 0x6a7a4a); head.set(-2, 2, 3, 0x6a7a4a); // sleepy eyes
  return { body: b.geo(0, 0, 0), head: head.geo(0, 0, 0) };
}

export class GemTortoise extends Critter {
  static info = { id: 'gem_tortoise', name: 'Gem Tortoise', catch: 'brush', drop: 'ruby', snd: 'stone' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.22; this.h = 0.34; this.cy = 0.17; this.hitR = 0.28;
    this.mass = 3;
    this.mossy = mgr.geo('tortoise|moss', () => buildTortoise(true));
    this.clean = mgr.geo('tortoise|clean', () => buildTortoise(false));
    this.mat = this.material({ emissive: 0.08 });
    this.body = this.part(this.mossy.body, this.mat);
    this.head = this.part(this.mossy.head, this.mat, this.root, 0, 2.6 * VS, 5.4 * VS);
    this.brushT = 0;
    this.hasMoss = true;
    this.hide = 0;
  }
  think(dt) {
    this.hide -= dt;
    if (this.hide > 0) { this.push(0, 0, 10, dt); return; }
    const going = this.amble(dt, 0.18, 1.2);
    this.walking = going;
    this.scared = Math.min(this.scared, 0); // too slow to run anyway
  }
  animate(dt) {
    const out = this.hide > 0 ? 0 : 1;
    this.head.position.z += ((5.4 * out + 1.5) * VS - this.head.position.z) * Math.min(1, dt * 8);
    this.head.rotation.y = Math.sin(this.t * 0.7) * 0.4;
    this.root.rotation.z = this.walking ? Math.sin(this.t * 5) * 0.05 : 0;
  }
  onPoke() { this.hide = 3; this.sound('clunk', { vol: 0.4 }); }
  brush(dt) {
    if (!this.hasMoss) return [];
    this.brushT += dt;
    if (Math.random() < dt * 14) pebbles(this.fx, this.pos.x + rand(-0.15, 0.15), this.pos.y + 0.3, this.pos.z + rand(-0.15, 0.15), 1, [0.3, 0.6, 0.25], 0.05, 0.8);
    if (this.brushT < 1.4) return [];
    this.hasMoss = false;
    this.body.geometry = this.clean.body;
    sparkle(this.fx, this.pos.x, this.pos.y + 0.35, this.pos.z, 10, [1, 0.4, 0.45], 1.6, 1, 0.025, 0.8);
    this.sound('pristine', {});
    return this.mgr.gift(this, 'ruby', 'The tortoise sighs happily. A <b>ruby</b> rolls out of its clean shell!');
  }
}

// ------------------------------------------------------------------ Rock Crab
function buildCrab(pal) {
  const T = pal.tones;
  const make = (shell) => {
    const b = new VB(161);
    const soft = [0xd8785a, 0xf09a78, 0xffbc98];
    b.ell(0, 1.6, 0, 3, 1.5, 2.5, (x, y, z, nx, ny) => soft[ny > 0.3 ? 2 : ny > -0.3 ? 1 : 0]);
    if (shell) b.ell(0, 2.2, -0.3, 4.2, 2.8, 3.8, (x, y, z, nx, ny) => (y < 1 ? -1 : b.n(x, y, z) > 0.93 ? pal.acc : ramp4(T, 0.3 + ny * 0.4 + (b.n(x, y, z, 2) - 0.5) * 0.5)));
    for (const sd of [1, -1]) {
      const X = (x) => (sd > 0 ? x : -1 - x);
      b.set(X(1), 3 + (shell ? 2 : 0), 3, 0xe08a6a); b.set(X(1), 4 + (shell ? 2 : 0), 3, 0x1a1010); // eye stalks
      for (let y = 3; y < 3 + (shell ? 2 : 0); y++) b.set(X(1), y, 3, 0xe08a6a);
      b.box(X(4), 1, 2, X(4), 2, 4, 0xe86a4a); b.set(X(5), 2, 4, 0xe86a4a); b.set(X(5), 2, 5, 0xffb090); // claws
      for (const z of [-1, 0, 1]) b.set(X(3 + (shell ? 1 : 0)), 0, z * 1.5 | 0, 0xc86a4a); // legs
    }
    return b.geo(0, 0, 0);
  };
  return { shell: make(true), naked: make(false), dust: c01(T[1]) };
}
const ramp4 = (T, t) => T[clamp(Math.floor(t * 4), 0, 3)];

export class RockCrab extends Critter {
  static info = { id: 'rock_crab', name: 'Rock Crab', catch: 'hit', drop: 'crab_shell', snd: 'stone' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.15; this.h = 0.24; this.cy = 0.12; this.hitR = 0.2;
    const pal = rockPalette(o.mat ?? M.STONE);
    this.G = mgr.geo('crab|' + pal.key, () => buildCrab(pal));
    this.mat = this.material({ texel: 48 });
    this.body = this.part(this.G.shell, this.mat);
    this.shelled = true;
    this.side = 1;
  }
  think(dt) {
    const near = this.dist < 2.2;
    if (!this.shelled) { this.scared = 9; this.amble(dt, 0.9); this.life = (this.life || 0) + dt; if (this.life > 5) { this.alive = false; puff(this.fx, this.pos.x, this.pos.y, this.pos.z, 5, this.G.dust, 0.1, 0.2, 0.06, 0.6); } return; }
    if (near && this.mgr.pl.speed > 0.5) {
      // scuttle sideways, of course
      const [dx, dz] = this.dirToPlayer();
      this.face(this.pos.x - dz, this.pos.z + dx, 6, dt);
      if (Math.random() < dt * 0.6) this.side = -this.side;
      this.push(dz * this.side * 1.2 - dx * 0.4, -dx * this.side * 1.2 - dz * 0.4, 10, dt);
      this.sqT = Math.sin(this.t * 30) * 0.05;
    } else this.push(0, 0, 10, dt);
  }
  onPoke(dir) {
    if (!this.shelled) { this.sound('squeak', { pitch: 1.5 }); return; }
    this.shelled = false;
    this.body.geometry = this.G.naked;
    this.sound('clunk', {});
    this.sound('squeak', { pitch: 1.5 });
    pebbles(this.fx, this.center.x, this.center.y + 0.1, this.center.z, 6, this.G.dust, 0.1, 1.4);
    this.mgr.gift(this, 'crab_shell', null, true);
  }
}

// ------------------------------------------------------------------ Ore Slug
function buildSlug() {
  const b = new VB(171);
  const g = [0x5a9a6a, 0x7ac090, 0x9ad8a8, 0xc0f0c8];
  b.ell(0, 0.5, 0, 2.2, 2, 4.8, (x, y, z, nx, ny) => (y < 0 ? -1 : b.n(x, y, z) > 0.92 ? (b.n(x, y, z, 3) < 0.5 ? 0xe8e8f0 : 0xe0b050) : g[clamp(Math.floor((0.4 + ny * 0.5) * 4), 0, 3)]));
  for (const x of [1, -2]) { b.set(x, 2, 4, g[2]); b.set(x, 3, 4, g[2]); b.set(x, 4, 5, 0x1a2a1a); }
  return { body: b.geo(0, 0, 0), slime: c01(g[3]) };
}

export class OreSlug extends Critter {
  static info = { id: 'ore_slug', name: 'Ore Slug', catch: 'hit', drop: 'slug_slime', snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.1; this.h = 0.16; this.cy = 0.08; this.hitR = 0.18;
    this.G = mgr.geo('slug', buildSlug);
    this.mat = this.material({ emissive: 0.15 });
    this.body = this.part(this.G.body, this.mat);
  }
  think(dt) {
    const go = this.amble(dt, 0.12, 1);
    this.sqT = go ? Math.sin(this.t * 5) * 0.08 : 0; // inching along
    if (go && Math.random() < dt * 3) this.fx.spawn({ x: this.pos.x, y: this.pos.y + 0.01, z: this.pos.z, life: 2.5, size: 0.025, color: this.G.slime, alpha: 0.5, drag: 1 });
  }
  onPoke() {
    this.scared = 4;
    this.sound('squish', {});
    if (this.cool > 0) return;
    this.cool = 30;
    this.mgr.gift(this, 'slug_slime', null, true);
  }
}

// ------------------------------------------------------------------ Crystal Spider
function buildSpider() {
  const body = new VB(181);
  const C = [0x6a9ac8, 0x9ac8e8, 0xbfe6ff, 0xf0faff];
  body.ell(0, 2.6, -1.8, 2.4, 2, 2.8, (x, y, z, nx, ny, nz) => C[clamp(Math.floor((0.4 + ny * 0.4 + ((((nx > 0) + (nz > 0) * 2) * 0.37) % 1 - 0.5) * 0.5) * 4), 0, 3)]);
  body.ell(0, 2.2, 1.4, 1.6, 1.3, 1.6, C[1]);
  for (const [x, y] of [[0, 3], [-1, 3], [1, 2], [-2, 2]]) body.set(x, y, 3, 0xff6a8a);
  const frames = [0, 1].map((f) => {
    const b = new VB(182);
    for (const sd of [1, -1]) for (let i = 0; i < 4; i++) {
      const z = 1.5 - i * 1.1, lift = (i + f) % 2 ? 1 : 0, X = (x) => sd * x;
      b.cap(X(1.4), 2.2, z, X(4), 3.6 + lift, z + (i - 1.5) * 0.6, 0.5, 0x8ab8d8);
      b.cap(X(4), 3.6 + lift, z + (i - 1.5) * 0.6, X(5.6), 0 + lift * 0.6, z + (i - 1.5) * 1.1, 0.5, 0x6a98b8);
    }
    return b.geo(0, 0, 0);
  });
  return { body: body.geo(0, 0, 0), legs: frames, glit: c01(C[3]) };
}

export class CrystalSpider extends Critter {
  static info = { id: 'crystal_spider', name: 'Crystal Spider', catch: 'hit', drop: 'spider_silk', snd: 'crystal' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.13; this.h = 0.2; this.cy = 0.1; this.hitR = 0.2;
    this.G = mgr.geo('spider', buildSpider);
    this.mat = this.material({ emissive: 0.35 });
    this.body = this.part(this.G.body, this.mat);
    this.legs = this.part(this.G.legs[0], this.mat);
    this.burst = 0;
  }
  think(dt) {
    // skitter in bursts, freeze, skitter
    this.burst -= dt;
    if (this.burst < -rand(0.6, 2)) this.burst = rand(0.3, 0.8);
    const go = this.burst > 0 ? this.amble(dt, 1.1, 1.8) : (this.push(0, 0, 14, dt), false);
    if (go) this.legs.geometry = this.G.legs[Math.floor(this.t * 14) % 2];
  }
  onPoke() {
    this.scared = 4; this.burst = 1.5;
    this.sound('hit', { snd: 'crystal', vol: 0.4 });
    if (this.cool > 0) return;
    this.cool = 40;
    sparkle(this.fx, this.center.x, this.center.y, this.center.z, 6, this.G.glit, 1.2, 1, 0.02, 0.6);
    this.mgr.gift(this, 'spider_silk', null, true);
  }
  light() { return { x: this.pos.x, y: this.pos.y + 0.12, z: this.pos.z, c: [0.25, 0.4, 0.55], r: 1.6 }; }
}

// ------------------------------------------------------------------ Void Wisp
function buildVoidWisp() {
  const b = new VB(191);
  const C = [0x4a1a8a, 0x7a3ac8, 0xb080f0, 0xe8d8ff];
  const sh = (x, y, z, nx, ny, nz) => C[clamp(Math.floor((0.35 + nz * 0.3 + ny * 0.2 + (b.n(x, y, z) - 0.5) * 0.4) * 4), 0, 3)];
  b.ell(0, 0, 0, 3.4, 3.2, 3.2, sh);
  b.ell(0, 3, -0.5, 2.4, 2.2, 2.2, sh);
  b.ell(0.5, 5.2, -1, 1.4, 1.6, 1.4, sh);
  b.set(1, 7, -1, C[3]); b.set(0, 7, -2, C[2]); b.set(-2, 4, 0, C[2]); b.set(2, 5, 0, C[3]);
  const front = (x, y) => { for (let z = 6; z > -6; z--) if (b.has(x, y, z)) return z; return 0; };
  for (const [x, y] of [[1, 0], [2, 0], [1, 1], [2, 1], [-2, 0], [-3, 0], [-2, 1], [-3, 1]]) b.set(x, y, front(x, y), 0x12061e); // hollow eyes
  return { body: b.geo(0, 0, 0), mote: [0.7, 0.45, 1] };
}

export class VoidWisp extends Critter {
  static info = { id: 'void_wisp', name: 'Void Wisp', catch: 'xray', drop: 'wisp_essence', flying: true, snd: 'crystal' };
  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.14; this.cy = 0; this.hitR = 0.17;
    this.G = mgr.geo('voidwisp', buildVoidWisp);
    this.mat = this.material({ emissive: 0.7 });
    this.body = this.part(this.G.body, this.mat);
    this.xrayT = 0;
  }
  move(dt) { this.pos.addScaledVector(this.vel, dt); } // it drifts right through rock
  think(dt) {
    this.xrayT = Math.max(0, this.xrayT - dt * 0.5);
    if (this.pos.distanceTo(this.target) < 0.3 || this.st > 6) { this.st = 0; this.target.set(this.home.x + rand(-3, 3), this.home.y + rand(-0.6, 0.8), this.home.z + rand(-3, 3)); }
    this.steer(this.target.x, this.target.y + Math.sin(this.t) * 0.2, this.target.z, 0.35 * (1 - Math.min(0.8, this.xrayT)), 1, dt);
    this.facePlayer(1, dt);
    if (Math.random() < dt * 10) mote(this.fx, this.pos.x, this.pos.y + 0.1, this.pos.z, this.G.mote, 0.025, 0.9);
    this.mat.uniforms.emissive.value = 0.6 + Math.sin(this.t * 3) * 0.15 + this.xrayT * 0.8;
  }
  onPoke() { this.sound('wisp', {}); this.vel.y += 1; } // the pick goes right through it
  xray(dt) {
    this.xrayT += dt * 1.5;
    this.shiver = Math.min(1, this.xrayT);
    if (Math.random() < dt * 20) sparkle(this.fx, this.pos.x, this.pos.y, this.pos.z, 1, this.G.mote, 0.8, 0, 0.02, 0.4);
    if (this.xrayT < 2) return [];
    this.sound('pristine', {});
    return this.mgr.caught(this, 'wisp_essence', 'You caught a <b>Void Wisp</b> in the x-ray beam!');
  }
  light() { return { x: this.pos.x, y: this.pos.y, z: this.pos.z, c: [-0.4, -0.38, -0.25], r: 2.4, dark: true }; }
}

export const CRITTER_SPECIES = { earthworm: Earthworm, dust_bunny: DustBunny, glow_beetle: GlowBeetle, blind_fish: CaveFish, gem_tortoise: GemTortoise, rock_crab: RockCrab, ore_slug: OreSlug, crystal_spider: CrystalSpider, void_wisp: VoidWisp };
