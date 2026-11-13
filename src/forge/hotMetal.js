// Burning-hot metal: a toon voxel material whose glow is worked out per voxel cell from a true
// incandescence ramp (blackbody.js: black-red → blood red → cherry → orange → yellow → white).
// The heat is never flat: it follows the forging simulation's per-column temperatures along the
// bar, runs hotter in the core and cooler at the thin edges, cools off toward the end the tongs
// hold, shimmers cell by cell as the surface crawls, carries patches of dark forge scale (they
// glow less and read as flaky grey when it cools), darkens where the hammer just chilled it and
// keeps the facets of every blow. The finished blade gets the same look along its length, and a
// waterline that snaps everything under it dark when it's quenched.
//
//   const hm = makeHotMetal({ base, mode: 'bar' | 'blade' | 'part', cell })
//   hm.material                      the material (MeshToonMaterial + injected heat)
//   hm.u                             its uniforms (uT, uCols, uChill, uMarks, uN, uColLen, uHeld, ...)
//   hm.setCols(T[], n)               bar mode: per-column temperatures
//   hm.setT(T)                       blade/part mode: one temperature (with its gradients)
//   hm.update(time)                  per frame
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { glowAmount, glowHex } from './blackbody.js';

export const MAXC = 24; // columns the shader knows about (the longest plan has 14 + 3 spare)
const RAMP_MAX = 2200; // °C at the ramp's right end

let rampTex = null;
/** The incandescence ramp as a texture (linear colour × intensity / 2 in RGB). */
export function heatRamp() {
  if (rampTex) return rampTex;
  const N = 256, d = new Uint8Array(N * 4), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const T = (i / (N - 1)) * RAMP_MAX;
    const k = glowAmount(T);
    if (k > 0) c.setHex(glowHex(T)).multiplyScalar(k * 0.5); else c.setRGB(0, 0, 0);
    d[i * 4] = Math.min(255, Math.round(c.r * 255)); d[i * 4 + 1] = Math.min(255, Math.round(c.g * 255)); d[i * 4 + 2] = Math.min(255, Math.round(c.b * 255)); d[i * 4 + 3] = 255;
  }
  rampTex = new THREE.DataTexture(d, N, 1, THREE.RGBAFormat);
  rampTex.magFilter = THREE.LinearFilter;
  rampTex.minFilter = THREE.LinearFilter;
  rampTex.colorSpace = THREE.NoColorSpace;
  rampTex.needsUpdate = true;
  rampTex.userData.shared = true;
  return rampTex;
}

const HEAD = /* glsl */`
uniform sampler2D uRamp;
uniform float uMode;      // 0 bar (columns along x), 1 blade (along y), 2 part (one T)
uniform float uT;         // blade/part temperature
uniform float uCols[${MAXC}];
uniform float uChill[${MAXC}];
uniform float uMarks[${MAXC}];
uniform float uN;         // columns in use
uniform float uColLen;    // length of a column along the bar
uniform float uLen;       // length of the piece along its axis
uniform float uCell;      // voxel cell for the heat pattern
uniform vec4 uHeld;       // x: where the tongs hold (along), y: falloff, z: how much cooler, w: side (-1 low end, 1 high end)
uniform float uSide;      // >0 the underside (in the coals) runs hotter, <0 the top
uniform float uScale;     // forge scale coverage 0..1
uniform float uTime;
uniform float uGain;
uniform float uWaterY;    // world y of the quench water (blade): below it the metal is at uTWet
uniform float uTWet;
uniform vec3 uBase;       // the metal's colour under its scale
uniform vec3 uScaleCol;   // the dark oxide
uniform float uGrain;     // cell-to-cell brightness of the metal
uniform float uPolish;    // blade, finished and cold: a polished sheen sweeping along it, glints on its bevels
varying vec3 vHL;         // piece-local position
varying vec3 vHN;         // piece-local normal
varying float vHW;        // bar: half width of this slice
varying float vTh;        // bar: thickness of this slice
varying float vWY;        // world y
float hm_h(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hm_n(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hm_h(i), hm_h(i + vec3(1,0,0)), f.x), mix(hm_h(i + vec3(0,1,0)), hm_h(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hm_h(i + vec3(0,0,1)), hm_h(i + vec3(1,0,1)), f.x), mix(hm_h(i + vec3(0,1,1)), hm_h(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float hm_col(float x, out float chill, out float marks) {
  float f = x / uColLen - 0.5;
  float i0 = clamp(floor(f), 0.0, uN - 1.0);
  float i1 = min(uN - 1.0, i0 + 1.0);
  float t = clamp(f - i0, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float a = 20.0, b = 20.0, ca = 0.0, cb = 0.0, ma = 0.0, mb = 0.0;
  for (int k = 0; k < ${MAXC}; k++) {
    float fk = float(k);
    if (fk == i0) { a = uCols[k]; ca = uChill[k]; ma = uMarks[k]; }
    if (fk == i1) { b = uCols[k]; cb = uChill[k]; mb = uMarks[k]; }
  }
  if (f < 0.0) { t = 0.0; }
  chill = mix(ca, cb, t);
  marks = mix(ma, mb, t);
  return mix(a, b, t);
}
`;

