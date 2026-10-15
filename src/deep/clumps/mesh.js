// Fast mesher for clump grids: one quad per open cell face with baked AO, a mild per-axis shade and
// per-cell colour jitter. Crust + rock and the ore go into separate buffers (the ore gets its own,
// slightly glowing material). Typed arrays are reused between remeshes, so chipping a ~32³ clump
// re-meshes the whole thing in well under a millisecond or two.
import { ORE, P_SCRATCH, P_GOUGE } from './grid.js';
import { h3 } from '../noise.js';

// normal, 4 corners (CCW from outside), shade — same layout as gfx/Voxel.js
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.9 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.86 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.74 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.95 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.82 },
];
const AO = [1.0, 0.78, 0.63, 0.5];

function makeBuf() { return { cap: 0, pos: null, nor: null, col: null, idx: null, nv: 0, ni: 0 }; }
function grow(b, faces) {
  const cap = Math.max(256, Math.ceil(faces * 1.5));
  const pos = new Float32Array(cap * 12), nor = new Float32Array(cap * 12), col = new Float32Array(cap * 12), idx = new Uint32Array(cap * 6);
  if (b.pos) { pos.set(b.pos.subarray(0, b.nv * 3)); nor.set(b.nor.subarray(0, b.nv * 3)); col.set(b.col.subarray(0, b.nv * 3)); idx.set(b.idx.subarray(0, b.ni)); }
  Object.assign(b, { cap, pos, nor, col, idx });
  b.grown = true;
}

export class ClumpMesher {
  constructor() {
    this.P = 0;
    this.occ = null;
    this.rock = makeBuf();
    this.ore = makeBuf();
    this.shell = makeBuf();
    this.tables = null;
  }

