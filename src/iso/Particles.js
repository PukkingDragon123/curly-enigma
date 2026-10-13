// One cheap pooled particle system: chunky square pixels drawn as GL points.
// Two batches share the pool logic: additive (sparks, glows, motes) and alpha (smoke, dust, water).
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, floor(aSize * uScale + 0.5));
}`;
const FRAG = /* glsl */`
varying vec4 vColor;
void main() {
  if (vColor.a < 0.01) discard;
  gl_FragColor = vColor;
  #include <colorspace_fragment>
}`;

const _c = new THREE.Color();

class Batch {
  constructor(max, additive) {
    this.max = max;
    this.list = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }
}

export class Particles {
  constructor(scene, max = 700) {
    this.add = new Batch(max, true);
    this.norm = new Batch(Math.floor(max * 0.7), false);
    scene.add(this.add.points, this.norm.points);
    this.scale = 1;
    this.emitters = [];
  }

  /**
   * o: {x,y,z, vx,vy,vz, life, size, size2, color, color2, alpha, alpha2, grav, drag, add, fn(p,dt), wob, data}
   * Colors are hex. Returns the particle or null when the pool is full.
   */
  spawn(o) {
    const b = o.add ? this.add : this.norm;
    if (b.list.length >= b.max) return null;
    _c.setHex(o.color ?? 0xffffff);
    const r0 = _c.r, g0 = _c.g, b0 = _c.b;
    _c.setHex(o.color2 ?? o.color ?? 0xffffff);
    const p = {
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      t: 0, life: o.life ?? 1, s0: o.size ?? 2, s1: o.size2 ?? o.size ?? 2,
      r0, g0, b0, r1: _c.r, g1: _c.g, b1: _c.b,
      a0: o.alpha ?? 1, a1: o.alpha2 ?? 0, grav: o.grav || 0, drag: o.drag || 0,
      fn: o.fn || null, wob: o.wob || 0, ph: Math.random() * 10, data: o.data || null, dead: false, blink: o.blink || 0,
    };
    b.list.push(p);
    return p;
  }

  /** A burst of n particles around a point. */
  burst(n, base, spread = {}) {
    for (let i = 0; i < n; i++) {
      const sx = spread.x ?? 0.1, sy = spread.y ?? 0.1, sz = spread.z ?? 0.1, sv = spread.v ?? 1;
      this.spawn({
        ...base,
        x: base.x + (Math.random() - 0.5) * 2 * sx,
        y: base.y + (Math.random() - 0.5) * 2 * sy,
        z: base.z + (Math.random() - 0.5) * 2 * sz,
        vx: (base.vx || 0) + (Math.random() - 0.5) * 2 * sv * (spread.vx ?? 1),
        vy: (base.vy || 0) + (Math.random() - 0.5) * 2 * sv * (spread.vy ?? 1),
        vz: (base.vz || 0) + (Math.random() - 0.5) * 2 * sv * (spread.vz ?? 1),
        life: (base.life ?? 1) * (0.7 + Math.random() * 0.6),
      });
    }
  }

  /** Continuous emitter: fn(dt, particles) is called every frame; rate-limited by `every` seconds. */
  addEmitter(e) {
    e.acc = e.acc ?? Math.random() * (e.every || 0.1);
    e.on = e.on ?? true;
    this.emitters.push(e);
    return e;
  }

  removeEmitter(e) {
    const i = this.emitters.indexOf(e);
    if (i >= 0) this.emitters.splice(i, 1);
  }

  update(dt, scale = 1) {
    for (const e of this.emitters) {
      if (!e.on) continue;
      if (e.when && !e.when()) continue;
      e.acc -= dt;
      let guard = 0;
      while (e.acc <= 0 && guard++ < 8) {
        e.acc += e.every || 0.1;
        e.emit(this);
      }
    }
    for (const b of [this.add, this.norm]) {
      b.uniforms.uScale.value = scale;
      const L = b.list;
      let n = 0;
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        p.t += dt;
        if (p.fn) p.fn(p, dt);
        if (p.dead || p.t >= p.life) continue;
        if (p.grav) p.vy -= p.grav * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.wob) { p.x += Math.sin(p.t * 3 + p.ph) * p.wob * dt; p.z += Math.cos(p.t * 2.3 + p.ph) * p.wob * dt; }
        const k = p.t / p.life;
        let a = p.a0 + (p.a1 - p.a0) * k;
        if (p.blink) a *= 0.55 + 0.45 * Math.sin(p.t * p.blink + p.ph);
        L[n++] = p;
        const j = n - 1;
        b.pos[j * 3] = p.x; b.pos[j * 3 + 1] = p.y; b.pos[j * 3 + 2] = p.z;
        b.col[j * 4] = p.r0 + (p.r1 - p.r0) * k;
        b.col[j * 4 + 1] = p.g0 + (p.g1 - p.g0) * k;
        b.col[j * 4 + 2] = p.b0 + (p.b1 - p.b0) * k;
        b.col[j * 4 + 3] = Math.max(0, Math.min(1, a));
        b.size[j] = p.s0 + (p.s1 - p.s0) * k;
      }
      L.length = n;
      const g = b.points.geometry;
      g.setDrawRange(0, n);
      if (n) {
        g.attributes.position.needsUpdate = true;
        g.attributes.aColor.needsUpdate = true;
        g.attributes.aSize.needsUpdate = true;
      }
    }
  }

  // ---------------------------------------------------------------- presets
  dustPuff(x, y, z, n = 8, color = 0x8a6a4a) {
    this.burst(n, { x, y, z, vy: 0.5, life: 0.7, size: 2.5, size2: 4, color, color2: 0x5a4a3a, alpha: 0.7, alpha2: 0, drag: 3 }, { x: 0.12, y: 0.05, z: 0.12, v: 0.9, vy: 0.6 });
  }

  sparks(x, y, z, n = 6, color = 0xffb040) {
    this.burst(n, { x, y, z, vy: 1.6, life: 0.6, size: 1.5, size2: 1, color, color2: 0xff5a1a, alpha: 1, alpha2: 0.2, grav: 4, add: true }, { x: 0.05, y: 0.05, z: 0.05, v: 1.2 });
  }

  hearts(x, y, z) {
    this.burst(4, { x, y, z, vy: 0.9, life: 0.9, size: 2.5, size2: 2, color: 0xff6a8a, alpha: 1, alpha2: 0, add: true, wob: 0.6 }, { x: 0.15, y: 0.05, z: 0.15, v: 0.25 });
  }
}
