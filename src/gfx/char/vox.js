// Hi-res voxel modelling helpers for the characters: a grid with signed local coordinates
// and a material layer, smooth shapes (superellipsoids, capsules, lines), fast integer
// colors, a structured fur painter and a shared LRU geometry cache.
import * as THREE from 'three';
import { VoxelGrid, voxelMaterial } from '../Voxel.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { greedyMesh } from './mesher.js';

const FILLED = 0x1000000;

// exposure bits for surface painting
export const PX = 1, NX = 2, PY = 4, NY = 8, PZ = 16, NZ = 32;

/**
 * A voxel grid addressed in local integer coordinates (voxel x spans [x, x+1)).
 * Bounds are [x0, x1) × [y0, y1) × [z0, z1). Each voxel has a color and a material id
 * (0 = literal color); `resolve()` turns material ids into colors on the surface.
 */
export class Vox {
  constructor(x0, x1, y0, y1, z0, z1) {
    this.x0 = x0 | 0; this.y0 = y0 | 0; this.z0 = z0 | 0;
    this.x1 = x1 | 0; this.y1 = y1 | 0; this.z1 = z1 | 0;
    this.w = this.x1 - this.x0; this.h = this.y1 - this.y0; this.d = this.z1 - this.z0;
    this.grid = new VoxelGrid(this.w, this.h, this.d);
    this.data = this.grid.data;
    this.mat = new Uint8Array(this.data.length);
    this.wh = this.w * this.h;
  }

