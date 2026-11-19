// Little voxel bits for eating in first person (the view model's own scene, view-camera space):
// crumbs that spray from each bite and tumble down out of view, and wisps of steam (tiny pale
// voxels that rise, drift and shrink) off a hot dish. One instanced mesh each, a few hundred
// cubes at most. vm.eatFx.bite(at, colors, n), .steam(at, k), .update(dt).
import * as THREE from 'three';

const MAX = 160;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class EatFx {
  constructor(parent) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.crumbMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.steamMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xfff6ec, transparent: true, opacity: 0.55, depthWrite: false }), MAX);
    for (const m of [this.crumbMesh, this.steamMesh]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 3; parent.add(m); }
    this.crumbs = [];
    this.wisps = [];
  }

  /** A bite: n crumbs (sizes in metres of the view space) burst from `at` in these colours. */
  bite(at, colors, n = 10) {
    for (let i = 0; i < n && this.crumbs.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      this.crumbs.push({
        p: at.clone().add(_p.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01)),
        v: new THREE.Vector3(Math.cos(a) * (0.08 + Math.random() * 0.18), 0.05 + Math.random() * 0.2, Math.sin(a) * 0.08 - 0.02),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        s: 0.0035 + Math.random() * 0.004, c: colors[(Math.random() * colors.length) | 0], t: 0, life: 0.6 + Math.random() * 0.4,
      });
    }
  }

  /** A puff of steam wisps rising from `at` (k: how many, 0..1). */
  steam(at, k = 1) {
    const n = Math.round(1 + k * 3);
    for (let i = 0; i < n && this.wisps.length < MAX; i++) {
      this.wisps.push({ p: at.clone().add(_p.set((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.02)), v: new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.06 + Math.random() * 0.05, 0), s: 0.004 + Math.random() * 0.003, t: 0, life: 0.7 + Math.random() * 0.5, ph: Math.random() * 6 });
    }
  }

  update(dt) {
    let n = 0;
    for (const c of this.crumbs) {
      c.t += dt;
      c.v.y -= 0.9 * dt;
      c.p.addScaledVector(c.v, dt);
      const k = Math.max(0, 1 - c.t / c.life);
      _q.setFromEuler(_e.set(c.r.x * c.t, c.r.y * c.t, c.r.z * c.t));
      _m.compose(c.p, _q, _s.setScalar(c.s * (0.4 + 0.6 * k)));
      this.crumbMesh.setMatrixAt(n, _m);
      this.crumbMesh.setColorAt(n, _c.set(c.c));
      n++;
    }
    this.crumbs = this.crumbs.filter((c) => c.t < c.life);
    this.crumbMesh.count = n;
    this.crumbMesh.instanceMatrix.needsUpdate = true;
    if (this.crumbMesh.instanceColor) this.crumbMesh.instanceColor.needsUpdate = true;
    n = 0;
    for (const w of this.wisps) {
      w.t += dt;
      w.p.addScaledVector(w.v, dt);
      w.p.x += Math.sin(w.t * 5 + w.ph) * 0.004 * dt * 10;
      const k = w.t / w.life;
      _m.compose(w.p, _q.identity(), _s.setScalar(w.s * (1 + k * 1.4) * (k > 0.7 ? (1 - k) / 0.3 : 1)));
      this.steamMesh.setMatrixAt(n++, _m);
    }
    this.wisps = this.wisps.filter((w) => w.t < w.life);
    this.steamMesh.count = n;
    this.steamMesh.instanceMatrix.needsUpdate = true;
  }

  get busy() { return this.crumbs.length > 0 || this.wisps.length > 0; }
}
