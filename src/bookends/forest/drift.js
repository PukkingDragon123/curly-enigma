// What drifts in the air of the forest (wave 8), moved entirely on the GPU (no per-frame CPU work
// beyond a few uniforms): leaves spinning down from the canopy (they flash as they turn to the low
// sun, glow gold against it, and sink into the forest's fog), and pollen and dust motes that only
// show where a shaft or a dapple of sun catches them. Both live in boxes that wrap round the
// camera, so there are always some near the lens wherever the shot is.
//
//   const D = makeDrift({ lite, soft });  scene.add(D.group);
//   D.update(dt, camera, heightPx);  D.set({ leaves: 0..1, motes: 0..1 });  D.dispose();
import * as THREE from 'three';
import { makeRng } from '../../core/util.js';
import { GLSL_BAYER } from '../fx.js';
import { MF } from '../meadowfx.js';
import { FF, GLSL_DAPPLE } from '../forestfx.js';
import { FA, GLSL_FA } from './atmos.js';

const LEAF_VERT = /* glsl */`
attribute vec4 aRand; // fall speed, phase, spin, colour
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uScale;
uniform float uPix;
uniform float uAmount;
varying vec3 vW;
varying float vSpin;
varying float vCol;
varying float vFade;
void main() {
  vec3 p = position * uBox;
  float sp = 0.32 + aRand.x * 0.3;
  p.y -= uTime * sp;
  p.xz += uWind * uTime * (0.22 + aRand.x * 0.18);
  // the flutter: a swinging, side-slipping fall
  float ph = uTime * (1.1 + aRand.y * 1.3) + aRand.y * 31.0;
  p.x += sin(ph) * 0.32 + sin(ph * 0.37) * 0.2;
  p.z += cos(ph * 0.81) * 0.26;
  p.y += abs(sin(ph)) * 0.08;
  vec3 o = uCam - vec3(uBox.x * 0.5, uBox.y * 0.35, uBox.z * 0.5);
  p = o + mod(p - o, uBox);
  vW = p;
  vSpin = uTime * (2.0 + aRand.z * 5.0) + aRand.y * 20.0;
  vCol = aRand.w;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  // thin out toward the box's edge (it wraps there) and right at the lens
  vec3 rel = (p - o) / uBox;
  vec3 e = min(rel, 1.0 - rel);
  vFade = smoothstep(0.0, 0.12, min(e.x, min(e.y, e.z))) * smoothstep(0.35, 1.1, d) * step(aRand.z, uAmount);
  gl_PointSize = vFade > 0.0 ? clamp(floor(0.055 * uScale / max(d, 0.1) + 0.5), 1.0, 9.0 * uPix) : 0.0;
}`;
const LEAF_FRAG = /* glsl */`
uniform vec3 uKey; uniform vec3 uSky; uniform vec3 uGround;
varying vec3 vW;
varying float vSpin;
varying float vCol;
varying float vFade;
${GLSL_BAYER}
${GLSL_DAPPLE}
${GLSL_FA}
void main() {
  if (vFade <= bk_bayer4(gl_FragCoord.xy) * 0.999) discard;
  // a leaf that turns as it falls: its width follows the spin (it shows its edge, then its face)
  vec2 q = gl_PointCoord - 0.5;
  float w = max(0.16, abs(cos(vSpin))) * 0.5;
  if (abs(q.x) > w || abs(q.y) > 0.42 - abs(q.x) * 0.3) discard;
  vec3 c = vCol < 0.3 ? vec3(0.62, 0.72, 0.28) : vCol < 0.55 ? vec3(0.86, 0.72, 0.26) : vCol < 0.8 ? vec3(0.84, 0.5, 0.2) : vec3(0.56, 0.36, 0.18);
  float face = abs(cos(vSpin));
  float sun = (ffSun(vW) - uShade) / (1.0 - uShade);
  vec3 V = normalize(vW - cameraPosition);
  float back = pow(max(dot(V, uFaSun), 0.0), 4.0);
  vec3 col = c * (mix(uGround, uSky, 0.6) * mix(uFaShadeAmb, 1.0, ffOpen(vW)) * 0.75 + uKey * sun * (0.35 + 0.65 * face));
  col += c * uKey * back * 1.6 * (0.3 + 0.7 * sun); // glowing gold against the low sun
  col = faApply(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const MOTE_VERT = /* glsl */`
