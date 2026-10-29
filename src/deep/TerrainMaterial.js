// Shaders for the underground: voxel terrain, fluid surfaces (water / lava) and lit voxel objects.
//
// Terrain: per-voxel colour picked by world position (8×8 texels per voxel face, palette tones),
// rock plates with one-texel cracks, strata, big tint patches and mineral streaks from a small 3D
// noise texture, damp sheen, moss / frost on upward faces and glowing cracks by the zone's mood,
// crystal and ice facets with an inner layer and glints, smooth baked AO. Lighting (`LIGHT`,
// shared with props, creatures and traders): a dim hemisphere ambient with the zone's cool sky and
// warm bounce, the helmet lamp (a wide flood with a hot centre, inverse-square-ish falloff) and up
// to 8 point lights with soft windows, wrap diffuse and Blinn-Phong glints. The air (`AIR`):
// distance fog that reaches the dark at the edge of the streamed world, ground mist that pools in
// pits, and the lamp and lanterns scattering in the dust (closed-form in-scatter per light).
import * as THREE from 'three';
import { makePaletteTexture, MAT, M, STYLE, VOX } from './materials.js';

export const MAX_LIGHTS = 8;

// ------------------------------------------------------------------ per-material surface extras
// Packed next to the palette (column 7: specular, gloss, translucency, strata; column 6 alpha: the
// rock glows along its cracks in hot zones; column 5 alpha: moss, damp and rime can grow on it).
const SURF_BY_STYLE = {
  [STYLE.ROCK]: [0.12, 0.35, 0, 0.5], [STYLE.SOIL]: [0.05, 0.15, 0, 0.35], [STYLE.CRYSTAL]: [0.8, 0.85, 0.7, 0.05],
  [STYLE.WOOD]: [0.05, 0.2, 0, 0], [STYLE.BRICK]: [0.05, 0.2, 0, 0], [STYLE.MOSS]: [0.1, 0.3, 0.3, 0],
  [STYLE.ORE]: [0.75, 0.75, 0.15, 0], [STYLE.GLOW]: [0.1, 0.4, 0.6, 0], [STYLE.ICE]: [0.45, 0.75, 0.35, 0.12],
  [STYLE.FLUID]: [0, 0, 0, 0], [STYLE.GRAIN]: [0.08, 0.5, 0, 0.05],
};
const SURF = {
  [M.LIMESTONE]: [0.16, 0.4, 0, 1], [M.SANDSTONE]: [0.06, 0.25, 0, 1], [M.MUDSTONE]: [0.14, 0.35, 0, 0.85],
  [M.STONE]: [0.12, 0.35, 0, 0.6], [M.GRANITE]: [0.22, 0.6, 0, 0.15], [M.BASALT]: [0.2, 0.5, 0, 0.3],
  [M.OBSIDIAN]: [1, 1, 0.15, 0], [M.CLAY]: [0.1, 0.25, 0, 0.75], [M.DIRT]: [0.04, 0.15, 0, 0.5],
  [M.LOAM]: [0.04, 0.15, 0, 0.35], [M.SAND]: [0.1, 0.5, 0, 0.1], [M.SNOW]: [0.3, 0.7, 0.25, 0],
  [M.ASH]: [0.02, 0.1, 0, 0], [M.PERMAFROST]: [0.4, 0.6, 0.2, 0.55], [M.MAGMAROCK]: [0.14, 0.4, 0, 0.3],
  [M.BEDROCK]: [0.08, 0.3, 0, 0.2], [M.BONE]: [0.1, 0.3, 0.1, 0], [M.STEM]: [0.05, 0.2, 0.35, 0],
  [M.GLOWCAP]: [0.2, 0.5, 0.75, 0], [M.CORE]: [0.6, 0.7, 0.5, 0.2], [M.MYCEL]: [0.06, 0.2, 0.3, 0],
};
const HOT = [M.MAGMAROCK, M.BASALT, M.OBSIDIAN];
const GROW_BY_STYLE = { [STYLE.ROCK]: 1, [STYLE.SOIL]: 0.9, [STYLE.GRAIN]: 0.5 };

function surfacePalette(tex) {
  const data = tex.image.data, W = 8;
  for (let m = 1; m < 256; m++) {
    const d = MAT[m];
    if (!d) continue;
    const style = d.style ? d.style[0] : STYLE.ROCK;
    const s = SURF[m] || SURF_BY_STYLE[style] || SURF_BY_STYLE[STYLE.ROCK];
    const o7 = (m * W + 7) * 4;
    for (let k = 0; k < 4; k++) data[o7 + k] = Math.round(s[k] * 255);
    data[(m * W + 6) * 4 + 3] = HOT.includes(m) ? 255 : 0;
    // natural rock and soil only (ruins, burrow fittings and ores stay clean)
    const natural = m < 96 && !d.fluid && m !== M.BONE && m !== M.STEM && m !== M.BURROW;
    data[(m * W + 5) * 4 + 3] = natural ? Math.round((GROW_BY_STYLE[style] || 0) * 255) : 0;
  }
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ a small 3D noise texture
// 32³ RGBA, tiling: r, g smooth fbm (4 + 8 cells per tile), b finer (8 + 16), a ridged (veins).
// One trilinear fetch gives four fields; the terrain samples it at two scales.
let NOISE3 = null;
function noise3D() {
  if (NOISE3) return NOISE3;
  const N = 32, data = new Uint8Array(N * N * N * 4);
  const hash = (x, y, z, s) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y, z, P, s) => { // tileable value noise, P cells per tile, x..z in 0..1
    const fx = x * P, fy = y * P, fz = z * P;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = sm(fx - ix), ty = sm(fy - iy), tz = sm(fz - iz);
    const h = (a, b, c) => hash(((ix + a) % P + P) % P, ((iy + b) % P + P) % P, ((iz + c) % P + P) % P, s);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(0, 0, 0), h(1, 0, 0), tx), l(h(0, 1, 0), h(1, 1, 0), tx), ty), l(l(h(0, 0, 1), h(1, 0, 1), tx), l(h(0, 1, 1), h(1, 1, 1), tx), ty), tz);
  };
  const stretch = (v) => Math.max(0, Math.min(1, (v - 0.5) * 1.7 + 0.5));
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N, w = (z + 0.5) / N;
    const o = (x + N * (y + N * z)) * 4;
    data[o] = Math.round(stretch(vn(u, v, w, 4, 1) * 0.62 + vn(u, v, w, 8, 2) * 0.38) * 255);
    data[o + 1] = Math.round(stretch(vn(u, v, w, 4, 3) * 0.62 + vn(u, v, w, 8, 4) * 0.38) * 255);
    data[o + 2] = Math.round(stretch(vn(u, v, w, 8, 5) * 0.55 + vn(u, v, w, 16, 6) * 0.45) * 255);
    const r = 1 - Math.abs(vn(u, v, w, 4, 7) * 2 - 1);
    data[o + 3] = Math.round(Math.max(0, Math.min(1, r * 0.75 + vn(u, v, w, 16, 8) * 0.25)) * 255);
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.userData.shared = true;
  t.needsUpdate = true;
  NOISE3 = t;
  return t;
}

