// Tiny voxel modelling kit for the underground's creatures: a sparse grid with signed integer
// coordinates (model space, +z = the creature's front, +y up), smooth shapes, painting helpers and
// a greedy mesh at VS meters per voxel. Models remember their voxels so a defeated creature can
// burst into chunks made of exactly the voxels it was built from.
import * as THREE from 'three';
import { h3 } from '../noise.js';
import { clamp } from '../../core/util.js';

export const VS = 1 / 24; // meters per creature voxel as modelled (terrain voxels are 1/8 m)
/**
 * Every creature is meshed at about this voxel size, whatever it was modelled at: a model drawn in
 * coarse voxels (a troll at 1/20 m, a tyrant at 1/16) is refined k× when it's meshed (refine()),
 * its silhouette smoothed from the coarse shape, so a big monster has far more voxels than a small
 * one and none of them look blockier than a kobold.
 */
export const FINE = 1 / 40;

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
  /** First filled voxel walking from (x, y, z) along (dx, dy, dz) (steps of one voxel), or null. */
  hitFrom(x, y, z, dx, dy, dz, max = 40) {
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    for (let i = 0; i < max; i++) {
      const px = Math.round(x + dx * i), py = Math.round(y + dy * i), pz = Math.round(z + dz * i);
      if (this.has(px, py, pz)) return [px, py, pz];
    }
    return null;
  }
  /** Is a voxel's face toward (dx, dy, dz) open? */
  open(x, y, z, dx, dy, dz) { return !this.has(x + dx, y + dy, z + dz); }
  list() {
    const out = [];
    for (const [k, c] of this.v) out.push({ x: (k & 255) - 128, y: ((k >> 8) & 255) - 128, z: ((k >> 16) & 255) - 128, c });
    return out;
  }
  get size() { return this.v.size; }

  /** Drop voxels buried on all six sides (big models: far fewer voxels to keep and burst). */
  hollow() {
    // occupancy in a typed grid padded by 2 (Map lookups were most of a big model's build time)
    let x0 = 255, y0 = 255, z0 = 255, x1 = 0, y1 = 0, z1 = 0;
    for (const k of this.v.keys()) {
      const x = k & 255, y = (k >> 8) & 255, z = (k >> 16) & 255;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x1 < x0) return this;
    const SY = x1 - x0 + 5, SZ = SY * (y1 - y0 + 5);
    const o = new Uint8Array(SZ * (z1 - z0 + 5));
    const at = (k) => ((k & 255) - x0 + 2) + SY * (((k >> 8) & 255) - y0 + 2) + SZ * (((k >> 16) & 255) - z0 + 2);
    for (const k of this.v.keys()) o[at(k)] = 1;
    const kill = [];
    for (const k of this.v.keys()) {
      const i = at(k);
      if (o[i + 1] && o[i - 1] && o[i + SY] && o[i - SY] && o[i + SZ] && o[i - SZ]
        && o[i + 2] && o[i - 2] && o[i + 2 * SY] && o[i - 2 * SY] && o[i + 2 * SZ] && o[i - 2 * SZ]) kill.push(k);
    }
    for (const k of kill) this.v.delete(k);
    return this;
  }
  /** Copy another model's voxels in at an offset. */
  merge(o, dx = 0, dy = 0, dz = 0) {
    for (const v of o.list()) this.set(v.x + dx, v.y + dy, v.z + dz, v.c);
    return this;
  }

  /**
   * Greedy mesh, `vs` meters per voxel (VS by default). (px, py, pz) is the model-space pivot (in
   * voxels) that becomes the mesh origin. Returns the geometry with userData { vox, pivot, vs } for debris.
   */
  geo(px = 0, py = 0, pz = 0, vs = VS) {
    // refined to the shared voxel size (FINE): k × finer, the pivot and voxel size with it
    let k = Math.max(1, Math.round(vs / FINE));
    if (k > 1 && this.v.size) {
      let lo = 0, hi = 0;
      for (const kk of this.v.keys()) { const a = Math.min(kk & 255, (kk >> 8) & 255, (kk >> 16) & 255) - 128, b = Math.max(kk & 255, (kk >> 8) & 255, (kk >> 16) & 255) - 128; if (a < lo) lo = a; if (b > hi) hi = b; }
      while (k > 1 && Math.max(-lo, hi + 1) * k > 124) k--;
      // (at most 2×: a refined part's surface grows k², and every voxel face is triangles on screen)
      k = Math.min(k, 2);
    }
    if (k > 1) {
      // (the coarse voxels stay on it too: code that picks voxels by model coordinates uses them)
      const cl = this.list();
      const g = refine(this, k).geo(px * k, py * k, pz * k, vs / k);
      g.userData.cvox = cl; g.userData.cpivot = [px, py, pz]; g.userData.ck = k;
      return g;
    }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const L = this.list();
    for (const v of L) {
      if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
      if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
      if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
    }
    if (!L.length) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 0; }
    const geo = meshFast(L, x0, y0, z0, x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, vs, px - x0, py - y0, pz - z0);
    geo.userData.vox = L;
    geo.userData.pivot = [px, py, pz];
    geo.userData.vs = vs;
    return geo;
  }
}

