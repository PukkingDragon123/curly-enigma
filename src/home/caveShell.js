// The rock of Old Star's cave: one voxel volume at 1/16 m (the mine's own block size), carved from
// the shapes in plan.js: the small hollow (rough walls that wander and lean in to a low, uneven
// roof), the necks and the alcoves you've dug (straight, fresher rock with pick scars, vaulting
// over), layered strata of brown and grey rock, soot over the forge's flue and over the fire pit,
// roots and dripstones hanging from the roof, rubble along the foot of the hollow's walls, an uneven
// floor of packed dirt (paler where feet have worn it, ash round the fire, coal dust by the forge,
// dark wet patches under the drips), Old Star's chalk on the rock (THE WAY UP and the tally of
// years), the chalk-marked soft walls still to dig, and the ragged hole you fell through, up
// through the roof to a faint grey light. Pure (it runs in a build worker): buildCaveRock() →
// { obj (a group in tile units, to be merged and lit with the camp), top (the hole's top, m) };
// caveBoxes() → the collision of its walls (boxes, m), from the same shapes.
import * as THREE from 'three';
import { VoxelGrid, M32, G32, group, mulc, mixc } from '../iso/kit.js';
import { caveSD, neckSD, alcoveSD, hollowSD, lean, leanAlcove, leanNeck, ceilAt, walkable, n2, n3, hash3, HOLE_SHAFT, FY, openNookSet } from './plan.js';
import { NOOKS, NOOK, diggable } from './nooks.js';
import { SPOTS } from './spots.js';
import { T, SHAFT, FRONT } from './units.js';

/** Voxels per meter (1/16 m: the mine's blocks). */
export const CV = 16;
/** The rock's box (m) for the open set: the hollow, and every dug alcove with a margin. */
export function rockBounds(set = openNookSet()) {
  let x0 = 1.95, x1 = SHAFT.x0 + 0.05, z0 = FRONT.z - 0.45, z1 = -0.15;
  for (const n of NOOKS) {
    if (!set.has(n.id)) continue;
    x0 = Math.min(x0, n.rect[0] * T - 0.55, n.neck[0] - 0.4); x1 = Math.max(x1, n.rect[2] * T + 0.55, n.neck[2] + 0.4);
    z0 = Math.min(z0, n.rect[1] * T - 0.55, n.neck[1] - 0.4); z1 = Math.max(z1, n.rect[3] * T + 0.55, n.neck[3] + 0.4);
  }
  return { x0, x1, z0, z1 };
}
/** The grid's corner (m) and size (voxels) for the open set. The floor's top is at FY (4 voxels up). */
export function caveGrid(set = openNookSet()) {
  const b = rockBounds(set);
  return { x0: b.x0, y0: FY - 0.25, z0: b.z0, nx: Math.ceil((b.x1 - b.x0) * CV), ny: 62, nz: Math.ceil((b.z1 - b.z0) * CV) };
}

/** Where water drips from the roof (m): a dark wet patch under each, a puddle under some. */
export const DRIPS = [
  { x: 2.95, z: -3.15 },
  { x: 5.95, z: -3.3, puddle: true },
  { x: 7.55, z: -3.0 },
];
/** Dripstones hanging from the roof: x, z (m), length (m), base radius (m). Near the walls, or high enough to walk under. */
const DRIPSTONES = [
  [2.95, -3.15, 0.3, 0.09], [5.95, -3.3, 0.26, 0.08], [7.55, -3.0, 0.32, 0.09], [2.75, -1.55, 0.28, 0.08],
  [5.2, -3.95, 0.24, 0.07], [6.95, -0.95, 0.26, 0.08], [3.4, -3.95, 0.22, 0.07],
];
/** Where the floor's worn pale (m): the ways people walk. */
const PATHS = [[5.0, -1.55, 3.85, -2.35], [5.0, -1.55, 7.45, -2.3], [5.3, -2.3, 6.55, -3.75], [3.8, -2.4, 3.2, -3.05], [5.3, -2.3, 5.65, -3.4]];
/** Soot: the forge's pipe goes up a crack in the north rock here (m). */
export const FLUE = { x: SPOTS.forge.x, z: -4.1 };
/** The fire pit: years of its smoke black the roof over it. */
const PIT = { x: SPOTS.fire.x, z: SPOTS.fire.z };

