// The old miners' lifts, dressed: a brass-and-iron cage skinned over the generator's timber cage
// (built from the actual voxels, so it covers them however the lift sits on the voxel grid), with
// grilles, a folded grille door on the open (+z) side, a floor plate, a lamp and a lever inside; the
// room's lantern in an iron frame on its chain, a bell with its pull rope, an enamel plaque with the
// lift's name in pixel letters, a counterweight running in its guides up to a pulley wheel, crates,
// sacks, a bench, and a touch of the zone (roots, crystals, soot, frost, void shards). The town
// shaft stops get a simpler landing: a plank deck, railings with a gap for the cage, gate posts with
// lamps, a bell post, the plaque, a bench.
//
// Model builders here are merged into BUILD (./models.js); liftSnapshot / liftLayout are used by
// Props.js to place everything.
import { PGrid, hv, shade, mixc } from './grid.js';
import { OPAQUE } from '../Mesher.js';
import { M } from '../materials.js';

// ---------------------------------------------------------------- palettes per zone
const ZPAL = {
  1: { brass: 0xa8833c, brassL: 0xd2b46a, brassD: 0x6a4e24, iron: 0x4a4c50, ironL: 0x70747a, ironD: 0x2c2e32, rust: 0x8a4a2a, rustL: 0xb0603a, rustK: 0.14, patina: 0x6a8a6e, patK: 0.025, enamel: 0x2a5a3e, wood: 0x7a5232, woodD: 0x553820 },
  2: { brass: 0xa8803a, brassL: 0xd0b068, brassD: 0x684a22, iron: 0x4c4a4a, ironL: 0x74706c, ironD: 0x2e2a2a, rust: 0x9a4a26, rustL: 0xc06a3a, rustK: 0.24, patina: 0x6a8a6a, patK: 0.02, enamel: 0x7a2e26, wood: 0x7e5434, woodD: 0x583a22 },
  3: { brass: 0xbc9644, brassL: 0xe8d08a, brassD: 0x76592a, iron: 0x4a5264, ironL: 0x7a86a0, ironD: 0x2a3040, rust: 0x5a4a6a, rustL: 0x7a6a8a, rustK: 0.04, patina: 0x6aa0b0, patK: 0.03, enamel: 0x1f4a7a, wood: 0x6e5038, woodD: 0x4c3624, crystal: [0x70e0ff, 0xff70c0] },
  4: { brass: 0x8a6a32, brassL: 0xb08c48, brassD: 0x4e3a1c, iron: 0x2e2c2c, ironL: 0x4a4644, ironD: 0x1a1818, rust: 0x5a2e1e, rustL: 0x7a3a22, rustK: 0.1, patina: 0x1a1816, patK: 0.22, enamel: 0x2a2420, wood: 0x3e2c20, woodD: 0x261a12, soot: true },
  5: { brass: 0xb0925a, brassL: 0xdcc898, brassD: 0x6e5a36, iron: 0x56606e, ironL: 0x8a96a6, ironD: 0x323a46, rust: 0x6a7a8a, rustL: 0x9aaaba, rustK: 0.05, patina: 0x9ac8d8, patK: 0.08, enamel: 0x2a5a8a, wood: 0x6a5a4a, woodD: 0x4a3e32, frost: true },
  6: { brass: 0xbca870, brassL: 0xe8dcaa, brassD: 0x766240, iron: 0x3a2e4a, ironL: 0x6a5a8a, ironD: 0x22182e, rust: 0x5a3a7a, rustL: 0x8a5ab0, rustK: 0.06, patina: 0xb090ff, patK: 0.05, enamel: 0x3a2266, wood: 0x4a3a4a, woodD: 0x2e2232, glowRivet: 0xd0a0ff },
};
export const liftPal = (zone) => ZPAL[zone] || ZPAL[1];
const ROPE = 0xc4a46a, ROPE_D = 0x96784a, CABLE = 0x9aa0a8, CABLE_D = 0x6a7078;

// ---------------------------------------------------------------- 3×5 pixel font
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111101101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101101111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
  9: '010101011001110', "'": '010010000000000', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
};
/** Split a name into one or two lines for a plaque. */
export function plaqueLines(name) {
  const t = String(name).toUpperCase();
  if (t.length <= 10 || !t.includes(' ')) return [t];
  let best = null;
  for (let i = 0; i < t.length; i++) if (t[i] === ' ') { const d = Math.abs(i - t.length / 2); if (!best || d < best.d) best = { i, d }; }
  return [t.slice(0, best.i), t.slice(best.i + 1)];
}

// ---------------------------------------------------------------- the world around a lift
const cageRole = (dx, dy, dz) => {
  const ax = Math.abs(dx), az = Math.abs(dz);
  if (!(dy >= 0 && dy < 2.05 && ax < 0.7 && az < 0.7)) return 0;
  if (ax > 0.56 && az > 0.56) return 3; // post
  if (dy > 1.92) return 1; // roof
  if ((ax > 0.58 || az > 0.58) && (Math.abs(dy - 0.55) < 0.07 || dy > 1.9) && !(dz > 0.58 && dy < 1.9)) return 2; // rail
  return 0;
};

/**
 * Voxels around a lift (read once): the timber cage voxels that still stand (by the generator's own
 * pattern), the lantern block, and floor / ceiling heights. `cage` is false for the shaft stops.
 */
