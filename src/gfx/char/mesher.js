// A fast greedy voxel mesher for the character parts. Output-compatible with
// gfx/Voxel.js meshGridGreedy (same faces, corner order, AO curve, baked face shading and
// diagonal flip), but works on a padded occupancy grid inside the filled bounds, writes
// straight into typed arrays and converts colors through an sRGB→linear lookup table.
import * as THREE from 'three';

// face definitions (same as Voxel.js): normal, 4 corner offsets, baked shade
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.93 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];
// characters use a slightly softer occlusion than the world so curved fur reads smooth
const AO_CURVE = [1.0, 0.86, 0.75, 0.64];

const LIN = new Float32Array(256);
const SRGB = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB[i] = c;
  LIN[i] = c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

// channels at or below this are "very dark" (about 15% lightness)
const dark = new Uint8Array(256);
for (let i = 0; i < 256; i++) dark[i] = i <= 60 ? 1 : 0;

let P = new Float32Array(1 << 15), N = new Float32Array(1 << 15), C = new Float32Array(1 << 15), I = new Uint32Array(1 << 14);
function grow(nv, ni) {
  if (nv * 3 > P.length) {
    const sz = Math.max(nv * 3, P.length * 2);
    const p2 = new Float32Array(sz); p2.set(P); P = p2;
    const n2 = new Float32Array(sz); n2.set(N); N = n2;
    const c2 = new Float32Array(sz); c2.set(C); C = c2;
  }
  if (ni > I.length) { const i2 = new Uint32Array(Math.max(ni, I.length * 2)); i2.set(I); I = i2; }
}

/**
 * Mesh a VoxelGrid-like {w, h, d, data} (data: Uint32Array, filled = non-zero, color = low 24 bits).
 * pivot: grid coordinates that become the origin. bake: multiply in the per-face shade.
 */