// cold grey-blue stone with a few warmer bands (the firelight warms what it reaches)
const ROCK = [0x55585c, 0x484b50, 0x5f5e5a, 0x3e4145, 0x5d574f, 0x4b4e53, 0x67635b];
const DIRT = [0x4e4234, 0x45392d, 0x56493a];
/** Fresh-dug rock (the alcoves): paler, browner, the pick's scars still sharp. */
const FRESH = [0x6a6258, 0x5e574e, 0x746b5e, 0x645c50];
const CHALK = 0xe2e4da, CHALK_D = 0xb8bab0;
/** Pale flowstone where water has run down the rock for centuries. */
const CALCITE = 0xa8a294;

function pathK(x, z) {
  let best = 0;
  for (const [ax, az, bx, bz] of PATHS) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    best = Math.max(best, 1 - d / 0.45);
  }
  return best;
}

/** Is (x, z) (m) in the lift's shaft (kept clear: the lift builds its own lining)? */
const inShaft = (x, z) => x > SHAFT.x0 - 0.01 && x < SHAFT.x0 + 1.45 && z > SHAFT.z0 - 0.06 && z < SHAFT.z1 + 0.06;

/**
 * Chalk on the rock (m): a face at (x, z) looking along (nx, nz) into the room, `kind`:
 *   'dig'  the soft rock of an alcove still to dig: loose earth, a chalked arch and an X
 *   'way'  THE WAY UP: a thermometer chalked up the rock, the tally of years beside it
 * Returns its frame: { x, z, nx, nz, kind, id }.
 */
export function chalkSpots(set) {
  const out = [];
  for (const n of NOOKS) if (diggable(n.id, set)) out.push({ ...n.dig, nx: -n.dig.nx, nz: -n.dig.nz, kind: 'dig', id: n.id });
  out.push({ x: SPOTS.dream.x, z: SPOTS.dream.z, nx: 0.6, nz: 0.8, kind: 'way' });
  return out;
}

/**
 * The way through the north rock behind Old Star's door, once it's open (m): the door's own shape
 * (its frame's opening, a hair wider) straight back to where the rock ends and the old passage
 * begins (src/home/passage.js). du: from the door's middle, h: over the floor.
 */
export function inDoorway(x, h, z) {
  if (z > FRONT.z + 0.02 || z < FRONT.z - 0.6) return false;
  const du = x - FRONT.x, hw = 0.38, spring = 1.18 - 0.36;
  if (Math.abs(du) > hw || h < 0) return false;
  return h < spring || du * du + (h - spring) ** 2 <= hw * hw;
}

