// Shaders for the underground: voxel terrain (per-voxel color picked by world position, stone
// "plates", bevelled voxel edges up close, baked AO, the helmet lamp and up to 8 point lights,
// glowing materials, fog) and fluid surfaces (water / lava).
import * as THREE from 'three';
import { makePaletteTexture } from './materials.js';

export const MAX_LIGHTS = 8;

export function makeTerrainUniforms() {
  const lPos = [], lCol = [];
  for (let i = 0; i < MAX_LIGHTS; i++) { lPos.push(new THREE.Vector4(0, -9999, 0, 1)); lCol.push(new THREE.Vector3()); }
  return {
    palette: { value: makePaletteTexture() },
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
  };
}

const LIGHT = /* glsl */`
  uniform vec4 lPos[${MAX_LIGHTS}];
  uniform vec3 lCol[${MAX_LIGHTS}];
  uniform vec3 lampPos;
  uniform vec3 lampDir;
  uniform vec3 lampCol;
  uniform float lampRange;
  uniform vec3 ambient;
  vec3 lightAt(vec3 p, vec3 n) {
    vec3 L = ambient;
    // helmet lamp: a soft spot along the view, strong falloff
    vec3 d = lampPos - p;
    float dist = length(d);
    vec3 dl = d / max(dist, 1e-4);
    float cone = smoothstep(0.55, 0.92, dot(-dl, lampDir));
    float att = clamp(1.0 - dist / lampRange, 0.0, 1.0);
    att *= att;
    float wrap = max(dot(n, dl), 0.0) * 0.8 + 0.2;
    L += lampCol * att * wrap * (0.28 + cone * 0.95);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 q = lPos[i].xyz - p;
      float r = lPos[i].w;
      float dd = length(q);
      float a = clamp(1.0 - dd / r, 0.0, 1.0);
      if (a <= 0.0) continue;
      a *= a;
      L += lCol[i] * a * (max(dot(n, q / max(dd, 1e-4)), 0.0) * 0.75 + 0.25);
    }
    return L;
  }
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
      const vec3 NRM[6] = vec3[6](vec3(1.,0.,0.), vec3(-1.,0.,0.), vec3(0.,1.,0.), vec3(0.,-1.,0.), vec3(0.,0.,1.), vec3(0.,0.,-1.));
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = NRM[int(vdata.x + 0.5)];
        vMat = vdata.y;
        vAo = vdata.z / 3.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D palette;
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      uniform vec4 hit;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vMat;
      varying float vAo;
      ${LIGHT}
      float hash3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      vec3 pal(float m, float col) { return texture2D(palette, vec2((col + 0.5) / 8.0, (m + 0.5) / 256.0)).rgb; }

      // rock plates: jittered-grid Voronoi on the texel position q (in voxels); x = id hash, y = edge distance (voxels)
      vec2 plates(vec3 q, float S) {
        vec3 g = floor(q / S - 0.5);
        float f1 = 1e9, f2 = 1e9; vec3 id = vec3(0.0);
        for (int k = 0; k < 8; k++) {
          vec3 c = g + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
          vec3 fp = (c + 0.5 + (hash33(c) - 0.5) * 0.85) * S;
          float d = dot(q - fp, q - fp);
          if (d < f1) { f2 = f1; f1 = d; id = c; } else if (d < f2) { f2 = d; }
        }
        return vec2(hash3(id + 7.7), (sqrt(f2) - sqrt(f1)) * 0.5);
      }

      void main() {
        vec3 n = vNormal;
        float dist = length(vWorld - lampPos);
        float near = clamp(1.0 - (dist - 3.0) / 5.0, 0.0, 1.0); // pixel detail fades with distance
        vec3 vox = floor(vWorld * 8.0 - n * 0.5);
        // face axes and the texel (8x8 per voxel face) this fragment is in
        vec3 t1 = abs(n.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
        vec3 t2 = abs(n.y) > 0.5 ? vec3(0., 0., 1.) : vec3(0., 1., 0.);
        vec3 lp = vWorld * 8.0 - vox;
        vec2 uv = vec2(dot(lp, t1), dot(lp, t2));
        vec2 tx = clamp(floor(uv * 8.0), 0.0, 7.0);
        vec3 q = vox + (tx.x + 0.5) / 8.0 * t1 + (tx.y + 0.5) / 8.0 * t2 + n * 0.49 + 0.5 * (1.0 - abs(n)) * 0.0;
        vec4 st = texture2D(palette, vec2(6.5 / 8.0, (vMat + 0.5) / 256.0));
        float style = floor(st.r * 255.0 + 0.5);
        float S = st.g * 255.0 / 16.0;
        float seamK = st.b;
        vec4 info = texture2D(palette, vec2(5.5 / 8.0, (vMat + 0.5) / 256.0));
        float mat = vMat;
        float px = hash3(floor(q * 8.0) + 3.1); // per-texel noise
        float vh = hash3(vox);
        vec2 pl = plates(q, max(S, 1.0));
        // tone: plate shade + clumps (a quarter voxel) + per-texel dither, all crisper up close
        float clump = hash3(floor(q * 2.0) + 5.3);
        float tone = pl.x * 3.0 + ((px - 0.5) * 1.5 + (clump - 0.5) * 0.9) * near;
        float seam = 0.0;
        float accent = 0.0;
        vec3 nn = n;

        if (style == 5.0) {
          // moss: green on top, dirt on the sides with a ragged green fringe
          if (n.y < 0.5) {
            float fringe = n.y < -0.5 ? 0.0 : step(6.0 - floor(hash3(vec3(vox.xz, tx.x)) * 3.0), tx.y);
            if (fringe < 0.5) mat = 1.0;
          } else if (px > 0.82) accent = 1.0;
        } else if (style == 1.0) {
          // soil: soft clumps, pebbles
          seam = smoothstep(0.08, 0.0, pl.y) * seamK * 0.6;
          if (hash3(floor(q * 2.0) + 11.0) > 0.93 && px > 0.35) accent = 1.0;
        } else if (style == 3.0) {
          // wood: grain running along the longest axis of the voxel's plank
          float g = sin((dot(q, t1) * 8.0 + hash3(floor(q * 0.25)) * 9.0) * 0.9) + (px - 0.5) * 0.8;
          tone = 1.5 + g * 1.2;
          seam = step(7.0, mod(floor(dot(q, t2) * 8.0), 8.0)) * 0.8;
        } else if (style == 4.0) {
          // brick: courses of 4×2 voxels with mortar lines
          vec3 b = q * vec3(0.5, 1.0, 0.5);
          float row = floor(b.y);
          float off = mod(row, 2.0) * 0.5;
          float u = fract(dot(b, t1 * vec3(1.0, 0.0, 1.0)) + off), v = fract(b.y);
          seam = (u < 0.06 || v < 0.12) ? 1.0 : 0.0;
          tone = hash3(vec3(floor(dot(b, t1) + off), row, 1.0)) * 3.0 + (px - 0.5) * 0.8;
        } else if (style == 6.0) {
          // ore: chunky crystals / nuggets with bright facets
          tone = 1.0 + pl.x * 1.6 + (px > 0.7 ? 1.0 : 0.0);
          seam = smoothstep(0.06, 0.0, pl.y) * 0.8;
          if (px > 0.9) accent = 1.0;
        } else if (style == 10.0) {
          // loose grain: gravel/sand pebbles per texel pair
          tone = hash3(floor(q * 4.0)) * 3.2;
          seam = 0.0;
        } else {
          // rock, crystal, ice: plates with crack seams; plates tilt a little so light catches them
          seam = smoothstep(0.07, 0.0, pl.y) * seamK;
          nn = normalize(n + (vec3(hash3(vec3(pl.x, 1.0, 2.0)), hash3(vec3(pl.x, 3.0, 1.0)), hash3(vec3(pl.x, 2.0, 5.0))) - 0.5) * 0.45);
          if (style == 2.0 || style == 8.0) { if (pl.y < 0.06) { seam = 0.0; accent = 1.0; } }
          else if (px > 0.975) accent = 1.0;
        }
        seam *= mix(0.55, 1.0, near);
        float ti = clamp(floor(tone + 0.5), 0.0, 3.0);
        vec3 base = accent > 0.5 ? pal(mat, 4.0) : pal(mat, ti);
        base *= 1.0 - seam * 0.55;
        float lit = (0.45 + 0.55 * vAo);
        lit *= 1.0 + n.y * 0.1;
        vec3 L = lightAt(vWorld, nn);
        vec3 col = base * L * lit;
        // glowing materials (lanterns, crystals, magma, ore) and glowing accents
        float glow = info.r;
        if (glow > 0.0) col += base * glow * (0.6 + 0.4 * sin(time * 1.7 + vh * 6.283)) * (accent > 0.5 ? 1.6 : 0.55);
        if (style == 2.0 && accent > 0.5) col += base * 0.25 * L;
        // impact flash on the struck rock
        float hd = length(vWorld - hit.xyz);
        col += vec3(1.0, 0.86, 0.6) * hit.w * clamp(1.0 - hd / 0.45, 0.0, 1.0);
        float fogK = 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2);
        col = mix(col, fogCol, fogK);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function makeFluidMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 vdata;
      uniform float time;
      varying vec3 vWorld;
      varying float vMat;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vMat = vdata.y;
        if (vdata.x > 1.5 && vdata.x < 2.5) wp.y += sin(time * 1.8 + wp.x * 2.1 + wp.z * 1.7) * 0.025 - 0.04;
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D palette;
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      varying vec3 vWorld;
      varying float vMat;
      ${LIGHT}
      vec3 pal(float m, float col) { return texture2D(palette, vec2((col + 0.5) / 8.0, (m + 0.5) / 256.0)).rgb; }
      void main() {
        vec3 p = floor(vWorld * 16.0) / 16.0;
        float w1 = sin(p.x * 5.1 + time * 1.3) * sin(p.z * 4.3 - time * 1.1);
        float w2 = sin((p.x + p.z) * 9.0 - time * 2.2);
        bool lava = vMat > 40.5;
        vec3 col;
        float a;
        float dist = length(vWorld - lampPos);
        if (lava) {
          float k = clamp(w1 * 0.5 + 0.5 + w2 * 0.2, 0.0, 1.0);
          col = mix(pal(vMat, 1.0), pal(vMat, 3.0), floor(k * 4.0) / 4.0) * 2.2;
          a = 1.0;
        } else {
          vec3 L = lightAt(vWorld, vec3(0.0, 1.0, 0.0));
          col = mix(pal(vMat, 1.0), pal(vMat, 3.0), w1 * 0.5 + 0.5) * (L * 1.1 + 0.05);
          col += pal(vMat, 4.0) * step(0.86, w2) * L * 0.6;
          a = 0.72;
        }
        float fogK = 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2);
        col = mix(col, fogCol, fogK);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

/**
 * Vertex-coloured voxel objects lit like the terrain (debris, pickups, props, creatures).
 * opts.emissive: 0..1 self-light (glowing ore, crystals).
 */
export function makeObjectMaterial(U, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, emissive: { value: opts.emissive || 0 }, fade: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vColor = color;
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
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      ${LIGHT}
      void main() {
        vec3 L = lightAt(vWorld, normalize(vN));
        vec3 c = vColor; // Color.setHex already converted to linear
        vec3 col = c * L + c * emissive * (0.8 + 0.2 * sin(time * 3.0));
        float dist = length(vWorld - lampPos);
        col = mix(col, fogCol, 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export { LIGHT };
