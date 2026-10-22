// Old Star's dig: the cave chamber the mole tumbles into at the start, a crawl away from the mine
// entrance lift. One layout (prologueLayout) is shared by the stamp below (voxels, run by the chunk
// generator, maybe in a web worker: pure, deterministic, no DOM, imports only materials/noise) and
// by the story (src/deep/Prologue.js: where Old Star sits, which rocks pin him, the ore, the ledge,
// the walk to the lift).
//
// Everything is in meters relative to the feature { kind: 'prologue', x, y, z, to?, lift? } (the
// chamber's floor centre); the lift room (plan.lifts L0) is found from f.lift, or from f.to, which
// the generator puts 1.4 m in from the lift room's north-east corner. Voxel maths goes through VOX.
//
// The chamber: a squarish room Old Star dug over the years (≈ 6.2 × 5.2 m, 2.2–2.6 m high, flat
// floor), the hole in the roof the mole falls through, a ledge (niche) 1.5 m up in the flat east
// wall, flat stretches of wall where his table and his tally marks are, a copper lump in the west
// wall in a pocket of soft loam, a rockfall pinning his legs by the crawl mouth (four rocks and a
// rubble skirt), and the crawl itself: south past the lift room, round into a nook in front of the
// lift room's south wall, with a last plug of loam between the nook and the lift (he was that close).
// A shell around it all is kept solid, so random caves never break the layout.
import { M, MAT, VOX, ORE_BASE } from '../materials.js';
import { makeNoise3D, h3 } from '../noise.js';

export const PROLOGUE_BB = 10; // meters around the centre this feature may touch (the crawl reaches ~9.5)

const NOISE = makeNoise3D(4242);
const ORE_M = (() => { for (let m = ORE_BASE; m < 256; m++) if (MAT[m]?.item === 'copper_ore') return m; return ORE_BASE + 1; })();

const LAYOUTS = new Map();

/**
 * The chamber's layout in world meters (cached per feature position). Points are { x, y, z }.
 *  spawn {x,y,z} (in the roof hole), star {x,y,z,yaw} (Old Star, sitting), rocks [{x,y,z,r,m}],
 *  skirt {x,y,z,rx,ry}, ore {x,y,z,r,item}, ledge {x0,x1,y,y1,z0,z1, wallX}, map {x,y,z},
 *  candle, lantern, table, bedroll, tally {x0,x1,y0,y1,z}, notes {x,y0,y1,z0,z1}, pile, ladder,
 *  tools, crawl [points from the chamber to the nook], nook, nookSide (where he waits),
 *  plug {x0,x1,y0,y1,z0,z1}, cage (inside the lift cage), door (in front of the cage), lift,
 *  room {x0,x1,y0,y1,z0,z1} (the lift room box), box (the chamber's bounds).
 */
