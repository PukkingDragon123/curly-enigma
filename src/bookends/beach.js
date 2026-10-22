// Ending phases 3 & 4: the surface (a blinding first look at the sun, sunglasses on) and the
// sunset beach, where the camera slowly orbits for the first time in the whole game.
import * as THREE from 'three';
import { meshRelief, hash3 } from './vox.js';
import { batchStatic } from './batch.js';
import { makePalm, makeUmbrella, makeLounger, makeTowel, makeSandcastle, makeBucket, makeSpade, makeBeachBall, makeShell, makeStarfish, makeCrab, makeGrassTuft, makeTerminusRing } from './beachprops.js';
import { makeCoconut, makeRock } from './props.js';
import { Particles, Twinkles, SHAPE, makeSheetSprite, makeBlobShadow, cloudCanvas, gullSheet, GLSL_BAYER, fitFov } from './fx.js';
import { signTexture } from './pixfont.js';
import { pixelTexture } from '../gfx/PixelArt.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { makeNoise2D, makeRng, clamp, lerp } from '../core/util.js';

const VS = 1 / 8;
const RX = 8.6, RZ = 6.6, P = 2.4;
const SUN_DIR = new THREE.Vector3(-0.22, 0.058, -1).normalize();
/** Toward the setting sun (god rays in the ending's beach). */
export const BEACH_SUN = SUN_DIR;
const GB = { x0: -11.5, x1: 11.5, z0: -9.5, z1: 9.5, y0: -0.75 };
const CAGE_YAW = Math.PI; // the riders face the sunset when they arrive

export const SPOTS = {
  chair: new THREE.Vector3(0.3, 0, -3.0),
  umbrella: new THREE.Vector3(-0.95, 0, -3.55),
  towel: new THREE.Vector3(1.75, 0, -2.75),
  castle: new THREE.Vector3(-2.7, 0, -4.75),
  cage: new THREE.Vector3(-1.4, 0, 3.7),
};

const n1 = makeNoise2D(71), n2 = makeNoise2D(83);
function islandD(x, z) { return Math.pow(Math.pow(Math.abs(x / RX), P) + Math.pow(Math.abs(z / RZ), P), 1 / P); }
export function sandHeight(x, z) {
  const d = islandD(x, z) + n1(x * 0.22, z * 0.22) * 0.06;
  let h = d < 1 ? 0.6 * (1 - Math.pow(d, 2.4)) : -1.4 * (d - 1);
  h += Math.max(0, n2(x * 0.18 + 3, z * 0.18)) * 0.5 * clamp(1 - d * 1.25, 0, 1) * (z > -1.5 ? 1 : 0.25);
  return Math.max(GB.y0 + 0.01, h);
}

// ------------------------------------------------------------------ island
// The sand is a 1/16 heightfield relief: wind ripples (lit crests, shaded troughs), a dark wet band
// with foam lace at the waterline, shell grit and seaweed, and footprints: the mole's paws from the
// lift ring to the lounger, Nugget's little forks from the towel down to the water.
const VI = 1 / 16;
function footprintMap(nx, nz) {
  const marks = new Map();
  const cell = (x, z) => {
    const i = Math.floor((x - GB.x0) / VI), k = Math.floor((z - GB.z0) / VI);
    return i >= 0 && k >= 0 && i < nx && k < nz ? i + nx * k : -1;
  };
  const stamp = (x, z, dx, dz, pts) => {
    for (const [a, b] of pts) {
      const q = cell(x + dx * a - dz * b, z + dz * a + dx * b);
      if (q >= 0) marks.set(q, 1);
    }
  };
  // the mole: from the Surface Express ring to the lounger, a lazy S
  const A = SPOTS.cage, B = SPOTS.chair;
  const n = 26;
  for (let s = 1; s < n; s++) {
    const t = s / n;
    const x = A.x + (B.x - A.x) * t + Math.sin(t * Math.PI * 1.6) * 0.55, z = A.z + (B.z - A.z) * t;
    const t2 = (s + 0.5) / n;
    const x2 = A.x + (B.x - A.x) * t2 + Math.sin(t2 * Math.PI * 1.6) * 0.55, z2 = A.z + (B.z - A.z) * t2;
    let dx = x2 - x, dz = z2 - z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const side = s % 2 ? 1 : -1;
    const px = x - dz * side * 0.07, pz = z + dx * side * 0.07;
    stamp(px, pz, dx, dz, [[0, 0], [0.0625, 0], [-0.0625, 0], [0, 0.0625], [0.0625, 0.0625], [0.125, -0.06], [0.14, 0], [0.125, 0.06]]);
  }
  // Nugget: three-toed forks from the towel to the shallows
  const H0 = new THREE.Vector3(SPOTS.towel.x - 0.25, 0, SPOTS.towel.z + 0.1);
  const a = -Math.PI / 2 + 0.35;
  const H1 = new THREE.Vector3(Math.cos(a) * RX * 0.86, 0, Math.sin(a) * RZ * 0.86);
  const m = 30;
  for (let s = 2; s < m; s++) {
    const t = s / m;
    const x = H0.x + (H1.x - H0.x) * t + Math.sin(t * 9) * 0.06, z = H0.z + (H1.z - H0.z) * t;
    let dx = H1.x - H0.x, dz = H1.z - H0.z;
    const l = Math.hypot(dx, dz);
    dx /= l; dz /= l;
    const side = s % 2 ? 1 : -1;
    stamp(x - dz * side * 0.04, z + dx * side * 0.04, dx, dz, [[0, 0], [0.0625, 0], [0.11, -0.06], [0.11, 0.06], [-0.06, 0]]);
  }
  return marks;
}

