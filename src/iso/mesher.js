// Fast greedy voxel mesher for the iso scenes' big static grids (walls, facades, props).
// Same faces, corner AO and vertex layout as gfx/Voxel.js meshGrid / meshGridGreedy, but:
//  - works on a padded copy of the grid (no bounds checks in the hot loops),
//  - writes straight into growable typed arrays (no per-face allocations),
//  - can skip the faces the fixed iso camera never sees (opts.view = camera "back" vector
//    in the grid's local space), which halves the work and the triangle count.
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

// face order matches gfx/Voxel.js: +x -x +y -y +z -z
const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SHADE = [0.86, 0.8, 1.0, 0.62, 0.93, 0.74];
const AO_CURVE = [1.0, 0.8, 0.66, 0.52];
// corners of each face as (u, v) in {0,1}, CCW seen from outside (u/v axes per face below)
const CORNERS = [
  [[0, 0], [1, 0], [1, 1], [0, 1]], // +x (u=y, v=z)
  [[0, 1], [1, 1], [1, 0], [0, 0]], // -x
  [[0, 1], [1, 1], [1, 0], [0, 0]], // +y (u=x, v=z)
  [[0, 0], [1, 0], [1, 1], [0, 1]], // -y
  [[1, 0], [1, 1], [0, 1], [0, 0]], // +z (u=x, v=y)
  [[0, 0], [0, 1], [1, 1], [1, 0]], // -z
];
const AXIS = [0, 0, 1, 1, 2, 2];
/** sRGB byte → linear (vertex colors live in the linear working space, like THREE.Color.setHex). */
export const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4); }
const UAX = [1, 1, 0, 0, 0, 0];
const VAX = [2, 2, 2, 2, 1, 1];

/** The fixed iso camera's "back" vector (focus → camera), see IsoCamera. */
export const ISO_BACK = new THREE.Vector3(Math.sin(Math.PI / 4) * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), Math.cos(Math.PI / 4) * Math.cos(Math.PI / 6));

let CUR_VIEW = null;
/** Run fn with a default mesh view (camera back vector in the local space of what fn builds). */
export function withView(view, fn) {
  const prev = CUR_VIEW;
  CUR_VIEW = view;
  try { return fn(); } finally { CUR_VIEW = prev; }
}

/** Camera back vector in the local space of something rotated by yaw (radians) about y. */
export function viewForYaw(yaw = 0) {
  return ISO_BACK.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
}

class Out {
  constructor(n = 4096) {
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.idx = new Uint32Array(n * 1.5);
    this.nv = 0;
    this.ni = 0;
  }
  grow() {
    const n = this.pos.length * 2;
    const g = (a, len) => { const b = new a.constructor(len); b.set(a); return b; };
    this.pos = g(this.pos, n); this.nor = g(this.nor, n); this.col = g(this.col, n);
    this.idx = g(this.idx, n / 2);
  }
}

/**
 * Mesh a VoxelGrid. opts: {scale, pivot:[x,y,z] (voxel coords → origin), view (Vector3, local),
 * faces (array of 6 bools, overrides view), ao (default true), shade (bake face shading),
 * aoCurve (array of 4 brightness levels)}. Returns a BufferGeometry or null when empty.
 */
