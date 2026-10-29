// The forest's grass and flowers: an instanced field of crossed pixel-art quads (one atlas of 32x32
// cells) that bends in the wind, takes the canopy's dappled sun and sky light, glows when backlit
// by the low sun and fades into the forest's fog. Woodland cells: grass with golden seed heads,
// bluebells, wood anemones, red campion, forget-me-nots, wild strawberries, foxglove spikes,
// clover, moss tufts, dry grass, ferns and bracken, reeds and cattails.
//
//   makeForestGrass(items) items: [{x, y, z, rot, size, cell, tint}] → Mesh
//   FG: the cell names.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../../gfx/PixelArt.js';
import { makeRng } from '../../core/util.js';
import { GLSL_BAYER } from '../fx.js';
import { MF } from '../meadowfx.js';
import { FF, GLSL_DAPPLE } from '../forestfx.js';
import { FA, GLSL_FA } from './atmos.js';

const CELL = 32;
export const FG = {
  short: 0, mid: 1, tall: 2, daisy: 3, buttercup: 4, bluebell: 5, anemone: 6, campion: 7, forgetme: 8,
  strawberry: 9, foxglove: 10, clover: 11, moss: 12, dry: 13, fern: 14, bracken: 15, reed: 16, cattail: 17, sorrel: 18, seed: 19,
};
const NCELL = 20;