/** The rock, the floor and the roof, as voxels and meshes. opts.doorOpen: the doorway is cut through. */
export function buildCaveRock(set = openNookSet(), opts = {}) {
  const CG = caveGrid(set);
  const { x0, y0, z0, nx, ny, nz } = CG;
  const S = 1 / CV;
  const g = new VoxelGrid(nx, ny, nz), gl = new VoxelGrid(nx, ny, nz);
  const FLOOR = Math.round((FY - y0) * CV); // first voxel row above the floor (4)
  // per column: the distance to each kind of wall, the roof, the hole
  const N2 = nx * nz;
  const sdC = new Float32Array(N2), sdN = new Float32Array(N2), sdA = new Float32Array(N2), roof = new Int16Array(N2), hole = new Uint8Array(N2), shaft = new Uint8Array(N2);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = x0 + (ix + 0.5) * S, z = z0 + (iz + 0.5) * S, k = ix + iz * nx;
    sdC[k] = caveSD(x, z); sdN[k] = neckSD(x, z, set); sdA[k] = alcoveSD(x, z, set);
    roof[k] = Math.round((ceilAt(x, z) - y0) * CV);
    const hr = Math.hypot(x - HOLE_SHAFT.x, z - HOLE_SHAFT.z) - (HOLE_SHAFT.r + 0.08 * n2(Math.atan2(z - HOLE_SHAFT.z, x - HOLE_SHAFT.x) * 2.2, 0, 21));
    hole[k] = hr < 0 ? 1 : 0;
    shaft[k] = inShaft(x, z) ? 1 : 0;
  }
  // dripstones: a cone per voxel column under the roof
  const drip = new Int16Array(N2);
  for (const [dx, dz, len, r] of DRIPSTONES) {
    const cx = (dx - x0) * CV, cz = (dz - z0) * CV, R = r * CV + 1;
    for (let iz = Math.floor(cz - R); iz <= cz + R; iz++) for (let ix = Math.floor(cx - R); ix <= cx + R; ix++) {
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      const d = Math.hypot(ix + 0.5 - cx, iz + 0.5 - cz) / R;
      if (d < 1) drip[ix + iz * nx] = Math.max(drip[ix + iz * nx], Math.round(len * CV * (1 - d) ** 1.6));
    }
  }
  // pass 1: solid or not (the union of the hollow, the necks and the alcoves, each with its own walls)
  const solid = new Uint8Array(nx * ny * nz);
  const idx = (ix, iy, iz) => ix + nx * (iy + ny * iz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const k = ix + iz * nx, x = x0 + (ix + 0.5) * S, z = z0 + (iz + 0.5) * S;
    if (shaft[k]) continue;
    const dC = sdC[k], dN = sdN[k], dA = sdA[k], top = hole[k] ? ny : roof[k] - drip[k];
    const mine = Math.min(dN, dA); // (yours: no rubble humps in your alcoves or their necks)
    const rub = dC > -0.42 && dC < 0 && mine > 0.15 ? (n2(x * 4.1, z * 4.1, 31) > 0.15 ? (dC > -0.2 ? 2 : 1) : 0) : 0;
    for (let iy = 0; iy < ny; iy++) {
      let s;
      if (iy < FLOOR) s = true; // the floor
      else if (iy >= top) s = true;
      else {
        const h = (iy + 0.5) / CV - (FLOOR / CV);
        if (opts.doorOpen && inDoorway(x, h, z)) continue; // (the way to Deep Town)
        const sC = dC + lean(h);
        const sN = dN + leanNeck(h);
        const sA = dA + leanAlcove(h);
        const m = Math.min(sC, sN, sA);
        if (m > 0.55) s = true;
        else if (m < -0.35) s = iy < FLOOR + rub;
        else {
          // rough where it's old (the hollow), only ever receding where it's dug (the alcoves' walls stay on their tile edges)
          const nC = sC + 0.1 * n3(x * 2.6, h * 2.6, z * 2.6, 32);
          const nN = sN + 0.05 * n3(x * 3.3, h * 3.3, z * 3.3, 33);
          const nA = sA - 0.035 * Math.abs(n3(x * 4.1, h * 4.1, z * 4.1, 34)) - 0.1 * Math.max(0, n3(x * 1.7, h * 1.3, z * 1.7, 35)) - (h > 1.2 ? 0.08 * Math.abs(n3(x * 2.4, h * 2.4, z * 2.4, 36)) : 0);
          s = Math.min(nC, nN, nA) > 0 || iy < FLOOR + rub;
        }
      }
      if (s) solid[idx(ix, iy, iz)] = 1;
    }
  }
  // pass 2: colour what shows (a voxel with air beside it); the rest is plain rock
  const air = (ix, iy, iz) => ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && !solid[idx(ix, iy, iz)];
  const chalk = chalkSpots(set).map((c) => placeChalk(c));
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!solid[idx(ix, iy, iz)]) continue;
    const shows = air(ix + 1, iy, iz) || air(ix - 1, iy, iz) || air(ix, iy + 1, iz) || air(ix, iy - 1, iz) || air(ix, iy, iz + 1) || air(ix, iy, iz - 1);
    if (!shows) { g.set(ix, iy, iz, 0x3a332d); continue; }
    const x = x0 + (ix + 0.5) * S, y = y0 + (iy + 0.5) * S, z = z0 + (iz + 0.5) * S, k = ix + iz * nx;
    const floorTop = iy < FLOOR + 3 && air(ix, iy + 1, iz);
    let c = rockColour(x, y, z, ix, iy, iz, floorTop, sdC[k], Math.min(sdN[k], sdA[k]));
    if (!floorTop) for (const ch of chalk) { const cc = chalkAt(ch, x, y - FY, z, ix, iy, iz); if (cc !== null) { c = cc; break; } }
    g.set(ix, iy, iz, c);
  }
  // roots: strands hanging from the roof round the hole and here and there (a few in the alcoves)
  const roots = [];
  for (let k = 0; k < 40; k++) {
    const a = hash3(k, 1, 0, 41) * Math.PI * 2, near = k < 16;
    const rx = near ? HOLE_SHAFT.x + Math.cos(a) * (HOLE_SHAFT.r + 0.05 + hash3(k, 2, 0, 41) * 0.3) : x0 + hash3(k, 3, 0, 41) * nx / CV;
    const rz = near ? HOLE_SHAFT.z + Math.sin(a) * (HOLE_SHAFT.r + 0.05 + hash3(k, 4, 0, 41) * 0.3) : z0 + hash3(k, 5, 0, 41) * nz / CV;
    const dh = hollowSD(rx, rz);
    if (dh > -0.1) continue;
    const inNook = alcoveSD(rx, rz, set) < 0;
    if (inNook && (dh < -0.45 || k % 3)) continue; // (in your alcoves only close to the rock: not over the furniture)
    roots.push([rx, rz, 0.1 + hash3(k, 6, 0, 41) * (near ? 0.5 : inNook ? 0.2 : 0.32)]);
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
  for (let k = 0; k < 90; k++) {
    const ix = Math.floor(hash3(k, 1, 7, 51) * nx), iz = Math.floor(hash3(k, 2, 7, 51) * nz), iy = FLOOR + 2 + Math.floor(hash3(k, 3, 7, 51) * 22);
    if (!solid[idx(ix, iy, iz)]) continue;
    const open = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].find(([a, b, c]) => air(ix + a, iy + b, iz + c));
    if (!open) continue;
    g.clear(ix, iy, iz);
    gl.set(ix, iy, iz, k % 5 === 0 ? 0xb090ff : k % 3 === 0 ? 0x8af0c8 : 0x5ad0b8);
  }
  const hx = Math.round((HOLE_SHAFT.x - x0) * CV), hz = Math.round((HOLE_SHAFT.z - z0) * CV);
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const d = Math.hypot(dx, dz) + 0.9 * Math.sin(Math.atan2(dz, dx) * 3 + 1);
    if (d > 6) continue;
    gl.set(hx + dx, ny - 1, hz + dz, d < 2.2 ? 0xf0f4f4 : d < 3.5 ? 0xc0ccd0 : d < 4.8 ? 0x8a969c : 0x56606a); // a cold speck of daylight, far up
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

