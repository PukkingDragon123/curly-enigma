// Water light on the rock: caustics dancing on floors and walls under water, and the wavering
// light a pool throws onto the walls just above it (plus a dark wet band at the waterline).
//
// The terrain shader learns where the water is from a small height map around the mole (WaterMap:
// 128×128 texels of 1/8 m, re-centred as the mole moves): per column the top and bottom of the
// water, and for dry columns how close the nearest water is and how high its surface stands.
// `patchTerrain(mat)` adds `wc_light()` to the terrain material at runtime (onBeforeCompile) and
// multiplies the final colour by it; the water shader uses the same `wc_caustic()` for the floor it
// sees through the surface when the terrain isn't patched.
import * as THREE from 'three';
import { VOX } from '../materials.js';
import { CS } from '../Generator.js';
import { FLUID } from '../Mesher.js';

const N = 128; // texels per side
const TEX = 8; // texels per meter
const SIZE = N / TEX; // 16 m
const VPT = VOX / TEX; // voxels per texel
const CB = Math.log2(CS), CM = CS - 1;
const NONE = -32768;
const DXS = [0, 1, -1, 0, 0], DZS = [0, 0, 0, 1, -1];

/** Animated caustic network (p in meters; returns 0 .. ~1.6). Shared by terrain and water. */
export const CAUSTIC_GLSL = /* glsl */`
  vec2 wc_h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float wc_edge(vec2 p, float t) {
    vec2 g = floor(p), f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * wc_h2(g + c));
      float d = length(c + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
  }
  float wc_caustic(vec2 p, float t) {
    float a = wc_edge(p * 2.7, t * 0.9);
    float b = wc_edge(p * 3.6 + vec2(1.7, 4.2), 2.0 - t * 0.7);
    return clamp(1.0 - a * 6.5, 0.0, 1.0) + clamp(1.0 - b * 7.5, 0.0, 1.0) * 0.6;
  }
`;

/** What the terrain shader gets: uniforms + wc_light(p) → colour multiplier. */
const TERRAIN_GLSL = /* glsl */`
  uniform sampler2D wcMap;
  uniform vec4 wcO; // x0, z0, 1/size, base y
  uniform vec4 wcK; // on, strength, time, -
  ${CAUSTIC_GLSL}
  vec3 wc_light(vec3 p) {
    if (wcK.x < 0.5) return vec3(1.0);
    vec2 uv = (p.xz - wcO.xy) * wcO.z;
    if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec3(1.0);
    vec4 m = floor(texture2D(wcMap, uv) * 255.0 + 0.5);
    if (m.r + m.b < 0.5) return vec3(1.0);
    float fade = clamp(1.0 - (length(p - cameraPosition) - 7.0) / 7.0, 0.0, 1.0);
    if (fade <= 0.0) return vec3(1.0);
    // the face's own axes (from screen derivatives), quantized to chunky light pixels
    vec3 fn = normalize(cross(dFdx(p), dFdy(p)));
    vec3 an = abs(fn);
    vec2 q = an.y > 0.6 ? p.xz : an.x > an.z ? vec2(p.z, p.y) : p.xy;
    q = (floor(q * 64.0) + 0.5) / 64.0;
    float t = wcK.z;
    vec3 mult = vec3(1.0);
    if (m.r > 0.5) {
      float top = wcO.w + m.r / ${VOX}.0, bot = wcO.w + (m.g - 1.0) / ${VOX}.0;
      if (p.y < top + 0.03 && p.y > bot - 0.2) {
        float d = max(top - p.y, 0.0);
        float c = wc_caustic(q, t) * exp(-d * 0.45) * (an.y > 0.6 ? 1.0 : 0.7);
        c = floor(c * 3.0 + 0.35) / 3.0; // stepped, like the rest of the pixel art
        mult = mix(vec3(1.0), vec3(0.8, 0.94, 1.0), clamp(d * 1.5, 0.0, 1.0)) * (1.0 + vec3(0.5, 0.82, 1.0) * c * 0.85 * wcK.y * fade);
      }
    }
    if (m.b > 0.5) {
      // above a pool: the light it throws back wavers on the walls, and the waterline is wet
      float top = wcO.w + m.a / ${VOX}.0;
      float h = p.y - top;
      float near = m.b / 255.0;
      if (h > -0.03 && h < 1.6) {
        float c = wc_caustic(q * 0.7 + vec2(0.0, t * 0.15), t * 1.4);
        float k = (1.0 - h / 1.6);
        c = floor(c * k * k * near * 3.0 + 0.3) / 3.0;
        mult *= 1.0 + vec3(0.45, 0.75, 1.0) * c * 0.45 * wcK.y * fade;
      }
      if (h > -0.03 && h < 0.07 && near > 0.75) mult *= 0.72; // wet rock at the waterline
    }
    return mult;
  }
`;

