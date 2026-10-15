// Nugget, the hen who fell down the hole with the mole, trots along the tunnels: she keeps a
// step behind, hops up ledges, flutters down drops, clucks at ore that's showing in the rock and
// pecks at it, and pops back to the mole's heels when she gets left behind out of sight.
import * as THREE from 'three';
import { makeChicken } from '../gfx/characters.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { VOX } from './materials.js';

const HW = 0.1, H = 0.3, GRAV = 12;
const _v = new THREE.Vector3();

export class Nugget {
  /** ctx: { scene3, world, player, audio, fx, owner } */
  constructor(ctx) {
    this.c = ctx;
    this.rig = makeChicken({ scale: 0.3, kind: 'toon' });
    this.root = this.rig.root;
    this.root.traverse((o) => { if (o.isMesh) o.layers.enable(LAYER_OUTLINE); });
    ctx.scene3.add(this.root);
    // she's lit by real lights (the terrain shades itself): the helmet lamp and the cave's glow
    this.amb = new THREE.AmbientLight(0xffffff, 0.6);
    this.lamp = new THREE.PointLight(0xffd8a8, 3, 9, 1.4);
    ctx.scene3.add(this.amb, this.lamp);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.stuck = 0;
    this.cluckT = 2;
    this.goal = null; // { x, y, z, d } an ore deposit she's pointing out
    this.scanT = 0.5;
    this.side = 0;
    this.peckT = 0;
    this.placeNear(ctx.player.pos, 0.8);
  }

  solid(x, y, z) { return this.c.world.solidAt(x, y, z); }
  hits(x, y, z) {
    for (const oy of [0.03, H * 0.5, H]) for (const ox of [-HW, HW]) for (const oz of [-HW, HW]) if (this.solid(x + ox, y + oy, z + oz)) return true;
    return false;
  }