/**
 * The shared uniforms of the underground's materials. Everything after `xray` is the cave look's
 * mood (set per frame by src/deep/Atmosphere.js in the mine; 0 = off, so other scenes that build
 * these uniforms keep a plain look until they set them).
 */
export function makeTerrainUniforms() {
  const lPos = [], lCol = [];
  for (let i = 0; i < MAX_LIGHTS; i++) { lPos.push(new THREE.Vector4(0, -9999, 0, 1)); lCol.push(new THREE.Vector3()); }
  return {
    palette: { value: surfacePalette(makePaletteTexture()) },
    lPos: { value: lPos },
    lCol: { value: lCol },
    lampPos: { value: new THREE.Vector3() },
    lampDir: { value: new THREE.Vector3(0, 0, -1) },
    lampCol: { value: new THREE.Color(1.25, 1.05, 0.8) },
    lampRange: { value: 11 },
    ambient: { value: new THREE.Color(0.05, 0.045, 0.055) },
    fogCol: { value: new THREE.Color(0.02, 0.016, 0.02) },
    fogDist: { value: 22 },
    time: { value: 0 },
    hit: { value: new THREE.Vector4(0, -9999, 0, 0) }, // impact flash: xyz, strength
    xray: { value: 0 },
    // ---- cave look
    noise3: { value: noise3D() },
    skyCol: { value: new THREE.Color(0, 0, 0) }, // cool light from above (added to the ambient)
    bounce: { value: new THREE.Color(0, 0, 0) }, // warm light from below
    haze: { value: 0 }, // lamp and lights scattering in the dust (0 = clear air)
    mist: { value: new THREE.Vector4(0, 1.5, 0.6, 0) }, // ground mist: density, depth below the eye, falloff
    mistCol: { value: new THREE.Color(0, 0, 0) },
    mood: { value: new THREE.Vector4(0, 0, 0, 0) }, // moss on tops, damp, rime, hot cracks (0..1 each)
  };
}

// Lighting shared by every lit material of the mine. lightAt(p, n) keeps its old meaning (all the
// light falling on a surface at p facing n); lightFull adds wrap, AO and glints for the terrain.
const LIGHT = /* glsl */`
  uniform vec4 lPos[${MAX_LIGHTS}];
  uniform vec3 lCol[${MAX_LIGHTS}];
  uniform vec3 lampPos;
  uniform vec3 lampDir;
  uniform vec3 lampCol;
  uniform float lampRange;
  uniform vec3 ambient;
  uniform vec3 skyCol;
  uniform vec3 bounce;
  // a dim hemisphere, cooler than the lamp (shade reads blue-grey next to its warm pool): tops a
  // little brighter, ceilings darker, plus the zone's sky and bounce
  vec3 ambientAt(vec3 n) {
    vec3 a = mix(ambient, vec3(dot(ambient, vec3(0.3, 0.5, 0.2))) * vec3(0.82, 0.95, 1.25), 0.3);
    return a * (0.72 + 0.2 * n.y) + skyCol * (0.55 + 0.45 * n.y) + bounce * (0.55 - 0.45 * n.y);
  }
  // the helmet lamp: inverse-square-ish with a soft window at its range
  float lampAtt(float d) {
    float x = min(d / lampRange, 1.0);
    float w = 1.0 - x * x * x * x;
    return w * w * 1.05 / (1.0 + d * d * 0.05);
  }
  // a wide flood with a hot centre
  float lampCone(vec3 dl) {
    float c = dot(-dl, lampDir);
    return 0.22 + 0.78 * smoothstep(0.45, 0.92, c) + 0.2 * smoothstep(0.93, 0.995, c);
  }
  float pointAtt(float d, float r) {
    float x = min(d / r, 1.0);
    float w = 1.0 - x * x * x * x;
    return w * w / (1.0 + 7.0 * x * x);
  }
  // all the light on a surface at p facing n, seen from V. wrap softens the terminator; ao darkens
  // the ambient fully and direct light a little; shin > 0 also returns Blinn-Phong glints in spec
  vec3 lightFull(vec3 p, vec3 n, vec3 V, float wrap, float ao, float shin, out vec3 spec) {
    vec3 L = ambientAt(n) * ao;
    float kd = mix(1.0, ao, 0.45);
    spec = vec3(0.0);
    vec3 d = lampPos - p;
    float dist = length(d);
    vec3 dl = d / max(dist, 1e-4);
    vec3 lamp = lampCol * lampAtt(dist) * lampCone(dl);
    L += lamp * max((dot(n, dl) + wrap) / (1.0 + wrap), 0.0) * kd;
    float norm = (shin + 8.0) / 25.0;
    if (shin > 0.0) spec += lamp * pow(max(dot(n, normalize(dl + V)), 0.0), shin) * norm;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 q = lPos[i].xyz - p;
      float r = lPos[i].w;
      float dd = length(q);
      if (dd >= r) continue;
      vec3 ql = q / max(dd, 1e-4);
      vec3 c = lCol[i] * pointAtt(dd, r);
      L += c * (max((dot(n, ql) + wrap) / (1.0 + wrap), 0.0) * 0.82 + 0.18) * kd;
      if (shin > 0.0) spec += c * pow(max(dot(n, normalize(ql + V)), 0.0), shin) * norm;
    }
    return L;
  }
  vec3 lightAt(vec3 p, vec3 n) {
    vec3 s;
    return lightFull(p, n, normalize(lampPos - p), 0.28, 1.0, 0.0, s);
  }
`;

// The air between the eye (the lamp) and a surface. Needs LIGHT and the fogCol / fogDist uniforms.
// caveAir(col, p, dist) fogs a lit colour; the far darkness behind everything (Atmosphere's sky)
// is voidCol(dir) + airGlow(dir, far), so far rock melts into it with no seam. (The lanterns'
// halos in the dust are sprites, Atmosphere.js: per pixel they cost a third of the frame.)
const AIR = /* glsl */`
  uniform float haze;
  uniform vec4 mist;
  uniform vec3 mistCol;
  // reaches the dark at the edge of the streamed world (~16-24 m)
  float fogAmount(float d) { return 1.0 - exp(-pow(d / fogDist, 2.6) * 3.2); }
  // the far dark in a direction: deeper overhead (the roof of a hall is lost in it)
  vec3 voidCol(vec3 dir) { return fogCol * (1.0 - 0.38 * smoothstep(0.0, 0.8, dir.y)); }
  // the helmet lamp's flood scattered toward the eye by the dust along a ray of length d
  vec3 airGlow(vec3 dir, float d) {
    float c = dot(dir, lampDir);
    return lampCol * (haze * (0.04 + 0.96 * smoothstep(0.7, 0.99, c)) * (1.0 - exp(-min(d, lampRange * 0.7) * 0.25)) * 0.011);
  }
  vec3 caveAir(vec3 col, vec3 p, float d) {
    if (mist.x > 0.0) {
      // exponential ground mist, thick below the eye: pits and hall floors fill with it
      float dy = p.y - lampPos.y, k = mist.z;
      float fr = abs(dy * k) < 1e-3 ? 1.0 : (1.0 - exp(-k * dy)) / (k * dy);
      col = mix(col, mistCol, 1.0 - exp(-mist.x * d * exp(-mist.y * k) * fr));
    }
    vec3 dir = (p - lampPos) / max(d, 1e-4);
    col = mix(col, voidCol(dir), fogAmount(d));
    return col + airGlow(dir, d);
  }
`;

