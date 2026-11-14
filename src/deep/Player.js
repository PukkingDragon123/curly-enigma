// First-person mole: an AABB walking through voxels (meters). Steps up rough floors, jumps, grips
// and climbs walls (moles dig claws in), crouches (low tunnels, and no walking off ledges while
// crouched), swims and dives (crouch sinks, jump rises, swimming forward follows the look), wades
// (slower in shallow water) and drifts with currents (Fluids sets .wade and .flow), and feeds the
// camera a little bob and landing dip.
// Wave 14 (mining feel): falls are swept in steps (a fast fall never skips a thin floor), the eye
// never rides above a crouched body (no camera in the roof), and with `assist` on (the mine) the
// body helps itself through dug tunnels: it ducks into openings too low to stand in, hops up
// ledges a little too tall to step (up to HOP), slips round single-voxel corners instead of
// snagging on them, and is pushed out if rock ever ends up inside it.
import * as THREE from 'three';
import { VOX, MAT, M } from './materials.js';
import { OPAQUE } from './Mesher.js';
// chunk keys as World.js has them (32-voxel chunks), without importing the world (the burrow and
// the town walk on a BoxWorld)
const CB = 5;
const key3 = (cx, cy, cz) => ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512);
import { clamp, damp } from '../core/util.js';