export const MESH_STATS = { calls: 0, cells: 0, ms: 0, tris: 0 };
/** Mesher defaults used when a call doesn't say: ao = true | false | 'tops' (AO on upward faces only). */
const DEF = { ao: true };
/** Change the mesher defaults (e.g. a lighter AO for a big scene); returns the previous ones. */
export function meshDefaults(o) { const prev = { ...DEF }; Object.assign(DEF, o); return prev; }
export function meshFast(grid, opts = {}) {
  const tStart = performance.now();
  MESH_STATS.calls++;
  MESH_STATS.cells += grid.w * grid.h * grid.d;
  const s = opts.scale ?? 1 / 16;
  const [px, py, pz] = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const bake = opts.shade ?? false;
  const useAO = opts.ao ?? DEF.ao;
  const curve = opts.aoCurve ?? AO_CURVE;
  const W = grid.w, H = grid.h, D = grid.d;
  const PW = W + 2, PH = H + 2, PD = D + 2;
  const P = new Uint32Array(PW * PH * PD);
  const src = grid.data;
  // copy into the padded grid, tracking the filled bounding box and per-slice occupancy
  const occ = [new Int32Array(W), new Int32Array(H), new Int32Array(D)];
  let x0 = W, x1 = -1, y0 = H, y1 = -1, z0 = D, z1 = -1;
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) {
    const so = W * (y + H * z), po = 1 + PW * (y + 1 + PH * (z + 1));
    let rowAny = false;
    for (let x = 0; x < W; x++) {
      const v = src[so + x];
      if (!v) continue;
      P[po + x] = v;
      occ[0][x]++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      rowAny = true;
    }
    if (rowAny) {
      occ[1][y]++; occ[2][z]++;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  if (x1 < 0) return null;
  const bmin = [x0, y0, z0], bmax = [x1, y1, z1];
  const stride = [1, PW, PW * PH];
  const dims = [W, H, D];
  let faces = opts.faces;
  if (!faces) {
    const v = opts.view ?? CUR_VIEW;
    faces = N.map((n) => !v || n[0] * v.x + n[1] * v.y + n[2] * v.z > 0.01);
  }
  const out = new Out(Math.max(1024, Math.min(1 << 20, (W * H + H * D + W * D) * 2)));

  const tmp = new Float64Array(3);
  const lvl = new Int32Array(4);
  const emit = (fi, color, a0, a1, a2, a3, base, a, b, w, h) => {
    if ((out.nv + 4) * 3 > out.pos.length || out.ni + 6 > out.idx.length) out.grow();
    const d = AXIS[fi], u = UAX[fi], vv = VAX[fi];
    const n = N[fi];
    const sh = bake ? SHADE[fi] : 1;
    const r = LIN[(color >> 16) & 255], g = LIN[(color >> 8) & 255], bl = LIN[color & 255];
    const C = CORNERS[fi];
    lvl[0] = a0; lvl[1] = a1; lvl[2] = a2; lvl[3] = a3;
    const pos = out.pos, nor = out.nor, col = out.col;
    let k = out.nv * 3;
    tmp[d] = base;
    for (let i = 0; i < 4; i++) {
      tmp[u] = C[i][0] ? a + w : a;
      tmp[vv] = C[i][1] ? b + h : b;
      pos[k] = (tmp[0] - px) * s; pos[k + 1] = (tmp[1] - py) * s; pos[k + 2] = (tmp[2] - pz) * s;
      nor[k] = n[0]; nor[k + 1] = n[1]; nor[k + 2] = n[2];
      const m = curve[lvl[i]] * sh;
      col[k] = r * m; col[k + 1] = g * m; col[k + 2] = bl * m;
      k += 3;
    }
    const v0 = out.nv;
    out.nv += 4;
    const I = out.idx;
    let j = out.ni;
    if (curve[a0] + curve[a2] < curve[a1] + curve[a3]) { I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0 + 3; I[j++] = v0 + 1; I[j++] = v0 + 3; I[j++] = v0; }
    else { I[j++] = v0; I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0; I[j++] = v0 + 2; I[j++] = v0 + 3; }
    out.ni = j;
  };

  for (let fi = 0; fi < 6; fi++) {
    if (!faces[fi]) continue;
    const d = AXIS[fi], u = UAX[fi], v = VAX[fi];
    const sign = N[fi][d];
    const sd = stride[d] * sign, su = stride[u], sv = stride[v];
    const U = dims[u], V = dims[v];
    const mask = new Int32Array(U * V);
    const C = CORNERS[fi];
    // tangent signs per corner
    const t00 = C[0][0] ? su : -su, t01 = C[0][1] ? sv : -sv;
    const t10 = C[1][0] ? su : -su, t11 = C[1][1] ? sv : -sv;
    const t20 = C[2][0] ? su : -su, t21 = C[2][1] ? sv : -sv;
    const t30 = C[3][0] ? su : -su, t31 = C[3][1] ? sv : -sv;
    const off = 1 + PW + PW * PH;
    const sdd = stride[d];
    const top = sign > 0 ? 1 : 0;
    const aMin = bmin[u], aMax = bmax[u], bMin = bmin[v], bMax = bmax[v];
    const occD = occ[d];
    const aoHere = useAO === true || (useAO === 'tops' && N[fi][1] > 0);
    for (let sl = bmin[d]; sl <= bmax[d]; sl++) {
      if (!occD[sl]) continue;
      let any = false;
      for (let b = bMin; b <= bMax; b++) {
        let pi = off + sl * sdd + b * sv + aMin * su;
        let mi = b * U + aMin;
        for (let a = aMin; a <= aMax; a++, pi += su, mi++) {
          const raw = P[pi];
          if (!raw || P[pi + sd]) { mask[mi] = 0; continue; }
          const c = raw & 0xffffff;
          const o = pi + sd;
          let q0 = 0, q1 = 0, q2 = 0, q3 = 0;
          if (aoHere) {
            let e1 = P[o + t00] ? 1 : 0, e2 = P[o + t01] ? 1 : 0;
            q0 = e1 && e2 ? 3 : e1 + e2 + (P[o + t00 + t01] ? 1 : 0);
            e1 = P[o + t10] ? 1 : 0; e2 = P[o + t11] ? 1 : 0;
            q1 = e1 && e2 ? 3 : e1 + e2 + (P[o + t10 + t11] ? 1 : 0);
            e1 = P[o + t20] ? 1 : 0; e2 = P[o + t21] ? 1 : 0;
            q2 = e1 && e2 ? 3 : e1 + e2 + (P[o + t20 + t21] ? 1 : 0);
            e1 = P[o + t30] ? 1 : 0; e2 = P[o + t31] ? 1 : 0;
            q3 = e1 && e2 ? 3 : e1 + e2 + (P[o + t30 + t31] ? 1 : 0);
          }
          if (q0 === q1 && q1 === q2 && q2 === q3) { mask[mi] = c * 4 + q0 + 1; any = true; }
          else {
            mask[mi] = 0;
            emit(fi, c, q0, q1, q2, q3, sl + top, a, b, 1, 1);
          }
        }
      }
      if (!any) continue;
      for (let b = bMin; b <= bMax; b++) {
        for (let a = aMin; a <= aMax;) {
          const key = mask[a + b * U];
          if (!key) { a++; continue; }
          let w = 1;
          while (a + w <= aMax && mask[a + w + b * U] === key) w++;
          let h = 1;
          outer: while (b + h <= bMax) {
            const row = (b + h) * U;
            for (let k = 0; k < w; k++) if (mask[a + k + row] !== key) break outer;
            h++;
          }
          for (let hh = 0; hh < h; hh++) mask.fill(0, a + (b + hh) * U, a + w + (b + hh) * U);
          const lv = (key - 1) & 3;
          emit(fi, (key - 1) >>> 2, lv, lv, lv, lv, sl + top, a, b, w, h);
          a += w;
        }
      }
    }
  }
  MESH_STATS.ms += performance.now() - tStart;
  MESH_STATS.tris += out.ni / 3;
  if (MESH_STATS.log) MESH_STATS.log.push([out.ni / 3, grid.w, grid.h, grid.d, new Error().stack.split('\n').slice(4, 6).map((l) => l.trim().replace(/^at /, '').replace(/\(.*src\//, '(').replace(/:\d+\)$/, ')')).join(' < ')]);
  if (!out.nv) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.pos.slice(0, out.nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.nor.slice(0, out.nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(out.col.slice(0, out.nv * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(out.nv > 65535 ? out.idx.slice(0, out.ni) : Uint16Array.from(out.idx.subarray(0, out.ni)), 1));
  geo.computeBoundingSphere();
  return geo;
}

const EMPTY = new THREE.BufferGeometry();
EMPTY.userData.shared = true;

/**
 * Mesh a grid into a lit (toon) or glowing (basic) mesh with the outline layer.
 * opts: meshFast options + {kind: 'toon'|'basic'|'lambert', outline (default true)}.
 */
export function fastMesh(grid, opts = {}) {
  const kind = opts.kind ?? 'toon';
  const geo = meshFast(grid, { ...opts, shade: opts.shade ?? kind === 'basic' });
  const mesh = new THREE.Mesh(geo || EMPTY.clone(), voxelMaterial(kind));
  if (!geo) mesh.visible = false;
  if (opts.outline !== false) mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}

// ---------------------------------------------------------------- relief (heightfield) mesher
/**
 * Mesh a relief: a U×V grid of columns sticking out toward +z, column (u,v) occupying
 * z ∈ [0, depth[u+v*U]) (voxel units). Emits only the faces the camera can see (front +z,
 * tops +y, and the side facing the view), with the same corner AO as the voxel mesher on
 * the front faces. color[q] is the column's sRGB hex; sides use sideShade × color.
 * Much faster than voxelizing the shell: cost is O(U×V).
 */
export function meshRelief(depth, color, U, V, opts = {}) {
  const s = opts.scale ?? 1 / 16;
  const curve = opts.aoCurve ?? AO_CURVE;
  const view = opts.view ?? ISO_BACK;
  const sideK = opts.sideShade ?? 0.84;
  const topK = opts.topShade ?? 1;
  const rAO = opts.ao ?? true;
  const aoMin = opts.aoMin ?? 0;
  const sideSign = view.x >= 0 ? 1 : -1;
  const vSign = view.y >= 0 ? 1 : -1;
  const out = new Out(Math.max(1024, U * V));
  const Dv = (u, v) => (u < 0 || v < 0 || u >= U || v >= V ? 0 : depth[u + v * U]);
  const push = (x, y, z, nx, ny, nz, c, a) => {
    if ((out.nv + 1) * 3 > out.pos.length) out.grow();
    const k = out.nv * 3;
    out.pos[k] = x * s; out.pos[k + 1] = y * s; out.pos[k + 2] = z * s;
    out.nor[k] = nx; out.nor[k + 1] = ny; out.nor[k + 2] = nz;
    const m = curve[a];
    out.col[k] = LIN[(c >> 16) & 255] * m;
    out.col[k + 1] = LIN[(c >> 8) & 255] * m;
    out.col[k + 2] = LIN[c & 255] * m;
    out.nv++;
  };
  const quad = (a0, a1, a2, a3) => {
    if (out.ni + 6 > out.idx.length) out.grow();
    const v0 = out.nv - 4, I = out.idx;
    let j = out.ni;
    if (curve[a0] + curve[a2] < curve[a1] + curve[a3]) { I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0 + 3; I[j++] = v0 + 1; I[j++] = v0 + 3; I[j++] = v0; }
    else { I[j++] = v0; I[j++] = v0 + 1; I[j++] = v0 + 2; I[j++] = v0; I[j++] = v0 + 2; I[j++] = v0 + 3; }
    out.ni = j;
  };
  const scaleC = (c, k) => {
    const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
    return (r << 16) | (g << 8) | b;
  };
  // ---- front faces (+z), 2D greedy over equal depth + color + flat AO
  const key = new Int32Array(U * V);
  const aoq = new Uint8Array(4);
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const q = u + v * U, d = depth[q];
    if (d <= 0) { key[q] = 0; continue; }
    // corners: (0,0) (1,0) (1,1) (0,1) in (u,v) — CCW seen from +z
    if (!rAO) { key[q] = ((color[q] & 0xffffff) * 4 + 1) | 0; continue; }
    const dd = d + aoMin; // only steps taller than aoMin voxels cast AO
    const L = Dv(u - 1, v) > dd ? 1 : 0, Rr = Dv(u + 1, v) > dd ? 1 : 0, Dn = Dv(u, v - 1) > dd ? 1 : 0, Up = Dv(u, v + 1) > dd ? 1 : 0;
    aoq[0] = L && Dn ? 3 : L + Dn + (Dv(u - 1, v - 1) > dd ? 1 : 0);
    aoq[1] = Rr && Dn ? 3 : Rr + Dn + (Dv(u + 1, v - 1) > dd ? 1 : 0);
    aoq[2] = Rr && Up ? 3 : Rr + Up + (Dv(u + 1, v + 1) > dd ? 1 : 0);
    aoq[3] = L && Up ? 3 : L + Up + (Dv(u - 1, v + 1) > dd ? 1 : 0);
    if (aoq[0] === aoq[1] && aoq[1] === aoq[2] && aoq[2] === aoq[3]) { key[q] = ((color[q] & 0xffffff) * 4 + aoq[0] + 1) | 0; continue; }
    key[q] = 0;
    const c = color[q];
    push(u, v, d, 0, 0, 1, c, aoq[0]); push(u + 1, v, d, 0, 0, 1, c, aoq[1]); push(u + 1, v + 1, d, 0, 0, 1, c, aoq[2]); push(u, v + 1, d, 0, 0, 1, c, aoq[3]);
    quad(aoq[0], aoq[1], aoq[2], aoq[3]);
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
    const c = (kk - 1) >>> 2, a = (kk - 1) & 3;
    push(u, v, d, 0, 0, 1, c, a); push(u + w, v, d, 0, 0, 1, c, a); push(u + w, v + h, d, 0, 0, 1, c, a); push(u, v + h, d, 0, 0, 1, c, a);
    quad(a, a, a, a);
    u += w;
  }
  // ---- tops (+y) where the column above is shallower (or bottoms (-y) for terrain-like reliefs); merged along u
  for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
    const q = u + v * U, d = depth[q], du = Dv(u, v + vSign);
    if (d <= du) { u++; continue; }
    const c = scaleC(color[q], topK);
    let w = 1;
    while (u + w < U && depth[q + w] === d && Dv(u + w, v + vSign) === du && color[q + w] === color[q]) w++;
    if (vSign > 0) {
      // CCW seen from +y: (x,z): (0,1) (1,1) (1,0) (0,0) → back edge (z=du) occluded by the wall above
      const y = v + 1;
      push(u, y, d, 0, 1, 0, c, 0); push(u + w, y, d, 0, 1, 0, c, 0); push(u + w, y, du, 0, 1, 0, c, 2); push(u, y, du, 0, 1, 0, c, 2);
      quad(0, 0, 2, 2);
    } else {
      // CCW seen from -y: (x,z): (0,0) (1,0) (1,1) (0,1)
      const y = v;
      push(u, y, du, 0, -1, 0, c, 2); push(u + w, y, du, 0, -1, 0, c, 2); push(u + w, y, d, 0, -1, 0, c, 0); push(u, y, d, 0, -1, 0, c, 0);
      quad(2, 2, 0, 0);
    }
    u += w;
  }
  // ---- sides facing the view (+x or -x): where the neighbor is shallower; merged along v
  for (let u = 0; u < U; u++) for (let v = 0; v < V;) {
    const q = u + v * U, d = depth[q], dn = Dv(u + sideSign, v);
    if (d <= dn) { v++; continue; }
    const c = scaleC(color[q], sideK);
    let h = 1;
    while (v + h < V && depth[q + h * U] === d && Dv(u + sideSign, v + h) === dn && color[q + h * U] === color[q]) h++;
    if (sideSign > 0) {
      // +x face at x = u+1, CCW seen from +x: (y,z): (0,0) (1,0) (1,1) (0,1)
      const x = u + 1;
      push(x, v, dn, 1, 0, 0, c, 2); push(x, v + h, dn, 1, 0, 0, c, 2); push(x, v + h, d, 1, 0, 0, c, 0); push(x, v, d, 1, 0, 0, c, 0);
    } else {
      // -x face at x = u, CCW seen from -x: (y,z): (0,1) (1,1) (1,0) (0,0)
      const x = u;
      push(x, v, d, -1, 0, 0, c, 0); push(x, v + h, d, -1, 0, 0, c, 0); push(x, v + h, dn, -1, 0, 0, c, 2); push(x, v, dn, -1, 0, 0, c, 2);
    }
    quad(sideSign > 0 ? 2 : 0, sideSign > 0 ? 2 : 0, sideSign > 0 ? 0 : 2, sideSign > 0 ? 0 : 2);
    v += h;
  }
  MESH_STATS.tris += out.ni / 3;
  if (MESH_STATS.log) MESH_STATS.log.push([out.ni / 3, U, V, 0, 'relief < ' + new Error().stack.split('\n').slice(2, 4).map((l) => l.trim().replace(/^at /, '').replace(/\(.*src\//, '(').replace(/:\d+\)$/, ')')).join(' < ')]);
  if (!out.nv) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.pos.slice(0, out.nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.nor.slice(0, out.nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(out.col.slice(0, out.nv * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(out.nv > 65535 ? out.idx.slice(0, out.ni) : Uint16Array.from(out.idx.subarray(0, out.ni)), 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Relief mesh with the shared toon material + outline layer. */
export function reliefMesh(depth, color, U, V, opts = {}) {
  const geo = meshRelief(depth, color, U, V, opts);
  const mesh = new THREE.Mesh(geo || EMPTY.clone(), voxelMaterial(opts.kind ?? 'toon'));
  if (!geo) mesh.visible = false;
  if (opts.outline !== false) mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}