export function liftSnapshot(world, L, cage = true) {
  const R = cage ? 1.8 : 2.2;
  const x0 = Math.floor((L.x - R) * 8), x1 = Math.ceil((L.x + R) * 8);
  const y0 = Math.floor((L.y - 0.5) * 8), y1 = Math.ceil((L.y + 3.0) * 8);
  const z0 = Math.floor((L.z - R) * 8), z1 = Math.ceil((L.z + R) * 8);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
  const mats = new Uint8Array(nx * ny * nz);
  // read whole chunk rows at a time (unloaded chunks read as stone, like voxelAt)
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) {
    const vy = y0 + y, vz = z0 + z;
    let x = 0;
    while (x < nx) {
      const vx = x0 + x, ch = world.chunk(vx >> 5, vy >> 5, vz >> 5);
      const run = Math.min(nx - x, 32 - (vx & 31));
      const o = x + nx * (y + ny * z);
      if (!ch) mats.fill(M.STONE, o, o + run);
      else {
        const base = (vx & 31) + 32 * ((vy & 31) + 32 * (vz & 31));
        for (let k = 0; k < run; k++) mats[o + k] = ch.vox[base + k];
      }
      x += run;
    }
  }
  const at = (vx, vy, vz) => {
    const x = vx - x0, y = vy - y0, z = vz - z0;
    return x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? M.STONE : mats[x + nx * (y + ny * z)];
  };
  const solid = (vx, vy, vz) => OPAQUE[at(vx, vy, vz)] === 1;
  const S = { L, x0, y0, z0, nx, ny, nz, at, solid, cage: [], lamp: null, hash: 0 };
  let h = 0;
  if (cage) {
    let lb = null;
    for (let vz = z0; vz <= z1; vz++) for (let vy = y0; vy <= y1; vy++) for (let vx = x0; vx <= x1; vx++) {
      const m = at(vx, vy, vz);
      const dx = (vx + 0.5) / 8 - L.x, dy = (vy + 0.5) / 8 - L.y, dz = (vz + 0.5) / 8 - L.z;
      if (OPAQUE[m] === 1) {
        const role = cageRole(dx, dy, dz);
        if (role) { S.cage.push([vx, vy, vz, role]); h = (Math.imul(h ^ (vx * 73856093 ^ vy * 19349663 ^ vz * 83492791), 16777619) + role) | 0; }
      }
      if (m === M.LANTERN && Math.abs(dx - 0.95) < 0.35 && Math.abs(dz - 0.95) < 0.35 && dy > 0.6 && dy < 1.5) {
        if (!lb) lb = [vx, vy, vz, vx, vy, vz];
        else { lb[0] = Math.min(lb[0], vx); lb[1] = Math.min(lb[1], vy); lb[2] = Math.min(lb[2], vz); lb[3] = Math.max(lb[3], vx); lb[4] = Math.max(lb[4], vy); lb[5] = Math.max(lb[5], vz); }
      }
    }
    S.lamp = lb;
    // the cable column up the shaft (the generator's one-voxel timber line) and the shaft's top
    const cx = Math.floor(L.x * 8), cz = Math.floor(L.z * 8);
    let c0 = null, c1 = null;
    for (let vy = Math.floor((L.y + 2.05) * 8); vy < Math.floor((L.y + 6.5) * 8); vy++) {
      if (world.voxelAt(cx, vy, cz) === M.TIMBER) { if (c0 === null) c0 = vy; c1 = vy; }
    }
    S.cable = c0 !== null ? [cx, cz, c0, c1] : null;
  }
  S.hash = h >>> 0;
  /** Floor surface height (m) under (x, z) near the lift's y, or NaN. */
  S.floorAt = (x, z, from = L.y + 0.4) => {
    const vx = Math.floor(x * 8), vz = Math.floor(z * 8);
    for (let vy = Math.floor(from * 8); vy > Math.floor((L.y - 0.5) * 8); vy--) if (solid(vx, vy - 1, vz) && !solid(vx, vy, vz)) return vy / 8;
    return NaN;
  };
  /** Ceiling height (m) above (x, z), or NaN. */
  S.ceilAt = (x, z, from = L.y + 1.0) => {
    const vx = Math.floor(x * 8), vz = Math.floor(z * 8);
    for (let vy = Math.floor(from * 8); vy < Math.floor((L.y + 3.0) * 8); vy++) if (solid(vx, vy + 1, vz) && !solid(vx, vy, vz)) return (vy + 1) / 8;
    return NaN;
  };
  /** Distance (m) from (x, y, z) to rock along (dx, dz), max 3 m. */
  S.wallAlong = (x, y, z, dx, dz) => {
    for (let t = 0; t < 3; t += 1 / 16) if (solid(Math.floor((x + dx * t) * 8), Math.floor(y * 8), Math.floor((z + dz * t) * 8))) return t;
    return 3;
  };
  return S;
}

// ---------------------------------------------------------------- the cage (skinned)
/**
 * Build the brass-and-iron cage over the timber cage voxels of a snapshot. Returns
 * { grid, pivot, origin: [x, y, z] metres of the grid corner, front: z of the front face, bandY }.
 */
