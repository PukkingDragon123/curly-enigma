// Shaders for the forest trail (the journey intro): the toon material with sun dapple (bright
// spots of sunlight that drift as the canopy moves, dense under the trees and open on the trail
// and in the clearing), a flowing pixel-art stream, low mist sheets drifting between the trunks,
// and the canopy-openness map that tells them where the sky is. Shares the meadow's uniforms (MF:
// time, wind, the noise texture, the sun, fog).
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { clamp } from '../core/util.js';
import { GLSL_BAYER } from './fx.js';
import { MF } from './meadowfx.js';

/** Canopy openness over the forest box (0 = deep shade, 1 = open sky), sampled by the shaders. */
export const FF = {
  uOpen: { value: null },
  uOpenBox: { value: new THREE.Vector4(-30, -20, 60, 80) }, // x0, z0, width, depth
  uDapple: { value: 1 },
  uShade: { value: 0.38 }, // how much sun is left in the shade
};

/**
 * Build the openness texture from a function open(x, z) → 0..1 over the box.
 * Returns the texture (dispose with the scene).
 */
export function makeOpenness(box, open, N = 96) {
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = box.x0 + ((i + 0.5) / N) * box.w, z = box.z0 + ((j + 0.5) / N) * box.d;
    const v = Math.round(clamp(open(x, z), 0, 1) * 255);
    const k = (j * N + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  FF.uOpen.value = t;
  FF.uOpenBox.value.set(box.x0, box.z0, box.w, box.d);
  return t;
}

/** GLSL: how much direct sun reaches world point w (stepped + dithered). */
export const GLSL_DAPPLE = /* glsl */`
uniform sampler2D uOpen;
uniform vec4 uOpenBox;
uniform sampler2D uCloud;
uniform vec2 uWind;
uniform float uTime;
uniform float uDapple;
uniform float uShade;
float ffOpen(vec3 w) {
  vec2 uv = (w.xz - uOpenBox.xy) / uOpenBox.zw;
  return texture2D(uOpen, clamp(uv, 0.0, 1.0)).r;
}
float ffSun(vec3 w) {
  float o = ffOpen(w);
  // two drifting octaves of leafy noise; the canopy sways, so the spots wander a little
  vec2 sway = uWind * (sin(uTime * 0.9 + w.x * 0.3) * 0.05 + sin(uTime * 1.7 + w.z * 0.4) * 0.025);
  float n = texture2D(uCloud, w.xz * 0.19 + sway + vec2(0.13, 0.71)).r * 0.65
          + texture2D(uCloud, w.xz * 0.53 - sway * 2.0 + vec2(0.4, 0.2)).r * 0.35;
  // open ground is mostly lit; under the canopy only the brightest leaf gaps let the sun through
  float thr = mix(0.62, 0.18, o);
  float s = smoothstep(thr - 0.05, thr + 0.05, n);
  s = mix(1.0, s, uDapple);
  float q = floor(s * 3.0 + bk_bayer4(gl_FragCoord.xy) * 0.999) / 3.0;
  return mix(uShade, 1.0, q);
}`;

const cache = new Map();
/**
 * The forest's toon material: the sun is dappled by the canopy (dapple: true), optional wind sway
 * (amplitude grows above swayBase metres) and leaf shimmer (cell = voxels per metre).
 */
export function forestToon({ dapple = true, sway = 0, swayBase = 1.2, shimmer = 0, cell = 10, tint = null } = {}) {
  const key = `${dapple}|${sway}|${swayBase}|${shimmer}|${cell}|${tint}`;
  if (cache.has(key)) return cache.get(key);
  const m = voxelMaterial('toon').clone();
  m.userData = {};
  if (tint) m.color.set(tint);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = MF.uTime;
    sh.uniforms.uWind = MF.uWind;
    sh.uniforms.uCloud = MF.uCloud;
    sh.uniforms.uOpen = FF.uOpen;
    sh.uniforms.uOpenBox = FF.uOpenBox;
    sh.uniforms.uDapple = FF.uDapple;
    sh.uniforms.uShade = FF.uShade;
    sh.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\nvarying vec3 vFfW;\n' + sh.vertexShader.replace('#include <project_vertex>', /* glsl */`
      #ifdef USE_INSTANCING
      vec4 ffW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #else
      vec4 ffW = modelMatrix * vec4(transformed, 1.0);
      #endif
      ${sway ? /* glsl */`
      float ffH = smoothstep(${swayBase.toFixed(2)}, ${(swayBase + 4.0).toFixed(2)}, ffW.y);
      float ffP = dot(ffW.xz, uWind) * 0.21 - uTime * 0.9;
      float ffG = 0.6 + 0.4 * sin(dot(ffW.xz, vec2(0.04, 0.07)) - uTime * 0.35);
      ffW.xz += uWind * (sin(ffP) * 0.07 + sin(ffP * 2.3 + ffW.y * 1.1) * 0.03) * ffH * ffG * ${sway.toFixed(2)};` : ''}
      vFfW = ffW.xyz;
      vec4 mvPosition = viewMatrix * ffW;
      gl_Position = projectionMatrix * mvPosition;`);
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vFfW;\n' + GLSL_BAYER + (dapple ? GLSL_DAPPLE : 'uniform float uTime;\nuniform vec2 uWind;\n') + '\n');
    if (dapple) {
      fs = fs.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ffSun(vFfW);',
      ));
    }
    if (shimmer) {
      fs = fs.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec3 ffC = floor(vFfW * ${cell.toFixed(1)} + 0.002);
        float ffR = fract(sin(dot(ffC, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float ffF = sin(uTime * (1.2 + ffR * 2.0) + ffR * 40.0 + dot(ffC.xz, uWind) * 0.1);
        diffuseColor.rgb *= 1.0 + ${shimmer.toFixed(2)} * (step(0.94, ffF) * 0.3 - step(ffF, -0.95) * 0.15);`);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'forest-toon-' + key;
  cache.set(key, m);
  return m;
}
export function resetForestMaterials() { cache.clear(); }

