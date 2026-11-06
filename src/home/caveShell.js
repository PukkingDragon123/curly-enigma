// The rock of Old Star's camp: one voxel volume at 1/16 m (the mine's own block size), carved from
// the hollow's shape in plan.js (hollowSD, lean, ceilAt): rough walls that wander and lean in to a
// low domed roof, layered strata of brown and grey rock, soot over the forge and up its crack, damp
// moss round the spring and under the drips, roots and dripstones hanging from the roof, rubble
// along the foot of the walls, an uneven floor of packed dirt (paler where feet have worn it, straw
// by the shack, dark wet patches under the drips) and the ragged hole you fell through, up through
// the roof to a faint grey light. Pure (it runs in a build worker): buildCaveRock() → { obj (a group
// in tile units, to be merged and lit with the camp), glow (the hole's light, m) }; caveBoxes() →
// the collision of its walls (boxes, m), from the same shape.
import * as THREE from 'three';
import { VoxelGrid, M32, G32, group, mulc, mixc } from '../iso/kit.js';
import { hollowSD, lean, ceilAt, walkable, n2, n3, hash3, HOLE_SHAFT, FY } from './plan.js';
import { T, SHAFT, ARCH, HALL, STAIRS, floorAt } from './units.js';

/** Voxels per meter (1/16 m: the mine's blocks). */
export const CV = 16;
/** The grid's corner (m) and size (voxels). The floor's top is at FY (4 voxels up). */
export const CG = { x0: -5.95, y0: FY - 0.25, z0: -6.6, nx: 230, ny: 62, nz: 106 };

/** Where water drips from the roof (m): a dark wet patch under each, a puddle under some. */
export const DRIPS = [
  { x: -4.35, z: -2.15, puddle: true }, // the spring nook
  { x: 1.25, z: -2.45, puddle: true },
  { x: 5.6, z: -1.45 },
  { x: -0.4, z: -5.1 },
  { x: 6.65, z: -4.9, puddle: true },
];
/** Dripstones hanging from the roof: x, z (m), length (m), base radius (m). High enough to walk under, or by the walls. */
const DRIPSTONES = [
  [1.2, -2.45, 0.32, 0.09], [-4.35, -2.15, 0.36, 0.1], [5.6, -1.45, 0.28, 0.08], [6.65, -4.9, 0.4, 0.1],
  [-3.3, -5.0, 0.5, 0.13], [7.1, -1.1, 0.42, 0.11], [-3.4, -0.9, 0.38, 0.1], [0.2, -5.35, 0.3, 0.09],
  [3.0, -3.4, 0.22, 0.07], [4.6, -4.3, 0.26, 0.08], [-1.6, -0.75, 0.3, 0.08], [7.25, -5.3, 0.45, 0.12],
];
/** Where the floor's worn pale (m): the ways people walk. */
const PATHS = [[2.5, -1.0, 2.6, -3.6], [2.6, -2.6, 6.9, -3.35], [2.4, -2.2, -1.2, -2.3], [-1.2, -2.3, -1.6, -4.3], [6.2, -2.8, 6.2, -5.4], [-1.2, -2.2, -4.2, -2.1]];
/** Soot: the forge's pipe goes up a crack in the north rock here (m). */
export const FLUE = { x: -2.0, z: -5.75 };
/** The fire pit (m: as house.js SPOTS.fire): forty years of its smoke black the roof over it. */
const PIT = { x: -0.9, z: -2.05 };

// cold grey-blue stone with a few warmer bands (the firelight warms what it reaches)
const ROCK = [0x55585c, 0x484b50, 0x5f5e5a, 0x3e4145, 0x5d574f, 0x4b4e53, 0x67635b];
const DIRT = [0x4e4234, 0x45392d, 0x56493a];
/** Pale flowstone where water has run down the rock for centuries. */
const CALCITE = 0xa8a294;

function pathK(x, z) {
  let best = 0;
  for (const [ax, az, bx, bz] of PATHS) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    best = Math.max(best, 1 - d / 0.5);
  }
  return best;
}

