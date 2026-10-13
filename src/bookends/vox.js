// Voxel helpers for big environment pieces. Same look as gfx/Voxel.js (baked AO, vertex colours)
// but the mesher can treat the outside of the grid as solid on chosen sides, so large dioramas
// don't pay for faces nobody will ever see.
import * as THREE from 'three';
import { VoxelGrid, voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { hashStr, shade, mixHex } from '../core/util.js';

export { VoxelGrid };

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86, side: 'px' },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8, side: 'nx' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, side: 'py' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62, side: 'ny' },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.93, side: 'pz' },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74, side: 'nz' },
];
const AO_CURVE = [1.0, 0.8, 0.66, 0.52];
const _c = new THREE.Color();

/**
 * Mesh a VoxelGrid. opts: scale, pivot [x,y,z] (voxel coords), shade (bake face shading),
 * ao (default true), solid: {nx,px,ny,py,nz,pz} sides whose outside counts as filled,
 * faceShade: override per-face multipliers {px,nx,py,ny,pz,nz}.
 */
export function meshVox(grid, opts = {}) {
  const s = opts.scale ?? 1 / 16;
  const [px, py, pz] = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const bake = opts.shade ?? false;
  const ao = opts.ao ?? true;
  const solid = opts.solid || {};
  const fs = opts.faceShade || {};
  const W = grid.w, H = grid.h, D = grid.d;
  const data = grid.data;
  const filled = (x, y, z) => {
    if (x < 0) return !!solid.nx;
    if (x >= W) return !!solid.px;
    if (y < 0) return !!solid.ny;
    if (y >= H) return !!solid.py;
    if (z < 0) return !!solid.nz;
    if (z >= D) return !!solid.pz;
    return data[x + W * (y + H * z)] !== 0;
  };
  const pos = [], nor = [], col = [], idx = [];
  let v = 0;
  const aoVals = [0, 0, 0, 0];
  for (let z = 0; z < D; z++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const raw = data[x + W * (y + H * z)];
        if (!raw) continue;
        _c.setHex(raw & 0xffffff);
        for (const f of FACES) {
          const [nx, ny, nz] = f.n;
          if (filled(x + nx, y + ny, z + nz)) continue;
          for (let ci = 0; ci < 4; ci++) {
            const corner = f.c[ci];
            let lvl = 0;
            if (ao) {
              const ox = x + nx, oy = y + ny, oz = z + nz;
              let a0 = -1, a1 = -1;
              for (let k = 0; k < 3; k++) if (f.n[k] === 0) { if (a0 < 0) a0 = k; else a1 = k; }
              const d1 = [0, 0, 0], d2 = [0, 0, 0];
              d1[a0] = corner[a0] === 1 ? 1 : -1;
              d2[a1] = corner[a1] === 1 ? 1 : -1;
              const s1 = filled(ox + d1[0], oy + d1[1], oz + d1[2]) ? 1 : 0;
              const s2 = filled(ox + d2[0], oy + d2[1], oz + d2[2]) ? 1 : 0;
              const cc = filled(ox + d1[0] + d2[0], oy + d1[1] + d2[1], oz + d1[2] + d2[2]) ? 1 : 0;
              lvl = s1 && s2 ? 3 : s1 + s2 + cc;
            }
            aoVals[ci] = AO_CURVE[lvl];
          }
          const k = bake ? (fs[f.side] ?? f.shade) : 1;
          for (let i = 0; i < 4; i++) {
            const cr = f.c[i];
            pos.push((x + cr[0] - px) * s, (y + cr[1] - py) * s, (z + cr[2] - pz) * s);
            nor.push(nx, ny, nz);
            const a = aoVals[i] * k;
            col.push(_c.r * a, _c.g * a, _c.b * a);
          }
          if (aoVals[0] + aoVals[2] < aoVals[1] + aoVals[3]) idx.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
          else idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
          v += 4;
        }
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- greedy mesher
// Same faces, AO and vertex layout as meshVox (including `solid` sides and `faceShade`), but
// coplanar faces that share a colour and a flat AO level merge into one quad. Faces with mixed
// corner AO stay single so the occlusion gradients are kept. Use it for hi-res props and big
// dioramas whose colours come in structured patches (bands, grain, 2x2 patches...).
const AXES = FACES.map((f) => {
  const d = f.n[0] ? 0 : f.n[1] ? 1 : 2;
  const t = [0, 1, 2].filter((k) => k !== d);
  return { d, u: d === 0 ? 1 : 0, v: d === 2 ? 1 : 2, t0: t[0], t1: t[1], tc: f.c.map((cr) => [cr[t[0]] ? 1 : -1, cr[t[1]] ? 1 : -1]) };
});

export function meshVoxGreedy(grid, opts = {}) {
  const s = opts.scale ?? 1 / 16;
  const [px, py, pz] = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const bake = opts.shade ?? false;
  const useAO = opts.ao ?? true;
  const sd = opts.solid || {};
  const fs = opts.faceShade || {};
  const W = grid.w, H = grid.h, D = grid.d, data = grid.data, WH = W * H;
  // padded occupancy: a 1-voxel border that follows the `solid` sides, so neighbour tests are plain offsets
  const PW = W + 2, PH = H + 2, PD = D + 2, PWH = PW * PH;
  const occ = new Uint8Array(PW * PH * PD);
  const side = (x, y, z) => (x === 0 ? sd.nx : x === PW - 1 ? sd.px : y === 0 ? sd.ny : y === PH - 1 ? sd.py : z === 0 ? sd.nz : sd.pz) ? 1 : 0;
  for (let z = 0; z < PD; z++) for (let y = 0; y < PH; y++) {
    const row = PW * (y + PH * z);
    if (z === 0 || z === PD - 1 || y === 0 || y === PH - 1) { for (let x = 0; x < PW; x++) occ[row + x] = side(x, y, z); continue; }
    occ[row] = side(0, y, z);
    occ[row + PW - 1] = side(PW - 1, y, z);
    const q0 = W * ((y - 1) + H * (z - 1));
    for (let x = 1; x < PW - 1; x++) occ[row + x] = data[q0 + x - 1] !== 0 ? 1 : 0;
  }
  // pass A: every exposed face, bucketed by direction and slice (raster order within a slice)
  const nOff = FACES.map((f) => f.n[0] + PW * f.n[1] + PWH * f.n[2]);
  const buckets = FACES.map((f, fi) => new Array([W, H, D][AXES[fi].d]));
  // opts.interior: a colour the caller only gives to fully enclosed voxels (skipped without tests)
  const skipRaw = opts.interior !== undefined ? ((opts.interior & 0xffffff) | (data.find((r) => r !== 0) & ~0xffffff)) : -1;
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) {
    const q0 = W * (y + H * z);
    const p0 = 1 + PW * (y + 1) + PWH * (z + 1);
    for (let x = 0; x < W; x++) {
      const raw = data[q0 + x];
      if (!raw || raw === skipRaw) continue;
      const p = p0 + x;
      for (let fi = 0; fi < 6; fi++) {
        if (occ[p + nOff[fi]]) continue;
        const sl = fi < 2 ? x : fi < 4 ? y : z;
        const b = buckets[fi];
        (b[sl] || (b[sl] = [])).push(q0 + x);
      }
    }
  }
  // exact upper bound on the output size: every exposed face as its own quad
  let F = 0;
  for (const b of buckets) for (const l of b) if (l) F += l.length;
  const pos = new Float32Array(F * 12), nor = new Float32Array(F * 12), col = new Float32Array(F * 12);
  const idx = F * 4 > 65535 ? new Uint32Array(F * 6) : new Uint16Array(F * 6);
  let vc = 0, ic = 0, vo = 0;
  const linCache = new Map();
  const corners = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const lv = [0, 0, 0, 0];
  const emit = (f, colorHex, a0, a1, a2, a3) => {
    let lin = linCache.get(colorHex);
    if (!lin) { _c.setHex(colorHex); lin = [_c.r, _c.g, _c.b]; linCache.set(colorHex, lin); }
    const sh = bake ? (fs[f.side] ?? f.shade) : 1;
    lv[0] = AO_CURVE[a0] * sh; lv[1] = AO_CURVE[a1] * sh; lv[2] = AO_CURVE[a2] * sh; lv[3] = AO_CURVE[a3] * sh;
    const nx = f.n[0], ny = f.n[1], nz = f.n[2];
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      pos[vo] = (c[0] - px) * s; pos[vo + 1] = (c[1] - py) * s; pos[vo + 2] = (c[2] - pz) * s;
      nor[vo] = nx; nor[vo + 1] = ny; nor[vo + 2] = nz;
      const l = lv[i];
      col[vo] = lin[0] * l; col[vo + 1] = lin[1] * l; col[vo + 2] = lin[2] * l;
      vo += 3;
    }
    if (lv[0] + lv[2] < lv[1] + lv[3]) { idx[ic] = vc + 1; idx[ic + 1] = vc + 2; idx[ic + 2] = vc + 3; idx[ic + 3] = vc + 1; idx[ic + 4] = vc + 3; idx[ic + 5] = vc; }
    else { idx[ic] = vc; idx[ic + 1] = vc + 1; idx[ic + 2] = vc + 2; idx[ic + 3] = vc; idx[ic + 4] = vc + 2; idx[ic + 5] = vc + 3; }
    ic += 6;
    vc += 4;
  };
  const dims = [W, H, D];
  const cell = [0, 0, 0];
  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi], A = AXES[fi];
    const { d, u, v } = A;
    const U = dims[u], V = dims[v];
    const aoOff = A.tc.map(([s0, s1]) => {
      const e1 = [0, 0, 0], e2 = [0, 0, 0];
      e1[A.t0] = s0; e2[A.t1] = s1;
      const o = (vv) => (f.n[0] + vv[0]) + PW * (f.n[1] + vv[1]) + PWH * (f.n[2] + vv[2]);
      return [o(e1), o(e2), o([e1[0] + e2[0], e1[1] + e2[1], e1[2] + e2[2]])];
    });
    const [o0, o1, o2, o3] = aoOff;
    const mask = new Float64Array(U * V);
    const bk = buckets[fi];
    for (let sl = 0; sl < bk.length; sl++) {
      const list = bk[sl];
      if (!list) continue;
      const n = list.length;
      const mis = new Int32Array(n);
      for (let li = 0; li < n; li++) {
        const q = list[li];
        const x = q % W, yz = (q - x) / W, y = yz % H, z = (yz - y) / H;
        cell[0] = x; cell[1] = y; cell[2] = z;
        const a = cell[u], b = cell[v];
        const p = (x + 1) + PW * (y + 1) + PWH * (z + 1);
        const c = data[q] & 0xffffff;
        let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
        if (useAO) {
          let e1 = occ[p + o0[0]], e2 = occ[p + o0[1]]; a0 = e1 && e2 ? 3 : e1 + e2 + occ[p + o0[2]];
          e1 = occ[p + o1[0]]; e2 = occ[p + o1[1]]; a1 = e1 && e2 ? 3 : e1 + e2 + occ[p + o1[2]];
          e1 = occ[p + o2[0]]; e2 = occ[p + o2[1]]; a2 = e1 && e2 ? 3 : e1 + e2 + occ[p + o2[2]];
          e1 = occ[p + o3[0]]; e2 = occ[p + o3[1]]; a3 = e1 && e2 ? 3 : e1 + e2 + occ[p + o3[2]];
        }
        const mi = a + b * U;
        if (a0 === a1 && a1 === a2 && a2 === a3) { mask[mi] = c * 4 + a0 + 1; mis[li] = mi; }
        else {
          mis[li] = -1;
          for (let i = 0; i < 4; i++) { const cr = f.c[i]; corners[i][0] = x + cr[0]; corners[i][1] = y + cr[1]; corners[i][2] = z + cr[2]; }
          emit(f, c, a0, a1, a2, a3);
        }
      }
      // greedy merge in raster order over the touched cells only
      for (let li = 0; li < n; li++) {
        const mi = mis[li];
        if (mi < 0) continue;
        const key = mask[mi];
        if (!key) continue;
        const a = mi % U, b = (mi - a) / U;
        let w = 1;
        while (a + w < U && mask[mi + w] === key) w++;
        let h = 1;
        outer: while (b + h < V) {
          const row = mi + h * U;
          for (let k = 0; k < w; k++) if (mask[row + k] !== key) break outer;
          h++;
        }
        for (let hh = 0; hh < h; hh++) { const row = mi + hh * U; for (let k = 0; k < w; k++) mask[row + k] = 0; }
        const l = (key - 1) % 4;
        for (let i = 0; i < 4; i++) {
          const cr = f.c[i], pp = corners[i];
          pp[d] = sl + cr[d];
          pp[u] = cr[u] ? a + w : a;
          pp[v] = cr[v] ? b + h : b;
        }
        emit(f, Math.floor((key - 1) / 4), l, l, l, l);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, vo), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, vo), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col.slice(0, vo), 3));
  g.setIndex(new THREE.BufferAttribute(vc > 65535 ? new Uint32Array(idx.subarray(0, ic)) : new Uint16Array(idx.subarray(0, ic)), 1));
  g.computeBoundingSphere();
  return g;
}