export function buildCage(S, zone) {
  const it = buildCageSteps(S, zone);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
export function* buildCageSteps(S, zone) {
  const P = liftPal(zone);
  const L = S.L;
  if (!S.cage.length) return null;
  let a0 = 1e9, b0 = 1e9, c0 = 1e9, a1 = -1e9, b1 = -1e9, c1 = -1e9;
  for (const [vx, vy, vz] of S.cage) { a0 = Math.min(a0, vx); b0 = Math.min(b0, vy); c0 = Math.min(c0, vz); a1 = Math.max(a1, vx); b1 = Math.max(b1, vy); c1 = Math.max(c1, vz); }
  // world-voxel aligned grid (2 prop voxels per world voxel) with a margin
  const ox = a0 - 2, oy = b0 - 2, oz = c0 - 2;
  const W = (a1 - ox + 3) * 2, H = (b1 - oy + 3) * 2, D = (c1 - oz + 3) * 2;
  const g = new PGrid(W, H, D);
  const role = new Uint8Array(W * H * D);
  const ri = (i, j, k) => i + W * (j + H * k);
  const pi = (vx) => (vx - ox) * 2, pj = (vy) => (vy - oy) * 2, pk = (vz) => (vz - oz) * 2;
  // 1. roles of the shell: every cage voxel and one prop voxel round it (posts win over rails over roof)
  for (const [vx, vy, vz, r] of S.cage) {
    for (let k = pk(vz) - 1; k <= pk(vz) + 2; k++) for (let j = pj(vy) - 1; j <= pj(vy) + 2; j++) for (let i = pi(vx) - 1; i <= pi(vx) + 2; i++) {
      if (i < 0 || j < 0 || k < 0 || i >= W || j >= H || k >= D) continue;
      if (role[ri(i, j, k)] < r) role[ri(i, j, k)] = r;
    }
  }
  // bounds of each corner post's shell, the floor row and the band rows
  const cx = (L.x * 8 - ox) * 2, cz = (L.z * 8 - oz) * 2; // the lift centre in prop voxels
  const posts = {};
  for (const [vx, vy, vz, r] of S.cage) {
    if (r !== 3) continue;
    const key = (pi(vx) < cx ? 'l' : 'r') + (pk(vz) < cz ? 'b' : 'f');
    const b = posts[key] || (posts[key] = [1e9, 1e9, -1e9, -1e9]);
    b[0] = Math.min(b[0], pi(vx) - 1); b[1] = Math.min(b[1], pk(vz) - 1); b[2] = Math.max(b[2], pi(vx) + 2); b[3] = Math.max(b[3], pk(vz) + 2);
  }
  if (!posts.lb || !posts.rb || !posts.lf || !posts.rf) return null;
  const jFloor = pj(Math.floor(L.y * 8 + 0.5)); // first air row above the plank floor
  let jRoof = 1e9, jTop = -1e9;
  for (const [, vy, , r] of S.cage) if (r === 1) { jRoof = Math.min(jRoof, pj(vy) - 1); jTop = Math.max(jTop, pj(vy) + 2); }
  if (jRoof > H) { jRoof = H - 6; jTop = H - 3; }
  yield 'roles';
  // 2. colour the shell
  const rust = (c, i, j, k) => (hv(i >> 1, j >> 1, k >> 1, 401) < P.rustK ? (hv(i, j, k, 402) < 0.4 ? P.rustL : P.rust) : c);
  const patina = (c, i, j, k) => (hv(i >> 1, j, k >> 1, 403) < P.patK ? P.patina : c);
  for (let k = 0; k < D; k++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const r = role[ri(i, j, k)];
    if (!r) continue;
    let c, gl = 0;
    if (r === 3) {
      const b = posts[(i < cx ? 'l' : 'r') + (k < cz ? 'b' : 'f')];
      const eu = i === b[0] || i === b[2], ew = k === b[1] || k === b[3];
      const mu = i === ((b[0] + b[2]) >> 1), mw = k === ((b[1] + b[3]) >> 1);
      const rj = j - jFloor;
      const flute = ((eu ? k : i) & 1) === 0; // grooves down each face
      if (rj < 3) c = rj === 2 ? P.brassD : P.ironD; // plinth
      else if (j >= jRoof - 2) c = eu && ew ? P.brassD : P.brassL; // capital
      else if (rj % 12 === 6) c = (eu || ew) && !(eu && ew) && ((i + k) % 3 === 0) ? P.brassL : P.ironD; // iron collars, brass rivets
      else c = eu && ew ? P.brassD : mu || mw ? P.brassL : flute ? P.brass : shade(P.brass, 0.86);
      c = patina(c, i, j, k);
      if (P.glowRivet && rj % 12 === 6 && (eu || ew) && !(eu && ew) && (i + k) % 3 === 0) { c = P.glowRivet; gl = 2; }
    } else if (r === 2) {
      // a band: brass trim top and bottom, iron between, rivets
      const up = j + 1 < H && role[ri(i, j + 1, k)] === 2, dn = j > 0 && role[ri(i, j - 1, k)] === 2;
      c = !up || !dn ? P.brass : (i + k) % 4 === 0 ? P.ironL : rust(P.iron, i, j, k);
      if (P.glowRivet && up && dn && (i + k) % 4 === 0) { c = P.glowRivet; gl = 2; }
    } else {
      // the roof: iron plate, brass rim, rivet grid on top
      const edge = role[ri(Math.max(0, i - 1), j, k)] === 0 || role[ri(Math.min(W - 1, i + 1), j, k)] === 0 || role[ri(i, j, Math.max(0, k - 1))] === 0 || role[ri(i, j, Math.min(D - 1, k + 1))] === 0;
      const top = j + 1 >= H || role[ri(i, j + 1, k)] === 0;
      c = edge ? P.brass : top && i % 4 === 0 && k % 4 === 0 ? P.ironL : rust(j === jRoof ? P.ironD : P.iron, i, j, k);
    }
    g.set(i, j, k, c, gl);
  }
  yield 'shell';
  // 3. grilles, kick plates and the mid band on the three closed sides (in the posts' outer plane, one in)
  const bandLo = jFloor + 8, bandHi = jFloor + 10; // ~0.5–0.66 m
  const kick = jFloor + 5;
  const side = (fixed, a, b, along) => {
    // along 'x': plane k = fixed, i from a..b ; along 'z': plane i = fixed, k from a..b
    for (let t = a; t <= b; t++) for (let j = jFloor; j < jRoof; j++) {
      const i = along === 'x' ? t : fixed, k = along === 'x' ? fixed : t;
      if (g.has(i, j, k)) continue;
      let c = -1;
      if (j <= kick) c = j === kick ? P.brass : (t + j) % 5 === 0 && j === kick - 2 ? P.brassL : rust(P.iron, i, j, k);
      else if (j >= bandLo && j <= bandHi) c = j === bandLo || j === bandHi ? P.brass : P.iron;
      else if ((t - a) % 3 === 1) c = P.ironD; // bars
      else if (j === jRoof - 3 && (t - a) % 3 === 2) c = P.brassL; // little rosettes under the top band
      if (c >= 0) g.set(i, j, k, c);
    }
  };
  side(posts.lb[1] + 1, posts.lb[2] + 1, posts.rb[0] - 1, 'x'); // back
  side(posts.lb[0] + 1, posts.lb[3] + 1, posts.lf[1] - 1, 'z'); // left
  side(posts.rb[2] - 1, posts.rb[3] + 1, posts.rf[1] - 1, 'z'); // right
  // 4. the folded grille door against the front-left post, and the sill
  const kf = posts.lf[3] - 1, i0 = posts.lf[2] + 1;
  for (let j = jFloor; j < jRoof; j++) {
    const z = Math.abs(((j - jFloor) % 6) - 3);
    for (const i of [i0, i0 + 3]) if (!g.has(i, j, kf)) g.set(i, j, kf, P.ironD);
    if (!g.has(i0 + z, j, kf)) g.set(i0 + z, j, kf, j % 6 === 0 ? P.brass : P.iron);
  }
  for (let i = posts.lf[2] + 1; i < posts.rf[0]; i++) if (!g.has(i, jFloor, kf)) g.set(i, jFloor, kf, P.brassD);
  // 5. inside: a diamond floor plate, a lamp under the roof, the lever
  const inL = posts.lb[2] + 1, inR = posts.rb[0] - 1, inB = posts.lb[3] + 1, inF = posts.lf[1] - 1;
  for (let k = inB; k <= inF; k++) for (let i = inL; i <= inR; i++) {
    if (g.has(i, jFloor, k)) continue;
    const d = ((i + k) & 3) === 0 && ((i - k) & 3) === 0;
    g.set(i, jFloor, k, d ? P.ironL : (i + k) & 1 ? P.ironD : shade(P.ironD, 1.15));
  }
  const mi = Math.round(cx), mk = Math.round(cz);
  for (let k = mk - 2; k <= mk + 2; k++) for (let i = mi - 2; i <= mi + 2; i++) if (!g.has(i, jRoof - 1, k)) g.set(i, jRoof - 1, k, P.brass);
  for (let k = mk - 1; k <= mk + 1; k++) for (let i = mi - 1; i <= mi + 1; i++) for (let j = jRoof - 3; j <= jRoof - 2; j++) g.set(i, j, k, j === jRoof - 3 && i === mi && k === mk ? 0xfff4d0 : 0xffd890, 3);
  g.set(mi, jRoof - 4, mk, P.brassD);
  const li = inL + 1, lk = inB + 1;
  for (let j = jFloor + 1; j < jFloor + 10; j++) { g.set(li, j, lk, P.ironD); g.set(li + 1, j, lk, P.iron); g.set(li, j, lk + 1, P.iron); g.set(li + 1, j, lk + 1, P.ironD); }
  for (let t = 0; t < 5; t++) g.set(li + 1 + Math.round(t * 0.6), jFloor + 10 + t, lk + 1, P.brassL);
  g.set(li + 4, jFloor + 15, lk + 1, 0xd83a2a, 1); g.set(li + 4, jFloor + 14, lk + 1, 0xb02a1e);
  yield 'inside';
  // 6. the zone
  if (P.frost) {
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      for (let j = H - 1; j >= 0; j--) {
        if (!g.has(i, j, k)) continue;
        if (hv(i, j, k, 411) < 0.8) g.set(i, j, k, hv(i, k, 412) < 0.3 ? 0xd8eef8 : 0xf2fbff, 1);
        break;
      }
    }
    // icicles off the roof rim
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      if (role[ri(i, jRoof, k)] !== 1 || hv(i, k, 413) > 0.28) continue;
      const rim = role[ri(Math.max(0, i - 1), jRoof, k)] === 0 || role[ri(Math.min(W - 1, i + 1), jRoof, k)] === 0 || role[ri(i, jRoof, Math.max(0, k - 1))] === 0 || role[ri(i, jRoof, Math.min(D - 1, k + 1))] === 0;
      if (!rim) continue;
      const n = 2 + Math.floor(hv(i, k, 414) * 4);
      for (let t = 1; t <= n; t++) if (!g.has(i, jRoof - t, k)) g.set(i, jRoof - t, k, t === n ? 0xffffff : 0xcfeeff, t === n ? 2 : 1);
    }
  }
  if (P.soot) {
    for (let k = 0; k < D; k++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = g.color(i, j, k);
      if (c < 0) continue;
      // soot: streaks darkening toward the top
      if (hv(i >> 1, j >> 3, k >> 1, 421) < 0.06 + (j / H) * 0.22) g.set(i, j, k, shade(c, 0.68));
    }
  }
  if (P.crystal) {
    // glowing crystal studs on the roof corners
    for (const key of ['lb', 'rb', 'lf', 'rf']) {
      const b = posts[key], ci = (b[0] + b[2]) >> 1, ck = (b[1] + b[3]) >> 1;
      const col = P.crystal[(ci + ck) & 1];
      for (let t = 0; t < 2; t++) { g.set(ci, jTop + 1 + t, ck, t === 1 ? 0xffffff : col, t === 1 ? 3 : 2); if (t === 0) { g.set(ci + 1, jTop + 1, ck, col, 2); g.set(ci, jTop + 1, ck + 1, col, 2); } }
    }
  }
  return { grid: g, pivot: [0, 0, 0], origin: [ox / 8, oy / 8, oz / 8], main: [0.6, 0.45, 0.2] };
}

