// Relief (heightfield) mesher for surfaces seen from any angle: a U×V grid of columns sticking out
// toward +z, column (u, v) filling z ∈ [0, depth). Unlike the iso relief mesher it emits every face
// a free camera can see: the fronts (+z, greedy, with corner AO), the tops AND bottoms of steps
// (±y) and both sides (±x), so beams, stones, posts and window rims stay solid up close.
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { LIN, MESH_STATS } from '../iso/mesher.js';

const AO = [1.0, 0.8, 0.66, 0.52];

class Out {
  constructor(n) {
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.idx = new Uint32Array(n * 1.5);
    this.nv = 0;
    this.ni = 0;
  }
  grow() {
    const g = (a, len) => { const b = new a.constructor(len); b.set(a); return b; };
    const n = this.pos.length * 2;
    this.pos = g(this.pos, n); this.nor = g(this.nor, n); this.col = g(this.col, n);
    this.idx = g(this.idx, Math.max(this.idx.length * 2, n / 2));
  }
}

/**
 * depth: Int16Array(U*V) column depths (voxels, 0 = hole), color: Uint32Array(U*V) sRGB hex.
 * opts: { scale (m per voxel), sideShade, topShade, bottomShade, aoMin }.
 * Returns a BufferGeometry in voxel-scaled local units (x = u, y = v, z = out) or null.
 */