/** Mesh + material (toon by default) on the outline layer unless outline:false. opts.greedy merges flat faces. */
export function voxMesh(grid, opts = {}) {
  const kind = opts.kind || 'toon';
  const geo = (opts.greedy === false ? meshVox : meshVoxGreedy)(grid, { ...opts, shade: opts.shade ?? kind === 'basic' });
  const mat = opts.material || voxelMaterial(kind, opts.matOpts || {});
  const m = new THREE.Mesh(geo, mat);
  if (opts.outline !== false) m.layers.enable(LAYER_OUTLINE);
  return m;
}

// ---------------------------------------------------------------- relief (heightfield) mesher
// Big terrain is mostly a heightfield: sand seen from above, a cliff face seen from the front.
// Meshing it as columns costs O(area) instead of O(volume), so it can run at the same fine voxel
// size as the props without building multi-million-cell grids.
const RELIEF_DIRS = [
  // outside column offset (du, dv), tangent (tu, tv), face at u/v + (fu, fv), corner (t, level) order
  { du: -1, dv: 0, tu: 0, tv: 1, fu: 0, fv: 0, t: [0, 0, 1, 1], l: [0, 1, 1, 0] },
  { du: 1, dv: 0, tu: 0, tv: 1, fu: 1, fv: 0, t: [0, 1, 1, 0], l: [0, 0, 1, 1] },
  { du: 0, dv: -1, tu: 1, tv: 0, fu: 0, fv: 0, t: [0, 1, 1, 0], l: [0, 0, 1, 1] },
  { du: 0, dv: 1, tu: 1, tv: 0, fu: 0, fv: 1, t: [0, 0, 1, 1], l: [0, 1, 1, 0] },
];
for (const R of RELIEF_DIRS) {
  const at = (t, l) => [0, 1, 2, 3].find((c) => R.t[c] === t && R.l[c] === l);
  R.cb0 = at(0, 0); R.cb1 = at(1, 0); R.ct0 = at(0, 1); R.ct1 = at(1, 1);
}

