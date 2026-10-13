// Voxel helpers shared by the iso model builders: fast hashing for color noise,
// mesh shortcuts, and a static batcher that merges many voxel meshes into a few
// chunked draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, voxelMesh, voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { shade, mixHex } from '../core/util.js';

export { VoxelGrid };
export const V16 = 1 / 16;
export const V8 = 1 / 8;

/** Integer hash → [0,1). */
export function hash3(x, y, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1103515245) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Jitter a color's brightness per voxel. */
export function jit(c, x, y, z, s = 0, amt = 0.08) {
  return shade(c, 1 + (hash3(x, y, z, s) - 0.5) * 2 * amt);
}

/** Clear a box of voxels (VoxelGrid.box skips -1 instead of clearing). */
export function carve(g, x0, y0, z0, w, h, d, test) {
  for (let z = z0; z < z0 + d; z++) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!test || test(x, y, z)) g.clear(x, y, z);
  return g;
}

/** Pick between colors per voxel. */
export function speck(cs, x, y, z, s = 0) {
  return cs[Math.floor(hash3(x, y, z, s) * cs.length) % cs.length];
}

// ---------------------------------------------------------------- greedy mesher
// Same faces, AO and vertex layout as gfx/Voxel.js meshGrid, but coplanar faces with
// the same color and flat AO merge into big quads. Used for large static grids.
const GFACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.93 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];
const GAO = [1.0, 0.8, 0.66, 0.52];
const _gc = new THREE.Color();

