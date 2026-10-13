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

/** Mesh + material (toon by default) on the outline layer unless outline:false. */
export function voxMesh(grid, opts = {}) {
  const kind = opts.kind || 'toon';
  const geo = meshVox(grid, { ...opts, shade: opts.shade ?? kind === 'basic' });
  const mat = opts.material || voxelMaterial(kind, opts.matOpts || {});
  const m = new THREE.Mesh(geo, mat);
  if (opts.outline !== false) m.layers.enable(LAYER_OUTLINE);
  return m;
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