const HW = 0.22; // half width
const HEIGHT = 0.86;
const EYE = 0.72;
const HEIGHT_C = 0.5; // crouched
const EYE_C = 0.4;
const STEP = 0.32;
const HOP = 0.62; // (assist) the tallest ledge the mole hops up by itself when walking into it
const NUDGE = 0.19; // (assist) how far round a corner the body may slip sideways (m)
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
    this.dipV = 0; // its spring's velocity (the dip bounces back with a small overshoot)
    this.coyote = 0; // a moment after walking off a ledge when a jump still counts (s)
    this.jumpBuf = 0; // a jump pressed just before landing (s)
    this.eyeY = EYE;
    this.h = HEIGHT; // body height now (lower while crouched)
    this.crouched = false;
    this.lastFall = 0;
    this.blocked = false;
    // set by Fluids each frame: how deep the mole wades (0..1, slows the legs) and the current (m/s)
    this.wade = 0;
    this.flow = null;
    this.assist = false; // the mine turns on the tunnel helpers (auto-duck, auto-hop, corner slip, unstick)
    this.autoLow = false; // ducked by itself (a low opening), not by the crouch key
    this.hopT = 0; // a little while after an auto-hop (no second one, no ledge guard)
    this.pushT = 0; // how long the legs have been pushing into a ledge
    this.stuckT = 0;
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
  hitsAt(px, py, pz, h = this.h) { return this.boxHits(px - HW, py, pz - HW, px + HW, py + h, pz + HW); }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeY - this.dip, this.pos.z); }

  look(dx, dy, sens = 0.0026) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch - dy * sens, -1.48, 1.48);
  }

  /** mv: {x: strafe, y: forward} in -1..1; returns events {landed, fell, splash}. */
  update(dt, mv, { jump = false, jumpHeld = false, run = false, crouch = false, frozen = false, speedMul = 1, jumpMul = 1 } = {}) {
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

    // crouch (in water the same key dives); standing up needs head room
    const wantLow = crouch && !frozen && !this.inWater;
    this.crouchKey = wantLow;
    if (wantLow && !this.crouched) { this.crouched = true; this.h = HEIGHT_C; }
    else if (wantLow) this.autoLow = false;
    else if (!wantLow && this.crouched) {
      if (!this.hitsAt(p.x, p.y, p.z, HEIGHT)) { this.crouched = false; this.h = HEIGHT; this.autoLow = false; }
      else if (this.inWater) { // pinned under a ledge in water: slip down instead of sticking
        this.crouched = false; this.h = HEIGHT;
        for (let s = 1 / VOX; s <= 0.4; s += 1 / VOX) if (!this.hitsAt(p.x, p.y - s, p.z)) { p.y -= s; break; }
      }
    }
    this.lowCeiling = this.crouched && !wantLow;
    // rock inside the body (a slide of grains, a block, a cooled flow, a bad teleport): push out
    if (this.assist) this.unstick(dt);

    let speed = (run && !this.crouched ? 3.9 : 2.7) * speedMul;
    if (this.crouched) speed *= this.autoLow && !wantLow ? 0.62 : 0.45; // ducking through a low bit is quicker than a sneak
    if (this.inWater || this.inLava) speed *= 0.6;
    else if (this.wade) speed *= 1 - 0.45 * this.wade; // wading through shallow water
    if (frozen) mv = { x: 0, y: 0 };
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let tx = (fx * mv.y + rx * mv.x) * speed, tz = (fz * mv.y + rz * mv.x) * speed;
    // a current carries you along (you can still swim against it)
    if (this.flow && (this.inWater || this.wade)) { tx += this.flow.x; tz += this.flow.z; }
    // (wave 10: quick and bouncy) snappier start/stop on the ground, more air control
    const accel = this.grounded ? 46 : 14;
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
      // under water, swimming forward goes where you look; crouch dives, jump rises
      if (this.headUnder && mv.y > 0.3) v.y += (Math.sin(this.pitch) * speed * mv.y - v.y) * Math.min(1, 4 * dt);
      if (crouch && !frozen) { v.y = Math.min(v.y, -2.0); this.diving = true; } else this.diving = false;
      if (jumpHeld) v.y = Math.max(v.y, 2.2);
    } else if (this.inLava) {
      v.y += -GRAV * 0.1 * dt; v.y *= Math.max(0, 1 - 5 * dt);
      if (jumpHeld) v.y = Math.max(v.y, 1.6);
    } else {
      // a snappier jump: a faster take-off against a stronger pull while rising, so the apex stays
      // where it was (5.7² / (2·15·1.3) ≈ 5.0² / (2·15)) but the hop pops; the fall is unchanged
      // (landing speeds and fall damage stay as they were). A little coyote time and a jump buffer
      // so a press just before landing or just after walking off a ledge still counts.
      v.y -= GRAV * (v.y > 0 ? 1.3 : 1) * dt;
      this.jumpBuf = jump ? 0.12 : Math.max(0, this.jumpBuf - dt);
      if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) { v.y = 5.7 * jumpMul; ev.jump = true; this.jumpBuf = 0; this.coyote = 0; this.dip = -0.03; }
    }
    v.y = Math.max(v.y, -18);

    // move: x, z with step-up, then y
    this.blocked = false;
    this.blockDir = null;
    this.stepped = 0;
    this.wishX = fx * mv.y + rx * mv.x; this.wishZ = fz * mv.y + rz * mv.x;
    const stepped = this.moveAxis(0, v.x * dt) | this.moveAxis(2, v.z * dt);
    if (stepped) ev.step = true;
    const wasGround = this.grounded;
    const vyBefore = v.y;
    this.grounded = false;
    // swept in steps of at most a quarter metre: a fast fall can't skip a thin floor
    const dy = v.y * dt, nY = Math.max(1, Math.ceil(Math.abs(dy) / 0.25));
    let freeY = true;
    for (let i = 0; i < nY && freeY; i++) freeY = this.moveY(dy / nY);
    if (!freeY) {
      if (v.y < 0) {
        this.grounded = true;
        if (!wasGround && vyBefore < -3) { ev.landed = -vyBefore; this.dip = Math.min(0.12, -vyBefore * 0.012); }
        if (!wasGround && vyBefore < -11.5) ev.fallDamage = (-vyBefore - 11.5) * 3;
      }
      v.y = 0;
    }
    // still standing? (a voxel just below)
    if (!this.grounded && v.y <= 0 && this.boxHits(p.x - HW, p.y - 0.03, p.z - HW, p.x + HW, p.y, p.z + HW)) this.grounded = true;
    // (assist) walking into a ledge a little too tall to step: a quick hop up onto it
    this.hopT = Math.max(0, this.hopT - dt);
    if (this.assist && !frozen && !ev.jump && this.blockDir && this.grounded && !this.inWater && !this.climbing) {
      this.pushT += dt;
      const h = this.pushT > 0.06 && this.hopT <= 0 ? this.ledgeAhead(this.blockDir) : 0;
      if (h) {
        v.y = Math.sqrt(2 * GRAV * 1.3 * (h + 0.07)) * clamp(jumpMul, 0.9, 1.15);
        this.grounded = false; this.hopT = 0.35; this.pushT = 0; ev.hop = h; this.dip = -0.02;
      }
    } else this.pushT = 0;

    // camera: bob while walking, dip recovery, smooth step-ups
    const hs = Math.hypot(v.x, v.z);
    if (this.grounded && hs > 0.3) this.bobT += dt * hs * 2.6;
    this.coyote = this.grounded ? 0.09 : Math.max(0, this.coyote - dt);
    // the landing dip springs back with a small overshoot (a squash, then a bounce) instead of easing out
    // (a dip set from outside, by a cutscene, or by a landing or a hop this frame: the spring starts from rest)
    if (this.dip !== this._dipWas) this.dipV = 0;
    this.dipV += (-this.dip * 260 - this.dipV * 20) * dt;
    this.dip += this.dipV * dt;
    this._dipWas = this.dip;
    this.eyeY = damp(this.eyeY, this.crouched ? EYE_C : EYE, 14, dt);
    // crouching drops the body at once and the eye follows: never let the eye ride above the
    // body's top (it would look out through the roof of a low tunnel)
    if (this.crouched && this.eyeY > this.h - 0.09 && this.boxHits(p.x - 0.08, p.y + this.h, p.z - 0.08, p.x + 0.08, p.y + this.eyeY + 0.08, p.z + 0.08)) this.eyeY = this.h - 0.09;
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
    if (!this.hitsAt(nx, p.y, nz)) {
      // crouched on the ground: don't walk off a ledge (a step's drop is fine); only when the
      // crouch key holds it (ducking through a low bit by itself, the mole walks on)
      if (this.crouched && this.crouchKey && this.grounded && !this.boxHits(nx - HW, p.y - STEP, nz - HW, nx + HW, p.y, nz + HW)) {
        if (axis === 0) this.vel.x = 0; else this.vel.z = 0;
        return false;
      }
      p.x = nx; p.z = nz; return false;
    }
    // step up onto low ledges (rough voxel floors); a moment after leaving the ground still counts
    const canStep = this.grounded || this.climbing || (this.assist && this.coyote > 0);
    if (canStep && this.stepUp(nx, nz)) return true;
    if (this.assist && !this.inWater) {
      // too low to stand in, but a crouched mole fits: duck in by itself
      if (!this.crouched && (this.grounded || this.coyote > 0)) {
        const h0 = this.h;
        this.h = HEIGHT_C;
        if (!this.hitsAt(nx, p.y, nz) || (canStep && this.stepUp(nx, nz, true))) {
          if (!this.hitsAt(nx, p.y, nz)) { p.x = nx; p.z = nz; }
          this.crouched = true; this.autoLow = true;
          return false;
        }
        this.h = h0;
      }
      // a corner of a voxel or two caught the body's edge: slip round it
      if (this.nudge(axis, d)) return false;
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
    // which way the legs push (for the auto-hop): along this axis, if the mole means to go there
    const wd = axis === 0 ? this.wishX : this.wishZ;
    if (wd * d > 0 && Math.abs(wd) > 0.45) this.blockDir = [axis === 0 ? Math.sign(d) : 0, axis === 2 ? Math.sign(d) : 0];
    return false;
  }

  /** Step up onto a low ledge at (nx, nz): the smallest rise (up to STEP) where the body fits. */
  stepUp(nx, nz, quiet = false) {
    const p = this.pos;
    for (let s = 1 / VOX; s <= STEP + 1e-4; s += 1 / VOX) {
      if (!this.hitsAt(nx, p.y + s, nz) && !this.hitsAt(p.x, p.y + s, p.z)) {
        p.y += s; p.x = nx; p.z = nz;
        this.eyeY -= s; // the camera catches up smoothly
        if (!quiet) this.stepped = s;
        return true;
      }
    }
    return false;
  }

  /**
   * (assist) Blocked along `axis` by a corner a voxel or three wide: if a little sideways (up to
   * NUDGE) the way is clear, slide that way (a bit per frame) and on. Only when the mole is walking
   * mostly straight at it (sliding along a wall is the normal slide's job).
   */
  nudge(axis, d) {
    const p = this.pos, o = axis === 0 ? 2 : 0;
    const wAlong = axis === 0 ? this.wishX : this.wishZ, wSide = axis === 0 ? this.wishZ : this.wishX;
    if (wAlong * d <= 0 || Math.abs(wSide) > Math.abs(wAlong) * 0.75) return false;
    for (let s = 1 / VOX; s <= NUDGE + 1e-4; s += 1 / VOX) {
      for (const sg of wSide ? [Math.sign(wSide), -Math.sign(wSide)] : [1, -1]) {
        const ox = o === 0 ? sg * s : 0, oz = o === 2 ? sg * s : 0;
        const ax = axis === 0 ? d : 0, az = axis === 2 ? d : 0;
        if (this.hitsAt(p.x + ox, p.y, p.z + oz) || this.hitsAt(p.x + ox + ax, p.y, p.z + oz + az)) continue;
        // slip sideways (quick, but not a teleport), then on along the axis if that's clear now
        const k = Math.min(s, Math.max(Math.abs(d) * 1.6, 0.012));
        if (o === 0) p.x += sg * k; else p.z += sg * k;
        if (!this.hitsAt(p.x + ax, p.y, p.z + az)) { p.x += ax; p.z += az; }
        return true;
      }
    }
    return false;
  }

  /** (assist) Height of a ledge in direction dir [dx, dz] the mole can hop onto (STEP..HOP), or 0. */
  ledgeAhead(dir) {
    const p = this.pos, f = 0.07;
    const nx = p.x + dir[0] * f, nz = p.z + dir[1] * f;
    if (!this.hitsAt(nx, p.y, nz)) return 0;
    for (let s = STEP; s <= HOP + 1e-4; s += 1 / VOX) {
      if (this.hitsAt(p.x, p.y + s, p.z)) return 0; // no head room to rise
      if (!this.hitsAt(nx, p.y + s, nz)) return s;
    }
    return 0;
  }

  /**
   * (assist) Rock inside the body: after a short grace (it may be a step being taken), push the
   * mole to the nearest place it fits: up first (it was buried), then out sideways, then ducked.
   */
  unstick(dt) {
    const p = this.pos;
    if (!this.hitsAt(p.x, p.y, p.z)) { this.stuckT = 0; return; }
    // rock still on its way (a chunk not built yet reads as stone): wait for it
    const ch = this.w.chunks?.get?.(key3(Math.floor(p.x * VOX) >> CB, Math.floor((p.y + 0.4) * VOX) >> CB, Math.floor(p.z * VOX) >> CB));
    if (this.w.chunks && (!ch || !ch.vox)) { this.stuckT = 0; return; }
    this.stuckT += dt;
    if (this.stuckT < 0.12) return;
    const tryAt = (x, y, z) => !this.hitsAt(x, y, z);
    for (let s = 1 / VOX; s <= 0.55; s += 1 / VOX) if (tryAt(p.x, p.y + s, p.z)) { p.y += s; this.eyeY -= s; this.stuckT = 0; return; }
    for (let r = 1 / VOX; r <= 0.6; r += 1 / VOX) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        for (const dy of [0, 1 / VOX, 2 / VOX, 4 / VOX, -1 / VOX]) if (tryAt(x, p.y + dy, z)) { p.set(x, p.y + dy, z); this.stuckT = 0; return; }
      }
    }
    if (!this.crouched) {
      this.h = HEIGHT_C;
      if (!this.hitsAt(p.x, p.y, p.z)) { this.crouched = true; this.autoLow = true; this.stuckT = 0; return; }
      this.h = HEIGHT;
    }
  }

  moveY(d) {
    const p = this.pos;
    if (!this.hitsAt(p.x, p.y + d, p.z)) { p.y += d; return true; }
    // land exactly on the voxel boundary: the lowest free one between here and where the fall
    // would have gone (a floor a few voxels thick no longer leaves the mole hovering over it)
    if (d < 0) {
      const top = Math.floor((p.y + d) * VOX + 1) / VOX;
      if (!this.hitsAt(p.x, top, p.z) && top <= p.y + 1e-6) p.y = top;
      else {
        let c = Math.floor(p.y * VOX + 1e-6) / VOX;
        if (c <= p.y + 1e-6 && !this.hitsAt(p.x, c, p.z)) {
          while (c - 1 / VOX >= p.y + d - 1e-6 && !this.hitsAt(p.x, c - 1 / VOX, p.z)) c -= 1 / VOX;
          p.y = c;
        }
      }
    } else {
      // (assist) the head clipped the edge of an overhang on the way up: slip out from under it
      if (this.assist && this.headSlip(d)) return true;
      const ceil = Math.floor((p.y + this.h + d) * VOX) / VOX - this.h - 1e-4;
      if (!this.hitsAt(p.x, ceil, p.z) && ceil >= p.y) p.y = ceil;
    }
    return false;
  }

  /** (assist) Rising into the corner of a ledge: a shift of up to two voxels (the way the mole means to go first) that clears the head. */
  headSlip(d) {
    const p = this.pos, wl = Math.hypot(this.wishX || 0, this.wishZ || 0);
    const dirs = wl > 0.2 ? [[this.wishX / wl, this.wishZ / wl]] : [];
    dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    for (let s = 1 / VOX; s <= 2 / VOX + 1e-6; s += 1 / VOX) {
      for (const [dx, dz] of dirs) {
        const x = p.x + dx * s, z = p.z + dz * s;
        if (!this.hitsAt(x, p.y, z) && !this.hitsAt(x, p.y + d, z)) { p.x = x; p.z = z; p.y += d; return true; }
      }
    }
    return false;
  }
}

export { HW, HEIGHT, EYE, HEIGHT_C, EYE_C };