export function prologueLayout(f) {
  const key = `${f.x},${f.y},${f.z},${f.lift ? f.lift.x + ',' + f.lift.z : f.to ? f.to.x + ',' + f.to.z : ''}`;
  let L = LAYOUTS.get(key);
  if (L) return L;
  const o = { x: f.x, y: f.y, z: f.z };
  const P = (x, y, z) => ({ x: o.x + x, y: o.y + y, z: o.z + z });
  const lift = f.lift ? { x: f.lift.x, y: f.lift.y, z: f.lift.z } : f.to ? { x: f.to.x - 1.4, y: f.to.y, z: f.to.z + 1.4 } : { x: o.x - 6, y: o.y + 1.5, z: o.z + 6 };
  const LP = (x, y, z) => ({ x: lift.x + x, y: lift.y + y, z: lift.z + z });
  const star = { ...P(-1.6, 0, 1.5), yaw: Math.atan2(0.707, -0.707) }; // sitting, facing the room (north-east)
  const fw = { x: Math.sin(star.yaw), z: Math.cos(star.yaw) }, sd = { x: fw.z, z: -fw.x };
  const near = (fwd, side, y) => ({ x: star.x + fw.x * fwd + sd.x * side, y: o.y + y, z: star.z + fw.z * fwd + sd.z * side });
  // the crawl: from the chamber's south-west out past the lift room's east side, then west into the nook
  const mouth = P(-2.25, 0, 2.45);
  const corner = LP(2.75, 0, 2.6);
  const nook = LP(0, 0, 2.6);
  const crawl = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, s = t * t * (3 - 2 * t);
    crawl.push({ x: mouth.x + (corner.x - mouth.x) * t, y: mouth.y + (corner.y - mouth.y) * s, z: mouth.z + (corner.z - mouth.z) * t });
  }
  L = {
    o, lift,
    box: { x0: o.x - 3.1, x1: o.x + 3.1, y0: o.y, y1: o.y + 2.6, z0: o.z - 2.6, z1: o.z + 2.6 },
    spawn: P(0.5, 3.3, -0.45),
    hole: { ...P(0.45, 0, -0.45), r: 0.62 },
    star,
    rocks: [
      { ...near(0.34, 0, 0.17), r: 0.2, m: M.STONE },
      { ...near(0.3, 0.26, 0.12), r: 0.15, m: M.MUDSTONE },
      { ...near(0.28, -0.26, 0.12), r: 0.15, m: M.STONE },
      { ...near(0.6, 0.06, 0.11), r: 0.16, m: M.MUDSTONE },
    ],
    skirt: { ...near(0.42, 0, 0), rx: 0.55, ry: 0.11 },
    scar: { ...near(0.45, 0, 0), r: 0.5 }, // where the roof came down
    ore: { ...P(-3.19, 0.52, 0.45), r: 0.2, item: 'copper_ore', m: ORE_M, wallX: o.x - 3.1, face: [1, 0, 0] },
    ledge: { x0: o.x + 3.1, x1: o.x + 4.15, y: o.y + 1.5, y1: o.y + 2.5, z0: o.z - 1.45, z1: o.z + 0.25, wallX: o.x + 3.1 },
    ladderZone: { x0: o.x + 2.75, x1: o.x + 3.1, y0: o.y, y1: o.y + 1.55, z0: o.z - 1.5, z1: o.z + 0.3 },
    map: P(3.42, 1.5, -0.62),
    candle: P(3.62, 1.5, -1.15),
    table: { ...P(-2.72, 0, -1.2), yaw: Math.PI / 2 },
    lantern: P(-2.8, 0.62, -1.42),
    bedroll: { ...P(0.95, 0, -2.18), yaw: 0 },
    tally: { x0: o.x - 0.45, x1: o.x + 2.05, y0: o.y + 0.75, y1: o.y + 1.65, z: o.z - 2.6 },
    notes: { x: o.x - 3.1, y0: o.y + 0.75, y1: o.y + 1.55, z0: o.z - 1.85, z1: o.z - 0.55 },
    pile: P(-2.45, 0, -2.05),
    ladder: { ...P(2.45, 0, -0.55), yaw: 0 },
    tools: P(2.55, 0, 2.0),
    stool: P(-2.1, 0, -0.55),
    mouth, corner, nook, crawl,
    nookSide: LP(-0.62, 0, 2.78),
    plug: { x0: lift.x - 0.6, x1: lift.x + 0.6, y0: lift.y, y1: lift.y + 1.15, z0: lift.z + 1.5, z1: lift.z + 2.14 },
    door: LP(0, 0, 1.12),
    cage: LP(0, 0, 0.05),
    room: { x0: lift.x - 1.5, x1: lift.x + 1.5, y0: lift.y, y1: lift.y + 2.3, z0: lift.z - 1.5, z1: lift.z + 1.5 },
  };
  LAYOUTS.set(key, L);
  return L;
}

