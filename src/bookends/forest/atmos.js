// The forest's air: layered height fog with aerial perspective (golden toward the low sun,
// blue-green away from it, thick in the hollows and thin up in the crowns), quantized into
// dithered steps so it stays pixel art; and a painted golden-hour sky (banded gradient, drifting
// clouds lit peach and rose from below, a crisp sun with a halo) whose horizon is the fog's own
// colour, so the trees melt into it.
//
//   FA: shared uniforms (fog colours, density, height falloff, the sun).
//   GLSL_FA: `float faFog(vec3 w)`, `vec3 faFogCol(vec3 w)`, `vec3 faApply(vec3 col, vec3 w)`
//            (needs GLSL_BAYER first). Every forest material calls faApply.
//   makePaintedSky(): the sky dome (follow the camera with it).
//   setAir(k): 0 = the forest at golden hour, 1 = the dark of the shaft.
import * as THREE from 'three';
import { GLSL_BAYER } from '../fx.js';
import { MF } from '../meadowfx.js';

const C = (h) => new THREE.Color(h);

/** The air: shared by every forest material. */
export const FA = {
  uFaCool: { value: C(0x94b8b0) }, // away from the sun: blue-green haze between the trunks
  uFaWarm: { value: C(0xfadca0) }, // toward the sun: golden
  uFaSun: { value: new THREE.Vector3(-0.36, 0.44, -0.82).normalize() },
  uFaDensity: { value: 0.013 }, // per metre at the base height
  uFaFall: { value: 0.11 }, // how fast it thins with height (per metre)
  uFaBase: { value: 0.0 },
  uFaMax: { value: 0.96 },
  uFaSteps: { value: 14 },
  uFaShadeAmb: { value: 0.62 }, // how much sky light is left under the canopy
};

const AIR = {
  forest: { cool: 0x94b8b0, warm: 0xfadca0, density: 0.013, fall: 0.11, max: 0.96 },
  dark: { cool: 0x070504, warm: 0x0e0a06, density: 0.16, fall: 0.0, max: 1.0 },
};
const _a = new THREE.Color(), _b = new THREE.Color();
/** Blend the air from the golden forest (0) to the dark of the shaft (1). */
export function setAir(k, base = AIR.forest) {
  const A = base, B = AIR.dark;
  FA.uFaCool.value.copy(_a.set(A.cool)).lerp(_b.set(B.cool), k);
  FA.uFaWarm.value.copy(_a.set(A.warm)).lerp(_b.set(B.warm), k);
  FA.uFaDensity.value = A.density + (B.density - A.density) * k * k;
  FA.uFaFall.value = A.fall + (B.fall - A.fall) * k;
  FA.uFaMax.value = A.max + (B.max - A.max) * k;
}

/** GLSL: the fog (needs GLSL_BAYER). w = world position. */
export const GLSL_FA = /* glsl */`
uniform vec3 uFaCool;
uniform vec3 uFaWarm;
uniform vec3 uFaSun;
uniform float uFaDensity;
uniform float uFaFall;
uniform float uFaBase;
uniform float uFaMax;
uniform float uFaSteps;
uniform float uFaShadeAmb;
float faFog(vec3 w) {
  vec3 d = w - cameraPosition;
  float dist = length(d);
  float k = uFaFall * d.y;
  float a = uFaDensity * exp(-(cameraPosition.y - uFaBase) * uFaFall);
  float od = abs(k) < 0.001 ? a * dist : a * dist * (1.0 - exp(-k)) / k;
  return clamp(1.0 - exp(-od), 0.0, uFaMax);
}
vec3 faFogColDir(vec3 rd) {
  float s = max(dot(rd, uFaSun), 0.0);
  float warm = clamp(pow(s, 3.0) * 0.95 + s * 0.12, 0.0, 1.0);
  // a little lighter low down (the mist), a little cooler up high
  vec3 c = mix(uFaCool, uFaWarm, warm);
  return c * (1.0 + 0.06 * (1.0 - clamp(rd.y * 3.0 + 0.5, 0.0, 1.0)));
}
vec3 faFogCol(vec3 w) { return faFogColDir(normalize(w - cameraPosition)); }
vec3 faApply(vec3 col, vec3 w) {
  float f = faFog(w);
  f = floor(f * uFaSteps + bk_bayer4(gl_FragCoord.xy) * 0.999) / uFaSteps;
  return mix(col, faFogCol(w), f);
}`;