  /** Put her on free ground near p (behind the mole if possible). */
  placeNear(p, dist) {
    const pl = this.c.player;
    const back = Math.atan2(Math.sin(pl.yaw), Math.cos(pl.yaw));
    for (let i = 0; i < 16; i++) {
      const a = back + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.5;
      const x = p.x + Math.sin(a) * dist, z = p.z + Math.cos(a) * dist;
      for (let dy = 0.6; dy >= -0.6; dy -= 1 / VOX) {
        const y = p.y + dy;
        if (!this.hits(x, y, z) && this.solid(x, y - 0.06, z)) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); return true; }
      }
    }
    this.pos.copy(p);
    return false;
  }

  update(dt) {
    const pl = this.c.player, o = this.c.owner, w = this.c.world;
    const p = this.pos, v = this.vel;
    // lights follow the helmet lamp and the zone's ambient glow
    const eye = pl.eye(_v);
    this.lamp.position.copy(eye);
    const U = o.U;
    this.amb.color.copy(U.ambient.value).multiplyScalar(5);
    // where to go: an exposed deposit near the mole, else a step behind the mole
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.8;
      this.goal = null;
      let best = 3.2;
      for (const d of w.depositsNear(pl.pos.x, pl.pos.y + 0.4, pl.pos.z, 3.5)) {
        const s = w.depState(d);
        if (!s.seen || s.taken) continue;
        const dd = Math.hypot(d.x - pl.pos.x, d.z - pl.pos.z);
        if (dd < best) { best = dd; this.goal = d; }
      }
    }
    let tx, tz, near;
    if (this.goal) {
      // stand just short of it, on the mole's side
      const dx = pl.pos.x - this.goal.x, dz = pl.pos.z - this.goal.z, l = Math.hypot(dx, dz) || 1;
      tx = this.goal.x + (dx / l) * 0.35; tz = this.goal.z + (dz / l) * 0.35;
      near = 0.15;
    } else {
      // trailing behind while the mole walks; when it stops she comes round to its side, in
      // view at the bottom of the screen (whichever side has room), clear of the digging
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      const rx = -fz, rz = fx;
      if (pl.speed > 0.6) { tx = pl.pos.x - fx * 0.9; tz = pl.pos.z - fz * 0.9; this.side = 0; }
      else {
        this.sideT = (this.sideT || 0) - dt;
        if (!this.side || this.sideT <= 0) {
          // keep the side she's on while it still has room
          this.sideT = 1;
          const fits = (k) => !this.hits(pl.pos.x + fx * 1.05 + rx * 0.5 * k, pl.pos.y + 0.02, pl.pos.z + fz * 1.05 + rz * 0.5 * k);
          const pref = this.side === 1 ? 1 : -1; // the left, clear of the pick hand
          this.side = fits(pref) ? pref : fits(-pref) ? -pref : 2;
        }
        const k = this.side === 2 ? 0 : this.side, f = this.side === 2 ? -0.8 : 1.05;
        tx = pl.pos.x + fx * f + rx * 0.5 * k; tz = pl.pos.z + fz * f + rz * 0.5 * k;
      }
      near = 0.3;
    }
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    const far = Math.hypot(pl.pos.x - p.x, pl.pos.y - p.y, pl.pos.z - p.z);
    let speed = 0;
    if (dist > near) speed = far > 3 ? 3.6 : dist > 1.2 ? 2.4 : 1.4;
    const ux = dist > 1e-4 ? dx / dist : 0, uz = dist > 1e-4 ? dz / dist : 0;
    const ax = this.grounded ? 20 : 6;
    v.x += THREE.MathUtils.clamp(ux * speed - v.x, -ax * dt, ax * dt);
    v.z += THREE.MathUtils.clamp(uz * speed - v.z, -ax * dt, ax * dt);
    v.y -= GRAV * dt;
    // fluttering down a drop
    if (!this.grounded && v.y < -2.2) { v.y = -2.2; if (this.rig.flapT <= 0) this.rig.flap(0.5); }
    // move per axis; a blocked step hops up if there's headroom
    let blocked = false;
    const nx = p.x + v.x * dt;
    if (this.hits(nx, p.y, p.z)) { blocked = true; v.x = 0; } else p.x = nx;
    const nz = p.z + v.z * dt;
    if (this.hits(p.x, p.y, nz)) { blocked = true; v.z = 0; } else p.z = nz;
    const ny = p.y + v.y * dt;
    if (this.hits(p.x, ny, p.z)) {
      if (v.y < 0) { this.grounded = true; p.y = Math.ceil(ny * VOX) / VOX - 0.0001; if (this.hits(p.x, p.y, p.z)) p.y += 1 / VOX; }
      v.y = 0;
    } else { p.y = ny; this.grounded = false; }
    if (blocked && this.grounded && speed > 0) {
      if (!this.hits(p.x + ux * 0.15, p.y + 0.45, p.z + uz * 0.15)) { v.y = 4.2; this.grounded = false; this.rig.flap(0.35); }
      else this.stuck += dt;
    } else if (speed > 0 && dist > near) this.stuck = Math.max(0, this.stuck - dt);
    // left behind (and not on screen): pop back to the mole's heels with a little flutter
    const onScreen = this.inView();
    if ((far > 9 || this.stuck > 2.5 || p.y < pl.pos.y - 6) && !onScreen) {
      this.placeNear(pl.pos, 0.8);
      this.stuck = 0;
    }
    // animation
    const sp = Math.hypot(v.x, v.z);
    this.rig.play(sp > 2.6 ? 'run' : sp > 0.25 ? 'walk' : 'idle');
    if (sp > 0.25) this.rig.face(Math.atan2(v.x, v.z));
    else if (this.goal) this.rig.face(Math.atan2(this.goal.x - p.x, this.goal.z - p.z));
    // ore spotted: cluck and peck at it
    this.cluckT -= dt;
    if (this.goal && dist < 0.4) {
      this.peckT -= dt;
      if (this.peckT <= 0) { this.peckT = 0.9 + Math.random() * 0.8; this.rig.peck(); }
      if (this.cluckT <= 0) { this.cluckT = 3 + Math.random() * 3; this.c.audio.play('cluck', { vol: 0.5 }); }
    } else if (this.cluckT <= 0) {
      this.cluckT = 6 + Math.random() * 10;
      if (far < 4) this.c.audio.play('cluck', { vol: 0.3 });
    }
    this.root.position.copy(p);
    this.rig.update(dt);
  }

  inView() {
    const cam = this.c.owner.camera;
    _v.copy(this.pos).project(cam);
    return _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
  }

  dispose() {
    const s = this.c.scene3;
    s.remove(this.root, this.amb, this.lamp);
    this.rig.dispose();
    this.lamp.dispose?.();
  }
}