const GLSL_HASH = /* glsl */`
  float hash3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
`;

export function makeTerrainMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      attribute vec4 vdata;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vMat;
      varying float vAo;
      varying float vEdge;
      const vec3 NRM[6] = vec3[6](vec3(1.,0.,0.), vec3(-1.,0.,0.), vec3(0.,1.,0.), vec3(0.,-1.,0.), vec3(0.,0.,1.), vec3(0.,0.,-1.));
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = NRM[int(vdata.x + 0.5)];
        vMat = vdata.y;
        vAo = vdata.z / 3.0;
        vEdge = floor(vdata.w * 0.5 + 0.01); // convex edges (Mesher: -t1, +t1, -t2, +t2)
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D palette;
      uniform highp sampler3D noise3;
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      uniform vec4 hit;
      uniform vec4 mood;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vMat;
      varying float vAo;
      varying float vEdge;
      ${LIGHT}
      ${AIR}
      ${GLSL_HASH}
      vec3 pal(float m, float col) { return texture2D(palette, vec2((col + 0.5) / 8.0, (m + 0.5) / 256.0)).rgb; }

      // rock plates: jittered-grid Voronoi on the texel position q (in voxels); x = id hash,
      // y = edge distance (voxels); off = q minus the plate's centre
      vec2 plates(vec3 q, float S, out vec3 off) {
        vec3 g = floor(q / S - 0.5);
        float f1 = 1e9, f2 = 1e9; vec3 id = vec3(0.0);
        off = vec3(0.0);
        for (int k = 0; k < 8; k++) {
          vec3 c = g + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
          vec3 fp = (c + 0.5 + (hash33(c) - 0.5) * 0.85) * S;
          float d = dot(q - fp, q - fp);
          if (d < f1) { f2 = f1; f1 = d; id = c; off = q - fp; } else if (d < f2) { f2 = d; }
        }
        return vec2(hash3(id + 7.7), (sqrt(f2) - sqrt(f1)) * 0.5);
      }

      void main() {
        vec3 n = vNormal;
        vec3 toEye = lampPos - vWorld;
        float dist = length(toEye);
        vec3 V = toEye / max(dist, 1e-4);
        float near = clamp(1.0 - (dist - 4.0) / 6.0, 0.0, 1.0); // texel dither fades with distance
        vec3 vox = floor(vWorld * ${VOX}.0 - n * 0.5);
        // face axes and the texel (8x8 per voxel face) this fragment is in
        vec3 t1 = abs(n.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
        vec3 t2 = abs(n.y) > 0.5 ? vec3(0., 0., 1.) : vec3(0., 1., 0.);
        vec3 lp = vWorld * ${VOX}.0 - vox;
        vec2 uv = vec2(dot(lp, t1), dot(lp, t2));
        const float TEXN = ${128 / VOX}.0; // texels per voxel face (128 per meter)
        vec2 tx = clamp(floor(uv * TEXN), 0.0, TEXN - 1.0);
        vec3 q = vox + (tx.x + 0.5) / TEXN * t1 + (tx.y + 0.5) / TEXN * t2 + n * 0.49;
        vec3 qw = q / ${VOX}.0; // the texel's centre in meters
        float row = (vMat + 0.5) / 256.0;
        vec4 st = texture2D(palette, vec2(6.5 / 8.0, row));
        vec4 info = texture2D(palette, vec2(5.5 / 8.0, row));
        vec4 ex = texture2D(palette, vec2(7.5 / 8.0, row)); // spec, gloss, translucency, strata
        float style = floor(st.r * 255.0 + 0.5);
        float S = st.g * 255.0 / 16.0;
        float seamK = st.b;
        float hot = st.a, grow = info.a;
        float mat = vMat;
        float px = hash3(floor(q * TEXN) + 3.1); // per-texel noise
        float vh = hash3(vox);
        // world-scale fields from the 3D noise (two scales): patches, layers, stains, damp
        vec4 N1 = texture(noise3, qw * 0.125);
        vec4 N2 = texture(noise3, qw * 0.5 + 0.31);
        vec3 poff;
        vec2 pl = plates(q, max(S, 1.0), poff);
        vec3 dome = (poff - n * dot(poff, n)) / max(S, 1.0); // across the plate, -0.6..0.6
        float clump = hash3(floor(q * 2.0) + 5.3) * 0.6 + hash3(floor(q * TEXN * 0.25) + 9.1) * 0.4;
        // strata: wobbly horizontal layers, each a shade off its neighbours, a thin line between
        float sy = qw.y * 2.6 + (N1.r - 0.5) * 2.0 + (N2.g - 0.5) * 0.3;
        float layer = floor(sy);
        float lh = hash3(vec3(layer, 7.1, 3.3));
        float strat = ((mod(layer, 2.0) - 0.5) * 0.9 + (lh - 0.5) * 1.3) * ex.a;
        float sline = step(fract(sy), 0.035) * ex.a * (1.0 - abs(n.y));
        float tone = 1.5 + strat + (N1.g - 0.5) * 0.8 * (1.0 - ex.b);
        float bevel = 0.0;
        float seam = 0.0;
        float accent = 0.0;
        float wrap = 0.3;
        float glin = 0.0; // sparkle chance (crystal, ice, sand, snow)
        vec3 nn = n;

        if (style == 5.0) {
          // moss, mycelium, vines, ferns: soft tufts on top; on the sides it drapes in patches over
          // the dirt beneath, thinning out underneath
          wrap = 0.55;
          float cov = N2.r * 0.75 + (N1.g - 0.5) * 0.5 + clump * 0.25;
          if (n.y < 0.5) {
            float need = n.y < -0.5 ? 0.72 : 0.44;
            if (cov < need) { mat = 1.0; tone = 1.2 + (px - 0.5) * 0.8 * near + (N2.b - 0.5); }
            else tone = 0.9 + clump * 1.4 + (N2.b - 0.5) * 0.8;
          } else {
            tone = 1.1 + clump * 1.5 + (N2.b - 0.5) * 1.2 + (px - 0.5) * 0.6 * near;
            if (px > 0.86 && clump > 0.45) accent = 1.0;
          }
        } else if (style == 1.0) {
          // soil: soft clods, pores, a pebble here and there
          tone += (pl.x - 0.5) * 0.7 + ((px - 0.5) * 0.4 + (clump - 0.5) * 0.45) * near + (N2.r - 0.5) * 0.6 + strat * 0.5;
          nn = normalize(n + dome * 0.7);
          seam = step(pl.y, 0.1) * seamK * 0.55 + step(px, 0.035) * 0.5 * near;
          // pebbles: little round stones, a few per voxel face at most
          vec3 pc = floor(q * 1.5);
          if (hash3(pc + 11.0) > 0.9) {
            vec3 pd = fract(q * 1.5) - 0.5 - (hash33(pc + 4.0) - 0.5) * 0.4;
            pd -= n * dot(pd, n);
            float pr = 0.18 + hash3(pc + 2.0) * 0.16;
            if (dot(pd, pd) < pr * pr) { accent = step(0.0, dot(pd, t2 - t1)) ; tone = 3.0; nn = normalize(n + pd * 2.5); seam = 0.0; }
            else if (dot(pd, pd) < (pr + 0.09) * (pr + 0.09)) seam = 0.6;
          }
        } else if (style == 3.0) {
          // wood: grain running along the longest axis of the voxel's plank
          float g = sin((dot(q, t1) * 8.0 + hash3(floor(q * 0.25)) * 9.0) * 0.9) + (px - 0.5) * 0.8;
          tone = 1.5 + g * 1.2;
          seam = step(TEXN * ${VOX / 8}.0 - 1.0, mod(floor(dot(q, t2) * TEXN), TEXN * ${VOX / 8}.0)) * 0.8; // a plank every 1/8 m
        } else if (style == 4.0) {
          // brick: courses of 4×2 voxels with mortar lines
          vec3 b = q * vec3(0.5, 1.0, 0.5);
          float rw = floor(b.y);
          float off = mod(rw, 2.0) * 0.5;
          float u = fract(dot(b, t1 * vec3(1.0, 0.0, 1.0)) + off), v = fract(b.y);
          seam = (u < 0.06 || v < 0.12) ? 1.0 : 0.0;
          tone = hash3(vec3(floor(dot(b, t1) + off), rw, 1.0)) * 3.0 + (px - 0.5) * 0.8;
        } else if (style == 6.0) {
          // ore: chunky crystals / nuggets with bright facets
          tone = 1.0 + pl.x * 1.6 + (px > 0.62 ? 1.0 : 0.0);
          seam = step(pl.y, 0.1) * 0.8;
          nn = normalize(n + (hash33(vec3(pl.x * 9.0, 2.0, 7.0)) - 0.5) * 0.7);
          if (px > 0.8) accent = 1.0;
        } else if (style == 10.0) {
          // loose grain: gravel/sand pebbles per texel pair
          tone = hash3(floor(q * 4.0)) * 2.6 + 0.2 + (N2.r - 0.5) * 0.8;
          glin = 0.0045;
        } else if (style == 7.0) {
          tone = 1.0 + pl.x * 1.5 + (px - 0.5) * 0.6;
          wrap = 0.6;
        } else {
          // rock, crystal, ice: plates with crack seams and a lit lip; plates tilt so light catches them
          seam = step(pl.y, 0.1) * seamK;
          bevel = step(0.1, pl.y) * step(pl.y, 0.24) * seamK;
          tone += (pl.x - 0.5) * 1.2 + ((px - 0.5) * 0.28 + (clump - 0.5) * 0.34) * near + (N2.r - 0.5) * 0.7;
          vec3 rt = (vec3(hash3(vec3(pl.x, 1.0, 2.0)), hash3(vec3(pl.x, 3.0, 1.0)), hash3(vec3(pl.x, 2.0, 5.0))) - 0.5);
          // rock plates are rounded stones (the lamp lights one side, the other falls into shade);
          // crystal and ice plates are flat facets at random tilts
          nn = style == 0.0 ? normalize(n + dome * 1.6 + rt * 0.2) : normalize(n + rt * 0.6);
          if (style == 2.0 || style == 8.0) {
            wrap = 0.6;
            glin = info.r > 0.3 || style == 8.0 ? 0.02 : 0.004;
            if (pl.y < 0.06) { seam = 0.0; accent = 1.0; }
          } else {
            seam = max(seam, sline * 0.6);
            if (px > 0.99) accent = 1.0;
          }
        }
        // pixel-art relief: every texel tilts a little on a bumpy height field (two octaves) so the
        // helmet lamp rakes across each face and the rock reads as grainy, chiselled stuff
        {
          float bumpK = style == 3.0 ? 0.35 : style == 1.0 ? 0.6 : style == 2.0 || style == 8.0 ? 0.35 : style == 4.0 ? 0.5 : style == 5.0 ? 0.9 : 0.6;
          vec3 q1 = q + t1 / TEXN, q2 = q + t2 / TEXN;
          float hC = hash3(floor(q * TEXN * 0.25) + 1.7) * 0.5 + hash3(floor(q * TEXN * 0.5) + 2.3) * 0.32 + px * 0.18;
          float hX = hash3(floor(q1 * TEXN * 0.25) + 1.7) * 0.5 + hash3(floor(q1 * TEXN * 0.5) + 2.3) * 0.32 + hash3(floor(q1 * TEXN) + 3.1) * 0.18;
          float hY = hash3(floor(q2 * TEXN * 0.25) + 1.7) * 0.5 + hash3(floor(q2 * TEXN * 0.5) + 2.3) * 0.32 + hash3(floor(q2 * TEXN) + 3.1) * 0.18;
          nn = normalize(nn + (t1 * (hC - hX) + t2 * (hC - hY)) * 0.8 * bumpK * (0.35 + 0.65 * near));
        }
        // voxel edges where the surface turns away (the mesher's flags): the outer texel rows are a
        // chamfer leaning out, so the lamp picks every ledge and step out as a lit (or shaded) line.
        // About a pixel wide on screen; gone past ~9 m where voxels are a pixel themselves
        float bev = 0.0;
        if (vEdge > 0.5 && dist < 9.0 && style != 3.0 && style != 4.0) {
          float bw = min(floor(dist * 0.32) + 1.0, 3.0);
          vec3 lean = vec3(0.0);
          if (mod(vEdge, 2.0) > 0.5 && tx.x < bw) lean -= t1;
          if (mod(floor(vEdge * 0.5), 2.0) > 0.5 && tx.x > TEXN - 1.0 - bw) lean += t1;
          if (mod(floor(vEdge * 0.25), 2.0) > 0.5 && tx.y < bw) lean -= t2;
          if (floor(vEdge * 0.125) > 0.5 && tx.y > TEXN - 1.0 - bw) lean += t2;
          if (dot(lean, lean) > 0.0) {
            bev = clamp((9.0 - dist) / 3.0, 0.0, 1.0);
            nn = normalize(mix(nn, normalize(n + lean * 0.85), bev));
            seam *= 1.0 - bev;
          }
        }
        seam *= mix(0.55, 1.0, near);
        float ti = clamp(floor(tone + 0.5), 0.0, 3.0);
        vec3 base = accent > 0.5 ? pal(mat, 4.0) : pal(mat, ti);
        // crystal seams glow in the stone's own colour, not white
        if (accent > 0.5 && style == 2.0) base = mix(pal(mat, 3.0), base, 0.35) * 1.15;
        base *= (1.0 - seam * 0.62) * (1.0 + bevel * 0.24 * near + bev * 0.14);
        // each layer of the strata a little warmer or cooler than the next
        base *= 1.0 + ((hash3(vec3(layer, 1.3, 9.1)) - 0.5) * vec3(0.4, 0.28, 0.14) + (mod(layer, 2.0) - 0.5) * 0.2) * ex.a;
        float spec = ex.r, gloss = ex.g;

        // ---- the zone's mood on natural rock and soil (grow): big tint patches, mineral streaks,
        // damp, moss and rime on upward faces
        if (grow > 0.0) {
          // big patches: lighter and darker, warmer (iron) and cooler (clay, lime)
          base *= 1.0 + ((N1.b - 0.5) * vec3(0.26, 0.22, 0.18) + (N1.g - 0.5) * vec3(0.3, 0.06, -0.24)) * grow;
          float side = 1.0 - abs(n.y);
          vec4 SK = texture(noise3, vec3(qw.x * 0.42, qw.y * 0.045, qw.z * 0.42) + 0.63); // streaks running down
          float stain = smoothstep(0.68, 0.8, SK.g) * side * grow;
          base = mix(base, base * (N1.r > 0.5 ? vec3(1.3, 0.82, 0.52) : vec3(1.18, 1.14, 1.05)), stain * 0.55);
          float wet = clamp(mood.y * (smoothstep(0.42, 0.72, N1.b * 0.7 + SK.g * 0.5) * (0.6 + 0.4 * side) + smoothstep(0.62, 0.75, SK.r) * side * 0.3), 0.0, 1.0) * grow;
          base *= 1.0 - wet * 0.32;
          spec = max(spec, wet * 0.45);
          gloss = max(gloss, wet * 0.5);
          if (n.y > 0.5) {
            float ms = mood.x * smoothstep(0.42, 0.6, N2.r * 0.55 + N1.g * 0.45 + mood.x * 0.25 - 0.1 + (clump - 0.5) * 0.25);
            if (ms > 0.5) {
              base = pal(${M.MOSS}.0, clamp(floor(1.0 + clump * 1.8 + (N2.b - 0.5) + 0.5), 0.0, 3.0)) * 0.8;
              wrap = 0.55; spec = 0.06;
            }
            float rime = mood.z * smoothstep(0.45, 0.62, N2.b * 0.6 + N1.r * 0.4 + mood.z * 0.12 - 0.05 + (px - 0.5) * 0.2);
            if (rime > 0.5) { base = mix(base, pal(${M.SNOW}.0, 2.0 + step(0.8, px)), 0.85); spec = 0.35; gloss = 0.7; glin = 0.015; }
          } else if (mood.z > 0.0 && px > 0.93 - mood.z * 0.1 && N2.b > 0.55) {
            base = mix(base, pal(${M.SNOW}.0, 3.0), 0.7); glin = 0.02;
          }
        }

        // ---- light
        float ao = vAo * vAo * (3.0 - 2.0 * vAo);
        float aoL = mix(0.3, 1.0, ao);
        float shin = spec > 0.2 ? mix(6.0, 80.0, gloss) : 0.0;
        spec *= 0.35 + 0.65 * near; // small far facets would only flicker
        vec3 sp;
        vec3 L = lightFull(vWorld, shin > 0.0 && ex.r < 0.3 ? normalize(mix(n, nn, 0.4)) : nn, V, wrap, aoL, shin, sp);
        // translucent stone reflects less and glows from inside more (see below): deeper colour
        vec3 col = base * L * (1.0 - ex.b * 0.4);
        // glints: tinted by the stuff itself for crystal, ore and ice; quantized into pixel steps
        vec3 sc = sp * spec * mix(vec3(1.0), base / max(max(base.r, max(base.g, base.b)), 0.04), ex.b > 0.3 || style == 6.0 ? 0.7 : 0.15);
        float sm = max(sc.r, max(sc.g, sc.b));
        col += sm > 0.0 ? sc * (floor(sm * 5.0 + 0.35) / 5.0) / sm : vec3(0.0);
        // sparkles: single texels flash when the lamp (or a light) is on them
        if (glin > 0.0) {
          float tw = step(1.0 - glin, hash3(floor(q * TEXN) + floor(time * 3.0 + vh * 5.0) * 0.37));
          col += pal(mat, 4.0) * tw * min(1.5, dot(L, vec3(0.6)) * 2.0) * near;
        }
        // the lamp grazes edges seen side-on: a thin warm rim that shapes ledges and pillars
        col += base * lampCol * pow(1.0 - max(dot(nn, V), 0.0), 4.0) * lampAtt(dist) * 0.35 * aoL;
        // glowing materials (lanterns, crystals, magma, ore) and glowing accents
        float glow = info.r;
        if (glow > 0.0) col += base * glow * (0.6 + 0.4 * sin(time * 1.7 + vh * 6.283)) * (accent > 0.5 ? 1.6 : 0.55);
        // crystal and ice: light inside the stone. An inner layer of facets seen through the
        // surface (shifted along the view, so it parallaxes) glows faintly, brighter at the edges
        if (ex.b > 0.3 && dist < 9.0 && (style == 2.0 || style == 8.0 || style == 7.0)) {
          float vn = max(dot(V, n), 0.25);
          vec3 qi = q - (V / vn) * (2.2 + vh) + n * 0.5;
          vec3 ioff;
          vec2 pi = plates(floor(qi * TEXN) / TEXN, max(S * 0.8, 1.0), ioff);
          float inner = step(pi.y, 0.08) * (1.0 - step(pl.y, 0.1));
          // the glow is the stone's own colour (its accent is often white, which would wash it out)
          vec3 own = pal(mat, 2.0) * 1.3, acc = mix(pal(mat, 3.0), pal(mat, 4.0), 0.35);
          float fres = pow(1.0 - vn, 2.0);
          col += (acc * inner * (0.08 + glow * 0.4) + own * (0.015 + glow * 0.16) * (0.3 + fres)) * ex.b * (0.5 + 0.5 * near);
          col += base * ex.b * min(dot(L, vec3(0.33)), 0.6) * 0.18; // light soaking through
        }
        if (style == 2.0 && accent > 0.5) col += base * 0.25 * L;
        // ore reads from across a cave: a little light of its own and facets that twinkle
        if (style == 6.0) {
          col += base * 0.16;
          float tw = step(0.975, hash3(floor(q * TEXN) + floor(time * 2.5 + vh * 7.0) * 0.37));
          col += pal(mat, 4.0) * tw * 1.4;
        }
        // hot zones: cracks in volcanic rock glow and breathe
        if (hot > 0.5 && mood.w > 0.0) {
          float pulse = 0.7 + 0.3 * sin(time * 1.3 + N1.r * 9.0);
          float hpt = smoothstep(0.58, 0.8, N1.r * 0.7 + N2.g * 0.3);
          float crack = max(step(pl.y, 0.05), step(0.93, N2.a)) * hpt;
          col += vec3(1.0, 0.3, 0.05) * crack * mood.w * pulse * 0.75;
          col += vec3(0.3, 0.06, 0.015) * mood.w * hpt * 0.16 * pulse;
        }
        // a soft shoulder: pale ice and crystal right under the lamp keep their colour instead of
        // clipping to white
        vec3 hi = max(col - 0.62, 0.0);
        col = min(col, 0.62) + hi / (1.0 + hi * 1.6);
        // impact flash on the struck rock
        float hd = length(vWorld - hit.xyz);
        col += vec3(1.0, 0.86, 0.6) * hit.w * clamp(1.0 - hd / 0.45, 0.0, 1.0);
        col = caveAir(col, vWorld, dist);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * Uniforms the fluid surfaces share with Fluids.js (added to U once; existing keys untouched):
 * fRip[8] ripple rings (x, y, z, start time) + fRipK[8] strength (< 0 starts as a bulge: lava bloops),
 * fJig a jelly wobble around the last big splash (x, y, z, spring height), fLake[2] / fLakeDrop[2]
 * draining lakes (centre x, top plane y, centre z, radius) and how far their top layer has sunk (m).
 */
export function fluidUniforms(U) {
  if (!U.fRip) {
    const rip = [];
    for (let i = 0; i < 8; i++) rip.push(new THREE.Vector4(0, -9999, 0, -99));
    U.fRip = { value: rip };
    U.fRipK = { value: new Float32Array(8) };
    U.fJig = { value: new THREE.Vector4(0, -9999, 0, 0) };
    U.fLake = { value: [new THREE.Vector4(0, -9999, 0, 0), new THREE.Vector4(0, -9999, 0, 0)] };
    U.fLakeDrop = { value: new Float32Array(2) };
  }
  return U;
}

// surface height offset (h, dh/dx, dh/dz) at p (xz, m) on a sheet at height y: a slow swell,
// damped-spring ripple rings (the centre dips, springs back past rest and rings outward) and the
// jelly wobble. Fluids.js mirrors this in JS so the swimming mole bobs on the same waves.
const FLUID_SURF = /* glsl */`
  uniform vec4 fRip[8];
  uniform float fRipK[8];
  uniform vec4 fJig;
  vec3 fsurf(vec2 p, float y, float lava, float amp) {
    float t = time;
    float s = mix(1.0, 0.4, lava);
    vec2 d1 = vec2(0.8, 0.6) * 2.4, d2 = vec2(-0.45, 0.89) * 3.6, d3 = vec2(0.96, -0.28) * 6.1;
    float a1 = 0.011 * amp, a2 = 0.007 * amp, a3 = 0.0035 * amp * (1.0 - lava);
    float p1 = dot(p, d1) + t * 1.4 * s, p2 = dot(p, d2) - t * 1.9 * s, p3 = dot(p, d3) + t * 3.1;
    vec3 h = vec3(a1 * sin(p1), a1 * cos(p1) * d1) + vec3(a2 * sin(p2), a2 * cos(p2) * d2) + vec3(a3 * sin(p3), a3 * cos(p3) * d3);
    float spd = mix(1.3, 0.5, lava), kk = mix(14.0, 8.0, lava), damp = mix(1.6, 1.0, lava);
    for (int i = 0; i < 8; i++) {
      float k = fRipK[i];
      if (k == 0.0) continue;
      vec4 r = fRip[i];
      float age = t - r.w;
      if (age < 0.0 || age > 4.5 || abs(y - r.y) > 0.7) continue;
      vec2 dv = p - r.xz;
      float d = length(dv);
      float front = age * spd + 0.12;
      if (d > front + 0.3) continue;
      float env = exp(-age * damp) * (1.0 - smoothstep(front - 0.15, front + 0.3, d)) / (1.0 + d * 2.2);
      float ph = kk * d - kk * spd * 0.9 * age;
      float A = -0.075 * k * amp * env;
      h.x += A * cos(ph);
      h.yz -= A * kk * sin(ph) * dv / max(d, 1e-3);
    }
    if (fJig.w != 0.0 && abs(y - fJig.y) < 0.7) {
      vec2 q = p - fJig.xz;
      float fall = exp(-dot(q, q) * 0.15) * amp * fJig.w;
      float sx = sin(q.x * 3.3 + 0.7), sz = sin(q.y * 2.9 + 1.3);
      h.x += fall * sx * sz;
      h.yz += fall * vec2(3.3 * cos(q.x * 3.3 + 0.7) * sz, 2.9 * sx * cos(q.y * 2.9 + 1.3));
    }
    return h;
  }
`;

/**
 * Water and lava. Surfaces bend (per-voxel vertices ride the swell, ripples and jelly wobble) and
 * are shaded as pixel art: 64 texels per meter, colours quantized to the palette's tones with
 * Bayer dithering. Water: depth tint, caustic cell network, foam at shores / flow fronts / crests,
 * stepped glints from the lamp and nearby lights, streaks on falling sheets. Lava: drifting crust
 * plates that crack open and heal, glowing seams, pulsing heat, bulges that glow hotter.
 */
export function makeFluidMaterial(U) {
  fluidUniforms(U);
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 vdata;
      attribute vec4 fdata;
      uniform float time;
      uniform vec4 fLake[2];
      uniform float fLakeDrop[2];
      ${FLUID_SURF}
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vMat;
      varying vec4 vInfo;
      varying vec2 vFlow;
      varying float vTopE;
      const vec3 NRM[6] = vec3[6](vec3(1.,0.,0.), vec3(-1.,0.,0.), vec3(0.,1.,0.), vec3(0.,-1.,0.), vec3(0.,0.,1.), vec3(0.,0.,-1.));
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float lava = vdata.y > 40.5 ? 1.0 : 0.0;
        float depth = fdata.x / 64.0;
        vTopE = mod(vdata.z, 2.0) > 0.5 ? 1.0 : 0.0; // 1 along the surface, 0 down a side face
        if (vTopE > 0.5) {
          for (int i = 0; i < 2; i++) {
            if (fLakeDrop[i] > 0.0 && abs(wp.y - fLake[i].y) < 0.01 && length(wp.xz - fLake[i].xz) < fLake[i].w + 0.6) wp.y -= fLakeDrop[i];
          }
          wp.y += fsurf(wp.xz, wp.y, lava, clamp(depth / 0.25, 0.15, 1.0)).x;
        }
        vWorld = wp.xyz;
        vN = NRM[int(vdata.x + 0.5)];
        vMat = vdata.y;
        vInfo = vec4(vdata.w / 255.0, fdata.w / 255.0, depth, vdata.z);
        vFlow = (fdata.yz - 128.0) / 16.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D palette;
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vMat;
      varying vec4 vInfo; // shore foam, open-edge foam, column depth (m), flags
      varying vec2 vFlow;
      varying float vTopE;
      ${LIGHT}
      ${FLUID_SURF}
      vec3 pal(float m, float c) { return texture2D(palette, vec2((c + 0.5) / 8.0, (m + 0.5) / 256.0)).rgb; }
      float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // moving cells: x nearest distance, y second nearest, z id of the nearest
      vec3 cells(vec2 p, float t) {
        vec2 g = floor(p), f = fract(p);
        float f1 = 9.0, f2 = 9.0, id = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(float(i), float(j));
          float h = fh(g + c);
          vec2 o = 0.5 + 0.38 * sin(t + 6.2831 * vec2(h, fh(g + c + 17.3)));
          float d = length(c + o - f);
          if (d < f1) { f2 = f1; f1 = d; id = h; } else if (d < f2) f2 = d;
        }
        return vec3(f1, f2, id);
      }
      float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

      void main() {
        bool lava = vMat > 40.5;
        vec3 fn = vN;
        bool top = fn.y > 0.5, bottom = fn.y < -0.5;
        float flags = vInfo.w;
        bool falling = mod(floor(flags / 2.0), 2.0) > 0.5;
        float depth = vInfo.z;
        float dist = length(vWorld - lampPos);
        // the face's own pixel grid: 64 texels per meter, like the rock
        vec2 fp = top || bottom ? vWorld.xz : vec2(abs(fn.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
        vec2 px = floor(fp * 64.0);
        vec2 uv = (px + 0.5) / 64.0;
        float dith = bayer4(px);
        float amp = clamp(depth / 0.25, 0.15, 1.0);
        vec3 hs = top ? fsurf(uv, vWorld.y, lava ? 1.0 : 0.0, amp) : vec3(0.0);
        vec3 n = top ? normalize(vec3(-hs.y, 1.0, -hs.z)) : fn;
        bool under = !gl_FrontFacing;
        if (under) n = -n;
        vec3 V = normalize(lampPos - vWorld);
        float nv = max(dot(n, V), 0.0);
        vec2 flow = vFlow;
        float fs = min(1.0, length(flow));
        vec3 col;
        float alpha;
        if (!lava) {
          float dk = clamp(depth / 1.6, 0.0, 1.0);
          vec2 q = uv - flow * time * 0.8;
          vec3 L = lightAt(vWorld, n);
          vec3 acc = pal(vMat, 4.0);
          if (top) {
            // tone bands: deep water dark, shallows light; ripple crests a band lighter, troughs darker
            float hn = clamp(hs.x / (0.02 * amp), -3.0, 3.0);
            float b = mix(2.35, 1.15, dk) + (hs.y - hs.z) * 0.5 + (vnoise(q * 1.3 + vec2(time * 0.1, -time * 0.08)) - 0.5) * 0.5;
            b += step(1.3, hn) - step(hn, -1.3);
            vec3 base = pal(vMat, clamp(floor(b + (dith - 0.5) * 0.3), 0.0, 3.0));
            base = mix(base, base * vec3(0.7, 1.25, 1.05), (1.0 - dk) * 0.6);
            col = base * (L * 1.2 + 0.035);
            // caustic glints: thin broken lines drifting over the surface, faintly self-lit
            vec2 cq = q * 1.5 + vec2(time * 0.1, time * 0.07);
            cq += (vec2(vnoise(q * 0.9 + 1.7), vnoise(q * 0.9 + 8.3)) - 0.5) * 0.9;
            vec3 c = cells(cq, time * 0.7);
            float brk = step(0.6, vnoise(q * 1.2 + vec2(-time * 0.25, time * 0.18)));
            float caus = step(c.y - c.x, 0.035) * brk;
            col = mix(col, pal(vMat, 3.0) * (L * 1.4 + 0.14), caus * mix(0.7, 0.22, dk));
            // foam in crisp pixel clusters: a lapping line at shores, streaks riding fast flow, the
            // ragged edge of a spreading front, crests of big rings
            float lap = 0.5 + 0.5 * sin(time * 2.4 + (uv.x - uv.y) * 3.0);
            vec2 fd = fs > 0.05 ? flow / length(flow) : vec2(1.0, 0.0);
            vec2 sq = vec2(dot(q, fd), dot(q, vec2(-fd.y, fd.x)));
            float streak = vnoise(vec2(sq.x * 1.4, sq.y * 11.0) + 5.0);
            float grain = vnoise(floor(px * 0.5) * 0.3 + vec2(time * 1.3, -time * 0.9));
            float fm = step(1.0 - vInfo.x * (0.25 + 0.3 * lap), grain);
            fm = max(fm, step(0.84 - fs * 0.05, streak) * step(0.35, fs));
            fm = max(fm, step(1.0 - vInfo.y * 0.45, grain));
            fm = max(fm, step(1.8, hn) * step(0.35, grain));
            col = mix(col, acc * (L * 0.85 + 0.14), fm * 0.85);
            // glints off wave facets: the helmet lamp (at the eye) and nearby lights, in pixel steps
            float att = clamp(1.0 - dist / lampRange, 0.0, 1.0);
            float cone = smoothstep(0.6, 0.95, dot(-V, lampDir));
            vec3 sc = lampCol * pow(max(2.0 * nv * nv - 1.0, 0.0), 30.0) * att * (0.5 + cone);
            for (int i = 0; i < ${MAX_LIGHTS}; i++) {
              vec3 lq = lPos[i].xyz - vWorld;
              float ld = length(lq);
              float la = clamp(1.0 - ld / lPos[i].w, 0.0, 1.0);
              if (la <= 0.0) continue;
              vec3 H = normalize(lq / ld + V);
              sc += lCol[i] * la * pow(max(dot(n, H), 0.0), 160.0) * 1.6;
            }
            float g = max(sc.r, max(sc.g, sc.b));
            // reflections break into twinkling pixels on the wavelets, tinted by their light
            float sparkle = step(0.5, vnoise(px * 0.25 + vec2(time * 3.1, -time * 2.3)));
            float tw = step(0.992, fh(floor(px * 0.5) + floor(time * 6.0) * 13.1)) * att * (0.3 + cone);
            // a faint sheen toward the horizon, where water reflects the cave's glow
            col += pal(vMat, 3.0) * pow(1.0 - nv, 5.0) * (0.2 + 0.5 * dot(L, vec3(0.33)));
            col += step(0.2, g) * sparkle * (sc / max(g, 1e-3)) * 0.65 + tw * acc * 1.1;
            alpha = mix(mix(0.6, 0.88, dk), 0.96, pow(1.0 - nv, 4.0));
            alpha = max(alpha, fm * 0.92);
            if (under) {
              // the surface seen from below: a bright window straight up, darker toward the edges,
              // ripple rings and caustic threads drifting across it
              float win = floor(clamp((nv - 0.35) * 2.2, 0.0, 1.0) * 3.0 + dith * 0.5) / 3.0;
              float wv = step(0.55, vnoise(q * 1.6 + vec2(time * 0.15, -time * 0.1)) + hn * 0.15);
              col = mix(pal(vMat, 2.0), pal(vMat, 3.0), clamp(win * 0.7 + wv * 0.3, 0.0, 1.0)) * (L * 0.8 + 0.1);
              col += acc * (L * 0.6 + 0.12) * (caus * 0.9 + step(1.3, hn) * 0.4);
              alpha = mix(0.88, 0.62, win);
            }
          } else if (!bottom) {
            // falling sheets and the little cascades between levels: streaks rushing down, foamy lip
            float s = fh(vec2(floor(px.x * 0.5), 3.0));
            float run = fract(uv.y * 1.7 + time * (falling ? 2.6 : 0.5) + s * 3.0);
            float b = (falling ? 1.6 : 1.2) + step(0.7, run) * (falling ? 1.4 : 0.7) + (s - 0.5) * 0.8;
            vec3 Ls = lightAt(vWorld, vec3(0.0, 0.7, 0.0) + fn * 0.3);
            col = pal(vMat, clamp(floor(b), 0.0, 3.0)) * (Ls * 1.2 + 0.05);
            // foam: flecks rushing down a falling sheet; a ragged rim along the top of a pool's edge
            float rim = step(0.82, vTopE + (fh(vec2(floor(px.x * 0.5), floor(time * 4.0))) - 0.5) * 0.12);
            float lip = falling ? step(0.88, run) : rim;
            col = mix(col, acc * (Ls * 0.9 + 0.14), lip * 0.8);
            alpha = falling ? 0.84 : 0.76;
          } else {
            col = pal(vMat, 1.0 + step(0.5, dith)) * (L + 0.04);
            alpha = 0.8;
          }
        } else {
          vec2 q = uv + flow * time * 0.22;
          float heat;
          float id = 0.0;
          if (top || bottom) {
            // crust plates drift and slowly turn; each lives a cycle: molten → crusted → cracking open
            vec2 wq = q * 1.4 + vec2(time * 0.04, time * 0.025);
            wq += (vec2(vnoise(q * 0.8 + 3.1), vnoise(q * 0.8 + 9.7)) - 0.5) * 1.1; // irregular plates
            vec3 c = cells(wq, time * 0.12);
            id = c.z;
            float life = fract(id * 3.7 + time * 0.045);
            float crust = smoothstep(0.05, 0.3, life) * (1.0 - smoothstep(0.72, 0.97, life));
            float edge = c.y - c.x;
            float gap = mix(0.5, 0.07, crust);
            vec3 ci = cells(q * 4.5 + id * 7.0, 0.0);
            float crack = (1.0 - step(0.04 + (1.0 - crust) * 0.1, ci.y - ci.x)) * step(0.5, life);
            heat = 1.0 - smoothstep(gap * 0.35, gap, edge);
            heat = max(heat, crack * 0.8);
            heat = max(heat, (1.0 - crust) * 0.85);
          } else {
            // a falling tongue: molten streaks with crust bits sliding down
            float s = fh(vec2(floor(px.x * 0.25), 7.0));
            float run = fract(uv.y * 0.9 + time * (falling ? 0.7 : 0.15) + s * 3.0);
            heat = 0.55 + step(0.6, run) * 0.4 - step(0.92, run) * 0.6 + (s - 0.5) * 0.3;
            id = s;
          }
          heat += hs.x * 14.0 + (vnoise(q * 3.0 + time * 0.3) - 0.5) * 0.35 + fs * 0.25;
          float pulse = 0.88 + 0.12 * sin(time * 1.7 + id * 6.28) + 0.05 * sin(time * 4.3 + uv.x * 2.0);
          float b = clamp(floor(heat * 5.0 + (dith - 0.5) * 0.6), 0.0, 5.0);
          vec3 L = lightAt(vWorld, n);
          float shade = step(0.5, fract(id * 13.7)) * 0.35 + 1.0;
          if (b < 0.5) col = vec3(0.022, 0.009, 0.007) * shade * (L * 1.3 + 0.6) + vec3(0.03, 0.004, 0.0) * pulse;
          else if (b < 1.5) col = vec3(0.07, 0.02, 0.011) * shade * (L * 1.3 + 0.6) + vec3(0.1, 0.012, 0.0) * pulse;
          else if (b < 2.5) col = vec3(0.42, 0.045, 0.008) * pulse;
          else if (b < 3.5) col = pal(vMat, 1.0) * 1.35 * pulse;
          else if (b < 4.5) col = pal(vMat, 2.0) * 1.5 * pulse;
          else col = mix(pal(vMat, 3.0), pal(vMat, 4.0), step(0.5, dith)) * 1.6 * pulse;
          alpha = 1.0;
        }
        float fogK = 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2);
        col = mix(col, fogCol, fogK * (lava ? 0.65 : 1.0));
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

/**
 * Lit, fogged vertex-colour material for voxel objects (debris, pickups, creatures, ruins).
 * opts.emissive: self glow (0..1); opts.texel: pixel-art texels per object unit (0 = flat colours),
 * e.g. 64 for a mesh built at 1/8 m per voxel → 8 texels per voxel face like the terrain.
 */
export function makeObjectMaterial(U, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, emissive: { value: opts.emissive || 0 }, fade: { value: 1 }, texel: { value: opts.texel || 0 }, flash: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vNo;
      void main() {
        vColor = color;
        vLocal = position;
        vNo = normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float emissive;
      uniform float time;
      uniform float texel;
      uniform float flash;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vNo;
      float h3o(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      ${LIGHT}
      ${AIR}
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(lampPos - vWorld);
        vec3 sp;
        vec3 L = lightFull(vWorld, n, V, 0.3, 1.0, 24.0, sp);
        vec3 c = vColor; // Color.setHex already converted to linear
        if (texel > 0.0) {
          // the same chunky texel dither as the rock it came from
          vec3 q = floor(vLocal * texel - vNo * 0.5);
          float k = h3o(q + 3.1), k2 = h3o(floor(q * 0.25) + 5.3);
          c *= 0.8 + 0.3 * k + 0.14 * k2;
        }
        vec3 col = c * L + sp * 0.06 + c * emissive * (0.8 + 0.2 * sin(time * 3.0));
        col = mix(col, vec3(1.0, 0.95, 0.9), flash);
        col = caveAir(col, vWorld, length(vWorld - lampPos));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * GLSL chunks for other materials of the mine (they need the uniforms of makeTerrainUniforms, e.g.
 * `uniforms: { ...U }`): LIGHT gives lightAt(p, n) / lightFull(...) / ambientAt(n); AIR (after
 * LIGHT, with fogCol and fogDist declared) gives caveAir(col, p, dist), the fog + mist + dust glow
 * the terrain uses, and fogAmount(dist) / airGlow(dir, dist).
 */
export { LIGHT, AIR };