/**
 * Is the rock solid at (x, y, z) m, exactly as buildCaveRock voxelises it (the cell's centre at
 * 1/16 m)? For things that must sit on the rock's real face: the chalk (chalkDecal). Walls only:
 * the floor counts as solid, the roof is left out.
 */
export function rockSolidAt(x, y, z, set = openNookSet(), CG = caveGrid(set)) {
  const S = 1 / CV;
  const ix = Math.floor((x - CG.x0) * CV), iy = Math.floor((y - CG.y0) * CV), iz = Math.floor((z - CG.z0) * CV);
  const cx = CG.x0 + (ix + 0.5) * S, cz = CG.z0 + (iz + 0.5) * S, FLOOR = Math.round((FY - CG.y0) * CV);
  if (iy < FLOOR) return true;
  const h = (iy + 0.5) / CV - FLOOR / CV;
  const sC = caveSD(cx, cz) + lean(h), sN = neckSD(cx, cz, set) + leanNeck(h), sA = alcoveSD(cx, cz, set) + leanAlcove(h);
  const m = Math.min(sC, sN, sA);
  if (m > 0.55) return true;
  if (m < -0.35) return false;
  const nC = sC + 0.1 * n3(cx * 2.6, h * 2.6, cz * 2.6, 32);
  const nN = sN + 0.05 * n3(cx * 3.3, h * 3.3, cz * 3.3, 33);
  const nA = sA - 0.035 * Math.abs(n3(cx * 4.1, h * 4.1, cz * 4.1, 34)) - 0.1 * Math.max(0, n3(cx * 1.7, h * 1.3, cz * 1.7, 35)) - (h > 1.2 ? 0.08 * Math.abs(n3(cx * 2.4, h * 2.4, cz * 2.4, 36)) : 0);
  return Math.min(nC, nN, nA) > 0;
}