function atlas() {
  const pc = new PixelCanvas(CELL * NCELL, CELL);
  const rng = makeRng(177);
  const RAMP = [0x2a4a22, 0x386228, 0x4a7c30, 0x62943a, 0x84ac48, 0xb0c060];
  const DRY = [0x6a5a30, 0x8a7438, 0xa88e44, 0xc4a858, 0xdcc478];
  const blade = (ox, x0, hgt, lean, ramp = RAMP, w = 1) => {
    for (let y = 0; y < hgt; y++) {
      const t = y / Math.max(1, hgt - 1);
      const x = Math.round(x0 + lean * t * t * hgt);
      const ci = Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 0.01)));
      pc.set(ox + x, CELL - 1 - y, ramp[ci]);
      if (w > 1 && t < 0.4) pc.set(ox + x + 1, CELL - 1 - y, ramp[Math.max(0, ci - 1)]);
    }
    return Math.round(x0 + lean * hgt);
  };
  const field = (c, n, hMin, hMax, ramp = RAMP) => {
    for (let i = 0; i < n; i++) blade(c * CELL, rng.range(2, CELL - 3), Math.round(rng.range(hMin, hMax)), rng.range(-0.35, 0.35), ramp, rng.chance(0.3) ? 2 : 1);
  };
  const stem = (c, x, h, lean = 0) => blade(c * CELL, x, h, lean, [0x2e5a26, 0x3e7a30, 0x4e8a34]);
  field(FG.short, 22, 5, 11);
  field(FG.mid, 20, 9, 18);
  field(FG.tall, 14, 14, 25);
  for (let i = 0; i < 6; i++) { // golden seed heads catching the light
    const ox = FG.tall * CELL, x = Math.round(rng.range(4, CELL - 5)), h = Math.round(rng.range(22, 29));
    blade(ox, x, h, rng.range(-0.2, 0.2), [0x3a6a2c, 0x6a9a3e, 0xa8b858]);
    for (let k = 0; k < 4; k++) pc.set(ox + x + (k % 2), CELL - 1 - h + k, k < 2 ? 0xf0dc90 : 0xd8c070);
  }
  const flower = (c, x, h, petal, heart, lean = 0) => {
    const tx = stem(c, x, h, lean), ty = CELL - 1 - h, ox = c * CELL;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pc.set(ox + tx + dx, ty + dy, petal);
    pc.set(ox + tx, ty, heart);
  };
  for (const [c, petal, heart, n] of [[FG.daisy, 0xfff8f0, 0xffd040, 4], [FG.buttercup, 0xffe040, 0xfff6a0, 5], [FG.anemone, 0xf8f4ff, 0xf0e070, 5], [FG.campion, 0xf070a0, 0xc04070, 4], [FG.clover, 0xf0b0d8, 0xc070b0, 4]]) {
    field(c, 10, 4, 10);
    for (let i = 0; i < n; i++) flower(c, Math.round(rng.range(4, CELL - 5)), Math.round(rng.range(8, 16)), petal, heart, rng.range(-0.15, 0.15));
  }
  { // bluebells: arching stems with nodding bells down one side
    const c = FG.bluebell, ox = c * CELL;
    field(c, 8, 6, 12, [0x2e5a2a, 0x3e7230, 0x4e8a3a]);
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(5, CELL - 8)), h = Math.round(rng.range(13, 19));
      const tx = stem(c, x, h, 0.15);
      for (let b = 0; b < 4; b++) { const by = CELL - h + b * 2 + 1; pc.set(ox + tx + 1, by, 0x6a6ae8); pc.set(ox + tx + 1, by + 1, 0x4a4ac0); pc.set(ox + tx + 2, by + 1, 0x8a8af0); }
    }
  }
  { // forget-me-nots: tiny sky-blue sprays
    const c = FG.forgetme, ox = c * CELL;
    field(c, 12, 3, 8);
    for (let i = 0; i < 9; i++) { const x = Math.round(rng.range(3, CELL - 4)), y = CELL - Math.round(rng.range(6, 12)); pc.set(ox + x, y, 0x78b8f8); pc.set(ox + x + 1, y, 0x98c8ff); pc.set(ox + x, y + 1, 0x5898e0); pc.set(ox + x + 1, y + 1, 0xf8e070); }
  }
  { // wild strawberries: trefoil leaves, white flowers and red berries
    const c = FG.strawberry, ox = c * CELL;
    for (let i = 0; i < 6; i++) { const x = Math.round(rng.range(3, CELL - 5)), h = Math.round(rng.range(4, 8)); const tx = stem(c, x, h); pc.rect(ox + tx - 1, CELL - 1 - h - 1, 3, 2, 0x4a8a34); pc.set(ox + tx, CELL - h - 3, 0x5a9a3a); }
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(4, CELL - 5)), y = CELL - Math.round(rng.range(3, 7)); pc.set(ox + x, y, 0xe02a2a); pc.set(ox + x, y + 1, 0xb81e1e); pc.set(ox + x + 1, y, 0xff6a5a); }
    for (let i = 0; i < 3; i++) { const x = Math.round(rng.range(4, CELL - 5)), y = CELL - Math.round(rng.range(8, 10)); pc.set(ox + x, y, 0xfffaf0); pc.set(ox + x + 1, y, 0xfffaf0); pc.set(ox + x, y - 1, 0xfffaf0); }
  }
  { // foxglove spikes (sprite version for the distance)
    const c = FG.foxglove, ox = c * CELL;
    for (let i = 0; i < 2; i++) {
      const x = 10 + i * 11, h = 26 - i * 5;
      stem(c, x, h);
      for (let y = 6; y < h - 2; y += 2) { const yy = CELL - 1 - y; pc.set(ox + x + (y % 4 ? 1 : -1), yy, 0xd060b0); pc.set(ox + x + (y % 4 ? 1 : -1), yy + 1, 0xa04090); pc.set(ox + x + (y % 4 ? 2 : -2), yy + 1, 0xf0a0d8); }
      for (let l = 0; l < 4; l++) blade(ox, x - 3 + l * 2, 5, (l - 1.5) * 0.4, [0x3e6a30, 0x5a8a40]);
    }
  }
  { // moss tufts with sporophytes
    const c = FG.moss, ox = c * CELL;
    for (let x = 2; x < CELL - 2; x++) { const h = 2 + Math.round(Math.sin(x * 0.7) * 1.5 + rng.range(0, 2)); for (let y = 0; y < h; y++) pc.set(ox + x, CELL - 1 - y, y === h - 1 ? 0x8aac48 : 0x5a8030); }
    for (let i = 0; i < 6; i++) { const x = Math.round(rng.range(3, CELL - 4)), h = Math.round(rng.range(6, 10)); for (let y = 3; y < h; y++) pc.set(ox + x, CELL - 1 - y, 0xa0903a); pc.set(ox + x, CELL - 1 - h, 0xd0a050); }
  }
  field(FG.dry, 18, 8, 20, DRY);
  { // fern and bracken fronds
    for (const [c, ramp] of [[FG.fern, [0x2e6a2a, 0x4a9a3a, 0x7ac04e, 0x5aa840]], [FG.bracken, [0x6a6a2a, 0x8a8a34, 0xb0a040, 0x9a9038]]]) {
      const ox = c * CELL;
      for (let f = 0; f < 7; f++) {
        const a = -1.2 + (f / 6) * 2.4, len = rng.range(10, 15);
        for (let s = 0; s < len; s++) {
          const t = s / len;
          const x = 16 + Math.sin(a) * s * 1.05, y = CELL - 1 - (Math.cos(a) * s * 1.1 - t * t * 5);
          pc.set(ox + Math.round(x), Math.round(y), t < 0.3 ? ramp[0] : t < 0.7 ? ramp[1] : ramp[2]);
          if (s % 2 === 0 && s > 1) { pc.set(ox + Math.round(x - Math.cos(a)), Math.round(y - Math.sin(a) * 0.5) + 1, ramp[3]); pc.set(ox + Math.round(x + Math.cos(a)), Math.round(y + Math.sin(a) * 0.5) + 1, ramp[3]); }
        }
      }
    }
  }
  { // reeds
    const ox = FG.reed * CELL;
    const R = [0x3a6a3a, 0x4e8a44, 0x6aa850, 0x9ac868, 0xc8e090];
    for (let i = 0; i < 14; i++) blade(ox, rng.range(3, CELL - 4), Math.round(rng.range(16, 31)), rng.range(-0.45, 0.45), R);
  }
  { // cattails
    const c = FG.cattail, ox = c * CELL;
    field(c, 8, 10, 22);
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(5, CELL - 6)), h = Math.round(rng.range(24, 30));
      const tx = blade(ox, x, h, rng.range(-0.1, 0.1), [0x3a6a2a, 0x5a8a3a, 0x7a9a4a]);
      for (let k = 0; k < 5; k++) { pc.set(ox + tx, CELL - h + k, 0x7a5030); pc.set(ox + tx + 1, CELL - h + k, 0x5e3e24); }
    }
  }
  { // wood sorrel: clover-like leaves, tiny white-pink flowers
    const c = FG.sorrel, ox = c * CELL;
    for (let i = 0; i < 9; i++) { const x = Math.round(rng.range(3, CELL - 5)), h = Math.round(rng.range(3, 7)); const tx = stem(c, x, h); pc.rect(ox + tx - 1, CELL - 2 - h, 3, 1, 0x6ab048); pc.set(ox + tx, CELL - 3 - h, 0x7ac058); }
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(4, CELL - 5)); pc.set(ox + x, CELL - 9, 0xfff0f4); pc.set(ox + x + 1, CELL - 9, 0xf0c8d8); }
  }
  { // dandelion clocks (seed heads)
    const c = FG.seed, ox = c * CELL;
    field(c, 8, 3, 8);
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(5, CELL - 6)), h = Math.round(rng.range(12, 18)); const tx = stem(c, x, h); pc.disk(ox + tx, CELL - 1 - h - 1, 2.2, 0xf8f8f0); pc.set(ox + tx, CELL - 2 - h, 0xd8d8c8); }
  }
  const t = pixelTexture(pc.commit());
  t.userData.shared = true;
  return t;
}
let tex = null;

