// A small voxel grid for cave props (1/16 m voxels) that also stores a glow level per voxel, and a
// greedy mesher that keeps it: the output is plain typed arrays (position, byte normal, sRGB colour
// with baked AO, glow, sway weight) ready to be transformed and merged into the props buffer.

const FILLED = 1 << 24;
export const PU = 1 / 16; // metres per prop voxel

export class PGrid {
  constructor(w, h, d) {
    this.w = w; this.h = h; this.d = d;
    this.data = new Uint32Array(w * h * d);
  }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  /** c: 0xRRGGBB (or <0 to clear); g: glow level 0..3. */
  set(x, y, z, c, g = 0) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (!this.inb(x, y, z)) return;
    this.data[x + this.w * (y + this.h * z)] = c < 0 ? 0 : (c & 0xffffff) | FILLED | ((g & 3) << 25);
  }
  /** Only where empty. */
  add(x, y, z, c, g = 0) { if (!this.has(x, y, z)) this.set(x, y, z, c, g); }
  has(x, y, z) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    return this.inb(x, y, z) && this.data[x + this.w * (y + this.h * z)] !== 0;
  }
  color(x, y, z) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (!this.inb(x, y, z)) return -1;
    const v = this.data[x + this.w * (y + this.h * z)];
    return v ? v & 0xffffff : -1;
  }
  /** c may be a function (x, y, z) → colour | -1. */
  box(x0, y0, z0, w, h, d, c, g = 0) {
    for (let z = z0; z < z0 + d; z++) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const col = typeof c === 'function' ? c(x, y, z) : c;
      if (col >= 0) this.set(x, y, z, col, g);
    }
  }
  ell(cx, cy, cz, rx, ry, rz, c, g = 0) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz > 1) continue;
          const col = typeof c === 'function' ? c(x, y, z, dx, dy, dz) : c;
          if (col >= 0) this.set(x, y, z, col, g);
        }
  }
  cylY(cx, cz, r, y0, y1, c, g = 0) {
    for (let y = y0; y < y1; y++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (z - cz) ** 2 > r * r) continue;
      const col = typeof c === 'function' ? c(x, y, z) : c;
      if (col >= 0) this.set(x, y, z, col, g);
    }
  }
  /** A voxel line (r = 0: one voxel thick, else a round brush). c may be fn(t, x, y, z). */
  line(x0, y0, z0, x1, y1, z1, c, g = 0, r = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
      const col = typeof c === 'function' ? c(t, x, y, z) : c;
      if (col < 0) continue;
      if (r <= 0) { this.set(x, y, z, col, g); continue; }
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy + dz * dz > r * r + 0.3) continue;
        this.set(x + dx, y + dy, z + dz, col, g);
      }
    }
  }
}

// ---------------------------------------------------------------- mesher
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const AXES = FACES.map((f) => {
  const d = f.n[0] ? 0 : f.n[1] ? 1 : 2;
  const t = [0, 1, 2].filter((k) => k !== d);
  return { d, u: d === 0 ? 1 : 0, v: d === 2 ? 1 : 2, t0: t[0], t1: t[1], tc: f.c.map((cr) => [cr[t[0]] ? 1 : -1, cr[t[1]] ? 1 : -1]) };
});
const AO_CURVE = [1.0, 0.8, 0.66, 0.52];
export const GLOW_LEVEL = [0, 0.32, 0.7, 1.15];
// colours are stored as sRGB bytes (the shader linearises them): AO is applied in linear light
const AO_SRGB = AO_CURVE.map((k) => Math.pow(k, 1 / 2.2));
const AO_SRGB_GLOW = AO_CURVE.map((k) => Math.pow(1 - (1 - k) * 0.35, 1 / 2.2));

/**
 * Greedy-mesh a PGrid. opts.pivot: voxel coords that become the origin; opts.sway: null | 'up' |
 * 'down' | fn(x, y, z) → 0..1 (local metres). Returns { pos, nor, col, glw, sw, idx, nv, ni, min, max }.
 */
