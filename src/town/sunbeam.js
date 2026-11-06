// The sunbeam: a shaft of daylight pouring through a crack far up in the cavern roof onto the
// patch of grass by the Surface Express booth. Two nested additive volumes whose light is built of
// cells (blocky streaks, stepped and dithered brightness) and fades to nothing at every edge, so no
// cone or cylinder ever shows, only light; and through it, slow drifting dust: tiny voxels that
// catch the sun (one instanced draw, moved on the GPU).
import * as THREE from 'three';
import { IM } from './units.js';

const VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  return (q.y < 0.5 ? (q.x < 0.5 ? 0.0 : q.x < 1.5 ? 8.0 : q.x < 2.5 ? 2.0 : 10.0) : q.y < 1.5 ? (q.x < 0.5 ? 12.0 : q.x < 1.5 ? 4.0 : q.x < 2.5 ? 14.0 : 6.0) : q.y < 2.5 ? (q.x < 0.5 ? 3.0 : q.x < 1.5 ? 11.0 : q.x < 2.5 ? 1.0 : 9.0) : (q.x < 0.5 ? 15.0 : q.x < 1.5 ? 7.0 : q.x < 2.5 ? 13.0 : 5.0)) / 16.0;
}
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(f, 2.6);
  // fade out when the eye is inside the shaft (no wall of light in the face)
  edge *= smoothstep(0.6, 2.2, length(vV));
  // light voxels: the streaks are sampled on a grid of cells round and along the shaft
  vec2 cu = (floor(vUv * vec2(48.0, 64.0)) + 0.5) / vec2(48.0, 64.0);
  float streak = 0.62 + 0.55 * noise(vec2(cu.x * 22.0, cu.y * 2.0 - uTime * 0.05)) - 0.25 * noise(vec2(cu.x * 61.0 + 3.0, cu.y * 5.0 + uTime * 0.03));
  float fall = smoothstep(0.0, 0.12, vUv.y) * (0.35 + 0.65 * vUv.y) * smoothstep(1.0, 0.9, vUv.y);
  float v = clamp(edge * streak * fall, 0.0, 1.0);
  v = floor(v * 6.0 + bayer(gl_FragCoord.xy)) / 6.0;
  if (v <= 0.0) discard;
  gl_FragColor = vec4(uColor * v * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

const DUST_VERT = /* glsl */`
attribute vec4 aSeed; // height, angle, radial fraction, drift speed
attribute float aSize;
uniform float uTime;
uniform float uLen;
uniform vec2 uR;      // radius at the bottom, at the top
varying float vK;
varying float vShade;
void main() {
  float t = fract(aSeed.x - uTime * aSeed.w);                 // drifting slowly down the shaft
  float a = aSeed.y + uTime * 0.05 * (aSeed.z - 0.4) + sin(uTime * 0.7 + aSeed.x * 40.0) * 0.08;
  float r = aSeed.z * mix(uR.x, uR.y, t) * 0.75;
  vec3 c = vec3(cos(a) * r, (t - 0.5) * uLen, sin(a) * r);
  float tw = 0.55 + 0.45 * sin(uTime * (1.3 + aSeed.w * 40.0) + aSeed.y * 7.0);
  vK = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.75, t) * (0.35 + 0.65 * t) * tw * (1.0 - aSeed.z * 0.5);
  vShade = normal.y > 0.5 ? 1.25 : normal.x > 0.5 ? 0.7 : normal.y < -0.5 ? 0.55 : 0.9;
  vec4 mv = modelViewMatrix * vec4(c + position * aSize, 1.0);
  vK *= smoothstep(0.4, 1.6, -mv.z);                          // no specks in the face
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vK;
varying float vShade;
void main() {
  if (vK < 0.04) discard;
  gl_FragColor = vec4(uColor * vK * vShade, 1.0);
  #include <colorspace_fragment>
}`;

/** Dust in the beam: N tiny voxels (1/32 to 1/20 m) drifting down through the shaft and twinkling. */
function dustMotes(len, rTop, rBot, time, n = 170) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = box.index;
  geo.setAttribute('position', box.attributes.position);
  geo.setAttribute('normal', box.attributes.normal);
  const seed = new Float32Array(n * 4), size = new Float32Array(n);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < n; i++) {
    seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd() * Math.PI * 2; seed[i * 4 + 2] = Math.sqrt(rnd()); seed[i * 4 + 3] = 0.004 + rnd() * 0.01;
    size[i] = (1 / 32 + rnd() * (1 / 20 - 1 / 32)) * IM;
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uLen: { value: len }, uR: { value: new THREE.Vector2(rBot, rTop) }, uColor: { value: new THREE.Color(0xfff2c8) } },
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'sun-dust';
  m.renderOrder = 9;
  m.frustumCulled = false;
  return m;
}

/** A beam from top (crack) to bottom (floor), radii in TU: two nested soft light volumes + dust. Returns { mesh, time }. */
export function sunbeam(top, bottom, rTop = 0.7, rBot = 1.35) {
  const len = top.distanceTo(bottom);
  const time = { value: 0 };
  const grp = new THREE.Group();
  for (const [k, op] of [[1, 0.075], [0.5, 0.1]]) {
    const geo = new THREE.CylinderGeometry(rTop * k, rBot * k, len, 32, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uColor: { value: new THREE.Color(0xffeec0) }, uOpacity: { value: op } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 8;
    mesh.frustumCulled = false;
    grp.add(mesh);
  }
  grp.add(dustMotes(len, rTop, rBot, time));
  grp.position.copy(top).add(bottom).multiplyScalar(0.5);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
  return { mesh: grp, time };
}
