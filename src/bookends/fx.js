// Shared visual effects for the title & ending scenes: pixel particles, dithered glows,
// billboard sprite sheets and light beams. Everything is drawn so it stays crisp at the
// engine's low internal resolution (integer point sizes, screen-space ordered dithering).
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeRng, makeNoise2D, mixHex, clamp } from '../core/util.js';

// 4x4 ordered dither in GLSL (0..1), keyed on screen pixels.
export const GLSL_BAYER = /* glsl */`
float bk_bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bk_bayer4(vec2 a) { return bk_bayer2(0.5 * a) * 0.25 + bk_bayer2(a); }
float bk_steps(float v, float levels) { return floor(v * levels + bk_bayer4(gl_FragCoord.xy)) / levels; }
`;

const tmpColor = new THREE.Color();

// ------------------------------------------------------------------ particles
// Particle sizes are given in "design pixels" (tuned for ~400 internal lines). PIX scales them
// with the engine's real internal resolution so effects keep their weight at 540-720 lines.
export const PIX = { value: 1 };
/** Call from onResize with the engine's internal height. */
export function setPixelScale(heightPx) { PIX.value = Math.max(1, heightPx / 400); }

const P_VERT = /* glsl */`
attribute vec4 aColor;
attribute float aSize;
attribute float aShape;
attribute float aSpin;
uniform float uAtten;
uniform float uScale;
uniform float uPix;
varying vec4 vColor;
varying float vShape;
varying float vSpin;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = aSize * uPix;
  vColor = aColor;
  if (uAtten > 0.5) {
    // world-sized: grows as it nears the camera, but never into a screen-filling blob
    sz = min(aSize * uScale / max(0.1, -mv.z), 28.0 * uPix);
    vColor.a *= smoothstep(0.25, 0.6, -mv.z);
  }
  gl_PointSize = max(1.0, floor(sz + 0.5));
  vShape = aShape;
  vSpin = aSpin;
}
`;
const P_FRAG = /* glsl */`
varying vec4 vColor;
varying float vShape;
varying float vSpin;
void main() {
  if (vColor.a < 0.004) discard;
  vec2 p = gl_PointCoord - 0.5;
  if (vShape > 0.5 && vShape < 1.5) {            // plus / sparkle
    if (abs(p.x) > 0.17 && abs(p.y) > 0.17) discard;
  } else if (vShape > 1.5 && vShape < 2.5) {     // confetti strip, flips as it spins
    float w = max(0.17, abs(cos(vSpin))) * 0.5;
    if (abs(p.x) > w) discard;
  } else if (vShape > 2.5 && vShape < 3.5) {     // round
    if (length(p) > 0.5) discard;
  } else if (vShape > 3.5) {                     // diamond
    if (abs(p.x) + abs(p.y) > 0.55) discard;
  }
  gl_FragColor = vColor;
}
`;

export const SHAPE = { square: 0, plus: 1, confetti: 2, round: 3, diamond: 4 };

/**
 * A pool of simple CPU-simulated particles rendered as crisp GL points.
 * spawn({pos:[x,y,z], vel:[x,y,z], life, color, color2, size, size2, shape, gravity, drag, spin, flicker, fadeIn})
 */