export function meshProp(grid, opts = {}) {
  const it = meshPropSteps(grid, opts);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** The same mesher as a generator: yields after each face direction (for time-sliced meshing). */
export function* meshPropSteps(grid, opts = {}) {
  const s = opts.scale ?? PU;
  const [px, py, pz] = opts.pivot ?? [grid.w / 2, 0, grid.d / 2];
  const W = grid.w, H = grid.h, D = grid.d, data = grid.data;
  const useAO = opts.ao ?? true;
  const dims = [W, H, D];
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && data[x + W * (y + H * z)] !== 0;
  let cap = 512, icap = 768;
  let P = new Float32Array(cap * 3), N = new Int8Array(cap * 3), C = new Uint8Array(cap * 3), G = new Float32Array(cap), I = new Uint32Array(icap);
  const grow = () => {
    cap *= 2;
    const g3 = (a, T) => { const b = new T(cap * 3); b.set(a); return b; };
    P = g3(P, Float32Array); N = g3(N, Int8Array); C = g3(C, Uint8Array);
    const g1 = new Float32Array(cap); g1.set(G); G = g1;
    icap = cap * 1.5;
    const ii = new Uint32Array(icap); ii.set(I); I = ii;
  };
  let vc = 0, ic = 0;
  const cell = [0, 0, 0], o = [0, 0, 0], q = [0, 0, 0], tmp = [0, 0, 0];
  const ao4 = [0, 0, 0, 0];
  const emit = (fi, raw, l0, l1, l2, l3, sl, a, b, w, h) => {
    if (vc + 4 > cap) grow();
    const f = FACES[fi], A = AXES[fi], d = A.d, u = A.u, v = A.v;
    const r8 = (raw >> 16) & 255, g8 = (raw >> 8) & 255, b8 = raw & 255;
    const gl = GLOW_LEVEL[(raw >> 25) & 3];
    for (let i = 0; i < 4; i++) {
      const cr = f.c[i];
      tmp[d] = sl + cr[d]; tmp[u] = a + cr[u] * w; tmp[v] = b + cr[v] * h;
      const o3 = (vc + i) * 3;
      P[o3] = (tmp[0] - px) * s; P[o3 + 1] = (tmp[1] - py) * s; P[o3 + 2] = (tmp[2] - pz) * s;
      N[o3] = f.n[0] * 127; N[o3 + 1] = f.n[1] * 127; N[o3 + 2] = f.n[2] * 127;
      const lv = i === 0 ? l0 : i === 1 ? l1 : i === 2 ? l2 : l3;
      // glowing voxels barely darken in the creases
      const k = gl > 0 ? AO_SRGB_GLOW[lv] : AO_SRGB[lv];
      C[o3] = Math.round(r8 * k); C[o3 + 1] = Math.round(g8 * k); C[o3 + 2] = Math.round(b8 * k);
      G[vc + i] = gl;
    }
    if (AO_CURVE[l0] + AO_CURVE[l2] < AO_CURVE[l1] + AO_CURVE[l3]) { I[ic] = vc + 1; I[ic + 1] = vc + 2; I[ic + 2] = vc + 3; I[ic + 3] = vc + 1; I[ic + 4] = vc + 3; I[ic + 5] = vc; }
    else { I[ic] = vc; I[ic + 1] = vc + 1; I[ic + 2] = vc + 2; I[ic + 3] = vc; I[ic + 4] = vc + 2; I[ic + 5] = vc + 3; }
    ic += 6;
    vc += 4;
  };
  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi], A = AXES[fi];
    const { d, u, v } = A;
    const U = dims[u], V = dims[v];
    const nx = f.n[0], ny = f.n[1], nz = f.n[2];
    const mask = new Int32Array(U * V);
    for (let sl = 0; sl < dims[d]; sl++) {
      let any = false;
      for (let b = 0; b < V; b++) for (let a = 0; a < U; a++) {
        cell[d] = sl; cell[u] = a; cell[v] = b;
        const x = cell[0], y = cell[1], z = cell[2];
        const raw = data[x + W * (y + H * z)];
        if (!raw || solid(x + nx, y + ny, z + nz)) { mask[a + b * U] = 0; continue; }
        if (useAO) {
          o[0] = x + nx; o[1] = y + ny; o[2] = z + nz;
          for (let i = 0; i < 4; i++) {
            const tc = A.tc[i];
            q[0] = o[0]; q[1] = o[1]; q[2] = o[2]; q[A.t0] += tc[0];
            const e1 = solid(q[0], q[1], q[2]) ? 1 : 0;
            q[A.t0] -= tc[0]; q[A.t1] += tc[1];
            const e2 = solid(q[0], q[1], q[2]) ? 1 : 0;
            q[A.t0] += tc[0];
            const cc = solid(q[0], q[1], q[2]) ? 1 : 0;
            ao4[i] = e1 && e2 ? 3 : e1 + e2 + cc;
          }
        } else ao4[0] = ao4[1] = ao4[2] = ao4[3] = 0;
        const key = raw & 0x7ffffff;
        if (ao4[0] === ao4[1] && ao4[1] === ao4[2] && ao4[2] === ao4[3]) { mask[a + b * U] = key * 4 + ao4[0] + 1; any = true; }
        else { mask[a + b * U] = 0; emit(fi, raw, ao4[0], ao4[1], ao4[2], ao4[3], sl, a, b, 1, 1); }
      }
      if (!any) continue;
      for (let b = 0; b < V; b++) for (let a = 0; a < U;) {
        const key = mask[a + b * U];
        if (!key) { a++; continue; }
        let w = 1;
        while (a + w < U && mask[a + w + b * U] === key) w++;
        let h = 1;
        outer: while (b + h < V) {
          for (let k = 0; k < w; k++) if (mask[a + k + (b + h) * U] !== key) break outer;
          h++;
        }
        for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[a + k + (b + hh) * U] = 0;
        const lv = (key - 1) % 4;
        emit(fi, Math.floor((key - 1) / 4), lv, lv, lv, lv, sl, a, b, w, h);
        a += w;
      }
      if ((sl & 3) === 3) yield fi; // big grids mesh in slices
    }
    yield fi;
  }
  const nv = vc;
  P = P.slice(0, nv * 3);
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const vv = P[i * 3 + k]; if (vv < min[k]) min[k] = vv; if (vv > max[k]) max[k] = vv; }
  const sw = new Float32Array(nv);
  const mode = opts.sway;
  if (mode) {
    for (let i = 0; i < nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let w;
      if (mode === 'up') w = Math.max(0, y) / Math.max(1e-3, max[1]);
      else if (mode === 'down') w = Math.max(0, -y) / Math.max(1e-3, -min[1]);
      else w = mode(x, y, z);
      sw[i] = Math.pow(Math.min(1, Math.max(0, w)), 1.4);
    }
  }
  return {
    pos: P, nor: N.slice(0, nv * 3), col: C.slice(0, nv * 3), glw: G.slice(0, nv), sw,
    idx: I.slice(0, ic), nv, ni: ic, min, max,
  };
}

// ---------------------------------------------------------------- small helpers for modelling
export function rng32(seed) {
  let a = seed >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a0, a1) => a0 + r() * (a1 - a0);
  r.int = (a0, a1) => a0 + Math.floor(r() * (a1 - a0 + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}
/** Integer hash of a voxel (for 2-tone pixel patterns). */
export function hv(x, y, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function shade(hex, k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}
export function mixc(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
