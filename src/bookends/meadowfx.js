// Shaders and living bits for the surface: wind-swayed toon materials (tree canopies sway and
// their leaves twinkle), soft cloud shadows drifting over everything, an instanced field of
// pixel-art grass clumps and wildflowers that bend in the wind and glow when backlit, a pond with
// a real (low-res) reflection and pixel ripples, the golden-hour sky, butterflies and birds.
// Everything shares one set of uniforms (MF) that the meadow ticks once per frame.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { makeRng, makeNoise2D, clamp } from '../core/util.js';
import { GLSL_BAYER } from './fx.js';

/** Shared uniforms: time, wind, the cloud-shadow map, the sun, fog. */
export const MF = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.82, 0.57) },
  uCloud: { value: null },
  uCloudOff: { value: new THREE.Vector2() },
  uSun: { value: new THREE.Vector3(-0.5, 0.2, -0.85).normalize() }, // toward the (visible) sun
  uKey: { value: new THREE.Color(0xffcf90) },
  uSky: { value: new THREE.Color(0x8ab0e0) },
  uGround: { value: new THREE.Color(0x4a5a28) },
  uFogColor: { value: new THREE.Color(0xd8dce0) },
  uFogNear: { value: 30 },
  uFogFar: { value: 180 },
  uCam: { value: new THREE.Vector3() },
};