export class Particles {
  constructor({ max = 256, additive = true, atten = false, renderOrder = 5 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.c1 = new Float32Array(max * 3);
    this.c2 = new Float32Array(max * 3);
    this.s1 = new Float32Array(max);
    this.s2 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spinV = new Float32Array(max);
    this.flick = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    this.wob = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', mk(this.pos, 3));
    g.setAttribute('aColor', mk(this.col, 4));
    g.setAttribute('aSize', mk(this.size, 1));
    g.setAttribute('aShape', mk(this.shape, 1));
    g.setAttribute('aSpin', mk(this.spin, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAtten: { value: atten ? 1 : 0 }, uScale: { value: 300 }, uPix: PIX },
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.t = 0;
  }

  /** For attenuated (world-size) particles: pixels per world unit at distance 1. */
  setScaleFromCamera(camera, heightPx) {
    if (camera.isPerspectiveCamera) this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  spawn(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = o.pos || [0, 0, 0];
    const v = o.vel || [0, 0, 0];
    this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = p[1]; this.pos[i * 3 + 2] = p[2];
    this.vel[i * 3] = v[0]; this.vel[i * 3 + 1] = v[1]; this.vel[i * 3 + 2] = v[2];
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 1;
    tmpColor.set(o.color ?? 0xffffff);
    this.c1[i * 3] = tmpColor.r; this.c1[i * 3 + 1] = tmpColor.g; this.c1[i * 3 + 2] = tmpColor.b;
    tmpColor.set(o.color2 ?? o.color ?? 0xffffff);
    this.c2[i * 3] = tmpColor.r; this.c2[i * 3 + 1] = tmpColor.g; this.c2[i * 3 + 2] = tmpColor.b;
    this.s1[i] = o.size ?? 1;
    this.s2[i] = o.size2 ?? o.size ?? 1;
    this.shape[i] = o.shape ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.spin[i] = Math.random() * 6.28;
    this.spinV[i] = o.spin ?? 0;
    this.flick[i] = o.flicker ?? 0;
    this.alpha[i] = o.alpha ?? 1;
    this.fadeIn[i] = o.fadeIn ?? 0.08;
    this.wob[i] = o.wobble ?? 0;
    return i;
  }

  update(dt) {
    this.t += dt;
    const n = this.max;
    for (let i = 0; i < n; i++) {
      const ml = this.maxLife[i];
      if (ml <= 0) { this.col[i * 4 + 3] = 0; continue; }
      let l = this.life[i] + dt;
      this.life[i] = l;
      if (l >= ml) { this.maxLife[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const k = l / ml;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      const dr = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      let wx = 0;
      if (this.wob[i]) wx = Math.sin(this.t * 3 + i * 1.7) * this.wob[i];
      this.pos[i3] += (this.vel[i3] + wx) * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.spin[i] += this.spinV[i] * dt;
      let a = this.alpha[i];
      const fi = this.fadeIn[i];
      if (fi > 0 && l < fi) a *= l / fi;
      if (k > 0.65) a *= 1 - (k - 0.65) / 0.35;
      if (this.flick[i]) a *= 1 - this.flick[i] * (0.5 + 0.5 * Math.sin(this.t * 17 + i * 3.1));
      const i4 = i * 4;
      this.col[i4] = this.c1[i3] + (this.c2[i3] - this.c1[i3]) * k;
      this.col[i4 + 1] = this.c1[i3 + 1] + (this.c2[i3 + 1] - this.c1[i3 + 1]) * k;
      this.col[i4 + 2] = this.c1[i3 + 2] + (this.c2[i3 + 2] - this.c1[i3 + 2]) * k;
      this.col[i4 + 3] = a;
      this.size[i] = this.s1[i] + (this.s2[i] - this.s1[i]) * k;
    }
    const g = this.geo.attributes;
    g.position.needsUpdate = true;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
    g.aSpin.needsUpdate = true;
    g.aShape.needsUpdate = true;
  }

  /** Move every live particle (e.g. to keep them relative to a moving camera). */
  shift(dx, dy, dz) {
    for (let i = 0; i < this.max; i++) {
      if (this.maxLife[i] <= 0) continue;
      this.pos[i * 3] += dx; this.pos[i * 3 + 1] += dy; this.pos[i * 3 + 2] += dz;
    }
  }

  clear() { this.maxLife.fill(0); this.col.fill(0); }
}

/**
 * Static "twinkle" points: fixed positions whose brightness pulses (sparkles, motes, stars).
 * pts: [{pos, color, size, shape, speed, phase, amp}]
 */
export class Twinkles {
  constructor(pts, { additive = true, atten = false } = {}) {
    this.pts = pts;
    this.ps = new Particles({ max: Math.max(1, pts.length), additive, atten });
    for (const p of pts) {
      this.ps.spawn({ pos: p.pos, color: p.color, size: p.size ?? 1, shape: p.shape ?? 0, life: 1e9, fadeIn: 0 });
    }
    this.points = this.ps.points;
    this.t = Math.random() * 10;
  }
  update(dt, gain = 1) {
    this.t += dt;
    const ps = this.ps;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const w = Math.sin(this.t * (p.speed ?? 2) + (p.phase ?? i * 1.31));
      const k = Math.max(0, w);
      const peak = Math.pow(k, p.sharp ?? 6);
      ps.col[i * 4 + 3] = clamp(((p.base ?? 0) + peak * (p.amp ?? 1)) * gain, 0, 1);
      if (p.big) ps.size[i] = peak > 0.55 ? p.big : (p.size ?? 1);
      if (p.bigShape !== undefined) ps.shape[i] = peak > 0.55 ? p.bigShape : (p.shape ?? 0);
    }
    const g = ps.geo.attributes;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
    g.aShape.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ billboards
const BB_VERT = /* glsl */`
uniform vec2 uSize;
uniform vec2 uAnchor;
uniform float uFlipX;
varying vec2 vUv;
void main() {
  vUv = uv;
  if (uFlipX > 0.5) vUv.x = 1.0 - vUv.x;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float sx = length(modelMatrix[0].xyz);
  float sy = length(modelMatrix[1].xyz);
  mv.xy += (uv - uAnchor) * uSize * vec2(sx, sy);
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
uniform float uLevels;
varying vec2 vUv;
${GLSL_BAYER}
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float i = pow(clamp(1.0 - d, 0.0, 1.0), uFalloff) * uIntensity;
  float q = bk_steps(i, uLevels);
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor * q, 1.0);
}
`;

const quadGeo = new THREE.PlaneGeometry(1, 1);
quadGeo.userData.shared = true;

/** A camera-facing, ordered-dithered additive glow (pixel-art light halo). */
export function makeGlow({ color = 0xffa040, size = 1, intensity = 0.8, falloff = 1.6, levels = 4, renderOrder = 6 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(size, size) },
      uAnchor: { value: new THREE.Vector2(0.5, 0.5) },
      uFlipX: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uFalloff: { value: falloff },
      uLevels: { value: levels },
    },
    vertexShader: BB_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(quadGeo, mat);
  m.frustumCulled = false;
  m.renderOrder = renderOrder;
  m.userData.glow = mat.uniforms;
  return m;
}

const SHEET_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uFrame;
uniform float uCols;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uAdd;
varying vec2 vUv;
${GLSL_BAYER}
void main() {
  vec2 uv = vec2((floor(uFrame) + vUv.x) / uCols, vUv.y);
  vec4 c = texture2D(uMap, uv);
  if (c.a < 0.5) discard;
  if (uOpacity < 0.999 && bk_bayer4(gl_FragCoord.xy) > uOpacity) discard;
  gl_FragColor = vec4(c.rgb * uTint, 1.0);
}
`;

/**
 * A camera-facing sprite from a horizontal sprite sheet (frames side by side), alpha-tested
 * so it writes depth and can sit on the outline layer. anchor [0.5, 0] = bottom centre.
 */
export function makeSheetSprite(texture, { cols = 1, size = [1, 1], anchor = [0.5, 0.5], tint = 0xffffff, additive = false, renderOrder = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uFrame: { value: 0 },
      uCols: { value: cols },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uAnchor: { value: new THREE.Vector2(anchor[0], anchor[1]) },
      uFlipX: { value: 0 },
      uTint: { value: new THREE.Color(tint) },
      uOpacity: { value: 1 },
      uAdd: { value: 0 },
    },
    vertexShader: BB_VERT,
    fragmentShader: SHEET_FRAG,
    transparent: additive,
    depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const m = new THREE.Mesh(quadGeo, mat);
  m.frustumCulled = false;
  m.renderOrder = renderOrder;
  m.userData.sheet = mat.uniforms;
  return m;
}

// ------------------------------------------------------------------ light beam
const BEAM_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uLevels;
varying vec2 vUv;
${GLSL_BAYER}
void main() {
  float x = abs(vUv.x * 2.0 - 1.0);
  float core = pow(1.0 - x, 1.4);
  float v = vUv.y; // 1 = top (source), 0 = bottom
  float along = smoothstep(0.0, 0.18, v) * (0.55 + 0.45 * smoothstep(0.0, 1.0, v));
  float shimmer = 0.82 + 0.18 * sin(v * 23.0 - uTime * 1.7 + sin(vUv.x * 9.0 + uTime) * 1.5);
  float i = core * along * shimmer * uIntensity;
  float q = bk_steps(i, uLevels);
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor * q, 1.0);
}
`;

/**
 * A slanted beam of light from `top` to `bottom` (Vector3s), `width` wide, facing roughly
 * toward `facing` (a world position, usually the camera).
 */
export function makeBeam(top, bottom, width, facing, { color = 0xffd27a, intensity = 0.6, levels = 5 } = {}) {
  const axis = new THREE.Vector3().subVectors(top, bottom);
  const len = axis.length();
  axis.normalize();
  const mid = new THREE.Vector3().addVectors(top, bottom).multiplyScalar(0.5);
  const toCam = new THREE.Vector3().subVectors(facing, mid);
  const side = new THREE.Vector3().crossVectors(axis, toCam).normalize();
  const normal = new THREE.Vector3().crossVectors(side, axis).normalize();
  const geo = new THREE.PlaneGeometry(width, len);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 }, uLevels: { value: levels } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  const basis = new THREE.Matrix4().makeBasis(side, axis, normal);
  m.quaternion.setFromRotationMatrix(basis);
  m.position.copy(mid);
  m.renderOrder = 7;
  m.userData.beam = mat.uniforms;
  m.userData.axis = axis;
  m.userData.len = len;
  return m;
}

/** A flat dithered light pool lying on the ground (XZ plane). */
export function makeLightPool({ color = 0xffd27a, rx = 0.6, rz = 0.35, intensity = 0.6, levels = 4 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uFalloff: { value: 1.2 }, uLevels: { value: levels } },
    vertexShader: BEAM_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  m.userData.glow = mat.uniforms;
  return m;
}

/** A soft, dithered dark blob shadow on the ground. */
export function makeBlobShadow(rx = 0.5, rz = 0.35, strength = 0.45) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: strength } },
    vertexShader: BEAM_VERT,
    fragmentShader: /* glsl */`
      uniform float uStrength;
      varying vec2 vUv;
      ${GLSL_BAYER}
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float i = clamp(1.0 - d, 0.0, 1.0);
        i = pow(i, 0.6) * uStrength;
        if (bk_bayer4(gl_FragCoord.xy) > i * 1.6) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, i);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

// ------------------------------------------------------------------ pixel textures
const FLAME_PAL = [0xfffbe0, 0xffe066, 0xffa62a, 0xf0601a, 0xb8301a];

/**
 * Animated flame sprite sheet (frames side by side). Returns {texture, cols}.
 * pal: 5 colours from the white-hot core to the dark red rim.
 */
export function flameSheet(frames = 8, w = 18, h = 26, seed = 3, pal = FLAME_PAL) {
  const pc = new PixelCanvas(w * frames, h);
  const noise = makeNoise2D(seed);
  for (let f = 0; f < frames; f++) {
    const ph = (f / frames) * Math.PI * 2;
    for (let y = 0; y < h; y++) {
      const fy = (h - 1 - y) / (h - 1); // 0 at bottom, 1 at top
      const width = (w * 0.46) * Math.pow(1 - fy, 0.75) * (0.85 + 0.15 * Math.sin(ph + fy * 5));
      const sway = Math.sin(ph + fy * 4.2) * fy * 2.2 + noise(fy * 3, f * 0.7) * fy * 2.5;
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x + 0.5 - w / 2 - sway);
        const n = noise(x * 0.35 * 18 / w, (y * 0.28 + f * 1.3 * h / 26) * 26 / h) * 0.55;
        let i = width > 0 ? (width - dx) / Math.max(1, width) : -1;
        i += n * (0.4 + fy);
        i -= fy * 0.25;
        if (i <= 0.05) continue;
        const c = i > 0.78 ? pal[0] : i > 0.55 ? pal[1] : i > 0.33 ? pal[2] : i > 0.16 ? pal[3] : pal[4];
        pc.set(f * w + x, y, c);
      }
    }
    // detached licks near the top
    const rng = makeRng(seed * 31 + f);
    const sc = h / 26;
    for (let k = 0; k < 2 + Math.round(sc); k++) {
      const x = f * w + Math.round(w / 2 + rng.range(-4, 4) * w / 18);
      const y = rng.int(1, Math.round(6 * sc));
      const sz = Math.max(1, Math.round(sc * rng.range(0.6, 1.4)));
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) pc.set(x + dx, y + dy, rng.chance(0.5) ? pal[2] : pal[3]);
      if (rng.chance(0.5)) pc.set(x, y + sz, pal[3]);
    }
  }
  return { texture: pixelTexture(pc.commit()), cols: frames };
}

/** A puffy pixel-art cloud lit by a low sun. */
export function cloudCanvas(seed, w = 64, h = 22, pal = { hi: 0xffe2c0, mid: 0xf2a0a8, lo: 0xb07aa8, rim: 0xfff4dc }) {
  const pc = new PixelCanvas(w, h);
  const rng = makeRng(seed);
  const blobs = [];
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = rng.range(h * 0.28, h * 0.48) * (1 - Math.abs(t - 0.5) * 0.8);
    blobs.push([w * 0.12 + t * w * 0.76 + rng.range(-3, 3), h - r - rng.range(0, 3), r]);
  }
  const inside = (x, y) => blobs.some(([bx, by, r]) => (x - bx) ** 2 + ((y - by) * 1.15) ** 2 <= r * r) && y < h - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const above = inside(x + 0.5, y - 1.5);
      const below = inside(x + 0.5, y + 2.5);
      let c = pal.mid;
      if (!above) c = pal.hi;
      if (!below || y > h - 4) c = pal.lo;
      if (!inside(x + 0.5, y - 0.5)) c = pal.rim;
      pc.set(x, y, c);
    }
  }
  return pc.commit();
}

/**
 * A three-frame seagull flap (wings up, gliding, wings down) at 33x14 per frame: white head and
 * body, pale grey wings with a lit leading edge, black wingtips, a yellow beak with a red spot.
 */
export function gullSheet() {
  const w = 33, h = 14;
  const WHITE = 0xfff6ee, GREY = 0xc8c0d0, GREY_DK = 0x9890a8, TIP = 0x2a2028, LINE = 0x3a2a3a;
  // wing polylines from the shoulder out: [shoulder, elbow, tip] (left wing; the right mirrors)
  const poses = [
    [[13, 8], [8, 4], [1, 2]],
    [[13, 7.5], [7, 6.5], [0, 8]],
    [[13, 8], [8, 10], [2, 13]],
  ];
  const pc = new PixelCanvas(w * poses.length, h);
  poses.forEach((pose, f) => {
    const fr = new PixelCanvas(w, h);
    for (const side of [-1, 1]) {
      const P = pose.map(([x, y]) => [side < 0 ? x : w - 1 - x, y]);
      // inner arm: two rows (lit top, grey under); outer hand tapers to a black tip
      for (let seg = 0; seg < 2; seg++) {
        const [x0, y0] = P[seg], [x1, y1] = P[seg + 1];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
          const tip = seg === 1 && t > 0.62;
          const thick = seg === 0 ? 2 : t < 0.5 ? 2 : 1;
          fr.set(x, y, tip ? TIP : WHITE);
          if (thick > 1) fr.set(x, y + 1, tip ? TIP : seg === 0 ? GREY : GREY_DK);
          if (seg === 0) fr.set(x, y + 2, GREY_DK);
        }
      }
    }
    // body, head, beak, eyes
    fr.ellipse(16, 9, 3.6, 2.2, WHITE);
    fr.rect(13, 10, 7, 1, GREY);
    fr.disk(16, 6, 2.2, WHITE);
    fr.set(15, 5, LINE); fr.set(17, 5, LINE);
    fr.set(16, 7, 0xffc040); fr.set(16, 8, 0xffa020); fr.set(17, 8, 0xe04030);
    fr.set(14, 12, GREY_DK); fr.set(18, 12, GREY_DK); // tail feathers
    fr.outline(LINE);
    pc.blit(fr, f * w, 0);
  });
  return { texture: pixelTexture(pc.commit()), cols: poses.length, aspect: w / h };
}

/** Small 'z' for a dozing creature. */
export function zzzTexture() {
  const pc = new PixelCanvas(5, 5);
  const rows = ['oooo.', '..o..', '.o...', 'oooo.', '.....'];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'o') pc.set(x, y, 0xe8f0ff); });
  return pixelTexture(pc.commit());
}

/** Linear blend of two hex colours (re-exported for convenience). */
export { mixHex };

/** Dispose every texture in a list. */
export function disposeTextures(list) {
  for (const t of list) { try { t.dispose(); } catch (e) { /* noop */ } }
  list.length = 0;
}

/** Widen a perspective camera's vertical FOV on narrow screens so it keeps at least minHFov (degrees) across. */
export function fitFov(camera, baseFov, minHFov) {
  const a = camera.aspect || 1;
  const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(minHFov) / 2) / a);
  camera.fov = Math.max(baseFov, THREE.MathUtils.radToDeg(need));
  camera.updateProjectionMatrix();
}
