// Pixel-terrain renderer. Each 256×256-pixel chunk is one mesh:
//  - a front face (z = +0.5) that draws every solid pixel from a small data texture,
//    with bevelled edges, embossed texture relief, cracks, crust and moss;
//  - a recessed back wall (z = -0.5) showing the rock that used to be there, with soft
//    contact shadows;
//  - extruded side walls along every solid/air pixel edge, so dug tunnels read as real
//    3D voxel relief from the slightly raised camera.
import * as THREE from 'three';
import { M, CPX, APRON, ORE_BASE, STAIN_BASE, MAT, D_SHADE } from './micro.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const TEX = CPX + APRON * 2;
export const FRONT_Z = 0.5;
export const BACK_Z = -0.5;

export const LIGHT_GLSL = /* glsl */`
uniform sampler2D lightMap;
uniform vec2 worldSize;
uniform vec3 ambient;
uniform vec4 xray;
uniform float xrayOn;
uniform float time;
vec3 lightAt(vec2 wp) {
  vec2 uv = vec2(wp.x / worldSize.x, -wp.y / worldSize.y);
  return texture2D(lightMap, uv).rgb * 2.0;
}
float xrayMask(vec2 wp) {
  if (xrayOn < 0.5) return 0.0;
  vec2 d = wp - xray.xy;
  float r = length(d);
  if (r > xray.w) return 0.0;
  float a = atan(d.y, d.x);
  float da = abs(mod(a - xray.z + 3.14159265, 6.2831853) - 3.14159265);
  return smoothstep(0.5, 0.36, da) * smoothstep(xray.w, xray.w - 1.2, r) * smoothstep(0.2, 0.9, r);
}
float glowOf(float a) { return a < 0.97 ? clamp((0.97 - a) / 0.42, 0.0, 1.0) : 0.0; }
`;