// ------------------------------------------------------------------ the stream
const STREAM_VERT = /* glsl */`
attribute float aW; // 0..1 across the stream
varying vec3 vW;
varying vec2 vF; // (across, along)
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vF = vec2(aW, uv.y);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const STREAM_FRAG = /* glsl */`
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uKey; uniform vec3 uSky;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform float uSpeed;
uniform vec4 uRocks[8];
varying vec3 vW;
varying vec2 vF;
${GLSL_BAYER}
${GLSL_DAPPLE}
float h1(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  // a 1/16 m grid so every ripple is a crisp pixel on the voxel scale
  vec2 g = (floor(vW.xz * 16.0) + 0.5) / 16.0;
  float across = abs(vF.x * 2.0 - 1.0);
  float along = vF.y;
  float depth = 1.0 - across * across;
  // ripples run downstream: streaks that stretch along the flow
  float flow = along * 4.0 - uTime * uSpeed;
  float r1 = sin(flow * 6.2832 * 1.3 + h1(floor(g * 3.0)) * 6.0 + across * 4.0);
  float r2 = sin(flow * 6.2832 * 2.9 + vF.x * 17.0);
  float rip = r1 * 0.6 + r2 * 0.4;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.1, 0.8, depth));
  // the sky in it, brighter toward grazing angles
  vec3 V = normalize(vW - uCam);
  float fres = 0.25 + 0.6 * pow(1.0 - abs(V.y), 3.0);
  vec3 col = mix(body, uSky * 0.9, fres * (0.6 + 0.4 * step(0.2, rip)));
  // sun glints where the canopy lets it in
  float sun = ffSun(vW);
  float gl = step(0.86, rip) * step(0.6, h1(floor(g * 2.0) + floor(flow * 2.0)));
  col += uKey * gl * (sun - uShade) / (1.0 - uShade) * 0.9;
  col *= 0.75 + 0.25 * sun;
  // foam: along the banks and in a wake below each rock
  float foam = step(0.84, across) * step(0.4, h1(floor(g * 4.0) + floor(flow * 3.0)));
  for (int i = 0; i < 8; i++) {
    vec4 rk = uRocks[i];
    if (rk.w <= 0.0) continue;
    vec2 d = vW.xz - rk.xy;
    float r = length(d);
    float wake = step(r, rk.w * 1.6) * step(0.45, fract(r * 6.0 - uTime * 1.8)) * step(r, rk.w * 1.6);
    foam = max(foam, wake * step(rk.w * 0.8, r));
  }
  col = mix(col, uFoam, foam * 0.85);
  float a = mix(0.7, 0.95, depth);
  if (bk_bayer4(gl_FragCoord.xy) > a + 0.08) discard;
  float d = length(vW - uCam);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * A ribbon of flowing water along pts (Vector3s on the water surface), width w (m).
 * rocks: [{x, z, r}] (up to 8) get foamy wakes. Returns the mesh.
 */
