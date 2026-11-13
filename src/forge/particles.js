// Pooled pixel particles: one THREE.Points per blend mode, simulated on the CPU.
// Particles render as square pixels (or round puffs) sized in world units.
import * as THREE from 'three';

const VS = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize <= 0.0 ? 0.0 : max(1.0, floor(aSize * uScale / -mv.z + 0.5));
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const FS = /* glsl */`
varying float vAlpha;
varying vec3 vColor;
uniform float uRound;
void main() {
  if (vAlpha <= 0.004) discard;
  // every spark, ember and puff is a tiny voxel (never a round dot): a lit top face and a shaded
  // side; "round" puffs (uRound) just lose their four corner cells, like a chunky voxel clump
  vec2 u = gl_PointCoord;
  if (uRound > 0.5 && (u.x < 0.2 || u.x > 0.8) && (u.y < 0.2 || u.y > 0.8)) discard;
  vec3 c = u.y < 0.34 ? vColor * 1.2 : u.x > 0.66 ? vColor * 0.7 : vColor;
  gl_FragColor = vec4(c, vAlpha);
}`;

const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

export class ParticlePool {
  /**
   * @param {number} max pool size
   * @param {{additive?: boolean, round?: boolean}} opts
   */
  constructor(max = 1024, opts = {}) {
    this.max = max;
    this.next = 0;
    this.alive = 0;
    const f = (n) => new Float32Array(max * n);
    this.p = f(3); this.v = f(3);
    this.life = f(1); this.maxLife = f(1);
    this.size0 = f(1); this.size1 = f(1);
    this.c0 = f(3); this.c1 = f(3);
    this.a0 = f(1); this.grav = f(1); this.drag = f(1);
    this.wob = f(1); this.phase = f(1);
    this.fadeIn = f(1);
    this.floor = f(1); this.bounce = f(1); this.shelf = f(4);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(f(3), 3);
    this.aCol = new THREE.BufferAttribute(f(3), 3);
    this.aSize = new THREE.BufferAttribute(f(1), 1);
    this.aAlpha = new THREE.BufferAttribute(f(1), 1);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 }, uRound: { value: opts.round ? 1 : 0 } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.additive ? 20 : 10;
  }

  /**
   * Spawn one particle.
   * o: {x,y,z, vx,vy,vz, life, size, size1, color, color1, alpha, gravity, drag, wobble, fadeIn}
   */
  spawn(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.p[i3] = o.x; this.p[i3 + 1] = o.y; this.p[i3 + 2] = o.z;
    this.v[i3] = o.vx || 0; this.v[i3 + 1] = o.vy || 0; this.v[i3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.size0[i] = o.size ?? 0.02;
    this.size1[i] = o.size1 ?? this.size0[i];
    _c0.setHex(o.color ?? 0xffffff);
    _c1.setHex(o.color1 ?? o.color ?? 0xffffff);
    this.c0[i3] = _c0.r; this.c0[i3 + 1] = _c0.g; this.c0[i3 + 2] = _c0.b;
    this.c1[i3] = _c1.r; this.c1[i3 + 1] = _c1.g; this.c1[i3 + 2] = _c1.b;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.wob[i] = o.wobble ?? 0;
    this.phase[i] = Math.random() * 6.28;
    this.fadeIn[i] = o.fadeIn ?? 0.05;
    // bouncing debris (scale flakes, drips): a floor, and a raised shelf round a point (the anvil)
    this.bounce[i] = o.bounce ?? 0;
    this.floor[i] = o.floor ?? 0;
    const sh = o.shelf;
    this.shelf[i * 4] = sh ? sh[0] : -1e9; this.shelf[i * 4 + 1] = sh ? sh[1] : 0; this.shelf[i * 4 + 2] = sh ? sh[2] : 0; this.shelf[i * 4 + 3] = sh ? sh[3] : 0;
    return i;
  }

  clear() { this.life.fill(0); }

  update(dt, camera, viewHeightPx, k = 1) {
    if (camera && camera.isPerspectiveCamera) {
      this.material.uniforms.uScale.value = k * viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
    const pos = this.aPos.array, col = this.aCol.array, size = this.aSize.array, alpha = this.aAlpha.array;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        if (alpha[i] !== 0 || size[i] !== 0) { alpha[i] = 0; size[i] = 0; }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 1] *= dr; this.v[i3 + 2] *= dr;
      this.v[i3 + 1] -= this.grav[i] * dt;
      let wx = 0;
      if (this.wob[i]) { this.phase[i] += dt * 7; wx = Math.sin(this.phase[i]) * this.wob[i] * dt; }
      this.p[i3] += this.v[i3] * dt + wx;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt + wx * 0.5;
      if (this.bounce[i] > 0 && this.v[i3 + 1] < 0) {
        const s4 = i * 4;
        const onShelf = this.shelf[s4] > -1e8 && Math.hypot(this.p[i3] - this.shelf[s4 + 1], this.p[i3 + 2] - this.shelf[s4 + 2]) < this.shelf[s4 + 3];
        const fy = onShelf ? this.shelf[s4] : this.floor[i];
        if (this.p[i3 + 1] < fy && (!onShelf || this.p[i3 + 1] > fy - 0.05)) {
          this.p[i3 + 1] = fy;
          this.v[i3 + 1] = -this.v[i3 + 1] * this.bounce[i];
          this.v[i3] *= 0.55; this.v[i3 + 2] *= 0.55;
          if (Math.abs(this.v[i3 + 1]) < 0.12) { this.v[i3] = this.v[i3 + 1] = this.v[i3 + 2] = 0; this.grav[i] = 0; }
        }
      }
      pos[i3] = this.p[i3]; pos[i3 + 1] = this.p[i3 + 1]; pos[i3 + 2] = this.p[i3 + 2];
      col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const fin = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      alpha[i] = this.a0[i] * fin * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      if (this.life[i] <= 0) { alpha[i] = 0; size[i] = 0; }
    }
    this.alive = alive;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}