const VERT_DECL = /* glsl */`
varying vec3 vHL;
varying vec3 vHN;
varying float vHW;
varying float vTh;
varying float vWY;
`;

const VERT_BODY = /* glsl */`
#ifdef USE_INSTANCING
  vHL = (instanceMatrix * vec4(position, 1.0)).xyz;
  vHN = normalize(mat3(instanceMatrix) * normal);
  vHW = length(instanceMatrix[2].xyz) * 0.5;
  vTh = length(instanceMatrix[1].xyz);
#else
  vHL = position;
  vHN = normal;
  vHW = 1.0;
  vTh = 1.0;
#endif
  vWY = (modelMatrix * vec4(vHL, 1.0)).y;
`;

const FRAG_BODY = /* glsl */`
{
  vec3 cell = floor(vHL / uCell + 0.001);
  float along = uMode > 0.5 && uMode < 1.5 ? vHL.y : vHL.x;
  float chill = 0.0, marks = 0.0;
  float T = uT;
  if (uMode < 0.5) T = hm_col(vHL.x, chill, marks);
  float edge = 0.0;
  if (uMode < 0.5) {
    // bar: the core holds the heat, the thin edges and the faces give it off first
    edge = clamp(abs(vHL.z) / max(vHW, 1e-4), 0.0, 1.0);
    float depth = clamp(vHL.y / max(vTh, 1e-4), 0.0, 1.0);
    T += 45.0 - 175.0 * edge * edge * edge;
    // the side lying in the coals is hotter (turn the piece to even it out)
    T += uSide * (0.5 - depth) * 2.0;
    // a struck spot is chilled by the hammer face and the anvil
    T -= chill * (300.0 - 120.0 * edge);
    // the tip runs a touch hotter (thin metal)
    T += 25.0 * smoothstep(uLen - uColLen * 1.2, uLen, along);
  } else if (uMode < 1.5) {
    // blade: the edges glow less than the spine, the tip comes up a little hotter
    edge = clamp(abs(vHL.x) * 18.0, 0.0, 1.0);
    T += -70.0 * edge * edge + 30.0 * smoothstep(uLen * 0.7, uLen, along);
    T -= 160.0 * (1.0 - smoothstep(-0.02, 0.05, along)); // the guard and the hilt stay dull
  } else {
    T += 30.0 - 60.0 * hm_n(cell * 0.45);
  }
  // the end the tongs hold is cooler
  float hd = uHeld.w * (along - uHeld.x);
  T -= uHeld.z * (1.0 - smoothstep(0.0, uHeld.y, hd));
  // the surface crawls: cell-sized flickers drifting through the glow
  float crawl = hm_n(cell * 0.55 + vec3(0.0, -uTime * 1.3, uTime * 0.7));
  float grain = hm_h(cell + 7.0);
  float hot = smoothstep(450.0, 900.0, T);
  T += ((crawl - 0.5) * 70.0 + (grain - 0.5) * 22.0) * hot;
  // under the water: snapped dark
  if (uWaterY > -50.0 && vWY < uWaterY) T = min(T, uTWet + grain * 20.0);
  // forge scale: dark flaky islands (they glow less, and show as grey scale when it cools)
  float sc = hm_n(cell * 0.33 + vec3(3.1, 0.0, 1.7)) * 0.7 + grain * 0.3;
  float scaleK = smoothstep(1.0 - uScale, 1.0 - uScale + 0.12, sc);
  // hammer facets: each blow leaves flat planes that catch the light differently
  float facet = 0.0;
  if (uMode < 0.5) facet = clamp(marks * 0.25, 0.0, 1.0) * (step(0.5, hm_h(vec3(floor(vHL.x / uColLen * 3.0), floor(vHL.z / (uCell * 3.0)), 5.0))) - 0.5);
  vec3 em = texture2D(uRamp, vec2(clamp(T / ${RAMP_MAX.toFixed(1)}, 0.0, 1.0), 0.5)).rgb * 2.0;
  em *= uGain * (1.0 - scaleK * 0.5) * (1.0 + facet * 0.12);
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  if (uMode > 1.5) em *= 0.3 + 0.8 * vColor.rgb * vColor.rgb; // a piece's voxel tone (a crack, a bright edge) shows in its glow
#endif
  // glowing metal hardly reflects the firelight at all: its own light is all you see
  float glow = smoothstep(470.0, 820.0, T);
  // the colour under the glow: the metal, sooty scale, a sheen on the facets
  vec3 metal = uBase * (1.0 + (grain - 0.5) * uGrain) * (1.0 + facet * 0.25);
  vec3 col = mix(metal, uScaleCol * (0.8 + grain * 0.4), max(scaleK * 0.85, glow * 0.9));
  col *= 1.0 - glow * 0.7;
  diffuseColor.rgb *= col;
  totalEmissiveRadiance += em;
  if (uPolish > 0.001) {
    // polished metal: a band of light runs up the blade now and then, catching the bevels (the
    // faces that turn sideways) more than the flat; single cells glint and go out
    float aq = floor(along / uCell) * uCell;
    float run = fract(uTime * 0.28) * (uLen * 2.2) - uLen * 0.4;
    float band = (aq - run) / (uCell * 3.0);
    float sweep = exp(-band * band) * (0.35 + 0.65 * clamp(abs(vHN.x) + abs(vHN.y), 0.0, 1.0));
    float tw = step(0.992, hm_h(cell + floor(uTime * 2.5)));
    vec3 sheen = diffuseColor.rgb * 0.45 + vec3(0.32, 0.31, 0.29);
    float onBlade = uMode > 1.5 ? 1.0 : step(-0.01, along); // (a blade's guard and hilt aren't polished steel)
    // metal is mostly reflection: less of the room's warm light on it, more of its own colour as a
    // banded reflection of a cool, pale surround (lit from the top left), so steel reads as steel
    vec3 vn = normalize(normal);
    float m = vn.y * 0.6 - vn.x * 0.45 + vn.z * 0.25;
    float b = m > 0.62 ? 1.0 : m > 0.25 ? 0.66 : m > -0.1 ? 0.42 : 0.24;
    vec3 env = mix(vec3(0.66, 0.72, 0.82), vec3(1.0, 0.98, 0.94), step(0.62, m)) * b;
    vec3 metalC = diffuseColor.rgb;
    diffuseColor.rgb *= 1.0 - 0.55 * uPolish * onBlade;
    totalEmissiveRadiance += (metalC * env * 1.35 + sheen * (sweep * 0.85 + tw * 0.9)) * uPolish * onBlade;
  }
}
`;

