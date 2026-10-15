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
    float cone = smoothstep(0.42, 0.9, dot(-dl, lampDir));
    float att = clamp(1.0 - dist / lampRange, 0.0, 1.0);
    att *= 2.0 - att; // reaches across a cavern, falls off at the edge of the range
    att *= 1.0 / (1.0 + dist * dist * 0.03);
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
        float tone = pl.x * 3.0 + ((px - 0.5) * 0.9 + (clump - 0.5) * 0.7) * near;
        float bevel = 0.0;
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
          tone += ((px - 0.5) * 0.6 + (clump - 0.5) * 0.5) * near;
          seam = step(pl.y, 0.1) * seamK * 0.6;
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
          seam = step(pl.y, 0.1) * 0.8;
          if (px > 0.9) accent = 1.0;
        } else if (style == 10.0) {
          // loose grain: gravel/sand pebbles per texel pair
          tone = hash3(floor(q * 4.0)) * 3.2;
          seam = 0.0;
        } else {
          // rock, crystal, ice: plates with crack seams; plates tilt a little so light catches them
          // one-texel crack lines with a lit lip on the plate side (pixel-art bevel)
          seam = step(pl.y, 0.1) * seamK;
          bevel = step(0.1, pl.y) * step(pl.y, 0.24) * seamK;
          nn = normalize(n + (vec3(hash3(vec3(pl.x, 1.0, 2.0)), hash3(vec3(pl.x, 3.0, 1.0)), hash3(vec3(pl.x, 2.0, 5.0))) - 0.5) * 0.45);
          if (style == 2.0 || style == 8.0) { if (pl.y < 0.06) { seam = 0.0; accent = 1.0; } }
          else if (px > 0.975) accent = 1.0;
        }
        seam *= mix(0.55, 1.0, near);
        float ti = clamp(floor(tone + 0.5), 0.0, 3.0);
        vec3 base = accent > 0.5 ? pal(mat, 4.0) : pal(mat, ti);
        base *= (1.0 - seam * 0.6) * (1.0 + bevel * 0.22 * near);
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
 * Vertex-coloured voxel objects lit like the terrain (debris, pickups, props, creatures).
 * opts.emissive: 0..1 self-light (glowing ore, crystals).
 */
/**
 * Lit, fogged vertex-colour material for voxel objects (debris, pickups, creatures).
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
      void main() {
        vec3 L = lightAt(vWorld, normalize(vN));
        vec3 c = vColor; // Color.setHex already converted to linear
        if (texel > 0.0) {
          // the same chunky texel dither as the rock it came from
          vec3 q = floor(vLocal * texel - vNo * 0.5);
          float n = h3o(q + 3.1), k = h3o(floor(q * 0.25) + 5.3);
          c *= 0.8 + 0.3 * n + 0.14 * k;
        }
        vec3 col = c * L + c * emissive * (0.8 + 0.2 * sin(time * 3.0));
        col = mix(col, vec3(1.0, 0.95, 0.9), flash);
        float dist = length(vWorld - lampPos);
        col = mix(col, fogCol, 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export { LIGHT };
