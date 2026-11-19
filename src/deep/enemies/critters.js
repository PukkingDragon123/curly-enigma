// Cozy cave critters (never hostile) living alongside the creatures: earthworms poking out of dirt
// walls, dust bunnies hopping about, glow beetles drifting like lanterns, blind fish and frost
// shrimp in the lakes, plodding gem tortoises, rock crabs, ore slugs, crystal spiders and void
// wisps. Each is caught its own way (creatures.js `catch`): grab / net (E), brush, a tap of the
// pick, or the x-ray beam.
//
// (wave 19, sizes.js) Worms, beetles, slugs, crystal spiders, fish, shrimp and crabs are a few cm
// long now, bunnies, tortoises and void wisps a mole's paw to a mole's head. They amble, hop and
// swim at √K the speed and wander nearer home; how close the mole may come before they bolt stays.
import * as THREE from 'three';
import { Enemy, TAU, smooth, easeBack, wrapA } from './base.js';
import { VB, VS, mix, mul, c01 } from './vox.js';
import { variant } from './voxKit.js';
import { buildWorm, buildBunny, buildBeetle, buildFish, buildShrimp, buildTortoise, buildCrab, buildSlug, buildSpider, buildVoidWisp } from './critterArt.js'; // (wave 17)
import { puff, sparkle, mote, pebbles, dustBurst, converge } from './fx.js';
import { fluidAt, solidAt, airBelow, clearLine } from './physics.js';
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
  /** How far it wanders from home (m): small ones stay nearer. */
  get roam() { return this.K < 1 ? Math.max(0.4, Math.sqrt(this.K)) : 1; }
  /** Walk toward the target (or away from the mole when scared). */
  amble(dt, speed, flee = 2.4) {
    this.cool -= dt;
    this.scared -= dt;
    let tx = this.target.x, tz = this.target.z;
    const run = this.scared > 0 || (this.dist < flee && this.mgr.pl.speed > 2.6);
    if (run) { const [dx, dz] = this.dirToPlayer(); tx = this.pos.x - dx * 2; tz = this.pos.z - dz * 2; }
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z), near = 0.25 * Math.max(0.3, this.K);
    if (!run && (d < near || this.st > 6 || this.ev.bumped)) { this.st = 0; this.newTarget(2.5 * this.roam); this.pause = rand(0.5, 3); }
    this.pause = (this.pause || 0) - dt;
    const go = run || (this.pause <= 0 && d > near);
    if (go) {
      const off = this.face(tx, tz, run ? 9 : 4, dt);
      const s = off < 0.8 ? speed * (run ? 2.2 : 1) * this.walkK : 0;
      this.push(Math.sin(this.yaw) * s, Math.cos(this.yaw) * s, 8, dt);
    } else this.push(0, 0, 8, dt);
    return go;
  }
}

// ------------------------------------------------------------------ Earthworm

export class Earthworm extends Critter {
  static info = { id: 'earthworm', name: 'Earthworm', catch: 'grab', drop: 'worm', snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hitR = 0.12; this.cy = 0;
    this.normal = new THREE.Vector3(...(o.normal || [0, 1, 0]));
    const wv = variant(this.seed, 3), G = this.G = mgr.geo('worm|' + wv, () => buildWorm(wv));
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
    r.scale.setScalar(s * this.size); // (wave 19: a few cm of worm)
    this.center.copy(this.normal).multiplyScalar(this.k * this.G.len * 0.6 * VS * this.size).add(this.pos);
  }
  updateSpheres() { const s = this.spheres[0]; s.x = this.center.x; s.y = this.center.y; s.z = this.center.z; s.r = this.k > 0.15 ? 0.13 * this.size : 0; }
}

// ------------------------------------------------------------------ Dust Bunny

