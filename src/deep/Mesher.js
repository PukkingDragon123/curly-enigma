// Greedy chunk mesher with per-vertex ambient occlusion. Faces merge when material and all four
// corner AO values match; per-voxel color variation happens in the shader (by world position), so
// big flat walls stay a handful of quads. Solid faces and fluid surfaces come out separately.
import * as THREE from 'three';
import { CS } from './Generator.js';
import { MAT } from './materials.js';

const P = CS + 2; // padded size
const OPAQUE = new Uint8Array(256);
const FLUID = new Uint8Array(256);
for (let m = 1; m < 256; m++) {
  if (!MAT[m]) { OPAQUE[m] = 1; continue; }
  if (MAT[m].fluid) FLUID[m] = MAT[m].fluid; else OPAQUE[m] = 1;
}
export { OPAQUE, FLUID };

const ao = (x, y, z) => (x && y ? 0 : 3 - x - y - z);

// face directions: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// for each face: the axis it faces (d) and the two in-plane axes (u, v), chosen so (u, v, n) is right-handed
const AX = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]];

class Out {
  constructor(cap = 4096) { this.pos = new Uint8Array(cap * 12); this.dat = new Uint8Array(cap * 16); this.n = 0; this.cap = cap; }
  reset() { this.n = 0; }
  grow() {
    const p = new Uint8Array(this.cap * 24), d = new Uint8Array(this.cap * 32);
    p.set(this.pos); d.set(this.dat);
    this.pos = p; this.dat = d; this.cap *= 2;
  }
}
const solidOut = new Out(), fluidOut = new Out();
const pad = new Uint8Array(P * P * P);
const mask = new Int32Array(CS * CS);

/**
 * world.voxelAt(x, y, z) is used for the 1-voxel apron (outside chunks count as solid if not loaded).
 * Returns { solid: BufferGeometry|null, fluid: BufferGeometry|null }.
 */
export function meshChunk(world, ch) {
  const X0 = ch.cx * CS, Y0 = ch.cy * CS, Z0 = ch.cz * CS;
  const v = ch.vox;
  // fill the padded copy
  for (let z = 0; z < P; z++) for (let y = 0; y < P; y++) {
    const inYZ = y > 0 && y < P - 1 && z > 0 && z < P - 1;
    const row = (y + P * z) * P;
    if (inYZ) {
      const src = (y - 1) * CS + (z - 1) * CS * CS;
      pad.set(v.subarray(src, src + CS), row + 1);
      pad[row] = world.voxelAt(X0 - 1, Y0 + y - 1, Z0 + z - 1);
      pad[row + P - 1] = world.voxelAt(X0 + CS, Y0 + y - 1, Z0 + z - 1);
    } else {
      for (let x = 0; x < P; x++) pad[row + x] = world.voxelAt(X0 + x - 1, Y0 + y - 1, Z0 + z - 1);
    }
  }
  solidOut.reset(); fluidOut.reset();
  const stride = [1, P, P * P];
  for (let f = 0; f < 6; f++) {
    const [d, u, w] = AX[f];
    const nd = DIRS[f][d];
    const sd = stride[d], su = stride[u], sw = stride[w];
    for (let s = 0; s < CS; s++) {
      // build the mask for slice s
      let any = false;
      const base = (s + 1) * sd + su + sw;
      for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
        const a = base + i * su + j * sw;
        const ma = pad[a];
        const b = a + nd * sd;
        const mb = pad[b];
        let key = 0;
        if (ma && OPAQUE[ma] && !OPAQUE[mb]) {
          // corner AO from the layer in front of the face
          const s1 = OPAQUE[pad[b - su]], s2 = OPAQUE[pad[b + su]], t1 = OPAQUE[pad[b - sw]], t2 = OPAQUE[pad[b + sw]];
          const c00 = OPAQUE[pad[b - su - sw]], c10 = OPAQUE[pad[b + su - sw]], c01 = OPAQUE[pad[b - su + sw]], c11 = OPAQUE[pad[b + su + sw]];
          const a00 = ao(s1, t1, c00), a10 = ao(s2, t1, c10), a01 = ao(s1, t2, c01), a11 = ao(s2, t2, c11);
          key = ma | (a00 << 8) | (a10 << 10) | (a01 << 12) | (a11 << 14) | (1 << 16);
        } else if (ma && FLUID[ma] && !mb) {
          key = ma | (255 << 8) | (2 << 16); // fluid surface facing air
        }
        mask[i + j * CS] = key;
        if (key) any = true;
      }
      if (!any) continue;
      // greedy merge
      for (let j = 0; j < CS; j++) for (let i = 0; i < CS;) {
        const key = mask[i + j * CS];
        if (!key) { i++; continue; }
        let wdt = 1;
        while (i + wdt < CS && mask[i + wdt + j * CS] === key) wdt++;
        let hgt = 1;
        outer: while (j + hgt < CS) {
          for (let k = 0; k < wdt; k++) if (mask[i + k + (j + hgt) * CS] !== key) break outer;
          hgt++;
        }
        for (let jj = 0; jj < hgt; jj++) for (let k = 0; k < wdt; k++) mask[i + k + (j + jj) * CS] = 0;
        emit(key >> 16 === 2 ? fluidOut : solidOut, f, d, u, w, nd, s, i, j, wdt, hgt, key);
        i += wdt;
      }
    }
  }
  return { solid: toGeometry(solidOut), fluid: toGeometry(fluidOut) };
}

function emit(out, f, d, u, w, nd, s, i, j, wdt, hgt, key) {
  if (out.n + 1 > out.cap) out.grow();
  const q = out.n++;
  const plane = nd > 0 ? s + 1 : s;
  const fluid = (key >> 16) === 2;
  for (let c = 0; c < 4; c++) {
    const cu = c === 1 || c === 2 ? i + wdt : i, cw = c >= 2 ? j + hgt : j;
    const aoc = c === 0 ? (key >> 8) & 3 : c === 1 ? (key >> 10) & 3 : c === 2 ? (key >> 14) & 3 : (key >> 12) & 3;
    const o = (q * 4 + c) * 3;
    out.pos[o + d] = plane; out.pos[o + u] = cu; out.pos[o + w] = cw;
    const od = (q * 4 + c) * 4;
    out.dat[od] = f;
    out.dat[od + 1] = key & 255;
    out.dat[od + 2] = fluid ? 3 : aoc;
    // flip the quad diagonal when AO is anisotropic (stored on every vertex of the quad)
    out.dat[od + 3] = !fluid && ((key >> 8) & 3) + ((key >> 14) & 3) < ((key >> 10) & 3) + ((key >> 12) & 3) ? 1 : 0;
  }
}

function toGeometry(out) {
  if (!out.n) return null;
  const nv = out.n * 4;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Uint8BufferAttribute(out.pos.slice(0, nv * 3), 3));
  g.setAttribute('vdata', new THREE.Uint8BufferAttribute(out.dat.slice(0, nv * 4), 4));
  const idx = nv > 65535 ? new Uint32Array(out.n * 6) : new Uint16Array(out.n * 6);
  // AX orders the in-plane axes so corners 0→1→2→3 wind outward; the flip bit picks the diagonal
  for (let q = 0; q < out.n; q++) {
    const v = q * 4, o = q * 6;
    if (out.dat[v * 4 + 3]) { idx[o] = v + 1; idx[o + 1] = v + 2; idx[o + 2] = v + 3; idx[o + 3] = v + 1; idx[o + 4] = v + 3; idx[o + 5] = v; }
    else { idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, CS / 2, CS / 2), CS * 0.87);
  return g;
}