const VERT = /* glsl */`
attribute vec4 aInfo;
varying vec3 vPos;
varying vec4 vInfo;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform sampler2D tMap;
uniform sampler2D tPal;
uniform vec2 uOrigin;
uniform vec3 uGrowth;
uniform float uFlat;
uniform vec4 uSpeck;
uniform vec4 hit;
${LIGHT_GLSL}
varying vec3 vPos;
varying vec4 vInfo;
const float TEX = ${TEX.toFixed(1)};
const float AP = ${APRON.toFixed(1)};
vec4 tx(vec2 p) { return texture2D(tMap, (p + AP + 0.5) / TEX); }
float matOf(vec4 t) { return floor(t.r * 255.0 + 0.5); }
float detOf(vec4 t) { return floor(t.g * 255.0 + 0.5); }
float airAt(vec2 p) { return matOf(tx(p)) < 0.5 ? 1.0 : 0.0; }
vec4 pal(float m, float s) { return texture2D(tPal, vec2((s + 0.5) / 16.0, (m + 0.5) / 256.0)); }
float lum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 surface(vec3 col, float det, vec2 ip, float m) {
  float fl = floor(det / 16.0);
  float crust = mod(fl, 2.0), crack = mod(floor(fl / 2.0), 2.0), growth = mod(floor(fl / 4.0), 2.0), scorch = floor(fl / 8.0);
  if (m < ${ORE_BASE}.0) {
    if (crust > 0.5) col = mix(col, col * vec3(0.8, 0.76, 0.72), 0.75);
    if (growth > 0.5) col = mix(col, uGrowth * (0.78 + 0.42 * h21(ip)), 0.8);
  }
  if (crack > 0.5) col *= 0.42;
  if (scorch > 0.5) col *= 0.38;
  return col;
}
void main() {
  float kind = vInfo.x;
#if KIND == 0
  kind = 0.0;
#elif KIND == 1
  kind = 1.0;
#endif
  vec2 wpx = vec2(vPos.x * ${M}.0, -vPos.y * ${M}.0);
  vec2 lp = wpx - uOrigin;
  vec3 L = ambient + lightAt(vPos.xy);
  float xm = xrayMask(vPos.xy);
  vec3 col;
  float glow = 0.0;
  if (kind < 0.5) {
    // ---------------- front face
    vec2 ip = floor(lp);
    vec4 t = tx(ip);
    float m = matOf(t);
#if KIND == 0
    if (m < 0.5) discard;
#endif
    float det = detOf(t);
    vec4 pc = pal(m, mod(det, 16.0));
    col = surface(pc.rgb, det, ip, m);
    glow = glowOf(pc.a);
    // bevel: edges facing open air catch the lamp (light from upper left)
    float aU = airAt(ip + vec2(0.0, -1.0)), aD = airAt(ip + vec2(0.0, 1.0));
    float aL = airAt(ip + vec2(-1.0, 0.0)), aR = airAt(ip + vec2(1.0, 0.0));
    float aU2 = airAt(ip + vec2(0.0, -2.0)), aD2 = airAt(ip + vec2(0.0, 2.0));
    float aL2 = airAt(ip + vec2(-2.0, 0.0)), aR2 = airAt(ip + vec2(2.0, 0.0));
    float bev = (aU + aU2 * 0.45) * 0.34 + (aL + aL2 * 0.45) * 0.18 - (aD + aD2 * 0.45) * 0.3 - (aR + aR2 * 0.45) * 0.16;
    col *= 1.0 + bev * (1.0 - uFlat * 0.4);
    // emboss: lighter texture features read as raised
    vec4 tu = tx(ip + vec2(-1.0, -1.0));
    float mu = matOf(tu);
    if (mu > 0.5) {
      float d = lum(pc.rgb) - lum(pal(mu, mod(detOf(tu), 16.0)).rgb);
      col *= 1.0 + clamp(d * 0.9, -0.16, 0.16);
    }
    col = col * L + pc.rgb * glow * 1.35;
    // impact flash where the tool just landed
    if (hit.w > 0.01) {
      float hd = length(vPos.xy - hit.xy) / hit.z;
      if (hd < 1.0) col += vec3(1.0, 0.92, 0.8) * hit.w * (1.0 - hd) * (1.0 - hd) * (0.6 + 0.4 * step(0.5, h21(ip + floor(time * 30.0))));
    }
    if (xm > 0.0) {
      float scan = step(0.65, fract(vPos.y * 5.0 - time * 2.5)) * 0.07;
      bool ore = m >= ${ORE_BASE}.0 && m < ${STAIN_BASE}.0;
      col = mix(col, (ore ? pc.rgb * 0.9 + 0.1 : vec3(0.02, 0.07, 0.1) + pc.rgb * 0.08) + vec3(0.0, scan, scan * 1.3), xm * 0.85);
    }
  } else if (kind < 1.5) {
    // ---------------- back wall: the rock that used to be here, set back and shadowed
    vec2 ip = floor(lp);
    // the far wall is drawn coarser, darker and hazier so open caves read as depth
    vec2 cp = floor(lp / 2.0) * 2.0;
    vec4 t = tx(cp);
    float bm = floor(t.b * 255.0 + 0.5);
    float sh = mod(detOf(t), 16.0);
    if (sh > 9.5) sh = 3.0 + mod(sh, 3.0);
    vec3 c = pal(bm, sh).rgb;
    c = mix(vec3(lum(c)), c, 0.55) * vec3(0.3, 0.3, 0.34);
    c = mix(c, ambient * 0.9, 0.18);
    // soft contact shadow from nearby solid pixels
    float occ = 0.0;
    occ += 1.0 - airAt(ip + vec2(0.0, -3.0)); occ += 1.0 - airAt(ip + vec2(0.0, 3.0));
    occ += 1.0 - airAt(ip + vec2(-3.0, 0.0)); occ += 1.0 - airAt(ip + vec2(3.0, 0.0));
    occ += (1.0 - airAt(ip + vec2(-2.0, -2.0))) * 0.7 + (1.0 - airAt(ip + vec2(2.0, -2.0))) * 0.7;
    occ += (1.0 - airAt(ip + vec2(-2.0, 2.0))) * 0.7 + (1.0 - airAt(ip + vec2(2.0, 2.0))) * 0.7;
    c *= 1.0 - clamp(occ / 6.8, 0.0, 1.0) * 0.55;
    // faint deep cracks in the far wall
    float cr = abs(fract(sin(dot(floor(wpx / 9.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    if (cr < 0.012 && mod(ip.x + ip.y, 3.0) < 1.0) c *= 0.6;
    col = c * (ambient * 0.8 + lightAt(vPos.xy) * 0.85);
    // glow-worms and mineral glints twinkling on the far wall
    vec2 sc = floor(wpx / 3.0);
    float sp = h21(sc + 17.0);
    if (sp > 1.0 - uSpeck.w && occ < 2.5) {
      float tw = 0.55 + 0.45 * sin(time * (1.3 + sp * 3.0) + sp * 91.0);
      col += uSpeck.rgb * tw * (mod(ip.x, 3.0) == 1.0 && mod(ip.y, 3.0) == 1.0 ? 1.0 : 0.0);
    }
    if (xm > 0.0) col = mix(col, vec3(0.01, 0.04, 0.06), xm * 0.8);
  } else {
    // ---------------- extruded side walls
    float dz = clamp((${FRONT_Z.toFixed(2)} - vPos.z) / ${(FRONT_Z - BACK_Z).toFixed(2)}, 0.0, 1.0);
    float zp = floor(dz * ${M}.0);
    vec2 ip;
    float along;
    if (kind < 3.5) { ip = vec2(floor(lp.x), vInfo.y - uOrigin.y); along = ip.x; }
    else { ip = vec2(vInfo.y - uOrigin.x, floor(lp.y)); along = ip.y; }
    vec4 t = tx(ip);
    float m = matOf(t);
    float det = detOf(t);
    float sh = mod(det, 16.0);
    // texture the depth: wander the ramp shade with a hash of (along, depth)
    float r = h21(vec2(along + uOrigin.x * 3.0, zp + uOrigin.y));
    if (sh < 9.5) sh = clamp(sh + floor(r * 3.0) - 1.0, 0.0, 9.0);
    vec4 pc = pal(m, sh);
    vec3 c = pc.rgb;
    float face;
    if (kind < 2.5) {
      // floor tops: pebbles and moss on the walking surface
      face = 1.06;
      if (r > 0.93) c = pal(m, 11.0).rgb;
      else if (r < 0.05) c = pal(m, 12.0).rgb;
      c = surface(c, det, ip + vec2(0.0, zp), m);
      c *= 1.0 + (1.0 - dz) * 0.12;
    } else if (kind < 3.5) { face = 0.52; c = surface(c, det, ip, m); }
    else if (kind < 4.5) { face = 0.78; c = surface(c, det, ip, m); }
    else { face = 0.68; c = surface(c, det, ip, m); }
    c *= face * mix(1.0, 0.5, dz * dz);
    glow = glowOf(pc.a);
    col = c * L + pc.rgb * glow * 0.9;
    if (xm > 0.0) col = mix(col, vec3(0.02, 0.06, 0.08), xm * 0.8);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function makePaletteTexture() {
  const data = new Uint8Array(16 * 256 * 4);
  for (let m = 0; m < 256; m++) {
    const mt = MAT[m];
    for (let s = 0; s < 16; s++) {
      const c = mt.pal[s] ?? 0xff00ff;
      const o = (m * 16 + s) * 4;
      data[o] = (c >> 16) & 255; data[o + 1] = (c >> 8) & 255; data[o + 2] = c & 255;
      const g = mt.glow[s] || 0;
      data[o + 3] = g > 0 ? Math.round((0.97 - g * 0.42) * 255) : 255;
    }
  }
  const tex = new THREE.DataTexture(data, 16, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace; // palette colors are authored in sRGB; sampling decodes to linear
  tex.needsUpdate = true;
  return tex;
}

export class Terrain {
  /** U: shared uniforms (lightMap, worldSize, ambient, xray, xrayOn, time). */
  constructor(scene3, world, U, { growth = 0x5a8a3a, speck = [0.25, 0.32, 0.2, 0.004] } = {}) {
    this.w = world;
    this.U = U;
    this.root = new THREE.Group();
    scene3.add(this.root);
    this.palTex = makePaletteTexture();
    this.shared = { ...U, tPal: { value: this.palTex }, uGrowth: { value: new THREE.Color(growth) }, uFlat: { value: 0 }, uSpeck: { value: new THREE.Vector4(...speck) } };
    // three programs: the front face (alpha-tested), the side walls and the back wall. Drawing
    // the front first lets the GPU skip back-wall pixels hidden behind solid rock.
    this.bases = [0, 1, 2].map((k) => new THREE.ShaderMaterial({ uniforms: this.shared, vertexShader: VERT, fragmentShader: FRAG, defines: { KIND: k } }));
    this.chunks = new Map();
    this.visible = new Set();
    this.builds = 0;
  }

  /** Re-upload palettes (after ore palettes change). */
  refreshPalette() {
    const old = this.palTex;
    this.palTex = makePaletteTexture();
    this.shared.tPal.value = this.palTex;
    old.dispose();
  }

  /** Show chunks overlapping the pixel rect; build/refresh up to `budget` per call. */
  update(px0, py0, px1, py1, budget = 6) {
    const w = this.w;
    const c0 = Math.max(0, Math.floor(px0 / CPX)), c1 = Math.min(w.CW - 1, Math.floor(px1 / CPX));
    const r0 = Math.max(0, Math.floor(py0 / CPX)), r1 = Math.min(w.CH - 1, Math.floor(py1 / CPX));
    const want = new Set();
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) want.add(cy * w.CW + cx);
    let built = 0;
    // visible chunks first: missing ones are built regardless of budget
    for (const id of want) {
      const ch = this.chunks.get(id);
      if (!ch) { this.build(id); built++; continue; }
      if (w.pxDirty.has(id) && built < budget) { this.build(id); built++; }
    }
    for (const [id, ch] of this.chunks) ch.mesh.visible = want.has(id);
    // forget far chunks to bound GPU memory
    if (this.chunks.size > 90) {
      for (const [id, ch] of this.chunks) {
        if (want.has(id)) continue;
        const cx = id % w.CW, cy = Math.floor(id / w.CW);
        if (cx < c0 - 2 || cx > c1 + 2 || cy < r0 - 2 || cy > r1 + 2) this.drop(id);
      }
    }
    return built;
  }

  drop(id) {
    const ch = this.chunks.get(id);
    if (!ch) return;
    this.root.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    ch.tex.dispose();
    for (const m of ch.mesh.material) m.dispose();
    this.chunks.delete(id);
  }

  build(id) {
    const w = this.w;
    const cx = id % w.CW, cy = Math.floor(id / w.CW);
    // make sure this chunk and its neighbors' pixels exist (aprons read them)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < w.CW && ny < w.CH && !w.genDone[ny * w.CW + nx]) w.gen.chunk(nx, ny);
    }
    w.pxDirty.delete(id);
    this.builds++;
    let ch = this.chunks.get(id);
    if (!ch) {
      const data = new Uint8Array(TEX * TEX * 4);
      const tex = new THREE.DataTexture(data, TEX, TEX, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace;
      const own = { tMap: { value: tex }, uOrigin: { value: new THREE.Vector2(cx * CPX, cy * CPX) } };
      const mats = this.bases.map((b) => { const m = b.clone(); m.uniforms = { ...this.shared, ...own }; return m; });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mats);
      this.root.add(mesh);
      ch = { id, cx, cy, data, tex, mesh };
      this.chunks.set(id, ch);
    }
    this.fillTexture(ch);
    const old = ch.mesh.geometry;
    ch.mesh.geometry = this.buildGeometry(ch);
    old.dispose();
  }

  fillTexture(ch) {
    const w = this.w;
    const { data } = ch;
    const MW = w.MW, MH = w.MH, pm = w.pm, pd = w.pd, pb = w.pb;
    const X0 = ch.cx * CPX - APRON, Y0 = ch.cy * CPX - APRON;
    for (let ly = 0; ly < TEX; ly++) {
      const y = Y0 + ly;
      // DataTexture rows go bottom-up in UV space; we sample with (p + AP + .5)/TEX where
      // p.y grows downward, so row ly of the texture holds pixel row Y0 + ly.
      let o = ly * TEX * 4;
      for (let lx = 0; lx < TEX; lx++, o += 4) {
        const x = X0 + lx;
        if (x < 0 || y < 0 || x >= MW || y >= MH) { data[o] = 20; data[o + 1] = 3; data[o + 2] = 20; data[o + 3] = 255; continue; }
        const p = y * MW + x;
        let m = pm[p], d = pd[p];
        if (m === 255) { m = pb[p] || 20; d = 3; }
        else if (m >= ORE_BASE) {
          const dep = w.depositAt(x, y);
          if (dep && !dep.revealed && !this.nearAir(x, y, 3)) {
            const li = (y - dep.y0) * dep.w + (x - dep.x0);
            m = dep.host[li] || pb[p];
            d = dep.hostDet[li];
          }
        }
        data[o] = m; data[o + 1] = d; data[o + 2] = pb[p]; data[o + 3] = 255;
      }
    }
    ch.tex.needsUpdate = true;
  }

  nearAir(x, y, r) {
    const w = this.w;
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (!w.psolid(xx, yy)) return true;
    return false;
  }

  buildGeometry(ch) {
    const w = this.w;
    const MW = w.MW, pm = w.pm;
    const x0 = ch.cx * CPX, y0 = ch.cy * CPX;
    const x1 = Math.min(w.MW, x0 + CPX), y1 = Math.min(w.MH, y0 + CPX);
    const pos = [], info = [], idx = [];
    let v = 0;
    const S = 1 / M;
    const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, kind, fixed) => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      for (let k = 0; k < 4; k++) info.push(kind, fixed, 0, 0);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    };
    const X0 = x0 * S, X1 = x1 * S, Y0 = -y0 * S, Y1 = -y1 * S;
    quad(X0, Y1, FRONT_Z, X1, Y1, FRONT_Z, X1, Y0, FRONT_Z, X0, Y0, FRONT_Z, 0, 0);
    const solid = (x, y) => (x < 0 || y < 0 || x >= MW || y >= w.MH ? true : pm[y * MW + x] !== 0);
    // top faces (solid with air above) and bottom faces, merged along rows
    for (let y = y0; y < y1; y++) {
      let runT = -1, runB = -1;
      for (let x = x0; x <= x1; x++) {
        const s = x < x1 && pm[y * MW + x] !== 0;
        const top = s && !solid(x, y - 1);
        const bot = s && !solid(x, y + 1);
        if (top && runT < 0) runT = x;
        if (!top && runT >= 0) { const Y = -y * S; quad(runT * S, Y, FRONT_Z, x * S, Y, FRONT_Z, x * S, Y, BACK_Z, runT * S, Y, BACK_Z, 2, y); runT = -1; }
        if (bot && runB < 0) runB = x;
        if (!bot && runB >= 0) { const Y = -(y + 1) * S; quad(runB * S, Y, FRONT_Z, runB * S, Y, BACK_Z, x * S, Y, BACK_Z, x * S, Y, FRONT_Z, 3, y); runB = -1; }
      }
    }
    // left faces (air on the left) and right faces, merged along columns
    for (let x = x0; x < x1; x++) {
      let runL = -1, runR = -1;
      for (let y = y0; y <= y1; y++) {
        const s = y < y1 && pm[y * MW + x] !== 0;
        const left = s && !solid(x - 1, y);
        const right = s && !solid(x + 1, y);
        if (left && runL < 0) runL = y;
        if (!left && runL >= 0) { const X = x * S; quad(X, -runL * S, FRONT_Z, X, -runL * S, BACK_Z, X, -y * S, BACK_Z, X, -y * S, FRONT_Z, 4, x); runL = -1; }
        if (right && runR < 0) runR = y;
        if (!right && runR >= 0) { const X = (x + 1) * S; quad(X, -runR * S, FRONT_Z, X, -y * S, FRONT_Z, X, -y * S, BACK_Z, X, -runR * S, BACK_Z, 5, x); runR = -1; }
      }
    }
    const wallsEnd = idx.length;
    quad(X0, Y1, BACK_Z, X1, Y1, BACK_Z, X1, Y0, BACK_Z, X0, Y0, BACK_Z, 1, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
    g.setIndex(v > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.addGroup(0, 6, 0);
    if (wallsEnd > 6) g.addGroup(6, wallsEnd - 6, 2);
    g.addGroup(wallsEnd, 6, 1);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((X0 + X1) / 2, (Y0 + Y1) / 2, 0), Math.hypot(X1 - X0, Y1 - Y0) / 2 + 1);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(X0, Y1, BACK_Z), new THREE.Vector3(X1, Y0, FRONT_Z));
    return g;
  }

  dispose() {
    for (const id of [...this.chunks.keys()]) this.drop(id);
    this.palTex.dispose();
    for (const b of this.bases) b.dispose();
  }
}
