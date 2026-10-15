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
  fillPad(world, ch, pad);
  return { solid: rawToGeometry(meshSolidRaw(pad)), fluid: meshFluid(world, ch, X0, Y0, Z0) };
}

/** The chunk plus a one-voxel apron from its neighbours, into out (Uint8Array P³). */
export function fillPad(world, ch, out = new Uint8Array(P * P * P)) {
  const X0 = ch.cx * CS, Y0 = ch.cy * CS, Z0 = ch.cz * CS;
  const v = ch.vox, pad = out;
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
  return out;
}

/**
 * Greedy-mesh the solid faces of a padded chunk (pure: runs in a worker too).
 * Returns { pos: Uint8Array, dat: Uint8Array, idx: Uint16Array|Uint32Array } or null.
 */
export function meshSolidRaw(pad) {
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
  return toRaw(solidOut);
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

function toRaw(out) {
  if (!out.n) return null;
  const nv = out.n * 4;
  const idx = nv > 65535 ? new Uint32Array(out.n * 6) : new Uint16Array(out.n * 6);
  // AX orders the in-plane axes so corners 0→1→2→3 wind outward; the flip bit picks the diagonal
  for (let q = 0; q < out.n; q++) {
    const v = q * 4, o = q * 6;
    if (out.dat[v * 4 + 3]) { idx[o] = v + 1; idx[o + 1] = v + 2; idx[o + 2] = v + 3; idx[o + 3] = v + 1; idx[o + 4] = v + 3; idx[o + 5] = v; }
    else { idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
  }
  return { pos: out.pos.slice(0, nv * 3), dat: out.dat.slice(0, nv * 4), idx };
}

/** Raw mesh arrays → BufferGeometry (main thread). */
export function rawToGeometry(raw) {
  if (!raw) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Uint8BufferAttribute(raw.pos, 3));
  g.setAttribute('vdata', new THREE.Uint8BufferAttribute(raw.dat, 4));
  g.setIndex(new THREE.BufferAttribute(raw.idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, CS / 2, CS / 2), CS * 0.87);
  return g;
}

export { P as PAD };

// ------------------------------------------------------------------ fluids
// Fluid surfaces are meshed per voxel (not greedy) so the shader can bend them into waves and
// ripples. A column's top is a quad whose corners sit at the averaged level of the fluid columns
// sharing that corner, so flows slope smoothly down to thin films; sides appear only where fluid
// meets open air, undersides where it falls; falling water becomes stream columns. Partial levels
// come from world.fluidChunks (chunk key → Uint8Array of levels 1..8, 0 = untouched/full), kept by
// Fluids.js; without it every fluid voxel is full.
//   position: Float32 (voxels, chunk-local)
//   vdata: face (0..5), material, flags (1 surface vertex, 2 falling, 4 partial), shore foam (0..255)
//   fdata: column thickness (eighths of a voxel), flow x, flow z (128 = still), open-edge foam

/**
 * Rebuild only a chunk's fluid surface (for level changes inside existing fluid, which never
 * change the solid mesh). Returns a BufferGeometry or null.
 */
export function meshChunkFluid(world, ch) {
  const X0 = ch.cx * CS, Y0 = ch.cy * CS, Z0 = ch.cz * CS;
  const v = ch.vox;
  for (let z = 0; z < P; z++) for (let y = 0; y < P; y++) {
    const row = (y + P * z) * P;
    if (y > 0 && y < P - 1 && z > 0 && z < P - 1) {
      const src = (y - 1) * CS + (z - 1) * CS * CS;
      pad.set(v.subarray(src, src + CS), row + 1);
      pad[row] = vat(world, X0 - 1, Y0 + y - 1, Z0 + z - 1);
      pad[row + P - 1] = vat(world, X0 + CS, Y0 + y - 1, Z0 + z - 1);
    } else for (let x = 0; x < P; x++) pad[row + x] = vat(world, X0 + x - 1, Y0 + y - 1, Z0 + z - 1);
  }
  vch = null;
  return meshFluid(world, ch, X0, Y0, Z0);
}

// fluid cells of a chunk that may show a face (cells buried inside the chunk are skipped here,
// in a tight loop; the rest are checked against the padded block)
const flist = new Int32Array(CS * CS * CS);
function scanFluid(v, lv) {
  let n = 0;
  const S1 = CS, S2 = CS * CS, M1 = CS - 1;
  for (let i = 0; i < v.length; i++) {
    const m = v[i];
    if (!FLUID[m]) continue;
    const x = i & M1, y = (i >> CBITS) & M1, z = i >> (2 * CBITS);
    if (x > 0 && x < M1 && y > 0 && y < M1 && z > 0 && z < M1 && v[i - 1] && v[i + 1] && v[i - S1] && v[i - S2] && v[i + S2] && (v[i + S1] === m || (!lv && v[i + S1]))) continue;
    flist[n++] = i;
  }
  return n;
}

// world.voxelAt with the last chunk remembered (apron and depth reads walk the same neighbour)
let vch = null;
function vat(world, vx, vy, vz) {
  const cx = vx >> CBITS, cy = vy >> CBITS, cz = vz >> CBITS;
  if (!vch || vch.cx !== cx || vch.cy !== cy || vch.cz !== cz) {
    vch = world.chunk(cx, cy, cz);
    if (!vch || !vch.vox) { vch = null; return world.voxelAt(vx, vy, vz); } // missing or virtual
  }
  return vch.vox[(vx & CMK) + CS * ((vy & CMK) + CS * (vz & CMK))];
}

class FluidOut {
  constructor(cap) { this.n = 0; this.alloc(cap); }
  alloc(cap) {
    const p = new Float32Array(cap * 12), d = new Uint8Array(cap * 16), e = new Uint8Array(cap * 16);
    if (this.pos) { p.set(this.pos); d.set(this.dat); e.set(this.ext); }
    this.pos = p; this.dat = d; this.ext = e; this.cap = cap;
  }
}
const fOut = new FluidOut(2048);
const padL = new Uint8Array(P * P * P); // fluid levels of the padded block (8 = full)
// corners are shared by up to four columns: computed once per mesh (gen stamps the valid ones)
const cH = new Float32Array(P * P * P), cSh = new Uint8Array(P * P * P), cOp = new Uint8Array(P * P * P), cM = new Uint8Array(P * P * P), cGen = new Uint32Array(P * P * P);
let gen = 0;
const CBITS = Math.log2(CS), CMK = CS - 1;
const ckey = (cx, cy, cz) => ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512); // = World's key3
// scratch: per-corner tops (eighths), shore and open counts for the cell being meshed
const cT = new Float32Array(4), cS = new Uint8Array(4), cO = new Uint8Array(4);
let gS = 0, gO = 0;