/** 3 × 5 chalk letters (rows top to bottom). */
const CHALK_FONT = {
  T: '111010010010010', H: '101101111101101', E: '111100110100111', W: '101101101111101', A: '010101111101101', Y: '101101010010010',
  U: '101101101101111', P: '110101110100100', D: '110101101101110', I: '111010010010111', G: '111100101101111', ' ': '000000000000000', '!': '010010010000010',
};

/**
 * Chalk on the rock, at 1/64 m, laid onto the rock's real face (rockSolidAt): every stroke pixel is
 * found by walking from the room side into the rock until it's solid. spot: { x, z, nx, nz (into
 * the room), kind: 'dig' | 'way' }. 'dig': an arch outlined round the soft rock, an X across it, three
 * ticks and DIG scrawled under the arch's crown; 'way': THE WAY UP over a thermometer to a million
 * (filled halfway once, rubbed out above), the tally of years beside it. Returns a mesh (tile units,
 * in world position: put it in the decor as it is) or null.
 */
export function chalkDecal(spot, set = openNookSet(), seed = 1) {
  const CG = caveGrid(set);
  const P = 64, W = 64, H = 104, D = 40; // pixels across, up, and the depth range (1/64 m)
  const ux = spot.nz, uz = -spot.nx; // along the face (the decal's own x: to your right as you face the rock)
  const ox = spot.x + spot.nx * 0.32, oz = spot.z + spot.nz * 0.32; // the frame's origin, in front of the rock
  const strokes = new Map();
  const put = (u, v, c) => { if (u >= -W / 2 && u < W / 2 && v >= 0 && v < H) strokes.set(u + ',' + v, c); };
  const chalk = (u, v) => put(u, v, hash3(u, v, seed, 85) < 0.16 ? CHALK_D : hash3(u, v, seed, 86) < 0.08 ? 0xf4f6ee : CHALK);
  const pen = (u, v, w = 2) => { for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) if (hash3(u + a, v + b, seed, 87) > 0.07) chalk(u + a, v + b); };
  const lineP = (u0, v0, u1, v1, w = 2) => { const n = Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0), 1); for (let i = 0; i <= n; i++) pen(Math.round(u0 + (u1 - u0) * i / n), Math.round(v0 + (v1 - v0) * i / n), w); };
  const text = (str, u0, v0, s = 2) => { let u = u0; for (const ch of str) { const gl = CHALK_FONT[ch] || CHALK_FONT[' ']; for (let k = 0; k < 15; k++) if (gl[k] === '1') pen(u + (k % 3) * s, v0 + (4 - Math.floor(k / 3)) * s, s); u += 4 * s; } };
  if (spot.kind === 'dig') {
    const hw = 26, top = 74;
    // the arch: two sides and a round crown (gaps where the chalk skipped), the X, three ticks, DIG
    for (let v = 6; v < top - hw; v++) { if (hash3(v >> 2, 1, seed, 88) > 0.12) { pen(-hw, v); pen(hw - 1, v); } }
    for (let i = 0; i <= 60; i++) { const a = Math.PI * i / 60; if (hash3(i >> 1, 2, seed, 88) > 0.1) pen(Math.round(-Math.cos(a) * hw), Math.round(top - hw + Math.sin(a) * hw)); }
    lineP(-15, 14, 15, 52); lineP(15, 14, -15, 52);
    for (let k = 0; k < 3; k++) lineP(hw + 5 + k * 4, 10, hw + 6 + k * 4, 19, 1);
    text('DIG', -11, top - 18, 2);
  } else {
    text('THE WAY UP', -30, H - 12, 1);
    // the thermometer: a tube with a bulb, the rungs to a million, filled halfway once and rubbed out above
    const tu = -12;
    for (let v = 18; v < H - 18; v++) { pen(tu - 4, v, 1); pen(tu + 4, v, 1); }
    lineP(tu - 4, H - 18, tu + 4, H - 18, 1);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pen(Math.round(tu + Math.cos(a) * 6), Math.round(12 + Math.sin(a) * 6), 1); }
    for (let v = 8; v < 50; v++) for (let u = tu - 2; u <= tu + 2; u++) if (Math.hypot(u - tu, Math.max(0, 12 - v)) < 5) chalk(u, v);
    for (let v = 50; v < 70; v++) for (let u = tu - 2; u <= tu + 2; u++) if (hash3(u, v, seed, 89) < 0.3) put(u, v, CHALK_D);
    for (let v = 22; v < H - 20; v += 7) lineP(tu - 9, v, tu - 6, v, 1);
    // the tally of years: rows of four and a stroke across
    for (let r = 0; r < 8; r++) for (let c2 = 0; c2 < 3; c2++) {
      const u0 = 4 + c2 * 9, v0 = 18 + r * 9;
      if (r * 3 + c2 > 21) continue;
      for (let k = 0; k < 4; k++) lineP(u0 + k * 2, v0, u0 + k * 2, v0 + 6, 1);
      lineP(u0 - 1, v0 + 1, u0 + 7, v0 + 5, 1);
    }
  }
  if (!strokes.size) return null;
  // lay each stroke pixel on the rock: from the frame's plane, step into the rock until it's solid
  const g = new VoxelGrid(W, H, D);
  for (const [k, c] of strokes) {
    const [u, v] = k.split(',').map(Number);
    const y = FY + (v + 0.5) / P;
    let d = 0;
    for (; d < D - 2; d++) {
      const t = (d + 0.5) / P;
      const x = ox + ux * (u + 0.5) / P - spot.nx * t, z = oz + uz * (u + 0.5) / P - spot.nz * t;
      if (rockSolidAt(x, y, z, set, CG)) break;
    }
    if (d >= D - 2 || d < 1) continue; // (no rock within reach, or rock right at the frame: skip it)
    g.set(u + W / 2, v, D - d, c); // (one voxel proud of the rock's face)
  }
  const m = M32(g, [W / 2, 0, D], { outline: false });
  // frame: x along the face, z out of the rock toward the room; origin at the frame plane
  m.position.set(ox / T, FY / T, oz / T);
  m.rotation.y = Math.atan2(spot.nx, spot.nz);
  return m;
}