/**
 * Mesh a W x D grid of voxel columns. Column q = i + W*k is h[q] voxels tall (0 = empty); its cap
 * gets colour top[q] (0 = no cap, e.g. another mesh draws it) and its exposed walls colour
 * side(q, level, dir) (dir 0..3 = -U, +U, -V, +V), or the cap colour. World position of
 * (i, k, level) = origin + U*i + V*k + N*level, so the same code meshes sand (N = up) and a cliff
 * (N = toward the camera); mirrored bases are handled. Caps merge greedily (same height, colour
 * and flat AO), walls merge vertical runs. Outside the grid a column copies its nearest edge
 * column, so borders add no walls. opts.rows = [k0, k1) limits the output to a band of rows
 * (chunking) while neighbours still come from the whole grid. walls:false = caps only;
 * wallAO:false keeps AO on the caps but leaves walls flat (they then merge into long strips).
 */
const padCache = new WeakMap();
const RELIEF_SCRATCH = { cap: 8192, pos: new Float32Array(8192 * 12), nor: new Float32Array(8192 * 12), col: new Float32Array(8192 * 12), idx: new Uint32Array(8192 * 6) };
export function meshRelief(o) {
  const { W, D, h, top } = o;
  const side = o.side || null;
  const useAO = o.ao ?? true;
  const wallAO = o.wallAO ?? useAO;
  const walls = o.walls ?? true;
  const k0 = o.rows ? Math.max(0, o.rows[0]) : 0, k1 = o.rows ? Math.min(D, o.rows[1]) : D;
  const U = o.U, V = o.V, N = o.N, O = o.origin || [0, 0, 0];
  const det = U[0] * (V[1] * N[2] - V[2] * N[1]) - U[1] * (V[0] * N[2] - V[2] * N[0]) + U[2] * (V[0] * N[1] - V[1] * N[0]);
  const flip = det < 0;
  const unit = (a, sg) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [(a[0] / l) * sg, (a[1] / l) * sg, (a[2] / l) * sg]; };
  const nTop = unit(N, 1);
  const nDir = [unit(U, -1), unit(U, 1), unit(V, -1), unit(V, 1)];
  // padded copy of the heights (edges repeated), shared by every chunk of the same grid
  const PW = W + 2;
  let hp = padCache.get(h);
  if (!hp) {
    hp = new Int32Array(PW * (D + 2));
    for (let k = -1; k <= D; k++) {
      const src = W * (k < 0 ? 0 : k >= D ? D - 1 : k), dst = PW * (k + 1);
      hp[dst] = h[src];
      for (let i = 0; i < W; i++) hp[dst + 1 + i] = h[src + i];
      hp[dst + W + 1] = h[src + W - 1];
    }
    padCache.set(h, hp);
  }
  // scratch buffers are shared between calls (only the final, trimmed copies are allocated)
  let nq = 0;
  let { cap, pos, nor, col, idx } = RELIEF_SCRATCH;
  const grow = () => {
    cap *= 2;
    const a = new Float32Array(cap * 12); a.set(pos); pos = a;
    const b = new Float32Array(cap * 12); b.set(nor); nor = b;
    const c = new Float32Array(cap * 12); c.set(col); col = c;
    const d = new Uint32Array(cap * 6); d.set(idx); idx = d;
    Object.assign(RELIEF_SCRATCH, { cap, pos, nor, col, idx });
  };
  const linCache = new Map();
  const cu = [0, 0, 0, 0], cv = [0, 0, 0, 0], cl = [0, 0, 0, 0], ca = [0, 0, 0, 0], wa = [0, 0, 0, 0];
  const emit = (n, hex) => {
    if (nq >= cap) grow();
    let lin = linCache.get(hex);
    if (!lin) { _c.setHex(hex); lin = [_c.r, _c.g, _c.b]; linCache.set(hex, lin); }
    let vo = nq * 12;
    for (let t = 0; t < 4; t++) {
      const u = cu[t], v = cv[t], l = cl[t];
      pos[vo] = O[0] + U[0] * u + V[0] * v + N[0] * l;
      pos[vo + 1] = O[1] + U[1] * u + V[1] * v + N[1] * l;
      pos[vo + 2] = O[2] + U[2] * u + V[2] * v + N[2] * l;
      nor[vo] = n[0]; nor[vo + 1] = n[1]; nor[vo + 2] = n[2];
      const a = AO_CURVE[ca[t]];
      col[vo] = lin[0] * a; col[vo + 1] = lin[1] * a; col[vo + 2] = lin[2] * a;
      vo += 3;
    }
    const b = nq * 4, io = nq * 6;
    const alt = AO_CURVE[ca[0]] + AO_CURVE[ca[2]] < AO_CURVE[ca[1]] + AO_CURVE[ca[3]];
    const q0 = alt ? 1 : 0, q1 = alt ? 2 : 1, q2 = alt ? 3 : 2, q3 = alt ? 1 : 0, q4 = alt ? 3 : 2, q5 = alt ? 0 : 3;
    idx[io] = b + q0; idx[io + 3] = b + q3;
    if (flip) { idx[io + 1] = b + q2; idx[io + 2] = b + q1; idx[io + 4] = b + q5; idx[io + 5] = b + q4; }
    else { idx[io + 1] = b + q1; idx[io + 2] = b + q2; idx[io + 4] = b + q4; idx[io + 5] = b + q5; }
    nq++;
  };

  // ---- caps: greedy rectangles of equal (colour, height, flat AO)
  const rowsN = k1 - k0;
  const mask = new Float64Array(W * rowsN);
  for (let k = k0; k < k1; k++) {
    const pr = PW * (k + 1) + 1;
    for (let i = 0; i < W; i++) {
      const q = i + W * k, hc = h[q], c = top[q];
      if (!hc || !c) continue;
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      if (useAO) {
        const p = pr + i;
        const l = hp[p - 1] > hc ? 1 : 0, r = hp[p + 1] > hc ? 1 : 0, b = hp[p - PW] > hc ? 1 : 0, f = hp[p + PW] > hc ? 1 : 0;
        if (l | r | b | f | (hp[p - PW - 1] > hc) | (hp[p - PW + 1] > hc) | (hp[p + PW + 1] > hc) | (hp[p + PW - 1] > hc)) {
          a0 = l && b ? 3 : l + b + (hp[p - PW - 1] > hc ? 1 : 0);
          a1 = r && b ? 3 : r + b + (hp[p - PW + 1] > hc ? 1 : 0);
          a2 = r && f ? 3 : r + f + (hp[p + PW + 1] > hc ? 1 : 0);
          a3 = l && f ? 3 : l + f + (hp[p + PW - 1] > hc ? 1 : 0);
        }
      }
      if (a0 === a1 && a1 === a2 && a2 === a3) { mask[i + W * (k - k0)] = ((c & 0xffffff) * 1024 + hc) * 4 + a0 + 1; continue; }
      cu[0] = i; cv[0] = k; cu[1] = i + 1; cv[1] = k; cu[2] = i + 1; cv[2] = k + 1; cu[3] = i; cv[3] = k + 1;
      cl[0] = cl[1] = cl[2] = cl[3] = hc;
      ca[0] = a0; ca[1] = a1; ca[2] = a2; ca[3] = a3;
      emit(nTop, c & 0xffffff);
    }
  }
  for (let r = 0; r < rowsN; r++) for (let i = 0; i < W; i++) {
    const mi = i + W * r, key = mask[mi];
    if (!key) continue;
    let w = 1;
    while (i + w < W && mask[mi + w] === key) w++;
    let hh = 1;
    outer: while (r + hh < rowsN) {
      const row = mi + hh * W;
      for (let t = 0; t < w; t++) if (mask[row + t] !== key) break outer;
      hh++;
    }
    for (let a = 0; a < hh; a++) mask.fill(0, mi + a * W, mi + a * W + w);
    const v0 = Math.floor((key - 1) / 4), ao = (key - 1) % 4, hc = v0 % 1024, c = Math.floor(v0 / 1024);
    const k = k0 + r;
    cu[0] = i; cv[0] = k; cu[1] = i + w; cv[1] = k; cu[2] = i + w; cv[2] = k + hh; cu[3] = i; cv[3] = k + hh;
    cl[0] = cl[1] = cl[2] = cl[3] = hc;
    ca[0] = ca[1] = ca[2] = ca[3] = ao;
    emit(nTop, c);
  }

  const nCaps = nq;
  // ---- walls: exposed levels between a column and a lower neighbour. Levels merge into vertical
  // runs (flat AO, one colour); a quad whose AO does not change along the wall then merges with the
  // same quad on the next column, so long ledges and cliffs become single strips.
  if (walls) {
    const LV = 1024;
    const rS = new Int32Array(LV).fill(-1), rE = new Int32Array(LV), rYb = new Int32Array(LV), rC = new Int32Array(LV), rAo = new Int32Array(LV);
    const active = [];
    let R = null, nD = null, alongV = true, slc = 0;
    const put = (ya) => {
      const yb = rYb[ya], ab = rAo[ya] >> 2, at = rAo[ya] & 3, tS = rS[ya], tE = rE[ya];
      for (let t = 0; t < 4; t++) {
        const tc = R.t[t] ? tE + 1 : tS;
        if (alongV) { cu[t] = slc + R.fu; cv[t] = tc; } else { cu[t] = tc; cv[t] = slc + R.fv; }
        cl[t] = R.l[t] ? yb : ya;
        ca[t] = R.l[t] ? at : ab;
      }
      emit(nD, rC[ya]);
    };
    const flushStale = (tNow) => {
      for (let a = active.length - 1; a >= 0; a--) {
        const ya = active[a];
        if (rE[ya] === tNow) continue;
        put(ya);
        rS[ya] = -1;
        active[a] = active[active.length - 1];
        active.pop();
      }
    };
    const offer = (t, ya, yb, c, aoKey) => {
      if (rS[ya] >= 0) {
        if (rE[ya] === t - 1 && rYb[ya] === yb && rC[ya] === c && rAo[ya] === aoKey) { rE[ya] = t; return; }
        put(ya);
      } else active.push(ya);
      rS[ya] = t; rE[ya] = t; rYb[ya] = yb; rC[ya] = c; rAo[ya] = aoKey;
    };
    let cellI = 0, cellK = 0, cellT = 0;
    const wallQuad = (ya, yb, c, a) => {
      if (a[R.cb0] === a[R.cb1] && a[R.ct0] === a[R.ct1]) { offer(cellT, ya, yb, c, a[R.cb0] * 4 + a[R.ct0]); return; }
      const fu = cellI + R.fu, fv = cellK + R.fv;
      for (let t = 0; t < 4; t++) { cu[t] = fu + R.tu * R.t[t]; cv[t] = fv + R.tv * R.t[t]; cl[t] = R.l[t] ? yb : ya; ca[t] = a[t]; }
      emit(nD, c);
    };
    const zero = [0, 0, 0, 0];
    for (let dir = 0; dir < 4; dir++) {
      R = RELIEF_DIRS[dir];
      nD = nDir[dir];
      alongV = R.tv === 1;
      const S0 = alongV ? 0 : k0, S1 = alongV ? W : k1, T0 = alongV ? k0 : 0, T1 = alongV ? k1 : W;
      const tStep = R.tu + PW * R.tv;
      for (slc = S0; slc < S1; slc++) {
        for (let tt = T0; tt < T1; tt++) {
          const i = alongV ? slc : tt, k = alongV ? tt : slc;
          const q = i + W * k, hc = h[q];
          if (!hc) continue;
          const p = PW * (k + 1) + 1 + i;
          const po = p + R.du + PW * R.dv;   // the outside column
          const hn = hp[po];
          if (hn >= hc) continue;
          const hA = hp[po - tStep], hB = hp[po + tStep];   // tangent neighbours of the outside column
          cellI = i; cellK = k; cellT = tt;
          let runC = -1, runY = 0;
          for (let y = hn; y < hc; y++) {
            const c = (side ? side(q, y, dir) : top[q]) & 0xffffff;
            let flat = true;
            if (wallAO) {
              // corners: t=0 uses tangent neighbour A, t=1 uses B; l=0 looks one level down, l=1 one up
              for (let t = 0; t < 4; t++) {
                const ht = R.t[t] ? hB : hA;
                const sl = R.l[t] ? y + 1 : y - 1;
                const s1 = ht > y ? 1 : 0;
                const s2 = sl < 0 || hn > sl ? 1 : 0;
                const cc = sl < 0 || ht > sl ? 1 : 0;
                wa[t] = s1 && s2 ? 3 : s1 + s2 + cc;
                if (wa[t]) flat = false;
              }
            }
            if (flat && c === runC) continue;
            if (runC >= 0) { wallQuad(runY, y, runC, zero); runC = -1; }
            if (flat) { runC = c; runY = y; continue; }
            wallQuad(y, y + 1, c, wa);
          }
          if (runC >= 0) wallQuad(runY, hc, runC, zero);
          flushStale(tt);
        }
        flushStale(-2);
      }
    }
  }
  meshRelief.stats.caps += nCaps;
  meshRelief.stats.walls += nq - nCaps;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, nq * 12), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, nq * 12), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col.slice(0, nq * 12), 3));
  g.setIndex(new THREE.BufferAttribute(nq * 4 > 65535 ? idx.slice(0, nq * 6) : Uint16Array.from(idx.subarray(0, nq * 6)), 1));
  // bounds from the cell range (cheaper than walking every vertex)
  let hMax = 0;
  for (let k = Math.max(0, k0 - 1); k < Math.min(D, k1 + 1); k++) for (let i = 0; i < W; i++) { const v = h[i + W * k]; if (v > hMax) hMax = v; }
  const box = new THREE.Box3();
  for (const [u, v, l] of [[0, k0, 0], [W, k0, 0], [0, k1, 0], [W, k1, 0], [0, k0, hMax], [W, k0, hMax], [0, k1, hMax], [W, k1, hMax]]) {
    box.expandByPoint(new THREE.Vector3(O[0] + U[0] * u + V[0] * v + N[0] * l, O[1] + U[1] * u + V[1] * v + N[1] * l, O[2] + U[2] * u + V[2] * v + N[2] * l));
  }
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  return g;
}
meshRelief.stats = { caps: 0, walls: 0 };