/** Is (x, z) (m) in the lift's shaft (kept clear: the lift builds its own lining)? */
const inShaft = (x, z) => x > SHAFT.x0 - 0.01 && x < SHAFT.x0 + 1.45 && z > SHAFT.z0 - 0.06 && z < SHAFT.z1 + 0.06;

/** The rock, the floor and the roof, as voxels and meshes. */
export function buildCaveRock() {
  const { x0, y0, z0, nx, ny, nz } = CG;
  const S = 1 / CV;
  const g = new VoxelGrid(nx, ny, nz), gl = new VoxelGrid(nx, ny, nz);
  const FLOOR = Math.round((FY - y0) * CV); // first voxel row above the floor (4)
  // per column: the distance to the wall, the roof, the hole
  const N2 = nx * nz;
  const sd = new Float32Array(N2), roof = new Int16Array(N2), hole = new Uint8Array(N2), shaft = new Uint8Array(N2);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = x0 + (ix + 0.5) * S, z = z0 + (iz + 0.5) * S, k = ix + iz * nx;
    sd[k] = hollowSD(x, z);
    roof[k] = Math.round((ceilAt(x, z) - y0) * CV);
    const hr = Math.hypot(x - HOLE_SHAFT.x, z - HOLE_SHAFT.z) - (HOLE_SHAFT.r + 0.08 * n2(Math.atan2(z - HOLE_SHAFT.z, x - HOLE_SHAFT.x) * 2.2, 0, 21));
    hole[k] = hr < 0 ? 1 : 0;
    shaft[k] = inShaft(x, z) ? 1 : 0;
  }
  // dripstones: a cone per voxel column under the roof
  const drip = new Int16Array(N2); // voxels hanging below the roof
  for (const [dx, dz, len, r] of DRIPSTONES) {
    const cx = (dx - x0) * CV, cz = (dz - z0) * CV, R = r * CV + 1;
    for (let iz = Math.floor(cz - R); iz <= cz + R; iz++) for (let ix = Math.floor(cx - R); ix <= cx + R; ix++) {
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      const d = Math.hypot(ix + 0.5 - cx, iz + 0.5 - cz) / R;
      if (d < 1) drip[ix + iz * nx] = Math.max(drip[ix + iz * nx], Math.round(len * CV * (1 - d) ** 1.6));
    }
  }
  // pass 1: solid or not
  const solid = new Uint8Array(nx * ny * nz);
  const idx = (ix, iy, iz) => ix + nx * (iy + ny * iz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const k = ix + iz * nx, x = x0 + (ix + 0.5) * S, z = z0 + (iz + 0.5) * S;
    if (shaft[k]) continue;
    const d0 = sd[k], top = hole[k] ? ny : roof[k] - drip[k];
    // rubble humps along the foot of the walls (a voxel or two over the floor)
    const rub = d0 > -0.42 && d0 < 0 ? (n2(x * 4.1, z * 4.1, 31) > 0.15 ? (d0 > -0.2 ? 2 : 1) : 0) : 0;
    const sill = Math.abs(x - ARCH.x) <= 0.44 && z > HALL.z1 - 0.01; // the arch's threshold, up at your nook's floor
    // up the passage the walls don't lean in from the camp's floor: a round-topped tunnel over the steps
    const pt = Math.abs(x - ARCH.x) < 0.7 ? Math.max(0, Math.min(1, (z + 1.3) / 0.35)) : 0, lf = pt ? floorAt(x, z) - FY : 0;
    for (let iy = 0; iy < ny; iy++) {
      let s;
      if (iy < FLOOR) s = true; // the floor
      else if (sill && iy < FLOOR + 8) s = true;
      else {
        const h = (iy + 0.5) / CV - (FLOOR / CV);
        const hp = h - lf, L = pt ? lean(h) * (1 - pt) + (hp < 0.8 ? 0 : ((hp - 0.8) / 0.46) ** 2 * 0.44) * pt : lean(h);
        if (iy >= top) s = true;
        else if (d0 + L > 0.55) s = true;
        else if (d0 + L < -0.35) s = iy < FLOOR + rub;
        else s = d0 + L + 0.1 * (1 - pt * 0.6) * n3(x * 2.6, h * 2.6, z * 2.6, 32) > 0 || iy < FLOOR + rub;
      }
      if (s) solid[idx(ix, iy, iz)] = 1;
    }
  }
  // pass 2: colour what shows (a voxel with air beside it); the rest is plain rock
  const air = (ix, iy, iz) => ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && !solid[idx(ix, iy, iz)];
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!solid[idx(ix, iy, iz)]) continue;
    const shows = air(ix + 1, iy, iz) || air(ix - 1, iy, iz) || air(ix, iy + 1, iz) || air(ix, iy - 1, iz) || air(ix, iy, iz + 1) || air(ix, iy, iz - 1);
    if (!shows) { g.set(ix, iy, iz, 0x3a332d); continue; }
    const x = x0 + (ix + 0.5) * S, y = y0 + (iy + 0.5) * S, z = z0 + (iz + 0.5) * S;
    g.set(ix, iy, iz, rockColour(x, y, z, ix, iy, iz, iy < FLOOR + 3 && air(ix, iy + 1, iz), sd[ix + iz * nx]));
  }
  // roots: strands hanging from the roof round the hole and here and there
  const roots = [];
  for (let k = 0; k < 46; k++) {
    const a = hash3(k, 1, 0, 41) * Math.PI * 2, near = k < 18;
    const rx = near ? HOLE_SHAFT.x + Math.cos(a) * (HOLE_SHAFT.r + 0.05 + hash3(k, 2, 0, 41) * 0.35) : -4.6 + hash3(k, 3, 0, 41) * 12.2;
    const rz = near ? HOLE_SHAFT.z + Math.sin(a) * (HOLE_SHAFT.r + 0.05 + hash3(k, 4, 0, 41) * 0.35) : -5.6 + hash3(k, 5, 0, 41) * 5.0;
    if (hollowSD(rx, rz) > -0.1) continue;
    roots.push([rx, rz, 0.12 + hash3(k, 6, 0, 41) * (near ? 0.55 : 0.4)]);
  }
  for (const [rx, rz, len] of roots) {
    let ix = Math.floor((rx - x0) * CV), iz = Math.floor((rz - z0) * CV);
    if (ix < 1 || iz < 1 || ix >= nx - 1 || iz >= nz - 1) continue;
    let iy = Math.round((ceilAt(rx, rz) - y0) * CV) - 1;
    if (hole[ix + iz * nx]) iy = Math.round((ceilAt(rx, rz) - y0) * CV) + 2;
    const n = Math.round(len * CV);
    for (let j = 0; j < n && iy > FLOOR + 14; j++, iy--) {
      if (!solid[idx(ix, iy, iz)]) g.set(ix, iy, iz, j % 3 === 2 ? 0x3a2a1e : 0x4a3424);
      if (j % 4 === 3) { if (hash3(ix, iy, iz, 42) < 0.5) ix += 1; else iz += 1; }
    }
  }
  // glow-moss and crystal specks in the rock, and the hole's far light
  for (let k = 0; k < 140; k++) {
    const ix = Math.floor(hash3(k, 1, 7, 51) * nx), iz = Math.floor(hash3(k, 2, 7, 51) * nz), iy = FLOOR + 2 + Math.floor(hash3(k, 3, 7, 51) * 26);
    if (!solid[idx(ix, iy, iz)]) continue;
    const open = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].find(([a, b, c]) => air(ix + a, iy + b, iz + c));
    if (!open) continue;
    g.clear(ix, iy, iz);
    gl.set(ix, iy, iz, k % 5 === 0 ? 0xb090ff : k % 3 === 0 ? 0x8af0c8 : 0x5ad0b8);
  }
  const hx = Math.round((HOLE_SHAFT.x - x0) * CV), hz = Math.round((HOLE_SHAFT.z - z0) * CV);
  for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
    const d = Math.hypot(dx, dz) + 0.9 * Math.sin(Math.atan2(dz, dx) * 3 + 1);
    if (d > 7) continue;
    gl.set(hx + dx, ny - 1, hz + dz, d < 2.5 ? 0xf0f4f4 : d < 4 ? 0xc0ccd0 : d < 5.5 ? 0x8a969c : 0x56606a); // a cold speck of daylight, far up
  }
  const pv = [0, 0, 0], o = { scale: 1 / (CV * T) };
  const rock = M32(g, pv, o), glow = G32(gl, pv, o);
  // (the daylight up the hole and the glow-moss shine through the cave's haze)
  glow.material = glow.material.clone();
  glow.material.fog = false;
  const obj = group(rock, glow);
  obj.position.set(x0 / T, y0 / T, z0 / T);
  return { obj, top: { x: HOLE_SHAFT.x, y: y0 + ny / CV, z: HOLE_SHAFT.z } };
}

