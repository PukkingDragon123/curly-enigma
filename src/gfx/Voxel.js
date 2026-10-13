// Voxel modelling: a small grid you paint into, and a mesher with baked ambient occlusion.
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';

const FILLED = 0x1000000;

export class VoxelGrid {
  constructor(w, h, d) {
    this.w = w; this.h = h; this.d = d;
    this.data = new Uint32Array(w * h * d);
  }
  idx(x, y, z) { return x + this.w * (y + this.h * z); }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  set(x, y, z, c) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (!this.inb(x, y, z)) return;
    this.data[this.idx(x, y, z)] = c === null || c === undefined || c < 0 ? 0 : ((c & 0xffffff) | FILLED);
  }
  get(x, y, z) {
    if (!this.inb(x, y, z)) return -1;
    const v = this.data[this.idx(x, y, z)];
    return v ? v & 0xffffff : -1;
  }
  filled(x, y, z) { return this.inb(x, y, z) && this.data[this.idx(x, y, z)] !== 0; }
  clear(x, y, z) { if (this.inb(x, y, z)) this.data[this.idx(x, y, z)] = 0; }
  /** Fill an axis-aligned box. c can be a color or fn(x,y,z) → color|-1. */
  box(x0, y0, z0, w, h, d, c) {
    for (let z = z0; z < z0 + d; z++)
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const col = typeof c === 'function' ? c(x, y, z) : c;
          if (col !== undefined && col !== -1) this.set(x, y, z, col);
        }
    return this;
  }
  /** Fill an ellipsoid centered at (cx,cy,cz) (voxel centers at +0.5). */
  ellipsoid(cx, cy, cz, rx, ry, rz, c) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) {
            const col = typeof c === 'function' ? c(x, y, z, dx, dy, dz) : c;
            if (col !== undefined && col !== -1) this.set(x, y, z, col);
          }
        }
    return this;
  }
  /** Rounded box: box with corner voxels removed (r = 1 or 2). */
  rbox(x0, y0, z0, w, h, d, c, r = 1) {
    this.box(x0, y0, z0, w, h, d, c);
    const corners = [];
    for (const x of [x0, x0 + w - 1]) for (const y of [y0, y0 + h - 1]) for (const z of [z0, z0 + d - 1]) corners.push([x, y, z]);
    for (const [x, y, z] of corners) {
      // remove edge voxels along the 3 edges near this corner (radius r)
      for (let i = 0; i < r; i++) {
        const sx = x === x0 ? 1 : -1, sy = y === y0 ? 1 : -1, sz = z === z0 ? 1 : -1;
        this.clear(x + sx * i, y, z);
        this.clear(x, y + sy * i, z);
        this.clear(x, y, z + sz * i);
      }
    }
    if (r >= 1) {
      // soften all 12 edges by 1 voxel when large enough
      if (w > 3 && h > 3 && d > 3 && r >= 2) {
        for (let x = x0; x < x0 + w; x++) for (const y of [y0, y0 + h - 1]) for (const z of [z0, z0 + d - 1]) this.clear(x, y, z);
        for (let y = y0; y < y0 + h; y++) for (const x of [x0, x0 + w - 1]) for (const z of [z0, z0 + d - 1]) this.clear(x, y, z);
        for (let z = z0; z < z0 + d; z++) for (const x of [x0, x0 + w - 1]) for (const y of [y0, y0 + h - 1]) this.clear(x, y, z);
      }
    }
    return this;
  }
  cylinderY(cx, cz, r, y0, y1, c) {
    for (let y = y0; y < y1; y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
    return this;
  }
  /** Repaint existing voxels with fn(x,y,z,color) → color (or -1 to delete, undefined to keep). */
  paint(fn) {
    for (let z = 0; z < this.d; z++)
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const i = this.idx(x, y, z);
          if (!this.data[i]) continue;
          const r = fn(x, y, z, this.data[i] & 0xffffff);
          if (r === -1) this.data[i] = 0;
          else if (r !== undefined) this.data[i] = (r & 0xffffff) | FILLED;
        }
    return this;
  }
  /** Is the voxel on the outer surface facing direction (dx,dy,dz)? */
  exposed(x, y, z, dx, dy, dz) { return this.filled(x, y, z) && !this.filled(x + dx, y + dy, z + dz); }
}

// face definitions: normal, 4 corner offsets (CCW seen from outside)
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.93 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];
const AO_CURVE = [1.0, 0.8, 0.66, 0.52];
const _c = new THREE.Color();