// ---------------------------------------------------------------- the stamp
// distance (xz) from a point to a segment; the parameter lands in SEG_T (no allocations: this runs
// for every voxel of every chunk the layout touches)
let SEG_T = 0;
function d2seg(px, pz, a, b) {
  const ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1;
  let t = ((px - a.x) * ax + (pz - a.z) * az) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  SEG_T = t;
  const qx = a.x + ax * t - px, qz = a.z + az * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

/**
 * What the layout wants at a point (world meters): -1 = leave as generated, 0 = air, else a material.
 * out.shell = true when the point is in the solid shell round the carved space (filled if it is air).
 */
function classify(L, x, y, z, out) {
  const o = L.o;
  const lx = x - o.x, ly = y - o.y, lz = z - o.z;
  out.shell = false;
  const R = L.room;
  if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1 && y > R.y0 - 0.2 && y < R.y1 + 0.3) return -1; // the lift room is the generator's
  // the copper lump (lumpy, in the west wall)
  const ore = L.ore;
  const dox = x - ore.x, doy = y - ore.y, doz = z - ore.z;
  const dOre2 = dox * dox + doy * doy * 1.15 + doz * doz;
  if (dOre2 < ore.r * ore.r * 1.6 && Math.sqrt(dOre2) < ore.r * (0.85 + NOISE.n(x * 9, y * 9, z * 9) * 0.35)) return ore.m;
  // the rocks on Old Star's legs, and the rubble round them
  if (ly > 0 && ly < 0.5) {
    const rocks = L.rocks;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      const dx = x - r.x, dy = (y - r.y) * 1.25, dz = z - r.z;
      const q = (dx * dx + dy * dy + dz * dz) / (r.r * r.r);
      if (q > 1.7) continue;
      if (Math.sqrt(q) + NOISE.n(x * 7 + i * 3, y * 7, z * 7) * 0.22 < 1) return h3(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4), 7 + i) < 0.18 ? M.GRAVEL : r.m;
    }
    const S = L.skirt;
    if (ly < 0.2 && Math.abs(x - S.x) < S.rx * 1.2 && Math.abs(z - S.z) < S.rx * 1.2) {
      const dx = (x - S.x) / S.rx, dz = (z - S.z) / S.rx, dy = ly / S.ry;
      if (dx * dx + dz * dz + dy * dy + NOISE.n(x * 6, 3, z * 6) * 0.3 < 1) return h3(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX), 3) < 0.5 ? M.RUBBLE : M.GRAVEL;
    }
  }
  // the last bit of rock between the nook and the lift
  const pg = L.plug;
  if (x > pg.x0 && x < pg.x1 && y > pg.y0 && y < pg.y1 && z > pg.z0 && z < pg.z1) return M.LOAM;
  // carved space
  if (carved(L, x, y, z, lx, ly, lz)) return 0;
  // a pocket of soft loam round the ore (quick to dig round)
  if (dOre2 < 0.46 * 0.46) return M.LOAM;
  // the solid shell round everything carved
  out.shell = carvedNear(L, x, y, z, lx, ly, lz);
  return -1;
}