// ---------------------------------------------------------------- the cage's cable and head wheel
/** A steel cable sheathing the generator's cable column, over a head wheel at the top (0.075 m voxels). */
export function buildCable(S, zone) {
  const P = liftPal(zone);
  if (!S.cable) return null;
  const [cx, cz, c0, c1] = S.cable;
  const u = 0.075; // a hair wider than the 1/8 m timber line it sheathes (2 × 0.075 > 0.125)
  const y0 = c0 / 8 - 0.02, y1 = (c1 + 1) / 8;
  const n = Math.ceil((y1 - y0) / u);
  const R = 4, mid = 2 * R; // cable columns mid, mid+1; the wheel to their left, its rim touching the cable
  const g = new PGrid(2 * R + 3, n + 2, 4);
  for (let j = 0; j < n; j++) for (let i = mid; i <= mid + 1; i++) for (let k = 1; k <= 2; k++) g.set(i, j, k, ((j + i + k) % 3 === 0) ? CABLE_D : CABLE);
  // a shackle where it meets the cage roof
  for (let k = 0; k <= 3; k++) for (let i = mid - 1; i <= mid + 2; i++) g.set(i, 0, k, P.ironD);
  // the head wheel (axis along z) high in the shaft
  const wx = mid + 1 - R, wc = n - R - 1;
  for (let j = wc - R - 1; j <= wc + R + 1; j++) for (let i = 0; i < mid; i++) {
    const d = Math.hypot(i + 0.5 - wx, j + 0.5 - wc);
    if (d > R + 0.2) continue;
    const rim = d > R - 1.1, spoke = Math.abs(i + 0.5 - wx) < 0.8 || Math.abs(j + 0.5 - wc) < 0.8, hub = d < 1.4;
    if (!(rim || spoke || hub)) continue;
    const c = hub ? P.brassL : rim ? P.ironD : P.brassD;
    g.set(i, j, 1, c); g.set(i, j, 2, rim ? P.iron : c);
  }
  // its axle bracket up to the shaft's top
  for (let j = wc; j < n + 2; j++) { g.set(Math.floor(wx), j, 0, P.ironD); g.set(Math.floor(wx), j, 3, P.ironD); }
  return { grid: g, pivot: [mid + 1, 0, 2], scale: u, origin: [(cx + 0.5) / 8, y0, (cz + 0.5) / 8], main: [0.5, 0.52, 0.55] };
}

