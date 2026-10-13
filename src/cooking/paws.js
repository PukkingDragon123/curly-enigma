// First-person mole paws: two big pink paws (makePaw) on long dark-fur sleeves.
// The mole is short and the counter is high, so each sleeve rises from a shoulder below the
// view up to the wrist, and the paw bends down at the wrist toward the work. Each paw follows a
// goal point with smoothing; the wrist pose (pitch/roll/yaw) is applied on top of the arm line.
import * as THREE from 'three';
import { makePaw } from '../gfx/characters.js';
import { VoxelGrid, voxelMesh } from '../gfx/Voxel.js';
import { damp, makeRng, shade } from '../core/util.js';
import { hash3 } from '../bookends/vox.js';

export const PAW_SCALE = 0.42;
const V = PAW_SCALE / 16;
const PALM_Z = 15.5; // palm center, in paw voxels from the back of the forearm
const WRIST_Z = 13.5; // where the sleeve meets the paw (behind the palm center)
const UP = new THREE.Vector3(0, 1, 0);
// camera-space base: paw +z (fingers) → screen up, paw +y (back of paw) → toward the viewer
const Q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _qa = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _w = new THREE.Vector3();

function basis(dir, out) {
  _z.copy(dir).normalize();
  _x.crossVectors(UP, _z).normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function sleeveMesh(side) {
  // a long furry forearm running from the wrist back past the shoulder (always leaves the view),
  // built at half the paw's voxel size: fur strands along the arm, lighter tips on top, a scruffy
  // cuff at the wrist and some honest dirt
  const L = 68, W = 20, H = 18;
  const g = new VoxelGrid(W, H, L);
  const FUR = [0x3a2e2a, 0x34282a, 0x42342e, 0x2e2428];
  for (let z = 0; z < L; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cuff = z > L - 9;
    const rx = cuff ? 9.6 : 8.4, ry = cuff ? 8.6 : 7.4;
    const dx = (x + 0.5 - 10) / rx, dy = (y + 0.5 - 9) / ry;
    const d = dx * dx + dy * dy;
    if (d > 1) continue;
    const strand = hash3(x, y, Math.floor(z / 4), 51 + side);
    if (cuff && d > 0.72 && hash3(x, y, z, 52) < 0.35) continue; // ragged fluffy cuff
    let c = FUR[(strand * FUR.length) | 0];
    if (dy < -0.45) c = shade(c, 1.22); // light catches the top of the fur
    else if (dy > 0.5) c = shade(c, 0.8);
    if ((z + Math.floor(strand * 7)) % 9 === 0) c = shade(c, 1.15); // tufts
    if (cuff) c = shade(c, 1.12);
    g.set(x, y, z, c);
  }
  // dirt smudges, it's a mole
  const rng = makeRng(60 + side);
  for (let i = 0; i < 9; i++) {
    const z = rng.int(8, L - 12), x = rng.int(4, 15);
    for (let k = 0; k < 4; k++) if (g.filled(x + (k % 2), 2 + (k >> 1), z + k)) g.set(x + (k % 2), 2 + (k >> 1), z + k, rng.chance(0.5) ? 0x5a4028 : 0x6a4a30);
  }
  return voxelMesh(g, { pivot: [10, 9, L], scale: V / 2, kind: 'toon', outline: true, greedy: true });
}

export class Paw {
  constructor(side) {
    this.side = side;
    this.root = new THREE.Group();
    this.model = makePaw(side, { scale: PAW_SCALE });
    this.model.position.set(0, 0, -PALM_Z * V);
    this.root.add(this.model);
    this.sleeve = new THREE.Group();
    const sm = sleeveMesh(side);
    sm.position.set(0, 0.5 * V, 1.5 * V);
    this.sleeve.add(sm);
    this.grip = new THREE.Group();
    this.grip.position.set(0, -4.2 * V, 0.5 * V);
    this.root.add(this.grip);
    this.pos = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.shoulder = new THREE.Vector3();
    this.ang = { pitch: 0, roll: 0, yaw: 0 };
    this.angGoal = { pitch: 0, roll: 0, yaw: 0 };
    this.speed = 14;
    this.angSpeed = 12;
    this.held = null;
  }

  addTo(parent) { parent.add(this.root, this.sleeve); }

  snap() {
    this.pos.copy(this.goal);
    Object.assign(this.ang, this.angGoal);
  }

  setPose(p) { Object.assign(this.angGoal, p); }

  hold(obj, pos = [0, 0, 0], rot = [0, 0, 0]) {
    this.held = obj;
    this.grip.add(obj);
    obj.position.set(pos[0], pos[1], pos[2]);
    obj.rotation.set(rot[0], rot[1], rot[2]);
  }

  /** camQ: camera world quaternion. Paw orientation is camera-relative so the pink top always reads. */
  update(dt, camQ) {
    const k = 1 - Math.exp(-this.speed * dt);
    this.pos.lerp(this.goal, k);
    for (const key of ['pitch', 'roll', 'yaw']) this.ang[key] = damp(this.ang[key], this.angGoal[key], this.angSpeed, dt);
    const q = this.root.quaternion.copy(camQ).multiply(Q0);
    q.multiply(_qa.setFromAxisAngle(AY, this.ang.yaw * this.side));
    q.multiply(_qa.setFromAxisAngle(AX, this.ang.pitch));
    q.multiply(_qa.setFromAxisAngle(AZ, this.ang.roll * this.side));
    this.root.position.copy(this.pos);
    // sleeve: from the wrist back toward the shoulder
    _w.set(0, 0, -WRIST_Z * V).applyQuaternion(this.root.quaternion).add(this.pos);
    this.sleeve.position.copy(_w);
    basis(_z.subVectors(_w, this.shoulder), this.sleeve.quaternion);
  }

  /** World position of a point given in grip-local coordinates (after update). */
  gripWorld(local, out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return out.copy(local).applyMatrix4(this.grip.matrixWorld);
  }
}

/** Both paws, anchored to the camera body. */
export class Paws {
  constructor(parent) {
    this.L = new Paw(-1);
    this.R = new Paw(1);
    this.L.addTo(parent);
    this.R.addTo(parent);
    this.t = 0;
    this.shoulderOff = [0.55, -0.9, -0.6];
    this.idleOff = [0.44, 0.24, 0.22];
    this.idlePose = { pitch: 0.2, roll: 0.25, yaw: 0.35 };
  }

  /** Shoulders sit below the bottom edge of the view (camera space offsets). */
  anchor(camera) {
    const o = this.shoulderOff;
    this.camQ = camera.quaternion;
    this.L.shoulder.set(-o[0], o[1], o[2]).applyQuaternion(camera.quaternion).add(camera.position);
    this.R.shoulder.set(o[0], o[1], o[2]).applyQuaternion(camera.quaternion).add(camera.position);
  }

  /** Resting pose: paws on the counter edge either side of a work point. */
  idle(center) {
    const o = this.idleOff;
    for (const p of [this.L, this.R]) {
      p.goal.set(center.x + p.side * o[0], center.y + o[1] + Math.sin(this.t * 2 + p.side) * 0.01, center.z + o[2]);
      p.setPose({ ...this.idlePose });
    }
  }

  update(dt) {
    this.t += dt;
    this.L.update(dt, this.camQ);
    this.R.update(dt, this.camQ);
  }
}