/**
 * A hot-metal material. o: { base (hex, the metal under its scale), mode ('bar' | 'blade' |
 * 'part'), cell (voxel size of the heat pattern in local units), vertexColors, gain }.
 */
export function makeHotMetal(o = {}) {
  const mode = o.mode === 'blade' ? 1 : o.mode === 'part' ? 2 : 0;
  const mat = voxelMaterial('toon', { unique: true, vertexColors: !!o.vertexColors, color: 0xffffff, emissive: 0x000000 });
  const base = new THREE.Color(o.base ?? 0x8a8f96);
  const u = {
    uRamp: { value: heatRamp() },
    uMode: { value: mode },
    uT: { value: 20 },
    uCols: { value: new Float32Array(MAXC).fill(20) },
    uChill: { value: new Float32Array(MAXC) },
    uMarks: { value: new Float32Array(MAXC) },
    uN: { value: 1 },
    uColLen: { value: o.colLen ?? 0.05 },
    uLen: { value: o.len ?? 0.3 },
    uCell: { value: o.cell ?? 0.008 },
    uHeld: { value: new THREE.Vector4(0, 0.05, 0, 1) },
    uSide: { value: 0 },
    uScale: { value: o.scale ?? 0.35 },
    uTime: { value: 0 },
    uGain: { value: o.gain ?? 1 },
    uWaterY: { value: -100 },
    uTWet: { value: 20 },
    uBase: { value: base },
    uScaleCol: { value: new THREE.Color(o.scaleCol ?? 0x2c2422) },
    uGrain: { value: o.grain ?? 0.24 },
    uPolish: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = HEAD + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_BODY);
  };
  mat.customProgramCacheKey = () => 'fg-hotmetal-' + MAXC + (o.vertexColors ? 'v' : '');
  const hm = {
    material: mat, u,
    setCols(T, n) { const a = u.uCols.value; for (let i = 0; i < MAXC; i++) a[i] = T[i] ?? 20; u.uN.value = Math.max(1, Math.min(MAXC, n)); },
    setT(T) { u.uT.value = T; },
    update(time) { u.uTime.value = time; },
    dispose() { mat.dispose(); },
  };
  return hm;
}