export class DustBunny extends Critter {
  static info = { id: 'dust_bunny', name: 'Dust Bunny', catch: 'brush', drop: 'dust_fluff', snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.13; this.h = 0.28; this.cy = 0.15; this.hitR = 0.17;
    this.springK = 300; this.springC = 7;
    const bv = variant(this.seed, 3), G = this.G = mgr.geo('bunny|' + bv, () => buildBunny(bv));
    this.mat = this.material({ emissive: 0.1 });
    this.body = this.part(G.body, this.mat);
    this.eyes = this.part(G.eyes, this.material({ emissive: 0.5 }), this.root, 0, 4.5 * VS, G.ez * VS);
    this.ears = [1, -1].map((sd) => this.part(G.ear, this.mat, this.root, sd * 2.5 * VS, 5.8 * VS, 0));
    this.hopT = rand(0.5, 2);
    this.brushT = 0;
    this.purr = 0;
    // (wave 13) startled or crowded, it bursts into a cloud of dust, then re-forms a little way off
    this.dmode = 'hop'; // hop | panic (puffing up) | cloud (it IS the cloud) | reform
    this.modeT = 0;
    this.puffK = 0;
    this.burstCd = 0;
    this.cloudAt = new THREE.Vector3();
  }
  setMode(m) { this.dmode = m; this.modeT = 0; }
  think(dt) {
    this.cool -= dt; this.scared -= dt; this.purr -= dt; this.burstCd -= dt;
    this.modeT += dt;
    const pl = this.mgr.pl;
    if (this.dmode === 'panic') {
      // the tell: fur bristles, ears shoot up, a squeak... and POOF
      this.puffK = smooth(this.modeT / 0.26);
      this.shiver = 1; this.sqT = 0.2 * this.puffK;
      this.push(0, 0, 12, dt);
      if (this.modeT > 0.26) this.burst();
      return;
    }
    if (this.dmode === 'cloud') { this.cloudTick(dt); return; }
    if (this.dmode === 'reform') {
      this.vel.set(0, 0, 0);
      if (Math.random() < dt * 60 * (this.fx.lod || 1)) converge(this.fx, this.pos.x, this.pos.y + 0.16 * this.K, this.pos.z, 2, this.G.furC, 0.55 * this.roam, 0.3);
      if (this.modeT > 0.36) this.reform();
      return;
    }
    // crowded: a mole charging at it, or right on top of it (sneak up crouched and it stays put to be brushed)
    if (this.burstCd <= 0 && this.purr <= 0 && ((this.dist < 1.5 && pl.speed > 3.1) || (this.dist < 0.62 && !pl.crouched))) {
      this.setMode('panic');
      this.sound('squeak', { pitch: 1.7 });
      return;
    }
    this.puffK = Math.max(0, this.puffK - dt * 4);
    this.sqT = this.grounded ? 0 : clamp(this.vel.y * 0.06, -0.1, 0.3);
    if (!this.grounded) return;
    this.hopT -= dt;
    if (this.hopT < 0.12) this.sqT = -0.3;
    if (this.hopT > 0) return;
    let dx = rand(-1, 1), dz = rand(-1, 1);
    const run = this.scared > 0 || (this.dist < 2.3 && pl.speed > 2.6);
    if (run) { const d = this.dirToPlayer(); dx = -d[0] + rand(-0.3, 0.3); dz = -d[1] + rand(-0.3, 0.3); }
    else { const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z; if (Math.hypot(hx, hz) > 2.5) { dx = hx; dz = hz; } }
    const kv = this.walkK, l = Math.hypot(dx, dz) || 1, sp = (run ? 2.4 : rand(0.6, 1.2)) * kv;
    this.yaw = Math.atan2(dx, dz);
    this.vel.set(dx / l * sp, (run ? 3.6 : rand(2.4, 3.2)) * kv, dz / l * sp); // (wave 19: hops its size)
    this.sqv += 8;
    this.hopT = this.purr > 0 ? 1.5 : run ? rand(0.15, 0.3) : rand(0.6, 2.2);
  }
  animate() {
    const flop = this.grounded ? 0.15 + Math.sin(this.t * 2) * 0.05 : -0.5 - this.vel.y * 0.08;
    const up = this.puffK; // panicking: ears bolt upright, trembling
    this.ears.forEach((e, i) => {
      e.rotation.x = -flop * (1 - up) + up * 0.25;
      e.rotation.z = (i ? 1 : -1) * (0.32 * (1 - up) + (this.purr > 0 ? Math.sin(this.t * 12) * 0.15 : 0) + up * Math.sin(this.t * 40 + i) * 0.12);
    });
  }
  place() {
    super.place();
    this.root.visible = this.dmode !== 'cloud' && this.dmode !== 'reform';
    if (this.puffK > 0) this.root.scale.multiplyScalar(1 + this.puffK * 0.38); // fur standing on end
  }
  updateSpheres() { super.updateSpheres(); if (!this.root.visible) this.spheres[0].r = 0; }
  /** Startled by the pick: it bursts at once. */
  onPoke() { if (this.dmode === 'hop' || this.dmode === 'panic') this.burst(); }
  /** POOF: the bunny becomes a billowing ball of dust (and some of it gets in your eyes). */
  burst() {
    const c = this.center, m = this.mgr;
    this.cloudAt.copy(c);
    dustBurst(this.fx, c.x, c.y, c.z, this.pos.y, this.G.furC, 1);
    this.sound('dust_poof', { vol: 1 });
    this.sound('squeak', { pitch: 1.9, vol: 0.5 });
    // in your face: the closer (and the more you were looking at it) the thicker
    const ex = c.x - m.eye.x, ey = c.y - m.eye.y, ez = c.z - m.eye.z, ed = Math.hypot(ex, ey, ez) || 1;
    const facing = (ex * m.fwd.x + ey * m.fwd.y + ez * m.fwd.z) / ed;
    const k = clamp((2.7 - ed) / 1.6, 0, 1) * (facing > 0.3 ? 1 : 0.55);
    if (k > 0.1) m.veil.hit(k, { tones: BUNNY_VEIL });
    this.puffK = 0; this.shiver = 0;
    this.vel.set(0, 0, 0);
    this.hitPuff = false;
    this.setMode('cloud');
  }
  /** The cloud hangs and billows a moment (walk into it and you get another faceful). */
  cloudTick(dt) {
    this.vel.set(0, 0, 0);
    const a = this.cloudAt, t = this.modeT, lod = this.fx.lod || 1;
    if (t < 1.3 && Math.random() < dt * 36 * lod * (1.3 - t)) {
      const r = (0.25 + t * 0.35) * this.roam; // (wave 19: a little bunny makes a little cloud)
      this.fx.spawn({ x: a.x + rand(-r, r), y: a.y + rand(-0.15 * this.roam, r * 0.8), z: a.z + rand(-r, r), vx: rand(-0.2, 0.2), vy: rand(0, 0.25), vz: rand(-0.2, 0.2), life: rand(0.9, 1.5), size: rand(0.03, 0.06), grow: 0.05, color: this.G.furC[(Math.random() * 4) | 0], alpha: 0.7, drag: 2, grav: -0.05, swirl: 0.4, lit: 0.55 });
    }
    if (!this.hitPuff && t > 0.2 && t < 1.2 && Math.hypot(this.mgr.eye.x - a.x, this.mgr.eye.y - 0.25 - a.y, this.mgr.eye.z - a.z) < 0.75) {
      this.hitPuff = true;
      this.mgr.veil.hit(0.5, { tones: BUNNY_VEIL, sneeze: false });
    }
    if (t > 1.9) this.findReform();
  }
  /** Somewhere a few hops away from the mole, on the floor, to pull itself back together. */
  findReform() {
    const m = this.mgr, a = this.cloudAt;
    let dx = a.x - m.pc.x, dz = a.z - m.pc.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const base = Math.atan2(dx, dz);
    // (somewhere you can see it pull itself together, if there is such a spot)
    let spot = null, hidden = null;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 2, -2]) {
      const b = base + off, d = rand(1.8, 2.8) * Math.max(0.5, this.roam);
      const tx = a.x + Math.sin(b) * d, tz = a.z + Math.cos(b) * d;
      const f = m.floorAt(tx, this.pos.y + 0.6, tz, 0.3, 2.5, 1.2);
      if (!f || Math.abs(f.y - this.pos.y) > 1.2 || m.excluded?.(tx, f.y, tz, 0.5)) continue;
      if (clearLine(this.w, m.eye.x, m.eye.y, m.eye.z, tx, f.y + 0.2, tz)) { spot = [tx, f.y + 0.01, tz]; break; }
      hidden ||= [tx, f.y + 0.01, tz];
    }
    spot ||= hidden;
    if (spot) this.pos.set(...spot);
    this.home.copy(this.pos);
    this.setMode('reform');
  }
  reform() {
    this.setMode('hop');
    this.emerge = 0; // pops back in (base: easeBack)
    this.sqv += 10;
    this.scared = 2.5; this.burstCd = 5; this.hopT = 0.08; // and bolts
    sparkle(this.fx, this.pos.x, this.pos.y + 0.16 * this.K, this.pos.z, 6, this.G.furC[3], 1.2, -0.3, 0.016, 0.5);
    this.fx.dust(this.pos.x, this.pos.y + 0.04 * this.K, this.pos.z, 5, this.G.furC[1], 0.12 * this.K);
    this.sound('dust_poof', { vol: 0.35, pitch: 1.5 });
    this.sound('squeak', { pitch: 1.4, vol: 0.6 });
  }
  brush(dt) {
    if (this.dmode !== 'hop') return [];
    this.purr = 1.2;
    this.brushT += dt;
    const k = this.K;
    if (Math.random() < dt * 8) this.fx.spawn({ x: this.center.x + rand(-0.1, 0.1) * k, y: this.center.y + 0.15 * k, z: this.center.z + rand(-0.1, 0.1) * k, vy: 0.6, life: 0.8, size: 0.03, color: [1, 0.55, 0.7], glow: true, drag: 1 });
    if (this.brushT > 0.7 && this.cool <= 0) {
      this.brushT = 0; this.cool = 25;
      this.sound('squeak', { pitch: 0.8 });
      sparkle(this.fx, this.center.x, this.center.y + 0.1 * k, this.center.z, 8, [1, 0.6, 0.75], 1.2, -0.5, 0.025, 0.9);
      return this.mgr.gift(this, 'dust_fluff', 'The dust bunny purrs and leaves you some <b>fluff</b>.');
    }
    return [];
  }
}
// the veil a bunny leaves in your eyes: its own fur, dark → light
const BUNNY_VEIL = [0x5e5446, 0x8a7e6c, 0xb4a690, 0xd6cab4, 0xf2e8d6];

