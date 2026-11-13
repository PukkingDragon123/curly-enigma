// The title's swaying foliage: the grass carpet, ferns, clover, flowers and moss on the floor, and
// the vines, roots and moss curtains hanging off the roof and round its sunlit openings. Every
// plant is one of the mine's voxel models (src/deep/veg/plants.js, 1/48–1/64 m voxels; past a few
// metres from every camera its half-resolution copy) packed into a handful of boxes, and every box
// of every plant is one instance of the mine's 7-vertex box fan (src/deep/veg/material.js
// boxTemplate): ONE draw call for all of it. The vertex shader culls boxes off screen, thins
// small plants out with distance, sways everything in the cave's draught (gusts rolling through
// the grass) and pushes it aside where the mole and the raptor run through; the fragment shader
// lights each face like the cave's toon materials (the same hemisphere, key and glowcap lights),
// adds the sun pouring down the shafts (titleCaveFx.js caSun) and the cave's dithered fog and mist.
//
//   const V = makeTitleVeg({ lite });
//   V.add(name, x, y, z, { yaw, variant, lod, div, rank, sway, push, tint, glow, cut });  (stage a plant)
//   const mesh = V.build();  group.add(mesh)
//   V.update(dt, camera, scene, pushers)   pushers: [{ x, y, z, r, k }] (≤ 4)
//   V.stats  { plants, boxes }   V.dispose()
import * as THREE from 'three';
import { MODELS } from '../deep/veg/plants.js';
import { boxify, down2 } from '../deep/veg/vox.js';
import { rng as vrng } from '../deep/veg/paint.js';
import { boxTemplate } from '../deep/veg/material.js';
import { GLSL_BAYER } from './fx.js';
import { CF, GLSL_SUN } from './titleCaveFx.js';

const PUSH = 4;
const _tv = new THREE.Vector3();
const NL = 4; // glowcap point lights the foliage takes

/** A plant model's boxes (and its half-resolution copy), built once per name and variant. */
const PROTO = new Map();
function proto(name, v) {
  const key = name + '|' + v;
  let p = PROTO.get(key);
  if (!p) {
    let h = 9001 + v * 7919;
    for (let k = 0; k < name.length; k++) h = Math.imul(h ^ name.charCodeAt(k), 16777619);
    const m = MODELS[name](vrng(h));
    p = boxify(m.g, m.pivot, m.mode);
    p.lod = boxify(down2(m.g), m.pivot.map((q) => Math.round(q / 2)), m.mode);
    PROTO.set(key, p);
  }
  return p;
}
/** The rough size of a plant model at its default voxel (m): { h, rad }. */
export function plantSize(name, div = 56) { const p = proto(name, 0); return { h: p.H / div, rad: p.rad / div }; }