/**
 * Sparks as tiny voxels: each spark is a bright head cube with two smaller, dimmer cubes trailing
 * back along its velocity, so a fast spark streaks and a slow one shrinks to a single speck. They
 * fly under gravity and drag, bounce off the floor (and a shelf such as the anvil's face round
 * where they were struck), skitter, cool from white through yellow and orange to red, and die.
 */
const TRAIL = 3;
export class StreakPool {
  constructor(max = 600) {
    this.max = max;
    this.next = 0;
    const f = (n) => new Float32Array(max * n);
    this.p = f(3); this.v = f(3); this.life = f(1); this.maxLife = f(1);
    this.c0 = f(3); this.c1 = f(3); this.grav = f(1); this.drag = f(1); this.len = f(1); this.size = f(1);
    this.floor = f(1); this.shelf = f(4); this.bounce = f(1);
    const n = max * TRAIL;
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aCol = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(n), 1);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 }, uRound: { value: 0 } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.Points(this.geo, this.material); // (kept as .lines: the pool's one object)
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 21;
    this.alive = 0;
  }

  /**
   * o: {x,y,z, vx,vy,vz, life, color, color1, gravity, drag, len (seconds of trail), size,
   *     floor (y it bounces on, default 0), shelf: [y, x, z, r] (a raised plane round x, z), bounce}
   */
  spawn(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.p[i3] = o.x; this.p[i3 + 1] = o.y; this.p[i3 + 2] = o.z;
    this.v[i3] = o.vx || 0; this.v[i3 + 1] = o.vy || 0; this.v[i3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 0.5;
    _c0.setHex(o.color ?? 0xfff0b0);
    _c1.setHex(o.color1 ?? 0xff6a1a);
    this.c0[i3] = _c0.r; this.c0[i3 + 1] = _c0.g; this.c0[i3 + 2] = _c0.b;
    this.c1[i3] = _c1.r; this.c1[i3 + 1] = _c1.g; this.c1[i3 + 2] = _c1.b;
    this.grav[i] = o.gravity ?? 5;
    this.drag[i] = o.drag ?? 1;
    this.len[i] = o.len ?? 0.025;
    this.size[i] = o.size ?? 0.011;
    this.floor[i] = o.floor ?? 0;
    const sh = o.shelf;
    this.shelf[i * 4] = sh ? sh[0] : -1e9; this.shelf[i * 4 + 1] = sh ? sh[1] : 0; this.shelf[i * 4 + 2] = sh ? sh[2] : 0; this.shelf[i * 4 + 3] = sh ? sh[3] : 0;
    this.bounce[i] = o.bounce ?? 0.38;
  }

  update(dt, camera, viewHeightPx, k = 1) {
    if (camera && camera.isPerspectiveCamera) this.material.uniforms.uScale.value = k * viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array, A = this.aAlpha.array;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3, o = i * TRAIL;
      if (this.life[i] <= 0) { if (A[o] !== 0) for (let t = 0; t < TRAIL; t++) { A[o + t] = 0; S[o + t] = 0; } continue; }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 1] *= dr; this.v[i3 + 2] *= dr;
      this.v[i3 + 1] -= this.grav[i] * dt;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      // bounce: on the shelf round where it was struck, else on the floor
      const s4 = i * 4;
      const onShelf = this.shelf[s4] > -1e8 && Math.hypot(this.p[i3] - this.shelf[s4 + 1], this.p[i3 + 2] - this.shelf[s4 + 2]) < this.shelf[s4 + 3];
      const fy = onShelf ? this.shelf[s4] : this.floor[i];
      if (this.p[i3 + 1] < fy && this.v[i3 + 1] < 0 && (!onShelf || this.p[i3 + 1] > fy - 0.05)) {
        const b = this.bounce[i];
        this.p[i3 + 1] = fy;
        this.v[i3 + 1] = -this.v[i3 + 1] * b * (0.7 + Math.random() * 0.6);
        this.v[i3] *= 0.6 + Math.random() * 0.3; this.v[i3 + 2] *= 0.6 + Math.random() * 0.3;
        if (Math.abs(this.v[i3 + 1]) < 0.15) { this.v[i3 + 1] = 0; this.grav[i] = 0; this.drag[i] = 6; } // skitters to a stop
        this.life[i] = Math.min(this.life[i], this.maxLife[i] * 0.45); // a bounce costs it most of its heat
      }
      const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      const L = this.len[i], sz = this.size[i] * (1 - t * 0.45);
      for (let q = 0; q < TRAIL; q++) {
        const f = q / (TRAIL - 1), j = (o + q) * 3;
        P[j] = this.p[i3] - this.v[i3] * L * f;
        P[j + 1] = this.p[i3 + 1] - this.v[i3 + 1] * L * f;
        P[j + 2] = this.p[i3 + 2] - this.v[i3 + 2] * L * f;
        const dim = q === 0 ? 1 : q === 1 ? 0.6 : 0.3;
        for (let c = 0; c < 3; c++) C[j + c] = (this.c0[i3 + c] + (this.c1[i3 + c] - this.c0[i3 + c]) * Math.min(1, t * 1.15)) * dim;
        S[o + q] = sz * (q === 0 ? 1 : q === 1 ? 0.75 : 0.5);
        A[o + q] = fade;
      }
      if (this.life[i] <= 0) for (let q = 0; q < TRAIL; q++) { A[o + q] = 0; S[o + q] = 0; }
    }
    this.alive = alive;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
  dispose() { this.geo.dispose(); this.material.dispose(); }
}

