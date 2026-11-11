// The title cave's shading kit (bookends/titleCave.js, titleChase.js, titleNest.js, and the
// signpost when it stands in the cave):
//
//   caveToon({ emissive, sway, key })  the cave's voxel material: the game's toon ramp (vertex
//        colours, three's lights: the glowcaps' point lights, the nest's warm light) plus
//          - per-voxel glow: an `aGlow` vertex attribute (0 = plain rock, up to ~2.5 = a glowcap's
//            gills) that lights the voxel by itself, breathing slowly (CF.uGlowGain dims it all)
//          - the cave's air: distance fog in dithered steps (scene.fog's colour and density, so
//            the characters' plain fog matches) and a glowing mist lying on the floor
//          - sway: hanging roots and threads swing a little in the cave's draught
//   glowHex(hex, level)  a voxel colour that glows (level 1..3 in its two lowest bits); lit(hex)
//                        clears them (every plain voxel colour goes through it)
//   meshGlow(grid, opts) meshVoxGreedy + the aGlow attribute decoded from those bits
//   vgGeo(model, scale)  a cave plant from src/deep/veg (its VG grid, glow levels and all) as a
//                        mesh in the same format
//   withGlow(geo, v)     give a geometry without glow a flat aGlow (so it can be merged)
//   makeMistSheet(...)   a drifting sheet of mist in dithered cells (pixel art, no soft edge)
import * as THREE from 'three';
import { voxelMaterial, VoxelGrid } from '../gfx/Voxel.js';
import { meshVoxGreedy } from './vox.js';
import { GLSL_BAYER } from './fx.js';

/** Shared uniforms of every cave material. */
export const CF = {
  uTime: { value: 0 },
  uGlowGain: { value: 1 },
  uMistCol: { value: new THREE.Color(0x1f5a62) },
  uMistDen: { value: 0.11 }, // per metre, at the mist's base height
  uMistFall: { value: 1.7 }, // how fast it thins upward (per metre)
  uMistBase: { value: 0.0 },
  uMistMax: { value: 0.3 },
  uFogSteps: { value: 12 },
  uDraught: { value: new THREE.Vector2(0.7, 0.3) },
};

/** Glow strength per level (the veg models' 1..3). */
export const GLOW = [0, 0.5, 1.15, 2.1];

/** A voxel colour that glows at `level` (1..3); its two lowest bits carry the level. */
export const glowHex = (hex, level = 2) => ((hex & 0xfffffc) | (level & 3)) >>> 0;
/** A plain (lit only) voxel colour. */
export const lit = (hex) => (hex & 0xfffffc) >>> 0;

const cache = new Map();
/**
 * Patch a toon shader into the cave's (see caveToon). Exported so other materials (the eggs) can
 * build on it: they find the CAVE_EMIT marker comment at the end of the emissive code to add their own.
 */
export function patchCave(sh, { emissive = 0, sway = 0, glow = 1 } = {}) {
  Object.assign(sh.uniforms, CF);
  sh.vertexShader = 'attribute float aGlow;\nvarying float vCaGlow;\nvarying vec3 vCaW;\nuniform float uTime;\nuniform vec2 uDraught;\n' + sh.vertexShader.replace('#include <project_vertex>', /* glsl */`
    #ifdef USE_INSTANCING
    vec4 caW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    vec3 caO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #else
    vec4 caW = modelMatrix * vec4(transformed, 1.0);
    vec3 caO = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #endif
    ${sway ? /* glsl */`
    {
      float caH = clamp(caO.y - caW.y, 0.0, 3.0);
      float caP = uTime * 0.9 + dot(caO.xz, vec2(0.9, 1.3));
      caW.xz += uDraught * (sin(caP) * 0.7 + sin(caP * 2.3 + caW.y * 2.0) * 0.3) * ${sway.toFixed(3)} * caH * caH;
    }` : ''}
    vCaW = caW.xyz;
    vCaGlow = aGlow * ${glow.toFixed(2)};
    vec4 mvPosition = viewMatrix * caW;
    gl_Position = projectionMatrix * mvPosition;`);
  let fs = sh.fragmentShader;
  fs = fs.replace('#include <common>', '#include <common>\nvarying float vCaGlow;\nvarying vec3 vCaW;\nuniform float uTime;\nuniform float uGlowGain;\nuniform vec3 uMistCol;\nuniform float uMistDen;\nuniform float uMistFall;\nuniform float uMistBase;\nuniform float uMistMax;\nuniform float uFogSteps;\n' + GLSL_BAYER);
  // glowing voxels light themselves (a slow breath that drifts across the cave)
  fs = fs.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
    if (vCaGlow > 0.001) {
      float caB = 0.84 + 0.16 * sin(uTime * 1.3 + dot(vCaW, vec3(0.9, 0.45, 0.7)));
      totalEmissiveRadiance += diffuseColor.rgb * vCaGlow * uGlowGain * caB;
    }
    ${emissive ? `totalEmissiveRadiance += diffuseColor.rgb * ${emissive.toFixed(3)};` : ''}
    /*CAVE_EMIT*/`);
  // the air: dithered distance fog (the scene's FogExp2) and the mist lying on the floor
  fs = fs.replace('#include <fog_fragment>', /* glsl */`
    #ifdef USE_FOG
    {
      vec3 caD = vCaW - cameraPosition;
      float caDist = length(caD);
      float caF = 1.0 - exp(-fogDensity * fogDensity * caDist * caDist);
      float caK = uMistFall * caD.y;
      float caA = uMistDen * exp(-(cameraPosition.y - uMistBase) * uMistFall);
      float caOd = abs(caK) < 0.001 ? caA * caDist : caA * caDist * (1.0 - exp(-caK)) / caK;
      float caM = clamp(1.0 - exp(-caOd), 0.0, uMistMax);
      float caDi = bk_bayer4(gl_FragCoord.xy) * 0.999;
      caM = floor(caM * uFogSteps + caDi) / uFogSteps;
      caF = floor(caF * uFogSteps + caDi) / uFogSteps;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistCol, caM);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, caF);
    }
    #endif`);
  sh.fragmentShader = fs;
}

