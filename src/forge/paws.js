// The smith's own paws in first person: what each paw is doing at the forge, turned into view-model
// targets every frame (vm.drive). Targets are world points (the tongs bite the billet's tang, the
// right paw grips the bellows pull or swings the hammer onto the aimed spot); vm.toView() maps
// them into the overlay camera so the drawn paws sit exactly on the world objects.
//
//   paws.set('L', { mode: 'tongs', at: () => worldPoint, from: [x, y, z] (view-space paw spot) })
//   paws.set('R', { mode: 'pull' })                               // the bellows' T-handle
//   paws.set('R', { mode: 'hammer', at: () => worldPoint, theta: () => radians })  // 0 = contact
//   paws.set('R', { mode: 'hold', at: () => worldPoint, up: () => worldDir })       // a grip in the fist
//   paws.set(side, { mode: 'low' }) · paws.set(side, null) (the view model's own pose)
import * as THREE from 'three';
import { VMV, HAMMER_FACE, TONGS_JAW } from '../fps/ViewModel.js';
import { aim } from '../fps/viewmodel/pose.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(); // target() outputs (never used as scratch inside)
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
// paw spots in view space (meters, the overlay camera looks down -z)
const R_PULL_FWD = [-0.1, -0.85, -0.5];
const L_SPOT = [-0.15, -0.27, -0.24];
const R_SPOT = [0.17, -0.25, -0.3];
const LOW = { R: [0.2, -0.42, -0.24], L: [-0.2, -0.42, -0.24] };
const ELBOW = [0.24, -0.36, -0.12];
const ZERO = [0, 0, 0];

class Hand {
  constructor(side) {
    this.side = side;
    this.spec = null;
    this.p = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.p0 = new THREE.Vector3();
    this.q0 = new THREE.Quaternion();
    this.blend = 1; // 0..1 from the previous pose to the current target
    this.w = 0; // drive weight
    this.tool = true;
    this.grip = true;
    this.has = false;
    this.dip = 0;
    this.pendingTool = null;
    this.at = [0, 0, 0]; // the tool point that p stands for (voxels)
  }
}

export class Paws {
  constructor(scene) {
    this.sc = scene;
    this.H = { R: new Hand('R'), L: new Hand('L') };
    this.jaw = 0.25; // tongs opening
    this.heat = 0; // glow on the tong bits (0..1)
    this.smoothAt = { R: new THREE.Vector3(), L: new THREE.Vector3() };
    this.atInit = { R: false, L: false };
  }

  get vm() { return this.sc.rig?.vm; }

  /** Give a paw something to do (see the header); null hands it back to the view model. */
  set(side, spec) {
    const h = this.H[side];
    if (spec && h.spec && spec.mode === h.spec.mode && spec.mode !== 'hold') { h.spec = spec; return; }
    h.spec = spec;
    if (h.has) { h.p0.copy(h.p); h.q0.copy(h.q); h.blend = 0; }
    this.atInit[side] = false;
    const tool = spec ? toolOf(side, spec.mode) : true;
    if (h.has && tool !== h.tool) h.pendingTool = tool; // swap what's in the paw at the bottom of a dip
    else h.tool = tool;
  }

  mode(side) { return this.H[side].spec?.mode || null; }

  clear() { this.set('R', null); this.set('L', null); }

  /** World point → view space (overlay camera). */
  view(p, out) { return this.vm.toView(p, this.sc.camera, out); }
  viewDir(d, out) { return this.vm.toView(d, this.sc.camera, out, true); }

  update(dt) {
    const vm = this.vm;
    if (!vm) return;
    const Ls = 1; // steered paws are drawn at true size (vm.driveScale)
    const drive = { k: 1 };
    let any = false;
    for (const side of ['R', 'L']) {
      const h = this.H[side];
      const spec = h.spec;
      const want = spec ? 1 : 0;
      h.w += (want - h.w) * Math.min(1, dt * 10);
      if (!spec && h.w < 0.01) { h.has = false; continue; }
      if (spec) {
        this.target(side, spec, Ls, dt, _tp, _tq);
        if (!h.has) { h.p.copy(_tp); h.q.copy(_tq); h.has = true; h.blend = 1; }
        else if (h.blend < 1) {
          // mode change: glide over (dipping out of view when the paw swaps what it holds)
          h.blend = Math.min(1, h.blend + dt / (h.pendingTool !== null ? 0.42 : 0.28));
          const k = ease(h.blend);
          h.p.lerpVectors(h.p0, _tp, k);
          h.q.slerpQuaternions(h.q0, _tq, k);
          if (h.pendingTool !== null) {
            const dip = Math.sin(Math.min(1, h.blend) * Math.PI);
            h.p.y -= dip * 0.22;
            h.p.z += dip * 0.06;
            if (h.blend > 0.5) { h.tool = h.pendingTool; h.pendingTool = null; }
          }
        } else { h.p.copy(_tp); h.q.copy(_tq); }
        h.grip = true;
      }
      any = true;
      drive[side] = { p: h.p, q: h.q, at: h.at, grip: h.grip, tool: h.tool, k: h.w };
    }
    vm.drive = any ? drive : null;
    vm.jaw = this.jaw;
  }

