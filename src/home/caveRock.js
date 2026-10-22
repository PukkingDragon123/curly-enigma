// The rock of Old Star's cave workshop: one voxel volume at the mine's resolution (1/16 m), shaped
// by hand-placed lobes (the main chamber, the hearth nook, the forge alcove, the ruins, the lift
// bay, the old passage) with lumpy noise walls that lean in toward a domed roof, stalactites and
// a few stalagmites grown into it, the hole you fell through, the forge's smoke crack, a fresh
// rubble mound and a little drip basin in the floor. It is meshed with the mine's greedy mesher
// and drawn with the mine's terrain shader (rock plates, cracks, moss, roots, baked AO), lit by the
// cave's own fires and lanterns (up to 8 at a time: setLights). It is also the cave's collision:
// voxelAt() answers the first-person body like the mine does. Meters, y up.
import * as THREE from 'three';
import { M, VOX } from '../deep/materials.js';
import { meshSolidRaw, rawToGeometry, PAD } from '../deep/Mesher.js';
import { makeTerrainUniforms, makeTerrainMaterial, MAX_LIGHTS } from '../deep/TerrainMaterial.js';
import { BoxWorld } from '../fps/FPSKit.js';
import { HALL, ARCH, SHAFT, FRONT, HOLE } from './units.js';
import { hash, n2, n3, planD, floorH, ceilH, DRIPSTONES, MITES, POOL, MOUND, FLUE } from './caveShape.js';

export { planD, floorH, ceilH, DRIPSTONES, MITES, POOL, MOUND, FLUE };

const CS = PAD - 2; // chunk size (32)
const BASE = HALL.y;
const LIFT_BACK = (74 + 14) / 64; // the lift shaft's depth past its portal (lift.js BACK)
const LIFT_WELL = 74 / 64;

/** The grid (voxels of 1/16 m): origin and size. z ends at 0, where your room begins. */
export const GRID = { x0: -6 * VOX, y0: -2 * VOX, z0: -12 * VOX, nx: 18 * VOX, ny: 8 * VOX, nz: 12 * VOX };

// ---------------------------------------------------------------- a 3D noise lattice
/** Smooth noise over the grid at `cell` meters, precomputed: fn(ix, iy, iz) (grid voxels) → -1..1. */
function lattice(G, cell, seed) {
  const k = 1 / (cell * VOX); // lattice cells per voxel
  const LX = Math.ceil(G.nx * k) + 2, LY = Math.ceil(G.ny * k) + 2, LZ = Math.ceil(G.nz * k) + 2;
  const L = new Float32Array(LX * LY * LZ);
  for (let z = 0; z < LZ; z++) for (let y = 0; y < LY; y++) for (let x = 0; x < LX; x++) L[x + LX * (y + LY * z)] = hash(x, y, z, seed) * 2 - 1;
  return (ix, iy, iz) => {
    const fx = (ix + 0.5) * k, fy = (iy + 0.5) * k, fz = (iz + 0.5) * k;
    const xi = fx | 0, yi = fy | 0, zi = fz | 0;
    let tx = fx - xi, ty = fy - yi, tz = fz - zi;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); tz = tz * tz * (3 - 2 * tz);
    const i = xi + LX * (yi + LY * zi), sy = LX, sz = LX * LY;
    const a = L[i] + (L[i + 1] - L[i]) * tx, b = L[i + sy] + (L[i + sy + 1] - L[i + sy]) * tx;
    const c = L[i + sz] + (L[i + sz + 1] - L[i + sz]) * tx, d = L[i + sz + sy] + (L[i + sz + sy + 1] - L[i + sz + sy]) * tx;
    const p = a + (b - a) * ty, q = c + (d - c) * ty;
    return p + (q - p) * tz;
  };
}

// ---------------------------------------------------------------- the volume
export class CaveRock {
  constructor(opts = {}) {
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.name = 'caveRock';
    this.U = makeTerrainUniforms();
    this.U.fogDist.value = 30;
    this.U.fogCol.value.setRGB(0.03, 0.02, 0.018);
    this.U.ambient.value.setRGB(0.15, 0.115, 0.095);
    this.U.lampCol.value.setRGB(0.34, 0.27, 0.2);
    this.U.lampRange.value = 5;
    this.mat = makeTerrainMaterial(this.U);
    this.stats = {};
  }