// ------------------------------------------------------------------ Glow Beetle

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
    const kv = this.walkK;
    if (this.scared > 0) {
      const [dx, dz] = this.dirToPlayer();
      this.steer(this.pos.x - dx * 2, this.pos.y + 0.6, this.pos.z - dz * 2, 2.2 * kv, 3, dt);
    } else {
      // (wave 19) it drifts about at the height of your eyes, slowly: a firefly, not a lantern on a string
      if (this.pos.distanceTo(this.target) < 0.3 * Math.max(0.4, this.K) || this.st > 5) { this.st = 0; this.newTarget(2.2 * this.roam, true); }
      const ty = this.target.y + clamp((this.K < 1 ? 0.95 : 1.2) - this.floor, -0.5, 0.6);
      this.steer(this.target.x, ty + Math.sin(this.t * 1.7) * 0.1 * kv, this.target.z, 0.45 * kv, 1.2, dt);
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05) this.yaw += wrapA(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * Math.min(1, dt * 4);
  }
  animate(dt) {
    const f = Math.sin(this.t * 38) * 0.6;
    this.wings[0].rotation.z = 0.5 + f; this.wings[1].rotation.z = -0.5 - f;
    this.root.rotation.x = Math.sin(this.t * 2) * 0.1;
    this.glowMat.uniforms.emissive.value = 1.1 + Math.sin(this.t * 2.4 + this.pulse) * 0.4;
    if (Math.random() < dt * 3) this.fx.firefly(this.pos.x, this.pos.y - 0.04 * this.K, this.pos.z, [0.75, 1, 0.4]);
  }
  canGrab() { return true; }
  light() { const k = 0.85 + Math.sin(this.t * 2.4 + this.pulse) * 0.25; return { x: this.pos.x, y: this.pos.y, z: this.pos.z, c: [0.45 * k, 0.75 * k, 0.2 * k], r: 2.6 }; }
}

