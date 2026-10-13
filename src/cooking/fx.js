// Crisp square-pixel particles (steam, crumbs, salt, flour, smoke, sparkles, droplets).
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 color;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  vA = alpha;
  vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, floor(size * uScale / -mv.z + 0.5));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying float vA;
varying vec3 vC;
void main() {
  if (vA < 0.02) discard;
  gl_FragColor = vec4(vC, vA);
}`;

const _c = new THREE.Color();

export class Particles {
  constructor(parent, max = 700) {
    this.max = max;
    this.n = 0;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    parent.add(this.points);
  }

  /** o: {pos:Vector3|[x,y,z], vel:[x,y,z], color:hex, size (world), life, gravity, drag, fade, grow, floor, spin} */
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    const pos = Array.isArray(o.pos) ? new THREE.Vector3(...o.pos) : o.pos.clone();
    const vel = Array.isArray(o.vel) ? new THREE.Vector3(...o.vel) : (o.vel ? o.vel.clone() : new THREE.Vector3());
    _c.set(o.color ?? 0xffffff);
    this.p.push({
      pos, vel, r: _c.r, g: _c.g, b: _c.b, size: o.size ?? 0.02, life: o.life ?? 1, t: 0,
      gravity: o.gravity ?? 0, drag: o.drag ?? 0, fade: o.fade ?? 1, grow: o.grow ?? 0, floor: o.floor ?? -99, a0: o.alpha ?? 1,
    });
  }

  burst(n, f) { for (let i = 0; i < n; i++) this.emit(f(i)); }

  update(dt, camera, viewH) {
    this.mat.uniforms.uScale.value = viewH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const alive = [];
    for (const q of this.p) {
      q.t += dt;
      if (q.t >= q.life) continue;
      q.vel.y -= q.gravity * dt;
      if (q.drag) q.vel.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.pos.addScaledVector(q.vel, dt);
      if (q.pos.y < q.floor) { q.pos.y = q.floor; q.vel.y *= -0.25; q.vel.x *= 0.5; q.vel.z *= 0.5; }
      alive.push(q);
    }
    this.p = alive;
    const n = Math.min(alive.length, this.max);
    for (let i = 0; i < n; i++) {
      const q = alive[i];
      const k = q.t / q.life;
      this.pos[i * 3] = q.pos.x; this.pos[i * 3 + 1] = q.pos.y; this.pos[i * 3 + 2] = q.pos.z;
      this.col[i * 3] = q.r; this.col[i * 3 + 1] = q.g; this.col[i * 3 + 2] = q.b;
      this.size[i] = q.size * (1 + q.grow * k);
      this.alpha[i] = q.a0 * (q.fade ? Math.min(1, (1 - k) * 2.2 / Math.max(0.2, q.fade)) : 1);
    }
    for (let i = n; i < this.n; i++) this.alpha[i] = 0;
    this.n = n;
    this.geo.setDrawRange(0, Math.max(n, 1));
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  clear() { this.p = []; }
}

// ---------------------------------------------------------------- presets
const R = (a, b) => a + Math.random() * (b - a);

export function steam(fx, at, spread = 0.25, color = 0xf4f0ec) {
  fx.emit({ pos: [at.x + R(-spread, spread), at.y, at.z + R(-spread, spread) * 0.7], vel: [R(-0.03, 0.03), R(0.22, 0.36), R(-0.02, 0.02)], color, size: R(0.009, 0.015), life: R(1.0, 1.7), grow: 0.9, alpha: 0.42, fade: 1.6 });
}

export function crumbs(fx, at, color, n = 8, floor = 0) {
  fx.burst(n, () => ({ pos: [at.x + R(-0.04, 0.04), at.y, at.z + R(-0.08, 0.08)], vel: [R(-0.5, 0.5), R(0.4, 1.0), R(-0.3, 0.3)], color, size: R(0.014, 0.024), life: R(0.5, 0.9), gravity: 4.5, floor, fade: 0.4 }));
}

export function sparkle(fx, at, n = 10, colors = [0xfff6b0, 0xffffff, 0xffd84a]) {
  fx.burst(n, () => {
    const a = R(0, Math.PI * 2), s = R(0.4, 1.1);
    return { pos: [at.x, at.y, at.z], vel: [Math.cos(a) * s, R(0.3, 1.2), Math.sin(a) * s * 0.6], color: colors[(Math.random() * colors.length) | 0], size: R(0.018, 0.03), life: R(0.4, 0.8), drag: 3, fade: 0.6 };
  });
}

export function smoke(fx, at, spread = 0.2) {
  fx.emit({ pos: [at.x + R(-spread, spread), at.y, at.z + R(-spread, spread) * 0.6], vel: [R(-0.04, 0.04), R(0.2, 0.35), 0], color: 0x3a3438, size: R(0.05, 0.08), life: R(1.2, 1.8), grow: 1.2, alpha: 0.65, fade: 1.4 });
}

export function droplets(fx, at, color, n = 6, floor = 0, power = 1) {
  fx.burst(n, () => ({ pos: [at.x, at.y, at.z], vel: [R(-0.6, 0.6) * power, R(0.6, 1.3) * power, R(-0.4, 0.5) * power], color, size: R(0.016, 0.026), life: R(0.5, 0.9), gravity: 5, floor, fade: 0.3 }));
}

export function puff(fx, at, color = 0xfffaf0, n = 10, spread = 0.18) {
  fx.burst(n, () => {
    const a = R(0, Math.PI * 2);
    return { pos: [at.x + Math.cos(a) * spread * 0.4, at.y, at.z + Math.sin(a) * spread * 0.3], vel: [Math.cos(a) * R(0.2, 0.6), R(0.05, 0.3), Math.sin(a) * R(0.1, 0.4)], color, size: R(0.03, 0.055), life: R(0.6, 1.1), drag: 2.5, grow: 0.8, alpha: 0.8, fade: 1 };
  });
}