/** The colour of a rock or floor voxel that shows. dC: the distance to the hollow's wall; dM: to your alcoves'. */
function rockColour(x, y, z, ix, iy, iz, floorTop, dC, dM) {
  const h = y - FY;
  const blk = hash3(ix >> 1, iy >> 1, iz >> 1, 61);
  const yours = dM < dC; // (nearer your alcoves than the old hollow: fresh-dug)
  if (floorTop && h < 0.02) {
    // the floor: packed dirt, paler where it's walked, ash round the fire, coal dust by the forge, wet under the drips
    let c = DIRT[Math.floor(hash3(ix >> 1, 0, iz >> 1, 62) * 3)];
    const patch = n2(x * 0.9 + 7, z * 0.9 - 3, 69);
    if (patch > 0.3 || patch < -0.3) c = mulc(c, patch > 0 ? 1.07 : 0.88);
    if (yours) { c = mixc(c, 0x6a5440, 0.35); if (hash3(ix, 9, iz, 64) < 0.05) c = 0x7a6a58; return c; } // fresh earth, a chip of rock
    const pk = pathK(x, z);
    if (pk > 0.2 && blk < 0.85) c = mixc(c, 0x76654c, Math.min(0.6, pk * 0.7));
    const pb = hash3(ix, 0, iz, 63);
    if (pb < 0.04) c = pb < 0.012 ? 0x77746c : 0x5e5b55; // a pebble
    const fp = Math.hypot(x - PIT.x, z - PIT.z);
    if (fp < 1.0 && hash3(ix, 3, iz, 64) < 0.5 * (1.0 - fp)) c = hash3(ix, 4, iz, 64) < 0.5 ? 0x6a6662 : 0x4e4a47;
    const fg = Math.hypot((x - SPOTS.forge.x) / 1.3, (z - SPOTS.forge.z - 0.55) / 0.9);
    if (fg < 1 && hash3(ix, 5, iz, 64) < 0.65 * (1 - fg)) c = mixc(c, 0x1e1c1e, 0.6);
    for (const dp of DRIPS) { const dd = Math.hypot(x - dp.x, z - dp.z); if (dd < 0.3) c = mulc(c, 0.62 + dd * 0.6); }
    if (dC > -0.3) c = mixc(c, ROCK[1], 0.4);
    if (dC > -0.5 && damp(x, z) > 0.2 && hash3(ix, 6, iz, 64) < 0.35) c = hash3(ix, 7, iz, 64) < 0.5 ? 0x3e4e2a : 0x34421f;
    return c;
  }
  // rock: strata that wander, blocky shading, darker up high, soot over the forge and the fire, damp moss low down
  const band = Math.floor((y + 0.14 * n2(x * 0.6, z * 0.6, 65)) / 0.2);
  let c = ROCK[((band % ROCK.length) + ROCK.length) % ROCK.length];
  if (yours && dM < 0.4) {
    // fresh-dug: paler, the pick's scars running across it in short diagonal strokes
    c = mixc(c, FRESH[Math.floor(hash3(ix >> 1, iy >> 1, iz >> 1, 75) * 4)], 0.6);
    const scar = (ix + iz + iy * 2) % 7 === 0 && hash3(ix >> 2, iy >> 2, iz >> 2, 76) < 0.5;
    if (scar) c = mulc(c, 0.78);
    if (h > 1.6) c = mulc(c, Math.max(0.78, 1 - (h - 1.6) * 0.5));
    if (h < 0.18 && hash3(ix, iy, iz, 77) < 0.3) c = mixc(c, DIRT[0], 0.5);
    return c;
  }
  c = mulc(c, blk < 0.2 ? 0.88 : blk > 0.85 ? 1.1 : 1);
  if (h > 1.3) c = mulc(c, Math.max(0.72, 1 - (h - 1.3) * 0.25));
  const fs = Math.hypot((x - FLUE.x) / 0.9, (z - FLUE.z) / 0.7);
  if (fs < 1 && h > 0.45) c = mulc(c, 0.32 + fs * 0.6);
  // the roof over the fire pit, black with years of smoke, thinning out round it
  const ps = Math.hypot(x - PIT.x, z - PIT.z) / (0.55 + Math.max(0, h - 1.0) * 0.9);
  if (ps < 1 && h > 0.95) c = mixc(c, 0x16120f, Math.round((1 - ps) * 4) / 5);
  const col = hash3(ix, 0, iz, 70);
  const wet = damp(x, z);
  if (wet > 0.25 && h > 0.3 && col < 0.3 + wet * 0.3 && hash3(ix, iy >> 2, iz, 71) < 0.7) return mixc(c, CALCITE, 0.35 + (col < 0.12 ? 0.3 : 0));
  if (col < 0.045 && h > 0.2) c = mulc(c, 0.74);
  if (wet > 0.3 && h < 0.8 && hash3(ix >> 1, iy >> 1, iz >> 1, 66) < 0.55) c = hash3(ix, iy, iz, 67) < 0.5 ? 0x4a5e30 : 0x3e5028;
  else if (h < 0.4 && wet > 0.05 && hash3(ix >> 1, iy >> 1, iz >> 1, 72) < 0.3) c = mixc(c, 0x3e5028, 0.55);
  else if (h < 0.25 && hash3(ix >> 1, iy, iz >> 1, 68) < 0.18) c = mixc(c, DIRT[0], 0.5);
  else if (hash3(ix, iy, iz, 73) < 0.007) c = hash3(ix, iy, iz, 74) < 0.5 ? 0x7c8670 : 0x8e8a76;
  return c;
}