function buildIsland() {
  const nx = Math.round((GB.x1 - GB.x0) / VI), nz = Math.round((GB.z1 - GB.z0) / VI);
  const n = nx * nz;
  const h = new Uint16Array(n), top = new Uint32Array(n), tops = new Float32Array(n);
  const prints = footprintMap(nx, nz);
  const PATCH3 = [0.96, 1.0, 1.04];
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = GB.x0 + (i + 0.5) * VI, z = GB.z0 + (k + 0.5) * VI;
    const q = i + nx * k;
    const hgt = sandHeight(x, z);
    let lv = clamp(Math.floor((hgt - GB.y0) / VI) + 1, 1, 60);
    tops[q] = GB.y0 + lv * VI;
    if (hgt < -0.32) continue; // under the opaque water; the water shader draws the shallows
    const d = islandD(x, z);
    const y = tops[q];
    const g = hash3(i, k, 0, 2);
    let c;
    if (y < -0.05) c = g < 0.5 ? 0xa8845a : 0xb08a5c;
    else if (d > 0.9 || y < 0.12) {
      // wet sand, with lace-like foam residue and strands of seaweed near the line
      c = g < 0.5 ? 0xc89a68 : 0xbc8e5e;
      const lace = Math.abs(Math.sin(Math.atan2(z / RZ, x / RX) * 23 + n1(x * 0.8, z * 0.8) * 4) * 0.5 + (d - 0.935) * 30);
      if (d > 0.91 && d < 0.96 && lace < 0.18) c = g < 0.5 ? 0xeee2cc : 0xdcccb0;
      else if (d > 0.88 && d < 0.95 && n2(x * 1.7, z * 1.7) > 0.36) c = g < 0.5 ? 0x4a6a3a : 0x5a7a3a; // seaweed
      else if (g > 0.985) c = 0xfff6e0; // a glint of shell
    } else {
      // dry sand: wind ripples with a lit crest and a shaded lee, plus shell grit
      const ph = x * 8.2 + z * 3.4 + n1(x * 0.45, z * 0.45) * 7 + n2(x * 1.3, z * 1.3) * 1.5;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const calm = n2(x * 0.3 + 9, z * 0.3) > 0.32; // patches where the wind left the sand smooth
      if (!calm && sn > 0.82) c = 0xfff0c8;
      else if (!calm && sn > 0.35 && cs < -0.15) c = 0xd8b47c;
      else c = PATCH3[(hash3(i >> 1, k >> 1, 0, 3) * 3) | 0] > 1 ? 0xf6e0b0 : hash3(i >> 1, k >> 1, 0, 4) < 0.5 ? 0xf2d8a0 : 0xead09a;
      if (g > 0.993) c = [0xffc0c8, 0xfff0e0, 0xe8d0ff, 0xf0b090][(g * 4000) & 3]; // shell grit
      else if (g < 0.004) c = 0xb8a088; // a dark pebble
    }
    if (prints.has(q) && y >= 0.05) { lv = Math.max(1, lv - 1); c = d > 0.9 ? 0xa8845a : 0xd8b47c; }
    h[q] = lv;
    top[q] = c;
  }
  const sideFn = (q, y) => (y >= h[q] - 3 ? top[q] : 0xd8b47c); // steps keep the sand's colour; light does the rest
  const mesh = new THREE.Mesh(
    meshRelief({ W: nx, D: nz, h, top, side: sideFn, U: [VI, 0, 0], V: [0, 0, VI], N: [0, VI, 0], origin: [GB.x0, GB.y0, GB.z0] }),
    voxelMaterial('toon'),
  );
  const groundY = (x, z) => {
    const i = clamp(Math.floor((x - GB.x0) / VI), 0, nx - 1), k = clamp(Math.floor((z - GB.z0) / VI), 0, nz - 1);
    return tops[k * nx + i];
  };
  return { mesh, groundY };
}