const VERT = /* glsl */`
attribute vec3 corner;
attribute vec3 iRoot;
attribute vec4 iOff;
attribute vec4 iShape;
attribute vec4 iCol;
attribute vec4 iSway;
attribute vec4 iMisc;
uniform float uTime;
uniform vec4 uWind;
uniform vec4 uPush[${PUSH}];
uniform vec3 uLod;
varying vec3 vWorld;
varying vec3 vCol;
varying float vGlow;
void main() {
  float dist = length(iRoot - cameraPosition);
  float far = clamp((dist - uLod.x) / (uLod.y - uLod.x), 0.0, 1.0);
  float keep = clamp((iMisc.y - far) * 6.0, 0.0, 1.0) * (1.0 - smoothstep(uLod.z - 1.5, uLod.z, dist));
  if (keep <= 0.0 || iShape.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float vox = keep / iShape.w;
  float a = iMisc.x * 6.2831853, ca = cos(a), sa = sin(a);
  vec3 lc = iOff.xyz + iShape.xyz * 0.5;
  // off screen (with room for the sway): nothing to draw
  vec3 wc = iRoot + vec3(ca * lc.x + sa * lc.z, lc.y, -sa * lc.x + ca * lc.z) * vox;
  vec3 vr = (viewMatrix * vec4(wc, 1.0)).xyz;
  float br = 0.5 * length(iShape.xyz) * vox + 0.5, p0 = projectionMatrix[0][0], p1 = projectionMatrix[1][1];
  if (vr.z > br || abs(vr.x) * p0 + vr.z > br * sqrt(1.0 + p0 * p0) || abs(vr.y) * p1 + vr.z > br * sqrt(1.0 + p1 * p1)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // the corner of the box that faces the eye, and the hexagon round it
  vec3 e = (cameraPosition - iRoot) / vox;
  vec3 le = vec3(ca * e.x - sa * e.z, e.y, sa * e.x + ca * e.z) - lc;
  vec3 sg = step(0.0, le);
  vec3 q = iOff.xyz + mix(1.0 - corner, corner, sg) * iShape.xyz;
  vec3 p = iRoot + vec3(ca * q.x + sa * q.z, q.y, -sa * q.x + ca * q.z) * vox;
  float cy = mix(1.0 - corner.y, corner.y, sg.y);
  float bend = mix(iSway.x, iSway.y, cy);
  float amp = iSway.z * 0.25;
  // the draught: a slow lean along uWind with gusts rolling across the floor, each plant's own flutter
  float gust = 0.5 + 0.5 * sin(iMisc.w * 6.2832 + dot(iRoot.xz, uWind.xy) * 0.55 - uTime * uWind.w);
  gust *= gust;
  float fp = iMisc.z * 6.2832;
  vec2 wv = uWind.xy * uWind.z * (0.25 + 1.0 * gust) + vec2(sin(uTime * 1.9 + fp), cos(uTime * 1.55 + fp * 1.37)) * 0.3;
  vec3 disp = vec3(wv.x, 0.0, wv.y) * amp * bend;
  // the mole and the raptor run through it: pushed aside and pressed down
  for (int i = 0; i < ${PUSH}; i++) {
    vec4 P = uPush[i];
    if (P.w <= 0.0) continue;
    vec2 d = p.xz - P.xz;
    float hd = length(d);
    float dy = p.y - P.y;
    float f = (1.0 - smoothstep(P.w * 0.35, P.w, hd)) * smoothstep(-0.3, -0.05, dy) * (1.0 - smoothstep(0.7, 1.2, dy)) * iSway.w;
    disp.xz += d / max(hd, 0.02) * f * P.w * 0.7 * bend;
    disp.y -= f * 0.1 * bend * (1.0 - 2.0 * iOff.w);
  }
  p += disp;
  vWorld = p;
  vCol = pow(iCol.rgb, vec3(2.2));
  vGlow = iCol.a * 2.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uGlowGain;
uniform vec3 fogCol;
uniform float fogDen;
uniform vec3 uMistCol;
uniform float uMistDen;
uniform float uMistFall;
uniform float uMistBase;
uniform float uMistMax;
uniform float uFogSteps;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uDirD[2];
uniform vec3 uDirC[2];
uniform vec4 uPL[${NL}];
uniform vec4 uPLc[${NL}];
varying vec3 vWorld;
varying vec3 vCol;
varying float vGlow;
${GLSL_BAYER}
${GLSL_SUN}
// the toon ramp of the cave's own materials (src/gfx/Voxel.js getToonGradient)
float toonG(float d) { float c = d * 0.5 + 0.5; return c < 0.25 ? 0.353 : c < 0.5 ? 0.627 : c < 0.75 ? 0.882 : 1.0; }
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  // (the leaves are thin: light comes through them a little from behind)
  vec3 L = mix(uHemiGround, uHemiSky, 0.5 * n.y + 0.5);
  for (int i = 0; i < 2; i++) L += uDirC[i] * toonG(dot(n, uDirD[i]));
  for (int i = 0; i < ${NL}; i++) {
    vec4 P = uPL[i];
    if (P.w <= 0.0) continue;
    vec3 d = P.xyz - vWorld;
    float dd = length(d);
    float att = 1.0 / max(pow(dd, uPLc[i].w), 0.01);
    float x = clamp(dd / P.w, 0.0, 1.0);
    att *= pow(clamp(1.0 - x * x * x * x, 0.0, 1.0), 2.0);
    L += uPLc[i].rgb * att * toonG(dot(n, d / max(dd, 1e-4)));
  }
  vec3 col = vCol * L * 0.31831;
  col += (vCol + 0.035) * uSunCol * caSun(vWorld, n) + (vCol + 0.01) * uSkyCol * caSky(vWorld, n);
  float pulse = 0.84 + 0.16 * sin(uTime * 1.3 + dot(vWorld, vec3(0.9, 0.45, 0.7)));
  col += vCol * vGlow * uGlowGain * pulse;
  // the cave's air: dithered fog and the mist lying on the floor
  vec3 cD = vWorld - cameraPosition;
  float cDist = length(cD);
  float cF = 1.0 - exp(-fogDen * fogDen * cDist * cDist);
  float cK = uMistFall * cD.y;
  float cA = uMistDen * exp(-(cameraPosition.y - uMistBase) * uMistFall);
  float cOd = abs(cK) < 0.001 ? cA * cDist : cA * cDist * (1.0 - exp(-cK)) / cK;
  float cM = clamp(1.0 - exp(-cOd), 0.0, uMistMax);
  float cDi = bk_bayer4(gl_FragCoord.xy) * 0.999;
  cM = floor(cM * uFogSteps + cDi) / uFogSteps;
  cF = floor(cF * uFogSteps + cDi) / uFogSteps;
  col = mix(col, uMistCol, cM);
  col = mix(col, fogCol, cF);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeTitleVeg({ lite = false } = {}) {
  // staged plants: { p (proto), x, y, z, yaw, div, rank, sway, push, tint, glow, hang, cut, fl, gu }
  const staged = [];
  let mesh = null, geo = null, mat = null;
  const stats = { plants: 0, boxes: 0 };
  const push = Array.from({ length: PUSH }, () => new THREE.Vector4(0, -99, 0, 0));
  const pl = Array.from({ length: NL }, () => new THREE.Vector4(0, 0, 0, 0)), plc = Array.from({ length: NL }, () => new THREE.Vector4(0, 0, 0, 1));
  const U = {
    uTime: CF.uTime, uGlowGain: CF.uGlowGain,
    uMistCol: CF.uMistCol, uMistDen: CF.uMistDen, uMistFall: CF.uMistFall, uMistBase: CF.uMistBase, uMistMax: CF.uMistMax, uFogSteps: CF.uFogSteps,
    uSunDir: CF.uSunDir, uSunU: CF.uSunU, uSunV: CF.uSunV, uSunCol: CF.uSunCol, uShaft: CF.uShaft, uCap: CF.uCap, uSkyCol: CF.uSkyCol,
    fogCol: { value: new THREE.Color(0) }, fogDen: { value: 0.03 },
    uHemiSky: { value: new THREE.Color(0) }, uHemiGround: { value: new THREE.Color(0) },
    uDirD: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] }, uDirC: { value: [new THREE.Color(0), new THREE.Color(0)] },
    uPL: { value: pl }, uPLc: { value: plc },
    uWind: { value: new THREE.Vector4(0.82, 0.57, 0.9, 1.1) },
    uPush: { value: push },
    uLod: { value: lite ? new THREE.Vector3(7.5, 12.5, 17) : new THREE.Vector3(10, 17, 24) },
  };

  const V = {
    stats,
    get mesh() { return mesh; },
    /** Stage a plant (a MODELS name) with its root at x, y, z. */
    add(name, x, y, z, o = {}) {
      if (!MODELS[name]) return null;
      const P = proto(name, o.variant ?? 0);
      const pr = o.lod && P.lod ? P.lod : P;
      let div = o.div ?? 56;
      if (o.lod) div = Math.round(div / 2);
      const s = { p: pr, x, y, z, yaw: o.yaw ?? 0, div, rank: o.rank ?? 1, sway: o.sway ?? (pr.mode === 'down' ? 0.16 : 0.1), push: o.push ?? 1, tint: o.tint ?? 1, glow: o.glow ?? 1, hang: pr.mode === 'down', cut: o.cut ?? -1e9, fl: Math.random(), gu: o.gust ?? Math.random() };
      staged.push(s);
      return { h: pr.H / div, rad: pr.rad / div };
    },
    /** Pack every staged plant into the one instanced box mesh. */
    build() {
      let n = 0;
      for (const s of staged) n += s.p.n;
      geo = boxTemplate(new THREE.InstancedBufferGeometry());
      const root = new Float32Array(n * 3), off = new Int8Array(n * 4), shape = new Uint8Array(n * 4), col = new Uint8Array(n * 4), sway = new Uint8Array(n * 4), misc = new Uint8Array(n * 4);
      const b8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
      let i = 0;
      for (const s of staged) {
        const { off: O, size: S, rgb, glow, bend } = s.p;
        const a = s.yaw / (Math.PI * 2);
        const yawB = b8(a - Math.floor(a)), rankB = b8(s.rank), flB = b8(s.fl), guB = b8(s.gu), swB = b8(s.sway / 0.25), puB = b8(s.push);
        const tr = s.tint * (0.95 + Math.random() * 0.1), tg = s.tint * (0.95 + Math.random() * 0.1), tb = s.tint * (0.95 + Math.random() * 0.1);
        for (let k = 0; k < s.p.n; k++) {
          const k3 = k * 3;
          let oy = O[k3 + 1], sy = S[k3 + 1];
          if (oy < s.cut) { if (oy + sy <= s.cut) continue; sy = oy + sy - s.cut; oy = s.cut; }
          const i3 = i * 3, i4 = i * 4;
          root[i3] = s.x; root[i3 + 1] = s.y; root[i3 + 2] = s.z;
          off[i4] = O[k3]; off[i4 + 1] = oy; off[i4 + 2] = O[k3 + 2]; off[i4 + 3] = s.hang ? 1 : 0;
          shape[i4] = S[k3]; shape[i4 + 1] = sy; shape[i4 + 2] = S[k3 + 2]; shape[i4 + 3] = s.div;
          col[i4] = Math.min(255, rgb[k3] * tr); col[i4 + 1] = Math.min(255, rgb[k3 + 1] * tg); col[i4 + 2] = Math.min(255, rgb[k3 + 2] * tb);
          col[i4 + 3] = glow[k] ? Math.min(255, glow[k] * s.glow * 42.5) : 0;
          sway[i4] = bend[k * 2]; sway[i4 + 1] = bend[k * 2 + 1]; sway[i4 + 2] = swB; sway[i4 + 3] = puB;
          misc[i4] = yawB; misc[i4 + 1] = rankB; misc[i4 + 2] = flB; misc[i4 + 3] = guB;
          i++;
        }
      }
      const add = (name, arr, k, norm) => geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr.subarray(0, i * k), k, norm));
      add('iRoot', root, 3, false); add('iOff', off, 4, false); add('iShape', shape, 4, false);
      add('iCol', col, 4, true); add('iSway', sway, 4, true); add('iMisc', misc, 4, true);
      geo.instanceCount = i;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'foliage';
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      stats.plants = staged.length;
      stats.boxes = i;
      staged.length = 0;
      return mesh;
    },
    /**
     * Per frame: the scene's lights and fog (so the foliage sits in the same light as the rock), and
     * who's running through it. pushers: [{ x, y, z, r }].
     */
    update(dt, camera, scene, pushers = [], lights = null) {
      if (!mesh) return;
      const fog = scene?.fog;
      if (fog) { U.fogCol.value.copy(fog.color); U.fogDen.value = fog.density ?? 0.03; }
      // the scene's hemisphere and (up to two) directional lights, and the nearest point lights
      let hemi = null, nd = 0, np = 0;
      const L = lights || V._lights || (V._lights = []);
      if (!lights && scene && !V._scanned) { V._scanned = true; scene.traverse((o) => { if (o.isLight) L.push(o); }); }
      for (const o of L) {
        if (o.isHemisphereLight) hemi = o;
        else if (o.isDirectionalLight && nd < 2) {
          o.updateMatrixWorld();
          const d = U.uDirD.value[nd].setFromMatrixPosition(o.matrixWorld);
          if (o.target) { o.target.updateMatrixWorld(); d.sub(_tv.setFromMatrixPosition(o.target.matrixWorld)); }
          d.normalize();
          U.uDirC.value[nd].copy(o.color).multiplyScalar(o.visible ? o.intensity : 0);
          nd++;
        } else if (o.isPointLight && np < NL && o.intensity > 0 && o.visible) {
          o.updateMatrixWorld();
          pl[np].setFromMatrixPosition(o.matrixWorld); pl[np].w = o.distance || 1e4;
          plc[np].set(o.color.r * o.intensity, o.color.g * o.intensity, o.color.b * o.intensity, o.decay);
          np++;
        }
      }
      for (let i = nd; i < 2; i++) U.uDirC.value[i].setRGB(0, 0, 0);
      for (let i = np; i < NL; i++) pl[i].w = 0;
      if (hemi) { U.uHemiSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); U.uHemiGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity); }
      for (let i = 0; i < PUSH; i++) {
        const P = pushers[i];
        if (P) push[i].set(P.x, P.y, P.z, P.r ?? 0.45); else push[i].w = 0;
      }
    },
    /** The point lights the foliage takes (an array of THREE lights; others are ignored). */
    setLights(list) { V._lights = list.slice(); V._scanned = true; },
    dispose() { geo?.dispose(); mat?.dispose(); mesh?.removeFromParent(); },
  };
  return V;
}