// ------------------------------------------------------------------ Blind Cave Fish / Frost Shrimp

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
    const kv = this.walkK, kr = this.roam;
    if (this.scared > 0 || (this.dist < 1.6 && this.mgr.pl.speed > 2)) {
      const [dx, dz] = this.dirToPlayer();
      this.steer(this.pos.x - dx * 2, this.pos.y, this.pos.z - dz * 2, 2.2 * kv, 4, dt);
    } else {
      if (this.pos.distanceTo(this.target) < 0.3 * Math.max(0.4, this.K) || this.st > 4) {
        this.st = 0;
        for (let k = 0; k < 8; k++) {
          const t = [this.home.x + rand(-2.5, 2.5) * kr, this.home.y + rand(-0.6, 0.5) * kr, this.home.z + rand(-2.5, 2.5) * kr];
          if (fluidAt(this.w, t[0], t[1], t[2]) === 1 && fluidAt(this.w, t[0], t[1] + 0.12, t[2]) === 1) { this.target.set(...t); break; }
        }
      }
      this.steer(this.target.x, this.target.y, this.target.z, (this.shrimp ? 0.8 : 0.55) * kv, 1.5, dt);
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05 * kv) this.yaw += wrapA(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * Math.min(1, dt * 5);
    if (Math.random() < dt * 0.6) this.fx.spawn({ x: this.pos.x, y: this.pos.y + 0.05 * this.K, z: this.pos.z, vy: 0.4, life: 1.2, size: 0.016, color: [0.75, 0.9, 1], alpha: 0.7, drag: 0.5 }); // a bubble
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
    const k = this.K;
    if (Math.random() < dt * 14) pebbles(this.fx, this.pos.x + rand(-0.15, 0.15) * k, this.pos.y + 0.3 * k, this.pos.z + rand(-0.15, 0.15) * k, 1, [0.3, 0.6, 0.25], 0.05 * k, 0.8);
    if (this.brushT < 1.4) return [];
    this.hasMoss = false;
    this.body.geometry = this.clean.body;
    sparkle(this.fx, this.pos.x, this.pos.y + 0.35 * k, this.pos.z, 10, [1, 0.4, 0.45], 1.6, 1, 0.025, 0.8);
    this.sound('pristine', {});
    return this.mgr.gift(this, 'ruby', 'The tortoise sighs happily. A <b>ruby</b> rolls out of its clean shell!');
  }
}

