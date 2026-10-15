// First-person effects for Deep Town (all positions in town units under the scaled town root):
//  - Particles: chunky pixel-square GL points sized by distance (fireflies, motes, spores, smoke,
//    mist, sparks, dust, splinters), same API as the iso particles (spawn, burst, emitters).
//  - GlowBatch: every fake light in one additive mesh: halos that face the camera and light
//    pools lying on the floor, each following its light's flicker.
//  - GlowWorms: thousands of tiny twinkling lights on the cavern roof in one draw call.
//  - Lights: a few real point lights handed to the light sources nearest the camera.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { shadowTexture } from '../iso/pixel.js';
import { flickerAt } from '../iso/LightPool.js';
import { M } from './units.js';
import { clamp } from '../core/util.js';

/** World size of a particle: size × SIZE_TU town units. */
const SIZE_TU = 0.035;

const P_VERT = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
uniform float uPx;      // screen px per meter at 1 m
uniform float uFogDist;
varying vec4 vColor;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(0.05, -mv.z);
  vColor = aColor;
  vColor.a *= smoothstep(0.12, 0.45, d);
  vFog = 1.0 - exp(-pow(d / uFogDist, 2.0) * 1.6);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(floor(aSize * uPx / d + 0.5), 1.0, 40.0);
}`;
const P_FRAG = /* glsl */`
uniform vec3 uFogCol;
uniform float uAdd;
varying vec4 vColor;
varying float vFog;
void main() {
  if (vColor.a < 0.01) discard;
  vec3 c = uAdd > 0.5 ? vColor.rgb * (1.0 - vFog) : mix(vColor.rgb, uFogCol, vFog);
  gl_FragColor = vec4(c, vColor.a);
  #include <colorspace_fragment>
}`;

const _c = new THREE.Color();

class PBatch {
  constructor(max, additive, U) {
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
    const m = new THREE.ShaderMaterial({
      uniforms: { uPx: U.uPx, uFogDist: U.uFogDist, uFogCol: U.uFogCol, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }
}

/** Shared uniforms: px per meter at 1 m (from the camera), fog. */
export function fxUniforms() {
  return { uPx: { value: 400 }, uFogDist: { value: 30 }, uFogCol: { value: new THREE.Color(0x0c0a12) } };
}

export class Particles {
  constructor(parent, U, max = 900) {
    this.U = U;
    this.add = new PBatch(max, true, U);
    this.norm = new PBatch(Math.floor(max * 0.7), false, U);
    parent.add(this.add.points, this.norm.points);
    this.emitters = [];
  }

  /** o: {x,y,z, vx,vy,vz, life, size, size2, color, color2, alpha, alpha2, grav, drag, add, fn(p,dt), wob, blink} */
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

  burst(n, base, spread = {}) {
    for (let i = 0; i < n; i++) {
      const sx = spread.x ?? 0.1, sy = spread.y ?? 0.1, sz = spread.z ?? 0.1, sv = spread.v ?? 1;
      this.spawn({
        ...base,
        x: base.x + (Math.random() - 0.5) * 2 * sx, y: base.y + (Math.random() - 0.5) * 2 * sy, z: base.z + (Math.random() - 0.5) * 2 * sz,
        vx: (base.vx || 0) + (Math.random() - 0.5) * 2 * sv * (spread.vx ?? 1),
        vy: (base.vy || 0) + (Math.random() - 0.5) * 2 * sv * (spread.vy ?? 1),
        vz: (base.vz || 0) + (Math.random() - 0.5) * 2 * sv * (spread.vz ?? 1),
        life: (base.life ?? 1) * (0.7 + Math.random() * 0.6),
      });
    }
  }

  addEmitter(e) {
    e.acc = e.acc ?? Math.random() * (e.every || 0.1);
    e.on = e.on ?? true;
    this.emitters.push(e);
    return e;
  }

  update(dt) {
    for (const e of this.emitters) {
      if (!e.on || (e.when && !e.when())) continue;
      e.acc -= dt;
      let guard = 0;
      while (e.acc <= 0 && guard++ < 8) { e.acc += e.every || 0.1; e.emit(this); }
    }
    for (const b of [this.add, this.norm]) {
      const L = b.list;
      let n = 0;
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        p.t += dt;
        if (p.fn) p.fn(p, dt);
        if (p.dead || p.t >= p.life) continue;
        if (p.grav) p.vy -= p.grav * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.wob) { p.x += Math.sin(p.t * 3 + p.ph) * p.wob * dt; p.z += Math.cos(p.t * 2.3 + p.ph) * p.wob * dt; }
        const k = p.t / p.life;
        let a = p.a0 + (p.a1 - p.a0) * k;
        if (p.blink) a *= 0.55 + 0.45 * Math.sin(p.t * p.blink + p.ph);
        L[n++] = p;
        const j = n - 1;
        b.pos[j * 3] = p.x; b.pos[j * 3 + 1] = p.y; b.pos[j * 3 + 2] = p.z;
        b.col[j * 4] = p.r0 + (p.r1 - p.r0) * k; b.col[j * 4 + 1] = p.g0 + (p.g1 - p.g0) * k; b.col[j * 4 + 2] = p.b0 + (p.b1 - p.b0) * k;
        b.col[j * 4 + 3] = a < 0 ? 0 : a > 1 ? 1 : a;
        b.size[j] = (p.s0 + (p.s1 - p.s0) * k) * SIZE_TU * M;
      }
      L.length = n;
      const g = b.points.geometry;
      g.setDrawRange(0, n);
      if (n) { g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true; }
    }
  }

  count() { return this.add.list.length + this.norm.list.length; }

  dustPuff(x, y, z, n = 8, color = 0x8a6a4a) {
    this.burst(n, { x, y, z, vy: 0.5, life: 0.8, size: 4, size2: 7, color, color2: 0x5a4a3a, alpha: 0.6, alpha2: 0, drag: 3 }, { x: 0.12, y: 0.05, z: 0.12, v: 0.9, vy: 0.6 });
  }
  sparks(x, y, z, n = 6, color = 0xffb040) {
    this.burst(n, { x, y, z, vy: 1.6, life: 0.6, size: 1.6, size2: 1, color, color2: 0xff5a1a, alpha: 1, alpha2: 0.2, grav: 4, add: true }, { x: 0.05, y: 0.05, z: 0.05, v: 1.2 });
  }
  hearts(x, y, z) {
    this.burst(4, { x, y, z, vy: 0.9, life: 0.9, size: 3, size2: 2.5, color: 0xff6a8a, alpha: 1, alpha2: 0, add: true, wob: 0.6 }, { x: 0.15, y: 0.05, z: 0.15, v: 0.25 });
  }
}

// ---------------------------------------------------------------- glow halos + floor pools
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let ATLAS = null;
const AW = 256, AH = 128;
function glowAtlas() {
  if (ATLAS) return ATLAS;
  const pc = new PixelCanvas(AW, AH);
  const disk = (ox, oy, n, steps, pow) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= 1) continue;
      const v = Math.pow(1 - r, pow);
      const lv = Math.floor(v * steps + BAYER[(y % 4) * 4 + (x % 4)] / 16) / steps;
      if (lv > 0) pc.set(ox + x, oy + y, 0xffffff, Math.round(Math.min(1, lv) * 255));
    }
  };
  disk(0, 0, 128, 5, 1.6);
  disk(128, 0, 64, 4, 2);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
    const v = Math.max(0, 1 - Math.abs(r - 0.78) / 0.22);
    const lv = Math.floor(v * 3 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 3;
    if (lv > 0) pc.set(192 + x, y, 0xffffff, Math.round(lv * 255));
  }
  // a soft star (sparkles, glints)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = Math.abs(x + 0.5 - 32) / 32, dy = Math.abs(y + 0.5 - 32) / 32;
    const v = Math.max(0, 1 - Math.hypot(dx, dy) * 1.6) + Math.max(0, 1 - dx * 8) * Math.max(0, 1 - dy) * 0.6 + Math.max(0, 1 - dy * 8) * Math.max(0, 1 - dx) * 0.6;
    const lv = Math.floor(Math.min(1, v) * 4 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 4;
    if (lv > 0) pc.set(128 + x, 64 + y, 0xffffff, Math.round(Math.min(1, lv) * 255));
  }
  ATLAS = pixelTexture(pc.commit());
  ATLAS.userData.shared = true;
  return ATLAS;
}
const UV = { pool: [0, 0, 128, 128], cpool: [0, 0, 128, 128], halo: [128, 0, 64, 64], ring: [192, 0, 64, 64], star: [128, 64, 64, 64] };

const G_VERT = /* glsl */`
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec4 aColor;
attribute float aFlat;
uniform float uFogDist;
varying vec4 vColor;
varying vec2 vUv;
varying float vFog;
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mv;
  if (aFlat > 0.5) mv = modelViewMatrix * vec4(position, 1.0);
  else {
    mv = modelViewMatrix * vec4(aCenter, 1.0);
    mv.xy += aCorner;
    // halos fade out as the eye reaches them (no flat card in the face)
    vColor.a *= smoothstep(0.25, 1.2, -mv.z);
  }
  vFog = 1.0 - exp(-pow(max(0.0, -mv.z) / uFogDist, 2.0) * 1.6);
  gl_Position = projectionMatrix * mv;
}`;
const G_FRAG = /* glsl */`
uniform sampler2D map;
varying vec4 vColor;
varying vec2 vUv;
varying float vFog;
void main() {
  float a = texture2D(map, vUv).a * vColor.a * (1.0 - vFog);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

/**
 * One additive mesh of quads. Halos/rings/stars face the camera (size in TU, scaled with the town);
 * pools lie flat on the floor (w along x, h along z).
 */
export class GlowBatch {
  constructor(parent, U, max = 900) {
    this.max = max;
    this.items = [];
    this.free = [];
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 12);
    this.cen = new Float32Array(max * 12);
    this.cor = new Float32Array(max * 8);
    this.uv = new Float32Array(max * 8);
    this.col = new Float32Array(max * 16);
    this.flat = new Float32Array(max * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCenter', new THREE.BufferAttribute(this.cen, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(this.cor, 2));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFlat', new THREE.BufferAttribute(this.flat, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: glowAtlas() }, uFogDist: U.uFogDist },
      vertexShader: G_VERT, fragmentShader: G_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);
  }

  /** o: {kind:'pool'|'cpool' (on the roof, facing down)|'halo'|'ring'|'star', x,y,z, w, h, color, opacity, src (light source with .on/.k)} */
  add(o) {
    const i = this.free.length ? this.free.pop() : this.n++;
    if (i >= this.max) { this.n = this.max; return null; }
    const it = { i, kind: o.kind || 'pool', src: o.src || null, base: o.opacity ?? 0.3, color: o.color ?? 0xffffff, mul: 1, x: o.x, y: o.y, z: o.z, w: o.w ?? 1, h: o.h ?? o.w ?? 1, alive: true };
    this.items[i] = it;
    this.place(it);
    const [ux, uy, uw, uh] = UV[it.kind] || UV.pool;
    const u0 = ux / AW, u1 = (ux + uw) / AW, v0 = 1 - (uy + uh) / AH, v1 = 1 - uy / AH;
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const g = this.mesh.geometry;
    g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, this.n * 6);
    return it;
  }

  place(it) {
    const k = it.i * 12, hw = it.w / 2, hh = it.h / 2;
    const flat = it.kind === 'pool' || it.kind === 'cpool';
    if (it.kind === 'pool') this.pos.set([it.x - hw, it.y, it.z + hh, it.x + hw, it.y, it.z + hh, it.x + hw, it.y, it.z - hh, it.x - hw, it.y, it.z - hh], k);
    else if (flat) this.pos.set([it.x - hw, it.y, it.z - hh, it.x + hw, it.y, it.z - hh, it.x + hw, it.y, it.z + hh, it.x - hw, it.y, it.z + hh], k); // facing down (a glow on the roof)
    for (let c = 0; c < 4; c++) {
      this.cen[k + c * 3] = it.x; this.cen[k + c * 3 + 1] = it.y; this.cen[k + c * 3 + 2] = it.z;
      // corners in view space (meters): the town root's scale is not applied after the view transform
      this.cor[it.i * 8 + c * 2] = (c === 0 || c === 3 ? -hw : hw) * M;
      this.cor[it.i * 8 + c * 2 + 1] = (c < 2 ? -hh : hh) * M;
      this.flat[it.i * 4 + c] = flat ? 1 : 0;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aCenter.needsUpdate = true; g.attributes.aCorner.needsUpdate = true; g.attributes.aFlat.needsUpdate = true;
  }

  remove(it) {
    if (!it || !it.alive) return;
    it.alive = false;
    this.col.fill(0, it.i * 16, it.i * 16 + 16);
    this.items[it.i] = null;
    this.free.push(it.i);
  }

  update() {
    const col = this.col;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (!it) continue;
      const s = it.src;
      const a = it.base * it.mul * (s ? (s.on ? s.k : 0) : 1);
      _c.setHex(it.color);
      const k = i * 16;
      for (let c = 0; c < 4; c++) { col[k + c * 4] = _c.r; col[k + c * 4 + 1] = _c.g; col[k + c * 4 + 2] = _c.b; col[k + c * 4 + 3] = a; }
    }
    this.mesh.geometry.attributes.aColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- glow-worms on the roof
const W_VERT = /* glsl */`
attribute vec4 aCol;
attribute float aPh;
uniform float uTime;
uniform float uPx;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(0.1, -mv.z);
  float tw = 0.55 + 0.45 * sin(uTime * (1.3 + fract(aPh * 7.13) * 2.4) + aPh * 6.28);
  vCol = vec4(aCol.rgb, aCol.a * tw);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(floor(aCol.a * 0.05 * uPx / d + 0.5), 1.0, 3.0);
}`;
const W_FRAG = /* glsl */`
varying vec4 vCol;
void main() { gl_FragColor = vec4(vCol.rgb * vCol.a, 1.0);
  #include <colorspace_fragment>
}`;

/** pts: [{x,y,z, color, a}] in TU. One additive point cloud that twinkles on its own (uTime). */
export function glowWorms(parent, U, pts) {
  const n = pts.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), ph = new Float32Array(n);
  pts.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    _c.setHex(p.color);
    col.set([_c.r, _c.g, _c.b, p.a ?? 1], i * 4);
    ph[i] = Math.random();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const time = { value: 0 };
  const pts3 = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uTime: time, uPx: U.uPx }, vertexShader: W_VERT, fragmentShader: W_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts3.renderOrder = 3;
  parent.add(pts3);
  return { points: pts3, time };
}

