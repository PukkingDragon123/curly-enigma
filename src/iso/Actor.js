// Walking characters for the iso scenes: a rig in a holder group with a blob
// shadow, velocity steering with collision, path following, and Nugget's follow AI.
import * as THREE from 'three';
import { shadowTexture } from './pixel.js';
import { clamp, rand, chance } from '../core/util.js';

let shadowGeo = null, shadowMat = null;
function shadowParts() {
  if (!shadowGeo) {
    shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    shadowGeo.userData.shared = true;
    shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 });
    shadowMat.userData.shared = true;
  }
  return [shadowGeo, shadowMat];
}

let nextId = 1;
const _v = new THREE.Vector3();

export class Actor {
  constructor(rig, opts = {}) {
    this.rig = rig;
    this.obj = new THREE.Group();
    this.body = new THREE.Group(); // extra offset/tilt for sitting, lying, bobbing
    this.body.add(rig.root);
    this.obj.add(this.body);
    this.pos = this.obj.position;
    this.pos.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.vx = 0;
    this.vz = 0;
    this.speedNow = 0;
    this.radius = opts.radius ?? 0.26;
    this.name = opts.name || '';
    this.voice = opts.voice ?? 300;
    this.headY = opts.headY ?? (rig.height ? rig.height + 0.12 : 0.8);
    this.key = 'iso-a' + nextId++;
    this.path = null;
    this.pathI = 0;
    this.stuckT = 0;
    this.collide = opts.collide ?? true;
    const [g, m] = shadowParts();
    const sh = new THREE.Mesh(g, m);
    const ss = opts.shadow ?? 0.62;
    sh.scale.set(ss, 1, ss * 0.85);
    sh.position.y = 0.012;
    sh.renderOrder = 2;
    this.obj.add(sh);
    this.shadow = sh;
    if (opts.yaw !== undefined) rig.face(opts.yaw, true);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  headPos(out = _v) {
    return out.set(this.pos.x, this.pos.y + this.body.position.y + this.headY, this.pos.z);
  }

  faceToward(x, z, instant = false) {
    this.rig.face(Math.atan2(x - this.pos.x, z - this.pos.z), instant);
  }

  dist(x, z) { return Math.hypot(x - this.pos.x, z - this.pos.z); }

  /**
   * Steer toward a desired world velocity with acceleration, collide, and drive the walk/run animation.
   * Returns the actual ground speed.
   */
  drive(dt, tvx, tvz, map, o = {}) {
    const k = 1 - Math.exp(-(o.accel ?? 12) * dt);
    this.vx += (tvx - this.vx) * k;
    this.vz += (tvz - this.vz) * k;
    const px = this.pos.x, pz = this.pos.z;
    const sp0 = Math.hypot(this.vx, this.vz);
    if (sp0 > 0.01) {
      if (map && this.collide) map.move(this.pos, this.vx * dt, this.vz * dt, this.radius);
      else { this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; }
    }
    const sp = dt > 0 ? Math.hypot(this.pos.x - px, this.pos.z - pz) / dt : 0;
    this.speedNow = sp;
    if (sp0 > 0.2 && o.face !== false) this.rig.face(Math.atan2(this.vx, this.vz));
    if (o.anim !== false) {
      const r = this.rig;
      if (sp > 0.25) {
        const run = sp > (o.runAt ?? 3.3);
        r.play(o.walkAnim || (run ? 'run' : 'walk'), run ? sp / 4.6 : clamp(sp / 2.4, 0.55, 1.4));
      } else if (r.state === 'walk' || r.state === 'run' || (o.walkAnim && r.state === o.walkAnim)) r.play(o.idleAnim || 'idle');
    }
    return sp;
  }

  /** Set a path (array of {x,z}). */
  setPath(path) {
    this.path = path && path.length ? path : null;
    this.pathI = 0;
    this.stuckT = 0;
  }

  /**
   * Follow the current path. Returns 'done' when the end is reached, 'stuck' when blocked, else 'moving'.
   */
  followPath(dt, map, speed, o = {}) {
    if (!this.path) { this.drive(dt, 0, 0, map, o); return 'done'; }
    const wp = this.path[this.pathI];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const last = this.pathI === this.path.length - 1;
    if (d < (last ? 0.12 : 0.35)) {
      this.pathI++;
      if (this.pathI >= this.path.length) { this.path = null; this.drive(dt, 0, 0, map, o); return 'done'; }
      return 'moving';
    }
    const s = last ? Math.min(speed, d * 3 + 0.4) : speed;
    let vx = (dx / d) * s, vz = (dz / d) * s;
    if (o.avoid) { vx += o.avoid.x; vz += o.avoid.z; }
    const sp = this.drive(dt, vx, vz, map, o);
    if (sp < speed * 0.2) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; return 'stuck'; }
    return 'moving';
  }

  update(dt) {
    this.rig.update(dt);
    if (this.after) this.after(dt);
  }
}

/**
 * Nugget the chicken: follows the player with a lazy lag, pecks and looks around
 * when idle, clucks now and then, and can be told to nap at a spot.
 */