/** The colour of a rock or floor voxel that shows. */
function rockColour(x, y, z, ix, iy, iz, floorTop, d0) {
  const h = y - FY;
  const blk = hash3(ix >> 1, iy >> 1, iz >> 1, 61);
  if (floorTop && h < 0.02) {
    // the floor: packed dirt, paler where it's walked, straw by the shack, wet under the drips, stones
    let c = DIRT[Math.floor(hash3(ix >> 1, 0, iz >> 1, 62) * 3)];
    // big soft patches: damp and dark, or dry and dusty (so the floor isn't one even field)
    const patch = n2(x * 0.9 + 7, z * 0.9 - 3, 69);
    if (patch > 0.3 || patch < -0.3) c = mulc(c, patch > 0 ? 1.07 : 0.88); // (in steps: plain runs still merge)
    const pk = pathK(x, z);
    if (pk > 0.2 && blk < 0.85) c = mixc(c, 0x76654c, Math.min(0.6, pk * 0.7));
    const pb = hash3(ix, 0, iz, 63);
    if (pb < 0.04) c = pb < 0.012 ? 0x77746c : 0x5e5b55; // a pebble
    if (x > 0.9 && x < 3.9 && z > -4.5 && z < -3.6 && hash3(ix, 1, iz, 64) < 0.45) c = hash3(ix, 2, iz, 64) < 0.5 ? 0xb8984e : 0x9a7e40; // straw by the shack's door
    // ash trodden out round the fire pit, coal dust and scale round the forge and the anvil
    const fp = Math.hypot(x - PIT.x, z - PIT.z);
    if (fp < 1.1 && hash3(ix, 3, iz, 64) < 0.5 * (1.1 - fp)) c = hash3(ix, 4, iz, 64) < 0.5 ? 0x6a6662 : 0x4e4a47;
    const fg = Math.hypot((x + 1.6) / 1.5, (z + 4.6) / 0.9);
    if (fg < 1 && hash3(ix, 5, iz, 64) < 0.65 * (1 - fg)) c = mixc(c, 0x1e1c1e, 0.6);
    for (const dp of DRIPS) { const dd = Math.hypot(x - dp.x, z - dp.z); if (dd < 0.32) c = mulc(c, 0.62 + dd * 0.6); }
    if (d0 > -0.3) c = mixc(c, ROCK[1], 0.4);
    if (d0 > -0.5 && damp(x, z) > 0.2 && hash3(ix, 6, iz, 64) < 0.35) c = hash3(ix, 7, iz, 64) < 0.5 ? 0x3e4e2a : 0x34421f; // moss creeping off the wet rock
    return c;
  }
  // rock: strata that wander, blocky shading, darker up high, soot over the forge, damp moss low down
  const band = Math.floor((y + 0.14 * n2(x * 0.6, z * 0.6, 65)) / 0.2);
  let c = ROCK[((band % ROCK.length) + ROCK.length) % ROCK.length];
  c = mulc(c, blk < 0.2 ? 0.88 : blk > 0.85 ? 1.1 : 1);
  if (h > 1.4) c = mulc(c, Math.max(0.72, 1 - (h - 1.4) * 0.22));
  const fs = Math.hypot((x - FLUE.x) / 1.1, (z - FLUE.z) / 0.9);
  if (fs < 1 && h > 0.45) c = mulc(c, 0.35 + fs * 0.6);
  // the roof over the fire pit, black with forty years of smoke, thinning out round it
  const ps = Math.hypot(x - PIT.x, z - PIT.z) / (0.6 + Math.max(0, h - 1.1) * 0.9);
  if (ps < 1 && h > 1.05) c = mixc(c, 0x16120f, Math.round((1 - ps) * 4) / 5);
  const col = hash3(ix, 0, iz, 70); // one per column of voxels: streaks that run down the rock
  const wet = damp(x, z);
  const spring = Math.hypot(x + 4.75, z + 2.2) < 1.2;
  // flowstone: pale calcite streaks under the drips and down from the spring's crack
  if ((wet > 0.25 || spring) && h > 0.3 && col < 0.3 + wet * 0.3 && hash3(ix, iy >> 2, iz, 71) < 0.7) return mixc(c, CALCITE, 0.35 + (col < 0.12 ? 0.3 : 0));
  // dark damp streaks where seepage runs down the walls
  if (col < 0.045 && h > 0.2) c = mulc(c, 0.74);
  if ((wet > 0.3 || spring) && h < 0.8 && hash3(ix >> 1, iy >> 1, iz >> 1, 66) < 0.55) c = hash3(ix, iy, iz, 67) < 0.5 ? 0x4a5e30 : 0x3e5028; // moss
  else if (h < 0.4 && wet > 0.05 && hash3(ix >> 1, iy >> 1, iz >> 1, 72) < 0.3) c = mixc(c, 0x3e5028, 0.55); // damp green at the foot
  else if (h < 0.25 && hash3(ix >> 1, iy, iz >> 1, 68) < 0.18) c = mixc(c, DIRT[0], 0.5); // dirt against the foot of the wall
  else if (hash3(ix, iy, iz, 73) < 0.007) c = hash3(ix, iy, iz, 74) < 0.5 ? 0x7c8670 : 0x8e8a76; // a fleck of lichen
  return c;
}

