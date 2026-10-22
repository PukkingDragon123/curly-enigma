// The burrows' 3D props: the shared material (lit like the rock and the cave props: the helmet lamp,
// the cave's lights, fog), the model cache (PGrid builders in ./models.js and ./models2.js, meshed
// with the cave props' greedy mesher), merging placed models into one static mesh per burrow, single
// meshes for the moving bits, and a 3×5 pixel font for the hand-painted signs.
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { LIGHT } from '../TerrainMaterial.js';
import { meshProp, rng32 } from '../props/grid.js';

// ---------------------------------------------------------------- material
/** One material for all the burrows' props: vertex colours + glow, gentle sway for hanging things. */
export function traderMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, texel: { value: 128 } },
    vertexShader: /* glsl */`
      attribute vec4 aNrm; // normal + sway weight (bytes)
      attribute vec4 aCol; // sRGB colour + glow (bytes)
      attribute vec3 aAnim; // sway (m), phase, bob (m)
      uniform float time;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vGlow;
      varying float vPh;
      varying vec3 vTex;
      void main() {
        vec3 p = position;
        vTex = position - aNrm.xyz * (0.5 / 128.0);
        float ph = aAnim.y, sw = aAnim.x * aNrm.w;
        p.x += sw * (sin(time * 1.3 + ph) * 0.7 + sin(time * 3.1 + ph * 1.7) * 0.3);
        p.z += sw * (cos(time * 1.1 + ph * 1.3) * 0.7 + sin(time * 2.6 + ph * 0.7) * 0.3);
        p.y += aAnim.z * sin(time * 1.2 + ph);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * aNrm.xyz);
        vColor = pow(aCol.rgb, vec3(2.2));
        vGlow = aCol.a * 1.2;
        vPh = ph;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      uniform float texel;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vGlow;
      varying float vPh;
      varying vec3 vTex;
      float h3o(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      ${LIGHT}
      void main() {
        vec3 L = lightAt(vWorld, normalize(vN));
        vec3 c = vColor;
        vec3 q = floor(vTex * texel);
        c *= 0.86 + 0.2 * h3o(q + 3.1) + 0.08 * h3o(floor(q * 0.25) + 5.3);
        float pulse = 0.85 + 0.15 * sin(time * 2.3 + vPh * 3.0);
        vec3 col = c * L + c * vGlow * pulse;
        float dist = length(vWorld - lampPos);
        float fogK = (1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2)) * (1.0 - 0.35 * min(vGlow, 1.0));
        gl_FragColor = vec4(mix(col, fogCol, fogK), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- models
const BUILDERS = {};
/** Register model builders: { type(r, v, p) → { grid, pivot, s?, sway?, light?, ... } }. */
export function addModels(map) { Object.assign(BUILDERS, map); }
export const hasModel = (type) => !!BUILDERS[type];

const cache = new Map();
/** Meshed model (cached by type, variant, param). s = voxels per metre (16 or 32). */
export function getModel(type, v = 0, p = 0) {
  const key = type + ':' + v + ':' + p;
  let m = cache.get(key);
  if (m) return m;
  const b = BUILDERS[type];
  if (!b) return null;
  const r = rng32(((v + 1) * 7919) ^ hashStr(type + ':' + p));
  const o = b(r, v, p);
  const s = o.s || 32;
  const mv = meshProp(o.grid, { pivot: o.pivot, sway: o.sway, ao: o.ao ?? true, scale: 1 / s });
  const n = mv.nv;
  const nrm4 = new Int8Array(n * 4), col4 = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    nrm4[i * 4] = mv.nor[i * 3]; nrm4[i * 4 + 1] = mv.nor[i * 3 + 1]; nrm4[i * 4 + 2] = mv.nor[i * 3 + 2]; nrm4[i * 4 + 3] = Math.round(mv.sw[i] * 127);
    col4[i * 4] = mv.col[i * 3]; col4[i * 4 + 1] = mv.col[i * 3 + 1]; col4[i * 4 + 2] = mv.col[i * 3 + 2]; col4[i * 4 + 3] = Math.round(Math.min(1, mv.glw[i] / 1.2) * 255);
  }
  m = { type, v, p, pos: mv.pos, nrm4, col4, idx: mv.idx, nv: n, ni: mv.ni, min: mv.min, max: mv.max, light: o.light || null, swayAmt: o.swayAmt || 0, info: o.info || null, parts: o.parts || null };
  cache.set(key, m);
  return m;
}

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3();
/**
 * Merge placed models into one geometry. items: [{ model, matrix (THREE.Matrix4), sway, phase }].
 * Positions are baked in world space (the mesh sits at the origin).
 */
export function mergeModels(items) {
  let nv = 0, ni = 0;
  for (const it of items) { nv += it.model.nv; ni += it.model.ni; }
  const pos = new Float32Array(nv * 3), nrm = new Int8Array(nv * 4), col = new Uint8Array(nv * 4), anim = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const it of items) {
    const M = it.model, mat = it.matrix;
    _n.getNormalMatrix(mat);
    const e = mat.elements;
    for (let i = 0; i < M.nv; i++) {
      const x = M.pos[i * 3], y = M.pos[i * 3 + 1], z = M.pos[i * 3 + 2];
      const o = (vo + i) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      _v.set(M.nrm4[i * 4], M.nrm4[i * 4 + 1], M.nrm4[i * 4 + 2]).applyMatrix3(_n).normalize();
      const o4 = (vo + i) * 4;
      nrm[o4] = Math.round(_v.x * 127); nrm[o4 + 1] = Math.round(_v.y * 127); nrm[o4 + 2] = Math.round(_v.z * 127); nrm[o4 + 3] = M.nrm4[i * 4 + 3];
      col[o4] = M.col4[i * 4]; col[o4 + 1] = M.col4[i * 4 + 1]; col[o4 + 2] = M.col4[i * 4 + 2]; col[o4 + 3] = M.col4[i * 4 + 3];
      anim[o] = it.sway || 0; anim[o + 1] = it.phase || 0; anim[o + 2] = it.bob || 0;
    }
    for (let i = 0; i < M.ni; i++) idx[io + i] = M.idx[i] + vo;
    vo += M.nv; io += M.ni;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 4, true));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
  g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** One model as its own mesh (local space, for things that move). */
export function modelMesh(model, mat, o = {}) {
  const g = mergeModels([{ model, matrix: _m.identity(), sway: o.sway || 0, phase: o.phase || 0 }]);
  const mesh = new THREE.Mesh(g, mat);
  if (o.outline !== false) mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}

export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------------------------------------------------------- pixel font (3×5, rows top → bottom)
const GLYPHS = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'], ' ': ['000', '000', '000', '000', '000'],
  '!': ['010', '010', '010', '000', '010'], '?': ['110', '001', '010', '000', '010'], '.': ['000', '000', '000', '000', '010'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'], '-': ['000', '000', '111', '000', '000'], "'": ['010', '010', '000', '000', '000'],
  '&': ['010', '101', '010', '101', '011'], '$': ['011', '110', '010', '011', '110'],
};
/** Width in pixels of a text line (3 per glyph + 1 between). */
export const textWidth = (s) => Math.max(0, s.length * 4 - 1);
/**
 * Paint text into a PGrid on the plane z = zf, starting at (x0, yTop) (y grows up, rows go down).
 * col: colour or fn(x, y) → colour; jitter: hand-painted wobble (a pixel up/down per letter).
 */
export function paintText(g, s, x0, yTop, zf, col, o = {}) {
  let x = x0;
  for (let i = 0; i < s.length; i++) {
    const gl = GLYPHS[s[i].toUpperCase()] || GLYPHS['?'];
    const dy = o.jitter ? ((i * 7 + 3) % 5 === 0 ? 1 : (i * 5 + 1) % 7 === 0 ? -1 : 0) : 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (gl[r][c] !== '1') continue;
      const px = x + c, py = yTop - r + dy;
      g.set(px, py, zf, typeof col === 'function' ? col(px, py) : col, o.glow || 0);
      if (o.depth) for (let k = 1; k < o.depth; k++) g.set(px, py, zf + k, typeof col === 'function' ? col(px, py) : col, o.glow || 0);
    }
    x += 4;
  }
  return x;
}
