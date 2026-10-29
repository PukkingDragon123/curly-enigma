// Rendering bits for the gathering close-ups: the material (lit like the rest of the mine: helmet
// lamp, point lights, fog, plus a soft close-up key light and a rim so the plant reads), voxel
// models meshed into BufferGeometry, and a few shared shapes (clods, root segments, rings).
import * as THREE from 'three';
import { LIGHT } from '../TerrainMaterial.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { meshProp, PGrid } from '../props/grid.js';

export { PGrid };

/**
 * The close-up material. Vertex colours (sRGB bytes) + glow in aCol.a; optional instancing (with
 * instanceColor as a multiplier). Uniforms: uGlow (glow multiplier), uTint/uTintK (a flash or the
 * red of a straining stem), uKey/uKeyK (the close-up key light), uRim (rim light strength).
 */
export function gatherMaterial(U, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uGlow: { value: o.glow ?? 1 },
      uTint: { value: new THREE.Color(1, 0.3, 0.2) },
      uTintK: { value: 0 },
      uKey: { value: new THREE.Vector3(-0.4, 0.8, 0.45).normalize() },
      uKeyK: { value: o.key ?? 0.35 },
      uKeyCol: { value: new THREE.Color(1, 0.86, 0.66) },
      uRim: { value: o.rim ?? 0.35 },
      uRimCol: { value: new THREE.Color(0.75, 0.82, 1) },
      uExpo: { value: o.expo ?? 0.8 },
      uCam: { value: new THREE.Vector3() },
      texel: { value: o.texel ?? 0 },
    },
    vertexShader: /* glsl */`
      attribute vec4 aCol;
      varying vec3 vColor;
      varying float vGlow;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;
      void main() {
        vec4 lp = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          n = mat3(instanceMatrix) * n;
        #endif
        vLocal = position;
        vec4 wp = modelMatrix * lp;
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vColor = pow(aCol.rgb, vec3(2.2));
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        vGlow = aCol.a * 1.2;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      uniform float uGlow;
      uniform vec3 uTint;
      uniform float uTintK;
      uniform vec3 uKey;
      uniform float uKeyK;
      uniform vec3 uKeyCol;
      uniform float uRim;
      uniform vec3 uRimCol;
      uniform float uExpo;
      uniform vec3 uCam;
      uniform float texel;
      varying vec3 vColor;
      varying float vGlow;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;
      float h3o(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      ${LIGHT}
      void main() {
        vec3 n = normalize(vN);
        // the helmet lamp is right on top of a close-up: tone it down a touch so pale things keep their colour
        vec3 L = lightAt(vWorld, n) * uExpo;
        vec3 V = normalize(uCam - vWorld);
        L += uKeyCol * uKeyK * max(dot(n, uKey), 0.0);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        L += uRimCol * uRim * rim * 0.6;
        vec3 c = vColor;
        if (texel > 0.0) c *= 0.9 + 0.2 * h3o(floor(vLocal * texel - n * 0.5) + 3.1);
        float pulse = 0.85 + 0.15 * sin(time * 2.3 + vLocal.y * 9.0);
        vec3 col = c * L + c * vGlow * pulse * uGlow;
        col = mix(col, uTint, uTintK);
        float dist = length(vWorld - lampPos);
        float fogK = (1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2)) * (1.0 - 0.35 * min(vGlow, 1.0));
        gl_FragColor = vec4(mix(col, fogCol, fogK), 1.0);
      }`,
  });
}

/** Mesh a PGrid into a BufferGeometry (position, normal, aCol = sRGB + glow). */
export function voxGeo(grid, o = {}) {
  const m = meshProp(grid, { pivot: o.pivot, scale: o.scale, ao: o.ao ?? true });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3, true));
  const col = new Uint8Array(m.nv * 4);
  for (let i = 0; i < m.nv; i++) {
    col[i * 4] = m.col[i * 3]; col[i * 4 + 1] = m.col[i * 3 + 1]; col[i * 4 + 2] = m.col[i * 3 + 2];
    col[i * 4 + 3] = Math.round(Math.min(1, m.glw[i] / 1.2) * 255);
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingSphere();
  g.userData.min = m.min; g.userData.max = m.max;
  return g;
}

/** A mesh with the outline layer on. */
export function mesh(geo, mat, parent) {
  const o = new THREE.Mesh(geo, mat);
  o.layers.enable(LAYER_OUTLINE);
  o.frustumCulled = false;
  if (parent) parent.add(o);
  return o;
}

/** A unit voxel cube (side 1, centred) with aCol white, for instanced clods and root segments. */
export function cubeGeo(color = 0xffffff, glow = 0) {
  const g = new PGrid(1, 1, 1);
  g.set(0, 0, 0, color, glow);
  return voxGeo(g, { pivot: [0.5, 0.5, 0.5], scale: 1, ao: false });
}

/** A lumpy clod (a few voxels, about 1 unit across) for the soil, centred. */
export function clodGeo(seed = 1) {
  const g = new PGrid(4, 3, 4);
  let h = seed * 9301 + 49297;
  const r = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
    const edge = (x === 0 || x === 3) && (z === 0 || z === 3);
    if (edge && r() < 0.7) continue;
    const top = 1 + (r() < 0.55 ? 1 : 0) + (!edge && r() < 0.3 ? 1 : 0);
    for (let y = 0; y < top; y++) g.set(x, y, z, y === top - 1 ? 0xffffff : 0xd8d8d8);
  }
  return voxGeo(g, { pivot: [2, 0, 2], scale: 0.25, ao: true });
}

/** sRGB hex → linear [r, g, b] (for instance colours). */
export function lin(hex) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
export const srgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** A camera-facing ring (for the berry timing ring and other markers drawn in the world). */
export function ringMesh(color = 0xffe066) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uA: { value: 1 }, uW: { value: 0.16 }, uFill: { value: 0 } },
    transparent: true, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
        mv.xy += position.xy * s.xy;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol;
      uniform float uA;
      uniform float uW;
      uniform float uFill;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        // pixel-art ring: hard edges, a dark outline both sides
        float ring = step(1.0 - uW, r) * step(r, 1.0);
        float edge = step(1.0 - uW - 0.07, r) * step(r, 1.07) - ring;
        float fill = step(r, 1.0 - uW) * uFill;
        if (ring + edge + fill <= 0.0) discard;
        vec3 c = ring > 0.5 ? uCol : fill > 0.0 ? uCol : vec3(0.1, 0.06, 0.04);
        gl_FragColor = vec4(c, uA * (ring > 0.5 ? 1.0 : fill > 0.0 ? 0.25 : 0.85));
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false;
  m.renderOrder = 30;
  return m;
}