/** Allocation-free shade / mix for hot loops (same results as util's shade / mixHex). */
export function fshade(c, f) {
  let r = Math.round(((c >> 16) & 255) * f), g = Math.round(((c >> 8) & 255) * f), b = Math.round((c & 255) * f);
  r = r > 255 ? 255 : r < 0 ? 0 : r; g = g > 255 ? 255 : g < 0 ? 0 : g; b = b > 255 ? 255 : b < 0 ? 0 : b;
  return (r << 16) | (g << 8) | b;
}
export function fmix(a, b, t) {
  const r = Math.round(((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t));
  const g = Math.round(((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t));
  const bl = Math.round((a & 255) + (((b & 255) - (a & 255)) * t));
  return (r << 16) | (g << 8) | bl;
}

/** Deterministic colour jitter per voxel so flat areas read as hand-placed pixels. */
export function jit(c, x, y, z, seed = 1, amt = 0.08) {
  const h = (hashStr(`${x},${y},${z},${seed}`) % 1000) / 1000;
  return shade(c, 1 + (h - 0.5) * 2 * amt);
}

/** Cheap integer hash → [0,1). Faster than hashStr for big grids. */
export function hash3(x, y, z, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Jitter using hash3 (fast). */
export function jitf(c, x, y, z, seed = 1, amt = 0.08) {
  return shade(c, 1 + (hash3(x, y, z, seed) - 0.5) * 2 * amt);
}

/** Draw a voxel line (thick 1) between two points with a colour function. */
export function voxLine(g, a, b, c, r = 0) {
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]))) * 2 + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
    if (r <= 0) g.set(x, y, z, typeof c === 'function' ? c(x, y, z, t) : c);
    else g.ellipsoid(x, y, z, r, r, r, typeof c === 'function' ? (xx, yy, zz) => c(xx, yy, zz, t) : c);
  }
}

export { mixHex, shade };