  idx(x, y, z) {
    x -= this.x0; y -= this.y0; z -= this.z0;
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) return -1;
    return x + this.w * y + this.wh * z;
  }

  /** c < 0 clears. m = material id (0 = literal color). */
  set(x, y, z, c, m = 0) {
    const i = this.idx(x, y, z);
    if (i < 0) return;
    if (c < 0) { this.data[i] = 0; this.mat[i] = 0; return; }
    this.data[i] = (c & 0xffffff) | FILLED;
    this.mat[i] = m;
  }

  /** Set a material id (color resolved later). */
  setM(x, y, z, m) {
    const i = this.idx(x, y, z);
    if (i < 0) return;
    this.data[i] = FILLED;
    this.mat[i] = m;
  }

  get(x, y, z) {
    const i = this.idx(x, y, z);
    if (i < 0) return -1;
    const v = this.data[i];
    return v ? v & 0xffffff : -1;
  }

  m(x, y, z) {
    const i = this.idx(x, y, z);
    return i < 0 || !this.data[i] ? -1 : this.mat[i];
  }

  has(x, y, z) {
    const i = this.idx(x, y, z);
    return i >= 0 && this.data[i] !== 0;
  }

  clear(x, y, z) { this.set(x, y, z, -1); }

  /**
   * Fill voxels in a bounding box whose centers satisfy inside(cx, cy, cz).
   * c: color | fn(x, y, z) → color (-1 skips). m: material id or fn → id.
   * When m is given (non-zero), the voxel gets that material and c is ignored.
   */
  fill(bx0, bx1, by0, by1, bz0, bz1, inside, c, m = 0) {
    const xa = Math.max(Math.floor(bx0), this.x0), xb = Math.min(Math.ceil(bx1), this.x1 - 1);
    const ya = Math.max(Math.floor(by0), this.y0), yb = Math.min(Math.ceil(by1), this.y1 - 1);
    const za = Math.max(Math.floor(bz0), this.z0), zb = Math.min(Math.ceil(bz1), this.z1 - 1);
    const cf = typeof c === 'function', mf = typeof m === 'function';
    for (let z = za; z <= zb; z++)
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++) {
          if (!inside(x + 0.5, y + 0.5, z + 0.5)) continue;
          const mm = mf ? m(x, y, z) : m;
          if (mm > 0) { this.setM(x, y, z, mm); continue; }
          if (mm < 0) continue;
          const col = cf ? c(x, y, z) : c;
          if (col === undefined || col < 0) continue;
          this.set(x, y, z, col);
        }
    return this;
  }

  /** Clear voxels whose centers satisfy inside(). */
  carve(bx0, bx1, by0, by1, bz0, bz1, inside) {
    const xa = Math.max(Math.floor(bx0), this.x0), xb = Math.min(Math.ceil(bx1), this.x1 - 1);
    const ya = Math.max(Math.floor(by0), this.y0), yb = Math.min(Math.ceil(by1), this.y1 - 1);
    const za = Math.max(Math.floor(bz0), this.z0), zb = Math.min(Math.ceil(bz1), this.z1 - 1);
    for (let z = za; z <= zb; z++)
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++) if (inside(x + 0.5, y + 0.5, z + 0.5)) this.set(x, y, z, -1);
    return this;
  }

  /**
   * Fill a y-tapered superellipsoid row by row: row(yc) → null | [sx, sz, n, ty, nz?] where ty is
   * the normalized height (vertical term |ty|^n) and nz an optional exponent for the z term. Powers are taken per row and column, not per voxel.
   * pred(x, y, z) is an optional extra test on integer coords.
   */
  seRows(cx, cz, ya, yb, xr, zr, row, c, m = 0, pred = null) {
    const xa = Math.max(Math.floor(cx - xr - 1), this.x0), xb = Math.min(Math.ceil(cx + xr + 1), this.x1 - 1);
    const za = Math.max(Math.floor(cz - zr - 1), this.z0), zb = Math.min(Math.ceil(cz + zr + 1), this.z1 - 1);
    if (xb < xa || zb < za) return this;
    const fx = new Float64Array(xb - xa + 1), fz = new Float64Array(zb - za + 1);
    const cf = typeof c === 'function';
    for (let y = Math.max(Math.floor(ya), this.y0); y <= Math.min(Math.ceil(yb), this.y1 - 1); y++) {
      const r = row(y + 0.5);
      if (!r) continue;
      const sx = r[0], sz = r[1], n = r[2], nz = r[4] || n;
      const vy = Math.abs(r[3]) ** n;
      if (vy > 1) continue;
      for (let x = xa; x <= xb; x++) fx[x - xa] = Math.abs((x + 0.5 - cx) / sx) ** n;
      for (let z = za; z <= zb; z++) fz[z - za] = Math.abs((z + 0.5 - cz) / sz) ** nz;
      for (let z = za; z <= zb; z++) {
        const zz = fz[z - za] + vy;
        if (zz > 1) continue;
        for (let x = xa; x <= xb; x++) {
          if (fx[x - xa] + zz > 1) continue;
          if (pred && !pred(x, y, z)) continue;
          if (m) this.setM(x, y, z, m);
          else { const col = cf ? c(x, y, z) : c; if (col >= 0) this.set(x, y, z, col); }
        }
      }
    }
    return this;
  }

  /** Superellipsoid (n = 2 → ellipsoid, larger n → rounder box). */
  ell(cx, cy, cz, rx, ry, rz, c, m = 0, n = 2) {
    const row = [rx, rz, n, 0];
    return this.seRows(cx, cz, cy - ry - 1, cy + ry + 1, rx, rz, (yc) => { row[3] = (yc - cy) / ry; return row; }, c, m);
  }

  /** Axis-aligned box [x0,x1) × [y0,y1) × [z0,z1). */
  box(x0, y0, z0, x1, y1, z1, c, m = 0) {
    return this.fill(x0, x1 - 1, y0, y1 - 1, z0, z1 - 1, () => true, c, m);
  }

  /** Cylinder along y. */
  cylY(cx, cz, r, y0, y1, c, m = 0) {
    return this.fill(cx - r - 1, cx + r + 1, y0, y1 - 1, cz - r - 1, cz + r + 1, (x, y, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r, c, m);
  }

  /** Thick line segment between points a and b (voxel-center distance ≤ r). */
  line(ax, ay, az, bx, by, bz, c, r = 0.5, m = 0) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L2 = dx * dx + dy * dy + dz * dz || 1;
    const inside = (x, y, z) => {
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ey = ay + dy * t - y, ez = az + dz * t - z;
      return ex * ex + ey * ey + ez * ez <= r * r;
    };
    return this.fill(Math.min(ax, bx) - r - 1, Math.max(ax, bx) + r + 1, Math.min(ay, by) - r - 1, Math.max(ay, by) + r + 1, Math.min(az, bz) - r - 1, Math.max(az, bz) + r + 1, inside, c, m);
  }

  /** 1-voxel polyline through integer-ish points (DDA). */
  path(pts, c, m = 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az)) * 2));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = Math.floor(ax + (bx - ax) * t), y = Math.floor(ay + (by - ay) * t), z = Math.floor(az + (bz - az) * t);
        if (m) this.setM(x, y, z, m); else this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
      }
    }
    return this;
  }

  /** Repaint filled voxels: fn(x, y, z, color, mat) → color | -1 (clear) | undefined (keep). */
  paint(fn) {
    const { data, mat, w, h, d } = this;
    for (let z = 0; z < d; z++)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = x + w * y + this.wh * z;
          if (!data[i]) continue;
          const r = fn(x + this.x0, y + this.y0, z + this.z0, data[i] & 0xffffff, mat[i]);
          if (r === undefined) continue;
          if (r < 0) { data[i] = 0; mat[i] = 0; } else { data[i] = (r & 0xffffff) | FILLED; mat[i] = 0; }
        }
    return this;
  }

  /**
   * Grow a one-voxel layer: every empty voxel touching a filled one where region(x, y, z)
   * holds becomes material m. Neighbours are read before any voxel is added.
   */
  dilate(region, m) {
    const { data, mat, w, h, d, wh } = this;
    const add = [];
    for (let z = 1; z < d - 1; z++)
      for (let y = 1; y < h - 1; y++) {
        let i = 1 + w * y + wh * z;
        for (let x = 1; x < w - 1; x++, i++) {
          if (data[i]) continue;
          if (!(data[i + 1] || data[i - 1] || data[i + w] || data[i - w] || data[i + wh] || data[i - wh])) continue;
          if (region(x + this.x0, y + this.y0, z + this.z0)) add.push(i);
        }
      }
    for (const i of add) { data[i] = FILLED; mat[i] = m; }
    return this;
  }

  /** Exposure mask of a filled voxel (bits PX..NZ for empty neighbours). */
  exposure(x, y, z) {
    let e = 0;
    if (!this.has(x + 1, y, z)) e |= PX;
    if (!this.has(x - 1, y, z)) e |= NX;
    if (!this.has(x, y + 1, z)) e |= PY;
    if (!this.has(x, y - 1, z)) e |= NY;
    if (!this.has(x, y, z + 1)) e |= PZ;
    if (!this.has(x, y, z - 1)) e |= NZ;
    return e;
  }

  /**
   * Resolve material ids into colors. fns[m](x, y, z, exposure) → color.
   * Interior voxels get a flat color (they are never seen). Literal voxels are kept.
   */
  resolve(fns) {
    const { data, mat, w, h, d, wh } = this;
    for (let z = 0; z < d; z++)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = x + w * y + wh * z;
          const m = mat[i];
          if (!data[i] || !m) continue;
          const f = fns[m];
          const X = x + this.x0, Y = y + this.y0, Z = z + this.z0;
          let e = 0;
          if (x + 1 >= w || !data[i + 1]) e |= PX;
          if (x - 1 < 0 || !data[i - 1]) e |= NX;
          if (y + 1 >= h || !data[i + w]) e |= PY;
          if (y - 1 < 0 || !data[i - w]) e |= NY;
          if (z + 1 >= d || !data[i + wh]) e |= PZ;
          if (z - 1 < 0 || !data[i - wh]) e |= NZ;
          const c = !e ? 0x303030 : f ? f(X, Y, Z, e) : 0xff00ff;
          data[i] = (c & 0xffffff) | FILLED;
        }
    // ids are cleared only now so painters can still read neighbours' materials
    mat.fill(0);
    return this;
  }

  /** Mirror the x < 0 half onto x ≥ 0 (grid must be symmetric: x0 = -x1). */
  mirrorX() {
    for (let z = this.z0; z < this.z1; z++)
      for (let y = this.y0; y < this.y1; y++)
        for (let x = this.x0; x < 0; x++) {
          const i = this.idx(x, y, z), j = this.idx(-1 - x, y, z);
          if (i < 0 || j < 0) continue;
          this.data[j] = this.data[i];
          this.mat[j] = this.mat[i];
        }
    return this;
  }

  /** Highest filled z in column (x, y), or -Infinity. */
  frontZ(x, y) {
    for (let z = this.z1 - 1; z >= this.z0; z--) if (this.has(x, y, z)) return z;
    return -Infinity;
  }

  backZ(x, y) {
    for (let z = this.z0; z < this.z1; z++) if (this.has(x, y, z)) return z;
    return Infinity;
  }

  topY(x, z) {
    for (let y = this.y1 - 1; y >= this.y0; y--) if (this.has(x, y, z)) return y;
    return -Infinity;
  }

  sideX(y, z, dir) {
    if (dir > 0) { for (let x = this.x1 - 1; x >= this.x0; x--) if (this.has(x, y, z)) return x; return -Infinity; }
    for (let x = this.x0; x < this.x1; x++) if (this.has(x, y, z)) return x;
    return Infinity;
  }

  /** Greedy-meshed geometry in voxel units, origin at local (0,0,0) + pivot. */
  geometry(bake, pivot = [0, 0, 0]) {
    return greedyMesh(this.grid, [pivot[0] - this.x0, pivot[1] - this.y0, pivot[2] - this.z0], bake);
  }
}

