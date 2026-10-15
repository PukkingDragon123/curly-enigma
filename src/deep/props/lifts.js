// The old miners' lifts, dressed simply: a dark iron cage skinned over the generator's timber cage
// (built from the actual voxels, so it covers them however the lift sits on the voxel grid) with
// grilles, a folded grille door on the open (+z) side, a worn plank floor and one warm lamp, and an
// enamel plaque with the lift's name in pixel letters. The town shaft stops get a plank landing with
// railings, their plaque and a lamp.
//
// Model builders here are merged into BUILD (./models.js); liftSnapshot / liftLayout are used by
// Props.js to place everything.
import { PGrid, hv, shade } from './grid.js';
import { OPAQUE } from '../Mesher.js';
import { M, VOX } from '../materials.js';

// ---------------------------------------------------------------- palettes per zone
// one sober palette everywhere: dark iron, dimmed brass trim, worn wood; only the plaque's enamel
// changes with the zone
const BASE = { brass: 0x7a6234, brassL: 0x9a7e46, brassD: 0x4e3e22, iron: 0x3c3f44, ironL: 0x5c6066, ironD: 0x26282c, rust: 0x5e3a26, rustL: 0x744a30, rustK: 0.05, patina: 0x4a5a50, patK: 0, wood: 0x6a4e34, woodD: 0x4a3624, woodL: 0x7a5c3e };
const ENAMEL = [0x2a4a3a, 0x2a4a3a, 0x6a2a24, 0x1f3e66, 0x2e2826, 0x2a4a6e, 0x34225a];
const ZPAL = {};
for (let z = 1; z <= 6; z++) ZPAL[z] = { ...BASE, enamel: ENAMEL[z] };
export const liftPal = (zone) => ZPAL[zone] || ZPAL[1];

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
 * The voxels of a lift's timber cage that still stand (by the generator's own pattern), in 1/8 m
 * cells (the cage builders' grid, whatever the world's voxel size), plus floor / ceiling / wall
 * queries at the world's own resolution. `cage` is false for the shaft stops.
 */