function meshFluid(world, ch, X0, Y0, Z0) {
  const v = ch.vox;
  vch = null;
  // part-filled levels around this chunk, baked into the padded block
  const FC = world.fluidChunks;
  const nfl = scanFluid(v, !!(FC && FC.size));
  if (!nfl) return null;
  let LV = false;
  if (FC && FC.size) {
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = FC.get(ckey(ch.cx + dx, ch.cy + dy, ch.cz + dz));
      if (!a) continue;
      if (!LV) { padL.fill(8); LV = true; }
      // the part of that chunk inside the padded block (all of it, a face, an edge or a corner)
      const x0 = dx > 0 ? 0 : dx < 0 ? CMK : 0, x1 = dx < 0 ? CMK : dx > 0 ? 0 : CMK;
      const y0 = dy > 0 ? 0 : dy < 0 ? CMK : 0, y1 = dy < 0 ? CMK : dy > 0 ? 0 : CMK;
      const z0 = dz > 0 ? 0 : dz < 0 ? CMK : 0, z1 = dz < 0 ? CMK : dz > 0 ? 0 : CMK;
      for (let lz = z0; lz <= z1; lz++) for (let ly = y0; ly <= y1; ly++) {
        const src = CS * (ly + CS * lz), dst = P * (ly + dy * CS + 1 + P * (lz + dz * CS + 1)) + dx * CS + 1;
        for (let lx = x0; lx <= x1; lx++) { const l = a[src + lx]; if (l) padL[dst + lx] = l; }
      }
    }
  }
  const o = fOut;
  o.n = 0;
  const PP = P * P;
  // level (0..8) of the cell at padded index pi holding fluid m: full when fluid continues above
  // it (a column), otherwise its stored level
  const lvl = (pi, m) => (pad[pi + P] === m || !LV ? 8 : padL[pi]);
  // corner shared by cells (x-1|x, z-1|z) on row y: averaged level, plus shore/open counts
  gen++;
  const corner = (x, y, z, m) => {
    const ci = x + P * (z + P * y);
    if (cGen[ci] === gen && cM[ci] === m) { gS = cSh[ci]; gO = cOp[ci]; return cH[ci]; }
    const h = corner0(x, y, z, m);
    cGen[ci] = gen; cM[ci] = m; cH[ci] = h; cSh[ci] = gS; cOp[ci] = gO;
    return h;
  };
  const corner0 = (x, y, z, m) => {
    let sum = 0, n = 0, full = false;
    gS = 0; gO = 0;
    for (let k = 0; k < 4; k++) {
      const cx = x - 1 + (k & 1), cz = z - 1 + (k >> 1);
      const pi = cx + P * y + PP * cz;
      const c = pad[pi];
      if (c === m) {
        if (pad[pi + P] === m) full = true;
        sum += lvl(pi, m); n++;
      } else if (OPAQUE[c]) gS++;
      else if (!c) gO++;
    }
    return full ? 8 : n ? sum / n : 8;
  };
  for (let q = 0; q < nfl; q++) {
    const vi = flist[q];
    const m = v[vi];
    const x = (vi & CMK) + 1, y = ((vi >> CBITS) & CMK) + 1, z = (vi >> (2 * CBITS)) + 1;
    const pi = x + P * y + PP * z;
    const above = pad[pi + P], below = pad[pi - P];
    const nxp = pad[pi + 1], nxm = pad[pi - 1], nzp = pad[pi + PP], nzm = pad[pi - PP];
    // buried in fluid or rock: nothing to draw (unless a part-filled cell shows under a ceiling)
    if (above && below && nxp && nxm && nzp && nzm && (above === m || !LV)) continue;
    const col = above === m;
    const l = lvl(pi, m);
    // falling water (over air, or pouring into a part-filled cell): a stream column as wide as
    // the cell is full
    const raw = LV ? padL[pi] : 8;
    if (!below || (below === m && LV && padL[pi - P] < 8)) {
      // over air it streaks a cell further down, so a pour reads as one falling ribbon
      stream(o, m, x - 1, y - 1, z - 1, Math.max(0.3, raw / 8), col || !below ? 1 : raw / 8, !col, !below, nxp, nxm, nzp, nzm);
      continue;
    }
    const top = !col && !(OPAQUE[above] && l >= 8) && !FLUID[above];
    const sxp = !nxp, sxm = !nxm, szp = !nzp, szm = !nzm, bot = !below;
    if (!top && !sxp && !sxm && !szp && !szm && !bot) continue;
    // corner tops (eighths of a voxel)
    if (col) { cT.fill(8); cS.fill(0); cO.fill(0); } else {
      cT[0] = corner(x, y, z, m); cS[0] = gS; cO[0] = gO;
      cT[1] = corner(x, y, z + 1, m); cS[1] = gS; cO[1] = gO;
      cT[2] = corner(x + 1, y, z + 1, m); cS[2] = gS; cO[2] = gO;
      cT[3] = corner(x + 1, y, z, m); cS[3] = gS; cO[3] = gO;
    }
    // column depth below (for the depth tint and how hard the surface may wave)
    let d = 0;
    for (let yy = y - 1; d < 14; yy--) {
      const c = yy >= 0 ? pad[x + P * yy + PP * z] : vat(world, X0 + x - 1, Y0 + yy - 1, Z0 + z - 1);
      if (c !== m) break;
      d++;
    }
    const thick = Math.min(255, d * 8 + l);
    // flow: toward lower neighbours (open air counts as empty, rock as level)
    const hn = (c, pj) => (c === m ? lvl(pj, m) : !c ? 0 : l);
    const fx = (hn(nxm, pi - 1) - hn(nxp, pi + 1)) / 2, fz = (hn(nzm, pi - PP) - hn(nzp, pi + PP)) / 2;
    const flowX = Math.max(1, Math.min(255, 128 + Math.round(fx * 16))), flowZ = Math.max(1, Math.min(255, 128 + Math.round(fz * 16)));
    const fall = bot || col ? 2 : 0, part = l < 8 ? 4 : 0;
    const flags = fall | part;
    const lx = x - 1, ly = y - 1, lz = z - 1;
    const sv = col ? 0 : 1; // top-edge vertices wave with the surface
    if (top) {
      quad(o, 2, m, flags | 1, thick, flowX, flowZ,
        lx, ly + cT[0] / 8, lz, cS[0], cO[0],
        lx, ly + cT[1] / 8, lz + 1, cS[1], cO[1],
        lx + 1, ly + cT[2] / 8, lz + 1, cS[2], cO[2],
        lx + 1, ly + cT[3] / 8, lz, cS[3], cO[3], 15);
    }
    // sides: bottom corners stay put, top corners follow the surface (mask bits 1, 2 = corners 1, 2)
    if (sxp) quad(o, 0, m, flags | sv, thick, flowX, flowZ,
      lx + 1, ly, lz, 0, 0, lx + 1, ly + cT[3] / 8, lz, cS[3], cO[3], lx + 1, ly + cT[2] / 8, lz + 1, cS[2], cO[2], lx + 1, ly, lz + 1, 0, 0, 6);
    if (sxm) quad(o, 1, m, flags | sv, thick, flowX, flowZ,
      lx, ly, lz + 1, 0, 0, lx, ly + cT[1] / 8, lz + 1, cS[1], cO[1], lx, ly + cT[0] / 8, lz, cS[0], cO[0], lx, ly, lz, 0, 0, 6);
    if (szp) quad(o, 4, m, flags | sv, thick, flowX, flowZ,
      lx + 1, ly, lz + 1, 0, 0, lx + 1, ly + cT[2] / 8, lz + 1, cS[2], cO[2], lx, ly + cT[1] / 8, lz + 1, cS[1], cO[1], lx, ly, lz + 1, 0, 0, 6);
    if (szm) quad(o, 5, m, flags | sv, thick, flowX, flowZ,
      lx, ly, lz, 0, 0, lx, ly + cT[0] / 8, lz, cS[0], cO[0], lx + 1, ly + cT[3] / 8, lz, cS[3], cO[3], lx + 1, ly, lz, 0, 0, 6);
    if (bot) quad(o, 3, m, flags & ~1, thick, flowX, flowZ,
      lx, ly, lz, 0, 0, lx + 1, ly, lz, 0, 0, lx + 1, ly, lz + 1, 0, 0, lx, ly, lz + 1, 0, 0, 0);
  }
  if (!o.n) return null;
  const nv = o.n * 4;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(o.pos.slice(0, nv * 3), 3));
  g.setAttribute('vdata', new THREE.Uint8BufferAttribute(o.dat.slice(0, nv * 4), 4));
  g.setAttribute('fdata', new THREE.Uint8BufferAttribute(o.ext.slice(0, nv * 4), 4));
  const idx = nv > 65535 ? new Uint32Array(o.n * 6) : new Uint16Array(o.n * 6);
  for (let q = 0; q < o.n; q++) {
    const b = q * 4, k = q * 6;
    idx[k] = b; idx[k + 1] = b + 1; idx[k + 2] = b + 2; idx[k + 3] = b; idx[k + 4] = b + 2; idx[k + 5] = b + 3;
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, CS / 2, CS / 2), CS * 0.9);
  return g;
}

