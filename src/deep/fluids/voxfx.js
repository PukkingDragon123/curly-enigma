// Voxel spray for water and lava (mixed into Fluids as this.vfx; Fluids routes its water effects
// here): every droplet, drip, bead of foam, bubble, wisp of mist or steam and blob of lava is a
// little voxel (a cube on the voxel grid's own scale: a drop is a 1/32 m cube, a mist wisp a small
// cluster of 1/16 m cubes) with its own physics, lit like the rock (LIGHT), fogged like the air
// (AIR) and see-through in pixel steps (screen-door dither, so no sorting). One instanced draw.
//
// API: new VoxFx(scene3, world, U, cap) · update(dt) · dispose() · and the spray, by the same names
// and arguments as Particles': droplet, dripForm, drip, bubble, steam, mist, foam, crown, splash,
// lavaBlob; plus wisp(x, y, z, o) (lake mist drifting over water).
import * as THREE from 'three';
import { LIGHT, AIR } from '../TerrainMaterial.js';
import { VOX } from '../materials.js';
import { OPAQUE, FLUID } from '../Mesher.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const V32 = 1 / 32, V16 = 1 / 16;

export class VoxFx {
  constructor(scene3, world, U, cap = 900) {
    this.w = world;
    this.cap = cap;
    this.n = 0;
    // particle state (struct of arrays)
    const F = () => new Float32Array(cap);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.age = F(); this.size = F(); this.grow = F(); this.grav = F(); this.drag = F(); this.bounce = F();
    this.cr = F(); this.cg = F(); this.cb = F(); this.ca = F(); this.glow = F(); this.flags = new Uint8Array(cap); // 1 fade, 2 dies in fluid, 4 stretch when falling, 8 flat
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index;
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('normal', box.getAttribute('normal'));
    this.iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); // x, y, z, size
    this.iB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); // rgb, alpha
    this.iC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage); // y stretch, glow
    g.setAttribute('iA', this.iA); g.setAttribute('iB', this.iB); g.setAttribute('iC', this.iC);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`
        attribute vec4 iA;
        attribute vec4 iB;
        attribute vec2 iC;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec4 vCol;
        varying float vGlow;
        void main() {
          vec3 p = iA.xyz + position * vec3(iA.w, iA.w * iC.x, iA.w);
          vWorld = p;
          vN = normal;
          vCol = iB;
          vGlow = iC.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 fogCol;
        uniform float fogDist;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec4 vCol;
        varying float vGlow;
        ${LIGHT}
        ${AIR}
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          // see-through in pixel steps
          if (vCol.a < 0.99 && vCol.a <= bayer4(gl_FragCoord.xy) * 0.94 + 0.03) discard;
          vec3 n = normalize(vN);
          vec3 V = normalize(lampPos - vWorld);
          vec3 sp;
          vec3 L = lightFull(vWorld, n, V, 0.4, 1.0, 40.0, sp);
          // a lit face, a glint off the top, and its own glow (lava, embers)
          vec3 col = vCol.rgb * (L * 1.1 + 0.015) + sp * 0.25 * (1.0 - vGlow) + vCol.rgb * vGlow * 1.6;
          col *= 0.86 + 0.14 * max(n.y, 0.0) + 0.06 * abs(n.x);
          col = caveAir(col, vWorld, length(vWorld - lampPos));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'voxSpray';
    this.scene3 = scene3;
    scene3.add(this.mesh);
  }

  /** o: { x, y, z, vx, vy, vz, life, size, grow, grav, drag, bounce, color, alpha, glow, fade, wet (dies in fluid), stretch, flat } */
  spawn(o) {
    let i = this.n;
    if (i >= this.cap) {
      // full: replace the oldest-looking one (the first; cheap and good enough)
      i = (Math.random() * this.cap) | 0;
    } else this.n++;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.life[i] = o.life || 1; this.age[i] = 0;
    this.size[i] = o.size || V32; this.grow[i] = o.grow || 0;
    this.grav[i] = o.grav ?? 9.8; this.drag[i] = o.drag ?? 0.3; this.bounce[i] = o.bounce || 0;
    const c = o.color || [0.6, 0.8, 1];
    this.cr[i] = c[0]; this.cg[i] = c[1]; this.cb[i] = c[2]; this.ca[i] = o.alpha ?? 1;
    this.glow[i] = o.glow || 0;
    this.flags[i] = (o.fade === false ? 0 : 1) | (o.wet ? 2 : 0) | (o.stretch ? 4 : 0) | (o.flat ? 8 : 0);
    return i;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const a of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.age, this.size, this.grow, this.grav, this.drag, this.bounce, this.cr, this.cg, this.cb, this.ca, this.glow, this.flags]) a[i] = a[j];
  }

  update(dt) {
    const w = this.w;
    for (let i = 0; i < this.n; i++) {
      const age = (this.age[i] += dt);
      if (age >= this.life[i]) { this.kill(i); i--; continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr;
      this.vy[i] = (this.vy[i] - this.grav[i] * dt) * dr;
      const nx = this.px[i] + this.vx[i] * dt, ny = this.py[i] + this.vy[i] * dt, nz = this.pz[i] + this.vz[i] * dt;
      const m = w.voxelAt(Math.floor(nx * VOX), Math.floor(ny * VOX), Math.floor(nz * VOX));
      if (OPAQUE[m]) {
        if (this.bounce[i] > 0 && this.vy[i] < 0) { this.vy[i] *= -this.bounce[i]; this.vx[i] *= 0.6; this.vz[i] *= 0.6; this.bounce[i] *= 0.5; continue; }
        this.kill(i); i--; continue;
      }
      if ((this.flags[i] & 2) && FLUID[m] && this.vy[i] < 0) { this.kill(i); i--; continue; }
      this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
      this.size[i] += this.grow[i] * dt;
    }
    // write the instances
    const A = this.iA.array, B = this.iB.array, C = this.iC.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 4, f = this.flags[i];
      // sizes snap to the voxel grid's steps (1/64 m), never below one step
      const s = Math.max(1 / 64, Math.round(this.size[i] * 64) / 64);
      A[k] = this.px[i]; A[k + 1] = this.py[i]; A[k + 2] = this.pz[i]; A[k + 3] = s;
      const fade = f & 1 ? Math.min(1, (this.life[i] - this.age[i]) / Math.min(0.5, this.life[i] * 0.4)) : 1;
      B[k] = this.cr[i]; B[k + 1] = this.cg[i]; B[k + 2] = this.cb[i]; B[k + 3] = this.ca[i] * fade;
      C[i * 2] = f & 8 ? 0.5 : f & 4 ? 1 + Math.min(2, Math.max(0, -this.vy[i]) * 0.5) : 1;
      C[i * 2 + 1] = this.glow[i] * fade;
    }
    this.iA.needsUpdate = this.iB.needsUpdate = this.iC.needsUpdate = true;
    this.iA.addUpdateRange?.(0, this.n * 4); this.iB.addUpdateRange?.(0, this.n * 4); this.iC.addUpdateRange?.(0, this.n * 2);
    this.geo.instanceCount = this.n;
  }

  // ------------------------------------------------------------------ the spray (Particles' names)
  droplet(x, y, z, vx, vy, vz, life = 0.8, color = [0.62, 0.84, 1], size = 0.013) {
    this.spawn({ x, y, z, vx, vy, vz, life, size: size > 0.02 ? V16 * 0.75 : V32, color, alpha: 0.9, drag: 0.35, grav: 9.8, bounce: 0.35, wet: true, stretch: true });
  }
  /** A drop swelling on the ceiling before it lets go. */
  dripForm(x, y, z, life = 0.6, color = [0.6, 0.8, 1]) {
    this.spawn({ x, y, z, life, size: 1 / 64, grow: (V32 - 1 / 64) / life, color, alpha: 0.95, drag: 0, grav: 0, fade: false });
  }
  /** A falling drop; lives `life` seconds (until it reaches the surface below). */
  drip(x, y, z, life, color = [0.6, 0.8, 1]) {
    this.spawn({ x, y, z, vy: -0.3, life, size: V32, color, alpha: 1, drag: 0, grav: 9.8, fade: false, stretch: true });
  }
  /** A bubble wobbling up through water; pops after `life` seconds. */
  bubble(x, y, z, life = 1, color = [0.72, 0.9, 1]) {
    this.spawn({ x, y, z, vx: rnd(-0.06, 0.06), vy: 0.15, vz: rnd(-0.06, 0.06), life, size: Math.random() < 0.7 ? 1 / 48 : V32, grow: 0.004, color, alpha: 0.7, drag: 1.2, grav: -1.4, fade: false });
  }
  /** Steam / smoke: a little cluster of cubes rising, swelling, thinning out. */
  steam(x, y, z, k = 1, color = [0.8, 0.8, 0.84]) {
    const vx = rnd(-0.12, 0.12), vy = 0.3 + Math.random() * 0.5 * k, vz = rnd(-0.12, 0.12), life = rnd(1.2, 2.4);
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) this.spawn({ x: x + Math.round(rnd(-1.5, 1.5)) * V16, y: y + Math.round(rnd(0, 1.5)) * V16, z: z + Math.round(rnd(-1.5, 1.5)) * V16, vx: vx + rnd(-0.04, 0.04), vy: vy * rnd(0.85, 1.1), vz: vz + rnd(-0.04, 0.04), life: life * rnd(0.8, 1), size: V16 * rnd(0.8, 1.2), grow: 0.05 * k, color, alpha: rnd(0.22, 0.34), drag: 1.4, grav: -0.5 });
  }
  /** A glowing blob of lava flung out: arcs, bounces on rock, cools away. */
  lavaBlob(x, y, z, vx, vy, vz, size = 0.03) {
    this.spawn({ x, y, z, vx, vy, vz, life: rnd(1.1, 1.7), size: size > 0.035 ? V16 : V32 * 1.5, color: [1, 0.5 + Math.random() * 0.25, 0.12], glow: 1, drag: 0.25, grav: 9, bounce: 0.35 });
  }
  /** Fine spray where falling water lands: a few small cubes lifting off and thinning out. */
  mist(x, y, z, color = [0.7, 0.85, 1]) {
    const vx = rnd(-0.25, 0.25), vy = rnd(0.2, 0.6), vz = rnd(-0.25, 0.25);
    for (let i = 0; i < 3; i++) this.spawn({ x: x + rnd(-0.06, 0.06), y: y + rnd(0, 0.05), z: z + rnd(-0.06, 0.06), vx: vx + rnd(-0.08, 0.08), vy: vy * rnd(0.8, 1.1), vz: vz + rnd(-0.08, 0.08), life: rnd(0.5, 1.2), size: V32, grow: 0.025, color, alpha: 0.32, drag: 2.2, grav: -0.15 });
  }
  /** Foam riding the surface: a flat bead or two. */
  foam(x, y, z, vx, vz, color = [0.85, 0.95, 1]) {
    this.spawn({ x, y, z, vx, vz, life: rnd(0.4, 0.9), size: Math.random() < 0.5 ? V32 : 1 / 48, color, alpha: 0.9, drag: 3.2, grav: 0, flat: true });
  }
  /** A splash crown: a ring of drops thrown up and out, a jet in the middle (lifeAt: see Particles). */
  crown(x, y, z, k = 1, color = [0.62, 0.84, 1], lifeAt = null) {
    const n = Math.round(10 + 14 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = (0.7 + Math.random() * 0.9) * (0.6 + k * 0.6);
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = 1.4 + Math.random() * 1.8 * Math.sqrt(k);
      const tR = (2 * vy) / 9.8;
      this.droplet(x + Math.cos(a) * 0.08, y + 0.02, z + Math.sin(a) * 0.08, vx, vy, vz, lifeAt ? lifeAt(x + vx * tR, z + vz * tR, tR) : 0.8, color);
    }
    for (let i = 0; i < 3 + k * 4; i++) this.droplet(x + rnd(-0.03, 0.03), y + 0.03, z + rnd(-0.03, 0.03), rnd(-0.2, 0.2), 2.4 + Math.random() * 2 * k, rnd(-0.2, 0.2), 0.9, color, 0.024);
    for (let i = 0; i < 6 + k * 6; i++) { const a = Math.random() * 6.283, s = rnd(0.3, 0.9); this.foam(x, y + 0.012, z, Math.cos(a) * s, Math.sin(a) * s); }
  }
  splash(x, y, z, k = 1, color = [0.6, 0.8, 1]) {
    for (let i = 0; i < 12 * k; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.6) * k;
      this.droplet(x, y, z, Math.cos(a) * sp, 1.8 + Math.random() * 2.5 * Math.sqrt(k), Math.sin(a) * sp, 0.5 + Math.random() * 0.4, color);
    }
  }
  /** Mist drifting low over still water: a loose cluster of pale cubes, slow and long-lived. */
  wisp(x, y, z, o = {}) {
    const vx = o.vx ?? rnd(-0.12, 0.12), vz = o.vz ?? rnd(-0.12, 0.12), life = rnd(4, 7), c = o.color || [0.62, 0.7, 0.78];
    const n = 3 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) this.spawn({ x: x + Math.round(rnd(-2, 2)) * V16, y: y + Math.round(rnd(0, 1.2)) * V16, z: z + Math.round(rnd(-2, 2)) * V16, vx: vx + rnd(-0.02, 0.02), vy: rnd(-0.005, 0.02), vz: vz + rnd(-0.02, 0.02), life: life * rnd(0.75, 1), size: V16 * rnd(0.9, 1.4), grow: 0.01, color: c, alpha: rnd(0.14, 0.24), drag: 0.05, grav: 0 });
  }

  dispose() {
    this.scene3.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
