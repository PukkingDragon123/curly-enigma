// Voxel helpers shared by the iso model builders: fast hashing for color noise,
// mesh shortcuts, and a static batcher that merges many voxel meshes into a few
// chunked draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, voxelMesh, voxelMaterial, meshGridGreedy } from '../gfx/Voxel.js';
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
// Shared with the rest of the game: gfx/Voxel.js meshGridGreedy.
export const greedyGeometry = meshGridGreedy;

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