/**
 * The cave material. emissive: a flat self-light (the signpost's painted words read in the dark);
 * sway: how far hanging things swing (m at 1 m below their root).
 */
export function caveToon({ emissive = 0, sway = 0, glow = 1, tint = null, key = '' } = {}) {
  const ck = `${emissive}|${sway}|${glow}|${tint}|${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const m = voxelMaterial('toon').clone();
  m.userData = { caveKey: ck };
  if (tint) m.color.set(tint);
  m.onBeforeCompile = (sh) => patchCave(sh, { emissive, sway, glow });
  m.customProgramCacheKey = () => 'cave-toon2-' + ck;
  cache.set(ck, m);
  return m;
}
export function resetCaveMaterials() { for (const m of cache.values()) m.dispose(); cache.clear(); }

// ------------------------------------------------------------------ meshing with glow
/**
 * Give each quad of a meshVoxGreedy geometry the glow of the voxel it belongs to (the two low bits
 * of the grid's colour; greedy merging only joins equal colours, so one voxel speaks for a quad).
 */
function decodeGlow(geo, grid, scale, pivot) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  const nv = P.length / 3;
  const g = new Float32Array(nv);
  const { w, h, d, data } = grid;
  let any = false;
  for (let v = 0; v < nv; v += 4) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) { cx += P[(v + k) * 3]; cy += P[(v + k) * 3 + 1]; cz += P[(v + k) * 3 + 2]; }
    const i3 = v * 3;
    const x = Math.floor((cx / 4 - N[i3] * 0.5 * scale) / scale + pivot[0]);
    const y = Math.floor((cy / 4 - N[i3 + 1] * 0.5 * scale) / scale + pivot[1]);
    const z = Math.floor((cz / 4 - N[i3 + 2] * 0.5 * scale) / scale + pivot[2]);
    if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) continue;
    const raw = data[x + w * (y + h * z)];
    const lv = raw & 3;
    if (!lv) continue;
    any = true;
    const s = GLOW[lv];
    g[v] = s; g[v + 1] = s; g[v + 2] = s; g[v + 3] = s;
  }
  geo.setAttribute('aGlow', new THREE.BufferAttribute(g, 1));
  geo.userData.glows = any;
  return geo;
}

/** meshVoxGreedy with glow. opts: scale, pivot, ao, solid. */
export function meshGlow(grid, opts = {}) {
  const scale = opts.scale ?? 1 / 16;
  const pivot = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const geo = meshVoxGreedy(grid, { ...opts, scale, pivot });
  return decodeGlow(geo, grid, scale, pivot);
}

/** A flat aGlow on a geometry that has none (so it merges with glowing ones). */
export function withGlow(geo, v = 0) {
  if (!geo.attributes.aGlow) geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(v), 1));
  return geo;
}

/**
 * One of the mine's cave plants (src/deep/veg/plants.js MODELS: { g: VG, pivot, mode }) as a
 * glowing voxel mesh at `scale` m per voxel. Its root sits at the origin.
 */
export function vgGeo(m, scale = 1 / 56) {
  const s = m.g, grid = new VoxelGrid(s.w, s.h, s.d);
  const src = s.data, dst = grid.data;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!v) continue;
    const gl = (v >>> 24) & 3;
    dst[i] = ((v & 0xfffffc) | gl | 0x1000000) >>> 0;
  }
  return meshGlow(grid, { scale, pivot: m.pivot });
}

// ------------------------------------------------------------------ mist
const MIST_VERT = /* glsl */`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const MIST_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSeed;
uniform vec2 uDraught;
uniform vec4 uBox; // x0, z0, x1, z1 (the sheet's extent: it thins to nothing at the edges)
varying vec3 vW;
${GLSL_BAYER}
float mh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.0) * 43758.5453); }
float mn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh(i), mh(i + vec2(1.0, 0.0)), f.x), mix(mh(i + vec2(0.0, 1.0)), mh(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // cells of 1/8 m: the mist is drawn in the cave's own voxel grain
  vec2 c = floor(vW.xz * 8.0) / 8.0;
  vec2 p = c * 0.55 + uDraught * uTime * 0.12;
  float n = mn(p) * 0.6 + mn(p * 2.3 + 7.1 - uDraught * uTime * 0.08) * 0.3 + mn(p * 5.1 + 3.3) * 0.1;
  vec2 e = min(c - uBox.xy, uBox.zw - c);
  float edge = clamp(min(e.x, e.y) / 2.5, 0.0, 1.0);
  float a = smoothstep(0.38, 0.85, n) * edge * uAlpha;
  float q = floor(a * 5.0 + bk_bayer4(gl_FragCoord.xy)) / 5.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor * (0.8 + n * 0.5), q * 0.55);
}`;

/** A horizontal sheet of glowing mist (w × d m, centred on x, z) at height y. */
export function makeMistSheet(x, y, z, w, d, { color = 0x6ad8d0, alpha = 0.7, seed = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: CF.uTime, uDraught: CF.uDraught, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uSeed: { value: seed }, uBox: { value: new THREE.Vector4(x - w / 2, z - d / 2, x + w / 2, z + d / 2) } },
    vertexShader: MIST_VERT,
    fragmentShader: MIST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.renderOrder = 8;
  m.userData.mist = mat.uniforms;
  return m;
}
