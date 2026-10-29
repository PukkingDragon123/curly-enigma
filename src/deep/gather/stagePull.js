// The pull close-up: the plant (a bendy stem the paw grips, its head, the body under the soil and
// its roots), the soil round it, and how they answer the minigame: the stem stretches thin and
// bends with the paw, the soil cracks along the roots as you wiggle and heaves as you pull, roots
// tear out one by one in a zip of dirt, it strains red before it snaps, and at the end it pops out
// of the ground (or snaps, leaving a stub). Ceiling plants are the same, upside down.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { takePlant } from './models.js';
import { mesh, cubeGeo, lin, gatherMaterial } from './gfx.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class PullStage extends Stage {
  constructor(ctx, at, id, spec, sim, o = {}) {
    super(ctx, at, o);
    this.id = id; this.spec = spec; this.sim = sim;
    const M = (this.model = takePlant(id, spec, this.seed));
    this.ceil = at.mount === 'ceil';
    // the roots radiate under the soil; the soil cracks along them
    const n = M.roots.n;
    this.rootAngles = [];
    for (let i = 0; i < n; i++) this.rootAngles.push((i / n) * Math.PI * 2 + (this.r() - 0.5) * 0.9);
    this.base0 = this.surfaceY(0, 0);
    this.buildHole(0.07);
    this.buildSoil({ cracks: this.rootAngles, r0: M.stemR + 0.012, r1: this.ceil ? 0.12 : 0.17, n: this.ceil ? 60 : 150, mound: this.ceil ? 0.006 : 0.02 });
    // the plant: everything that comes out of the ground lives in `plant`
    this.plant = new THREE.Group();
    this.plant.position.y = this.base0;
    this.root.add(this.plant);
    // the stem (deformed on the CPU every frame: stretch, bend, twist)
    const sg = M.stem.clone();
    this.geos.push(sg, M.stem, M.head);
    this.stemGeo = sg;
    this.P0 = M.stem.attributes.position.array.slice();
    this.N0 = M.stem.attributes.normal.array.slice();
    const nv = this.P0.length / 3;
    this.quadY = new Float32Array(nv);
    for (let q = 0; q < nv; q += 4) {
      const cy = (this.P0[q * 3 + 1] + this.P0[(q + 1) * 3 + 1] + this.P0[(q + 2) * 3 + 1] + this.P0[(q + 3) * 3 + 1]) / 4;
      for (let k = 0; k < 4; k++) this.quadY[q + k] = cy;
    }
    sg.attributes.position.setUsage(THREE.DynamicDrawUsage);
    sg.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    // normals become float so they can turn smoothly with the bend
    sg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    // the stem has its own material: it flushes red as it strains (the head doesn't)
    this.matStem = gatherMaterial(ctx.U, { key: 0.22, rim: 0.3, glow: 0.85 });
    this.mats.push(this.matStem);
    this.stem = this.occlude(mesh(sg, this.matStem, this.plant));
    this.head = this.occlude(mesh(M.head, this.mat, this.plant));
    if (M.body) { this.geos.push(M.body.geo); this.body = this.occlude(mesh(M.body.geo, this.mat, this.plant)); }
    for (const e of M.extras) { this.geos.push(e.geo); const x = mesh(e.geo, this.mat, this.root); x.position.set(e.pos[0], this.surfaceY(e.pos[0], e.pos[2]) + e.pos[1], e.pos[2]); }
    this.buildRoots();
    this.buildCracks();
    // live pose
    this.lift = 0; this.liftV = 0;
    this.gx = 0; this.gz = 0; this.twist = 0;
    this.stretch = 1;
    this.tilt = { x: 0, z: 0, vx: 0, vz: 0 };
    this.popT = -1; this.snapT = -1; this.swing = 0;
    this.heaveK = 0;
    this.moteT = 0;
    this.shake = 0;
    this.grip = new THREE.Vector3();
    this.tan = new THREE.Vector3(0, 1, 0);
    this.frames = new Map();
    this.pose(0);
  }

  // ------------------------------------------------------------ cracks
  /** Dark cracks in the soil along each root, growing out from the stem as it loosens. */
  buildCracks() {
    const geo = cubeGeo(0x1a120c, 0);
    this.geos.push(geo);
    const N = 7;
    const segs = [];
    for (const a0 of this.rootAngles) {
      let a = a0, r = this.model.stemR + 0.012;
      for (let k = 0; k < N; k++) {
        const L = 0.014 + this.r() * 0.008;
        const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
        a += (this.r() - 0.5) * 0.5;
        r += L;
        const x1 = Math.cos(a) * r, z1 = Math.sin(a) * r;
        const y = this.surfaceY((x0 + x1) / 2, (z0 + z1) / 2) + 0.003;
        segs.push({ x0, z0, x1, z1, y, k, w: 0.005 * (1 - k / (N * 1.3)) });
      }
    }
    const im = new THREE.InstancedMesh(geo, this.matSoil, segs.length);
    im.frustumCulled = false;
    this.root.add(im);
    this.crackMesh = im;
    this.crackSegs = segs;
    this.crackN = N;
    this.crackShown = -1;
  }
  updateCracks(loose) {
    const n = Math.round(clamp(loose * 1.15, 0, 1) * this.crackN * 4) / 4;
    if (n === this.crackShown) return;
    this.crackShown = n;
    const im = this.crackMesh;
    this.crackSegs.forEach((c, i) => {
      const k = clamp(n - c.k, 0, 1);
      if (k <= 0 || this.popT >= 0.6) { _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); return; }
      const dx = c.x1 - c.x0, dz = c.z1 - c.z0, L = Math.hypot(dx, dz) * k;
      _v.set(c.x0 + dx * k / 2, c.y, c.z0 + dz * k / 2);
      _q.setFromAxisAngle(UP, -Math.atan2(dz, dx));
      _m.compose(_v, _q, _s.set(L, 0.004, c.w));
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ roots
  buildRoots() {
    const M = this.model, R = M.roots;
    const K = 7;
    this.K = K;
    const geo = cubeGeo(0xffffff, R.glow || 0);
    this.geos.push(geo);
    const im = new THREE.InstancedMesh(geo, this.mat, R.n * (K - 1));
    im.frustumCulled = false;
    const c = new THREE.Color();
    const col = lin(R.col);
    this.roots = [];
    const bodyW = M.body?.w ?? 0.03, depth = M.body?.depth ?? 0.04;
    for (let i = 0; i < R.n; i++) {
      const a = this.rootAngles[i];
      const ca = Math.cos(a), sa = Math.sin(a);
      const len = R.len[0] + this.r() * (R.len[1] - R.len[0]);
      const dep = R.depth[0] + this.r() * (R.depth[1] - R.depth[0]);
      // deep bodies sprout roots down their length; shallow ones from the base
      const ay = this.model.form === 'root' ? -(0.015 + this.r() * depth * 0.8) : -0.01 - this.r() * 0.012;
      const start = new THREE.Vector3(ca * bodyW * 0.5, ay, sa * bodyW * 0.5);
      const pts = [], rest = [];
      const wav = (this.r() - 0.5) * 0.03;
      for (let k = 0; k < K; k++) {
        const t = k / (K - 1);
        const d = bodyW * 0.5 + t * len;
        const side = Math.sin(t * Math.PI * 1.5 + i) * wav;
        const y = ay * (1 - t) - dep * t - Math.sin(t * Math.PI) * 0.006;
        const p = new THREE.Vector3(ca * d - sa * side, y, sa * d + ca * side);
        rest.push(p.clone()); pts.push(p.clone());
      }
      const segLen = [];
      for (let k = 1; k < K; k++) segLen.push(rest[k].distanceTo(rest[k - 1]));
      for (let k = 0; k < K - 1; k++) { c.setRGB(col[0] * (0.85 + this.r() * 0.3), col[1] * (0.85 + this.r() * 0.3), col[2] * (0.85 + this.r() * 0.3)); im.setColorAt(i * (K - 1) + k, c); }
      this.roots.push({ a, start, rest, pts, prev: pts.map((p) => p.clone()), segLen, state: 'held', cut: K, r: R.r * (0.8 + this.r() * 0.5), t: 0 });
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.plant.add(im);
    this.rootMesh = im;
  }

  /** A root lets go: it tears up out of the soil in a zip of dirt (rip: half of it stays behind). */
  freeRoot(i, rip = false, quiet = false) {
    const R = this.roots[i];
    if (!R || R.state !== 'held') return;
    R.state = 'free';
    R.cut = rip ? Math.max(2, Math.floor(this.K * (0.35 + this.r() * 0.3))) : this.K;
    const up = this.ceil ? -1 : 1;
    for (let k = 0; k < this.K; k++) {
      const t = k / (this.K - 1);
      R.prev[k].copy(R.pts[k]);
      // the verlet kick: up out of the soil, the far end last
      R.prev[k].y -= (0.025 + 0.02 * (1 - t)) * up;
      R.prev[k].x -= Math.cos(R.a) * 0.004; R.prev[k].z -= Math.sin(R.a) * 0.004;
    }
    if (quiet) return;
    // dirt along its path, clods along it hop
    for (let k = 1; k < R.cut; k++) {
      const p = R.rest[k];
      if (p.y < -0.06) continue;
      this.dirt(p.x, this.base0 + 0.01, p.z, 3, 0.55);
      this.kickClods(p.x, p.z, 0.028, 0.9 + (1 - k / this.K) * 0.5, 0.25);
    }
    this.dust(R.rest[this.K >> 1].x, this.base0 + 0.01, R.rest[this.K >> 1].z, 2);
  }

  updateRoots(dt) {
    const K = this.K;
    const g = this.ceil ? 9.8 : -9.8; // local y is world down on a ceiling
    const lift = this.lift;
    const bodyAt = _v3;
    const im = this.rootMesh;
    let idx = 0;
    for (const R of this.roots) {
      // the near end rides on the body
      bodyAt.copy(R.start);
      bodyAt.y += lift;
      this.bodyToLocal(bodyAt);
      if (R.state === 'held') {
        for (let k = 0; k < K; k++) {
          const t = k / (K - 1);
          R.pts[k].copy(R.rest[k]);
          R.pts[k].y += lift * Math.pow(1 - t, 2);
        }
        R.pts[0].copy(bodyAt);
      } else {
        // verlet: gravity, a little drag, rest lengths
        for (let k = 1; k < K; k++) {
          const p = R.pts[k], q = R.prev[k];
          if (k >= R.cut) continue;
          const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
          q.copy(p);
          p.x += vx; p.y += vy + g * dt * dt * 0.6; p.z += vz;
        }
        R.pts[0].copy(bodyAt);
        for (let it = 0; it < 4; it++) {
          for (let k = 1; k < Math.min(K, R.cut); k++) {
            const a = R.pts[k - 1], b = R.pts[k];
            _v.subVectors(b, a);
            const L = _v.length() || 1e-5, want = R.segLen[k - 1];
            const diff = (L - want) / L;
            if (k === 1) b.addScaledVector(_v, -diff);
            else { a.addScaledVector(_v, diff * 0.5); b.addScaledVector(_v, -diff * 0.5); }
          }
          R.pts[0].copy(bodyAt);
        }
        // torn out, they lie on the soil (they don't sink back through it); once it's out, they dangle
        if (this.popT < 0) for (let k = 1; k < Math.min(K, R.cut); k++) {
          const p = R.pts[k], q = R.prev[k];
          const floor = 0.003 + R.r;
          if (p.y < floor) { p.y = floor; q.x = p.x - (p.x - q.x) * 0.6; q.z = p.z - (p.z - q.z) * 0.6; q.y = p.y; }
        }
      }
      for (let k = 0; k < K - 1; k++, idx++) {
        const a = R.pts[k], b = R.pts[k + 1];
        if (k + 1 >= R.cut) { _m.makeScale(0, 0, 0); im.setMatrixAt(idx, _m); continue; }
        _v.subVectors(b, a);
        const L = _v.length();
        _v2.addVectors(a, b).multiplyScalar(0.5);
        _q.setFromUnitVectors(UP, L > 1e-6 ? _v.divideScalar(L) : UP);
        const th = R.r * (1 - k / (K * 1.4));
        _s.set(th * 2, L + th, th * 2);
        _m.compose(_v2, _q, _s);
        im.setMatrixAt(idx, _m);
      }
    }
    im.instanceMatrix.needsUpdate = true;
  }
  /** Body-local point (relative to the stem base) → plant-local. */
  bodyToLocal(v) { if (this.bodyQ) v.applyQuaternion(this.bodyQ); return v; }

  // ------------------------------------------------------------ the stem
  /** Stem frame at rest height y (plant-local): position + rotation. Cached per voxel row. */
  frame(y) {
    const S = this.model.S;
    const key = Math.round(y / S * 2);
    let f = this.frames.get(key);
    if (f && f.gen === this.gen) return f;
    if (!f) { f = { p: new THREE.Vector3(), q: new THREE.Quaternion(), thin: 1, gen: -1 }; this.frames.set(key, f); }
    f.gen = this.gen;
    const yg = this.gy, B = this.B, C = this.C, Gp = this.G;
    if (this.snapT >= 0) {
      if (y < this.snapY) {
        // the stub left in the ground leans a little
        f.p.set(this.stubB.x, this.stubB.y + y, this.stubB.z);
        f.q.setFromAxisAngle(_v.set(1, 0, 0.4).normalize(), 0.1 * clamp(y / Math.max(1e-3, this.snapY), 0, 1));
        f.thin = 1;
        return f;
      }
      // the torn-off top hangs from the paw in one piece, swinging
      f.q.copy(this.Q1).premultiply(_q2.setFromAxisAngle(_v.set(0, 0, 1), this.swing));
      f.p.copy(Gp).add(_v.set(0, y - yg, 0).applyQuaternion(f.q));
      f.thin = 1;
      return f;
    }
    if (y <= 0) { f.p.set(B.x, B.y + y, B.z); f.q.copy(this.baseQ); f.thin = 1; return f; }
    if (y <= yg) {
      const t = y / yg, u = 1 - t;
      f.p.set(u * u * B.x + 2 * u * t * C.x + t * t * Gp.x, u * u * B.y + 2 * u * t * C.y + t * t * Gp.y, u * u * B.z + 2 * u * t * C.z + t * t * Gp.z);
      _v.set(2 * u * (C.x - B.x) + 2 * t * (Gp.x - C.x), 2 * u * (C.y - B.y) + 2 * t * (Gp.y - C.y), 2 * u * (C.z - B.z) + 2 * t * (Gp.z - C.z)).normalize();
      f.q.setFromUnitVectors(UP, _v);
      f.q.multiply(_q2.setFromAxisAngle(UP, this.twist * t));
      f.thin = 1 / Math.sqrt(Math.max(1, this.stretch));
      return f;
    }
    f.p.copy(Gp).addScaledVector(this.T1, y - yg);
    f.q.copy(this.Q1);
    f.thin = 1;
    return f;
  }

  /** Lay the stem out for this frame from lift / grip offset / stretch / twist. */
  pose(dt) {
    const M = this.model;
    this.gen = (this.gen || 0) + 1;
    const yg = Math.min(M.gripY, M.stemLen * 0.92);
    this.gy = yg;
    this.B = this.B || new THREE.Vector3();
    this.C = this.C || new THREE.Vector3();
    this.G = this.G || new THREE.Vector3();
    this.T1 = this.T1 || new THREE.Vector3();
    this.Q1 = this.Q1 || new THREE.Quaternion();
    this.baseQ = this.baseQ || new THREE.Quaternion();
    const B = this.B.set(0, this.lift, 0);
    const len = yg * this.stretch;
    this.C.set(B.x, B.y + len * 0.55, B.z);
    this.G.set(B.x + this.gx, B.y + len, B.z + this.gz);
    if (this.snapT >= 0) this.G.y += this.snapUp;
    _v.subVectors(this.G, this.C).normalize();
    this.T1.copy(_v);
    this.Q1.setFromUnitVectors(UP, _v).multiply(_q2.setFromAxisAngle(UP, this.twist));
    this.baseQ.identity();
    // the stem's vertices
    const P0 = this.P0, N0 = this.N0, P = this.stemGeo.attributes.position.array, N = this.stemGeo.attributes.normal.array;
    const nv = P0.length / 3;
    for (let i = 0; i < nv; i++) {
      const j = i * 3;
      let y = P0[j + 1];
      // after a snap, the torn ends stay apart (quads choose a side by their centre)
      if (this.snapT >= 0) {
        const qy = this.quadY[i];
        if (qy < this.snapY && y > this.snapY) y = this.snapY;
        if (qy >= this.snapY && y < this.snapY) y = this.snapY + 1e-4;
      }
      const f = this.frame(y);
      _v.set(P0[j] * f.thin, 0, P0[j + 2] * f.thin).applyQuaternion(f.q).add(f.p);
      P[j] = _v.x; P[j + 1] = _v.y; P[j + 2] = _v.z;
      _v.set(N0[j] / 127, N0[j + 1] / 127, N0[j + 2] / 127).applyQuaternion(f.q);
      N[j] = _v.x; N[j + 1] = _v.y; N[j + 2] = _v.z;
    }
    this.stemGeo.attributes.position.needsUpdate = true;
    this.stemGeo.attributes.normal.needsUpdate = true;
    // the head rides the stem's top (with a springy wobble)
    const top = this.frame(M.stemLen);
    this.head.position.copy(top.p);
    _q.setFromEuler(new THREE.Euler(this.tilt.x, 0, this.tilt.z));
    this.head.quaternion.copy(top.q).multiply(_q);
    if (this.snapT >= 0) this.head.position.y += 0;
    // the body sits under the base, leaning with it
    if (this.body) {
      this.body.position.set(B.x, B.y, B.z);
      this.body.quaternion.copy(this.baseQ);
    }
    this.bodyQ = this.baseQ;
    // the grip point and the stem's direction there (plant-local)
    this.grip.copy(this.G);
    this.tan.copy(this.T1);
  }

  // ------------------------------------------------------------ per frame
  /**
   * vis: { pv, wx, strain, loose, inBand, prog, grip } from the sim (smoothed by the session).
   * Returns nothing; read gripWorld() / tanWorld() / headWorld() after.
   */
  update(dt, vis, cam) {
    this.updateBase(dt, cam);
    const s = this.spec, M = this.model;
    const sim = this.sim;
    // how far it has come up (a few cm while rooted, then the pop)
    let liftT = Math.pow(clamp(vis.prog, 0, 1), 1.6) * (s.form === 'root' ? 0.03 : 0.022) + vis.pv * 0.004;
    if (this.popT >= 0) {
      this.popT += dt;
      const full = (M.body?.depth ?? 0.03) + 0.07;
      liftT = this.lift0 + (full - this.lift0) * easeOutBack(this.popT / 0.42);
      this.lift = liftT;
    } else this.lift = damp(this.lift, liftT, 14, dt);
    // the paw's sideways swing bends the stem (twisting plants turn instead)
    const twisty = !!s.twist;
    const gxT = (twisty ? 0.012 : 0.03) * vis.wx * (this.popT >= 0 ? 0 : 1) + Math.sin(this.t * 31) * this.shake * 0.002;
    const prevGx = this.gx;
    this.gx = damp(this.gx, gxT, 18, dt);
    this.twist = damp(this.twist, twisty ? vis.wx * 0.9 : vis.wx * 0.15, 14, dt);
    const stretchT = 1 + (vis.grip ? vis.pv : 0) * (s.stretchy ? 1.1 : 0.2) + vis.strain * 0.18;
    this.stretch = damp(this.stretch, this.popT >= 0 ? 1 : stretchT, 10, dt);
    // the head lags behind the paw on a spring
    const gv = (this.gx - prevGx) / Math.max(dt, 1e-3);
    const T = this.tilt;
    T.vz += (-T.z * 90 - T.vz * 7 + gv * 3.2) * dt;
    T.vx += (-T.x * 90 - T.vx * 7 + (vis.jerk || 0) * 0.15 * Math.sin(this.t * 3)) * dt;
    T.z += T.vz * dt; T.x += T.vx * dt;
    T.z = clamp(T.z, -0.6, 0.6); T.x = clamp(T.x, -0.5, 0.5);
    if (this.snapT >= 0) {
      this.snapT += dt;
      this.snapUp = easeOutBack(this.snapT / 0.3) * 0.09;
      this.swing = Math.sin(this.snapT * 9) * Math.exp(-this.snapT * 2.2) * 0.35;
    }
    this.pose(dt);
    this.updateRoots(dt);
    // straining: the stem flushes red and shivers; in the band it shimmers
    const strainK = this.snapT >= 0 || this.popT >= 0 ? 0 : clamp((vis.strain - 0.2) * 0.75, 0, 0.55);
    this.shake = damp(this.shake, vis.strain > 0.45 ? vis.strain : 0, 10, dt);
    const su = this.matStem.uniforms, hu = this.mat.uniforms;
    if (this.flashT > 0) {
      this.flashT -= dt * 3;
      su.uTint.value.setRGB(1, 1, 0.9); hu.uTint.value.setRGB(1, 1, 0.9);
      su.uTintK.value = hu.uTintK.value = Math.max(0, this.flashT) * 0.7;
    } else {
      su.uTint.value.setRGB(1, 0.16, 0.08);
      su.uTintK.value = strainK * (0.6 + 0.4 * Math.sin(this.t * 28));
      hu.uTintK.value = 0;
    }
    // a burning flower smokes in the paw; a frost flower breathes cold
    if ((s.hot || s.cold) && vis.grip && this.popT < 0 && Math.random() < dt * (s.hot ? 14 : 9)) {
      const g = this.gripWorld(_v3);
      if (s.hot) this.ctx.fx?.ember(g.x, g.y + 0.02, g.z);
      else this.ctx.fx?.spawn({ x: g.x + (Math.random() - 0.5) * 0.05, y: g.y, z: g.z + (Math.random() - 0.5) * 0.05, vx: 0, vy: -0.05, vz: 0, life: 1.2, size: 0.012, grow: 0.02, color: [0.85, 0.95, 1], alpha: 0.5, drag: 1.5, grav: 0.05 });
    }
    this.moteT -= dt;
    if (vis.inBand && this.popT < 0 && this.moteT <= 0) { this.moteT = 0.07; this.motes(0, this.base0 + 0.01, 0, sim.loose >= (s.needLoose ?? 0.4) ? [0.75, 1, 0.5] : [1, 0.85, 0.45], 0.06); }
    // the soil: cracks open as it loosens, heaves round the stem as you pull
    this.heaveK = damp(this.heaveK, vis.grip ? clamp(vis.pv * 1.2, 0, 1.2) : 0, 8, dt);
    this.soilPose(dt, { crack: clamp(vis.loose * 1.25, 0, 1.2), heave: this.heaveK * 0.012 + this.lift * 0.7, shiftX: this.gx * 0.6, shiftZ: 0, hole: this.popT >= 0 ? 0.07 : 0 });
    if (this.hole) this.hole.scale.setScalar(this.popT >= 0 ? Math.min(1, 0.6 + this.popT * 2) : 0.5 + vis.loose * 0.15);
    if (this.crackMesh) this.updateCracks(vis.loose);
  }

  /** Events from the sim → the stage's answer. */
  onEvent(e) {
    switch (e.type) {
      case 'wiggle': {
        const a = this.r() * Math.PI * 2;
        this.dirt(Math.cos(a) * 0.03, this.base0 + 0.01, Math.sin(a) * 0.03, 3 + Math.round(e.amp * 3), 0.5);
        if (this.r() < 0.5) this.dust(0, this.base0, 0, 1, 0.05);
        break;
      }
      case 'crack': for (const a of this.rootAngles) this.dirt(Math.cos(a) * 0.06, this.base0 + 0.01, Math.sin(a) * 0.06, 2, 0.4); break;
      case 'root': this.freeRoot(e.i, e.rip); break;
      case 'spore': {
        const fx = this.ctx.fx;
        const hw = this.headWorld(_v);
        for (let i = 0; i < 26; i++) fx?.spawn({ x: hw.x + (Math.random() - 0.5) * 0.15, y: hw.y + Math.random() * 0.05, z: hw.z + (Math.random() - 0.5) * 0.15, vx: (Math.random() - 0.5) * 0.4, vy: 0.1 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4, life: 1.6 + Math.random(), size: 0.01 + Math.random() * 0.01, color: [0.78, 0.62, 0.92], alpha: 0.85, glow: true, drag: 1.2, grav: -0.05 });
        break;
      }
      case 'burn': { const g = this.gripWorld(_v); for (let i = 0; i < 4; i++) this.ctx.fx?.ember(g.x, g.y, g.z); break; }
      case 'pop': this.pop(); break;
      case 'snap': this.snap(); break;
    }
  }

  pop() {
    if (this.popT >= 0) return;
    this.popT = 0;
    this.lift0 = this.lift;
    this.flashT = 0.6;
    for (let i = 0; i < this.roots.length; i++) this.freeRoot(i, !!this.sim.done?.torn && i % 2 === 0, true);
    this.kickClods(0, 0, 0.1, 1.8, 0.7);
    this.dirt(0, this.base0 + 0.02, 0, 30, 1.3);
    this.dust(0, this.base0 + 0.02, 0, 6, 0.08);
    const glow = this.model.glow || [1, 0.92, 0.6];
    this.sparkle(0, this.base0 + 0.08, 0, 14, this.sim.done?.p ? [1, 0.9, 0.4] : glow, 0.9);
  }

  snap() {
    if (this.snapT >= 0) return;
    this.snapT = 0;
    this.snapUp = 0;
    this.snapY = this.gy * 0.5;
    this.stubB = this.B.clone();
    this.flashT = 0.5;
    const col = this.spec.col?.stem ?? this.spec.col?.leaf ?? 0x8a9c7c;
    const p = this.frame(this.snapY).p;
    this.dirt(p.x, this.base0 + p.y, p.z, 14, 0.9, col);
    this.dirt(p.x, this.base0 + p.y, p.z, 8, 0.6, 0xf4ecd8); // torn white fibres
    this.swing = 0;
  }

  // ------------------------------------------------------------ for the paws, camera and light
  gripWorld(out = new THREE.Vector3()) { this.plant.updateMatrixWorld(); return this.plant.localToWorld(out.copy(this.grip)); }
  tanWorld(out = new THREE.Vector3()) { this.plant.getWorldQuaternion(_q); return out.copy(this.tan).applyQuaternion(_q).normalize(); }
  headWorld(out = new THREE.Vector3()) {
    out.set(0, this.model.headH * 0.4, 0).applyQuaternion(this.head.quaternion).add(this.head.position);
    this.plant.updateMatrixWorld();
    return this.plant.localToWorld(out);
  }
  /** Where the paws go: the fist round the stem at the grip, the other paw steadying the soil. */
  pawTargets(o) {
    const tan = this.tanWorld(new THREE.Vector3());
    if (this.ceil) tan.negate();
    const R = { pos: this.gripWorld(new THREE.Vector3()), up: tan, fwdView: [-1, -0.08, -0.55], fist: o.gripping, hover: true };
    let L = null;
    if (!this.ceil && o.brace) L = { pos: this.toWorld(new THREE.Vector3(-0.13 - this.model.stemR, this.base0 + 0.03, -0.04)), up: this.dirWorld(new THREE.Vector3(0, 1, 0)), fwd: this.dirWorld(new THREE.Vector3(0.9, -0.15, -0.35).normalize()), fist: false };
    return { R, L };
  }
  /** The plant's middle (plant-local): between the bottom of its body and the top of its head. */
  middle(out = new THREE.Vector3()) {
    const M = this.model;
    const bot = -(M.body?.depth ?? 0.03), top = M.stemLen + M.headH;
    return out.set(0, (bot + top) / 2 + this.lift, 0);
  }
  /** How much to fit when it's held up: head to root tips (the roots hang below the body). */
  showSize() {
    const M = this.model, r = M.roots?.n ? M.roots.len[1] * 0.8 : 0;
    return { span: M.stemLen + M.headH + (M.body?.depth ?? 0.03) + r + 0.04, w: Math.max(M.headW * 2, 0.22), drop: r / 2 };
  }
  /** Where the camera should look and how much must fit (m). */
  focus() {
    const M = this.model;
    const h = M.stemLen + M.headH;
    const w = Math.max(M.headW * 2, 0.22);
    return { at: new THREE.Vector3(0, this.base0 + h * 0.42, 0), h: Math.max(h + 0.05, w * 0.8), w };
  }
}