/** How damp the rock is at (x, z) (m): 1 under a drip, 0 a drip's reach away; the spring's nook too. */
function damp(x, z) {
  let wet = 0;
  for (const dp of DRIPS) { const dd = Math.hypot(x - dp.x, z - dp.z); if (dd < 0.9) wet = Math.max(wet, 1 - dd / 0.9); }
  const sp = Math.hypot(x + 4.75, z + 2.2);
  if (sp < 1.4) wet = Math.max(wet, 1 - sp / 1.4);
  return wet;
}

/**
 * The collision of the rock walls (m): every patch of rock within reach of the floor, as boxes
 * (rows of 0.1 m cells merged along x). Floor and roof are the scene's own boxes.
 */
export function caveBoxes() {
  const C = 0.1, X0 = HALL.x0 - 0.2, X1 = SHAFT.x0 + 0.01, Z0 = HALL.z0 - 0.2, Z1 = HALL.z1;
  const nx = Math.ceil((X1 - X0) / C), nz = Math.ceil((Z1 - Z0) / C);
  const walk = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) walk[i + j * nx] = walkable(X0 + (i + 0.5) * C, Z0 + (j + 0.5) * C) ? 1 : 0;
  const near = (i, j) => { for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz && walk[a + b * nx]) return true; } return false; };
  const out = [];
  const Y0 = FY - 0.5, Y1 = FY + 2.6;
  for (let j = 0; j < nz; j++) {
    let run = -1;
    for (let i = 0; i <= nx; i++) {
      const x = X0 + (i + 0.5) * C, z = Z0 + (j + 0.5) * C;
      const stairs = x >= STAIRS.x0 - 0.12 && x <= STAIRS.x1 + 0.12 && z >= STAIRS.z0 - 0.3;
      const rock = i < nx && !walk[i + j * nx] && !stairs && near(i, j);
      if (rock && run < 0) run = i;
      if (!rock && run >= 0) { out.push([X0 + run * C, Y0, Z0 + j * C, X0 + i * C, Y1, Z0 + (j + 1) * C]); run = -1; }
    }
  }
  return out;
}

void THREE;