export function meshReliefAll(depth, color, U, V, opts = {}) {
  const s = opts.scale ?? 1 / 32;
  const sideK = opts.sideShade ?? 0.9, topK = opts.topShade ?? 1.04, botK = opts.bottomShade ?? 0.82;
  const aoMin = opts.aoMin ?? 0;
  const out = new Out(Math.max(4096, U * V));
  const Dv = (u, v) => (u < 0 || v < 0 || u >= U || v >= V ? 0 : depth[u + v * U]);
  const push = (x, y, z, nx, ny, nz, c, k) => {
    if ((out.nv + 1) * 3 > out.pos.length) out.grow();
    const i = out.nv * 3;
    out.pos[i] = x * s; out.pos[i + 1] = y * s; out.pos[i + 2] = z * s;
    out.nor[i] = nx; out.nor[i + 1] = ny; out.nor[i + 2] = nz;
    out.col[i] = LIN[(c >> 16) & 255] * k; out.col[i + 1] = LIN[(c >> 8) & 255] * k; out.col[i + 2] = LIN[c & 255] * k;
    out.nv++;
  };
  const quad = (a0, a1, a2, a3) => {
    if (out.ni + 6 > out.idx.length) out.grow();
    const v0 = out.nv - 4, I = out.idx;
    let j = out.ni;
    if (a0 + a2 < a1 + a3) { I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0 + 3; I[j++] = v0 + 1; I[j++] = v0 + 3; I[j++] = v0; }
    else { I[j++] = v0; I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0; I[j++] = v0 + 2; I[j++] = v0 + 3; }
    out.ni = j;
  };
  // ---- fronts (+z): greedy over equal depth + color + flat AO
  const key = new Int32Array(U * V);
  const q4 = [0, 0, 0, 0];
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const q = u + v * U, d = depth[q];
    if (d <= 0) { key[q] = 0; continue; }
    const dd = d + aoMin;
    const L = Dv(u - 1, v) > dd ? 1 : 0, R = Dv(u + 1, v) > dd ? 1 : 0, Dn = Dv(u, v - 1) > dd ? 1 : 0, Up = Dv(u, v + 1) > dd ? 1 : 0;
    q4[0] = L && Dn ? 3 : L + Dn + (Dv(u - 1, v - 1) > dd ? 1 : 0);
    q4[1] = R && Dn ? 3 : R + Dn + (Dv(u + 1, v - 1) > dd ? 1 : 0);
    q4[2] = R && Up ? 3 : R + Up + (Dv(u + 1, v + 1) > dd ? 1 : 0);
    q4[3] = L && Up ? 3 : L + Up + (Dv(u - 1, v + 1) > dd ? 1 : 0);
    if (q4[0] === q4[1] && q4[1] === q4[2] && q4[2] === q4[3]) { key[q] = ((color[q] & 0xffffff) * 4 + q4[0] + 1) | 0; continue; }
    key[q] = 0;
    const c = color[q];
    push(u, v, d, 0, 0, 1, c, AO[q4[0]]); push(u + 1, v, d, 0, 0, 1, c, AO[q4[1]]); push(u + 1, v + 1, d, 0, 0, 1, c, AO[q4[2]]); push(u, v + 1, d, 0, 0, 1, c, AO[q4[3]]);
    quad(AO[q4[0]], AO[q4[1]], AO[q4[2]], AO[q4[3]]);
  }
  for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
    const q = u + v * U, kk = key[q];
    if (!kk) { u++; continue; }
    const d = depth[q];
    let w = 1;
    while (u + w < U && key[q + w] === kk && depth[q + w] === d) w++;
    let h = 1;
    outer: while (v + h < V) {
      const r = q + h * U;
      for (let k = 0; k < w; k++) if (key[r + k] !== kk || depth[r + k] !== d) break outer;
      h++;
    }
    for (let hh = 0; hh < h; hh++) key.fill(0, q + hh * U, q + hh * U + w);
    const c = (kk - 1) >>> 2, a = AO[(kk - 1) & 3];
    push(u, v, d, 0, 0, 1, c, a); push(u + w, v, d, 0, 0, 1, c, a); push(u + w, v + h, d, 0, 0, 1, c, a); push(u, v + h, d, 0, 0, 1, c, a);
    quad(a, a, a, a);
    u += w;
  }
  // ---- tops (+y) and bottoms (-y) of steps, merged along u (AO darker toward the wall)
  for (const up of [1, -1]) {
    const k = up > 0 ? topK : botK;
    for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
      const q = u + v * U, d = depth[q], dn = Dv(u, v + up);
      if (d <= dn) { u++; continue; }
      let w = 1;
      while (u + w < U && depth[q + w] === d && Dv(u + w, v + up) === dn && color[q + w] === color[q]) w++;
      const c = color[q];
      const y = up > 0 ? v + 1 : v;
      if (up > 0) { push(u, y, d, 0, 1, 0, c, k); push(u + w, y, d, 0, 1, 0, c, k); push(u + w, y, dn, 0, 1, 0, c, k * AO[2]); push(u, y, dn, 0, 1, 0, c, k * AO[2]); }
      else { push(u, y, dn, 0, -1, 0, c, k * AO[2]); push(u + w, y, dn, 0, -1, 0, c, k * AO[2]); push(u + w, y, d, 0, -1, 0, c, k); push(u, y, d, 0, -1, 0, c, k); }
      quad(1, 1, 0, 0);
      u += w;
    }
  }
  // ---- sides (+x and -x), merged along v
  for (const sx of [1, -1]) {
    for (let u = 0; u < U; u++) for (let v = 0; v < V;) {
      const q = u + v * U, d = depth[q], dn = Dv(u + sx, v);
      if (d <= dn) { v++; continue; }
      let h = 1;
      while (v + h < V && depth[q + h * U] === d && Dv(u + sx, v + h) === dn && color[q + h * U] === color[q]) h++;
      const c = color[q], lo = sideK * AO[2];
      if (sx > 0) { const x = u + 1; push(x, v, dn, 1, 0, 0, c, lo); push(x, v + h, dn, 1, 0, 0, c, lo); push(x, v + h, d, 1, 0, 0, c, sideK); push(x, v, d, 1, 0, 0, c, sideK); }
      else { const x = u; push(x, v, d, -1, 0, 0, c, sideK); push(x, v + h, d, -1, 0, 0, c, sideK); push(x, v + h, dn, -1, 0, 0, c, lo); push(x, v, dn, -1, 0, 0, c, lo); }
      quad(0, 0, 1, 1);
      v += h;
    }
  }
  MESH_STATS.tris += out.ni / 3;
  if (!out.nv) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.pos.slice(0, out.nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.nor.slice(0, out.nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(out.col.slice(0, out.nv * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(out.nv > 65535 ? out.idx.slice(0, out.ni) : Uint16Array.from(out.idx.subarray(0, out.ni)), 1));
  geo.computeBoundingSphere();
  return geo;
}

/** A relief mesh with the shared toon material and the outline layer. */
export function reliefMeshAll(depth, color, U, V, opts = {}) {
  const geo = meshReliefAll(depth, color, U, V, opts);
  const mesh = new THREE.Mesh(geo || new THREE.BufferGeometry(), voxelMaterial(opts.kind ?? 'toon'));
  if (!geo) mesh.visible = false;
  if (opts.outline !== false) mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}

/**
 * Textured relief: the same columns, but colour comes from a U×V texture (one texel per column, uv
 * set per face) so fronts merge greedily across colours and only depth + corner AO split them.
 * The vertex colours carry just the AO / face shading. vOff/vTotal place this relief's rows inside
 * a taller atlas texture (several walls in one texture). Returns a BufferGeometry or null.
 */
export function meshReliefTex(depth, U, V, opts = {}) {
  const s = opts.scale ?? 1 / 32;
  const sideK = opts.sideShade ?? 0.88, topK = opts.topShade ?? 1.04, botK = opts.bottomShade ?? 0.8;
  const uW = opts.texW ?? U, vOff = opts.vOff ?? 0, vT = opts.vTotal ?? V;
  const out = new Out(Math.max(4096, (U * V) >> 3));
  let uv = new Float32Array(out.pos.length / 3 * 2);
  const Dv = (u, v) => (u < 0 || v < 0 || u >= U || v >= V ? 0 : depth[u + v * U]);
  const push = (x, y, z, nx, ny, nz, k, tu, tv) => {
    if ((out.nv + 1) * 3 > out.pos.length) { out.grow(); const b = new Float32Array(out.pos.length / 3 * 2); b.set(uv); uv = b; }
    const i = out.nv * 3;
    out.pos[i] = x * s; out.pos[i + 1] = y * s; out.pos[i + 2] = z * s;
    out.nor[i] = nx; out.nor[i + 1] = ny; out.nor[i + 2] = nz;
    out.col[i] = k; out.col[i + 1] = k; out.col[i + 2] = k;
    uv[out.nv * 2] = tu / uW; uv[out.nv * 2 + 1] = (tv + vOff) / vT;
    out.nv++;
  };
  const quad = (a0, a1, a2, a3) => {
    if (out.ni + 6 > out.idx.length) out.grow();
    const v0 = out.nv - 4, I = out.idx;
    let j = out.ni;
    if (a0 + a2 < a1 + a3) { I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0 + 3; I[j++] = v0 + 1; I[j++] = v0 + 3; I[j++] = v0; }
    else { I[j++] = v0; I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0; I[j++] = v0 + 2; I[j++] = v0 + 3; }
    out.ni = j;
  };
  // fronts: per-column AO; flat-AO columns merge greedily by depth
  const key = new Int32Array(U * V);
  const q4 = [0, 0, 0, 0];
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const q = u + v * U, d = depth[q];
    if (d <= 0) { key[q] = 0; continue; }
    const L = Dv(u - 1, v) > d ? 1 : 0, R = Dv(u + 1, v) > d ? 1 : 0, Dn = Dv(u, v - 1) > d ? 1 : 0, Up = Dv(u, v + 1) > d ? 1 : 0;
    q4[0] = L && Dn ? 3 : L + Dn + (Dv(u - 1, v - 1) > d ? 1 : 0);
    q4[1] = R && Dn ? 3 : R + Dn + (Dv(u + 1, v - 1) > d ? 1 : 0);
    q4[2] = R && Up ? 3 : R + Up + (Dv(u + 1, v + 1) > d ? 1 : 0);
    q4[3] = L && Up ? 3 : L + Up + (Dv(u - 1, v + 1) > d ? 1 : 0);
    if (q4[0] === q4[1] && q4[1] === q4[2] && q4[2] === q4[3]) { key[q] = (d * 4 + q4[0] + 1) | 0; continue; }
    key[q] = 0;
    const a = q4.map((x) => AO[x]);
    push(u, v, d, 0, 0, 1, a[0], u, v); push(u + 1, v, d, 0, 0, 1, a[1], u + 1, v); push(u + 1, v + 1, d, 0, 0, 1, a[2], u + 1, v + 1); push(u, v + 1, d, 0, 0, 1, a[3], u, v + 1);
    quad(a[0], a[1], a[2], a[3]);
  }
  for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
    const q = u + v * U, kk = key[q];
    if (!kk) { u++; continue; }
    let w = 1;
    while (u + w < U && key[q + w] === kk) w++;
    let h = 1;
    outer: while (v + h < V) {
      const r = q + h * U;
      for (let k = 0; k < w; k++) if (key[r + k] !== kk) break outer;
      h++;
    }
    for (let hh = 0; hh < h; hh++) key.fill(0, q + hh * U, q + hh * U + w);
    const d = (kk - 1) >> 2, a = AO[(kk - 1) & 3];
    push(u, v, d, 0, 0, 1, a, u, v); push(u + w, v, d, 0, 0, 1, a, u + w, v); push(u + w, v + h, d, 0, 0, 1, a, u + w, v + h); push(u, v + h, d, 0, 0, 1, a, u, v + h);
    quad(a, a, a, a);
    u += w;
  }
  // tops / bottoms of steps (texel row of the column)
  for (const up of [1, -1]) {
    const k = up > 0 ? topK : botK;
    for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
      const q = u + v * U, d = depth[q], dn = Dv(u, v + up);
      if (d <= dn) { u++; continue; }
      let w = 1;
      while (u + w < U && depth[q + w] === d && Dv(u + w, v + up) === dn) w++;
      const y = up > 0 ? v + 1 : v, tv = v + 0.5, lo = k * AO[2];
      if (up > 0) { push(u, y, d, 0, 1, 0, k, u, tv); push(u + w, y, d, 0, 1, 0, k, u + w, tv); push(u + w, y, dn, 0, 1, 0, lo, u + w, tv); push(u, y, dn, 0, 1, 0, lo, u, tv); }
      else { push(u, y, dn, 0, -1, 0, lo, u, tv); push(u + w, y, dn, 0, -1, 0, lo, u + w, tv); push(u + w, y, d, 0, -1, 0, k, u + w, tv); push(u, y, d, 0, -1, 0, k, u, tv); }
      quad(1, 1, 0, 0);
      u += w;
    }
  }
  // sides (texel column of the column)
  for (const sx of [1, -1]) {
    for (let u = 0; u < U; u++) for (let v = 0; v < V;) {
      const q = u + v * U, d = depth[q], dn = Dv(u + sx, v);
      if (d <= dn) { v++; continue; }
      let h = 1;
      while (v + h < V && depth[q + h * U] === d && Dv(u + sx, v + h) === dn) h++;
      const tu = u + 0.5, lo = sideK * AO[2];
      if (sx > 0) { const x = u + 1; push(x, v, dn, 1, 0, 0, lo, tu, v); push(x, v + h, dn, 1, 0, 0, lo, tu, v + h); push(x, v + h, d, 1, 0, 0, sideK, tu, v + h); push(x, v, d, 1, 0, 0, sideK, tu, v); }
      else { const x = u; push(x, v, d, -1, 0, 0, sideK, tu, v); push(x, v + h, d, -1, 0, 0, sideK, tu, v + h); push(x, v + h, dn, -1, 0, 0, lo, tu, v + h); push(x, v, dn, -1, 0, 0, lo, tu, v); }
      quad(0, 0, 1, 1);
      v += h;
    }
  }
  MESH_STATS.tris += out.ni / 3;
  if (!out.nv) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.pos.slice(0, out.nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.nor.slice(0, out.nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(out.col.slice(0, out.nv * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv.slice(0, out.nv * 2), 2));
  geo.setIndex(new THREE.BufferAttribute(out.nv > 65535 ? out.idx.slice(0, out.ni) : Uint16Array.from(out.idx.subarray(0, out.ni)), 1));
  geo.computeBoundingSphere();
  return geo;
}

/** A pixel texture (RGBA bytes, sRGB) for a textured relief: nearest texels, nearest mips. */
export function reliefTexture(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