/**
 * Pools (glowing additive, soft alpha, flat chips, spark streaks) with preset emitters for the forge.
 * k = the particles' world scale: the presets were tuned in the old forge's units; the pools live
 * in a group scaled by k, so preset positions are world points while their spreads, speeds and
 * sizes shrink with k. Spawning straight into a pool: wrap world coordinates with P.w({...}).
 */
export class ForgeParticles {
  constructor(scene, k = 1) {
    this.k = k;
    this.group = new THREE.Group();
    this.group.scale.setScalar(k);
    this.glow = new ParticlePool(1400, { additive: true });
    this.soft = new ParticlePool(700, { additive: false, round: true });
    this.flat = new ParticlePool(500, { additive: false });
    this.streak = new StreakPool(700);
    this.group.add(this.glow.points, this.soft.points, this.flat.points, this.streak.lines);
    scene.add(this.group);
    this._p = new THREE.Vector3();
  }

  /** World point → pool space (a shared vector: use it right away). */
  loc(p) { return this._p.set(p.x / this.k, p.y / this.k, p.z / this.k); }

  /** Spawn options with world x/y/z → pool space (velocities and sizes stay in the tuned units). */
  w(o) { o.x /= this.k; o.y /= this.k; o.z /= this.k; return o; }

  update(dt, camera, viewHeightPx) {
    this.glow.update(dt, camera, viewHeightPx, this.k);
    this.soft.update(dt, camera, viewHeightPx, this.k);
    this.flat.update(dt, camera, viewHeightPx, this.k);
    this.streak.update(dt, camera, viewHeightPx, this.k);
  }