export function liftSnapshot(world, L, cage = true) {
  const it = liftSnapshotSteps(world, L, cage);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
/** liftSnapshot as a generator (yields every few slices of voxels). */
export function* liftSnapshotSteps(world, L, cage = true) {
  const K = Math.max(1, Math.round(VOX / 8)); // world voxels per 1/8 m cell
  const CSZ = 32, CB = 5; // chunk size (voxels) and its log2
  // just the cage's own box
  const x0 = Math.floor((L.x - 0.75) * 8), x1 = Math.ceil((L.x + 0.75) * 8);
  const y0 = Math.floor((L.y - 0.1) * 8), y1 = Math.ceil((L.y + 2.15) * 8);
  const z0 = Math.floor((L.z - 0.75) * 8), z1 = Math.ceil((L.z + 0.75) * 8);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
  const roles = cage ? new Uint8Array(nx * ny * nz) : null;
  const S = { L, cage: [], hash: 0 };
  let h = 0;
  if (cage) {
    // a cell takes the highest cage role of any of its timber voxels, so the skin covers every bit of the cage
    const wx0 = x0 * K, wx1 = (x1 + 1) * K;
    for (let wz = z0 * K; wz < (z1 + 1) * K; wz++) {
      for (let wy = y0 * K; wy < (y1 + 1) * K; wy++) {
        const cyi = Math.floor(wy / K) - y0, czi = Math.floor(wz / K) - z0;
        const dy = (wy + 0.5) / VOX - L.y, dz = (wz + 0.5) / VOX - L.z;
        let wx = wx0;
        while (wx < wx1) {
          const ch = world.chunk(wx >> CB, wy >> CB, wz >> CB);
          const run = Math.min(wx1 - wx, CSZ - (wx & (CSZ - 1)));
          const vox = ch && ch.vox; // virtual (solid), pending and unloaded chunks: no timber
          if (vox) {
            const base = (wx & (CSZ - 1)) + CSZ * ((wy & (CSZ - 1)) + CSZ * (wz & (CSZ - 1)));
            for (let q = 0; q < run; q++) {
              if (vox[base + q] !== M.TIMBER) continue;
              const vx = wx + q;
              const role = cageRole((vx + 0.5) / VOX - L.x, dy, dz);
              const ci = (Math.floor(vx / K) - x0) + nx * (cyi + ny * czi);
              if (role > roles[ci]) roles[ci] = role;
            }
          }
          wx += run;
        }
      }
      if ((wz & 7) === 7) yield 'snapshot';
    }
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const role = roles[x + nx * (y + ny * z)];
      if (!role) continue;
      const vx = x0 + x, vy = y0 + y, vz = z0 + z;
      S.cage.push([vx, vy, vz, role]);
      h = (Math.imul(h ^ (vx * 73856093 ^ vy * 19349663 ^ vz * 83492791), 16777619) + role) | 0;
    }
  }
  S.hash = h >>> 0;
  // floors, ceilings and walls at the world's own resolution
  const solidW = (x, y, z) => OPAQUE[world.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX))] === 1;
  /** Floor surface height (m) under (x, z) near the lift's y, or NaN. */
  S.floorAt = (x, z, from = L.y + 0.4) => {
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    for (let vy = Math.floor(from * VOX); vy > Math.floor((L.y - 0.5) * VOX); vy--) {
      if (OPAQUE[world.voxelAt(vx, vy - 1, vz)] === 1 && OPAQUE[world.voxelAt(vx, vy, vz)] !== 1) return vy / VOX;
    }
    return NaN;
  };
  /** Ceiling height (m) above (x, z), or NaN. */
  S.ceilAt = (x, z, from = L.y + 1.0) => {
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    for (let vy = Math.floor(from * VOX); vy < Math.floor((L.y + 3.0) * VOX); vy++) {
      if (OPAQUE[world.voxelAt(vx, vy + 1, vz)] === 1 && OPAQUE[world.voxelAt(vx, vy, vz)] !== 1) return (vy + 1) / VOX;
    }
    return NaN;
  };
  /** Distance (m) from (x, y, z) to rock along (dx, dz), max 3 m. */
  S.wallAlong = (x, y, z, dx, dz) => {
    for (let t = 0; t < 3; t += 1 / VOX) if (solidW(x + dx * t, y, z + dz * t)) return t;
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
  let n = 0;
  for (const [vx, vy, vz, r] of S.cage) {
    for (let k = pk(vz) - 1; k <= pk(vz) + 2; k++) for (let j = pj(vy) - 1; j <= pj(vy) + 2; j++) for (let i = pi(vx) - 1; i <= pi(vx) + 2; i++) {
      if (i < 0 || j < 0 || k < 0 || i >= W || j >= H || k >= D) continue;
      if (role[ri(i, j, k)] < r) role[ri(i, j, k)] = r;
    }
    if ((++n & 31) === 0) yield 'roles';
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
  let jRoof = 1e9;
  for (const [, vy, , r] of S.cage) if (r === 1) jRoof = Math.min(jRoof, pj(vy) - 1);
  if (jRoof > H) jRoof = H - 6;
  yield 'roles';
  // 2. colour the shell: dark iron, a little rust, dim brass only as thin trim
  const rust = (c, i, j, k) => (hv(i >> 1, j >> 1, k >> 1, 401) < P.rustK ? (hv(i, j, k, 402) < 0.4 ? P.rustL : P.rust) : c);
  for (let k = 0; k < D; k++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (i === 0 && j === 0 && (k & 7) === 7) yield 'shell';
    const r = role[ri(i, j, k)];
    if (!r) continue;
    let c;
    if (r === 3) {
      const b = posts[(i < cx ? 'l' : 'r') + (k < cz ? 'b' : 'f')];
      const eu = i === b[0] || i === b[2], ew = k === b[1] || k === b[3];
      const rj = j - jFloor;
      if (rj < 2) c = P.ironD; // foot
      else if (rj % 12 === 6) c = (eu || ew) && !(eu && ew) && (i + k) % 3 === 0 ? P.brass : P.ironD; // collars, a few brass rivets
      else c = eu && ew ? P.ironD : ((eu ? k : i) & 1) ? P.iron : shade(P.iron, 0.9);
      c = rust(c, i, j, k);
    } else if (r === 2) {
      // a band: iron with a dim brass line along its top
      const up = j + 1 < H && role[ri(i, j + 1, k)] === 2;
      c = !up ? P.brassD : (i + k) % 4 === 0 ? P.ironL : rust(P.iron, i, j, k);
    } else {
      // the roof: iron plate, a dark rim, a rivet grid on top
      const edge = role[ri(Math.max(0, i - 1), j, k)] === 0 || role[ri(Math.min(W - 1, i + 1), j, k)] === 0 || role[ri(i, j, Math.max(0, k - 1))] === 0 || role[ri(i, j, Math.min(D - 1, k + 1))] === 0;
      const top = j + 1 >= H || role[ri(i, j + 1, k)] === 0;
      c = edge ? P.ironD : top && i % 4 === 0 && k % 4 === 0 ? P.ironL : rust(j === jRoof ? P.ironD : P.iron, i, j, k);
    }
    g.set(i, j, k, c);
  }
  yield 'shell';
  // 3. grilles, kick plates and a mid rail on the three closed sides (in the posts' outer plane, one in)
  const bandLo = jFloor + 8, bandHi = jFloor + 10; // ~0.5–0.66 m
  const kick = jFloor + 5;
  const side = (fixed, a, b, along) => {
    // along 'x': plane k = fixed, i from a..b ; along 'z': plane i = fixed, k from a..b
    for (let t = a; t <= b; t++) for (let j = jFloor; j < jRoof; j++) {
      const i = along === 'x' ? t : fixed, k = along === 'x' ? fixed : t;
      if (g.has(i, j, k)) continue;
      let c = -1;
      if (j <= kick) c = j === kick ? P.ironD : rust(P.iron, i, j, k);
      else if (j >= bandLo && j <= bandHi) c = j === bandHi ? P.brassD : P.iron;
      else if ((t - a) % 3 === 1) c = P.ironD; // bars
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
    if (!g.has(i0 + z, j, kf)) g.set(i0 + z, j, kf, P.iron);
  }
  for (let i = posts.lf[2] + 1; i < posts.rf[0]; i++) if (!g.has(i, jFloor, kf)) g.set(i, jFloor, kf, P.ironD);
  // 5. inside: a worn plank floor and one warm lamp under the roof
  const inL = posts.lb[2] + 1, inR = posts.rb[0] - 1, inB = posts.lb[3] + 1, inF = posts.lf[1] - 1;
  for (let k = inB; k <= inF; k++) for (let i = inL; i <= inR; i++) {
    if (g.has(i, jFloor, k)) continue;
    const plank = Math.floor((k - inB) / 3); // planks run along x
    const seam = (k - inB) % 3 === 2;
    const tone = hv(plank, 0, 0, 431) < 0.5 ? P.wood : P.woodL;
    const worn = hv(i >> 1, plank, 0, 432) < 0.18 ? P.woodD : tone; // scuffed patches
    g.set(i, jFloor, k, seam ? P.woodD : (i === inL + 1 || i === inR - 1) && (k - inB) % 3 === 1 ? P.ironD : worn);
  }
  const mi = Math.round(cx), mk = Math.round(cz);
  for (let k = mk - 2; k <= mk + 2; k++) for (let i = mi - 2; i <= mi + 2; i++) if (!g.has(i, jRoof - 1, k)) g.set(i, jRoof - 1, k, P.ironD);
  for (let k = mk - 1; k <= mk + 1; k++) for (let i = mi - 1; i <= mi + 1; i++) for (let j = jRoof - 3; j <= jRoof - 2; j++) g.set(i, j, k, j === jRoof - 3 && i === mi && k === mk ? 0xffe8b0 : 0xffc870, 3);
  for (const [di, dk] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let j = jRoof - 3; j <= jRoof - 2; j++) g.set(mi + di, j, mk + dk, P.ironD);
  g.set(mi, jRoof - 4, mk, P.ironD);
  yield 'inside';
  return { grid: g, pivot: [0, 0, 0], origin: [ox / 8, oy / 8, oz / 8], main: [0.25, 0.26, 0.28] };
}

// ---------------------------------------------------------------- builders merged into BUILD
export const LIFT_BUILD = {
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
  /** Railing along x (p = length in prop voxels), for the shaft stops' landings. */
  railing(r, v, p) {
    const P = liftPal(v || 1);
    const Lr = p || 16;
    const g = new PGrid(Lr + 2, 17, 3);
    for (let x = 0; x <= Lr; x += 8) { g.box(x, 0, 0, 2, 15, 2, (xx, y) => (y < 2 ? P.ironD : P.iron)); g.box(x, 15, 0, 2, 1, 2, P.ironD); }
    g.box(Lr, 0, 0, 2, 15, 2, (xx, y) => (y < 2 ? P.ironD : P.iron)); g.box(Lr, 15, 0, 2, 1, 2, P.ironD);
    for (let x = 0; x < Lr + 2; x++) { g.set(x, 14, 0, P.brassD); g.set(x, 14, 1, P.ironD); g.set(x, 8, 0, P.iron); g.set(x, 8, 1, P.ironD); }
    for (let x = 2; x < Lr; x += 3) for (let y = 9; y < 14; y++) if (!g.has(x, y, 0)) g.set(x, y, 0, P.ironD);
    return { grid: g, pivot: [(Lr + 2) / 2, 0.5, 1], main: [0.25, 0.26, 0.28] };
  },
  /** A plank deck strip with an iron nosing on its front edge (p = width in prop voxels). */
  deck(r, v, p) {
    const P = liftPal(v || 1);
    const Wd = p || 40;
    const g = new PGrid(Wd, 2, 10);
    for (let x = 0; x < Wd; x++) for (let z = 0; z < 10; z++) {
      g.set(x, 0, z, P.woodD);
      g.set(x, 1, z, z >= 8 ? (z === 9 ? P.ironD : P.iron) : (x % 6 === 5 ? P.woodD : (z & 1) && x % 6 === 2 ? P.ironL : hv(x >> 2, z >> 1, 0, 441) < 0.2 ? P.woodD : P.wood));
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
/** liftLayout as a generator: yields while the cage is built. */
export function* liftLayoutSteps(S, L) {
  const out = [];
  const zone = L.zone || 1;
  if (L.id[0] === 's') return stopLayout(S, L, out);
  // the cage, skinned from the voxels
  let cage = null;
  if (S.cage.length) { const g = buildCageSteps(S, zone); let r; while (!(r = g.next()).done) yield r.value; cage = r.value; }
  if (cage) out.push({ type: 'cage', custom: () => cage, key: `cage:${L.id}:${S.hash}:${zone}`, x: cage.origin[0], y: cage.origin[1], z: cage.origin[2], yaw: 0, mount: 'floor', sup: null, cageSup: true });
  yield 'cage';
  // the name plaque over the door (found from the actual cage voxels)
  let maxZ = -1e9, bandLo = 1e9;
  for (const [vx, vy, vz, r] of S.cage) {
    const dz = (vz + 0.5) / 8 - L.z, dy = (vy + 0.5) / 8 - L.y;
    if (dz > 0.5) maxZ = Math.max(maxZ, (vz + 1) / 8 + 1 / 16);
    if (r === 2 && dz > 0.58 && dy > 1.85) bandLo = Math.min(bandLo, vy / 8 - 1 / 16);
  }
  if (maxZ > -1e8) {
    const lines = plaqueLines(L.name);
    const h = (lines.length * 6 + 9) / 32;
    const ceil = S.ceilAt(L.x, maxZ + 0.05);
    const top = (ceil === ceil ? Math.min(ceil, L.y + 2.4) : L.y + 2.3) - 0.03;
    const yc = Math.max(top - h / 2, (bandLo < 1e8 ? bandLo : L.y + 1.85) + h / 2 - 0.12);
    out.push({ type: 'plaque', v: zone, p: L.name, x: L.x, y: yc, z: maxZ + 0.002, yaw: 0, mount: 'wall', sup: null, cageSup: true });
  }
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
    out.push({ type, v, p, x, y, z, yaw: yaw + yawL, mount, sup: [Math.floor(x * VOX), Math.floor(y * VOX) - 1, Math.floor(z * VOX)] });
  };
  put('deck', zone, 44, 0, edge - 0.32);
  put('railing', zone, 14, -1.02, edge - 0.12);
  put('railing', zone, 14, 1.02, edge - 0.12);
  // the lamp over the landing (the plan's light is already there)
  const cy = S.ceilAt(L.x, L.z, L.y + 1.2);
  if (cy === cy && cy - L.y > 1.9) out.push({ type: 'lanternC', v: 0, p: Math.max(1, Math.min(30, Math.round((cy - L.y - 1.7) * 16 - 5.5))), x: L.x, y: cy, z: L.z, yaw, mount: 'ceil', sup: [Math.floor(L.x * VOX), Math.floor(cy * VOX), Math.floor(L.z * VOX)], noLight: true });
  // the plaque on the back wall, facing the shaft
  const [bx, bz] = W(0, 0);
  const back = S.wallAlong(bx, L.y + 1.4, bz, -fx, -fz);
  if (back < 2.6) {
    const [px, pz] = W(0, -back + 0.002);
    out.push({ type: 'plaque', v: zone, p: L.name, x: px, y: L.y + 1.45, z: pz, yaw, mount: 'wall', sup: [Math.floor((px - fx * 0.1) * VOX), Math.floor((L.y + 1.45) * VOX), Math.floor((pz - fz * 0.1) * VOX)] });
  }
  return out;
}
