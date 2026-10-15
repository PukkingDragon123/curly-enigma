// Pixel-square particles for the underground (dust, chips, sparks, embers, glints, drips, spores).
// One Points cloud per blend mode; each particle has its own physics (gravity, drag, bounce on
// rock, buoyancy), size growth and fade.
import * as THREE from 'three';
import { VOX } from './materials.js';

const vert = /* glsl */`
  attribute vec4 pcol;
  attribute float psize;
  uniform float pxScale;
  varying vec4 vCol;
  varying float vDist;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    // pixel squares; capped so dust right in front of the eyes doesn't become a wall of fog
    gl_PointSize = clamp(floor(psize * pxScale / max(0.05, -mv.z) + 0.5), 1.0, 22.0);
    vCol = pcol;
    vCol.a *= smoothstep(0.1, 0.4, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */`
  uniform vec3 fogCol;
  uniform float fogDist;
  uniform float additive;
  varying vec4 vCol;
  varying float vDist;
  void main() {
    float f = 1.0 - exp(-pow(vDist / fogDist, 2.0) * 2.2);
    vec3 c = additive > 0.5 ? vCol.rgb * (1.0 - f) : mix(vCol.rgb, fogCol, f);
    gl_FragColor = vec4(c, vCol.a);
  }`;

class Cloud {
  constructor(scene3, U, cap, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.p = []; // particle state
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { fogCol: U.fogCol, fogDist: U.fogDist, pxScale: { value: 400 }, additive: { value: additive ? 1 : 0 } },
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    scene3.add(this.points);
  }
}

export class Particles {
  constructor(scene3, world, U) {
    this.w = world;
    this.soft = new Cloud(scene3, U, 4000, false);
    this.bright = new Cloud(scene3, U, 2600, true);
  }

  setPixelScale(h, fovDeg) {
    const s = (h / 2) / Math.tan((fovDeg * Math.PI) / 360);
    this.soft.mat.uniforms.pxScale.value = s;
    this.bright.mat.uniforms.pxScale.value = s;
  }

  /**
   * o: { x, y, z, vx, vy, vz, life, size (m), grow, color [r,g,b], alpha, drag, grav, bounce, glow, fade }
   */
  spawn(o) {
    const c = o.glow ? this.bright : this.soft;
    if (c.p.length >= c.cap) c.p.shift();
    c.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, t: 0, life: o.life || 1, size: o.size || 0.03,
      grow: o.grow || 0, r: o.color[0], g: o.color[1], b: o.color[2], a: o.alpha ?? 1, drag: o.drag ?? 1, grav: o.grav ?? 0,
      bounce: o.bounce ?? 0, fade: o.fade !== false });
  }

  update(dt) {
    const w = this.w;
    for (const c of [this.soft, this.bright]) {
      let n = 0;
      const keep = [];
      for (const q of c.p) {
        q.t += dt;
        if (q.t >= q.life) continue;
        q.vy -= q.grav * dt;
        const d = Math.max(0, 1 - q.drag * dt);
        q.vx *= d; q.vy *= d; q.vz *= d;
        const ny = q.y + q.vy * dt;
        if (q.bounce && w.solidAt(q.x, ny, q.z)) { q.vy = -q.vy * q.bounce; q.vx *= 0.6; q.vz *= 0.6; }
        else q.y = ny;
        q.x += q.vx * dt; q.z += q.vz * dt;
        keep.push(q);
        const k = q.fade ? 1 - q.t / q.life : 1;
        const i = n++;
        c.pos[i * 3] = q.x; c.pos[i * 3 + 1] = q.y; c.pos[i * 3 + 2] = q.z;
        c.col[i * 4] = q.r; c.col[i * 4 + 1] = q.g; c.col[i * 4 + 2] = q.b; c.col[i * 4 + 3] = q.a * k;
        c.size[i] = q.size + q.grow * q.t;
      }
      c.p = keep;
      c.n = n;
      c.geo.setDrawRange(0, n);
      c.geo.attributes.position.needsUpdate = true;
      c.geo.attributes.pcol.needsUpdate = true;
      c.geo.attributes.psize.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ presets (meters)
  dust(x, y, z, n = 8, color = [0.55, 0.45, 0.36], spread = 0.15, out = null) {
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * spread * 2, oy = (Math.random() - 0.5) * spread * 2, oz = (Math.random() - 0.5) * spread * 2;
      this.spawn({ x: x + ox, y: y + oy, z: z + oz,
        vx: (out ? out[0] * 0.8 : 0) + ox * 2, vy: Math.random() * 0.5 + (out ? out[1] * 0.8 : 0), vz: (out ? out[2] * 0.8 : 0) + oz * 2,
        life: 0.8 + Math.random() * 1.2, size: 0.03 + Math.random() * 0.05, grow: 0.06, color, alpha: 0.5 + Math.random() * 0.3, drag: 2.2, grav: -0.15 });
    }
  }
  chips(x, y, z, n, color, out) {
    for (let i = 0; i < n; i++) {
      const sp = 1.5 + Math.random() * 3;
      this.spawn({ x, y, z, vx: out[0] * sp + (Math.random() - 0.5) * 2.4, vy: out[1] * sp + Math.random() * 2.2, vz: out[2] * sp + (Math.random() - 0.5) * 2.4,
        life: 0.5 + Math.random() * 0.6, size: 0.012 + Math.random() * 0.016, color, alpha: 1, drag: 0.6, grav: 9, bounce: 0.35, fade: false });
    }
  }
  sparks(x, y, z, n = 8, color = [1, 0.75, 0.35], out = [0, 0, 0], speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * Math.PI;
      const sp = speed * (0.4 + Math.random());
      this.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(b) * sp + out[0] * 2, vy: Math.sin(b) * sp + out[1] * 2, vz: Math.sin(a) * Math.cos(b) * sp + out[2] * 2,
        life: 0.15 + Math.random() * 0.35, size: 0.012 + Math.random() * 0.01, color, alpha: 1, drag: 1.5, grav: 6, glow: true, bounce: 0.4 });
    }
  }
  glints(x, y, z, color = [1, 1, 0.85]) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.1, y: y + (Math.random() - 0.5) * 0.1, z: z + (Math.random() - 0.5) * 0.1, life: 0.35, size: 0.03, color, glow: true, drag: 0 });
  }
  ember(x, y, z) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.2, y, z: z + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.3, vy: 0.4 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3,
      life: 0.8 + Math.random() * 1.2, size: 0.015 + Math.random() * 0.012, color: Math.random() < 0.5 ? [1, 0.5, 0.12] : [1, 0.8, 0.3], glow: true, drag: 0.5, grav: -0.3 });
  }
  mote(x, y, z, color = [1, 0.92, 0.75]) {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.06,
      life: 3 + Math.random() * 4, size: 0.008 + Math.random() * 0.008, color, alpha: 0.7, drag: 0.1 });
  }
  firefly(x, y, z, color) {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.3, life: 2 + Math.random() * 2, size: 0.016, color, glow: true, drag: 0.3, grav: -0.03 });
  }
  splash(x, y, z, k = 1, color = [0.6, 0.8, 1]) {
    for (let i = 0; i < 12 * k; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.6) * k;
      this.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 1.8 + Math.random() * 2.5 * Math.sqrt(k), vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, size: 0.012 + Math.random() * 0.012, color, drag: 0.4, grav: 9 });
    }
  }

  dispose() {
    for (const c of [this.soft, this.bright]) { c.geo.dispose(); c.mat.dispose(); }
  }

  // ------------------------------------------------------------ fluid presets (Fluids.js)
  /** One water droplet: arcs, bounces off rock, fades out over `life`. */
  droplet(x, y, z, vx, vy, vz, life = 0.8, color = [0.62, 0.84, 1], size = 0.013) {
    this.spawn({ x, y, z, vx, vy, vz, life, size: size * (0.7 + Math.random() * 0.6), color, alpha: 0.95, drag: 0.35, grav: 9.8, bounce: 0.42 });
  }
  /** A drop swelling on the ceiling before it lets go. */
  dripForm(x, y, z, life = 0.6, color = [0.6, 0.8, 1]) {
    this.spawn({ x, y, z, life, size: 0.005, grow: 0.011 / life, color, alpha: 0.95, drag: 0, fade: false });
  }
  /** A falling drop; lives `life` seconds (until it reaches the surface below). */
  drip(x, y, z, life, color = [0.6, 0.8, 1]) {
    this.spawn({ x, y, z, vy: -0.3, life, size: 0.011, color, alpha: 1, drag: 0, grav: 9.8, fade: false });
  }
  /** A bubble wobbling up through water; pops after `life` seconds. */
  bubble(x, y, z, life = 1, color = [0.72, 0.9, 1]) {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.12, vy: 0.15, vz: (Math.random() - 0.5) * 0.12, life, size: 0.008 + Math.random() * 0.01, grow: 0.006,
      color, alpha: 0.85, drag: 1.2, grav: -1.4, fade: false });
  }
  /** Steam / smoke wisp: rises, swells and thins out. */
  steam(x, y, z, k = 1, color = [0.8, 0.8, 0.84]) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.1, y, z: z + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.25, vy: 0.3 + Math.random() * 0.5 * k, vz: (Math.random() - 0.5) * 0.25,
      life: 1.2 + Math.random() * 1.4, size: 0.03 + Math.random() * 0.03, grow: 0.12 * k, color, alpha: 0.2 + Math.random() * 0.12, drag: 1.4, grav: -0.5 });
  }
  /** A glowing blob of lava flung out: arcs, bounces on rock, cools away. */
  lavaBlob(x, y, z, vx, vy, vz, size = 0.03) {
    this.spawn({ x, y, z, vx, vy, vz, life: 1.1 + Math.random() * 0.6, size: size * (0.7 + Math.random() * 0.6), color: [1, 0.5 + Math.random() * 0.25, 0.12], glow: true, drag: 0.25, grav: 9, bounce: 0.35 });
  }
  /** Fine spray where falling water lands. */
  mist(x, y, z, color = [0.7, 0.85, 1]) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.12, y, z: z + (Math.random() - 0.5) * 0.12, vx: (Math.random() - 0.5) * 0.5, vy: 0.2 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.5,
      life: 0.5 + Math.random() * 0.7, size: 0.01 + Math.random() * 0.012, grow: 0.035, color, alpha: 0.2, drag: 2.2, grav: -0.15 });
  }
  /** Grains trickling from a freshly dug ceiling. */
  grain(x, y, z, color) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.06, y, z: z + (Math.random() - 0.5) * 0.06, vx: (Math.random() - 0.5) * 0.1, vy: -0.2, vz: (Math.random() - 0.5) * 0.1,
      life: 0.9 + Math.random() * 0.6, size: 0.008 + Math.random() * 0.007, color, alpha: 1, drag: 0.3, grav: 9.8, bounce: 0.25, fade: false });
  }
  /** Foam flecks skating outward on a surface. */
  foam(x, y, z, vx, vz, color = [0.85, 0.95, 1]) {
    this.spawn({ x, y, z, vx, vz, life: 0.4 + Math.random() * 0.5, size: 0.01 + Math.random() * 0.008, color, alpha: 0.9, drag: 3.2 });
  }
  /**
   * A splash crown: a ring of droplets thrown up and out, a jet bouncing up from the middle, foam.
   * lifeAt(x, z, tReturn) → life of a droplet that comes back down at (x, z) after tReturn seconds
   * (so drops vanish into the water but bounce on rock).
   */
  crown(x, y, z, k = 1, color = [0.62, 0.84, 1], lifeAt = null) {
    const n = Math.round(10 + 14 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = (0.7 + Math.random() * 0.9) * (0.6 + k * 0.6);
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = 1.4 + Math.random() * 1.8 * Math.sqrt(k);
      const tR = (2 * vy) / 9.8;
      this.droplet(x + Math.cos(a) * 0.08, y + 0.02, z + Math.sin(a) * 0.08, vx, vy, vz, lifeAt ? lifeAt(x + vx * tR, z + vz * tR, tR) : 0.8, color);
    }
    for (let i = 0; i < 4 + 4 * k; i++) {
      const vy = 2.2 + Math.random() * 2.2 * k;
      this.droplet(x + (Math.random() - 0.5) * 0.04, y, z + (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.3, vy, (Math.random() - 0.5) * 0.3, (2 * vy) / 9.8, color, 0.017);
    }
    for (let i = 0; i < 8 * k; i++) { const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.8; this.foam(x, y + 0.01, z, Math.cos(a) * sp, Math.sin(a) * sp); }
  }
}

export { VOX };