  /**
   * The ore's whole outer surface (faces against rock and crust too), flat-coloured: what the x-ray
   * lamp shows through the clump. Fills and returns this.shell.
   */
  buildShell(g, pal) {
    const n = g.n, K = g.kind, C = g.col, b = this.shell, [px, py, pz] = g.pivot || [n / 2, n / 2, n / 2];
    b.nv = 0; b.ni = 0; b.grown = false;
    const ore = g.ore || [];
    for (let j = 0; j < ore.length; j++) {
      const i = ore[j];
      const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
      const ci = C[i] * 3;
      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi];
        const X = x + f.n[0], Y = y + f.n[1], Z = z + f.n[2];
        if (X >= 0 && Y >= 0 && Z >= 0 && X < n && Y < n && Z < n && K[X + n * (Y + n * Z)] === ORE) continue;
        if (b.nv + 4 > b.cap * 4) grow(b, b.cap + 64);
        const v0 = b.nv;
        let p3 = v0 * 3;
        for (let q = 0; q < 4; q++, p3 += 3) {
          const cr = f.c[q];
          b.pos[p3] = x + cr[0] - px; b.pos[p3 + 1] = y + cr[1] - py; b.pos[p3 + 2] = z + cr[2] - pz;
          b.nor[p3] = f.n[0]; b.nor[p3 + 1] = f.n[1]; b.nor[p3 + 2] = f.n[2];
          b.col[p3] = pal[ci] * f.shade; b.col[p3 + 1] = pal[ci + 1] * f.shade; b.col[p3 + 2] = pal[ci + 2] * f.shade;
        }
        b.nv += 4;
        const I = b.idx;
        I[b.ni++] = v0; I[b.ni++] = v0 + 1; I[b.ni++] = v0 + 2; I[b.ni++] = v0; I[b.ni++] = v0 + 2; I[b.ni++] = v0 + 3;
      }
    }
    return b;
  }

  _tables(P) {
    // per face: neighbour offset, and per corner the [side1, side2, corner] offsets (padded grid)
    const S = [1, P, P * P];
    return FACES.map((f) => {
      const ax = f.n[0] ? 0 : f.n[1] ? 1 : 2;
      const tg = [0, 1, 2].filter((k) => k !== ax);
      const on = f.n[0] * S[0] + f.n[1] * S[1] + f.n[2] * S[2];
      const corners = f.c.map((cr) => {
        const s0 = cr[tg[0]] ? 1 : -1, s1 = cr[tg[1]] ? 1 : -1;
        const a = on + s0 * S[tg[0]], b = on + s1 * S[tg[1]];
        return [a, b, on + s0 * S[tg[0]] + s1 * S[tg[1]]];
      });
      return { on, corners, f };
    });
  }

  /**
   * g: ClumpGrid; pal: Float32Array of linear rgb per palette index. Fills this.rock / this.ore
   * ({pos, nor, col, idx, nv, ni}); positions are in cells, centred on the grid middle.
   */
  build(g, pal) {
    const n = g.n, P = n + 2;
    if (this.P !== P) { this.P = P; this.occ = new Uint8Array(P * P * P); this.tables = this._tables(P); }
    const occ = this.occ, K = g.kind, C = g.col, D = g.dmg;
    occ.fill(0);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) {
      let i = n * (y + n * z), pi = 1 + P * (y + 1 + P * (z + 1));
      for (let x = 0; x < n; x++, i++, pi++) if (K[i]) occ[pi] = 1;
    }
    const T = this.tables, [px, py, pz] = g.pivot || [n / 2, n / 2, n / 2];
    const bufs = [this.rock, this.ore];
    for (const b of bufs) { b.nv = 0; b.ni = 0; b.grown = false; }
    const lv = [0, 0, 0, 0];
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = x + n * (y + n * z);
      const k = K[i];
      if (!k) continue;
      const pi = (x + 1) + P * ((y + 1) + P * (z + 1));
      // quick reject: fully buried
      if (occ[pi + 1] && occ[pi - 1] && occ[pi + P] && occ[pi - P] && occ[pi + P * P] && occ[pi - P * P]) continue;
      const b = k === ORE ? this.ore : this.rock;
      const ci = C[i] * 3;
      const jit = 0.94 + h3(x, y, z, 3) * 0.1;
      let r = pal[ci] * jit, gg = pal[ci + 1] * jit, bb = pal[ci + 2] * jit;
      const dm = D[i];
      if (dm) {
        // scratched ore: pale scuffs, with dark gouges here and there
        const gouge = h3(x, y, z, 17) > 0.62;
        const si = (gouge ? P_GOUGE : P_SCRATCH) * 3, t = Math.min(0.85, dm * (gouge ? 0.3 : 0.26));
        r += (pal[si] - r) * t; gg += (pal[si + 1] - gg) * t; bb += (pal[si + 2] - bb) * t;
      }
      for (let fi = 0; fi < 6; fi++) {
        const tf = T[fi];
        if (occ[pi + tf.on]) continue;
        if (b.nv + 4 > b.cap * 4) grow(b, b.cap + 64);
        const cs = tf.corners;
        for (let q = 0; q < 4; q++) {
          const o = cs[q];
          const s1 = occ[pi + o[0]], s2 = occ[pi + o[1]];
          lv[q] = s1 && s2 ? 3 : s1 + s2 + occ[pi + o[2]];
        }
        const f = tf.f, sh = f.shade;
        const v0 = b.nv;
        let p3 = v0 * 3;
        for (let q = 0; q < 4; q++, p3 += 3) {
          const cr = f.c[q];
          b.pos[p3] = x + cr[0] - px; b.pos[p3 + 1] = y + cr[1] - py; b.pos[p3 + 2] = z + cr[2] - pz;
          b.nor[p3] = f.n[0]; b.nor[p3 + 1] = f.n[1]; b.nor[p3 + 2] = f.n[2];
          const a = AO[lv[q]] * sh;
          b.col[p3] = r * a; b.col[p3 + 1] = gg * a; b.col[p3 + 2] = bb * a;
        }
        b.nv += 4;
        const I = b.idx;
        let ii = b.ni;
        if (AO[lv[0]] + AO[lv[2]] < AO[lv[1]] + AO[lv[3]]) { I[ii++] = v0 + 1; I[ii++] = v0 + 2; I[ii++] = v0 + 3; I[ii++] = v0 + 1; I[ii++] = v0 + 3; I[ii++] = v0; }
        else { I[ii++] = v0; I[ii++] = v0 + 1; I[ii++] = v0 + 2; I[ii++] = v0; I[ii++] = v0 + 2; I[ii++] = v0 + 3; }
        b.ni = ii;
      }
    }
    return bufs;
  }
}