/**
 * Build a BufferGeometry from a VoxelGrid.
 * opts.scale: world size of one voxel; opts.pivot: [x,y,z] voxel coords that become the origin;
 * opts.shade: bake directional face shading (for unlit/basic materials); opts.ao: bake AO.
 */
export function meshGrid(grid, opts = {}) {
  const s = opts.scale ?? 1 / 16;
  const [px, py, pz] = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const bake = opts.shade ?? false;
  const ao = opts.ao ?? true;
  const pos = [], nor = [], col = [], idx = [];
  let v = 0;
  for (let z = 0; z < grid.d; z++)
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) {
        const c = grid.get(x, y, z);
        if (c < 0) continue;
        _c.setHex(c);
        for (const f of FACES) {
          const [nx, ny, nz] = f.n;
          if (grid.filled(x + nx, y + ny, z + nz)) continue;
          const aoVals = [];
          for (const corner of f.c) {
            let lvl = 0;
            if (ao) {
              // the two edge neighbours + corner neighbour in the plane just outside the face
              const ox = x + nx, oy = y + ny, oz = z + nz;
              const ax = [], tang = [];
              for (let k = 0; k < 3; k++) if (f.n[k] === 0) ax.push(k);
              for (const k of ax) tang.push(corner[k] === 1 ? 1 : -1);
              const d1 = [0, 0, 0], d2 = [0, 0, 0];
              d1[ax[0]] = tang[0];
              d2[ax[1]] = tang[1];
              const s1 = grid.filled(ox + d1[0], oy + d1[1], oz + d1[2]) ? 1 : 0;
              const s2 = grid.filled(ox + d2[0], oy + d2[1], oz + d2[2]) ? 1 : 0;
              const cc = grid.filled(ox + d1[0] + d2[0], oy + d1[1] + d2[1], oz + d1[2] + d2[2]) ? 1 : 0;
              lvl = s1 && s2 ? 3 : s1 + s2 + cc;
            }
            aoVals.push(AO_CURVE[lvl]);
          }
          const k = bake ? f.shade : 1;
          for (let i = 0; i < 4; i++) {
            const cr = f.c[i];
            pos.push((x + cr[0] - px) * s, (y + cr[1] - py) * s, (z + cr[2] - pz) * s);
            nor.push(nx, ny, nz);
            const a = aoVals[i] * k;
            col.push(_c.r * a, _c.g * a, _c.b * a);
          }
          // flip the quad diagonal to avoid AO anisotropy
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

// ---------------------------------------------------------------- materials
let toonGradient = null;
function getToonGradient() {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([90, 160, 225, 255]);
  toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.needsUpdate = true;
  toonGradient.userData.shared = true;
  return toonGradient;
}

const matCache = {};
/**
 * Shared voxel materials.
 *  'toon'    — cel-shaded, reacts to scene lights (iso scenes, title, forge)
 *  'lambert' — smooth lit
 *  'basic'   — unlit; pair with meshGrid({shade:true}) and tint via material.color (mine)
 */
export function voxelMaterial(kind = 'toon', opts = {}) {
  const key = kind + JSON.stringify(opts);
  if (!opts.unique && matCache[key]) return matCache[key];
  let m;
  if (kind === 'toon') m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonGradient(), ...strip(opts) });
  else if (kind === 'lambert') m = new THREE.MeshLambertMaterial({ vertexColors: true, ...strip(opts) });
  else m = new THREE.MeshBasicMaterial({ vertexColors: true, ...strip(opts) });
  if (!opts.unique) { m.userData.shared = true; matCache[key] = m; }
  return m;
}
function strip(o) { const r = { ...o }; delete r.unique; return r; }

/** Build a mesh from a grid with a material kind; enables the outline layer by default. */
export function voxelMesh(grid, opts = {}) {
  const geo = meshGrid(grid, opts);
  const mat = opts.material || voxelMaterial(opts.kind || 'toon', opts.matOpts || {});
  const mesh = new THREE.Mesh(geo, mat);
  if (opts.outline !== false) mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}

/** Enable/disable the outline layer on an object tree. */
export function setOutline(obj, on = true) {
  obj.traverse((o) => { if (o.isMesh || o.isSprite) { if (on) o.layers.enable(LAYER_OUTLINE); else o.layers.disable(LAYER_OUTLINE); } });
}

/** Replace materials under obj (e.g. to switch a character to the unlit mine material). */
export function setMaterialKind(obj, kind, opts = {}) {
  obj.traverse((o) => {
    if (o.isMesh && o.geometry.getAttribute('color')) o.material = voxelMaterial(kind, opts);
  });
}