/** How damp the rock is at (x, z) (m): 1 under a drip, 0 a drip's reach away. */
function damp(x, z) {
  let wet = 0;
  for (const dp of DRIPS) { const dd = Math.hypot(x - dp.x, z - dp.z); if (dd < 0.8) wet = Math.max(wet, 1 - dd / 0.8); }
  return wet;
}

/** A chalk spot's frame: its face found by walking from the room side into the rock at chalk height. */
function placeChalk(c) {
  let px = c.x + c.nx * 0.5, pz = c.z + c.nz * 0.5;
  const h = c.kind === 'dig' ? 0.6 : 1.1;
  for (let i = 0; i < 80 && Math.min(caveSD(px, pz) + lean(h), neckSD(px, pz) + leanNeck(h), alcoveSD(px, pz) + leanAlcove(h)) < 0; i++) { px -= c.nx * 0.02; pz -= c.nz * 0.02; }
  return { ...c, fx: px, fz: pz, ux: -c.nz, uz: c.nx };
}

/**
 * The colour (or null) of a rock voxel near a chalk spot: u along the face (m), v up it (m over the
 * floor), how deep behind the face. 'dig': the patch of soft, crumbly earth inside the chalked arch
 * (the chalk itself is chalkDecal's, at 1/64 m).
 */