export function makeStream(pts, w, rocks = []) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = Math.max(8, Math.round(curve.getLength() * 3));
  const P = [], U = [], A = [], I = [];
  const side = 6;
  let len = 0;
  const prev = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    if (i) len += p.distanceTo(prev);
    prev.copy(p);
    const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
    for (let s = 0; s <= side; s++) {
      const k = s / side;
      const off = (k - 0.5) * w * (0.9 + 0.1 * Math.sin(t * 23));
      P.push(p.x + (nx / l) * off, p.y, p.z + (nz / l) * off);
      U.push(k, len / 4);
      A.push(k);
    }
  }
  for (let i = 0; i < N; i++) for (let s = 0; s < side; s++) {
    const a = i * (side + 1) + s, b = a + side + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(I);
  g.computeBoundingSphere();
  const rk = Array.from({ length: 8 }, (_, i) => (rocks[i] ? new THREE.Vector4(rocks[i].x, rocks[i].z, 0, rocks[i].r) : new THREE.Vector4(0, 0, 0, 0)));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: MF.uTime, uCam: MF.uCam, uSun: MF.uSun, uKey: MF.uKey, uSky: MF.uSky,
      uFogColor: MF.uFogColor, uFogNear: MF.uFogNear, uFogFar: MF.uFogFar,
      uCloud: MF.uCloud, uWind: MF.uWind, uOpen: FF.uOpen, uOpenBox: FF.uOpenBox, uDapple: FF.uDapple, uShade: FF.uShade,
      uDeep: { value: new THREE.Color(0x1e4a46) }, uShallow: { value: new THREE.Color(0x4a8a6e) }, uFoam: { value: new THREE.Color(0xe8f4ec) },
      uSpeed: { value: 0.55 }, uRocks: { value: rk },
    },
    vertexShader: STREAM_VERT,
    fragmentShader: STREAM_FRAG,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  m.userData.noBatch = true;
  m.userData.curve = curve;
  return m;
}

// ------------------------------------------------------------------ mist
const MIST_VERT = /* glsl */`
varying vec3 vW;
varying vec2 vUv;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const MIST_FRAG = /* glsl */`
uniform sampler2D uCloud;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uColor;
uniform float uAlpha;
uniform vec3 uCam;
uniform float uSeed;
varying vec3 vW;
varying vec2 vUv;
${GLSL_BAYER}
void main() {
  vec2 p = vW.xz * 0.09 + uWind * uTime * 0.012 + uSeed;
  float n = texture2D(uCloud, p).r * 0.7 + texture2D(uCloud, p * 2.3 - uWind * uTime * 0.01).r * 0.3;
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
  float near = smoothstep(1.5, 6.0, length(vW - uCam)); // thin out right in front of the lens
  float a = smoothstep(0.45, 0.8, n) * edge * near * uAlpha;
  float q = floor(a * 4.0 + bk_bayer4(gl_FragCoord.xy) * 0.999) / 4.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor, q * 0.6);
  #include <colorspace_fragment>
}`;

/** A horizontal sheet of drifting mist (w × d m) at height y. */
export function makeMist(x, y, z, w, d, { color = 0xe8ece4, alpha = 0.8, seed = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCloud: MF.uCloud, uTime: MF.uTime, uWind: MF.uWind, uCam: MF.uCam, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uSeed: { value: seed } },
    vertexShader: MIST_VERT,
    fragmentShader: MIST_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.renderOrder = 8;
  m.userData.noBatch = true;
  m.userData.mist = mat.uniforms;
  return m;
}
