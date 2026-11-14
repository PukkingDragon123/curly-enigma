// Chunky voxel debris (wave 14): the bits a pick knocks out of the face. Every bit is a little
// block on the voxel grid's own steps (a 1/32 m chip of stone, a 1/16 m clod of dirt, a sliver of
// crystal, a nugget of ore), with the grain of the stuff it came from dithered over its faces. Bits
// fly out, tumble, bounce off the rock (each material its own bounce and friction), skid, roll
// over onto a flat face and settle, lie there a moment, then sink into the floor. Lit like the
// rock (LIGHT), fogged like the air (AIR), on the outline layer, one instanced draw. Bigger slabs
// stay Bodies.js; the dust and sparks stay Particles.js.
//
//   const deb = new Debris(scene3, world, U);
//   deb.burst(x, y, z, n, { colors: [[r, g, b]...], out: [nx, ny, nz], kind: 'stone' | 'dirt' | 'clay' |
//             'sand' | 'crystal' | 'ore' | 'wood', speed, glow, size });
//   deb.update(dt); deb.dispose();
import * as THREE from 'three';
import { LIGHT, AIR } from './TerrainMaterial.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { VOX } from './materials.js';
import { OPAQUE } from './Mesher.js';

const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const CAP = PHONE ? 220 : 420;
const GRAV = 13;
const rnd = (a, b) => a + Math.random() * (b - a);
// how each stuff flies: block size in 1/64 m steps [min, max] per axis, bounce, friction on landing,
// spin, life on the floor (s), speed, a share of flat flakes
const KIND = {
  dirt: { s: [3, 5], bounce: 0.22, fric: 0.55, spin: 7, stay: [1.4, 2.6], sp: 1.6, flat: 0.15 },
  clay: { s: [3, 5], bounce: 0.06, fric: 0.25, spin: 4, stay: [2, 3], sp: 1.1, flat: 0.5 },
  sand: { s: [2, 3], bounce: 0.15, fric: 0.5, spin: 5, stay: [0.8, 1.6], sp: 1.3, flat: 0 },
  stone: { s: [2, 4], bounce: 0.42, fric: 0.62, spin: 12, stay: [1.6, 3], sp: 2.3, flat: 0.35 },
  hard: { s: [2, 3.6], bounce: 0.5, fric: 0.66, spin: 14, stay: [1.6, 3], sp: 2.7, flat: 0.45 },
  crystal: { s: [1, 3], bounce: 0.55, fric: 0.7, spin: 16, stay: [1.2, 2.2], sp: 2.4, flat: 0.1, long: 0.7 },
  ore: { s: [2, 4], bounce: 0.45, fric: 0.6, spin: 11, stay: [2, 3.2], sp: 2, flat: 0.2 },
  wood: { s: [1, 3], bounce: 0.3, fric: 0.5, spin: 10, stay: [1.4, 2.4], sp: 1.8, flat: 0, long: 0.9 },
};

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
// the four rest orientations a block can roll over onto, by the axis that ends up pointing up
const SNAP = [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)];

