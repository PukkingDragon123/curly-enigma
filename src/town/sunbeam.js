// The sunbeam: a shaft of daylight pouring through a crack far up in the cavern roof onto the
// patch of grass by the Surface Express booth. No cone or cylinder: the light is a few layered
// sheets of light cells (blocky streaks, stepped and dithered brightness, ragged cell edges) that
// turn about the beam's axis to face the eye, each a slice through the shaft at its own depth (so
// they part a little as you walk round it, and the beam reads as a volume of lit dust); an outer
// soft body and a brighter core, fading to nothing at every edge; and through it, slow drifting
// dust: tiny voxels that catch the sun (one instanced draw, moved on the GPU).
import * as THREE from 'three';
import { IM } from './units.js';

const SHEET_VERT = /* glsl */`
attribute vec2 corner;  // across (-1..1), along (0 bottom .. 1 top)
attribute float slice;  // the sheet's depth through the shaft (-1 far side .. 1 near side)
uniform float uLen;
uniform vec2 uR;        // radius at the bottom, at the top
varying vec2 vC;
varying float vSlice;
varying float vNear;
void main() {
  vec3 eye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vec2 d = eye.xz;
  float de = length(d);
  d = de > 1e-4 ? d / de : vec2(0.0, 1.0);
  vec2 side = vec2(-d.y, d.x);
  float r = mix(uR.x, uR.y, corner.y);
  float s = slice * 0.62;
  float half_ = r * sqrt(max(0.0, 1.0 - s * s)); // the chord of the shaft at that depth
  vec2 xz = side * corner.x * half_ + d * s * r;
  vC = corner;
  vSlice = slice;
  // fade out when the eye is inside the shaft (no wall of light in the face)
  vNear = smoothstep(r * 0.55, r * 0.55 + 1.6, de);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(xz.x, (corner.y - 0.5) * uLen, xz.y, 1.0);
}`;
const SHEET_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uLen;
varying vec2 vC;
varying float vSlice;
varying float vNear;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0), q1 = mod(q, 2.0), q2 = floor(q * 0.5);
  float b1 = q1.x * 2.0 + q1.y * 3.0 - q1.x * q1.y * 4.0, b2 = q2.x * 2.0 + q2.y * 3.0 - q2.x * q2.y * 4.0;
  return (b1 * 4.0 + b2 + 0.5) / 16.0;
}
void main() {
  // light voxels: cells across the sheet (18) and along it (about one per 0.3 units)
  vec2 n = vec2(18.0, floor(uLen / 0.3));
  vec2 cell = floor(vec2(vC.x * 0.5 + 0.5, vC.y) * n);
  float seed = vSlice * 13.7;
  vec2 cu = (cell + 0.5) / n;
  float u = cu.x * 2.0 - 1.0;
  // thick in the middle, thin at the edges, and each edge cell set by hand (ragged)
  float d = abs(u) + (hash(cell + seed + 5.0) - 0.5) * 0.24;
  float body = sqrt(clamp(1.0 - d * d, 0.0, 1.0));
  float streak = 0.62 + 0.55 * noise(vec2(cell.x * 0.9 + seed, cu.y * 3.0 - uTime * 0.05)) - 0.25 * noise(vec2(cell.x * 2.3 + 3.0 + seed, cu.y * 7.0 + uTime * 0.03));
  float fall = smoothstep(0.0, 0.12, cu.y) * (0.35 + 0.65 * cu.y) * smoothstep(1.0, 0.9, cu.y);
  float v = clamp(body * streak * fall * vNear, 0.0, 1.0);
  v = floor(v * 6.0 + bayer(gl_FragCoord.xy)) / 6.0;
  if (v <= 0.0) discard;
  gl_FragColor = vec4(uColor * v * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

/** n light sheets through the shaft (slices from the far side to the near), one geometry. */
function lightSheets(n) {
  const corner = [], slice = [], idx = [];
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    corner.push(-1, 0, 1, 0, 1, 1, -1, 1);
    slice.push(s, s, s, s);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('slice', new THREE.Float32BufferAttribute(slice, 1));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(n * 12).fill(0), 3)); // (placed in the shader)
  g.setIndex(idx);
  return g;
}

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

/** A beam from top (crack) to bottom (floor), radii in TU: layered light-cell sheets (a soft body, a brighter core) + dust. Returns { mesh, time }. */
export function sunbeam(top, bottom, rTop = 0.7, rBot = 1.35) {
  const len = top.distanceTo(bottom);
  const time = { value: 0 };
  const grp = new THREE.Group();
  for (const [k, n, op] of [[1, 3, 0.044], [0.5, 2, 0.075]]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uLen: { value: len }, uR: { value: new THREE.Vector2(rBot * k, rTop * k) }, uColor: { value: new THREE.Color(0xffeec0) }, uOpacity: { value: op } },
      vertexShader: SHEET_VERT, fragmentShader: SHEET_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(lightSheets(n), mat);
    mesh.renderOrder = 8;
    mesh.frustumCulled = false;
    mesh.name = 'sun-light';
    grp.add(mesh);
  }
  grp.add(dustMotes(len, rTop, rBot, time));
  grp.position.copy(top).add(bottom).multiplyScalar(0.5);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
  return { mesh: grp, time };
}