// ---------------------------------------------------------------- colors
export const SHADOW = 0x1c1024;
export const LIGHT = 0xfff4e0;

export function rgb(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

export function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t + 0.5) << 16) | ((ag + (bg - ag) * t + 0.5) << 8) | ((ab + (bb - ab) * t + 0.5) | 0);
}

export function mul(c, f) {
  const r = Math.min(255, ((c >> 16) & 255) * f + 0.5) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f + 0.5) | 0;
  const b = Math.min(255, (c & 255) * f + 0.5) | 0;
  return (r << 16) | (g << 8) | b;
}

/** Darker, shifted toward a cool plum shadow. */
export const dk = (c, t) => mix(c, SHADOW, t);
/** Lighter, shifted toward a warm cream. */
export const lt = (c, t) => mix(c, LIGHT, t);

export function lum(c) { return (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255; }

/** Desaturate toward grey of the same luminance. */
export function grey(c, t) {
  const l = Math.round(lum(c) * 255);
  return mix(c, (l << 16) | (l << 8) | l, t);
}

// ---------------------------------------------------------------- hashing
export function h3(x, y, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440670441) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rngFrom(seed) {
  let s = (seed | 0) >>> 0 || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// ---------------------------------------------------------------- fur
/**
 * Structured fur shading for a surface voxel: short downward strokes on a staggered
 * lattice (light tip over a darker root) that follow the surface orientation. Large
 * areas stay the flat base color so greedy meshing still merges them.
 * Returns -1 (no change), 1 (tip, lighter) or 2 (root, darker).
 */
export function furStroke(x, y, z, e, seed, cw = 4, ch = 6) {
  let u, v;
  if (e & (PX | NX)) { u = z; v = y; } // side faces: lattice over (z, y)
  else if (e & (PZ | NZ)) { u = x; v = y; } // front/back: lattice over (x, y)
  else if (e & PY) { u = x; v = -z; } // top: strokes run backward
  else return -1;
  const row = Math.floor(v / ch);
  const off = (row & 1) * (cw >> 1);
  const col = Math.floor((u + off) / cw);
  const hh = h3(col, row, (e & (PX | NX)) ? x > 0 ? 7 : 8 : (e & PY) ? 9 : z > 0 ? 10 : 11, seed);
  if (hh < 0.42) return -1;
  const su = col * cw - off + 1 + (hh * 7 | 0) % 2;
  if (u !== su) return -1;
  // a tuft: two light voxels (one merged quad) over a dark root, sometimes a longer root
  const sv = row * ch + 3 + ((hh * 13) | 0) % 2;
  if (v === sv || v === sv - 1) return 1;
  if (v === sv - 2 || (hh > 0.82 && v === sv - 3)) return 2;
  return -1;
}

/** Apply fur strokes to a base color. */
export function furColor(base, x, y, z, e, seed, amt = 1) {
  const k = furStroke(x, y, z, e, seed);
  if (k === 1) return lt(base, 0.1 * amt);
  if (k === 2) return dk(base, 0.14 * amt);
  return base;
}

// ---------------------------------------------------------------- dirt
/**
 * Dirt smudges: a few seeded blobs (centers with radii) mixed into surface colors.
 * spots: [{x,y,z,r,c,a}] — returns the dirtied color.
 */
export function smudge(c, x, y, z, spots, seed) {
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y, dz = z + 0.5 - s.z;
    const d2 = (dx * dx + dy * dy * 1.3 + dz * dz) / (s.r * s.r);
    if (d2 > 1) continue;
    // solid core, dithered rim: reads as a soft smudge, not static
    if (d2 > 0.55 && ((x + y + z) & 1)) continue;
    return mix(c, s.c, (d2 < 0.3 ? 1 : 0.75) * s.a);
  }
  return c;
}

// ---------------------------------------------------------------- geometry cache
const cache = new Map();
let cachedVerts = 0;
const CACHE_VERTS = 900000;
export const stats = { hits: 0, misses: 0 };

function vertsOf(v) {
  if (!v) return 0;
  if (v.isBufferGeometry) return v.attributes.position ? v.attributes.position.count : 0;
  let n = 0;
  for (const k in v) { const x = v[k]; if (x && x.isBufferGeometry) n += vertsOf(x); }
  return n + 1;
}

/**
 * Build (or reuse) a value for a key: a geometry (voxel units) or an object holding
 * geometries plus layout info. LRU-bounded by total vertex count.
 */
export function cached(key, build) {
  let g = cache.get(key);
  if (g) {
    stats.hits++;
    cache.delete(key);
    cache.set(key, g);
    return g;
  }
  stats.misses++;
  g = build();
  cache.set(key, g);
  cachedVerts += vertsOf(g);
  while (cachedVerts > CACHE_VERTS && cache.size > 1) {
    const [k0, g0] = cache.entries().next().value;
    cache.delete(k0);
    cachedVerts -= vertsOf(g0);
  }
  return g;
}
export const cachedGeo = cached;

export function clearCharCache() { cache.clear(); cachedVerts = 0; }

let lensMat = null;
/** Unlit glowing material for lamp lenses (shared). */
export function glowMaterial() {
  if (!lensMat) {
    lensMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    lensMat.userData.shared = true;
  }
  return lensMat;
}

/** A mesh for a cached voxel geometry at voxel size vs. */
export function partMesh(geo, kind, vs, outline = true) {
  const m = new THREE.Mesh(geo, voxelMaterial(kind));
  m.scale.setScalar(vs);
  if (outline) m.layers.enable(LAYER_OUTLINE);
  return m;
}

/** Build a tiny template grid from rows of characters (top row first). */
export function templateVox(rows, pal, depth = 1) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const v = new Vox(0, w, 0, h, 0, depth);
  for (let r = 0; r < h; r++) {
    const row = rows[r];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) continue;
      for (let z = 0; z < depth; z++) v.set(x, h - 1 - r, z, c);
    }
  }
  return v;
}
