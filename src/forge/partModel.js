// Forge pieces in 3D at the forge (your first pickaxe): every piece is a set of small voxels (VX m)
// with three poses that the forging morphs through as you strike it:
//   bar    a hot, thick bar of the right amount of metal (what comes out of the ingots)
//   flat   the bar drawn out: straight strips laid side by side (the flat blanks)
//   final  the strips bent into the piece
// p 0 … 0.45 draws the bar out (stone by stone from one end), 0.45 … 1 bends it (from the tongs'
// end on). Late voxels (the haft, the grip) are set in when the work is done. PartView renders it
// all as two instanced meshes.
import * as THREE from 'three';
import { VoxelGrid, meshGridGreedy } from '../gfx/Voxel.js';
import { METALS } from '../data/weapons.js';
import { glowAmount, glowHex } from './blackbody.js';
import { makeHotMetal } from './hotMetal.js';
import { mixHex, shade } from '../core/util.js';
import { makeGlow } from '../bookends/fx.js';
import { pieceOf } from '../data/forgePieces.js';

export const VX = 0.0075; // meters per voxel
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const hash = (a, b, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Where the next blow lands: a voxel reticle (VX / 2 voxels, flat on the metal): four L brackets
 * round a little cross, bright on their outer corners. No ring.
 */
function markerGeo() {
  const g = new VoxelGrid(15, 1, 15);
  for (const sx of [0, 1]) for (const sz of [0, 1]) {
    const x0 = sx ? 14 : 0, z0 = sz ? 14 : 0, dx = sx ? -1 : 1, dz = sz ? -1 : 1;
    for (let k = 0; k < 4; k++) { g.set(x0 + dx * k, 0, z0, k ? 0xe8e8e8 : 0xffffff); g.set(x0, 0, z0 + dz * k, k ? 0xe8e8e8 : 0xffffff); }
  }
  for (let k = -1; k <= 1; k++) { g.set(7 + k, 0, 7, 0xd0d0d0); g.set(7, 0, 7 + k, 0xd0d0d0); }
  return meshGridGreedy(g, { scale: VX / 2, pivot: [7.5, 0, 7.5], ao: false });
}

// tones: 0 body, 1 dark (holes, rivets), 2 bright (rims, bolts); late voxels carry a color
// ---------------------------------------------------------------- the builder
class Shape {
  constructor() { this.v = []; this.keys = new Map(); this.comps = []; }
  comp(kind = 'lanes') { const c = { id: this.comps.length, kind, x0: 0, z0: 0 }; this.comps.push(c); return c; }
  add(x, y, z, o = {}) {
    const ix = Math.round(x), iy = Math.round(y), iz = Math.round(z);
    const k = ix + ',' + iy + ',' + iz;
    const had = this.keys.get(k);
    if (had) { if (o.tone && !had.late) had.tone = Math.max(had.tone, o.tone); return null; }
    const vx = { f: [ix, iy, iz], tone: o.tone || 0, late: o.late || null, comp: o.comp || null, flat: o.flat || null, lane: o.lane ?? null, s: o.s ?? 0, lf: o.lf || [0, 0] };
    this.keys.set(k, vx);
    this.v.push(vx);
    return vx;
  }
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * A strap along a polyline. cross: [[a, b, fz?, fy?], ...] offsets across (a: sideways, b: up
 * from the path) and where that lane lies in the flat strip (fz across, fy layer).
 * o: { tone(t, c) | tone, taper(t), comp }
 */
function sweep(S, pts, cross, o = {}) {
  const comp = o.comp || S.comp('lanes');
  let total = 0;
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 1e-6) continue;
    segs.push({ a, b, L, s0: total });
    total += L;
  }
  for (const sg of segs) {
    const T = norm([sg.b[0] - sg.a[0], sg.b[1] - sg.a[1], sg.b[2] - sg.a[2]]);
    let A = [-T[2], 0, T[0]];
    if (Math.hypot(A[0], A[2]) < 0.3) A = o.across || [0, 0, 1];
    A = norm(A);
    const U = norm(crossV(A, T));
    const n = Math.max(1, Math.ceil(sg.L / 0.35));
    for (let j = 0; j <= n; j++) {
      const s = (j / n) * sg.L;
      const t = total > 0 ? (sg.s0 + s) / total : 0;
      const k = o.taper ? o.taper(t) : 1;
      const P = [sg.a[0] + T[0] * s, sg.a[1] + T[1] * s, sg.a[2] + T[2] * s];
      for (const c of cross) {
        const ca = c[0] * k, cb = c[1] * k;
        const tone = typeof o.tone === 'function' ? o.tone(t, c, sg.s0 + s) : o.tone || 0;
        S.add(P[0] + A[0] * ca + U[0] * cb, P[1] + A[1] * ca + U[1] * cb, P[2] + A[2] * ca + U[2] * cb,
          { tone, comp, lane: comp.id + ':' + c[0] + ':' + c[1], s: sg.s0 + s, lf: [c[2] ?? c[0], c[3] ?? Math.max(0, c[1])] });
      }
    }
  }
  return comp;
}

