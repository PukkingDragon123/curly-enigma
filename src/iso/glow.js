// All the fake light in an iso scene in one draw call: floor light pools (flat quads)
// and glow halos (quads facing the fixed iso camera) share one additive mesh. Every
// quad follows its light source's flicker (src.k) and on/off state each frame.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { ISO_BACK } from './mesher.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let atlasTex = null;

/**
 * 256x128 atlas: floor-pool falloff (128px, stepped + Bayer-dithered) on the left, a glow
 * halo (64px) and a thin soft ring (64px) on the right. Texels are fine enough (~1/32 unit
 * on screen at normal zoom) that the dither reads like pixel-art shading, not blocks.
 */
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
  disk(0, 0, 128, 5, 1.6);
  disk(128, 0, 64, 4, 2);
  // a thin soft ring (for markers)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
    const v = Math.max(0, 1 - Math.abs(r - 0.78) / 0.22);
    const lv = Math.floor(v * 3 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 3;
    if (lv > 0) pc.set(192 + x, y, 0xffffff, Math.round(lv * 255));
  }
  atlasTex = pixelTexture(pc.commit());
  atlasTex.userData.shared = true;
  return atlasTex;
}
const UV = { pool: [0, 0, 128, 128], halo: [128, 0, 64, 64], ring: [192, 0, 64, 64] };

const VERT = /* glsl */`
attribute vec4 aColor;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vColor = aColor;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D map;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

const _c = new THREE.Color();
const RIGHT = new THREE.Vector3(Math.cos(Math.PI / 4), 0, -Math.sin(Math.PI / 4));
const UP = new THREE.Vector3().crossVectors(ISO_BACK, RIGHT).normalize();

export class GlowBatch {
  constructor(scene, max = 640) {
    this.max = max;
    this.items = [];
    this.free = [];
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.uv = new Float32Array(max * 4 * 2);
    this.col = new Float32Array(max * 4 * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.dirtyGeo = false;
  }

  /**
   * Add a quad. o: {kind:'pool'|'halo'|'ring', x,y,z, w, h, color, opacity, src (light source with .on/.k) | null}.
   * Pools lie flat (w along x, h along z); halos and rings face the camera.
   */
  add(o) {
    let i = this.free.length ? this.free.pop() : this.n++;
    if (i >= this.max) { this.n = this.max; return null; }
    const it = { i, kind: o.kind || 'pool', src: o.src || null, base: o.opacity ?? 0.3, color: o.color ?? 0xffffff, mul: 1, x: o.x, y: o.y, z: o.z, w: o.w ?? 1, h: o.h ?? o.w ?? 1, alive: true };
    this.items[i] = it;
    this.place(it);
    const [ux, uy, uw, uh] = UV[it.kind] || UV.pool;
    const u0 = ux / AW, u1 = (ux + uw) / AW, v0 = 1 - (uy + uh) / AH, v1 = 1 - uy / AH;
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    this.mesh.geometry.attributes.uv.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.n * 6);
    return it;
  }

  /** (Re)write a quad's corners from its x,y,z,w,h. */
  place(it) {
    const p = this.pos, k = it.i * 12;
    const hw = it.w / 2, hh = it.h / 2;
    if (it.kind === 'pool') {
      p.set([it.x - hw, it.y, it.z + hh, it.x + hw, it.y, it.z + hh, it.x + hw, it.y, it.z - hh, it.x - hw, it.y, it.z - hh], k);
    } else {
      for (let c = 0; c < 4; c++) {
        const sx = c === 0 || c === 3 ? -hw : hw, sy = c < 2 ? -hh : hh;
        p[k + c * 3] = it.x + RIGHT.x * sx + UP.x * sy;
        p[k + c * 3 + 1] = it.y + RIGHT.y * sx + UP.y * sy;
        p[k + c * 3 + 2] = it.z + RIGHT.z * sx + UP.z * sy;
      }
    }
    this.dirtyGeo = true;
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
    const g = this.mesh.geometry;
    g.attributes.aColor.needsUpdate = true;
    if (this.dirtyGeo) { g.attributes.position.needsUpdate = true; this.dirtyGeo = false; }
  }
}