// a falling stream: a column w voxels thick in the middle of its cell, reaching out to fluid
// neighbours so side-by-side streams join into one pouring sheet
function stream(o, m, lx, ly, lz, w, h, top, bot, nxp, nxm, nzp, nzm) {
  const a = (1 - w) / 2;
  const x0 = lx + (nxm === m ? 0 : a), x1 = lx + 1 - (nxp === m ? 0 : a), z0 = lz + (nzm === m ? 0 : a), z1 = lz + 1 - (nzp === m ? 0 : a);
  const y0 = bot ? ly - 1 : ly, y1 = ly + h, fl = 2, th = 8;
  // faces against fluid are inside the sheet; against rock only when the stream fills its cell
  const side = (n) => n !== m && !(a < 0.01 && OPAQUE[n]);
  if (side(nxp)) quad(o, 0, m, fl, th, 128, 128, x1, y0, z0, 0, 0, x1, y1, z0, 0, 0, x1, y1, z1, 0, 0, x1, y0, z1, 0, 0, 0);
  if (side(nxm)) quad(o, 1, m, fl, th, 128, 128, x0, y0, z1, 0, 0, x0, y1, z1, 0, 0, x0, y1, z0, 0, 0, x0, y0, z0, 0, 0, 0);
  if (side(nzp)) quad(o, 4, m, fl, th, 128, 128, x1, y0, z1, 0, 0, x1, y1, z1, 0, 0, x0, y1, z1, 0, 0, x0, y0, z1, 0, 0, 0);
  if (side(nzm)) quad(o, 5, m, fl, th, 128, 128, x0, y0, z0, 0, 0, x0, y1, z0, 0, 0, x1, y1, z0, 0, 0, x1, y0, z0, 0, 0, 0);
  if (top) quad(o, 2, m, fl, th, 128, 128, x0, y1, z0, 0, 0, x0, y1, z1, 0, 0, x1, y1, z1, 0, 0, x1, y1, z0, 0, 0, 0);
  if (bot) quad(o, 3, m, fl, th, 128, 128, x0, y0, z0, 0, 0, x1, y0, z0, 0, 0, x1, y0, z1, 0, 0, x0, y0, z1, 0, 0, 0);
}