/** Late voxels (not forged: set in at the end), color hex, glow 0..1. */
function late(S, x, y, z, color, glow = 0) { S.add(x, y, z, { late: { color, glow } }); }

const C3x2 = [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const C2x2 = [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]];

// ---------------------------------------------------------------- the pieces
const SHAPES = {
  // your first pickaxe: a curved head (a point one end, a chisel the other) round an eye, an ash haft set in at the end
  pick_first(S) {
    const head = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, x = -14 + t * 28, y = 10 - 0.03 * x * x; head.push([x, y, 0]); }
    sweep(S, head, C3x2, { taper: (t) => 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.5, tone: (t) => (t < 0.08 || t > 0.94 ? 1 : 0) });
    sweep(S, [[-2, 8, 0], [2, 8, 0]], C2x2, { tone: 2 }); // the eye's cheeks
    for (let y = -16; y <= 7; y++) for (const [x, z] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) late(S, x, y, z, (y + x) % 5 === 0 ? 0x7a5432 : y < -12 ? 0x5a3a22 : 0x9a6a42);
    for (let y = -14; y <= -10; y++) for (const [x, z] of [[1, 0], [-2, 0], [0, 1], [0, -2], [1, -1], [-2, -1], [-1, 1], [-1, -2]]) late(S, x, y, z, 0x4a2a18); // the leather grip
  },
};

// ---------------------------------------------------------------- finalize: flat layout, bar, order
function build(id) {
  const S = new Shape();
  (SHAPES[id] || SHAPES.pick_first)(S);
  const forged = S.v.filter((v) => !v.late);
  const lateV = S.v.filter((v) => v.late);
  // straps: rank each lane's voxels along the path → a straight strip per component
  const lanes = new Map();
  for (const v of forged) if (v.lane !== null) { if (!lanes.has(v.lane)) lanes.set(v.lane, []); lanes.get(v.lane).push(v); }
  for (const list of lanes.values()) {
    list.sort((a, b) => a.s - b.s);
    const n = list.length;
    list.forEach((v, i) => { v.flat = [i - (n - 1) / 2, v.lf[1], v.lf[0]]; });
  }
  // long straps are cut into lengths laid side by side (so the blank fits on the anvil)
  const MAXL = 34;
  for (const c of S.comps) {
    if (c.kind !== 'lanes') continue;
    const ls = [...lanes.entries()].filter(([k]) => k.startsWith(c.id + ':')).map(([, l]) => l);
    if (!ls.length) continue;
    const len = Math.max(...ls.map((l) => l.length));
    if (len <= MAXL) continue;
    const segs = Math.ceil(len / MAXL), segLen = Math.ceil(len / segs);
    let z0 = Infinity, z1 = -Infinity;
    for (const l of ls) for (const v of l) { z0 = Math.min(z0, v.lf[0]); z1 = Math.max(z1, v.lf[0]); }
    const w = Math.ceil(z1 - z0) + 1;
    for (const l of ls) l.forEach((v, i) => { const sg = Math.floor(i / segLen); v.flat = [i - sg * segLen - (segLen - 1) / 2, v.lf[1], v.lf[0] + sg * (w + 1)]; });
  }
  // pack the components' flat blanks into rows (each one centered on its own)
  const boxes = S.comps.map((c) => {
    const vs = forged.filter((v) => v.comp === c);
    if (!vs.length) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of vs) { x0 = Math.min(x0, v.flat[0]); x1 = Math.max(x1, v.flat[0]); z0 = Math.min(z0, v.flat[2]); z1 = Math.max(z1, v.flat[2]); }
    for (const v of vs) { v.flat[0] -= (x0 + x1) / 2; v.flat[2] -= (z0 + z1) / 2; }
    return { c, vs, w: x1 - x0 + 1, d: z1 - z0 + 1 };
  }).filter(Boolean).sort((a, b) => b.w * b.d - a.w * a.d);
  const ROW = 40;
  let rows = [], cur = null;
  for (const b of boxes) {
    if (!cur || cur.w + b.w + 1 > ROW) { cur = { w: 0, d: 0, items: [] }; rows.push(cur); }
    b.x = cur.w + b.w / 2; cur.w += b.w + 1; cur.d = Math.max(cur.d, b.d); cur.items.push(b);
  }
  let zAt = 0;
  for (const r of rows) {
    for (const b of r.items) { const dx = b.x - r.w / 2, dz = zAt + r.d / 2; for (const v of b.vs) { v.flat[0] = Math.round(v.flat[0] + dx); v.flat[2] = Math.round(v.flat[2] + dz); } }
    zAt += r.d + 1;
  }
  // center the final and flat poses (y from 0 up)
  const center = (get) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of S.v) { const p = get(v); if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const v of S.v) { const p = get(v); if (p) { p[0] -= cx; p[1] -= y0; p[2] -= cz; } }
  };
  center((v) => v.f);
  const fl = forged.map((v) => v.flat);
  { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity; for (const p of fl) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); y0 = Math.min(y0, p[1]); } for (const p of fl) { p[0] -= (x0 + x1) / 2; p[2] -= (z0 + z1) / 2; p[1] -= y0; } }
  // order: along the flat blank, left to right (the bar draws out from its left end)
  forged.sort((a, b) => a.flat[0] - b.flat[0] || a.flat[2] - b.flat[2] || a.flat[1] - b.flat[1]);
  const N = forged.length;
  forged.forEach((v, i) => { v.t = N > 1 ? i / (N - 1) : 0; });
  // the bar: the same voxels packed into a stubby bar, slices left to right
  const bw = Math.max(3, Math.round(Math.cbrt(N / 3.2))), bh = Math.max(2, Math.round(bw * 0.7));
  const bl = Math.ceil(N / (bw * bh));
  forged.forEach((v, i) => {
    const sl = Math.floor(i / (bw * bh)), r = i % (bw * bh);
    v.bar = [sl - (bl - 1) / 2, Math.floor(r / bw), (r % bw) - (bw - 1) / 2];
  });
  return { forged, late: lateV, N, bar: [bl, bh, bw] };
}

