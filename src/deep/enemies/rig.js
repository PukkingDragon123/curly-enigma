// Procedural animation for the big walkers (dinosaurs, trolls, drakes, spiders, kobolds):
//
//   Legs   feet that plant on the rock and step when the body has moved on (diagonal pairs, or
//          alternating sides), lifted on an arc, with a 2-bone IK so thighs and shins bend at the
//          knee toward a hint direction. Footfalls call back (dust, thuds, camera shake).
//   Chain  a tail or a neck of nested segments that bends against turns, sways with the gait and
//          droops at rest.
//   look   turn a head toward a world point within limits, smoothed.
//
// Thigh and shin meshes are modelled hanging straight down from their pivot (the joint at the top,
// the next joint `len` metres below at (0, -len, 0)); feet are modelled flat with the pivot at the
// ankle. IK runs in each leg's parent space, so the creature's root scale (size, squash) just works.
import * as THREE from 'three';
import { VOX } from '../materials.js';
import { OPAQUE } from '../Mesher.js';
import { clamp } from '../../core/util.js';
import { wrapA } from './base.js';

const _f = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
const _k = new THREE.Vector3(), _s = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _rinv = new THREE.Matrix4();
const smooth = (t) => t * t * (3 - 2 * t);

/** Top of the floor under (x, y, z) within [y - down, y + up] (meters), or null. */
export function groundAt(w, x, y, z, up = 0.5, down = 1.2) {
  const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
  for (let vy = Math.floor((y + up) * VOX), end = Math.floor((y - down) * VOX); vy >= end; vy--) {
    if (OPAQUE[w.voxelAt(vx, vy, vz)] === 1 && OPAQUE[w.voxelAt(vx, vy + 1, vz)] !== 1) return (vy + 1) / VOX;
  }
  return null;
}