export class Debris {
  constructor(scene3, world, U) {
    this.w = world;
    this.list = [];
    this.free = [];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index;
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('normal', box.getAttribute('normal'));
    this.iP = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage); // position, seed
    this.iQ = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage); // rotation
    this.iS = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage); // size xyz (m), glow
    this.iC = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage); // colour (linear)
    g.setAttribute('iP', this.iP); g.setAttribute('iQ', this.iQ); g.setAttribute('iS', this.iS); g.setAttribute('iC', this.iC);
    g.instanceCount = 0;
    this.geo = g;
    box.dispose();
    this.mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`
        attribute vec4 iP;
        attribute vec4 iQ;
        attribute vec4 iS;
        attribute vec3 iC;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec3 vLocal;
        varying vec3 vNo;
        varying vec3 vCol;
        varying float vGlow;
        varying float vSeed;
        varying vec3 vExt;
        vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
        void main() {
          vec3 lp = position * iS.xyz;
          vLocal = (position + 0.5) * iS.xyz * 64.0; // in 1/64 m cells (the grain below)
          vNo = normal;
          vec3 p = iP.xyz + qrot(iQ, lp);
          vWorld = p;
          vN = qrot(iQ, normal);
          vCol = iC;
          vGlow = iS.w;
          vSeed = iP.w;
          vExt = iS.xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 fogCol;
        uniform float fogDist;
        uniform float time;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec3 vLocal;
        varying vec3 vNo;
        varying vec3 vCol;
        varying float vGlow;
        varying float vSeed;
        varying vec3 vExt;
        ${LIGHT}
        ${AIR}
        float h3d(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
        void main() {
          vec3 n = normalize(vN);
          vec3 V = normalize(lampPos - vWorld);
          vec3 sp;
          vec3 L = lightFull(vWorld, n, V, 0.35, 1.0, 30.0, sp);
          // the stuff's grain: each 1/64 m cell of a face a shade off, a darker cell now and then
          vec3 q = floor(vLocal - vNo * 0.5);
          float k = h3d(q + vSeed * 17.0), k2 = h3d(q * 0.5 + vSeed * 5.0 + 3.1);
          vec3 c = vCol * (0.8 + 0.28 * k) * (k2 > 0.86 ? 0.72 : 1.0);
          // a lit top face, shaded sides (reads as a block even out of the lamp)
          c *= 0.82 + 0.22 * max(n.y, 0.0);
          // pixel bevels: the face's rim a cell wide, light along its top and left, dark along the
          // bottom and right (a chipped-out chunk, not a plain box)
          vec3 ext = vExt * 64.0;
          vec3 inP = 1.0 - abs(vNo); // the face's own two axes
          vec3 lo = step(vLocal, vec3(1.0)) * inP, hi = step(ext - 1.0, vLocal) * inP;
          float up = max(hi.y, lo.x), dn = max(lo.y, hi.x);
          if (abs(vNo.y) > 0.5) { up = max(hi.z, lo.x); dn = max(lo.z, hi.x); }
          if (min(ext.x, min(ext.y, ext.z)) >= 2.0) c *= 1.0 + 0.16 * up - 0.17 * dn * (1.0 - up);
          vec3 col = c * (L * 1.05 + 0.02) + sp * 0.12;
          // ore and crystal bits keep a glint of their own; a twinkle now and then
          if (vGlow > 0.0) col += vCol * vGlow * (0.7 + 0.5 * step(0.93, h3d(vec3(floor(time * 6.0 + vSeed * 13.0), vSeed, 1.0))));
          col = caveAir(col, vWorld, length(vWorld - lampPos));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.layers.enable(LAYER_OUTLINE);
    this.mesh.name = 'pickDebris';
    scene3.add(this.mesh);
  }

  solid(x, y, z) { return OPAQUE[this.w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX))] === 1; }

  /**
   * n bits from (x, y, z) m flying out along `out`. o.colors: linear-ish [r, g, b] arrays (sRGB 0..1,
   * converted here), o.kind (KIND), o.speed (×), o.glow (0..1), o.size (× the kind's size), o.spread
   * (m round the point the bits start from).
   */
  burst(x, y, z, n, o = {}) {
    const K = KIND[o.kind] || KIND.stone;
    const out = o.out || [0, 1, 0];
    const cols = o.colors?.length ? o.colors : [[0.5, 0.42, 0.34]];
    const spd = (o.speed ?? 1) * K.sp, sz = o.size ?? 1, spread = o.spread ?? 0.04;
    n = Math.round(n * (PHONE ? 0.6 : 1));
    for (let i = 0; i < n; i++) {
      let b;
      if (this.list.length >= CAP) b = this.list.shift(); // the oldest goes
      else b = this.free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
      // a block on the 1/64 m grid; some flat flakes, some long slivers
      const a = Math.round(rnd(K.s[0], K.s[1]) * sz), flat = Math.random() < K.flat, long = Math.random() < (K.long || 0);
      const sx = Math.max(1, a), sy = Math.max(1, flat ? Math.ceil(a * 0.5) : long ? a * 2 : Math.round(a * rnd(0.7, 1.2))), sz2 = Math.max(1, flat ? a + 1 : long ? Math.max(1, Math.round(a * 0.6)) : Math.round(a * rnd(0.7, 1.2)));
      b.s.set(sx / 64, sy / 64, sz2 / 64);
      b.r = Math.max(b.s.x, b.s.y, b.s.z) * 0.5;
      b.p.set(x + rnd(-spread, spread), y + rnd(-spread, spread), z + rnd(-spread, spread));
      // off the face mostly sideways and up (then they drop), only a little straight at the mole
      const sp = spd * rnd(0.25, 0.75);
      b.v.set(out[0] * sp + rnd(-1, 1) * spd * 0.7, out[1] * sp + rnd(0.2, 1.2) * spd * 0.65, out[2] * sp + rnd(-1, 1) * spd * 0.7);
      b.q.setFromEuler(_e.set(rnd(0, 6.3), rnd(0, 6.3), rnd(0, 6.3)));
      b.w.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(K.spin);
      const c = cols[(Math.random() * cols.length) | 0];
      b.c.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
      b.glow = o.glow || 0;
      b.bounce = K.bounce * rnd(0.8, 1.2); b.fric = K.fric; b.K = K;
      b.t = 0; b.rest = 0; b.stay = rnd(K.stay[0], K.stay[1]); b.sink = 0; b.seed = Math.random();
      b.settle = null;
      this.list.push(b);
    }
  }

  /** eye (optional): bits never come closer than a hand's width to the camera (they glance off). */
  update(dt, eye = null) {
    if (!dt) { this.write(); return; }
    dt = Math.min(dt, 0.05);
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      b.t += dt;
      if (b.sink > 0) {
        // lying done: it sinks into the floor
        b.sink += dt;
        b.p.y -= dt * b.s.y * 1.6;
        if (b.sink > 0.55) { this.free.push(b); L.splice(i--, 1); }
        continue;
      }
      if (b.rest > 0) {
        b.rest += dt;
        // roll over onto the nearest flat face (a quick settle, not a snap)
        if (b.settle) b.q.slerp(b.settle, Math.min(1, dt * 14));
        if (!this.solid(b.p.x, b.p.y - b.r - 0.02, b.p.z)) { b.rest = 0; b.settle = null; } // the floor went
        else if (b.rest > b.stay) b.sink = 1e-4;
        continue;
      }
      const v = b.v, p = b.p, r = b.r;
      v.y -= GRAV * dt;
      const dr = Math.max(0, 1 - 0.35 * dt);
      v.x *= dr; v.z *= dr;
      // per axis against the rock
      const nx = p.x + v.x * dt;
      if (this.solid(nx + Math.sign(v.x) * r, p.y, p.z)) { v.x *= -b.bounce; b.w.y *= -0.6; } else p.x = nx;
      const nz = p.z + v.z * dt;
      if (this.solid(p.x, p.y, nz + Math.sign(v.z) * r)) { v.z *= -b.bounce; b.w.x *= -0.6; } else p.z = nz;
      const ny = p.y + v.y * dt;
      if (this.solid(p.x, ny + Math.sign(v.y) * r, p.z)) {
        if (v.y < 0) {
          const s = -v.y;
          v.y = s * b.bounce > 0.55 ? s * b.bounce : 0;
          v.x *= b.fric; v.z *= b.fric;
          b.w.multiplyScalar(0.55);
          if (v.y === 0 && Math.hypot(v.x, v.z) < 0.35) {
            // settled: sit on the floor's top, roll onto a face
            p.y = Math.floor((ny - r) * VOX + 1) / VOX + b.s.y * 0.45;
            b.rest = 1e-4;
            b.settle = this.restQuat(b.q);
            continue;
          }
          if (v.y === 0) { // skidding along the floor
            v.x *= Math.max(0, 1 - dt * 7); v.z *= Math.max(0, 1 - dt * 7);
          }
        } else v.y = 0;
      } else p.y = ny;
      if (this.solid(p.x, p.y, p.z)) p.y += 1 / VOX; // started inside rock: out it comes
      if (eye) {
        const ex = p.x - eye.x, ey = p.y - eye.y, ez = p.z - eye.z, el = Math.hypot(ex, ey, ez);
        if (el < 0.34) {
          // glances off the mole's face: pushed back out, its speed toward the eye turned away
          const ux = ex / (el || 1), uy = ey / (el || 1), uz = ez / (el || 1), vn = v.x * ux + v.y * uy + v.z * uz;
          if (vn < 0) { v.x -= vn * ux * 1.4; v.y -= vn * uy * 1.4; v.z -= vn * uz * 1.4; }
          p.set(eye.x + ux * 0.34, eye.y + uy * 0.34, eye.z + uz * 0.34);
        }
      }
      const wl = b.w.length();
      if (wl > 1e-3) { _q.setFromAxisAngle(_v.copy(b.w).multiplyScalar(1 / wl), wl * dt); b.q.premultiply(_q); }
      if (b.t > 7) b.sink = 1e-4;
    }
    this.write();
  }

  /** The axis-aligned rest pose nearest to q, keeping its turn about the vertical. */
  restQuat(q) {
    let best = null, bd = -1;
    for (const s of SNAP) {
      // the yaw that brings s closest to q
      _q2.copy(s);
      _v.set(0, 0, 1).applyQuaternion(q);
      const yaw = Math.atan2(_v.x, _v.z);
      const cand = new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), yaw).multiply(_q2);
      const d = Math.abs(cand.dot(q));
      if (d > bd) { bd = d; best = cand; }
    }
    return best;
  }

  write() {
    const L = this.list, P = this.iP.array, Q = this.iQ.array, S = this.iS.array, C = this.iC.array;
    const n = Math.min(L.length, CAP);
    for (let i = 0; i < n; i++) {
      const b = L[i], k = i * 4, c = i * 3;
      P[k] = b.p.x; P[k + 1] = b.p.y; P[k + 2] = b.p.z; P[k + 3] = b.seed;
      Q[k] = b.q.x; Q[k + 1] = b.q.y; Q[k + 2] = b.q.z; Q[k + 3] = b.q.w;
      const sk = b.sink > 0 ? Math.max(0.05, 1 - b.sink / 0.55) : 1;
      S[k] = b.s.x * sk; S[k + 1] = b.s.y * sk; S[k + 2] = b.s.z * sk; S[k + 3] = b.glow;
      C[c] = b.c.r; C[c + 1] = b.c.g; C[c + 2] = b.c.b;
    }
    this.geo.instanceCount = n;
    if (n || this.drawn) for (const a of [this.iP, this.iQ, this.iS, this.iC]) a.needsUpdate = true;
    this.drawn = n;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
    this.list.length = 0;
  }
}