/** Soft cloud blobs, tiling (red = cloud density). */
function cloudShadowTexture() {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  const n = makeNoise2D(91), m = makeNoise2D(92);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // tileable: sample the noise on a torus
    const u = (x / N) * Math.PI * 2, v = (y / N) * Math.PI * 2;
    const a = n(Math.cos(u) * 1.1 + 3, Math.sin(u) * 1.1 + Math.cos(v) * 0.6) * 0.7 + m(Math.cos(v) * 1.3 + 7, Math.sin(v) * 1.3 + Math.sin(u) * 0.4) * 0.6;
    const c = clamp(a * 0.5 + 0.5, 0, 1);
    const i = (y * N + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(c * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** GLSL: soft cloud shade at a world position (1 = full sun), stepped + dithered like pixel art. */
export const GLSL_CLOUD = /* glsl */`
uniform sampler2D uCloud;
uniform vec2 uCloudOff;
float mfCloud(vec3 w) {
  float c = texture2D(uCloud, w.xz * 0.016 + uCloudOff).r;
  c = smoothstep(0.54, 0.64, c);
  float q = floor(c * 3.0 + bk_bayer4(gl_FragCoord.xy) * 0.999) / 3.0;
  return 1.0 - q * 0.5;
}`;

const textures = [];
/** Call once per build; returns textures to dispose. */
export function initMF() {
  if (!MF.uCloud.value) { MF.uCloud.value = cloudShadowTexture(); }
  MF.uTime.value = 0;
  return textures;
}

/** Tick the shared uniforms. fog: the scene's THREE.Fog. */
export function updateMF(dt, camera, fog) {
  MF.uTime.value += dt;
  const w = MF.uWind.value;
  MF.uCloudOff.value.x -= dt * 0.0042 * w.x;
  MF.uCloudOff.value.y -= dt * 0.0042 * w.y;
  if (camera) camera.getWorldPosition(MF.uCam.value);
  if (fog) { MF.uFogColor.value.copy(fog.color); MF.uFogNear.value = fog.near; MF.uFogFar.value = fog.far; }
}

// ------------------------------------------------------------------ toon materials
const toonCache = new Map();
/**
 * The voxel toon material with cloud shadows on the sun, and optionally wind sway (tree
 * canopies, reeds: amplitude grows above `swayBase` m) and leaf shimmer (twinkling voxels).
 */
export function meadowToon({ sway = 0, swayBase = 1.2, shimmer = 0, cloud = true, cell = 12 } = {}) {
  const key = `${sway}|${swayBase}|${shimmer}|${cloud}|${cell}`;
  if (toonCache.has(key)) return toonCache.get(key);
  const m = voxelMaterial('toon').clone();
  m.userData = {};
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = MF.uTime;
    sh.uniforms.uWind = MF.uWind;
    sh.uniforms.uCloud = MF.uCloud;
    sh.uniforms.uCloudOff = MF.uCloudOff;
    sh.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\nvarying vec3 vMfW;\n' + sh.vertexShader.replace('#include <project_vertex>', /* glsl */`
      vec4 mfW = modelMatrix * vec4(transformed, 1.0);
      ${sway ? /* glsl */`
      float mfH = smoothstep(${swayBase.toFixed(2)}, ${(swayBase + 2.5).toFixed(2)}, mfW.y);
      float mfP = dot(mfW.xz, uWind) * 0.33 - uTime * 1.25;
      float mfG = 0.65 + 0.35 * sin(dot(mfW.xz, vec2(0.05, 0.08)) - uTime * 0.45);
      mfW.xz += uWind * (sin(mfP) * 0.05 + sin(mfP * 2.3 + mfW.y * 1.7) * 0.022) * mfH * mfG * ${sway.toFixed(2)};
      mfW.y += sin(mfP * 1.9 + mfW.x * 2.0) * 0.012 * mfH * ${sway.toFixed(2)};` : ''}
      vMfW = mfW.xyz;
      vec4 mvPosition = viewMatrix * mfW;
      gl_Position = projectionMatrix * mvPosition;`);
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;\nvarying vec3 vMfW;\n' + GLSL_BAYER + (cloud ? GLSL_CLOUD : '') + '\n');
    if (cloud) {
      fs = fs.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= mfCloud(vMfW);',
      ));
    }
    if (shimmer) {
      // leaves flipping in the wind: a few voxels at a time catch the light
      fs = fs.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec3 mfC = floor(vMfW * ${cell.toFixed(1)} + 0.002);
        float mfR = fract(sin(dot(mfC, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float mfF = sin(uTime * (1.5 + mfR * 2.5) + mfR * 40.0 + dot(mfC.xz, uWind) * 0.15);
        diffuseColor.rgb *= 1.0 + ${shimmer.toFixed(2)} * (step(0.93, mfF) * 0.35 - step(mfF, -0.95) * 0.18);`);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'meadow-toon-' + key;
  toonCache.set(key, m);
  return m;
}
/** Forget cached materials (the scene disposes them on exit). */
export function resetMeadowMaterials() { toonCache.clear(); }

// ------------------------------------------------------------------ grass
const CELL = 32;
export const GRASS = { short: 0, mid: 1, tall: 2, daisy: 3, buttercup: 4, poppy: 5, cornflower: 6, clover: 7, cattail: 8, reed: 9, fern: 10, dandelion: 11 };
const NCELL = 12;

/** The clump atlas: 12 cells of 32x32 pixel-art grass, flowers and reeds. */
function grassAtlas() {
  const pc = new PixelCanvas(CELL * NCELL, CELL);
  const rng = makeRng(77);
  const RAMP = [0x284e24, 0x36682a, 0x488432, 0x5e9a3a, 0x80b04a, 0xaac462];
  const blade = (ox, x0, hgt, lean, ramp = RAMP, w = 1) => {
    for (let y = 0; y < hgt; y++) {
      const t = y / Math.max(1, hgt - 1);
      const x = Math.round(x0 + lean * t * t * hgt);
      const ci = Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 0.01)));
      const yy = CELL - 1 - y;
      pc.set(ox + x, yy, ramp[ci]);
      if (w > 1 && t < 0.4) pc.set(ox + x + 1, yy, ramp[Math.max(0, ci - 1)]);
    }
    return Math.round(x0 + lean * hgt);
  };
  const field = (c, n, hMin, hMax) => {
    const ox = c * CELL;
    for (let i = 0; i < n; i++) {
      const x0 = rng.range(2, CELL - 3);
      blade(ox, x0, Math.round(rng.range(hMin, hMax)), rng.range(-0.35, 0.35), RAMP, rng.chance(0.3) ? 2 : 1);
    }
  };
  const flower = (c, x, hgt, petal, heart, lean = 0) => {
    const ox = c * CELL;
    const tx = blade(ox, x, hgt, lean, [0x2e6a2a, 0x3e8a30, 0x4e9a34]);
    const ty = CELL - 1 - hgt;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pc.set(ox + tx + dx, ty + dy, petal);
    pc.set(ox + tx, ty, heart);
  };
  field(GRASS.short, 22, 5, 11);
  field(GRASS.mid, 20, 9, 18);
  field(GRASS.tall, 16, 14, 26);
  { // seed heads on the tall grass
    const ox = GRASS.tall * CELL;
    for (let i = 0; i < 5; i++) {
      const x = Math.round(rng.range(4, CELL - 5)), h = Math.round(rng.range(22, 29));
      blade(ox, x, h, rng.range(-0.2, 0.2), [0x3a7a2c, 0x64b03e, 0x9ac858]);
      for (let k = 0; k < 4; k++) pc.set(ox + x + (k % 2), CELL - 1 - h + k, k < 2 ? 0xe8d890 : 0xc8b870);
    }
  }
  for (const [c, petal, heart, n] of [[GRASS.daisy, 0xfff8f0, 0xffd040, 4], [GRASS.buttercup, 0xffe040, 0xfff6a0, 5], [GRASS.poppy, 0xe8402a, 0x2a1a1a, 3], [GRASS.cornflower, 0x5a8af0, 0x2a3aa0, 4], [GRASS.clover, 0xf0a0d0, 0xc06aa8, 4]]) {
    field(c, 12, 4, 10);
    for (let i = 0; i < n; i++) flower(c, Math.round(rng.range(4, CELL - 5)), Math.round(rng.range(9, 17)), petal, heart, rng.range(-0.15, 0.15));
  }
  { // cattails: tall stalks with brown heads
    const ox = GRASS.cattail * CELL;
    field(GRASS.cattail, 8, 10, 22);
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(5, CELL - 6)), h = Math.round(rng.range(24, 30));
      const tx = blade(ox, x, h, rng.range(-0.1, 0.1), [0x3a6a2a, 0x5a8a3a, 0x7a9a4a]);
      for (let k = 0; k < 5; k++) { pc.set(ox + tx, CELL - h + k, k === 0 ? 0x6a4a2a : 0x7a5030); pc.set(ox + tx + 1, CELL - h + k, k === 0 ? 0x5a3a20 : 0x5e3e24); }
      pc.set(ox + tx, CELL - h - 2, 0x9a8a5a); pc.set(ox + tx, CELL - h - 1, 0x8a7a4a);
    }
  }
  { // reeds: long pale-green blades, bending
    const ox = GRASS.reed * CELL;
    const R = [0x3a6a3a, 0x4e8a44, 0x6aa850, 0x9ac868, 0xc8e090];
    for (let i = 0; i < 14; i++) blade(ox, rng.range(3, CELL - 4), Math.round(rng.range(16, 31)), rng.range(-0.45, 0.45), R);
  }
  { // fern: fronds arching out from the middle
    const ox = GRASS.fern * CELL;
    for (let f = 0; f < 7; f++) {
      const a = -1.2 + (f / 6) * 2.4;
      const len = rng.range(10, 15);
      for (let s = 0; s < len; s++) {
        const t = s / len;
        const x = 16 + Math.sin(a) * s * 1.05, y = CELL - 1 - (Math.cos(a) * s * 1.1 - t * t * 5);
        const c = t < 0.3 ? 0x2e6a2a : t < 0.7 ? 0x4a9a3a : 0x7ac04e;
        pc.set(ox + Math.round(x), Math.round(y), c);
        if (s % 2 === 0 && s > 1) { pc.set(ox + Math.round(x - Math.cos(a)), Math.round(y - Math.sin(a) * 0.5) + 1, 0x5aa840); pc.set(ox + Math.round(x + Math.cos(a)), Math.round(y + Math.sin(a) * 0.5) + 1, 0x5aa840); }
      }
    }
  }
  { // dandelions: yellow heads and white clocks
    const c = GRASS.dandelion;
    field(c, 10, 3, 8);
    const ox = c * CELL;
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(4, CELL - 5)), h = Math.round(rng.range(10, 18));
      const tx = blade(ox, x, h, rng.range(-0.1, 0.1), [0x4a8a3a, 0x6a9a4a]);
      const ty = CELL - 1 - h;
      if (i % 2) { pc.disk(ox + tx, ty - 1, 2.2, 0xf8f8f0); pc.set(ox + tx, ty - 1, 0xd8d8c8); }
      else { pc.rect(ox + tx - 1, ty - 1, 3, 2, 0xffd020); pc.set(ox + tx, ty - 2, 0xffe860); }
    }
  }
  const t = pixelTexture(pc.commit());
  return t;
}

