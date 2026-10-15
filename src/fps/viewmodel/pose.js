// Small pose helpers for the first-person view model: a pose is a camera-space position plus
// an orientation built from two directions (where the held handle points and where the paw
// points), which is far easier to author than Euler angles.
import * as THREE from 'three';

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Orientation whose local +Y = up and local -Z ≈ fwd (orthogonalised against up). */
export function aim(up, fwd, out = new THREE.Quaternion()) {
  _y.set(up[0], up[1], up[2]).normalize();
  _z.set(-fwd[0], -fwd[1], -fwd[2]);
  _z.addScaledVector(_y, -_z.dot(_y)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Orientation whose local +Z = dir, twisted so local +Y follows the up hint. */
export function aimZ(dir, upHint, out = new THREE.Quaternion()) {
  _z.copy(dir).normalize();
  _x.crossVectors(upHint, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

export class Pose {
  constructor(p = [0, 0, 0], up = [0, 1, 0], fwd = [0, 0, -1]) {
    this.p = new THREE.Vector3(p[0], p[1], p[2]);
    this.q = aim(up, fwd);
  }
  copy(o) { this.p.copy(o.p); this.q.copy(o.q); return this; }
  clone() { return new Pose().copy(this); }
  /** this = lerp(a, b, k) */
  blend(a, b, k) { this.p.lerpVectors(a.p, b.p, k); this.q.slerpQuaternions(a.q, b.q, k); return this; }
  /** Blend toward o by k. */
  mix(o, k) { if (k <= 0) return this; if (k >= 1) return this.copy(o); this.p.lerp(o.p, k); this.q.slerp(o.q, k); return this; }
  /** Rotate in the pose's own frame. */
  rot(x, y = 0, z = 0) { _e.set(x, y, z); this.q.multiply(_q.setFromEuler(_e)); return this; }
  move(x, y, z) { this.p.x += x; this.p.y += y; this.p.z += z; return this; }
  /** Mirror across the YZ plane (right hand ↔ left hand). */
  mirror() { this.p.x = -this.p.x; this.q.set(this.q.x, -this.q.y, -this.q.z, this.q.w); return this; }
  /** World point of a local offset. */
  point(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyQuaternion(this.q).add(this.p); }
}

export const P = (p, up, fwd) => new Pose(p, up, fwd);
export const mirrored = (pose) => pose.clone().mirror();

/** A damped spring toward a target (semi-implicit Euler). */
export class Spring {
  constructor(k = 140, d = 16) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  step(dt, target = 0) {
    const n = Math.max(1, Math.ceil(dt / 0.012));
    const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.d * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  kick(v) { this.v += v; return this; }
}

export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) * (1 - t));
export const easeIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Smooth noise in [-1, 1] (sum of sines, deterministic). */
export const wobble = (t, s = 0) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.1 + s * 2.3) * 0.3 + Math.sin(t * 5.3 + s * 0.7) * 0.2;