function chalkAt(c, x, h, z, ix, iy, iz) {
  const dx = x - c.fx, dz = z - c.fz;
  const depth = -(dx * c.nx + dz * c.nz);
  if (depth < -0.25 || depth > 0.4) return null;
  const u = dx * c.ux + dz * c.uz;
  if (c.kind === 'dig') {
    // the soft rock inside the chalked arch: crumbly earth gone rotten (the chalk itself: chalkDecal)
    const hw = 0.4, top = 1.14;
    if (Math.abs(u) > hw || h > top) return null;
    const archTop = h > top - hw ? top - hw + Math.sqrt(Math.max(0, hw * hw - u * u)) : top;
    if (h > archTop - 0.02) return null;
    return [0x5e4a38, 0x564434, 0x66503c, 0x524030][Math.floor(hash3(ix >> 1, iy >> 1, iz >> 1, 82) * 4)];
  }
  return null;
}

/**
 * The collision of the rock walls (m): every patch of rock within reach of the floor, as boxes
 * (rows of 0.1 m cells merged along x). Floor and roof are the scene's own boxes.
 */
export function caveBoxes(set = openNookSet(), opts = {}) {
  const B = rockBounds(set);
  const C = 0.1, X0 = B.x0, X1 = Math.min(B.x1, SHAFT.x0 + 0.01), Z0 = B.z0, Z1 = B.z1;
  const nx = Math.ceil((X1 - X0) / C), nz = Math.ceil((Z1 - Z0) / C);
  const walk = new Uint8Array(nx * nz);
  // (the open doorway: its jambs are the scene's boxes, the passage's are passage.js's)
  const door = (x, z) => opts.doorOpen && Math.abs(x - FRONT.x) < 0.33 && z < FRONT.z + 0.15 && z > FRONT.z - 0.6;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = X0 + (i + 0.5) * C, z = Z0 + (j + 0.5) * C; walk[i + j * nx] = walkable(x, z) || door(x, z) ? 1 : 0; }
  const near = (i, j) => { for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz && walk[a + b * nx]) return true; } return false; };
  const out = [];
  const Y0 = FY - 0.5, Y1 = FY + 2.6;
  for (let j = 0; j < nz; j++) {
    let run = -1;
    for (let i = 0; i <= nx; i++) {
      const rock = i < nx && !walk[i + j * nx] && near(i, j);
      if (rock && run < 0) run = i;
      if (!rock && run >= 0) { out.push([X0 + run * C, Y0, Z0 + j * C, X0 + i * C, Y1, Z0 + (j + 1) * C]); run = -1; }
    }
  }
  return out;
}

void THREE; void NOOK;