// ---------------------------------------------------------------- the room lantern in its frame
export function buildLamp(S, zone) {
  const P = liftPal(zone);
  const lb = S.lamp;
  if (!lb) return null;
  // ceiling straight above the lamp
  let vc = lb[4] + 1;
  const mx = (lb[0] + lb[3]) >> 1, mz = (lb[2] + lb[5]) >> 1;
  while (vc < lb[4] + 24 && !S.solid(mx, vc, mz)) vc++;
  const ox = lb[0] - 2, oy = lb[1] - 2, oz = lb[2] - 2;
  const W = (lb[3] - ox + 3) * 2, H = (vc - oy + 1) * 2, D = (lb[5] - oz + 3) * 2;
  const g = new PGrid(W, H, D);
  const i0 = (lb[0] - ox) * 2 - 1, i1 = (lb[3] - ox) * 2 + 2, j0 = (lb[1] - oy) * 2 - 1, j1 = (lb[4] - oy) * 2 + 2, k0 = (lb[2] - oz) * 2 - 1, k1 = (lb[5] - oz) * 2 + 2;
  for (const i of [i0, i1]) for (const k of [k0, k1]) for (let j = j0; j <= j1; j++) g.set(i, j, k, P.ironD);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { g.set(i, j0, k, P.ironD); g.set(i, j1, k, i === i0 || i === i1 || k === k0 || k === k1 ? P.brass : P.brassD); }
  for (let k = k0 + 1; k <= k1 - 1; k++) for (let i = i0 + 1; i <= i1 - 1; i++) g.set(i, j1 + 1, k, P.brass);
  const ci = (i0 + i1) >> 1, ck = (k0 + k1) >> 1;
  g.set(ci, j1 + 2, ck, P.brassL); g.set(ci, j0 - 1, ck, P.brassD);
  // mid bar round the glass
  const jm = (j0 + j1) >> 1;
  for (let i = i0; i <= i1; i++) { g.set(i, jm, k0, P.iron); g.set(i, jm, k1, P.iron); }
  for (let k = k0; k <= k1; k++) { g.set(i0, jm, k, P.iron); g.set(i1, jm, k, P.iron); }
  // chain to the ceiling
  for (let j = j1 + 3; j < H; j++) g.set(ci, j, ck, (j & 1) ? P.iron : P.ironD);
  for (let j = j1 + 3; j < H; j += 2) g.set(ci + 1, j, ck, P.ironD);
  return { grid: g, pivot: [0, 0, 0], origin: [ox / 8, oy / 8, oz / 8], main: [0.3, 0.3, 0.32] };
}

// ---------------------------------------------------------------- the bell (wall mount: +z out of the wall)
function drawBell(g, P, cx, top, cz, rope) {
  const prof = [1.2, 1.9, 2.2, 2.4, 2.6, 2.9, 3.3];
  for (let t = 0; t < prof.length; t++) {
    const y = top - t, R = prof[t];
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > R + 0.15) continue;
      const mouth = t === prof.length - 1 && d < R - 1;
      g.set(cx + dx, y, cz + dz, mouth ? 0x2a2014 : dx - dz > 1.5 ? P.brassL : dx - dz < -2 ? P.brassD : P.brass);
    }
  }
  g.set(cx, top + 1, cz, P.ironD);
  // clapper and pull rope with a wooden toggle
  const yb = top - prof.length;
  g.set(cx, yb, cz, P.ironD);
  for (let y = yb - 1; y > yb - 1 - rope; y--) g.set(cx, y, cz, (y >> 1) & 1 ? ROPE : ROPE_D);
  const ye = yb - 1 - rope;
  g.set(cx - 1, ye, cz, P.wood); g.set(cx, ye, cz, P.woodD); g.set(cx + 1, ye, cz, P.wood);
}