  build() {
    const t0 = performance.now();
    const { nx, ny, nz } = GRID;
    this.vox = new Uint8Array(nx * ny * nz).fill(M.STONE);
    this.ground = new Float32Array(nx * nz).fill(BASE); // floor top (m) per column
    this.fill();
    const t1 = performance.now();
    this.growDripstones();
    this.carve();
    this.paintSurfaces();
    const t2 = performance.now();
    this.mesh();
    this.stats = { fill: Math.round(t1 - t0), carve: Math.round(t2 - t1), mesh: Math.round(performance.now() - t2), chunks: this.group.children.length };
    return this;
  }

  idx(ix, iy, iz) { return ix + GRID.nx * (iy + GRID.ny * iz); }

  /** Rock strata by height (m above the cave floor), wobbled. */
  wallMat(x, y, z) {
    const yy = y - BASE + n2(x * 0.7, z * 0.7, 41) * 0.22 + Math.sin(x * 1.3 + z * 0.7) * 0.07;
    if (yy < 0.32) return M.MUDSTONE;
    if (yy < 0.95) return n2(x * 1.5, z * 1.5 + y, 42) > 0.45 ? M.LIMESTONE : M.STONE;
    if (yy < 1.12) return M.SANDSTONE;
    if (yy < 1.95) return M.LIMESTONE;
    if (yy < 2.08) return M.SANDSTONE;
    return M.STONE;
  }

  /** Carve the air: per column between the floor and the roof, lumpy near the walls (a coarse 3D noise lattice). */
  fill() {
    const { x0, y0, z0, nx, ny, nz } = GRID;
    const v = this.vox;
    const inv = 1 / VOX;
    const lump = lattice(GRID, 0.42, 47), fine = lattice(GRID, 0.17, 48);
    this.colD = new Float32Array(nx * nz);
    this.colF = new Int16Array(nx * nz);
    this.colC = new Int16Array(nx * nz);
    this.airLo = new Int16Array(nx * nz).fill(ny);
    this.airHi = new Int16Array(nx * nz).fill(-1);
    for (let iz = 0; iz < nz; iz++) {
      const z = (z0 + iz + 0.5) * inv;
      for (let ix = 0; ix < nx; ix++) {
        const ci = ix + nx * iz;
        const x = (x0 + ix + 0.5) * inv;
        const d = planD(x, z);
        this.colD[ci] = d;
        if (d < -0.8) continue;
        const f = floorH(x, z, d), c = ceilH(x, z, d);
        const fV = Math.round(f * VOX) - y0, cV = Math.round(c * VOX) - y0;
        this.colF[ci] = fV; this.colC[ci] = cV;
        const wall = d < 0.9;
        let lo = ny, hi = -1;
        for (let iy = Math.max(0, fV); iy < Math.min(ny, cV); iy++) {
          let air = d > -0.05;
          if (wall) {
            const y = (y0 + iy + 0.5) * inv;
            const lean = Math.max(0, y - (BASE + 1.0)) * 0.22;
            air = d + lump(ix, iy, iz) * 0.26 + fine(ix, iy, iz) * 0.07 - lean > 0;
          }
          if (!air) continue;
          v[ix + nx * (iy + ny * iz)] = 0;
          if (iy < lo) lo = iy;
          hi = iy;
        }
        this.airLo[ci] = lo; this.airHi[ci] = hi;
        if (hi >= 0) this.ground[ci] = (y0 + lo) * inv;
      }
    }
  }