export function greedyMesh(grid, pivot = [0, 0, 0], bake = false) {
  const W = grid.w, H = grid.h, D = grid.d, data = grid.data;
  const PW = W + 2, PH = H + 2, PWH = PW * PH;
  const occ = new Uint8Array(PWH * (D + 2));
  let x0 = W, y0 = H, z0 = D, x1 = -1, y1 = -1, z1 = -1;
  for (let z = 0, i = 0; z < D; z++)
    for (let y = 0; y < H; y++) {
      let p = 1 + (y + 1) * PW + (z + 1) * PWH;
      for (let x = 0; x < W; x++, i++, p++) {
        if (data[i] === 0) continue;
        occ[p] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
    }
  const geo = new THREE.BufferGeometry();
  if (x1 < 0) {
    geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    geo.setIndex([]);
    return geo;
  }
  const lut = THREE.ColorManagement.enabled ? LIN : SRGB;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  const strideP = [1, PW, PWH]; // padded strides per axis
  const strideD = [1, W, W * H]; // data strides per axis
  const [px, py, pz] = pivot;
  let nv = 0, ni = 0;
  const cnr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const ao = [0, 0, 0, 0];

  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi];
    const d = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const u = d === 0 ? 1 : 0, v = d === 2 ? 1 : 2;
    const t0 = d === 0 ? 1 : 0, t1 = d === 2 ? 1 : 2; // tangent axes in ascending order (same as u, v)
    const sgn = f.n[d];
    const nOff = sgn * strideP[d];
    // per-corner neighbour offsets (relative to the voxel just outside the face)
    const e1 = [0, 0, 0, 0], e2 = [0, 0, 0, 0], ec = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const cr = f.c[k];
      const s0 = cr[t0] ? 1 : -1, s1 = cr[t1] ? 1 : -1;
      e1[k] = s0 * strideP[t0];
      e2[k] = s1 * strideP[t1];
      ec[k] = e1[k] + e2[k];
    }
    const shade = bake ? f.shade : 1;
    const nx = f.n[0], ny = f.n[1], nz = f.n[2];
    const ua = lo[u], ub = hi[u], va = lo[v], vb = hi[v];
    const U = ub - ua + 1, V = vb - va + 1;
    const mask = new Int32Array(U * V);
    const coord = [0, 0, 0];
    const sDu = strideD[u], sPu = strideP[u];
    for (let sl = lo[d]; sl <= hi[d]; sl++) {
      let any = false;
      for (let b = 0; b < V; b++) {
        let di = sl * strideD[d] + ua * sDu + (va + b) * strideD[v];
        let p = (sl + 1) * strideP[d] + (ua + 1) * sPu + (va + b + 1) * strideP[v];
        let mi = b * U;
        for (let a = 0; a < U; a++, di += sDu, p += sPu, mi++) {
          const raw = data[di];
          if (raw === 0) { mask[mi] = 0; continue; }
          const o = p + nOff;
          if (occ[o]) { mask[mi] = 0; continue; }
          for (let k = 0; k < 4; k++) {
            const a1 = occ[o + e1[k]], a2 = occ[o + e2[k]];
            ao[k] = a1 && a2 ? 3 : a1 + a2 + occ[o + ec[k]];
          }
          const c = raw & 0xffffff;
          if (ao[0] === ao[1] && ao[1] === ao[2] && ao[2] === ao[3]) { mask[mi] = c * 4 + ao[0] + 1; any = true; continue; }
          // on very dark colors an AO gradient is invisible: merge at the mean level
          if (dark[c & 0xff] && dark[(c >> 8) & 0xff] && dark[(c >> 16) & 0xff]) {
            mask[mi] = c * 4 + Math.round((ao[0] + ao[1] + ao[2] + ao[3]) / 4) + 1; any = true; continue;
          }
          mask[mi] = 0;
          // emit a single face with its AO gradient
          coord[d] = sl; coord[u] = ua + a; coord[v] = va + b;
          for (let k = 0; k < 4; k++) {
            const cr = f.c[k];
            cnr[k * 3] = coord[0] + cr[0]; cnr[k * 3 + 1] = coord[1] + cr[1]; cnr[k * 3 + 2] = coord[2] + cr[2];
          }
          grow(nv + 4, ni + 6);
          emitQuad(nv, ni, cnr, c, ao[0], ao[1], ao[2], ao[3], nx, ny, nz, shade, lut, px, py, pz);
          nv += 4; ni += 6;
        }
      }
      if (!any) continue;
      // merge flat faces into rectangles
      for (let b = 0; b < V; b++) {
        for (let a = 0; a < U;) {
          const key = mask[a + b * U];
          if (!key) { a++; continue; }
          let w = 1;
          while (a + w < U && mask[a + w + b * U] === key) w++;
          let h = 1;
          outer: while (b + h < V) {
            const row = (b + h) * U;
            for (let k = 0; k < w; k++) if (mask[a + k + row] !== key) break outer;
            h++;
          }
          for (let hh = 0; hh < h; hh++) mask.fill(0, a + (b + hh) * U, a + w + (b + hh) * U);
          const lv = (key - 1) & 3;
          const col = Math.floor((key - 1) / 4);
          for (let k = 0; k < 4; k++) {
            const cr = f.c[k];
            coord[d] = sl + cr[d];
            coord[u] = ua + (cr[u] ? a + w : a);
            coord[v] = va + (cr[v] ? b + h : b);
            cnr[k * 3] = coord[0]; cnr[k * 3 + 1] = coord[1]; cnr[k * 3 + 2] = coord[2];
          }
          grow(nv + 4, ni + 6);
          emitQuad(nv, ni, cnr, col, lv, lv, lv, lv, nx, ny, nz, shade, lut, px, py, pz);
          nv += 4; ni += 6;
          a += w;
        }
      }
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(P.slice(0, nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N.slice(0, nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C.slice(0, nv * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(nv > 65535 ? I.slice(0, ni) : Uint16Array.from(I.subarray(0, ni)), 1));
  // bounds from the filled box (cheap and exact enough for culling)
  const min = new THREE.Vector3(x0 - px, y0 - py, z0 - pz), max = new THREE.Vector3(x1 + 1 - px, y1 + 1 - py, z1 + 1 - pz);
  geo.boundingBox = new THREE.Box3(min, max);
  geo.boundingSphere = new THREE.Sphere(min.clone().add(max).multiplyScalar(0.5), min.distanceTo(max) / 2);
  return geo;
}

function emitQuad(nv, ni, cnr, col, a0, a1, a2, a3, nx, ny, nz, shade, lut, px, py, pz) {
  const r = lut[(col >> 16) & 255], g = lut[(col >> 8) & 255], b = lut[col & 255];
  const A0 = AO_CURVE[a0], A1 = AO_CURVE[a1], A2 = AO_CURVE[a2], A3 = AO_CURVE[a3];
  let o = nv * 3;
  for (let k = 0; k < 4; k++, o += 3) {
    P[o] = cnr[k * 3] - px; P[o + 1] = cnr[k * 3 + 1] - py; P[o + 2] = cnr[k * 3 + 2] - pz;
    N[o] = nx; N[o + 1] = ny; N[o + 2] = nz;
    const a = (k === 0 ? A0 : k === 1 ? A1 : k === 2 ? A2 : A3) * shade;
    C[o] = r * a; C[o + 1] = g * a; C[o + 2] = b * a;
  }
  if (A0 + A2 < A1 + A3) { I[ni] = nv + 1; I[ni + 1] = nv + 2; I[ni + 2] = nv + 3; I[ni + 3] = nv + 1; I[ni + 4] = nv + 3; I[ni + 5] = nv; }
  else { I[ni] = nv; I[ni + 1] = nv + 1; I[ni + 2] = nv + 2; I[ni + 3] = nv; I[ni + 4] = nv + 2; I[ni + 5] = nv + 3; }
}
