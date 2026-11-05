// Walking characters for the iso scenes: a rig in a holder group with a blob
// shadow, velocity steering with collision, path following.
import * as THREE from 'three';
import { shadowTexture } from './pixel.js';
import { clamp } from '../core/util.js';

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