// one fluid quad; `wave` is a 4-bit mask of the corners that ride the surface
function quad(o, f, m, flags, thick, fx, fz, x0, y0, z0, s0, o0, x1, y1, z1, s1, o1, x2, y2, z2, s2, o2, x3, y3, z3, s3, o3, wave) {
  if (o.n + 1 > o.cap) o.alloc(o.cap * 2);
  const q = o.n++;
  const P3 = q * 12, D = q * 16;
  const pos = o.pos, dat = o.dat, ext = o.ext;
  pos[P3] = x0; pos[P3 + 1] = y0; pos[P3 + 2] = z0;
  pos[P3 + 3] = x1; pos[P3 + 4] = y1; pos[P3 + 5] = z1;
  pos[P3 + 6] = x2; pos[P3 + 7] = y2; pos[P3 + 8] = z2;
  pos[P3 + 9] = x3; pos[P3 + 10] = y3; pos[P3 + 11] = z3;
  qS[0] = s0; qS[1] = s1; qS[2] = s2; qS[3] = s3; qO[0] = o0; qO[1] = o1; qO[2] = o2; qO[3] = o3;
  for (let c = 0; c < 4; c++) {
    const i = D + c * 4;
    dat[i] = f; dat[i + 1] = m;
    dat[i + 2] = (flags & 1) && (wave >> c) & 1 ? flags : flags & ~1;
    dat[i + 3] = Math.min(255, qS[c] * 90);
    ext[i] = thick; ext[i + 1] = fx; ext[i + 2] = fz; ext[i + 3] = Math.min(255, qO[c] * 90);
  }
}
const qS = new Uint8Array(4), qO = new Uint8Array(4);