// ---------------------------------------------------------------- the view
const unit = new THREE.BoxGeometry(VX, VX, VX);
unit.userData.shared = true;
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * The part on the tongs: setProgress(p) (0 bar → 1 finished), update(dt, T, time), squash(k),
 * dent(localPoint, k), crack(localPoint), setDone(on) (the late voxels), spotLocal(out, p),
 * gripLocal(out), extent (half sizes over all poses), dispose().
 */
export class PartView {
  constructor(id) {
    this.id = id;
    const def = build(id);
    this.def = def;
    this.metal = METALS[pieceOf(id)?.metal] ? pieceOf(id).metal : 'iron';
    const base = METALS[this.metal].color;
    this.base = mixHex(base, 0x2e2826, 0.25);
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    // burning-hot metal (hotMetal.js): the glow per voxel cell, crawling, with scale, cooler where
    // the tongs hold it; the per-voxel tint (hammer tones, cracks) scales its glow too
    this.hm = makeHotMetal({ mode: 'part', base: this.base, cell: VX, scale: 0.28, gain: 1 });
    const mat = this.hm.material;
    this.mat = mat;
    const N = def.N;
    this.mesh = new THREE.InstancedMesh(unit, mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(1);
    this.tint = new Float32Array(N);
    def.forged.forEach((v, i) => {
      const j = 0.74 + hash(v.f[0], v.f[1], v.f[2]) * 0.3 + (v.f[1] % 2 ? 0 : 0.04);
      const c = v.tone === 1 ? 0.5 : v.tone === 2 ? 1.25 : j;
      this.tint[i] = c;
      this.mesh.setColorAt(i, _c.setRGB(c, c * (v.tone === 2 ? 1.02 : 1), c));
    });
    this.inner.add(this.mesh);
    this.lateN = def.late.length;
    if (this.lateN) {
      this.lateMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.lateMesh = new THREE.InstancedMesh(unit, this.lateMat, this.lateN);
      this.lateMesh.frustumCulled = false;
      this.lateMesh.layers.enable(1);
      def.late.forEach((v, i) => { this.lateMesh.setColorAt(i, _c.setHex(v.late.color)); });
      this.inner.add(this.lateMesh);
      this.lateK = 0;
      this.lateWant = 0;
      this.lateMesh.visible = false;
    }
    // a heat haze round the hot metal and a ring where the next blow lands
    this.halo = makeGlow({ color: 0xff8a30, size: 1, intensity: 0, falloff: 1.6, levels: 6, renderOrder: 18 });
    this.group.add(this.halo);
    const ring = new THREE.Mesh(markerGeo(), new THREE.MeshBasicMaterial({ color: 0xffd34a, vertexColors: true, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    ring.renderOrder = 30;
    ring.visible = false;
    this.marker = ring;
    this.group.add(ring);
    // extents over every pose (for framing the anvil view)
    let ex = 0, ez = 0, ey = 0;
    for (const v of def.forged) for (const p of [v.bar, v.flat, v.f]) { ex = Math.max(ex, Math.abs(p[0])); ez = Math.max(ez, Math.abs(p[2])); ey = Math.max(ey, p[1]); }
    this.extent = { x: (ex + 1) * VX, z: (ez + 1) * VX, y: (ey + 1) * VX };
    this.finalH = Math.max(...def.forged.map((v) => v.f[1]), ...def.late.map((v) => v.f[1])) * VX;
    this.target = 0;
    this.p = 0;
    this.sq = 0;
    this.dents = [];
    this.pos = new Float32Array(N * 3);
    this.T = 20;
    this.update(0, 20, 0);
  }

  setProgress(p) { this.target = clamp01(p); }
  /** Snap the shape (no tween). */
  snap(p) { this.target = this.p = clamp01(p); }
  squash(k = 1) { this.sq = Math.max(this.sq, Math.min(1, k)); }
  dent(local, k = 1) { this.dents.push({ x: local.x / VX, y: local.y / VX, z: local.z / VX, k, t: 0 }); }
  /** A crack near a local point: a few dark voxels for good. */
  crack(local) {
    const d = this.def, px = local.x / VX, pz = local.z / VX;
    let best = [];
    d.forged.forEach((v, i) => { const q = this.cur(i); const dd = Math.hypot(q[0] - px, q[2] - pz); if (dd < 3.2) best.push([dd + hash(i, 3) * 2, i]); });
    best.sort((a, b) => a[0] - b[0]);
    for (const [, i] of best.slice(0, 5)) { this.tint[i] = 0.22; this.mesh.setColorAt(i, _c.setRGB(0.18, 0.14, 0.13)); }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  setDone(on) { this.lateWant = on ? 1 : 0; }

  /** Current local position (voxel units) of forged voxel i. */
  cur(i) { return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]; }

  /** Morph weights of a voxel at progress p: [kA (bar → flat), kB (flat → final)]. */
  weights(v, p) {
    const qa = clamp01(p / 0.45), qb = clamp01((p - 0.45) / 0.55);
    const sa = 0.4, sb = 0.45;
    return [smooth((qa - sa * v.t) / (1 - sa)), smooth((qb - sb * v.t) / (1 - sb))];
  }

  update(dt, T, time) {
    this.T = T;
    this.p += (this.target - this.p) * Math.min(1, dt * 12);
    if (Math.abs(this.target - this.p) < 1e-4) this.p = this.target;
    this.sq = Math.max(0, this.sq - dt * 5);
    for (const dn of this.dents) dn.t += dt;
    this.dents = this.dents.filter((dn) => dn.t < 0.3);
    const d = this.def, arr = this.mesh.instanceMatrix.array;
    for (let i = 0; i < d.N; i++) {
      const v = d.forged[i];
      const [ka, kb] = this.weights(v, this.p);
      let x, y, z;
      if (kb <= 0) {
        x = v.bar[0] + (v.flat[0] - v.bar[0]) * ka; y = v.bar[1] + (v.flat[1] - v.bar[1]) * ka; z = v.bar[2] + (v.flat[2] - v.bar[2]) * ka;
        if (ka > 0 && ka < 1) y += Math.sin(ka * Math.PI) * 1.2;
      } else {
        // a bezier through (flat.x, final.y, flat.z): raised sheets fold up round their hinge
        const u = 1 - kb, a = v.flat, f = v.f;
        x = u * u * a[0] + 2 * u * kb * a[0] + kb * kb * f[0];
        y = u * u * a[1] + 2 * u * kb * f[1] + kb * kb * f[1];
        z = u * u * a[2] + 2 * u * kb * a[2] + kb * kb * f[2];
      }
      for (const dn of this.dents) {
        const dd = Math.hypot(x - dn.x, z - dn.z);
        if (dd < 4) y -= (1 - dd / 4) * dn.k * Math.sin(Math.min(1, dn.t / 0.3) * Math.PI) * 0.9;
      }
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const moving = (ka > 0.02 && ka < 0.98) || (kb > 0.02 && kb < 0.98);
      const s = moving ? 1.14 : 1.02;
      const o = i * 16;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      arr[o + 12] = x * VX; arr[o + 13] = (y + 0.5) * VX; arr[o + 14] = z * VX; arr[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // squash on a blow
    const sq = this.sq;
    this.inner.scale.set(1 + sq * 0.05, 1 - sq * 0.22, 1 + sq * 0.05);
    // late voxels pop in when the part is done
    if (this.lateMesh) {
      this.lateK += (this.lateWant - this.lateK) * Math.min(1, dt * 6);
      const k = this.lateK;
      this.lateMesh.visible = k > 0.02;
      if (this.lateMesh.visible) {
        const la = this.lateMesh.instanceMatrix.array;
        d.late.forEach((v, i) => {
          const s = Math.max(0, Math.min(1, k * 1.6 - (v.f[1] / 20) * 0.6));
          const o = i * 16;
          la[o] = s; la[o + 5] = s; la[o + 10] = s; la[o + 15] = 1;
          la[o + 1] = la[o + 2] = la[o + 3] = la[o + 4] = la[o + 6] = la[o + 7] = la[o + 8] = la[o + 9] = la[o + 11] = 0;
          la[o + 12] = v.f[0] * VX; la[o + 13] = (v.f[1] + 0.5) * VX; la[o + 14] = v.f[2] * VX;
        });
        this.lateMesh.instanceMatrix.needsUpdate = true;
        if (this.lateMat) this.lateMat.color.setScalar(0.9 + 0.12 * Math.sin(time * 9));
      }
    }
    // heat: dark forge scale, the glow and its haze (the end in the tongs stays cooler)
    this.hm.setT(T);
    this.hm.u.uHeld.value.set(-this.extent.x + VX, this.extent.x * 0.8, 260, 1);
    this.hm.update(time);
    const g = glowAmount(T);
    const hu = this.halo.userData.glow;
    hu.uIntensity.value = Math.min(0.32, g * 0.24) * (0.92 + Math.sin(time * 7.3) * 0.08);
    if (g > 0) hu.uColor.value.setHex(glowHex(T));
    const span = Math.max(this.extent.x, this.extent.z) * (0.6 + 0.4 * (1 - Math.abs(this.p - 0.45)));
    hu.uSize.value.setScalar(0.1 + span * 1.4);
    this.halo.position.set(0, 0.02, 0);
    this.halo.visible = g > 0.02;
    if (this.marker.visible) {
      this.marker.material.opacity = 0.55 + 0.35 * Math.sin(time * 10);
      this.marker.scale.setScalar(1 + 0.15 * Math.sin(time * 10));
    }
  }

  /** The top of the metal where the next blow (taking the shape from p to p2) lands (local). */
  spotLocal(out, p, p2) {
    const d = this.def;
    let sx = 0, sz = 0, sy = 0, n = 0;
    for (let i = 0; i < d.N; i++) {
      const v = d.forged[i];
      const w0 = this.weights(v, p), w1 = this.weights(v, p2);
      const ch = Math.abs(w1[0] - w0[0]) + Math.abs(w1[1] - w0[1]);
      if (ch < 0.04) continue;
      const q = this.cur(i);
      sx += q[0] * ch; sz += q[2] * ch; n += ch;
      sy = Math.max(sy, q[1]);
    }
    if (n <= 0) {
      // nothing left to move: the middle of the piece
      for (let i = 0; i < d.N; i += 3) { const q = this.cur(i); sx += q[0]; sz += q[2]; sy = Math.max(sy, q[1]); n++; }
    }
    const x = sx / n, z = sz / n;
    // the highest metal right under that point
    let top = 0;
    for (let i = 0; i < d.N; i++) { const q = this.cur(i); if (Math.abs(q[0] - x) < 1.6 && Math.abs(q[2] - z) < 1.6) top = Math.max(top, q[1]); }
    return out.set(x * VX, (top + 1) * VX, z * VX);
  }

  /** Where the tongs bite: the left end of the work (local). */
  gripLocal(out = new THREE.Vector3()) {
    const d = this.def;
    let best = 0, bx = Infinity;
    for (let i = 0; i < Math.min(d.N, 60); i++) { const q = this.cur(i); if (q[0] < bx) { bx = q[0]; best = i; } }
    const q = this.cur(best);
    return out.set((q[0] - 0.5) * VX, (q[1] + 0.8) * VX, q[2] * VX);
  }

  showMarker(local) {
    if (!local) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.copy(local).setY(local.y + VX * 0.2);
  }

  dispose() {
    this.hm.dispose();
    this.mesh.dispose();
    if (this.lateMesh) { this.lateMesh.dispose(); this.lateMat.dispose(); }
    this.halo.material.dispose();
    this.marker.geometry.dispose(); this.marker.material.dispose();
  }
}


/** Voxel counts per part (tests). */
export function partStats(id) { const d = build(id); return { N: d.N, late: d.late.length, bar: d.bar }; }