/**
 * Add the water light to the terrain material (a ShaderMaterial whose fragment shader ends with
 * `gl_FragColor = vec4(col, ...)` and has `vWorld`). Returns false (and leaves it alone) otherwise.
 */
export function patchTerrain(mat, U) {
  if (!mat || !mat.isShaderMaterial || mat.userData.wcPatched) return !!mat?.userData?.wcPatched;
  const fs = mat.fragmentShader;
  const main = /void\s+main\s*\(\s*\)\s*\{/;
  const out = /gl_FragColor\s*=\s*vec4\(\s*col\s*,/g;
  if (!main.test(fs) || !fs.includes('vWorld') || !fs.match(out)) return false;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    let f = sh.fragmentShader;
    const hits = [...f.matchAll(/gl_FragColor\s*=\s*vec4\(\s*col\s*,/g)];
    if (!hits.length || !main.test(f)) return;
    const last = hits[hits.length - 1];
    f = f.slice(0, last.index) + 'col *= wc_light(vWorld);\n        ' + f.slice(last.index);
    f = f.replace(main, (s) => TERRAIN_GLSL + '\n' + s);
    sh.fragmentShader = f;
    sh.uniforms.wcMap = U.wcMap; sh.uniforms.wcO = U.wcO; sh.uniforms.wcK = U.wcK;
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|wc1';
  mat.userData.wcPatched = true;
  mat.needsUpdate = true;
  return true;
}

/**
 * The water height map around the mole. Per chunk with fluid a 32×32 column summary (top and
 * bottom voxel of the highest water run) is kept until that chunk's fluid changes; the map is
 * composed from those every few frames and dilated a meter outward for the shore light.
 */
export class WaterMap {
  constructor(U, world) {
    this.w = world;
    this.data = new Uint8Array(N * N * 4);
    const tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.tex = tex;
    // how the water runs, per column (r, g = flow x, z; 128 = still): the shader carries its
    // streaks and foam that way even where a stream's surface is level
    this.fdata = new Uint8Array(N * N * 4);
    const ftex = new THREE.DataTexture(this.fdata, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    ftex.magFilter = ftex.minFilter = THREE.LinearFilter;
    ftex.generateMipmaps = false;
    ftex.needsUpdate = true;
    this.ftex = ftex;
    this.mdOf = null; // (chunk) → the sim's running directions there (Uint8Array: 0, 1..4 = +x, -x, +z, -z) or null
    this.fx = new Float32Array(N * N); this.fz = new Float32Array(N * N);
    U.wcMap = { value: tex };
    U.wcFlow = { value: ftex };
    U.wcO = { value: new THREE.Vector4(0, 0, 1 / SIZE, -9999) };
    U.wcK = { value: new THREE.Vector4(0, 1, 0, 0) };
    this.U = U;
    this.cols = new Map(); // chunk key → { top: Int16Array, bot: Int16Array } (world voxel y)
    this.ox = 1e9; this.oz = 1e9; this.by = -1e9;
    this.dirty = true;
    this.t = 0;
    this.top = new Int32Array(N * N); this.bot = new Int32Array(N * N);
    this.dist = new Float32Array(N * N); this.near = new Int32Array(N * N);
    this.any = false;
  }

  /** A chunk's fluid changed: its columns are recounted on the next rebuild. */
  touch(ch) { if (ch) { this.cols.delete(ch.key); this.dirty = true; } }

  summary(ch) {
    let s = this.cols.get(ch.key);
    if (s && s.ch === ch) return s;
    const v = ch.vox;
    s = { ch, top: new Int16Array(CS * CS).fill(NONE), bot: new Int16Array(CS * CS).fill(NONE), any: false };
    if (v) {
      const Y0 = ch.cy * CS;
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        let ly = CM;
        const ci = lx + CS * lz;
        for (; ly >= 0; ly--) if (FLUID[v[lx + CS * (ly + CS * lz)]] === 1) break;
        if (ly < 0) continue;
        const t = ly;
        while (ly > 0 && FLUID[v[lx + CS * (ly - 1 + CS * lz)]] === 1) ly--;
        s.top[ci] = Y0 + t; s.bot[ci] = Y0 + ly; s.any = true;
      }
    }
    this.cols.set(ch.key, s);
    return s;
  }

  /** Per frame (cheap unless something changed or the mole moved a few meters). */
  update(dt, eye, time) {
    const U = this.U;
    U.wcK.value.z = time;
    this.t -= dt;
    this.full = (this.full ?? 1) - dt;
    if (this.full <= 0) { this.full = 1.5; this.dirty = true; } // chunks streaming in
    const ox = Math.floor(eye.x - SIZE / 2), oz = Math.floor(eye.z - SIZE / 2), by = Math.floor(eye.y) - 10;
    const moved = Math.abs(ox - this.ox) > 2 || Math.abs(oz - this.oz) > 2 || Math.abs(by - this.by) > 2;
    if (!moved && (!this.dirty || this.t > 0)) return;
    this.t = 0.3;
    this.dirty = false;
    if (moved) { this.ox = ox; this.oz = oz; this.by = by; }
    this.build();
  }

  build() {
    const w = this.w, top = this.top, bot = this.bot, fx = this.fx, fz = this.fz;
    top.fill(NONE); bot.fill(NONE); fx.fill(0); fz.fill(0);
    const vx0 = this.ox * VOX, vz0 = this.oz * VOX, vy0 = this.by * VOX, vy1 = vy0 + 255;
    const cx0 = vx0 >> CB, cx1 = (vx0 + N * VPT - 1) >> CB, cz0 = vz0 >> CB, cz1 = (vz0 + N * VPT - 1) >> CB;
    const cy0 = vy0 >> CB, cy1 = vy1 >> CB;
    let any = false;
    for (const ch of w.chunks.values()) {
      if (!ch.fluidMesh || !ch.vox || ch.cx < cx0 || ch.cx > cx1 || ch.cz < cz0 || ch.cz > cz1 || ch.cy < cy0 || ch.cy > cy1) continue;
      const s = this.summary(ch);
      if (!s.any) continue;
      any = true;
      const md = this.mdOf ? this.mdOf(ch) : null; // the sim's running directions in this chunk
      const X0 = ch.cx * CS, Z0 = ch.cz * CS, Y0 = ch.cy * CS;
      for (let lz = 0; lz < CS; lz += VPT) {
        const tz = (Z0 + lz - vz0) / VPT;
        if (tz < 0 || tz >= N) continue;
        for (let lx = 0; lx < CS; lx += VPT) {
          const tx = (X0 + lx - vx0) / VPT;
          if (tx < 0 || tx >= N) continue;
          const ci = lx + CS * lz, t = s.top[ci];
          if (t === NONE || t > vy1 || t < vy0) continue;
          const i = tx + N * tz;
          const b = s.bot[ci];
          if (top[i] === NONE || t > top[i]) {
            // a higher body; keep the lower one's bottom if this run sits right on it
            if (top[i] !== NONE && b === top[i] + 1) top[i] = t; else { top[i] = t; bot[i] = b; }
            if (md) {
              const ly = t - Y0, d = md[lx + CS * (ly + CS * lz)] || (ly > 0 ? md[lx + CS * (ly - 1 + CS * lz)] : 0);
              fx[i] = DXS[d]; fz[i] = DZS[d];
            } else { fx[i] = 0; fz[i] = 0; }
          } else if (t === bot[i] - 1) bot[i] = b; // the run continues below
        }
      }
    }
    this.any = any;
    this.U.wcK.value.x = any && !this.off ? 1 : 0;
    this.U.wcO.value.set(this.ox, this.oz, 1 / SIZE, this.by);
    const d = this.data, f = this.fdata;
    if (!any) { d.fill(0); this.tex.needsUpdate = true; f.fill(128); this.ftex.needsUpdate = true; return; }
    // dilate: distance (texels) to the nearest water column, and that column's surface (two
    // chamfer passes)
    const dist = this.dist, near = this.near, R = 8;
    for (let i = 0; i < N * N; i++) { if (top[i] !== NONE) { dist[i] = 0; near[i] = top[i]; } else { dist[i] = 99; near[i] = NONE; } }
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = x + N * z;
        let dd = dist[i], nn = near[i], j, c;
        if (x > 0) { j = i - 1; c = dist[j] + 1; if (c < dd) { dd = c; nn = near[j]; } }
        if (z > 0) {
          j = i - N; c = dist[j] + 1; if (c < dd) { dd = c; nn = near[j]; }
          if (x > 0) { j = i - N - 1; c = dist[j] + 1.4; if (c < dd) { dd = c; nn = near[j]; } }
          if (x < N - 1) { j = i - N + 1; c = dist[j] + 1.4; if (c < dd) { dd = c; nn = near[j]; } }
        }
        dist[i] = dd; near[i] = nn;
      }
    }
    for (let z = N - 1; z >= 0; z--) {
      for (let x = N - 1; x >= 0; x--) {
        const i = x + N * z;
        let dd = dist[i], nn = near[i], j, c;
        if (x < N - 1) { j = i + 1; c = dist[j] + 1; if (c < dd) { dd = c; nn = near[j]; } }
        if (z < N - 1) {
          j = i + N; c = dist[j] + 1; if (c < dd) { dd = c; nn = near[j]; }
          if (x < N - 1) { j = i + N + 1; c = dist[j] + 1.4; if (c < dd) { dd = c; nn = near[j]; } }
          if (x > 0) { j = i + N - 1; c = dist[j] + 1.4; if (c < dd) { dd = c; nn = near[j]; } }
        }
        dist[i] = dd; near[i] = nn;
      }
    }
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = x + N * z, o = i * 4, t = top[i];
        if (t !== NONE) {
          d[o] = Math.max(1, Math.min(255, t + 1 - vy0));
          d[o + 1] = Math.max(1, Math.min(255, bot[i] + 1 - vy0));
          d[o + 2] = 0;
          // flow, smoothed over the water columns around
          let sx = 0, sz = 0, n = 0;
          for (let dz = z > 0 ? -1 : 0; dz <= (z < N - 1 ? 1 : 0); dz++) {
            for (let dx = x > 0 ? -1 : 0; dx <= (x < N - 1 ? 1 : 0); dx++) {
              const j = i + dx + N * dz;
              if (top[j] === NONE) continue;
              sx += fx[j]; sz += fz[j]; n++;
            }
          }
          f[o] = 128 + Math.round((sx / n) * 110); f[o + 1] = 128 + Math.round((sz / n) * 110);
        } else {
          d[o] = 0; d[o + 1] = 0;
          // a column right at the water counts as near too (its walls rise from the shore)
          const k = dist[i] <= R && near[i] !== NONE ? 1 - Math.max(0, dist[i] - 1) / R : 0;
          d[o + 2] = Math.round(k * 255);
          f[o] = 128; f[o + 1] = 128;
        }
        d[o + 3] = near[i] !== NONE ? Math.max(0, Math.min(255, near[i] + 1 - vy0)) : 0;
        f[o + 2] = 0; f[o + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
    this.ftex.needsUpdate = true;
  }

  /** How near (0..1) the closest water is to the column at (x, z), and its surface (m); or null. */
  nearAt(x, z) {
    const tx = Math.floor((x - this.ox) * TEX), tz = Math.floor((z - this.oz) * TEX);
    if (tx < 0 || tz < 0 || tx >= N || tz >= N) return null;
    const i = tx + N * tz;
    if (this.near[i] === NONE || this.dist[i] > 8) return null;
    return { k: 1 - Math.max(0, this.dist[i] - 1) / 8, top: (this.near[i] + 1) / VOX };
  }

  /** Water surface (m) of the column at (x, z) in the map, or null. */
  surfaceAt(x, z) {
    const tx = Math.floor((x - this.ox) * TEX), tz = Math.floor((z - this.oz) * TEX);
    if (tx < 0 || tz < 0 || tx >= N || tz >= N) return null;
    const t = this.top[tx + N * tz];
    return t === NONE ? null : (t + 1) / VOX;
  }

  dispose() {
    this.tex.dispose();
    this.ftex.dispose();
    this.U.wcK.value.x = 0;
  }
}