  /** Live particle count (all pools; for the frame-cost readout). */
  count() { return this.glow.alive + this.soft.alive + this.flat.alive + this.streak.alive; }

  clear() { this.glow.clear(); this.soft.clear(); this.flat.clear(); this.streak.clear(); }

  dispose() { this.group.removeFromParent(); this.glow.dispose(); this.soft.dispose(); this.flat.dispose(); this.streak.dispose(); }

  /** A surface (world {y, x, z, r}) → a shelf in pool space for bouncing. */
  shelfOf(surf) { return surf ? [surf.y / this.k, surf.x / this.k, surf.z / this.k, surf.r / this.k] : undefined; }

  /**
   * Hammer-blow spark shower: a fan of tiny voxel sparks (hot scale) streaking off the work,
   * bouncing off the anvil's face (surf: world {y, x, z, r}) and the floor, cooling as they die.
   */
  streaks(p, n = 30, power = 1, colorA = 0xfff6d0, colorB = 0xff6a1a, surf = null) {
    p = this.loc(p);
    const shelf = this.shelfOf(surf);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 3.2) * (0.55 + power * 0.75);
      const up = 0.15 + Math.random() * 0.9;
      this.streak.spawn({
        x: p.x + (Math.random() - 0.5) * 0.02, y: p.y + 0.01, z: p.z + (Math.random() - 0.5) * 0.02,
        vx: Math.cos(a) * sp, vy: up * sp * 0.75, vz: Math.sin(a) * sp * 0.75,
        life: 0.35 + Math.random() * 0.6, color: Math.random() < 0.4 ? 0xffffff : colorA, color1: colorB,
        gravity: 6, drag: 1.5, len: 0.016 + Math.random() * 0.02, size: 0.012 + Math.random() * 0.008, shelf, bounce: 0.3 + Math.random() * 0.2,
      });
    }
  }

  /** Oxide scale knocked off hot metal: dark voxel flakes, some still glowing, bouncing off the anvil. */
  scaleFlakes(p, n = 8, glowing = 0.4, surf = null) {
    p = this.loc(p);
    const shelf = this.shelfOf(surf);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.35 + Math.random() * 1.1;
      const hot = Math.random() < glowing;
      (hot ? this.glow : this.flat).spawn({
        x: p.x + (Math.random() - 0.5) * 0.03, y: p.y + 0.01, z: p.z + (Math.random() - 0.5) * 0.03,
        vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 1.2, vz: Math.sin(a) * sp * 0.7,
        life: 0.9 + Math.random() * 0.8, size: hot ? 0.012 : 0.01 + Math.random() * 0.008, size1: 0.007,
        color: hot ? 0xff9a3a : 0x3a2c28, color1: hot ? 0x5a160a : 0x2a1e1c, gravity: 5.5, drag: 0.7, fadeIn: 0,
        shelf, bounce: 0.32, floor: 0,
      });
    }
  }

  /** Water drops thrown up by the quench: little pale voxels that fall back and splash. */
  drips(p, n = 10, power = 1) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.2 + Math.random() * 0.7) * power;
      this.flat.spawn({
        x: p.x + (Math.random() - 0.5) * 0.06, y: p.y + 0.01, z: p.z + (Math.random() - 0.5) * 0.06,
        vx: Math.cos(a) * sp, vy: (0.6 + Math.random() * 1.2) * power, vz: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.4, size: 0.008 + Math.random() * 0.006, size1: 0.005,
        color: 0xd8f4ff, color1: 0x8ab8c8, alpha: 0.9, gravity: 6, drag: 0.4, fadeIn: 0, bounce: 0.2, floor: p.y - 0.01,
      });
    }
  }

  /**
   * The coals poked or roaring under the bellows: a gout of sparks and embers kicked up out of the
   * bed (world point, spread in world metres), some bursting high.
   */
  coalBurst(p, n = 20, power = 1, spread = 0.3) {
    const q = this.loc(p), sp = spread / this.k;
    for (let i = 0; i < n; i++) {
      const hot = Math.random() < 0.45;
      this.streak.spawn({
        x: q.x + (Math.random() - 0.5) * sp, y: q.y + Math.random() * 0.04, z: q.z + (Math.random() - 0.5) * sp * 0.6,
        vx: (Math.random() - 0.5) * 0.9 * power, vy: (0.8 + Math.random() * 2.2) * power, vz: (Math.random() - 0.5) * 0.6 * power,
        life: 0.5 + Math.random() * 0.8, color: hot ? 0xfff6d0 : 0xffc04a, color1: 0xc8300a,
        gravity: 1.2, drag: 1.4, len: 0.02 + Math.random() * 0.02, size: 0.01 + Math.random() * 0.006, floor: q.y - 0.05, bounce: 0.2,
      });
    }
    for (let i = 0; i < n * 0.6; i++) this.ember(p, spread, 1.6 * power);
  }

  /** A billow of steam rising off the quench barrel. */
  billow(p, n = 12, spread = 0.25, power = 1) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      this.soft.spawn({
        x: p.x + (Math.random() - 0.5) * spread, y: p.y + Math.random() * 0.06, z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.25 * power, vy: (0.35 + Math.random() * 0.6) * power, vz: (Math.random() - 0.5) * 0.2 * power,
        life: 1.4 + Math.random() * 1.4, size: 0.06, size1: 0.22 + Math.random() * 0.18,
        color: 0xffffff, color1: 0xa8a4a8, alpha: 0.36, drag: 0.9, wobble: 0.3, fadeIn: 0.12,
      });
    }
  }

  // ---------------------------------------------------------------- presets
  ember(p, spread = 0.3, heat = 1) {
    p = this.loc(p);
    const hot = Math.random() < 0.3 * heat;
    this.glow.spawn({
      x: p.x + (Math.random() - 0.5) * spread, y: p.y, z: p.z + (Math.random() - 0.5) * spread * 0.6,
      vx: (Math.random() - 0.5) * 0.15, vy: 0.35 + Math.random() * 0.55 * heat, vz: (Math.random() - 0.5) * 0.1,
      life: 1.2 + Math.random() * 1.6, size: hot ? 0.022 : 0.016, size1: 0.008,
      color: hot ? 0xffd27a : 0xff8a2a, color1: 0xa8280a, gravity: -0.05, drag: 0.4, wobble: 0.25,
    });
  }

  flame(p, spread = 0.3, heat = 1) {
    p = this.loc(p);
    const c = Math.random();
    this.glow.spawn({
      x: p.x + (Math.random() - 0.5) * spread, y: p.y + Math.random() * 0.03, z: p.z + (Math.random() - 0.5) * spread * 0.55,
      vx: (Math.random() - 0.5) * 0.08, vy: 0.25 + Math.random() * 0.35 * heat, vz: (Math.random() - 0.5) * 0.06,
      life: 0.4 + Math.random() * 0.45, size: 0.06 + 0.035 * heat, size1: 0.014,
      color: c < 0.4 ? 0xffe08a : 0xffa03a, color1: 0xc8300a, alpha: 0.6, gravity: -0.7, drag: 1.2, wobble: 0.3, fadeIn: 0.12,
    });
  }

  smoke(p, spread = 0.2, amount = 1) {
    p = this.loc(p);
    this.soft.spawn({
      x: p.x + (Math.random() - 0.5) * spread, y: p.y, z: p.z + (Math.random() - 0.5) * spread * 0.5,
      vx: (Math.random() - 0.5) * 0.06, vy: 0.22 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.05,
      life: 2.2 + Math.random() * 1.5, size: 0.08, size1: 0.3 + Math.random() * 0.2,
      color: 0x4a403c, color1: 0x2a2424, alpha: 0.28 * amount, drag: 0.3, wobble: 0.12, fadeIn: 0.25,
    });
  }

  /** Hammer sparks: a radial burst of hot scale (tiny glowing voxels; surf: the anvil's face to bounce on). */
  sparks(p, n = 24, power = 1, colorA = 0xfff0b0, colorB = 0xff7a1a, surf = null) {
    p = this.loc(p);
    const shelf = this.shelfOf(surf);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 2.4) * (0.5 + power * 0.7);
      const up = 0.4 + Math.random() * 1.4;
      this.glow.spawn({
        x: p.x, y: p.y + 0.01, z: p.z,
        vx: Math.cos(a) * sp, vy: up * sp * 0.7, vz: Math.sin(a) * sp * 0.8,
        life: 0.3 + Math.random() * 0.5, size: 0.012 + Math.random() * 0.01, size1: 0.005,
        color: Math.random() < 0.5 ? colorA : 0xffd060, color1: colorB, gravity: 5.5, drag: 1.6, shelf, bounce: 0.35,
      });
    }
  }

  /** Dull cold-strike flakes (dark scale chips). */
  flakes(p, n = 8) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.9;
      this.flat.spawn({
        x: p.x, y: p.y + 0.01, z: p.z,
        vx: Math.cos(a) * sp, vy: 0.6 + Math.random() * 0.8, vz: Math.sin(a) * sp * 0.7,
        life: 0.5 + Math.random() * 0.4, size: 0.014, size1: 0.01,
        color: 0x3a3230, color1: 0x2a2220, gravity: 5, drag: 0.8, fadeIn: 0,
      });
    }
  }

  /** Burning-steel "sparkler" spray: bright white stars that burst again mid-flight. */
  burnSpray(p, n = 40) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.6;
      this.glow.spawn({
        x: p.x, y: p.y + 0.02, z: p.z,
        vx: Math.cos(a) * sp * 0.8, vy: 1 + Math.random() * 2.2, vz: Math.sin(a) * sp * 0.6,
        life: 0.5 + Math.random() * 0.6, size: 0.02, size1: 0.006,
        color: 0xffffff, color1: 0xffd27a, gravity: 3.2, drag: 1.1,
      });
    }
    for (let i = 0; i < n * 0.6; i++) {
      // star bursts: tiny clusters
      const cx = p.x + (Math.random() - 0.5) * 0.4, cy = p.y + 0.1 + Math.random() * 0.35, cz = p.z + (Math.random() - 0.5) * 0.3;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.random();
        this.glow.spawn({
          x: cx, y: cy, z: cz, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5, vz: 0,
          life: 0.12 + Math.random() * 0.15, size: 0.012, size1: 0.004, color: 0xffffff, color1: 0xfff0b0, drag: 3,
        });
      }
    }
  }

  steam(p, n = 30, spread = 0.3, power = 1) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      this.soft.spawn({
        x: p.x + (Math.random() - 0.5) * spread, y: p.y + Math.random() * 0.05, z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.5 * power, vy: (0.6 + Math.random() * 1.2) * power, vz: (Math.random() - 0.5) * 0.4 * power,
        life: 0.9 + Math.random() * 1.3, size: 0.04 + Math.random() * 0.03, size1: 0.14 + Math.random() * 0.14,
        color: 0xf8f6f4, color1: 0xa8a6aa, alpha: 0.5, drag: 1.4, wobble: 0.3, fadeIn: 0.06,
      });
    }
  }

  bubbles(p, n = 6, spread = 0.2) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      this.flat.spawn({
        x: p.x + (Math.random() - 0.5) * spread, y: p.y, z: p.z + (Math.random() - 0.5) * spread,
        vx: 0, vy: 0.25 + Math.random() * 0.3, vz: 0, life: 0.2 + Math.random() * 0.25, size: 0.014, size1: 0.022,
        color: 0xc8f0ff, color1: 0xffffff, alpha: 0.85,
      });
    }
  }

  /** Small glittering sparkles that drift (gems, infusions, success). */
  sparkle(p, color = 0xfff0a0, n = 10, spread = 0.4, rise = 0.25) {
    p = this.loc(p);
    for (let i = 0; i < n; i++) {
      this.glow.spawn({
        x: p.x + (Math.random() - 0.5) * spread, y: p.y + (Math.random() - 0.5) * spread * 0.6, z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.1, vy: rise * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 0.1,
        life: 0.6 + Math.random() * 0.9, size: 0.02 + Math.random() * 0.014, size1: 0.004, color: 0xffffff, color1: color, drag: 0.5, fadeIn: 0.15,
      });
    }
  }
}