  /** Give every rock face its material: floor (dirt, gravel, ash by the forge, clay and moss round the basin, rubble under the hole), strata up the walls, roots in the roof, damp moss low down. Only voxels touching air (the rest is never seen). */
  paintSurfaces() {
    const { x0, y0, z0, nx, ny, nz } = GRID;
    const v = this.vox;
    const inv = 1 / VOX;
    const sy = nx, sz = nx * ny;
    for (let iz = 0; iz < nz; iz++) {
      const z = (z0 + iz + 0.5) * inv;
      for (let ix = 0; ix < nx; ix++) {
        // the y range with air in this column or a neighbour
        let lo = ny, hi = -1;
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jx = ix + dx, jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
          const cj = jx + nx * jz;
          if (this.airHi[cj] < 0) continue;
          lo = Math.min(lo, this.airLo[cj]); hi = Math.max(hi, this.airHi[cj]);
        }
        if (hi < 0) continue;
        lo = Math.max(0, lo - 2); hi = Math.min(ny - 1, hi + 3);
        const ci = ix + nx * iz;
        const x = (x0 + ix + 0.5) * inv;
        let col = null;
        for (let iy = lo; iy <= hi; iy++) {
          const i = ix + nx * (iy + ny * iz);
          if (v[i] !== M.STONE) continue;
          const touches = (ix > 0 && !v[i - 1]) || (ix < nx - 1 && !v[i + 1]) || (iy > 0 && !v[i - sy]) || (iy < ny - 1 && !v[i + sy]) || (iz > 0 && !v[i - sz]) || (iz < nz - 1 && !v[i + sz]);
          if (!touches) continue;
          if (!col) col = this.column(x, z, ci);
          v[i] = this.surfaceMat(col, ix, iy, iz, x, (y0 + iy + 0.5) * inv, z);
        }
      }
    }
  }

  /** What a column knows about itself (meters). */
  column(x, z, ci) {
    const d = this.colD[ci];
    return {
      d, fV: this.colF[ci], cV: this.colC[ci], lo: this.airLo[ci], hi: this.airHi[ci],
      wet: Math.max(0, 1 - Math.hypot(x - POOL.x, z - POOL.z) / 2.4) + Math.max(0, 1 - Math.hypot(x - FRONT.x, z - FRONT.z) / 2.2) * 0.8 + Math.max(0, n2(x * 0.5 + 3, z * 0.5, 43)) * 0.6,
      rooty: Math.max(0, 1 - Math.hypot(x - HOLE.x, z - HOLE.z) / 1.9) + Math.max(0, n2(x * 0.9, z * 0.9 + 9, 44) - 0.35) * 1.4,
      gravel: n2(x * 1.9, z * 1.9, 45) > 0.6 || (d < 0.9 && n2(x * 3.1, z * 3.1, 49) > 0.1),
      md: Math.hypot((x - MOUND.x) / MOUND.r, (z - MOUND.z) / (MOUND.r * 0.85)),
      pd: Math.hypot(x - POOL.x, z - POOL.z) / POOL.r,
      ash: Math.hypot(x - FLUE.x, z - FLUE.z - 0.9) < 1.35 && n2(x * 3, z * 3, 46) > -0.2,
      f: floorH(x, z, d),
    };
  }

  surfaceMat(c, ix, iy, iz, x, y, z) {
    const floor = c.hi >= 0 ? iy < c.lo + 1 && iy >= c.lo - 3 : y < c.f + 0.05;
    if (floor && c.hi >= 0) {
      if (c.md < 1) return c.md < 0.75 && hash(ix >> 1, iy, iz >> 1, 5) < 0.55 ? M.RUBBLE : M.LOAM;
      if (c.pd < 1.3) return c.pd > 1.0 && hash(ix, iy, iz, 8) < 0.25 ? M.MOSS : M.CLAY;
      return c.ash ? M.ASH : c.gravel ? M.GRAVEL : c.wet > 1.1 && c.d < 0.7 && hash(ix, iy, iz, 9) < 0.5 ? M.MOSS : M.DIRT;
    }
    if (c.hi >= 0 && iy > c.hi) {
      // the roof
      return c.rooty > 0.55 && iy - c.hi < 5 ? (hash(ix >> 1, iy >> 1, iz >> 1, 6) < 0.6 ? M.ROOTS : M.LOAM) : this.wallMat(x, y, z);
    }
    // the walls
    if (c.wet > 1.0 && y < c.f + 0.45 && hash(ix >> 1, iy >> 1, iz >> 1, 7) < 0.45) return M.MOSS;
    if (c.rooty > 0.8 && c.hi >= 0 && iy > c.hi - 8) return M.ROOTS;
    return this.wallMat(x, y, z);
  }

  /** Stalactites down from the roof, stalagmites up from the floor. */
  growDripstones() {
    const { x0, y0, z0, nx, ny, nz } = GRID;
    const v = this.vox;
    const cone = (cx, cz, yTop, yBot, r0, down, mat, seed) => {
      const R = Math.ceil((r0 + 0.08) * VOX);
      const icx = Math.round(cx * VOX) - x0, icz = Math.round(cz * VOX) - z0;
      const ya = Math.floor(yBot * VOX) - y0, yb = Math.ceil(yTop * VOX) - y0;
      const L = Math.max(1e-3, yTop - yBot);
      for (let iy = Math.max(0, ya); iy <= Math.min(ny - 1, yb); iy++) {
        const y = (y0 + iy + 0.5) / VOX;
        const t = down ? (yTop - y) / L : (y - yBot) / L; // 0 at the base, 1 at the tip
        if (t < -0.15 || t > 1) continue;
        const wob = Math.sin(y * 13 + seed) * 0.012;
        const r = r0 * Math.pow(Math.max(0, 1 - t), 1.15) + 0.018 + (iy % 3 === 0 ? 0.008 : 0);
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          const ix = icx + dx, iz = icz + dz;
          if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
          const px = (x0 + ix + 0.5) / VOX - cx - wob, pz = (z0 + iz + 0.5) / VOX - cz;
          if (px * px + pz * pz > r * r) continue;
          const i = ix + nx * (iy + ny * iz);
          if (!v[i]) v[i] = t > 0.8 ? M.LIMESTONE : mat;
        }
      }
    };
    for (const s of DRIPSTONES) {
      const c = ceilH(s.x, s.z);
      cone(s.x, s.z, c + 0.2, c - s.len, s.r, true, M.LIMESTONE, s.x * 7);
    }
    for (const s of MITES) {
      const f = floorH(s.x, s.z);
      cone(s.x, s.z, f + s.h, f - 0.15, s.r, false, M.STONE, s.z * 5);
    }
  }

  /** Openings: the arch up to your room, the lift shaft, the old passage, the hole you fell through, the forge's crack. */
  carve() {
    const { x0, y0, z0, nx, ny, nz } = GRID;
    const v = this.vox;
    const box = (ax, ay, az, bx, by, bz, test = null) => {
      const i0 = Math.max(0, Math.floor(ax * VOX) - x0), i1 = Math.min(nx - 1, Math.ceil(bx * VOX) - x0 - 1);
      const j0 = Math.max(0, Math.floor(ay * VOX) - y0), j1 = Math.min(ny - 1, Math.ceil(by * VOX) - y0 - 1);
      const k0 = Math.max(0, Math.floor(az * VOX) - z0), k1 = Math.min(nz - 1, Math.ceil(bz * VOX) - z0 - 1);
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (test && !test((x0 + i + 0.5) / VOX, (y0 + j + 0.5) / VOX, (z0 + k + 0.5) / VOX)) continue;
        v[i + nx * (j + ny * k)] = 0;
      }
    };
    // the arch: a doorway through the cut face up into your room, and headroom over the steps
    box(ARCH.x - ARCH.hw, 0, HALL.z1 - 0.02, ARCH.x + ARCH.hw, ARCH.h, 0.01, (x, y) => y < ARCH.h - 0.12 || Math.abs(x - ARCH.x) < ARCH.hw * Math.sqrt(Math.max(0, 1 - ((y - (ARCH.h - 0.12)) / 0.13) ** 2)));
    box(ARCH.x - 0.62, BASE, HALL.z1 - 0.72, ARCH.x + 0.62, ARCH.h + 0.35, HALL.z1 + 0.001);
    // the lift shaft behind its portal, top to bottom
    box(SHAFT.x0 - 0.005, -3, SHAFT.z0 - 0.02, SHAFT.x0 + LIFT_BACK + 0.12, SHAFT.top + 0.2, SHAFT.z0 + LIFT_WELL + 0.02);
    // ...and room round the portal (its posts stand a little out from the face)
    box(SHAFT.x0 - 0.16, BASE, SHAFT.z0 - 0.26, SHAFT.x0 + 0.005, BASE + SHAFT.h + 0.4, SHAFT.z0 + LIFT_WELL + 0.26);
    // the old passage north to Deep Town: a rounded tunnel
    const P = FRONT;
    box(P.x - P.hw - 0.1, BASE, -11.9, P.x + P.hw + 0.1, BASE + P.h + 0.2, P.z + 0.4, (x, y, z) => {
      const w = P.hw + n2(z * 3, y * 3, 51) * 0.06 + 0.05;
      const yy = y - BASE;
      if (yy < 0 || Math.abs(x - P.x - Math.sin(z * 1.4) * 0.12) > w) return false;
      const top = P.h - 0.35;
      return yy < top || ((x - P.x) / w) ** 2 + ((yy - top) / 0.42) ** 2 < 1;
    });
    // the hole you fell through: a ragged throat up into the dark, roots all round it
    const ct = ceilH(HOLE.x, HOLE.z);
    box(HOLE.x - 1.2, ct - 0.5, HOLE.z - 1.2, HOLE.x + 1.2, 5.5, HOLE.z + 1.2, (x, y, z) => {
      const up = Math.max(0, y - ct);
      const r = HOLE.r * (1 + Math.max(0, 0.55 - up) * 0.9) + n3(x * 4, y * 2, z * 4, 52) * 0.13 - up * 0.04;
      return Math.hypot(x - HOLE.x - Math.sin(y * 1.7) * 0.08, z - HOLE.z) < r && y > ct - 0.25;
    });
    const hi0 = Math.max(0, Math.floor((HOLE.x - 1.6) * VOX) - x0), hi1 = Math.min(nx - 1, Math.ceil((HOLE.x + 1.6) * VOX) - x0);
    const hk0 = Math.max(0, Math.floor((HOLE.z - 1.6) * VOX) - z0), hk1 = Math.min(nz - 1, Math.ceil((HOLE.z + 1.6) * VOX) - z0);
    const hj0 = Math.max(0, Math.floor((ct - 0.3) * VOX) - y0);
    for (let k = hk0; k <= hk1; k++) for (let j = hj0; j < ny; j++) for (let i = hi0; i <= hi1; i++) {
      const y = (y0 + j + 0.5) / VOX;
      const ii = i + nx * (j + ny * k);
      if (v[ii] && y > ct - 0.2) v[ii] = hash(i >> 1, j >> 1, k >> 1, 9) < 0.55 ? M.ROOTS : M.LOAM;
    }
    // the forge's smoke crack, up from the roof over the hood
    const cf = ceilH(FLUE.x, FLUE.z);
    box(FLUE.x - 0.35, cf - 0.3, FLUE.z - 0.35, FLUE.x + 0.35, cf + 1.4, FLUE.z + 0.35, (x, y, z) => Math.abs((x - FLUE.x) * 0.8 + (z - FLUE.z) * 0.6) < 0.09 + n3(x * 6, y * 3, z * 6, 53) * 0.04 && Math.abs((x - FLUE.x) * 0.6 - (z - FLUE.z) * 0.8) < 0.3 - (y - cf) * 0.1);
  }

  // ------------------------------------------------------------ meshing
  /** The grid's voxel at (i, j, k), with the outside: solid rock, except the arch's doorway into your room. */
  at(i, j, k) {
    const { nx, ny, nz } = GRID;
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) return this.vox[i + nx * (j + ny * k)];
    if (k >= nz) {
      const x = (GRID.x0 + i + 0.5) / VOX, y = (GRID.y0 + j + 0.5) / VOX;
      if (Math.abs(x - ARCH.x) < ARCH.hw && y > 0 && y < ARCH.h) return 0;
    }
    return M.STONE;
  }

  mesh() {
    const { nx, ny, nz } = GRID;
    const P = PAD;
    const pad = new Uint8Array(P * P * P);
    const ncx = Math.ceil(nx / CS), ncy = Math.ceil(ny / CS), ncz = Math.ceil(nz / CS);
    for (let cz = 0; cz < ncz; cz++) for (let cy = 0; cy < ncy; cy++) for (let cx = 0; cx < ncx; cx++) {
      const X = cx * CS, Y = cy * CS, Z = cz * CS;
      let air = 0, solid = 0;
      for (let z = 0; z < P; z++) for (let y = 0; y < P; y++) {
        const row = (y + P * z) * P;
        const gj = Y + y - 1, gk = Z + z - 1;
        const inYZ = gj >= 0 && gj < ny && gk >= 0 && gk < nz;
        for (let x = 0; x < P; x++) {
          const gi = X + x - 1;
          const m = inYZ && gi >= 0 && gi < nx ? this.vox[gi + nx * (gj + ny * gk)] : this.at(gi, gj, gk);
          pad[row + x] = m;
          if (m) solid++; else air++;
        }
      }
      if (!air || !solid) continue;
      const raw = meshSolidRaw(pad);
      if (!raw) continue;
      const geo = rawToGeometry(raw);
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.position.set((GRID.x0 + X) / VOX, (GRID.y0 + Y) / VOX, (GRID.z0 + Z) / VOX);
      mesh.scale.setScalar(1 / VOX);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
  }

  // ------------------------------------------------------------ queries
  /** Material at world voxel (vx, vy, vz) (1/16 m); outside the grid: rock, but open air on your room's side (z ≥ 0). */
  voxelAt(vx, vy, vz) {
    const i = vx - GRID.x0, j = vy - GRID.y0, k = vz - GRID.z0;
    if (k >= GRID.nz) return 0;
    if (i < 0 || j < 0 || k < 0 || i >= GRID.nx || j >= GRID.ny) return j < 0 ? M.STONE : M.STONE;
    return this.vox[i + GRID.nx * (j + GRID.ny * k)];
  }

  solidAt(x, y, z) { return this.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX)) !== 0; }

  /** The floor's top (m) under (x, z) in the cave (the voxel floor, not the props on it). */
  groundAt(x, z) {
    const i = Math.floor(x * VOX) - GRID.x0, k = Math.floor(z * VOX) - GRID.z0;
    if (i < 0 || k < 0 || i >= GRID.nx || k >= GRID.nz) return BASE;
    return this.ground[i + GRID.nx * k];
  }

  /** The roof's underside (m) over (x, z): the first solid voxel above head height. */
  roofAt(x, z, from = BASE + 0.9) {
    const i = Math.floor(x * VOX) - GRID.x0, k = Math.floor(z * VOX) - GRID.z0;
    if (i < 0 || k < 0 || i >= GRID.nx || k >= GRID.nz) return from;
    for (let j = Math.max(0, Math.floor(from * VOX) - GRID.y0); j < GRID.ny; j++) if (this.vox[i + GRID.nx * (j + GRID.ny * k)]) return (GRID.y0 + j) / VOX;
    return (GRID.y0 + GRID.ny) / VOX;
  }

  /** Ray through the voxels (DDA): distance to the first solid voxel, or null within maxDist. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 20) {
    let x = Math.floor(ox * VOX), y = Math.floor(oy * VOX), z = Math.floor(oz * VOX);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(1 / (dx * VOX)) : Infinity, tdy = dy ? Math.abs(1 / (dy * VOX)) : Infinity, tdz = dz ? Math.abs(1 / (dz * VOX)) : Infinity;
    const fr = (p, d, i) => (d > 0 ? (i + 1 - p * VOX) / (d * VOX) : d < 0 ? (p * VOX - i) / (-d * VOX) : Infinity);
    let tx = fr(ox, dx, x), ty = fr(oy, dy, y), tz = fr(oz, dz, z);
    let t = 0;
    for (let n = 0; n < 4000 && t <= maxDist; n++) {
      if (this.voxelAt(x, y, z)) return t;
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; }
      else { z += sz; t = tz; tz += tdz; }
    }
    return null;
  }

  // ------------------------------------------------------------ light
  /**
   * The lights the rock sees this frame: [{ x, y, z, r (reach, m), c: [r, g, b] }] (the strongest
   * first, up to 8), and the eye (the faint glow round the mole).
   */
  setLights(list, eye, dt = 0) {
    const U = this.U;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = list[i];
      if (!l) { U.lPos.value[i].set(0, -9999, 0, 1); U.lCol.value[i].set(0, 0, 0); continue; }
      U.lPos.value[i].set(l.x, l.y, l.z, l.r);
      U.lCol.value[i].set(l.c[0], l.c[1], l.c[2]);
    }
    if (eye) { U.lampPos.value.copy(eye.pos); U.lampDir.value.copy(eye.dir); }
    U.time.value += dt;
  }

  dispose() {
    for (const m of this.group.children) m.geometry.dispose();
    this.mat.dispose();
    this.U.palette.value.dispose();
  }
}

// ---------------------------------------------------------------- collision
/**
 * The scene's collision: the boxes (your room, the steps, the props, the lift, Old Star) plus the
 * cave's rock voxels, answered the way the first-person body and the particles ask.
 */
export class CaveWorld extends BoxWorld {
  constructor(rock = null) { super(); this.rock = rock; }
  setRock(rock) { this.rock = rock; }
  solidAt(x, y, z) { return super.solidAt(x, y, z) || (!!this.rock && this.rock.solidAt(x, y, z)); }
  voxelAt(vx, vy, vz) {
    const m = this.rock ? this.rock.voxelAt(vx, vy, vz) : 0;
    return m || super.voxelAt(vx, vy, vz);
  }
  matAt(x, y, z) { return this.solidAt(x, y, z) ? M.STONE : 0; }
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 50) {
    const b = super.raycast(ox, oy, oz, dx, dy, dz, maxDist);
    const t = this.rock ? this.rock.raycast(ox, oy, oz, dx, dy, dz, Math.min(maxDist, b ? b.dist : maxDist)) : null;
    if (t !== null && (!b || t < b.dist)) return { dist: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, nx: 0, ny: 0, nz: 0, box: null, rock: true };
    return b;
  }
}
