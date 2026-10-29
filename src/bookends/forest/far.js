// The far forest: hundreds of distant trees as upright, camera-facing pixel-art silhouettes in one
// instanced draw (spruces, pines, round broadleaf crowns and a dead snag), lit on the sun side,
// and sunk into the forest's fog like everything else. Past the last voxel trees they keep the
// forest going all the way to the hazy horizon.
//   makeFarTrees(items) items: [{x, y, z, h, frame, tint}] → Mesh
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../../gfx/PixelArt.js';
import { makeRng } from '../../core/util.js';
import { fshade, fmix } from '../vox.js';
import { GLSL_BAYER } from '../fx.js';
import { FA, GLSL_FA } from './atmos.js';

const FW = 40, FH = 80, NF = 8;
export const FAR_FRAMES = NF;

function sheet() {
  const pc = new PixelCanvas(FW * NF, FH);
  const rng = makeRng(404);
  const DARK = [0x2a4a34, 0x24402e, 0x30503a, 0x3a5a36, 0x3e5a30, 0x2e4c30, 0x46603a, 0x4a4438];
  for (let f = 0; f < NF; f++) {
    const ox = f * FW;
    const base = DARK[f];
    const lit = fmix(base, 0xf0d890, 0.32), mid = fshade(base, 1.12), deep = fshade(base, 0.78);
    const trunkC = fshade(0x4a3a2c, 0.9);
    if (f < 4) {
      // conifers: spruce (f 0, 1) skirts nearly to the ground, pines (2, 3) high crowns on bare trunks
      const pine = f >= 2;
      const top = 2, bottom = FH - 2;
      const crown0 = pine ? Math.round(FH * 0.45) : Math.round(FH * 0.88);
      for (let y = Math.round(FH * 0.5); y < bottom; y++) pc.set(ox + FW / 2, y, trunkC);
      if (pine) for (let y = crown0; y < bottom; y++) pc.set(ox + FW / 2 + 1, y, fshade(trunkC, 0.8));
      const tiers = pine ? 6 : 9;
      for (let t = 0; t < tiers; t++) {
        const y0 = top + Math.round((crown0 - top) * (t / tiers));
        const y1 = top + Math.round((crown0 - top) * ((t + 1) / tiers)) + 3;
        for (let y = y0; y < y1; y++) {
          const k = (y - top) / (crown0 - top);
          const w = Math.max(1, Math.round((pine ? (0.2 + 0.25 * Math.sin(k * 3.1)) : k * 0.48) * FW * ((y - y0) / (y1 - y0) * 0.6 + 0.4)));
          for (let x = -w; x <= w; x++) {
            if (Math.abs(x) === w && rng() < 0.4) continue;
            const c = x < -w * 0.3 ? lit : y === y1 - 1 ? deep : x > w * 0.5 ? deep : mid;
            pc.set(ox + FW / 2 + x, y, c);
          }
        }
      }
    } else if (f < 7) {
      // broadleaf: a trunk and a lumpy round crown
      const cy = Math.round(FH * (0.32 + (f - 4) * 0.04)), r = FW * (0.42 - (f - 4) * 0.04);
      for (let y = cy; y < FH - 1; y++) for (let x = -1; x <= 1; x++) pc.set(ox + FW / 2 + x, y, x > 0 ? fshade(trunkC, 0.8) : trunkC);
      for (let b = 0; b < 7; b++) {
        const a = (b / 7) * Math.PI * 2, bx = FW / 2 + Math.cos(a) * r * 0.45, by = cy + Math.sin(a) * r * 0.5 - 2;
        const br = r * (0.5 + rng() * 0.15);
        for (let y = -br; y <= br; y++) for (let x = -br; x <= br; x++) {
          if (x * x + y * y > br * br) continue;
          const px = Math.round(bx + x), py = Math.round(by + y);
          const e = (x * x + y * y) / (br * br);
          if (e > 0.8 && rng() < 0.35) continue;
          const c = (y < -br * 0.3 && x < br * 0.2) ? lit : y > br * 0.4 ? deep : mid;
          if (pc.alpha(ox + px, py) > 0 && c === mid) continue;
          pc.set(ox + px, py, c);
        }
      }
    } else {
      // a dead snag
      for (let y = 12; y < FH - 1; y++) pc.set(ox + FW / 2, y, 0x6a5e50);
      for (let i = 0; i < 4; i++) { const y = 18 + i * 9; for (let s = 1; s < 7; s++) pc.set(ox + FW / 2 + (i % 2 ? s : -s), y - s, 0x5a5044); }
    }
  }
  const t = pixelTexture(pc.commit());
  return t;
}

const VERT = /* glsl */`
attribute vec4 iPos;   // x, y, z, height
attribute vec2 iData;  // frame, tint
uniform float uFrames;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
void main() {
  // upright billboard: turns round y to face the camera
  vec3 toCam = cameraPosition - iPos.xyz;
  vec2 f = normalize(toCam.xz + vec2(1e-4));
  vec3 right = vec3(f.y, 0.0, -f.x);
  float h = iPos.w;
  vec3 w = iPos.xyz + right * (position.x * h * 0.5) + vec3(0.0, position.y * h, 0.0);
  vUv = vec2((iData.x + uv.x) / uFrames, uv.y);
  vW = w;
  vTint = iData.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uKey;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
${GLSL_BAYER}
${GLSL_FA}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb * vTint * (0.55 + 0.45 * uKey);
  col = faApply(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

let tex = null;
/** Far trees as one instanced draw. items: [{x, y, z, h, frame, tint}]. */
export function makeFarTrees(items, { key = new THREE.Color(0xffcf90) } = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const n = items.length;
  const pos = new Float32Array(n * 4), dat = new Float32Array(n * 2);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  items.forEach((it, i) => {
    pos[i * 4] = it.x; pos[i * 4 + 1] = it.y; pos[i * 4 + 2] = it.z; pos[i * 4 + 3] = it.h;
    dat[i * 2] = it.frame; dat[i * 2 + 1] = it.tint ?? 1;
    box.expandByPoint(v.set(it.x, it.y, it.z)); box.expandByPoint(v.set(it.x, it.y + it.h, it.z));
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 2));
  g.instanceCount = n;
  box.expandByScalar(8);
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  if (!tex) { tex = sheet(); tex.userData.shared = true; }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uFrames: { value: NF }, uKey: { value: key }, ...FA },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noBatch = true;
  m.frustumCulled = false;
  return m;
}