export class NuggetAI {
  constructor(actor, scene) {
    this.a = actor;
    this.scene = scene;
    this.mode = 'follow';
    this.peckT = rand(1, 3);
    this.lookT = rand(1, 3);
    this.cluckT = rand(4, 9);
    this.wanderT = rand(2, 5);
    this.repathT = 0;
    this.side = chance(0.5) ? 1 : -1;
    this.idleFor = 0;
    this.napSpot = null; // {x, z, yaw}
    this.napT = 0;
    this.leash = 1.25;
    this.home = null; // {x0,z0,x1,z1} wander bounds when the player is idle (home scene)
  }

  /** Send Nugget to nap at a spot (e.g. the coop). */
  nap(spot, secs = 12) {
    this.napSpot = spot;
    this.napT = secs;
    this.mode = 'toNap';
    const map = this.scene.map;
    this.a.setPath(map.findPath(this.a.x, this.a.z, spot.x, spot.z, 0.18));
  }

  wake() {
    if (this.mode === 'nap' || this.mode === 'toNap') {
      this.mode = 'follow';
      this.a.rig.play('idle');
      this.a.collide = true;
      this.a.body.position.y = 0;
    }
  }

  update(dt, player) {
    const a = this.a, rig = a.rig, map = this.scene.map;
    const audio = this.scene.game.audio;
    const near = a.dist(player.x, player.z);
    // occasional clucks when close by
    this.cluckT -= dt;
    if (this.cluckT <= 0) {
      this.cluckT = rand(6, 14);
      if (near < 7 && this.mode !== 'nap') audio.play('cluck', { n: 1 + Math.floor(Math.random() * 3), pitch: 0.95 + Math.random() * 0.15 });
    }
    if (this.mode === 'toNap') {
      const st = a.followPath(dt, map, 1.6, { accel: 10 });
      if (st !== 'moving') {
        const s = this.napSpot;
        if (Math.hypot(s.x - a.x, s.z - a.z) < 1.75) {
          // hop up into the nest
          this.mode = 'nap';
          a.collide = false;
          a.pos.x = s.x; a.pos.z = s.z;
          rig.face(s.yaw ?? 0, true);
          rig.flap(0.4);
        } else this.mode = 'follow';
      }
      return;
    }
    if (this.mode === 'nap') {
      a.vx = a.vz = 0;
      rig.play('sit');
      if (this.napSpot && this.napSpot.y) a.body.position.y = this.napSpot.y;
      this.napT -= dt;
      if (this.napT <= 0 || (near < 1.4 && player.speedNow > 2.5)) this.wake();
      return;
    }
    if (this.mode === 'petted') {
      this.pettedT -= dt;
      a.drive(dt, 0, 0, map);
      if (this.pettedT <= 0) this.mode = 'follow';
      return;
    }
    // follow target: a little behind and to the side of the player
    const fy = player.rig.facing ?? 0;
    const bx = -Math.sin(fy), bz = -Math.cos(fy);
    let tx = player.x + bx * 0.85 + bz * 0.45 * this.side;
    let tz = player.z + bz * 0.85 - bx * 0.45 * this.side;
    if (!map.freeAt(tx, tz, 0.2)) { tx = player.x + bx * 0.6; tz = player.z + bz * 0.6; }
    const dx = tx - a.x, dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (near > 12) { // fell far behind (teleport, cutscene): hop over
      a.pos.x = tx; a.pos.z = tz;
      a.setPath(null);
      return;
    }
    const playerMoving = player.speedNow > 0.3;
    if (playerMoving) this.idleFor = 0; else this.idleFor += dt;
    if (d > this.leash || (playerMoving && d > 0.6)) {
      const speed = d > 3.2 ? 4.4 : d > 1.8 ? 3.2 : 2.0;
      this.repathT -= dt;
      if (!map.los(a.x, a.z, tx, tz, 0.18)) {
        if (!a.path || this.repathT <= 0) { a.setPath(map.findPath(a.x, a.z, tx, tz, 0.18)); this.repathT = 0.6; }
        if (a.followPath(dt, map, speed, { runAt: 3.0 }) !== 'moving') a.setPath(null);
      } else {
        a.setPath(null);
        a.drive(dt, (dx / d) * speed, (dz / d) * speed, map, { runAt: 3.0 });
      }
      return;
    }
    // idle: peck, look around, little wanders while the player stands still
    if (this.home && this.idleFor > 6) {
      this.wanderT -= dt;
      if (!a.path && this.wanderT <= 0) {
        this.wanderT = rand(3, 7);
        const h = this.home;
        const p = map.randomFree(Math.random, h.x0, h.z0, h.x1, h.z1, 0.2);
        if (p) a.setPath(map.findPath(a.x, a.z, p.x, p.z, 0.18));
      }
      if (a.path) { a.followPath(dt, map, 1.3); return; }
    }
    a.drive(dt, 0, 0, map);
    this.peckT -= dt;
    if (this.peckT <= 0) { this.peckT = rand(0.8, 3.2); rig.peck(); }
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = rand(1.2, 3.5);
      rig.face(chance(0.5) ? Math.atan2(player.x - a.x, player.z - a.z) : rig.facing + rand(-1.5, 1.5));
      if (chance(0.15)) this.side = -this.side;
    }
  }

  petted() {
    this.wake();
    this.mode = 'petted';
    this.pettedT = 1.2;
    this.a.rig.flap(0.7);
  }
}