/** Is the point inside the dug-out space? */
function carved(L, x, y, z, lx, ly, lz) {
  // the room: a rounded box with a flat floor and a low vault, roughly hewn up high
  if (ly > 0 && ly < 2.8 && lx > -3.2 && lx < 3.2 && lz > -2.7 && lz < 2.7) {
    const nx = lx / 3.1, nz = lz / 2.6;
    const nx2 = nx * nx, nz2 = nz * nz;
    const se = nx2 * nx2 * nx2 + nz2 * nz2 * nz2;
    if (se < 1.15) {
      let lim = 1 - (ly > 1.9 ? (ly - 1.9) * 0.35 : 0);
      if (ly > 1.5 && se > lim - 0.16) lim -= NOISE.fbm(x * 1.7, y * 1.7, z * 1.7, 2) * 0.14; // hewn roughly up high
      if (se < lim) {
        if (ly < 2.0) return true; // the vault is never lower than that
        const ceil = 2.15 + 0.45 * Math.max(0, 1 - nx2 - nz2) + NOISE.n(x * 0.9, 7.3, z * 0.9) * 0.12;
        if (ly < ceil) return true;
      }
    }
    // flat stretches of wall: the ledge wall (east), the tally wall (north), the table wall and the ore (west)
    if (lx > 2.5 && lx < 3.1 && lz > -1.75 && lz < 0.55 && ly < 2.25) return true;
    if (lz < -2.15 && lz > -2.6 && lx > -0.7 && lx < 2.3 && ly < 2.0) return true;
    if (lx < -2.6 && lx > -3.1 && lz > -1.95 && lz < 1.05 && ly < 1.95) return true;
  }
  // the ledge (a niche in the east wall)
  const G = L.ledge;
  if (x >= G.x0 - 0.01 && x < G.x1 && y > G.y && y < G.y1 && z > G.z0 && z < G.z1) {
    const back = (x - G.x0) / (G.x1 - G.x0);
    return !(back > 0.75 && (y > G.y1 - 0.18 || z < G.z0 + 0.12 || z > G.z1 - 0.12));
  }
  // the hole in the roof the mole came through
  const H = L.hole;
  if (ly > 1.6 && ly < 4.5 && Math.abs(x - H.x) < 1.2 && Math.abs(z - H.z) < 1.2) {
    const dx = x - H.x, dz = z - H.z, d2 = dx * dx + dz * dz;
    const r0 = H.r + (ly < 2.6 ? (2.6 - ly) * 0.25 : 0);
    if (d2 < (r0 - 0.15) * (r0 - 0.15)) return true;
    if (d2 < (r0 + 0.15) * (r0 + 0.15)) { const r = r0 + NOISE.n(x * 3, y * 3, z * 3) * 0.14; if (d2 < r * r) return true; }
  }
  // the scar in the roof over the rockfall
  const Sc = L.scar;
  if (ly > 1.6 && ly < 2.75 && Math.abs(x - Sc.x) < Sc.r && Math.abs(z - Sc.z) < Sc.r) {
    const dx = x - Sc.x, dz = z - Sc.z, dy = (ly - 2.0) / 0.75;
    if (dx * dx + dz * dz + dy * dy * Sc.r * Sc.r < Sc.r * Sc.r * (0.75 + NOISE.n(x * 4, y * 4, z * 4) * 0.4)) return true;
  }
  // the crawl: a low tunnel rising toward the lift, then west into the nook
  if (lz > 2.0) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      if (y < Math.min(a.y, b.y) - 0.1 || y > Math.max(a.y, b.y) + 1.3) continue;
      const d = d2seg(x, z, a, b);
      if (d > 0.62) continue;
      const fy = a.y + (b.y - a.y) * SEG_T;
      const yy = y - fy;
      if (yy <= 0 || yy > 1.2) continue;
      if (d > 0.44 && d > 0.52 + NOISE.n(x * 2.3, y * 2.3, z * 2.3) * 0.07) continue;
      const roof = yy + Math.max(0, d - 0.25) * 0.5;
      if (roof < 0.99 || roof < 1.08 + NOISE.n(x * 1.9, 5.1, z * 1.9) * 0.08) return true;
    }
    const a = L.corner, N = L.nook;
    const yy = y - a.y;
    if (yy > 0 && yy < 1.35) {
      const d = d2seg(x, z, a, N);
      if (d < 0.62 && d < 0.52 + NOISE.n(x * 2.3, y * 2.3, z * 2.3) * 0.07 && yy < 1.08 - Math.max(0, d - 0.25) * 0.5) return true;
      // the nook: a little wider and taller, where he waits
      const nx = (x - N.x) / 1.0, nz = (z - (N.z + 0.1)) / 0.62;
      if (yy < 1.3 && nx * nx * nx * nx + nz * nz * nz * nz < 1 - (yy > 1 ? (yy - 1) * 1.5 : 0)) return true;
    }
  }
  return false;
}