/** Uniforms for a ShaderMaterial that uses GLSL_FA. */
export const faUniforms = () => ({ ...FA });

// ------------------------------------------------------------------ the sky
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = /* glsl */`
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uLow;
uniform vec3 uCloudLit; uniform vec3 uCloudMid; uniform vec3 uCloudDark; uniform vec3 uRim;
uniform vec3 uDisc; uniform vec3 uHalo;
uniform sampler2D uCloud;
uniform float uTime;
uniform float uDark;
varying vec3 vDir;
${GLSL_BAYER}
${GLSL_FA}
void main() {
  vec3 d = normalize(vDir);
  float b = bk_bayer4(gl_FragCoord.xy);
  float e = max(d.y, 0.0);
  float s = max(dot(d, uFaSun), 0.0);
  // banded gradient: the fog colour at the horizon, warm low sky, cool high
  float t = floor(pow(e, 0.5) * 18.0 + b) / 18.0;
  vec3 hor = faFogColDir(vec3(d.x, 0.0, d.z) * 0.999 + vec3(0.0, 0.001, 0.0));
  vec3 low = mix(uLow, uFaWarm, pow(s, 2.0) * 0.8);
  vec3 col = t < 0.12 ? mix(hor, low, t / 0.12) : t < 0.45 ? mix(low, uMid, (t - 0.12) / 0.33) : mix(uMid, uZenith, (t - 0.45) / 0.55);
  // painted clouds on a plane overhead, drifting, lit from below by the low sun
  if (d.y > 0.02) {
    vec2 p = d.xz / (d.y + 0.18) * 0.22 + vec2(uTime * 0.0035, uTime * 0.0012);
    float n = texture2D(uCloud, p).r * 0.62 + texture2D(uCloud, p * 2.3 + 0.37).r * 0.28 + texture2D(uCloud, p * 5.1 - 0.2).r * 0.1;
    float fade = smoothstep(0.02, 0.2, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y) * 0.6);
    float c = smoothstep(0.44, 0.6, n) * fade;
    float q = floor(c * 4.0 + b * 0.999) / 4.0;
    if (q > 0.0) {
      // the underside toward the sun burns peach, the rest rosy lavender; a bright rim near the sun
      float lit = clamp(pow(s, 3.0) * 1.2 + (n - 0.6) * 1.5, 0.0, 1.0);
      lit = floor(lit * 3.0 + b) / 3.0;
      vec3 cc = mix(uCloudDark, uCloudMid, lit);
      cc = mix(cc, uCloudLit, step(0.66, lit));
      cc = mix(cc, uRim, step(0.97, s) * 0.6);
      col = mix(col, cc, q * 0.92);
    }
  }
  // the sun: glow rings, a halo and a crisp disc
  float glow = floor((pow(s, 6.0) * 0.35 + pow(s, 40.0) * 0.4 + pow(s, 300.0) * 0.5) * 8.0 + b) / 8.0;
  col = mix(col, uHalo, clamp(glow, 0.0, 1.0) * 0.8);
  if (s > 0.99962) col = uDisc;
  else if (s > 0.99935) col = mix(uDisc, uHalo, 0.5);
  if (d.y < 0.0) col = hor;
  col = mix(col, uFaCool, uDark);
  gl_FragColor = vec4(col, 1.0);
}`;

/** The painted golden-hour sky dome (radius 150; keep it centred on the camera). */
export function makePaintedSky() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    uniforms: {
      ...FA,
      uZenith: { value: C(0x3c68b8) }, uMid: { value: C(0x8cb4dc) }, uLow: { value: C(0xe8dcc0) },
      uCloudLit: { value: C(0xffd8a8) }, uCloudMid: { value: C(0xe8b0b0) }, uCloudDark: { value: C(0xa898b8) }, uRim: { value: C(0xfff4dc) },
      uDisc: { value: C(0xfffef0) }, uHalo: { value: C(0xfff0c0) },
      uCloud: MF.uCloud, uTime: MF.uTime, uDark: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  m.renderOrder = -100;
  m.frustumCulled = false;
  m.userData.noBatch = true;
  return m;
}
