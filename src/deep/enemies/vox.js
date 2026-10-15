// Tiny voxel modelling kit for the underground's creatures: a sparse grid with signed integer
// coordinates (model space, +z = the creature's front, +y up), smooth shapes, painting helpers and
// a greedy mesh at VS meters per voxel. Models remember their voxels so a defeated creature can
// burst into chunks made of exactly the voxels it was built from.
import { VoxelGrid, meshGridGreedy } from '../../gfx/Voxel.js';
import { h3 } from '../noise.js';
import { clamp } from '../../core/util.js';

export const VS = 1 / 24; // meters per creature voxel (terrain voxels are 1/8 m)

const key = (x, y, z) => (x + 128) | ((y + 128) << 8) | ((z + 128) << 16);

export class VB {
  constructor(seed = 1) {
    this.v = new Map();
    this.seed = seed;
  }
  set(x, y, z, c) {
    if (c === undefined || c === null || c < 0) { this.v.delete(key(x, y, z)); return; }
    this.v.set(key(x, y, z), c);
  }
  get(x, y, z) { const c = this.v.get(key(x, y, z)); return c === undefined ? -1 : c; }
  has(x, y, z) { return this.v.has(key(x, y, z)); }
  del(x, y, z) { this.v.delete(key(x, y, z)); }
  /** Deterministic per-voxel noise in [0, 1). */
  n(x, y, z, s = 0) { return h3(x, y, z, this.seed + s); }

  /** Inclusive box. c: color or fn(x, y, z) → color (-1/undefined skips). */
  box(x0, y0, z0, x1, y1, z1, c) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const col = typeof c === 'function' ? c(x, y, z) : c;
      if (col !== undefined && col >= 0) this.set(x, y, z, col);
    }
    return this;
  }
  /** Ellipsoid around (cx, cy, cz) (voxel centers sit at +0.5). c: color or fn(x, y, z, nx, ny, nz). */
  ell(cx, cy, cz, rx, ry, rz, c) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz > 1) continue;
          const col = typeof c === 'function' ? c(x, y, z, dx, dy, dz) : c;
          if (col !== undefined && col >= 0) this.set(x, y, z, col);
        }
    return this;
  }
  /** Capsule from a to b (voxel centers), radius r. */
  cap(ax, ay, az, bx, by, bz, r, c) {
    const x0 = Math.floor(Math.min(ax, bx) - r), x1 = Math.ceil(Math.max(ax, bx) + r);
    const y0 = Math.floor(Math.min(ay, by) - r), y1 = Math.ceil(Math.max(ay, by) + r);
    const z0 = Math.floor(Math.min(az, bz) - r), z1 = Math.ceil(Math.max(az, bz) + r);
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az;
      const t = clamp((px * dx + py * dy + pz * dz) / L2, 0, 1);
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
      if (qx * qx + qy * qy + qz * qz > r * r) continue;
      const col = typeof c === 'function' ? c(x, y, z, t) : c;
      if (col !== undefined && col >= 0) this.set(x, y, z, col);
    }
    return this;
  }
  /** Repaint: fn(x, y, z, c) → new color, -1 deletes, undefined keeps. */
  paint(fn) {
    for (const [k, c] of [...this.v]) {
      const x = (k & 255) - 128, y = ((k >> 8) & 255) - 128, z = ((k >> 16) & 255) - 128;
      const r = fn(x, y, z, c);
      if (r === -1) this.v.delete(k);
      else if (r !== undefined) this.v.set(k, r);
    }
    return this;
  }
  /** Mirror everything at x >= 0 onto x < 0 (models are drawn on the +x side). */
  mirrorX() {
    for (const [k, c] of [...this.v]) {
      const x = (k & 255) - 128;
      if (x < 0) continue;
      const y = ((k >> 8) & 255) - 128, z = ((k >> 16) & 255) - 128;
      this.set(-1 - x, y, z, c);
    }
    return this;
  }
  /** Is a voxel's face toward (dx, dy, dz) open? */
  open(x, y, z, dx, dy, dz) { return !this.has(x + dx, y + dy, z + dz); }
  list() {
    const out = [];
    for (const [k, c] of this.v) out.push({ x: (k & 255) - 128, y: ((k >> 8) & 255) - 128, z: ((k >> 16) & 255) - 128, c });
    return out;
  }
  get size() { return this.v.size; }

  /**
   * Greedy mesh, VS meters per voxel. (px, py, pz) is the model-space pivot (in voxels) that becomes
   * the mesh origin. Returns the geometry with userData { vox, pivot } for debris.
   */
  geo(px = 0, py = 0, pz = 0) {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const L = this.list();
    for (const v of L) {
      if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
      if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
      if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
    }
    if (!L.length) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 0; }
    const g = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
    for (const v of L) g.set(v.x - x0, v.y - y0, v.z - z0, v.c);
    const geo = meshGridGreedy(g, { scale: VS, pivot: [px - x0, py - y0, pz - z0], shade: true });
    geo.userData.vox = L;
    geo.userData.pivot = [px, py, pz];
    return geo;
  }
}

// ------------------------------------------------------------------ colors
export const rgb = (h) => [((h >> 16) & 255), ((h >> 8) & 255), (h & 255)];
export const hex = (r, g, b) => ((clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) >>> 0;
export const mul = (h, f) => { const [r, g, b] = rgb(h); return hex(r * f, g * f, b * f); };
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** 0..1 floats for particles. */
export const c01 = (h) => { const [r, g, b] = rgb(h); return [r / 255, g / 255, b / 255]; };
/** Pick from a dark → light ramp by t in 0..1. */
export const ramp = (tones, t) => tones[clamp(Math.floor(t * tones.length), 0, tones.length - 1)];