/** Within the shell (0.45 m) round the carved space? (bounding shapes, not exact) */
function carvedNear(L, x, y, z, lx, ly, lz) {
  const pad = 0.45;
  if (ly > -pad && ly < 3.0 && lx > -3.1 - pad && lx < 4.15 + pad && lz > -2.6 - pad && lz < 2.6 + pad) return true;
  if (lz > 2.0) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      if (y < Math.min(a.y, b.y) - pad || y > Math.max(a.y, b.y) + 1.1 + pad) continue;
      const d = d2seg(x, z, a, b);
      const fy = a.y + (b.y - a.y) * SEG_T;
      if (d < 0.55 + pad && y > fy - pad && y < fy + 1.1 + pad) return true;
    }
    if (d2seg(x, z, L.corner, L.nook) < 1.05 + pad && y > L.nook.y - pad && y < L.nook.y + 1.3 + pad) return true;
  }
  return false;
}

/** Bounding boxes (world meters) of everything the stamp may touch, for quick chunk rejection. */
function boxes(L) {
  if (L.boxes) return L.boxes;
  const o = L.o, out = [];
  out.push([o.x - 3.7, o.y - 0.6, o.z - 3.2, o.x + 4.7, o.y + 3.1, o.z + 3.2]);
  out.push([L.hole.x - 1.3, o.y + 1.5, L.hole.z - 1.3, L.hole.x + 1.3, o.y + 4.6, L.hole.z + 1.3]);
  const C = [...L.crawl, L.corner, L.nook];
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i], b = C[i + 1];
    const p = i === C.length - 2 ? 1.6 : 1.1; // the nook is wider
    out.push([Math.min(a.x, b.x) - p, Math.min(a.y, b.y) - 0.5, Math.max(Math.min(a.z, b.z) - p, L.o.z + 2.0), Math.max(a.x, b.x) + p, Math.max(a.y, b.y) + 1.8, Math.max(a.z, b.z) + p]);
  }
  const pg = L.plug;
  out.push([pg.x0 - 0.1, pg.y0 - 0.1, pg.z0 - 0.1, pg.x1 + 0.1, pg.y1 + 0.1, pg.z1 + 0.1]);
  L.boxes = out;
  return out;
}

const _out = { shell: false };

/**
 * Called by ChunkGen.stamp for the plan feature { kind: 'prologue', x, y, z, to?, lift? }: fills the
 * chunk's voxels (Uint8Array CS³, index x + CS*(y + CS*z), chunk origin X0/Y0/Z0 in voxels).
 */
export function stampPrologue(f, vox, X0, Y0, Z0, CS) {
  const L = prologueLayout(f);
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cx1 = (X0 + CS) / VOX, cy1 = (Y0 + CS) / VOX, cz1 = (Z0 + CS) / VOX;
  // each of the layout's boxes this chunk touches (a voxel in two boxes is classified twice: harmless)
  for (const bx of boxes(L)) {
    if (bx[3] < cx0 || bx[0] > cx1 || bx[4] < cy0 || bx[1] > cy1 || bx[5] < cz0 || bx[2] > cz1) continue;
    const a0 = Math.max(0, Math.floor(bx[0] * VOX) - X0), a1 = Math.min(CS, Math.ceil(bx[3] * VOX) - X0);
    const b0 = Math.max(0, Math.floor(bx[1] * VOX) - Y0), b1 = Math.min(CS, Math.ceil(bx[4] * VOX) - Y0);
    const c0 = Math.max(0, Math.floor(bx[2] * VOX) - Z0), c1 = Math.min(CS, Math.ceil(bx[5] * VOX) - Z0);
    for (let z = c0; z < c1; z++) for (let y = b0; y < b1; y++) for (let x = a0; x < a1; x++) {
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK || cur === M.BURROW || cur === M.TIMBER || cur === M.BOARDS || cur === M.LANTERN) continue;
      const xm = (X0 + x + 0.5) / VOX, ym = (Y0 + y + 0.5) / VOX, zm = (Z0 + z + 0.5) / VOX;
      const m = classify(L, xm, ym, zm, _out);
      if (m >= 0) vox[vi] = m;
      else if (_out.shell && (cur === 0 || cur >= 40) && cur < ORE_BASE) vox[vi] = ym - L.o.y > 1.4 ? M.LOAM : M.DIRT;
    }
  }
}