// ---------------------------------------------------------------- builders merged into BUILD
export const LIFT_BUILD = {
  /** Bell on an iron bracket (wall mount), v = zone, p = rope length (prop voxels). */
  bell(r, v, p) {
    const P = liftPal(v);
    const rope = p || 8;
    const g = new PGrid(9, 18 + rope, 11);
    const top = 14 + rope; // hook row
    g.box(3, top - 2, 0, 3, 5, 1, P.ironD); // wall plate
    for (let z = 1; z <= 7; z++) g.set(4, top + 1, z, P.iron); // arm
    g.set(4, top + 2, 2, P.ironD); g.set(4, top + 2, 3, P.ironD); g.set(4, top + 1, 8, P.ironD); // brace + curl
    g.set(4, top, 7, P.ironD); // hook
    drawBell(g, P, 4, top - 1, 7, rope);
    const hookY = (top + 0.5 - (top + 1)) / 16;
    return { grid: g, pivot: [4.5, top + 1, 0], sway: (x, y, z) => (z > 0.3 ? (hookY - y) / 1.2 : 0), main: [0.75, 0.6, 0.25] };
  },
  /** Enamel name plaque (wall mount, 1/32 m voxels), v = zone, p = the name. */
  plaque(r, v, p) {
    const P = liftPal(v);
    const lines = plaqueLines(p);
    const tw = Math.max(...lines.map((l) => l.length)) * 4 - 1;
    const W = tw + 10, H = lines.length * 6 + 9; // rim 2, enamel 1, cream line 1, gap 1 on each side
    const g = new PGrid(W, H, 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const rim = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      const bevel = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      g.set(x, y, 0, P.brassD);
      g.set(x, y, 1, rim ? (bevel ? P.brassD : P.brass) : P.enamel);
      if (rim && !bevel) g.set(x, y, 2, (x + y) % 6 === 0 ? P.brassL : P.brass);
    }
    // a thin cream line inside the rim
    for (let x = 3; x < W - 3; x++) { g.set(x, 3, 2, 0xe8dcc0); g.set(x, H - 4, 2, 0xe8dcc0); }
    for (let y = 3; y < H - 3; y++) { g.set(3, y, 2, 0xe8dcc0); g.set(W - 4, y, 2, 0xe8dcc0); }
    lines.forEach((line, li) => {
      const x0 = Math.floor((W - (line.length * 4 - 1)) / 2);
      const y0 = H - 10 - li * 6; // bottom row of this line (top line first)
      for (let ci = 0; ci < line.length; ci++) {
        const f = FONT[line[ci]] || FONT[' '];
        for (let ry = 0; ry < 5; ry++) for (let rx = 0; rx < 3; rx++) if (f[ry * 3 + rx] === '1') g.set(x0 + ci * 4 + rx, y0 + 4 - ry, 2, 0xf6f0de, 1);
      }
    });
    // two screws
    g.set(1, H >> 1, 3, P.brassL); g.set(W - 2, H >> 1, 3, P.brassL);
    return { grid: g, pivot: [W / 2, H / 2, 0], scale: 1 / 32, main: [0.3, 0.35, 0.6] };
  },
  /** Counterweight in its guides, its cable up over a pulley and on into the shaft. v = zone, p = room height (prop voxels). */
  counter(r, v, p) {
    const P = liftPal(v);
    const Hc = Math.max(28, p || 36);
    const g = new PGrid(26, Hc + 3, 16);
    const zc = 8, x0 = 3; // guide line
    for (const gz of [zc - 6, zc + 5]) for (let y = 0; y < Hc + 2; y++) { g.set(x0, y, gz, P.ironD); g.set(x0 + 1, y, gz, P.iron); g.set(x0, y, gz + 1, P.iron); g.set(x0 + 1, y, gz + 1, P.ironD); }
    // brackets bolting the guides to the floor and roof
    for (const gz of [zc - 6, zc + 5]) { g.box(x0 - 1, 0, gz - 1, 4, 1, 4, P.ironD); g.box(x0 - 1, Hc, gz - 1, 4, 2, 4, P.ironD); }
    // the weight: iron block with hazard stripes and brass bands, a lifting eye
    const wy0 = 15, wy1 = 25;
    for (let y = wy0; y <= wy1; y++) for (let z = zc - 4; z <= zc + 4; z++) for (let x = x0 - 2; x <= x0 + 3; x++) {
      const band = y === wy0 || y === wy1;
      const stripe = !band && y >= wy0 + 2 && y <= wy0 + 4 && ((x + z + y) >> 1) % 2 === 0;
      g.set(x, y, z, band ? P.brass : stripe ? 0xe0a830 : hv(x, y, z, 431) < P.rustK ? P.rust : P.iron);
    }
    g.set(x0, wy1 + 1, zc, P.ironD); g.set(x0 + 1, wy1 + 1, zc, P.ironD); g.set(x0, wy1 + 2, zc, P.iron);
    // pulley wheel (axis along z) near the roof
    const wx = x0 + 3.5, wyc = Hc - 5, R = 3.5;
    for (let y = wyc - 4; y <= wyc + 4; y++) for (let x = Math.floor(wx - 4); x <= Math.ceil(wx + 4); x++) {
      const d = Math.hypot(x - wx, y - wyc);
      if (d > R + 0.2) continue;
      const rim = d > R - 1.1, spoke = Math.abs(x - wx) < 0.6 || Math.abs(y - wyc) < 0.6, hub = d < 1.2;
      if (!(rim || spoke || hub)) continue;
      const c = hub ? P.brassL : rim ? (d > R - 0.4 ? P.ironD : P.iron) : P.brassD;
      g.set(x, y, zc, c); g.set(x, y, zc - 1, rim ? P.ironD : c);
    }
    // its fork from the roof
    for (let y = wyc; y <= Hc + 1; y++) { g.set(Math.round(wx), y, zc - 3, P.ironD); g.set(Math.round(wx), y, zc + 2, P.ironD); }
    g.box(Math.round(wx) - 1, Hc, zc - 3, 3, 2, 6, P.ironD);
    // the cable: up from the weight to the wheel, over it, and away toward the shaft
    for (let y = wy1 + 2; y <= wyc; y++) g.set(x0, y, zc, (y & 1) ? CABLE : CABLE_D);
    for (let x = Math.round(wx); x < 26; x++) g.set(x, wyc + 4, zc, (x & 1) ? CABLE : CABLE_D);
    return { grid: g, pivot: [x0 + 0.5, 0.5, zc + 0.5], main: [0.3, 0.3, 0.32] };
  },
  /** Burlap sacks, two or three in a heap. */
  sack(r, v) {
    const g = new PGrid(16, 11, 14);
    const tone = (x, y, z) => (((x + y + z) & 1) ? 0xb89a6a : 0xa88a5a);
    const n = 2 + (v % 2);
    const spots = [[5, 3.6, 5], [10.5, 3.4, 8], [7.5, 7.4, 6.5]];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = spots[i];
      g.ell(x, y, z, 3.6, 3.4, 3.2, (xx, yy, zz) => (hv(xx, yy, zz, 441 + i) < 0.06 ? 0x8a6a42 : tone(xx, yy, zz)));
      g.set(x, y + 3.6, z, 0x7a5a3a); g.set(x, y + 4.4, z, 0x8a6a42); g.set(x + 1, y + 4.6, z, 0x9a7a52);
    }
    g.set(4, 2, 1, 0xd8c8a0); g.set(5, 2, 1, 0xd8c8a0); // a patch
    return { grid: g, pivot: [8, 0.5, 7], main: [0.6, 0.5, 0.35] };
  },
  /** A plank bench. */
  bench(r, v) {
    const P = liftPal(v || 1);
    const g = new PGrid(16, 8, 6);
    g.box(0, 6, 0, 16, 1, 6, (x, y, z) => (z === 0 || z === 5 ? P.woodD : x % 5 === 4 ? P.woodD : P.wood));
    for (const x of [1, 13]) g.box(x, 0, 1, 2, 6, 4, (xx, y) => (y === 0 ? P.woodD : P.wood));
    g.box(3, 2, 2, 10, 1, 2, P.woodD);
    return { grid: g, pivot: [8, 0.5, 3], main: [0.45, 0.32, 0.2] };
  },
  /** An iron brazier full of glowing coals. */
  brazier(r, v) {
    const g = new PGrid(10, 11, 10);
    for (const [x, z] of [[2, 2], [7, 2], [4.5, 7]]) g.line(x, 0, z, 4.5 + (x - 4.5) * 0.4, 5, 4.5 + (z - 4.5) * 0.4, 0x2e2c2c);
    for (let y = 5; y <= 8; y++) for (let z = 0; z < 10; z++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, z - 4.5), R = 2.6 + (y - 5) * 0.5;
      if (d > R + 0.4) continue;
      if (y === 5 || d > R - 0.7) g.set(x, y, z, y === 8 ? 0x4a4644 : 0x2e2c2c);
      else if (y >= 7) g.set(x, y, z, hv(x, y, z, 451) < 0.4 ? 0xffc040 : 0xff6a10, 3);
    }
    g.set(4, 9, 4, 0x3a2a20); g.set(5, 9, 5, 0xffa030, 3);
    return { grid: g, pivot: [4.5, 0.5, 4.5], light: { c: [1.4, 0.55, 0.15], r: 3.6, at: [0, 0.55, 0], lava: true }, emit: { k: 'smolder', at: [0, 0.55, 0], spread: 0.12 }, main: [0.25, 0.2, 0.18] };
  },
  /** Railing along x (p = length in prop voxels), for the shaft stops' landings. */
  railing(r, v, p) {
    const P = liftPal(v || 1);
    const Lr = p || 16;
    const g = new PGrid(Lr + 2, 17, 3);
    for (let x = 0; x <= Lr; x += 8) { g.box(x, 0, 0, 2, 15, 2, (xx, y) => (y < 2 ? P.ironD : P.brass)); g.box(x, 15, 0, 2, 1, 2, P.brassL); }
    g.box(Lr, 0, 0, 2, 15, 2, (xx, y) => (y < 2 ? P.ironD : P.brass)); g.box(Lr, 15, 0, 2, 1, 2, P.brassL);
    for (let x = 0; x < Lr + 2; x++) { g.set(x, 14, 0, P.brass); g.set(x, 14, 1, P.brassD); g.set(x, 8, 0, P.iron); g.set(x, 8, 1, P.ironD); }
    for (let x = 2; x < Lr; x += 3) for (let y = 9; y < 14; y++) if (!g.has(x, y, 0)) g.set(x, y, 0, P.ironD);
    return { grid: g, pivot: [(Lr + 2) / 2, 0.5, 1], main: [0.6, 0.45, 0.2] };
  },
  /** A tall brass gate post with a glowing globe on top. */
  gatepost(r, v) {
    const P = liftPal(v || 1);
    const g = new PGrid(5, 26, 5);
    g.box(0, 0, 0, 5, 2, 5, P.ironD);
    g.box(1, 2, 1, 3, 18, 3, (x, y, z) => (y % 6 === 0 ? P.brassL : x === 2 || z === 2 ? P.brassL : P.brass));
    g.box(0, 20, 0, 5, 1, 5, P.brassD);
    g.ell(2, 22.5, 2, 1.8, 1.8, 1.8, (x, y) => (y > 23 ? 0xfff4d0 : 0xffd890), 3);
    g.set(2, 25, 2, P.brassD);
    return { grid: g, pivot: [2.5, 0.5, 2.5], main: [0.7, 0.55, 0.25] };
  },
  /** A post with a bell on an arm and its pull rope (the shaft stops' call bell). */
  bellpost(r, v) {
    const P = liftPal(v || 1);
    const g = new PGrid(14, 30, 5);
    g.box(0, 0, 0, 4, 2, 4, P.ironD);
    g.box(1, 2, 1, 2, 26, 2, (x, y) => (y % 7 === 0 ? P.brassL : P.wood));
    for (let x = 3; x <= 9; x++) g.set(x, 26, 1, P.iron);
    g.set(9, 25, 1, P.ironD);
    drawBell(g, P, 9, 24, 1, 6);
    return { grid: g, pivot: [2, 0.5, 2], main: [0.6, 0.45, 0.25] };
  },
  /** A plank deck strip with a brass nosing on its front edge (p = width in prop voxels). */
  deck(r, v, p) {
    const P = liftPal(v || 1);
    const Wd = p || 40;
    const g = new PGrid(Wd, 2, 10);
    for (let x = 0; x < Wd; x++) for (let z = 0; z < 10; z++) {
      g.set(x, 0, z, P.woodD);
      g.set(x, 1, z, z >= 8 ? (z === 9 ? P.brassD : P.brass) : (x % 6 === 5 ? P.woodD : (z & 1) && x % 6 === 2 ? P.ironL : P.wood));
    }
    return { grid: g, pivot: [Wd / 2, 1, 5], main: [0.45, 0.32, 0.2] };
  },
};