/**
 * A model k× finer (k ≥ 2): each voxel becomes k³, and the silhouette is smoothed from the coarse
 * occupancy (trilinear, so flat faces stay where they were and edges and corners round off). Thin
 * bits (teeth, claws, horns, a single voxel's eye) are chamfered, never lost; colors come from the
 * coarse voxel (flat, so the greedy mesher still merges faces). The result is hollowed.
 */
export function refine(src, k) {
  let x0 = 255, y0 = 255, z0 = 255, x1 = 0, y1 = 0, z1 = 0;
  for (const kk of src.v.keys()) {
    const x = kk & 255, y = (kk >> 8) & 255, z = (kk >> 16) & 255;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const out = new VB(src.seed);
  if (x1 < x0) return out;
  // the coarse model in a typed grid padded by 1 (colors + 1, 0 = empty)
  const SX = x1 - x0 + 3, SY = y1 - y0 + 3, SZ = z1 - z0 + 3, SXY = SX * SY;
  const g = new Int32Array(SXY * SZ);
  for (const [kk, c] of src.v) g[((kk & 255) - x0 + 1) + SX * (((kk >> 8) & 255) - y0 + 1) + SXY * (((kk >> 16) & 255) - z0 + 1)] = (c & 0xffffff) + 1;
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ ? 0 : g[x + SX * y + SXY * z]);
  const nb = new Uint8Array(g.length); // occupied face neighbours per coarse cell
  for (let z = 1; z < SZ - 1; z++) for (let y = 1; y < SY - 1; y++) for (let x = 1; x < SX - 1; x++) {
    const i = x + SX * y + SXY * z;
    if (!g[i]) continue;
    nb[i] = (g[i + 1] ? 1 : 0) + (g[i - 1] ? 1 : 0) + (g[i + SX] ? 1 : 0) + (g[i - SX] ? 1 : 0) + (g[i + SXY] ? 1 : 0) + (g[i - SXY] ? 1 : 0);
  }
  const ox = (x0 - 128 - 1) * k, oy = (y0 - 128 - 1) * k, oz = (z0 - 128 - 1) * k;
  for (let fz = 0; fz < SZ * k; fz++) for (let fy = 0; fy < SY * k; fy++) for (let fx = 0; fx < SX * k; fx++) {
    // the fine voxel's centre in coarse cell-centre coordinates
    const cx = (fx + 0.5) / k - 0.5, cy = (fy + 0.5) / k - 0.5, cz = (fz + 0.5) / k - 0.5;
    const ix = Math.floor(cx), iy = Math.floor(cy), iz = Math.floor(cz);
    const tx = cx - ix, ty = cy - iy, tz = cz - iz;
    const cell = Math.floor(fx / k) + SX * Math.floor(fy / k) + SXY * Math.floor(fz / k);
    const own = g[cell];
    // trilinear occupancy round it (and the strongest neighbour's colour)
    let occ = 0, best = 0, bw = -1;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
      const v = at(ix + dx, iy + dy, iz + dz);
      if (!v) continue;
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
      occ += w;
      if (w > bw) { bw = w; best = v; }
    }
    let fill;
    if (own) fill = occ >= (nb[cell] <= 3 ? 0.4 : 0.3) || nb[cell] === 0; // (thin bits: chamfered, not lost)
    else fill = occ >= 0.62;
    if (!fill) continue;
    const col = (own || best) - 1;
    out.set(fx + ox, fy + oy, fz + oz, col);
  }
  return out.hollow();
}