// ------------------------------------------------------------------ Rock Crab

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
    if (!this.shelled) { this.scared = 9; this.amble(dt, 0.9); this.life = (this.life || 0) + dt; if (this.life > 5) { this.alive = false; puff(this.fx, this.pos.x, this.pos.y, this.pos.z, 5, this.G.dust, 0.1 * this.K, 0.2, 0.06, 0.6); } return; }
    if (near && this.mgr.pl.speed > 0.5) {
      // scuttle sideways, of course
      const [dx, dz] = this.dirToPlayer(), kv = this.walkK;
      this.face(this.pos.x - dz, this.pos.z + dx, 6, dt);
      if (Math.random() < dt * 0.6) this.side = -this.side;
      this.push((dz * this.side * 1.2 - dx * 0.4) * kv, (-dx * this.side * 1.2 - dz * 0.4) * kv, 10, dt);
      this.sqT = Math.sin(this.t * 30) * 0.05;
    } else this.push(0, 0, 10, dt);
  }
  onPoke(dir) {
    if (!this.shelled) { this.sound('squeak', { pitch: 1.5 }); return; }
    this.shelled = false;
    this.body.geometry = this.G.naked;
    this.sound('clunk', {});
    this.sound('squeak', { pitch: 1.5 });
    pebbles(this.fx, this.center.x, this.center.y + 0.1 * this.K, this.center.z, 6, this.G.dust, 0.1 * this.K, 1.4);
    this.mgr.gift(this, 'crab_shell', null, true);
  }
}

// ------------------------------------------------------------------ Ore Slug

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
  light() { return { x: this.pos.x, y: this.pos.y + 0.12 * this.K, z: this.pos.z, c: [0.25, 0.4, 0.55], r: 1.6 }; }
}

// ------------------------------------------------------------------ Void Wisp

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
    const kr = this.roam;
    if (this.pos.distanceTo(this.target) < 0.3 * Math.max(0.4, this.K) || this.st > 6) { this.st = 0; this.target.set(this.home.x + rand(-3, 3) * kr, this.home.y + rand(-0.6, 0.8), this.home.z + rand(-3, 3) * kr); }
    this.steer(this.target.x, this.target.y + Math.sin(this.t) * 0.2 * kr, this.target.z, 0.35 * this.walkK * (1 - Math.min(0.8, this.xrayT)), 1, dt);
    this.facePlayer(1, dt);
    if (Math.random() < dt * 10) mote(this.fx, this.pos.x, this.pos.y + 0.1 * this.K, this.pos.z, this.G.mote, 0.025, 0.9);
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
