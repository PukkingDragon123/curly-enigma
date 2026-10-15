// First-person mole: an AABB walking through voxels (meters). Steps up rough floors, jumps, grips
// and climbs walls (moles dig claws in), swims, and feeds the camera a little bob and landing dip.
import * as THREE from 'three';
import { VOX, MAT, M } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { clamp, damp } from '../core/util.js';

const HW = 0.22; // half width
const HEIGHT = 0.86;
const EYE = 0.72;
const STEP = 0.32;
const GRAV = 15;

export class FPSPlayer {
  constructor(world) {
    this.w = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.climbing = false;
    this.inWater = false;
    this.inLava = false;
    this.bobT = 0;
    this.dip = 0; // landing dip (meters)
    this.eyeY = EYE;
    this.lastFall = 0;
    this.blocked = false;
  }

  /** Is any solid voxel inside the box [x0,x1]×[y0,y1]×[z0,z1] (meters)? */
  boxHits(x0, y0, z0, x1, y1, z1) {
    const w = this.w;
    const a = Math.floor(x0 * VOX), b = Math.floor((x1 - 1e-4) * VOX);
    const c = Math.floor(y0 * VOX), d = Math.floor((y1 - 1e-4) * VOX);
    const e = Math.floor(z0 * VOX), f = Math.floor((z1 - 1e-4) * VOX);
    for (let z = e; z <= f; z++) for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (OPAQUE[w.voxelAt(x, y, z)]) return true;
    return false;
  }
  hitsAt(px, py, pz) { return this.boxHits(px - HW, py, pz - HW, px + HW, py + HEIGHT, pz + HW); }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeY - this.dip, this.pos.z); }

  look(dx, dy, sens = 0.0026) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch - dy * sens, -1.48, 1.48);
  }

  /** mv: {x: strafe, y: forward} in -1..1; returns events {landed, fell, splash}. */
  update(dt, mv, { jump = false, jumpHeld = false, run = false, frozen = false, speedMul = 1 } = {}) {
    const ev = {};
    dt = Math.min(dt, 1 / 20);
    const w = this.w, p = this.pos, v = this.vel;
    // fluid at the body's middle
    const mid = w.voxelAt(Math.floor(p.x * VOX), Math.floor((p.y + 0.45) * VOX), Math.floor(p.z * VOX));
    const head = w.voxelAt(Math.floor(p.x * VOX), Math.floor((p.y + 0.75) * VOX), Math.floor(p.z * VOX));
    const wasWater = this.inWater;
    this.inWater = MAT[mid]?.fluid === 1;
    this.inLava = MAT[mid]?.fluid === 2 || MAT[w.voxelAt(Math.floor(p.x * VOX), Math.floor((p.y + 0.05) * VOX), Math.floor(p.z * VOX))]?.fluid === 2;
    this.headUnder = MAT[head]?.fluid === 1;
    if (this.inWater && !wasWater && v.y < -2) ev.splash = -v.y;

    let speed = (run ? 3.9 : 2.7) * speedMul;
    if (this.inWater || this.inLava) speed *= 0.6;
    if (frozen) mv = { x: 0, y: 0 };
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let tx = (fx * mv.y + rx * mv.x) * speed, tz = (fz * mv.y + rz * mv.x) * speed;
    const accel = this.grounded ? 30 : 9;
    v.x += clamp(tx - v.x, -accel * dt, accel * dt);
    v.z += clamp(tz - v.z, -accel * dt, accel * dt);

    // climbing: a ladder takes you up for free; otherwise pushing into a wall with jump held —
    // moles dig their claws in
    this.climbing = false;
    this.onLadder = this.ladderNear();
    if (this.onLadder && !this.inWater && (mv.y > 0.3 || jumpHeld)) {
      this.climbing = true;
      v.y = 2.1;
    } else if (jumpHeld && !this.inWater && this.blocked && mv.y > 0.3) {
      this.climbing = true;
      v.y = 2.3;
    } else if (this.inWater) {
      v.y += -GRAV * 0.18 * dt;
      v.y *= Math.max(0, 1 - 3 * dt);
      if (jumpHeld) v.y = Math.max(v.y, 2.2);
    } else if (this.inLava) {
      v.y += -GRAV * 0.1 * dt; v.y *= Math.max(0, 1 - 5 * dt);
      if (jumpHeld) v.y = Math.max(v.y, 1.6);
    } else {
      v.y -= GRAV * dt;
      if (jump && this.grounded) { v.y = 5.0; ev.jump = true; }
    }
    v.y = Math.max(v.y, -18);

    // move: x, z with step-up, then y
    this.blocked = false;
    const stepped = this.moveAxis(0, v.x * dt) | this.moveAxis(2, v.z * dt);
    if (stepped) ev.step = true;
    const wasGround = this.grounded;
    const vyBefore = v.y;
    this.grounded = false;
    if (!this.moveY(v.y * dt)) {
      if (v.y < 0) {
        this.grounded = true;
        if (!wasGround && vyBefore < -3) { ev.landed = -vyBefore; this.dip = Math.min(0.12, -vyBefore * 0.012); }
        if (!wasGround && vyBefore < -11.5) ev.fallDamage = (-vyBefore - 11.5) * 3;
      }
      v.y = 0;
    }
    // still standing? (a voxel just below)
    if (!this.grounded && v.y <= 0 && this.boxHits(p.x - HW, p.y - 0.03, p.z - HW, p.x + HW, p.y, p.z + HW)) this.grounded = true;

    // camera: bob while walking, dip recovery, smooth step-ups
    const hs = Math.hypot(v.x, v.z);
    if (this.grounded && hs > 0.3) this.bobT += dt * hs * 2.6;
    this.dip = damp(this.dip, 0, 9, dt);
    this.eyeY = damp(this.eyeY, EYE, 14, dt);
    this.speed = hs;
    return ev;
  }

  /** Is a ladder voxel right against the mole (within a voxel of its body, chest high)? */
  ladderNear() {
    const w = this.w, p = this.pos;
    const x0 = Math.floor((p.x - HW) * VOX) - 1, x1 = Math.floor((p.x + HW) * VOX) + 1;
    const z0 = Math.floor((p.z - HW) * VOX) - 1, z1 = Math.floor((p.z + HW) * VOX) + 1;
    for (const yy of [0.1, 0.45, 0.8]) {
      const y = Math.floor((p.y + yy) * VOX);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (w.voxelAt(x, y, z) === M.LADDER) return true;
    }
    return false;
  }

  moveAxis(axis, d) {
    if (!d) return false;
    const p = this.pos;
    const nx = axis === 0 ? p.x + d : p.x, nz = axis === 2 ? p.z + d : p.z;
    if (!this.hitsAt(nx, p.y, nz)) { p.x = nx; p.z = nz; return false; }
    // step up onto low ledges (rough voxel floors)
    if (this.grounded || this.climbing) {
      for (let s = 1 / VOX; s <= STEP + 1e-4; s += 1 / VOX) {
        if (!this.hitsAt(nx, p.y + s, nz) && !this.hitsAt(p.x, p.y + s, p.z)) {
          p.y += s; p.x = nx; p.z = nz;
          this.eyeY -= s; // the camera catches up smoothly
          return true;
        }
      }
    }
    // slide up to the wall
    const step = Math.sign(d) / (VOX * 4);
    let moved = 0;
    while (Math.abs(moved + step) < Math.abs(d) && !this.hitsAt(axis === 0 ? p.x + step : p.x, p.y, axis === 2 ? p.z + step : p.z)) {
      if (axis === 0) p.x += step; else p.z += step;
      moved += step;
    }
    if (axis === 0) this.vel.x = 0; else this.vel.z = 0;
    this.blocked = true;
    return false;
  }

  moveY(d) {
    const p = this.pos;
    if (!this.hitsAt(p.x, p.y + d, p.z)) { p.y += d; return true; }
    // land exactly on the voxel boundary
    if (d < 0) {
      const top = Math.floor((p.y + d) * VOX + 1) / VOX;
      if (!this.hitsAt(p.x, top, p.z) && top <= p.y + 1e-6) p.y = top;
    } else {
      const ceil = Math.floor((p.y + HEIGHT + d) * VOX) / VOX - HEIGHT - 1e-4;
      if (!this.hitsAt(p.x, ceil, p.z) && ceil >= p.y) p.y = ceil;
    }
    return false;
  }
}

export { HW, HEIGHT, EYE };
