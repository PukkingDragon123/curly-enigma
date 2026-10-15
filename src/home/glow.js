// All the fake light in the first-person burrow in one additive draw call: halos that face the
// camera every frame and flat light pools on the floor (or a wall), each following its light
// source's flicker and on/off state. Meters.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let atlasTex = null;
const AW = 256, AH = 128;
function atlas() {
  if (atlasTex) return atlasTex;
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
  disk(0, 0, 128, 6, 1.5);
  disk(128, 0, 64, 5, 2.2);
  // a soft four-point star for glints
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = Math.abs(x + 0.5 - 32) / 32, dy = Math.abs(y + 0.5 - 32) / 32;
    const v = Math.max(0, 1 - Math.min(dx * 9 + dy, dy * 9 + dx)) + Math.max(0, 1 - Math.hypot(dx, dy) * 3) * 0.6;
    const lv = Math.floor(Math.min(1, v) * 4 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 4;
    if (lv > 0) pc.set(192 + x, y, 0xffffff, Math.round(Math.min(1, lv) * 255));
  }
  atlasTex = pixelTexture(pc.commit());
  atlasTex.userData.shared = true;
  return atlasTex;
}
const UV = { pool: [0, 0, 128, 128], halo: [128, 0, 64, 64], star: [192, 0, 64, 64] };

const VERT = /* glsl */`
attribute vec4 aColor;
varying vec4 vColor;
varying vec2 vUv;
varying float vDepth;
void main() {
  vColor = aColor;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D map;
varying vec4 vColor;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vColor.a * smoothstep(0.08, 0.5, vDepth);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);
  #include <colorspace_fragment>
}`;

const _c = new THREE.Color();
const _r = new THREE.Vector3(), _u = new THREE.Vector3();

export class FPGlow {
  /** opts.shadow: draw dark (normal-blended) pools instead of additive light. */
  constructor(scene, max = 256, opts = {}) {
    this.max = max;
    this.items = [];
    this.free = [];
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 12);
    this.uv = new Float32Array(max * 8);
    this.col = new Float32Array(max * 16);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const blend = opts.shadow
      ? { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }
      : { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas() } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, ...blend,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.shadow ? 3 : 6;
    scene.add(this.mesh);
  }

  /**
   * o: { kind: 'halo'|'pool'|'star', x, y, z, w, h?, color, opacity, src (light with .on/.k) | null,
   *      normal: 'y' (pools lie flat by default) | 'x' | 'z' (pools on walls) }.
   */
  add(o) {
    const i = this.free.length ? this.free.pop() : this.n++;
    if (i >= this.max) { this.n = this.max; return null; }
    const it = { i, kind: o.kind || 'halo', src: o.src || null, base: o.opacity ?? 0.4, color: o.color ?? 0xffffff, mul: 1, x: o.x, y: o.y, z: o.z, w: o.w ?? 0.3, h: o.h ?? o.w ?? 0.3, normal: o.normal || 'y', alive: true };
    this.items[i] = it;
    const [ux, uy, uw, uh] = UV[it.kind] || UV.halo;
    const u0 = ux / AW, u1 = (ux + uw) / AW, v0 = 1 - (uy + uh) / AH, v1 = 1 - uy / AH;
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    this.mesh.geometry.attributes.uv.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.n * 6);
    if (it.kind === 'pool') this.placeFlat(it);
    return it;
  }

  placeFlat(it) {
    const p = this.pos, k = it.i * 12, hw = it.w / 2, hh = it.h / 2;
    if (it.normal === 'x') p.set([it.x, it.y - hh, it.z - hw, it.x, it.y - hh, it.z + hw, it.x, it.y + hh, it.z + hw, it.x, it.y + hh, it.z - hw], k);
    else if (it.normal === 'z') p.set([it.x - hw, it.y - hh, it.z, it.x + hw, it.y - hh, it.z, it.x + hw, it.y + hh, it.z, it.x - hw, it.y + hh, it.z], k);
    else p.set([it.x - hw, it.y, it.z + hh, it.x + hw, it.y, it.z + hh, it.x + hw, it.y, it.z - hh, it.x - hw, it.y, it.z - hh], k);
  }

  remove(it) {
    if (!it || !it.alive) return;
    it.alive = false;
    this.col.fill(0, it.i * 16, it.i * 16 + 16);
    this.pos.fill(0, it.i * 12, it.i * 12 + 12);
    this.items[it.i] = null;
    this.free.push(it.i);
  }

  /** Face the halos to the camera and refresh every quad's color from its source's flicker. */
  update(camera) {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    _r.set(e[0], e[1], e[2]).normalize();
    _u.set(e[4], e[5], e[6]).normalize();
    const p = this.pos, col = this.col;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (!it) continue;
      if (it.kind !== 'pool') {
        const hw = it.w / 2, k = i * 12;
        for (let c = 0; c < 4; c++) {
          const sx = c === 0 || c === 3 ? -hw : hw, sy = c < 2 ? -hw : hw;
          p[k + c * 3] = it.x + _r.x * sx + _u.x * sy;
          p[k + c * 3 + 1] = it.y + _r.y * sx + _u.y * sy;
          p[k + c * 3 + 2] = it.z + _r.z * sx + _u.z * sy;
        }
      }
      const s = it.src;
      const a = it.base * it.mul * (s ? (s.on ? s.k : 0) : 1);
      _c.setHex(it.color);
      const k = i * 16;
      for (let c = 0; c < 4; c++) { col[k + c * 4] = _c.r; col[k + c * 4 + 1] = _c.g; col[k + c * 4 + 2] = _c.b; col[k + c * 4 + 3] = a; }
    }
    const g = this.mesh.geometry;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.position.needsUpdate = true;
  }
}