// ---------------------------------------------------------------- real point lights
/**
 * A fixed set of point lights (meters, in the unscaled scene) given every few frames to the
 * light sources nearest a focus point. Sources live in TU; flicker factors (src.k) also drive
 * the glow halos and floor pools.
 */
export class Lights {
  constructor(scene, n = 8, range = 13) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push(l);
    }
    this.sources = [];
    this.sel = [];
    this.range = range;
    this.t = 0;
    this.acc = 0;
  }
  /** o: {x,y,z (TU), color, intensity, distance (TU), flicker, speed, real, priority} */
  add(o) {
    const s = { x: 0, y: 1, z: 0, color: 0xffc070, intensity: 6, distance: 6, flicker: 0, on: true, real: true, k: 1, ph: Math.random() * 100, speed: 1, ...o };
    this.sources.push(s);
    this.acc = 0;
    return s;
  }
  remove(s) { const i = this.sources.indexOf(s); if (i >= 0) this.sources.splice(i, 1); this.acc = 0; }
  /** fx, fy, fz: focus in meters. */
  update(dt, fx, fy, fz) {
    this.t += dt;
    for (const s of this.sources) s.k = s.on ? flickerAt(this.t * s.speed, s.ph, s.flicker) : 0;
    this.acc -= dt;
    if (this.acc <= 0) {
      this.acc = 0.15;
      const r2 = this.range * this.range;
      const cand = [];
      for (const s of this.sources) {
        if (!s.on || !s.real) continue;
        const d2 = (s.x * M - fx) ** 2 + ((s.y * M - fy) * 0.5) ** 2 + (s.z * M - fz) ** 2;
        if (d2 < r2) cand.push([d2 - (s.priority || 0), s]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      this.sel = cand.slice(0, this.lights.length).map((c) => c[1]);
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], s = this.sel[i];
      if (!s || !s.on) { l.intensity = 0; continue; }
      const d = Math.hypot(s.x * M - fx, s.z * M - fz);
      const edge = clamp((this.range - d) / 3, 0, 1);
      l.position.set(s.x * M, s.y * M, s.z * M);
      l.color.setHex(s.color);
      l.distance = s.distance * M;
      l.intensity = s.intensity * s.k * edge * (s.mul ?? 1);
    }
  }
}

// ---------------------------------------------------------------- blob shadows under everyone
/** All the townsfolk's blob shadows in one mesh: call update(actors) each frame (TU). */
export class ShadowBatch {
  constructor(parent, max = 96) {
    this.max = max;
    this.pos = new Float32Array(max * 12);
    const uv = new Float32Array(max * 8), idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }
  update(actors) {
    let n = 0;
    const P = this.pos;
    for (const a of actors) {
      if (n >= this.max) break;
      if (!a.shadowOn) continue;
      const s = a.shadowSize, y = a.pos.y + 0.012;
      const hx = s / 2, hz = s * 0.425;
      const x = a.pos.x, z = a.pos.z, k = n * 12;
      P[k] = x - hx; P[k + 1] = y; P[k + 2] = z - hz;
      P[k + 3] = x + hx; P[k + 4] = y; P[k + 5] = z - hz;
      P[k + 6] = x + hx; P[k + 7] = y; P[k + 8] = z + hz;
      P[k + 9] = x - hx; P[k + 10] = y; P[k + 11] = z + hz;
      n++;
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, n * 6);
    g.attributes.position.needsUpdate = true;
  }
}