const GRASS_VERT = /* glsl */`
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
  vec3 w = (modelMatrix * vec4(iPos.xyz + p, 1.0)).xyz; // (slabs carry their grass down with them)
  float h = position.y;
  float ph = dot(iPos.xz, uWind) * 0.42 - uTime * 1.7;
  float gust = 0.55 + 0.45 * sin(dot(iPos.xz, vec2(0.07, 0.11)) - uTime * 0.6);
  float sway = (sin(ph) * 0.65 + sin(ph * 2.3 + iPos.x * 3.0) * 0.25 + 0.35) * gust;
  w.xz += uWind * sway * h * h * iData.x * 0.32;
  w.y -= abs(sway) * h * h * iData.x * 0.06;
  vUv = vec2((iData.y + uv.x) / uCells, uv.y);
  vW = w;
  vTint = iData.z;
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const GRASS_FRAG = (sunGlsl) => /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSun; uniform vec3 uKey; uniform vec3 uSky; uniform vec3 uGround;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform vec3 uCam;
uniform float uBright;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
varying float vH;
${GLSL_BAYER}
${sunGlsl || GLSL_CLOUD + 'float mfSunAt(vec3 w) { return mfCloud(w); }'}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  float cl = mfSunAt(vW);
  vec3 V = normalize(vW - uCam);
  float back = pow(max(dot(V, uSun), 0.0), 5.0);
  vec3 amb = mix(uGround, uSky, 0.35 + vH * 0.65) * 0.62;
  vec3 lit = amb + uKey * (0.5 * max(uSun.y + 0.35, 0.0) + 0.18) * cl;
  vec3 col = t.rgb * vTint * lit * uBright;
  col += t.rgb * uKey * back * (0.4 + vH) * 1.05 * cl;           // backlit blades glow
  float d = length(vW - uCam);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * An instanced field of crossed-quad clumps. items: [{x, y, z, rot, size, cell, tint}].
 * sun: optional { glsl, uniforms } where glsl defines `float mfSunAt(vec3 w)` (direct sun 0..1 at
 * a world point; default: the drifting cloud shadows). Returns a Mesh (not outlined).
 */
export function makeGrassField(items, { bright = 1, renderOrder = 0, sun = null } = {}) {
  const base = new THREE.BufferGeometry();
  // two crossed unit quads, bottom at y = 0
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
  base.dispose();
  const n = items.length;
  const pos = new Float32Array(n * 4), dat = new Float32Array(n * 3);
  const box = new THREE.Box3();
  items.forEach((it, i) => {
    pos.set([it.x, it.y, it.z, it.rot || 0], i * 4);
    dat.set([it.size, it.cell, it.tint ?? 1], i * 3);
    box.expandByPoint(new THREE.Vector3(it.x, it.y, it.z));
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 3));
  g.instanceCount = n;
  box.expandByScalar(1.2);
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  if (!grassTex) { grassTex = grassAtlas(); grassTex.userData.shared = true; }
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: grassTex }, uCells: { value: NCELL }, uBright: { value: bright },
      uTime: MF.uTime, uWind: MF.uWind, uCloud: MF.uCloud, uCloudOff: MF.uCloudOff,
      uSun: MF.uSun, uKey: MF.uKey, uSky: MF.uSky, uGround: MF.uGround,
      uFogColor: MF.uFogColor, uFogNear: MF.uFogNear, uFogFar: MF.uFogFar, uCam: MF.uCam,
      ...(sun ? sun.uniforms : null),
    },
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG(sun && sun.glsl),
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noBatch = true;
  m.renderOrder = renderOrder;
  return m;
}
let grassTex = null;

// ------------------------------------------------------------------ sky
const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }';
const SKY_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uWarm; uniform vec3 uGlow; uniform vec3 uDisc;
uniform float uMirror;
varying vec3 vDir;
${GLSL_BAYER}
void main() {
  vec3 d = normalize(vDir);
  if (uMirror > 0.5) d.y = abs(d.y);
  float e = max(d.y, 0.0);
  float b = bk_bayer4(gl_FragCoord.xy);
  float t = floor(pow(e, 0.55) * 16.0 + b) / 16.0;
  vec3 hor = uHorizon;
  // the horizon warms toward the sun
  vec2 sh = normalize(uSun.xz), dh = normalize(d.xz + 1e-4);
  float az = max(dot(sh, dh), 0.0);
  float warm = floor(pow(az, 3.0) * 6.0 + b) / 6.0;
  hor = mix(hor, uWarm, warm * 0.85);
  vec3 col = t < 0.35 ? mix(hor, uMid, t / 0.35) : mix(uMid, uZenith, (t - 0.35) / 0.65);
  float s = max(dot(d, uSun), 0.0);
  float glow = floor((pow(s, 8.0) * 0.4 + pow(s, 60.0) * 0.35 + pow(s, 600.0) * 0.4) * 7.0 + b) / 7.0;
  col = mix(col, uGlow, clamp(glow, 0.0, 1.0) * 0.75);
  if (s > 0.99955) col = uDisc;                                  // the disc, crisp
  else if (s > 0.99935) col = mix(uDisc, uWarm, 0.35);           // a one-pixel warm rim
  if (d.y < 0.0 && uMirror < 0.5) col = hor * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;
/** The golden-hour sky dome (follow the camera with it). */
export function makeSky(sunDir) {
  const C = (h) => new THREE.Color(h);
  const m = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sunDir.clone() }, uZenith: { value: C(0x3466c8) }, uMid: { value: C(0x78a8e8) }, uHorizon: { value: C(0xd8e4ec) },
      uWarm: { value: C(0xffc890) }, uGlow: { value: C(0xffe2a8) }, uDisc: { value: C(0xffffff) }, uMirror: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  m.renderOrder = -100;
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ pond
const WATER_VERT = /* glsl */`
uniform mat4 uTexMat;
varying vec4 vRefl;
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vRefl = uTexMat * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */`
uniform sampler2D uRefl;
uniform float uTime;
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uKey;
uniform vec3 uDeep; uniform vec3 uShallow;
uniform vec2 uCenter; uniform vec2 uRadius;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform vec4 uDrops[3];
varying vec4 vRefl;
varying vec3 vW;
${GLSL_BAYER}
${GLSL_CLOUD}
void main() {
  // everything keyed to a 1/16 m grid so the ripples are crisp pixels on the voxel scale
  vec2 g = (floor(vW.xz * 16.0) + 0.5) / 16.0;
  vec2 q = (g - uCenter) / uRadius;
  float e = length(q);
  float depth = clamp(1.0 - e, 0.0, 1.0);
  // wind ripples + rings from things touching the water
  float wv = sin(g.x * 9.0 + g.y * 4.0 - uTime * 2.2) * 0.6 + sin(g.y * 13.0 - g.x * 3.0 + uTime * 1.7) * 0.4;
  vec2 dist = vec2(wv, sin(g.x * 7.0 - uTime * 1.3 + g.y * 6.0)) * 0.006;
  float ring = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 dr = uDrops[i];
    float age = uTime - dr.z;
    if (age < 0.0 || age > dr.w) continue;
    float r = age * 0.55;
    float rd = abs(length(g - dr.xy) - r);
    float k = (1.0 - age / dr.w);
    if (rd < 0.04) { ring = max(ring, k); dist += normalize(g - dr.xy + 1e-4) * 0.012 * k; }
  }
  vec3 refl = texture2DProj(uRefl, vRefl + vec4(dist * vRefl.w, 0.0, 0.0)).rgb;
  vec3 V = normalize(vW - uCam);
  float fres = 0.42 + 0.58 * pow(1.0 - abs(V.y), 3.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 0.55, depth));
  vec3 col = mix(body, refl, fres);
  // the low sun skipping off the ripples
  vec3 n = normalize(vec3(-dist.x * 30.0, 1.0, -dist.y * 30.0));
  float spec = pow(max(dot(reflect(V, n), uSun), 0.0), 120.0) * mfCloud(vW);
  col += uKey * floor(spec * 3.0 + bk_bayer4(gl_FragCoord.xy)) / 3.0 * 0.9;
  col = mix(col, vec3(0.92, 0.96, 1.0), ring * 0.45 * step(0.5, fract((g.x + g.y) * 8.0 + 0.25)) + ring * 0.25);
  // see the pond bed through the shallows
  float a = mix(0.55, 0.96, smoothstep(0.0, 0.35, depth));
  a = max(a, fres * 0.9);
  float d = length(vW - uCam);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

/**
 * A pond surface at height y over the ellipse (cx, cz, rx, rz) with a planar reflection rendered
 * at low resolution from layer `layer` (sky, clouds, trees, reeds). Call renderReflection() before
 * the main render. Returns { mesh, layer, renderReflection(renderer, scene, camera, engineH), update(dt), dispose }.
 */
export function makePond({ cx, cz, rx, rz, y, layer = 3 }) {
  const rt = new THREE.WebGLRenderTarget(256, 144, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const texMat = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRefl: { value: rt.texture }, uTexMat: { value: texMat }, uTime: MF.uTime, uCam: MF.uCam, uSun: MF.uSun, uKey: MF.uKey,
      uDeep: { value: new THREE.Color(0x1e4a48) }, uShallow: { value: new THREE.Color(0x5a8a6a) },
      uCenter: { value: new THREE.Vector2(cx, cz) }, uRadius: { value: new THREE.Vector2(rx, rz) },
      uFogColor: MF.uFogColor, uFogNear: MF.uFogNear, uFogFar: MF.uFogFar,
      uCloud: MF.uCloud, uCloudOff: MF.uCloudOff,
      uDrops: { value: [new THREE.Vector4(0, 0, -9, 1), new THREE.Vector4(0, 0, -9, 1), new THREE.Vector4(0, 0, -9, 1)] },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2.4, rz * 2.4), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, y, cz);
  mesh.renderOrder = 2;
  mesh.userData.noBatch = true;
  const vcam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const pPos = new THREE.Vector3(cx, y, cz);
  const camPos = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  let t = 0, nextDrop = 0.5, di = 0;
  const update = (dt) => {
    t += dt;
    nextDrop -= dt;
    if (nextDrop < 0) {
      nextDrop = 0.7 + Math.random() * 1.8;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.75;
      mat.uniforms.uDrops.value[di].set(cx + Math.cos(a) * rx * r, cz + Math.sin(a) * rz * r, MF.uTime.value, 1.6 + Math.random());
      di = (di + 1) % 3;
    }
  };
  /** Render the mirrored view of `layer` into the pond's texture. */
  const renderReflection = (renderer, scene, camera, engineW, engineH) => {
    if (!mesh.visible) return;
    camera.updateMatrixWorld();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(pPos, camPos);
    if (view.dot(normal) > 0) return; // under the surface
    const w = Math.max(32, Math.round(engineW / 2)), h = Math.max(18, Math.round(engineH / 2));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    view.reflect(normal).negate().add(pPos);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(pPos, look).reflect(normal).negate().add(pPos);
    vcam.position.copy(view);
    vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    vcam.lookAt(target);
    vcam.near = camera.near; vcam.far = camera.far;
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    vcam.updateMatrixWorld();
    vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    vcam.layers.set(layer);
    const prevRT = renderer.getRenderTarget();
    const fog = scene.fog;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(scene.background && scene.background.isColor ? scene.background : 0x000000, 1);
    renderer.clear(true, true, false);
    mesh.visible = false;
    renderer.render(scene, vcam);
    mesh.visible = true;
    scene.fog = fog;
    renderer.setRenderTarget(prevRT);
  };
  return { mesh, layer, renderReflection, update, dispose: () => rt.dispose() };
}

// ------------------------------------------------------------------ sprite sheets
/** Butterflies: 4 species x 4 frames (open, half, closed, half) of 9x8 px. Returns {texture, cols}. */
export function butterflySheet() {
  const W = 9, H = 8;
  const SPECIES = [
    { a: 0xf08a20, b: 0x2a1a10, c: 0xfff0d0 }, // monarch
    { a: 0xfff060, b: 0xd8c030, c: 0xfffff0 }, // brimstone
    { a: 0x6aa8ff, b: 0x2a4aa0, c: 0xe8f4ff }, // blue
    { a: 0xfff8f0, b: 0x8a8a8a, c: 0xffd0e0 }, // cabbage white
  ];
  const pc = new PixelCanvas(W * 16, H);
  SPECIES.forEach((S, si) => {
    for (let f = 0; f < 4; f++) {
      const ox = (si * 4 + f) * W;
      const open = [1, 0.55, 0.12, 0.55][f];
      // body
      for (let y = 2; y < 7; y++) pc.set(ox + 4, y, 0x2a1a14);
      pc.set(ox + 3, 1, 0x2a1a14); pc.set(ox + 5, 1, 0x2a1a14);
      const ww = Math.max(1, Math.round(4 * open));
      for (let s = -1; s <= 1; s += 2) {
        for (let k = 1; k <= ww; k++) {
          const x = ox + 4 + s * k;
          const top = k === ww ? 2 : 1, bot = k === ww ? 5 : 6;
          for (let y = top; y <= bot; y++) {
            let c = S.a;
            if (y === top || k === ww) c = S.b;
            if (y === 3 && k === ww - 1) c = S.c;
            if (y >= 5 && k < ww) c = S.b;
            pc.set(x, y, c);
          }
        }
      }
    }
  });
  return { texture: pixelTexture(pc.commit()), cols: 16 };
}

/** Swallows: 4 flap frames of 11x6 px (navy back, pale belly, forked tail). */
export function swallowSheet() {
  const W = 11, H = 6;
  const pc = new PixelCanvas(W * 4, H);
  const B = 0x1e2238, L = 0x3a4060, P = 0xe8dcc8;
  const wing = [[[1, 0], [2, 1], [3, 1], [4, 2]], [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], [[1, 4], [2, 3], [3, 3], [4, 3]], [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]]];
  for (let f = 0; f < 4; f++) {
    const ox = f * W;
    for (const [x, y] of wing[f]) { pc.set(ox + x, y, f === 2 ? L : B); pc.set(ox + W - 1 - x, y, f === 2 ? L : B); }
    pc.set(ox + 5, 2, B); pc.set(ox + 5, 3, P); pc.set(ox + 5, 1, B); pc.set(ox + 6, 2, B); pc.set(ox + 4, 2, B);
    pc.set(ox + 5, 4, B); pc.set(ox + 4, 5, B); pc.set(ox + 6, 5, B);
  }
  return { texture: pixelTexture(pc.commit()), cols: 4, aspect: W / H };
}

/** Dragonfly: 2 frames 9x5 (wings blur). */
export function dragonflySheet() {
  const W = 9, H = 5;
  const pc = new PixelCanvas(W * 2, H);
  for (let f = 0; f < 2; f++) {
    const ox = f * W;
    for (let x = 0; x < 9; x++) pc.set(ox + x, 2, x < 2 ? 0x2a8a8a : 0x3ab0b8);
    pc.set(ox + 8, 2, 0x1a4a5a);
    const wy = f ? [1, 3] : [0, 4];
    for (const y of wy) for (const x of [5, 6, 3, 4]) pc.set(ox + x, y, 0xd8f0ff);
  }
  return { texture: pixelTexture(pc.commit()), cols: 2 };
}
