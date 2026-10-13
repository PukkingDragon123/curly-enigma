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
  if (uRound > 0.5) {
    vec2 d = gl_PointCoord - 0.5;
    if (dot(d, d) > 0.25) discard;
  }
  gl_FragColor = vec4(vColor, vAlpha);
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
    return i;
  }

  clear() { this.life.fill(0); }

  update(dt, camera, viewHeightPx) {
    if (camera && camera.isPerspectiveCamera) {
      this.material.uniforms.uScale.value = viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
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

/** Two pools (glowing additive + soft alpha) with preset emitters for the forge. */
export class ForgeParticles {
  constructor(scene) {
    this.glow = new ParticlePool(1400, { additive: true });
    this.soft = new ParticlePool(700, { additive: false, round: true });
    this.flat = new ParticlePool(500, { additive: false });
    scene.add(this.glow.points, this.soft.points, this.flat.points);
  }

  update(dt, camera, viewHeightPx) {
    this.glow.update(dt, camera, viewHeightPx);
    this.soft.update(dt, camera, viewHeightPx);
    this.flat.update(dt, camera, viewHeightPx);
  }

  clear() { this.glow.clear(); this.soft.clear(); this.flat.clear(); }

  dispose() { this.glow.dispose(); this.soft.dispose(); this.flat.dispose(); }

  // ---------------------------------------------------------------- presets
  ember(p, spread = 0.3, heat = 1) {
    const hot = Math.random() < 0.3 * heat;
    this.glow.spawn({
      x: p.x + (Math.random() - 0.5) * spread, y: p.y, z: p.z + (Math.random() - 0.5) * spread * 0.6,
      vx: (Math.random() - 0.5) * 0.15, vy: 0.35 + Math.random() * 0.55 * heat, vz: (Math.random() - 0.5) * 0.1,
      life: 1.2 + Math.random() * 1.6, size: hot ? 0.022 : 0.016, size1: 0.008,
      color: hot ? 0xffd27a : 0xff8a2a, color1: 0xa8280a, gravity: -0.05, drag: 0.4, wobble: 0.25,
    });
  }

  flame(p, spread = 0.3, heat = 1) {
    const c = Math.random();
    this.glow.spawn({
      x: p.x + (Math.random() - 0.5) * spread, y: p.y + Math.random() * 0.03, z: p.z + (Math.random() - 0.5) * spread * 0.55,
      vx: (Math.random() - 0.5) * 0.08, vy: 0.25 + Math.random() * 0.35 * heat, vz: (Math.random() - 0.5) * 0.06,
      life: 0.35 + Math.random() * 0.35, size: 0.05 + 0.03 * heat, size1: 0.012,
      color: c < 0.4 ? 0xffe08a : 0xffa03a, color1: 0xc8300a, alpha: 0.55, gravity: -0.6, drag: 1.2, wobble: 0.3, fadeIn: 0.12,
    });
  }

  smoke(p, spread = 0.2, amount = 1) {
    this.soft.spawn({
      x: p.x + (Math.random() - 0.5) * spread, y: p.y, z: p.z + (Math.random() - 0.5) * spread * 0.5,
      vx: (Math.random() - 0.5) * 0.06, vy: 0.22 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.05,
      life: 2.2 + Math.random() * 1.5, size: 0.08, size1: 0.3 + Math.random() * 0.2,
      color: 0x4a403c, color1: 0x2a2424, alpha: 0.28 * amount, drag: 0.3, wobble: 0.12, fadeIn: 0.25,
    });
  }

  /** Hammer sparks: a radial burst of hot scale. */
  sparks(p, n = 24, power = 1, colorA = 0xfff0b0, colorB = 0xff7a1a) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 2.4) * (0.5 + power * 0.7);
      const up = 0.4 + Math.random() * 1.4;
      this.glow.spawn({
        x: p.x, y: p.y + 0.01, z: p.z,
        vx: Math.cos(a) * sp, vy: up * sp * 0.7, vz: Math.sin(a) * sp * 0.8,
        life: 0.25 + Math.random() * 0.45, size: 0.016 + Math.random() * 0.012, size1: 0.006,
        color: Math.random() < 0.5 ? colorA : 0xffd060, color1: colorB, gravity: 5.5, drag: 1.6,
      });
    }
  }

  /** Dull cold-strike flakes (dark scale chips). */
  flakes(p, n = 8) {
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
    for (let i = 0; i < n; i++) {
      this.soft.spawn({
        x: p.x + (Math.random() - 0.5) * spread, y: p.y + Math.random() * 0.05, z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.5 * power, vy: (0.6 + Math.random() * 1.2) * power, vz: (Math.random() - 0.5) * 0.4 * power,
        life: 1 + Math.random() * 1.4, size: 0.08, size1: 0.35 + Math.random() * 0.25,
        color: 0xf4f0ee, color1: 0xb8b4b8, alpha: 0.42, drag: 1.4, wobble: 0.2, fadeIn: 0.08,
      });
    }
  }

  bubbles(p, n = 6, spread = 0.2) {
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
    for (let i = 0; i < n; i++) {
      this.glow.spawn({
        x: p.x + (Math.random() - 0.5) * spread, y: p.y + (Math.random() - 0.5) * spread * 0.6, z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.1, vy: rise * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 0.1,
        life: 0.6 + Math.random() * 0.9, size: 0.02 + Math.random() * 0.014, size1: 0.004, color: 0xffffff, color1: color, drag: 0.5, fadeIn: 0.15,
      });
    }
  }
}