attribute vec4 aRand;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uScale;
uniform float uPix;
uniform float uAmount;
varying vec3 vW;
varying float vFade;
varying float vTw;
void main() {
  vec3 p = position * uBox;
  float t = uTime;
  // slow wandering on the air, carried a little by the wind, rising in the warmth
  p += vec3(sin(t * (0.21 + aRand.x * 0.3) + aRand.y * 9.0), sin(t * (0.17 + aRand.z * 0.2) + aRand.w * 7.0) * 0.6, cos(t * (0.19 + aRand.y * 0.25) + aRand.x * 5.0)) * 0.45;
  p.xz += uWind * t * 0.06;
  p.y += t * (0.015 + aRand.z * 0.03);
  vec3 o = uCam - vec3(uBox.x * 0.5, uBox.y * 0.4, uBox.z * 0.5);
  p = o + mod(p - o, uBox);
  vW = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vec3 rel = (p - o) / uBox;
  vec3 e = min(rel, 1.0 - rel);
  vFade = smoothstep(0.0, 0.15, min(e.x, min(e.y, e.z))) * smoothstep(0.4, 1.2, d) * step(aRand.w, uAmount);
  vTw = 0.55 + 0.45 * sin(t * (2.0 + aRand.x * 4.0) + aRand.y * 40.0);
  gl_PointSize = vFade > 0.0 ? clamp(floor(0.022 * uScale / max(d, 0.1) + 0.5), 1.0, 3.0 * uPix) : 0.0;
}`;
const MOTE_FRAG = /* glsl */`
uniform vec3 uKey;
uniform float uGain;
varying vec3 vW;
varying float vFade;
varying float vTw;
${GLSL_BAYER}
${GLSL_DAPPLE}
${GLSL_FA}
void main() {
  // only the ones in the sun show: a dapple, a shaft, or against the low sun itself
  float sun = (ffSun(vW) - uShade) / (1.0 - uShade);
  vec3 V = normalize(vW - cameraPosition);
  float back = pow(max(dot(V, uFaSun), 0.0), 6.0);
  float a = vFade * vTw * (sun * 0.75 + back * 0.9 + 0.06) * uGain;
  a *= 1.0 - faFog(vW);
  float q = floor(a * 5.0 + bk_bayer4(gl_FragCoord.xy) * 0.999) / 5.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.94, 0.74), uKey, 0.35) * q, 1.0);
}`;

function cloud(n, seed) {
  const rng = makeRng(seed);
  const P = new Float32Array(n * 3), R = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    P[i * 3] = rng(); P[i * 3 + 1] = rng(); P[i * 3 + 2] = rng();
    R[i * 4] = rng(); R[i * 4 + 1] = rng(); R[i * 4 + 2] = rng(); R[i * 4 + 3] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(R, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

export function makeDrift({ lite = false, soft = false } = {}) {
  const group = new THREE.Group();
  group.name = 'forest-drift';
  const common = {
    uTime: MF.uTime, uWind: MF.uWind, uCloud: MF.uCloud, uKey: MF.uKey, uSky: MF.uSky, uGround: MF.uGround,
    uOpen: FF.uOpen, uOpenBox: FF.uOpenBox, uDapple: FF.uDapple, uShade: FF.uShade,
    uCam: { value: new THREE.Vector3() }, uScale: { value: 400 }, uPix: { value: 1 },
    ...FA,
  };
  const leafU = { ...common, uBox: { value: new THREE.Vector3(26, 11, 26) }, uAmount: { value: 1 } };
  const leaves = new THREE.Points(cloud(soft ? 180 : lite ? 320 : 640, 7101), new THREE.ShaderMaterial({
    uniforms: leafU, vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG,
  }));
  leaves.frustumCulled = false;
  leaves.renderOrder = 4;
  leaves.name = 'drift-leaves';
  const moteU = { ...common, uBox: { value: new THREE.Vector3(16, 6, 16) }, uAmount: { value: 1 }, uGain: { value: 1 } };
  const motes = new THREE.Points(cloud(soft ? 300 : lite ? 600 : 1300, 7103), new THREE.ShaderMaterial({
    uniforms: moteU, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.frustumCulled = false;
  motes.renderOrder = 8;
  motes.name = 'drift-motes';
  group.add(leaves, motes);

  const update = (dt, camera, heightPx) => {
    const cp = camera.position;
    leafU.uCam.value.copy(cp);
    moteU.uCam.value.copy(cp);
    const sc = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    common.uScale.value = sc;
    leafU.uScale.value = sc; moteU.uScale.value = sc;
    const pix = Math.max(1, heightPx / 400);
    leafU.uPix.value = pix; moteU.uPix.value = pix;
  };
  /** How much of each is in the air (0..1). */
  const set = ({ leaves: l, motes: m, gain } = {}) => {
    if (l != null) leafU.uAmount.value = l;
    if (m != null) moteU.uAmount.value = m;
    if (gain != null) moteU.uGain.value = gain;
    leaves.visible = leafU.uAmount.value > 0.001;
    motes.visible = moteU.uAmount.value > 0.001;
  };
  const dispose = () => { for (const p of [leaves, motes]) { p.geometry.dispose(); p.material.dispose(); } };
  return { group, update, set, dispose, leaves, motes };
}