  /** The pose (view space) of the hand's tool point for a spec: it lands on the target. */
  target(side, spec, Ls, dt, outP, outQ) {
    const h = this.H[side];
    const mode = spec.mode;
    h.at = mode === 'tongs' ? TONGS_JAW : mode === 'hammer' ? HAMMER_FACE : ZERO;
    if (mode === 'low') {
      outP.set(...LOW[side]);
      aim([side === 'R' ? -0.2 : 0.2, 1, 0.3], [side === 'R' ? -0.5 : 0.5, -0.1, -1], outQ);
      return;
    }
    if (mode === 'pull') {
      // the fist closes round the T-handle's crossbar (it runs across, along world x)
      const g = this.view(this.sc.W.pullGrip(_b), _b);
      const bar = this.viewDir(_c.set(1, 0, 0), _c);
      aim([bar.x, bar.y, bar.z], R_PULL_FWD, outQ);
      outP.copy(g);
      return;
    }
    // smoothed world target (keeps the paw from snapping when the aim steps a column)
    const raw = spec.at();
    const sm = this.smoothAt[side];
    if (!this.atInit[side] || spec.snap) { sm.copy(raw); this.atInit[side] = true; }
    else sm.lerp(raw, 1 - Math.exp(-dt * (spec.rate ?? 22)));
    const T = this.view(sm, _b);
    if (mode === 'tongs') {
      // the reins run from a comfortable paw spot to the bite; the jaws open up and down
      const from = _c.set(...(spec.from || L_SPOT));
      const dir = _d.subVectors(T, from).normalize();
      const up = this.viewDir(_a.copy(spec.open ? spec.open() : UP), _a);
      up.addScaledVector(dir, -up.dot(dir)).normalize(); // jaw opening axis, ⟂ the reins
      // rolled a little so both reins show (they'd hide behind each other seen straight on)
      up.applyAxisAngle(dir, spec.roll ?? 1.1);
      // aim(): local +Y = dir, local -Z = fwd; we want local +X = up → fwd = dir × up
      const fwd = _c.crossVectors(dir, up);
      aim([dir.x, dir.y, dir.z], [fwd.x, fwd.y, fwd.z], outQ);
      outP.copy(T);
      return;
    }
    if (mode === 'hammer') {
      // contact pose: the long handle runs from the paw (low right) up to the head on the work,
      // the face looking down onto it
      const from = _c.set(...(spec.from || R_SPOT));
      const handle = _d.subVectors(T, from);
      handle.y = handle.y * 0.6 + 0.04;
      handle.normalize();
      const down = this.viewDir(_a.copy(DOWN), _a);
      down.addScaledVector(handle, -down.dot(handle)).normalize();
      aim([handle.x, handle.y, handle.z], [down.x, down.y, down.z], outQ);
      outP.copy(T);
      // the swing: the wrist cocks the head back and the forearm lifts about the elbow (low right)
      const th = spec.theta ? spec.theta() : 0.5;
      if (th) {
        const grip = _c.set(HAMMER_FACE[0], HAMMER_FACE[1], HAMMER_FACE[2]).multiplyScalar(VMV * Ls).applyQuaternion(outQ);
        grip.subVectors(outP, grip);
        const axis = _d.set(1, 0, 0).applyQuaternion(outQ).normalize();
        _q2.setFromAxisAngle(axis, th * 0.7);
        outP.sub(grip).applyQuaternion(_q2).add(grip);
        outQ.premultiply(_q2);
        const elbow = _a.set(...(spec.elbow || ELBOW)).lerp(grip, 0.25);
        _q2.setFromAxisAngle(axis, th * 0.4);
        outP.sub(elbow).applyQuaternion(_q2).add(elbow);
        outQ.premultiply(_q2);
      }
      return;
    }
    if (mode === 'hold') {
      // a fist round a grip (a hilt, an ingot): +Y along spec.up, knuckles toward spec.fwd
      const up = this.viewDir(_a.copy(spec.up ? spec.up() : UP), _a);
      const f = spec.fwd ? this.viewDir(_c.copy(spec.fwd()), _c) : _c.set(-0.7, -0.2, -1);
      aim([up.x, up.y, up.z], [f.x, f.y, f.z], outQ);
      outP.copy(T);
      return;
    }
    outP.copy(h.p);
    outQ.copy(h.q);
  }
}

function toolOf(side, mode) {
  if (side === 'R') return mode === 'hammer' || mode === 'low';
  return mode === 'tongs' || mode === 'low';
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