export function greedyGeometry(grid, opts = {}) {
  const s = opts.scale ?? 1 / 16;
  const [px, py, pz] = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const bake = opts.shade ?? false;
  const dims = [grid.w, grid.h, grid.d];
  const pos = [], nor = [], col = [], idx = [];
  let vc = 0;
  const cell = [0, 0, 0];
  const aoAt = (x, y, z, f, corner) => {
    const ox = x + f.n[0], oy = y + f.n[1], oz = z + f.n[2];
    const ax = [];
    for (let k = 0; k < 3; k++) if (f.n[k] === 0) ax.push(k);
    const d1 = [0, 0, 0], d2 = [0, 0, 0];
    d1[ax[0]] = corner[ax[0]] === 1 ? 1 : -1;
    d2[ax[1]] = corner[ax[1]] === 1 ? 1 : -1;
    const s1 = grid.filled(ox + d1[0], oy + d1[1], oz + d1[2]) ? 1 : 0;
    const s2 = grid.filled(ox + d2[0], oy + d2[1], oz + d2[2]) ? 1 : 0;
    const cc = grid.filled(ox + d1[0] + d2[0], oy + d1[1] + d2[1], oz + d1[2] + d2[2]) ? 1 : 0;
    return s1 && s2 ? 3 : s1 + s2 + cc;
  };
  const emit = (f, corners, colorHex, aoLv) => {
    _gc.setHex(colorHex);
    const k = bake ? f.shade : 1;
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      pos.push((c[0] - px) * s, (c[1] - py) * s, (c[2] - pz) * s);
      nor.push(f.n[0], f.n[1], f.n[2]);
      const a = GAO[aoLv[i]] * k;
      col.push(_gc.r * a, _gc.g * a, _gc.b * a);
    }
    if (GAO[aoLv[0]] + GAO[aoLv[2]] < GAO[aoLv[1]] + GAO[aoLv[3]]) idx.push(vc + 1, vc + 2, vc + 3, vc + 1, vc + 3, vc);
    else idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
    vc += 4;
  };
  for (const f of GFACES) {
    const d = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const u = d === 0 ? 1 : 0, v = d === 2 ? 1 : 2;
    const U = dims[u], Vd = dims[v];
    const mask = new Float64Array(U * Vd);
    for (let sl = 0; sl < dims[d]; sl++) {
      mask.fill(0);
      for (let b = 0; b < Vd; b++) for (let a = 0; a < U; a++) {
        cell[d] = sl; cell[u] = a; cell[v] = b;
        const [x, y, z] = cell;
        const c = grid.get(x, y, z);
        if (c < 0 || grid.filled(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
        const ao = f.c.map((corner) => aoAt(x, y, z, f, corner));
        if (ao[0] === ao[1] && ao[1] === ao[2] && ao[2] === ao[3]) mask[a + b * U] = c * 4 + ao[0] + 1;
        else {
          const corners = f.c.map((cr) => [x + cr[0], y + cr[1], z + cr[2]]);
          emit(f, corners, c, ao);
        }
      }
      for (let b = 0; b < Vd; b++) for (let a = 0; a < U; ) {
        const key = mask[a + b * U];
        if (!key) { a++; continue; }
        let w = 1;
        while (a + w < U && mask[a + w + b * U] === key) w++;
        let h = 1;
        outer: while (b + h < Vd) {
          for (let k = 0; k < w; k++) if (mask[a + k + (b + h) * U] !== key) break outer;
          h++;
        }
        for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[a + k + (b + hh) * U] = 0;
        const lv = (key - 1) % 4;
        const colorHex = Math.floor((key - 1) / 4);
        const corners = f.c.map((cr) => {
          const p = [0, 0, 0];
          p[d] = sl + cr[d];
          p[u] = cr[u] ? a + w : a;
          p[v] = cr[v] ? b + h : b;
          return p;
        });
        emit(f, corners, colorHex, [lv, lv, lv, lv]);
        a += w;
      }
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

/** Greedy-meshed lit voxel mesh for big static grids. */
export function vmeshG(grid, { scale = V16, pivot, kind = 'toon', outline = true } = {}) {
  const geo = greedyGeometry(grid, { scale, pivot: pivot ?? [grid.w / 2, 0, grid.d / 2], shade: kind === 'basic' });
  const mesh = new THREE.Mesh(geo, voxelMaterial(kind));
  if (outline) mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}

/** Lit (toon) voxel mesh. pivot defaults to bottom-center. */
export function vmesh(grid, { scale = V16, pivot, kind = 'toon' } = {}) {
  return voxelMesh(grid, { scale, pivot: pivot ?? [grid.w / 2, 0, grid.d / 2], kind, outline: true });
}

/** Unlit, self-glowing voxel mesh (crystals, lantern glass, mushroom caps). */
export function gmesh(grid, { scale = V16, pivot, outline = true } = {}) {
  return voxelMesh(grid, { scale, pivot: pivot ?? [grid.w / 2, 0, grid.d / 2], kind: 'basic', shade: true, outline });
}

/** Wood plank fill: horizontal boards with seams along the given axis. */
export function plank(c, seam = 4, axis = 'y') {
  return (x, y, z) => {
    const v = axis === 'y' ? y : axis === 'x' ? x : z;
    const s = v % seam === 0 ? 0.78 : 1;
    return jit(shade(c, s), x, Math.floor(v / seam), z, 3, 0.07);
  };
}

export { shade, mixHex };

/**
 * Collects static meshes and merges them by material into spatial chunks.
 * Add fully-built objects (their world matrices are baked), then call build(parent).
 */
export class Batch {
  constructor(chunk = 12) {
    this.groups = new Map();
    this.chunk = chunk;
  }

  add(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry || m.userData.noBatch) return;
      if (!m.geometry.getAttribute('color') || m.geometry.getAttribute('uv')) return;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      geo.computeBoundingSphere();
      const c = geo.boundingSphere.center;
      const outline = m.layers.isEnabled(LAYER_OUTLINE);
      const key = `${m.material.uuid}|${outline ? 1 : 0}|${Math.floor(c.x / this.chunk)},${Math.floor(c.z / this.chunk)}`;
      let e = this.groups.get(key);
      if (!e) this.groups.set(key, (e = { mat: m.material, outline, geos: [] }));
      e.geos.push(geo);
      m.userData.batched = true;
    });
    // free the source geometry of everything we copied
    obj.traverse((m) => { if (m.isMesh && m.userData.batched) m.geometry.dispose(); });
  }

  /**
   * Merge everything and add the meshes to parent. With viewDir (the fixed camera's
   * "back" vector), faces that can never face the camera are dropped.
   */
  build(parent, viewDir = null) {
    const out = [];
    for (const e of this.groups.values()) {
      let g = mergeGeometries(e.geos, false);
      for (const x of e.geos) x.dispose();
      if (!g) continue;
      if (viewDir) g = cullHidden(g, viewDir);
      const mesh = new THREE.Mesh(g, e.mat);
      if (e.outline) mesh.layers.enable(LAYER_OUTLINE);
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

/** Keep only the triangles whose normal faces the (fixed) camera; compacts the vertex data. */
export function cullHidden(g, dir) {
  const idx = g.index.array;
  const nor = g.getAttribute('normal').array;
  const pos = g.getAttribute('position').array;
  const col = g.getAttribute('color').array;
  const map = new Int32Array(pos.length / 3).fill(-1);
  const P = [], N = [], C = [], I = [];
  let nv = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k];
    if (nor[a * 3] * dir.x + nor[a * 3 + 1] * dir.y + nor[a * 3 + 2] * dir.z <= 0.02) continue;
    for (let j = 0; j < 3; j++) {
      const v = idx[k + j];
      if (map[v] < 0) {
        map[v] = nv++;
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        N.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
        C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      }
      I.push(map[v]);
    }
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  out.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  out.computeBoundingSphere();
  return out;
}

/** Move the non-batched leftovers (textured planes, sprites…) of a batched object into a parent. */
export function keepUnbatched(obj, parent) {
  obj.updateMatrixWorld(true);
  const keep = [];
  obj.traverse((m) => {
    if ((m.isMesh && !m.userData.batched) || m.isSprite || m.isPoints || m.isLine) keep.push(m);
  });
  for (const m of keep) {
    const wm = m.matrixWorld.clone();
    m.parent.remove(m);
    wm.decompose(m.position, m.quaternion, m.scale);
    parent.add(m);
  }
}