/** Point a mesh (modelled along -Y from its pivot) along `dir`, its +Z toward `side` (both parent space). */
function orient(obj, dir, side) {
  _y.copy(dir).multiplyScalar(-1).normalize();
  _z.copy(side).addScaledVector(_y, -side.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
}

export class Legs {
  /**
   * e: the creature (pos, vel, yaw, size, grounded, root, w).
   * defs: [{ parent, hip: [x, y, z] (parent space, m), l1, l2, thigh, shin, foot?, knee: [x, y, z]
   *          (parent-space hint the knee bends toward), rest: [x, z] (root space, m, the planted
   *          foot at rest), group, lift (m) }]
   * o: { stride (m), stepT (s), lead (s), onStep(leg, k), heavy }
   */
  constructor(e, defs, o = {}) {
    this.e = e;
    this.o = o;
    this.legs = defs.map((d, i) => ({
      ...d, i, hipV: new THREE.Vector3(...d.hip), kneeV: new THREE.Vector3(...d.knee),
      foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), toY: 0, p: -1, planted: true,
    }));
    this.groups = Math.max(...defs.map((d) => d.group)) + 1;
    this.active = 0; // the group allowed to step next
    this.inited = false;
    this.moving = 0;
  }

  /** Where a leg's foot wants to be (world). */
  rest(L, out) {
    const e = this.e, s = e.size * (e.emergeK ?? 1);
    const c = Math.cos(e.yaw), si = Math.sin(e.yaw);
    const rx = L.rest[0] * s, rz = L.rest[1] * s;
    const lead = (this.o.lead ?? 0.22);
    return out.set(e.pos.x + rx * c + rz * si + e.vel.x * lead, e.pos.y, e.pos.z - rx * si + rz * c + e.vel.z * lead);
  }

  /** Floor height for a foot near the body (never far above or below the creature). */
  floorY(x, z) {
    const e = this.e, s = e.size;
    const g = groundAt(e.w, x, e.pos.y + 0.3 * s, z, 0.3 * s, 0.6 * s);
    return g === null ? e.pos.y : clamp(g, e.pos.y - 0.3 * s, e.pos.y + 0.3 * s);
  }

  reset() {
    for (const L of this.legs) {
      this.rest(L, L.foot);
      L.foot.y = this.floorY(L.foot.x, L.foot.z);
      L.p = -1; L.planted = true;
    }
    this.inited = true;
  }

  update(dt) {
    const e = this.e;
    if (!this.inited) this.reset();
    const sp = Math.hypot(e.vel.x, e.vel.z);
    const stride = (this.o.stride ?? 0.3) * e.size;
    const stepT = clamp((this.o.stepT ?? 0.28) / (1 + sp * (this.o.speedK ?? 0.35)), 0.1, 0.5);
    const air = !e.grounded && !e.info.flying && (e.airT ?? 0) > 0.06;
    this.moving = sp;
    // is any leg of another group mid-step?
    let busy = -1;
    for (const L of this.legs) if (!L.planted) { busy = L.group; break; }
    for (const L of this.legs) {
      if (air) {
        // tucked: the foot hangs under the hip, a little back
        this.rest(L, _f);
        L.foot.lerp(_f.set(_f.x - e.vel.x * 0.05, e.pos.y - 0.05 * e.size + Math.max(-0.3, e.vel.y * 0.02), _f.z - e.vel.z * 0.05), Math.min(1, dt * 14));
        L.planted = true; L.p = -1;
        continue;
      }
      const want = this.rest(L, _f);
      if (L.planted) {
        const far = Math.hypot(L.foot.x - want.x, L.foot.z - want.z);
        const lim = sp > 0.08 ? stride : stride * 0.4;
        const myTurn = this.groups === 1 || busy === -1 ? L.group === this.active || far > stride * 1.6 : busy === L.group;
        if ((far > lim || Math.abs(L.foot.y - e.pos.y) > 0.35 * e.size) && myTurn) {
          L.planted = false; L.p = 0;
          L.from.copy(L.foot);
          L.toY = this.floorY(want.x, want.z);
          busy = L.group;
          this.active = (L.group + 1) % this.groups;
        }
      }
      if (!L.planted) {
        L.p = Math.min(1, L.p + dt / stepT);
        L.to.set(want.x, L.toY, want.z);
        const k = smooth(L.p);
        L.foot.lerpVectors(L.from, L.to, k);
        L.foot.y += Math.sin(L.p * Math.PI) * (L.lift ?? 0.08) * e.size * clamp(0.5 + sp * 0.4, 0.5, 1.4);
        if (L.p >= 1) {
          L.planted = true;
          L.foot.copy(L.to);
          this.o.onStep?.(L, clamp(sp / 2, 0.2, 1));
        }
      }
    }
    this.solve();
  }

  /** IK: place thighs, shins and feet. */
  solve() {
    const e = this.e;
    e.root.updateMatrixWorld(true);
    _rinv.copy(e.root.matrixWorld).invert();
    let lastParent = null;
    for (const L of this.legs) {
      if (L.parent !== lastParent) { lastParent = L.parent; _inv.copy(L.parent.matrixWorld).invert(); }
      _f.copy(L.foot).applyMatrix4(_inv);
      _h.copy(L.hipV);
      _d.subVectors(_f, _h);
      let d = _d.length();
      const max = (L.l1 + L.l2) * 0.999;
      if (d > max) { _d.multiplyScalar(max / d); d = max; _f.addVectors(_h, _d); }
      d = Math.max(d, Math.abs(L.l1 - L.l2) + 0.01);
      _d.normalize();
      const ca = clamp((L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
      _w.copy(L.kneeV).addScaledVector(_d, -L.kneeV.dot(_d));
      if (_w.lengthSq() < 1e-6) _w.set(0, 0, 1);
      _w.normalize();
      _k.copy(_d).multiplyScalar(ca).addScaledVector(_w, sa); // thigh direction
      L.thigh.position.copy(_h);
      orient(L.thigh, _k, _w);
      const kx = _h.x + _k.x * L.l1, ky = _h.y + _k.y * L.l1, kz = _h.z + _k.z * L.l1;
      _s.set(_f.x - kx, _f.y - ky, _f.z - kz).normalize(); // shin direction
      L.shin.position.set(kx, ky, kz);
      orient(L.shin, _s, _w);
      if (L.foot3) {
        // the foot sits where the leg reaches (the planted point when it can), level with the creature
        L.foot3.position.copy(_f).applyMatrix4(L.parent.matrixWorld).applyMatrix4(_rinv);
        L.foot3.rotation.set(L.planted ? 0 : -0.35, L.footYaw ?? 0, 0);
      }
    }
  }
}

/**
 * A chain of nested segment groups (tail, neck). Bends against the creature's turning, sways with
 * its speed, droops a little. segs: [Object3D] from the root outward.
 * o: { sway (rad), swayHz, lag (rad per rad/s of turning), droop (rad), pitch (extra up/down) }
 */
export class Chain {
  constructor(segs, o = {}) {
    this.segs = segs;
    this.o = o;
    this.bend = 0;
    this.lastYaw = null;
    this.t = Math.random() * 10;
  }
  update(dt, e, extra = {}) {
    const o = this.o;
    this.t += dt;
    const yaw = e.yaw;
    const turn = this.lastYaw === null ? 0 : wrapA(yaw - this.lastYaw) / Math.max(dt, 1e-3);
    this.lastYaw = yaw;
    this.bend += (clamp(-turn * (o.lag ?? 0.12), -0.6, 0.6) - this.bend) * Math.min(1, dt * 6);
    const sp = Math.hypot(e.vel.x, e.vel.z);
    const amp = (o.sway ?? 0.12) * (0.4 + Math.min(1.2, sp * 0.5)) + (extra.whip || 0);
    const n = this.segs.length;
    this.segs.forEach((g, i) => {
      const k = (i + 1) / n;
      g.rotation.y = this.bend * (0.6 + k) / n * 2 + Math.sin(this.t * (o.swayHz ?? 5) - i * 0.7) * amp * k + (extra.yaw || 0) / n;
      g.rotation.x = (o.droop ?? 0.05) + (extra.pitch || 0) / n + Math.sin(this.t * (o.swayHz ?? 5) * 0.5 - i) * 0.02;
    });
  }
}

/** Turn obj (rotation.y, rotation.x) toward a world point, within limits, smoothed. */
export function look(obj, target, dt, { yaw = 0.9, pitch = 0.5, rate = 6, base = 0, basePitch = 0 } = {}) {
  const p = obj.parent;
  p.updateWorldMatrix(true, false);
  _f.copy(target).applyMatrix4(_inv.copy(p.matrixWorld).invert()).sub(obj.position);
  const a = clamp(Math.atan2(_f.x, _f.z) - base, -yaw, yaw) + base;
  const b = clamp(-Math.atan2(_f.y, Math.hypot(_f.x, _f.z)), -pitch, pitch) + basePitch;
  const k = Math.min(1, dt * rate);
  obj.rotation.y += (a - obj.rotation.y) * k;
  obj.rotation.x += (b - obj.rotation.x) * k;
}