// ------------------------------------------------------------------ colors
// ---------------------------------------------------------------- fast greedy mesher
// The same faces, baked shading, AO and winding as gfx/Voxel.js meshGridGreedy({ shade: true }),
// rebuilt for speed (a padded typed grid, no per-face allocations, typed output buffers): big
// creatures (trolls, tyrants) mesh 3-4x faster, which is what a first sighting costs.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.93 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];
const AO_CURVE = [1.0, 0.8, 0.66, 0.52];
const AXES = FACES.map((f) => {
  const d = f.n[0] ? 0 : f.n[1] ? 1 : 2;
  const t = [0, 1, 2].filter((k) => k !== d);
  return { d, u: d === 0 ? 1 : 0, v: d === 2 ? 1 : 2, t0: t[0], t1: t[1], tc: f.c.map((cr) => [cr[t[0]] ? 1 : -1, cr[t[1]] ? 1 : -1]) };
});
const _col = new THREE.Color();
let oP = new Float32Array(3 << 14), oN = new Float32Array(3 << 14), oC = new Float32Array(3 << 14), oI = new Uint32Array(6 << 12);
let mask = new Int32Array(4096);

function meshFast(L, x0, y0, z0, W, H, D, s, px, py, pz) {
  const SY = W + 2, SZ = SY * (H + 2);
  const g = new Uint32Array(SZ * (D + 2));
  for (const v of L) g[(v.x - x0 + 1) + SY * (v.y - y0 + 1) + SZ * (v.z - z0 + 1)] = ((v.c & 0xffffff) | 0x1000000) >>> 0;
  const dims = [W, H, D], str = [1, SY, SZ];
  let vc = 0, ic = 0, lastHex = -1, cr = 0, cg = 0, cb = 0;
  const grow = () => {
    const P = new Float32Array(oP.length * 2); P.set(oP); oP = P;
    const N = new Float32Array(oN.length * 2); N.set(oN); oN = N;
    const C = new Float32Array(oC.length * 2); C.set(oC); oC = C;
    const I = new Uint32Array(oI.length * 2); I.set(oI); oI = I;
  };
  const ao4 = [0, 0, 0, 0], cx = [0, 0, 0, 0], cy = [0, 0, 0, 0], cz = [0, 0, 0, 0];
  // one quad: corners (cx, cy, cz)[0..3] in grid space, AO levels l0..l3
  const emit = (f, hex, l0, l1, l2, l3) => {
    if ((vc + 4) * 3 > oP.length || ic + 6 > oI.length) grow();
    if (hex !== lastHex) { _col.setHex(hex); cr = _col.r; cg = _col.g; cb = _col.b; lastHex = hex; }
    const sh = f.shade, n = f.n;
    const a0 = AO_CURVE[l0], a1 = AO_CURVE[l1], a2 = AO_CURVE[l2], a3 = AO_CURVE[l3];
    for (let i = 0; i < 4; i++) {
      const o = (vc + i) * 3, a = (i === 0 ? a0 : i === 1 ? a1 : i === 2 ? a2 : a3) * sh;
      oP[o] = (cx[i] - px) * s; oP[o + 1] = (cy[i] - py) * s; oP[o + 2] = (cz[i] - pz) * s;
      oN[o] = n[0]; oN[o + 1] = n[1]; oN[o + 2] = n[2];
      oC[o] = cr * a; oC[o + 1] = cg * a; oC[o + 2] = cb * a;
    }
    if (a0 + a2 < a1 + a3) { oI[ic] = vc + 1; oI[ic + 1] = vc + 2; oI[ic + 2] = vc + 3; oI[ic + 3] = vc + 1; oI[ic + 4] = vc + 3; oI[ic + 5] = vc; }
    else { oI[ic] = vc; oI[ic + 1] = vc + 1; oI[ic + 2] = vc + 2; oI[ic + 3] = vc; oI[ic + 4] = vc + 2; oI[ic + 5] = vc + 3; }
    vc += 4; ic += 6;
  };
  const base = 1 + SY + SZ;
  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi], A = AXES[fi], fc = f.c;
    const { d, u, v } = A;
    const U = dims[u], V = dims[v], sd = str[d], su = str[u], sv = str[v];
    const nOff = f.n[0] + f.n[1] * SY + f.n[2] * SZ;
    // AO probe offsets per corner: the two edge neighbours and the corner, in the layer outside the face
    const e1 = [], e2 = [], ec = [];
    for (let i = 0; i < 4; i++) {
      const [s0, s1] = A.tc[i];
      e1.push(nOff + s0 * str[A.t0]); e2.push(nOff + s1 * str[A.t1]); ec.push(nOff + s0 * str[A.t0] + s1 * str[A.t1]);
    }
    if (mask.length < U * V) mask = new Int32Array(U * V);
    for (let sl = 0; sl < dims[d]; sl++) {
      mask.fill(0, 0, U * V);
      const row0 = base + sl * sd;
      for (let b = 0; b < V; b++) {
        let gi = row0 + b * sv;
        for (let a = 0; a < U; a++, gi += su) {
          const raw = g[gi];
          if (!raw || g[gi + nOff]) continue;
          for (let i = 0; i < 4; i++) {
            const p = g[gi + e1[i]] ? 1 : 0, q = g[gi + e2[i]] ? 1 : 0;
            ao4[i] = p && q ? 3 : p + q + (g[gi + ec[i]] ? 1 : 0);
          }
          const c = raw & 0xffffff;
          if (ao4[0] === ao4[1] && ao4[1] === ao4[2] && ao4[2] === ao4[3]) { mask[a + b * U] = c * 4 + ao4[0] + 1; continue; }
          // cell coords
          let x, y, z;
          if (d === 0) { x = sl; y = a; z = b; } else if (d === 1) { x = a; y = sl; z = b; } else { x = a; z = sl; y = b; }
          for (let i = 0; i < 4; i++) { cx[i] = x + fc[i][0]; cy[i] = y + fc[i][1]; cz[i] = z + fc[i][2]; }
          emit(f, c, ao4[0], ao4[1], ao4[2], ao4[3]);
        }
      }
      for (let b = 0; b < V; b++) for (let a = 0; a < U;) {
        const k = mask[a + b * U];
        if (!k) { a++; continue; }
        let w = 1;
        while (a + w < U && mask[a + w + b * U] === k) w++;
        let h = 1;
        outer: while (b + h < V) {
          for (let j = 0; j < w; j++) if (mask[a + j + (b + h) * U] !== k) break outer;
          h++;
        }
        for (let hh = 0; hh < h; hh++) mask.fill(0, a + (b + hh) * U, a + w + (b + hh) * U);
        for (let i = 0; i < 4; i++) {
          const c3 = fc[i];
          const pd = sl + c3[d], pu = c3[u] ? a + w : a, pv = c3[v] ? b + h : b;
          const p = [0, 0, 0]; p[d] = pd; p[u] = pu; p[v] = pv;
          cx[i] = p[0]; cy[i] = p[1]; cz[i] = p[2];
        }
        const lv = (k - 1) % 4;
        emit(f, Math.floor((k - 1) / 4), lv, lv, lv, lv);
        a += w;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(oP.slice(0, vc * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(oN.slice(0, vc * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(oC.slice(0, vc * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(vc > 65535 ? oI.slice(0, ic) : Uint16Array.from(oI.subarray(0, ic)), 1));
  geo.computeBoundingSphere();
  return geo;
}

export const rgb = (h) => [((h >> 16) & 255), ((h >> 8) & 255), (h & 255)];
export const hex = (r, g, b) => ((clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) >>> 0;
export const mul = (h, f) => { const [r, g, b] = rgb(h); return hex(r * f, g * f, b * f); };
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** 0..1 floats for particles. */
export const c01 = (h) => { const [r, g, b] = rgb(h); return [r / 255, g / 255, b / 255]; };
/** Pick from a dark → light ramp by t in 0..1. */
export const ramp = (tones, t) => tones[clamp(Math.floor(t * tones.length), 0, tones.length - 1)];