/** Seabed height texture for the water shader (foam & shallows follow the real island). */
function seabedTexture() {
  const N = 128, size = 40, x0 = -20, z0 = -20;
  const data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + ((i + 0.5) / N) * size, z = z0 + ((j + 0.5) / N) * size;
    const d = islandD(x, z);
    let h = d < 1 ? sandHeight(x, z) : Math.max(-2, -1.4 * (d - 1));
    data[j * N + i] = Math.round(clamp((h + 2) / 4, 0, 1) * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { texture: t, rect: new THREE.Vector4(x0, z0, size, 0) };
}

// ------------------------------------------------------------------ sky
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uZenith; uniform vec3 uUpper; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uHorizon;
uniform vec3 uBelowFar; uniform vec3 uBelowSun; uniform vec3 uSunHi; uniform vec3 uSunLo; uniform vec3 uGlow;
uniform float uTime;
varying vec3 vDir;
${GLSL_BAYER}
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec2 hd = normalize(d.xz + vec2(1e-5));
  vec2 hs = normalize(uSunDir.xz);
  float side = dot(hs, hd) * 0.5 + 0.5;
  float sun4 = side * side * side * side;
  float t = pow(clamp(e / 0.62, 0.0, 1.0), 0.55);
  float tq = floor(t * 18.0 + bk_bayer4(gl_FragCoord.xy)) / 18.0;
  vec3 col;
  if (tq < 0.14) col = mix(uHorizon, uLow, tq / 0.14);
  else if (tq < 0.36) col = mix(uLow, uMid, (tq - 0.14) / 0.22);
  else if (tq < 0.62) col = mix(uMid, uUpper, (tq - 0.36) / 0.26);
  else col = mix(uUpper, uZenith, (tq - 0.62) / 0.38);
  vec3 cool = col * vec3(0.66, 0.6, 0.95) + vec3(0.02, 0.0, 0.06);
  col = mix(cool, col, smoothstep(0.0, 1.0, side));
  if (e < 0.0) col = mix(uBelowFar, uBelowSun, sun4);
  float ang = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  float glow = exp(-ang * 4.0) * 0.55 + exp(-ang * 16.0) * 0.45;
  if (e < 0.0) glow *= 0.5;
  glow = floor(glow * 9.0 + bk_bayer4(gl_FragCoord.xy)) / 9.0;
  col += uGlow * glow;
  float R = 0.088;
  if (ang < R && e > -0.0015) {
    float v = (e - uSunDir.y) / R;
    vec3 sc = mix(uSunLo, uSunHi, clamp(v * 0.6 + 0.55, 0.0, 1.0));
    float gap = v < 0.05 ? clamp(0.12 + (-v) * 0.42, 0.0, 0.8) : 0.0;
    float stripe = fract(v * 4.2 + 0.35);
    if (stripe >= gap) col = sc;
  }
  if (e > 0.3) {
    vec2 cell = floor(vec2(atan(d.z, d.x) * 110.0, e * 240.0));
    float h = hash12(cell);
    if (h > 0.9968) col += vec3(0.9, 0.85, 1.0) * (0.25 + 0.25 * sin(uTime * 2.3 + h * 60.0)) * smoothstep(0.3, 0.65, e);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function makeSky() {
  const C = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uZenith: { value: C(0x2a1e58) }, uUpper: { value: C(0x6a3a8c) }, uMid: { value: C(0xd8587c) }, uLow: { value: C(0xff8c5a) }, uHorizon: { value: C(0xffc874) },
      uBelowFar: { value: C(0x6a4a78) }, uBelowSun: { value: C(0xf0906a) },
      uSunHi: { value: C(0xfff4b0) }, uSunLo: { value: C(0xff6a4a) }, uGlow: { value: C(0x8a3a10) },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(170, 48, 24), mat);
  m.renderOrder = -100;
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ water
const WATER_VERT = /* glsl */`
uniform float uTime;
uniform sampler2D uBed;
uniform vec4 uBedRect;
varying vec3 vWorld;
varying float vBed;
float seabed(vec2 p) {
  vec2 uv = (p - uBedRect.xy) / uBedRect.z;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -2.0;
  return texture2D(uBed, uv).r * 4.0 - 2.0;
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float bed = seabed(wp.xz);
  float shallow = clamp(1.0 + bed / 1.2, 0.0, 1.0);
  float swell = sin(wp.x * 0.33 + uTime * 0.8) * 0.045 + sin(wp.z * 0.41 - uTime * 0.66 + 1.3) * 0.04 + sin((wp.x + wp.z) * 0.9 + uTime * 1.7) * 0.012;
  float surge = (sin(uTime * 0.85) * 0.5 + 0.5) * 0.07 * shallow;
  wp.y += swell * (1.0 - 0.6 * shallow) + surge - 0.02;
  vWorld = wp.xyz;
  vBed = bed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uFoam;
uniform vec3 uSkyLo; uniform vec3 uSkySun; uniform vec3 uFogFar; uniform vec3 uFogSun; uniform vec3 uGlint;
uniform float uFogNear; uniform float uFogFar2;
varying vec3 vWorld;
varying float vBed;
${GLSL_BAYER}
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 V = normalize(vWorld - cameraPosition);
  float depth = vWorld.y - vBed;
  vec3 col = mix(uShallow, uMid, smoothstep(0.03, 0.8, depth));
  col = mix(col, uDeep, smoothstep(0.8, 2.6, depth));
  // azimuth toward the sun
  vec2 hd = normalize(V.xz + vec2(1e-5));
  vec2 hs = normalize(uSunDir.xz);
  float side = dot(hd, hs) * 0.5 + 0.5;
  float sun4 = pow(side, 6.0);
  // sky reflection grows toward grazing angles
  float fres = pow(1.0 - clamp(-V.y, 0.0, 1.0), 3.0);
  vec3 refl = mix(uSkyLo, uSkySun, sun4);
  col = mix(col, refl, clamp(fres * 0.9, 0.0, 0.92));
  // pixel wave lines drifting toward the shore
  float w = sin(vWorld.z * 1.7 + sin(vWorld.x * 0.45 + uTime * 0.5) * 1.6 + uTime * 0.7) + 0.35 * sin(vWorld.x * 2.1 - uTime);
  float line = step(1.1, w);
  col = mix(col, mix(col, uFoam, 0.35), line * (1.0 - smoothstep(6.0, 40.0, length(vWorld.xz))));
  // sun glitter path
  float n = sin(vWorld.x * 3.1 + uTime * 1.6) * sin(vWorld.z * 3.7 - uTime * 1.3);
  vec3 N = normalize(vec3(n * 0.16, 1.0, cos(vWorld.x * 2.0 + vWorld.z * 1.3 + uTime) * 0.12));
  vec3 R = reflect(V, N);
  float s = max(dot(R, uSunDir), 0.0);
  float sheen = pow(s, 40.0);
  col += uGlint * floor(sheen * 4.0 + bk_bayer4(gl_FragCoord.xy)) / 4.0 * 0.6;
  float tw = hash12(floor(vWorld.xz * 5.0) + floor(uTime * 3.0));
  if (s > 0.965 && tw > 0.72) col = mix(col, vec3(1.0, 0.97, 0.85), 0.9);
  // foam: a lacy line at the waterline, and three breaking waves whose fronts run up the beach,
  // broken up along the shore, each trailing a dithered wake of foam that thins as it spends itself
  float foam = 1.0 - smoothstep(0.0, 0.06, depth);
  float along = vWorld.x * 0.9 + vWorld.z * 0.7;
  float brk = sin(along * 1.7 + uTime * 0.3) * 0.5 + sin(along * 4.3 - uTime * 0.7) * 0.25;
  float surf = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = fract(uTime * 0.13 + float(i) / 3.0);
    float front = mix(0.55, -0.02, ph * ph * (3.0 - 2.0 * ph));
    float d = depth - front + brk * 0.035;
    float gaps = step(0.22, fract(along * 0.45 + float(i) * 0.31 + brk * 0.2)); // the crest breaks in places
    float band = (1.0 - smoothstep(0.0, 0.025 + 0.02 * (1.0 - ph), abs(d))) * (1.0 - ph * 0.55) * gaps;
    float wake = step(0.0, d) * (1.0 - smoothstep(0.0, 0.2, d)) * (1.0 - ph) * 0.55;
    surf = max(surf, max(band, wake));
  }
  surf *= 1.0 - smoothstep(0.2, 0.6, depth);
  float lap = step(0.86, fract(depth * 5.0 - uTime * 0.55)) * (1.0 - smoothstep(0.05, 0.42, depth)) * 0.5;
  float fq = floor(clamp(max(max(foam, surf), lap), 0.0, 1.0) * 4.0 + bk_bayer4(gl_FragCoord.xy)) / 4.0;
  col = mix(col, uFoam, clamp(fq, 0.0, 1.0));
  // fade into the horizon haze
  float dist = length(vWorld.xz - cameraPosition.xz);
  float fogK = smoothstep(uFogNear, uFogFar2, dist);
  col = mix(col, mix(uFogFar, uFogSun, sun4), fogK);
  gl_FragColor = vec4(col, 1.0);
}`;

function waterGeometry() {
  // polar grid: dense near the island, sparse toward the horizon
  const rings = 70, segs = 128, R = 150;
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  for (let r = 1; r <= rings; r++) {
    const rad = R * Math.pow(r / rings, 2.0);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs, a1 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function makeWater(bed) {
  const C = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBed: { value: bed.texture }, uBedRect: { value: bed.rect }, uSunDir: { value: SUN_DIR.clone() },
      uShallow: { value: C(0x5ad8c0) }, uMid: { value: C(0x2a8aa0) }, uDeep: { value: C(0x2a3e78) }, uFoam: { value: C(0xfff4ea) },
      uSkyLo: { value: C(0x7a4a8a) }, uSkySun: { value: C(0xffa070) }, uFogFar: { value: C(0x6a4a78) }, uFogSun: { value: C(0xf0906a) },
      uGlint: { value: C(0xffd890) }, uFogNear: { value: 30 }, uFogFar2: { value: 130 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
  const m = new THREE.Mesh(waterGeometry(), mat);
  m.frustumCulled = false;
  return m;
}

/** Give a mesh its own toon material that can screen-door dither itself away (for occluders). */
function makeFadeable(mesh) {
  const mat = voxelMaterial('toon', { unique: true });
  const fade = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = fade;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform float uFade;
${GLSL_BAYER}
void main() {
  if (uFade > 0.01 && bk_bayer4(gl_FragCoord.xy) < uFade) discard;`);
  };
  mesh.material = mat;
  return fade;
}

// ------------------------------------------------------------------ build
export function buildBeach(ctx) {
  const { mole, hen, cage, textures } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8587c);
  scene.fog = new THREE.Fog(0x8a5a80, 45, 160);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  const surfaceCamera = new THREE.PerspectiveCamera(24, 16 / 9, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xffb8a8, 0x5a4a7a, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb070, 2.3);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  scene.add(sun);

  const sky = makeSky();
  scene.add(sky);
  const bed = seabedTexture();
  textures.push(bed.texture);
  const water = makeWater(bed);
  scene.add(water);
  const island = buildIsland();
  scene.add(island.mesh);
  const gy = island.groundY;
  const place = (obj, x, z, yOff = 0) => { obj.position.set(x, gy(x, z) + yOff, z); scene.add(obj); return obj; };

  // ---------------------------------------------------------------- props
  const palmA = makePalm(3, { height: 46, lean: 0.014 });
  const palmB = makePalm(7, { height: 38, lean: 0.01 });
  const palms = [
    [palmA, -3.0, -1.0, 2.2, 1.0], [palmB, 2.9, 0.4, -0.7, 0.92], [palmA.clone(), -4.9, -3.9, 2.9, 0.8], [palmB.clone(), 5.2, -1.4, -0.1, 0.72],
  ];
  const palmObjs = [];
  for (const [p, x, z, ry, sc] of palms) {
    p.rotation.y = ry;
    p.scale.setScalar(sc);
    place(p, x, z, -0.05);
    p.updateMatrixWorld(true);
    const h = p === palmA || p.geometry === palmA.geometry ? 46 : 38;
    const lean = p.geometry === palmA.geometry ? 0.014 : 0.01;
    const top = p.localToWorld(new THREE.Vector3((lean * h * h) / 12, h / 12, 0));
    const base = p.position.clone();
    palmObjs.push({ p, fade: makeFadeable(p), pts: [base, base.clone().lerp(top, 0.5), top] });
    const sh = makeBlobShadow(1.1 * sc, 2.4 * sc, 0.35);
    place(sh, x + 0.2, z + 1.6 * sc, 0.012);
  }
  const umbrella = makeUmbrella();
  umbrella.rotation.set(-0.16, 0.3, 0.05);
  place(umbrella, SPOTS.umbrella.x, SPOTS.umbrella.z, -0.05);
  place(makeBlobShadow(1.3, 1.9, 0.38), SPOTS.umbrella.x + 0.2, SPOTS.umbrella.z + 1.3, 0.014);
  const lounger = makeLounger();
  lounger.rotation.y = 0.12;
  place(lounger, SPOTS.chair.x, SPOTS.chair.z, 0);
  place(makeBlobShadow(0.7, 1.4, 0.4), SPOTS.chair.x + 0.1, SPOTS.chair.z + 0.9, 0.013);
  const towel = makeTowel();
  towel.rotation.y = -0.35;
  place(towel, SPOTS.towel.x, SPOTS.towel.z, 0.005);
  const castle = makeSandcastle(3);
  castle.rotation.y = 0.4;
  place(castle, SPOTS.castle.x, SPOTS.castle.z, -0.03);
  const bucket = makeBucket();
  bucket.rotation.z = 0.25;
  place(bucket, -1.55, -5.1, -0.02);
  const spade = makeSpade();
  spade.rotation.set(0.0, 0.6, 1.2);
  place(spade, -1.95, -4.4, 0.06);
  const ball = makeBeachBall();
  place(ball, 2.9, -1.6, 0);
  const rng = makeRng(17);
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0.55, 0.93);
    const x = Math.cos(a) * RX * d, z = Math.sin(a) * RZ * d;
    const m = i % 3 === 0 ? makeStarfish(i) : makeShell(i);
    m.rotation.y = rng.range(0, 6);
    place(m, x, z, 0);
  }
  for (let i = 0; i < 16; i++) {
    const [px, pz] = [[-3.0, -1.0], [2.9, 0.4], [-4.9, -3.9], [5.2, -1.4]][i % 4];
    const a = rng.range(0, Math.PI * 2), r = rng.range(0.5, 1.6);
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    if (islandD(x, z) > 0.85) continue;
    const t = makeGrassTuft(i);
    t.rotation.y = rng.range(0, 6);
    t.scale.setScalar(rng.range(0.7, 1.0));
    place(t, x, z, -0.02);
  }
  for (const [x, z, s, sc] of [[7.4, 1.8, 3, 1.4], [9.6, -2.2, 5, 1.9], [-8.4, 2.6, 8, 1.2], [-10.5, -4.2, 11, 2.2]]) {
    const r = makeRock(s, { w: 18, h: 12, d: 16, color: 0x8a7a8a, moss: 0.25 });
    r.scale.setScalar(sc);
    r.position.set(x, Math.max(-0.35, gy(x, z) - 0.2), z);
    scene.add(r);
  }
  // the Surface Express terminus: a brass ring in the sand, and a signpost
  const ring = makeTerminusRing();
  place(ring, SPOTS.cage.x, SPOTS.cage.z, 0.0);
  const sign = signTexture(['SURFACE EXPRESS', 'DEEP TOWN 400M'], { bg: 0x6b4226, border2: 0xd6b97f, text: 0xfff0c0 });
  textures.push(sign.texture);
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * (sign.h / sign.w)), new THREE.MeshBasicMaterial({ map: sign.texture }));
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
  const signGroup = new THREE.Group();
  post.position.y = 0.7;
  signMesh.position.set(0, 1.25, 0.05);
  signGroup.add(post, signMesh);
  signGroup.rotation.y = -0.5;
  place(signGroup, SPOTS.cage.x + 1.8, SPOTS.cage.z + 0.7, 0);

  // ---------------------------------------------------------------- clouds, gulls, sparkles
  const clouds = [];
  const cloudDefs = [[-0.55, 7, 46], [-0.2, 12, 34], [0.25, 5.5, 52], [0.6, 15, 30], [1.4, 9, 40], [2.3, 6, 48], [3.0, 13, 36], [3.9, 8, 44], [4.8, 11, 38], [5.6, 6.5, 42]];
  cloudDefs.forEach(([az, el, w], i) => {
    const sunAz = Math.atan2(SUN_DIR.x, -SUN_DIR.z);
    const dAz = Math.abs(Math.atan2(Math.sin(az - sunAz), Math.cos(az - sunAz)));
    const warm = 1 - dAz / Math.PI;
    const pal = warm > 0.6 ? { hi: 0xffe8b8, mid: 0xf8a0a0, lo: 0xc070a0, rim: 0xfff6d8 } : warm > 0.3 ? { hi: 0xffc0c0, mid: 0xd88aa8, lo: 0x8a5a98, rim: 0xffd8d0 } : { hi: 0xd0a0d0, mid: 0x9a78b8, lo: 0x5a4a88, rim: 0xe0c0e8 };
    const cv = cloudCanvas(100 + i, 128, 40, pal);
    const tex = pixelTexture(cv);
    textures.push(tex);
    const s = makeSheetSprite(tex, { cols: 1, size: [w, w * (40 / 128)], anchor: [0.5, 0.5], renderOrder: -50 });
    const dist = 125;
    const elr = THREE.MathUtils.degToRad(el);
    s.position.set(Math.sin(az) * dist, Math.tan(elr) * dist, -Math.cos(az) * dist);
    scene.add(s);
    clouds.push({ s, az, el: elr, dist, speed: 0.004 + (i % 3) * 0.002 });
  });
  const gulls = gullSheet();
  textures.push(gulls.texture);
  const birds = [0, 1, 2].map((i) => {
    const s = makeSheetSprite(gulls.texture, { cols: gulls.cols, size: [1.45, 1.45 / gulls.aspect], anchor: [0.5, 0.5] });
    s.layers.enable(1);
    scene.add(s);
    return { s, r: 8.5 + i * 3.2, h: 4.4 + i * 1.3, w: (i % 2 ? -1 : 1) * (0.2 - i * 0.04), a: i * 2.1, flap: Math.random() * 3, glide: 0 };
  });
  const sparkPts = [];
  for (let i = 0; i < 70; i++) {
    const toSun = i < 40;
    const az = toSun ? Math.atan2(SUN_DIR.x, SUN_DIR.z) + rng.range(-0.25, 0.25) : rng.range(0, Math.PI * 2);
    const r = toSun ? rng.range(9, 45) : rng.range(9, 28);
    sparkPts.push({ pos: [Math.sin(az) * r, 0.06, Math.cos(az) * r], color: toSun ? 0xfff2c0 : 0xffffff, size: 1, big: toSun ? 3 : 1, bigShape: SHAPE.plus, speed: 1.5 + rng.range(0, 2.5), phase: rng.range(0, 30), sharp: 14, base: 0 });
  }
  const sparkles = new Twinkles(sparkPts);
  scene.add(sparkles.points);
  const fx = new Particles({ max: 160, additive: true });
  scene.add(fx.points);
  const splash = new Particles({ max: 120, additive: false });
  scene.add(splash.points);

  // crabs
  const crabs = [0, 1, 2].map((i) => {
    const c = makeCrab(i);
    scene.add(c.root);
    const a = -Math.PI / 2 + (i - 1) * 0.7;
    return { c, a, target: a, mode: 'wait', t: 1 + i, speed: 0.5 + i * 0.12, legT: 0 };
  });
  const shorePoint = (a, d = 0.95) => new THREE.Vector3(Math.cos(a) * RX * d, 0, Math.sin(a) * RZ * d);

  // the coconut drink
  const coconut = makeCoconut();
  coconut.position.set(0, -0.02, 0.02);

  // lounging rig containers
  const lounge = new THREE.Group();
  const lean = new THREE.Group();
  lounge.add(lean);
  scene.add(lounge);

  // ---------------------------------------------------------------- state
  const S = { t: 0, sipT: 4, sip: 0, gullT: 6, henMode: 'sit', henT: 7, henTarget: new THREE.Vector3() };
  const orbitTarget = new THREE.Vector3(0.35, 1.25, -3.0);
  const A0 = 0.3;

  const parkCage = () => {
    scene.add(cage.root);
    cage.root.visible = true;
    cage.lampGlow.visible = false; // daylight: the little lamp's halo would only veil their faces
    if (cage.cable) cage.cable.visible = false;
    cage.root.position.set(SPOTS.cage.x, gy(SPOTS.cage.x, SPOTS.cage.z) - cage.floorY + 0.02, SPOTS.cage.z);
    cage.root.rotation.set(0, CAGE_YAW, 0);
  };
  const surfQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, CAGE_YAW, 0));
  const fwd = new THREE.Vector3(Math.sin(CAGE_YAW), 0, Math.cos(CAGE_YAW));
  const right = new THREE.Vector3(Math.cos(CAGE_YAW), 0, -Math.sin(CAGE_YAW));

  const enterSurface = () => {
    parkCage();
    if (mole.root.parent !== cage.root) cage.root.add(mole.root);
    if (hen.root.parent !== cage.root) cage.root.add(hen.root);
    mole.root.position.set(-0.34, cage.seatY - 2 * mole.s, cage.seatZ + 0.02);
    mole.root.rotation.set(0, 0, 0);
    mole.face(0, true);
    mole.play('sit');
    hen.root.position.set(0.46, cage.seatY, cage.seatZ + 0.06);
    hen.face(0, true);
    hen.play('sit');
    cage.setGate(1);
    ctx.shades.visible = false;
    S.sparkled = false;
    S.whooshed = false;
    S.gated = false;
    S.cluck = false;
    placeSurfaceCam(0);
  };
  const headPos = new THREE.Vector3();
  const placeSurfaceCam = (t) => {
    cage.root.updateMatrixWorld(true);
    mole.neck.getWorldPosition(headPos);
    headPos.y += 0.38;
    const back = 5.6 + Math.max(0, t - 2.0) * 0.35;
    surfaceCamera.position.copy(headPos).addScaledVector(fwd, back).addScaledVector(right, 0.42);
    surfaceCamera.position.y -= 0.12;
    surfaceCamera.quaternion.copy(surfQuat);
  };

  const updateSurface = (dt, api, t) => {
    placeSurfaceCam(t);
    common(dt, api, surfaceCamera);
    mole.update(dt);
    hen.update(dt);
    // squint against the light, paw up to shield the eyes
    const squint = t < 1.55;
    if (squint) {
      for (const e of mole.eyes) e.scale.y = 0.15;
      mole.neck.rotation.x = 0.18;
      mole.armR.rotation.set(-2.5, 0, 0.35);
      mole.armL.rotation.x = -0.5;
    } else {
      mole.armL.rotation.x = -0.5;
      const k = clamp((t - 1.55) / 0.5, 0, 1);
      mole.armR.rotation.set(lerp(-2.5, -0.5, k), 0, lerp(0.35, -0.1, k));
    }
    // the sunglasses drop in
    const sh = ctx.shades;
    if (t > 1.15) {
      sh.visible = true;
      if (!S.whooshed) { S.whooshed = true; api.audio.play('whoosh'); }
      const k = clamp((t - 1.15) / 0.45, 0, 1);
      const bounce = k < 1 ? (1 - k) * (1 - k) * 1.1 : 0;
      sh.position.set(0, (6 + (mole.eyeDrop ? 0 : 1)) * mole.s + bounce + Math.max(0, Math.sin((t - 1.6) * 14) * 0.02 * clamp(2 - t, 0, 1)), 6.6 * mole.s);
    }
    if (t > 1.62 && !S.sparkled) {
      S.sparkled = true;
      api.audio.play('sparkle');
      sh.updateMatrixWorld(true);
      const p = new THREE.Vector3(-3.5 * mole.s, 0.5 * mole.s, 0.6 * mole.s);
      sh.localToWorld(p);
      for (let i = 0; i < 3; i++) fx.spawn({ pos: [p.x + (i - 1) * 0.04, p.y + 0.02 * i, p.z + 0.05], life: 0.7 + i * 0.15, color: 0xffffff, size: 7 - i * 2, size2: 1, shape: SHAPE.plus, fadeIn: 0.05 });
    }
    if (t > 1.9) {
      mole.mouth.visible = true;
      mole.neck.rotation.x = -0.12 + Math.sin(t * 9) * 0.03;
      if (t > 2.15 && t < 3.2) mole.armL.rotation.set(-2.6, 0, 0.5 + Math.sin(t * 14) * 0.25); // a happy wave
    }
    if (t > 2.0 && !S.cluck) { S.cluck = true; hen.flap(1.0); api.audio.play('bawk'); }
    if (t > 0.15 && !S.gated) { S.gated = true; api.audio.play('gate'); }
    cage.setGate(1 - clamp((t - 0.15) / 0.5, 0, 1));
    placeSurfaceCam(t);
  };

  const enterBeach = () => {
    // the Surface Express has gone back down; only its brass hatch remains
    parkCage();
    cage.setGate(0);
    cage.root.visible = false;
    // mole: lounging on the chair, drink in paw
    const cx = SPOTS.chair.x, cz = SPOTS.chair.z;
    lounge.position.set(cx, gy(cx, cz), cz);
    lounge.rotation.set(0, Math.PI + 0.12, 0);
    lean.position.set(0, 0.385, -0.3); // forward enough that the hi-res mole clears the canvas
    lean.rotation.set(-0.5, 0, 0);
    lean.add(mole.root);
    mole.root.position.set(0, -2 * mole.s, 0);
    mole.root.rotation.set(0, 0, 0);
    mole.face(0, true);
    mole.play('sit');
    mole.holdItem(coconut, 'R');
    ctx.shades.visible = true;
    // hen sits on the towel
    scene.add(hen.root);
    const tx = SPOTS.towel.x - 0.25, tz = SPOTS.towel.z + 0.1;
    hen.root.position.set(tx, gy(tx, tz) + 0.01, tz);
    hen.face(Math.PI + 0.4, true);
    hen.play('sit');
    S.henMode = 'sit';
    S.henT = 6;
    S.t = 0;
    placeOrbit(0);
  };

  const placeOrbit = (t) => {
    const a = A0 - t * (Math.PI * 2 / 150);
    const intro = clamp(t / 9, 0, 1);
    const e = 1 - (1 - intro) * (1 - intro);
    const R = lerp(10.5, 8.4, e);
    const H = lerp(2.6, 1.55, e);
    camera.position.set(orbitTarget.x + Math.sin(a) * R, orbitTarget.y + H, orbitTarget.z + Math.cos(a) * R);
    camera.lookAt(orbitTarget);
  };

  // shared per-frame things (water, sky, birds, crabs)
  const tmp = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const common = (dt, api, cam) => {
    S.t += dt;
    const t = S.t;
    water.material.uniforms.uTime.value = t;
    sky.material.uniforms.uTime.value = t;
    cam.updateMatrixWorld();
    sky.position.copy(cam.position);
    sparkles.update(dt);
    fx.update(dt);
    splash.update(dt);
    for (const c of clouds) {
      c.az += c.speed * dt * 0.1;
      c.s.position.set(Math.sin(c.az) * c.dist, Math.tan(c.el) * c.dist, -Math.cos(c.az) * c.dist);
    }
    // gulls wheel around the island
    camRight.setFromMatrixColumn(cam.matrixWorld, 0);
    for (const b of birds) {
      b.a += b.w * dt;
      const x = Math.cos(b.a) * b.r, z = Math.sin(b.a) * b.r * 0.8 - 1.5;
      const y = b.h + Math.sin(t * 0.5 + b.r) * 0.6;
      tmp.set(-Math.sin(b.a) * b.w, 0, Math.cos(b.a) * b.w * 0.8);
      b.s.position.set(x, y, z);
      b.s.userData.sheet.uFlipX.value = tmp.dot(camRight) < 0 ? 1 : 0;
      b.flap -= dt;
      if (b.flap < 0) { b.glide = b.glide > 0 ? 0 : 1; b.flap = b.glide ? 1.5 + Math.random() * 2 : 0.8 + Math.random(); }
      const seq = [0, 1, 2, 1];
      b.s.userData.sheet.uFrame.value = b.glide ? 1 : seq[Math.floor(t * 9 + b.r) % 4];
    }
    // crabs scuttle sideways along the waterline
    for (const cr of crabs) {
      cr.t -= dt;
      const o = cr.c;
      if (cr.mode === 'wait') {
        o.clawL.rotation.z = Math.max(0, Math.sin(t * 7 + cr.a)) * 0.5;
        o.clawR.rotation.z = -Math.max(0, Math.sin(t * 7 + cr.a + 1)) * 0.5;
        if (cr.t < 0) { cr.mode = 'walk'; cr.target = cr.a + (Math.random() - 0.5) * 0.7; }
      } else {
        const d = cr.target - cr.a;
        const step = Math.sign(d) * Math.min(Math.abs(d), (cr.speed / 7) * dt);
        cr.a += step;
        for (let i = 0; i < o.legs.length; i++) o.legs[i].rotation.z = Math.sin(t * 28 + i * 1.7) * 0.5;
        o.clawL.rotation.z = 0.15; o.clawR.rotation.z = -0.15;
        if (Math.abs(d) < 0.01) { cr.mode = 'wait'; cr.t = 1.5 + Math.random() * 3; }
      }
      const p = shorePoint(cr.a, 0.93);
      const p2 = shorePoint(cr.a + 0.01, 0.93);
      o.root.position.set(p.x, gy(p.x, p.z) + 0.005, p.z);
      o.root.rotation.y = Math.atan2(-(p2.z - p.z), p2.x - p.x);
      o.body.position.y = cr.mode === 'walk' ? Math.abs(Math.sin(t * 28)) * 0.012 : 0;
    }
  };

  const seg = (p, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const u = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    return { u, d: Math.hypot(a.x + u * dx - p.x, a.z + u * dz - p.z) };
  };
  const fadeOccluders = (dt) => {
    const cam = camera.position;
    for (const o of palmObjs) {
      let want = 0;
      for (let i = 0; i < 3; i++) {
        const q = o.pts[i];
        const r = seg(q, cam, orbitTarget);
        if (r.u > 0.04 && r.u < 0.92 && r.d < (i === 2 ? 1.9 : 0.9)) want = 1;
      }
      if (Math.hypot(o.pts[2].x - cam.x, o.pts[2].z - cam.z) < 3.0) want = 1;
      o.fade.value += (want - o.fade.value) * Math.min(1, dt * 2.2);
      if (want === 1 && o.fade.value > 0.96) o.fade.value = 1;
      o.p.visible = o.fade.value < 0.97;
      // a dithered occluder shouldn't get pixel outlines around every hole
      if (o.fade.value > 0.05) o.p.layers.disable(1); else o.p.layers.enable(1);
    }
  };

  const updateBeach = (dt, api, t) => {
    placeOrbit(t);
    fadeOccluders(dt);
    common(dt, api, camera);
    // gulls call now and then
    S.gullT -= dt;
    if (S.gullT < 0) { S.gullT = 9 + Math.random() * 12; api.audio.play('seagull'); }
    // the mole lounges, bobs along, sips
    mole.update(dt);
    mole.armL.rotation.set(-3.45, 0, 0.62);
    mole.legL.rotation.x = -0.95 + Math.sin(t * 1.3) * 0.05;
    mole.legR.rotation.x = -0.95 - Math.sin(t * 1.3) * 0.05;
    mole.neck.rotation.z = Math.sin(t * 2.9) * 0.05;
    mole.neck.rotation.x = 0.08;
    S.sipT -= dt;
    if (S.sipT < 0 && S.sip <= 0) { S.sip = 1.8; S.sipT = 6 + Math.random() * 5; }
    let k = 0;
    if (S.sip > 0) {
      S.sip -= dt;
      const u = 1.8 - S.sip;
      k = u < 0.4 ? u / 0.4 : u > 1.4 ? (1.8 - u) / 0.4 : 1;
      if (u > 0.5 && u < 0.5 + dt * 1.5) api.audio.play('slurp');
    }
    mole.armR.rotation.set(lerp(-0.75, -1.95, k), lerp(0, -0.25, k), lerp(-0.15, 0.55, k));
    if (k > 0.9) mole.neck.rotation.x = -0.12;
    // Nugget: naps on the towel, wanders to the water's edge, clucks, comes back
    hen.update(dt);
    S.henT -= dt;
    const hp = hen.root.position;
    if (S.henMode === 'sit') {
      hen.play('sit');
      if (S.henT < 0) {
        S.henMode = 'go';
        const a = -Math.PI / 2 + 0.35 + (Math.random() - 0.5) * 0.5;
        S.henTarget.copy(shorePoint(a, 0.86));
        api.audio.play('cluck', { n: 2 });
      }
    } else if (S.henMode === 'go' || S.henMode === 'back') {
      tmp.subVectors(S.henTarget, hp);
      tmp.y = 0;
      const dist = tmp.length();
      if (dist < 0.06) {
        if (S.henMode === 'go') { S.henMode = 'peck'; S.henT = 3 + Math.random() * 2; hen.play('idle'); }
        else { S.henMode = 'sit'; S.henT = 7 + Math.random() * 7; hen.face(Math.PI + 0.4); }
      } else {
        tmp.normalize();
        hen.play('walk');
        hen.face(Math.atan2(tmp.x, tmp.z));
        hp.x += tmp.x * Math.min(dist, 0.62 * dt);
        hp.z += tmp.z * Math.min(dist, 0.62 * dt);
      }
      hp.y = gy(hp.x, hp.z) + 0.01;
    } else if (S.henMode === 'peck') {
      hen.play('idle');
      if (Math.random() < dt * 1.2) hen.peck();
      if (Math.random() < dt * 0.5) api.audio.play('cluck', { n: 1 + (Math.random() * 3 | 0) });
      const surge = Math.sin(water.material.uniforms.uTime.value * 0.85);
      if (surge > 0.97 && !S.splashed) {
        S.splashed = true;
        hen.flap(0.8);
        for (let i = 0; i < 14; i++) splash.spawn({ pos: [hp.x, hp.y + 0.05, hp.z - 0.15], vel: [(Math.random() - 0.5) * 1.2, 1.2 + Math.random(), -Math.random() * 0.8], life: 0.7, color: 0xffffff, color2: 0xbfe8ff, size: 1, gravity: 5 });
      }
      if (surge < 0.5) S.splashed = false;
      if (S.henT < 0) {
        S.henMode = 'back';
        S.henTarget.set(SPOTS.towel.x - 0.25, 0, SPOTS.towel.z + 0.1);
      }
    }
  };

  // everything that never moves (sand, props, shells, rocks, grass) collapses into a few draws
  for (const o of palmObjs) o.p.userData.dynamic = true;
  for (const c of crabs) c.c.root.userData.dynamic = true;
  lounge.userData.dynamic = true;
  const tb = performance.now();
  const batches = batchStatic(scene);
  console.log(`[ending] beach batched in ${Math.round(performance.now() - tb)} ms (${batches.reduce((n, m) => n + m.userData.batched, 0)} props → ${batches.length} batches)`);

  const onResize = () => { fitFov(camera, 40, 62); fitFov(surfaceCamera, 24, 40); };

  return { scene, camera, surfaceCamera, cameras: [camera, surfaceCamera], enterSurface, updateSurface, enterBeach, updateBeach, onResize, groundY: gy };
}