// ---------------------------------------------------------------- layouts
/**
 * Where everything goes for one lift: a list of { type, v, p, x, y, z, yaw, mount, sup: [vx, vy, vz],
 * custom?: fn, lift: true } in world metres. Pieces whose floor is missing are left out.
 */
export function liftLayout(S, L) {
  const it = liftLayoutSteps(S, L);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
/** liftLayout as a generator: yields between the heavy pieces (cage, cable + lamp). */
export function* liftLayoutSteps(S, L) {
  const out = [];
  const zone = L.zone || 1;
  const fl = (x, z) => S.floorAt(x, z);
  const sup = (x, y, z) => [Math.floor(x * 8), Math.floor(y * 8) - 1, Math.floor(z * 8)];
  const floorProp = (type, v, p, lx, lz, yaw = 0, extra = {}) => {
    const x = L.x + lx, z = L.z + lz, y = fl(x, z);
    if (y !== y || Math.abs(y - L.y) > 0.4) return;
    out.push({ type, v, p, x, y, z, yaw, mount: 'floor', sup: sup(x, y, z), ...extra });
  };
  const ceilProp = (type, v, p, lx, lz) => {
    const x = L.x + lx, z = L.z + lz, y = S.ceilAt(x, z);
    if (y !== y) return;
    out.push({ type, v, p, x, y, z, yaw: (lx * 7 + lz * 3) % 6.28, mount: 'ceil', sup: [Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8)] });
  };
  if (L.id[0] === 's') return stopLayout(S, L, out);
  // the cage, skinned from the voxels
  let cage = null;
  if (S.cage.length) { const g = buildCageSteps(S, zone); let r; while (!(r = g.next()).done) yield r.value; cage = r.value; }
  if (cage) out.push({ type: 'cage', custom: () => cage, key: `cage:${L.id}:${S.hash}:${zone}`, x: cage.origin[0], y: cage.origin[1], z: cage.origin[2], yaw: 0, mount: 'floor', sup: null, cageSup: true });
  yield 'cage';
  const cable = buildCable(S, zone);
  if (cable) out.push({ type: 'liftlamp', custom: () => cable, key: `cable:${L.id}:${S.cable.join(',')}:${zone}`, x: cable.origin[0], y: cable.origin[1], z: cable.origin[2], yaw: 0, mount: 'ceil', sup: null, cageSup: true });
  const lamp = S.lamp ? buildLamp(S, zone) : null;
  if (lamp) out.push({ type: 'liftlamp', custom: () => lamp, key: `lamp:${L.id}:${S.lamp.join(',')}:${zone}`, x: lamp.origin[0], y: lamp.origin[1], z: lamp.origin[2], yaw: 0, mount: 'ceil', sup: [S.lamp[0], S.lamp[1], S.lamp[2]] });
  yield 'lamp';
  // the post faces from the actual cage voxels (shell = one prop voxel outside)
  let minX = 1e9, maxZ = -1e9, frontPostZ = 0, n = 0, bandLo = 1e9;
  for (const [vx, vy, vz, r] of S.cage) {
    const dx = (vx + 0.5) / 8 - L.x, dz = (vz + 0.5) / 8 - L.z, dy = (vy + 0.5) / 8 - L.y;
    if (r === 3 && dx < 0 && dz > 0) { minX = Math.min(minX, vx / 8 - 1 / 16); frontPostZ += (vz + 0.5) / 8; n++; }
    if (dz > 0.5) maxZ = Math.max(maxZ, (vz + 1) / 8 + 1 / 16);
    if (r === 2 && dz > 0.58 && dy > 1.85) bandLo = Math.min(bandLo, vy / 8 - 1 / 16);
  }
  if (n) {
    frontPostZ /= n;
    out.push({ type: 'bell', v: zone, p: 8, x: minX, y: L.y + 1.72, z: frontPostZ, yaw: -Math.PI / 2, mount: 'wall', sup: null, cageSup: true });
  }
  if (maxZ > -1e8) {
    const lines = plaqueLines(L.name);
    const h = (lines.length * 6 + 9) / 32;
    const ceil = S.ceilAt(L.x, maxZ + 0.05);
    const top = (ceil === ceil ? Math.min(ceil, L.y + 2.4) : L.y + 2.3) - 0.03;
    const yc = Math.max(top - h / 2, (bandLo < 1e8 ? bandLo : L.y + 1.85) + h / 2 - 0.12);
    out.push({ type: 'plaque', v: zone, p: L.name, x: L.x, y: yc, z: maxZ + 0.002, yaw: 0, mount: 'wall', sup: null, cageSup: true });
  }
  // counterweight + pulley on the left, between the cage and the wall
  {
    const x = L.x - 1.1, z = L.z, y = fl(x, z), c = S.ceilAt(x, z);
    if (y === y && c === c && c - y > 1.7) out.push({ type: 'counter', v: zone, p: Math.round((c - y) * 16), x, y, z, yaw: 0, mount: 'floor', sup: sup(x, y, z) });
  }
  // room furniture (never in front of the door: the path out of the cage runs along +z, |x| < 0.75)
  floorProp('crate', (L.x * 7 | 0) & 1, 0, -1.06, -1.06, 0.15);
  floorProp('sack', zone % 2, 0, 1.04, -1.04, -0.6);
  floorProp('bench', zone, 0, 1.17, -0.05, -Math.PI / 2);
  floorProp('barrel', 1, 0, 1.1, 1.1, 0.4);
  // the zone
  if (zone === 1) { floorProp('mush', 0, 0, -1.18, 1.18, 0.3); ceilProp('roots', 0, 12, -1.15, -1.15); ceilProp('roots', 1, 8, 1.15, 0.6); }
  else if (zone === 2) { floorProp('urn', 1, 0, -1.12, 1.12, 0.3); ceilProp('roots', 2, 8, 1.15, -1.15); ceilProp('vine', 0, 10, -1.15, -1.15); }
  else if (zone === 3) { floorProp('crystal', 1, 'cyan', -1.12, 1.12, 0.2); ceilProp('glowthread', 0, 12, -1.1, -1.1); ceilProp('glowthread', 1, 10, 1.15, 0.5); }
  else if (zone === 4) { floorProp('brazier', 0, 0, -1.12, 1.12, 0); floorProp('charred', 1, 0, -0.1, -1.18, 0); }
  else if (zone === 5) { floorProp('frozen', 1, 0, -1.12, 1.12, 0.4); ceilProp('icicle', 0, 10, -1.15, -1.15); ceilProp('icicle', 1, 8, 1.15, 0.5); ceilProp('icicle', 2, 6, -1.15, -0.4); }
  else { floorProp('shard', 0, 9, -1.12, 1.12, 0); floorProp('shard', 1, 13, -1.2, 0.75, 0.6); floorProp('shard', 2, 7, 1.2, 0.45, 1.1); }
  return out;
}