const VERT = /* glsl */`
attribute vec4 iPos;    // xyz, rotation
attribute vec3 iData;   // size, cell, tint
uniform float uTime;
uniform vec2 uWind;
uniform float uCells;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
varying float vH;
void main() {
  vec3 p = position * iData.x;
  float c = cos(iPos.w), s = sin(iPos.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec3 w = (modelMatrix * vec4(iPos.xyz + p, 1.0)).xyz;
  float h = position.y;
  float ph = dot(iPos.xz, uWind) * 0.42 - uTime * 1.7;
  float gust = 0.55 + 0.45 * sin(dot(iPos.xz, vec2(0.07, 0.11)) - uTime * 0.6);
  float sway = (sin(ph) * 0.65 + sin(ph * 2.3 + iPos.x * 3.0) * 0.25 + 0.35) * gust;
  w.xz += uWind * sway * h * h * iData.x * 0.3;
  w.y -= abs(sway) * h * h * iData.x * 0.06;
  vUv = vec2((iData.y + uv.x) / uCells, uv.y);
  vW = w;
  vTint = iData.z;
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uKey; uniform vec3 uSky; uniform vec3 uGround;
uniform float uBright;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
varying float vH;
${GLSL_BAYER}
${GLSL_DAPPLE}
${GLSL_FA}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  float sun = (ffSun(vW) - uShade) / (1.0 - uShade);
  float op = ffOpen(vW);
  vec3 V = normalize(vW - cameraPosition);
  float back = pow(max(dot(V, uFaSun), 0.0), 5.0);
  vec3 amb = mix(uGround, uSky, 0.3 + vH * 0.6) * mix(uFaShadeAmb, 1.0, op) * 0.7;
  vec3 lit = amb + uKey * (0.62 * sun + 0.06);
  // patchy hue: some clumps yellower, some bluer
  float pt = texture2D(uCloud, vW.xz * 0.07).r - 0.5;
  vec3 col = t.rgb * vTint * lit * uBright * (1.0 + vec3(0.1, 0.04, -0.08) * pt * 2.0);
  col += t.rgb * uKey * back * (0.35 + vH) * 1.1 * (0.25 + 0.75 * sun);
  col = faApply(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** An instanced field of crossed-quad clumps. items: [{x, y, z, rot, size, cell, tint}]. */
export function makeForestGrass(items, { bright = 1, renderOrder = 0 } = {}) {
  const P = [], U = [], I = [];
  for (let q = 0; q < 2; q++) {
    const a = q * Math.PI / 2 + 0.3;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const o = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const n = items.length;
  const pos = new Float32Array(n * 4), dat = new Float32Array(n * 3);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  items.forEach((it, i) => {
    pos[i * 4] = it.x; pos[i * 4 + 1] = it.y; pos[i * 4 + 2] = it.z; pos[i * 4 + 3] = it.rot || 0;
    dat[i * 3] = it.size; dat[i * 3 + 1] = it.cell; dat[i * 3 + 2] = it.tint ?? 1;
    box.expandByPoint(v.set(it.x, it.y, it.z));
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 3));
  g.instanceCount = n;
  box.expandByScalar(1.2);
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  if (!tex) tex = atlas();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex }, uCells: { value: NCELL }, uBright: { value: bright },
      uTime: MF.uTime, uWind: MF.uWind, uCloud: MF.uCloud, uKey: MF.uKey, uSky: MF.uSky, uGround: MF.uGround,
      uOpen: FF.uOpen, uOpenBox: FF.uOpenBox, uDapple: FF.uDapple, uShade: FF.uShade,
      ...FA,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noBatch = true;
  m.renderOrder = renderOrder;
  return m;
}

/** Split grass items into spatial chunks (cell metres) so off-screen chunks are culled. */
export function makeForestGrassChunked(items, { cell = 12, ...opts } = {}) {
  const bins = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(it);
  }
  const grp = new THREE.Group();
  for (const list of bins.values()) grp.add(makeForestGrass(list, opts));
  grp.userData.noBatch = true;
  return grp;
}
