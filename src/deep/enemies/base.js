// Shared creature body: senses (distance, line of sight to the mole), walker/flyer physics, and the
// juice every creature gets: a squash & stretch spring, hit flash, blinking glowing eyes, a bouncy
// pop when it emerges, shiver, and knockback. Species subclass this and fill in build / think /
// animate (see the other files in this folder).
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { walk, fly, clearLine, airBelow } from './physics.js';
import { clamp, rand } from '../../core/util.js';

export const TAU = Math.PI * 2;
export const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const easeBack = (t) => { const c = 2.2; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class Enemy {
  /** static info = { id, name, color (css), hits, dmg, flying, lavaProof } */
  constructor(mgr, o) {
    this.mgr = mgr;
    this.w = mgr.world;
    this.fx = mgr.fx;
    this.info = this.constructor.info;
    this.kind = this.info.id;
    this.zone = o.zone || 1;
    this.pos = new THREE.Vector3(o.x, o.y, o.z);
    this.vel = new THREE.Vector3();
    this.yaw = o.yaw ?? Math.random() * TAU;
    this.root = new THREE.Group();
    this.mats = [];
    this.t = 0;
    this.st = 0;
    this.state = 'idle';
    this.sq = 0; this.sqv = 0; this.sqT = 0; // squash (-) / stretch (+) spring
    this.springK = 240; this.springC = 9;
    this.flash = 0;
    this.blinkT = rand(1, 4); this.blinkD = 0;
    this.eyeOpen = 1; this.squint = 1;
    this.ev = { landed: 0, bumped: false, ceil: false };
    this.grounded = false;
    this.inFluid = 0;
    this.emerge = o.emerge ? 0 : 1;
    this.awake = false;
    this.losT = Math.random() * 0.3;
    this.sees = false;
    this.alive = true;
    this.group = o.group || null;
    this.nest = o.nest || null;
    this.hw = 0.2; this.h = 0.4; this.rad = 0.2; this.cy = 0.2; // collision box / sphere, center height
    this.hitR = 0.25;
    this.mass = 1;
    this.size = 1;
    this.shiver = 0;
    this.atkCd = rand(0.6, 1.6);
    this.hp = this.maxHp = this.info.hits * mgr.hpScale(this.zone);
    this.center = new THREE.Vector3();
    this.spheres = [{ x: 0, y: 0, z: 0, r: 0.25 }];
    this.lastHit = new THREE.Vector3();
  }

  // ------------------------------------------------------------ building
  material(opts) { const m = this.mgr.material(opts); this.mats.push(m); return m; }
  part(geo, mat, parent = this.root, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.layers.enable(LAYER_OUTLINE);
    parent.add(m);
    return m;
  }
  group3(parent = this.root, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    this.st += dt;
    this.sense(dt);
    this.think(dt);
    this.move(dt);
    this.common(dt);
    this.animate(dt);
    this.place();
    this.updateSpheres();
  }

  sense(dt) {
    const m = this.mgr, pc = m.pc;
    const cx = this.pos.x, cy = this.pos.y + this.cy, cz = this.pos.z;
    this.pdx = pc.x - cx; this.pdy = pc.y - cy; this.pdz = pc.z - cz;
    this.hd = Math.hypot(this.pdx, this.pdz);
    this.dist = Math.hypot(this.pdx, this.pdy, this.pdz);
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.22 + Math.random() * 0.12;
      this.sees = this.dist < 16 && clearLine(this.w, cx, cy + 0.05, cz, m.eye.x, m.eye.y, m.eye.z);
    }
  }

  setState(s) { this.state = s; this.st = 0; }
  think() {}
  animate() {}

  move(dt) {
    if (this.info.flying) { fly(this.w, this, dt); return; }
    walk(this.w, this, dt, this.grav ?? 16);
    if (this.ev.landed > 1.5) this.onLand(this.ev.landed);
  }

  onLand(sp) {
    this.sqv -= Math.min(9, sp * 1.6);
    if (sp > 3) this.fx.dust(this.pos.x, this.pos.y + 0.03, this.pos.z, Math.min(8, sp | 0), this.mgr.dustCol(this.pos), 0.08 * this.size);
  }

  common(dt) {
    // squash & stretch spring (underdamped: wobbles)
    this.sqv += (-(this.sq - this.sqT) * this.springK - this.sqv * this.springC) * dt;
    this.sq = clamp(this.sq + this.sqv * dt, -0.55, 0.75);
    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.mats) if (m.uniforms.flash) m.uniforms.flash.value = this.flash * 0.85;
    else m.uniforms.emissive.value = (m.userData.e0 ?? 0) + this.flash * 2;
    if (this.emerge < 1) this.emerge = Math.min(1, this.emerge + dt * 2.4);
    this.shiver = Math.max(0, this.shiver - dt * 3);
    this.atkCd -= dt;
    // blinking
    this.blinkT -= dt;
    this.blinkD -= dt;
    if (this.blinkT <= 0) { this.blinkD = 0.12; this.blinkT = Math.random() < 0.25 ? 0.22 : rand(1.6, 4.5); }
    if (this.eyes) {
      const b = this.blinkD > 0 ? 0.12 : 1;
      const o = this.eyeOpen;
      this.eyes.scale.set(o, Math.max(0.001, o * b * this.squint), o);
      this.eyes.visible = o > 0.02;
    }
  }

  /** Root transform: position, heading, squash/stretch, emerge pop, shiver. */
  place() {
    const r = this.root;
    const s = easeBack(this.emerge) * this.size;
    const sq = this.sq;
    const j = this.shiver * 0.03 * this.size;
    r.position.set(this.pos.x + (j ? (Math.random() - 0.5) * j : 0), this.pos.y, this.pos.z + (j ? (Math.random() - 0.5) * j : 0));
    r.rotation.y = this.yaw;
    r.scale.set(s * (1 - sq * 0.45), s * (1 + sq), s * (1 - sq * 0.45));
  }

  updateSpheres() {
    this.center.set(this.pos.x, this.pos.y + this.cy * this.size, this.pos.z);
    const s = this.spheres[0];
    s.x = this.center.x; s.y = this.center.y; s.z = this.center.z; s.r = this.hitR * this.size;
  }

  // ------------------------------------------------------------ helpers for species
  /** Turn toward a point at up to `rate` rad/s. */
  face(x, z, rate, dt) {
    const a = Math.atan2(x - this.pos.x, z - this.pos.z);
    const d = wrapA(a - this.yaw);
    this.yaw = wrapA(this.yaw + clamp(d, -rate * dt, rate * dt));
    return Math.abs(d);
  }
  facePlayer(rate, dt) { return this.face(this.mgr.pc.x, this.mgr.pc.z, rate, dt); }
  /** Horizontal unit vector toward the mole. */
  dirToPlayer() { const d = this.hd || 1; return [this.pdx / d, this.pdz / d]; }
  /** Accelerate (walkers: horizontal only) toward a velocity. */
  push(vx, vz, accel, dt) {
    const k = Math.min(1, accel * dt);
    this.vel.x += (vx - this.vel.x) * k;
    this.vel.z += (vz - this.vel.z) * k;
  }
  /** Flyers: steer toward a point at a cruise speed. */
  steer(tx, ty, tz, speed, accel, dt) {
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz);
    const k = Math.min(1, accel * dt);
    const sp = d > 0.02 ? Math.min(speed, d * 3) / d : 0;
    this.vel.x += (dx * sp - this.vel.x) * k;
    this.vel.y += (dy * sp - this.vel.y) * k;
    this.vel.z += (dz * sp - this.vel.z) * k;
    return d;
  }
  /** Distance from a sphere to the mole's body capsule (negative = overlapping). */
  gapToPlayer(x, y, z, r) {
    const p = this.mgr.pl.pos;
    const yy = clamp(y, p.y + 0.12, p.y + 0.74);
    return Math.hypot(x - p.x, y - yy, z - p.z) - r - 0.24;
  }
  touches(extra = 0) { return this.gapToPlayer(this.center.x, this.center.y, this.center.z, this.hitR * this.size) < extra; }
  floorGap() { return airBelow(this.w, this.pos.x, this.pos.y, this.pos.z, 4); }
  hurtPlayer(base, push, kind = this.kind) { return this.mgr.hurtPlayer(this, base, push, kind); }
  sound(name, opts) { this.mgr.sound(name, opts, this.dist); }

  // ------------------------------------------------------------ being hit
  /** A pick blow. Species can extend via onHit (interrupts, yelps). */
  takeHit(power, dir) {
    if (!this.alive) return;
    this.hp -= power;
    this.flash = 1;
    this.shiver = 0.6;
    this.sqv -= 7;
    const kb = (this.kb ?? 2.4) / this.mass;
    this.vel.x += dir.x * kb; this.vel.z += dir.z * kb;
    this.vel.y += (this.info.flying ? dir.y * kb : 1.3 / this.mass);
    this.wake(true);
    this.onHit(power, dir);
    if (this.hp <= 0) this.mgr.kill(this, dir);
  }
  onHit() {}
  /** First notice of the mole (alerts once). */
  wake(silent) {
    if (this.awake) return;
    this.awake = true;
    if (!silent) this.mgr.alert(this);
  }

  /** Is the mole's lamp shining on this point (dist < range, inside the beam, nothing between)? */
  litBy(range = 7, cos = 0.93) {
    if (!this.sees || this.dist > range) return false;
    const m = this.mgr, f = m.fwd;
    const dx = this.center.x - m.eye.x, dy = this.center.y - m.eye.y, dz = this.center.z - m.eye.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    return (dx * f.x + dy * f.y + dz * f.z) / d > cos;
  }

  /** A light to cast on the rock, or null. */
  light() { return null; }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
  }
}