/** The town shaft stops: a landing on the shaft side (local +z points at the shaft). */
function stopLayout(S, L, out) {
  // which way is the shaft? (the stops sit beside it; their room opens toward it)
  const sx = S.shaftX, sz = S.shaftZ;
  let fx = sx - L.x, fz = sz - L.z;
  const fl0 = Math.hypot(fx, fz) || 1;
  fx /= fl0; fz /= fl0;
  const yaw = Math.atan2(fx, fz);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const W = (lx, lz) => [L.x + lx * c + lz * s, L.z - lx * s + lz * c];
  const zone = L.zone || 1;
  const edge = Math.max(0.8, Math.min(1.6, fl0 - 1.15)); // where the floor ends toward the shaft
  const put = (type, v, p, lx, lz, yawL = 0, mount = 'floor') => {
    const [x, z] = W(lx, lz);
    const y = S.floorAt(x, z);
    if (y !== y || Math.abs(y - L.y) > 0.4) return;
    out.push({ type, v, p, x, y, z, yaw: yaw + yawL, mount, sup: [Math.floor(x * 8), Math.floor(y * 8) - 1, Math.floor(z * 8)] });
  };
  put('deck', zone, 44, 0, edge - 0.32);
  put('railing', zone, 14, -1.02, edge - 0.12);
  put('railing', zone, 14, 1.02, edge - 0.12);
  put('gatepost', zone, 0, -0.58, edge - 0.12);
  put('gatepost', zone, 0, 0.58, edge - 0.12);
  put('bellpost', zone, 0, 0.85, edge - 0.55, Math.PI);
  put('bench', zone, 0, 0.55, -1.42, 0);
  put('crate', 0, 0, -1.3, -1.28, 0.2);
  put('sack', 1, 0, 1.3, -1.25, 0.5);
  // the lamp over the landing (the plan's light is already there)
  const cy = S.ceilAt(L.x, L.z, L.y + 1.2);
  if (cy === cy && cy - L.y > 1.9) out.push({ type: 'lanternC', v: 0, p: Math.max(1, Math.min(30, Math.round((cy - L.y - 1.7) * 16 - 5.5))), x: L.x, y: cy, z: L.z, yaw, mount: 'ceil', sup: [Math.floor(L.x * 8), Math.floor(cy * 8), Math.floor(L.z * 8)], noLight: true });
  // the plaque on the back wall, facing the shaft
  const [bx, bz] = W(0, 0);
  const back = S.wallAlong(bx, L.y + 1.4, bz, -fx, -fz);
  if (back < 2.6) {
    const [px, pz] = W(0, -back + 0.002);
    out.push({ type: 'plaque', v: zone, p: L.name, x: px, y: L.y + 1.45, z: pz, yaw, mount: 'wall', sup: [Math.floor((px - fx * 0.1) * 8), Math.floor((L.y + 1.45) * 8), Math.floor((pz - fz * 0.1) * 8)] });
  }
  return out;
}
