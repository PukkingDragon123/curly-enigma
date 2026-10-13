// Isometric orthographic camera rig: fixed yaw/pitch, smooth follow, wheel zoom,
// pixel-snapped so static voxels never shimmer, plus mouse → ground raycasts.
import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';

const _f = new THREE.Vector3();
const _ndc = new THREE.Vector2();

export class IsoCamera {
  /**
   * zoom = world units visible vertically. dist = camera distance from the focus point.
   */
  constructor({ yaw = Math.PI / 4, pitch = (30 * Math.PI) / 180, zoom = 9, minZoom = 6, maxZoom = 13, dist = 60 } = {}) {
    this.cam = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 1, dist * 2.6);
    this.yaw = yaw;
    this.pitch = pitch;
    this.dist = dist;
    this.zoom = zoom;
    this.zoomGoal = zoom;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.aspect = 16 / 9;
    this.pxH = 360;
    this.focus = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.bounds = null; // {minX, maxX, minZ, maxZ} clamp for the focus point
    this.follow = 5.5;
    this.shake = 0;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    this.back = new THREE.Vector3(Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp); // focus → camera
    this.right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // screen right, on the ground
    this.upv = new THREE.Vector3().crossVectors(this.back, this.right).normalize(); // screen up in 3D
    this.groundUp = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); // "up the screen" on the ground
    this.ray = new THREE.Raycaster();
  }

  resize(w, h) {
    this.aspect = w / h;
    this.pxH = h;
    this.apply();
  }

  /** Jump straight to a point (no easing). */
  snap(v) {
    this.goal.copy(v);
    this.focus.copy(this.clampGoal(v, _f));
    this.apply();
  }

  clampGoal(v, out) {
    out.copy(v);
    const b = this.bounds;
    if (b) {
      out.x = clamp(out.x, b.minX, b.maxX);
      out.z = clamp(out.z, b.minZ, b.maxZ);
    }
    return out;
  }

  zoomBy(steps) {
    this.zoomGoal = clamp(this.zoomGoal * Math.pow(1.13, steps), this.minZoom, this.maxZoom);
  }

  update(dt) {
    this.zoom = damp(this.zoom, this.zoomGoal, 10, dt);
    const g = this.clampGoal(this.goal, _f);
    this.focus.x = damp(this.focus.x, g.x, this.follow, dt);
    this.focus.y = damp(this.focus.y, g.y, this.follow, dt);
    this.focus.z = damp(this.focus.z, g.z, this.follow, dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    this.apply();
  }

  /** World units visible vertically: zoom, stretched on tall screens so a phone held upright keeps a sensible width. */
  get viewH() {
    return Math.max(this.zoom, (this.zoom * 0.85) / Math.max(0.2, this.aspect));
  }

  apply() {
    const c = this.cam;
    const hh = this.viewH / 2, hw = hh * this.aspect;
    if (c.top !== hh || c.right !== hw) {
      c.left = -hw; c.right = hw; c.top = hh; c.bottom = -hh;
      c.updateProjectionMatrix();
    }
    const upp = this.viewH / Math.max(1, this.pxH); // world units per render pixel
    const f = _f.copy(this.focus);
    if (this.shake > 0) {
      const s = this.shake * 0.12;
      f.addScaledVector(this.right, (Math.random() - 0.5) * s).addScaledVector(this.upv, (Math.random() - 0.5) * s);
    }
    const a = f.dot(this.right), b = f.dot(this.upv);
    f.addScaledVector(this.right, Math.round(a / upp) * upp - a).addScaledVector(this.upv, Math.round(b / upp) * upp - b);
    c.position.copy(f).addScaledVector(this.back, this.dist);
    c.lookAt(f);
    c.updateMatrixWorld();
  }

  /** Screen-relative ground direction for input (ax: right, ay: up the screen). */
  moveDir(ax, ay, out) {
    out.set(0, 0, 0).addScaledVector(this.right, ax).addScaledVector(this.groundUp, ay);
    const l = Math.hypot(out.x, out.z);
    if (l > 1) out.multiplyScalar(1 / l);
    return out;
  }

  /** Intersect the mouse ray (NDC) with the horizontal plane y = h. */
  groundAt(nx, ny, h, out) {
    _ndc.set(nx, ny);
    this.ray.setFromCamera(_ndc, this.cam);
    const r = this.ray.ray;
    const t = (h - r.origin.y) / (r.direction.y || -1e-6);
    return out.copy(r.origin).addScaledVector(r.direction, t);
  }

  /** Intersect the mouse ray with an axis-aligned vertical plane (axis 'x' or 'z' = value). */
  planeAt(nx, ny, axis, value, out) {
    _ndc.set(nx, ny);
    this.ray.setFromCamera(_ndc, this.cam);
    const r = this.ray.ray;
    const o = axis === 'x' ? r.origin.x : r.origin.z;
    const d = axis === 'x' ? r.direction.x : r.direction.z;
    if (Math.abs(d) < 1e-6) return null;
    const t = (value - o) / d;
    return out.copy(r.origin).addScaledVector(r.direction, t);
  }

  /** Signed depth of a world point along the view direction (bigger = farther from camera). */
  depthOf(v) {
    return -(v.x * this.back.x + v.y * this.back.y + v.z * this.back.z);
  }
}