/** The voxels of the copper lump (world voxel coords), for the story's "is it free yet?" checks. */
export function prologueOreVoxels(L) {
  if (L.oreVox) return L.oreVox;
  const ore = L.ore, out = [];
  const r = ore.r * 1.25;
  for (let vz = Math.floor((ore.z - r) * VOX); vz <= Math.ceil((ore.z + r) * VOX); vz++)
    for (let vy = Math.floor((ore.y - r) * VOX); vy <= Math.ceil((ore.y + r) * VOX); vy++)
      for (let vx = Math.floor((ore.x - r) * VOX); vx <= Math.ceil((ore.x + r) * VOX); vx++) {
        const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
        if (classify(L, x, y, z, _out) === ore.m) out.push([vx, vy, vz]);
      }
  L.oreVox = out;
  return out;
}

/** The voxels of each rock on Old Star's legs: [[ [vx,vy,vz], ... ] per rock]. */
export function prologueRockVoxels(L) {
  if (L.rockVox) return L.rockVox;
  const out = L.rocks.map(() => []);
  for (let i = 0; i < L.rocks.length; i++) {
    const rk = L.rocks[i], r = rk.r * 1.4;
    for (let vz = Math.floor((rk.z - r) * VOX); vz <= Math.ceil((rk.z + r) * VOX); vz++)
      for (let vy = Math.floor((rk.y - r) * VOX); vy <= Math.ceil((rk.y + r) * VOX); vy++)
        for (let vx = Math.floor((rk.x - r) * VOX); vx <= Math.ceil((rk.x + r) * VOX); vx++) {
          const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
          const m = classify(L, x, y, z, _out);
          if (m !== rk.m && m !== M.GRAVEL) continue;
          // the rock this voxel belongs to (the nearest centre)
          let best = -1, bd = 1e9;
          for (let j = 0; j < L.rocks.length; j++) { const q = L.rocks[j], d = Math.hypot(x - q.x, y - q.y, z - q.z) / q.r; if (d < bd) { bd = d; best = j; } }
          if (best === i && bd < 1.35) out[i].push([vx, vy, vz]);
        }
  }
  L.rockVox = out;
  return out;
}

/** What the layout wants at a point (world meters): -1 untouched rock, 0 dug-out air, else a material. */
export function prologueWants(L, x, y, z) { return classify(L, x, y, z, _out); }

/** The layout's bounding boxes [x0, y0, z0, x1, y1, z1] (world meters). */
export function prologueBoxes(L) { return boxes(L); }

/** Is a point in (or within pad of) the chamber, the crawl or the nook? (keeps props out) */
export function prologueInside(L, x, y, z, pad = 0.3) {
  const o = L.o, lx = x - o.x, ly = y - o.y, lz = z - o.z;
  if (ly > -0.5 - pad && ly < 3.2 + pad && lx > -3.2 - pad && lx < 4.2 + pad && lz > -2.7 - pad && lz < 2.7 + pad) return true;
  if (lz > 2.0 - pad) {
    const C = [...L.crawl, L.corner, L.nook];
    for (let i = 0; i < C.length - 1; i++) {
      const d = d2seg(x, z, C[i], C[i + 1]);
      const fy = C[i].y + (C[i + 1].y - C[i].y) * SEG_T;
      if (d < 0.75 + pad && y > fy - 0.4 - pad && y < fy + 1.4 + pad) return true;
    }
    if (Math.abs(x - L.nook.x) < 1.1 + pad && Math.abs(z - L.nook.z) < 0.9 + pad && Math.abs(y - L.nook.y - 0.6) < 1 + pad) return true;
  }
  return false;
}
